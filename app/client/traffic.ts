import type { FeatureCollection, LineString } from 'geojson';
import type { CongestionLevel, RoadRoute } from '../shared/contracts';

export const trafficLegend: Record<
  Exclude<CongestionLevel, 'unknown'>,
  { color: string; label: string }
> = {
  low: { color: '#23834b', label: 'Thông thoáng' },
  moderate: { color: '#b8860b', label: 'Đông/chậm' },
  congested: { color: '#c4382b', label: 'Ùn tắc' },
};
export const unknownTrafficColor = '#687782';

export function trafficFeatures(route: RoadRoute): FeatureCollection<LineString> {
  const coordinates = route.geometry.coordinates;
  const segments = route.traffic?.segments.length
    ? route.traffic.segments
    : [{ first: 0, last: coordinates.length - 1, level: 'unknown' as const }];
  return {
    type: 'FeatureCollection',
    features: segments.map(({ first, last, level }) => ({
      type: 'Feature',
      properties: {
        level,
        color: level === 'unknown' ? unknownTrafficColor : trafficLegend[level].color,
        label: level === 'unknown' ? 'Chưa có dữ liệu' : trafficLegend[level].label,
      },
      geometry: { type: 'LineString', coordinates: coordinates.slice(first, last + 1) },
    })),
  };
}
