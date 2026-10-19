// Screenshots of the running dashboard (npm start) for the README and for a listing deck of Mockup Studio itself.
// usage: node scripts/capture-dashboard.js <project-to-show> [--phone-out <dir>] [--port 4280]
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { ROOT } from '../src/core/paths.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { 'phone-out': { type: 'string' }, port: { type: 'string', default: '4280' } },
});
const project = positionals[0] ?? 'demo';
const base = `http://localhost:${values.port}/#${encodeURIComponent(project)}`;
const desktopOut = path.join(ROOT, 'samples', 'dashboard');
await fs.mkdir(desktopOut, { recursive: true });

// Each view: how to reach it, plus a name. Order is the story a new user follows.
const views = [
  ['01-inputs', async (pg) => pg.click('[data-tab=inputs]')],
  ['02-theme-gallery', async (pg) => pg.click('[data-tab=plan]')],
  ['03-slide-editor', async (pg) => { await pg.click('[data-tab=plan]'); await pg.locator('.slide-card').first().scrollIntoViewIfNeeded(); }],
  ['04-previews', async (pg) => pg.click('[data-tab=preview]')],
  ['05-html-editor', async (pg) => { await pg.click('[data-tab=preview]'); await pg.click('.preview'); }],
  ['06-export', async (pg) => pg.click('[data-tab=export]')],
  ['07-store-preview', async (pg) => pg.click('[data-tab=store]')],
  ['08-generate-log', async (pg) => {
    await pg.click('[data-tab=export]');
    await pg.click('#export-btn');
    await pg.waitForFunction(() => document.querySelector('#log-status').textContent === 'done', null, { timeout: 120000 });
  }],
];

async function shoot(viewport, scale, outDir, suffix = '') {
  const browser = await chromium.launch();
  for (const [name, go] of views) {
    const pg = await browser.newPage({ viewport, deviceScaleFactor: scale });
    await pg.goto(base);
    await pg.waitForSelector('.shot');
    await go(pg);
    // On phones the sidebar and run bar stack above the content; start each shot at the tabs instead.
    if (viewport.width < 760) await pg.evaluate(() => document.querySelector('#tabs').scrollIntoView());
    await pg.waitForTimeout(1500); // iframes and fonts settle
    await pg.screenshot({ path: path.join(outDir, `${name}${suffix}.png`) });
    await pg.close();
    console.log(`${path.relative(ROOT, outDir)}/${name}${suffix}.png`);
  }
  await browser.close();
}

await shoot({ width: 1440, height: 900 }, 1, desktopOut);
if (values['phone-out']) {
  await fs.mkdir(values['phone-out'], { recursive: true });
  // 432 × 960 at 2.5× → 1080 × 2400, a typical Android capture.
  await shoot({ width: 432, height: 960 }, 2.5, values['phone-out']);
}
