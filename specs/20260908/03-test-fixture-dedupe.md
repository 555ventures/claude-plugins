---
date: 2026-09-08
status: implementing
tier: standard
area: tests
design: false
breaking: false
depends_on: [specs/20260908/01-size-ratchet.md]
build_base: main
depended_on_by: [specs/20260908/04-duplicate-window-ratchet.md]
brief: n/a
open_markers: 0
diff_base: 1aa5915554c1ad9417c7d016d8f8e300a62d438e
---

# Test fixture dedupe — four repeated host builders become fixtures modules

## Goal

Four families of near-identical test setup — the review-legs host builder (seven copies in
four files), the genesis discovery-brief writer (six copies in four files), the AC-matrix
harness (two byte-identical copies), and the replay overlay host (five copies in one file) —
each become one parameterized function in a sibling `*.fixtures.js` module, following the
shape `tests/review/review-driver.fixtures.js` and `tests/genesis/tournament.fixtures.js`
already use. Every test keeps its name and its assertions; the size baseline records the
shrink.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `tests/review/review-legs.fixtures.js` exports `reviewLegsSpecBody({title, acId, specDate, ordinal})` and `makeReviewLegsHost(prefix, {specDate, ordinal, acId, config, testBody, extraFiles})` returning `{dir, base}`; `config` is the raw `.claude/spec.config.json` object each caller supplies; `extraFiles` is `{relPath: content}` written before the implement commit. The seven `SPEC_BODY`/`makeHost*` pairs in `review-legs.test.js` (4), `review-legs-smoke-wave.test.js`, `legs-verdict-pair.test.js`, and `review-legs-at-risk-argv.test.js` become calls; per-file wrappers survive only where a bespoke return shape (`bootObserved`, `argvLog`) is needed. (AC-20260908-03-1, -2) | The copies differ only in config, extra scaffold files, and return shape — all parameters. |
| D2 | `tests/genesis/tournament.fixtures.js`'s existing `writeBrief` gains `{label, extraSections}`; `label` fills the "for `<file>`" sentence, `extraSections` is a string appended before `## Picks`. `brief-state.test.js`, `conventions-handoff.test.js`, and `genesis-driver.test.js` drop their local `writeBrief`, `writeBriefWithSections`, and `writeVisualBrief` and call the shared one. (AC-20260908-03-3) | One template already exists in the fixtures module; the other five are drift copies. |
| D3 | `tests/ac-matrix/ac-matrix.fixtures.js` exports `specMd`, `writeManifest`, `run`, `findings`, `baseHost`; `owning-spec-env.test.js` and `qualified-skip-mapping.test.js` require it; `twoAcOwnerHost` and `assertSharedOwnerOutcome` stay local to `owning-spec-env.test.js`. (AC-20260908-03-4) | The five functions are byte-identical; the sibling's comment already says "matches … exactly". |
| D4 | `tests/replay/replay.fixtures.js` exports `setupOverlayHost(root, {parentFiles, closeFiles})` returning `{parent, close, dir}`; the five `--setup --overlay` tests (AC-20260831-01-1..5) in `replay.test.js` call it and keep their own `runNode` call and assertions. (AC-20260908-03-5) | The skeleton is identical; only file sets and assertions vary. |
| D5 | Fixtures modules are plain CommonJS with no test registration: `require('../helpers')`, functions, one `module.exports`; consumers `require('./<name>.fixtures')`. They are never named `*.test.js`, so the suite glob never executes them. (AC-20260908-03-6) | Matches the two existing modules; a fixtures file that registers tests would double-count. |
| D6 | No test name, assertion, or assert message changes; the count of `test(` registrations per touched file is identical before and after. (AC-20260908-03-1) | Host rules: a weakened assertion is hard; this spec is setup-only. |
| D7 | After all rows land, the orchestrator runs `node scripts/size-ratchet.js --root . --update`. `[no-ac: spec 01's live ratchet test is the oracle]` | Records the shrink; an unrecorded shrink is a stale ceiling. |
| D10 | AC-20260908-03-2..-6 carry `[pre-green: predicate-in-test]`. This spec's whole File Plan is tests-layer, so the deliverable (the four fixtures modules) and its guard test land in the same build step — red-check runs after that step and can only ever observe the guard green, for every tests-only spec. The genuine red run was captured BEFORE any fixtures module existed and is transcribed in the deviations sidecar under `## D10 red evidence` (tests 5 · pass 0 · fail 5, each failing for its own reason; the live log sits at `specs/20260908/03-test-fixture-dedupe.build/pre-extraction-red.log`, which is gitignored and does not outlive the merge). User ruled on this at build time. (AC-20260908-03-2..-6) | The ACs are not vacuous — they are unobservable-red by the spec's own layer assignment; the sanctioned reason plus pinned red evidence keeps the pass falsifiable instead of laundering it. |
| D9 | AC-20260908-03-3 as authored mixed a new `SHALL` promise (`extraSections` lands before `## Picks`) with a `SHALL CONTINUE TO` regression pin (the no-arg template is unchanged) — red-check's `mixed-pin` hard finding. Split: AC-20260908-03-3 keeps the new promise, AC-20260908-03-7 carries the pin. Both halves keep their assertions; the guard test splits into one test per AC. (AC-20260908-03-3, -7) | Mechanical remedy named by red-check itself and by build.md's `mixed-pin` rule; splitting an AC changes no observable promise. |
| D8 | `findings(res)` returns the whole parsed `--json` payload (`{findings, warnings, observed}`), NOT a bare array — the Contracts line and AC-20260908-03-4 above mis-transcribed the helper this spec lifts byte-identically. Both corrected to the real shape; the 13 existing call sites and their assertions are untouched. (AC-20260908-03-4) | Build-time correction: D3 (byte-identical lift) and D6 (no assertion changes) outrank a mis-transcribed signature; the alternative was rewriting 13 assertions, which D6 forbids. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| tests/review/review-legs.fixtures.js | CREATE | tests | D1, D5 |
| tests/review/review-legs.test.js | MODIFY | tests | D1: four `makeHost*` + `SPEC_BODY` → fixtures calls |
| tests/review/review-legs-smoke-wave.test.js | MODIFY | tests | D1: thin wrapper keeps `bootObserved` shape |
| tests/review/legs-verdict-pair.test.js | MODIFY | tests | D1 |
| tests/review/review-legs-at-risk-argv.test.js | MODIFY | tests | D1: thin wrapper keeps `argvLog` |
| tests/genesis/tournament.fixtures.js | MODIFY | tests | D2: `writeBrief` gains `label`, `extraSections` |
| tests/genesis/brief-state.test.js | MODIFY | tests | D2 |
| tests/genesis/conventions-handoff.test.js | MODIFY | tests | D2 |
| tests/genesis/genesis-driver.test.js | MODIFY | tests | D2 |
| tests/ac-matrix/ac-matrix.fixtures.js | CREATE | tests | D3, D5 |
| tests/ac-matrix/owning-spec-env.test.js | MODIFY | tests | D3 |
| tests/ac-matrix/qualified-skip-mapping.test.js | MODIFY | tests | D3 |
| tests/replay/replay.fixtures.js | CREATE | tests | D4, D5 |
| tests/replay/replay.test.js | MODIFY | tests | D4 |
| tests/fixtures-modules.test.js | CREATE | tests | AC-20260908-03-2, -3, -4, -5, -6 |
| size-baseline.json | MODIFY | other | D7: rewritten by `--update` at build's last step |

