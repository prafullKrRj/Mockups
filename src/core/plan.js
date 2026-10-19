import fs from 'node:fs/promises';
import path from 'node:path';
import Ajv from 'ajv';
import sharp from 'sharp';
import { projectLocales, copyFields, localizePlan } from './locales.js';
import { SCHEMAS_DIR } from './paths.js';
import { PRESETS, presetForCategory, resolveTheme, contrast } from '../templates/themes.js';

const schema = JSON.parse(await fs.readFile(path.join(SCHEMAS_DIR, 'plan.schema.json'), 'utf8'));
const validateSchema = new Ajv({ allErrors: true, strict: false }).compile(schema);

/** Schema + semantic checks. Errors block rendering; warnings are surfaced to agents and the dashboard. */
export function validatePlan(plan, project, { resolved = false } = {}) {
  const errors = [];
  const warnings = [];
  if (!validateSchema(plan)) {
    for (const e of validateSchema.errors) errors.push(`${e.instancePath || '/'} ${e.message}${e.params?.allowedValues ? ` (${e.params.allowedValues.join(', ')})` : ''}`);
    return { ok: false, errors, warnings };
  }
  if (!resolved) {
    let locales;
    try { locales = projectLocales(project.app); } catch (e) { return { ok: false, errors: [e.message], warnings }; }
    const fields = copyFields(plan);
    const maps = fields.filter(({ value }) => typeof value === 'object');
    for (const { path, value } of maps) {
      for (const locale of locales) if (!(locale in value)) errors.push(`${path}: missing locale ${locale}`);
    }
    for (const locale of new Set([...locales, ...maps.flatMap(({ value }) => Object.keys(value))])) {
      const result = validatePlan(localizePlan(plan, locale), project, { resolved: true });
      errors.push(...result.errors.map((e) => `[${locale}] ${e}`));
      warnings.push(...result.warnings.map((e) => `[${locale}] ${e}`));
    }
    return { ok: errors.length === 0, errors, warnings };
  }
  const files = new Set(project.screenshots.map((s) => s.file));
  const ids = new Set();
  plan.slides.forEach((s, i) => {
    if (ids.has(s.id)) errors.push(`slides[${i}].id "${s.id}" is duplicated`);
    ids.add(s.id);
    for (const f of s.screenshots) if (!files.has(f)) errors.push(`slides[${i}] uses "${f}" which is not in input/screenshots/`);
    if (s.highlight && !s.headline.toLowerCase().includes(s.highlight.toLowerCase())) errors.push(`slides[${i}].highlight "${s.highlight}" is not part of the headline`);
    if (s.headline.length > 32) warnings.push(`slides[${i}] headline is ${s.headline.length} chars; ≤ 32 reads best at thumbnail size`);
    if (s.layout === 'zoom' && !s.focus) warnings.push(`slides[${i}] layout "zoom" without focus falls back to device-bottom`);
    if (s.layout === 'callouts' && !s.callouts?.length) warnings.push(`slides[${i}] layout "callouts" without callouts falls back to device-bottom`);
    if (s.layout === 'two-devices' && s.screenshots.length < 2) warnings.push(`slides[${i}] layout "two-devices" needs 2 screenshots; falls back to device-bottom`);
    if (/\b(download|install) (now|today)\b|#1\b|\bbest app\b/i.test(`${s.headline} ${s.subline ?? ''}`)) errors.push(`slides[${i}] copy breaks Play metadata policy (CTA or ranking claim)`);
  });
  for (let i = 2; i < plan.slides.length; i++) {
    if (plan.slides[i].layout === plan.slides[i - 1].layout && plan.slides[i].layout === plan.slides[i - 2].layout) {
      warnings.push(`slides ${i - 1}–${i + 1} repeat layout "${plan.slides[i].layout}" three times in a row`);
    }
  }
  // Generated-design tells (skills/visual-craft.md). Warnings, not errors: each is fine when deliberate.
  const n = plan.slides.length;
  if (n >= 4 && plan.slides.every((s) => s.eyebrow)) warnings.push('every slide has an eyebrow; keep them only where they carry information');
  if (n >= 4 && plan.slides.filter((s) => s.highlight).length > Math.ceil(n / 2)) warnings.push('highlight words on more than half the slides read as templated; keep the strongest ones');
  if (plan.slides.some((s) => /[·→]/.test(`${s.headline} ${s.subline ?? ''}`))) warnings.push('middle dots or arrows in copy read as template chrome');
  if ((plan.theme.decor?.length ?? 0) > 2) warnings.push('more than two decor items; remove one');
  for (const f of plan.featureGraphic.screenshots) if (!files.has(f)) errors.push(`featureGraphic uses "${f}" which is not in input/screenshots/`);
  const fh = plan.featureGraphic.highlight;
  if (fh && !plan.featureGraphic.headline.toLowerCase().includes(fh.toLowerCase())) errors.push('featureGraphic.highlight is not part of its headline');

  const t = resolveTheme(plan.theme);
  for (const key of ['bg', 'bg2']) {
    const r = contrast(t.colors.text, t.colors[key]);
    if (r < 4.5) errors.push(`theme.colors.text on ${key} contrast ${r.toFixed(2)}:1 is below 4.5:1`);
  }
  const m = contrast(t.colors.muted, t.colors.bg);
  if (m < 3) warnings.push(`theme.colors.muted on bg contrast ${m.toFixed(2)}:1 is below 3:1`);
  return { ok: errors.length === 0, errors, warnings };
}

/** Dominant colours of the reference images, so agents get measured hexes rather than guesses. */
export async function referencePalette(project) {
  const out = [];
  for (const r of project.references) {
    const { data, info } = await sharp(path.join(project.paths.reference, r.file))
      .resize(48, 48, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const buckets = new Map();
    for (let i = 0; i < data.length; i += info.channels) {
      // 4 bits per channel buckets; average the real pixels inside each bucket.
      const key = (data[i] >> 4) << 8 | (data[i + 1] >> 4) << 4 | (data[i + 2] >> 4);
      const b = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      b.n++; b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2];
      buckets.set(key, b);
    }
    const total = data.length / info.channels;
    const colors = [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, 6).map((b) => ({
      hex: '#' + [b.r, b.g, b.b].map((v) => Math.round(v / b.n).toString(16).padStart(2, '0')).join('').toUpperCase(),
      share: +(b.n / total).toFixed(3),
    }));
    out.push({ file: r.file, width: r.width, height: r.height, colors });
  }
  return out;
}

const ROLE_LAYOUTS = ['hero', 'device-bottom', 'device-top', 'tilted', 'device-bottom', 'two-devices', 'device-top', 'closer'];

/** Truncate at a word boundary so copy never ends mid-word. */
export function clip(s = '', n) {
  s = String(s).trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n + 1).replace(/\s+\S*$/, '');
  return (cut || s.slice(0, n)).replace(/[\s,;:–-]+$/, '');
}

