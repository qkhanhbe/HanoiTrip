// UI smoke harness: live public map tiles, demo routing, no provider keys needed.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const browser = process.env.CDP_ENDPOINT
  ? await chromium.connectOverCDP(process.env.CDP_ENDPOINT)
  : await chromium.launch({
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    });
const output = 'output/playwright';
await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(process.env.BASE_URL ?? 'http://127.0.0.1:8080');
  await page.getByText('Chế độ trải nghiệm · Dữ liệu minh họa').waitFor();
  await page.locator('.open-map[data-map-ready="true"]').waitFor({ timeout: 45000 });
  await page.getByRole('link', { name: 'OpenStreetMap', exact: true }).waitFor();
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${output}/desktop-initial.png`, fullPage: true });
  await page.getByRole('button', { name: 'Tìm hành trình', exact: true }).click();
  await page.getByText('3 phương án').waitFor();
  await page.getByRole('button', { name: 'Chi tiết hành trình' }).first().click();
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${output}/desktop-results.png`, fullPage: true });
  await page.getByRole('button', { name: 'Lưu hành trình phương án 1' }).click();
  await page.getByRole('status').filter({ hasText: 'Đã lưu' }).waitFor();
  await page.getByRole('button', { name: 'Đã lưu', exact: true }).click();
  await page
    .getByRole('button', { name: /Hồ Hoàn Kiếm.*Bảo tàng/ })
    .first()
    .click();
  assert.equal(
    await page.getByRole('combobox', { name: 'Điểm đi', exact: true }).inputValue(),
    'Hồ Hoàn Kiếm',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const toastClose = page.getByRole('button', { name: 'Đóng thông báo' });
  if (await toastClose.isVisible()) await toastClose.click();
  await page.getByRole('button', { name: 'Tìm hành trình', exact: true }).click();
  await page.getByText('3 phương án').waitFor();
  await page.waitForLoadState('networkidle');
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'No horizontal overflow',
  );
  await page.screenshot({ path: `${output}/mobile-results.png`, fullPage: true });
  await page.getByRole('combobox', { name: 'Điểm đi', exact: true }).fill('van mieu');
  await page.getByRole('combobox', { name: 'Điểm đi', exact: true }).press('Enter');
  assert.equal(
    await page.getByRole('combobox', { name: 'Điểm đi', exact: true }).inputValue(),
    'Văn Miếu – Quốc Tử Giám',
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Về trung tâm Hà Nội' }).click();
  const canvas = page.locator('.maplibregl-canvas');
  const box = await canvas.boundingBox();
  assert.ok(box && box.width > 600 && box.height > 600, 'Canvas fills the desktop map panel');
  const destination = page.getByRole('combobox', { name: 'Điểm đến', exact: true });
  const beforeDrag = await destination.inputValue();
  // Drag must move the map without treating pointer-up as an endpoint selection.
  const markerBefore = await page.locator('.destination-marker').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 45, { steps: 12 });
  await page.mouse.up();
  assert.ok(markerBefore);
  await page.waitForFunction((previousX) => {
    const marker = document.querySelector('.destination-marker');
    return marker && Math.abs(marker.getBoundingClientRect().x - previousX) > 20;
  }, markerBefore.x);
  const markerAfter = await page.locator('.destination-marker').boundingBox();
  assert.ok(
    markerBefore && markerAfter && Math.abs(markerAfter.x - markerBefore.x) > 20,
    'Pan moves geographic markers',
  );
  assert.equal(await destination.inputValue(), beforeDrag, 'Dragging does not select a point');
  await page.getByRole('button', { name: 'Phóng to bản đồ', exact: true }).click();
  await page.getByRole('button', { name: 'Thu nhỏ bản đồ', exact: true }).click();
  await page.getByRole('button', { name: 'Điểm đến', exact: true }).click();
  await canvas.click({ position: { x: box.width * 0.65, y: box.height * 0.5 } });
  assert.match(await destination.inputValue(), /Điểm trên bản đồ/);
  await page.getByRole('button', { name: 'Điểm đi', exact: true }).click();
  await page.getByRole('button', { name: 'Chọn tâm bản đồ làm điểm đi' }).click();
  assert.match(
    await page.getByRole('combobox', { name: 'Điểm đi', exact: true }).inputValue(),
    /Điểm trên bản đồ/,
  );
  assert.deepEqual(errors, [], 'Browser runtime errors');
  console.log(
    'PASS: live Hanoi map, attribution, pan/zoom, map endpoint selection, desktop/mobile journey, details, save/reopen, keyboard search, no overflow or console errors.',
  );
} finally {
  await browser.close();
}
