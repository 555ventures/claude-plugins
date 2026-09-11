---
date: 2026-09-11
status: implementing
tier: critical
area: scripts
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260911/03-tests-expire-at-close.md]
brief: n/a
open_markers: 0
build_base: main
diff_base: 1e2836182d08684ddeb4cc836c3d8ad13a51a38e
---

# The test count is instrumented

## Goal

A repo's test-case count becomes a derived, recorded number instead of an unmeasured one. One
scanner (`lib/scan-test-calls.js`) is the single definition of "a test case"; one CLI reports the
count; the review writes it to the evidence manifest as an advisory row, so growth per closed
spec is readable from the ledger. There is no limit, no gate and no hook — the count is
measurement, never a verdict. Done means: the scanner and its CLI exist, the review leg records
the count and can never redden a verdict, and `spec/test-ceiling.json` is gone.

## Amendment (2026-09-11, user ruling — supersedes this spec's original lock)

This spec locked as "Tests have a ceiling": a human-owned `maxTests` number, a blocking review
leg, a final-gate arm and a PreToolUse hook guarding the number. Measurement of this repo's own
history (37 closed specs: +360 test cases added, 35 removed, 0 of 321 promise ACs satisfied by
rewriting an existing test, 76 of 85 `SHALL CONTINUE TO` pins landing as brand-new cases) showed
the growth is a pipeline artifact — the AC-ID is the test's identity, so a promise can only be
appended, never revised. A count limit caps that symptom and, because its only sanctioned remedy
is deleting tests inside the build's automatic REPAIR loop, hands test deletion to the model
under pressure to go green. The limit, the gate arm and the hook are therefore dropped
(D1′, D3′, D4′, D5†, D6†, D7†, D9′); the scanner and the count survive as the instrument that
makes the growth falsifiable. The cause is fixed by a successor spec (the AC disposition
grammar), which is queued ahead of specs/20260911/03.

