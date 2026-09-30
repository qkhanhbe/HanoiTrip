import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  pointSchema,
  type PlaceResponse,
  type PlaceSearchResponse,
  type RoadRoutesResponse,
  type RoadTripInput,
} from '../shared/contracts.js';
import { AppError } from './errors.js';

const baseUrl = 'https://maps.vietmap.vn/api';
const autocompleteResponse = z.array(
  z.object({
    ref_id: z.string().min(1).max(2048),
    display: z.string().min(1).max(300),
    address: z.string().max(240).default(''),
    distance: z.number().nonnegative().optional(),
  }),
);
const placeResponse = z.object({
  display: z.string().min(1).max(300),
  lat: z.number().finite(),
  lng: z.number().finite(),
});
const geoJsonCoordinate = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);
const routeResponse = z.object({
  code: z.string(),
  paths: z
    .array(
      z.object({
        distance: z.number().nonnegative(),
        time: z.number().int().nonnegative(),
        points_encoded: z.literal(false),
        points: z.object({
          type: z.literal('LineString'),
          coordinates: z.array(geoJsonCoordinate).min(2),
        }),
        instructions: z
          .array(
            z.object({
              distance: z.number().nonnegative(),
              time: z.number().int().nonnegative(),
              text: z.string().default(''),
              street_name: z.string().default(''),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

export interface PlaceProvider {
  search(
    query: string,
    focus?: { latitude: number; longitude: number },
  ): Promise<PlaceSearchResponse>;
  resolve(token: string): Promise<PlaceResponse>;
}
export type RoadRoutingProvider = (input: RoadTripInput) => Promise<RoadRoutesResponse>;

function providerError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
    return new AppError(504, 'PROVIDER_TIMEOUT', 'Nguồn bản đồ phản hồi quá lâu. Hãy thử lại.');
  return new AppError(502, 'PROVIDER_UNAVAILABLE', 'Nguồn bản đồ tạm thời không khả dụng.');
}

function ensureResponse(response: Response): void {
  if (response.ok) return;
  if (response.status === 429)
    throw new AppError(
      503,
      'PROVIDER_RATE_LIMITED',
      'Nguồn bản đồ đang giới hạn lượt gọi. Hãy thử lại sau.',
    );
  throw new AppError(502, 'PROVIDER_UNAVAILABLE', 'Nguồn bản đồ tạm thời không khả dụng.');
}

function tokenSigner(secret: string, now: () => number) {
  const sign = (value: string) => createHmac('sha256', secret).update(value).digest('base64url');
  return {
    create(refId: string): string {
      const payload = `${now() + 10 * 60_000}.${Buffer.from(refId).toString('base64url')}`;
      return `${payload}.${sign(payload)}`;
    },
    read(token: string): string {
      const parts = token.split('.');
      if (parts.length !== 3 || token.length > 4096)
        throw new AppError(400, 'INVALID_PLACE_TOKEN', 'Gợi ý địa điểm không còn hợp lệ.');
      const payload = `${parts[0]}.${parts[1]}`;
      const expected = Buffer.from(sign(payload));
      const actual = Buffer.from(parts[2]);
      if (
        expected.length !== actual.length ||
        !timingSafeEqual(expected, actual) ||
        !Number.isSafeInteger(Number(parts[0])) ||
        Number(parts[0]) < now()
      )
        throw new AppError(400, 'INVALID_PLACE_TOKEN', 'Gợi ý địa điểm đã hết hạn. Hãy tìm lại.');
      try {
        const refId = Buffer.from(parts[1], 'base64url').toString('utf8');
        // VIETMAP ref_id is opaque and currently uses multiple prefixes (for
        // example auto: and vm:). Integrity comes from the HMAC above; this
        // allowlist only rejects malformed/control data before URLSearchParams
        // sends the signed value back to the Place API.
        if (!/^[A-Za-z0-9:_-]{1,2048}$/.test(refId)) throw new Error('invalid');
        return refId;
      } catch {
        throw new AppError(400, 'INVALID_PLACE_TOKEN', 'Gợi ý địa điểm không còn hợp lệ.');
      }
    },
  };
}

export function vietmapProviders(
  apiKey: string,
  request: typeof fetch = fetch,
  now: () => number = Date.now,
): { places: PlaceProvider; roadRoutes: RoadRoutingProvider } {
  const tokens = tokenSigner(apiKey, now);
  const getJson = async (path: string, params: URLSearchParams): Promise<unknown> => {
    params.set('apikey', apiKey);
    const response = await request(`${baseUrl}${path}?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    ensureResponse(response);
    return response.json();
  };
  return {
    places: {
      async search(query, focus = { latitude: 21.0285, longitude: 105.8542 }) {
        try {
          const params = new URLSearchParams({
            text: query,
            focus: `${focus.latitude},${focus.longitude}`,
            display_type: '5',
          });
          const parsed = autocompleteResponse.safeParse(await getJson('/autocomplete/v4', params));
          if (!parsed.success)
            throw new AppError(
              502,
              'PROVIDER_INVALID',
              'Nguồn tìm kiếm trả về dữ liệu chưa hợp lệ.',
            );
          return {
            source: 'vietmap',
            suggestions: parsed.data.map((item) => ({
              token: tokens.create(item.ref_id),
              label: item.display,
              address: item.address,
              ...(item.distance === undefined
                ? {}
                : { distanceMeters: Math.round(item.distance * 1000) }),
            })),
          };
        } catch (error) {
          throw providerError(error);
        }
      },
      async resolve(token) {
        try {
          const params = new URLSearchParams({ refid: tokens.read(token) });
          const parsed = placeResponse.safeParse(await getJson('/place/v4', params));
          if (!parsed.success)
            throw new AppError(
              502,
              'PROVIDER_INVALID',
              'Nguồn địa điểm trả về dữ liệu chưa hợp lệ.',
            );
          const place = pointSchema.safeParse({
            label: parsed.data.display.trim().slice(0, 120),
            latitude: parsed.data.lat,
            longitude: parsed.data.lng,
          });
          if (!place.success)
            throw new AppError(
              422,
              'OUTSIDE_SERVICE_AREA',
              'Địa điểm nằm ngoài khu vực Hà Nội đang hỗ trợ.',
            );
          return { source: 'vietmap', place: place.data };
        } catch (error) {
          throw providerError(error);
        }
      },
    },
    roadRoutes: async (input) => {
      try {
        const params = new URLSearchParams({
          points_encoded: 'false',
          vehicle: input.mode,
          alternative: 'true',
        });
        params.append('point', `${input.origin.latitude},${input.origin.longitude}`);
        params.append('point', `${input.destination.latitude},${input.destination.longitude}`);
        const parsed = routeResponse.safeParse(await getJson('/route/v4', params));
        if (!parsed.success)
          throw new AppError(
            502,
            'PROVIDER_INVALID',
            'Nguồn tìm đường trả về dữ liệu chưa hợp lệ.',
          );
        const generatedAt = new Date(now()).toISOString();
        if (parsed.data.code === 'ZERO_RESULTS')
          return { source: 'vietmap', generatedAt, routes: [] };
        if (parsed.data.code === 'OVER_DAILY_LIMIT')
          throw new AppError(
            503,
            'PROVIDER_RATE_LIMITED',
            'Nguồn bản đồ đã hết hạn mức hôm nay. Hãy thử lại sau.',
          );
        if (parsed.data.code !== 'OK')
          throw new AppError(
            502,
            'PROVIDER_INVALID',
            'Nguồn tìm đường từ chối yêu cầu hợp lệ của ứng dụng.',
          );
        return {
          source: 'vietmap',
          generatedAt,
          routes: parsed.data.paths.map((path, index) => ({
            id: `vietmap-${input.mode}-${index}`,
            mode: input.mode,
            durationSeconds: Math.round(path.time / 1000),
            distanceMeters: Math.round(path.distance),
            geometry: {
              type: 'LineString',
              coordinates: path.points.coordinates,
            },
            steps: path.instructions.map((step) => ({
              instruction: step.text || step.street_name || 'Tiếp tục theo tuyến',
              streetName: step.street_name,
              durationSeconds: Math.round(step.time / 1000),
              distanceMeters: Math.round(step.distance),
            })),
          })),
        };
      } catch (error) {
        throw providerError(error);
      }
    },
  };
}
