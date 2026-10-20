import test from 'node:test';
import assert from 'node:assert/strict';
import { projectLocales, localizePlan, localeTypography } from '../src/core/locales.js';
import { heuristicPlan, validatePlan } from '../src/core/plan.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildProject, deckEntries } from '../src/core/build.js';
import { translateProject } from '../src/core/translate.js';

const project = {
  app: { name: 'Budget', category: 'finance', screens: {}, locales: ['en-US', 'hi-IN'] },
  screenshots: [{ file: 'a.png', width: 1080, height: 2400 }],
};
const localized = () => {
  const plan = heuristicPlan(project);
  plan.slides[0].headline = { 'en-US': 'Your money', 'hi-IN': 'आपका पैसा' };
  plan.slides[0].highlight = { 'en-US': 'money', 'hi-IN': 'पैसा' };
  plan.slides[0].badges = [{ 'en-US': 'Offline', 'hi-IN': 'ऑफ़लाइन' }];
  return plan;
};

test('localized copy resolves without mutating source; strings remain shared', () => {
  const plan = localized();
  const hi = localizePlan(plan, 'hi-IN');
  assert.equal(validatePlan(plan, project).ok, true);
  assert.equal(hi.slides[0].headline, 'आपका पैसा');
  assert.deepEqual(hi.slides[0].badges, ['ऑफ़लाइन']);
  assert.equal(hi.slides[1].headline, plan.slides[1].headline);
  assert.equal(plan.slides[0].headline['en-US'], 'Your money');
});

test('every locale gets length, policy and highlight validation', () => {
  const plan = localized();
  plan.slides[0].headline['hi-IN'] = 'Install now';
  const result = validatePlan(plan, project);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('[hi-IN]') && e.includes('highlight')));
  assert.ok(result.errors.some((e) => e.includes('[hi-IN]') && e.includes('policy')));
  plan.slides[0].headline['hi-IN'] = 'क'.repeat(45);
  assert.equal(validatePlan(plan, project).ok, false);
});

test('missing translations and unsafe or duplicate locales fail closed', () => {
  const plan = localized();
  delete plan.slides[0].headline['hi-IN'];
  assert.ok(validatePlan(plan, project).errors.some((e) => e.includes('missing locale hi-IN')));
  for (const locales of [[], ['../hi'], ['en-US', 'en-US'], ['en-US', 'en-us'], 'hi-IN']) {
    assert.throws(() => projectLocales({ locales }), /locale/);
    assert.equal(validatePlan(localized(), { ...project, app: { ...project.app, locales } }).ok, false);
  }
  assert.deepEqual(projectLocales({ locale: 'es-ES' }), ['es-ES']);
});

test('font and direction follow script, including explicit script overrides', () => {
  assert.deepEqual(localeTypography('hi-IN'), { font: 'Noto Sans Devanagari', dir: 'ltr' });
  assert.equal(localeTypography('ar-EG').dir, 'rtl');
  assert.equal(localeTypography('pa-Arab').dir, 'rtl');
  assert.equal(localeTypography('zh-TW').font, 'Noto Sans TC');
  assert.equal(localeTypography('ja-JP').font, 'Noto Sans JP');
});

test('font families remain strings', () => {
  const plan = localized();
  plan.theme.fonts = { headline: { 'en-US': 'Inter' } };
  assert.equal(validatePlan(plan, project).ok, false);
});

test('build separates locale files and templates while keeping v1 file paths', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mockup-locales-'));
  try {
    const p = { ...project, plan: localized(), paths: { build: dir }, hasIcon: false };
    const { entries } = await buildProject(p);
    assert.equal(entries.length, (p.plan.slides.length + 1) * 2);
    assert.equal(new Set(entries.map((e) => e.key)).size, entries.length);
    const hi = entries.find((e) => e.locale === 'hi-IN');
    const html = await fs.readFile(path.join(dir, hi.file), 'utf8');
    assert.match(html, /lang="hi-IN" dir="ltr"/);
    assert.match(html, /Noto\+Sans\+Devanagari/);
    assert.match(html, /आपका/);
    assert.doesNotMatch(html, /Your money/);
    await fs.access(path.join(dir, hi.templateFile));
    const legacy = deckEntries(p.plan)[0];
    assert.equal(legacy.file, `${p.plan.slides[0].id}.html`);
    p.plan.slides[0].mode = 'custom';
    await fs.writeFile(path.join(dir, hi.file), 'custom Hindi');
    await buildProject(p);
    assert.equal(await fs.readFile(path.join(dir, hi.file), 'utf8'), 'custom Hindi');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('translation preserves source and rejects invalid copy or structural changes with rollback', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mockup-translate-'));
  const plan = heuristicPlan(project);
  const p = { ...project, plan, paths: { dir, plan: path.join(dir, 'plan.json') } };
  const translated = structuredClone(plan);
  for (const slide of [...translated.slides, translated.featureGraphic]) {
    for (const key of ['headline', 'highlight', 'subline', 'eyebrow', 'callouts', 'badges']) {
      const map = (value) => ({ 'en-US': value, 'hi-IN': value });
      if (slide[key] != null) slide[key] = Array.isArray(slide[key]) ? slide[key].map(map) : map(slide[key]);
    }
  }
  const run = async (candidate, code = 0) => {
    await fs.writeFile(p.paths.plan, JSON.stringify(candidate));
    return { code };
  };
  try {
    assert.deepEqual(await translateProject(p, { agentId: 'test', run: () => run(translated) }), translated);
    const invalid = structuredClone(translated);
    invalid.slides[0].headline['hi-IN'] = 'Install now';
    const changed = structuredClone(translated);
    changed.theme.preset = 'sand-dune';
    const source = structuredClone(translated);
    source.slides[0].headline['en-US'] = 'Changed source';
    for (const candidate of [invalid, changed, source, plan, null]) {
      await assert.rejects(translateProject(p, { agentId: 'test', run: () => run(candidate) }), /previous plan kept/);
      await assert.rejects(fs.access(p.paths.plan), 'the scratch plan.json is removed after every attempt');
    }
    await assert.rejects(translateProject(p, { agentId: 'test', run: () => run(translated, 1) }), /exited 1/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
