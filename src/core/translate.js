import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { ROOT, SKILLS_DIR } from './paths.js';
import { runAgent } from './agents.js';
import { readJson, writeJson } from './project.js';
import { validatePlan } from './plan.js';
import { copyFields, projectLocales } from './locales.js';

export async function translateProject(project, { agentId, model, log, signal, run = runAgent }) {
  const before = project.plan;
  if (!before) throw new Error('Create a plan before translating');
  const locales = projectLocales(project.app);
  const source = locales[0];
  const original = copyFields(before);
  const shape = (plan) => {
    const copy = structuredClone(plan);
    for (const slide of [...copy.slides, copy.featureGraphic]) {
      for (const key of ['headline', 'highlight', 'subline', 'eyebrow', 'callouts', 'badges']) {
        if (slide[key] != null) slide[key] = Array.isArray(slide[key]) ? slide[key].map(() => '') : '';
      }
    }
    return copy;
  };
  try {
    await writeJson(project.paths.plan, before);
    const skill = await fs.readFile(path.join(SKILLS_DIR, 'translator.md'), 'utf8');
    const result = await run({ agentId, model, log, signal, root: ROOT, project: project.paths.dir,
      prompt: `${skill}\nSource locale: ${source}. Target locales: ${locales.join(', ')}.\nCurrent plan:\n${JSON.stringify(before, null, 2)}\nWrite only plan.json.` });
    signal?.throwIfAborted();
    if (result.code !== 0) throw new Error(`Translation agent exited ${result.code}`);
    const candidate = await readJson(project.paths.plan);
    const validation = validatePlan(candidate, project);
    if (!validation.ok) throw new Error(validation.errors.join('; '));
    if (!isDeepStrictEqual(shape(candidate), shape(before))) throw new Error('Translator changed non-copy fields');
    const translated = copyFields(candidate);
    for (let i = 0; i < original.length; i++) {
      const old = original[i].value;
      const value = translated[i].value;
      const existing = typeof old === 'string' ? { [source]: old } : old;
      if (typeof value !== 'object' || locales.some((locale) => !(locale in value))) throw new Error(`Missing translation: ${original[i].path}`);
      for (const [locale, text] of Object.entries(existing)) {
        if (value[locale] !== text) throw new Error(`Translator changed existing ${locale} copy: ${original[i].path}`);
      }
    }
    return candidate;
  } catch (e) {
    throw new Error(`Translation rejected; previous plan kept: ${e.message}`, { cause: e });
  } finally {
    // The agent edits plan.json as a scratch file; the caller stores the accepted plan in the database.
    await fs.rm(project.paths.plan, { force: true });
  }
}
