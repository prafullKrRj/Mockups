const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LAYOUTS = ['hero', 'device-bottom', 'device-top', 'tilted', 'two-devices', 'callouts', 'zoom', 'closer'];
const FG_LAYOUTS = ['fg-split', 'fg-centered', 'fg-fan'];
const ROLES = ['hero', 'differentiator', 'feature', 'proof', 'closer'];
const DECOR = ['blobs', 'grid', 'dots', 'glow', 'rings', 'noise'];
const CATEGORIES = ['finance', 'productivity', 'health', 'fitness', 'ai', 'social', 'food', 'travel', 'education', 'utilities', 'business', 'lifestyle', 'games', 'kids', 'music', 'weather', 'medical', 'general'];
const COLOR_KEYS = ['bg', 'bg2', 'text', 'muted', 'accent', 'accent2', 'surface', 'surfaceText'];

const state = { meta: null, project: null, name: null, plan: null, job: null, tab: 'inputs', locale: null, bust: Date.now(), appDirty: false, planDirty: false, appRevision: 0, planRevision: 0, saving: 0, opening: 0 };

function updateSaveStatus() {
  $('#save-status').textContent = state.saving ? 'Saving changes…' : state.appDirty || state.planDirty ? 'Unsaved changes' : 'All changes saved';
  $('#save-status').classList.toggle('unsaved', state.appDirty || state.planDirty);
}

function markDirty(kind) {
  state[`${kind}Dirty`] = true;
  state[`${kind}Revision`]++;
  updateSaveStatus();
}

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

const locales = () => state.project.app.locales ?? [state.project.app.locale || 'en-US'];
const copy = (value = '') => Array.isArray(value) ? value.map(copy) : typeof value === 'object' ? value[state.locale] ?? '' : value;
const exportsForLocale = () => state.project.exportsByLocale?.[state.locale] ?? state.project.exports;
const exportKind = (kind) => `export/${state.project.app.locales ? `${state.locale}/` : ''}${kind}`;
const localeQuery = () => `?locale=${encodeURIComponent(state.locale)}`;
function putCopy(obj, key, value) {
  const previous = obj[key];
  const assign = (old, next) => {
    if (typeof old === 'object' && old !== null) return { ...old, [state.locale]: next };
    if (old === next || locales().length === 1) return next;
    return { ...Object.fromEntries(locales().map((locale) => [locale, old ?? ''])), [state.locale]: next };
  };
  if (Array.isArray(value)) {
    const count = Math.max(value.length, previous?.length ?? 0);
    const items = Array.from({ length: count }, (_, i) => assign(previous?.[i], value[i] ?? ''));
    if (!items.length) delete obj[key];
    else obj[key] = items;
  } else if (value === '' && previous == null) delete obj[key];
  else obj[key] = assign(previous, value);
}

// ---------- projects ----------
async function loadProjects() {
  const list = await api('/api/projects');
  $('#project-count').textContent = list.length;
  $('#project-list').innerHTML = list.map((p) => `<a href="#${h(p.name)}" class="${p.name === state.name ? 'on' : ''}" ${p.name === state.name ? 'aria-current="page"' : ''}><span>${h(p.name)}<br><small>${h(p.appName ?? '')}</small></span><small>${p.screenshots} shots<br>${p.exported} PNGs</small></a>`).join('') || '<div class="sidebar-help">Your projects will appear here.</div>';
  filterProjects();
}

function filterProjects() {
  const query = $('#project-search').value.trim().toLowerCase();
  const links = $$('#project-list a');
  links.forEach((link) => { link.hidden = !link.textContent.toLowerCase().includes(query); });
  $('#search-empty').hidden = !query || links.some((link) => !link.hidden);
}

async function openProject(name) {
  if (state.name && name !== state.name && (state.appDirty || state.planDirty) && !confirm('This project has unsaved changes. Discard them and switch projects?')) {
    location.hash = encodeURIComponent(state.name);
    return;
  }
  const request = ++state.opening;
  const project = await api(`/api/projects/${encodeURIComponent(name)}`);
  if (request !== state.opening) return;
  if (name !== state.name) { state.appDirty = false; state.planDirty = false; }
  state.name = name;
  setProject(project);
  $('#empty').hidden = true;
  $('#project').hidden = false;
  await loadProjects();
}

