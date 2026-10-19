import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mockup-studio-'));
process.env.MOCKUP_PROJECTS_DIR = tmp;
const { createApp } = await import('../src/server.js');

let server;
let base;
before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  await fs.rm(tmp, { recursive: true, force: true });
});

const call = async (method, url, body) => {
  const res = await fetch(base + url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body && JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
};

test('create, read, duplicate and list projects', async () => {
  assert.equal((await call('POST', '/api/projects', { name: 'alpha' })).status, 201);
  const got = await call('GET', '/api/projects/alpha');
  assert.equal(got.data.app.name, 'alpha');
  assert.equal((await call('POST', '/api/projects/alpha/duplicate', { to: 'beta' })).status, 201);
  const list = await call('GET', '/api/projects');
  assert.deepEqual(list.data.map((p) => p.name), ['alpha', 'beta']);
});

test('rejects bad names, duplicates and path traversal', async () => {
  assert.equal((await call('POST', '/api/projects', { name: '../evil' })).status, 400);
  assert.equal((await call('POST', '/api/projects', { name: 'alpha' })).status, 409);
  assert.equal((await call('DELETE', '/api/projects/alpha/files/screenshots/..%2Fapp.json')).status, 400);
  assert.equal((await call('GET', '/api/projects/missing')).status, 404);
});

test('heuristic plan needs screenshots; invalid plans are refused with details', async () => {
  assert.equal((await call('POST', '/api/projects/alpha/plan/heuristic')).status, 422);
  const bad = await call('PUT', '/api/projects/alpha/plan', { version: 1 });
  assert.equal(bad.status, 422);
  assert.ok(bad.data.details.errors.length > 0);
});

test('meta lists agents and presets', async () => {
  const { data } = await call('GET', '/api/meta');
  assert.ok(data.presets.includes('sage-mist'));
  assert.ok(data.agents.some((a) => a.id === 'claude'));
});

test('locale configuration rejects unsafe paths before saving', async () => {
  const result = await call('PUT', '/api/projects/alpha/app', { name: 'alpha', locales: ['../../outside'] });
  assert.equal(result.status, 422);
  assert.equal((await call('GET', '/api/projects/alpha')).data.app.locales, undefined);
});

test('localized plans expose separate deck entries and select HTML by locale', async () => {
  const sharp = (await import('sharp')).default;
  const { heuristicPlan } = await import('../src/core/plan.js');
  const { loadProject } = await import('../src/core/project.js');
  await call('POST', '/api/projects', { name: 'local', app: { name: 'Local', locales: ['en-US', 'hi-IN'] } });
  await sharp({ create: { width: 108, height: 240, channels: 3, background: '#ffffff' } }).png().toFile(path.join(tmp, 'local/input/screenshots/a.png'));
  const project = await loadProject('local');
  const plan = heuristicPlan(project);
  plan.slides[0].headline = { 'en-US': 'Your money', 'hi-IN': 'आपका पैसा' };
  const saved = await call('PUT', '/api/projects/local/plan', plan);
  assert.equal(saved.status, 200);
  assert.equal(saved.data.deck.length, (plan.slides.length + 1) * 2);
  assert.deepEqual(Object.keys(saved.data.exportsByLocale), ['en-US', 'hi-IN']);
  const url = `${base}/api/projects/local/slides/${plan.slides[0].id}/html`;
  const html = await fetch(`${url}?locale=hi-IN`);
  assert.equal(html.status, 200);
  assert.match(await html.text(), /आपका पैसा/);
  assert.equal((await fetch(`${url}?locale=missing`)).status, 404);
  const edited = await fetch(`${url}?locale=hi-IN`, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: '<h1>Hindi custom</h1>' });
  assert.equal(edited.status, 200);
  assert.match(await (await fetch(`${url}?locale=en-US`)).text(), /Your money/);
  assert.equal(await (await fetch(`${url}?locale=hi-IN`)).text(), '<h1>Hindi custom</h1>');
  await fetch(`${url}?locale=en-US`, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: '<h1>English custom</h1>' });
  assert.equal((await call('POST', `/api/projects/local/slides/${plan.slides[0].id}/reset?locale=hi-IN`)).status, 200);
  assert.equal(await (await fetch(`${url}?locale=en-US`)).text(), '<h1>English custom</h1>');
  assert.match(await (await fetch(`${url}?locale=hi-IN`)).text(), /आपका पैसा/);

});

test('theme preview and saved selections share validation and survive reload', async () => {
  const selection = { mode: 'material', primary: '#386A20', secondary: '#795548', tertiary: '#006D77', appearance: 'dark' };
  const preview = await call('POST', '/api/themes/resolve', selection);
  assert.equal(preview.status, 200);
  assert.match(preview.data.colors.accent, /^#[0-9A-F]{6}$/);
  assert.equal((await call('POST', '/api/themes/resolve', { mode: 'auto' })).status, 422);
  assert.equal((await call('POST', '/api/themes/resolve', { ...selection, primary: 'invalid' })).status, 422);
  assert.equal((await call('PUT', '/api/projects/alpha/app', { name: 'Alpha', themeSelection: selection })).status, 200);
  assert.deepEqual((await call('GET', '/api/projects/alpha')).data.app.themeSelection, selection);
  assert.equal((await call('PUT', '/api/projects/alpha/app', { themeSelection: { mode: 'preset', preset: 'missing' } })).status, 422);
  assert.deepEqual((await call('GET', '/api/projects/alpha')).data.app.themeSelection, selection);
});
