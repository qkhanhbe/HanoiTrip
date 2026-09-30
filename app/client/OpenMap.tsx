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
import type { Point, RoadRoute, TripRoute } from '../shared/contracts';
import { serviceArea } from '../shared/geo';

const STYLE = 'https://tiles.openfreemap.org/styles/bright';
// MapLibre 6 ships an ES-module worker separately; let Vite bundle its dependencies.
setWorkerUrl(workerUrl);
const CENTER: [number, number] = [105.825, 21.04];
const EMPTY_ROUTE = { type: 'FeatureCollection' as const, features: [] };
type PaintProperty = Parameters<Map['setPaintProperty']>[1];

const TRANSIT_CANVAS_PAINT: Record<string, Record<string, string | number>> = {
  background: { 'background-color': '#edf2ef' },
  park: { 'fill-color': '#d5e5d7', 'fill-opacity': 0.92 },
  'landcover-grass-park': { 'fill-color': '#d5e5d7', 'fill-opacity': 0.88 },
  'landcover-grass': { 'fill-color': '#dce9dc', 'fill-opacity': 0.78 },
  water: { 'fill-color': '#b9d9e8' },
  'water-intermittent': { 'fill-color': '#c9e0ea', 'fill-opacity': 0.76 },
  'landuse-residential': { 'fill-color': '#e8ede9', 'fill-opacity': 0.68 },
  'landuse-suburb': { 'fill-color': '#ebefec', 'fill-opacity': 0.58 },
  'landuse-commercial': { 'fill-color': '#e8ebe8', 'fill-opacity': 0.7 },
  'landuse-industrial': { 'fill-color': '#e3e8e5', 'fill-opacity': 0.72 },
  'landuse-hospital': { 'fill-color': '#ebe7e5', 'fill-opacity': 0.72 },
  'landuse-school': { 'fill-color': '#e4ece5', 'fill-opacity': 0.72 },
  'landcover-wood': { 'fill-color': '#cfdfd1', 'fill-opacity': 0.86 },
  building: { 'fill-color': '#d9e0dc', 'fill-opacity': 0.76 },
  'building-top': { 'fill-color': '#e3e8e5', 'fill-opacity': 0.68 },
  'waterway-other': { 'line-color': '#a9cedf' },
  'waterway-stream-canal': { 'line-color': '#a9cedf' },
  'waterway-river': { 'line-color': '#a3cadd' },
  'highway-path': { 'line-color': '#cfd8d4' },
  'highway-minor-casing': { 'line-color': '#d1d9d5' },
  'highway-minor': { 'line-color': '#ffffff' },
  'highway-secondary-tertiary-casing': { 'line-color': '#c8d2ce' },
  'highway-secondary-tertiary': { 'line-color': '#fffefd' },
  'highway-primary-casing': { 'line-color': '#bdcbc6' },
  'highway-primary': { 'line-color': '#fffaf2' },
  'highway-trunk-casing': { 'line-color': '#b7c7c2' },
  'highway-trunk': { 'line-color': '#fbf8ef' },
  'highway-motorway-casing': { 'line-color': '#afc2bc' },
  'highway-motorway': { 'line-color': '#f6f8f5' },
  'railway-transit': { 'line-color': '#6f867f', 'line-opacity': 0.76 },
  'railway-transit-hatching': { 'line-color': '#f8faf8', 'line-opacity': 0.92 },
  railway: { 'line-color': '#91a09c', 'line-opacity': 0.48 },
};

const LOCAL_NAME_SOURCE_LAYERS = new Set([
  'aerodrome_label',
  'place',
  'poi',
  'transportation_name',
  'water_name',
]);

