import { CorePalette, Scheme, argbFromHex, hexFromArgb } from '@material/material-color-utilities';

// Preset themes. A plan's `theme` is deep-merged over its preset, so presets must define every token.

export const PRESETS = {
  'aurora-light': {
    colors: { bg: '#F4F1FF', bg2: '#E3F2FF', text: '#141026', muted: '#4D4868', accent: '#6B4BFF', accent2: '#00B3D6', surface: '#FFFFFF', surfaceText: '#141026' },
    background: { type: 'mesh', angle: 160 },
    fonts: { headline: 'Plus Jakarta Sans', body: 'Inter', headlineWeight: 800 },
    headlineCase: 'none', highlightStyle: 'gradient', decor: ['blobs', 'noise'],
    device: { frame: 'dark', shadow: 'soft' },
  },
  'midnight-glow': {
    colors: { bg: '#07080B', bg2: '#11131C', text: '#F4F5F8', muted: '#A7ACBA', accent: '#8F8CFF', accent2: '#B3AFFF', surface: '#181A24', surfaceText: '#F4F5F8' },
    background: { type: 'radial', angle: 180 },
    fonts: { headline: 'Inter Tight', body: 'Inter', headlineWeight: 700 },
    eyebrowStyle: 'caps', headlineCase: 'none', highlightStyle: 'gradient', decor: ['glow', 'dots'],
    device: { frame: 'titanium', shadow: 'hard' },
  },
  'bold-gradient': {
    colors: { bg: '#3A1CFF', bg2: '#A314E6', text: '#FFFFFF', muted: '#E9E2FF', accent: '#FFD84D', accent2: '#FF7AD9', surface: '#FFFFFF', surfaceText: '#1B1340' },
    background: { type: 'linear', angle: 155 },
    fonts: { headline: 'Poppins', body: 'Poppins', headlineWeight: 800 },
    headlineCase: 'none', highlightStyle: 'color', decor: ['rings', 'noise'],
    device: { frame: 'dark', shadow: 'soft' },
  },
  'swiss-paper': {
    colors: { bg: '#F3F1EC', bg2: '#E9E6DF', text: '#111111', muted: '#4A4A4A', accent: '#FF4F12', accent2: '#111111', surface: '#FFFFFF', surfaceText: '#111111' },
    background: { type: 'solid', angle: 180 },
    fonts: { headline: 'Inter Tight', body: 'Inter', headlineWeight: 800 },
    eyebrowStyle: 'caps', headlineCase: 'none', highlightStyle: 'marker', decor: ['grid'],
    device: { frame: 'dark', shadow: 'hard' },
  },
  'clay-wellness': {
    colors: { bg: '#F2E7DA', bg2: '#E8D5C0', text: '#3A2A1E', muted: '#6E5747', accent: '#C2603D', accent2: '#7F9C7A', surface: '#FBF6F0', surfaceText: '#3A2A1E' },
    background: { type: 'linear', angle: 180 },
    fonts: { headline: 'Fraunces', body: 'DM Sans', headlineWeight: 600 },
    headlineCase: 'none', highlightStyle: 'color', decor: ['blobs', 'noise'],
    device: { frame: 'light', shadow: 'soft' },
  },
  'neon-night': {
    colors: { bg: '#0A0B0D', bg2: '#15171C', text: '#FFFFFF', muted: '#B5B9C2', accent: '#D4FF3A', accent2: '#3AFFB4', surface: '#1C1F26', surfaceText: '#FFFFFF' },
    background: { type: 'radial', angle: 200 },
    fonts: { headline: 'Barlow Condensed', body: 'Barlow', headlineWeight: 800 },
    eyebrowStyle: 'caps', headlineCase: 'upper', highlightStyle: 'color', decor: ['glow', 'grid'],
    device: { frame: 'dark', shadow: 'hard' },
  },
  'editorial-serif': {
    colors: { bg: '#F6F0E6', bg2: '#EFE5D4', text: '#1E1A16', muted: '#5C5248', accent: '#8C2B2B', accent2: '#C9A35B', surface: '#FFFDF8', surfaceText: '#1E1A16' },
    background: { type: 'solid', angle: 180 },
    fonts: { headline: 'Playfair Display', body: 'Source Sans 3', headlineWeight: 700 },
    headlineCase: 'none', highlightStyle: 'underline', decor: ['noise'],
    device: { frame: 'dark', shadow: 'soft' },
  },
  'candy-pop': {
    colors: { bg: '#FF6FB5', bg2: '#FFB86B', text: '#1A0B2E', muted: '#3D2257', accent: '#FFFFFF', accent2: '#6B2BFF', surface: '#FFFFFF', surfaceText: '#1A0B2E' },
    background: { type: 'linear', angle: 135 },
    fonts: { headline: 'Bricolage Grotesque', body: 'DM Sans', headlineWeight: 800 },
    headlineCase: 'none', highlightStyle: 'marker', decor: ['dots', 'blobs'],
    device: { frame: 'dark', shadow: 'hard' },
  },
  'ocean-calm': {
    colors: { bg: '#E7F6F5', bg2: '#CFE8F7', text: '#0B2A3A', muted: '#3C5A69', accent: '#0F8BA8', accent2: '#2BC4A0', surface: '#FFFFFF', surfaceText: '#0B2A3A' },
    background: { type: 'mesh', angle: 170 },
    fonts: { headline: 'Manrope', body: 'Manrope', headlineWeight: 800 },
    headlineCase: 'none', highlightStyle: 'color', decor: ['rings', 'blobs'],
    device: { frame: 'dark', shadow: 'soft' },
  },
  'mono-minimal': {
    colors: { bg: '#FFFFFF', bg2: '#F2F3F5', text: '#0B0B0C', muted: '#55575E', accent: '#0B0B0C', accent2: '#8A8D96', surface: '#F2F3F5', surfaceText: '#0B0B0C' },
    background: { type: 'linear', angle: 180 },
    fonts: { headline: 'Inter Tight', body: 'Inter', headlineWeight: 700 },
    headlineCase: 'none', highlightStyle: 'none', decor: ['none'],
    device: { frame: 'dark', shadow: 'soft' },
  },
  // Soothing presets: low-saturation grounds, one quiet accent, sentence-case eyebrows (see skills/visual-craft.md).
  'sage-mist': {
    colors: { bg: '#E9EEE6', bg2: '#D6E0D3', text: '#1E2A21', muted: '#4B5A4E', accent: '#3F7253', accent2: '#A4AC86', surface: '#F7F9F5', surfaceText: '#1E2A21' },
    background: { type: 'soft', angle: 175 },
    fonts: { headline: 'Figtree', body: 'Figtree', headlineWeight: 700 },
    headlineCase: 'none', highlightStyle: 'color', eyebrowStyle: 'quiet', decor: ['noise'],
    device: { frame: 'dark', shadow: 'soft' },
  },
  'sand-dune': {
    colors: { bg: '#F0E7DC', bg2: '#E3D3C1', text: '#2C241E', muted: '#5E5045', accent: '#8A5E45', accent2: '#7D8471', surface: '#FBF7F2', surfaceText: '#2C241E' },
    background: { type: 'soft', angle: 165 },
    fonts: { headline: 'Sora', body: 'Figtree', headlineWeight: 600 },
    headlineCase: 'none', highlightStyle: 'none', eyebrowStyle: 'quiet', decor: ['noise'],
    device: { frame: 'dark', shadow: 'soft' },
  },
  'harbor-night': {
    colors: { bg: '#13212F', bg2: '#1D3346', text: '#EEF4F7', muted: '#A7BBC7', accent: '#86CFC9', accent2: '#4E9C9C', surface: '#203a4f', surfaceText: '#EEF4F7' },
    background: { type: 'soft', angle: 180 },
    fonts: { headline: 'Albert Sans', body: 'Albert Sans', headlineWeight: 700 },
    headlineCase: 'none', highlightStyle: 'color', eyebrowStyle: 'quiet', decor: ['noise'],
    device: { frame: 'titanium', shadow: 'soft' },
  },
  'dusk-rose': {
    colors: { bg: '#F1E6E6', bg2: '#E3D0D4', text: '#38212F', muted: '#6A4D5C', accent: '#8C4766', accent2: '#C79AA6', surface: '#FCF8F8', surfaceText: '#38212F' },
    background: { type: 'soft', angle: 170 },
    fonts: { headline: 'Young Serif', body: 'Figtree', headlineWeight: 400 },
    headlineCase: 'none', highlightStyle: 'none', eyebrowStyle: 'quiet', decor: ['noise'],
    device: { frame: 'light', shadow: 'soft' },
  },
  'fog-lilac': {
    colors: { bg: '#ECEBF4', bg2: '#DAD7EB', text: '#23203A', muted: '#55506F', accent: '#5E54A8', accent2: '#A9A2D6', surface: '#FAFAFD', surfaceText: '#23203A' },
    background: { type: 'soft', angle: 170 },
    fonts: { headline: 'Onest', body: 'Onest', headlineWeight: 700 },
    headlineCase: 'none', highlightStyle: 'color', eyebrowStyle: 'quiet', decor: ['noise'],
    device: { frame: 'dark', shadow: 'soft' },
  },
};

