---
date: 2026-09-07
status: hardened
tier: standard
area: design-sketch
design: false
breaking: false
depends_on: [specs/20260907/04-kit-canon-family.md, specs/20260907/05-genesis-drops-the-theme-gates.md]
depended_on_by: [specs/20260907/07-mocks-retires-theme.md]
brief: 22a
spiked: 2026-09-07
open_markers: 0
---

# The theme is picked in sketch: the signed-off gray kit is re-rendered per candidate direction, and the picked page becomes the fidelity reference

## Goal

`/spec:sketch` gains the theme pick as its own first run. The mocks driver gains a `theme`
subcommand family — `state`, `compose`, `open`, `adopt` — that lives entirely outside the
mocks state machine: candidates are the signed-off gray kit re-rendered at production fidelity
per candidate direction (`design/theme/<kebab>/kit.html`), the winner is picked on the served
atlas exactly as every other look stop is, and `adopt` writes `design/tokens.css` plus the
`theme: <kebab>` provenance row. Sketch's "no theme picked yet, sketching gray" branch becomes
**author the theme if it is missing**, with a gray floor only when no kit family exists at all,
and a hard refusal when `design/tokens.css` is present but is the wireframe gray register
byte-for-byte. Done means a host can pick its theme without ever entering `/spec:mocks` THEME,
while `/spec:mocks` THEME keeps working byte-identically — retiring it is specs/20260907/07.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `mocks-driver.js --root <dir> theme state` is a read-only derivation printing one word on stdout: `absent` (no `design/tokens.css`), `picked` (present and not the gray register), and exit 2 with `design/tokens.css is the wireframe gray register byte-for-byte — no theme was ever picked; compose candidate directions, then run: theme open` when `design/tokens.css` is byte-identical to `spec/templates/mocks/wire-tokens.css`. It writes nothing, not even `status.json` (AC-20260907-06-1) | "Author if missing, refuse only if present-and-gray" (JJ 2026-09-07) needs a machine answer, not a session's judgment — § Design Canon: a rule a script can check is never checked by an LLM at runtime. The template is the one comparison source because `design/wire/tokens.css` is copied verbatim from it and nothing else ever writes it (executed sweep: exactly one writer, `mocks-driver.js` `handleCanonWritten`, `copyFileSync` guarded by `!existsSync`). |
| D2 | `theme compose --direction <kebab>` validates ONE candidate directory read-only and prints `✅ direction "<kebab>" composes — <n> primitive(s) re-rendered`. In order, it refuses (exit 2) on: no `design/kit/` resolving above the root (`design/kit/ does not exist — run /spec:mocks to KIT and sign the kit off first`); `design/theme/<k>/tokens.css` missing (`design/theme/<k>/tokens.css does not exist`); `design/theme/<k>/kit.html` missing (`design/theme/<k>/kit.html does not exist — re-render the kit in this direction's tokens`); `isKitCanonFile` false on it (`design/theme/<k>/kit.html is not a kit canon page — its root must carry data-kit-canon before any data-screen-label`); a `wire/` stylesheet link (`design/theme/<k>/kit.html links the wireframe register (wire/) — a candidate direction is the kit at production fidelity`); any `data-kit-primitive` key declared under `design/kit/` and absent from the candidate (`design/theme/<k>/kit.html omits primitive(s) <keys> — every primitive the kit names is re-rendered in every candidate direction`); `design-atlas.js check design/theme/<k>` non-zero (`design-atlas.js check design/theme/<k> failed: <child output>`); no confirmed `said-by-user` `product` row whose `claim` is exactly `theme-directions: <k>` (`design/mocks/ledger.md has no confirmed said-by-user product row with claim "theme-directions: <k>" — record the direction interview pick first`) (AC-20260907-06-2, AC-20260907-06-3) | The kit is the whole candidate set now, so the check is "every named primitive survives this direction", not "the dense screen was recomposed". Rejected: keeping the ≤2-screens/dense-screen rule as a second accepted shape — two candidate shapes for one pick is exactly the ambiguity that made the direction interview drift. |
| D3 | `theme open [--port <n>]` runs D2's validation over every `design/theme/*/` directory on disk, refuses with `theme open: only <n> direction(s) composed — at least 2 are required before opening a look stop` under two valid ones, then delegates to `design-atlas.js stop open` through the existing `runDesignAtlasStopOpen` with `{ kind: 'pick', key: 'theme-picked', title: 'pick the theme', candidates: [{ group: <kebab>, label: 'kit', path: 'theme/<kebab>/kit.html' }, …] }` and **no** `--page` override, so the stop keeps the atlas-index URL. Its stdout is design-atlas's own verified link, unchanged (AC-20260907-06-4) | The stop key stays `theme-picked`, so `design-atlas.js`'s existing `stopHome('theme-picked') → {type:'theme'}` and its `#theme` compare-table section keep working with zero atlas changes. Executed 2026-09-07: a `theme-picked` stop whose candidates are two `data-kit-canon` pages with no `data-screen-label` renders a `#theme` section with one column per direction, one step row (`kit`), one frame per direction and no empty cells. |
| D4 | `theme adopt [--direction <kebab>]` requires a decided `theme-picked` stop (`requireStopDecision('theme-picked', 'theme open')`); a supplied `--direction` disagreeing with the page's pick refuses with the existing `--direction <x> disagrees with the page pick "<pick>" (stop <id>)` literal; it re-runs D2's validation on the picked direction, then requires a confirmed `said-by-user` `product` row whose `claim` is `theme: <kebab>` and whose `rejected` cell names every other composed direction — appending that row itself when absent, with `step` `SKETCH`, `status` `confirmed <today>`, `rejected` = the other composed directions and `note` = the stop's note or `picked on the page` — then copies `design/theme/<kebab>/tokens.css` to `design/tokens.css`, consumes the stop, and prints `✅ theme "<kebab>" adopted — design/tokens.css written · fidelity reference: design/theme/<kebab>/kit.html` (AC-20260907-06-5, AC-20260907-06-6) | The whole of today's `handleThemePicked` body minus the state writes: the ledger discipline, the rejected-cell completeness check and the byte-for-byte token copy are the parts worth keeping, and reusing them verbatim is what makes specs/20260907/07 a pure deletion. Executed 2026-09-07: `ledger add --step SKETCH` is accepted and parses (`\| P90 \| SKETCH \| product \| theme-directions: quiet \|`), so the step vocabulary needs no widening. |
| D5 | `theme adopt` records **no mark**: it leaves `status.marks` and `status.theme` exactly as it found them, and `design/tokens.css` on disk is the sole "a theme is picked" signal any consumer reads. Re-picking is opening a fresh `theme open` stop and adopting again — `adopt` overwrites `design/tokens.css` unconditionally; nothing is ever deleted (AC-20260907-06-5) | The driver's own doctrine — a recorded mark is never trusted alone, the artifact on disk is the truth — plus `status.json` is the *mocks stage's* state file and the theme is no longer a mocks state. Rejected: a `themeAdopted` mark, which would need its own `--reopen` verb and would re-couple sketch to the mocks state machine specs/20260907/07 is about to shrink. |
| D6 | `design-atlas.js`'s wire-register violation text loses the retired state name: `': links the wireframe register (wire/) after THEME — skin it in the picked theme (design/tokens.css)'` becomes `': links the wireframe register (wire/) after the theme pick — skin it in the picked theme (design/tokens.css)'`. The rule's binding, its stamp split and its no-`tokens.css`-means-no-check absence invariant are untouched (AC-20260907-06-7, AC-20260907-06-11) | The sentence is true under both producers, so it lands here rather than in specs/20260907/07 and the literal is never wrong for a single commit. Its only other home is the test that pins it. |
| D7 | `spec/commands/sketch.md` § The run gains **step 3, `Theme (first run only)`**, before the scoped sweep, renumbering today's steps 3–8 to 4–9. It runs `node {driver} theme state`: exit 2 → STOP, printing the driver's stderr verbatim; `picked` → skip to the sweep; `absent` with **no** `design/kit/` resolving → print `⚠️ no design/kit/ and no theme — sketching gray, structure only (run /spec:mocks to KIT first)` and continue gray, which is today's branch reworded; `absent` **with** a kit family → the theme run: read the gray kit + seed + `design/mocks/references/` + `docs/design/research-brief.md`; derive 2–3 candidate directions from the brief's product, audience and references and `AskUserQuestion` which to compose, never a stock pair (warm/cool, playful/serious); record each as a confirmed `theme-directions: <k>` row via `node {driver} ledger add --step SKETCH`; per direction author `design/theme/<k>/tokens.css` (light plus a `[data-theme="dark"]` block whenever `design/targets.json` declares `dark`) and re-render every kit primitive at production fidelity into `design/theme/<k>/kit.html`, primitive keys and structure kept, under the `frontend-design` skill, verifying each with `node {driver} theme compose --direction <k>`; start the served atlas as a tracked background task, run `node {driver} theme open`, print its two lines and **end the turn**, never `AskUserQuestion`; on the next invocation `node {driver} theme adopt`, and a `decided change` is one more compose round then a fresh `theme open`. After adopt, when no shell canon exists, `design/shell/app.html` is extracted from the picked direction's kit page rather than authored freehand. The sweep step's `When design/tokens.css is absent…` clause is deleted — after step 3 it can only be absent on the no-kit floor (AC-20260907-06-8) | One binding home: the interview, the composition rule and the look hand-off are the same three things `spec/commands/mocks.md` § THEME interview rule owns today, moved whole rather than re-derived. The dark-block requirement is not new taste — executed 2026-09-07, `design-atlas.js check` already refuses a themed page whose linked `tokens.css` carries no dark block when `targets.json` declares `dark`, so a candidate that omits it fails D2. |
| D8 | Doctrine, one home: `spec/doctrine/design.md` § Design Canon's **Fidelity lives in sketch** sentence gains that the theme itself is picked on sketch's first run, that candidates are the signed-off gray kit re-rendered per direction at `design/theme/<kebab>/kit.html`, and that the picked direction's kit page is the fidelity reference every later sketch surface is built from. `spec/doctrine/mocks.md` is **not touched** — its § Mocks: Authoring Rules "Theme = recompose, never repaint" bullet still describes the live mocks THEME state and becomes wrong only when specs/20260907/07 retires it (AC-20260907-06-9) | § Doctrine Authoring: the script is the mechanism, prose points at it — and a bullet that is still true is never edited early just because a successor spec will change it. |
| D9 | Bump `spec/.claude-plugin/plugin.json` to the next free minor (target 7.100.0, after 04's 7.98.0 and 05's 7.99.0) with a changelog entry `[no-ac: review's version-bump check is the oracle]` | § Planning version discipline. |

