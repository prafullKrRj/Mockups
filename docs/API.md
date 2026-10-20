# Mockup Studio API

Everything the dashboard does is an HTTP call, so an AI agent (or the Android factory) can run the whole studio
without the UI. Start the server with `npm start` (port 4280) and ask it what it can do:

```bash
curl -s localhost:4280/api | jq '.routes[] | "\(.method) \(.path) — \(.doc)"'
```

## Data model

Text data lives in one SQLite file, `projects/mockups.sqlite` (override with `MOCKUP_DB`). Images — screenshots,
references, icon, rendered HTML and exported PNGs — stay on disk under `projects/<name>/`.

| Table | Holds | Keyed by |
|---|---|---|
| `apps` | the product a listing is for: name, package, category, notes | `id` (slug, e.g. `com-novushq-subtrack`) |
| `projects` | one listing variant: app info (`app_json`), label, current plan | `id` (UUID), unique `name`, `app_id` → `apps` |
| `plans` | every saved plan, numbered per project, with source (`api:edit`, `pipeline:plan:claude`, `import`…), generator, theme, slide count | `id`, (`project_id`, `version`) |
| `qa_reports` | each export's guardrail report and error/warning counts, tied to the plan version it checked | `id`, `project_id`, `plan_id` |
| `runs` / `run_events` | each pipeline/export job: options, status, error, every log line | `runs.id` (job UUID) |

A project belongs to exactly one app. Without an explicit `appId` it is derived from `packageName`, then `name`;
duplicates inherit their source's app, so variants of one app group together. Example queries:

```sql
-- variants per app and how many still fail QA
SELECT p.app_id, COUNT(*) AS variants,
       SUM((SELECT error_count FROM qa_reports q WHERE q.project_id = p.id ORDER BY q.id DESC LIMIT 1) > 0) AS failing
FROM projects p GROUP BY p.app_id;
-- which generator produced the current plans
SELECT pl.generated_by, COUNT(*) FROM projects p JOIN plans pl ON pl.id = p.current_plan_id GROUP BY 1;
```

The same reports are available as `GET /api/stats/group?by=app|theme|generatedBy|category`,
`mockup apps` and `mockup group <dimension>`.

`plan.json` is only a scratch file: the pipeline writes it for planner/builder/translator agents, validates what they
leave behind, saves it as a new version and deletes the file. Projects created before the database (with `app.json`,
`plan.json`, `.runs/qa.json` on disk) are imported the first time they are listed or opened; the files move to
`.runs/imported/`. `mockup dump <project>` / `mockup restore <file>` move a project's text data in and out as JSON.

## A complete agent session

```bash
B=localhost:4280/api
curl -s -XPOST $B/projects -H 'content-type: application/json' \
  -d '{"name":"ledger-calm","appId":"com-acme-ledger","label":"calm","app":{"name":"Ledger","packageName":"com.acme.ledger","category":"finance"}}'
curl -s -XPOST $B/projects/ledger-calm/upload/screenshots -F files=@01-home.png -F files=@02-budgets.png
curl -s -XPOST $B/projects/ledger-calm/run -H 'content-type: application/json' \
  -d '{"planner":"claude","builder":"template","steps":["plan","build","export"]}'      # → { "id": "<run>" }
curl -s $B/runs/<run>                                                                  # status + log lines
curl -s -XPOST $B/projects/ledger-calm/duplicate -H 'content-type: application/json' -d '{"to":"ledger-bold","label":"bold"}'
curl -s "$B/apps/com-acme-ledger/compare?projects=ledger-calm,ledger-bold"              # side by side
curl -s $B/projects/ledger-calm/plans                                                  # version history
curl -s -XPOST $B/projects/ledger-calm/plans/1/restore                                 # roll back
curl -s -o listing.zip $B/projects/ledger-calm/download.zip
```

Errors are JSON `{ "error", "details"? }` with 400 (bad input), 404, 409 (conflict / job already running) or 422
(plan or app info fails validation; `details` lists every problem).

