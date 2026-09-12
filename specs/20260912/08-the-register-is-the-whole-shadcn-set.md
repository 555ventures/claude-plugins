---
date: 2026-09-12
status: hardened
tier: standard
area: design-mocks
design: false
breaking: true
depends_on: []
depended_on_by: [specs/20260912/09-a-mock-may-not-invent.md]
brief: n/a
spiked: 2026-09-12
open_markers: 0
---

# The register is the whole shadcn set

## Goal

The wireframe register claims to be shadcn's Neutral theme but carries eleven roles under
names shadcn does not use, one of which — `--muted` — means the opposite of what it means in
shadcn (a text colour here, a surface there). A client's theme pick therefore covers eight of
shadcn's eighteen colour roles, the other ten get invented at build time, and a theme copied
from any shadcn generator swaps text and background with no error anywhere. This spec makes
the register shadcn's Neutral register verbatim — shadcn's own role names, shadcn's own
values, fetched from the registry — re-bases the shared wireframe stylesheet onto those names,
re-draws the five primitives that drifted from the component they name, and ships the one
command that moves a host repo already holding a copy onto the new register without anyone
redrawing a screen. Done means: a theme candidate that re-values only the old eleven roles is
refused by name, and Hearwell's nine drawn screens render on the new register after one
command.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/templates/mocks/wire-tokens.css`'s `:root` becomes shadcn Neutral's eighteen colour roles plus `--radius`, under shadcn's own names and shadcn's own `oklch()` values exactly as the registry serves them (Contracts § The register), plus three pipeline-local roles: `--font`, `--shadow`, `--shadow-lg`. The eight retired short names (`--bg`, `--fg`, `--muted-bg`, `--primary-fg`) and the retired meaning of `--muted` are gone; chart and sidebar roles are deliberately not carried (AC-20260912-08-2) | A register that is a strict superset under shadcn's own spelling is the only shape a client's copied theme drops into; the inversion dies by construction rather than by a warning nobody reads |
| D2 | `spec/templates/mocks/wire.css`'s fifty-two `var(--…)` references re-base onto the new role names, and every `border-radius` in the file resolves through shadcn's radius scale — `calc(var(--radius) * 0.6)` / `* 0.8` / `var(--radius)` / `* 1.4` — or `9999px` for a deliberate pill; no raw length and no other `calc` form survives (AC-20260912-08-3) | The old file mixed one radius for everything with one hand-rolled `+ 4px`; a named scale is what makes a re-valued `--radius` re-shape every primitive together |
| D3 | Five primitives are re-drawn to the shapes the shadcn registry actually serves (Contracts § Primitive deltas): `.btn`'s default variant becomes filled on `--primary` with `outline` as the named alternative; the focus treatment becomes a 3px translucent ring plus a `--ring`-coloured border, replacing the 2px offset outline; `.badge` keeps its pill but drops to 500 weight and defaults to filled; `.nav` becomes the raised-pill Tabs (a `--muted` track, the active item raised on `--background` with `--shadow`) in place of the underline; `.card` moves to the `* 1.4` radius step. `.sheet`'s elevation moves to `--shadow-lg` (AC-20260912-08-3, AC-20260912-08-7) | Each was measured against the registry source today; a register that says "shadcn's component look" and draws an outline button where shadcn draws a filled one teaches the wrong default to every screen that follows |
| D4 | `.sheet`'s second shadow layer stops passing an opaque surface role as a shadow colour. No `box-shadow` in `wire.css` may name a role whose value is opaque; the elevation lives in `--shadow-lg`, a pipeline role a theme re-values like any other (AC-20260912-08-7) | `0 8px 24px var(--muted-bg)` paints a solid grey halo, not a shadow — a rendering defect, not a taste call, and the only one of the six that is plainly wrong rather than merely off |
| D5 | `mocks-driver.js` gains `--refresh-register`: it keys on the role names a host's `design/wire/tokens.css` declares, never on byte identity. Declaring the retired set → both wire files are overwritten from the current templates and every retired `var(--<old>)` in `design/**/*.html` and `design/wire/*.css` is rewritten to its successor by the D6 map, printing the count of files rewritten. Declaring the new set → a no-op that says so, exit 0. Anything else → refusal naming the file and the remedy, nothing written (AC-20260912-08-4, AC-20260912-08-5, AC-20260912-08-6) | `canon-written` copies only when absent, so every host already holding a register is frozen on the broken one; keying on role names needs no vendored copy of the superseded template and is idempotent by construction |
| D6 | The retired→successor map is one exported table in a new `spec/scripts/lib/wire-roles.js`, read by the refresh path and by the tests, never spelled twice: `bg→background`, `fg→foreground`, `muted→muted-foreground`, `muted-bg→muted`, `primary-fg→primary-foreground`; `border`, `primary`, `ring`, `radius`, `font`, `shadow` keep their names. `muted` maps to `muted-foreground` **before** `muted-bg` maps to `muted`, so the rename is applied as one simultaneous substitution, never as sequential passes (AC-20260912-08-6) | Two roles trade places; a naive sequential rename would collapse both onto one value and silently grey every body of text in the repo |
| D7 | The byte-equality claim between `wire-tokens.css` and `viewer.css`'s `--v-*` register is retired from both file headers, along with the `tests/mocks/viewer-tokens.test.js` citation — that file has never existed. The two registers become separately owned: chrome answers to `design/chrome-mocks/` (specs/20260912/05, 06), the wireframe register answers to shadcn `[no-ac: the removal of a dangling citation has no runtime surface; the independence it records is stated in the amendment ADR and in both file headers]` | The claim was already false for `--shadow` and becomes false for every colour once the values are shadcn's; a documented invariant with no test and no truth is worse than no invariant |
| D8 | The ruling is recorded as an amendment ADR carrying an `Applies to` entry for `docs/adr/0013-client-rehearses-the-journey.md`, whose § Decision register paragraph and § Context line are amended in place to say eighteen roles under shadcn's names; ADR-0013 gains the matching `Amended by` backlink `[no-ac: an ADR records a ruling; every behavioural half of it is carried by D1–D6]` | ADR-0013's "the same eleven roles" is the sentence this spec overturns, and the roadmap-amendment convention is backlinks, never a rewritten original |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/templates/mocks/wire-tokens.css | MODIFY | doctrine | D1 the `:root` block becomes Contracts § The register verbatim; D7 the byte-equality paragraph and the `viewer-tokens.test.js` citation are deleted from the header |
| spec/templates/mocks/wire.css | MODIFY | doctrine | D2 all fifty-two `var()` references re-based and every radius moved to the scale; D3 the five primitive re-draws; D4 `.sheet` onto `--shadow-lg` |
| spec/templates/mocks/viewer.css | MODIFY | doctrine | D7 header only: the "SAME values under role names without the `v-` prefix" sentence and the `viewer-tokens.test.js` citation are replaced by the separate-ownership note. No `--v-*` value changes |
| spec/scripts/lib/wire-roles.js | CREATE | scripts | D6 exports `RETIRED_TO_CURRENT` (the five-entry map), `CURRENT_ROLES` (the twenty-two names D1 declares) and `renameRoles(text)` applying the map as one simultaneous substitution |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D5 the `--refresh-register` arm, its usage line and its exit codes; the two "eleven wire roles" prose occurrences (header comment, the `rootRoles` comment block, the step-hint string near the theme-direction guidance) re-worded to the new count |
| spec/commands/mocks.md | MODIFY | doctrine | D5 one step line telling a session holding an older register to run `--refresh-register` before drawing |
| spec/doctrine/mocks.md | MODIFY | doctrine | D1/D3 § Mocks: Authoring Rules' "Wireframes are neutral…" bullet: eighteen roles under shadcn's names, filled-by-default primary button, the raised-pill tab row |
| docs/adr/0013-client-rehearses-the-journey.md | MODIFY | other | D8 the § Context bullet and the § Decision register paragraph amended to eighteen roles; an `Amended by` backlink added |
| docs/adr/0016-the-register-is-the-whole-shadcn-set.md | CREATE | other | D8 the amendment ADR; `Applies to: docs/adr/0013-client-rehearses-the-journey.md`. Take the next free number if 0016 is claimed by a sibling and amend every mention in this spec in the same build |
| tests/mocks/wire-register.test.js | CREATE | tests | AC-20260912-08-1, AC-20260912-08-2, AC-20260912-08-3, AC-20260912-08-7, AC-20260912-08-8 |
| tests/mocks/register-refresh.test.js | CREATE | tests | AC-20260912-08-4, AC-20260912-08-5, AC-20260912-08-6 |
| tests/mocks/mocks-driver-fixtures.js | MODIFY | tests | `writeThemeKit`'s candidate `tokens.css` re-valued to all twenty-two current roles in both its light and dark blocks, so every caller keeps clearing the role-completeness leg by default; its comment re-worded off "the eleven wire roles" |
| spec/.claude-plugin/plugin.json | MODIFY | other | Bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` — never a hand-edited version literal |

## Contracts

### The register — `spec/templates/mocks/wire-tokens.css` `:root`

Fetched 2026-09-12 from `https://ui.shadcn.com/r/colors/neutral.json` (HTTP 200);
`cssVars.light` and `cssVarsV4.light` are byte-identical there, so `oklch()` is shadcn's own
canonical form and the values below are copied, never converted.

```css
:root {
  /* shadcn Neutral — the eighteen colour roles, verbatim from the registry */
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  /* shadcn's own base radius; the scale below is derived, never re-declared */
  --radius: 0.625rem;
  /* pipeline-local roles — not shadcn's, re-valued by a theme like any other */
  --font: ui-sans-serif,system-ui,-apple-system,"Segoe UI",Inter,Roboto,sans-serif;
  --shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
}
```

Twenty-two declarations: eighteen colour, `--radius`, and three pipeline-local. Chart and
sidebar roles are deliberately absent — nothing in the wireframe vocabulary consumes them, and
every declared role is a role a theme direction must re-value (the role-completeness leg reads
this block at run time).

### The radius scale

Fetched 2026-09-12 from `https://ui.shadcn.com/docs/theming`. shadcn derives four steps from
one base; `wire.css` spells the `calc()` inline rather than declaring alias roles, so a theme
re-valuing `--radius` re-shapes every primitive and the role-completeness leg stays honest
about what a theme owes.

