import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePlan, heuristicPlan, clip } from '../src/core/plan.js';
import { renderSlide, renderFeatureGraphic } from '../src/templates/render.js';
import { resolveTheme, contrast, PRESETS } from '../src/templates/themes.js';

const project = {
  app: {
    name: 'Test App', category: 'finance', shortDescription: 'Money, finally calm and simple for everyone', slideCount: 4,
    brandColors: [], facts: ['No ads'],
    screens: { 'a.png': { title: 'Home', priority: 5 }, 'b.png': { title: 'Budgets', description: 'Limits per category', priority: 1 } },
  },
  screenshots: [{ file: 'a.png', width: 1080, height: 2400 }, { file: 'b.png', width: 1080, height: 2400 }],
  references: [],
};

test('heuristic plan is valid and puts the highest-priority screen first', () => {
  const plan = heuristicPlan(project);
  const v = validatePlan(plan, project);
  assert.deepEqual(v.errors, []);
  assert.equal(plan.slides[0].screenshots[0], 'a.png');
  assert.equal(plan.slides[0].layout, 'hero');
  assert.equal(plan.theme.preset, 'swiss-paper');
});

test('validator rejects unknown screenshots, bad highlights and policy-breaking copy', () => {
  const plan = heuristicPlan(project);
  plan.slides[0].screenshots = ['missing.png'];
  plan.slides[1].highlight = 'not in headline';
  plan.slides[1].subline = 'Download now and save';
  const { ok, errors } = validatePlan(plan, project);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes('missing.png')));
  assert.ok(errors.some((e) => e.includes('highlight')));
  assert.ok(errors.some((e) => e.includes('policy')));
});

test('validator enforces text contrast', () => {
  const plan = heuristicPlan(project);
  plan.theme.colors = { text: '#EEEEEE', bg: '#FFFFFF', bg2: '#FFFFFF' };
  assert.ok(validatePlan(plan, project).errors.some((e) => e.includes('contrast')));
});

test('validator enforces schema shape', () => {
  const plan = heuristicPlan(project);
  plan.slides[0].layout = 'diagonal';
  plan.extra = true;
  const v = validatePlan(plan, project);
  assert.equal(v.ok, false);
});

test('every preset passes the contrast floor', () => {
  for (const [id, p] of Object.entries(PRESETS)) {
    assert.ok(contrast(p.colors.text, p.colors.bg) >= 4.5, `${id} text/bg`);
    assert.ok(contrast(p.colors.text, p.colors.bg2) >= 4.5, `${id} text/bg2`);
  }
});

test('clip cuts at word boundaries', () => {
  assert.equal(clip('Budgets, bills and spending in one calm place', 44), 'Budgets, bills and spending in one calm');
  assert.equal(clip('short', 44), 'short');
});

test('rendered slides declare their canvas and reference real screenshots', () => {
  const plan = heuristicPlan(project);
  const shots = Object.fromEntries(project.screenshots.map((s) => [s.file, s]));
  const app = { name: 'Test App', iconSrc: null };
  const html = renderSlide({ plan, slide: plan.slides[0], index: 0, shots, app });
  assert.match(html, /data-canvas="1080x1920"/);
  assert.match(html, /\.\.\/input\/screenshots\/a\.png/);
  assert.match(html, /data-role="headline"/);
  assert.match(renderFeatureGraphic({ plan, shots, app }), /data-canvas="1024x500"/);
});

test('theme overrides merge over the preset', () => {
  const t = resolveTheme({ preset: 'midnight-glow', colors: { accent: '#FF0000' } });
  assert.equal(t.colors.accent, '#FF0000');
  assert.equal(t.colors.bg, PRESETS['midnight-glow'].colors.bg);
});
