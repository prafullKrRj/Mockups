import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { projectLocales } from './locales.js';
import { PROJECTS_DIR, IMAGE_EXT, projectPaths } from './paths.js';

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

export async function listProjects() {
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
  const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    const p = projectPaths(e.name);
    if (!(await exists(p.app))) continue;
    const app = await readJson(p.app, {});
    const shots = await listImages(p.screenshots);
    const exported = (await Promise.all(projectLocales(app).map((locale) => listImages(path.join(p.export, ...(app.locales ? [locale] : []), 'phone'))))).flat();
    out.push({ name: e.name, appName: app.name, screenshots: shots.length, exported: exported.length });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createProject(name, app = {}) {
  projectLocales(app);
  const p = projectPaths(name);
  if (await exists(p.app)) throw Object.assign(new Error(`Project "${name}" already exists`), { status: 409 });
  await fs.mkdir(p.screenshots, { recursive: true });
  await fs.mkdir(p.reference, { recursive: true });
  await writeJson(p.app, { ...DEFAULT_APP, name, ...app });
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
  if (!(await exists(p.app))) throw Object.assign(new Error(`Project "${name}" not found`), { status: 404 });
  const app = { ...DEFAULT_APP, ...(await readJson(p.app, {})) };
  const screenshots = await imageInfo(p.screenshots);
  // Screens added to the folder without app.json entries still get described (empty) so the UI can show them.
  for (const s of screenshots) app.screens[s.file] ??= { title: '', description: '', priority: 0 };
  const locales = projectLocales(app);
  const exportsByLocale = Object.fromEntries(await Promise.all(locales.map(async (locale) => [locale, {
    phone: await listImages(path.join(p.export, ...(app.locales ? [locale] : []), 'phone')),
    feature: await listImages(path.join(p.export, ...(app.locales ? [locale] : []), 'feature')),
  }])));
  return {
    name,
    paths: p,
    app,
    plan: await readJson(p.plan, null),
    screenshots,
    references: await imageInfo(p.reference),
    hasIcon: await exists(p.icon),
    qa: await readJson(path.join(p.runs, 'qa.json'), null),
    exports: exportsByLocale[locales[0]],
    exportsByLocale,
  };
}

export async function saveApp(name, app) {
  const p = projectPaths(name);
  projectLocales(app);
  await writeJson(p.app, { ...DEFAULT_APP, ...app });
}

/** Copy inputs, app.json and plan.json into a new project — the cheap way to try another theme. */
export async function duplicateProject(name, to) {
  const src = projectPaths(name);
  const dst = projectPaths(to);
  if (await exists(dst.app)) throw Object.assign(new Error(`Project "${to}" already exists`), { status: 409 });
  await fs.mkdir(dst.dir, { recursive: true });
  await fs.cp(path.join(src.dir, 'input'), path.join(dst.dir, 'input'), { recursive: true });
  await fs.copyFile(src.app, dst.app);
  if (await exists(src.plan)) await fs.copyFile(src.plan, dst.plan);
  return loadProject(to);
}
