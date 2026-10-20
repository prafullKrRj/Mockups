import { buildProject, deckEntries } from '../core/build.js';
import { clearPlan, deleteProject, importLegacyProjects, listProjects, loadProject, savePlan } from '../core/project.js';
import { validatePlan } from '../core/plan.js';
import { assertAppId, deleteApp, getApp, getPlanVersion, listApps, listPlans, setProjectMeta, upsertApp } from '../core/store.js';
import { getRun, groupProjects, listQa, listRuns } from '../core/history.js';
import { projectLocales } from '../core/locales.js';

const text = (v, locale) => (v && typeof v === 'object' ? v[locale] ?? Object.values(v)[0] : v) ?? '';
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

/** One listing variant reduced to what a side-by-side comparison needs. */
export async function compareEntry(name) {
  const p = await loadProject(name);
  const locale = projectLocales(p.app)[0];
  const dir = (kind) => `/files/${encodeURIComponent(name)}/export/${p.app.locales ? `${locale}/` : ''}${kind}/`;
  const version = listPlans(name).find((v) => v.current) ?? null;
  const qa = Object.values(p.qa?.slides ?? {});
  return {
    name,
    label: p.label,
    appId: p.appId,
    plan: p.plan && {
      version: version?.version ?? null,
      source: version?.source ?? null,
      savedAt: version?.createdAt ?? null,
      generatedBy: p.plan.generatedBy ?? null,
      theme: p.plan.theme ?? null,
      headlines: (p.plan.slides ?? []).map((s) => text(s.headline, locale)),
      valid: validatePlan(p.plan, p).ok,
    },
    slides: p.plan ? deckEntries(p.plan, p.app).filter((e) => e.locale === locale && e.kind === 'phone').length : 0,
    qa: { checked: qa.length, errors: qa.reduce((n, s) => n + s.errors.length, 0), warnings: qa.reduce((n, s) => n + s.warnings.length, 0) },
    exports: { phone: p.exports.phone.map((f) => dir('phone') + f), feature: p.exports.feature.map((f) => dir('feature') + f) },
  };
}

