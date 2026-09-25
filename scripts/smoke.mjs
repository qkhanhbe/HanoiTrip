import assert from 'node:assert/strict';
const base = process.env.BASE_URL ?? 'http://127.0.0.1:8080';
const point = { label: 'Smoke A', latitude: 21.0287, longitude: 105.8523 };
const trip = {
  origin: point,
  destination: { label: 'Smoke B', latitude: 21.0404, longitude: 105.7982 },
};
async function request(path, status, options) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, status, `${path} status`);
  assert.ok(response.headers.get('x-request-id'), 'request ID');
  return response;
}
assert.equal((await (await request('/health', 200)).json()).status, 'ok');
const version = await (await request('/version', 200)).json();
assert.ok(version.buildSha);
if (process.env.EXPECTED_SHA) assert.equal(version.buildSha, process.env.EXPECTED_SHA);
assert.match(await (await request('/', 200)).text(), /HanoiTrip/);
await request('/does-not-exist', 404);
await request('/items?limit=0', 400);
const config = await (await request('/config', 200)).json();
assert.equal(config.GOOGLE_ROUTES_API_KEY, undefined);
const post = (payload) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
await request('/routes', 400, post({}));
if (config.routesMode === 'demo') {
  const routes = await (await request('/routes', 200, post(trip))).json();
  assert.equal(routes.source, 'demo');
  assert.ok(routes.routes.length);
}
// Explicitly opted in because this writes a synthetic favorite to the sandbox.
if (process.env.SMOKE_WRITE === '1') {
  const item = await (
    await request('/items', 201, post({ ...trip, label: `Smoke ${new Date().toISOString()}` }))
  ).json();
  const items = await (await request('/items?limit=100', 200)).json();
  assert.ok(items.some((saved) => saved.id === item.id));
} else await request('/items', 200);
if (process.env.SMOKE_DIAGNOSTICS === '1') {
  await request('/boom', 500);
  await request('/load?seconds=0', 400);
  await request('/load?seconds=1', 200);
}
console.log(
  JSON.stringify({
    result: 'pass',
    buildSha: version.buildSha,
    storage: config.storage,
    routes: config.routesMode,
    wroteFavorite: process.env.SMOKE_WRITE === '1',
    diagnostics: process.env.SMOKE_DIAGNOSTICS === '1',
  }),
);
