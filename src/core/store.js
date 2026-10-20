import { db, tx, now, newId, parse, slugify, notFound } from './db.js';

const APP_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function assertAppId(id) {
  if (typeof id !== 'string' || !APP_ID_RE.test(id)) {
    throw Object.assign(new Error(`Invalid app id "${id}" (lowercase letters, digits, - and _ only)`), { status: 400 });
  }
  return id;
}

/** Which app a listing belongs to when the caller did not say: package name, then app name, then project name. */
export function deriveAppId(app = {}, projectName = '') {
  return slugify(app.packageName) || slugify(app.name) || slugify(projectName) || 'app';
}

const appRow = (r) => r && ({ id: r.id, name: r.name, packageName: r.package_name, category: r.category, notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at });

// --- apps ---------------------------------------------------------------------
export function upsertApp({ id, name, packageName, category, notes }) {
  assertAppId(id);
  const t = now();
  db().prepare(`INSERT INTO apps (id, name, package_name, category, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = COALESCE(NULLIF(?, ''), name), package_name = COALESCE(NULLIF(?, ''), package_name),
      category = COALESCE(NULLIF(?, ''), category), notes = COALESCE(?, notes), updated_at = ?`)
    .run(id, name || id, packageName ?? '', category ?? '', notes ?? '', t, t, name ?? '', packageName ?? '', category ?? '', notes ?? null, t);
  return getApp(id);
}

export function getApp(id) {
  return appRow(db().prepare('SELECT * FROM apps WHERE id = ?').get(id)) ?? null;
}

/** Every app with how many listing projects, plan versions and runs it has — the GROUP BY the dashboard shows. */
export function listApps() {
  return db().prepare(`SELECT a.*,
      (SELECT COUNT(*) FROM projects p WHERE p.app_id = a.id) AS projects,
      (SELECT COUNT(*) FROM plans pl JOIN projects p ON p.id = pl.project_id WHERE p.app_id = a.id) AS plan_versions,
      (SELECT COUNT(*) FROM runs r JOIN projects p ON p.id = r.project_id WHERE p.app_id = a.id) AS runs,
      (SELECT MAX(p.updated_at) FROM projects p WHERE p.app_id = a.id) AS last_activity
    FROM apps a ORDER BY a.name COLLATE NOCASE`).all()
    .map((r) => ({ ...appRow(r), projects: r.projects, planVersions: r.plan_versions, runs: r.runs, lastActivity: r.last_activity }));
}

export function deleteApp(id) {
  const used = db().prepare('SELECT COUNT(*) AS n FROM projects WHERE app_id = ?').get(id).n;
  if (used) throw Object.assign(new Error(`App "${id}" still has ${used} project(s); move or delete them first`), { status: 409 });
  if (!db().prepare('DELETE FROM apps WHERE id = ?').run(id).changes) throw notFound(`App "${id}"`);
}

// --- projects -----------------------------------------------------------------
const projectRow = (r) => r && ({ id: r.id, name: r.name, appId: r.app_id, label: r.label, createdAt: r.created_at, updatedAt: r.updated_at, currentPlanId: r.current_plan_id });

export function getProjectRow(name) {
  return projectRow(db().prepare('SELECT * FROM projects WHERE name = ?').get(name)) ?? null;
}

function requireProject(name) {
  const row = getProjectRow(name);
  if (!row) throw notFound(`Project "${name}"`);
  return row;
}

