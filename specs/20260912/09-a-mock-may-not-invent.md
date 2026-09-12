---
date: 2026-09-12
status: hardened
tier: standard
area: design-mocks
design: false
breaking: true
depends_on: [specs/20260912/08-the-register-is-the-whole-shadcn-set.md]
depended_on_by: [specs/20260912/10-seeded-data-names-its-source.md]
brief: n/a
spiked: 2026-09-12
open_markers: 0
---

# A mock may not invent

## Goal

Consistency in the mock layer breaks in the override layers, not in the styling choice. Nine
screens measured today carried 18 shared-kit classes, 30 project classes and **50 more invented
inside per-screen `<style>` blocks**; 21 of those classes appeared on exactly one screen, 16
names were defined in two or three layers at once, and `.btn` resolved to six different heights
depending on its ancestor. Nothing refuses any of that. This spec gives the project's own
stylesheet one named home, forbids a screen from carrying styles of its own, forbids that
stylesheet from redefining anything the shared kit already provides, caps its size against the
shared kit's own, and warns on any class that only ever appears on one screen. It also emits
the one number the deferred kit-swap decision reads — what share of the capped project kit is
pure layout. Done means: a screen with a `<style>` rule or a `style=` attribute cannot be
approved, and every run prints the project kit's size, its single-screen classes and its layout
share.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The project's own stylesheet gets one named home, `design/wire/project.css`, copied from a new `spec/templates/mocks/project.css` stub by `canon-written` when absent, exactly as the two register files already are. A mock bound by D2 may link no stylesheet other than `wire/tokens.css`, `wire/wire.css` and `wire/project.css` (AC-20260912-09-1) | The layer had no defined home, so each project invented one (`design/wire/hearwell.css`) and nothing could be checked against it; a named single home is itself the consistency mechanism |
| D2 | The rules below bind on a **labelled, non-canon mock that links the wire register** (`lib/wire-register.js`'s `linksWireRegister`), as a `⚠️` warn when `design-atlas.js check` is unbound and a violation when it is bound approved (`ratified`/`approved`/`--matrix`, the existing hygiene stamp). `mocks-driver.js` surfaces the warns at `journey-drawn` and the violations at `journey-approved` `[no-ac: a binding predicate has no observable of its own; each rule it binds carries its own criterion]` | Themed screens on `design/tokens.css` have no shared kit to fall back on and must not be caught by a rule about overriding it |
| D3 | A bound mock carries no `<style>` block that declares a rule and no `style=` attribute. A `<style>` block containing only `@import` statements, whitespace and comments is permitted — an `@import` is a link, not an invented style (AC-20260912-09-2) | The 50 invented classes all lived in per-screen `<style>` blocks; permitting the `@import`-only form keeps the register's own `@import` application route working |
| D4 | `design/wire/project.css` may not declare a selector naming any class `spec/templates/mocks/wire.css` declares. The violation names the class and both files (AC-20260912-09-3) | 16 names defined in two layers is what produced `.btn` at six heights; an override is indistinguishable from a redefinition once a screen is read cold |
| D5 | `design/wire/project.css`'s count of distinct class names may not exceed `wire.css`'s own — computed at run time from the template, never a literal, so the cap moves with the shared kit (22 today). Over the cap is a violation at the bound stamp and a warn below it (AC-20260912-09-4) | A project may not invent more vocabulary than the kit it was given; a literal would go stale the first time the shared kit grows |
| D6 | When `check` visits two or more bound mocks in one run, any project-kit class used on exactly one of them prints `⚠️ <class>: used on one screen only (<label>) — fold it into a shared class or into that screen's kit region`. A warn, never a violation, at every stamp (AC-20260912-09-5) | 21 single-screen classes is the drift signal, but one legitimately unique screen exists in most products — this is a reading aid, not a gate |
| D7 | Every `check` run over a resolved project kit prints one measured line: `ⓘ project kit: <n>/<cap> classes · <r> rules · layout share <p>% (<a> of <r>)`, where a rule counts as layout when **every** declaration in its body names a property in `lib/kit-layers.js`'s `LAYOUT_PROPERTIES` set (Contracts § Layout classification). The percentage is integer, rounded half up, and `0%` when the kit has no rules (AC-20260912-09-6) | This is the number the deferred kit swap reads; the 66-of-103 share measured today was measured under zero discipline, so it is free-invention demand rather than the constrained demand a kit decision needs |
| D8 | Hygiene check (a) — a universal `box-sizing: border-box` rule owed by every bound file — is satisfied when the file links the wire register, because `wire.css` carries that rule. Its own-`<style>` route stays for files that do not link the register  (AC-20260912-09-7, AC-20260912-09-8) | D3 removes the only place (a) could previously look; executed today, a mock with no `<style>` block fails (a) on a register that already declares the reset |
| D9 | The ruling is recorded as an amendment ADR carrying `Applies to` entries for `specs/20260824/03-mock-hygiene-and-marks.md` (hygiene (a) narrowed by D8) and `docs/adr/0013-client-rehearses-the-journey.md` (the authoring rules gain the invention bar); ADR-0013 gains the matching `Amended by` backlink `[no-ac: an ADR records a ruling; every behavioural half of it is carried by D1–D8]` | Narrowing a locked hygiene promise is an amendment, not an edit |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/templates/mocks/project.css | CREATE | doctrine | D1 the stub: a header stating the three rules (no class the shared kit declares, at most as many classes as the shared kit, every class on at least two screens) and no rules |
| spec/scripts/lib/kit-layers.js | CREATE | scripts | D4/D5/D6/D7 `classNamesIn(css)`, `rulesIn(css)`, `overrides(projectCss, wireCss)`, `layoutShare(css)` and `LAYOUT_PROPERTIES`; pure, no `fs` |
| spec/scripts/design-atlas.js | MODIFY | scripts | D2 the binding predicate; D3 the `<style>`/`style=` rules; D4/D5 read `design/wire/project.css` once per family (dedupe like `checkedKitFamilies`); D6 the cross-file single-screen sweep; D7 the measured line; D8 hygiene (a)'s new satisfying route |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D1 `canon-written` copies `project.css` when absent; D2 the warn/violation surfacing at `journey-drawn` and `journey-approved` |
| spec/templates/mocks-kit.html | MODIFY | doctrine | D3/D8 its own `<style>` reset deleted — the linked register carries it now |
| spec/doctrine/mocks.md | MODIFY | doctrine | D1–D7 one new § Mocks: Authoring Rules bullet ("A screen carries no styles of its own"), naming the three layers and the four checks |
| docs/adr/0013-client-rehearses-the-journey.md | MODIFY | other | D9 `Amended by` backlink only |
| docs/adr/0017-a-mock-may-not-invent.md | CREATE | other | D9 the amendment ADR. Take the next free number if 0017 is claimed by a sibling and amend every mention in this spec in the same build |
| tests/mocks/mock-invention.test.js | CREATE | tests | AC-20260912-09-1, AC-20260912-09-2, AC-20260912-09-3, AC-20260912-09-4, AC-20260912-09-5, AC-20260912-09-7, AC-20260912-09-8 |
| tests/mocks/kit-layers.test.js | CREATE | tests | AC-20260912-09-6 |
| tests/design-atlas.test.js | MODIFY | tests | Fixture repair: the five sites linking `wire/` drop their own `<style>` reset (D8 makes it redundant); the `@import`-in-`<style>` fixture is left exactly as it is and is the pre-image D3's permitted form is asserted against |
| tests/mocks/mocks-driver-fixtures.js | MODIFY | tests | Fixture repair: `writeWireframe` and the five other wire-linking writers drop their `<style>` reset so every downstream caller stays green under D3 |
| spec/.claude-plugin/plugin.json | MODIFY | other | Bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` — never a hand-edited version literal |

## Contracts

### The three layers

```
design/wire/tokens.css    the register      copied verbatim, never edited by a project
design/wire/wire.css      the shared kit    copied verbatim, never edited by a project
design/wire/project.css   the project kit   the ONE place a project adds vocabulary
```

A bound mock links the first two always and the third when it exists. Nothing else, and
nothing inline.

### `spec/scripts/lib/kit-layers.js`

```js
// Flat `selector { declarations }` parsing only — the same no-CSS-parser discipline
// design-atlas.js's existing hygiene checks use; @media and nested rules are out of scope.
classNamesIn(css)            // -> Set of distinct class names in every selector
rulesIn(css)                 // -> [{ selector, decls }]
overrides(projectCss, wireCss) // -> [class] present in both, sorted
layoutShare(css)             // -> { rules, layoutRules, percent }
LAYOUT_PROPERTIES            // -> Set, Contracts § Layout classification
```

### Layout classification

A rule is layout when **every** declaration in its body names one of:

```
display  position  top  right  bottom  left  inset  inset-block  inset-inline  z-index
float  clear  overflow  overflow-x  overflow-y  box-sizing  aspect-ratio  object-fit
width  min-width  max-width  height  min-height  max-height
margin  margin-top  margin-right  margin-bottom  margin-left  margin-block  margin-inline
padding  padding-top  padding-right  padding-bottom  padding-left  padding-block  padding-inline
flex  flex-basis  flex-direction  flex-grow  flex-shrink  flex-wrap  order
grid  grid-area  grid-auto-columns  grid-auto-flow  grid-auto-rows  grid-column  grid-row
grid-template  grid-template-areas  grid-template-columns  grid-template-rows
gap  row-gap  column-gap  align-content  align-items  align-self
justify-content  justify-items  justify-self  place-content  place-items  place-self
```

Everything else — colour, background, border, `border-radius`, font, `box-shadow`, `opacity`,
`transition`, `text-*` — is styling. A rule mixing the two counts as styling, not layout: the
question the number answers is "how much of this layer would a richer component kit have
absorbed", and a rule that sets a colour would not have been.

### Messages

```
<file>: <n> <style> rule(s) — a screen carries no styles of its own; move them to
  design/wire/project.css or use a shared class
<file>: <n> inline style= attribute(s) — a screen carries no styles of its own
<file>: links <href> — a wireframe links only wire/tokens.css, wire/wire.css and
  wire/project.css
design/wire/project.css: redefines shared class(es) .btn, .card — spec/templates/mocks/wire.css
  already declares them; delete the project rule or give the variant its own name
design/wire/project.css: <n> classes, over the shared kit's own <cap> — fold the extras into
  shared classes before approving
  ⚠️ .callbar-aux: used on one screen only (session-live) — fold it into a shared class or
     into that screen's kit region
  ⓘ project kit: 18/22 classes · 41 rules · layout share 63% (26 of 41)
```

## Behavior

The project-kit family is resolved by walking up from each visited file to the first
`design/wire/project.css`, and is read **once per run per family**, deduped exactly as
`checkedKitFamilies` already dedupes the kit-canon sweep — so checking a whole directory
reports the cap and the measured line once, not once per screen.

D6's single-screen sweep is the only rule that cannot be answered from one file. It
accumulates, across every bound mock visited in the run, which labels use each project-kit
class, and emits its warns after the walk. A run that visits fewer than two bound mocks emits
nothing: "used on one screen only" is meaningless when only one screen was read, and emitting
it would make `check <single file>` noisier than `check <dir>` for no signal.

Ordering inside the walk: D3's rules are read over the mock, D4/D5/D6/D7's over the project
stylesheet, so a screen with an invented `<style>` block is named for that and not also for
whatever the project kit is doing. Hygiene (a) is evaluated after D8's new route, so a bound
mock that has correctly externalised all of its CSS reports nothing at all.

## Acceptance Criteria

- **AC-20260912-09-1**: WHEN `design-atlas.js check` reads a labelled approved mock that links
  `../wire/tokens.css`, `../wire/wire.css` and `../wire/custom.css` THE SYSTEM SHALL report a
  violation naming `custom.css` and the three permitted stylesheets; and WHEN the same mock
  links `../wire/project.css` in its place it SHALL report none
  → writes tests/mocks/mock-invention.test.js
- **AC-20260912-09-2**: WHEN `design-atlas.js check` reads a labelled approved mock carrying
  `<style>.callbar{gap:8px}</style>` and one `style="margin:0"` attribute THE SYSTEM SHALL
  report two violations — one naming 1 `<style>` rule, one naming 1 inline `style=` attribute;
  and WHEN the mock's only `<style>` block is `<style>@import "../wire/tokens.css";</style>` it
  SHALL report neither → writes tests/mocks/mock-invention.test.js
- **AC-20260912-09-3**: WHEN a bound mock resolves a `design/wire/project.css` declaring
  `.btn { min-height: 44px }` and `.callbar { gap: 8px }` THE SYSTEM SHALL report exactly one
  redefinition violation, naming `.btn` and both file paths, and SHALL NOT name `.callbar`
  → writes tests/mocks/mock-invention.test.js
- **AC-20260912-09-4**: WHEN a bound approved mock resolves a `design/wire/project.css`
  declaring more distinct class names than `spec/templates/mocks/wire.css` declares THE SYSTEM
  SHALL report a violation stating both counts; and WHEN the same project stylesheet resolves
  above a mock stamped `sketch` it SHALL print a `⚠️` warn carrying the same two counts and
  exit 0 → writes tests/mocks/mock-invention.test.js
- **AC-20260912-09-5**: WHEN `check` visits three bound mocks where a project-kit class appears
  on one of them and another appears on two, THE SYSTEM SHALL print exactly one
  `used on one screen only` warn, naming that class and that screen's label; and WHEN the same
  project kit is checked against a single mock file THE SYSTEM SHALL print no such warn
  → writes tests/mocks/mock-invention.test.js
- **AC-20260912-09-6**: WHEN `layoutShare` reads a stylesheet of four rules — one
  `{display:flex;gap:8px}`, one `{padding:12px}`, one `{color:var(--foreground)}` and one
  `{gap:8px;color:var(--foreground)}` — THE SYSTEM SHALL return `{rules: 4, layoutRules: 2,
  percent: 50}`, counting the mixed rule as styling; and an empty stylesheet SHALL return
  `{rules: 0, layoutRules: 0, percent: 0}` → writes tests/mocks/kit-layers.test.js
- **AC-20260912-09-7**: WHEN `design-atlas.js check` reads a labelled approved mock that links
  `../wire/wire.css` and carries no `<style>` block at all THE SYSTEM SHALL report no
  `no universal box-sizing: border-box rule` violation for it
  → writes tests/mocks/mock-invention.test.js
- **AC-20260912-09-8**: WHEN `design-atlas.js check` reads a labelled approved mock that links
  neither `wire/tokens.css` nor `wire/wire.css` and carries no `<style>` block THE SYSTEM SHALL
  CONTINUE TO report `no universal box-sizing: border-box rule` for it
  → writes tests/mocks/mock-invention.test.js

## Assumptions (escalation triggers)

- A1: Removing a mock's `<style>` block reddens hygiene (a) today, which is why D8 is required
  rather than optional. **Executed 2026-09-12**: two synthetic labelled approved mocks
  identical but for the `<style>` reset — the one with it reported 3 violations, the one
  without reported 4, the extra being `no universal box-sizing: border-box rule`.
  **If false:** D8 becomes a no-op row and the ADR's hygiene amendment is dropped; nothing else
  in the spec moves.
- A2: `<style>` blocks live in shared fixtures that D3 would redden. **Executed 2026-09-12**:
  `grep -rn "box-sizing" tests/` returns 9 sites in `tests/design-atlas.test.js` and 1 in
  `tests/mocks/mocks-driver-fixtures.js`; of these, the wire-linking subset is 5 and 6 sites
  respectively (`grep -rc "wire/"`). Only the wire-linking subset is bound by D2. **If false**
  (a bound fixture is found outside those two files): it gets its own File Plan row before the
  build starts; never neuter a fixture so the new refusal cannot reach it.
- A3: `tests/design-atlas.test.js:318`'s `<style>@import "../wire/tokens.css";</style>` fixture
  is the reason D3 permits the `@import`-only form. **If false** (no such fixture survives at
  build time): keep the permission anyway — it is the register's documented application route
  in `lib/wire-register.js`, not a fixture accommodation.
- A4: `wire.css` declares 22 distinct class names, so today's cap is 22. **Executed
  2026-09-12**: `active badge btn card description divider empty ghost input label list-item
  muted nav placeholder primary row screen sheet sm stack table title`. **If false** after
  spec 08's primitive re-draws change the set: nothing moves — the cap is computed from the
  template at run time and no literal is stored.
- A5: `docs/adr/0017-*` is free. **If false** (a sibling claims it first): take the next free
  number and amend the File Plan row, D9 and every backlink in the same build.

## Rationale

The measurement that started this pointed at a poor component kit; it was wrong. Two thirds of
the invention was layout, which no component kit supplies, and the rest was mostly redefinition
of classes the shared kit already had. So the fix is not a richer kit but a refusal: one home
for project vocabulary, nothing inline, no redefinition, and a cap. A model that can add a
`<style>` block will add one every time a screen is slightly awkward, and the awkwardness is
never worth a new vocabulary word.

The cap is computed rather than written down because a literal would have to be re-locked every
time the shared kit grows, and a stale cap either blocks legitimate work or stops binding. Tying
it to the shared kit's own size also states the principle directly: a project does not get more
invented vocabulary than it was given.

D6 is a warn and not a refusal because a genuinely unique screen exists in most products, and a
gate that fires on it teaches authors to name classes vaguely so they match twice. D5 is a
refusal because there is no legitimate story for a project kit larger than the kit it extends.

D7 exists for a decision that is not being made here. The kit swap to daisyUI plus a safelisted
Tailwind subset was priced this session and deferred, on the grounds that the 66-of-103 layout
share was measured with invention free — so it measures appetite, not need. The honest number is
the layout share of a project kit that could not spill into `<style>` blocks and could not
exceed its cap, and that number does not exist until this ships. The flip condition is already
queued against it.

What to watch: D3 is a new refusal over permissive behaviour, the class of change that
historically strands shared fixtures far outside the File Plan. The two fixture files are
entered here on executed counts, and the repair is to make each fixture do what a real session
will do — link the register, carry no styles — never to unbind it from the new rule.

Collision closure run at lock over `box-sizing` and `hygieneViolations`. Fourteen `box-sizing`
hits; the six inside the File Plan need no waive. The rest are **waived, verified**:
`design/client-mocks/*.html`, `docs/spikes/23-atlas-index-nav/*`,
`spec/scripts/lib/notes-layer.browser.js` and `spec/templates/mocks/viewer.css` are chrome, never
read by `check` as screens; `docs/roadmap/20-shell-composed-mocks.md` is prose. The two test
files outside the plan were read at lock and are **not bound by D2**: `tests/genesis/
genesis-driver.test.js`'s mock fixtures link `../tokens.css` plus a shell stylesheet and never
the wire register, and `tests/mocks/notes-layer-isolation.test.js`'s probe links no stylesheet
at all — it declares its own `:root` inline and runs through the Chrome harness, not through
`check`. `hygieneViolations` occurs only in `design-atlas.js`, which is a File Plan row.

## Canonical Delta

`docs/canonical/design.md` § Mock hygiene and marks (2026-08-24, specs/20260824/03) gains: a
wireframe carries no styles of its own. A mock that links the wire register links only
`wire/tokens.css`, `wire/wire.css` and `wire/project.css`, carries no `<style>` block that
declares a rule (an `@import`-only block is permitted) and no `style=` attribute. The project's
own vocabulary lives in `design/wire/project.css` alone; it may not declare a class the shared
kit declares, and it may not hold more distinct classes than the shared kit does — the cap is
read from the shared kit at run time. A class used on exactly one screen is warned, never
refused. The universal `box-sizing` rule hygiene requires is satisfied by linking the register,
which carries it. Every run over a resolved project kit prints its class count against the cap,
its rule count and its layout share — the proportion of rules whose declarations are all layout
or spacing — which is the measurement the deferred component-kit decision reads.
