# Google Play listing graphics — hard specs

These are the rules Google Play enforces. Never produce assets outside them.

| Asset | Canvas used here | Play rule |
|---|---|---|
| Phone screenshot | **1080 × 1920** (9:16), optional 1.5× export = 1620 × 2880 | 2–8 per listing, PNG or JPEG, 24-bit, **no alpha**, each side 320–3840 px, long side ≤ 2× short side, ≤ 8 MB |
| Feature graphic | **1024 × 500** | Exactly 1024 × 500, JPEG or 24-bit PNG, **no alpha** |
| App icon (not generated) | 512 × 512 | 32-bit PNG, up to 1 MB |

## What Play actually shows

- Search results and the listing page show the **first 3 screenshots** before a user scrolls. Slides 1–3 must carry the
  whole pitch on their own.
- Screenshots appear as small thumbnails (≈ 1/6 of canvas size) on phones. Headlines must read at that size:
  **headline ≥ 84 px, subline ≥ 36 px, nothing below 28 px** on the 1080-wide canvas.
- The feature graphic is cropped on some surfaces and may have a play button overlaid at its centre if a promo video
  exists. Keep the app name and key text inside the **safe area: 64 px from left/right, 48 px from top/bottom**, and never
  put essential text dead-centre.

## Policy guardrails (Play Metadata policy)

- No "#1", "best", "top", "free" price claims, rankings, or award claims unless the app info says they are true.
- No calls to action like "Download now", "Install today", "Play now".
- No fake ratings, review counts, or user numbers. Only use stats present in the app info.
- No other brands' logos, device trademarks (no iPhone frames on Android listings), or Google Play badges.
- Screenshots must show the real app. Never invent UI that is not in the provided screenshots.
- Copy must be in the listing locale given in `app.json` (`locale`).
