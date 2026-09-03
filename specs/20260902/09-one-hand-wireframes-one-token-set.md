---
date: 2026-09-02
status: implementing
build_base: main
tier: standard
area: mocks
design: false
breaking: false
depends_on: [specs/20260902/07-mocks-command-driver.md]
depended_on_by: [specs/20260902/10-page-notes-review-loop.md]
brief: 22
open_markers: 0
diff_base: 94601d6120a96fee2c415fec85c9008aa5ad14ae
---

# One hand, canon-first wireframes, theme as recomposition, one token set

## Goal

Make the authorship rule and the visual registers binding across every design surface: every
mock — wireframe or themed — is authored and edited in-session, no `Agent` dispatch ever
writes a mock in `/spec:mocks`, `/spec:atlas`, or `/spec:sketch`; the wireframe rules and the
theme-as-recomposition rule from the dry run become doctrine the driver already checks; and
the tool chrome (atlas, galleries, preview toolbar, sketch workbench) and the wireframes share
one token set — shadcn's defaults as plain CSS — in two registers, full for chrome and flat
for wireframes, so the viewer, the atlas, the workbench and the notes layer stop looking like
four products. Done = the doctrine paragraph is replaced, the two commands cite it, the
chrome is rendered from `viewer.css`, and the wire tokens are pinned value-equal to it.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/doctrine/design.md` § Design Atlas's authorship paragraph is replaced in place (file stays ≤160 lines, five headings): every mock is authored and edited in-session, one hand for the whole set; `Agent` dispatch is never used to author or edit a mock at any stage or tier (subagents run judgment-free checks only); grounding order becomes seed → canon → research brief → owning brief → doctrine → `tokens.css` → shell canon; the report line becomes `🎨 authored {N} in-session · {K} check-only dispatches`; in the same edit § Design Authoring Contracts' component-manifest sentence names genesis `skeleton-landed` (spec 08 D5) in place of the retired `rules-locked` mark (AC-20260902-09-1) | JJ's 2026-09-02 ruling and ADR-0006: fan-out produced visibly inconsistent design; one author on one canon, checkpointed to disk, is the consistency mechanism now that wireframes make it affordable. |
| D2 | `spec/commands/atlas.md` and `spec/commands/sketch.md` drop their "≤5 in-session + one sequential Fable dispatch" and "Sonnet mechanical edits" clauses and the `🎨 position:` line; both cite the shared paragraph and print D1's line; `core.md` § Model Placement's parenthetical names "every mock, wireframe or themed, authored in-session" in place of "sketch-tier authorship — the atlas sweep and the sketch scoped sweep" (AC-20260902-09-2) | Single doctrine home; the commands are shells over it. |
| D3 | `spec/doctrine/mocks.md` gains `## Mocks: Authoring Rules` — wireframes are gray but carry every graphic that IS structure (state shown as the product's map or a slice; text is for what someone said); one honest wireframe or the full theme, never a half-styled middle; theme = recompose each approved screen at production fidelity on its structure and facts, ≥3 screens per direction including the densest, ≥2 directions, judged on the dense screen first; AI-reworded text gray until confirmed; a persistent recording indicator on any capture surface; equal-weight verdict controls survive every theme; a new primitive names the nearest existing one and why it fails (AC-20260902-09-3) | The six rules the dry run converged on (LEDGER standing rules + M11/M13/M14 + A6/A7); the driver enforces the checkable halves (spec 07 D8/D9), this section carries the rest as contract prose. |
| D4 | One token set: `spec/templates/mocks/viewer.css` ships shadcn's default tokens (zinc scale, system sans, 6px radius, 1px borders, 4px spacing steps) as plain CSS custom properties `--v-*` plus the full register (cards, 1px borders + soft shadow, filled primary button, badges, inputs, toolbar); `spec/templates/mocks/wire-tokens.css` (spec 07) carries the same values under `--bg --fg --muted --muted-bg --border --primary --primary-fg --ring --radius --font`; a test pins the two files value-equal per role (AC-20260902-09-4) | The brief: one token set, two registers; a pinned equality is what stops the two files drifting. |
| D5 | `design-atlas.js`'s `page()` inlines `viewer.css` (read from the plugin template at build time) and its chrome rules consume only `var(--v-*)` roles — badges, bar, cards, gap chips, lightbox, matrix toolbar, gallery cards — no literal colors remain in the emitted chrome CSS; output stays byte-stable across runs (AC-20260902-09-5) | The atlas is the tool chrome the user reviews in; today it is a hand-rolled dark theme unrelated to anything else. |
| D6 | `spec/templates/mocks/wire.css` is re-based on the wire tokens (every color a `var(--role)`, dashed placeholders `--border`, gray fills `--muted-bg`, frame border + state label rules) — the flat register: no shadow, no filled buttons except `.btn.primary` on `--muted-bg`; `canon-written` keeps copying it when absent (AC-20260902-09-4) | The flat register on the same tokens is what makes a wireframe read as the same product as its chrome without pretending to be themed. |
| D7 | `tests/consistency/design-doctrine.test.js` adds the banned literals `Agent {model: "fable"}`, `sonnet-mechanical`, `positions.md` for design.md; `tests/consistency/read-load.test.js` SHALL CONTINUE TO pass for `atlas`, `sketch`, `mocks` (AC-20260902-09-2) | The literal ban is the reopen condition for the retired authorship split, as spec 20260824/05 did for its seats. |
| D8 | Version bump → 7.63.0 target; changelog names one-hand authorship and the shared token set | § Planning. `[no-ac: standing plugin-version pin]` |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/doctrine/design.md | MODIFY | doctrine | D1: authorship paragraph replaced in place (≤160 lines, five headings) |
| spec/doctrine/core.md | MODIFY | doctrine | D2: § Model Placement parenthetical |
| spec/doctrine/mocks.md | MODIFY | doctrine | D3: `## Mocks: Authoring Rules` |
| spec/commands/atlas.md | MODIFY | doctrine | D2: sweep + report line |
| spec/commands/sketch.md | MODIFY | doctrine | D2: scoped sweep + report line |
| spec/templates/mocks/viewer.css | CREATE | doctrine | D4: tokens + full register |
| spec/templates/mocks/wire-tokens.css | MODIFY | doctrine | D4: values aligned to viewer.css (same zinc values, same radius/font) |
| spec/templates/mocks/wire.css | MODIFY | doctrine | D6: flat register on the roles |
| spec/scripts/design-atlas.js | MODIFY | scripts | D5: `page()` inlines viewer.css; chrome CSS on `--v-*` roles; gallery/build/serve toolbar |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D8 |
| tests/mocks/viewer-tokens.test.js | CREATE | tests | AC-20260902-09-4 |
| tests/design-atlas.test.js | MODIFY | tests | AC-20260902-09-5, AC-20260902-09-6 |
| tests/consistency/design-doctrine.test.js | MODIFY | tests | AC-20260902-09-1, AC-20260902-09-2 (banned literals; atlas/sketch/core citations) |
| tests/consistency/genesis-doctrine.test.js | MODIFY | tests | AC-20260902-09-3 (mocks.md section presence; shared-mocks resolves) |

