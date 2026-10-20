import express from 'express';
import multer from 'multer';
import { ZipArchive } from 'archiver';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT, PROJECTS_DIR, IMAGE_EXT, assertFileName, projectPaths } from './core/paths.js';
import { createProject, duplicateProject, listProjects, loadProject, saveApp, savePlan } from './core/project.js';
import { validatePlan, heuristicPlan } from './core/plan.js';
import { buildProject, deckEntries, setEntryMode } from './core/build.js';
import { exportProject } from './core/export.js';
import { runPipeline } from './core/pipeline.js';
import { listAgents } from './core/agents.js';
import { addRunEvent, createRun, finishRun, markOrphanedRuns } from './core/history.js';
import { registerDataRoutes } from './api/data.js';
import { PRESETS, selectedTheme, validateThemeSelection } from './templates/themes.js';

const jobs = new Map(); // id → { id, project, status, lines[], listeners:Set, controller }

function startJob(project, kind, options, fn) {
  const running = [...jobs.values()].find((j) => j.project === project && j.status === 'running');
  if (running) throw Object.assign(new Error(`A job is already running for ${project}`), { status: 409 });
  const job = { id: randomUUID(), project, status: 'running', lines: [], listeners: new Set(), controller: new AbortController(), startedAt: Date.now() };
  createRun({ id: job.id, project, kind, options });
  const emit = (ev) => { job.lines.push(ev); addRunEvent(job.id, ev); for (const l of job.listeners) l(ev); };
  job.log = (msg, level = 'info') => emit({ t: Date.now(), level, msg: String(msg) });
  jobs.set(job.id, job);
  fn(job).then(
    () => { job.status = 'done'; finishRun(job.id, 'done'); emit({ t: Date.now(), level: 'end', msg: 'done' }); },
    (err) => {
      job.status = job.controller.signal.aborted ? 'cancelled' : 'failed';
      finishRun(job.id, job.status, err.message);
      job.log(err.message, 'error');
      emit({ t: Date.now(), level: 'end', msg: job.status });
    },
  );
  return job;
}

const wrap = (fn) => (req, res) => fn(req, res).catch((err) => res.status(err.status ?? 500).json({ error: err.message, details: err.details }));

