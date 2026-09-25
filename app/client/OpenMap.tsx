import { useEffect, useRef, useState } from 'react';
import { LocateFixed, MapPin } from 'lucide-react';
import {
  Map,
  Marker,
  LngLatBounds,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Point, TripRoute } from '../shared/contracts';
import { serviceArea } from '../shared/geo';

const STYLE = 'https://tiles.openfreemap.org/styles/positron';
// MapLibre 6 ships an ES-module worker separately; let Vite bundle its dependencies.
setWorkerUrl(workerUrl);
const CENTER: [number, number] = [105.825, 21.04];
const EMPTY_ROUTE = { type: 'FeatureCollection' as const, features: [] };

export default function OpenMap({
  route,
  origin,
  destination,
  pickTarget,
  onPick,
}: {
  route?: TripRoute;
  origin: Point | null;
  destination: Point | null;
  pickTarget: 'origin' | 'destination';
  onPick: (point: Point) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!element.current) return;
    let instance: Map;
    setReady(false);
    setError(false);
    try {
      instance = new Map({
        container: element.current,
        style: STYLE,
        center: CENTER,
        zoom: 12.3,
        minZoom: 10,
        maxZoom: 18,
        maxBounds: [
          [serviceArea.west, serviceArea.south],
          [serviceArea.east, serviceArea.north],
        ],
        renderWorldCopies: false,
        attributionControl: { compact: false },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        locale: {
          'NavigationControl.ZoomIn': 'Phóng to bản đồ',
          'NavigationControl.ZoomOut': 'Thu nhỏ bản đồ',
          'AttributionControl.ToggleAttribution': 'Nguồn bản đồ',
          'Map.Title': 'Bản đồ Hà Nội',
        },
      });
    } catch {
      setError(true);
      return;
    }
    map.current = instance;
    instance.touchZoomRotate.disableRotation();
    instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    const timeout = window.setTimeout(() => setError(true), 20000);
    instance.on('error', () => setError(true));
    instance.on('load', () => {
      window.clearTimeout(timeout);
      // Prefer local names (e.g. Hồ Tây) over the base style's English labels.
      for (const layer of instance.getStyle().layers) {
        if (
          layer.type === 'symbol' &&
          JSON.stringify(layer.layout?.['text-field'] ?? '').includes('name_en')
        ) {
          instance.setLayoutProperty(layer.id, 'text-field', [
            'coalesce',
            ['get', 'name:vi'],
            ['get', 'name'],
            ['get', 'name:latin'],
            ['get', 'name_en'],
            '',
          ]);
        }
      }
      instance.addSource('demo-route', { type: 'geojson', data: EMPTY_ROUTE });
      instance.addLayer({
        id: 'demo-route-outline',
        type: 'line',
        source: 'demo-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 8 },
      });
      instance.addLayer({
        id: 'demo-route-line',
        type: 'line',
        source: 'demo-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#176fbd', 'line-width': 4, 'line-dasharray': [2, 1.5] },
      });
      setReady(true);
    });
    instance.on('click', (event) => {
      // A marker is informational; clicking it must not change the opposite endpoint.
      if ((event.originalEvent.target as HTMLElement)?.closest('.maplibregl-marker')) return;
      pick.current({
        label: `Điểm trên bản đồ (${event.lngLat.lat.toFixed(5)}, ${event.lngLat.lng.toFixed(5)})`,
        latitude: event.lngLat.lat,
        longitude: event.lngLat.lng,
      });
    });
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(element.current);
    return () => {
      window.clearTimeout(timeout);
      observer.disconnect();
      instance.remove();
      map.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance) return;
    const bounds = new LngLatBounds();
    const markers: Marker[] = [];
    [origin, destination].forEach((point, index) => {
      if (!point) return;
      const position: [number, number] = [point.longitude, point.latitude];
      bounds.extend(position);
      const marker = document.createElement('div');
      marker.className = `open-map-marker ${index ? 'destination-marker' : 'origin-marker'}`;
      marker.textContent = index ? 'B' : 'A';
      marker.title = `${index ? 'Điểm đến' : 'Điểm đi'}: ${point.label}`;
      marker.setAttribute('role', 'img');
      marker.setAttribute('aria-label', marker.title);
      markers.push(new Marker({ element: marker }).setLngLat(position).addTo(instance));
    });
    // Google polylines stay on Google Maps; this layer only accepts explicitly fictional paths.
    const path = route?.demoPath?.map(({ lat, lng }): [number, number] => [lng, lat]) ?? [];
    path.forEach((point) => bounds.extend(point));
    (instance.getSource('demo-route') as GeoJSONSource).setData(
      path.length > 1
        ? {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: path },
          }
        : EMPTY_ROUTE,
    );
    if (!bounds.isEmpty()) {
      const mobile = instance.getContainer().clientWidth < 600;
      instance.fitBounds(bounds, {
        padding: mobile
          ? { top: 105, bottom: 65, left: 38, right: 60 }
          : { top: 185, bottom: 120, left: 75, right: 80 },
        maxZoom: 14.5,
        duration: 0,
      });
    }
    return () => markers.forEach((marker) => marker.remove());
  }, [ready, origin, destination, route]);

  return (
    <div className="map-canvas open-map" data-map-ready={ready && !error ? 'true' : 'false'}>
      <div
        ref={element}
        className="map-canvas"
        role="region"
        aria-label="Bản đồ tương tác Hà Nội"
      />
      {!ready && !error && <p className="map-loading">Đang tải bản đồ Hà Nội…</p>}
      {error && (
        <div className="map-error" role="alert">
          <p>
            Chưa tải đầy đủ bản đồ. Kiểm tra kết nối mạng hoặc khả năng hỗ trợ WebGL của trình
            duyệt.
          </p>
          <button onClick={() => setAttempt((value) => value + 1)}>Thử tải lại bản đồ</button>
        </div>
      )}
      <div className="open-map-actions">
        <button
          disabled={!ready}
          aria-label="Về trung tâm Hà Nội"
          title="Về trung tâm Hà Nội"
          onClick={() => map.current?.jumpTo({ center: CENTER, zoom: 12.3 })}
        >
          <LocateFixed size={20} />
        </button>
        <button
          disabled={!ready}
          aria-label={`Chọn tâm bản đồ làm ${pickTarget === 'origin' ? 'điểm đi' : 'điểm đến'}`}
          title="Chọn điểm ở tâm bản đồ"
          onClick={() => {
            const center = map.current?.getCenter();
            if (center)
              pick.current({
                label: `Điểm trên bản đồ (${center.lat.toFixed(5)}, ${center.lng.toFixed(5)})`,
                latitude: center.lat,
                longitude: center.lng,
              });
          }}
        >
          <MapPin size={20} />
        </button>
      </div>
      <span className="open-map-crosshair" aria-hidden="true" />
      {route?.demoPath && (
        <span className="open-map-demo-label">Nét đứt: tuyến minh họa, không dùng chỉ đường</span>
      )}
    </div>
  );
}
