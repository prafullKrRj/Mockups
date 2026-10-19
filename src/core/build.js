import fs from 'node:fs/promises';
import path from 'node:path';
import { renderSlide, renderFeatureGraphic } from '../templates/render.js';
import { validatePlan } from './plan.js';

export const FEATURE_ID = 'feature-graphic';

/** Slides the deck consists of, in export order. */
export function deckEntries(plan) {
  return [
    ...plan.slides.map((s, i) => ({ id: s.id, index: i, kind: 'phone', mode: s.mode ?? 'template', file: `${s.id}.html` })),
    { id: FEATURE_ID, index: plan.slides.length, kind: 'feature', mode: plan.featureGraphic.mode ?? 'template', file: `${FEATURE_ID}.html` },
  ];
}

function renderContext(project) {
  return {
    shots: Object.fromEntries(project.screenshots.map((s) => [s.file, s])),
    app: { name: project.plan.app.name, iconSrc: project.hasIcon ? '../input/icon.png' : null },
  };
}

/**
 * Render every template-mode slide into build/. Custom-mode slides keep their hand-edited HTML,
 * unless the file is missing, in which case the template is the starting point.
 * `templateCopies` additionally writes `<id>.template.html` so the guardrail can roll back a failed custom slide.
 */
export async function buildProject(project, { force = false } = {}) {
  const { plan } = project;
  if (!plan) throw Object.assign(new Error('No plan.json yet — run the planner first'), { status: 422 });
  const v = validatePlan(plan, project);
  if (!v.ok) throw Object.assign(new Error(`plan.json is invalid:\n- ${v.errors.join('\n- ')}`), { status: 422, details: v });

  const ctx = renderContext(project);
  await fs.mkdir(project.paths.build, { recursive: true });
  const written = [];
  for (const e of deckEntries(plan)) {
    const html = e.kind === 'feature'
      ? renderFeatureGraphic({ plan, ...ctx })
      : renderSlide({ plan, slide: plan.slides[e.index], index: e.index, ...ctx });
    const target = path.join(project.paths.build, e.file);
    await fs.writeFile(path.join(project.paths.build, `${e.id}.template.html`), html);
    const keep = e.mode === 'custom' && !force && await fs.access(target).then(() => true, () => false);
    if (!keep) await fs.writeFile(target, html);
    written.push({ ...e, kept: keep });
  }
  // Drop stale outputs of slides that no longer exist in the plan.
  const live = new Set(deckEntries(plan).flatMap((e) => [e.file, `${e.id}.template.html`]));
  for (const f of await fs.readdir(project.paths.build)) {
    if (f.endsWith('.html') && !live.has(f)) await fs.rm(path.join(project.paths.build, f));
  }
  return { entries: written, warnings: v.warnings };
}
