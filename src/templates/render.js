import { resolveTheme, contrast } from './themes.js';

const W = 1080;
const H = 1920;
const M = 72;

export const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + (amt < 0 ? v : 255 - v) * amt)));
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('');
}

// Deterministic per-slide randomness so re-renders are stable but slides differ from each other.
function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

function readable(bg, candidates) {
  return candidates.reduce((best, c) => (contrast(c, bg) > contrast(best, bg) ? c : best), candidates[0]);
}

/** Colours for one slide, after applying its background variant. */
function slideColors(theme, variant = 'default') {
  const c = { ...theme.colors };
  if (variant === 'alt') [c.bg, c.bg2] = [c.bg2, c.bg];
  if (variant === 'accent') {
    c.bg = theme.colors.accent;
    c.bg2 = shade(theme.colors.accent, -0.25);
    c.text = readable(c.bg, [theme.colors.text, '#FFFFFF', '#111111']);
    c.muted = rgba(c.text, 0.78);
    c.accent = readable(c.bg, [theme.colors.accent2, c.text]);
  }
  return c;
}

function backgroundCss(theme, c) {
  const { type, angle = 180 } = theme.background;
  if (type === 'solid') return c.bg;
  if (type === 'radial') return `radial-gradient(120% 70% at 50% 0%, ${c.bg2} 0%, ${c.bg} 62%)`;
  if (type === 'mesh') {
    return [
      `radial-gradient(55% 38% at 12% 8%, ${rgba(c.accent, 0.28)} 0%, transparent 70%)`,
      `radial-gradient(50% 36% at 92% 28%, ${rgba(c.accent2, 0.26)} 0%, transparent 70%)`,
      `radial-gradient(80% 50% at 50% 100%, ${c.bg2} 0%, transparent 70%)`,
      `linear-gradient(${angle}deg, ${c.bg}, ${c.bg2})`,
    ].join(',');
  }
  return `linear-gradient(${angle}deg, ${c.bg} 0%, ${c.bg2} 100%)`;
}

function decorHtml(theme, c, seed, canvas, focal) {
  const r = rng(seed + 1);
  const out = [];
  for (const d of theme.decor) {
    if (d === 'blobs') {
      for (let i = 0; i < 3; i++) {
        const size = canvas.w * (0.5 + r() * 0.35);
        const x = (i % 2 ? 0.55 : -0.2) * canvas.w + r() * canvas.w * 0.2;
        const y = (i * 0.33 + r() * 0.15) * canvas.h - size * 0.3;
        out.push(`<i class="blob" style="left:${x | 0}px;top:${y | 0}px;width:${size | 0}px;height:${size | 0}px;background:${rgba(i % 2 ? c.accent2 : c.accent, 0.3)}"></i>`);
      }
    } else if (d === 'grid') {
      out.push(`<i class="grid" style="--line:${rgba(c.text, 0.07)}"></i>`);
    } else if (d === 'dots') {
      out.push(`<i class="dots" style="--dot:${rgba(c.text, 0.14)}"></i>`);
    } else if (d === 'glow' && focal) {
      out.push(`<i class="glow" style="left:${focal.x - focal.w * 0.6}px;top:${focal.y - focal.w * 0.4}px;width:${focal.w * 1.2}px;height:${focal.w * 1.4}px;background:radial-gradient(closest-side, ${rgba(c.accent, 0.55)}, transparent)"></i>`);
    } else if (d === 'rings') {
      const cx = r() > 0.5 ? canvas.w * 0.92 : canvas.w * 0.08;
      const cy = canvas.h * (0.25 + r() * 0.5);
      for (let i = 1; i <= 3; i++) {
        const s = canvas.w * 0.35 * i;
        out.push(`<i class="ring" style="left:${cx - s / 2}px;top:${cy - s / 2}px;width:${s}px;height:${s}px;border-color:${rgba(c.accent, 0.22 / i + 0.05)}"></i>`);
      }
    } else if (d === 'noise') {
      out.push('<i class="noise"></i>');
    }
  }
  return out.join('');
}