Second amendment, forced by executed evidence at the build's final gate: both new files were
first named `test-count.js` and `lib/test-scan.js`. `node --test`'s default discovery matches
`**/test-*.js` anywhere under the root, so the post-gate ran the CLI as if it were a test file
and reported `✖ spec/scripts/test-count.js  'test failed'` — the script's own argv handling
exiting non-zero under the runner. The scanner carried the same latent trap silently (discovered,
zero tests, passing). Both are therefore named away from the `test-*` prefix — `count-tests.js`
and `lib/scan-test-calls.js` — matching the verb-noun convention `lib/` already uses
(`count-observation.js`, `base-derivation.js`). No executable this repo ships may be named
`test-*`; spec 03 imports the scanner under its new name.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1′ | No ceiling file exists in any host. `spec/test-ceiling.json` is deleted because nothing reads it; no `.claude/test-ceiling.json` is created. No `maxTests` number is stored, read or written anywhere (AC-20260911-02-11). | A number nothing enforces is a lie on disk; the count is derived on demand from the tree. |
| D2 | One derivation of "a test case": `spec/scripts/lib/scan-test-calls.js` classifies test files by the host's `testGlobs` (or `DEFAULT_TEST_GLOBS`) over a walk that skips `.git`, `node_modules`, `fixtures`, `__fixtures__`, `.claude/worktrees`; a case is a `test(` or `it(` call whose only preceding characters on its line are whitespace; the scanner skips string, template, comment and regex-literal bodies and finds the call's closing paren by depth (AC-20260911-02-1, AC-20260911-02-4). | The same corpus `ac-drift.js` classifies; `describe(` and `t.test(` are never counted; a scanner that mis-reads a regex literal containing a quote corrupted a file in the 2026-09-11 sweep. Spec 03's expiry and the successor's title lookup both import it, so it is the one scanner. |
| D3′ | `spec/scripts/count-tests.js --root <r> [--json]` prints `tests: <count> cases` and exits 0; `--json` prints `{"count":N}`. It has no red arm and no comparison: the only non-zero exit is 2, for a usage error or an unreadable root (AC-20260911-02-2). The script is named `count-tests.js`, never `test-ceiling.js` — there is no ceiling to name. | A reporter that can fail a build is a gate wearing a reporter's name; the absence of a red arm is the robustness property, enforced by AC-20260911-02-2. |
| D4′ | `review-legs.js` gains a `tests` leg in wave 2 writing `{leg:"tests", exit:0, observed:{count:N}}` — always exit 0, in every scope. It is NOT added to `review-legs.js`'s `BLOCKING`, NOT to `verdict.js`'s `REVIEW_BLOCKING`, and NOT to `spec-review-driver.js`'s `BLOCKING_LEGS`; it IS added to `verdict.js`'s `REVIEW_LEGS` so the row is required in both scopes and a missing row is `UNVERIFIED` (AC-20260911-02-5, AC-20260911-02-6). The leg shells out to `count-tests.js --json`; it never re-derives the count. | Required-but-never-red is what makes the number appear on every ledger row without ever changing a verdict; one invocation keeps the derivation single (D8's manifest row is the executed proof). |
| D8′ | `spec/bin/spec-paths` gains the key `count-tests`; `spec/entrypoints.json` gains one row for `count-tests.js` (entry point: `review-legs.js`). `lib/scan-test-calls.js` gets NO manifest row — `tests/consistency/entrypoints.test.js`'s inventory excludes `spec/scripts/lib/` by design. The plugin version bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` (AC-20260911-02-10 `[oracle: gate]`). | Every executable owes a manifest row and a resolvable key; a library file is not an executable, and the pre-existing exclusion invariant outranks a spec's convenience. |
| D9′ | Live-repo pin: `count-tests.js --root .` exits 0 at HEAD reporting a positive integer count, and `spec/test-ceiling.json` does not exist (AC-20260911-02-11). | The instrument must be executed against the real tree, not only fixtures; with no limit there is nothing for the live count to violate. |
| D10′ | Every existing fixture manifest and required-leg list that must keep deriving its word gains a green `tests` row (`{leg:"tests", exit:0, observed:{count:1}}`) in place — `verdict.test.js`'s `SIX_GREEN` and siblings, `verdict-gatered-no-workflow.test.js`, `provenance.test.js`, `escalate-row.test.js`, `review-legs.test.js`'s required-leg list, `review-driver.test.js` — never weakened, retagged with AC-20260911-02-12. | Executed (A7): the pre-image `verdict.js` derives `CLEAN` over a manifest with an extra green row, so every pin is green pre-image as a `SHALL CONTINUE TO` pin must be; the exhaustive-pin Gotcha says update in place, never loosen. |

**Retired at amendment, deliberately not built (D5†, D6†, D7†):** the build driver's `runGate()`
ceiling arm, `block-ceiling-writes.sh` and its two `hooks.json` matcher groups. Each existed only
to defend a number that no longer exists. `spec/hooks/hooks.json` and
`spec/scripts/spec-build-driver.js` are therefore untouched by this spec.

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/scan-test-calls.js | CREATE | scripts | `listTestFiles(root, config)`, `scanCalls(src)` → `[{start, end, callText, title, commentAbove}]`, `countCases(root, config)`; the one test-call scanner (D2) |
| spec/scripts/count-tests.js | CREATE | scripts | CLI over `lib/scan-test-calls.js`; prints `tests: <count> cases`, `--json` prints `{"count":N}`; exits 0 always except 2 on usage error (D3′) |
| spec/scripts/review-legs.js | MODIFY | scripts | `tests` leg in wave 2 shelling out to `count-tests.js --json`, row shape per D4′; NOT added to `BLOCKING`; closed-set comment block gains the row |
| spec/scripts/verdict.js | MODIFY | scripts | `tests` in `REVIEW_LEGS` only — never `REVIEW_BLOCKING` (D4′); header comment names the leg as advisory |
| spec/bin/spec-paths | MODIFY | scripts | Key `count-tests` → `scripts/count-tests.js`; usage line updated (D8′) |
| spec/entrypoints.json | MODIFY | other | One row for `spec/scripts/count-tests.js` (D8′) |
| spec/templates/spec.md | MODIFY | doctrine | Oracle closed set in the `## Acceptance Criteria` comment lists `tests` (D4′) |
| spec/test-ceiling.json | DELETE | other | Nothing reads it (D1′) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` (D8′) |
| tests/ceiling/count-tests.test.js | CREATE | tests | AC-20260911-02-1, AC-20260911-02-2, AC-20260911-02-4, AC-20260911-02-11 |
| tests/ceiling/tests-leg.test.js | CREATE | tests | AC-20260911-02-5, AC-20260911-02-6 |
| tests/review/verdict.test.js | MODIFY | tests | AC-20260911-02-12 — `SIX_GREEN` and sibling manifests gain the green `tests` row; existing words unchanged (D10′) |
| tests/verdict-gatered-no-workflow.test.js | MODIFY | tests | AC-20260911-02-12 — fixture manifests gain the green `tests` row (D10′) |
| tests/provenance/provenance.test.js | MODIFY | tests | AC-20260911-02-12 — fixture manifest gains the green `tests` row (D10′) |
| tests/review/escalate-row.test.js | MODIFY | tests | AC-20260911-02-12 — fixture manifests gain the green `tests` row (D10′) |
| tests/review/review-legs.test.js | MODIFY | tests | AC-20260911-02-12 — required-leg list gains `tests` (D10′) |
| tests/review/review-driver.test.js | MODIFY | tests | AC-20260911-02-12 — required-leg list gains `tests` (D10′) |
| tests/consistency/red-fixture-coverage.test.js | MODIFY | tests | `LEG_HANDLERS` gains `tests` (D4′); AC-20260911-02-5 |

Orchestrator duty outside the table: `docs/canonical/scripts.md`'s ceiling paragraph is replaced
by the Canonical Delta at review close, not in the build.

## Contracts

```text
node spec/scripts/count-tests.js --root <r> [--json]
  stdout (human)  tests: <count> cases                              exit 0
  stdout (--json) {"count":N}                                       exit 0
  exit 2          usage error, or <r> is not a readable directory
  There is no other non-zero exit: this script never reports a failure of the tree.

lib/scan-test-calls.js
  listTestFiles(root, config) -> string[]   absolute paths, testGlobs-classified, skip dirs per D2
  scanCalls(src) -> [{ start, end, callText, title, commentAbove }]
      start   index of the contiguous comment block directly above the call (or the call's
              line start when none); end = index just past the call's closing ')' and any
              trailing ';' and newline
      title   the first string-literal argument, '' when none
  countCases(root, config) -> { count, files }

