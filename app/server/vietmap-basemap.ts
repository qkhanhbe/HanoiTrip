import { z } from 'zod';
import { AppError } from './errors.js';

const mapsOrigin = 'https://maps.vietmap.vn';
const attribution = '© VIETMAP';
const styleDocument = z
  .object({
    sources: z.record(z.string(), z.record(z.string(), z.unknown())),
    sprite: z.string().url(),
    glyphs: z.string().url(),
  })
  .passthrough();

export interface VietmapMapAsset {
  body: Buffer;
  contentType: string;
}

export interface VietmapBasemapProvider {
  getStyle(): Promise<Record<string, unknown>>;
  getTile(version: string, z: number, x: number, y: number): Promise<VietmapMapAsset>;
  getSprite(file: string): Promise<VietmapMapAsset>;
  getGlyph(fontstack: string, range: string): Promise<VietmapMapAsset>;
}

function unavailable(): AppError {
  return new AppError(502, 'MAP_PROVIDER_UNAVAILABLE', 'Bản đồ VIETMAP tạm thời không khả dụng.');
}

export function vietmapBasemap(
  apiKey: string,
  request: typeof fetch = fetch,
): VietmapBasemapProvider {
  if (!apiKey) throw new Error('Vietmap basemap requires VIETMAP_API_KEY');
  let cachedStyle: { expiresAt: number; value: Record<string, unknown> } | undefined;

  async function getAsset(path: string): Promise<VietmapMapAsset> {
    const url = new URL(path, mapsOrigin);
    url.searchParams.set('apikey', apiKey);
    try {
      const response = await request(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw unavailable();
      const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
      return { body: Buffer.from(await response.arrayBuffer()), contentType };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw unavailable();
    }
  }

  return {
    async getStyle() {
      if (cachedStyle && cachedStyle.expiresAt > Date.now()) return cachedStyle.value;
      const asset = await getAsset('/maps/styles/tm/style.json');
      let decoded: unknown;
      try {
        decoded = JSON.parse(asset.body.toString('utf8'));
      } catch {
        throw unavailable();
      }
      const parsed = styleDocument.safeParse(decoded);
      if (!parsed.success) throw unavailable();

      const sources: Record<string, Record<string, unknown>> = {};
      for (const [name, source] of Object.entries(parsed.data.sources)) {
        const sourceTiles = source.tiles;
        if (sourceTiles !== undefined) {
          if (!Array.isArray(sourceTiles) || !sourceTiles.every((tile) => typeof tile === 'string'))
            throw unavailable();
          const tiles = sourceTiles.map((tile) => {
            let url: URL;
            try {
              url = new URL(tile);
            } catch {
              throw unavailable();
            }
            if (url.origin !== mapsOrigin) throw unavailable();
            const path = decodeURIComponent(url.pathname);
            const match = path.match(/^\/maps\/tiles\/(vlc-\d{8})\/\{z\}\/\{x\}\/\{y\}\.pbf$/);
            if (!match) throw unavailable();
            return `/v1/map/tiles/${match[1]}/{z}/{x}/{y}.pbf`;
          });
          sources[name] = { ...source, tiles, attribution: source.attribution ?? attribution };
        } else {
          sources[name] = { ...source, attribution: source.attribution ?? attribution };
        }
      }

      const value: Record<string, unknown> = {
        ...parsed.data,
        sources,
        sprite: '/v1/map/sprite/base',
        glyphs: '/v1/map/fonts/{fontstack}/{range}.pbf',
      };
      cachedStyle = { value, expiresAt: Date.now() + 60 * 60_000 };
      return value;
    },
    async getTile(version, z, x, y) {
      if (
        !/^vlc-\d{8}$/.test(version) ||
        !Number.isInteger(z) ||
        z < 0 ||
        z > 24 ||
        !Number.isInteger(x) ||
        !Number.isInteger(y) ||
        x < 0 ||
        y < 0 ||
        x >= 2 ** z ||
        y >= 2 ** z
      )
        throw new AppError(400, 'INVALID_MAP_TILE', 'Ô bản đồ chưa hợp lệ.');
      return getAsset(`/maps/tiles/${version}/${z}/${x}/${y}.pbf`);
    },
    async getSprite(file) {
      if (!/^base(?:@2x)?\.(?:json|png)$/.test(file))
        throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy tài nguyên bản đồ.');
      return getAsset(`/maps/styles/tm/sprite${file.slice(4)}`);
    },
    async getGlyph(fontstack, range) {
      if (!/^[A-Za-z0-9 ,._-]{1,240}$/.test(fontstack) || !/^\d{1,6}-\d{1,6}$/.test(range))
        throw new AppError(400, 'INVALID_MAP_FONT', 'Tệp chữ bản đồ chưa hợp lệ.');
      return getAsset(`/maps/fonts/${encodeURIComponent(fontstack)}/${range}.pbf`);
    },
  };
}