Orchestrator duty (D7): run `node scripts/size-ratchet.js --root . --update` after the last
worker returns, before the final gate.

## Contracts

```js
// tests/review/review-legs.fixtures.js
reviewLegsSpecBody({ title, acId, specDate = '20260824', ordinal = '06' }): string
makeReviewLegsHost(prefix, { specDate, ordinal, acId, config, testBody, extraFiles }): { dir, base }
// tests/genesis/tournament.fixtures.js (extended)
writeBrief(dir, { coverage, dims, picks, label, extraSections }): string /* path */
// tests/ac-matrix/ac-matrix.fixtures.js
specMd(acLines, filePlanRows): string; writeManifest(dir, lines): string; run(specPath, root, manifestPath, extraArgs): result; findings(res): { findings: object[], warnings: object[], observed: object } /* the parsed --json payload, byte-identical to the lifted helper */; baseHost(dir): { specPath, root, manifestPath }
// tests/replay/replay.fixtures.js
setupOverlayHost(root, { parentFiles, closeFiles }): { parent: sha, close: sha, dir: worktreePath }
```

## Acceptance Criteria

- **AC-20260908-03-1** `[oracle: gate]`: WHEN the gate runs after the extraction THE SYSTEM
  SHALL CONTINUE TO pass every test in the ten modified test files with the same test names