function setProject(p) {
  const appDraft = state.appDirty ? collectApp() : null;
  const rawDraft = state.planDirty && !$('#plan-json').hidden ? $('#plan-json').value : null;
  const planDraft = state.planDirty ? rawDraft === null ? collectPlan() : state.plan : null;
  state.project = p;
  if (!locales().includes(state.locale)) state.locale = locales()[0];
  $('#locale').innerHTML = locales().map((locale) => `<option ${locale === state.locale ? 'selected' : ''}>${h(locale)}</option>`).join('');
  state.plan = planDraft ?? (p.plan ? structuredClone(p.plan) : null);
  state.bust = Date.now();
  $('#p-title').textContent = p.app.name;
  $('#workspace-name').textContent = p.name;
  $('#p-sub').textContent = `projects/${p.name} · ${p.screenshots.length} screenshots · ${p.references.length} reference · ${p.plan ? `plan by ${p.plan.generatedBy ?? 'hand'}` : 'no plan'}`;
  $('#shot-count').textContent = p.screenshots.length;
  const progress = [[p.screenshots.length, `${p.screenshots.length} screenshots`], [p.plan, 'Plan ready'], [p.deck?.length, 'Previews built'], [exportsForLocale().phone.length, 'PNGs exported']];
  $('#project-progress').innerHTML = progress.map(([done, label]) => `<span class="${done ? 'done' : ''}">${done ? '✓' : '○'} ${h(label)}</span>`).join('');
  renderInputs(appDraft ?? p.app);
  renderPlan();
  if (rawDraft !== null) $('#plan-json').value = rawDraft;
  renderPreviews();
  renderExports();
  renderStore();
  updateSaveStatus();
}

