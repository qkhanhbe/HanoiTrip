// Bounded staging probe: one style, one Hanoi vector tile and one sprite JSON.
// No user data is written; VIETMAP probes consume provider requests.
import assert from 'node:assert/strict';

const base = new URL(process.env.BASE_URL ?? 'http://127.0.0.1:8080');
const expected = process.env.EXPECTED_BASEMAP;
assert.ok(['openfreemap', 'vietmap'].includes(expected), 'EXPECTED_BASEMAP is required');

async function get(path) {
  assert.ok(path.startsWith('/'), 'Expected a same-origin path');
  const url = new URL(path, base);
  assert.equal(url.origin, base.origin, 'Assets must use the application proxy');
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
  assert.equal(response.status, 200, `Basemap probe failed: ${url.pathname}`);
  return response;
}

const config = await (await get('/config')).json();
assert.equal(config.basemapProvider, expected);
assert.equal(config.VIETMAP_TILEMAP_API_KEY, undefined);
assert.equal(config.VIETMAP_API_KEY, undefined);
if (expected === 'vietmap') {
  const style = await (await get('/v1/map/style')).json();
  assert.equal(style.version, 8);
  assert.ok(style.layers?.length > 0, 'Style has no layers');
  const source = Object.values(style.sources).find((value) => value.type === 'vector');
  const template = source?.tiles?.[0];
  assert.match(template ?? '', /^\/v1\/map\/tiles\/vlc-\d{8}\/\{z\}\/\{x\}\/\{y\}\.pbf$/);
  const tile = await get(
    template.replace('{z}', '12').replace('{x}', '3252').replace('{y}', '1803'),
  );
  assert.ok((await tile.arrayBuffer()).byteLength > 0, 'Hanoi tile is empty');
  assert.equal(style.sprite, '/v1/map/sprite/base');
  const sprite = await (await get(`${style.sprite}.json`)).json();
  assert.ok(Object.keys(sprite).length > 0, 'Sprite index is empty');
}
console.log(
  JSON.stringify({ result: 'pass', basemap: expected, liveAssetsChecked: expected === 'vietmap' }),
);
