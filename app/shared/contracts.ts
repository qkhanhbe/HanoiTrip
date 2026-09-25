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
export const itemSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    origin: pointSchema,
    destination: pointSchema,
  })
  .strict();
export type Point = z.infer<typeof pointSchema>;
export type TripInput = z.infer<typeof tripSchema>;
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
export interface PublicConfig {
  routesMode: 'demo' | 'google';
  mapsBrowserKey: string;
  storage: 'memory' | 'mysql';
}
