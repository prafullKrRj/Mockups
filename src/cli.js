#!/usr/bin/env node
import { parseArgs } from 'node:util';
import fs from 'node:fs/promises';
import { createProject, dumpProject, listProjects, loadProject, restoreProject } from './core/project.js';
import { listApps } from './core/store.js';
import { groupProjects } from './core/history.js';
import { DB_PATH } from './core/db.js';
import { validatePlan } from './core/plan.js';
import { runPipeline } from './core/pipeline.js';
import { listAgents } from './core/agents.js';
import { PROJECTS_DIR } from './core/paths.js';

const HELP = `mockup-studio — AI Play Store listing graphics

Usage:
  mockup new <project>                     create projects/<project>/ with input folders and app.json
  mockup list [--app <id>]                 list projects (optionally of one app)
  mockup apps                              list apps with their project, plan and run counts
  mockup group <app|theme|generatedBy|category>  projects grouped by a dimension
  mockup dump <project>                    print app info, current plan and QA as JSON
  mockup restore <file.json>               load a dump into the database
  mockup agents                            show which agent CLIs are installed
  mockup run <project> [options]           plan → build → export (autonomous)
  mockup build <project>                   re-render HTML from plan.json (keeps custom slides)
  mockup export <project> [--scale 1.5]    render PNGs + guardrail QA
  mockup validate <project>                validate plan.json
  mockup serve [--port 4280]               start the dashboard

Run options:
  --planner <heuristic|claude|codex|muse>  planning agent (default heuristic)
  --translator <claude|codex|muse>        fill missing locales (optional)
  --builder <template|claude|codex|muse>   review/build agent (default template)
  --rounds <n>                             builder review rounds (default 1)
  --steps plan,translate,build,export                subset of stages
  --model <id>                             model passed to the agent CLI
  --scale <1|1.5|2>                        phone export scale (1 → 1080×1920)

Projects dir: ${PROJECTS_DIR} (override with MOCKUP_PROJECTS_DIR)
Database:     ${DB_PATH} (override with MOCKUP_DB)`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    planner: { type: 'string', default: 'heuristic' },
    translator: { type: 'string' },
    builder: { type: 'string', default: 'template' },
    rounds: { type: 'string', default: '1' },
    steps: { type: 'string' },
    model: { type: 'string' },
    scale: { type: 'string', default: '1' },
    app: { type: 'string' },
    port: { type: 'string', default: process.env.PORT ?? '4280' },
    help: { type: 'boolean', short: 'h' },
  },
});

const [cmd, name] = positionals;
const log = (msg, level) => {
  const color = { stage: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m', success: '\x1b[32m', agent: '\x1b[2m', stderr: '\x1b[2m' }[level] ?? '';
  console.log(`${color}${msg}\x1b[0m`);
};

try {
  switch (values.help ? 'help' : cmd) {
    case 'new': {
      const p = await createProject(name);
      console.log(`Created ${p.paths.dir}\n  1. put screenshots in ${p.paths.screenshots}\n  2. (optional) put a sample listing in ${p.paths.reference} and an icon at ${p.paths.icon}\n  3. describe the app and each screen in ${p.paths.app}\n  4. mockup run ${name} --planner claude --builder claude`);
      break;
    }
    case 'list':
      console.table((await listProjects({ appId: values.app })).map(({ name, appId, label, planVersion, themePreset, screenshots, exported }) => ({ name, appId, label, planVersion, themePreset, screenshots, exported })));
      break;
    case 'apps':
      console.table(listApps().map(({ id, name, packageName, projects, planVersions, runs }) => ({ id, name, packageName, projects, planVersions, runs })));
      break;
    case 'group':
      console.table(groupProjects(name ?? 'app').map(({ names, ...g }) => ({ ...g, names: names.join(', ') })));
      break;
    case 'dump':
      console.log(JSON.stringify(await dumpProject(name), null, 2));
      break;
    case 'restore': {
      const p = await restoreProject(JSON.parse(await fs.readFile(name, 'utf8')));
      console.log(`restored ${p.name} (app ${p.appId})`);
      break;
    }
    case 'agents':
      console.table(await listAgents());
      break;
    case 'run': {
      const result = await runPipeline(name, {
        planner: values.planner, translator: values.translator, builder: values.builder, rounds: Number(values.rounds), model: values.model,
        scale: Number(values.scale), steps: values.steps?.split(','), log,
      });
      // Non-zero exit when any slide fails QA, so CI and scripts can gate on it.
      if (Object.values(result.qa?.slides ?? {}).some((r) => r.errors.length)) process.exitCode = 2;
      break;
    }
    case 'build':
      await runPipeline(name, { steps: ['build'], log });
      break;
    case 'export':
      await runPipeline(name, { steps: ['export'], scale: Number(values.scale), log });
      break;
    case 'validate': {
      const p = await loadProject(name);
      const v = validatePlan(p.plan, p);
      console.log(JSON.stringify(v, null, 2));
      process.exitCode = v.ok ? 0 : 1;
      break;
    }
    case 'serve': {
      const { startServer } = await import('./server.js');
      await startServer(Number(values.port));
      break;
    }
    default:
      console.log(HELP);
  }
} catch (err) {
  console.error(`\x1b[31m${err.message}\x1b[0m`);
  process.exitCode = 1;
}
