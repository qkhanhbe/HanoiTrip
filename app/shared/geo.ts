import type { Point } from './contracts.js';
export const serviceArea = { south: 20.8, north: 21.3, west: 105.5, east: 106.05 };
export function isSupportedPoint(point: Point): boolean {
  return (
    point.label.trim().length > 0 &&
    point.label.length <= 120 &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= serviceArea.south &&
    point.latitude <= serviceArea.north &&
    point.longitude >= serviceArea.west &&
    point.longitude <= serviceArea.east
  );
}
