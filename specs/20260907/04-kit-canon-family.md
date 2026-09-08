---
date: 2026-09-07
status: implementing
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 22a
spiked: 2026-09-07
open_markers: 0
diff_base: e4013c065d4512c8b016e4154133e56ebf588c01
---

# The kit: shared primitives are named before any screen and bound at journey approval

## Goal

`/spec:mocks` gains a `KIT` state between `SHAPES` and `WIREFRAMES` that writes a
`design/kit/` canon family — a sibling of `design/shell/` under the same marks, the same
checker and the same walk-up resolution, never a third parallel concept. It names every
shared primitive once, in every state, with a when-to-use line; it is gray, signed off like a
wireframe, and handed to every wireframe authoring step first. Once it exists, a labeled
mock's content regions must each be a kit instance or carry an explicit bespoke mark naming
the primitive it is *not* and the one structural difference preventing reuse; the counts print
on every check, and `journey-approved` refuses on an unmarked region. Done means a host with
no `design/kit/` behaves byte-identically to today, and a host with one cannot approve a
journey whose screens quietly invent a primitive the kit already names.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `deriveState()` gains one step between `SHAPES` and `WIREFRAMES`: `if (!status.marks.kitSignedOff) return 'KIT'`, placed after the `shapeValid()` line and before the `canonWritten && allJourneysApproved()` line; `freshStatus().marks` gains `kitSignedOff: null` in that position (AC-20260907-04-1) | The chain is linear and derived from marks; one mark, one step, no new derivation shape. Rejected: deriving KIT from `design/kit/` existing on disk — a half-authored kit would silently advance the state, and every other authoring state is mark-gated, not file-gated. |
| D2 | The kit canon file is `design/kit/<name>.html`: root carries `data-kit-canon="<name>"`; each primitive is an element carrying `data-kit-primitive="<key>"` (kebab) and `data-purpose="<one line>"`; a primitive's non-content chrome carries `data-contract="none"`, its content region `data-slot="content"`; states are declared with `data-state-btn="<state>"` exactly as a wireframe does; the file links the wireframe register (`wire/tokens.css`) and is never skinned. A duplicate `data-kit-primitive` key in one family is a `checkKitCanon` violation (AC-20260907-04-2) | Reuses the shell canon's whole mark vocabulary rather than inventing one, which is what makes the kit a second family and not a second mechanism. `data-purpose` is the when-to-use line, machine-readable so a later spec can derive the manifest from it. |
| D3 | `lib/shell-region.js` gains `resolveCanonDir(fromPath, family)` — the existing `resolveShellDir` walk-up generalised over the directory name, checking `<dir>/<family>` then `<dir>/design/<family>` at each ancestor — and `resolveShellDir(fromPath)` is reimplemented as `resolveCanonDir(fromPath, 'shell')`, byte-identical in behavior. It also gains `isKitCanonFile(html)` (a `data-kit-canon="` match that precedes any `data-screen-label="` match, mirroring `isCanonFile`), `checkKitCanon(canonPath, html)` and `diagnoseKitRegions(mockHtml, kitDir)` (AC-20260907-04-3, AC-20260907-04-8) | One resolver, two families. Executed 2026-09-07: `resolveShellDir` returns `null` for a tree holding only `design/kit/`, and `isCanonFile` returns `false` for `data-kit-canon` markup — the kit genuinely cannot reuse either as-is, so generalising is the smallest honest change. |
| D4 | `diagnoseKitRegions(mockHtml, kitDir)` inspects the **top-level children of the labeled root's content region** (the `data-slot="content"` subtree when the mock declares a shell, else the labeled root's own top-level children), skipping any subtree under `data-contract="none"`. Each such region must carry either `data-kit="<key>"` naming a `data-kit-primitive` that exists in the family, or `data-bespoke="<key>: <difference>"` where `<key>` names an existing primitive and `<difference>` is non-empty. Findings: `{code:'unabsorbed', text: '<label>: region <n> carries neither data-kit nor data-bespoke — instantiate a kit primitive or mark it data-bespoke="<key>: <what differs>"'}`, `{code:'unknown-kit', …names data-kit="<k>" but design/kit/ declares no primitive "<k>"…}`, `{code:'bespoke-unnamed', …data-bespoke="<k>: " names no difference — say what prevents reuse…}` (AC-20260907-04-4, AC-20260907-04-5) | The bespoke mark is honest only when it names the primitive it is not and why; a bare flag is a rubber stamp the session grants itself. Content-region scoping is what keeps chrome (already governed by the shell family) out of the count. |
| D5 | `design-atlas.js check` binds the kit family exactly as it binds the shell family: when `resolveCanonDir(f,'kit')` resolves and the file is a labeled non-canon mock, `diagnoseKitRegions` findings are **violations** at `data-status` `ratified`/`approved` or under `--matrix`, and `⚠️` warns at `sketch`; a file that `isKitCanonFile` runs `checkKitCanon` instead. **No `design/kit/` resolving anywhere above the mock → the rule never runs and `check`'s output is byte-identical to today** (AC-20260907-04-5, AC-20260907-04-6) | Same stamp gate, same warn/violate split, same off-by-absence property the wire-register and unresolved-note rules already have (specs/20260906/06 D1) — a host that never runs KIT is unaffected. |
| D6 | When a kit family resolves, `check` prints one informational line per labeled non-canon mock before its warns: `  ⓘ <label>: <n> kit, <m> bespoke` (counting `data-kit` and `data-bespoke` regions found by D4), and a final `  ⓘ unabsorbed total: <m> across <k> screen(s)` when `m > 0`. Informational only — never a violation, never an exit-code change (AC-20260907-04-7) | The count is the signal JJ approves against; a growing number in a report he reads every run is what keeps the bespoke escape from becoming a rubber stamp. It is not a gate, because whether a region "is a sheet" is a judgment and the field lints values, never structures. |
| D7 | `--mark kit-signed` requires a decided look stop keyed `kit-signed` (`requireStopDecision('kit-signed', 'stop open kit')`), requires `design/kit/` to hold ≥1 file and `runDesignAtlasCheck(['design/kit'])` to exit 0, then sets `status.marks.kitSignedOff = nowIso()` and consumes the stop. `stop open kit` builds an `approve` stop, key `kit-signed`, title `sign off the kit`, candidates = every `design/kit/*.html` as `<name>=kit/<name>.html`. `stopHome('kit-signed')` returns `{ type: 'kit' }` so the atlas renders a `#kit` section (AC-20260907-04-9, AC-20260907-04-10) | The kit is signed off like a wireframe, on the page, never by typing — the same look-stop contract every other gated mark uses. |
| D8 | `AUTHORING_STATES` gains `'KIT'` (so the `frontend-design` skill line prints and the look probe runs); `printKitStep()` prints via `printStepBlock('KIT', 'name the shared parts — one page, every state, before any screen', ['design/mocks/seed.md', 'design/shapes/<shape>.html'], 'Mocks: State Machine', …)` with the fixed line `Every wireframe is instantiated from this page — name a primitive once here or it gets invented once per screen.` and a `look:`/`Then:` pair naming `stop open kit` and `--mark kit-signed` (AC-20260907-04-11) | KIT asks the session to draw, so it is an authoring state by the same test D8 of specs/20260906/02 applied to SIGNOFF. The fixed line is the "instantiate, do not invent" seed stated where the author reads it. |
| D9 | `handleJourneyApproved` gains one gate, after the existing `check --states` call and before `requireRenderGateMocks`: when a kit family resolves, `runDesignAtlasCheck([...journeyLabelFiles])` must exit 0, whose D5 binding at `data-status` is reached because `journey-approved`'s mocks are `sketch` — so the call passes `--matrix` to force the violation tier. Exit non-zero refuses with the child's stderr and does not record `journeys.<j>.approved` (AC-20260907-04-12) | The bind fires once per journey, at the last gate before a client sees the frame, where amending the kit is still cheap — not at wireframe speed across every screen (JJ's ruling 2026-09-07). |
| D10 | `--reopen kit` clears `marks.kitSignedOff`, `marks.approved` and `decider`, leaves every `journeys[j].approved` untouched, prints `↩ reopened kit — invalidated: kit, approved(all)`, and pushes the standard `{at,target,invalidated}` record; the refusal literal becomes `--reopen must be journey:<j>, shapes, kit, or theme`. `--reopen shapes` additionally clears `marks.kitSignedOff` and names `kit` in its invalidated list (AC-20260907-04-13) | Mirrors `--reopen theme` exactly: never over-clear, never touch disk. A kit change does not un-approve a journey by fiat — D9's gate re-runs and catches the screens that no longer conform. |
| D11 | Doctrine, one home each: `spec/doctrine/mocks.md` § Mocks: State Machine gains `KIT` in the fixed order sentence and the gated-mark list (`kit-signed`), § Provenance Ledger's step vocabulary gains `KIT`, § Mocks: Authoring Rules gains **"Name the shared parts before the screens."** naming D4's two marks and D6's count; `spec/doctrine/design.md` § Design Canon gains the `kit/<name>.html` bullet beside the existing `shell/<name>.html` bullet; `spec/commands/mocks.md` gains a `## Kit (KIT state)` section and the Rules line becomes `canon before screens, kit before wireframes, screens before sign-off` `[no-ac: prose contract; review's citations-check and doctrine legs are the oracle, the mechanisms are AC-20260907-04-1 and AC-20260907-04-4]` | § Doctrine Authoring: the driver and the checker are the mechanism; prose points at them. |
| D12 | Bump `spec/.claude-plugin/plugin.json` to the next free minor (target 7.98.0) with the changelog entry `[no-ac: review's version-bump check is the oracle]` | § Planning version discipline. |
| D13 | **A primitive is named once per FAMILY, never per file.** `checkKitCanon` is called with the whole family: `design-atlas.js check` collects every `data-kit-primitive` key across every `data-kit-canon` file that resolves to the same `design/kit/` directory, and a key declared in two different files of one family is the same `duplicate data-kit-primitive="<k>"` violation as two declarations in one file, naming both files (AC-20260907-04-16) | JJ's ruling 2026-09-08: a previous build enforced uniqueness only within one file, so two files in `design/kit/` could both declare `sheet` and pass — D2's "one family" is the directory, not the file. |
| D14 | **The kit is signed off on a page that shows the kit.** The atlas's `#kit` section (D7's `stopHome('kit-signed') → {type:'kit'}`) renders, for every candidate of the stop, one `.card` carrying the candidate's name, an `open ↗` link and a `frameTag` of `design/kit/<name>.html` at the file's own viewport (exactly as `renderCompareTable` frames a pick candidate), **before** the approve/change block — never the buttons alone (AC-20260907-04-17) | JJ's ruling 2026-09-08: a previous build rendered the approve/change buttons and never the kit page itself, so the sign-off step had nothing to look at — the feature's core interaction did not work. |
| D15 | **The reason leads; the statistic follows.** `design-atlas.js check` prints D6's `ⓘ` informational lines AFTER the `CHECK FAIL (…)` block (headline plus its `  - ` bullets) or after the `CHECK PASS (…)` line — never before either. Fixed at the producer only; none of the eight `runDesignAtlasCheck` call sites across `mocks-driver.js` and `genesis-driver.js` re-orders or filters the output (AC-20260907-04-18) | JJ's ruling 2026-09-08: with the counts printed first, every consumer that surfaces the check's output leads with a statistic instead of the reason for the refusal. |

