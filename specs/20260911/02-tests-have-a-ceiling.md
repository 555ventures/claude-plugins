---
date: 2026-09-11
status: hardened
tier: critical
area: scripts
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260911/03-tests-expire-at-close.md]
brief: n/a
open_markers: 0
---

# Tests have a ceiling

## Goal

The number of test cases in a repo becomes a human-owned number. `.claude/test-ceiling.json`
holds it; a review leg and the build's final gate go red when the count of `test(`/`it(`
cases exceeds it; a hook refuses the model's edits to that file. There is no cite, no
reconcile and no override — the only way back under the line is deleting tests. Done means:
this repo's own ceiling file has moved under `.claude/`, both gates read it, and the hook
blocks an Edit/Write/Bash change of it while letting every other write through.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The ceiling lives at `.claude/test-ceiling.json` in every host, shape `{"maxTests": N}`; `spec/test-ceiling.json` is deleted and this repo's file moves as-is (900). An absent file means no ceiling (AC-20260911-02-3). | Hosts have no `spec/` directory — everything host-owned lives under `.claude/`; a plugin-dir path can never bind prax or salon-os. |
| D2 | One derivation of "a test case": `spec/scripts/lib/test-scan.js` classifies test files by the host's `testGlobs` (or `DEFAULT_TEST_GLOBS`) over a walk that skips `.git`, `node_modules`, `fixtures`, `__fixtures__`, `.claude/worktrees`; a case is a `test(` or `it(` call whose only preceding characters on its line are whitespace; the scanner skips string, template, comment and regex-literal bodies and finds the call's closing paren by depth (AC-20260911-02-1, AC-20260911-02-4). | The same corpus `ac-drift.js` classifies; `describe(` and `t.test(` are never counted; a scanner that mis-reads a regex literal containing a quote corrupted a file in the 2026-09-11 sweep. |
| D3 | `spec/scripts/test-ceiling.js --root <r> [--json]` prints `ceiling: <count>/<max> cases` and exits 0 under the line; exits 1 over it naming the overage and the remedy (delete tests — the ceiling is edited only by a human); prints `inapplicable — no .claude/test-ceiling.json` exit 0 when the file is absent; exits 2 on usage error or an unreadable/invalid ceiling file (AC-20260911-02-2, AC-20260911-02-3). | The number and the count are the whole contract; an invalid file is a loud stop, never a silent pass. |
| D4 | `review-legs.js` gains a `ceiling` leg in wave 2 writing `{leg:"ceiling", exit, observed:{count,max}}` (or `observed:{unavailable:"no-ceiling-file"}`, exit 0) and adds `ceiling` to its `BLOCKING` array; `verdict.js` adds `ceiling` to `REVIEW_LEGS` (required in both scopes) and `REVIEW_BLOCKING`; `spec-review-driver.js` adds it to `BLOCKING_LEGS`; the template's oracle closed set gains `ceiling` (AC-20260911-02-5, AC-20260911-02-6). | Executed (A7): today's verdict reads an unknown red row as `HARD_FINDINGS` — dispositionable, waivable — so only built-in membership in all three spellings makes an over-ceiling tree structurally un-CLEAN (specs/20260903/02 D3 precedent); `--require` merely widens the required set. |
| D10 | Every existing fixture manifest and required-leg list that must keep deriving its word gains a green `ceiling` row (`{leg:"ceiling", exit:0, observed:{count:1, max:900}}`) in place — `verdict.test.js`'s `SIX_GREEN` and siblings, `verdict-gatered-no-workflow.test.js`, `provenance.test.js`, `escalate-row.test.js`, `promise-sweep.test.js`, `review-legs.test.js`'s required-leg list, `legs-verdict-pair.test.js`, `review-driver.test.js`, `ac-matrix.test.js` — never weakened, retagged with AC-20260911-02-12. | Executed (A7): the pre-image `verdict.js` derives `CLEAN` over a manifest with an extra green `ceiling` row, so every pin is green pre-image as a `SHALL CONTINUE TO` pin must be; the exhaustive-pin Gotcha says update in place, never loosen. |
| D5 | The build driver's `runGate()` chains `&& node <plugin>/scripts/test-ceiling.js --root <repoRoot>` after the resolved gate (and post-gate) inside the same `bash -c`, so an over-ceiling tree is a red final gate and enters REPAIR like any red gate (AC-20260911-02-7). | The documented home of the ceiling is the final gate; one bash child keeps `marks.gateRuns` at one run per round. |
| D6 | `spec/scripts/block-ceiling-writes.sh` (PreToolUse, stdin JSON, exit 2 = block, fail-open on parse/git error): a Write/Edit/NotebookEdit whose target's last two path segments are `.claude/test-ceiling.json` is blocked when that file already exists; a Bash command whose text contains `test-ceiling.json` is blocked; everything else exits 0. The block message names the remedy: a human edits the file in an editor; the model's only route under the line is deleting tests (AC-20260911-02-8). | Creation of a missing file stays open so a host can bootstrap its first ceiling; the Bash arm closes the `sed -i`/`rm` tunnel the Edit arm alone leaves open. |
| D7 | `spec/hooks/hooks.json` wires the hook as a second entry in the existing `Write\|Edit\|NotebookEdit` group and as a new `Bash` matcher group; the exhaustive pins (`entrypoints.test.js` five-paths pin, `red-fixture-coverage.test.js` `HOOK_HANDLERS` and `LEG_HANDLERS`) are updated in the same build (AC-20260911-02-9). | A new hook arm owes a red fixture proving it engages; the exhaustive pins fail closed by design. |
| D8 | `spec/bin/spec-paths` gains the key `test-ceiling`; `spec/entrypoints.json` gains rows for `test-ceiling.js` (entry points: `review-legs.js`, `spec-build-driver.js`), `block-ceiling-writes.sh` (`hooks.json`) and `lib/test-scan.js` (`test-ceiling.js`); the plugin version bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` (AC-20260911-02-10 `[oracle: gate]`). | Every executable owes a manifest row and a resolvable key; the bump check in the gate is the version oracle. |
| D9 | Live-repo pin: `.claude/test-ceiling.json` exists here, `spec/test-ceiling.json` does not, and `test-ceiling.js --root .` exits 0 at HEAD (AC-20260911-02-11). | The plugin dogfoods its own ceiling from the first commit; a missing file here would make the leg vacuous. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/test-scan.js | CREATE | scripts | `listTestFiles(root, config)`, `scanCalls(src)` → `[{start, end, callText, title, commentAbove}]`, `countCases(root, config)`; the one test-call scanner (D2) |
| spec/scripts/test-ceiling.js | CREATE | scripts | CLI over `lib/test-scan.js` + `.claude/test-ceiling.json`; exit codes 0/1/2 per D3; `--json` prints `{count, max, over}` or `{inapplicable: "no-ceiling-file"}` |
| spec/scripts/block-ceiling-writes.sh | CREATE | scripts | PreToolUse guard per D6; header cites this spec; `set -uo pipefail`, jq |
| spec/hooks/hooks.json | MODIFY | doctrine | Second hook in the `Write\|Edit\|NotebookEdit` group + new `Bash` matcher group, both `block-ceiling-writes.sh` (D7) |
| spec/scripts/review-legs.js | MODIFY | scripts | `ceiling` leg in wave 2, row shape per D4; closed-set comment block gains the row |
| spec/scripts/verdict.js | MODIFY | scripts | `ceiling` in `REVIEW_LEGS` and `REVIEW_BLOCKING` (D4); header comment names the leg |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | `ceiling` in `BLOCKING_LEGS` (D4) |
| spec/scripts/spec-build-driver.js | MODIFY | scripts | `runGate()` chains the ceiling command after the post-gate (D5) |
| spec/bin/spec-paths | MODIFY | scripts | Key `test-ceiling` → `scripts/test-ceiling.js`; usage line updated (D8) |
| spec/entrypoints.json | MODIFY | other | Rows for the three new files (D8) |
| spec/templates/spec.md | MODIFY | doctrine | Oracle closed set in the `## Acceptance Criteria` comment lists `ceiling` (D4) |
| .claude/test-ceiling.json | CREATE | other | `{"maxTests": 900}` (D1, D9) |
| spec/test-ceiling.json | DELETE | other | Moved to `.claude/` (D1) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` (D8) |
| tests/consistency/red-fixture-coverage.test.js | MODIFY | tests | `HOOK_HANDLERS` gains `block-ceiling-writes.sh`, `LEG_HANDLERS` gains `ceiling` (D7); AC-20260911-02-9 |
| tests/consistency/entrypoints.test.js | MODIFY | tests | The exactly-five hooks.json paths pin becomes six (D7); AC-20260911-02-9 |
| tests/ceiling/test-ceiling.test.js | CREATE | tests | AC-20260911-02-1, AC-20260911-02-2, AC-20260911-02-3, AC-20260911-02-4, AC-20260911-02-8, AC-20260911-02-11 |
| tests/ceiling/ceiling-gates.test.js | CREATE | tests | AC-20260911-02-5, AC-20260911-02-6, AC-20260911-02-7 |
| tests/review/verdict.test.js | MODIFY | tests | AC-20260911-02-12 — `SIX_GREEN` and sibling manifests gain the green `ceiling` row; existing words unchanged (D10) |
| tests/verdict-gatered-no-workflow.test.js | MODIFY | tests | AC-20260911-02-12 — fixture manifests gain the green `ceiling` row (D10) |
| tests/provenance/provenance.test.js | MODIFY | tests | AC-20260911-02-12 — fixture manifest gains the green `ceiling` row (D10) |
| tests/review/escalate-row.test.js | MODIFY | tests | AC-20260911-02-12 — fixture manifests gain the green `ceiling` row (D10) |
| tests/review/promise-sweep.test.js | MODIFY | tests | AC-20260911-02-12 — fixture manifests gain the green `ceiling` row (D10) |
| tests/review/review-legs.test.js | MODIFY | tests | AC-20260911-02-12 — required-leg list gains `ceiling` (D10) |
| tests/review/legs-verdict-pair.test.js | MODIFY | tests | AC-20260911-02-12 — the pair fixture expects the `ceiling` row (D10) |
| tests/review/review-driver.test.js | MODIFY | tests | AC-20260911-02-12 — fixture manifest gains the green `ceiling` row (D10) |
| tests/ac-matrix/ac-matrix.test.js | MODIFY | tests | AC-20260911-02-12 — the oracle-leg fixture manifest gains the green `ceiling` row (D10) |

Orchestrator duty outside the table: `docs/canonical/scripts.md`'s ceiling paragraph is replaced by the Canonical Delta at review close, not in the build.

## Contracts

```text
.claude/test-ceiling.json          { "maxTests": <positive integer> }        human-owned

