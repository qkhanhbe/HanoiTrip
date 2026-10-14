import { z } from 'zod';
import type { CongestionLevel, TrafficSegment } from '../shared/contracts.js';

const annotationSchema = z.object({
  first: z.number().int().nonnegative(),
  last: z.number().int().nonnegative(),
  value: z.enum(['low', 'moderate', 'heavy', 'severe', 'unknown']).catch('unknown'),
});

/** Uncovered, invalid or conflicting edges must never be shown as free-flowing. */
export function normalizeTraffic(annotations: unknown, vertices: number): TrafficSegment[] {
  if (vertices < 2) return [];
  const edges: CongestionLevel[] = Array.from({ length: vertices - 1 }, () => 'unknown');
  const seen = new Set<number>();
  const parsed = z.object({ congestion: z.array(z.unknown()) }).safeParse(annotations);
  for (const raw of parsed.success ? parsed.data.congestion : []) {
    const result = annotationSchema.safeParse(raw);
    if (!result.success) continue;
    const { first, last } = result.data;
    const value: CongestionLevel =
      result.data.value === 'heavy' || result.data.value === 'severe'
        ? 'congested'
        : result.data.value;
    if (first >= last || last >= vertices) continue;
    for (let edge = first; edge < last; edge++) {
      edges[edge] = seen.has(edge) ? 'unknown' : value;
      seen.add(edge);
    }
  }
  const segments: TrafficSegment[] = [];
  for (let edge = 0; edge < edges.length; edge++) {
    const previous = segments.at(-1);
    if (previous?.level === edges[edge]) previous.last = edge + 1;
    else segments.push({ first: edge, last: edge + 1, level: edges[edge] });
  }
  return segments;
}
