import { useEffect, useState, type ComponentProps } from 'react';
import type * as maplibre from 'maplibre-gl';
import OpenMap from './OpenMap';
import { loadVietmapRenderer, loadVietmapStyle } from './vietmap-sdk';

export default function VietmapMap(props: ComponentProps<typeof OpenMap>) {
  const [loaded, setLoaded] = useState<{
    renderer: typeof maplibre;
    style: maplibre.StyleSpecification;
  }>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setError('');
    void Promise.all([loadVietmapRenderer(), loadVietmapStyle(abort.signal)])
      .then(([renderer, style]) => {
        if (!abort.signal.aborted) setLoaded({ renderer, style });
      })
      .catch((reason: unknown) => {
        if (!abort.signal.aborted)
          setError(reason instanceof Error ? reason.message : 'Chưa tải được bản đồ VIETMAP.');
      });
    return () => abort.abort();
  }, [attempt]);
  if (error)
    return (
      <div className="map-error" role="alert">
        <p>{error}</p>
        <button onClick={() => setAttempt((value) => value + 1)}>Thử tải lại bản đồ</button>
      </div>
    );
  if (!loaded) return <p className="map-loading">Đang tải bản đồ VIETMAP…</p>;
  return <OpenMap {...props} renderer={loaded.renderer} style={loaded.style} />;
}
