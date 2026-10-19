const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LAYOUTS = ['hero', 'device-bottom', 'device-top', 'tilted', 'two-devices', 'callouts', 'zoom', 'closer'];
const FG_LAYOUTS = ['fg-split', 'fg-centered', 'fg-fan'];
const ROLES = ['hero', 'differentiator', 'feature', 'proof', 'closer'];
const DECOR = ['blobs', 'grid', 'dots', 'glow', 'rings', 'noise'];
const CATEGORIES = ['finance', 'productivity', 'health', 'fitness', 'ai', 'social', 'food', 'travel', 'education', 'utilities', 'business', 'lifestyle', 'games', 'kids', 'music', 'weather', 'medical', 'general'];
const COLOR_KEYS = ['bg', 'bg2', 'text', 'muted', 'accent', 'accent2', 'surface', 'surfaceText'];

const state = { meta: null, project: null, name: null, plan: null, job: null, tab: 'inputs', bust: Date.now() };

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: opts.body && !(opts.body instanceof FormData) && typeof opts.body !== 'string' ? { 'Content-Type': 'application/json' } : opts.headers,
    body: opts.body && !(opts.body instanceof FormData) && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body,
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw Object.assign(new Error(data.error ?? data), { details: data.details });
  return data;
}

function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast ${err ? 'err' : ''}`;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), err ? 6000 : 2500);
}

const files = (kind, f) => `/files/${encodeURIComponent(state.name)}/${kind}/${encodeURIComponent(f)}?t=${state.bust}`;

// ---------- projects ----------
async function loadProjects() {
  const list = await api('/api/projects');
  $('#project-list').innerHTML = list.map((p) => `<a href="#${h(p.name)}" class="${p.name === state.name ? 'on' : ''}"><span>${h(p.name)}<br><small>${h(p.appName ?? '')}</small></span><small>${p.screenshots} shots · ${p.exported} png</small></a>`).join('') || '<div class="muted">No projects yet</div>';
}

async function openProject(name) {
  state.name = name;
  setProject(await api(`/api/projects/${encodeURIComponent(name)}`));
  $('#empty').hidden = true;
  $('#project').hidden = false;
  loadProjects();
}

function setProject(p) {
  state.project = p;
  state.plan = p.plan ? structuredClone(p.plan) : null;
  state.bust = Date.now();
  $('#p-title').textContent = p.app.name;
  $('#p-sub').textContent = `${p.dir} · ${p.screenshots.length} screenshots · ${p.references.length} reference · ${p.plan ? `plan by ${p.plan.generatedBy ?? 'hand'}` : 'no plan'}`;
  renderInputs();
  renderPlan();
  renderPreviews();
  renderExports();
}

// ---------- inputs ----------
function renderInputs() {
  const { app, screenshots, references, hasIcon } = state.project;
  const field = (k, label, type = 'text', wide = false) => `<label class="${wide ? 'wide' : ''}">${label}${type === 'textarea'
    ? `<textarea name="${k}">${h(app[k])}</textarea>`
    : `<input name="${k}" type="${type}" value="${h(app[k])}">`}</label>`;
  const brand = app.brandColors ?? [];
  $('#app-form').innerHTML = `
    ${field('name', 'App name')}
    ${field('packageName', 'Package name')}
    <label>Category<select name="category">${CATEGORIES.map((c) => `<option ${c === app.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    ${field('locale', 'Listing locale')}
    ${field('shortDescription', 'Short description (Play, ≤80 chars)', 'text', true)}
    ${field('fullDescription', 'Full description / what the app does', 'textarea', true)}
    ${field('audience', 'Target audience', 'text', true)}
    ${field('tone', 'Tone of voice', 'text', true)}
    <label class="wide">Features (one per line)<textarea name="features">${h((app.features ?? []).join('\n'))}</textarea></label>
    <label class="wide">True facts / badges (one per line — "No ads", "Works offline")<textarea name="facts">${h((app.facts ?? []).join('\n'))}</textarea></label>
    <label>Brand colours<div class="row">
      <input type="color" name="brand0" value="${brand[0] ?? '#7c6cff'}"><input type="color" name="brand1" value="${brand[1] ?? '#ff8a4c'}">
      <label class="row" style="flex-direction:row;font-size:12px"><input type="checkbox" name="useBrand" ${brand.length ? 'checked' : ''}> use</label></div></label>
    <label>Slides<input name="slideCount" type="number" min="2" max="8" value="${app.slideCount ?? 6}"></label>
    ${field('notes', 'Notes for the agents', 'textarea', true)}`;

  $('#shots').innerHTML = screenshots.map((s) => {
    const m = app.screens[s.file] ?? {};
    return `<div class="shot" data-file="${h(s.file)}">
      <img src="${files('input/screenshots', s.file)}" alt="">
      <div class="fields">
        <span class="name">${h(s.file)} · ${s.width}×${s.height}</span>
        <input data-k="title" placeholder="Screen name (e.g. Budgets)" value="${h(m.title)}">
        <input data-k="priority" type="number" min="0" max="10" title="priority (higher = earlier)" value="${m.priority ?? 0}">
        <textarea data-k="description" placeholder="What this screen shows and why users care">${h(m.description)}</textarea>
      </div>
      <button class="btn tiny danger" data-del="screenshots">✕</button>
    </div>`;
  }).join('') || '<div class="muted">No screenshots yet.</div>';

  $('#refs').innerHTML = references.map((r) => `<div class="ref" data-file="${h(r.file)}"><img src="${files('input/reference', r.file)}" alt=""><button class="btn tiny danger" data-del="reference">✕</button></div>`).join('');
  $('#icon-preview').hidden = !hasIcon;
  if (hasIcon) $('#icon-preview').src = `/files/${encodeURIComponent(state.name)}/input/icon.png?t=${state.bust}`;
}

function collectApp() {
  const f = new FormData($('#app-form'));
  const lines = (k) => String(f.get(k) ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
  const app = { ...state.project.app };
  for (const k of ['name', 'packageName', 'category', 'locale', 'shortDescription', 'fullDescription', 'audience', 'tone', 'notes']) app[k] = String(f.get(k) ?? '');
  app.features = lines('features');
  app.facts = lines('facts');
  app.slideCount = Number(f.get('slideCount')) || 6;
  app.brandColors = f.get('useBrand') ? [f.get('brand0'), f.get('brand1')] : [];
  app.screens = { ...app.screens };
  for (const el of $$('.shot')) {
    const file = el.dataset.file;
    app.screens[file] = {
      title: $('[data-k=title]', el).value,
      description: $('[data-k=description]', el).value,
      priority: Number($('[data-k=priority]', el).value) || 0,
    };
  }
  return app;
}

async function saveApp(quiet = false) {
  setProject(await api(`/api/projects/${encodeURIComponent(state.name)}/app`, { method: 'PUT', body: collectApp() }));
  if (!quiet) toast('App info saved');
}

async function uploadFiles(kind, list) {
  if (!list.length) return;
  if (kind === 'screenshots') await saveApp(true);
  const fd = new FormData();
  for (const f of list) fd.append('files', f);
  setProject(await api(`/api/projects/${encodeURIComponent(state.name)}/upload/${kind}`, { method: 'POST', body: fd }));
  toast(`Uploaded ${list.length} file(s)`);
}

// ---------- plan editor ----------
function sel(name, options, value, attrs = '') {
  return `<select name="${name}" ${attrs}>${options.map((o) => `<option ${o === value ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
}

function renderPlan() {
  const plan = state.plan;
  const v = state.project.validation;
  $('#plan-empty').hidden = !!plan;
  $('#plan-editor').hidden = !plan || !$('#plan-json').hidden;
  $('#plan-validation').innerHTML = v ? [
    v.errors.length ? `<div class="validation err"><b>Errors</b><ul>${v.errors.map((e) => `<li>${h(e)}</li>`).join('')}</ul></div>` : '',
    v.warnings.length ? `<div class="validation warn"><b>Warnings</b><ul>${v.warnings.map((e) => `<li>${h(e)}</li>`).join('')}</ul></div>` : '',
  ].join('') : '';
  if (!plan) return;
  $('#plan-json').value = JSON.stringify(plan, null, 2);
  const t = plan.theme;
  const preset = state.meta.presets;
  const shots = state.project.screenshots.map((s) => s.file);
  $('#theme-form').innerHTML = `
    <label class="wide">Preset ${sel('preset', preset, t.preset)}</label>
    ${COLOR_KEYS.map((k) => `<label>${k}<div class="row"><input type="color" data-color="${k}" value="${t.colors?.[k] ?? state.meta.presetData[t.preset]?.colors[k] ?? '#000000'}"><label class="row" style="flex-direction:row;font-size:11px"><input type="checkbox" data-override="${k}" ${t.colors?.[k] ? 'checked' : ''}> override</label></div></label>`).join('')}
    <label>Background ${sel('bgType', ['', 'linear', 'radial', 'mesh', 'solid'], t.background?.type ?? '')}</label>
    <label>Angle<input name="bgAngle" type="number" min="0" max="360" value="${t.background?.angle ?? ''}" placeholder="preset"></label>
    <label>Headline font<input name="fHead" value="${h(t.fonts?.headline ?? '')}" placeholder="preset"></label>
    <label>Body font<input name="fBody" value="${h(t.fonts?.body ?? '')}" placeholder="preset"></label>
    <label>Headline weight<input name="fWeight" type="number" min="300" max="900" step="100" value="${t.fonts?.headlineWeight ?? ''}" placeholder="preset"></label>
    <label>Headline case ${sel('hCase', ['', 'none', 'upper'], t.headlineCase ?? '')}</label>
    <label>Highlight ${sel('hlStyle', ['', 'color', 'gradient', 'marker', 'underline', 'none'], t.highlightStyle ?? '')}</label>
    <label>Device frame ${sel('frame', ['', 'dark', 'light', 'titanium', 'none'], t.device?.frame ?? '')}</label>
    <label>Device shadow ${sel('shadow', ['', 'soft', 'hard', 'none'], t.device?.shadow ?? '')}</label>
    <label class="wide">Decor <div class="row" style="flex-wrap:wrap">${DECOR.map((d) => `<label class="row" style="flex-direction:row"><input type="checkbox" data-decor="${d}" ${t.decor?.includes(d) ? 'checked' : ''}>${d}</label>`).join('')}</div></label>
    <label class="wide">Reference notes<textarea name="refNotes">${h(t.referenceNotes ?? '')}</textarea></label>`;

  $('#slides-form').innerHTML = plan.slides.map((s, i) => `
    <div class="slide-card" data-i="${i}">
      <header><b>${i + 1}. ${h(s.id)}</b>${s.mode === 'custom' ? '<span class="pill custom">custom</span>' : ''}
        <button class="btn tiny" data-move="-1">↑</button><button class="btn tiny" data-move="1">↓</button><button class="btn tiny danger" data-remove>✕</button></header>
      <div class="form">
        <label>Layout ${sel('layout', LAYOUTS, s.layout)}</label>
        <label>Role ${sel('role', ['', ...ROLES], s.role ?? '')}</label>
        <label>Screenshot ${sel('shot0', shots, s.screenshots[0])}</label>
        <label>2nd screenshot ${sel('shot1', ['', ...shots], s.screenshots[1] ?? '')}</label>
        <label class="wide">Headline<input name="headline" maxlength="44" value="${h(s.headline)}"></label>
        <label>Highlight<input name="highlight" value="${h(s.highlight ?? '')}"></label>
        <label>Eyebrow<input name="eyebrow" maxlength="30" value="${h(s.eyebrow ?? '')}"></label>
        <label class="wide">Subline<input name="subline" maxlength="90" value="${h(s.subline ?? '')}"></label>
        <label>Background ${sel('background', ['default', 'alt', 'accent'], s.background ?? 'default')}</label>
        <label>Callouts (comma)<input name="callouts" value="${h((s.callouts ?? []).join(', '))}"></label>
        <label class="wide">Badges (comma)<input name="badges" value="${h((s.badges ?? []).join(', '))}"></label>
        ${s.layout === 'zoom' ? `<label class="wide">Zoom focus x,y,w,h (0–1)<input name="focus" value="${s.focus ? [s.focus.x, s.focus.y, s.focus.w, s.focus.h].join(',') : '0.05,0.3,0.9,0.25'}"></label>` : ''}
      </div>
    </div>`).join('');

  const fg = plan.featureGraphic;
  $('#fg-form').innerHTML = `
    <label>Layout ${sel('layout', FG_LAYOUTS, fg.layout)}</label>
    <label>Highlight<input name="highlight" value="${h(fg.highlight ?? '')}"></label>
    <label class="wide">Tagline<input name="headline" maxlength="44" value="${h(fg.headline)}"></label>
    <label class="wide">Badges (comma)<input name="badges" value="${h((fg.badges ?? []).join(', '))}"></label>
    ${[0, 1, 2].map((i) => `<label>Screenshot ${i + 1} ${sel(`fg${i}`, ['', ...shots], fg.screenshots[i] ?? '')}</label>`).join('')}`;
}

const csv = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);
const setOpt = (obj, k, v) => { if (v === '' || v == null || (Array.isArray(v) && !v.length)) delete obj[k]; else obj[k] = v; };

function collectPlan() {
  if (!$('#plan-json').hidden) return JSON.parse($('#plan-json').value);
  const plan = structuredClone(state.plan);
  const tf = $('#theme-form');
  const val = (n, el = tf) => $(`[name="${n}"]`, el)?.value ?? '';
  const t = plan.theme;
  t.preset = val('preset');
  t.colors = {};
  for (const k of COLOR_KEYS) if ($(`[data-override="${k}"]`, tf).checked) t.colors[k] = $(`[data-color="${k}"]`, tf).value.toUpperCase();
  if (!Object.keys(t.colors).length) delete t.colors;
  t.background = {};
  setOpt(t.background, 'type', val('bgType'));
  setOpt(t.background, 'angle', val('bgAngle') === '' ? '' : Number(val('bgAngle')));
  if (!Object.keys(t.background).length) delete t.background;
  t.fonts = {};
  setOpt(t.fonts, 'headline', val('fHead'));
  setOpt(t.fonts, 'body', val('fBody'));
  setOpt(t.fonts, 'headlineWeight', val('fWeight') === '' ? '' : Number(val('fWeight')));
  if (!Object.keys(t.fonts).length) delete t.fonts;
  setOpt(t, 'headlineCase', val('hCase'));
  setOpt(t, 'highlightStyle', val('hlStyle'));
  t.device = {};
  setOpt(t.device, 'frame', val('frame'));
  setOpt(t.device, 'shadow', val('shadow'));
  if (!Object.keys(t.device).length) delete t.device;
  setOpt(t, 'decor', $$('[data-decor]', tf).filter((c) => c.checked).map((c) => c.dataset.decor));
  setOpt(t, 'referenceNotes', val('refNotes'));

  plan.slides = $$('.slide-card').map((card) => {
    const s = { ...state.plan.slides[Number(card.dataset.i)] };
    const v = (n) => val(n, card);
    s.layout = v('layout');
    setOpt(s, 'role', v('role'));
    s.screenshots = [v('shot0'), v('shot1')].filter(Boolean);
    s.headline = v('headline');
    for (const k of ['highlight', 'eyebrow', 'subline']) setOpt(s, k, v(k));
    setOpt(s, 'background', v('background') === 'default' ? '' : v('background'));
    setOpt(s, 'callouts', csv(v('callouts')));
    setOpt(s, 'badges', csv(v('badges')));
    if (s.layout === 'zoom') {
      const [x, y, w, hh] = v('focus').split(',').map(Number);
      s.focus = { x, y, w, h: hh };
    } else delete s.focus;
    return s;
  });
  const ff = $('#fg-form');
  const fg = plan.featureGraphic;
  fg.layout = val('layout', ff);
  fg.headline = val('headline', ff);
  setOpt(fg, 'highlight', val('highlight', ff));
  setOpt(fg, 'badges', csv(val('badges', ff)));
  fg.screenshots = [0, 1, 2].map((i) => val(`fg${i}`, ff)).filter(Boolean);
  return plan;
}

async function savePlan() {
  let plan;
  try { plan = collectPlan(); } catch (e) { return toast(`Invalid JSON: ${e.message}`, true); }
  $('#plan-status').textContent = 'Saving…';
  try {
    setProject(await api(`/api/projects/${encodeURIComponent(state.name)}/plan`, { method: 'PUT', body: plan }));
    $('#plan-status').textContent = 'Saved and re-rendered. Export to refresh PNGs.';
    toast('Plan saved');
  } catch (e) {
    $('#plan-status').textContent = '';
    const d = e.details;
    toast(d?.errors ? `Invalid plan: ${d.errors[0]}` : e.message, true);
  }
}

// ---------- previews ----------
function previewCard(e, scale) {
  const qa = state.project.qa?.slides?.[e.id];
  const [w, hgt] = e.kind === 'feature' ? [1024, 500] : [1080, 1920];
  const status = !qa ? '<span class="pill">not exported</span>' : qa.errors.length ? `<span class="pill err">${qa.errors.length} error</span>` : qa.warnings.length ? `<span class="pill warn">${qa.warnings.length} warn</span>` : '<span class="pill ok">QA ok</span>';
  return `<div class="preview" data-id="${h(e.id)}" data-kind="${e.kind}">
    <div class="frame" style="width:${w * scale}px;height:${hgt * scale}px"><iframe loading="lazy" src="/files/${encodeURIComponent(state.name)}/build/${encodeURIComponent(e.file)}?t=${state.bust}" style="width:${w}px;height:${hgt}px;transform:scale(${scale})" title="${h(e.id)}"></iframe></div>
    <div class="meta"><b>${e.index + 1}. ${h(e.id)}</b>${e.mode === 'custom' ? '<span class="pill custom">custom</span>' : ''}${status}</div>
    ${qa?.errors.length ? `<div class="issues">${qa.errors.map(h).join('<br>')}</div>` : ''}
  </div>`;
}

function renderPreviews() {
  const deck = state.project.deck ?? [];
  $('#previews').innerHTML = deck.length ? deck.map((e) => previewCard(e, e.kind === 'feature' ? 0.5 : 0.25)).join('') : '<div class="panel muted">Nothing rendered yet.</div>';
}

async function openSlide(id) {
  const e = state.project.deck.find((x) => x.id === id);
  const [w, hgt] = e.kind === 'feature' ? [1024, 500] : [1080, 1920];
  const dlg = $('#slide-dialog');
  dlg.dataset.id = id;
  $('#dlg-title').textContent = `${e.index + 1}. ${id}${e.mode === 'custom' ? ' (custom)' : ''}`;
  $('#dlg-code').value = await api(`/api/projects/${encodeURIComponent(state.name)}/slides/${encodeURIComponent(id)}/html`);
  dlg.showModal();
  const box = $('.dlg-preview');
  const scale = Math.min((box.parentElement.clientHeight - 32) / hgt, 560 / w);
  box.style.width = `${w * scale}px`;
  box.style.height = `${hgt * scale}px`;
  Object.assign($('#dlg-frame').style, { width: `${w}px`, height: `${hgt}px`, transform: `scale(${scale})` });
  $('#dlg-frame').src = `/files/${encodeURIComponent(state.name)}/build/${encodeURIComponent(e.file)}?t=${Date.now()}`;
}

// ---------- exports ----------
function renderExports() {
  const { exports } = state.project;
  const fig = (kind, f, w) => `<figure><img src="${files(`export/${kind}`, f)}" style="width:${w}px" alt=""><figcaption><span>${h(f)}</span><a href="${files(`export/${kind}`, f)}" download="${h(f)}">download</a></figcaption></figure>`;
  $('#exports').innerHTML = [...exports.feature.map((f) => fig('feature', f, 512)), ...exports.phone.map((f) => fig('phone', f, 240))].join('') || '<div class="panel muted">No PNGs yet — export first.</div>';
  $('#zip-btn').href = `/api/projects/${encodeURIComponent(state.name)}/download.zip`;
}

// ---------- jobs ----------
function attachJob(id, title) {
  state.job = id;
  const drawer = $('#log-drawer');
  drawer.hidden = false;
  $('#log').innerHTML = '';
  $('#log-title').textContent = title;
  $('#log-status').textContent = 'running';
  $('#log-status').className = 'pill warn';
  $('#run-all').disabled = true;
  const es = new EventSource(`/api/jobs/${id}/stream`);
  es.onmessage = async (m) => {
    const ev = JSON.parse(m.data);
    if (ev.level === 'end') {
      es.close();
      $('#run-all').disabled = false;
      $('#log-status').textContent = ev.msg;
      $('#log-status').className = `pill ${ev.msg === 'done' ? 'ok' : 'err'}`;
      await openProject(state.name);
      return;
    }
    const line = document.createElement('div');
    line.className = ev.level;
    line.textContent = ev.msg;
    $('#log').append(line);
    $('#log').scrollTop = $('#log').scrollHeight;
  };
}

async function run(body, title) {
  try {
    if (state.tab === 'inputs') await saveApp(true);
    const { id } = await api(`/api/projects/${encodeURIComponent(state.name)}/run`, { method: 'POST', body });
    attachJob(id, title);
  } catch (e) { toast(e.message, true); }
}

async function exportPngs() {
  try {
    const { id } = await api(`/api/projects/${encodeURIComponent(state.name)}/export`, { method: 'POST', body: { scale: Number($('#scale').value) } });
    attachJob(id, 'Export');
  } catch (e) { toast(e.message, true); }
}

// ---------- wiring ----------
function bindDrops() {
  for (const zone of $$('.drop')) {
    const kind = zone.dataset.kind;
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); uploadFiles(kind, [...e.dataTransfer.files]).catch((err) => toast(err.message, true)); });
    $('input[type=file]', zone).addEventListener('change', (e) => uploadFiles(kind, [...e.target.files]).catch((err) => toast(err.message, true)));
  }
}