export function insertProject({ name, app, appId, label = '' }) {
  const id = assertAppId(appId ?? deriveAppId(app, name));
  return tx((d) => {
    if (!getApp(id)) upsertApp({ id, name: app.name, packageName: app.packageName, category: app.category });
    const t = now();
    d.prepare('INSERT INTO projects (id, name, app_id, label, app_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(newId(), name, id, label, JSON.stringify(app), t, t);
    return getProjectRow(name);
  });
}

export function readAppJson(name) {
  return parse(db().prepare('SELECT app_json FROM projects WHERE name = ?').get(name)?.app_json, null);
}

export function writeAppJson(name, app) {
  requireProject(name);
  db().prepare('UPDATE projects SET app_json = ?, updated_at = ? WHERE name = ?').run(JSON.stringify(app), now(), name);
}

export function setProjectMeta(name, { appId, label }) {
  requireProject(name);
  if (appId !== undefined) {
    assertAppId(appId);
    if (!getApp(appId)) upsertApp({ id: appId, name: readAppJson(name)?.name ?? appId });
    db().prepare('UPDATE projects SET app_id = ?, updated_at = ? WHERE name = ?').run(appId, now(), name);
  }
  if (label !== undefined) db().prepare('UPDATE projects SET label = ?, updated_at = ? WHERE name = ?').run(String(label).slice(0, 80), now(), name);
  return getProjectRow(name);
}

export function listProjectRows({ appId } = {}) {
  const sql = `SELECT p.*, pl.version AS plan_version, pl.theme_preset, pl.generated_by, pl.slide_count
    FROM projects p LEFT JOIN plans pl ON pl.id = p.current_plan_id ${appId ? 'WHERE p.app_id = ?' : ''} ORDER BY p.name`;
  return db().prepare(sql).all(...(appId ? [appId] : [])).map((r) => ({
    ...projectRow(r), appName: parse(r.app_json, {}).name, planVersion: r.plan_version ?? null,
    themePreset: r.theme_preset ?? null, generatedBy: r.generated_by ?? null, slideCount: r.slide_count ?? 0,
  }));
}

export function deleteProjectRow(name) {
  if (!db().prepare('DELETE FROM projects WHERE name = ?').run(name).changes) throw notFound(`Project "${name}"`);
}

// --- plans: every save is a new version; projects.current_plan_id points at the live one -----------------
const planRow = (r) => r && ({ id: r.id, version: r.version, generatedBy: r.generated_by, themePreset: r.theme_preset, slideCount: r.slide_count, source: r.source, createdAt: r.created_at });

export function savePlan(name, plan, source = 'api') {
  const project = requireProject(name);
  return tx((d) => {
    const version = (d.prepare('SELECT MAX(version) AS v FROM plans WHERE project_id = ?').get(project.id).v ?? 0) + 1;
    const { lastInsertRowid } = d.prepare(`INSERT INTO plans (project_id, version, plan_json, generated_by, theme_preset, slide_count, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(project.id, version, JSON.stringify(plan), String(plan?.generatedBy ?? ''),
      String(plan?.theme?.preset ?? ''), Array.isArray(plan?.slides) ? plan.slides.length : 0, source, now());
    d.prepare('UPDATE projects SET current_plan_id = ?, updated_at = ? WHERE id = ?').run(lastInsertRowid, now(), project.id);
    return { id: Number(lastInsertRowid), version };
  });
}

export function currentPlan(name) {
  return parse(db().prepare('SELECT pl.plan_json FROM projects p JOIN plans pl ON pl.id = p.current_plan_id WHERE p.name = ?').get(name)?.plan_json, null);
}

export function listPlans(name) {
  const project = requireProject(name);
  return db().prepare('SELECT * FROM plans WHERE project_id = ? ORDER BY version DESC').all(project.id)
    .map((r) => ({ ...planRow(r), current: r.id === project.currentPlanId }));
}

export function getPlanVersion(name, version) {
  const project = requireProject(name);
  const r = db().prepare('SELECT * FROM plans WHERE project_id = ? AND version = ?').get(project.id, Number(version));
  if (!r) throw notFound(`Plan version ${version} of "${name}"`);
  return { ...planRow(r), current: r.id === project.currentPlanId, plan: parse(r.plan_json) };
}

export function clearPlan(name) {
  requireProject(name);
  db().prepare('UPDATE projects SET current_plan_id = NULL, updated_at = ? WHERE name = ?').run(now(), name);
}