**Orchestrator duty (outside the File Plan table):** `tests/mocks/mocks-driver-fixtures.js` is edited
first — it gains `writeThemeKit(dir, kebab, primitives)` (a `design/theme/<kebab>/` holding a
production-fidelity `data-kit-canon` page plus its own `tokens.css` with a `[data-theme="dark"]`
block) and re-exports it. Nothing in that file is deleted or renamed by this spec: every existing
helper, `advanceToDirectionComposed` and `advanceToThemePicked` included, keeps its current body
and name, because mocks' own THEME state is still live. Run `node --test tests/mocks/` after the
fixture edit and before the new test file, so a fixture regression is never confused with a new
refusal. Per-file 45 s budget (specs/20260903/07) applies: the new `theme` subcommand tests go in
their own file rather than into an existing driver test file.

**Deferred to specs/20260907/07 (not in this spec):** every removal — `deriveState`'s `THEME`
step, `AUTHORING_STATES`, `printThemeStep`, `buildThemeStopSpec`, `stop open theme`, the
`direction-composed` and `theme-picked` marks, `handleApproved`'s `theme-picked first`
precondition, `--reopen theme`, `status.theme`/`marks.themePicked`/`status.directions`, the
`APPROVED` terminal line's theme clause, `spec/commands/mocks.md` § THEME interview rule, and
`spec/doctrine/mocks.md`'s THEME prose — plus the nine mocks test files that ripple from them.

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/mocks-driver.js | MODIFY | scripts | D1–D5: the `theme state\|compose\|open\|adopt` subcommand family, its argv routing and usage header; D2's `composeViolations(kebab)` helper shared by `compose`, `open` and `adopt`; no state-machine, mark, `--reopen` or `deriveState` change |
| spec/scripts/design-atlas.js | MODIFY | scripts | D6: the wire-register violation literal in `themeAndNotesViolations` and its header comment |
| spec/commands/sketch.md | MODIFY | doctrine | D7: § The run's new step 3 `Theme (first run only)`, steps 3–8 renumbered to 4–9, the sweep step's absent-tokens clause deleted, Setup unchanged (`{driver}` is already resolved), one Rules line |
| spec/doctrine/design.md | MODIFY | doctrine | D8: § Design Canon's **Fidelity lives in sketch** sentence |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D9: version bump + changelog entry |
| tests/mocks/mocks-driver-theme.test.js | CREATE | tests | AC-20260907-06-1, AC-20260907-06-2, AC-20260907-06-3, AC-20260907-06-4, AC-20260907-06-5, AC-20260907-06-6, AC-20260907-06-10 |
| tests/mocks/mocks-driver-fixtures.js | MODIFY | tests | Orchestrator duty: `writeThemeKit(dir, kebab, primitives)` added and exported; nothing removed or renamed |
| tests/design-atlas.test.js | MODIFY | tests | AC-20260907-06-7; AC-20260907-06-11 retags the existing no-`tokens.css` absence test |
| tests/consistency/design-doctrine.test.js | MODIFY | tests | AC-20260907-06-8, AC-20260907-06-9 |

