import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { validateThemeSelection } from '../templates/themes.js';
import { projectLocales } from './locales.js';
import { PROJECTS_DIR, IMAGE_EXT, projectPaths } from './paths.js';
import { clearPlan, currentPlan, deleteProjectRow, getProjectRow, insertProject, listProjectRows, readAppJson, savePlan, writeAppJson } from './store.js';
import { latestQa, saveQa } from './history.js';

export const DEFAULT_APP = {
  name: 'My App',
  packageName: '',
  category: 'productivity',
  shortDescription: '',
  fullDescription: '',
  audience: '',
  tone: '',
  brandColors: [],
  features: [],
  facts: [],
  locale: 'en-US',
  slideCount: 6,
  screens: {},
  notes: '',
};

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw Object.assign(new Error(`${path.basename(file)} is not valid JSON: ${err.message}`), { status: 422 });
  }
}

export async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n');
  await fs.rename(tmp, file);
}

async function exists(p) {
  return fs.access(p).then(() => true, () => false);
}

export async function listProjects({ appId } = {}) {
  await importLegacyProjects();
  const out = [];
  for (const row of listProjectRows({ appId })) {
    const p = projectPaths(row.name);
    const app = readAppJson(row.name) ?? {};
    const shots = await listImages(p.screenshots);
    const exported = (await Promise.all(projectLocales(app).map((locale) => listImages(path.join(p.export, ...(app.locales ? [locale] : []), 'phone'))))).flat();
    out.push({ ...row, screenshots: shots.length, exported: exported.length });
  }
  return out;
}

/**
 * Projects from before the database kept app.json / plan.json / .runs/qa.json on disk. Import them once,
 * then move the files to .runs/imported/ so nobody edits a copy the app no longer reads.
 */
export async function importLegacyProjects() {
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
  for (const e of await fs.readdir(PROJECTS_DIR, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith('.') && !getProjectRow(e.name)) await importLegacyProject(e.name).catch(() => {});
  }
}

export async function importLegacyProject(name) {
  const p = projectPaths(name);
  const app = await readJson(p.app, null);
  if (!app) return false;
  insertProject({ name, app: { ...DEFAULT_APP, ...app } });
  const plan = await readJson(p.plan, null);
  if (plan) savePlan(name, plan, 'import');
  const qaFile = path.join(p.runs, 'qa.json');
  const qa = await readJson(qaFile, null);
  if (qa) saveQa(name, qa);
  const dest = path.join(p.runs, 'imported');
  await fs.mkdir(dest, { recursive: true });
  for (const file of [p.app, p.plan, qaFile]) {
    if (await exists(file)) await fs.rename(file, path.join(dest, path.basename(file)));
  }
  return true;
}

export async function createProject(name, app = {}, { appId, label } = {}) {
  validateThemeSelection(app.themeSelection);
  projectLocales(app);
  const p = projectPaths(name);
  if (getProjectRow(name) || await exists(p.app)) throw Object.assign(new Error(`Project "${name}" already exists`), { status: 409 });
  insertProject({ name, app: { ...DEFAULT_APP, name, ...app }, appId, label });
  await fs.mkdir(p.screenshots, { recursive: true });
  await fs.mkdir(p.reference, { recursive: true });
  return loadProject(name);
}

export async function listImages(dir) {
  try {
    return (await fs.readdir(dir)).filter((f) => IMAGE_EXT.test(f) && !f.startsWith('.')).sort();
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

export async function imageInfo(dir) {
  const files = await listImages(dir);
  return Promise.all(files.map(async (file) => {
    const meta = await sharp(path.join(dir, file)).metadata();
    return { file, width: meta.width, height: meta.height };
  }));
}

/** Everything the planner, renderer and dashboard need to know about a project. */
export async function loadProject(name) {
  const p = projectPaths(name);
  const row = getProjectRow(name) ?? (await importLegacyProject(name) && getProjectRow(name));
  if (!row) throw Object.assign(new Error(`Project "${name}" not found`), { status: 404 });
  const app = { ...DEFAULT_APP, ...readAppJson(name) };
  const screenshots = await imageInfo(p.screenshots);
  // Screens added to the folder without app.json entries still get described (empty) so the UI can show them.
  for (const s of screenshots) app.screens[s.file] ??= { title: '', description: '', priority: 0 };
  const locales = projectLocales(app);
  const exportsByLocale = Object.fromEntries(await Promise.all(locales.map(async (locale) => [locale, {
    phone: await listImages(path.join(p.export, ...(app.locales ? [locale] : []), 'phone')),
    feature: await listImages(path.join(p.export, ...(app.locales ? [locale] : []), 'feature')),
  }])));
  return {
    id: row.id,
    name,
    appId: row.appId,
    label: row.label,
    paths: p,
    app,
    plan: currentPlan(name),
    screenshots,
    references: await imageInfo(p.reference),
    hasIcon: await exists(p.icon),
    qa: latestQa(name),
    exports: exportsByLocale[locales[0]],
    exportsByLocale,
  };
}

export async function saveApp(name, app) {
  validateThemeSelection(app.themeSelection);
  projectLocales(app);
  writeAppJson(name, { ...DEFAULT_APP, ...app });
}

/** Copy inputs, app info and the current plan into a new project of the same app — the cheap way to try another theme. */
export async function duplicateProject(name, to, { label } = {}) {
  const src = await loadProject(name);
  const dst = projectPaths(to);
  if (getProjectRow(to) || await exists(dst.app)) throw Object.assign(new Error(`Project "${to}" already exists`), { status: 409 });
  insertProject({ name: to, app: src.app, appId: src.appId, label: label ?? '' });
  await fs.mkdir(dst.dir, { recursive: true });
  await fs.cp(path.join(src.paths.dir, 'input'), path.join(dst.dir, 'input'), { recursive: true });
  if (src.plan) savePlan(to, src.plan, `duplicate:${name}`);
  return loadProject(to);
}

/** Drop the project's rows (plans, QA, runs cascade) and its folder of images and exports. */
export async function deleteProject(name) {
  const p = projectPaths(name);
  deleteProjectRow(name);
  await fs.rm(p.dir, { recursive: true, force: true });
}

/** Everything the database holds about one project, as plain JSON (`mockup dump`, samples, fixtures). */
export async function dumpProject(name) {
  const p = await loadProject(name);
  return { name, appId: p.appId, label: p.label, app: p.app, plan: p.plan, qa: p.qa };
}

/** Load a dump into the database (replacing the project row, keeping files on disk). */
export async function restoreProject(dump) {
  if (getProjectRow(dump.name)) deleteProjectRow(dump.name);
  insertProject({ name: dump.name, app: { ...DEFAULT_APP, ...dump.app }, appId: dump.appId, label: dump.label ?? '' });
  if (dump.plan) savePlan(dump.name, dump.plan, 'restore');
  if (dump.qa) saveQa(dump.name, dump.qa);
  return loadProject(dump.name);
}

export { savePlan, clearPlan };