function applyTransitCanvas(instance: Map) {
  for (const [layerId, properties] of Object.entries(TRANSIT_CANVAS_PAINT)) {
    if (!instance.getLayer(layerId)) continue;
    for (const [property, value] of Object.entries(properties)) {
      instance.setPaintProperty(layerId, property as PaintProperty, value);
    }
  }

  for (const layerId of ['poi_r20', 'poi_r7']) {
    if (instance.getLayer(layerId)) instance.setLayoutProperty(layerId, 'visibility', 'none');
  }

  for (const layer of instance.getStyle().layers) {
    if (layer.type !== 'symbol' || !LOCAL_NAME_SOURCE_LAYERS.has(layer['source-layer'] ?? '')) {
      continue;
    }
    instance.setLayoutProperty(layer.id, 'text-field', [
      'coalesce',
      ['get', 'name:vi'],
      ['get', 'name'],
      ['get', 'name:latin'],
      ['get', 'name_en'],
      '',
    ]);
    instance.setPaintProperty(layer.id, 'text-color', '#53635f');
    instance.setPaintProperty(layer.id, 'text-halo-color', '#f7faf7');
    instance.setPaintProperty(layer.id, 'text-halo-width', 1.2);
  }
}

export default function OpenMap({
  route,
  origin,
  destination,
  pickTarget,
  onPick,
}: {
  route?: TripRoute | RoadRoute;
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
      applyTransitCanvas(instance);
      const firstSymbolLayer = instance
        .getStyle()
        .layers.find((layer) => layer.type === 'symbol')?.id;
      instance.addSource('planner-route', { type: 'geojson', data: EMPTY_ROUTE });
      instance.addLayer(
        {
          id: 'planner-route-outline',
          type: 'line',
          source: 'planner-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.72 },
        },
        firstSymbolLayer,
      );
      instance.addLayer(
        {
          id: 'planner-route-line',
          type: 'line',
          source: 'planner-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#72827d',
            'line-width': 4,
            'line-opacity': 0.78,
            'line-dasharray': [2, 1.5],
          },
        },
        firstSymbolLayer,
      );
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
    // Google polylines stay on Google Maps. Road geometry is already canonical GeoJSON lon/lat.
    const path: [number, number][] = route
      ? 'geometry' in route
        ? route.geometry.coordinates
        : (route.demoPath?.map(({ lat, lng }): [number, number] => [lng, lat]) ?? [])
      : [];
    path.forEach((point) => bounds.extend(point));
    (instance.getSource('planner-route') as GeoJSONSource).setData(
      path.length > 1
        ? {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: path },
          }
        : EMPTY_ROUTE,
    );
    const realRoadRoute = Boolean(route && 'geometry' in route);
    instance.setPaintProperty(
      'planner-route-line',
      'line-color',
      realRoadRoute ? '#ca4934' : '#72827d',
    );
    instance.setPaintProperty('planner-route-line', 'line-width', realRoadRoute ? 6 : 4);
    instance.setPaintProperty('planner-route-line', 'line-opacity', realRoadRoute ? 0.98 : 0.78);
    instance.setPaintProperty(
      'planner-route-line',
      'line-dasharray',
      realRoadRoute ? undefined : [2, 1.5],
    );
    instance.setPaintProperty('planner-route-outline', 'line-width', realRoadRoute ? 10 : 8);
    instance.setPaintProperty('planner-route-outline', 'line-opacity', realRoadRoute ? 0.94 : 0.72);
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
    <div
      className="map-canvas open-map"
      data-map-ready={ready && !error ? 'true' : 'false'}
      data-map-style="hanoi-transit-bright"
    >
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
      {route && 'demoPath' in route && route.demoPath ? (
        <span className="open-map-demo-label">Nét đứt: tuyến minh họa, không dùng chỉ đường</span>
      ) : route && 'geometry' in route ? (
        <span className="open-map-demo-label real-route-label">
          Tuyến đường bộ thật · dữ liệu{' '}
          <a href="https://vietmap.vn/" target="_blank" rel="noreferrer">
            © VIETMAP
          </a>
        </span>
      ) : null}
    </div>
  );
}