// ---------- inputs ----------
function renderInputs(app = state.project.app) {
  const { screenshots, references, hasIcon } = state.project;
  const field = (k, label, type = 'text', wide = false) => `<label class="${wide ? 'wide' : ''}">${label}${type === 'textarea'
    ? `<textarea name="${k}">${h(app[k])}</textarea>`
    : `<input name="${k}" type="${type}" ${k === 'shortDescription' ? 'maxlength="80"' : ''} value="${h(app[k])}">`}</label>`;
  const brand = app.brandColors ?? [];
  $('#app-form').innerHTML = `
    ${field('name', 'App name')}
    ${field('packageName', 'Package name')}
    <label>Category<select name="category">${CATEGORIES.map((c) => `<option ${c === app.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label>Listing locales (comma separated)<input name="locales" value="${h((app.locales ?? [app.locale || 'en-US']).join(', '))}"></label>
    ${field('shortDescription', 'Short description (Play, ≤80 chars)', 'text', true)}
    ${field('fullDescription', 'Full description / what the app does', 'textarea', true)}
    ${field('audience', 'Target audience', 'text', true)}
    ${field('tone', 'Tone of voice', 'text', true)}
    <label class="wide">Features (one per line)<textarea name="features">${h((app.features ?? []).join('\n'))}</textarea></label>
    <label class="wide">True facts / badges (one per line — "No ads", "Works offline")<textarea name="facts">${h((app.facts ?? []).join('\n'))}</textarea></label>
    <label>Brand colours<div class="row">
      <input type="color" name="brand0" value="${brand[0] ?? '#226447'}"><input type="color" name="brand1" value="${brand[1] ?? '#d4e8b8'}">
      <label class="row" style="flex-direction:row;font-size:12px"><input type="checkbox" name="useBrand" ${brand.length ? 'checked' : ''}> use</label></div></label>
    <label>Slides<input name="slideCount" type="number" min="2" max="8" value="${app.slideCount ?? 6}"></label>
    ${field('notes', 'Notes for the agents', 'textarea', true)}`;

  $('#shots').innerHTML = screenshots.map((s) => {
    const m = app.screens[s.file] ?? {};
    return `<div class="shot" data-file="${h(s.file)}">
      <img src="${files('input/screenshots', s.file)}" alt="${h(m.title || s.file)}">
      <div class="fields">
        <span class="name">${h(s.file)} · ${s.width}×${s.height}</span>
        <input data-k="title" aria-label="Screen name" placeholder="Screen name (e.g. Budgets)" value="${h(m.title)}">
        <input data-k="priority" aria-label="Screen priority" type="number" min="0" max="10" title="priority (higher = earlier)" value="${m.priority ?? 0}">
        <textarea data-k="description" aria-label="Screen description" placeholder="What this screen shows and why users care">${h(m.description)}</textarea>
      </div>
      <button class="btn tiny danger" data-del="screenshots" aria-label="Delete ${h(s.file)}">✕</button>
    </div>`;
  }).join('') || '<div class="muted">No screenshots yet.</div>';

  $('#refs').innerHTML = references.map((r) => `<div class="ref" data-file="${h(r.file)}"><img src="${files('input/reference', r.file)}" alt=""><button class="btn tiny danger" data-del="reference">✕</button></div>`).join('');
  $('#icon-preview').hidden = !hasIcon;
  if (hasIcon) $('#icon-preview').src = `/files/${encodeURIComponent(state.name)}/input/icon.png?t=${state.bust}`;
  renderCounters($('#app-form'));
}

function renderCounters(root) {
  for (const input of $$('[maxlength]', root)) {
    const count = document.createElement('small');
    count.className = 'field-count';
    input.after(count);
    const update = () => { count.textContent = `${input.value.length} / ${input.maxLength}`; count.classList.toggle('at-limit', input.value.length >= input.maxLength); };
    input.addEventListener('input', update);
    update();
  }
}

function collectApp() {
  const f = new FormData($('#app-form'));
  const lines = (k) => String(f.get(k) ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
  const app = { ...state.project.app };
  for (const k of ['name', 'packageName', 'category', 'shortDescription', 'fullDescription', 'audience', 'tone', 'notes']) app[k] = String(f.get(k) ?? '');
  const selected = csv(String(f.get('locales') ?? ''));
  if (app.locales || selected.length !== 1 || selected[0] !== app.locale) app.locales = selected;
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
  const name = state.name;
  const revision = state.appRevision;
  state.saving++;
  $('#save-app').disabled = true;
  updateSaveStatus();
  try {
    const project = await api(`/api/projects/${encodeURIComponent(name)}/app`, { method: 'PUT', body: collectApp() });
    if (name !== state.name) return;
    if (revision === state.appRevision) state.appDirty = false;
    setProject(project);
    if (!quiet) toast('App info saved');
  } finally { state.saving--; $('#save-app').disabled = false; updateSaveStatus(); }
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
  $('#theme-gallery').hidden = !plan;
  if (!plan) return;
  renderGallery(plan.theme.preset);
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
      <header><b>${i + 1}. ${h(s.id)}</b>${copy(s.mode) === 'custom' ? '<span class="pill custom">custom</span>' : ''}
        <button class="btn tiny" data-move="-1">↑</button><button class="btn tiny" data-move="1">↓</button><button class="btn tiny danger" data-remove>✕</button></header>
      <div class="form">
        <label>Layout ${sel('layout', LAYOUTS, s.layout)}</label>
        <label>Role ${sel('role', ['', ...ROLES], s.role ?? '')}</label>
        <label>Screenshot ${sel('shot0', shots, s.screenshots[0])}</label>
        <label>2nd screenshot ${sel('shot1', ['', ...shots], s.screenshots[1] ?? '')}</label>
        <label class="wide">Headline<input name="headline" maxlength="44" value="${h(copy(s.headline))}"></label>
        <label>Highlight<input name="highlight" value="${h(copy(s.highlight ?? ''))}"></label>
        <label>Eyebrow<input name="eyebrow" maxlength="30" value="${h(copy(s.eyebrow ?? ''))}"></label>
        <label class="wide">Subline<input name="subline" maxlength="90" value="${h(copy(s.subline ?? ''))}"></label>
        <label>Background ${sel('background', ['default', 'alt', 'accent'], s.background ?? 'default')}</label>
        <label>Callouts (comma)<input name="callouts" value="${h(listText(s.callouts))}"></label>
        <label class="wide">Badges (comma)<input name="badges" value="${h(listText(s.badges))}"></label>
        ${s.layout === 'zoom' ? `<label class="wide">Zoom focus x,y,w,h (0–1)<input name="focus" value="${s.focus ? [s.focus.x, s.focus.y, s.focus.w, s.focus.h].join(',') : '0.05,0.3,0.9,0.25'}"></label>` : ''}
      </div>
    </div>`).join('');

  const fg = plan.featureGraphic;
  $('#fg-form').innerHTML = `
    <label>Layout ${sel('layout', FG_LAYOUTS, fg.layout)}</label>
    <label>Highlight<input name="highlight" value="${h(copy(fg.highlight ?? ''))}"></label>
    <label class="wide">Tagline<input name="headline" maxlength="44" value="${h(copy(fg.headline))}"></label>
    <label class="wide">Badges (comma)<input name="badges" value="${h(listText(fg.badges))}"></label>
    ${[0, 1, 2].map((i) => `<label>Screenshot ${i + 1} ${sel(`fg${i}`, ['', ...shots], fg.screenshots[i] ?? '')}</label>`).join('')}`;
  renderCounters($('#plan-editor'));
}

