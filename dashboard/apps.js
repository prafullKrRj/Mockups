// App view: every listing project of one app, grouped, with a side-by-side comparison of the chosen variants.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = encodeURIComponent;

/** Sidebar markup: projects under a heading per app, each heading with a Compare button. */
export function groupedProjectList(list, current) {
  const groups = new Map();
  for (const p of list) {
    if (!groups.has(p.appId)) groups.set(p.appId, { name: p.appName || p.appId, items: [] });
    groups.get(p.appId).items.push(p);
  }
  return [...groups].map(([id, g]) => `<div class="app-group" data-app="${h(id)}">
    <div class="app-group-head"><span title="${h(id)}">${h(g.name)} <small>${g.items.length}</small></span>
      <button type="button" class="link-btn" data-open-app="${h(id)}" aria-label="Compare listings of ${h(g.name)}">Compare</button></div>
    ${g.items.map((p) => `<a href="#${h(p.name)}" class="${p.name === current ? 'on' : ''}" ${p.name === current ? 'aria-current="page"' : ''}><span>${h(p.name)}<br><small>${h(p.label || p.themePreset || p.appName || '')}</small></span><small>${p.screenshots} shots<br>${p.exported} PNGs</small></a>`).join('')}
  </div>`).join('');
}

const view = { app: null, apps: [], selected: new Set(), ctx: null };

export async function openApp(id, ctx) {
  view.ctx = ctx;
  const [app, apps] = await Promise.all([ctx.api(`/api/apps/${enc(id)}`), ctx.api('/api/apps')]);
  if (view.app?.id !== app.id) view.selected = new Set(app.projects.slice(0, 3).map((p) => p.name));
  view.app = app;
  view.apps = apps;
  renderApp();
  await renderCompare();
}

function renderApp() {
  const { app, apps } = view;
  $('#a-title').textContent = app.name;
  $('#a-sub').textContent = [app.id, app.packageName, app.category, `${app.projects.length} listing${app.projects.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
  const others = apps.filter((a) => a.id !== app.id);
  $('#variants').innerHTML = app.projects.map((p) => `<tr>
    <td><input type="checkbox" data-pick="${h(p.name)}" ${view.selected.has(p.name) ? 'checked' : ''} aria-label="Compare ${h(p.name)}"></td>
    <td><a href="#${h(p.name)}">${h(p.name)}</a></td>
    <td><input class="label-input" data-label="${h(p.name)}" value="${h(p.label)}" placeholder="label" aria-label="Label for ${h(p.name)}" maxlength="80"></td>
    <td>${h(p.themePreset ?? '—')}</td><td>${h(p.generatedBy ?? '—')}</td>
    <td>${p.planVersion ? `v${p.planVersion}` : '—'}</td><td>${p.slideCount || '—'}</td><td>${p.exported}</td>
    <td><select data-move="${h(p.name)}" aria-label="Move ${h(p.name)} to another app"><option value="">—</option>${others.map((a) => `<option value="${h(a.id)}">${h(a.name)}</option>`).join('')}</select></td>
  </tr>`).join('');
  $('#compare-count').textContent = `${view.selected.size} selected`;
}

async function renderCompare() {
  const names = [...view.selected];
  const box = $('#compare');
  if (!names.length) { box.innerHTML = '<div class="empty-panel">Tick two or more listings above to compare them side by side.</div>'; return; }
  const { projects } = await view.ctx.api(`/api/apps/${enc(view.app.id)}/compare?projects=${names.map(enc).join(',')}`);
  const presets = view.ctx.meta().presetData;
  box.style.setProperty('--cols', projects.length);
  box.innerHTML = projects.map((p) => {
    const colors = p.plan?.theme ? { ...presets[p.plan.theme.preset]?.colors, ...p.plan.theme.colors } : {};
    const qa = p.qa.checked ? (p.qa.errors ? `<span class="pill err">${p.qa.errors} QA errors</span>` : '<span class="pill ok">QA passed</span>') : '<span class="pill">Not exported</span>';
    return `<article class="compare-col">
      <header><a href="#${h(p.name)}"><b>${h(p.label || p.name)}</b></a>${p.label ? `<small>${h(p.name)}</small>` : ''}</header>
      <div class="compare-meta">${p.plan ? `theme <b>${h(p.plan.theme?.preset ?? 'custom')}</b> · by ${h(p.plan.generatedBy ?? 'hand')} · v${p.plan.version} · ${p.slides} slides` : 'No plan yet'} ${qa}</div>
      <div class="swatches">${Object.values(colors).slice(0, 8).map((c) => `<i style="background:${h(c)}" title="${h(c)}"></i>`).join('')}</div>
      ${p.exports.feature[0] ? `<img class="compare-feature" src="${h(p.exports.feature[0])}?t=${Date.now()}" alt="Feature graphic of ${h(p.name)}" loading="lazy">` : ''}
      <div class="compare-strip">${p.exports.phone.map((u) => `<img src="${h(u)}?t=${Date.now()}" alt="" loading="lazy">`).join('') || '<span class="muted">Export to see slides</span>'}</div>
      <ol class="compare-headlines">${(p.plan?.headlines ?? []).map((t) => `<li>${h(t)}</li>`).join('')}</ol>
    </article>`;
  }).join('');
}

export function bindAppView() {
  $('#variants').addEventListener('change', async (e) => {
    const { pick, label, move } = e.target.dataset;
    const { api, toast, reloadProjects } = view.ctx;
    try {
      if (pick) {
        if (e.target.checked) view.selected.add(pick); else view.selected.delete(pick);
        $('#compare-count').textContent = `${view.selected.size} selected`;
        await renderCompare();
      } else if (label !== undefined) {
        await api(`/api/projects/${enc(label)}`, { method: 'PATCH', body: { label: e.target.value } });
        toast('Label saved');
        await reloadProjects();
        await renderCompare();
      } else if (move && e.target.value) {
        await api(`/api/projects/${enc(move)}`, { method: 'PATCH', body: { appId: e.target.value } });
        toast(`Moved ${move}`);
        view.selected.delete(move);
        await reloadProjects();
        await openApp(view.app.id, view.ctx);
      }
    } catch (err) { toast(err.message, true); }
  });
  $('#select-all').addEventListener('click', async () => {
    const all = view.app.projects.map((p) => p.name);
    view.selected = view.selected.size === all.length ? new Set() : new Set(all);
    $$('#variants [data-pick]').forEach((c) => { c.checked = view.selected.has(c.dataset.pick); });
    $('#compare-count').textContent = `${view.selected.size} selected`;
    await renderCompare().catch((err) => view.ctx.toast(err.message, true));
  });
}
