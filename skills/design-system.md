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
- `background.type`: `linear` | `radial` | `mesh` | `solid`. `background.angle` for linear.
- `fonts.headline`, `fonts.body` — any Google Fonts family. `fonts.headlineWeight` 500–900.
- `headlineCase`: `none` | `upper`. `highlightStyle`: `color` | `gradient` | `marker` | `underline`.
- `decor`: any of `blobs`, `grid`, `dots`, `glow`, `rings`, `noise`, `none`.
- `device.frame`: `dark` | `light` | `titanium` | `none`. `device.shadow`: `soft` | `hard` | `none`.

## Presets

`aurora-light`, `midnight-glow`, `bold-gradient`, `swiss-paper`, `clay-wellness`, `neon-night`, `editorial-serif`,
`candy-pop`, `ocean-calm`, `mono-minimal`. Pick by category:

| Category | First pick | Also |
|---|---|---|
| finance, business, tools | `swiss-paper` | `midnight-glow`, `mono-minimal` |
| productivity, notes, tasks | `aurora-light` | `mono-minimal`, `swiss-paper` |
| health, wellness, sleep | `clay-wellness` | `ocean-calm`, `aurora-light` |
| fitness, sports | `neon-night` | `bold-gradient` |
| ai, developer, pro | `midnight-glow` | `mono-minimal` |
| social, events, kids, games | `candy-pop` | `bold-gradient` |
| food, books, travel, lifestyle | `editorial-serif` | `clay-wellness` |
| education, utilities, general | `bold-gradient` | `ocean-calm` |

A preset is a starting point: override any token, especially to match brand colours.