const SOOTHING = ['sage-mist', 'sand-dune', 'harbor-night', 'dusk-rose', 'fog-lilac', 'ocean-calm', 'clay-wellness'];

function renderGallery(current) {
  const presets = state.meta.presetData;
  if (!$('#preset-fonts')) {
    const fams = [...new Set(Object.values(presets).map((p) => `family=${p.fonts.headline.replace(/ /g, '+')}:wght@${p.fonts.headlineWeight}`))];
    document.head.insertAdjacentHTML('beforeend', `<link id="preset-fonts" rel="stylesheet" href="https://fonts.googleapis.com/css2?${fams.join('&')}&display=swap">`);
  }
  const order = [...SOOTHING, ...Object.keys(presets).filter((k) => !SOOTHING.includes(k))];
  $('#theme-gallery').innerHTML = order.filter((k) => presets[k]).map((k) => {
    const c = presets[k].colors;
    return `<button class="swatch ${k === current ? 'on' : ''}" data-preset="${k}" style="background:linear-gradient(160deg, ${c.bg}, ${c.bg2});color:${c.text}">
      <b style="font-family:'${presets[k].fonts.headline}',sans-serif;font-weight:${presets[k].fonts.headlineWeight}">Aa</b>
      <span class="dots"><i style="background:${c.accent}"></i><i style="background:${c.accent2}"></i><i style="background:${c.text}"></i></span>
      <small>${k}${SOOTHING.includes(k) ? ' · calm' : ''}</small></button>`;
  }).join('');
}

const listText = (value) => copy(value ?? []).join(', ').replace(/(?:,\s*)+$/, '');
const copyList = (value) => value.trim() ? value.split(',').map((s) => s.trim()) : [];
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
    putCopy(s, 'headline', v('headline'));
    for (const k of ['highlight', 'eyebrow', 'subline']) putCopy(s, k, v(k));
    setOpt(s, 'background', v('background') === 'default' ? '' : v('background'));
    putCopy(s, 'callouts', copyList(v('callouts')));
    putCopy(s, 'badges', copyList(v('badges')));
    if (s.layout === 'zoom') {
      const [x, y, w, hh] = v('focus').split(',').map(Number);
      s.focus = { x, y, w, h: hh };
    } else delete s.focus;
    return s;
  });
  const ff = $('#fg-form');
  const fg = plan.featureGraphic;
  fg.layout = val('layout', ff);
  putCopy(fg, 'headline', val('headline', ff));
  putCopy(fg, 'highlight', val('highlight', ff));
  putCopy(fg, 'badges', copyList(val('badges', ff)));
  fg.screenshots = [0, 1, 2].map((i) => val(`fg${i}`, ff)).filter(Boolean);
  return plan;
}

