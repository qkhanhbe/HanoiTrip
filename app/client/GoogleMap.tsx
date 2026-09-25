import { useEffect, useRef, useState } from 'react';
import type { Point, TripRoute } from '../shared/contracts';
let loader: Promise<void> | undefined;
function loadMaps(key: string) {
  if (window.google?.maps?.Map) return Promise.resolve();
  if (!loader)
    loader = new Promise<void>((resolve, reject) => {
      const callback = '__hanoiMapsReady';
      const global = window as unknown as Record<string, unknown>;
      const script = document.createElement('script');
      const timeout = window.setTimeout(() => {
        loader = undefined;
        script.remove();
        delete global[callback];
        reject(new Error('Map timeout'));
      }, 15000);
      global[callback] = () => {
        clearTimeout(timeout);
        delete global[callback];
        resolve();
      };
      const url = new URL('https://maps.googleapis.com/maps/api/js');
      url.search = new URLSearchParams({
        key,
        v: 'quarterly',
        libraries: 'geometry',
        callback,
        loading: 'async',
        language: 'vi',
        region: 'VN',
      }).toString();
      script.src = url.toString();
      script.async = true;
      script.onerror = () => {
        clearTimeout(timeout);
        loader = undefined;
        delete global[callback];
        reject(new Error('Map unavailable'));
      };
      document.head.appendChild(script);
    });
  return loader;
}
export default function GoogleMap({
  apiKey,
  route,
  origin,
  destination,
  onPick,
}: {
  apiKey: string;
  route?: TripRoute;
  origin: Point | null;
  destination: Point | null;
  onPick: (point: Point) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    let listener: google.maps.MapsEventListener | undefined;
    void loadMaps(apiKey)
      .then(() => {
        if (!active || !element.current) return;
        map.current = new google.maps.Map(element.current, {
          center: { lat: 21.033, lng: 105.832 },
          zoom: 13,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: 'cooperative',
        });
        listener = map.current.addListener('click', (event: google.maps.MapMouseEvent) => {
          if (event.latLng)
            pick.current({
              label: `Điểm trên bản đồ (${event.latLng.lat().toFixed(4)}, ${event.latLng.lng().toFixed(4)})`,
              latitude: event.latLng.lat(),
              longitude: event.latLng.lng(),
            });
        });
        setReady(true);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      listener?.remove();
    };
  }, [apiKey]);
  useEffect(() => {
    if (!ready || !map.current) return;
    const markers: google.maps.Marker[] = [];
    const bounds = new google.maps.LatLngBounds();
    for (const [i, point] of [origin, destination].entries())
      if (point) {
        const position = { lat: point.latitude, lng: point.longitude };
        bounds.extend(position);
        markers.push(
          new google.maps.Marker({
            map: map.current,
            position,
            label: i ? 'B' : 'A',
            title: point.label,
          }),
        );
      }
    const path = route?.encodedPolyline
      ? google.maps.geometry.encoding.decodePath(route.encodedPolyline)
      : [];
    path.forEach((point) => bounds.extend(point));
    const line = new google.maps.Polyline({
      map: map.current,
      path,
      strokeColor: '#256bc0',
      strokeWeight: 6,
    });
    if (!bounds.isEmpty()) map.current.fitBounds(bounds, 70);
    return () => {
      markers.forEach((marker) => marker.setMap(null));
      line.setMap(null);
    };
  }, [ready, route, origin, destination]);
  return (
    <>
      <div ref={element} className="map-canvas" aria-label="Bản đồ Google của hành trình" />
      {error && (
        <div className="map-error" role="alert">
          Không tải được Google Maps. Kiểm tra mạng hoặc cấu hình browser key. Danh sách chặng vẫn
          có thể sử dụng.
        </div>
      )}
    </>
  );
}