function highlightHtml(text, hl) {
  const safe = esc(text);
  if (!hl) return safe;
  const i = text.toLowerCase().indexOf(hl.toLowerCase());
  if (i < 0) return safe;
  return esc(text.slice(0, i)) + `<em class="hl">${esc(text.slice(i, i + hl.length))}</em>` + esc(text.slice(i + hl.length));
}

/** Rendered size of a device frame of width w showing an image of the given dims. */
export function deviceHeight(w, dims, frame = 'dark') {
  const pad = frame === 'none' ? 0 : w * 0.028;
  const screenW = w - pad * 2;
  return screenW * (dims.height / dims.width) + pad * 2;
}

function deviceHtml({ file, dims, w, x, y, rotate = 0, z = 2, theme, extraClass = '' }) {
  const { frame, shadow } = theme.device;
  const ar = `${dims.width}/${dims.height}`;
  return `<div class="device frame-${frame} shadow-${shadow} ${extraClass}" data-role="device" style="--w:${w}px;left:${x | 0}px;top:${y | 0}px;transform:rotate(${rotate}deg);z-index:${z}">
  <div class="body"><div class="screen" style="aspect-ratio:${ar}"><img src="../input/screenshots/${encodeURIComponent(file)}" alt="" data-role="screenshot"></div>${frame === 'none' ? '' : '<i class="cam"></i>'}</div>
  ${frame === 'none' ? '' : '<i class="btn power"></i><i class="btn vol"></i>'}
</div>`;
}

function iconHtml(app, size, c) {
  if (app.iconSrc) return `<img class="icon" src="${app.iconSrc}" style="width:${size}px;height:${size}px" alt="">`;
  const letter = esc((app.name || '?').trim().charAt(0).toUpperCase());
  return `<div class="icon letter" style="width:${size}px;height:${size}px;font-size:${size * 0.5}px;background:linear-gradient(135deg, ${c.accent}, ${c.accent2});color:${readable(c.accent, ['#FFFFFF', '#111111'])}">${letter}</div>`;
}

function fontLinks(theme) {
  const req = new Map();
  const add = (fam, w) => { if (fam) req.set(`${fam}:${w}`, [fam, w]); };
  add(theme.fonts.headline, theme.fonts.headlineWeight);
  for (const w of [400, 500, 600, 700]) add(theme.fonts.body, w);
  // One <link> per family/weight: Google returns 400 for an unavailable weight, which would kill a combined request.
  return [...req.values()]
    .map(([fam, w]) => `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam).replace(/%20/g, '+')}:wght@${w}&display=block">`)
    .join('\n');
}

