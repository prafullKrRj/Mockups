import { db, now, parse, notFound } from './db.js';
import { getProjectRow } from './store.js';

const projectId = (name) => {
  const row = getProjectRow(name);
  if (!row) throw notFound(`Project "${name}"`);
  return row;
};

// --- QA reports: one row per export, so a project's history shows how guardrail results moved -------------
export function saveQa(name, qa) {
  const project = projectId(name);
  const slides = Object.values(qa?.slides ?? {});
  db().prepare(`INSERT INTO qa_reports (project_id, plan_id, report_json, error_count, warning_count, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(project.id, project.currentPlanId, JSON.stringify(qa), slides.reduce((n, s) => n + (s.errors?.length ?? 0), 0),
      slides.reduce((n, s) => n + (s.warnings?.length ?? 0), 0), now());
}

export function latestQa(name) {
  return parse(db().prepare(`SELECT q.report_json FROM qa_reports q JOIN projects p ON p.id = q.project_id
    WHERE p.name = ? ORDER BY q.id DESC LIMIT 1`).get(name)?.report_json, null);
}

export function listQa(name, limit = 20) {
  const project = projectId(name);
  return db().prepare(`SELECT q.id, q.error_count, q.warning_count, q.created_at, pl.version AS plan_version
    FROM qa_reports q LEFT JOIN plans pl ON pl.id = q.plan_id WHERE q.project_id = ? ORDER BY q.id DESC LIMIT ?`).all(project.id, limit)
    .map((r) => ({ id: r.id, planVersion: r.plan_version, errors: r.error_count, warnings: r.warning_count, createdAt: r.created_at }));
}

// --- runs: every pipeline/export job and its log lines ------------------------------------------------------
export function createRun({ id, project, kind, options = {} }) {
  const row = projectId(project);
  db().prepare('INSERT INTO runs (id, project_id, kind, status, options_json, started_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, row.id, kind, 'running', JSON.stringify(options), now());
}

export function addRunEvent(runId, { t, level, msg }) {
  db().prepare('INSERT INTO run_events (run_id, t, level, msg) VALUES (?, ?, ?, ?)').run(runId, t, level, msg);
}

export function finishRun(runId, status, error = '') {
  db().prepare('UPDATE runs SET status = ?, error = ?, finished_at = ? WHERE id = ?').run(status, error, now(), runId);
}

/** Runs left "running" by a server that died are not running any more. */
export function markOrphanedRuns() {
  db().prepare(`UPDATE runs SET status = 'interrupted', finished_at = ? WHERE status = 'running'`).run(now());
}

const runRow = (r) => ({ id: r.id, project: r.project, appId: r.app_id, kind: r.kind, status: r.status, options: parse(r.options_json, {}),
  error: r.error, startedAt: r.started_at, finishedAt: r.finished_at });

export function listRuns({ project, appId, status, limit = 50 } = {}) {
  const where = [];
  const args = [];
  if (project) { where.push('p.name = ?'); args.push(project); }
  if (appId) { where.push('p.app_id = ?'); args.push(appId); }
  if (status) { where.push('r.status = ?'); args.push(status); }
  return db().prepare(`SELECT r.*, p.name AS project, p.app_id FROM runs r JOIN projects p ON p.id = r.project_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY r.started_at DESC LIMIT ?`).all(...args, Math.min(Number(limit) || 50, 500)).map(runRow);
}

export function getRun(id) {
  const r = db().prepare('SELECT r.*, p.name AS project, p.app_id FROM runs r JOIN projects p ON p.id = r.project_id WHERE r.id = ?').get(id);
  if (!r) throw notFound(`Run "${id}"`);
  const events = db().prepare('SELECT t, level, msg FROM run_events WHERE run_id = ? ORDER BY id').all(id).map((e) => ({ ...e }));
  return { ...runRow(r), events };
}

// --- group-by reports ---------------------------------------------------------------------------------------
const GROUPS = {
  app: 'p.app_id',
  theme: "COALESCE(NULLIF(pl.theme_preset, ''), '(none)')",
  generatedBy: "COALESCE(NULLIF(pl.generated_by, ''), '(none)')",
  category: "COALESCE(NULLIF(a.category, ''), '(none)')",
};

/** Projects grouped by a dimension, with plan and QA aggregates per group. */
export function groupProjects(by = 'app') {
  const key = GROUPS[by];
  if (!key) throw Object.assign(new Error(`group must be one of ${Object.keys(GROUPS).join(', ')}`), { status: 400 });
  return db().prepare(`SELECT ${key} AS key, COUNT(*) AS projects, SUM(pl.id IS NOT NULL) AS with_plan,
      ROUND(AVG(pl.slide_count), 1) AS avg_slides,
      SUM((SELECT q.error_count FROM qa_reports q WHERE q.project_id = p.id ORDER BY q.id DESC LIMIT 1)) AS qa_errors,
      GROUP_CONCAT(p.name, ',') AS names
    FROM projects p JOIN apps a ON a.id = p.app_id LEFT JOIN plans pl ON pl.id = p.current_plan_id
    GROUP BY key ORDER BY projects DESC, key`).all()
    .map((r) => ({ key: r.key, projects: r.projects, withPlan: r.with_plan, avgSlides: r.avg_slides, qaErrors: r.qa_errors ?? 0, names: r.names.split(',') }));
}
