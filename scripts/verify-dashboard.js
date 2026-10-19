// Browser regression check with disposable projects; run: node scripts/verify-dashboard.js
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

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
  await page.locator('[name="shortDescription"]').fill('A calmer way to plan your day');
  assert.equal(await page.locator('#app-form .field-count').textContent(), '29 / 80');
  await page.locator('#save-app').click();
  await page.waitForFunction(() => document.querySelector('#toast').textContent === 'App info saved');
  const png = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: '#d4e8b8' } }).png().toBuffer();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-kind="screenshots"]').focus();
  await page.keyboard.press('Enter');
  await (await chooser).setFiles({ name: 'home.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('.shot');
  assert.equal(await page.locator('#shot-count').textContent(), '1');
  assert.equal(await page.locator('#project-progress .done').count(), 1);
  await page.locator('[data-tab="plan"]').click();
  await page.locator('#plan-heuristic').click();
  await page.waitForSelector('.slide-card');
  await page.locator('[data-preset="sage-mist"]').click();
  await page.waitForFunction(() => document.querySelector('#toast').textContent === 'Plan saved');
  await page.locator('[data-tab="preview"]').click();
  await page.locator('.preview').first().focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#slide-dialog').open);
  await page.locator('#dlg-code').fill('<html><body><h1>Custom listing</h1></body></html>');
  await page.keyboard.press('Control+s');
  await page.waitForFunction(() => document.querySelector('#toast').textContent === 'Saved — slide is now custom');
  await page.locator('#dlg-reset').click();
  await page.waitForFunction(() => !document.querySelector('#slide-dialog').open);
  await page.locator('[data-tab="export"]').click();
  await page.locator('#export-btn').click();
  await page.waitForFunction(() => document.querySelector('#log-status').textContent === 'done', null, { timeout: 120000 });
  await page.waitForSelector('#exports img');
  const download = page.waitForEvent('download');
  await page.locator('#zip-btn').click();
  assert.match((await download).suggestedFilename(), /\.zip$/);
  assert.equal(await page.locator('#project-progress .done').count(), 4);
  await page.locator('#log-close').click();
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
    for (const tab of ['inputs', 'plan', 'preview', 'export', 'store']) {
      await page.locator(`[data-tab="${tab}"]`).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${width}px in ${tab}`);
    }
  }
  await page.locator('[data-tab="preview"]').click();
  await page.locator('.preview').first().click();
  await page.waitForFunction(() => document.querySelector('#slide-dialog').open);
  assert.equal(await page.locator('#slide-dialog').evaluate((el) => el.scrollWidth <= el.clientWidth), true);
  await page.locator('#dlg-close').click();
  await page.locator('[data-tab="inputs"]').click();
  await page.screenshot({ path: '/tmp/dashboard-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Dashboard verified: create, search, upload, counters, plan, theme, keyboard slide editing, export, ZIP download, progress and responsive layouts.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(tmp, { recursive: true, force: true });
}
