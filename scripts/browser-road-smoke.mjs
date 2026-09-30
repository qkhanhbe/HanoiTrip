// Browser contract smoke for release B: UI -> BFF -> VIETMAP adapter -> deterministic upstream.
// This never calls VIETMAP and never requires a provider key or database.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createApp } from '../dist/server/app.js';
import { readConfig } from '../dist/server/config.js';
import { MemoryRepository } from '../dist/server/repository.js';
import { demoProvider } from '../dist/server/routes-provider.js';
import { vietmapProviders } from '../dist/server/vietmap-provider.js';

const fixtureKey = 'browser-fixture-key-not-a-secret';
const upstreamCalls = [];
const fixtures = {
  'auto:bach_khoa': {
    display: 'Đại học Bách khoa Hà Nội',
    address: 'Hai Bà Trưng, Hà Nội',
    lat: 21.005,
    lng: 105.843,
  },
  'auto:noibai': {
    display: 'Sân bay Quốc tế Nội Bài',
    address: 'Sóc Sơn, Hà Nội',
    lat: 21.2212,
    lng: 105.8072,
  },
};

const upstream = async (input) => {
  const url = new URL(String(input));
  upstreamCalls.push(url);
  assert.equal(url.origin, 'https://maps.vietmap.vn');
  assert.equal(url.searchParams.get('apikey'), fixtureKey);
  if (url.pathname === '/api/autocomplete/v4') {
    const query = url.searchParams.get('text')?.toLowerCase() ?? '';
    const refId = query.includes('noi') ? 'auto:noibai' : 'auto:bach_khoa';
    const fixture = fixtures[refId];
    return Response.json([
      {
        ref_id: refId,
        display: fixture.display,
        address: fixture.address,
        distance: refId === 'auto:noibai' ? 23.4 : 2.1,
      },
    ]);
  }
  if (url.pathname === '/api/place/v4') {
    const fixture = fixtures[url.searchParams.get('refid')];
    return fixture ? Response.json(fixture) : new Response('', { status: 404 });
  }
  if (url.pathname === '/api/route/v4') {
    const points = url.searchParams.getAll('point').map((point) => point.split(',').map(Number));
    assert.equal(points.length, 2);
    const [[originLat, originLng], [destinationLat, destinationLng]] = points;
    const motorcycle = url.searchParams.get('vehicle') === 'motorcycle';
    return Response.json({
      code: 'OK',
      paths: [
        {
          distance: 28_420,
          time: motorcycle ? 2_460_000 : 2_880_000,
          points_encoded: false,
          points: {
            type: 'LineString',
            coordinates: [
              [originLng, originLat],
              [(originLng + destinationLng) / 2, (originLat + destinationLat) / 2 + 0.01],
              [destinationLng, destinationLat],
            ],
          },
          instructions: [
            {
              distance: 28_420,
              time: motorcycle ? 2_460_000 : 2_880_000,
              text: 'Đi theo cầu Nhật Tân về hướng sân bay',
              street_name: 'Võ Nguyên Giáp',
            },
          ],
        },
      ],
    });
  }
  return new Response('', { status: 404 });
};