## Routes

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/meta` | Installed agent CLIs and theme presets (ids and tokens) |
| `GET` | `/api/projects` | List projects with app id, label, current plan version and file counts. Query: app=<appId> |
| `POST` | `/api/themes/resolve` | Preview the theme tokens a themeSelection resolves to |
| `POST` | `/api/projects` | Create a project. Body: { name, app?, appId?, label? } — appId groups listings of one app (default: slug of packageName or name) |
| `POST` | `/api/projects/:name/duplicate` | Copy a project (inputs, app info, current plan) as another variant of the same app. Body: { to, label? } |
| `GET` | `/api/projects/:name` | Full project: app info, current plan, deck entries, validation, screenshots, latest QA, exports |
| `PUT` | `/api/projects/:name/app` | Replace app info (copy, screens, locales, themeSelection) |
| `PUT` | `/api/projects/:name/plan` | Validate and save a plan as a new version, then re-render the deck |
| `POST` | `/api/projects/:name/plan/heuristic` | Generate and save a heuristic (no-AI) plan and re-render |
| `GET` | `/api/projects/:name/slides/:id/html` | Rendered HTML of one slide. Query: locale |
| `PUT` | `/api/projects/:name/slides/:id/html` | Replace a slide's HTML (text body); the slide becomes custom |
| `POST` | `/api/projects/:name/slides/:id/reset` | Return a custom slide to its template render |
| `POST` | `/api/projects/:name/upload/:kind` | Upload images (multipart field 'files'); kind = screenshots \| reference \| icon |
| `DELETE` | `/api/projects/:name/files/:kind/:file` | Delete a screenshot or reference image |
| `POST` | `/api/projects/:name/run` | Start the pipeline job. Body: { steps?, planner?, translator?, builder?, rounds?, model?, scale? } → { id } |
| `POST` | `/api/projects/:name/export` | Start an export + QA job. Body: { scale?, only? } → { id } |
| `GET` | `/api/jobs` | Jobs of this server process (live); history is in /api/runs |
| `GET` | `/api/jobs/:id/stream` | Server-sent events of a job's log until it ends |
| `POST` | `/api/jobs/:id/cancel` | Cancel a running job |
| `GET` | `/api/projects/:name/download.zip` | ZIP of the project's exported PNGs |
| `GET` | `/api/apps` | Apps with counts of projects, plan versions and runs (projects grouped by app) |
| `POST` | `/api/apps` | Create or update an app. Body: { id, name, packageName?, category?, notes? } |
| `GET` | `/api/apps/:id` | One app with its projects (each with current plan version, theme, counts) |
| `PUT` | `/api/apps/:id` | Update app name, packageName, category or notes |
| `DELETE` | `/api/apps/:id` | Delete an app that has no projects left |
| `GET` | `/api/apps/:id/compare` | Side-by-side comparison of an app's listings: theme, generator, headlines, QA, export URLs. Query: projects=a,b (default all) |
| `GET` | `/api/stats/group` | Projects grouped by a dimension with plan/QA aggregates. Query: by=app\|theme\|generatedBy\|category |
| `PATCH` | `/api/projects/:name` | Move a project to another app or relabel it. Body: { appId?, label? } |
| `DELETE` | `/api/projects/:name` | Delete a project: its database rows (plans, QA, runs) and its folder |
| `POST` | `/api/projects/:name/build` | Re-render the deck HTML from the current plan (custom slides kept unless force) |
| `GET` | `/api/projects/:name/plan` | The current plan JSON (404 when there is none) |
| `DELETE` | `/api/projects/:name/plan` | Unset the current plan (versions are kept) |
| `POST` | `/api/projects/:name/plan/validate` | Validate a plan body against the schema and guardrails without saving |
| `GET` | `/api/projects/:name/plans` | Plan versions, newest first: version, source, generator, theme, slide count, current |
| `GET` | `/api/projects/:name/plans/:version` | One plan version with its JSON |
| `POST` | `/api/projects/:name/plans/:version/restore` | Make an old version current again (saved as a new version) and re-render |
| `GET` | `/api/projects/:name/qa` | Latest QA report plus a history of error/warning counts per export |
| `GET` | `/api/runs` | Run history (pipeline and export jobs). Query: project, app, status, limit |
| `GET` | `/api/runs/:id` | One run with options, status, error and every log line |
| `GET` | `/api` | This catalog: every route with a one-line description |