function baseCss(theme, c) {
  const hlStyle = theme.highlightStyle === 'color' && contrast(c.accent, c.bg) < 3 ? 'underline' : theme.highlightStyle;
  // A saturated marker behind dark text is unreadable; fall back to a translucent tint of the accent.
  const markerFill = contrast(c.text, c.accent) >= 4.5 ? rgba(c.accent, 0.9) : rgba(c.accent, 0.28);
  const hl = {
    color: `color:${c.accent};`,
    gradient: `background:linear-gradient(95deg, ${c.accent}, ${c.accent2});-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.04em;`,
    marker: `background:linear-gradient(transparent 56%, ${markerFill} 56%, ${markerFill} 94%, transparent 94%);padding:0 .06em;-webkit-box-decoration-break:clone;box-decoration-break:clone;`,
    underline: `text-decoration:underline;text-decoration-color:${c.accent};text-decoration-thickness:.09em;text-underline-offset:.12em;`,
    none: '',
  }[hlStyle] ?? '';
  const frameBg = { dark: 'linear-gradient(145deg,#24262d,#0b0c10)', light: 'linear-gradient(145deg,#ffffff,#d9dce3)', titanium: 'linear-gradient(145deg,#8b8e96,#3a3c42 40%,#6d7078 70%,#2b2c30)', none: 'transparent' };
  const shadows = {
    soft: `0 50px 100px -30px ${rgba('#000000', 0.38)}, 0 24px 48px -24px ${rgba('#000000', 0.35)}`,
    hard: `0 70px 120px -20px ${rgba('#000000', 0.6)}, 0 0 0 1px ${rgba('#FFFFFF', 0.06)}`,
    none: 'none',
  };
  return `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:var(--cw);height:var(--ch);overflow:hidden}
body{position:relative;background:${backgroundCss(theme, c)};color:${c.text};font-family:'${theme.fonts.body}',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.layer{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.blob{position:absolute;border-radius:50%;filter:blur(90px)}
.grid{position:absolute;inset:0;background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:72px 72px;-webkit-mask-image:radial-gradient(90% 70% at 50% 40%,#000 30%,transparent 100%)}
.dots{position:absolute;inset:0;background-image:radial-gradient(var(--dot) 2px,transparent 2.5px);background-size:32px 32px;-webkit-mask-image:linear-gradient(180deg,#000 0%,transparent 75%)}
.glow{position:absolute;filter:blur(40px)}
.ring{position:absolute;border-radius:50%;border:2px solid}
.noise{position:absolute;inset:0;opacity:.09;mix-blend-mode:overlay;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")}
.text{position:absolute;display:flex;flex-direction:column;gap:26px;z-index:5}
.text.center{align-items:center;text-align:center}
.eyebrow{font-size:30px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${c.muted};display:flex;align-items:center;gap:14px}
.eyebrow::before{content:'';width:14px;height:14px;border-radius:50%;background:${c.accent}}
h1{flex:none;padding-block:.05em;font-family:'${theme.fonts.headline}',system-ui,sans-serif;font-weight:${theme.fonts.headlineWeight};font-size:var(--hs,112px);line-height:1.04;letter-spacing:-.025em;${theme.headlineCase === 'upper' ? 'text-transform:uppercase;letter-spacing:-.01em;line-height:.98;' : ''}overflow:hidden;overflow-wrap:break-word;text-wrap:balance}
h1 .hl{font-style:normal;${hl}}
.sub{flex:none;font-size:42px;line-height:1.32;font-weight:500;color:${c.muted};max-width:900px;overflow:hidden;text-wrap:pretty}
.badges{display:flex;gap:16px;flex-wrap:wrap;justify-content:flex-start}
.text.center .badges{justify-content:center}
.badge{font-size:30px;font-weight:600;padding:14px 28px;border-radius:999px;background:${rgba(c.surface, 0.9)};color:${c.surfaceText};box-shadow:0 10px 30px -12px ${rgba('#000000', 0.25)}}
.icon{border-radius:22%;box-shadow:0 18px 40px -16px ${rgba('#000000', 0.45)};object-fit:cover}
.icon.letter{display:flex;align-items:center;justify-content:center;font-family:'${theme.fonts.headline}',sans-serif;font-weight:800}
.device{position:absolute;width:var(--w);transform-origin:50% 50%}
.device .body{position:relative;padding:calc(var(--w)*.028);border-radius:calc(var(--w)*.13);background:${frameBg[theme.device.frame]};box-shadow:${shadows[theme.device.shadow]}${theme.device.frame === 'none' ? '' : `,inset 0 0 0 calc(var(--w)*.004) ${rgba('#FFFFFF', 0.18)}`}}
.device .screen{border-radius:calc(var(--w)*.105);overflow:hidden;background:#000;width:100%}
.device.frame-none .screen{border-radius:calc(var(--w)*.07)}
.device .screen img{display:block;width:100%;height:100%;object-fit:cover}
.device .cam{position:absolute;top:calc(var(--w)*.058);left:50%;width:calc(var(--w)*.034);aspect-ratio:1;border-radius:50%;background:#050608;box-shadow:inset 0 0 0 calc(var(--w)*.005) #1e2230;transform:translateX(-50%)}
.device .btn{position:absolute;right:calc(var(--w)*-.009);width:calc(var(--w)*.012);border-radius:0 6px 6px 0;background:${frameBg[theme.device.frame]}}
.device .btn.power{top:22%;height:7%}
.device .btn.vol{top:33%;height:12%}
.card{position:absolute;z-index:6;display:flex;align-items:center;gap:22px;padding:30px 36px;border-radius:30px;background:${rgba(c.surface, 0.92)};color:${c.surfaceText};font-size:36px;font-weight:700;line-height:1.2;box-shadow:0 30px 60px -24px ${rgba('#000000', 0.4)};backdrop-filter:blur(20px)}
.card i{flex:none;width:44px;height:44px;border-radius:50%;background:${c.accent};display:flex;align-items:center;justify-content:center}
.card i::after{content:'';width:16px;height:9px;border-left:5px solid ${readable(c.accent, ['#FFFFFF', '#111111'])};border-bottom:5px solid ${readable(c.accent, ['#FFFFFF', '#111111'])};transform:translateY(-2px) rotate(-45deg)}
.zoom{position:absolute;z-index:6;border-radius:36px;background-repeat:no-repeat;box-shadow:0 0 0 10px ${rgba(c.surface, 0.95)},0 50px 90px -30px ${rgba('#000000', 0.55)}}
`;
}

