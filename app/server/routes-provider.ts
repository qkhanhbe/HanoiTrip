import { z } from 'zod';
import type { Mode, RoutesResponse, TripInput, TripRoute } from '../shared/contracts.js';
import { AppError } from './errors.js';

export type RoutesProvider = (input: TripInput) => Promise<RoutesResponse>;
const seconds = (value: string) => Math.round(Number(value.replace(/s$/, '')));
const duration = z.string().regex(/^\d+(\.\d+)?s$/);
const stop = z.object({ name: z.string().default('Điểm dừng') });
const googleResponse = z.object({
  routes: z
    .array(
      z.object({
        duration,
        distanceMeters: z.number().nonnegative().default(0),
        polyline: z.object({ encodedPolyline: z.string() }).optional(),
        warnings: z.array(z.string()).default([]),
        legs: z
          .array(
            z.object({
              steps: z
                .array(
                  z.object({
                    travelMode: z.string(),
                    staticDuration: duration.default('0s'),
                    distanceMeters: z.number().nonnegative().default(0),
                    navigationInstruction: z.object({ instructions: z.string() }).optional(),
                    transitDetails: z
                      .object({
                        headsign: z.string().optional(),
                        stopCount: z.number().optional(),
                        stopDetails: z.object({
                          departureStop: stop,
                          arrivalStop: stop,
                          departureTime: z.string().optional(),
                          arrivalTime: z.string().optional(),
                        }),
                        transitLine: z.object({
                          name: z.string().optional(),
                          nameShort: z.string().optional(),
                          vehicle: z.object({ type: z.string() }).optional(),
                        }),
                      })
                      .optional(),
                  }),
                )
                .default([]),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

export function normalizeGoogle(raw: unknown, input: TripInput, now = new Date()): RoutesResponse {
  const parsed = googleResponse.safeParse(raw);
  if (!parsed.success)
    throw new AppError(
      502,
      'PROVIDER_INVALID',
      'Nguồn tìm đường trả về dữ liệu chưa hợp lệ. Hãy thử lại.',
    );
  const departureTime = input.departureTime ?? now.toISOString();
  const routes: TripRoute[] = parsed.data.routes.map((route, index) => {
    const steps = route.legs
      .flatMap((leg) => leg.steps)
      .map((step) => {
        const transit = step.transitDetails;
        const vehicle = transit?.transitLine.vehicle?.type;
        const mode: Mode =
          step.travelMode === 'WALK'
            ? 'WALK'
            : vehicle === 'BUS' || vehicle === 'INTERCITY_BUS' || vehicle === 'TROLLEYBUS'
              ? 'BUS'
              : vehicle === 'SUBWAY' || vehicle === 'METRO_RAIL'
                ? 'METRO'
                : vehicle?.includes('RAIL') || vehicle === 'HEAVY_RAIL'
                  ? 'TRAIN'
                  : 'TRANSIT';
        return {
          mode,
          durationSeconds: seconds(step.staticDuration),
          distanceMeters: step.distanceMeters,
          instruction:
            step.navigationInstruction?.instructions ??
            (transit
              ? `Đi đến ${transit.stopDetails.arrivalStop.name}`
              : 'Đi bộ đến điểm tiếp theo'),
          ...(transit
            ? {
                line: transit.transitLine.nameShort ?? transit.transitLine.name ?? 'Công cộng',
                from: transit.stopDetails.departureStop.name,
                to: transit.stopDetails.arrivalStop.name,
                departureTime: transit.stopDetails.departureTime,
                arrivalTime: transit.stopDetails.arrivalTime,
                stopCount: transit.stopCount,
              }
            : {}),
        };
      });
    return {
      id: `google-${index}`,
      durationSeconds: seconds(route.duration),
      distanceMeters: route.distanceMeters,
      walkingMeters: steps
        .filter((s) => s.mode === 'WALK')
        .reduce((sum, s) => sum + s.distanceMeters, 0),
      transfers: Math.max(0, steps.filter((s) => s.mode !== 'WALK').length - 1),
      departureTime,
      arrivalTime: new Date(
        Date.parse(departureTime) + seconds(route.duration) * 1000,
      ).toISOString(),
      encodedPolyline: route.polyline?.encodedPolyline,
      steps,
      warnings: route.warnings,
    };
  });
  return { source: 'google', generatedAt: now.toISOString(), routes };
}

export function googleProvider(apiKey: string, request: typeof fetch = fetch): RoutesProvider {
  return async (input) => {
    try {
      const response = await request('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.warnings,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.distanceMeters,routes.legs.steps.navigationInstruction,routes.legs.steps.transitDetails',
        },
        body: JSON.stringify({
          origin: {
            location: {
              latLng: { latitude: input.origin.latitude, longitude: input.origin.longitude },
            },
          },
          destination: {
            location: {
              latLng: {
                latitude: input.destination.latitude,
                longitude: input.destination.longitude,
              },
            },
          },
          travelMode: 'TRANSIT',
          computeAlternativeRoutes: true,
          languageCode: 'vi',
          units: 'METRIC',
          ...(input.departureTime ? { departureTime: input.departureTime } : {}),
        }),
      });
      if (!response.ok)
        throw new AppError(
          502,
          'PROVIDER_UNAVAILABLE',
          'Chưa thể kết nối nguồn tìm đường. Hãy thử lại sau.',
        );
      return normalizeGoogle(await response.json(), input);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
        throw new AppError(504, 'PROVIDER_TIMEOUT', 'Tìm đường lâu hơn dự kiến. Hãy thử lại.');
      throw new AppError(502, 'PROVIDER_UNAVAILABLE', 'Nguồn tìm đường tạm thời không khả dụng.');
    }
  };
}

// Fictional journeys for interaction testing only, NEVER a fallback from Google.
export const demoProvider: RoutesProvider = async (input) => {
  const departure = Date.parse(input.departureTime ?? new Date().toISOString());
  const { origin: a, destination: b } = input;
  const distance = Math.max(
    1200,
    Math.round(
      Math.hypot((b.latitude - a.latitude) * 111000, (b.longitude - a.longitude) * 103000) * 1.25,
    ),
  );
  const base = Math.max(18, Math.round(distance / 260) + 9);
  const routes = [0, 1, 2].map((index) => {
    const minutes = base + index * 7;
    const walk = 300 + index * 180;
    const transitMinutes = minutes - 8 - index * 2;
    return {
      id: `demo-${index}`,
      durationSeconds: minutes * 60,
      distanceMeters: distance + index * 500,
      walkingMeters: walk * 2,
      transfers: index === 1 ? 1 : 0,
      departureTime: new Date(departure).toISOString(),
      arrivalTime: new Date(departure + minutes * 60000).toISOString(),
      demoPath: [
        { lat: a.latitude, lng: a.longitude },
        {
          lat: a.latitude + (b.latitude - a.latitude) * 0.25 + index * 0.003,
          lng: a.longitude + (b.longitude - a.longitude) * 0.08,
        },
        {
          lat: a.latitude + (b.latitude - a.latitude) * 0.4 + index * 0.003,
          lng: a.longitude + (b.longitude - a.longitude) * 0.65,
        },
        { lat: b.latitude, lng: b.longitude },
      ],
      steps: [
        {
          mode: 'WALK' as const,
          instruction: `Từ ${a.label}, đi bộ đến điểm lên xe minh họa`,
          durationSeconds: (4 + index) * 60,
          distanceMeters: walk,
        },
        {
          mode: 'BUS' as const,
          instruction: 'Đi xe buýt theo chặng minh họa',
          line: ['Demo A', 'Demo B', 'Demo C'][index],
          from: a.label,
          to: index === 1 ? 'Điểm chuyển tuyến minh họa' : b.label,
          durationSeconds: (index === 1 ? transitMinutes - 6 : transitMinutes) * 60,
          distanceMeters: distance - walk * 2,
          stopCount: 5 + index,
        },
        ...(index === 1
          ? [
              {
                mode: 'METRO' as const,
                instruction: 'Đổi sang tàu điện minh họa',
                line: 'Demo M',
                from: 'Điểm chuyển tuyến minh họa',
                to: b.label,
                durationSeconds: 360,
                distanceMeters: 1200,
                stopCount: 2,
              },
            ]
          : []),
        {
          mode: 'WALK' as const,
          instruction: `Đi bộ đến ${b.label}`,
          durationSeconds: (4 + index) * 60,
          distanceMeters: walk,
        },
      ],
      warnings: ['Hành trình minh họa, không dùng để di chuyển thực tế.'],
    };
  });
  return { source: 'demo', generatedAt: new Date().toISOString(), routes };
};
