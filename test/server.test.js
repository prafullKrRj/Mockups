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
