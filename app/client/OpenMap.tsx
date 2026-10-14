import { useEffect, useRef, useState } from 'react';
import { LocateFixed, MapPin } from 'lucide-react';
import { setWorkerUrl } from 'maplibre-gl';
import type { Map, Marker, Popup, GeoJSONSource } from 'maplibre-gl';
import * as maplibre from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Point, RoadRoute, TripRoute } from '../shared/contracts';
import { serviceArea } from '../shared/geo';
import { trafficFeatures, trafficLegend, unknownTrafficColor } from './traffic';

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/bright';
// MapLibre 6 ships an ES-module worker separately; let Vite bundle its dependencies.
setWorkerUrl(workerUrl);
const CENTER: [number, number] = [105.825, 21.04];
const EMPTY_ROUTE = { type: 'FeatureCollection' as const, features: [] };
type PaintProperty = Parameters<Map['setPaintProperty']>[1];
const DETAILED_LAYERS: [string, number][] = [
  ['highway-minor-casing', 14.8],
  ['highway-minor', 14.8],
  ['highway-area', 14.8],
  ['highway-path', 15.5],
  ['building', 15.4],
  ['building-top', 16.2],
  ['poi_transit', 14.2],
  ['highway-name-major', 13.2],
];

const TRANSIT_CANVAS_PAINT: Record<string, Record<string, string | number>> = {
  background: { 'background-color': '#f5f3ec' },
  park: { 'fill-color': '#a9d889', 'fill-opacity': 0.96 },
  'landcover-grass-park': { 'fill-color': '#b9df98', 'fill-opacity': 0.94 },
  'landcover-grass': { 'fill-color': '#d0e6b3', 'fill-opacity': 0.84 },
  water: { 'fill-color': '#9ed5ec' },
  'water-intermittent': { 'fill-color': '#b6e1f0', 'fill-opacity': 0.82 },
  'landuse-residential': { 'fill-color': '#e8e9e4', 'fill-opacity': 0.9 },
  'landuse-suburb': { 'fill-color': '#eceee8', 'fill-opacity': 0.8 },
  'landuse-commercial': { 'fill-color': '#f4e8d8', 'fill-opacity': 0.76 },
  'landuse-industrial': {
    'fill-color': '#d9dcd7',
    'fill-opacity': 0.9,
    'fill-outline-color': '#c5ccc6',
  },
  'landuse-railway': {
    'fill-color': '#d1d7d4',
    'fill-opacity': 0.96,
    'fill-outline-color': '#b9c4bf',
  },
  'landuse-hospital': { 'fill-color': '#f3e2df', 'fill-opacity': 0.76 },
  'landuse-school': { 'fill-color': '#f4efd9', 'fill-opacity': 0.76 },
  'landcover-wood': { 'fill-color': '#a8cf8c', 'fill-opacity': 0.92 },
  building: { 'fill-color': '#d3d7d2', 'fill-opacity': 0.56 },
  'building-top': { 'fill-color': '#e0e3dd', 'fill-opacity': 0.52 },
  'waterway-other': { 'line-color': '#83c4df' },
  'waterway-stream-canal': { 'line-color': '#83c4df' },
  'waterway-river': { 'line-color': '#75b9d8' },
  'highway-path': { 'line-color': '#c9c9c2' },
  'highway-minor-casing': { 'line-color': '#c8cbc6' },
  'highway-minor': { 'line-color': '#fffefa' },
  'highway-secondary-tertiary-casing': { 'line-color': '#bbc5c0' },
  'highway-secondary-tertiary': { 'line-color': '#fffefd' },
  'highway-primary-casing': { 'line-color': '#b1beb8' },
  'highway-primary': { 'line-color': '#fff8e9' },
  'highway-trunk-casing': { 'line-color': '#aabbb4' },
  'highway-trunk': { 'line-color': '#fff5df' },
  'highway-motorway-casing': { 'line-color': '#a1b5ae' },
  'highway-motorway': { 'line-color': '#fff0d5' },
  'railway-transit': {
    'line-color': '#52636f',
    'line-opacity': 0.94,
    'line-width': 1.8,
  },
  'railway-transit-hatching': { 'line-color': '#f8f7f2', 'line-opacity': 0.96 },
  'railway-service': { 'line-color': '#62727b', 'line-opacity': 0.92, 'line-width': 1.5 },
  'railway-service-hatching': { 'line-color': '#f8f7f2', 'line-opacity': 0.94 },
  railway: { 'line-color': '#53646f', 'line-opacity': 0.92, 'line-width': 1.6 },
  'railway-hatching': { 'line-color': '#f8f7f2', 'line-opacity': 0.96 },
  'tunnel-railway': { 'line-color': '#73818a', 'line-opacity': 0.82, 'line-width': 1.4 },
  'bridge-railway': { 'line-color': '#465965', 'line-opacity': 0.96, 'line-width': 1.8 },
  'bridge-railway-hatching': { 'line-color': '#f8f7f2', 'line-opacity': 0.96 },
};

