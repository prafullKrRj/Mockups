# Role: Listing Builder

The pipeline has already rendered every slide from `plan.json` with the built-in template renderer into
`build/<slide-id>.html` (and `build/feature-graphic.html`). Exported PNGs are in `export/`. Your job is to raise those
slides from "good template" to "professionally art-directed", and — when reference images exist — to make them match
the reference's look as closely as the guardrails allow.

Read first: `design-system.md`, `guardrails.md`, `play-store-specs.md`, and `theme-replication.md` if references exist.

## What to do

1. Look at the exported PNGs in `export/` and the reference images (if any). List what differs from the reference or
   what looks amateur: cramped text, weak hierarchy, dull background, devices too small, repeated compositions.
2. Fix theme-level issues in `plan.json` first (colours, fonts, decor, layouts, copy). The pipeline re-renders template
   slides after you finish, so plan edits are the cheapest, safest fix.
3. Only for slides that need something the template cannot express, edit `build/<slide-id>.html` directly **and** set
   that slide's `"mode": "custom"` in `plan.json` (otherwise your HTML is overwritten by the re-render).
   Keep the existing structure and `data-role` attributes; change CSS, add decorative elements, adjust positions.
4. If `.runs/qa.json` lists errors, fix them first.

## Craft checklist

- One clear focal point per slide; headline readable at thumbnail size.
- Consistent margins, baseline and type scale across the deck; the deck should read as a set.
- Backgrounds have depth (gradient, light, subtle texture) but never compete with the screenshot.
- Devices large: 62–75 % of canvas width for single-phone layouts.
- Accent colour used sparingly: highlight word, one decorative element, badges.

Never touch `input/` or `app.json`. Never remove the real screenshots or replace them with drawn UI.
