import sdkUrl from '@vietmap/vietmap-gl-js/dist/vietmap-gl.js?url';
import '@vietmap/vietmap-gl-js/dist/vietmap-gl.css';
import type * as maplibre from 'maplibre-gl';

// The standard SDK includes VIETMAP's provider tile decoder in its bundled worker.
// The separately shipped CSP worker does not decode current provider tiles.
type MapRenderer = typeof maplibre;
let loading: Promise<MapRenderer> | undefined;

export function loadVietmapRenderer(): Promise<MapRenderer> {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = sdkUrl;
    script.onload = () => {
      const renderer = (window as Window & { vietmapgl?: MapRenderer }).vietmapgl;
      if (!renderer) return reject(new Error('Không thể khởi tạo bản đồ VIETMAP.'));
      resolve(renderer);
    };
    script.onerror = () => {
      loading = undefined;
      script.remove();
      reject(new Error('Không thể tải bộ hiển thị bản đồ VIETMAP.'));
    };
    document.head.append(script);
  });
  return loading;
}

export async function loadVietmapStyle(signal: AbortSignal): Promise<maplibre.StyleSpecification> {
  const response = await fetch('/v1/map/style', { signal });
  if (!response.ok) throw new Error('Bản đồ VIETMAP tạm thời không khả dụng.');
  const style = await response.json();
  // Sprite validation happens before transformRequest; every asset needs an absolute URL.
  const absolute = (path: string) => `${window.location.origin}${path}`;
  style.sprite = absolute(style.sprite);
  style.glyphs = absolute(style.glyphs);
  for (const source of Object.values(style.sources) as { tiles?: string[] }[]) {
    if (source.tiles) source.tiles = source.tiles.map(absolute);
  }
  return style;
}
