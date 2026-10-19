import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, SKILLS_DIR, SCHEMAS_DIR } from './paths.js';
import { loadProject, readJson, writeJson } from './project.js';
import { heuristicPlan, validatePlan, referencePalette } from './plan.js';
import { buildProject, deckEntries, setEntryMode } from './build.js';
import { exportProject } from './export.js';
import { translateProject } from './translate.js';
import { runAgent } from './agents.js';
import { PRESETS, selectedTheme } from '../templates/themes.js';

const skill = (f) => fs.readFile(path.join(SKILLS_DIR, f), 'utf8');

async function skillsBundle(files) {
  const parts = await Promise.all(files.map(async (f) => `<skill file="${f}">\n${await skill(f)}\n</skill>`));
  return parts.join('\n\n');
}

function projectBrief(project) {
  const shots = project.screenshots.map((s) => {
    const m = project.app.screens[s.file] ?? {};
    return `- \`input/screenshots/${s.file}\` (${s.width}×${s.height}) — priority ${m.priority ?? 0}${m.title ? ` — **${m.title}**` : ''}${m.description ? `: ${m.description}` : ''}`;
  }).join('\n');
  const refs = project.references.map((r) => `- \`input/reference/${r.file}\` (${r.width}×${r.height})`).join('\n') || '- (none — choose a preset by category)';
  return `## App info (app.json)\n\`\`\`json\n${JSON.stringify(project.app, null, 2)}\n\`\`\`\n\n## Screenshots\n${shots}\n\n## Reference theme images\n${refs}\n${project.hasIcon ? '\nThe app icon is at `input/icon.png` and is rendered automatically.\n' : ''}`;
}

async function plannerPrompt(project, { palette, previousErrors }) {
  const schema = await fs.readFile(path.join(SCHEMAS_DIR, 'plan.schema.json'), 'utf8');
  const skills = ['planner.md', 'visual-craft.md', 'vendor/frontend-design/SKILL.md', 'play-store-specs.md', 'aso-copywriting.md', 'design-system.md', 'guardrails.md',
    ...(project.references.length ? ['theme-replication.md'] : [])];
  return `You are the Listing Planner agent of Mockup Studio. Your working directory is the project folder.
Follow the skills below exactly. Your ONLY deliverable is the file \`plan.json\` in the working directory.

${await skillsBundle(skills)}

<schema file="schemas/plan.schema.json">
${schema}
</schema>

${projectBrief(project)}
## Theme selection
${project.app.themeSelection?.mode && project.app.themeSelection.mode !== 'auto'
    ? `User locked this theme. Use it exactly: ${JSON.stringify(selectedTheme(project.app))}`
    : 'Choose a cohesive theme from app genre, description, audience, tone, screenshots and themeSelection.brief. Use reference images when supplied. Explain your choice in theme.referenceNotes.'}
Available preset tokens (you may override tokens when selection is automatic):
${JSON.stringify(PRESETS)}
${palette.length ? `\n## Measured reference palette (.runs/reference-palette.json)\n\`\`\`json\n${JSON.stringify(palette, null, 2)}\n\`\`\`\n` : ''}
${previousErrors ? `\n## Your previous plan.json was REJECTED by the validator. Fix every error:\n${previousErrors.map((e) => `- ${e}`).join('\n')}\n` : ''}
Now look at every image listed, then write \`plan.json\`. Do not create or modify any other file. When done, reply with one line: PLAN WRITTEN.`;
}