- **AC-20260908-03-2** `[pre-green: predicate-in-test]`: WHEN `makeReviewLegsHost` is called with a `config` carrying
  `gateCommand: "node --test tests"` and `extraFiles: {'bin/x.js': '…'}` THE SYSTEM SHALL
  produce a git repo whose base commit lacks `bin/x.js` and whose HEAD carries it, `src/foo.js`
  returning 42, and the spec under `specs/<specDate>/<ordinal>-*.md` → test in
  tests/fixtures-modules.test.js
- **AC-20260908-03-3** `[pre-green: predicate-in-test]`: WHEN `writeBrief` is called with `extraSections: '## Journeys\n\n- x'`
  THE SYSTEM SHALL write a brief whose `## Journeys` section sits before `## Picks` → test in
  tests/fixtures-modules.test.js
- **AC-20260908-03-4** `[pre-green: predicate-in-test]`: WHEN `baseHost(tmpdir())` runs THE SYSTEM SHALL return paths whose spec
  file exists and whose manifest is readable by `run(...)` with `findings(...)` yielding the
  parsed `--json` payload whose `findings` key is an array (D8) → test in
  tests/fixtures-modules.test.js
- **AC-20260908-03-5** `[pre-green: predicate-in-test]`: WHEN `setupOverlayHost` is given `parentFiles` and `closeFiles` THE
  SYSTEM SHALL return two distinct commit shas where `git show --name-only close` lists exactly
  the `closeFiles` keys → test in tests/fixtures-modules.test.js
- **AC-20260908-03-6** `[pre-green: predicate-in-test]`: WHEN `node --test 'tests/**/*.test.js'` runs THE SYSTEM SHALL execute
  no `*.fixtures.js` file as a test file (requiring each fixtures module registers zero tests)
  → test in tests/fixtures-modules.test.js
- **AC-20260908-03-7**: WHEN `writeBrief` is called WITHOUT `extraSections` THE SYSTEM SHALL
  CONTINUE TO write the template the tournament tests use today (D9, the pin half split out of
  AC-20260908-03-3) → test in tests/fixtures-modules.test.js

## Assumptions (escalation triggers)

- A1: The seven review-legs copies differ only in config content, extra scaffold files, and
  return shape — from the read-only survey of `tests/review/review-legs.test.js:66-115, 254-278,
  330-350, 610-629`, `review-legs-smoke-wave.test.js:43-149`, `legs-verdict-pair.test.js:34-91`,
  `review-legs-at-risk-argv.test.js:53-128`. **if false:** the divergent copy keeps a local
  wrapper over the shared builder; never a fourth parameter nobody else uses.
- A2: The genesis `writeBrief` skeleton is identical across the six copies except the project
  sentence and appended sections (`brief-state.test.js:49-70, 279-303`,
  `conventions-handoff.test.js:77-99`, `genesis-driver.test.js:61-82, 318-336`,
  `tournament.fixtures.js:49-70`). **if false:** STOP; a differing template means a test was
  pinning a different brief shape and needs its own fixture.
- A3: `node --test 'tests/**/*.test.js'` never loads a `*.fixtures.js` on its own — true today
  for the two existing modules (the glob is the `testCommand` in `.claude/spec.config.json`).
  **if false:** rename to `*.fixture.js`; never register tests inside.

## Rationale

Ninety-nine percent of the 2.9 MB under `tests/` is inline setup, not assertions:
`tests/fixtures/` holds 31 KB. The 45-second per-file runtime budget pushed splitting over
sharing, so the same host builder was copied into each new shard. The four families here were
found by a byte-level survey and confirmed by reading; they are the largest and the most
clearly parameterizable. The genesis and review families are the two files with the highest
duplicate-window counts in the 04 spike (47 and 19 windows of eight lines).

This spec touches no script and changes no assertion, which is why it is tests-only and needs
no version bump. Fragile: `review-legs.test.js` carries four variants in one file, so the
worker must keep each test's config literal rather than "simplifying" toward one config — the
variants exist to pin different `capabilities` and `runtime` shapes.

## Canonical Delta

docs/canonical/scripts.md § Prose budgets — append one sentence: test setup that a second file
needs lives in a sibling `*.fixtures.js` module (`review-legs`, `tournament`, `ac-matrix`,
`replay`), never as a second copy; the duplicate-window ratchet prices the third repetition.