const config = readConfig({
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: '8080',
  BUILD_SHA: 'road-browser-fixture',
  ROUTES_MODE: 'demo',
  ROAD_PROVIDER: 'vietmap',
  DB_MODE: 'memory',
  VIETMAP_API_KEY: fixtureKey,
});
const vietmap = vietmapProviders(fixtureKey, upstream, () => Date.parse('2026-09-30T06:00:00Z'));
const app = await createApp(config, {
  repository: new MemoryRepository(),
  routes: demoProvider,
  places: vietmap.places,
  roadRoutes: vietmap.roadRoutes,
  logger: false,
  staticDir: resolve('dist/client'),
});
await app.listen({ host: '127.0.0.1', port: 0 });
const address = app.server.address();
assert.ok(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}`;
const publicConfig = await fetch(`${baseUrl}/config`).then((response) => response.json());
assert.equal(publicConfig.roadProvider, 'vietmap');
assert.doesNotMatch(JSON.stringify(publicConfig), new RegExp(fixtureKey));

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(baseUrl);

  const car = page.getByRole('button', { name: 'Ô tô', exact: true });
  await car.waitFor();
  await car.click();
  assert.equal(await car.isEnabled(), true);
  await page.getByText('Route thật từ VIETMAP · ô tô').waitFor();

  const origin = page.getByRole('combobox', { name: 'Điểm đi', exact: true });
  const originSearch = page.waitForResponse((response) =>
    response.url().includes('/v1/search?q=bach%20khoa'),
  );
  await origin.fill('bach khoa');
  const originSearchResponse = await originSearch;
  assert.equal(
    originSearchResponse.status(),
    200,
    `Origin search failed: ${await originSearchResponse.text()}`,
  );
  await page.getByRole('option').filter({ hasText: 'Đại học Bách khoa Hà Nội' }).click();
  await page.waitForFunction(({ id, value }) => document.getElementById(id)?.value === value, {
    id: await origin.getAttribute('id'),
    value: 'Đại học Bách khoa Hà Nội',
  });
  assert.equal(await origin.inputValue(), 'Đại học Bách khoa Hà Nội');

  const destination = page.getByRole('combobox', { name: 'Điểm đến', exact: true });
  const destinationSearch = page.waitForResponse((response) =>
    response.url().includes('/v1/search?q=noi%20bai'),
  );
  await destination.fill('noi bai');
  const destinationSearchResponse = await destinationSearch;
  assert.equal(
    destinationSearchResponse.status(),
    200,
    `Destination search failed: ${await destinationSearchResponse.text()}`,
  );
  await page.getByRole('option').filter({ hasText: 'Sân bay Quốc tế Nội Bài' }).click();
  await page.waitForFunction(({ id, value }) => document.getElementById(id)?.value === value, {
    id: await destination.getAttribute('id'),
    value: 'Sân bay Quốc tế Nội Bài',
  });
  assert.equal(await destination.inputValue(), 'Sân bay Quốc tế Nội Bài');

  await page.getByRole('button', { name: 'Tìm hành trình', exact: true }).click();
  await page.getByText('1 phương án').waitFor();
  await page.getByRole('article', { name: 'Phương án đường bộ 1' }).waitFor();
  await page.getByText('Tuyến đường bộ và geometry từ VIETMAP.', { exact: false }).waitFor();
  const attribution = page.getByRole('link', { name: '© VIETMAP', exact: true });
  await attribution.waitFor();
  assert.equal(await attribution.getAttribute('href'), 'https://vietmap.vn/');
  await page.getByRole('button', { name: 'Chỉ dẫn cơ bản' }).click();
  await page.getByText('Võ Nguyên Giáp', { exact: true }).waitFor();
  await page.screenshot({ path: 'output/playwright/road-route-desktop.png', fullPage: true });

  await page.getByRole('button', { name: 'Xe máy', exact: true }).click();
  await page.getByText('Route thật từ VIETMAP · xe máy').waitFor();
  await page.getByRole('button', { name: 'Tìm hành trình', exact: true }).click();
  await page.getByRole('article', { name: 'Phương án đường bộ 1' }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'No horizontal overflow in road result state',
  );
  await page.screenshot({ path: 'output/playwright/road-route-mobile.png', fullPage: true });

  const routeVehicles = upstreamCalls
    .filter((url) => url.pathname === '/api/route/v4')
    .map((url) => url.searchParams.get('vehicle'));
  assert.deepEqual(routeVehicles, ['car', 'motorcycle']);
  assert.equal(upstreamCalls.filter((url) => url.pathname === '/api/autocomplete/v4').length, 2);
  assert.equal(upstreamCalls.filter((url) => url.pathname === '/api/place/v4').length, 2);
  assert.doesNotMatch(await page.locator('body').innerText(), new RegExp(fixtureKey));
  assert.deepEqual(pageErrors, []);
  console.log(
    'PASS: browser exercised search, signed resolve, car/motorcycle routing, real geometry, attribution and responsive UI through the BFF adapter.',
  );
} finally {
  await browser.close();
  await app.close();
}