node spec/scripts/test-ceiling.js --root <r> [--json]
  stdout (human)  ceiling: <count>/<max> cases                       exit 0
                  ceiling: <count>/<max> cases — OVER by <n>; delete tests (the ceiling is
                  edited only by a human, never raised by the model)  exit 1
                  inapplicable — no .claude/test-ceiling.json          exit 0
  stdout (--json) {"count":N,"max":M,"over":N-M|0}  |  {"inapplicable":"no-ceiling-file"}
  exit 2          usage error, or .claude/test-ceiling.json unreadable / not {"maxTests":int>0}

lib/test-scan.js
  listTestFiles(root, config) -> string[]   absolute paths, testGlobs-classified, skip dirs per D2
  scanCalls(src) -> [{ start, end, callText, title, commentAbove }]
      start   index of the contiguous comment block directly above the call (or the call's
              line start when none); end = index just past the call's closing ')' and any
              trailing ';' and newline
      title   the first string-literal argument, '' when none
  countCases(root, config) -> { count, files }

review-legs.js manifest row
  {"leg":"ceiling","exit":0|1,"observed":{"count":N,"max":M},"scope":"full"|"fix-delta"}
  {"leg":"ceiling","exit":0,"observed":{"unavailable":"no-ceiling-file"},"scope":...}

