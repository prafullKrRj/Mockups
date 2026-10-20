import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mockup-themes-'));
process.env.MOCKUP_PROJECTS_DIR = path.join(tmp, 'projects');
process.env.PATH = `${tmp}${path.delimiter}${process.env.PATH}`;
const { createProject, loadProject, saveApp, savePlan, writeJson } = await import('../src/core/project.js');
const { heuristicPlan } = await import('../src/core/plan.js');
const { runPipeline } = await import('../src/core/pipeline.js');
after(() => fs.rm(tmp, { recursive: true, force: true }));

// Exercise the real CLI adapter without a paid AI request.
await fs.writeFile(path.join(tmp, 'claude'), `#!/usr/bin/env node
const fs = require('node:fs');
fs.writeFileSync('.runs/test-prompt.txt', process.argv[3]);
fs.copyFileSync('.runs/candidate.json', 'plan.json');
`, { mode: 0o755 });

test('AI theme selection receives genre and brief, preserves existing copy and layouts', async () => {
  let project = await createProject('theme-test', { name: 'Ledger', category: 'finance',
    themeSelection: { mode: 'auto', brief: 'Premium editorial finance app' } });
  await sharp({ create: { width: 108, height: 240, channels: 3, background: '#FFFFFF' } }).png().toFile(path.join(project.paths.screenshots, 'home.png'));
  project = await loadProject('theme-test');
  const original = heuristicPlan(project);
  original.slides[0].headline = 'Keep this exact copy';
  original.slides[0].layout = 'tilted';
  savePlan('theme-test', original, 'test');
  const candidate = structuredClone(original);
  candidate.slides[0].headline = 'Agent changed the copy';
  candidate.theme = { preset: 'material-slate-dark', referenceNotes: 'Slate suits this premium finance brief.' };
  await fs.mkdir(project.paths.runs, { recursive: true });
  await writeJson(path.join(project.paths.runs, 'candidate.json'), candidate);
  await runPipeline('theme-test', { steps: ['theme'], planner: 'claude', log: () => {} });
  const updated = await loadProject('theme-test');
  assert.deepEqual(updated.plan, { ...original, theme: candidate.theme });
  const prompt = await fs.readFile(path.join(project.paths.runs, 'test-prompt.txt'), 'utf8');
  assert.match(prompt, /Premium editorial finance app/);
  assert.match(prompt, /finance/);
  assert.match(prompt, /material-slate-dark/);

  updated.app.themeSelection = { mode: 'preset', preset: 'material-rose-light' };
  await saveApp('theme-test', updated.app);
  await runPipeline('theme-test', { steps: ['plan'], planner: 'claude', log: () => {} });
  const locked = await loadProject('theme-test');
  assert.deepEqual(locked.plan.theme, { preset: 'material-rose-light' });
  assert.match(await fs.readFile(path.join(project.paths.runs, 'test-prompt.txt'), 'utf8'), /User locked this theme/);
  await assert.rejects(runPipeline('theme-test', { steps: ['theme'], planner: 'missing-agent', log: () => {} }), /Unknown agent/);
  assert.deepEqual((await loadProject('theme-test')).plan, locked.plan, 'Failed theme selection must restore the existing plan');
});
