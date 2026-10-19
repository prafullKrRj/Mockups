import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const SKILLS_DIR = path.join(ROOT, 'skills');
export const SCHEMAS_DIR = path.join(ROOT, 'schemas');
export const CONFIG_DIR = path.join(ROOT, 'config');
export const PROJECTS_DIR = process.env.MOCKUP_PROJECTS_DIR
  ? path.resolve(process.env.MOCKUP_PROJECTS_DIR)
  : path.join(ROOT, 'projects');

export const CANVAS = {
  phone: { width: 1080, height: 1920 },
  feature: { width: 1024, height: 500 },
};

export const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export function assertProjectName(name) {
  if (typeof name !== 'string' || !NAME_RE.test(name)) {
    throw Object.assign(new Error(`Invalid project name "${name}" (letters, digits, - and _ only)`), { status: 400 });
  }
  return name;
}

export function assertFileName(name) {
  if (typeof name !== 'string' || name !== path.basename(name) || name.startsWith('.') || name.length > 128) {
    throw Object.assign(new Error(`Invalid file name "${name}"`), { status: 400 });
  }
  return name;
}

export function projectPaths(name) {
  const dir = path.join(PROJECTS_DIR, assertProjectName(name));
  return {
    dir,
    app: path.join(dir, 'app.json'),
    plan: path.join(dir, 'plan.json'),
    screenshots: path.join(dir, 'input', 'screenshots'),
    reference: path.join(dir, 'input', 'reference'),
    icon: path.join(dir, 'input', 'icon.png'),
    build: path.join(dir, 'build'),
    export: path.join(dir, 'export'),
    runs: path.join(dir, '.runs'),
  };
}
