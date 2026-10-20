import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mockup-api-'));
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
const shot = (name) => sharp({ create: { width: 108, height: 240, channels: 3, background: '#ffffff' } }).png().toFile(path.join(tmp, name, 'input/screenshots/home.png'));

test('GET /api describes every route; unknown API paths are JSON 404s', async () => {
  const { data } = await call('GET', '/api');
  const routes = data.routes.map((r) => `${r.method} ${r.path}`);
  for (const r of ['GET /api/apps', 'GET /api/apps/:id/compare', 'GET /api/projects/:name/plans', 'POST /api/projects/:name/run', 'GET /api/runs/:id']) assert.ok(routes.includes(r), r);
  assert.ok(data.routes.every((r) => r.doc.length > 10));
  assert.equal((await call('GET', '/api/nope')).status, 404);
});

test('apps group listing variants; projects can move between apps', async () => {
  assert.equal((await call('POST', '/api/projects', { name: 'calm-a', app: { name: 'Calm' }, appId: 'calm', label: 'sage' })).status, 201);
  assert.equal((await call('POST', '/api/projects/calm-a/duplicate', { to: 'calm-b', label: 'night' })).status, 201);
  await call('POST', '/api/projects', { name: 'other', app: { name: 'Other' } });
  const apps = (await call('GET', '/api/apps')).data;
  assert.deepEqual(apps.map((a) => [a.id, a.projects]), [['calm', 2], ['other', 1]]);
  const calm = (await call('GET', '/api/apps/calm')).data;
  assert.deepEqual(calm.projects.map((p) => [p.name, p.label]), [['calm-a', 'sage'], ['calm-b', 'night']]);
  assert.equal((await call('PATCH', '/api/projects/other', { appId: 'calm' })).data.appId, 'calm');
  assert.equal((await call('GET', '/api/projects?app=calm')).data.length, 3);
  assert.equal((await call('DELETE', '/api/apps/calm')).status, 409);
  assert.equal((await call('DELETE', '/api/apps/other')).status, 204);
  assert.equal((await call('POST', '/api/apps', { id: 'Bad Id', name: 'x' })).status, 400);
  assert.equal((await call('PUT', '/api/apps/calm', { category: 'health' })).data.category, 'health');
});

test('plan versions: save, list, read, restore, clear', async () => {
  await shot('calm-a');
  const first = await call('POST', '/api/projects/calm-a/plan/heuristic');
  assert.equal(first.status, 200);
  const plan = (await call('GET', '/api/projects/calm-a/plan')).data;
  assert.equal((await call('POST', '/api/projects/calm-a/plan/validate', { nope: 1 })).data.ok, false);
  const edited = { ...plan, theme: { ...plan.theme, preset: 'fog-lilac' } };
  assert.equal((await call('PUT', '/api/projects/calm-a/plan', edited)).status, 200);
  const versions = (await call('GET', '/api/projects/calm-a/plans')).data;
  assert.deepEqual(versions.map((v) => [v.version, v.source, v.current]), [[2, 'api:edit', true], [1, 'api:heuristic', false]]);
  assert.deepEqual((await call('GET', '/api/projects/calm-a/plans/1')).data.plan, plan);
  assert.equal((await call('POST', '/api/projects/calm-a/plans/1/restore')).status, 200);
  assert.equal((await call('GET', '/api/projects/calm-a/plan')).data.theme.preset, plan.theme.preset);
  assert.equal((await call('GET', '/api/projects/calm-a/plans')).data[0].source, 'api:restore:v1');
  assert.equal((await call('GET', '/api/projects/calm-a/plans/99')).status, 404);
  assert.equal((await call('POST', '/api/projects/calm-a/build')).status, 200);
  assert.equal((await call('DELETE', '/api/projects/calm-b/plan')).data.plan, null);
});

test('jobs are recorded as runs with their log; compare and group-by report variants', async () => {
  const { data: { id } } = await call('POST', '/api/projects/calm-a/run', { steps: ['plan'], planner: 'heuristic' });
  for (let i = 0; i < 50 && (await call('GET', `/api/runs/${id}`)).data.status === 'running'; i++) await new Promise((r) => setTimeout(r, 50));
  const run = (await call('GET', `/api/runs/${id}`)).data;
  assert.deepEqual([run.status, run.kind, run.project, run.appId], ['done', 'pipeline', 'calm-a', 'calm']);
  assert.ok(run.events.some((e) => e.level === 'stage'));
  assert.equal((await call('GET', '/api/runs?app=calm')).data[0].id, id);

  const cmp = (await call('GET', '/api/apps/calm/compare?projects=calm-a,calm-b')).data;
  assert.deepEqual(cmp.projects.map((p) => [p.name, Boolean(p.plan)]), [['calm-a', true], ['calm-b', false]]);
  assert.ok(cmp.projects[0].plan.headlines.length > 0);
  assert.equal((await call('GET', '/api/apps/calm/compare?projects=missing')).status, 400);
  const groups = (await call('GET', '/api/stats/group?by=app')).data;
  assert.equal(groups.find((g) => g.key === 'calm').projects, 3);
  assert.equal((await call('GET', '/api/stats/group?by=bogus')).status, 400);
  assert.ok((await call('GET', '/api/projects/calm-a/qa')).data.history);

  assert.equal((await call('DELETE', '/api/projects/calm-b')).status, 204);
  assert.equal((await call('GET', '/api/projects/calm-b')).status, 404);
  await assert.rejects(fs.access(path.join(tmp, 'calm-b')));
});