async function savePlan() {
  let plan;
  try { plan = collectPlan(); } catch (e) { return toast(`Invalid JSON: ${e.message}`, true); }
  $('#plan-status').textContent = 'Saving…';
  const name = state.name;
  const revision = state.planRevision;
  state.saving++;
  $('#save-plan').disabled = true;
  updateSaveStatus();
  try {
    const project = await api(`/api/projects/${encodeURIComponent(name)}/plan`, { method: 'PUT', body: plan });
    if (name !== state.name) return;
    if (revision === state.planRevision) state.planDirty = false;
    setProject(project);
    $('#plan-status').textContent = 'Saved and re-rendered. Export to refresh PNGs.';
    toast('Plan saved');
  } catch (e) {
    $('#plan-status').textContent = '';
    const d = e.details;
    toast(d?.errors ? `Invalid plan: ${d.errors[0]}` : e.message, true);
  } finally { state.saving--; $('#save-plan').disabled = false; updateSaveStatus(); }
}

// ---------- previews ----------
function previewCard(e, scale) {
  const qa = state.project.qa?.slides?.[e.key];
  const [w, hgt] = e.kind === 'feature' ? [1024, 500] : [1080, 1920];
  const main = $('main');
  const style = getComputedStyle(main);
  scale = Math.min(scale, (main.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)) / w);
  const status = !qa ? '<span class="pill">not exported</span>' : qa.errors.length ? `<span class="pill err">${qa.errors.length} error</span>` : qa.warnings.length ? `<span class="pill warn">${qa.warnings.length} warn</span>` : '<span class="pill ok">QA ok</span>';
  return `<div class="preview" role="button" tabindex="0" aria-label="Edit ${h(e.id)}" data-id="${h(e.id)}" data-kind="${e.kind}">
    <div class="frame" style="width:${w * scale}px;height:${hgt * scale}px"><iframe loading="lazy" src="/files/${encodeURIComponent(state.name)}/build/${encodeURIComponent(e.file)}?t=${state.bust}" style="width:${w}px;height:${hgt}px;transform:scale(${scale})" title="${h(e.id)}"></iframe></div>
    <div class="meta"><b>${e.index + 1}. ${h(e.id)}</b>${e.mode === 'custom' ? '<span class="pill custom">custom</span>' : ''}${status}</div>
    ${qa?.errors.length ? `<div class="issues">${qa.errors.map(h).join('<br>')}</div>` : ''}
  </div>`;
}

function renderPreviews() {
  const deck = (state.project.deck ?? []).filter((e) => e.locale === state.locale);
  const refs = state.project.references;
  $('#ref-strip').hidden = !refs.length;
  $('#ref-strip').innerHTML = refs.length ? `<span class="muted">Reference</span>${refs.map((r) => `<img src="${files('input/reference', r.file)}" alt="">`).join('')}` : '';
  $('#previews').innerHTML = deck.length ? deck.map((e) => previewCard(e, e.kind === 'feature' ? 0.5 : 0.25)).join('') : '<div class="panel muted">Nothing rendered yet.</div>';
}

async function openSlide(id) {
  const e = state.project.deck.find((x) => x.id === id && x.locale === state.locale);
  const [w, hgt] = e.kind === 'feature' ? [1024, 500] : [1080, 1920];
  const dlg = $('#slide-dialog');
  dlg.dataset.id = id;
  $('#dlg-title').textContent = `${e.index + 1}. ${id}${e.mode === 'custom' ? ' (custom)' : ''}`;
  $('#dlg-code').value = await api(`/api/projects/${encodeURIComponent(state.name)}/slides/${encodeURIComponent(id)}/html${localeQuery()}`);
  dlg.showModal();
  const box = $('.dlg-preview');
  const availableWidth = window.innerWidth <= 760 ? dlg.clientWidth - 32 : dlg.clientWidth * 0.45;
  const scale = Math.min((box.parentElement.clientHeight - 32) / hgt, availableWidth / w, 560 / w);
  box.style.width = `${w * scale}px`;
  box.style.height = `${hgt * scale}px`;
  Object.assign($('#dlg-frame').style, { width: `${w}px`, height: `${hgt}px`, transform: `scale(${scale})` });
  $('#dlg-frame').src = `/files/${encodeURIComponent(state.name)}/build/${encodeURIComponent(e.file)}?t=${Date.now()}`;
}

