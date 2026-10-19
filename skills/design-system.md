# Design system for listing graphics

The renderer (`src/templates/`) implements everything below. Planners choose from these options in `plan.json`;
builders who hand-write HTML must stay inside the same rules.

## Canvas

- Phone slide: 1080 × 1920. Feature graphic: 1024 × 500.
- Outer safe margin: 72 px on phone slides (text never closer to the edge), 64/48 px on the feature graphic.
- Devices may bleed off the top or bottom edge (that looks intentional); they must not bleed off the left/right edge
  except in `two-devices` and `tilted`, and never by more than 12 % of their width.

## Layouts (phone)

| Layout | Use for | Composition |
|---|---|---|
| `hero` | slide 1 | Centred eyebrow + big headline + subline, large phone bleeding off the bottom |
| `device-bottom` | features | Left-aligned text block on top, phone bleeding off the bottom |
| `device-top` | variety, after 2 `device-bottom` | Phone bleeding off the top, text block at the bottom |
| `tilted` | energetic / social apps | Phone rotated −8°, soft long shadow |
| `two-devices` | comparisons, before/after, two related screens | Two overlapping phones, back one rotated |
| `callouts` | feature-dense screens | Phone left, 2–3 floating glass cards on the right with short labels |
| `zoom` | one detail that is too small at thumbnail size | Faded phone + a magnified card of a `focus` region |
| `closer` | last slide | Headline + badges + app icon, smaller phone at the bottom |

Rhythm: never use the same layout 3 times in a row. Alternate text-top / text-bottom at least once in a 5+ slide deck.

## Layouts (feature graphic)

`fg-split` (text left, tilted phone right), `fg-centered` (name centred, phones either side), `fg-fan` (text left, three
fanned phones right).

## Theme tokens (plan.json → `theme`)

- `colors.bg`, `colors.bg2` — background gradient stops. `colors.text` must reach **4.5:1 contrast** on both.
- `colors.accent`, `colors.accent2` — highlight word, decoration, badges. Only ONE accent hue dominates.
- `colors.muted` — subline/eyebrow colour, ≥ 3:1 contrast.
- `colors.surface`, `colors.surfaceText` — glass cards, badges.
- `background.type`: `soft` (calm two-tone light) | `linear` | `radial` | `mesh` | `solid`. `background.angle` for linear.
- `fonts.headline`, `fonts.body` — any Google Fonts family. `fonts.headlineWeight` 500–900.
- `headlineCase`: `none` | `upper`. `highlightStyle`: `color` | `gradient` | `marker` | `underline` | `none`.
- `eyebrowStyle`: `quiet` (sentence case, accent colour — default) | `caps` (tracked uppercase, editorial styles only).
- `decor`: any of `blobs`, `grid`, `dots`, `glow`, `rings`, `noise`, `none`.
- `device.frame`: `dark` | `light` | `titanium` | `none`. `device.shadow`: `soft` | `hard` | `none`.

## Presets

Soothing (preferred defaults): `sage-mist`, `sand-dune`, `harbor-night` (dark), `dusk-rose`, `fog-lilac`, `ocean-calm`,
`clay-wellness`. Expressive: `aurora-light`, `midnight-glow`, `bold-gradient`, `swiss-paper`, `neon-night`,
`editorial-serif`, `candy-pop`, `mono-minimal`. Pick by category, then read `visual-craft.md` before committing:

| Category | First pick | Also |
|---|---|---|
| finance, health, medical | `sage-mist` | `harbor-night`, `swiss-paper` |
| productivity, tools, utilities, general | `fog-lilac` | `sage-mist`, `mono-minimal` |
| notes, books, food, travel | `sand-dune` | `editorial-serif`, `clay-wellness` |
| wellness, meditation, lifestyle, dating | `dusk-rose` | `clay-wellness`, `sage-mist` |
| ai, sleep, music | `harbor-night` | `midnight-glow`, `fog-lilac` |
| developer, pro | `midnight-glow` | `harbor-night` |
| fitness, sports | `neon-night` | `harbor-night` |
| social, events, kids, games | `candy-pop` | `bold-gradient` |
| education, weather | `ocean-calm` | `fog-lilac` |

A preset is a starting point: override any token, especially to match brand colours.
