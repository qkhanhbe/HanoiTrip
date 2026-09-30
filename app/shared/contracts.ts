import { z } from 'zod';
import { serviceArea } from './geo.js';

// v1 service boundary, not the administrative boundary of Hanoi.
export const pointSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    latitude: z.number().finite().min(serviceArea.south).max(serviceArea.north),
    longitude: z.number().finite().min(serviceArea.west).max(serviceArea.east),
  })
  .strict();
export const tripSchema = z
  .object({
    origin: pointSchema,
    destination: pointSchema,
    departureTime: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
  .refine(
    (value) =>
      Math.abs(value.origin.latitude - value.destination.latitude) +
        Math.abs(value.origin.longitude - value.destination.longitude) >
      0.0001,
    { message: 'Điểm đi và điểm đến phải khác nhau.' },
  );
export const roadModeSchema = z.enum(['car', 'motorcycle']);
export const roadTripSchema = z
  .object({
    origin: pointSchema,
    destination: pointSchema,
    mode: roadModeSchema,
  })
  .strict()
  .refine(
    (value) =>
      Math.abs(value.origin.latitude - value.destination.latitude) +
        Math.abs(value.origin.longitude - value.destination.longitude) >
      0.0001,
    { message: 'Điểm đi và điểm đến phải khác nhau.' },
  );
export const itemSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    origin: pointSchema,
    destination: pointSchema,
  })
  .strict();
export type Point = z.infer<typeof pointSchema>;
export type TripInput = z.infer<typeof tripSchema>;
export type RoadMode = z.infer<typeof roadModeSchema>;
export type RoadTripInput = z.infer<typeof roadTripSchema>;
export type ItemInput = z.infer<typeof itemSchema>;
export type Item = ItemInput & { id: string; createdAt: string };
export type Mode = 'WALK' | 'BUS' | 'METRO' | 'TRAIN' | 'TRANSIT';
export interface RouteStep {
  mode: Mode;
  instruction: string;
  durationSeconds: number;
  distanceMeters: number;
  line?: string;
  from?: string;
  to?: string;
  departureTime?: string;
  arrivalTime?: string;
  stopCount?: number;
}
export interface TripRoute {
  id: string;
  durationSeconds: number;
  distanceMeters: number;
  walkingMeters: number;
  transfers: number;
  departureTime: string;
  arrivalTime: string;
  encodedPolyline?: string;
  demoPath?: { lat: number; lng: number }[];
  steps: RouteStep[];
  warnings: string[];
}
export interface RoutesResponse {
  source: 'demo' | 'google';
  generatedAt: string;
  routes: TripRoute[];
}
export interface PlaceSuggestion {
  token: string;
  label: string;
  address: string;
  distanceMeters?: number;
}
export interface PlaceSearchResponse {
  source: 'vietmap';
  suggestions: PlaceSuggestion[];
}
export interface PlaceResponse {
  source: 'vietmap';
  place: Point;
}
export interface RoadStep {
  instruction: string;
  streetName: string;
  durationSeconds: number;
  distanceMeters: number;
}
export interface RoadRoute {
  id: string;
  mode: RoadMode;
  durationSeconds: number;
  distanceMeters: number;
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  steps: RoadStep[];
}
export interface RoadRoutesResponse {
  source: 'vietmap';
  generatedAt: string;
  routes: RoadRoute[];
}
export interface PublicConfig {
  routesMode: 'demo' | 'google';
  roadProvider: 'disabled' | 'vietmap';
  mapsBrowserKey: string;
  storage: 'memory' | 'mysql';
  buildSha: string;
}
