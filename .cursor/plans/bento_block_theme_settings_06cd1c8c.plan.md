---
name: Bento block theme settings
overview: Add Wagtail StructBlock fields for three appearance presets plus an edge-to-edge background toggle, thread them through `card_layout` JSON, and apply them in the public `shadcn-bentogrid01` mount and the taxonomy constructor editor (types, controls, readonly preview). Light theme uses grey preview text per your choice.
todos:
  - id: wagtail-blocks
    content: Add appearance + full_bleed_background to BentoGrid01Block; run migrations
    status: pending
  - id: serialize
    content: Expose new fields in _serialize_bentogrid01 with safe defaults
    status: pending
  - id: bentogrid01-react
    content: "BentoGrid01Root: full-bleed shell + appearance class map + CarouselCard excerpt overrides"
    status: pending
  - id: taxonomy-editor
    content: Types, defaults, BentoGrid01Editor controls, readonly preview parity
    status: pending
  - id: css
    content: Scoped rules for .scn-bentogrid01--appearance-* and card excerpt/title if needed
    status: pending
isProject: false
---

# Bento block appearance and full-bleed background

## Data model (Wagtail)

Extend [`wigtail/home/blocks.py`](wigtail/home/blocks.py) `BentoGrid01Block` with:

- **`appearance`** — `ChoiceBlock` with three stored values (internal keys) and clear admin labels:
  - `dark` — black section background; badge/heading/tile titles in white; tile descriptions and article preview/excerpt text in **grey** (matches your option 1).
  - `muted` — grey section background; headings/titles in white; preview/description in **white** (option 2).
  - `light` — white section background; headings/titles in **black**; preview/description in **grey** (option 3, with grey preview per your confirmation).

- **`full_bleed_background`** — `BooleanBlock`, default **`false`** so existing published pages keep today’s layout; help text explains “background spans full viewport width” vs “background only behind the centered max-width column”.

Run `makemigrations` / `migrate` so every model using [`MAIN_SITE_STREAMBLOCK`](wigtail/home/blocks.py) picks up the new StructBlock fields (same pattern as [`wigtail/home/migrations/0046_bento_stock_bars_tile.py`](wigtail/home/migrations/0046_bento_stock_bars_tile.py)).

## Server JSON payload

In [`wigtail/home/card_layout.py`](wigtail/home/card_layout.py), `_serialize_bentogrid01` should copy normalized values onto the payload, e.g. `appearance` (default `light` if missing for old stream data) and `full_bleed_background` (default `false`). No change to per-feature serialization.

## Public site React (`shadcn-bentogrid01`)

In [`front-end/src/app/shadcn-bentogrid01.tsx`](front-end/src/app/shadcn-bentogrid01.tsx):

- Extend `BentoGrid01Payload` with optional `appearance` and `full_bleed_background` (treat missing as current behavior).

- **Layout:** Restructure `BentoGrid01Root` into an outer shell + inner `max-w-7xl mx-auto …` content wrapper:
  - **`full_bleed_background === true`:** Apply section background on an outer wrapper using a reliable full-bleed pattern (e.g. `w-screen` + `relative left-1/2 -translate-x-1/2` or `width: 100vw; margin-left: calc(50% - 50vw)`), with vertical padding on that layer so the grey/black/white flood matches your screenshot.
  - **`false`:** Constrain background + padding to the same box as the centered column (no horizontal breakout).

- **Theming:** Put a stable root class on the section/host, e.g. `scn-bentogrid01 scn-bentogrid01--appearance-{dark|muted|light}`, and drive badge, `h2`, tile `h3`, static `p` description, borders, and muted header areas (`bg-muted` equivalents) via Tailwind class maps keyed by `appearance` so you are not fighting global `dark:` tokens.

- **Article cards:** [`CarouselCard`](front-end/src/app/shadcn-taxonomy-editor.tsx) sets a single inline `color` on the card. For split title vs excerpt colors under `dark` (and any theme where excerpt ≠ title), add **scoped CSS** under `.scn-bentogrid01--appearance-dark .carousel-article-card__excerpt` (and analogous rules for `muted` / `light`) in [`front-end/src/styles.css`](front-end/src/styles.css) using specificity / `!important` only where needed to override inheritance from the parent `color`. Alternatively, add an optional prop to `CarouselCard` for “excerpt color override” — prefer the smallest change that keeps card code readable.

## Taxonomy content constructor (editor + readonly)

[`front-end/src/app/shadcn-taxonomy-editor.tsx`](front-end/src/app/shadcn-taxonomy-editor.tsx):

- Extend `BentoGrid01Block` with the same two fields; default new blocks to `appearance: 'light'`, `full_bleed_background: false` in the `switch` factory (~line 1629).

- In **`BentoGrid01Editor`**, add block-level controls next to the existing Size popover (or a small “Block style” popover): appearance as a **three-option** control (reuse existing patterns like `ToggleGroup` / segmented buttons used elsewhere in this file), and a **Switch** for full bleed — mirror shadcn-first rule.

- In **readonly** `renderTaxonomyBlock` for `bento_grid_01`, apply the same root classes / structure as the public component so editors see a faithful preview.

- Ensure save/load of `content_constructor_json` preserves the new keys (no Wagtail change required for taxonomy JSON beyond the front-end).

## Static bundle

After TS changes, rebuild the taxonomy widget bundle if your workflow copies compiled assets into [`wigtail/mysite/static/angular-taxonomy-chip-widget/`](wigtail/mysite/static/angular-taxonomy-chip-widget/) (match whatever the repo already does for prior `shadcn-taxonomy-editor` edits).

## Testing checklist

- Wagtail: edit a Bento block on a page using the main stream; set each appearance + toggle full bleed; publish and verify DOM/classes and colors on the public page.
- Taxonomy: add a bento block, set styles, save, reload drilldown and confirm readonly preview matches.
