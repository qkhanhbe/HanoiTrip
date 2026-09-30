import { describe, expect, it, vi } from 'vitest';
import { vietmapProviders } from '../../app/server/vietmap-provider.js';
import { places, toPoint } from '../../app/shared/places.js';

const apiKey = 'fixture-key-not-a-secret';
const now = () => Date.parse('2026-09-30T03:00:00Z');
const autocomplete = [
  {
    ref_id: 'vm:valid_reference',
    display: 'Văn Miếu - Quốc Tử Giám, Hà Nội',
    address: 'Đống Đa, Hà Nội',
    distance: 1.234,
  },
];
const place = {
  display: 'Văn Miếu - Quốc Tử Giám, Hà Nội',
  lat: 21.0277,
  lng: 105.8355,
};
const route = {
  code: 'OK',
  paths: [
    {
      distance: 5321.7,
      time: 901234,
      points_encoded: false,
      points: {
        type: 'LineString',
        coordinates: [
          [105.8542, 21.0285],
          [105.8355, 21.0277],
        ],
      },
      instructions: [
        {
          distance: 5321.7,
          time: 901234,
          text: 'Đi theo đường Tràng Thi',
          street_name: 'Tràng Thi',
        },
      ],
    },
  ],
};

describe('VIETMAP adapters', () => {
  it('signs autocomplete references and resolves a selected place without exposing the key', async () => {
    const request = vi.fn<typeof fetch>(async (url) => {
      const path = String(url);
      if (path.includes('/autocomplete/')) return Response.json(autocomplete);
      if (path.includes('/place/')) return Response.json(place);
      return new Response('', { status: 404 });
    });
    const { places: provider } = vietmapProviders(apiKey, request, now);
    const search = await provider.search('van mieu');
    expect(search.suggestions[0]).toMatchObject({
      label: autocomplete[0].display,
      address: autocomplete[0].address,
      distanceMeters: 1234,
    });
    expect(search.suggestions[0].token).not.toContain('vm:valid_reference');
    expect(JSON.stringify(search)).not.toContain(apiKey);

    const resolved = await provider.resolve(search.suggestions[0].token);
    expect(resolved.place).toEqual({
      label: place.display,
      latitude: place.lat,
      longitude: place.lng,
    });
    const searchUrl = new URL(String(request.mock.calls[0][0]));
    expect(searchUrl.pathname).toBe('/api/autocomplete/v4');
    expect(searchUrl.searchParams.get('focus')).toBe('21.0285,105.8542');
    expect(searchUrl.searchParams.get('display_type')).toBe('5');
    const placeUrl = new URL(String(request.mock.calls[1][0]));
    expect(placeUrl.pathname).toBe('/api/place/v4');
    expect(placeUrl.searchParams.get('refid')).toBe('vm:valid_reference');
  });

  it('keeps provider GeoJSON car geometry in canonical longitude,latitude order', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(route));
    const { roadRoutes } = vietmapProviders(apiKey, request, now);
    const response = await roadRoutes({
      origin: toPoint(places[0]),
      destination: toPoint(places[1]),
      mode: 'car',
    });
    expect(response).toMatchObject({
      source: 'vietmap',
      generatedAt: '2026-09-30T03:00:00.000Z',
      routes: [
        {
          id: 'vietmap-car-0',
          mode: 'car',
          durationSeconds: 901,
          distanceMeters: 5322,
          geometry: {
            type: 'LineString',
            coordinates: [
              [105.8542, 21.0285],
              [105.8355, 21.0277],
            ],
          },
        },
      ],
    });
    const url = new URL(String(request.mock.calls[0][0]));
    expect(url.pathname).toBe('/api/route/v4');
    expect(url.searchParams.getAll('point')).toEqual([
      `${places[0].latitude},${places[0].longitude}`,
      `${places[1].latitude},${places[1].longitude}`,
    ]);
    expect(url.searchParams.get('points_encoded')).toBe('false');
    expect(url.searchParams.get('vehicle')).toBe('car');
  });

  it('rejects tampered and expired place tokens before calling the provider', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(autocomplete));
    const { places: provider } = vietmapProviders(apiKey, request, now);
    const token = (await provider.search('van mieu')).suggestions[0].token;
    await expect(provider.resolve(`${token}x`)).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_PLACE_TOKEN',
    });
    const expired = vietmapProviders(apiKey, request, () => now() + 11 * 60_000).places;
    await expect(expired.resolve(token)).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_PLACE_TOKEN',
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('maps provider throttling and malformed route responses to safe errors', async () => {
    const throttled = vietmapProviders(
      apiKey,
      vi.fn<typeof fetch>().mockResolvedValue(new Response('private', { status: 429 })),
      now,
    );
    await expect(throttled.places.search('van mieu')).rejects.toMatchObject({
      statusCode: 503,
      code: 'PROVIDER_RATE_LIMITED',
    });
    const malformed = vietmapProviders(
      apiKey,
      vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code: 'OK', paths: [{}] })),
      now,
    );
    await expect(
      malformed.roadRoutes({
        origin: toPoint(places[0]),
        destination: toPoint(places[1]),
        mode: 'motorcycle',
      }),
    ).rejects.toMatchObject({ statusCode: 502, code: 'PROVIDER_INVALID' });
  });

  it('maps provider timeouts without exposing the underlying error', async () => {
    const timeout = Object.assign(new Error('private upstream details'), { name: 'TimeoutError' });
    const provider = vietmapProviders(
      apiKey,
      vi.fn<typeof fetch>().mockRejectedValue(timeout),
      now,
    );
    await expect(provider.places.search('van mieu')).rejects.toMatchObject({
      statusCode: 504,
      code: 'PROVIDER_TIMEOUT',
      message: expect.not.stringContaining('private'),
    });
  });

  it('normalizes no-route responses and daily quota exhaustion', async () => {
    const roadInput = {
      origin: toPoint(places[0]),
      destination: toPoint(places[1]),
      mode: 'car' as const,
    };
    const noRoute = vietmapProviders(
      apiKey,
      vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code: 'ZERO_RESULTS' })),
      now,
    );
    await expect(noRoute.roadRoutes(roadInput)).resolves.toEqual({
      source: 'vietmap',
      generatedAt: '2026-09-30T03:00:00.000Z',
      routes: [],
    });
    const quota = vietmapProviders(
      apiKey,
      vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code: 'OVER_DAILY_LIMIT' })),
      now,
    );
    await expect(quota.roadRoutes(roadInput)).rejects.toMatchObject({
      statusCode: 503,
      code: 'PROVIDER_RATE_LIMITED',
    });
  });
});
