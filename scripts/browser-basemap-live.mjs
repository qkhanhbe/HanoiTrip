// Bounded live render check. Uses provider tiles for one desktop and one mobile view.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.BASE_URL;
const expected = process.env.EXPECTED_BASEMAP;
assert.ok(base, 'BASE_URL required');
assert.ok(['openfreemap', 'vietmap'].includes(expected), 'EXPECTED_BASEMAP required');
const config = await (await fetch(new URL('/config', base))).json();
assert.equal(config.basemapProvider, expected);
if (process.env.EXPECTED_SHA) assert.equal(config.buildSha, process.env.EXPECTED_SHA);
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});
await mkdir('output/playwright', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const failures = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/v1/map/') && response.status() !== 200)
      failures.push(`${url.pathname}: ${response.status()}`);
  });
  await page.goto(base);
  await page.locator('[data-map-ready="true"]').waitFor({ timeout: 45000 });
  assert.equal(await page.getByRole('alert').count(), 0, 'No tile/renderer error');
  const canvas = page.locator(expected === 'vietmap' ? '.vietmapgl-canvas' : '.maplibregl-canvas');
  assert.equal(await canvas.count(), 1);
  await page.getByRole('button', { name: 'Phóng to bản đồ' }).click();
  await page.screenshot({ path: `output/playwright/${expected}-live-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-map-ready="true"]').waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: `output/playwright/${expected}-live-mobile.png`, fullPage: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  console.log(`PASS: ${expected} live desktop/mobile render and assets`);
} finally {
  await browser.close();
}