## Contracts

```
mocks-driver.js --root <dir> theme state
  stdout "absent"                       design/tokens.css does not exist                    exit 0
  stdout "picked"                       design/tokens.css exists, not the gray register     exit 0
  refuses                               design/tokens.css byte-identical to
                                        spec/templates/mocks/wire-tokens.css                exit 2
    "design/tokens.css is the wireframe gray register byte-for-byte — no theme was ever
     picked; compose candidate directions, then run: theme open"
  writes nothing (not design/mocks/status.json, not picks.json)

mocks-driver.js --root <dir> theme compose --direction <kebab>
  accepts  -> "✅ direction \"<kebab>\" composes — <n> primitive(s) re-rendered"        exit 0
  refuses (exit 2), in this order:
    "design/kit/ does not exist — run /spec:mocks to KIT and sign the kit off first"
    "design/theme/<k>/tokens.css does not exist"
    "design/theme/<k>/kit.html does not exist — re-render the kit in this direction's tokens"
    "design/theme/<k>/kit.html is not a kit canon page — its root must carry data-kit-canon
     before any data-screen-label"
    "design/theme/<k>/kit.html links the wireframe register (wire/) — a candidate direction is
     the kit at production fidelity"
    "design/theme/<k>/kit.html omits primitive(s) <keys> — every primitive the kit names is
     re-rendered in every candidate direction"
    "design-atlas.js check design/theme/<k> failed: <child output>"
    "design/mocks/ledger.md has no confirmed said-by-user product row with claim
     \"theme-directions: <k>\" — record the direction interview pick first"

mocks-driver.js --root <dir> theme open [--port <n>]
  -> design-atlas.js stop open, kind "pick", key "theme-picked", title "pick the theme",
     candidates <kebab>/kit=theme/<kebab>/kit.html for every valid design/theme/<kebab>/,
     NO --page override (the stop keeps the atlas-index url)
  refuses: "theme open: only <n> direction(s) composed — at least 2 are required before
            opening a look stop"
  refuses: any D2 violation on any candidate directory, verbatim

mocks-driver.js --root <dir> theme adopt [--direction <kebab>]
  -> "✅ theme \"<kebab>\" adopted — design/tokens.css written · fidelity reference:
      design/theme/<kebab>/kit.html"
  writes: design/tokens.css (byte-for-byte copy of design/theme/<kebab>/tokens.css)
          design/mocks/ledger.md  (the theme: <kebab> row, only when absent)
          design/mocks/picks.json (the stop consumed)
  leaves: status.marks and status.theme exactly as found
  refuses: "no look stop for theme-picked — run `theme open` first"
  refuses: "--direction <x> disagrees with the page pick \"<pick>\" (stop <id>)"
  refuses: "the \"theme: <k>\" ledger row's rejected cell does not name every other composed
            direction — missing: <list>"

design/theme/<kebab>/            (a candidate direction, authored by /spec:sketch)
  kit.html      root data-kit-canon="<name>", every data-kit-primitive key design/kit/ declares,
                links ./tokens.css, never wire/
  tokens.css    the direction's product tokens; a [data-theme="dark"] block whenever
                design/targets.json declares "dark"

design/mocks/ledger.md   (rows this command writes)
  | <id> | SKETCH | product | theme-directions: <kebab> | said-by-user | confirmed <date> | - | … |
  | <id> | SKETCH | product | theme: <kebab>            | said-by-user | confirmed <date> | <others> | … |
```

