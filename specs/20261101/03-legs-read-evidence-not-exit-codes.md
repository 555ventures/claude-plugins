---
date: 2026-11-01
status: implementing
tier: standard
area: build-integrity
breaking: false
build_base: main
depends_on: []
brief: n/a
open_markers: 0
diff_base: 3a84b6609b091ae178b0e3d4c505351d0d762a3b
---

# Legs read evidence, not exit codes alone

## Goal

Two legs contradict core § Runtime Verification and § Feedback Loop on any host that is not this
one. `red-check.js` reads a test runner's exit code only: a runner that exits 0 over zero matched
tests (cargo treats a file path as a name filter; any wrapper can) reports a sanctioned-green pin
as green having run nothing, although `review-legs.js` already refuses the same vacuous green
through `capabilities.testCountPattern`. `memory-sweep.js` decides a note "diff-hit" only when the
note names a `.js/.mjs/.cjs/.sh/.md/.json` path, so on a Python or Go host agent memory is never
surfaced for disposal and becomes the carrier core forbids; an uncommitted note never reaches
`ttl-expired` either. Done means red-check applies the host's declared count pattern the way
review-legs does, memory-sweep matches changed paths without an extension list, and an
uncommitted note ages from its file time.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `red-check.js` `runLeg` captures the run's output; when `capabilities.testCountPattern` is declared and not `"none"`, `lib/count-observation.js`'s `computeTestsExecuted` is applied to it and `isUnobserved` (executed 0 or `pattern-no-match`) sets `observed: 'unobserved'` for that file. An `unobserved` file whose `expected` is `green` raises the hard finding `vacuous-green` (`<file>: the runner exited <code> but its output shows no executed test (testCountPattern <p>) — the sanctioned-green file proved nothing`); an `unobserved` red-expected file keeps `observed: 'unobserved'` and raises no finding (nothing ran, nothing passed). `--json` `files[].observed` gains the value `unobserved` and each file gains `testsExecuted` (`N` or the unavailability object). The typecheck leg is unchanged. (AC-20261101-03-1, AC-20261101-03-2, AC-20261101-03-3) | Core § Runtime Verification: a leg that executed nothing is not a pass; review-legs already fails closed on this class (`isUnobserved`), red-check never got the guard. |
| D2 | When `capabilities.testCountPattern` is absent or `"none"`, red-check reads exit codes as today and pushes ONE warning per run: `testCountPattern is not declared in the host config — red-check reads exit codes only and cannot see a run that executed no test`. (AC-20261101-03-4, AC-20261101-03-7) | The same shape as the absent-`testNameFilter` warning: loud once, never a finding, no behaviour change for a host that declares nothing. |
| D3 | `memory-sweep.js` `findDiffHit` carries no extension list: a note diff-hits when its body contains a changed path verbatim, or the changed path's basename as a whole token (bounded by start/end or a character outside `[A-Za-z0-9_./-]`) when that basename contains a `.`. The `TOKEN_RE` constant is deleted. (AC-20261101-03-5, AC-20261101-03-8) | The match is against the diff's own paths, so no list of languages is needed; the basename rule keeps today's hits (`AC-20260823-06-5`) and adds `models.py`, `main.go`. |
| D4 | A note with no commit date (`git log` answers nothing — untracked or ignored) ages from its file's `mtime`; `ttl-expired` rows for such a note carry `matched: <mtime ISO>` and `source: 'mtime'`, committed notes carry `source: 'commit'`. (AC-20261101-03-6) | An uncommitted note otherwise never expires, which is the one way a memory could outlive every review. |
| D5 | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"`. `[no-ac: node scripts/plugin-bump.js --check in the gate is the oracle]` | Behaviour change under `spec/` (pipeline rules § Planning). |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/red-check.js | MODIFY | scripts | `runLeg` captures output; `testsExecuted`, `observed: 'unobserved'`, `vacuous-green`, the absent-pattern warning (D1, D2); `no dependency change` |
| spec/scripts/memory-sweep.js | MODIFY | scripts | `findDiffHit` without `TOKEN_RE`; mtime fallback with `source` (D3, D4) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` (D5) |
| tests/red-check/vacuous-green.test.js | CREATE | tests | AC-20261101-03-1, AC-20261101-03-2, AC-20261101-03-3, AC-20261101-03-4 |
| tests/prose-debt/memory-sweep.test.js | MODIFY | tests | AC-20261101-03-5, AC-20261101-03-6 |

## Contracts

`red-check.js --json` (D1, D2), additive:

```
files[]: { path, expected, observed: 'green'|'red'|'unobserved'|'absent', carriedAcs,
           testsExecuted?: number | {"unavailable":"pattern-no-match"} | {"unavailable":"no-format-declared"} }
