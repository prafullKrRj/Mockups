# Replicating a reference theme

When `input/reference/` has images (a sample listing someone else made, a Dribbble shot, a competitor's Play Store
screenshots), the deck must look like it belongs to the **same visual family** while showing this app's screenshots.

## Read the reference like a designer

Look at each reference image and write down, in `theme.referenceNotes`:

1. **Background** — solid, linear gradient (which direction), radial, or multi-blob mesh? Light or dark? Exact-ish hex
   values of the 2–3 dominant colours. `.runs/reference-palette.json` has measured dominant colours — trust those hexes
   over your guess.
2. **Typography** — serif / grotesk / rounded / condensed / mono? Weight? Case? Tight or loose tracking? Pick the closest
   Google Font (e.g. SF Pro → `Inter`, Circular → `DM Sans`, Gilroy → `Plus Jakarta Sans`, Recoleta → `Fraunces`,
   condensed → `Barlow Condensed`, rounded → `Nunito`).
3. **Headline treatment** — highlight colour, gradient text, marker, underline, or none?
4. **Text position** — top or bottom, centred or left-aligned?
5. **Device** — frame colour, shadow, tilt, size relative to canvas, bleed direction, one or two phones?
6. **Decoration** — blobs, grids, dots, glows, stickers, cards, nothing?
7. **Rhythm** — how layouts alternate across the reference deck.

## Map it onto the plan

- Set `theme.preset` to the closest preset, then override `colors`, `background`, `fonts`, `headlineCase`,
  `highlightStyle`, `decor`, `device` to match what you saw.
- Choose each slide's `layout` to mirror the reference rhythm (slide 1 of reference → slide 1 layout, and so on).
- If the user also gave `brandColors` in `app.json`, keep the reference's structure and lightness but swap its accent
  hue for the brand colour.
- Copy the **style**, never the content: no text, logos, or screenshots from the reference may appear in the output.

## If the renderer cannot express the reference

Use the builder stage: set `"mode": "custom"` on the slides that need it and describe the missing elements in
`slide.notes`. The builder agent then hand-edits that slide's HTML (see `builder.md`).