## Behavior

`/spec:sketch` on a host whose `design/tokens.css` is absent and whose `design/kit/` resolves
opens with the theme run and ends its first turn on the pick stop's two lines. The user picks on
the served atlas; the next invocation adopts, writes `design/tokens.css`, and falls straight
through into the scoped sweep at production fidelity — from that point every later invocation
sees `picked` and the theme run never runs again.

`/spec:mocks` is untouched for the length of this spec. A host that already ran mocks to
`APPROVED` has `design/tokens.css` on disk, so sketch reports `picked` and behaves exactly as it
does today. A host that has never run mocks has no `design/kit/`, so sketch prints the gray floor
warning and sketches gray, exactly as it does today. The theme run is reachable only on the
in-between host — one that ran mocks through `KIT` — which is precisely the shape
specs/20260907/07 makes the only shape.

`theme adopt` overwrites `design/tokens.css` with no confirmation and deletes nothing, so a
re-pick is: compose more directions, `theme open`, decide on the page, `theme adopt`. There is no
`--reopen theme` equivalent on this path and none is added.

## Acceptance Criteria

- **AC-20260907-06-1**: WHEN `theme state` runs on a root with no `design/tokens.css` THE SYSTEM SHALL print exactly `absent` and exit 0; WHEN `design/tokens.css` is a byte-for-byte copy of `spec/templates/mocks/wire-tokens.css` it SHALL exit 2 naming `the wireframe gray register byte-for-byte` and `theme open`; WHEN `design/tokens.css` differs from that template by one byte it SHALL print exactly `picked` and exit 0; in all three cases `design/mocks/status.json` SHALL be unchanged (absent stays absent) → `tests/mocks/mocks-driver-theme.test.js`
- **AC-20260907-06-2**: WHEN `theme compose --direction quiet` runs against a `design/kit/kit.html` declaring `data-kit-primitive="sheet"` and `data-kit-primitive="row"`, a `design/theme/quiet/kit.html` re-rendering both, a `design/theme/quiet/tokens.css`, and a confirmed `said-by-user` product row `theme-directions: quiet`, THE SYSTEM SHALL exit 0 printing `✅ direction "quiet" composes — 2 primitive(s) re-rendered`; WHEN the candidate page omits `data-kit-primitive="row"` it SHALL exit 2 naming `omits primitive(s) row`; WHEN the candidate page links `../../wire/tokens.css` it SHALL exit 2 naming `links the wireframe register (wire/)`; WHEN the `theme-directions: quiet` row is absent it SHALL exit 2 naming `record the direction interview pick first` → `tests/mocks/mocks-driver-theme.test.js`
- **AC-20260907-06-3**: WHEN `theme compose --direction quiet` runs on a root with no `design/kit/` anywhere above it THE SYSTEM SHALL exit 2 naming `design/kit/ does not exist` and `/spec:mocks to KIT`, and SHALL name no other violation → `tests/mocks/mocks-driver-theme.test.js`
- **AC-20260907-06-4**: WHEN `theme open` runs with two valid candidate directories and a served atlas answering the port THE SYSTEM SHALL write exactly one stop with `kind` `pick`, `key` `theme-picked`, one candidate per direction whose `group` is the direction kebab, whose `label` is `kit` and whose `path` is `theme/<kebab>/kit.html`, and whose recorded `url` matches `atlas/index.html#stop-`; WHEN only one valid directory exists it SHALL exit 2 naming `only 1 direction(s) composed — at least 2 are required` → `tests/mocks/mocks-driver-theme.test.js`
- **AC-20260907-06-5**: WHEN `theme adopt` runs with a `theme-picked` stop decided `pick` on `quiet` (other composed direction `warm`) and no `theme: quiet` ledger row THE SYSTEM SHALL write `design/tokens.css` byte-identical to `design/theme/quiet/tokens.css`, append a row matching `| SKETCH | product | theme: quiet | said-by-user | confirmed <date> | warm |`, mark the stop consumed, and leave `status.theme` and every key of `status.marks` exactly as they were before the call; WHEN no `theme-picked` stop exists it SHALL exit 2 naming `theme open` and SHALL NOT create `design/tokens.css` → `tests/mocks/mocks-driver-theme.test.js`
- **AC-20260907-06-6**: WHEN `theme adopt --direction warm` runs against a stop decided `pick` on `quiet` THE SYSTEM SHALL exit 2 naming `disagrees with the page pick "quiet"` and SHALL NOT create `design/tokens.css` → `tests/mocks/mocks-driver-theme.test.js`
- **AC-20260907-06-7**: WHEN `design-atlas.js check` runs over a labeled mock at `data-status="ratified"` that links `wire/` with a `design/tokens.css` resolving above it THE SYSTEM SHALL exit 1 with a violation containing `after the theme pick`, and its output SHALL contain no occurrence of `after THEME` → `tests/design-atlas.test.js`
- **AC-20260907-06-8**: WHEN `spec/commands/sketch.md` is read THE SYSTEM SHALL carry, under `## The run` and positioned before both the Critique step and the exit step, a step whose heading contains `Theme` and whose body names `theme state`, `theme compose`, `theme open`, `theme adopt`, the literal `⚠️ no design/kit/ and no theme — sketching gray, structure only (run /spec:mocks to KIT first)`, and `end the turn`; and the file SHALL contain neither `/spec:mocks THEME` nor `no theme picked yet` anywhere → `tests/consistency/design-doctrine.test.js`
- **AC-20260907-06-9**: WHEN `spec/doctrine/design.md` § Design Canon is read THE SYSTEM SHALL name `design/theme/<kebab>/kit.html`, the phrase `fidelity reference`, and that the theme is picked on `/spec:sketch`'s first run → `tests/consistency/design-doctrine.test.js`
- **AC-20260907-06-10**: WHEN `--mark direction-composed --direction <k>`, `--mark theme-picked` and `--reopen theme` run on a root advanced through the existing fixture chain THE SYSTEM SHALL CONTINUE TO accept each one and SHALL CONTINUE TO derive `THEME` from a journey-approved root whose `status.theme` is null — this spec adds a second theme producer and retires none → `tests/mocks/mocks-driver-theme.test.js`
- **AC-20260907-06-11**: WHEN `design-atlas.js check` runs over a mock tree with no `design/tokens.css` anywhere above it THE SYSTEM SHALL CONTINUE TO print no wire-register line, warn or violation, and exit 0 → the existing no-`tokens.css` absence test in `tests/design-atlas.test.js`, retagged with this AC-ID