findings[]: { severity: 'hard', class: 'vacuous-green', path, detail }
warnings[]: 'testCountPattern is not declared in the host config — red-check reads exit codes only and cannot see a run that executed no test'
```

`runLeg(cmd, relPath)` → `{ status, output }` (stdout+stderr, `stdio: 'pipe'`); `status` null → 1.
Observed derivation per file: `status !== 0` → `red`; `status === 0` and pattern declared and
`isUnobserved(computeTestsExecuted(output, pattern))` → `unobserved`; else `green`.

`memory-sweep.js` (D3, D4):

```
findDiffHit(body, changedPaths) -> the first changed path p such that
  body.includes(p)                                    // verbatim path
  || (basename(p).includes('.') && new RegExp('(^|[^A-Za-z0-9_./-])' + escape(basename(p)) + '($|[^A-Za-z0-9_./-])').test(body))
notes[]: { path, reason: 'diff-hit', matched }                          // unchanged
         { path, reason: 'ttl-expired', matched: <ISO>, source: 'commit'|'mtime' }
```

## Behavior

Fixture (red-check): a host with `testCommand` `node stub.js`, `testNameFilter` absent,
`capabilities.testCountPattern` `ℹ tests (\d+)`. `stub.js` prints `ℹ tests 0` and exits 0 when
`STUB_COUNT=0`, `ℹ tests 1` and exits 0 otherwise. A spec whose AC `SHALL CONTINUE TO …` makes
`tests/a.test.js` green-expected. With `STUB_COUNT=0` → `vacuous-green`, exit 1, `observed`
`unobserved`, `testsExecuted` `0`. With the stub printing `ran fine` (no count) → `testsExecuted`
`{"unavailable":"pattern-no-match"}`, still `vacuous-green`. With `STUB_COUNT=1` → `green`, no
finding. With the pattern removed from the config → `green`, no finding, the D2 warning once.

Fixture (memory-sweep): `tests/prose-debt/memory-sweep.test.js`'s existing `gitRepo` host; a note
`.claude/agent-memory/x/note.md` reading "watch app/models.py when the ORM changes" with the diff
line `app/models.py` → `diff-hit` matched `app/models.py`; a note reading "see main.go" with diff
`cmd/server/main.go` → `diff-hit` (basename rule); a note reading "models" alone → no hit. An
untracked note (never committed) whose `mtime` is set to 2026-08-01 with 12 later review rows →
`ttl-expired`, `source: 'mtime'`.

## Acceptance Criteria

- **AC-20261101-03-1**: WHEN `red-check.js --spec <spec> --root <fixture> --base <sha> --json` runs with `testCountPattern` `ℹ tests (\d+)` and the stub printing `ℹ tests 0` exit 0 for a green-expected file THE SYSTEM SHALL exit 1, record `files[0].observed` `unobserved`, `files[0].testsExecuted` `0`, and one finding `{severity:'hard', class:'vacuous-green', path:'tests/a.test.js'}` whose `detail` contains `executed no test` → writes tests/red-check/vacuous-green.test.js
- **AC-20261101-03-2**: WHEN the stub prints `ran fine` (no count) and exits 0 for a green-expected file THE SYSTEM SHALL record `testsExecuted` `{"unavailable":"pattern-no-match"}` and the same `vacuous-green` finding; WHEN the stub prints `ℹ tests 1` and exits 0 THE SYSTEM SHALL record `observed` `green`, `testsExecuted` `1` and no finding → writes tests/red-check/vacuous-green.test.js
- **AC-20261101-03-3**: WHEN the stub prints `ℹ tests 0` and exits 0 for a RED-expected file THE SYSTEM SHALL record `observed` `unobserved` and raise neither `vacuous-green` nor the unsanctioned-green finding (e.g. `findings` filtered by `path` `tests/a.test.js` → `[]`) → writes tests/red-check/vacuous-green.test.js
- **AC-20261101-03-4**: WHEN the config declares no `capabilities.testCountPattern` (or `"none"`) and the stub exits 0 printing `ℹ tests 0` THE SYSTEM SHALL record `observed` `green`, no `testsExecuted` key, no finding, and exactly one warning containing `testCountPattern is not declared` → writes tests/red-check/vacuous-green.test.js
- **AC-20261101-03-5**: WHEN a note body reads `watch app/models.py when the ORM changes` and the diff holds `app/models.py` THE SYSTEM SHALL list it as `diff-hit` with `matched` `app/models.py`; WHEN a note reads `see main.go` and the diff holds `cmd/server/main.go` THE SYSTEM SHALL list it as `diff-hit`; WHEN a note reads `models` and the diff holds `app/models.py` THE SYSTEM SHALL NOT list it → writes tests/prose-debt/memory-sweep.test.js
- **AC-20261101-03-6**: WHEN an untracked note's `mtime` is `2026-08-01T00:00:00Z` and the ledger holds 12 review rows dated after it THE SYSTEM SHALL list it as `ttl-expired` with `source` `mtime` and `matched` starting `2026-08-01`; a committed note in the same run SHALL carry `source` `commit` → writes tests/prose-debt/memory-sweep.test.js
- **AC-20261101-03-7**: WHEN `red-check.js` runs over a host with `testCommand` `node --test`, no `testCountPattern`, a red-expected file that fails and a `[pre-green: predicate-in-test]` file that passes THE SYSTEM SHALL CONTINUE TO classify them `red` and `green` respectively with exit 0 → reuses tests/red-check/red-check.test.js :: AC-20260821-01-3:
- **AC-20261101-03-8**: WHEN a note body cites a changed path's basename (`foo.md` for diff `docs/foo.md`) THE SYSTEM SHALL CONTINUE TO surface it as `diff-hit` and exclude `MEMORY.md` index files → reuses tests/prose-debt/memory-sweep.test.js :: AC-20260823-06-5:

## Assumptions (escalation triggers)

- A1: `lib/count-observation.js` exports `computeTestsExecuted(output, pattern)` and `isUnobserved(value)` with review-legs' semantics (checked this session: `review-legs.js:146`, exports at `count-observation.js:46`) — **if false:** red-check imports `lastMatch` and derives locally; never a second regex.
- A2: `hostRun.run` returns `spawnSync`'s result so `stdout`/`stderr` are available with `stdio: 'pipe'` (`lib/host-run.js:40-42`) — **if false:** switch `runLeg` to `encoding: 'utf8'` plus `maxBuffer` 16 MiB; the leg never reads the file system for output.
- A3: No test outside the File Plan asserts `files[].observed`'s closed value set or the exact `warnings` count of red-check (grep this session: `tests/red-check/red-check.test.js` 13 `observed` hits, all against `green`/`red`/`absent` with a declared or absent pattern unchanged; none pins `warnings.length`) — **if false:** the hit enters the File Plan as a fix row, retagged, never weakened.
- A4: `tests/prose-debt/memory-sweep.test.js`'s `commitAt` helper and `gitRepo({empty:true})` fixture allow an untracked note beside committed ones (`fs.utimesSync` sets its mtime) — **if false:** the untracked note lives in a second fixture root.
- A5: The build driver reads red-check's exit code and `findings[].severity`, not `files[].observed` (grep this session: `spec-build-driver.js` never reads `observed`) — **if false:** the driver's reader gains the `unobserved` branch in the same build as a File Plan addition.

## Rationale

Both defects are the same shape: a leg trusting one cheap signal where a stronger one is already
in the repo. For red-check, `review-legs.js` has refused "exit 0, zero executed" since the
`36c2f14` incident through `testCountPattern`, and red-check — which decides whether a sanctioned
green pin actually proved anything — still reads the exit code alone. The fix reuses the same
helper and the same host key; where the host has declared no pattern, nothing changes except one
warning, matching how `testNameFilter`'s absence is reported. A red-expected file that ran nothing
raises no finding because the red/green question is moot when nothing executed; the `unobserved`
value makes that state legible rather than folding it into `red`.

For memory-sweep, the extension list was never the point: the sweep already holds the diff's own
paths, so matching against them directly needs no knowledge of any language. The basename rule is
kept because today's pin (`AC-20260823-06-5`) relies on it, and gated on the basename containing a
dot so a note mentioning the word `main` is not a hit for `main`. The mtime fallback closes the
one path by which a memory file could never be surfaced: a note in a gitignored `.claude/` tree
has no commit date, and today the sweep skips it forever.

Alternatives rejected: parsing runner output with a built-in regex set in red-check (a second
derivation beside `count-observation.js`, and stack-shaped); dropping basename matching in
memory-sweep (breaks the existing pin and misses notes written with a bare filename).

Collision closure (lock, `--literal TOKEN_RE`): the only literals hit is `spec/scripts/memory-sweep.js`, a File Plan row.

## Canonical Delta

docs/canonical/scripts.md § Prose budgets, the sentence beginning "Agent-memory notes are disposed when a spec's diff touches what they are *about*": append "— a note is about a changed path when it names the path or its dotted basename, whatever the language; a note git has never seen ages from its file time (specs/20261101/03-legs-read-evidence-not-exit-codes.md D3, D4)".

docs/canonical/build-integrity.md: add one sentence where red-check's classification is described: "A file whose runner exits 0 while the host's `testCountPattern` shows no executed test is `observed: unobserved`; green-expected, that is the hard finding `vacuous-green`; without a declared pattern red-check reads exit codes only and says so once per run (specs/20261101/03-legs-read-evidence-not-exit-codes.md D1, D2)".