review-legs.js manifest row
  {"leg":"tests","exit":0,"observed":{"count":N},"scope":"full"|"fix-delta"}
```

## Behavior

- Counting: a line `  it('x', async () => {` counts; `describe('x', () => {` does not; `test(`
  inside a string, a comment or a regex literal does not; `t.test(` does not (the call is not at
  line start). Given three files holding 2 + 2 + 1 such calls, plus one `"test("` inside a string
  and one `// test(` comment, the count is 5.
- Reporting only: whatever the count is, `count-tests.js` exits 0. A tree with one case and a tree
  with a million cases are both exit 0; the number is the output, never the verdict.
- Review: the `tests` leg row is required at every tier and in both scopes; a missing row is
  `UNVERIFIED`, and a present row never changes the verdict word — a manifest that derived
  `CLEAN`, `GATE_RED`, `HARD_FINDINGS` or `ESCALATED` derives the same word with the row added.
- Build: untouched. The final gate has no ceiling arm; an over-count tree does not exist as a
  concept.

## Acceptance Criteria

- **AC-20260911-02-1**: WHEN `count-tests.js --root <fixture> --json` runs over a fixture host
  whose test files hold five line-start `test(`/`it(` calls plus one `"test("` string, one
  `// test(` comment, one `describe(` and one `t.test(` THE SYSTEM SHALL print `{"count":5}` and
  exit 0 → test in tests/ceiling/count-tests.test.js
- **AC-20260911-02-2**: WHEN `count-tests.js` runs over a fixture host holding any number of test
  cases THE SYSTEM SHALL exit 0 (e.g. a one-case host and a 500-case host both exit 0), and THE
  SYSTEM SHALL exit 2 only for a usage error or an unreadable `--root` (e.g. `--root /nonexistent`
  → exit 2 naming the remedy) → test in tests/ceiling/count-tests.test.js
  - Superseded at amendment: the original AC-20260911-02-2 required exit 1 and an `OVER by <n>`
    message when the count exceeded `maxTests`. There is no `maxTests` (D1′), and the absence of a
    red arm is now the property under test (D3′).
- **AC-20260911-02-4**: WHEN a test file contains a regex literal holding a quote and a paren
  (e.g. `assert.match(x, /atlas\)" stop open/)`) followed by another `test(` call THE SYSTEM
  SHALL count both calls and `scanCalls` SHALL return each call's `end` at its own closing paren
  (the second call's `title` is read correctly) → test in tests/ceiling/count-tests.test.js
- **AC-20260911-02-5**: WHEN `review-legs.js` runs over a fixture host in either scope THE SYSTEM
  SHALL write exactly one `tests` manifest row of the form
  `{"leg":"tests","exit":0,"observed":{"count":N}}` (e.g. a five-case fixture host →
  `observed:{"count":5}`), and `tests` SHALL NOT appear in the script's `BLOCKING` array → test in
  tests/ceiling/tests-leg.test.js and tests/consistency/red-fixture-coverage.test.js
- **AC-20260911-02-6**: WHEN `verdict.js` reads a manifest carrying a green `tests` row THE SYSTEM
  SHALL derive the same verdict word it derives without that row (e.g. a CLEAN manifest stays
  `CLEAN`, a gate-red manifest stays `GATE_RED`), and WHEN the `tests` row is absent THE SYSTEM
  SHALL derive `UNVERIFIED`; `tests` SHALL NOT appear in `REVIEW_BLOCKING` → test in
  tests/ceiling/tests-leg.test.js
  - Superseded at amendment: the original AC-20260911-02-6 required a red `ceiling` row to block
    `CLEAN`. The leg has no red arm (D3′, D4′), so blocking membership is now forbidden rather
    than required.
- **AC-20260911-02-10** `[oracle: gate]`: WHEN the gate runs THE SYSTEM SHALL resolve
  `spec-paths test-count`, find a `spec/entrypoints.json` row for `count-tests.js`, find no row for
  `lib/scan-test-calls.js`, and pass `scripts/plugin-bump.js --check`
- **AC-20260911-02-11**: WHEN `count-tests.js --root .` runs over this repository at HEAD THE
  SYSTEM SHALL exit 0 reporting a positive integer count, and `spec/test-ceiling.json` SHALL NOT
  exist, and no `.claude/test-ceiling.json` SHALL exist → test in tests/ceiling/count-tests.test.js
- **AC-20260911-02-12**: WHEN an existing fixture manifest that derived `CLEAN`, `GATE_RED`,
  `HARD_FINDINGS` or `ESCALATED` gains a green `tests` row THE SYSTEM SHALL CONTINUE TO derive
  the same word (e.g. `SIX_GREEN` + CLEAN workflow → `CLEAN`) → the existing tests in the six
  D10′ files, retagged

Retired at amendment, with no successor: AC-20260911-02-3 (absent ceiling file), -7 (build gate
arm), -8 (the hook's exit codes) and -9 (the hook's `hooks.json` wiring). Each named a surface
this spec no longer builds.

## Assumptions (escalation triggers)

- A2: The line-start scanner and `node --test` agree on the corpus but not the number: scanner
  11 vs `ℹ tests 11` on `tests/doctor/`, scanner 1024 vs `ℹ tests 1035` on the whole suite (the
  eleven are subtests) — executed. The instrument counts calls, never runtime tests — **if false:**
  the count would need the reporter and the reporter was retired; record the divergence on the
  ledger row rather than changing the scanner.
- A3: The scanner's regex-literal rule (a `/` whose previous significant character is one of
  `( , = : [ ! & | ? { } ;` or the keyword `return` opens a regex) and the wrapped-bullet rule —
  executed on a scratch snippet: 2 calls counted out of a snippet holding `/design-atlas\)" stop
  open/`, a `"test("` string and a `describe(` — **if false:** add the failing shape to
  AC-20260911-02-4's fixture and fix the scanner, never widen the count.
- A7: The pre-image `verdict.js` ignores an unknown green row — executed: a ten-row manifest
  (`SIX_GREEN` + `{"leg":"tests","exit":0}`) with a CLEAN workflow printed `CLEAN` — so D10′'s
  pins are green pre-image as `SHALL CONTINUE TO` pins must be — **if false:** the pin that goes
  red is updated in place and retagged, never loosened.
- A8: The six D10′ files are the complete set of hand-built manifests that must keep deriving
  their word (executed at build: `promise-sweep.test.js`, `ac-matrix.test.js` and
  `legs-verdict-pair.test.js` were confirmed NOT to feed a hand-built full-required-leg manifest
  to `verdict.js` — they derive theirs from real script execution) — **if false:** the seventh
  file gains its row in the same build as an out-of-plan row and is retagged; never weaken the
  verdict.
- A6: `tests/spec-paths.test.js` and `tests/consistency/read-load.test.js` tolerate one added key
  and the template comment growing by one word — **if false:** update the pin in the same build
  as an out-of-plan row and record it.
- A9 (amendment): removing the `ceiling` leg's blocking membership cannot strand a fixture,
  because the leg never shipped — this spec is the only thing that has ever written the row —
  **if false:** the stranded fixture is updated in place and retagged, never weakened.

## Rationale

The direct batch of 2026-09-11 wrote `spec/test-ceiling.json` and documented it, but nothing reads
it and hosts cannot host a `spec/` path — so the file is deleted rather than relocated, because
the number it holds has no enforcer worth building.

Why no limit: the suite's growth was measured, not assumed. Over 37 closed specs this repo added
360 test cases and removed 35; specs that only changed existing behaviour added a median of 6.5
and 17 of 18 removed nothing; 0 of 321 promise ACs were satisfied by rewriting an existing test.
The cause is that the AC-ID is a test's identity, so a promise can only ever be appended — the
suite is a log of every decision ever made rather than a description of what the system does. A
count limit caps that symptom while making it worse in one specific way: its only sanctioned
remedy is deleting tests, and the remedy would run inside the build's automatic REPAIR loop,
handing deletion to the model exactly when it is under pressure to go green. Field practice
independently rejects raw test count as the most gameable coverage metric, no published source
enforces a hard cap, and the named gaming moves (fatter tests, table-driven folding, nested
subtests) would hide the very growth this spec exists to measure.

What survives is the instrument. The scanner is the one definition of a test case — spec 03's
expiry and the successor disposition spec both import it, so a second derivation would make the
three disagree. The CLI reports and never judges: the absence of a red arm is a property under
test (AC-20260911-02-2), not an omission. The review leg is required in both scopes so the count
lands on every ledger row, and is excluded from all three blocking spellings so it can never
change a verdict — required-but-never-red is what makes growth per closed spec falsifiable
without giving a number veto power over a merge.

Rejected: a `testCeiling` config key — the model edits `spec.config.json` routinely, so a hook
cannot single it out. Rejected: counting via the test reporter's `ℹ tests` line — it was retired
with the budget reporter and needs a full run; the scanner counts a tree in milliseconds.
Rejected at amendment: the hook guarding the number (nothing left to guard), the build gate's
ceiling arm (no red arm to chain), and a behaviour-identity redesign of what a test is named for
(`behaviour` has no derivation in this repo — the only stable handles are a test's file and
title — so it would become a hand-maintained registry and would rip out the AC-ID grammar six
scripts and two host repos depend on).

Watch during build: the exhaustive pins in `tests/consistency/` fail closed on the new leg; the
template's oracle set must list `tests` or `[oracle: tests]` is a laundering route in future
specs.

## Canonical Delta

`docs/canonical/scripts.md` — replace the paragraph beginning "The plugin's own test count has
a ceiling" with:

A repo's test count is instrumented, not capped. `lib/scan-test-calls.js` is the one definition of a
test case — a `test(`/`it(` call at line start across the host's test-classified files, blind to
strings, comments and regex literals — and `count-tests.js` reports it (`tests: <count> cases`,
`--json` → `{"count":N}`). The review's `tests` leg records that count on every evidence manifest
and is deliberately absent from every blocking set, so the number appears on each ledger row and
can never redden a verdict. There is no limit, no ceiling file and no hook: a count that could
fail a build would make deleting tests the model's cheapest route to green. Byte-size ratchets and
duplicate-window baselines were retired on 2026-09-11 as self-authorizing; the growth they tried
to police is addressed at its cause by the AC disposition grammar, not by a number.