function titleCase(s) {
  return s.replace(/^\d+[-_ ]*/, '').replace(/\.[a-z]+$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()).trim();
}

/** Deterministic plan from app.json alone — used when no agent is selected and as the agent fallback. */
export function heuristicPlan(project) {
  const { app } = project;
  const shots = [...project.screenshots].sort((a, b) =>
    (app.screens[b.file]?.priority ?? 0) - (app.screens[a.file]?.priority ?? 0) || a.file.localeCompare(b.file));
  if (shots.length === 0) throw Object.assign(new Error('Add at least one screenshot to input/screenshots/'), { status: 422 });
  const count = Math.max(2, Math.min(8, app.slideCount || 6, Math.max(2, shots.length)));
  const preset = presetForCategory(app.category);
  const theme = { preset };
  if (app.brandColors?.[0] && /^#[0-9a-f]{6}$/i.test(app.brandColors[0])) {
    theme.colors = { accent: app.brandColors[0].toUpperCase() };
    if (/^#[0-9a-f]{6}$/i.test(app.brandColors[1] ?? '')) theme.colors.accent2 = app.brandColors[1].toUpperCase();
    if (PRESETS[preset].background.type === 'linear' && contrast(PRESETS[preset].colors.text, theme.colors.accent) >= 4.5) {
      theme.colors.bg = theme.colors.accent;
      theme.colors.bg2 = theme.colors.accent2 ?? theme.colors.accent;
    }
  }
  const slides = [];
  for (let i = 0; i < count; i++) {
    const shot = shots[i % shots.length];
    const meta = app.screens[shot.file] ?? {};
    const isLast = i === count - 1 && count > 3;
    let layout = i === 0 ? 'hero' : isLast ? 'closer' : ROLE_LAYOUTS[i];
    const screenshots = [shot.file];
    if (layout === 'two-devices') {
      if (shots.length > count) screenshots.push(shots[count].file);
      else layout = 'device-bottom';
    }
    const headline = clip(meta.headline || meta.title || (i === 0 ? app.shortDescription : '') || titleCase(shot.file) || app.name, 44);
    slides.push({
      id: `s${i + 1}-${titleCase(shot.file).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24) || 'screen'}`.replace(/-+$/, ''),
      role: i === 0 ? 'hero' : isLast ? 'closer' : 'feature',
      layout,
      screenshots,
      ...(i === 0 && app.category ? { eyebrow: String(app.category).replace(/^./, (m) => m.toUpperCase()).slice(0, 30) } : {}),
      headline,
      ...(meta.description ? { subline: clip(meta.description, 90) } : {}),
      ...(isLast && app.facts?.length ? { badges: app.facts.slice(0, 3).map((f) => String(f).slice(0, 24)) } : {}),
    });
  }
  return {
    version: 1,
    generatedBy: 'heuristic',
    app: { name: app.name.slice(0, 50), tagline: clip(app.shortDescription, 120) },
    theme,
    slides,
    featureGraphic: {
      layout: shots.length >= 3 ? 'fg-fan' : 'fg-split',
      headline: clip(app.shortDescription || app.name, 44),
      screenshots: shots.slice(0, 3).map((s) => s.file),
    },
  };
}