## Assumptions (escalation triggers)

- **A1**: specs/20260907/04 lands `isKitCanonFile(html)` in `spec/scripts/lib/shell-region.js` and exempts kit-canon files from `check`'s `data-screen-label` requirement, exactly as `isCanonFile` already exempts shell-canon files. Executed 2026-09-07 on today's tree: `check` on a `design/shell/app.html` carrying `data-shell-canon` and no `data-screen-label` reports five unrelated violations and **no** `no data-screen-label on any element` line, while the same check on a `data-kit-canon` page reports `no data-screen-label on any element` as its only violation — the exemption exists for shell and does not yet exist for kit. — **if false:** D2's `check` leg and D3's stop both refuse every candidate; fall back to calling `check` on the candidate's `tokens.css` only and drop the `check` leg from D2, recording the loss in the build's deviations file.
- **A2**: `design/wire/tokens.css` is written exactly once, by `handleCanonWritten`'s `copyFileSync` from `spec/templates/mocks/wire-tokens.css`, guarded by `!fs.existsSync`, and no other script or command writes it. Executed 2026-09-07: `grep -rn "design/wire" spec/scripts/*.js spec/scripts/lib/*.js` returns exactly one hit, `mocks-driver.js:869`. — **if false:** D1's gray detection can false-negative on a drifted register; fall back to comparing against `design/wire/tokens.css` when it exists and the template otherwise.
- **A3**: A `theme-picked` pick stop whose candidates are `data-kit-canon` pages with no `data-screen-label` renders correctly in the atlas compare table. Executed 2026-09-07 against today's `design-atlas.js build`: one `#theme` section, `class="chead" data-group="quiet"` and `data-group="warm"`, one step row `step 1 · kit`, two `<iframe>` frames (`../theme/quiet/kit.html?clean`, `../theme/warm/kit.html?clean`), zero `class="card empty"` cells. — **if false:** STOP, ask the user — the pick is unlookable and the whole move stalls.
- **A4**: `design/mocks/ledger.md` accepts `SKETCH` in its `step` column with no grammar change. Executed 2026-09-07: `ledger add --id P90 --step SKETCH --kind product --claim "theme-directions: quiet" --tag said-by-user --status confirmed` exits 0 and writes `| P90 | SKETCH | product | theme-directions: quiet | said-by-user | confirmed | - | - | - |`. — **if false:** use `THEME` as the step value for both rows and note the retired-state name in the build's deviations file.
- **A5**: The atlas frames every look-stop candidate at the **first** declared viewport. Executed 2026-09-07: with the template `design/targets.json` (mobile 390 first, desktop 1280 third) the theme stop's frames carry `data-w="390" data-h="844"`. The page's viewport buttons re-frame every card at once, so the desktop read is one click away and this spec changes nothing about it. — **if false:** no fallback needed; this is an observation, queued as its own item, not a promise of this spec.

