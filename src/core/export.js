import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { deckEntries } from './build.js';
import { writeJson } from './project.js';

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

// Runs inside the page. Returns guardrail findings for one slide (see skills/guardrails.md).
function inspectPage({ kind, expected }) {
  const errors = [];
  const warnings = [];
  const [cw, ch] = (document.documentElement.dataset.canvas || '').split('x').map(Number);
  if (cw !== expected.w || ch !== expected.h) errors.push(`data-canvas is "${document.documentElement.dataset.canvas}", expected ${expected.w}x${expected.h}`);
  const margin = kind === 'feature' ? { x: 64, y: 48 } : { x: 72, y: 72 };
  const minFont = kind === 'feature' ? 18 : 28;

  const shots = [...document.querySelectorAll('img')].filter((i) => i.getAttribute('src')?.includes('input/screenshots/'));
  if (!shots.length && !document.querySelector('[style*="input/screenshots/"]')) errors.push('no screenshot from input/screenshots/ is shown');
  for (const img of document.images) if (!img.naturalWidth) errors.push(`image failed to load: ${img.getAttribute('src')}`);

  const headline = document.querySelector('[data-role="headline"]');
  if (!headline) errors.push('missing data-role="headline"');
  const screens = [...document.querySelectorAll('[data-role="device"] img, [data-role="screenshot"]')].map((e) => e.getBoundingClientRect());

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!n.textContent.trim() || seen.has(el) || el.closest('script,style,title')) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    const label = n.textContent.trim().slice(0, 30);
    const fs = parseFloat(cs.fontSize);
    if (fs < minFont) errors.push(`text "${label}" is ${fs}px (< ${minFont}px)`);
    const r = el.getBoundingClientRect();
    if (r.left < margin.x - 1 || r.top < margin.y - 1 || r.right > cw - margin.x + 1 || r.bottom > ch - margin.y + 1) {
      errors.push(`text "${label}" leaves the safe area (${r.left | 0},${r.top | 0} → ${r.right | 0},${r.bottom | 0})`);
    }
    const slack = fs * (0.15 + Math.max(0, 1.2 - (parseFloat(cs.lineHeight) || fs * 1.2) / fs));
    if (el.scrollHeight > el.clientHeight + Math.max(2, slack) && cs.overflow !== 'visible') errors.push(`text "${label}" is clipped (overflow)`);
  }
  if (headline) {
    const hr = headline.getBoundingClientRect();
    for (const s of screens) {
      const ix = Math.max(0, Math.min(hr.right, s.right) - Math.max(hr.left, s.left));
      const iy = Math.max(0, Math.min(hr.bottom, s.bottom) - Math.max(hr.top, s.top));
      if (ix * iy > 0.04 * hr.width * hr.height) warnings.push('headline overlaps a device screen');
    }
    const hs = parseFloat(getComputedStyle(headline).fontSize);
    if (kind === 'phone' && hs < (headline.textContent.length > 30 ? 72 : 84)) warnings.push(`headline shrank to ${hs}px to fit; shorten the copy`);
  }
  return { errors, warnings };
}

/**
 * Render every built slide with Chromium, run guardrail QA, and write Play-ready PNGs (24-bit, no alpha).
 * `scale` 1 → 1080×1920; 1.5 → 1620×2880. The feature graphic is always exactly 1024×500.
 */
export async function exportProject(project, { scale = 1, only = null, log = () => {} } = {}) {
  const { plan, paths } = project;
  const entries = deckEntries(plan).filter((e) => !only || only.includes(e.id));
  const browser = await chromium.launch();
  const qa = { generatedAt: new Date().toISOString(), slides: {} };
  const results = [];
  try {
    await fs.mkdir(path.join(paths.export, 'phone'), { recursive: true });
    await fs.mkdir(path.join(paths.export, 'feature'), { recursive: true });
    if (!only) {
      for (const sub of ['phone', 'feature']) {
        for (const f of await fs.readdir(path.join(paths.export, sub))) await fs.rm(path.join(paths.export, sub, f));
      }
    }
    for (const e of entries) {
      const canvas = e.kind === 'feature' ? { w: 1024, h: 500 } : { w: 1080, h: 1920 };
      const s = e.kind === 'feature' ? 1 : scale;
      const page = await browser.newPage({ viewport: { width: canvas.w, height: canvas.h }, deviceScaleFactor: s });
      const blocked = [];
      await page.route('**/*', (route) => {
        const u = new URL(route.request().url());
        if (u.protocol === 'file:' || u.protocol === 'data:' || ALLOWED_HOSTS.has(u.hostname)) return route.continue();
        blocked.push(u.href);
        return route.abort();
      });
      const file = path.join(paths.build, e.file);
      await page.goto(pathToFileURL(file).href, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 8000 }).catch(() => {});
      await page.evaluate(() => document.fonts.ready);
      const report = await page.evaluate(inspectPage, { kind: e.kind, expected: canvas });
      for (const b of blocked) report.errors.push(`blocked external request: ${b}`);

      const raw = await page.screenshot({ clip: { x: 0, y: 0, width: canvas.w, height: canvas.h }, type: 'png' });
      await page.close();
      const order = String(e.index + 1).padStart(2, '0');
      const name = e.kind === 'feature' ? 'feature-graphic.png' : `${order}-${e.id}.png`;
      const out = path.join(paths.export, e.kind, name);
      let buf = await sharp(raw).flatten({ background: '#ffffff' }).removeAlpha().png({ compressionLevel: 9 }).toBuffer();
      if (buf.length > MAX_BYTES) {
        buf = await sharp(raw).flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toBuffer();
        report.warnings.push('PNG exceeded 8 MB; exported as JPEG');
      }
      const finalOut = buf[0] === 0xff ? out.replace(/\.png$/, '.jpg') : out;
      await fs.writeFile(finalOut, buf);
      qa.slides[e.id] = report;
      results.push({ id: e.id, kind: e.kind, file: path.relative(paths.dir, finalOut), ...report });
      log(`${report.errors.length ? '✗' : '✓'} ${e.id}${report.errors.length ? ` — ${report.errors.length} error(s)` : ''}${report.warnings.length ? ` · ${report.warnings.length} warning(s)` : ''}`);
    }
  } finally {
    await browser.close();
  }
  if (only) {
    const prev = JSON.parse(await fs.readFile(path.join(paths.runs, 'qa.json'), 'utf8').catch(() => '{"slides":{}}'));
    qa.slides = { ...prev.slides, ...qa.slides };
  }
  await writeJson(path.join(paths.runs, 'qa.json'), qa);
  await contactSheet(paths);
  return { results, qa };
}

/** One image of the whole phone deck — cheaper for review agents than N full-size PNGs. */
export async function contactSheet(paths) {
  const dir = path.join(paths.export, 'phone');
  const files = (await fs.readdir(dir)).filter((f) => /\.(png|jpg)$/.test(f)).sort();
  if (!files.length) return null;
  const [w, h, gap] = [360, 640, 24];
  const tiles = await Promise.all(files.map((f) => sharp(path.join(dir, f)).resize(w, h).toBuffer()));
  const out = path.join(paths.runs, 'contact-sheet.png');
  await sharp({ create: { width: files.length * (w + gap) + gap, height: h + gap * 2, channels: 3, background: '#1b1c20' } })
    .composite(tiles.map((input, i) => ({ input, left: gap + i * (w + gap), top: gap })))
    .png().toFile(out);
  return out;
}