## Contracts

```css
/* spec/templates/mocks/viewer.css — the ONE token set (shadcn defaults, zinc), full register.
   Chrome pages (atlas, galleries, preview toolbar, notes layer, sketch workbench) consume ONLY these roles. */
:root{
  --v-bg:#ffffff; --v-fg:#09090b; --v-muted:#71717a; --v-muted-bg:#f4f4f5; --v-border:#e4e4e7;
  --v-primary:#18181b; --v-primary-fg:#fafafa; --v-ring:#a1a1aa; --v-accent:#f4f4f5;
  --v-danger:#dc2626; --v-warn:#d97706; --v-ok:#16a34a;
  --v-radius:6px; --v-space-1:4px; --v-space-2:8px; --v-space-3:12px; --v-space-4:16px; --v-space-6:24px;
  --v-font:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Inter,Roboto,sans-serif;
  --v-shadow:0 1px 2px rgba(0,0,0,.05),0 4px 12px rgba(0,0,0,.06);
}
/* full register: .v-card .v-btn .v-btn.primary .v-btn.ghost .v-badge .v-input .v-bar .v-chip(.gap/.sketch/.ratified/.approved/.bound/.built/.orphan) */
```

```css
/* spec/templates/mocks/wire-tokens.css — same values, flat-register role names (a wireframe links THIS as its tokens.css) */
:root{ --bg:#ffffff; --fg:#09090b; --muted:#71717a; --muted-bg:#f4f4f5; --border:#e4e4e7;
       --primary:#18181b; --primary-fg:#fafafa; --ring:#a1a1aa; --radius:6px;
       --font:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Inter,Roboto,sans-serif }
```

