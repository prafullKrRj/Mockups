import test from 'node:test';
import assert from 'node:assert/strict';
import { projectLocales, localizePlan, localeTypography } from '../src/core/locales.js';
import { heuristicPlan, validatePlan } from '../src/core/plan.js';

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
