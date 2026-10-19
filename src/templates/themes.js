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
    headlineCase: 'none', highlightStyle: 'gradient', decor: ['glow', 'dots'],
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
    headlineCase: 'none', highlightStyle: 'marker', decor: ['grid'],
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
    headlineCase: 'upper', highlightStyle: 'color', decor: ['glow', 'grid'],
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
};

export const CATEGORY_PRESET = {
  finance: 'swiss-paper', business: 'swiss-paper', tools: 'swiss-paper',
  productivity: 'aurora-light', notes: 'aurora-light', tasks: 'aurora-light',
  health: 'clay-wellness', wellness: 'clay-wellness', sleep: 'clay-wellness', meditation: 'clay-wellness',
  fitness: 'neon-night', sports: 'neon-night',
  ai: 'midnight-glow', developer: 'midnight-glow', pro: 'midnight-glow',
  social: 'candy-pop', events: 'candy-pop', kids: 'candy-pop', games: 'candy-pop', dating: 'candy-pop',
  food: 'editorial-serif', books: 'editorial-serif', travel: 'editorial-serif', lifestyle: 'editorial-serif',
  education: 'bold-gradient', utilities: 'bold-gradient', general: 'bold-gradient', music: 'bold-gradient',
  weather: 'ocean-calm', medical: 'ocean-calm',
};

export function presetForCategory(category = '') {
  return CATEGORY_PRESET[String(category).toLowerCase().trim()] ?? 'bold-gradient';
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
