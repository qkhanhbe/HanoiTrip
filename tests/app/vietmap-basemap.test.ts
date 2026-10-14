import { describe, expect, it, vi } from 'vitest';
import { vietmapBasemap } from '../../app/server/vietmap-basemap.js';

const apiKey = 'fixture-map-key-not-a-secret';
const style = {
  version: 8,
  name: 'VIETMAP Street',
  sprite: 'https://maps.vietmap.vn/maps/styles/tm/sprite?apikey=upstream',
  glyphs: 'https://maps.vietmap.vn/maps/fonts/{fontstack}/{range}.pbf?apikey=upstream',
  sources: {
    openmaptiles: {
      type: 'vector',
      tiles: ['https://maps.vietmap.vn/maps/tiles/vlc-20261008/{z}/{x}/{y}.pbf?apikey=upstream'],
    },
  },
  layers: [],
};

describe('VIETMAP basemap proxy', () => {
  it('serves headerless provider tiles only as a fixed binary MIME type', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(new Uint8Array([26, 1, 0])));
    const asset = await vietmapBasemap(apiKey, request).getTile('vlc-20261008', 12, 2305, 1453);
    expect(asset.contentType).toBe('application/x-protobuf');
    expect(asset.body).toEqual(Buffer.from([26, 1, 0]));
  });
  it('rejects HTML instead of serving it on the application origin', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () =>
          new Response('<script>alert(1)</script>', { headers: { 'content-type': 'text/html' } }),
      );
    const provider = vietmapBasemap(apiKey, request);
    for (const call of [
      () => provider.getStyle(),
      () => provider.getTile('vlc-20261008', 12, 2305, 1453),
      () => provider.getSprite('base.json'),
      () => provider.getSprite('base.png'),
      () => provider.getGlyph('Noto Sans', '0-255'),
    ]) {
      await expect(call()).rejects.toMatchObject({ statusCode: 502 });
    }
    expect(request.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
  });

  it('rejects malformed JSON and PNG assets even with an allowed MIME type', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('invalid', { headers: { 'content-type': 'application/json' } }),
      )
      .mockResolvedValueOnce(new Response('invalid', { headers: { 'content-type': 'image/png' } }));
    const provider = vietmapBasemap(apiKey, request);
    await expect(provider.getSprite('base.json')).rejects.toMatchObject({ statusCode: 502 });
    await expect(provider.getSprite('base.png')).rejects.toMatchObject({ statusCode: 502 });
  });

  it('rewrites styles to same-origin paths and strips upstream credentials', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(style));
    const provider = vietmapBasemap(apiKey, request);
    const document = await provider.getStyle();
    const source = (document.sources as Record<string, { tiles: string[]; attribution: string }>)
      .openmaptiles;

    expect(source.tiles).toEqual(['/v1/map/tiles/vlc-20261008/{z}/{x}/{y}.pbf']);
    expect(source.attribution).toBe('© VIETMAP');
    expect(document.sprite).toBe('/v1/map/sprite/base');
    expect(document.glyphs).toBe('/v1/map/fonts/{fontstack}/{range}.pbf');
    expect(JSON.stringify(document)).not.toContain(apiKey);
    expect(new URL(String(request.mock.calls[0][0])).searchParams.get('apikey')).toBe(apiKey);
  });

  it('rejects unexpected tile hosts before they can be proxied', async () => {
    const hostileStyle = {
      ...style,
      sources: {
        openmaptiles: {
          type: 'vector',
          tiles: ['https://attacker.example/{z}/{x}/{y}.pbf'],
        },
      },
    };
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(hostileStyle));
    await expect(vietmapBasemap(apiKey, request).getStyle()).rejects.toMatchObject({
      code: 'MAP_PROVIDER_UNAVAILABLE',
      statusCode: 502,
    });
  });

  it('limits sprite paths and validates tile coordinates', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('asset', { headers: { 'content-type': 'application/x-protobuf' } }),
      );
    const provider = vietmapBasemap(apiKey, request);
    await expect(provider.getSprite('../private.json')).rejects.toMatchObject({ statusCode: 404 });
    await expect(provider.getTile('vlc-20261008', 12, 4096, 1)).rejects.toMatchObject({
      code: 'INVALID_MAP_TILE',
      statusCode: 400,
    });

    const asset = await provider.getTile('vlc-20261008', 12, 2305, 1453);
    expect(asset.body.toString()).toBe('asset');
    expect(new URL(String(request.mock.calls[0][0])).pathname).toBe(
      '/maps/tiles/vlc-20261008/12/2305/1453.pbf',
    );
  });
});
