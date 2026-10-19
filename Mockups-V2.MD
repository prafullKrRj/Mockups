# Mockup Studio — V2 feature spec

This document is a **work order for a coding agent**. It is self-contained: read it, read the files it points to, and
build the features in priority order. Ship each feature on its own branch (`feat/v2-<slug>`), with commits of at most
~300 changed lines, then merge into `main` with `--no-ff`.

## 0. Ground rules

- **Read first:** `README.md`, `skills/guardrails.md`, `skills/visual-craft.md`, `schemas/plan.schema.json`,
  `src/core/pipeline.js`, `src/templates/render.js`, `dashboard/app.js`.
- **Stack stays the same:** Node 20+ ESM, Express, Playwright, sharp, vanilla JS dashboard (no framework, no build
  step). New dependencies need a one-line reason in the commit message.
- **Every agent output stays untrusted.** Validate in code, roll back on failure. Never let a feature bypass
  `validatePlan` or the export QA.
- **Done means:**
  1. `npm test` passes, with new tests for any new core logic.
  2. `npm run demo` renders with all guardrails green.
  3. You checked the feature in the dashboard at 1440 px and 430 px wide (Playwright screenshots, no console errors).
  4. README updated if behaviour changed.
- **Keep the look calm.** New UI follows the existing dark dashboard tokens in `dashboard/styles.css`. New slide
  styles follow `skills/visual-craft.md`.

---

## P0 — Highest value

### 1. Localisation (multi-locale decks)
Play listings are per-locale, so the same deck is needed in en-US, hi-IN, es-ES and so on.
- `app.json`: `locales: ["en-US", "hi-IN"]`. `plan.json`: copy fields may be strings **or** `{ "<locale>": string }`
  maps (headline, highlight, subline, eyebrow, callouts, badges, featureGraphic.headline). Update the schema with
  `oneOf`.
- New agent step `translate` (`skills/translator.md`): fills missing locales while keeping each line under the
  per-field length limits. The validator checks every locale.
- Export to `export/<locale>/phone/…` and `export/<locale>/feature/…`. The zip mirrors this layout.
- Fonts: when a locale needs it, the renderer picks a Google Noto fallback per script (Devanagari, Arabic RTL with
  `dir="rtl"`, CJK).
- Dashboard: a locale switcher in the header that changes the preview, editor and store preview.
- **Accept:** the demo exported in en-US + hi-IN, with Hindi glyphs rendered (not tofu) and QA green for both.

### 2. Tablet and Chromebook decks
Play wants 7" and 10" tablet screenshots too.
- New canvases: `tablet7` 1200×1920 (portrait), `tablet10` 1600×2560, and landscape variants. A deck is defined by
  `plan.decks: { phone: [...slides], tablet10: [...] }`. Keep `plan.slides` as an alias for `decks.phone` so v1 plans
  still validate.
- A tablet device frame in `render.js` (thinner bezel, 4:3-ish screen), plus a `browser` frame for landscape web or
  desktop screenshots. Auto-pick by screenshot aspect ratio.
- **Accept:** a project with landscape screenshots renders a tablet deck without letterboxing; QA checks the new
  safe areas.

### 3. Visual QA by a vision model (`critic` stage)
The code QA catches geometry, not taste.
- New stage after export: the critic agent (`skills/critic.md`) scores each slide 1–5 on hierarchy, legibility at
  thumbnail size, consistency with the deck, reference match, and slop tells. It writes `.runs/critique.json`
  (`{slideId: {scores, issues[], fix}}`).
- The builder's next round receives the critique. Loop until every slide is ≥ 4 or `--rounds` is used up.
- Dashboard: score badges on previews, and issues listed under each slide.
- **Accept:** on the demo, a deliberately broken plan (headline over the screen, clashing accent) gets scores ≤ 2 and is
  fixed in the next round.

### 4. Undo / history
- Every plan save, agent run and HTML edit snapshots `plan.json` plus custom HTML into
  `.runs/history/<iso-timestamp>/`.
- Dashboard: a history drawer with timeline, thumbnail (the contact sheet at that time), restore and diff (JSON diff
  of plan).
- `⌘Z` / `⇧⌘Z` in the plan editor, as session undo over form edits.
- **Accept:** restoring an older snapshot re-renders exactly that deck.

---

## P1 — Dashboard power features

### 5. Visual canvas editor
Replace "edit raw HTML" for common changes.
- Click a text element in the preview iframe to edit it inline (contenteditable). The change writes back to
  `plan.json`, not to the HTML.
- Drag the device to nudge `offsetX/offsetY` (new optional slide fields, clamped by guardrails). Also a scale slider
  and a rotation slider (−12°…12°).
- Snapping guides at the safe-area margins and the canvas centre.
- **Accept:** moving a device and editing a headline survive a re-render and still pass QA.

### 6. Variant compare (A/B)
- Select up to 4 projects, or 4 themes of one project, and show their contact sheets stacked, with a "pick winner"
  action that copies the winner's theme into the current plan.
- Optional: export a side-by-side PNG for sharing.

### 7. Background & asset library
- `assets/` folder for textures, abstract photos and illustrations (ship 10 tasteful CC0 ones, with licences noted).
- `theme.background.image` with blur, dim and tint controls; per-slide override.
- Optional: an `imagegen` step through a configured image model for a bespoke background from a prompt
  (`config/imagegen.json`), with output saved into `assets/generated/`.

### 8. Brand kit
- Upload a logo and pick brand colours. The tool also extracts colours from the icon (reuse `referencePalette`).
- Saved per user in `config/brand-kits/*.json`, so any project can apply one in a single click (sets accent, accent2
  and fonts).