| shadcn utility | expression | at `--radius: 0.625rem` |
|---|---|---|
| `rounded-sm` | `calc(var(--radius) * 0.6)` | 6px |
| `rounded-md` | `calc(var(--radius) * 0.8)` | 8px |
| `rounded-lg` | `var(--radius)` | 10px |
| `rounded-xl` | `calc(var(--radius) * 1.4)` | 14px |

### Primitive deltas

Measured 2026-09-12 against `https://ui.shadcn.com/r/styles/new-york-v4/{button,badge,card,tabs}.json`
(all HTTP 200). Only the rows marked **drift** change; the rest are recorded so a later reader
does not re-open a primitive that is already correct.

| Primitive | shadcn serves | `wire.css` today | verdict |
|---|---|---|---|
| Button, default variant | `bg-primary text-primary-foreground`, `h-9`, `rounded-md`, `px-4`, `text-sm font-medium`, `gap-2` | outline on `--bg`, 36px, `var(--radius)`, `0 16px`, 500 weight, 8px gap | **drift** — default must be filled; radius moves to the `* 0.8` step |
| Button, focus | `focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50` | `outline: 2px solid var(--ring); outline-offset: 2px` | **drift** — becomes `border-color: var(--ring); box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 50%, transparent)`, `outline: none` |
| Button, `sm` | `h-8`, `px-3` | 32px, `0 12px` | correct, unchanged |
| Button, `ghost` | `hover:bg-accent hover:text-accent-foreground`, no border, no shadow | borderless, transparent, hover on `--muted-bg` | correct once re-based onto `--accent` |
| Badge | `rounded-full`, `px-2 py-0.5`, `text-xs font-medium` (500), `border border-transparent`, default `bg-primary text-primary-foreground` | pill, `2px 10px`, 600 weight, bordered, default outline | **drift** — the pill is right; the weight drops to 500, the default becomes filled, padding becomes `2px 8px` |
| Card | `rounded-xl border bg-card py-6 text-card-foreground shadow-sm` | `calc(var(--radius) + 4px)` (12px), 24px padding, `var(--shadow)`, on `--bg` | **drift** in the radius only (`* 1.4` = 14px) and in the roles (`--card` / `--card-foreground`); padding and shadow are already right |
| Tabs | list: `bg-muted rounded-lg p-[3px] h-9 text-muted-foreground`; trigger: `rounded-md px-2 py-1 text-sm font-medium`, active `bg-background text-foreground shadow-sm` | `.nav`: bottom-bordered row, active item underlined in `--primary` | **drift** — becomes the raised pill on a `--muted` track |
| Sheet | elevated panel | `box-shadow: var(--shadow), 0 8px 24px var(--muted-bg)` | **drift** — the second layer passes an opaque surface role as a shadow colour and paints a solid grey halo; becomes `var(--shadow-lg)` |

