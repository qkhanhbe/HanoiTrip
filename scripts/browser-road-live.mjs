// Opt-in browser smoke against a running environment with the real road provider.
// This makes exactly 6 provider requests: 2 search, 2 resolve and 2 route requests.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const expectedRequests = '6';
const baseUrl = process.env.BASE_URL;
const expectedSha = process.env.EXPECTED_SHA;

if (process.env.LIVE_ROAD_CONFIRM !== expectedRequests)
  throw new Error(
    `This browser smoke makes ${expectedRequests} provider requests. Set LIVE_ROAD_CONFIRM=${expectedRequests} after checking quota and cost.`,
  );
if (!baseUrl) throw new Error('BASE_URL is required.');
if (!expectedSha) throw new Error('EXPECTED_SHA is required to avoid testing the wrong release.');

const target = new URL(baseUrl);
assert.ok(['http:', 'https:'].includes(target.protocol), 'BASE_URL must use HTTP or HTTPS.');

const versionResponse = await fetch(new URL('/version', target), {
  signal: AbortSignal.timeout(10000),
});
assert.equal(versionResponse.status, 200, '/version must be healthy');
const version = await versionResponse.json();
assert.equal(version.buildSha, expectedSha, 'deployed build does not match EXPECTED_SHA');

const configResponse = await fetch(new URL('/config', target), {
  signal: AbortSignal.timeout(10000),
});
assert.equal(configResponse.status, 200, '/config must be healthy');
const config = await configResponse.json();
assert.equal(config.roadProvider, 'vietmap', 'VIETMAP road provider must be enabled');
assert.equal(config.VIETMAP_API_KEY, undefined, 'public config must not expose the provider key');

await mkdir('output/playwright', { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(target.origin, { waitUntil: 'domcontentloaded' });

  const car = page.getByRole('button', { name: 'Ô tô', exact: true });
  await car.click();
  await page.getByText('Route thật từ VIETMAP · ô tô').waitFor();

  const selectFirstSuggestion = async (input, query) => {
    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/v1/search' && url.searchParams.get('q') === query;
    });
    await input.fill(query);
    const response = await responsePromise;
    assert.equal(response.status(), 200, `Search failed for ${query}`);
    const option = page.getByRole('option').first();
    await option.waitFor();
    const label = (await option.textContent())?.trim();
    assert.ok(label, `Search returned no selectable label for ${query}`);
    await option.click();
    assert.ok((await input.inputValue()).trim(), `Resolved place is empty for ${query}`);
  };

  const origin = page.getByRole('combobox', { name: 'Điểm đi', exact: true });
  const destination = page.getByRole('combobox', { name: 'Điểm đến', exact: true });
  await selectFirstSuggestion(origin, 'Đại học Bách khoa Hà Nội');
  await selectFirstSuggestion(destination, 'Sân bay Nội Bài Hà Nội');

  const routeButton = page.getByRole('button', { name: 'Tìm hành trình', exact: true });
  await routeButton.click();
  const firstRoute = page.getByRole('article', { name: 'Phương án đường bộ 1' });
  await firstRoute.waitFor();
  await page.getByText('Tuyến đường bộ và geometry từ VIETMAP.', { exact: false }).waitFor();
  const attribution = page.getByRole('link', { name: '© VIETMAP', exact: true });
  await attribution.waitFor();
  assert.equal(await attribution.getAttribute('href'), 'https://vietmap.vn/');
  await firstRoute.getByRole('button', { name: 'Chỉ dẫn cơ bản' }).click();
  await page.screenshot({ path: 'output/playwright/road-live-desktop.png', fullPage: true });

  await page.getByRole('button', { name: 'Xe máy', exact: true }).click();
  await page.getByText('Route thật từ VIETMAP · xe máy').waitFor();
  await routeButton.click();
  await page.getByRole('article', { name: 'Phương án đường bộ 1' }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'No horizontal overflow in the live road result state',
  );
  await page.screenshot({ path: 'output/playwright/road-live-mobile.png', fullPage: true });

  assert.deepEqual(pageErrors, []);
  console.log(
    `PASS: live browser exercised VIETMAP search, resolve and car/motorcycle routing for build ${expectedSha}; provider requests=${expectedRequests}.`,
  );
} finally {
  await browser.close();
}
