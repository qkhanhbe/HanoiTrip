import { describe, expect, it, vi } from 'vitest';
import { googleProvider, normalizeGoogle } from '../../app/server/routes-provider.js';
import { places, toPoint } from '../../app/shared/places.js';
const input = { origin: toPoint(places[0]), destination: toPoint(places[1]) };
const raw = {
  routes: [
    {
      duration: '1800s',
      distanceMeters: 5200,
      polyline: { encodedPolyline: 'test-line' },
      legs: [
        {
          steps: [
            {
              travelMode: 'WALK',
              staticDuration: '300s',
              distanceMeters: 400,
              navigationInstruction: { instructions: 'Đi đến trạm' },
            },
            {
              travelMode: 'TRANSIT',
              staticDuration: '1200s',
              distanceMeters: 4300,
              transitDetails: {
                stopDetails: {
                  departureStop: { name: 'A' },
                  arrivalStop: { name: 'B' },
                  departureTime: '2026-09-24T03:00:00Z',
                },
                transitLine: { nameShort: '09', vehicle: { type: 'BUS' } },
                stopCount: 7,
              },
            },
            { travelMode: 'WALK', staticDuration: '300s', distanceMeters: 500 },
          ],
        },
      ],
    },
  ],
};
describe('Google transit adapter', () => {
  it('normalizes duration, route, stops and walking without returning provider internals', () => {
    const result = normalizeGoogle(raw, input, new Date('2026-09-24T02:55:00Z'));
    expect(result.source).toBe('google');
    expect(result.routes[0]).toMatchObject({
      durationSeconds: 1800,
      walkingMeters: 900,
      transfers: 0,
      encodedPolyline: 'test-line',
      arrivalTime: '2026-09-24T03:25:00.000Z',
    });
    expect(result.routes[0].steps[1]).toMatchObject({
      mode: 'BUS',
      line: '09',
      from: 'A',
      to: 'B',
      stopCount: 7,
    });
  });
  it('preserves no-result responses and rejects malformed provider shapes', () => {
    expect(normalizeGoogle({}, input).routes).toEqual([]);
    expect(() => normalizeGoogle({ routes: [{}] }, input)).toThrow('dữ liệu');
  });
  it('calls only the fixed Google endpoint with server key and transit field mask', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(raw)));
    const response = await googleProvider('test-only-not-a-real-key', request)(input);
    const [url, options] = request.mock.calls[0];
    expect(url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
    expect(JSON.parse(String(options?.body))).toMatchObject({
      travelMode: 'TRANSIT',
      computeAlternativeRoutes: true,
      origin: { location: { latLng: { latitude: input.origin.latitude } } },
    });
    expect(options?.headers).toMatchObject({
      'X-Goog-Api-Key': 'test-only-not-a-real-key',
      'X-Goog-FieldMask': expect.stringContaining('transitDetails'),
    });
    expect(JSON.stringify(response)).not.toContain('test-only-not-a-real-key');
  });
  it('does not fall back to demo on provider error', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('private provider details', { status: 403 }));
    await expect(googleProvider('test', request)(input)).rejects.toMatchObject({
      statusCode: 502,
      code: 'PROVIDER_UNAVAILABLE',
    });
  });
  it('maps timeouts to 504', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException('secret-url', 'TimeoutError'));
    await expect(googleProvider('test', request)(input)).rejects.toMatchObject({
      statusCode: 504,
      code: 'PROVIDER_TIMEOUT',
    });
  });
});