const LOCAL_NAME_SOURCE_LAYERS = new Set([
  'aerodrome_label',
  'place',
  'poi',
  'transportation_name',
  'water_name',
]);

function applyTransitCanvas(instance: Map) {
  for (const [layerId, minZoom] of DETAILED_LAYERS) {
    if (instance.getLayer(layerId)) instance.setLayerZoomRange(layerId, minZoom, 24);
  }

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
    instance.setPaintProperty(layer.id, 'text-color', '#43534d');
    instance.setPaintProperty(layer.id, 'text-halo-color', '#fffefa');
    instance.setPaintProperty(layer.id, 'text-halo-width', 1.2);
  }
}

export default function OpenMap({
  route,
  origin,
  destination,
  pickTarget,
  basemapProvider,
  onPick,
  renderer = maplibre,
  style,
}: {
  route?: TripRoute | RoadRoute;
  origin: Point | null;
  destination: Point | null;
  pickTarget: 'origin' | 'destination';
  basemapProvider: 'openfreemap' | 'vietmap';
  onPick: (point: Point) => void;
  renderer?: typeof maplibre;
  style?: maplibre.StyleSpecification;
}) {
  const { Map, Marker, Popup, LngLatBounds, NavigationControl } = renderer;
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const trafficPopup = useRef<Popup | null>(null);
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
        style: style ?? OPENFREEMAP_STYLE,
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
      instance.on('click', 'planner-route-line', (event) => {
        const label = event.features?.[0]?.properties?.label;
        if (typeof label !== 'string') return;
        trafficPopup.current?.remove();
        trafficPopup.current = new Popup({ closeButton: true, offset: 10 })
          .setLngLat(event.lngLat)
          .setText(`Giao thông: ${label}`)
          .addTo(instance);
      });
      setReady(true);
    });
    instance.on('click', (event) => {
      // A marker is informational; clicking it must not change the opposite endpoint.
      if (
        (event.originalEvent.target as HTMLElement)?.closest(
          '.maplibregl-marker, .maplibregl-popup, .vietmapgl-marker, .vietmapgl-popup',
        )
      )
        return;
      if (
        instance.getLayer('planner-route-line') &&
        instance
          .queryRenderedFeatures(event.point, { layers: ['planner-route-line'] })
          .some((feature) => feature.properties?.label)
      )
        return;
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
  }, [attempt, basemapProvider, renderer, style]);

  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance) return;
    trafficPopup.current?.remove();
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
      route && 'geometry' in route
        ? trafficFeatures(route)
        : path.length > 1
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
      realRoadRoute ? ['coalesce', ['get', 'color'], unknownTrafficColor] : '#72827d',
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
    const fitRoute = () => {
      if (bounds.isEmpty()) return;
      const mobile = instance.getContainer().clientWidth < 600;
      const maxTopPadding = instance.getContainer().clientHeight * 0.55;
      instance.fitBounds(bounds, {
        padding: mobile
          ? {
              top: Math.min(realRoadRoute ? 270 : 105, maxTopPadding),
              bottom: 65,
              left: 38,
              right: 60,
            }
          : {
              top: Math.min(realRoadRoute ? 345 : 185, maxTopPadding),
              bottom: 120,
              left: 75,
              right: 80,
            },
        maxZoom: 14.5,
        duration: 0,
      });
    };
    fitRoute();
    instance.on('resize', fitRoute);
    return () => {
      instance.off('resize', fitRoute);
      markers.forEach((marker) => marker.remove());
    };
  }, [ready, origin, destination, route]);

  return (
    <div
      className="map-canvas open-map"
      data-map-ready={ready && !error ? 'true' : 'false'}
      data-map-style={basemapProvider === 'vietmap' ? 'vietmap-street' : 'hanoi-transit-bright'}
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
      {route && 'geometry' in route && (
        <aside className="traffic-legend" aria-label="Chú giải giao thông">
          <strong>Mức giao thông ước tính · VIETMAP</strong>
          <ul>
            {Object.entries(trafficLegend).map(([level, { color, label }]) => (
              <li key={level}>
                <span style={{ backgroundColor: color }} aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
          <p>
            {route.traffic?.segments.some((segment) => segment.level !== 'unknown') ? (
              <>
                Ước tính, có thể khác thực tế. Xám: thiếu dữ liệu. Lúc{' '}
                <time dateTime={route.traffic.fetchedAt}>
                  {new Date(route.traffic.fetchedAt).toLocaleTimeString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>{' '}
                · tìm lại để cập nhật.
              </>
            ) : (
              'Chưa có dữ liệu giao thông. Ước tính có thể khác thực tế.'
            )}
          </p>
        </aside>
      )}
    </div>
  );
}