### 9. Screenshot clean-up tools
- Status bar normaliser: replace the time with 9:41 and show full battery and signal. Do this by detecting the top
  status bar band and overlaying a clean rendered status bar in the app's light or dark mode.
- Auto-crop the navigation bar or gesture pill. Redact regions (blur or solid) with a box drawn in the dashboard.
- These are non-destructive: the originals stay in `input/screenshots/` and the processed copies go in
  `input/processed/`.

### 10. Batch & queue
- Queue several projects or variants. Show a jobs page with progress per stage, durations and agent cost (parse
  Claude's `total_cost_usd`, Codex's `tokens used`).
- Agent concurrency limit in `config/agents.json` (`maxParallel`).

### 11. Command palette and shortcuts
- `⌘K` palette: switch project, jump to slide, run stage, apply preset.
- `?` opens a shortcut sheet.

---

## P2 — Pipeline & agent features

### 12. Copy variants and an ASO scorer
- The planner writes 3 headline options per slide (`headlineOptions[]`). The dashboard lets you pick one.
- An offline scorer flags length, keyword coverage vs `app.keywords[]`, and duplicate phrasing across slides.

### 13. Store-listing text generation
- Generate the title (≤30), short description (≤80) and full description (≤4000) with keyword density from
  `app.json`, through `skills/aso-copywriting.md`. Export them in `export/<locale>/listing.json` and show them in the
  store preview.

### 14. Promo video / animated preview
- Use Playwright video capture or a frame sequence plus ffmpeg (optional dependency) to build a 15–30 s vertical
  promo. Slides cross-fade, and devices get a gentle parallax.
- Export `export/promo.mp4` and a GIF preview for the README.

### 15. App Store (iOS) support
- Canvases 1290×2796 (6.7") and 1242×2688 (6.5"), plus an iPad 2048×2732. An iPhone-style frame drawn in CSS (no
  Apple bezel assets).
- Store target is chosen per project: `play`, `appstore` or both.

### 16. More agents
- Adapters for Gemini CLI, Aider and local models through an OpenAI-compatible endpoint, using a small wrapper script
  that turns a prompt plus images into a file write.
- An agent health check in `node src/cli.js agents --check` (a tiny prompt that must return `OK`).

### 17. Style learning from references
- Save a successful reference-derived theme as a named custom preset (`config/presets/*.json`), which shows in the
  gallery and in `design-system.md` (auto-generated section).

---

## P3 — Production hardening

### 18. Packaging
- `Dockerfile` (Playwright base image) and `docker compose up` for the dashboard. Agents run on the host, or are
  mounted with credentials.
- `npx mockup-studio` works: publish-ready `package.json` (`files`, `bin`, `engines`).

### 19. CI
- GitHub Actions: `npm ci`, `npx playwright install --with-deps chromium`, `npm test`, `npm run demo`. Upload the demo
  contact sheet as an artifact.
- Visual regression: compare demo PNGs against `test/golden/` with a pixel-diff threshold (pixelmatch).

### 20. Security & robustness
- Optional auth token for the dashboard when it is bound to non-localhost (`MOCKUP_TOKEN`).
- Agents run with a per-project working directory and no network unless configured. Document the sandbox flags per
  agent.
- Server: request size limits per route, graceful shutdown that cancels jobs, persisting job logs to
  `.runs/jobs/<id>.log`.
- Rotate `.runs/history` (keep the last 50).

### 21. Accessibility & UX polish
- Keyboard navigation for the gallery, previews and dialogs. Visible focus everywhere. `prefers-reduced-motion`.
- Empty states with one clear next action per tab. Errors that say what to do.
- Light theme for the dashboard (toggle, remembered in localStorage).

### 22. Telemetry-free usage stats
- A local-only `stats.json`: decks generated, average QA pass rate, agent cost per run. Shown on a small home page
  when no project is selected.

---

## Reference: current architecture (v1)

| Area | Files |
|---|---|
| Paths & project IO | `src/core/paths.js`, `src/core/project.js` |
| Plan validation & heuristic planner | `src/core/plan.js`, `schemas/plan.schema.json` |
| Renderer (themes, layouts, frames) | `src/templates/themes.js`, `src/templates/render.js` |
| Build / export / QA | `src/core/build.js`, `src/core/export.js` |
| Agent adapters & pipeline | `config/agents.json`, `src/core/agents.js`, `src/core/pipeline.js` |
| CLI & server | `src/cli.js`, `src/server.js` |
| Dashboard | `dashboard/index.html`, `dashboard/app.js`, `dashboard/styles.css` |
| Agent skills | `skills/*.md`, `skills/vendor/frontend-design/` |
| Scripts | `scripts/make-demo.js`, `scripts/collect-samples.js`, `scripts/capture-dashboard.js` |

**REST API (v1):** `GET /api/meta` · `GET|POST /api/projects` · `GET /api/projects/:name` ·
`POST /api/projects/:name/duplicate` · `PUT /api/projects/:name/app` · `PUT /api/projects/:name/plan` ·
`POST /api/projects/:name/plan/heuristic` · `GET|PUT /api/projects/:name/slides/:id/html` ·
`POST /api/projects/:name/slides/:id/reset` · `POST /api/projects/:name/upload/:kind` ·
`DELETE /api/projects/:name/files/:kind/:file` · `POST /api/projects/:name/run` · `POST /api/projects/:name/export` ·
`GET /api/jobs` · `GET /api/jobs/:id/stream` (SSE) · `POST /api/jobs/:id/cancel` · `GET /api/projects/:name/download.zip`
