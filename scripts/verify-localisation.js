// Run after npm run demo. Exercises dashboard against a disposable copy of demo.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'projects/demo');
const artifacts = path.join(source, '.runs/localisation-review');
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mockup-ui-'));
process.env.MOCKUP_PROJECTS_DIR = tmp;
let browser;
let server;
try {
  await fs.mkdir(path.join(tmp, 'demo'));
  for (const file of ['input', 'build', 'export']) {
    await fs.cp(path.join(source, file), path.join(tmp, 'demo', file), { recursive: true });
  }
  // The demo's app info, plan and QA live in the main database; copy them into the disposable one.
  const dump = JSON.parse(execFileSync(process.execPath, [path.join(root, 'src/cli.js'), 'dump', 'demo'], { encoding: 'utf8', env: { ...process.env, MOCKUP_PROJECTS_DIR: '' } }));
  const { restoreProject, savePlan } = await import('../src/core/project.js');
  await restoreProject(dump);
  await fs.mkdir(artifacts, { recursive: true });
  const { createApp } = await import('../src/server.js');
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
  const errors = [];
  for (const width of [1440, 430]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto(`${base}/#demo`);
    await page.locator('#p-title').waitFor();
    // The locale picker lives in the collapsed Generation settings panel.
    await page.evaluate(() => { document.querySelector('.generation-settings').open = true; });
    await page.locator('#locale').waitFor();
    await page.waitForFunction(() => document.querySelector('#locale').options.length === 2);
    await page.click('[data-tab="plan"]');
    await page.selectOption('#locale', 'hi-IN');
    const headline = page.locator('.slide-card [name="headline"]').first();
    assert.equal(await headline.inputValue(), 'पैसे का हिसाब आसान');
    await headline.fill('अपने पैसे समझें');
    await page.selectOption('#locale', 'en-US');
    assert.equal(await headline.inputValue(), 'Home');
    await page.selectOption('#locale', 'hi-IN');
    assert.equal(await headline.inputValue(), 'अपने पैसे समझें');
    const badges = page.locator('.slide-card [name="badges"]').last();
    await badges.fill('');
    await page.selectOption('#locale', 'en-US');
    assert.equal(await badges.inputValue(), 'Works offline, No ads, No sign-up');
    await page.selectOption('#locale', 'hi-IN');
    assert.equal(await badges.inputValue(), '');
    const save = page.waitForResponse((r) => r.url().endsWith('/plan') && r.request().method() === 'PUT');
    await page.click('#save-plan');
    assert.equal((await save).status(), 200);
    await page.waitForFunction(() => document.querySelector('#plan-status').textContent.startsWith('Saved'));
    await page.click('[data-tab="preview"]');
    assert.equal(await page.locator('#previews .preview').count(), 6);
    assert.ok((await page.locator('#previews iframe').first().getAttribute('src')).includes('hi-IN--'));
    for (const iframe of await page.locator('#previews iframe').all()) {
      await iframe.scrollIntoViewIfNeeded();
      await iframe.contentFrame().locator('html[data-ready="1"]').waitFor();
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Preview overflow at ${width}`);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(artifacts, `dashboard-${width}.png`), fullPage: true });
    const slide = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    await slide.goto(`${base}/files/demo/build/hi-IN--s1-home.html`);
    await slide.evaluate(() => document.fonts.ready);
    const cdp = await slide.context().newCDPSession(slide);
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root: dom } = await cdp.send('DOM.getDocument');
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: dom.nodeId, selector: 'h1' });
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    assert.ok(fonts.some((font) => font.isCustomFont && /Devanagari/.test(font.familyName) && font.glyphCount > 0), JSON.stringify(fonts));
    await slide.screenshot({ path: path.join(artifacts, `hindi-${width}.png`) });
    await slide.close();
    await page.locator('#previews .preview').first().click();
    await page.locator('#slide-dialog').waitFor({ state: 'visible' });
    assert.ok((await page.locator('#dlg-code').inputValue()).includes('अपने पैसे समझें'));
    await page.click('#dlg-close');
    await page.click('[data-tab="export"]');
    assert.ok((await page.locator('#exports img').first().getAttribute('src')).includes('/hi-IN/'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Export overflow at ${width}`);
    await page.click('[data-tab="store"]');
    assert.ok((await page.locator('#play .carousel img').first().getAttribute('src')).includes('/hi-IN/'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal overflow at ${width}`);
    await page.close();
    // Reset disposable project before testing next viewport.
    savePlan('demo', dump.plan, 'verify:reset');
  }
  const zip = await fetch(`${base}/api/projects/demo/download.zip`);
  assert.equal(zip.status, 200);
  await fs.writeFile(path.join(artifacts, 'demo.zip'), Buffer.from(await zip.arrayBuffer()));
  const { loadProject, saveApp } = await import('../src/core/project.js');
  const { exportProject } = await import('../src/core/export.js');
  const { buildProject } = await import('../src/core/build.js');
  const demo = await loadProject('demo');
  await fs.mkdir(path.join(demo.paths.export, 'phone'), { recursive: true });
  await fs.writeFile(path.join(demo.paths.export, 'phone/stale.png'), 'stale legacy export');
  await saveApp('demo', { ...demo.app, locales: ['en-US'] });
  const one = await exportProject(await loadProject('demo'));
  assert.equal(one.results.length, 6);
  assert.ok(one.results.every((r) => r.locale === 'en-US' && !r.errors.length));
  assert.deepEqual(await fs.readdir(demo.paths.export), ['en-US']);
  const { locales: ignored, ...legacy } = demo.app;
  await saveApp('demo', legacy);
  const v1 = await loadProject('demo');
  await buildProject(v1);
  const old = await exportProject(v1);
  assert.equal(old.results.length, 6);
  assert.ok(old.results.every((r) => !r.errors.length));
  assert.deepEqual((await fs.readdir(demo.paths.export)).sort(), ['feature', 'phone']);
  assert.deepEqual(errors, []);
  console.log(`Localisation UI passed at 1440px and 430px; Hindi web font verified. Artifacts: ${artifacts}`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server ? server.close(resolve) : resolve());
  await fs.rm(tmp, { recursive: true, force: true });
}
