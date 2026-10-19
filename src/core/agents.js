import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG_DIR } from './paths.js';

export async function loadAgents() {
  const cfg = JSON.parse(await fs.readFile(path.join(CONFIG_DIR, 'agents.json'), 'utf8'));
  delete cfg.$comment;
  return cfg;
}

export async function listAgents() {
  const cfg = await loadAgents();
  const which = (cmd) => new Promise((resolve) => {
    const p = spawn('/bin/sh', ['-lc', `command -v ${JSON.stringify(cmd)}`]);
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('close', (code) => resolve(code === 0 ? out.trim() : null));
  });
  return Promise.all(Object.entries(cfg).map(async ([id, a]) => ({ id, label: a.label ?? id, path: await which(a.command) })));
}

function expandArgs(agent, { prompt, project, root, images, model }) {
  const out = [];
  for (const a of agent.args) {
    if (a === '{images}') {
      for (const img of images) out.push(...(agent.imageArgs ?? []).map((x) => x.replace('{image}', img)));
      continue;
    }
    out.push(a.replace('{prompt}', prompt).replace('{project}', project).replace('{root}', root));
  }
  if (model && agent.modelArgs) out.push(...agent.modelArgs.map((x) => x.replace('{model}', model)));
  return out;
}

// Claude's stream-json is one JSON event per line; surface tool calls and text, not the raw firehose.
function summarizeClaudeEvent(line) {
  let ev;
  try { ev = JSON.parse(line); } catch { return line; }
  if (ev.type === 'assistant') {
    return (ev.message?.content ?? []).map((c) => {
      if (c.type === 'text') return c.text.trim();
      if (c.type === 'tool_use') return `→ ${c.name} ${c.input?.file_path ?? c.input?.pattern ?? ''}`.trim();
      return '';
    }).filter(Boolean).join('\n') || null;
  }
  if (ev.type === 'result') return `[agent done: ${ev.subtype}${ev.total_cost_usd ? `, $${ev.total_cost_usd.toFixed(3)}` : ''}]`;
  return null;
}

/**
 * Run one agent turn headless in the project directory.
 * Resolves with { code, output }; rejects only on spawn failure. `signal` (AbortSignal) kills the process.
 */
export async function runAgent({ agentId, prompt, project, root, images = [], model, timeoutMs = 20 * 60 * 1000, log = () => {}, signal }) {
  const cfg = await loadAgents();
  const agent = cfg[agentId];
  if (!agent) throw Object.assign(new Error(`Unknown agent "${agentId}". Configure it in config/agents.json`), { status: 400 });
  let fullPrompt = prompt;
  if (agent.imagesViaPrompt && images.length) {
    fullPrompt += `\n\n## Images you must look at (use your Read tool on each)\n${images.map((i) => `- ${i}`).join('\n')}\n`;
  }
  const args = expandArgs(agent, { prompt: fullPrompt, project, root, images, model });
  await fs.mkdir(path.join(project, '.runs'), { recursive: true });
  await fs.writeFile(path.join(project, '.runs', `last-${agentId}-prompt.md`), fullPrompt);
  log(`$ ${agent.command} ${agent.args[0]} … (${images.length} image(s))`);

  return new Promise((resolve, reject) => {
    const child = spawn(agent.command, args, { cwd: project, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let buf = '';
    const onLine = (line) => {
      if (!line.trim()) return;
      const shown = agent.output === 'claude-stream-json' ? summarizeClaudeEvent(line) : line;
      if (shown) log(shown, 'agent');
    };
    child.stdout.on('data', (d) => {
      const s = d.toString();
      output += s;
      buf += s;
      const lines = buf.split('\n');
      buf = lines.pop();
      lines.forEach(onLine);
    });
    child.stderr.on('data', (d) => log(d.toString().trimEnd(), 'stderr'));
    const timer = setTimeout(() => { log(`agent timed out after ${timeoutMs / 1000}s`, 'error'); child.kill('SIGTERM'); }, timeoutMs);
    const abort = () => child.kill('SIGTERM');
    signal?.addEventListener('abort', abort, { once: true });
    child.on('error', (err) => { clearTimeout(timer); reject(Object.assign(err, { message: `Could not start ${agent.command}: ${err.message}` })); });
    child.on('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (buf) onLine(buf);
      resolve({ code, output });
    });
  });
}