// ---------- exports ----------
function renderExports() {
  const exports = exportsForLocale();
  const fig = (kind, f, w) => `<figure><img src="${files(exportKind(kind), f)}" style="width:${w}px" alt=""><figcaption><span>${h(f)}</span><a href="${files(exportKind(kind), f)}" download="${h(f)}">download</a></figcaption></figure>`;
  $('#exports').innerHTML = [...exports.feature.map((f) => fig('feature', f, 512)), ...exports.phone.map((f) => fig('phone', f, 240))].join('') || '<div class="panel muted">No PNGs yet — export first.</div>';
  $('#zip-btn').href = `/api/projects/${encodeURIComponent(state.name)}/download.zip`;
}

function renderStore() {
  const { app, hasIcon } = state.project;
  const exports = exportsForLocale();
  const fg = exports.feature[0];
  $('#play').innerHTML = `
    ${fg ? `<img class="fg" src="${files(exportKind('feature'), fg)}" alt="">` : '<div class="fg"></div>'}
    <div class="head">${hasIcon ? `<img src="/files/${encodeURIComponent(state.name)}/input/icon.png?t=${state.bust}" alt="">` : '<div class="ph"></div>'}
      <div><b>${h(app.name)}</b><small>${h(app.packageName || 'your developer name')}</small></div></div>
    <div class="install">Install</div>
    <div class="carousel">${exports.phone.map((f) => `<img src="${files(exportKind('phone'), f)}" alt="">`).join('') || '<span class="muted">Export to see screenshots</span>'}</div>
    <div class="about"><b>About this app</b>${h(app.shortDescription || 'Add a short description in Inputs.')}</div>`;
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
    const input = $('input[type=file]', zone);
    zone.tabIndex = 0;
    zone.setAttribute('role', 'button');
    zone.setAttribute('aria-label', `Upload ${kind === 'reference' ? 'reference images' : kind}`);
    zone.addEventListener('click', (e) => { if (e.target !== input && zone.getAttribute('aria-busy') !== 'true') input.click(); });
    zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); zone.click(); } });
    const upload = async (list) => {
      if (!list.length || zone.getAttribute('aria-busy') === 'true') return;
      zone.setAttribute('aria-busy', 'true');
      try { await uploadFiles(kind, list); } catch (err) { toast(err.message, true); }
      finally { zone.setAttribute('aria-busy', 'false'); input.value = ''; }
    };
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); upload([...e.dataTransfer.files]); });
    input.addEventListener('change', () => upload([...input.files]));
  }
}

