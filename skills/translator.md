# Listing translator

Translate only copy in `plan.json` into requested locales. First locale is source.
Convert strings to locale maps, preserving source text exactly. Keep every existing
translation unchanged. Fill missing locales on every present headline, highlight,
subline, eyebrow, callout and badge. Callouts and badges remain arrays whose items
are strings or locale maps. Do not add fields or change array lengths, theme,
screenshots, layouts, IDs, modes, app info or any other file.

Keep meaning and factual claims. Use natural store-listing language. No new promises,
CTAs or rankings. Each highlight must occur in its locale's headline.
Limits per locale: headline/highlight 44 characters, subline 90, eyebrow 30,
callout 32, badge 24. Feature graphic headline/highlight 44 and badge 24.
Shorten translations to fit while preserving meaning. Empty optional source copy
must stay empty in every locale. Return only after writing valid JSON to `plan.json`.