function showTab(tab) {
  state.tab = tab;
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  $$('.tab').forEach((t) => (t.hidden = t.id !== `tab-${tab}`));
}

async function init() {
  state.meta = await api('/api/meta');
  $('#projects-dir').textContent = state.meta.projectsDir;
  const agentOpts = (first) => [`<option value="${first}">${first === 'heuristic' ? 'Heuristic (no AI)' : 'Template only'}</option>`,
    ...state.meta.agents.map((a) => `<option value="${a.id}" ${a.path ? '' : 'disabled'}>${h(a.label)}${a.path ? '' : ' (not installed)'}</option>`)].join('');
  $('#planner').innerHTML = agentOpts('heuristic');
  $('#builder').innerHTML = agentOpts('template');
  const firstAgent = state.meta.agents.find((a) => a.path);
  if (firstAgent) { $('#planner').value = firstAgent.id; $('#builder').value = firstAgent.id; }

  bindDrops();
  $('#tabs').addEventListener('click', (e) => e.target.dataset.tab && showTab(e.target.dataset.tab));
  $('#new-project').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = new FormData(e.target).get('name');
    try { await api('/api/projects', { method: 'POST', body: { name } }); e.target.reset(); location.hash = name; } catch (err) { toast(err.message, true); }
  });
  $('#duplicate').addEventListener('click', async () => {
    const to = prompt('Name for the copy', `${state.name}-v2`);
    if (!to) return;
    try { await api(`/api/projects/${encodeURIComponent(state.name)}/duplicate`, { method: 'POST', body: { to } }); location.hash = to; toast(`Duplicated as ${to}`); } catch (e) { toast(e.message, true); }
  });
  $('#save-app').addEventListener('click', () => saveApp().catch((e) => toast(e.message, true)));
  $('#shots').addEventListener('click', async (e) => {
    const kind = e.target.dataset.del;
    if (!kind) return;
    const file = e.target.closest('[data-file]').dataset.file;
    setProject(await api(`/api/projects/${encodeURIComponent(state.name)}/files/${kind}/${encodeURIComponent(file)}`, { method: 'DELETE' }));
  });
  $('#refs').addEventListener('click', async (e) => {
    if (!e.target.dataset.del) return;
    const file = e.target.closest('[data-file]').dataset.file;
    setProject(await api(`/api/projects/${encodeURIComponent(state.name)}/files/reference/${encodeURIComponent(file)}`, { method: 'DELETE' }));
  });
  $('#run-all').addEventListener('click', () => run({
    steps: ['plan', 'build', 'export'], planner: $('#planner').value, builder: $('#builder').value,
    rounds: Number($('#rounds').value), model: $('#model').value, scale: Number($('#scale').value),
  }, `Generate · ${$('#planner').value} → ${$('#builder').value}`));
  $('#plan-agent').addEventListener('click', () => run({ steps: ['plan', 'build'], planner: $('#planner').value, builder: 'template', model: $('#model').value }, `Plan · ${$('#planner').value}`));
  $('#plan-heuristic').addEventListener('click', async () => {
    try { setProject(await api(`/api/projects/${encodeURIComponent(state.name)}/plan/heuristic`, { method: 'POST' })); toast('Quick plan created'); } catch (e) { toast(e.message, true); }
  });
  $('#toggle-json').addEventListener('click', () => {
    const json = $('#plan-json');
    if (json.hidden) json.value = JSON.stringify(collectPlan(), null, 2);
    else { try { state.plan = JSON.parse(json.value); } catch (e) { return toast(`Invalid JSON: ${e.message}`, true); } }
    json.hidden = !json.hidden;
    $('#toggle-json').textContent = json.hidden ? 'Edit raw JSON' : 'Back to form';
    renderPlan();
  });
  $('#save-plan').addEventListener('click', savePlan);
  $('#add-slide').addEventListener('click', () => {
    state.plan = collectPlan();
    const n = state.plan.slides.length + 1;
    if (n > 8) return toast('Google Play allows at most 8 phone screenshots', true);
    state.plan.slides.push({ id: `s${n}-new`, layout: 'device-bottom', screenshots: [state.project.screenshots[0].file], headline: 'New headline' });
    renderPlan();
  });
  $('#slides-form').addEventListener('click', (e) => {
    const card = e.target.closest('.slide-card');
    if (!card) return;
    const i = Number(card.dataset.i);
    if (e.target.dataset.move || e.target.hasAttribute('data-remove')) {
      state.plan = collectPlan();
      if (e.target.hasAttribute('data-remove')) state.plan.slides.splice(i, 1);
      else {
        const j = i + Number(e.target.dataset.move);
        if (j < 0 || j >= state.plan.slides.length) return;
        [state.plan.slides[i], state.plan.slides[j]] = [state.plan.slides[j], state.plan.slides[i]];
      }
      renderPlan();
    }
  });
  $('#slides-form').addEventListener('change', (e) => { if (e.target.name === 'layout') { state.plan = collectPlan(); renderPlan(); } });
  $('#previews').addEventListener('click', (e) => { const p = e.target.closest('.preview'); if (p) openSlide(p.dataset.id); });
  $('#refresh-preview').addEventListener('click', () => openProject(state.name));
  $('#export-now').addEventListener('click', exportPngs);
  $('#export-btn').addEventListener('click', exportPngs);
  $('#dlg-close').addEventListener('click', () => $('#slide-dialog').close());
  $('#dlg-save').addEventListener('click', async () => {
    const id = $('#slide-dialog').dataset.id;
    try {
      setProject(await api(`/api/projects/${encodeURIComponent(state.name)}/slides/${encodeURIComponent(id)}/html`, { method: 'PUT', body: $('#dlg-code').value, headers: { 'Content-Type': 'text/plain' } }));
      $('#dlg-frame').src = $('#dlg-frame').src.replace(/t=\d+/, `t=${Date.now()}`);
      toast('Saved — slide is now custom');
    } catch (e) { toast(e.message, true); }
  });
  $('#dlg-reset').addEventListener('click', async () => {
    const id = $('#slide-dialog').dataset.id;
    setProject(await api(`/api/projects/${encodeURIComponent(state.name)}/slides/${encodeURIComponent(id)}/reset`, { method: 'POST' }));
    $('#slide-dialog').close();
    toast('Reset to template');
  });
  $('#log-close').addEventListener('click', () => ($('#log-drawer').hidden = true));
  $('#log-cancel').addEventListener('click', () => state.job && api(`/api/jobs/${state.job}/cancel`, { method: 'POST' }));

  window.addEventListener('hashchange', () => location.hash.length > 1 && openProject(decodeURIComponent(location.hash.slice(1))).catch((e) => toast(e.message, true)));
  await loadProjects();
  if (location.hash.length > 1) await openProject(decodeURIComponent(location.hash.slice(1))).catch((e) => toast(e.message, true));
}

init().catch((e) => toast(e.message, true));
