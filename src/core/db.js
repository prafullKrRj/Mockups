import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { PROJECTS_DIR } from './paths.js';

// All text data (app info, plan versions, QA reports, runs and their logs) lives in one SQLite file.
// Images stay on disk under projects/<name>/; rows point at projects by name and at apps by id.
export const DB_PATH = process.env.MOCKUP_DB ? path.resolve(process.env.MOCKUP_DB) : path.join(PROJECTS_DIR, 'mockups.sqlite');

const MIGRATIONS = [
  `CREATE TABLE apps (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     package_name TEXT NOT NULL DEFAULT '',
     category TEXT NOT NULL DEFAULT '',
     notes TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL);
   CREATE TABLE projects (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL UNIQUE,
     app_id TEXT NOT NULL REFERENCES apps(id),
     label TEXT NOT NULL DEFAULT '',
     app_json TEXT NOT NULL,
     current_plan_id INTEGER,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL);
   CREATE INDEX projects_app ON projects(app_id);
   CREATE TABLE plans (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     version INTEGER NOT NULL,
     plan_json TEXT NOT NULL,
     generated_by TEXT NOT NULL DEFAULT '',
     theme_preset TEXT NOT NULL DEFAULT '',
     slide_count INTEGER NOT NULL DEFAULT 0,
     source TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL,
     UNIQUE (project_id, version));
   CREATE TABLE qa_reports (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     plan_id INTEGER REFERENCES plans(id) ON DELETE SET NULL,
     report_json TEXT NOT NULL,
     error_count INTEGER NOT NULL DEFAULT 0,
     warning_count INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL);
   CREATE INDEX qa_project ON qa_reports(project_id, id);
   CREATE TABLE runs (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     kind TEXT NOT NULL,
     status TEXT NOT NULL,
     options_json TEXT NOT NULL DEFAULT '{}',
     error TEXT NOT NULL DEFAULT '',
     started_at TEXT NOT NULL,
     finished_at TEXT);
   CREATE INDEX runs_project ON runs(project_id, started_at);
   CREATE TABLE run_events (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
     t INTEGER NOT NULL,
     level TEXT NOT NULL,
     msg TEXT NOT NULL);
   CREATE INDEX run_events_run ON run_events(run_id, id);`,
];

let handle = null;

export function db() {
  if (handle) return handle;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  handle = new DatabaseSync(DB_PATH);
  handle.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const { user_version: have } = handle.prepare('PRAGMA user_version').get();
  for (let v = have; v < MIGRATIONS.length; v++) {
    handle.exec('BEGIN');
    try {
      handle.exec(MIGRATIONS[v]);
      handle.exec(`PRAGMA user_version = ${v + 1}`);
      handle.exec('COMMIT');
    } catch (err) {
      handle.exec('ROLLBACK');
      throw err;
    }
  }
  return handle;
}

export function closeDb() {
  handle?.close();
  handle = null;
}

export function tx(fn) {
  const d = db();
  d.exec('BEGIN IMMEDIATE');
  try {
    const out = fn(d);
    d.exec('COMMIT');
    return out;
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}

export const now = () => new Date().toISOString();
export const newId = () => randomUUID();
export const parse = (s, fallback = null) => (s == null ? fallback : JSON.parse(s));

/** `com.example.Paisa Calm` → `com-example-paisa-calm`; the same rule names apps and projects. */
export function slugify(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 64);
}

export const notFound = (what) => Object.assign(new Error(`${what} not found`), { status: 404 });
