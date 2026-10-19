// Browser regression check with disposable projects; run: node scripts/verify-dashboard.js
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mockup-dashboard-'));
process.env.MOCKUP_PROJECTS_DIR = tmp;
const { createApp } = await import('../src/server.js');
const server = createApp().listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  await page.goto(base);
  await page.locator('#start-project').click();
  assert.equal(await page.locator('#new-name').evaluate((el) => el === document.activeElement), true);
  await page.locator('#new-name').fill('launch-test');
  await page.locator('#new-project button').click();
  await page.waitForFunction(() => document.querySelector('#p-title').textContent === 'launch-test');
  assert.equal(await page.locator('#project-progress .done').count(), 0);
  assert.equal(await page.locator('.generation-settings').getAttribute('open'), null);
  await page.locator('#project-search').fill('missing');
  assert.equal(await page.locator('#project-list a:visible').count(), 0);
  assert.equal(await page.locator('#search-empty').isVisible(), true);
  await page.locator('#project-search').fill('LAUNCH');
  assert.equal(await page.locator('#project-list a:visible').count(), 1);
  await page.locator('#project-search').fill('');
  for (const [i, tab] of ['inputs', 'plan', 'preview', 'export', 'store'].entries()) {
    await page.locator(`[data-tab="${tab}"]`).click();
    assert.equal(await page.locator(`#tab-${tab}`).isVisible(), true);
    assert.equal(await page.locator(`[data-tab="${tab}"]`).getAttribute('aria-current'), 'step');
    assert.equal(await page.locator('#section-step').textContent(), `Step ${i + 1} of 5`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  await page.locator('[data-tab="inputs"]').click();
  await page.screenshot({ path: '/tmp/dashboard-desktop.png', fullPage: true });
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${width}px`);
  }
  await page.screenshot({ path: '/tmp/dashboard-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Dashboard verified: create, search, workflow navigation, progress, desktop and mobile layout.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(tmp, { recursive: true, force: true });
}