### `spec/scripts/lib/wire-roles.js`

```js
// RETIRED_TO_CURRENT — applied as ONE simultaneous substitution (D6), never sequentially:
// `muted` and `muted-bg` trade places, so two passes collapse both onto one value.
const RETIRED_TO_CURRENT = {
  'bg': 'background',
  'fg': 'foreground',
  'muted': 'muted-foreground',
  'muted-bg': 'muted',
  'primary-fg': 'primary-foreground',
}
// CURRENT_ROLES — the twenty-two names Contracts § The register declares, in file order.
// renameRoles(text) rewrites every `var(--<retired>` and every `--<retired>:` declaration in
// one pass over the source, leaving a name absent from the map untouched.
module.exports = { RETIRED_TO_CURRENT, CURRENT_ROLES, renameRoles }
```

### `mocks-driver.js --refresh-register`

```
mocks-driver.js --root <dir> --refresh-register

  Reads design/wire/tokens.css's first :root block and classifies it by the role names
  it declares:
    - declares every name in RETIRED_TO_CURRENT and none of CURRENT_ROLES' new names
      → PRE-RENAME: copy both templates over design/wire/{tokens,wire}.css, then apply
        renameRoles() to every design/**/*.html and every design/wire/*.css except
        tokens.css and wire.css (already replaced). Print
        `✅ register refreshed — <n> file(s) rewritten`. Exit 0.
    - declares every name in CURRENT_ROLES → CURRENT: print
      `✅ register is already the current one — nothing to refresh`, write nothing. Exit 0.
    - anything else → refuse: `design/wire/tokens.css declares neither the retired nor the
      current register — re-copy it from spec/templates/mocks/wire-tokens.css by hand, then
      re-run`. Write nothing. Exit 1.

  design/wire/tokens.css absent → `design/wire/tokens.css does not exist — mark canon-written
  first`. Exit 1.

  Exit codes: 0 = refreshed or already current, 1 = refusal, 2 = usage/IO error.
```

## Behavior

`--refresh-register` is deliberately outside the mark chain: it is neither gated on a mark nor
does it write one, because a host may hold a stale register at any state between
`canon-written` and `approved`, and refusing to fix a register until some step is reached would
strand exactly the repos that need it. It is idempotent — a second run classifies CURRENT and
writes nothing.

The rename is textual and scoped to CSS custom-property syntax: `var(--bg)` and `--bg:` are
rewritten, the word `bg` in prose or in a class name is not. Files outside `design/` are never
read. A file the rename does not change is not counted and not rewritten.

The theme role-completeness leg needs no code change: `composeViolations` already reads the
template's `:root` at run time and requires every role it finds to be re-valued by a candidate.
Executed 2026-09-12: the `rootRoles` parser handles multi-line `oklch()` values, a
comma-and-quote-bearing `--font` value and a multi-part `--shadow` value without loss
(Assumptions A1). Widening the template therefore widens the leg for free — which is why the
shared test fixture must be widened in the same batch or every caller of `advanceToThemePicked`
reddens.

## Acceptance Criteria

- **AC-20260912-08-1**: WHEN `mocks-driver.js --mark theme-picked` validates a candidate whose
  `design/theme/<k>/tokens.css` re-values only the retired eleven roles, THE SYSTEM SHALL
  refuse without writing the mark, and the refusal SHALL name each missing role — for a
  candidate declaring exactly `--bg --fg --muted --muted-bg --border --primary --primary-fg
  --ring --radius --font --shadow`, the message names `--background`, `--foreground`, `--card`,
  `--card-foreground`, `--popover`, `--popover-foreground`, `--primary-foreground`,
  `--secondary`, `--secondary-foreground`, `--muted-foreground`, `--accent`,
  `--accent-foreground`, `--destructive`, `--input` and `--shadow-lg`
  → writes tests/mocks/wire-register.test.js
- **AC-20260912-08-2**: WHEN `spec/templates/mocks/wire-tokens.css`'s first `:root` block is
  read THE SYSTEM SHALL declare exactly the twenty-two roles Contracts § The register lists and
  no others — in particular `--muted` SHALL resolve to `oklch(0.97 0 0)` and
  `--muted-foreground` to `oklch(0.556 0 0)` (the surface/text pairing the retired register had
  inverted), and none of `--bg`, `--fg`, `--muted-bg`, `--primary-fg` SHALL appear anywhere in
  the file → writes tests/mocks/wire-register.test.js
- **AC-20260912-08-3**: WHEN `spec/templates/mocks/wire.css` is read THE SYSTEM SHALL contain
  zero `var(--<retired>)` references, every `var(--…)` it does contain SHALL name a role
  declared by `wire-tokens.css`, and every `border-radius` value SHALL be one of
  `calc(var(--radius) * 0.6)`, `calc(var(--radius) * 0.8)`, `var(--radius)`,
  `calc(var(--radius) * 1.4)` or `9999px` → writes tests/mocks/wire-register.test.js
- **AC-20260912-08-4**: WHEN `--refresh-register` runs against a host whose
  `design/wire/tokens.css` declares the retired register and whose `design/mocks/a.html`
  contains `color: var(--fg); background: var(--muted-bg)`, THE SYSTEM SHALL overwrite both
  wire files from the templates, rewrite that screen to `color: var(--foreground); background:
  var(--muted)`, print `✅ register refreshed — 1 file(s) rewritten` and exit 0
  → writes tests/mocks/register-refresh.test.js
- **AC-20260912-08-5**: WHEN `--refresh-register` runs against a host whose
  `design/wire/tokens.css` declares neither register in full (e.g. `:root{--bg:#fff;--brand:#f00}`)
  THE SYSTEM SHALL write no file, print a refusal naming `design/wire/tokens.css` and the
  re-copy remedy, and exit 1; and WHEN it runs against a host already on the current register
  it SHALL write no file, say the register is already current, and exit 0
  → writes tests/mocks/register-refresh.test.js
- **AC-20260912-08-6**: WHEN `renameRoles` is applied to `var(--muted)` and `var(--muted-bg)`
  in one source, THE SYSTEM SHALL produce `var(--muted-foreground)` and `var(--muted)`
  respectively — the two roles trade places in a single pass and neither value is collapsed
  onto the other → writes tests/mocks/register-refresh.test.js
- **AC-20260912-08-7**: WHEN `spec/templates/mocks/wire.css` is read THE SYSTEM SHALL declare
  no `box-shadow` whose colour argument is a `var(--…)` role that `wire-tokens.css` gives an
  opaque value — `.sheet`'s elevation is `var(--shadow-lg)`, and the string `var(--muted-bg)`
  appears nowhere in the file → writes tests/mocks/wire-register.test.js
- **AC-20260912-08-8**: WHEN `design-atlas.js check` reads a labelled mock that links a
  `tokens.css` whose values are `oklch(…)` THE SYSTEM SHALL CONTINUE TO report no off-token
  colour violation for that mock — the colour-literal sweep reads the mock's own markup and
  inline styles, never the linked register `[pre-green: absence-invariant]`
  → writes tests/mocks/wire-register.test.js

## Assumptions (escalation triggers)

- A1: `composeViolations`'s `rootRoles` parser handles the new register's value shapes.
  **Executed 2026-09-12** against a synthetic 18-role `:root` carrying `oklch(0.577 0.245
  27.325)`, a quoted comma-separated `--font` and a multi-part `--shadow`; output
  `["background","foreground","card","destructive","radius","font","shadow"]` — every role
  parsed, no value swallowed. **If false:** widen the `[^}]*` body match before the template
  lands, never narrow the register to suit the parser.
- A2: A linked `tokens.css` whose values are `oklch()` does not trip `design-atlas.js check`'s
  colour-literal sweep. **Executed 2026-09-12**: a synthetic host with an all-`oklch` register
  and a labelled approved mock reported three `data-state-btn` violations and **zero** off-token
  colour violations. **If false:** keep the register in hex and record the conversion in
  Decisions — the values, not the notation, are what a client's theme carries.
- A3: The rename blast radius inside the plugin is one file. **Executed 2026-09-12**: a
  repo-wide grep for `var(--bg|fg|muted|muted-bg|border|primary|primary-fg|ring|radius|font|shadow)`
  across `spec/` returns exactly `spec/templates/mocks/wire.css`, 52 references; every other
  consumer is a host copy. **If false:** each additional plugin file gets its own File Plan row
  before the build starts.
- A4: The role-completeness refusal has no live test — specs/20260910/04's coverage expired at
  that spec's close, so `tests/` holds only a fixture comment about it. **Executed 2026-09-12**:
  `grep -rln "theme compose|theme-picked|composeViolations|theme shortlist" tests/` returns only
  `tests/design-atlas-index.test.js` and `tests/mocks/mocks-driver-fixtures.js`, neither
  asserting the refusal. **If false:** the surviving test is a MODIFY row and AC-20260912-08-1's
  disposition becomes `rewrites` against it.
- A5: `docs/adr/0016-*` is free. **If false** (a sibling claims it first): take the next free
  number and amend the File Plan row, D8, and every `Amended by`/`Applies to` backlink in the
  same build — the number is a target, never a pin.

## Rationale

The thing that transfers from shadcn to a built product is the token register, not the markup —
measured this session at +70–95% output for utility strings that a React rewrite discards
anyway. So the register is the whole payoff, and it was eight-eighteenths complete with one
role meaning its own opposite. Adopting shadcn's spelling verbatim is what makes a theme from
any shadcn generator a drop-in; keeping our shorter names would have preserved the ten-role
hole and the inversion for the sake of 52 references in one file.

`oklch()` over hex was decided by what a client actually pastes: the registry serves oklch in
both its v3 and v4 forms, so hex would mean converting on the way in and converting back on
the way out, twice, by hand. The spike confirmed the atlas's colour sweep never reads the
linked register, so the notation costs nothing.

Five primitives were checked against the registry source rather than from memory, and that
paid: the badge's **pill is correct** — shadcn serves `rounded-full` — so only its weight and
default variant drift, and the card's padding and shadow are already right. Had this been
locked from recollection the spec would have squared a corner shadcn rounds. The sheet's
shadow is the one entry that is a defect rather than a taste call, which is why it has its own
Decision and its own criterion.

The refresh path keys on role names because the alternative — comparing against a vendored copy
of every superseded template — grows a file per future register change and answers the wrong
question. The one genuine trap is that `muted` and `muted-bg` trade places; a sequential
rename would map both onto `muted` and grey out every body of text in a host repo with no
error, which is why the simultaneous substitution has its own criterion rather than being left
to a worker's implementation choice.

What to watch: the shared theme fixture and the register template must land in the same batch,
or every caller of `advanceToThemePicked` reddens on a leg this spec never touches.

Collision closure run at lock over `eleven`, `viewer-tokens`, `muted-bg`, `primary-fg`. Every
`eleven` and `viewer-tokens` hit is already a File Plan row. The `muted-bg`/`primary-fg` hits
outside the File Plan are **waived, verified**: `spec/scripts/design-atlas.js` (15 hits),
`spec/scripts/lib/notes-layer.browser.js` (2), `design/client-mocks/*.html` (12) and
`docs/spikes/23-atlas-index-nav/*` all spell the `--v-`-prefixed chrome roles, which D7 leaves
untouched — confirmed by a prefix-discriminating grep at lock. The one bare-name hit,
`docs/canonical/design.md`, is the Canonical Delta's own target and is replaced there rather
than left standing. The `executes` hit on `tests/spec-paths.test.js` owes nothing:
`--refresh-register` is an arm of an existing entry point and adds no `spec-paths` key, so the
entrypoints manifest and its exhaustive pin are unchanged.

## Canonical Delta

`docs/canonical/design.md` § One token set (2026-09-03, specs/20260902/09) keeps its first
sentence about `viewer.css` and the chrome register unchanged. Everything from
"`spec/templates/mocks/wire-tokens.css` carries the same values…" to the end of the paragraph
is **replaced** — it names the retired roles and claims a value-equality test that does not
exist — by:

> `spec/templates/mocks/wire-tokens.css` is shadcn Neutral's own register: its eighteen colour
> roles plus `--radius`, under shadcn's names and `oklch()` values exactly as the registry
> serves them, plus three pipeline-local roles (`--font`, `--shadow`, `--shadow-lg`).
> `wire.css` is a CSS port of the shadcn component look on those roles — filled `.btn` by
> default on `--primary`, the 3px translucent focus ring, the raised-pill tab row, radii on
> shadcn's four-step scale, dashed `--border` placeholders for undrawn content. A theme
> direction re-values all twenty-two roles, and the role-completeness leg reads the template at
> run time, so the register file is the single source of what a theme owes. The chrome register
> (`viewer.css`'s `--v-*`) is separately owned and is not value-equal: chrome answers to
> `design/chrome-mocks/`, the wireframe register answers to shadcn. A host repo holding an
> older register moves onto the current one with `mocks-driver.js --refresh-register`, which
> classifies by role names, rewrites both wire files, renames role references across `design/`,
> and is idempotent.