const FIT_SCRIPT = `<script>
(async () => {
  try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 4000))]); } catch {}
  await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
  for (const el of document.querySelectorAll('[data-fit]')) {
    let s = parseFloat(getComputedStyle(el).fontSize);
    const min = parseFloat(el.dataset.min || 40);
    // Tall fonts with tight line-height overflow their line box by design; only real wrapping counts.
    const slack = () => s * (0.12 + Math.max(0, 1.2 - parseFloat(getComputedStyle(el).lineHeight) / s));
    while ((el.scrollHeight > el.clientHeight + slack() || el.scrollWidth > el.clientWidth + 1) && s > min) {
      s -= 2; el.style.fontSize = s + 'px';
    }
  }
  document.documentElement.dataset.ready = '1';
})();
</script>`;

function doc({ theme, c, canvas, title, body }) {
  return `<!doctype html>
<html lang="en" data-canvas="${canvas.w}x${canvas.h}">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fontLinks(theme)}
<style>:root{--cw:${canvas.w}px;--ch:${canvas.h}px}${baseCss(theme, c)}</style>
</head>
<body>
${body}
${FIT_SCRIPT}
</body>
</html>
`;
}

function textBlock({ slide, x, y, w, h, align = 'left', headlineSize = 112, extraTop = '', extraBottom = '' }) {
  const len = slide.headline.length;
  const size = len > 30 ? Math.min(headlineSize, 96) : headlineSize;
  const subH = slide.subline ? 120 : 0;
  const eyeH = slide.eyebrow ? 56 : 0;
  return `<div class="text ${align === 'center' ? 'center' : ''}" style="left:${x}px;top:${y}px;width:${w}px;max-height:${h}px">
  ${extraTop}
  ${slide.eyebrow ? `<div class="eyebrow" data-role="eyebrow">${esc(slide.eyebrow)}</div>` : ''}
  <h1 data-role="headline" data-fit data-min="72" style="--hs:${size}px;max-height:${h - subH - eyeH - 52}px;width:100%">${highlightHtml(slide.headline, slide.highlight)}</h1>
  ${slide.subline ? `<p class="sub" data-role="subline" data-fit data-min="34" style="max-height:${subH}px">${esc(slide.subline)}</p>` : ''}
  ${extraBottom}
</div>`;
}

function badgesHtml(badges = []) {
  return badges.length ? `<div class="badges">${badges.map((b) => `<span class="badge">${esc(b)}</span>`).join('')}</div>` : '';
}