async function builderPrompt(project, { round, exported }) {
  const skills = ['builder.md', 'visual-craft.md', 'vendor/frontend-design/SKILL.md', 'design-system.md', 'guardrails.md', 'play-store-specs.md',
    ...(project.references.length ? ['theme-replication.md'] : [])];
  const qa = project.qa ? JSON.stringify(project.qa.slides, null, 2) : '{}';
  const html = await fs.readFile(path.join(project.paths.build, deckEntries(project.plan, project.app)[0].file), 'utf8');
  return `You are the Listing Builder agent of Mockup Studio (review round ${round}). Your working directory is the project folder.

${await skillsBundle(skills)}

${projectBrief(project)}

## Current plan.json
\`\`\`json
${JSON.stringify(project.plan, null, 2)}
\`\`\`

## Guardrail QA report (.runs/qa.json)
\`\`\`json
${qa}
\`\`\`

## Rendered HTML of the first slide (all slides share this structure; files are in build/)
\`\`\`html
${html}
\`\`\`

## Exported PNGs to review
\`.runs/contact-sheet.png\` shows the whole phone deck side by side. Full-size files (open any you need to inspect closely):
${exported.map((f) => `- ${f}`).join('\n')}

Review the exported PNGs against the reference images (if any) and the craft checklist, then improve the deck by
editing \`plan.json\` and, only where necessary, these HTML files:\n${deckEntries(project.plan, project.app).map((e) => `- build/${e.file} (locale ${e.locale}; set mode["${e.locale}"] to "custom" for localized projects, or mode to "custom" for v1)`).join("\n")}
If the deck already meets the bar, change nothing. Reply with a short list of what you changed.`;
}

/**
 * Plan → build → export, with agents at the plan and review stages and guardrails between every step.
 * options: { steps: ['plan','build','export'], planner: 'heuristic'|agentId, builder: 'template'|agentId,
 *            rounds, model, scale, log, signal }
 */
