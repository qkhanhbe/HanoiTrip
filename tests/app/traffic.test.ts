import { describe, expect, it } from 'vitest';
import { normalizeTraffic } from '../../app/server/traffic.js';
import { trafficFeatures, trafficLegend } from '../../app/client/traffic.js';
import type { RoadRoute } from '../../app/shared/contracts.js';

describe('route congestion annotations', () => {
  it('maps inclusive vertex ranges and merges adjacent equal levels', () => {
    expect(
      normalizeTraffic(
        {
          congestion: [
            { first: 0, last: 1, value: 'low' },
            { first: 1, last: 2, value: 'low' },
            { first: 2, last: 3, value: 'moderate' },
            { first: 3, last: 4, value: 'heavy' },
            { first: 4, last: 5, value: 'severe' },
          ],
        },
        6,
      ),
    ).toEqual([
      { first: 0, last: 2, level: 'low' },
      { first: 2, last: 3, level: 'moderate' },
      { first: 3, last: 5, level: 'congested' },
    ]);
  });

  it.each([undefined, null, {}, { congestion: 'invalid' }, { congestion: [] }])(
    'keeps missing annotations unknown: %j',
    (annotations) => {
      expect(normalizeTraffic(annotations, 4)).toEqual([{ first: 0, last: 3, level: 'unknown' }]);
    },
  );

  it('does not label malformed, out-of-bounds or uncovered edges as free-flowing', () => {
    expect(
      normalizeTraffic(
        {
          congestion: [
            null,
            { first: -1, last: 1, value: 'low' },
            { first: 0.5, last: 1, value: 'low' },
            { first: 0, last: 9, value: 'low' },
            { first: 2, last: 1, value: 'low' },
            { first: 0, last: 1, value: 'future-level' },
            { first: 2, last: 3, value: 'heavy' },
          ],
        },
        5,
      ),
    ).toEqual([
      { first: 0, last: 2, level: 'unknown' },
      { first: 2, last: 3, level: 'congested' },
      { first: 3, last: 4, level: 'unknown' },
    ]);
  });

  it('marks conflicting overlap unknown and handles empty geometry', () => {
    expect(
      normalizeTraffic(
        {
          congestion: [
            { first: 0, last: 2, value: 'low' },
            { first: 1, last: 3, value: 'severe' },
          ],
        },
        4,
      ),
    ).toEqual([
      { first: 0, last: 1, level: 'low' },
      { first: 1, last: 2, level: 'unknown' },
      { first: 2, last: 3, level: 'congested' },
    ]);
    expect(normalizeTraffic(undefined, 1)).toEqual([]);
  });
});

const route: RoadRoute = {
  id: 'fixture',
  mode: 'car',
  durationSeconds: 900,
  distanceMeters: 5000,
  steps: [],
  geometry: {
    type: 'LineString',
    coordinates: [
      [105.8542, 21.0285],
      [105.84, 21.03],
      [105.82, 21.04],
      [105.8, 21.05],
    ],
  },
};

describe('traffic map geometry', () => {
  it('shares boundary vertices without gaps and preserves longitude/latitude order', () => {
    const features = trafficFeatures({
      ...route,
      traffic: {
        fetchedAt: '2026-10-12T11:00:00Z',
        segments: [
          { first: 0, last: 2, level: 'low' },
          { first: 2, last: 3, level: 'congested' },
        ],
      },
    }).features;
    expect(features[0].geometry.coordinates).toEqual(route.geometry.coordinates.slice(0, 3));
    expect(features[1].geometry.coordinates).toEqual(route.geometry.coordinates.slice(2));
    expect(features[0].properties).toMatchObject({
      color: trafficLegend.low.color,
      label: 'Thông thoáng',
    });
    expect(features[1].properties).toMatchObject({
      color: trafficLegend.congested.color,
      label: 'Ùn tắc',
    });
  });

  it('renders the full route gray when traffic is absent or empty', () => {
    for (const input of [route, { ...route, traffic: { fetchedAt: '', segments: [] } }]) {
      const { features } = trafficFeatures(input);
      expect(features).toHaveLength(1);
      expect(features[0].geometry).toEqual(route.geometry);
      expect(features[0].properties).toMatchObject({
        level: 'unknown',
        color: '#687782',
      });
    }
  });
});