function showTab(tab) {
  state.tab = tab;
  $$('#tabs button').forEach((b) => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-current', b.dataset.tab === tab ? 'step' : 'false'); });
  $$('.tab').forEach((t) => (t.hidden = t.id !== `tab-${tab}`));
  const sections = {
    inputs: ['Start with your app.', 'Give your listing a story. Add app details and the screens you want to showcase.'],
    plan: ['Find your visual direction.', 'Choose a theme, refine your copy, and arrange the story across your slides.'],
    preview: ['See the bigger picture.', 'Review every slide. Open a preview to fine-tune its design.'],
    export: ['Ready for your next launch.', 'Export crisp PNGs at your chosen scale, then download your listing.'],
    store: ['Your listing, in context.', 'Check how your graphics and copy read together on Google Play.'],
  };
  $('#section-title').textContent = sections[tab][0];
  $('#section-description').textContent = sections[tab][1];
  $('#section-step').textContent = `Step ${Object.keys(sections).indexOf(tab) + 1} of 5`;
}

async function init() {
  state.meta = await api('/api/meta');
  $('#projects-dir').textContent = `${state.meta.projectsDir.split('/').slice(-2).join('/')}/`;
  $('#projects-dir').title = state.meta.projectsDir;
  const agentOpts = (first) => [`<option value="${first}">${first === '' ? 'Skip translation' : first === 'heuristic' ? 'Heuristic (no AI)' : 'Template only'}</option>`,
    ...state.meta.agents.map((a) => `<option value="${a.id}" ${a.path ? '' : 'disabled'}>${h(a.label)}${a.path ? '' : ' (not installed)'}</option>`)].join('');
  $('#planner').innerHTML = agentOpts('heuristic');
  $('#translator').innerHTML = agentOpts('');
  $('#builder').innerHTML = agentOpts('template');
  const firstAgent = state.meta.agents.find((a) => a.path);
  if (firstAgent) { $('#planner').value = firstAgent.id; $('#builder').value = firstAgent.id; }

  bindDrops();
  $('#tab-inputs').addEventListener('input', (e) => { if (e.target.type !== 'file') markDirty('app'); });
  $('#tab-plan').addEventListener('input', () => markDirty('plan'));
  window.addEventListener('beforeunload', (e) => { if (state.appDirty || state.planDirty) { e.preventDefault(); e.returnValue = ''; } });
  let previewWidth = 0;
  new ResizeObserver(([entry]) => {
    if (entry.contentRect.width === previewWidth) return;
    previewWidth = entry.contentRect.width;
    if (state.project) renderPreviews();
  }).observe($('#main'));
  showTab('inputs');
  $('#project-search').addEventListener('input', filterProjects);
  $('#start-project').addEventListener('click', () => { $('#new-name').scrollIntoView({ block: 'center' }); $('#new-name').focus(); });
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
  $('#locale').addEventListener('change', () => {
    try {
      if (state.plan) state.plan = collectPlan();
      state.locale = $('#locale').value;
      renderPlan(); renderPreviews(); renderExports(); renderStore();
    } catch (e) { $('#locale').value = state.locale; toast(e.message, true); }
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
    steps: ['plan', 'translate', 'build', 'export'], translator: $('#translator').value || undefined, planner: $('#planner').value, builder: $('#builder').value,
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
  // Picking a preset drops token overrides so the preset shows as designed; copy and layouts are kept.
  $('#theme-gallery').addEventListener('click', (e) => {
    const b = e.target.closest('.swatch');
    if (!b) return;
    state.plan = collectPlan();
    state.plan.theme = { preset: b.dataset.preset, ...(state.plan.theme.referenceNotes ? { referenceNotes: state.plan.theme.referenceNotes } : {}) };
    markDirty('plan');
    renderPlan();
    savePlan();
  });
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      if ($('#slide-dialog').open) $('#dlg-save').click();
      else if (state.tab === 'inputs') saveApp().catch((err) => toast(err.message, true));
      else if (state.plan) savePlan();
    }
  });
  $('#add-slide').addEventListener('click', () => {
    state.plan = collectPlan();
    const n = state.plan.slides.length + 1;
    if (n > 8) return toast('Google Play allows at most 8 phone screenshots', true);
    state.plan.slides.push({ id: `s${n}-new`, layout: 'device-bottom', screenshots: [state.project.screenshots[0].file], headline: 'New headline' });
    markDirty('plan');
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
      markDirty('plan');
      renderPlan();
    }
  });
  $('#slides-form').addEventListener('change', (e) => { if (e.target.name === 'layout') { state.plan = collectPlan(); renderPlan(); } });
  $('#previews').addEventListener('click', (e) => { const p = e.target.closest('.preview'); if (p) openSlide(p.dataset.id).catch((err) => toast(err.message, true)); });
  $('#previews').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.target.closest('.preview')?.click(); } });
  $('#refresh-preview').addEventListener('click', () => openProject(state.name));
  $('#export-now').addEventListener('click', exportPngs);
  $('#export-btn').addEventListener('click', exportPngs);
  $('#dlg-close').addEventListener('click', () => $('#slide-dialog').close());
  $('#dlg-save').addEventListener('click', async () => {
    const id = $('#slide-dialog').dataset.id;
    try {
      setProject(await api(`/api/projects/${encodeURIComponent(state.name)}/slides/${encodeURIComponent(id)}/html${localeQuery()}`, { method: 'PUT', body: $('#dlg-code').value, headers: { 'Content-Type': 'text/plain' } }));
      $('#dlg-frame').src = $('#dlg-frame').src.replace(/t=\d+/, `t=${Date.now()}`);
      toast('Saved — slide is now custom');
    } catch (e) { toast(e.message, true); }
  });
  $('#dlg-reset').addEventListener('click', async () => {
    const id = $('#slide-dialog').dataset.id;
    setProject(await api(`/api/projects/${encodeURIComponent(state.name)}/slides/${encodeURIComponent(id)}/reset${localeQuery()}`, { method: 'POST' }));
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