export function createApp() {
  const app = express();
  // Every route is registered with a one-line doc so GET /api can describe the whole API to an agent.
  const catalog = [];
  const def = (method, route, doc, ...handlers) => {
    catalog.push({ method: method.toUpperCase(), path: route, doc });
    app[method](route, ...handlers);
  };
  markOrphanedRuns();
  app.use(express.json({ limit: '5mb' }));
  app.use(express.static(path.join(ROOT, 'dashboard')));
  // Project files (build HTML, inputs, exports) are served so iframes resolve ../input/screenshots/ paths.
  app.use('/files', express.static(PROJECTS_DIR, { dotfiles: 'deny', etag: false, lastModified: false, cacheControl: false }));

  def('get', '/api/meta', 'Installed agent CLIs and theme presets (ids and tokens)', wrap(async (_req, res) => {
    res.json({ agents: await listAgents(), presets: Object.keys(PRESETS), presetData: PRESETS, projectsDir: PROJECTS_DIR });
  }));

  def('get', '/api/projects', 'List projects with app id, label, current plan version and file counts. Query: app=<appId>', wrap(async (req, res) => res.json(await listProjects({ appId: req.query.app || undefined }))));

  def('post', '/api/themes/resolve', 'Preview the theme tokens a themeSelection resolves to', wrap(async (req, res) => {
    validateThemeSelection(req.body ?? null);
    if (req.body.mode === 'auto') return res.status(422).json({ error: 'Select a preset or Material palette to preview; AI selection uses the planner.' });
    res.json(selectedTheme({ themeSelection: req.body }));
  }));

  def('post', '/api/projects', 'Create a project. Body: { name, app?, appId?, label? } — appId groups listings of one app (default: slug of packageName or name)', wrap(async (req, res) => {
    const p = await createProject(req.body.name, req.body.app ?? {}, { appId: req.body.appId || undefined, label: req.body.label });
    res.status(201).json(serialize(p));
  }));

  def('post', '/api/projects/:name/duplicate', 'Copy a project (inputs, app info, current plan) as another variant of the same app. Body: { to, label? }', wrap(async (req, res) => {
    const p = await duplicateProject(req.params.name, req.body.to, { label: req.body.label });
    if (p.plan) await buildProject(p, { force: true });
    res.status(201).json(serialize(await loadProject(req.body.to)));
  }));

  def('get', '/api/projects/:name', 'Full project: app info, current plan, deck entries, validation, screenshots, latest QA, exports', wrap(async (req, res) => {
    const p = await loadProject(req.params.name);
    res.json(serialize(p));
  }));

  def('put', '/api/projects/:name/app', 'Replace app info (copy, screens, locales, themeSelection)', wrap(async (req, res) => {
    await loadProject(req.params.name);
    await saveApp(req.params.name, req.body);
    res.json(serialize(await loadProject(req.params.name)));
  }));

  // Save an edited plan: validate, re-render template slides, export the changed deck.
  def('put', '/api/projects/:name/plan', 'Validate and save a plan as a new version, then re-render the deck', wrap(async (req, res) => {
    const p = await loadProject(req.params.name);
    const v = validatePlan(req.body, p);
    if (!v.ok) return res.status(422).json({ error: 'plan.json is invalid', details: v });
    savePlan(p.name, req.body, 'api:edit');
    const fresh = await loadProject(req.params.name);
    await buildProject(fresh);
    res.json({ ...serialize(await loadProject(req.params.name)), validation: v });
  }));

  def('post', '/api/projects/:name/plan/heuristic', 'Generate and save a heuristic (no-AI) plan and re-render', wrap(async (req, res) => {
    const p = await loadProject(req.params.name);
    const plan = heuristicPlan(p);
    savePlan(p.name, plan, 'api:heuristic');
    await buildProject(await loadProject(req.params.name), { force: true });
    res.json(serialize(await loadProject(req.params.name)));
  }));

  def('get', '/api/projects/:name/slides/:id/html', 'Rendered HTML of one slide. Query: locale', wrap(async (req, res) => {
    const p = await loadProject(req.params.name);
    const e = deckEntries(p.plan, p.app).find((x) => x.id === req.params.id && (!req.query.locale || x.locale === req.query.locale));
    if (!e) return res.status(404).json({ error: 'slide not found' });
    res.type('text/plain').send(await fs.readFile(path.join(p.paths.build, e.file), 'utf8'));
  }));

  // Hand-edited HTML turns the slide into a custom slide so later re-renders keep it.
  def('put', '/api/projects/:name/slides/:id/html', "Replace a slide's HTML (text body); the slide becomes custom", express.text({ limit: '2mb', type: '*/*' }), wrap(async (req, res) => {
    const p = await loadProject(req.params.name);
    const e = deckEntries(p.plan, p.app).find((x) => x.id === req.params.id && (!req.query.locale || x.locale === req.query.locale));
    if (!e) return res.status(404).json({ error: 'slide not found' });
    await fs.writeFile(path.join(p.paths.build, e.file), req.body);
    const plan = structuredClone(p.plan);
    setEntryMode(plan, e, 'custom', p.app);
    savePlan(p.name, plan, `api:custom-html:${e.key}`);
    res.json(serialize(await loadProject(req.params.name)));
  }));

  def('post', '/api/projects/:name/slides/:id/reset', 'Return a custom slide to its template render', wrap(async (req, res) => {
    const p = await loadProject(req.params.name);
    const e = deckEntries(p.plan, p.app).find((x) => x.id === req.params.id && (!req.query.locale || x.locale === req.query.locale));
    if (!e) return res.status(404).json({ error: 'slide not found' });
    const plan = structuredClone(p.plan);
    setEntryMode(plan, e, 'template', p.app);
    savePlan(p.name, plan, `api:reset-slide:${e.key}`);
    await fs.rm(path.join(p.paths.build, e.file), { force: true });
    await buildProject(await loadProject(req.params.name));
    res.json(serialize(await loadProject(req.params.name)));
  }));

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 30 } });
  def('post', '/api/projects/:name/upload/:kind', "Upload images (multipart field 'files'); kind = screenshots | reference | icon", upload.array('files'), wrap(async (req, res) => {
    const p = await loadProject(req.params.name);
    const kind = req.params.kind;
    if (!['screenshots', 'reference', 'icon'].includes(kind)) return res.status(400).json({ error: 'kind must be screenshots, reference or icon' });
    for (const f of req.files ?? []) {
      if (!IMAGE_EXT.test(f.originalname)) continue;
      if (kind === 'icon') {
        await sharp(f.buffer).resize(512, 512, { fit: 'cover' }).png().toFile(p.paths.icon);
        continue;
      }
      const safe = f.originalname.replace(/[^\w.-]+/g, '-').replace(/^\.+/, '');
      await fs.mkdir(p.paths[kind], { recursive: true });
      await fs.writeFile(path.join(p.paths[kind], assertFileName(safe)), f.buffer);
    }
    res.json(serialize(await loadProject(req.params.name)));
  }));

  def('delete', '/api/projects/:name/files/:kind/:file', 'Delete a screenshot or reference image', wrap(async (req, res) => {
    const p = await loadProject(req.params.name);
    const dir = { screenshots: p.paths.screenshots, reference: p.paths.reference }[req.params.kind];
    if (!dir) return res.status(400).json({ error: 'kind must be screenshots or reference' });
    await fs.rm(path.join(dir, assertFileName(req.params.file)), { force: true });
    res.json(serialize(await loadProject(req.params.name)));
  }));

  def('post', '/api/projects/:name/run', 'Start the pipeline job. Body: { steps?, planner?, translator?, builder?, rounds?, model?, scale? } → { id }', wrap(async (req, res) => {
    const name = req.params.name;
    await loadProject(name);
    const { steps, planner, translator, builder, rounds, model, scale } = req.body ?? {};
    const job = startJob(name, 'pipeline', req.body ?? {}, (j) => runPipeline(name, { steps, planner, translator, builder, rounds: Number(rounds) || 1, model: model || undefined, scale: Number(scale) || 1, log: j.log, signal: j.controller.signal }));
    res.status(202).json({ id: job.id });
  }));

  def('post', '/api/projects/:name/export', 'Start an export + QA job. Body: { scale?, only? } → { id }', wrap(async (req, res) => {
    const name = req.params.name;
    const job = startJob(name, 'export', req.body ?? {}, async (j) => {
      const p = await loadProject(name);
      await exportProject(p, { scale: Number(req.body?.scale) || 1, only: req.body?.only ?? null, log: j.log });
    });
    res.status(202).json({ id: job.id });
  }));

  def('get', '/api/jobs', 'Jobs of this server process (live); history is in /api/runs', (_req, res) => res.json([...jobs.values()].map(({ id, project, status, startedAt }) => ({ id, project, status, startedAt }))));

  def('get', '/api/jobs/:id/stream', "Server-sent events of a job's log until it ends", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).end();
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const send = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
    job.lines.forEach(send);
    if (job.status !== 'running') return res.end();
    const listener = (ev) => { send(ev); if (ev.level === 'end') res.end(); };
    job.listeners.add(listener);
    req.on('close', () => job.listeners.delete(listener));
  });

  def('post', '/api/jobs/:id/cancel', 'Cancel a running job', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).end();
    job.controller.abort();
    res.json({ ok: true });
  });

  def('get', '/api/projects/:name/download.zip', "ZIP of the project's exported PNGs", wrap(async (req, res) => {
    const p = projectPaths(req.params.name);
    res.attachment(`${req.params.name}-play-listing.zip`);
    const zip = new ZipArchive({ zlib: { level: 6 } });
    zip.on('error', (err) => res.destroy(err));
    zip.pipe(res);
    zip.directory(p.export, false);
    await zip.finalize();
  }));

  registerDataRoutes(def, { wrap, serialize });
  def('get', '/api', 'This catalog: every route with a one-line description', (_req, res) => res.json({ name: 'Mockup Studio API', routes: catalog }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'No such API route — GET /api lists them' }));

  return app;
}

export function serialize(p) {
  const { paths, ...rest } = p;
  return { ...rest, dir: paths.dir, deck: p.plan ? deckEntries(p.plan, p.app) : [], validation: p.plan ? validatePlan(p.plan, p) : null };
}

export async function startServer(port = 4280) {
  const app = createApp();
  await new Promise((resolve) => app.listen(port, '127.0.0.1', resolve));
  console.log(`Mockup Studio dashboard → http://localhost:${port}\nProjects: ${PROJECTS_DIR}`);
}