block-ceiling-writes.sh    stdin = PreToolUse JSON; exit 0 allow, exit 2 block (stderr names remedy)
```

## Behavior

- Counting: a line `  it('x', async () => {` counts; `describe('x', () => {` does not; `test(`
  inside a string, a comment or a regex literal does not; `t.test(` does not (the call is not at
  line start). Given three files holding 2 + 2 + 1 such calls, plus one `"test("` inside a string
  and one `// test(` comment, the count is 5.
- Over the line: count 5, `maxTests` 4 → exit 1, the message says `OVER by 1`, no file is
  written. Under or equal: exit 0.
- Review: the `ceiling` leg row is required at every tier; a missing row is `UNVERIFIED`, a red
  row blocks (`GATE_RED`-class verdict, never `CLEAN`). Fix-delta scope runs it too (cheap, and
  a fix round can add tests).
- Build: the final gate's log ends with the `ceiling:` line when the scoped gate and post-gate
  were green; an over-ceiling tree reds the gate and the driver enters REPAIR with the ceiling
  line visible in `gate-<k>.log`.
- Hook: `{"tool_name":"Edit","tool_input":{"file_path":"/r/.claude/test-ceiling.json"}}` with the
  file present → exit 2; the same with the file absent → exit 0; `{"tool_name":"Bash",
  "tool_input":{"command":"sed -i s/900/9000/ .claude/test-ceiling.json"}}` → exit 2;
  `{"tool_name":"Bash","tool_input":{"command":"echo hi"}}` → exit 0; an Edit of any other path
  → exit 0; malformed stdin → exit 0.

## Acceptance Criteria

- **AC-20260911-02-1**: WHEN `test-ceiling.js --root <fixture> --json` runs over a fixture host
  whose test files hold five line-start `test(`/`it(` calls plus one `"test("` string, one
  `// test(` comment, one `describe(` and one `t.test(` THE SYSTEM SHALL print `{"count":5,...}`
  (e.g. `maxTests` 10 → `{"count":5,"max":10,"over":0}`, exit 0) → test in
  tests/ceiling/test-ceiling.test.js
- **AC-20260911-02-2**: WHEN the count exceeds `maxTests` THE SYSTEM SHALL exit 1, print
  `OVER by <n>` and the delete-tests remedy, and leave every file byte-identical (e.g. count 5,
  `{"maxTests": 4}` → exit 1, `OVER by 1`) → test in tests/ceiling/test-ceiling.test.js
- **AC-20260911-02-3**: WHEN `.claude/test-ceiling.json` is absent THE SYSTEM SHALL print
  `inapplicable — no .claude/test-ceiling.json` and exit 0; WHEN it is present but not
  `{"maxTests": <int>0>}` (e.g. `{"maxTests": "lots"}`) THE SYSTEM SHALL exit 2 naming the file →
  test in tests/ceiling/test-ceiling.test.js
- **AC-20260911-02-4**: WHEN a test file contains a regex literal holding a quote and a paren
  (e.g. `assert.match(x, /atlas\)" stop open/)`) followed by another `test(` call THE SYSTEM
  SHALL count both calls and `scanCalls` SHALL return each call's `end` at its own closing paren
  (the second call's `title` is read correctly) → test in tests/ceiling/test-ceiling.test.js
- **AC-20260911-02-5**: WHEN `review-legs.js` runs over a fixture host THE SYSTEM SHALL write a
  `ceiling` manifest row (e.g. `{"leg":"ceiling","exit":1,"observed":{"count":5,"max":4}}` for an
  over-ceiling fixture; `observed:{"unavailable":"no-ceiling-file"}`, exit 0 without the file) →
  test in tests/ceiling/ceiling-gates.test.js
- **AC-20260911-02-6**: WHEN `verdict.js` reads a manifest whose `ceiling` row has `exit:1` THE
  SYSTEM SHALL never derive `CLEAN` (a blocking leg), and WHEN the `ceiling` row is absent THE
  SYSTEM SHALL derive `UNVERIFIED` → test in tests/ceiling/ceiling-gates.test.js
- **AC-20260911-02-7**: WHEN the build driver's final gate runs over a fixture host whose test
  count exceeds its ceiling THE SYSTEM SHALL record the gate run as red with a `ceiling:` line in
  the gate log and derive `REPAIR`; WHEN the count is under the line THE SYSTEM SHALL keep the
  gate green with the `ceiling:` line in the log → test in tests/ceiling/ceiling-gates.test.js
- **AC-20260911-02-8**: WHEN `block-ceiling-writes.sh` reads a PreToolUse payload THE SYSTEM
  SHALL exit 2 for an Edit/Write of an existing `.claude/test-ceiling.json` and for a Bash
  command containing `test-ceiling.json` (e.g. `sed -i s/900/9000/ .claude/test-ceiling.json`),
  and exit 0 for an Edit of a missing ceiling file, an Edit of any other path, `echo hi`, and
  malformed stdin → test in tests/ceiling/test-ceiling.test.js
- **AC-20260911-02-9**: WHEN `spec/hooks/hooks.json` is parsed THE SYSTEM SHALL wire
  `block-ceiling-writes.sh` under both the `Write|Edit|NotebookEdit` and `Bash` matchers, and
  the red-fixture handler for it SHALL observe a real block (status 2) → test in
  tests/consistency/red-fixture-coverage.test.js and tests/consistency/entrypoints.test.js
- **AC-20260911-02-10** `[oracle: gate]`: WHEN the gate runs THE SYSTEM SHALL resolve
  `spec-paths test-ceiling`, find a `spec/entrypoints.json` row for every new executable, and
  pass `scripts/plugin-bump.js --check`
- **AC-20260911-02-11**: WHEN `test-ceiling.js --root .` runs over this repository at HEAD THE
  SYSTEM SHALL exit 0 with `count ≤ max`, and `spec/test-ceiling.json` SHALL NOT exist → test
  in tests/ceiling/test-ceiling.test.js
- **AC-20260911-02-12**: WHEN an existing fixture manifest that derived `CLEAN`, `GATE_RED`,
  `HARD_FINDINGS` or `ESCALATED` gains a green `ceiling` row THE SYSTEM SHALL CONTINUE TO derive
  the same word (e.g. `SIX_GREEN` + CLEAN workflow → `CLEAN`) → the existing tests in the nine
  D10 files, retagged

## Assumptions (escalation triggers)

- A1: The Claude Code PreToolUse contract is stdin JSON with `tool_name`/`tool_input`, exit 2 =
  block — executed: the existing `block-cross-worktree-writes.sh` given
  `{"cwd":"/Users/jj/Projects/claude-plugins","tool_name":"Edit","tool_input":{"file_path":
  ".../.claude/test-ceiling.json"}}` exited 0 (so today nothing blocks that edit), and its
  documented contract is the one D6 copies — **if false:** copy whatever `question-style-gate.js`
  does on block, never invent a third protocol.
- A2: The line-start scanner and `node --test` agree on the corpus but not the number: scanner
  11 vs `ℹ tests 11` on `tests/doctor/`, scanner 1024 vs `ℹ tests 1035` on the whole suite (the
  eleven are subtests) — executed. The ceiling counts calls, never runtime tests — **if false:**
  STOP, the ceiling would need the reporter and the reporter was retired.
- A3: The scanner's regex-literal rule (a `/` whose previous significant character is one of
  `( , = : [ ! & | ? { } ;` or the keyword `return` opens a regex) and the wrapped-bullet rule —
  executed on a scratch snippet: 2 calls counted out of a snippet holding `/design-atlas\)" stop
  open/`, a `"test("` string and a `describe(`; a `SHALL\n  CONTINUE TO` bullet reads as a pin
  only after collapsing continuation lines — **if false:** add the failing shape to
  AC-20260911-02-4's fixture and fix the scanner, never widen the count.
- A4: The new hook is not live in the session that builds this spec (hooks load at session
  start from the installed plugin), so the worker can `Write` `.claude/test-ceiling.json` and
  `git rm spec/test-ceiling.json` — **if false:** the orchestrator creates the file (allowed:
  absent) and removes the old one with a Bash path spelled without the literal
  (`git rm spec/test-ceil*.json`); record the deviation.
- A5: An extra `Bash` matcher hook costs one `bash`+`jq` start per Bash call in every host —
  **if false** (a host reports visible latency): keep the arm, it is the only tunnel closer.
- A7: The pre-image `verdict.js` ignores an unknown green row and reads an unknown red row as
  dispositionable — executed: a ten-row manifest (`SIX_GREEN` + `{"leg":"ceiling","exit":0}`)
  with a CLEAN workflow printed `CLEAN`; the same with `exit:1` printed `HARD_FINDINGS` — so
  D10's pins are green pre-image and D4 needs all three blocking spellings — **if false:** the
  pin that goes red is updated in place and retagged, never loosened.
- A8: The nine D10 files are the complete set of hand-built manifests (grep executed:
  `promise-sweep` as a leg literal across `tests/`, worktrees excluded) — a prediction, not an
  inventory — **if false:** the tenth file gains its row in the same build as an out-of-plan row
  and is retagged; never weaken the verdict.
- A6: `tests/spec-paths.test.js` and `tests/consistency/read-load.test.js` tolerate one added key
  and the template comment growing by one word — **if false:** update the pin in the same build
  as an out-of-plan row and record it.

## Rationale

The direct batch of 2026-09-11 wrote `spec/test-ceiling.json` and documented it, but nothing
reads it and hosts cannot host a `spec/` path — so D1 moves it under `.claude/` before any
gate learns the path. The number is human-owned by construction: the hook (D6) blocks the
model's Edit, Write and Bash routes to the file, and a missing file is not an error (a host that
never set a ceiling has none). The hook is a speed bump, not a wall — a path spelled by glob or
a renamed directory walks past it — and that is acceptable: its job is to stop the easy
self-authorization the size ratchet's `--reconcile --cite` used to hand the model.

Two gates read the file so the number bites at both ends: the build's final gate (D5) stops a
worker from landing an over-ceiling tree, and the review leg (D4) is the blocking evidence row
the verdict derives from. Both call the one script; neither re-derives the count. The scanner
(D2) is shared with spec 03's expiry so the two never disagree about what a test case is.

Rejected: a `testCeiling` config key — the model edits `spec.config.json` routinely, so a hook
cannot single it out; a separate file is the only thing a hook can guard. Rejected: counting via
the test reporter's `ℹ tests` line — it was retired with the budget reporter and needs a full
run; the scanner counts a tree in milliseconds. Rejected: `--require ceiling` wiring — it
never makes a leg blocking. No `SHALL CONTINUE TO` pin: this spec adds surfaces and retires only
a path nothing reads; no neighbour behaviour changes.

Collision-closure at lock: the literals leg's one hit outside worktrees is
`docs/canonical/scripts.md`, which is this spec's own Canonical Delta target — waived here, applied
at review close. The `executes` hits on `verdict.js`, `review-legs.js` and the build driver are the
D10 fixture rows.

Watch during build: the exhaustive pins in `tests/consistency/` fail closed on the new hook arm
and the new leg (D7 names them); the template's oracle set must list `ceiling` or `[oracle:
ceiling]` is a laundering route in future specs.

## Canonical Delta

`docs/canonical/scripts.md` — replace the paragraph beginning "The plugin's own test count has
a ceiling" with:

A repo's test count has a ceiling. `.claude/test-ceiling.json` (`{"maxTests": N}`) is owned by
the human: `block-ceiling-writes.sh` refuses the model's Edit, Write and Bash changes to it, the
review's `ceiling` leg (blocking) and the build's final gate both run `test-ceiling.js`, which
counts `test(`/`it(` calls at line start across the host's test-classified files
(`lib/test-scan.js`, the one scanner) and reds when the count exceeds the number. An absent file
means no ceiling. There is no cite, no reconcile and no raise command; the only way under the
line is deleting tests. Byte-size ratchets and duplicate-window baselines were retired on
2026-09-11 as self-authorizing.
