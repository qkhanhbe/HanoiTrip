// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { loadVietmapStyle } from '../../app/client/vietmap-sdk';

afterEach(() => vi.unstubAllGlobals());

it('resolves proxy assets on the page origin while preserving tile placeholders', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      Response.json({
        version: 8,
        sprite: '/v1/map/sprite/base',
        glyphs: '/v1/map/fonts/{fontstack}/{range}.pbf',
        sources: { map: { type: 'vector', tiles: ['/v1/map/tiles/vlc-20261008/{z}/{x}/{y}.pbf'] } },
        layers: [],
      }),
    ),
  );
  const style = await loadVietmapStyle(new AbortController().signal);
  expect(style.sprite).toBe(`${location.origin}/v1/map/sprite/base`);
  expect(style.glyphs).toBe(`${location.origin}/v1/map/fonts/{fontstack}/{range}.pbf`);
  expect(style.sources.map).toMatchObject({
    tiles: [`${location.origin}/v1/map/tiles/vlc-20261008/{z}/{x}/{y}.pbf`],
  });
});

it('reports unavailable styles instead of creating a blank map', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 502 })));
  await expect(loadVietmapStyle(new AbortController().signal)).rejects.toThrow('không khả dụng');
});