export async function runPipeline(name, options = {}) {
  const { steps = ['plan', 'translate', 'build', 'export'], translator = null, planner = 'heuristic', builder = 'template', rounds = 1, model, scale = 1, signal } = options;
  const log = options.log ?? ((m) => console.log(m));
  const stage = (s) => log(`== ${s} ==`, 'stage');
  let project = await loadProject(name);
  const { paths } = project;
  await fs.mkdir(paths.runs, { recursive: true });
  if (!project.screenshots.length) throw Object.assign(new Error(`No screenshots in ${paths.screenshots}`), { status: 422 });

  if (steps.includes('plan') || steps.includes('theme')) {
    const previousPlan = project.plan;
    stage(`plan (${planner})`);
    const palette = await referencePalette(project);
    if (palette.length) await writeJson(path.join(paths.runs, 'reference-palette.json'), palette);
    let plan = null;
    if (planner !== 'heuristic') {
      if (project.plan) await writeJson(path.join(paths.runs, 'plan.previous.json'), project.plan);
      let previousErrors = null;
      for (let attempt = 1; attempt <= 3 && !plan; attempt++) {
        signal?.throwIfAborted();
        await fs.rm(paths.plan, { force: true });
        const images = [...project.screenshots.map((s) => `input/screenshots/${s.file}`), ...project.references.map((r) => `input/reference/${r.file}`)];
        const { code } = await runAgent({ agentId: planner, prompt: await plannerPrompt(project, { palette, previousErrors }), project: paths.dir, root: ROOT, images, model, log, signal });
        const candidate = await readJson(paths.plan, null).catch((e) => { previousErrors = [e.message]; return null; });
        if (!candidate) {
          previousErrors ??= [`plan.json was not written (agent exit code ${code})`];
          log(`attempt ${attempt}: ${previousErrors[0]}`, 'warn');
          continue;
        }
        candidate.theme = selectedTheme(project.app, candidate.theme);
        const v = validatePlan(candidate, project);
        if (v.ok) {
          plan = { ...candidate, generatedBy: planner };
          v.warnings.forEach((w) => log(`plan warning: ${w}`, 'warn'));
        } else {
          previousErrors = v.errors;
          log(`attempt ${attempt}: plan rejected (${v.errors.length} errors)\n  - ${v.errors.join('\n  - ')}`, 'warn');
        }
      }
      if (!plan) log('planner agent failed guardrails 3 times — falling back to heuristic plan', 'error');
    }
    plan ??= heuristicPlan(project);
    if (steps.includes('theme') && previousPlan) plan = { ...previousPlan, theme: plan.theme };
    await writeJson(paths.plan, plan);
    log(`plan: ${plan.slides.length} slides, theme ${plan.theme.preset}, by ${plan.generatedBy}`);
    project = await loadProject(name);
  }

  if (steps.includes('translate') && translator) {
    stage(`translate (${translator})`);
    await translateProject(project, { agentId: translator, model, log, signal });
    project = await loadProject(name);
  }

  if (steps.includes('build')) {
    stage('build (template renderer)');
    const { entries, warnings } = await buildProject(project, { force: steps.includes('plan') });
    warnings.forEach((w) => log(`plan warning: ${w}`, 'warn'));
    log(`rendered ${entries.length} HTML files${entries.some((e) => e.kept) ? ` (kept custom: ${entries.filter((e) => e.kept).map((e) => e.id).join(', ')})` : ''}`);
    project = await loadProject(name);
  }

  const doExport = async () => {
    stage('export + QA');
    const res = await exportProject(project, { scale, log });
    project = await loadProject(name);
    return res;
  };

  if (steps.includes('export') || builder !== 'template') await doExport();

  if (builder !== 'template' && steps.includes('build')) {
    for (let round = 1; round <= rounds; round++) {
      signal?.throwIfAborted();
      stage(`review round ${round} (${builder})`);
      const planBefore = project.plan;
      const exported = Object.entries(project.exportsByLocale).flatMap(([locale, files]) => ['phone', 'feature'].flatMap((kind) => files[kind].map((f) => `export/${project.app.locales ? `${locale}/` : ''}${kind}/${f}`)));
      // Contact sheet + feature graphic give the whole deck at a glance; full-size slides stay readable on disk.
      const images = ['.runs/contact-sheet.png', ...exported.filter((f) => f.includes('/feature/')), ...project.references.map((r) => `input/reference/${r.file}`)];
      await runAgent({ agentId: builder, prompt: await builderPrompt(project, { round, exported }), project: paths.dir, root: ROOT, images, model, log, signal });

      // Guardrail 1: the plan must still validate, else roll it back.
      project = await loadProject(name).catch(async (e) => { log(`builder broke plan.json (${e.message}) — rolled back`, 'error'); await writeJson(paths.plan, planBefore); return loadProject(name); });
      if (project.plan) {
        project.plan.theme = selectedTheme(project.app, project.plan.theme);
        await writeJson(paths.plan, project.plan);
      }
      const v = project.plan ? validatePlan(project.plan, project) : { ok: false, errors: ['plan.json missing'] };
      if (!v.ok) {
        log(`builder plan rejected — rolled back:\n  - ${v.errors.join('\n  - ')}`, 'error');
        await writeJson(paths.plan, planBefore);
        project = await loadProject(name);
      }
      await buildProject(project);
      project = await loadProject(name);
      const { qa } = await doExport();

      // Guardrail 2: custom slides that fail QA are reverted to their template render.
      const failed = deckEntries(project.plan, project.app).filter((e) => e.mode === 'custom' && qa.slides[e.key]?.errors.length);
      if (failed.length) {
        for (const e of failed) {
          log(`custom ${e.id} failed QA (${qa.slides[e.key].errors.join('; ')}) — reverting to template`, 'error');
          await fs.copyFile(path.join(paths.build, e.templateFile), path.join(paths.build, e.file));
        }
        const plan = structuredClone(project.plan);
        for (const e of failed) {
          setEntryMode(plan, e, 'template', project.app);
        }
        await writeJson(paths.plan, plan);
        project = await loadProject(name);
        await exportProject(project, { scale, only: failed.map((e) => e.key), log });
        project = await loadProject(name);
      }
    }
  }

  const errors = Object.entries(project.qa?.slides ?? {}).filter(([, r]) => r.errors.length);
  log(errors.length ? `done with QA errors on: ${errors.map(([id]) => id).join(', ')}` : 'done — all slides pass guardrails', errors.length ? 'warn' : 'success');
  return project;
}