export function validateThemeSelection(selection) {
  if (selection === undefined) return;
  const fail = (message) => { throw Object.assign(new Error(`themeSelection: ${message}`), { status: 422 }); };
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) fail('must be an object');
  if (!['auto', 'preset', 'material'].includes(selection.mode)) fail('mode must be auto, preset or material');
  if (selection.brief !== undefined && (typeof selection.brief !== 'string' || selection.brief.length > 2000)) fail('brief must be text up to 2000 characters');
  if (selection.mode === 'preset' && !Object.hasOwn(PRESETS, selection.preset)) fail('unknown preset');
  if (selection.mode === 'material') {
    for (const key of ['primary', 'secondary', 'tertiary']) {
      if ((key === 'primary' || selection[key] !== undefined) && (typeof selection[key] !== 'string' || selection[key].length !== 7 || !/^#[0-9a-f]{6}$/i.test(selection[key]))) fail(`${key} must be a six-digit hex color`);
    }
    if (!['light', 'dark'].includes(selection.appearance)) fail('appearance must be light or dark');
  }
}

/** Material tonal roles keep arbitrary input colors readable in either appearance. */
export function materialTheme(selection) {
  validateThemeSelection({ ...selection, mode: 'material' });
  const palette = CorePalette.fromColors(Object.fromEntries(['primary', 'secondary', 'tertiary']
    .filter((key) => selection[key]).map((key) => [key, argbFromHex(selection[key])])));
  const dark = selection.appearance === 'dark';
  const scheme = dark ? Scheme.darkFromCorePalette(palette) : Scheme.lightFromCorePalette(palette);
  const hex = (value) => hexFromArgb(value).toUpperCase();
  return {
    preset: 'mono-minimal',
    colors: {
      bg: hex(scheme.background), bg2: hex(scheme.surfaceVariant), text: hex(scheme.onBackground),
      muted: hex(scheme.onSurfaceVariant), accent: hex(scheme.primary), accent2: hex(scheme.tertiary),
      surface: hex(scheme.secondaryContainer), surfaceText: hex(scheme.onSecondaryContainer),
    },
    background: { type: 'soft', angle: 170 },
    highlightStyle: 'color', eyebrowStyle: 'quiet', decor: ['none'],
    device: { frame: dark ? 'titanium' : 'dark', shadow: 'soft' },
  };
}

const MATERIAL_PALETTES = {
  violet: '#6750A4', indigo: '#3F51B5', blue: '#1565C0', cyan: '#00838F',
  teal: '#006B5E', emerald: '#2E7D32', lime: '#687D00', amber: '#9A6700',
  coral: '#B44932', rose: '#A43F68', plum: '#7B3F91', slate: '#526570',
};
for (const [name, primary] of Object.entries(MATERIAL_PALETTES)) {
  for (const appearance of ['light', 'dark']) {
    const { preset, ...theme } = materialTheme({ primary, appearance });
    PRESETS[`material-${name}-${appearance}`] = resolveTheme({ preset, ...theme });
  }
}

/** An explicit user choice wins over agent output and category defaults. */
export function selectedTheme(app, fallback) {
  const selection = app.themeSelection;
  validateThemeSelection(selection);
  if (selection?.mode === 'preset') return { preset: selection.preset };
  if (selection?.mode === 'material') return materialTheme(selection);
  return fallback;
}

export const CATEGORY_PRESET = {
  finance: 'sage-mist', business: 'swiss-paper', tools: 'fog-lilac',
  productivity: 'fog-lilac', notes: 'sand-dune', tasks: 'fog-lilac',
  health: 'sage-mist', wellness: 'dusk-rose', sleep: 'harbor-night', meditation: 'dusk-rose',
  fitness: 'neon-night', sports: 'neon-night',
  ai: 'harbor-night', developer: 'midnight-glow', pro: 'midnight-glow',
  social: 'candy-pop', events: 'candy-pop', kids: 'candy-pop', games: 'candy-pop', dating: 'dusk-rose',
  food: 'sand-dune', books: 'sand-dune', travel: 'sand-dune', lifestyle: 'dusk-rose',
  education: 'ocean-calm', utilities: 'fog-lilac', general: 'fog-lilac', music: 'harbor-night',
  weather: 'ocean-calm', medical: 'sage-mist',
};

export function presetForCategory(category = '') {
  return CATEGORY_PRESET[String(category).toLowerCase().trim()] ?? 'fog-lilac';
}

/** Merge a plan theme over its preset; unknown presets fall back to bold-gradient. */
export function resolveTheme(theme = {}) {
  const base = PRESETS[theme.preset] ?? PRESETS['bold-gradient'];
  return {
    ...base,
    ...theme,
    colors: { ...base.colors, ...theme.colors },
    background: { ...base.background, ...theme.background },
    fonts: { ...base.fonts, ...theme.fonts },
    device: { ...base.device, ...theme.device },
    decor: theme.decor?.length ? theme.decor : base.decor,
  };
}

// WCAG relative luminance contrast, used by plan validation and the renderer's auto text colour.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