export function registerDataRoutes(def, { wrap, serialize }) {
  // --- apps: the product a set of listing projects belongs to -------------------------------------------
  def('get', '/api/apps', 'Apps with counts of projects, plan versions and runs (projects grouped by app)', wrap(async (_req, res) => {
    await importLegacyProjects();
    res.json(listApps());
  }));

  def('post', '/api/apps', 'Create or update an app. Body: { id, name, packageName?, category?, notes? }', wrap(async (req, res) => {
    const { id, name, packageName, category, notes } = req.body ?? {};
    res.status(201).json(upsertApp({ id: assertAppId(id), name, packageName, category, notes }));
  }));

  def('get', '/api/apps/:id', 'One app with its projects (each with current plan version, theme, counts)', wrap(async (req, res) => {
    const app = getApp(req.params.id);
    if (!app) throw bad(`App "${req.params.id}" not found`, 404);
    res.json({ ...app, projects: await listProjects({ appId: app.id }) });
  }));

  def('put', '/api/apps/:id', 'Update app name, packageName, category or notes', wrap(async (req, res) => {
    if (!getApp(req.params.id)) throw bad(`App "${req.params.id}" not found`, 404);
    const { name, packageName, category, notes } = req.body ?? {};
    res.json(upsertApp({ id: req.params.id, name, packageName, category, notes }));
  }));

  def('delete', '/api/apps/:id', 'Delete an app that has no projects left', wrap(async (req, res) => {
    deleteApp(req.params.id);
    res.status(204).end();
  }));

  def('get', '/api/apps/:id/compare', 'Side-by-side comparison of an app\'s listings: theme, generator, headlines, QA, export URLs. Query: projects=a,b (default all)', wrap(async (req, res) => {
    const app = getApp(req.params.id);
    if (!app) throw bad(`App "${req.params.id}" not found`, 404);
    const own = (await listProjects({ appId: app.id })).map((p) => p.name);
    const wanted = req.query.projects ? String(req.query.projects).split(',').filter(Boolean) : own;
    const stray = wanted.filter((n) => !own.includes(n));
    if (stray.length) throw bad(`Not projects of ${app.id}: ${stray.join(', ')}`);
    res.json({ app, projects: await Promise.all(wanted.map(compareEntry)) });
  }));

  def('get', '/api/stats/group', 'Projects grouped by a dimension with plan/QA aggregates. Query: by=app|theme|generatedBy|category', wrap(async (req, res) => {
    res.json(groupProjects(req.query.by ?? 'app'));
  }));

  // --- project metadata and lifecycle --------------------------------------------------------------------
  def('patch', '/api/projects/:name', 'Move a project to another app or relabel it. Body: { appId?, label? }', wrap(async (req, res) => {
    await loadProject(req.params.name);
    setProjectMeta(req.params.name, { appId: req.body?.appId, label: req.body?.label });
    res.json(serialize(await loadProject(req.params.name)));
  }));

  def('delete', '/api/projects/:name', 'Delete a project: its database rows (plans, QA, runs) and its folder', wrap(async (req, res) => {
    await deleteProject(req.params.name);
    res.status(204).end();
  }));

  def('post', '/api/projects/:name/build', 'Re-render the deck HTML from the current plan (custom slides kept unless force)', wrap(async (req, res) => {
    const p = await loadProject(req.params.name);
    if (!p.plan) throw bad('Project has no plan yet', 409);
    const { warnings } = await buildProject(p, { force: Boolean(req.body?.force) });
    res.json({ ...serialize(await loadProject(req.params.name)), warnings });
  }));

  // --- plans: current one, version history, restore ----------------------------------------------------------
  def('get', '/api/projects/:name/plan', 'The current plan JSON (404 when there is none)', wrap(async (req, res) => {
    const p = await loadProject(req.params.name);
    if (!p.plan) throw bad('Project has no plan yet', 404);
    res.json(p.plan);
  }));

  def('delete', '/api/projects/:name/plan', 'Unset the current plan (versions are kept)', wrap(async (req, res) => {
    await loadProject(req.params.name);
    clearPlan(req.params.name);
    res.json(serialize(await loadProject(req.params.name)));
  }));

  def('post', '/api/projects/:name/plan/validate', 'Validate a plan body against the schema and guardrails without saving', wrap(async (req, res) => {
    res.json(validatePlan(req.body, await loadProject(req.params.name)));
  }));

  def('get', '/api/projects/:name/plans', 'Plan versions, newest first: version, source, generator, theme, slide count, current', wrap(async (req, res) => {
    await loadProject(req.params.name);
    res.json(listPlans(req.params.name));
  }));

  def('get', '/api/projects/:name/plans/:version', 'One plan version with its JSON', wrap(async (req, res) => {
    await loadProject(req.params.name);
    res.json(getPlanVersion(req.params.name, req.params.version));
  }));

  def('post', '/api/projects/:name/plans/:version/restore', 'Make an old version current again (saved as a new version) and re-render', wrap(async (req, res) => {
    const p = await loadProject(req.params.name);
    const { plan } = getPlanVersion(req.params.name, req.params.version);
    const v = validatePlan(plan, p);
    if (!v.ok) return res.status(422).json({ error: 'That version no longer validates', details: v });
    savePlan(req.params.name, plan, `api:restore:v${req.params.version}`);
    await buildProject(await loadProject(req.params.name), { force: true });
    res.json(serialize(await loadProject(req.params.name)));
  }));

  // --- QA and run history --------------------------------------------------------------------------------
  def('get', '/api/projects/:name/qa', 'Latest QA report plus a history of error/warning counts per export', wrap(async (req, res) => {
    const p = await loadProject(req.params.name);
    res.json({ latest: p.qa, history: listQa(req.params.name) });
  }));

  def('get', '/api/runs', 'Run history (pipeline and export jobs). Query: project, app, status, limit', wrap(async (req, res) => {
    const { project, app, status, limit } = req.query;
    res.json(listRuns({ project, appId: app, status, limit }));
  }));

  def('get', '/api/runs/:id', 'One run with options, status, error and every log line', wrap(async (req, res) => {
    res.json(getRun(req.params.id));
  }));
}