/** Render one phone slide to a complete HTML document. */
export function renderSlide({ plan, slide, index, shots, app }) {
  const theme = resolveTheme(plan.theme);
  const c = slideColors(theme, slide.background);
  const canvas = { w: W, h: H };
  const dims = (f) => shots[f] ?? { width: 1080, height: 2400 };
  const [s1, s2] = slide.screenshots;
  let layout = slide.layout;
  if (layout === 'two-devices' && !s2) layout = 'device-bottom';
  if (layout === 'zoom' && !slide.focus) layout = 'device-bottom';
  if (layout === 'callouts' && !slide.callouts?.length) layout = 'device-bottom';

  const parts = [];
  let focal;
  const textW = W - M * 2;

  switch (layout) {
    case 'hero': {
      const w = 780;
      focal = { x: W / 2, y: 1150, w };
      parts.push(textBlock({ slide, x: M, y: 150, w: textW, h: 540, align: 'center', headlineSize: 120 }));
      parts.push(deviceHtml({ file: s1, dims: dims(s1), w, x: (W - w) / 2, y: 730, theme }));
      break;
    }
    case 'device-top': {
      const w = 760;
      const dh = deviceHeight(w, dims(s1), theme.device.frame);
      focal = { x: W / 2, y: 700, w };
      parts.push(deviceHtml({ file: s1, dims: dims(s1), w, x: (W - w) / 2, y: 1230 - dh, theme }));
      parts.push(textBlock({ slide, x: M, y: 1320, w: textW, h: 520 }));
      break;
    }
    case 'tilted': {
      const w = 740;
      focal = { x: W / 2 + 40, y: 1200, w };
      parts.push(textBlock({ slide, x: M, y: 150, w: textW, h: 520 }));
      parts.push(deviceHtml({ file: s1, dims: dims(s1), w, x: 200, y: 800, rotate: -8, theme }));
      break;
    }
    case 'two-devices': {
      focal = { x: W / 2, y: 1250, w: 900 };
      parts.push(textBlock({ slide, x: M, y: 150, w: textW, h: 520 }));
      parts.push(deviceHtml({ file: s1, dims: dims(s1), w: 600, x: 40, y: 860, rotate: -7, z: 2, theme }));
      parts.push(deviceHtml({ file: s2, dims: dims(s2), w: 640, x: 400, y: 760, rotate: 5, z: 3, theme }));
      break;
    }
    case 'callouts': {
      const w = 640;
      focal = { x: 400, y: 1200, w };
      parts.push(textBlock({ slide, x: M, y: 150, w: textW, h: 500 }));
      parts.push(deviceHtml({ file: s1, dims: dims(s1), w, x: M, y: 720, theme }));
      slide.callouts.slice(0, 3).forEach((t, i) => {
        const left = 500 + (i % 2) * 40;
        parts.push(`<div class="card" style="left:${left}px;top:${900 + i * 270}px;max-width:${W - left - M}px"><i></i><span>${esc(t)}</span></div>`);
      });
      break;
    }
    case 'zoom': {
      const w = 640;
      const d = dims(s1);
      const f = slide.focus;
      const cardW = 560;
      const cardH = Math.min(720, cardW * ((f.h * d.height) / (f.w * d.width)));
      const bx = f.w >= 1 ? 0 : (f.x / (1 - f.w)) * 100;
      const by = f.h >= 1 ? 0 : (f.y / (1 - f.h)) * 100;
      focal = { x: 400, y: 1200, w };
      parts.push(textBlock({ slide, x: M, y: 150, w: textW, h: 500 }));
      parts.push(deviceHtml({ file: s1, dims: d, w, x: M, y: 720, theme }));
      parts.push(`<div class="zoom" style="left:${W - M - cardW}px;top:${1000}px;width:${cardW}px;height:${cardH | 0}px;background-image:url('../input/screenshots/${encodeURIComponent(s1)}');background-size:${(100 / f.w).toFixed(2)}% auto;background-position:${bx.toFixed(2)}% ${by.toFixed(2)}%"></div>`);
      break;
    }
    case 'closer': {
      const w = 620;
      focal = { x: W / 2, y: 1500, w };
      parts.push(textBlock({
        slide, x: M, y: 170, w: textW, h: 860, align: 'center', headlineSize: 116,
        extraTop: iconHtml(app, 150, c),
        extraBottom: badgesHtml(slide.badges),
      }));
      parts.push(deviceHtml({ file: s1, dims: dims(s1), w, x: (W - w) / 2, y: 1130, theme }));
      break;
    }
    default: { // device-bottom
      const w = 760;
      focal = { x: W / 2, y: 1250, w };
      parts.push(textBlock({ slide, x: M, y: 150, w: textW, h: 540 }));
      parts.push(deviceHtml({ file: s1, dims: dims(s1), w, x: (W - w) / 2, y: 760, theme }));
    }
  }

  const body = `<div class="layer">${decorHtml(theme, c, index, canvas, focal)}</div>\n${parts.join('\n')}`;
  return doc({ theme, c, canvas, title: `${plan.app.name} — ${slide.id}`, body });
}