Value-equality pin (D4): for each pair `(--v-bg,--bg) (--v-fg,--fg) (--v-muted,--muted)
(--v-muted-bg,--muted-bg) (--v-border,--border) (--v-primary,--primary)
(--v-primary-fg,--primary-fg) (--v-ring,--ring) (--v-radius,--radius) (--v-font,--font)` the
declared values are byte-equal after whitespace trim.

Report line (D1), both commands and `/spec:mocks`: `🎨 authored {N} in-session · {K} check-only dispatches`
— `K` counts `Agent` calls that ran a check (render, screenshot compare); an `Agent` call that
wrote a mock is a doctrine violation and never a report number.

`design.md` replacement paragraph (D1, exact, replaces the "Sketch-tier authorship, shared
home for both sweeps." paragraph):

```
**Authorship, shared home for every mock pass.** Every mock — wireframe or themed, atlas gap,
sketch surface, or `/spec:mocks` screen — is authored and edited in-session by one hand; no
`Agent` dispatch ever writes a mock at any stage or tier (subagents run judgment-free checks
only). No shell canon → author one in-session first (§ Design Canon); `shell sync` runs on
the pass's mocks before `check`. Grounding order: `design/mocks/seed.md` → `design/mocks/canon.md`
→ research brief → owning brief → doctrine → `tokens.css` → shell canon (a repo with no seed
starts at the research brief). Both commands' reports add one line: `🎨 authored {N}
in-session · {K} check-only dispatches`.
```

## Behavior

- `page()` reads `viewer.css` once per process from `path.join(__dirname, '..', 'templates',
  'mocks', 'viewer.css')` and inlines it before its own rules; the atlas's own rules are
  rewritten to roles (`background:var(--v-bg)`, badges on `--v-border`/`--v-muted`, status
  chips tinted with `--v-ok/--v-warn/--v-danger` only through roles). The journey graph script
  keeps its status colors as an inline map read from the same roles at runtime
  (`getComputedStyle`), so no chrome literal survives in the emitted page's `<style>`.
- Light chrome: the atlas becomes a light page (shadcn default), the same ground the
  wireframes sit on; the lightbox backdrop uses `--v-fg` at 85% via `color-mix` in the
  template file, never a literal in the script.
- Wire register: `wire.css` links nothing; a wireframe links `../wire/tokens.css` then
  `../wire/wire.css`; the flat classes (`.frame .label .phone .desk .bar .main .box .bubble
  .card .btn .field .list .notice .map .loop .ring .evid .tl .cbar`) consume roles only.
- Authorship in commands: the atlas sweep and the sketch scoped sweep run entirely in-session;
  "Sonnet mock edit" dispatches for mechanical changes are removed from both loops (copy
  swaps are in-session edits too — the cost that justified them is gone at sketch tier).
- Nothing here changes the render gate, `check`'s rules, or the shell mechanism.

## Acceptance Criteria

- **AC-20260902-09-1**: WHEN `spec/doctrine/design.md` is read THE SYSTEM SHALL contain the
  literal `no \`Agent\` dispatch ever writes a mock`, the literal `🎨 authored {N} in-session ·
  {K} check-only dispatches`, the literal `skeleton-landed`, none of `Agent {model: "fable"}`,
  `sonnet-mechanical`, `positions.md`, `design-pick.json`, `rules-locked`, and SHALL CONTINUE
  TO have exactly the five pinned headings and ≤160 lines → `tests/consistency/design-doctrine.test.js`
- **AC-20260902-09-2**: WHEN `spec/commands/atlas.md` and `spec/commands/sketch.md` are read
  THE SYSTEM SHALL find in each the literal `authored {N} in-session` and none of `fable`,
  `sonnet-mechanical`, `Sonnet mock edit`, `one sequential`; `spec/doctrine/core.md` § Model
  Placement SHALL contain `every mock, wireframe or themed, authored in-session`; and
  `citations-check.js` over `spec/` SHALL report `MISS=0` → `tests/consistency/design-doctrine.test.js`
- **AC-20260902-09-3**: WHEN `spec/doctrine/mocks.md` is read THE SYSTEM SHALL carry a
  `## Mocks: Authoring Rules` heading whose body contains the literals `never a half-styled
  middle`, `recompose`, `dense screen first`, and `gray until confirmed` →
  `tests/consistency/genesis-doctrine.test.js`
- **AC-20260902-09-4**: WHEN `viewer.css` and `wire-tokens.css` are parsed for `:root`
  custom properties THE SYSTEM SHALL find every D4 pair value-equal (`--v-bg` `#ffffff` =
  `--bg` `#ffffff`; `--v-radius` `6px` = `--radius` `6px`), `wire.css` SHALL contain no hex,
  `rgb(`, `hsl(` or `oklch(` literal, and every `var(--` it references SHALL be declared in
  `wire-tokens.css` → `tests/mocks/viewer-tokens.test.js`
- **AC-20260902-09-5**: WHEN `design-atlas.js build` and `gallery` emit a page THE SYSTEM
  SHALL include `--v-bg:` in the page's `<style>` and no `#[0-9a-f]{3,8}` literal outside the
  inlined `:root{…}` block → `tests/design-atlas.test.js`
- **AC-20260902-09-6**: WHEN `design-atlas.js build` runs twice on the same root THE SYSTEM
  SHALL CONTINUE TO emit byte-identical output → `tests/design-atlas.test.js`

## Assumptions (escalation triggers)

- A1: design.md's current authorship paragraph is 11 lines and the replacement is ≤11 lines,
  so the 160-line cap holds (file is at 157). **if the replacement runs longer:** tighten the
  replacement, never the cap.
- A2: shadcn's default zinc values (`#09090b`, `#71717a`, `#f4f4f5`, `#e4e4e7`, `#18181b`,
  `#fafafa`, `#a1a1aa`) are the ones the spike's `notes.js` tokens block already carries
  (read from `docs/spikes/22-notes-layer/notes.js`); no registry lookup is needed — they are
  plain CSS values, not a package. **if the spike file is edited:** the template is the source
  from now on.
