import assert from 'node:assert/strict';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:8080';
const expectedProviderRequests = '40';
const delayMs = Number(process.env.ROAD_BENCHMARK_DELAY_MS ?? 4100);

if (process.env.ROAD_BENCHMARK_CONFIRM !== expectedProviderRequests)
  throw new Error(
    `This benchmark makes ${expectedProviderRequests} provider requests. Set ROAD_BENCHMARK_CONFIRM=${expectedProviderRequests} after checking quota and cost.`,
  );
if (!Number.isInteger(delayMs) || delayMs < 4000 || delayMs > 30000)
  throw new Error('ROAD_BENCHMARK_DELAY_MS must be an integer from 4000 to 30000.');

const landmarks = [
  ['hoan-kiem', 'Hồ Hoàn Kiếm Hà Nội'],
  ['van-mieu', 'Văn Miếu Quốc Tử Giám Hà Nội'],
  ['noibai', 'Sân bay Nội Bài Hà Nội'],
  ['my-dinh', 'Bến xe Mỹ Đình Hà Nội'],
  ['long-bien', 'Cầu Long Biên Hà Nội'],
  ['bach-khoa', 'Đại học Bách khoa Hà Nội'],
  ['ho-tay', 'Hồ Tây Hà Nội'],
  ['royal-city', 'Royal City Hà Nội'],
  ['vincom-ba-trieu', 'Vincom Bà Triệu Hà Nội'],
  ['aeon-long-bien', 'AEON Mall Long Biên Hà Nội'],
];

const pairs = [
  ['hoan-kiem', 'van-mieu'],
  ['hoan-kiem', 'noibai'],
  ['van-mieu', 'my-dinh'],
  ['long-bien', 'bach-khoa'],
  ['ho-tay', 'royal-city'],
  ['vincom-ba-trieu', 'aeon-long-bien'],
  ['my-dinh', 'noibai'],
  ['bach-khoa', 'ho-tay'],
  ['royal-city', 'long-bien'],
  ['aeon-long-bien', 'van-mieu'],
];

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function request(path, options) {
  const startedAt = performance.now();
  const response = await fetch(`${base}${path}`, {
    ...options,
    signal: AbortSignal.timeout(20000),
  });
  const latencyMs = Math.round((performance.now() - startedAt) * 100) / 100;
  assert.ok(response.headers.get('x-request-id'), `${path.split('?')[0]} request ID`);
  if (!response.ok)
    throw new Error(
      `${options?.method ?? 'GET'} ${path.split('?')[0]} returned ${response.status}`,
    );
  return { data: await response.json(), latencyMs };
}

const post = (payload) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

function percentile(values, fraction) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)];
}

function distanceMeters(from, to) {
  const radians = (value) => (value * Math.PI) / 180;
  const latitudeDelta = radians(to[1] - from.latitude);
  const longitudeDelta = radians(to[0] - from.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(from.latitude)) * Math.cos(radians(to[1])) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const version = (await request('/version')).data;
if (process.env.EXPECTED_SHA) assert.equal(version.buildSha, process.env.EXPECTED_SHA);
const config = (await request('/config')).data;
assert.equal(config.roadProvider, 'vietmap', 'road provider must be enabled');
assert.equal(config.VIETMAP_API_KEY, undefined, 'public config must not expose the provider key');

const resolved = new Map();
const searchLatencies = [];
for (const [id, query] of landmarks) {
  process.stderr.write(`Resolving ${id}\n`);
  const search = await request(`/v1/search?q=${encodeURIComponent(query)}`);
  searchLatencies.push(search.latencyMs);
  assert.equal(search.data.source, 'vietmap');
  assert.ok(search.data.suggestions.length, `search result for ${id}`);
  const place = await request(
    '/v1/places/resolve',
    post({ token: search.data.suggestions[0].token }),
  );
  assert.equal(place.data.source, 'vietmap');
  assert.ok(place.data.place.latitude >= 20.8 && place.data.place.latitude <= 21.3);
  assert.ok(place.data.place.longitude >= 105.5 && place.data.place.longitude <= 106.05);
  resolved.set(id, {
    place: place.data.place,
    searchLatencyMs: search.latencyMs,
    resolveLatencyMs: place.latencyMs,
  });
}

const routeResults = [];
const routeLatencies = [];
let routeRequest = 0;
for (const [originId, destinationId] of pairs) {
  const originResult = resolved.get(originId);
  const destinationResult = resolved.get(destinationId);
  assert.ok(originResult && destinationResult);
  const origin = originResult.place;
  const destination = destinationResult.place;
  for (const mode of ['car', 'motorcycle']) {
    if (routeRequest > 0) await sleep(delayMs);
    routeRequest += 1;
    process.stderr.write(`Routing ${routeRequest}/20: ${originId} -> ${destinationId} (${mode})\n`);
    const response = await request('/v1/routes/road', post({ origin, destination, mode }));
    routeLatencies.push(response.latencyMs);
    assert.equal(response.data.source, 'vietmap');
    assert.ok(response.data.routes.length, `${originId} -> ${destinationId} ${mode}`);
    const route = response.data.routes[0];
    assert.equal(route.mode, mode);
    assert.ok(route.distanceMeters > 0);
    assert.ok(route.durationSeconds > 0);
    assert.equal(route.geometry.type, 'LineString');
    assert.ok(route.geometry.coordinates.length > 2, 'route must not be a direct A-B line');
    const startSnapMeters = Math.round(distanceMeters(origin, route.geometry.coordinates[0]));
    const endSnapMeters = Math.round(
      distanceMeters(destination, route.geometry.coordinates.at(-1)),
    );
    assert.ok(startSnapMeters <= 2000, `origin snap is too far for ${originId}`);
    assert.ok(endSnapMeters <= 2000, `destination snap is too far for ${destinationId}`);
    routeResults.push({
      origin: originId,
      destination: destinationId,
      mode,
      latencyMs: response.latencyMs,
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      geometryPoints: route.geometry.coordinates.length,
      startSnapMeters,
      endSnapMeters,
    });
  }
}

console.log(
  JSON.stringify(
    {
      result: 'pass',
      generatedAt: new Date().toISOString(),
      baseUrl: new URL(base).origin,
      buildSha: version.buildSha,
      provider: config.roadProvider,
      providerRequests: Number(expectedProviderRequests),
      landmarks: [...resolved].map(([id, result]) => ({
        id,
        ...result.place,
        searchLatencyMs: result.searchLatencyMs,
        resolveLatencyMs: result.resolveLatencyMs,
      })),
      routes: routeResults,
      latencyMs: {
        searchP50: percentile(searchLatencies, 0.5),
        searchP95: percentile(searchLatencies, 0.95),
        routeP50: percentile(routeLatencies, 0.5),
        routeP95: percentile(routeLatencies, 0.95),
      },
    },
    null,
    2,
  ),
);