## Rationale

The re-chain's hard constraint is that the theme's producer and its only consumer must move
together — but the move as a whole measured six source files plus nine test files, a third over
the decomposition cap, with every one of those test files rippling from a single fixture chain.
Splitting by landing unit gives the standard expand/contract migration: this spec adds the new
producer and its consumer, specs/20260907/07 removes the old one. Each half leaves the tree
green on its own, and the intermediate commit is not a facade — sketch, in this same spec, is
the consumer, and the theme run is reachable and tested on any host that ran mocks through KIT.
The alternative — one eighteen-row spec — puts eleven mechanical test-file edits and a
state-machine excision into a single build run, which is where this pipeline's worst runs have
come from.

Three sub-decisions are worth the cold reader's attention. First, the candidate shape changed
from "the dense screen, a second at most" to "the kit page": the kit is now the one artifact
that names every shared primitive, so re-rendering it per direction tests a direction against
strictly more of the product than the dense screen did, on one page instead of two. Second,
adopt records no mark — `design/tokens.css` on disk is the state, which is the driver's own
"never trust a mark alone" rule applied to a stage that no longer belongs to the mocks state
machine, and it is what keeps specs/20260907/07 a pure deletion with no migration. Third, the
gray floor survives: a host with no kit family still sketches gray with a warning, so this spec
adds no way for `/spec:sketch` to become unusable, and its absence invariant is pinned.