/** Render the 1024×500 Play Store feature graphic. */
export function renderFeatureGraphic({ plan, shots, app }) {
  const theme = resolveTheme(plan.theme);
  const c = slideColors(theme, 'default');
  const fg = plan.featureGraphic;
  const canvas = { w: 1024, h: 500 };
  const dims = (f) => shots[f] ?? { width: 1080, height: 2400 };
  const files = fg.screenshots;
  const parts = [];
  let focal;

  const brand = (align) => `<div class="text ${align === 'center' ? 'center' : ''}" style="left:${align === 'center' ? 262 : 64}px;top:48px;width:${align === 'center' ? 500 : 500}px;height:404px;justify-content:center;gap:18px">
  <div style="display:flex;align-items:center;gap:20px;${align === 'center' ? 'flex-direction:column;gap:14px' : ''}">${iconHtml(app, 84, c)}<div data-role="eyebrow" style="font-family:'${theme.fonts.headline}',sans-serif;font-weight:${theme.fonts.headlineWeight};font-size:40px;letter-spacing:-.02em">${esc(plan.app.name)}</div></div>
  <h1 data-role="headline" data-fit data-min="36" style="--hs:58px;max-height:200px;width:100%">${highlightHtml(fg.headline, fg.highlight)}</h1>
  ${badgesHtml(fg.badges).replace(/class="badge"/g, 'class="badge" style="font-size:22px;padding:9px 18px"')}
</div>`;

  if (fg.layout === 'fg-centered') {
    focal = { x: 512, y: 250, w: 600 };
    parts.push(brand('center'));
    const [a, b = files[0]] = files;
    parts.push(deviceHtml({ file: a, dims: dims(a), w: 210, x: 40, y: 150, rotate: -10, theme }));
    parts.push(deviceHtml({ file: b, dims: dims(b), w: 210, x: 774, y: 150, rotate: 10, theme }));
  } else if (fg.layout === 'fg-fan') {
    focal = { x: 780, y: 300, w: 400 };
    parts.push(brand('left'));
    const list = [files[1] ?? files[0], files[0], files[2] ?? files[1] ?? files[0]];
    [[600, 110, -12, 2], [730, 60, 0, 4], [860, 110, 12, 2]].forEach(([x, y, rot, z], i) => {
      parts.push(deviceHtml({ file: list[i], dims: dims(list[i]), w: 220, x, y, rotate: rot, z, theme }));
    });
  } else { // fg-split
    focal = { x: 780, y: 300, w: 380 };
    parts.push(brand('left'));
    if (files[1]) parts.push(deviceHtml({ file: files[1], dims: dims(files[1]), w: 260, x: 780, y: 120, rotate: 8, z: 2, theme }));
    parts.push(deviceHtml({ file: files[0], dims: dims(files[0]), w: 290, x: files[1] ? 600 : 660, y: 70, rotate: -6, z: 3, theme }));
  }

  const body = `<div class="layer">${decorHtml(theme, c, 99, canvas, focal)}</div>\n${parts.join('\n')}`;
  return doc({ theme, c, canvas, title: `${plan.app.name} — feature graphic`, body });
}