**Orchestrator duty (cold read before close, JJ 2026-09-08):** before the final gate is marked, this session (or a fresh-context reader it dispatches) reads EVERY Decision D1–D15 against the code as landed — not the diff, the whole implementation — and records each as satisfied or as a repair. A previous build shipped D2 and D7 misses with every gate green and three delta reviews clean; only a whole-implementation read against the Decisions catches a contract that the tests never asked about.

**Orchestrator duty (outside the File Plan table):** `tests/mocks/mocks-driver-fixtures.js` is the single highest-leverage edit — every test that reaches `WIREFRAMES` or beyond routes through its `advanceTo*` chain, and inserting `KIT` means every such helper gains a `kit-signed` step. Author that fixture change first and run `node --test tests/mocks/` before any other test file. Per-file 45 s budget (specs/20260903/07) applies: split a driver test file rather than let it cross the budget.

**Deferred, queued at lock (not in this spec):** `canon sync|adopt <family>` generalised from `shell sync|adopt` (kit sync rewrites only `data-contract="none"` slots inside each instance, since a primitive is instantiated with different content each time), and the manifest derivation (`design/components.json` derives from the kit and shell families, `components-check.js` becomes the drift check, `canon.md ## Primitives` retired, the genesis primitives gate re-pointed). Both are separate landing units and would push this spec past the row cap; this spec is check-only and green without them.

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/shell-region.js | MODIFY | scripts | D3: `resolveCanonDir(fromPath, family)`, `resolveShellDir` reimplemented on it, `isKitCanonFile`, `checkKitCanon`, `diagnoseKitRegions` (D4's three finding codes); exports extended |
| spec/scripts/design-atlas.js | MODIFY | scripts | D5: kit family bound in `cmdCheck` (warn at sketch, violation at ratified/approved/--matrix, off when no `design/kit/` resolves); D6: the two `ⓘ` count lines; D7/D14: `stopHome('kit-signed') → {type:'kit'}` and the `#kit` page section framing every candidate before the approve block; D13: family-wide primitive uniqueness; D15: `ⓘ` lines after the CHECK block; usage header |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D1: `KIT` in `deriveState` + `kitSignedOff` in `freshStatus`; D7: `kit-signed` mark handler + `buildKitStopSpec` + `stop open kit`; D8: `AUTHORING_STATES` + `printKitStep`; D9: the `journey-approved` kit gate; D10: `--reopen kit` and the shapes-reopen widening; unknown-mark and unknown-step literals; header |
| spec/templates/mocks-kit.html | CREATE | doctrine | D2: the kit canon starting page — the ten primitives as empty `data-kit-primitive` shells with `data-purpose` and state buttons, linking `../wire/tokens.css` |
| spec/doctrine/mocks.md | MODIFY | doctrine | D11: state chain, gated marks, step vocabulary, § Mocks: Authoring Rules' new rule |
| spec/doctrine/design.md | MODIFY | doctrine | D11: the `kit/<name>.html` bullet in § Design Canon |
| spec/commands/mocks.md | MODIFY | doctrine | D11: `## Kit (KIT state)` section, the Rules line, the look-probe state list |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D12: version bump + changelog entry |
| tests/mocks/mocks-driver-fixtures.js | MODIFY | tests | Orchestrator duty: `advanceToKitSigned(dir)` inserted into the chain every later helper routes through; `writeKitCanon(dir, primitives)` helper |
| tests/mocks/mocks-driver.test.js | MODIFY | tests | AC-20260907-04-1, AC-20260907-04-13 |
| tests/mocks/mocks-driver-2.test.js | MODIFY | tests | AC-20260907-04-9, AC-20260907-04-10, AC-20260907-04-12 |
| tests/mocks/mocks-driver-kit-gate.test.js | CREATE | tests | AC-20260907-04-9 (review fix s1: the provenance-ledger gate on `--mark kit-signed`; split from mocks-driver-2 for the per-file 45 s budget) |
| tests/mocks/mocks-driver-look-stops-2.test.js | MODIFY | tests | AC-20260907-04-11 (the KIT step block, its skill line and its look probe) |
| tests/design-atlas.test.js | MODIFY | tests | AC-20260907-04-2, AC-20260907-04-3, AC-20260907-04-4, AC-20260907-04-5, AC-20260907-04-6, AC-20260907-04-7, AC-20260907-04-8, AC-20260907-04-16, AC-20260907-04-17, AC-20260907-04-18 |
| tests/consistency/design-doctrine.test.js | MODIFY | tests | AC-20260907-04-14 (doctrine names the chain, the two marks and the count line) |
| tests/mocks/mocks-notes.test.js | MODIFY | tests | Fixture repair only (collision-closure `executes` hit): its local `advanceToThemePicked()` duplicates the shared chain and must gain the `kit-signed` step — no new AC |

## Contracts

```
mocks-driver.js --root <dir> --mark kit-signed
  refuses: no decided stop            -> "kit-signed requires a decided look stop — run: stop open kit"
  refuses: empty family               -> "design/kit/ holds no .html file — author the kit page first"
  refuses: check fails                -> "design-atlas.js check design/kit failed: <child stderr>"

mocks-driver.js --root <dir> stop open kit [--port <n>]
  -> kind approve, key "kit-signed", title "sign off the kit",
     candidates <name>=kit/<name>.html for every design/kit/*.html

mocks-driver.js --root <dir> --reopen kit
  -> "↩ reopened kit — invalidated: kit, approved(all)"
  -> "--reopen must be journey:<j>, shapes, kit, or theme"   (unknown target)

design-atlas.js check [--matrix] [--states] <file|dir>…
  ⓘ <label>: <n> kit, <m> bespoke                       (per labeled non-canon mock, kit family present)
  ⓘ unabsorbed total: <m> across <k> screen(s)          (only when m > 0)
  violation (ratified|approved|--matrix) / ⚠️ (sketch):
    <file>: region <n> carries neither data-kit nor data-bespoke — instantiate a kit primitive
            or mark it data-bespoke="<key>: <what differs>"
    <file>: names data-kit="<k>" but design/kit/ declares no primitive "<k>"
    <file>: data-bespoke="<k>: " names no difference — say what prevents reuse
  canon file (data-kit-canon):
    <file>: duplicate data-kit-primitive="<k>" — a primitive is named once per family

design/kit/<name>.html
  root                data-kit-canon="<name>"
  each primitive      data-kit-primitive="<key>"  data-purpose="<one line>"
  primitive chrome    data-contract="none"
  primitive content   data-slot="content"
  states              data-state-btn="empty|loading|error"
  stylesheet          ../wire/tokens.css      (gray register; never skinned)

design/mocks/<label>.html   (content regions, when a kit family resolves)
  data-kit="<key>"                        instance of that primitive
  data-bespoke="<key>: <difference>"      deliberate non-instance, difference required
```

## Acceptance Criteria

- **AC-20260907-04-1**: WHEN the driver derives state on a root whose `marks.shapePicked` is set with a valid shape file and `marks.kitSignedOff` is null THE SYSTEM SHALL print `KIT`; WHEN `marks.kitSignedOff` is set and `marks.canonWritten` is null it SHALL print `WIREFRAMES` → `tests/mocks/mocks-driver.test.js`
- **AC-20260907-04-2**: WHEN `check` runs over a `design/kit/kit.html` declaring two elements with `data-kit-primitive="sheet"` THE SYSTEM SHALL exit 1 naming `duplicate data-kit-primitive="sheet"`; WHEN each key is unique it SHALL exit 0 → `tests/design-atlas.test.js`
- **AC-20260907-04-3**: WHEN `resolveCanonDir` is called with family `kit` on a tree holding only `design/kit/` THE SYSTEM SHALL return that directory, and WHEN called with family `shell` on the same tree it SHALL return null → `tests/design-atlas.test.js`
- **AC-20260907-04-4**: WHEN `check --matrix` runs over a labeled mock whose content region carries neither `data-kit` nor `data-bespoke`, with a kit family present, THE SYSTEM SHALL exit 1 naming `carries neither data-kit nor data-bespoke`; WHEN that region carries `data-bespoke="sheet: two-column body the sheet primitive cannot express"` it SHALL exit 0 → `tests/design-atlas.test.js`
- **AC-20260907-04-5**: WHEN a labeled mock at `data-status="sketch"` carries an unabsorbed region THE SYSTEM SHALL print the finding as a `⚠️` warn and exit 0; WHEN the same mock is at `data-status="approved"` it SHALL exit 1 with the same text as a violation → `tests/design-atlas.test.js`
- **AC-20260907-04-6**: WHEN `check` runs over a mock tree with **no** `design/kit/` anywhere above it THE SYSTEM SHALL produce output byte-identical to the same run before this spec, printing no `ⓘ` line and no kit finding → `tests/design-atlas.test.js`
- **AC-20260907-04-7**: WHEN `check` runs over two labeled mocks with a kit family present, one carrying two `data-kit` regions and one bespoke region and the other carrying three `data-kit` regions, THE SYSTEM SHALL print `ⓘ <label>: 2 kit, 1 bespoke`, `ⓘ <label>: 3 kit, 0 bespoke` and `ⓘ unabsorbed total: 1 across 1 screen(s)`, and SHALL exit 0 → `tests/design-atlas.test.js`
- **AC-20260907-04-8**: WHEN `isKitCanonFile` is given markup whose `data-kit-canon` precedes any `data-screen-label` THE SYSTEM SHALL return true, and WHEN given markup carrying only `data-shell-canon` it SHALL return false → `tests/design-atlas.test.js`
- **AC-20260907-04-9**: WHEN `--mark kit-signed` runs with no decided stop THE SYSTEM SHALL exit non-zero naming `stop open kit` and SHALL NOT set `marks.kitSignedOff`; WHEN `design/kit/` is empty with a decided stop present it SHALL exit non-zero naming `design/kit/ holds no .html file` → `tests/mocks/mocks-driver-2.test.js`
- **AC-20260907-04-10**: WHEN `stop open kit` runs with two files under `design/kit/` THE SYSTEM SHALL write one stop with `kind` `approve`, `key` `kit-signed` and one candidate per file → `tests/mocks/mocks-driver-2.test.js`
- **AC-20260907-04-11**: WHEN the bare driver prints the `KIT` step block with a fake `claude` on PATH reporting the skill installed THE SYSTEM SHALL print the `🎨 Load the \`frontend-design\` skill` line, the literal `Every wireframe is instantiated from this page — name a primitive once here or it gets invented once per screen.`, a `look:` line naming `stop open kit` and a `Then:` line naming `--mark kit-signed`; WHEN the look probe is unreachable it SHALL exit 3 naming the remedy → `tests/mocks/mocks-driver-look-stops-2.test.js`
- **AC-20260907-04-12**: WHEN `--mark journey-approved` runs on a journey whose screens carry an unabsorbed region, with a kit family present, every note resolved, a decided stop and states declared, THE SYSTEM SHALL exit non-zero naming the file and the remedy and SHALL NOT set `journeys.<j>.approved`; WHEN every region is kit-tagged or bespoke-marked it SHALL accept → `tests/mocks/mocks-driver-2.test.js`
- **AC-20260907-04-13**: WHEN `--reopen kit` runs on an `APPROVED` root THE SYSTEM SHALL print `↩ reopened kit — invalidated: kit, approved(all)`, set `marks.kitSignedOff`, `marks.approved` and `decider` to null, leave every `journeys[j].approved` unchanged, and derive `KIT`; WHEN `--reopen bogus` runs it SHALL exit non-zero naming `journey:<j>, shapes, kit, or theme` → `tests/mocks/mocks-driver.test.js`
- **AC-20260907-04-14**: WHEN `spec/doctrine/mocks.md` is read THE SYSTEM SHALL contain `SEED`, `SHAPES`, `KIT`, `WIREFRAMES` in that order within its § Mocks: State Machine order sentence, name `kit-signed` in its gated-mark list, and name both `data-kit` and `data-bespoke` in § Mocks: Authoring Rules → `tests/consistency/design-doctrine.test.js`
- **AC-20260907-04-15**: WHEN the driver derives state on a root checkpointed under the pre-spec shape (`marks.shapePicked` set, `marks.canonWritten` set, every journey approved, `theme` set, `marks.approved` null, and no `kitSignedOff` key at all) THE SYSTEM SHALL CONTINUE TO advance rather than trap — it SHALL print `KIT` and SHALL NOT throw → `tests/mocks/mocks-driver.test.js`
- **AC-20260907-04-16**: WHEN `check` runs over a `design/kit/` holding `a.html` and `b.html` that each declare one element with `data-kit-primitive="sheet"` and no other duplicate THE SYSTEM SHALL exit 1 naming `duplicate data-kit-primitive="sheet"` and both file names; WHEN the two files declare disjoint keys it SHALL exit 0 → `tests/design-atlas.test.js`
- **AC-20260907-04-17**: WHEN the atlas is built for a root whose picks store holds an open `approve` stop keyed `kit-signed` with candidates `kit=kit/kit.html` and `forms=kit/forms.html` THE SYSTEM SHALL emit a `<section … id="kit">` containing, before the stop's `data-decide="approve"` button, one `<iframe` whose `src` ends in `kit/kit.html` and one whose `src` ends in `kit/forms.html`, each inside a `.card` naming its candidate; WHEN no `kit-signed` stop is live it SHALL emit no `id="kit"` section → `tests/design-atlas.test.js`
- **AC-20260907-04-18**: WHEN `check --matrix` runs over a labeled mock with one unabsorbed region and a kit family present THE SYSTEM SHALL print the `CHECK FAIL (` line and its `  - ` bullet before the first `ⓘ` line, and WHEN the same mock is fully kit-tagged it SHALL print `CHECK PASS (` before the first `ⓘ` line → `tests/design-atlas.test.js`

## Assumptions

- **A1 (executed 2026-09-07):** the provenance ledger's `step` column is validated by the regex
  `^[A-Z][A-Z-]*$` (`lib/mocks-ledger.js`), not an enum, so new step tokens need no library
  change. `parseLedger` over a document carrying assumption rows stepped `KIT`, `WALK` and
  `CLIENT` plus a catch row stepped `KIT` → `errors: []`, `assumptions => KIT,WALK,CLIENT`,
  `catches => KIT`. **if false:** add an accepted-token list to the parser, one AC.
- **A2 (executed 2026-09-07):** `resolveShellDir` cannot serve the kit family — on a tree
  holding only `design/kit/` it returns `null`, and returns the shell dir only once
  `design/shell/` exists. `isCanonFile("<div data-kit-canon=\"kit\">…")` returns `false`.
  Both confirm D3's generalisation is required rather than cosmetic. **if false:** drop D3's
  `resolveCanonDir` and pass the family name through the existing helper.
- **A3 (unverified, low risk):** `journey-approved`'s mocks sit at `data-status="sketch"`, so
  D5's stamp gate would only warn there; D9 therefore passes `--matrix` to force the violation
  tier, which is the same lever `check --matrix` already gives the hygiene rules.
  **if false:** bind D5 at `journey-approved` by an explicit flag instead of `--matrix`, one AC.
- **A4 (unverified):** no host has a `design/kit/` directory today, so D5's off-by-absence
  property means this spec cannot change any existing host's `check` output. **if false:** the
  affected host runs `--reopen kit` and authors a kit page before its next approval.

## Rationale

The measurement behind this spec is in brief 22a's amended section and ADR-0010: salon-os's
shell canon names 28 classes, every one chrome, and no sheet, empty state, table row, card,
form field or option group — and the result is 90 components for ~24 screens with 18
sheet-family entries beside a generic `Sheet`. That is not drift from a named primitive (which
looks like `SheetV2`); screen-prefixed names are the signature of a primitive that was never
named. The one canon that existed held. This spec puts a canon inside the content slot, which
is the only region the shell family does not govern.

The binding point is JJ's ruling of 2026-09-07 and it is deliberately *not* the industry
default. The 2026 sources recommend enforcement over convention for **values with a finite
legal set** — raw hex, invented token names — and this repo already has that check. Nobody in
the field lints structural reuse, because whether a region "is a sheet" is a judgment. The
justification for D9's gate is therefore local and measured, not borrowed: named-and-checked
chrome held while unnamed content drifted eighteen-fold, under one author reading the same
canon. If the bespoke count proves useless in the first host run, D9 is the decision to
remove — not the kit.

A blanket authoring lint was rejected explicitly (ADR-0010 option A): it would fire at
wireframe speed across ~24 screens, and the escape would become something to silence. D6's
count plus D9's once-per-journey gate is the cheaper shape that still fails loudly, and D8's
fixed line makes the kit the authoring *seed*, which is what keeps the residue small enough
for the count to stay honest.

**Collision closure (executed 2026-09-07)** over the literals D11 and D3 narrow —
`canon before screens`, `AUTHORING_STATES`, `resolveShellDir` — returned five literals-leg
hits. Three are File Plan rows already (`spec/commands/mocks.md`,
`spec/scripts/mocks-driver.js`, `spec/scripts/lib/shell-region.js`, plus
`spec/scripts/design-atlas.js`). Two are **waived**: `docs/adr/0010` names `AUTHORING_STATES`
inside its Applies-to enumeration, which is the forward record of this very change and stays
correct; `docs/roadmap/22a`'s § Current state names it while describing the pre-spec driver,
and a brief's Current state is a dated snapshot that is meant to read as historical. The
`executes` tier surfaced `tests/mocks/mocks-notes.test.js`, whose local duplicate of the
advance chain is now a File Plan row for fixture repair, and `tests/spec-paths.test.js`, which
pins the `shared-for` section sets this spec does not touch — waived.

`canon sync` and the manifest derivation are deliberately out. Each is its own landing unit,
and this spec is green without them: the kit exists, is checked, and binds approval, while
`design/components.json` keeps its current session-authored contract untouched.

## Canonical Delta

`docs/canonical/design.md` § The mocks command: replace the state chain sentence with
"`SEED → SHAPES → KIT → WIREFRAMES → THEME → SIGNOFF → APPROVED` (specs/20260907/04, ADR-0010
amending ADR-0008): `KIT` writes `design/kit/<name>.html`, a canon family sibling to
`design/shell/` under the same marks and the same checker, gray and never skinned, signed off
on the page via `stop open kit` / `--mark kit-signed`. Once a kit family resolves, every
content region of a labeled mock is either `data-kit=\"<key>\"` or
`data-bespoke=\"<key>: <difference>\"`; `check` prints `ⓘ <label>: <n> kit, <m> bespoke` per
screen plus an unabsorbed total, warns at `sketch` and violates at `ratified`/`approved`/
`--matrix`, and `journey-approved` refuses on an unmarked region. `--reopen kit` clears the kit
sign-off and the terminal approval only, never a journey's own approval. A tree with no
`design/kit/` is unaffected." Add to § Design Canon the `kit/<name>.html` bullet beside
`shell/<name>.html`.
