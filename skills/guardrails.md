# Guardrails (enforced by the pipeline — violations are rejected)

The pipeline validates every agent output. Breaking these rules wastes a retry; after the retry budget is spent the
pipeline falls back to the deterministic template and your work is discarded.

## Plan (`plan.json`)

- Must validate against `schemas/plan.schema.json`.
- Every `slides[].screenshots[]` entry must be a filename that exists in `input/screenshots/`.
- 2–8 slides. Every provided screenshot that the app info marks with a priority should appear at least once, the
  highest-priority one in slide 1.
- `highlight`, when set, must be an exact substring of `headline`.
- `colors.text` vs `colors.bg` and vs `colors.bg2` contrast ≥ 4.5:1.

## Slide HTML (`build/*.html`)

- Exact canvas: `<html data-canvas="1080x1920">` for phone slides, `data-canvas="1024x500"` for the feature graphic;
  `body` is exactly that size with `overflow: hidden`.
- Self-contained: inline `<style>`; the only allowed external requests are Google Fonts
  (`fonts.googleapis.com`, `fonts.gstatic.com`). No scripts from CDNs, no remote images.
- Screenshots are referenced relatively: `../input/screenshots/<file>`. Every screenshot slide shows at least one of
  them, unmodified (no recolouring, no blur, no overlays covering more than 25 % of the screen).
- Mark elements for the checker: `data-role="headline"`, `data-role="subline"`, `data-role="eyebrow"`,
  `data-role="device"`.
- All text inside the safe margin (72 px phone, 64/48 px feature graphic). Headline must not overlap a device screen.
- Minimum font size 28 px. Headline ≥ 84 px on phone slides unless it is longer than 30 characters (then ≥ 72 px).
- No content invented beyond the app info (see policy rules in `play-store-specs.md`).

## Files you may touch

- Planner: only `plan.json`.
- Builder: only `build/*.html` and `plan.json`. Never edit `input/`, `app.json`, or anything outside the project.
