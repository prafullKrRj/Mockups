import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mockup-store-'));
process.env.MOCKUP_PROJECTS_DIR = tmp;
const { createProject, duplicateProject, deleteProject, dumpProject, loadProject, listProjects, restoreProject, savePlan } = await import('../src/core/project.js');
const { listApps, listPlans, getPlanVersion, setProjectMeta, deleteApp } = await import('../src/core/store.js');
const { groupProjects, saveQa, listQa } = await import('../src/core/history.js');
const { DB_PATH } = await import('../src/core/db.js');
after(() => fs.rm(tmp, { recursive: true, force: true }));

test('projects of the same package group under one app; duplicates inherit it', async () => {
  await createProject('ledger-dark', { name: 'Ledger', packageName: 'com.acme.ledger', category: 'finance' });
  await createProject('ledger-light', { name: 'Ledger', packageName: 'com.acme.ledger' }, { label: 'light' });
  await createProject('notes', { name: 'Notes' }, { appId: 'acme-notes' });
  await duplicateProject('ledger-dark', 'ledger-copy', { label: 'copy' });
  assert.equal(DB_PATH, path.join(tmp, 'mockups.sqlite'));
  const apps = Object.fromEntries(listApps().map((a) => [a.id, a]));
  assert.equal(apps['com-acme-ledger'].projects, 3);
  assert.equal(apps['acme-notes'].projects, 1);
  assert.deepEqual((await listProjects({ appId: 'com-acme-ledger' })).map((p) => p.name), ['ledger-copy', 'ledger-dark', 'ledger-light']);
  assert.equal((await loadProject('ledger-light')).label, 'light');
  assert.throws(() => deleteApp('com-acme-ledger'), /still has 3/);
});

test('every plan save is a version; QA reports point at the plan they checked', async () => {
  const plan = { slides: [{ id: 's1' }], theme: { preset: 'sage-mist' }, generatedBy: 'heuristic' };
  assert.equal(savePlan('ledger-dark', plan, 'test').version, 1);
  assert.equal(savePlan('ledger-dark', { ...plan, theme: { preset: 'fog-lilac' } }, 'test').version, 2);
  const versions = listPlans('ledger-dark');
  assert.deepEqual(versions.map((v) => [v.version, v.themePreset, v.current]), [[2, 'fog-lilac', true], [1, 'sage-mist', false]]);
  assert.deepEqual(getPlanVersion('ledger-dark', 1).plan, plan);
  assert.equal((await loadProject('ledger-dark')).plan.theme.preset, 'fog-lilac');
  saveQa('ledger-dark', { slides: { s1: { errors: ['x'], warnings: [] } } });
  assert.deepEqual(listQa('ledger-dark').map((q) => [q.planVersion, q.errors]), [[2, 1]]);
});

test('group by app, theme and generator; moving a project between apps', async () => {
  const byApp = Object.fromEntries(groupProjects('app').map((g) => [g.key, g]));
  assert.equal(byApp['com-acme-ledger'].projects, 3);
  assert.equal(byApp['com-acme-ledger'].qaErrors, 1);
  assert.ok(groupProjects('theme').some((g) => g.key === 'fog-lilac'));
  assert.throws(() => groupProjects('nope'), /group must be one of/);
  setProjectMeta('notes', { appId: 'com-acme-ledger', label: 'moved' });
  assert.equal((await listProjects({ appId: 'com-acme-ledger' })).length, 4);
});

test('legacy JSON projects are imported once and dump/restore round-trips', async () => {
  const dir = path.join(tmp, 'legacy');
  await fs.mkdir(path.join(dir, 'input', 'screenshots'), { recursive: true });
  await fs.writeFile(path.join(dir, 'app.json'), JSON.stringify({ name: 'Legacy', packageName: 'com.old.app' }));
  await fs.writeFile(path.join(dir, 'plan.json'), JSON.stringify({ slides: [], theme: { preset: 'sand-dune' } }));
  const p = await loadProject('legacy');
  assert.equal(p.appId, 'com-old-app');
  assert.equal(p.plan.theme.preset, 'sand-dune');
  assert.equal(listPlans('legacy')[0].source, 'import');
  await assert.rejects(fs.access(path.join(dir, 'app.json')));
  await fs.access(path.join(dir, '.runs', 'imported', 'plan.json'));

  const dump = await dumpProject('legacy');
  await deleteProject('legacy');
  await assert.rejects(loadProject('legacy'), /not found/);
  await fs.mkdir(dir, { recursive: true });
  const back = await restoreProject(dump);
  assert.deepEqual([back.appId, back.plan], [dump.appId, dump.plan]);
});
