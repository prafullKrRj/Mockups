# Visual craft — store screenshots that don't look generated

Adapted from `vendor/frontend-design/SKILL.md` (Anthropic, Apache-2.0) for Play Store decks. Read that file too.

A listing is judged in a fraction of a second, next to dozens of other apps that all used the same template. The deck
must look like a person with taste made a decision specific to *this* app.

## Ground every choice in the app

- Derive the palette from the app's own UI colours and its subject matter, not from a favourite preset. A subscription
  tracker, a meditation timer and a kids' phonics game must not share a look.
- Write a one-line design direction in `theme.referenceNotes` before choosing tokens: subject, audience, mood, and the
  *one* memorable element (for example "the burn ring glows in the dark", "paper-calm, like a ledger").
- Then challenge it: "would I produce this exact deck for any app in this category?" If yes, change one axis
  (palette temperature, type family, layout rhythm) and say what you changed and why.

## Soothing by default

Unless the brief asks for energy, prefer calm, eye-friendly palettes:

- Low-saturation grounds (mist, sage, sand, fog, deep harbour blue), mid-to-low contrast between `bg` and `bg2`.
- One accent, used sparingly, saturated only enough to be found. Never neon on light backgrounds.
- Dark decks: a deep tinted base (navy, plum, forest) rather than near-black `#0B0B0B` / `#111`.
- Presets built for this: `sage-mist`, `sand-dune`, `harbor-night`, `dusk-rose`, `fog-lilac`, `ocean-calm`, `clay-wellness`.

## The tells to avoid (each is fine once, deliberately — never by default)

1. Highlighting one word in every headline. Use `highlight` on at most half the slides, where the word truly carries
   the benefit. `highlightStyle: "none"` is a respectable choice.
2. A tracked-out ALL-CAPS eyebrow above every headline. Eyebrows are optional; use them only when they carry information
   (a feature category) and keep `eyebrowStyle: "quiet"` (sentence case) unless the style is deliberately editorial.
3. Purple-to-blue "AI gradient" backgrounds, glassmorphism everywhere, glowing orbs with no reason.
4. Cream `#F4F1EA` + terracotta `#D97757` + high-contrast serif (the current generated-design cliché).
5. Near-black + one acid-green or vermilion accent.
6. Identical grey drop shadows under everything. The renderer tints shadows from the background; keep `device.shadow`
   `soft` unless the style is graphic.
7. Meta strings with middle dots ("Fast · Private · Free") and arrows in copy ("Get started →").
8. Every slide in the same layout, or slides that alternate mechanically. Rhythm should follow the story.
9. Decoration that serves nothing: rings, blobs and grids all at once. Pick at most one or two `decor` items.

## Restraint

Spend boldness in one place — the hero slide's composition, a type treatment, or a single colour moment — and keep
everything around it quiet. Before finishing, remove one accessory: one decor item, one badge, one eyebrow.

## Copy

- Name things the way users do ("Never miss a renewal"), not how the system is built ("Notification scheduler").
- Plain verbs, sentence case, no filler, no exclamation marks. One job per line of text.
- Specific beats clever: "See every renewal on a calendar" over "Your financial future, reimagined".