Collision closure: six literal stems (`after THEME`, `no theme picked yet`, `/spec:mocks THEME`,
`theme-picked`, `direction-composed`, `Fidelity lives in sketch`) hit 20 distinct files. Seven
are planned rows: `spec/scripts/mocks-driver.js`, `spec/scripts/design-atlas.js`,
`spec/commands/sketch.md`, `spec/doctrine/design.md`, `tests/design-atlas.test.js`,
`tests/consistency/design-doctrine.test.js`, `tests/mocks/mocks-driver-fixtures.js`. Thirteen are
waived in two groups. **Still-live homes of the mocks THEME state**, which this spec deliberately
does not touch and specs/20260907/07 owns in full: `spec/doctrine/mocks.md`,
`spec/commands/mocks.md`, `tests/mocks/mocks-driver-2.test.js`,
`tests/mocks/mocks-driver-3.test.js`, `tests/mocks/mocks-driver-look-stops.test.js`,
`tests/mocks/mocks-driver-look-stops-3.test.js`, `tests/mocks/mocks-driver-look-stops-4.test.js`,
`tests/mocks/mocks-notes.test.js`. **Dated records**, rewritten by successor records rather than
edited in place: `docs/roadmap/22-mocks-first-genesis.md`,
`docs/roadmap/22a-mocks-is-wireframes.md`, `docs/adr/0008-mocks-is-wireframes.md`,
`docs/adr/0010-kit-walk-and-client-review.md`, `docs/canonical/design.md` — the last is carried
by this spec's own Canonical Delta and by specs/20260907/07's.