- A3: `page()`'s callers (`build`, `gallery`, and spec 07's `serve` index) all route through
  the one function, so inlining once covers every chrome page. **if a caller emits its own
  `<style>`:** it is a D5 violation — route it through `page()`.
- A4: `atlas.md`/`sketch.md` read-load stays ≤500 after the edits (both shrink). **if
  false:** shrink the commands, never the cap.

## Rationale

The dry run's most expensive catches (M12, M13, M14) were rules, not pixels: read the
research brief first, draw the product's core object, compose rather than paint. Those go
into doctrine because they are contracts a later session applies, and the driver already
checks the halves that can be checked (the research-brief grounding line, the register
signature, the dense-screen requirement). The authorship rule is JJ's own ruling and ADR-0006's
decision; the report line keeps the count of check-only dispatches so a future measurement
of the rule's cost is still possible.

One token set in two registers is the fix for "four products": the viewer chrome, the atlas,
the workbench and the notes layer all inline the same `viewer.css`, and the wireframes link a
flat file with the same values under role names. Product tokens never leak into chrome and
chrome never adopts product tokens — the equality pin covers the shared values only.

Rejected: a build step or a CSS preprocessor for the tokens (plain CSS, no build, is the
brief's rule and this repo's zero-dependency rule); keeping the dark atlas chrome (it
contradicted the light-first draft framing every mock is judged on).

Collision closure (lock, `--literal sonnet-mechanical --literal 'model: "fable"' --literal
'position:'`): `spec/commands/sketch.md`, `spec/doctrine/design.md`, `spec/commands/atlas.md`
are rows. Waived, with reason: `spec/doctrine/core.md`'s `Agent {model: "fable"}` sentence is
the generic unavailable→Opus fallback rule, not authorship — it stays; `docs/adr/0003`,
`docs/roadmap/20`, `docs/canonical/design.md` are history or the Canonical Delta;
`position:` was a lexical proxy for the retired `🎨 position:` report line — every other hit
(`docs/audit/*`, `docs/spikes/*`, `spec/doctrine/genesis.md`'s "position brief",
`spec/scripts/genesis-driver.js`, `spec/templates/design-positions.md`, the explore/design
tests, `tests/render/render-inventory.test.js`) is an unrelated use of the word or a file spec
08 deletes. `executes` hit `tests/design-shell.test.js` (runs design-atlas.js): the chrome
change touches `page()` only; shell sync/adopt/check outputs are byte-identical — green.

## Canonical Delta

`docs/canonical/design.md`'s **Sketch-tier authorship and the shell canon** section: replace
its first paragraph with — authorship of every mock pass is one in-session hand (ADR-0006,
specs/20260902/09); no `Agent` dispatch writes a mock; the report line is `🎨 authored {N}
in-session · {K} check-only dispatches`; grounding opens with the mocks seed and canon. Add
**One token set (specs/20260902/09)**: `spec/templates/mocks/viewer.css` (shadcn defaults,
full register, inlined into every chrome page by `design-atlas.js`) and
`wire-tokens.css`/`wire.css` (flat register on the same values, pinned equal); product tokens
exist only from THEME and chrome never adopts them.