The `executes` leg owes no fixture repair. The only observable change to an existing behavior is
D6's one violation literal, and a repo-wide grep finds exactly one assertion on it, in
`tests/design-atlas.test.js` — already a planned row. Every other `executes` hit spawns
`mocks-driver.js` or `design-atlas.js` for paths this spec only adds to.

## Canonical Delta

`docs/canonical/design.md` § Sketch-tier authorship and the shell canon gains, after the
"Fidelity lives in sketch" paragraph:

> The theme itself is picked in sketch (specs/20260907/06). `mocks-driver.js` carries a `theme`
> subcommand family outside the mocks state machine — `theme state` derives `absent`/`picked`
> from `design/tokens.css` and refuses outright when that file is the wireframe gray register
> byte-for-byte; `theme compose --direction <k>` validates one candidate directory; `theme open`
> opens the `theme-picked` pick stop over every valid candidate; `theme adopt` writes
> `design/tokens.css`, appends the `theme: <k>` provenance row at step `SKETCH` and consumes the
> stop. Candidates are the signed-off gray kit re-rendered at production fidelity per direction
> at `design/theme/<kebab>/kit.html`; the picked direction's kit page is the fidelity reference
> every later sketch surface is built from. `adopt` writes no mark — `design/tokens.css` on disk
> is the sole "a theme is picked" signal, and a re-pick is a fresh stop, never a reopen. Sketch's
> first run is the theme run whenever a kit family resolves and no theme is picked; with no kit
> family it prints one gray-floor warning and sketches gray as before.
