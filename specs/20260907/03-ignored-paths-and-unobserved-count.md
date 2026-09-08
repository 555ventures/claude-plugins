---
date: 2026-09-07
status: done
tier: critical
area: review-evidence
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-07
open_markers: 0
diff_base: e1835455f757ffe9f43cc6ce72771b24ef64c857
---

# At-risk selection skips ignored paths; an unobserved test count reds the leg

## Goal

Two independent holes found by a real review in the `prax` host (`rv_e7c6439702e5`) close
together because they are the same failure at two ends of one leg. First, the at-risk
selector walks the working tree and only refuses four directory *names*, so git-ignored
working copies — the pipeline's own `.claude/worktrees/**` checkouts, `*.build/` scratch
dirs — are handed to the host's test command as if they were real test files; in `prax`
the host runner could not route them and aborted before a single test ran. Second, when a
host declares a test-count format and that format never appears in the runner's output, the
count is recorded as an unavailability object, which the vacuous-green rule reads as
*unknown* rather than *zero* — so a runner that exits 0 having executed nothing scores the
leg green. Done means: ignored paths never enter the at-risk set on any host layout, and a
run that produces no observable count reds both the at-risk leg and the whole-suite leg.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `walkTestFiles` prunes every git-ignored path, derived once per process from a single `git -C <root> ls-files -o -i --exclude-standard --directory -z` at the start of the walk: entries ending in `/` prune the whole subtree, plain entries drop that one file. The four existing name skips (`.git`, `node_modules`, `fixtures`, `__fixtures__`) stay exactly as they are — this is additive (AC-20260907-03-1, AC-20260907-03-2, AC-20260907-03-9) | The reported break was one host's ignored-worktree layout, but the class is "the working tree holds copies git does not consider part of the project"; a fifth directory name would close one host and leave the next. `ls-files -o` lists only *untracked* ignored paths, so a tracked file that also matches a `.gitignore` line stays a candidate — the correct semantics for a repo that deliberately tracks an ignored-pattern file |
| D2 | The prune is active only when `git -C <root> rev-parse --show-prefix` exits 0 with empty output (root IS the repository top level) **and** the `ls-files` call exits 0. Any other outcome — not a repository, `git` unavailable, a `--root` pointing at a subdirectory — yields an empty ignored set and the walk behaves byte-identically to today (AC-20260907-03-3) | `ls-files` prints paths relative to the repository root, so a subdirectory `--root` would compare mismatched prefixes and prune the wrong subtree; refusing to filter is always safe (the pre-change behaviour), silently pruning the wrong tree is not. The probe mode can run before a host is a repository at all |
| D3 | `--probe-at-risk` inherits the prune through the same `walkTestFiles` call it already makes — no second implementation, no probe-specific branch (AC-20260907-03-4) | The sole-derivation rule (§ Risk Tiers, `scope-reconcile.js`); the probe's `testFiles` count is what `/spec:init` shows a new host, and an inflated count taught by ignored copies is the same lie in a different surface |
| D4 | On the at-risk leg the exit is forced to 1 when `files > 0` **and** `testsExecuted` is either the number `0` or the object `{"unavailable":"pattern-no-match"}`. `{"unavailable":"no-format-declared"}` never forces (AC-20260907-03-5, AC-20260907-03-7) | The leg's whole promise is "these files were exercised"; a declared format that produced no match means nothing was observed executing, which is the same unsupported promise as an observed zero. `no-format-declared` is a host that never promised an observation, so there is nothing to contradict |
| D5 | The whole-suite leg takes the identical extension, in the same shape (AC-20260907-03-6, AC-20260907-03-7) | The suite leg carries the identical strict `=== 0` test today and is the *blocking* leg — leaving it open would mean a whole-suite run that executed nothing still passes a review, the wider-blast-radius half of the same escape |
| D6 | No new typed reason and no edit to `spec/templates/grounding-contract.md`: `pattern-no-match` keeps its single documented meaning and the enum is unchanged, so no host's stamped contract hash moves. The saved leg output file (`at-risk.txt` / `suite-output.txt`) is the evidence that separates a dead runner from a stale pattern `[no-ac: enforced by the File Plan — an edit to the grounding contract would land out-of-plan and red review's reconcile leg]` | Ruled by the user at plan time: the red is identical either way, and the runner's own captured output already shows which cause it was; a third enum value would restamp every host on the fleet for a label. The contract prose already promises that a declared-pattern miss "raises a leg finding" — for counts that promise was simply not kept |
| D7 | Version bump target: the next free minor of the `spec` plugin (7.97.0 at plan time), with the standing moving-target rule — the build bumps to the next free version and records the deviation `[no-ac: version discipline is a review check, not a behavioural AC]` | Sibling specs 20260907/01 and /02 are hardened against the same tree and race the same semver (§ Gotchas, concurrent-session version race) |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| `spec/scripts/scope-reconcile.js` | MODIFY | scripts | D1/D2/D3: ignored-path prune inside `walkTestFiles` (derived once, top-level-root guard, safe fallback); header comment gains the rule and its owner citation |
| `spec/scripts/review-legs.js` | MODIFY | scripts | D4/D5: the at-risk and suite exit derivations force 1 on `pattern-no-match` as well as an observed 0; the two header-comment sentences describing the contradiction rule are corrected |
| `tests/scope-reconcile-at-risk.test.js` | MODIFY | tests | AC-20260907-03-1, AC-20260907-03-2, AC-20260907-03-9 |
| `tests/scope-reconcile-probe.test.js` | MODIFY | tests | AC-20260907-03-3, AC-20260907-03-4 |
| `tests/review/legs-verdict-pair.test.js` | MODIFY | tests | AC-20260907-03-5, AC-20260907-03-6, AC-20260907-03-7, AC-20260907-03-8 — the grammar authority (specs/20260820/06 D10) gains the two new red branches; the existing `no-format-declared` test is retagged in place, never weakened |
| `spec/.claude-plugin/plugin.json` | MODIFY | doctrine | D7: semver bump + a changelog paragraph in the last-3-versions form |

## Contracts

The evidence-manifest row shapes are unchanged — no new key, no new enum value. Only the
`exit` derivation moves:

```jsonc
// at-risk leg, files > 0 — BEFORE
{"leg":"at-risk","exit":0,"observed":{"files":1,"testsExecuted":{"unavailable":"pattern-no-match"}}}
// at-risk leg, files > 0 — AFTER (D4)
{"leg":"at-risk","exit":1,"observed":{"files":1,"testsExecuted":{"unavailable":"pattern-no-match"}}}

// suite leg — BEFORE
{"leg":"suite","exit":0,"observed":{"skips":0,"todos":0,"testsExecuted":{"unavailable":"pattern-no-match"}}}
// suite leg — AFTER (D5)
{"leg":"suite","exit":1,"observed":{"skips":0,"todos":0,"testsExecuted":{"unavailable":"pattern-no-match"}}}

// unchanged in both legs (D4): a host that declares no format is never forced
{"leg":"at-risk","exit":0,"observed":{"files":1,"testsExecuted":{"unavailable":"no-format-declared"}}}
```

`scope-reconcile.js --json` keeps its exact field set; `atRisk` simply stops containing
git-ignored paths. `--probe-at-risk` keeps `{sampled, testFiles, refs}` and always exits 0.

## Behavior

**Ignored-path prune (D1/D2/D3).** At the first `walkTestFiles` call the script derives the
ignored set once. `git -C <root> rev-parse --show-prefix` must exit 0 printing an empty line;
then `git -C <root> ls-files -o -i --exclude-standard --directory -z` yields NUL-separated
entries relative to that root — a fully-ignored directory arrives as `.claude/worktrees/`
(trailing slash), an individually-ignored file as `tests/legacy.test.js`. During the walk a
directory whose repo-relative path plus `/` is in the set is not descended into; a file whose
repo-relative path is in the set is not pushed. Any failure of either git call (non-zero exit,
missing binary, non-empty prefix) leaves the set empty, and the walk is exactly the pre-change
walk. The four name skips run first and are untouched.

**Unobserved count (D4/D5).** Both legs already compute `testsExecuted` through the shared
`computeTestsExecuted`. The forcing predicate widens from `testsExecuted === 0` to
"`testsExecuted === 0` or `testsExecuted.unavailable === 'pattern-no-match'`". Nothing in
`verdict.js` changes: a red at-risk row already pools a leg finding, and a red suite row is
already blocking.

Reachability is worth stating plainly: a plain `node --test` host cannot produce this shape —
measured below, node exits non-zero whenever it prints no count line. The shape is reachable
only through a wrapper `testCommand` that swallows its own failure and exits 0, which is
exactly what the `prax` host's routing wrapper did.

## Acceptance Criteria

- **AC-20260907-03-1**: WHEN `scope-reconcile.js --json` runs at the top level of a repository
  whose `.gitignore` contains `.claude/worktrees/`, and a test file exists at BOTH
  `tests/thing.test.js` (tracked) and `.claude/worktrees/wt/tests/thing.test.js` (ignored,
  identical content referencing the changed file's path stem), THE SYSTEM SHALL emit `atRisk`
  containing exactly one entry whose `file` is `tests/thing.test.js` and SHALL NOT emit any
  entry whose `file` starts with `.claude/worktrees/` → `tests/scope-reconcile-at-risk.test.js`
- **AC-20260907-03-2**: WHEN the same run happens in a repository whose `.gitignore` names a
  single untracked file rather than a directory (line `tests/legacy.test.js`, with that file on
  disk and referencing the changed stem), THE SYSTEM SHALL omit `tests/legacy.test.js` from
  `atRisk` while still emitting `tests/thing.test.js` — pinning that the prune is path-ignored
  shaped, never directory-name shaped → `tests/scope-reconcile-at-risk.test.js`
- **AC-20260907-03-3**: WHEN `scope-reconcile.js --probe-at-risk` runs with `--root` pointing at
  a directory that is not a git repository (no `.git` anywhere above it), THE SYSTEM SHALL
  CONTINUE TO complete and report the full unpruned walk — a tree holding one
  `tests/thing.test.js` reports `"testFiles": 1` and exit 0, never a crash, a git error on
  stderr, or `"testFiles": 0` → `tests/scope-reconcile-probe.test.js`
- **AC-20260907-03-4**: WHEN `scope-reconcile.js --probe-at-risk <sample-list> --root <repo>`
  runs at the top level of a repository holding `tests/thing.test.js` (tracked) and
  `.claude/worktrees/wt/tests/thing.test.js` (ignored), THE SYSTEM SHALL report
  `"testFiles": 1`, not `2` → `tests/scope-reconcile-probe.test.js`
- **AC-20260907-03-5**: WHEN `review-legs.js` runs against a synthetic host that declares
  `testCountPattern`, has exactly one at-risk file, and whose `testCommand` exits 0 printing no
  line matching that pattern, THE SYSTEM SHALL append the row
  `{"leg":"at-risk","exit":1,"observed":{"files":1,"testsExecuted":{"unavailable":"pattern-no-match"}}}`
  — the emitter forcing the exit itself, the observed value unchanged — and that manifest fed
  unmodified to `verdict.js --ledger` SHALL pool at least 1 leg finding →
  `tests/review/legs-verdict-pair.test.js`
- **AC-20260907-03-6**: WHEN the same synthetic host's bare `testCommand` (the suite leg) exits 0
  printing no line matching the declared `testCountPattern`, THE SYSTEM SHALL append
  `{"leg":"suite","exit":1,...,"testsExecuted":{"unavailable":"pattern-no-match"}}` and
  `verdict.js` SHALL derive a blocking-red verdict word, never `CLEAN` →
  `tests/review/legs-verdict-pair.test.js`
- **AC-20260907-03-7**: WHEN a synthetic host declares no `testCountPattern` (absent or `"none"`)
  and its `testCommand` exits 1 on a single at-risk file, THE SYSTEM SHALL CONTINUE TO record the
  child's real exit code — row `{"leg":"at-risk","exit":1,"observed":{"files":1,"testsExecuted":{"unavailable":"no-format-declared"}}}`
  — and SHALL NOT force any exit on the suite leg for the same reason: a host that declared no
  format is never contradicted (retag/extension of AC-20260820-06-7) →
  `tests/review/legs-verdict-pair.test.js`
- **AC-20260907-03-8**: WHEN a synthetic host declares `testCountPattern` and its `testCommand`
  exits 0 printing `ℹ tests 3`, THE SYSTEM SHALL CONTINUE TO leave both the at-risk row and the
  suite row green — `{"exit":0,...,"testsExecuted":3}` on each — so the widened predicate never
  reddens an observed non-zero count → `tests/review/legs-verdict-pair.test.js`
- **AC-20260907-03-9**: WHEN the at-risk walk meets directories named `fixtures`,
  `__fixtures__`, `node_modules` or `.git` that are NOT git-ignored (tracked prose/data fixtures
  under a test tree, e.g. a tracked `tests/fixtures/sample.test.js` referencing the changed
  stem), THE SYSTEM SHALL CONTINUE TO exclude them from `atRisk` — the name skips survive the
  new prune (AC-20260903-07-7) → `tests/scope-reconcile-at-risk.test.js`

## Assumptions (escalation triggers)

- **A1**: `git check-ignore`/`ls-files` behave as measured. *Executed 2026-09-07* in a throwaway
  repo (`.gitignore` = `ignored/`): `git ls-files -o -i --exclude-standard --directory` →
  `status=0 stdout="ignored/\n"` (fully-ignored dirs collapse to one trailing-slash entry);
  `check-ignore --stdin` on `ignored/wt/tests/c.test.js` → `status=0`, confirming deep paths
  under an ignored dir are ignored; the same call in a non-repository → `status=128 stderr="fatal:
  not a git repository"`. Against the real repo, `git ls-files -o -i --exclude-standard
  --directory` prints `.claude/spec-preimage/`, `.claude/spec-session.json`,
  `.claude/worktrees/`, `.playwright-mcp/`, `specs/20260902/02-plugin-code-sweep.build/` — the
  reported break plus three more of the same class. — **if false:** fall back to a
  post-walk `git check-ignore --stdin -z` filter over the collected candidate list (one spawn,
  correct under any `--root`, at the cost of descending ignored trees first).
- **A2**: the escape shape is unreachable from a plain `node --test` host, so the widened red
  cannot false-fire on one. *Executed 2026-09-07*, node v26.0.0, reporter `spec`: a passing file
  → `status=0` with `ℹ tests 1`; a file throwing at load → `status=1` with `ℹ tests 1`; a missing
  file → `status=1` with NO count line; a wrapper script printing a refusal and exiting 0 →
  `status=0` with NO count line. Only the wrapper reaches exit 0 without a count. — **if false:**
  the AC-20260907-03-8 pin catches it in this repo's own suite at build time; if a real host
  surfaces a green-but-countless plain runner, D5 (the suite half) is the piece to narrow, and
  the narrowing is a Decision amendment, not a silent revert.
- **A3**: no consumer outside `verdict.js` reads the at-risk or suite `exit` field with its own
  rule. Derived from the manifest consumers in this repo. — **if false:** STOP, ask the user —
  a second consumer means a second place deriving a verdict, which the risk tier forbids.
- **A4**: sibling specs 20260907/01 and /02 touch neither `scope-reconcile.js` nor
  `review-legs.js` (checked against both File Plans at lock), so this spec can build in any
  order relative to them. — **if false:** rebase and re-derive `diff_base` at build Phase 0 per
  § Gotchas.

## Rationale

Both halves were one review's collateral, and both are the same mistake: a guard that
classifies by *name* instead of by *what the repository actually considers part of itself*.
The plugin's own gotcha list already records this shape — a conformance guard keyed on file
name or extension is evadable by the exact thing it guards — and a fifth entry in the skip
list would have been the name-shaped fix again, closing one host's layout and leaving the
next one open. Asking git is the only classifier that generalises, and it is free: one
process per run, pruned during the walk rather than filtered after it, so an ignored worktree
holding a whole second checkout is never descended.

The safety guard (D2) matters more than it looks. `ls-files` prints paths relative to the
repository root, so a `--root` below the top level would compare mismatched prefixes and could
prune a *real* test directory — silently shrinking the at-risk set is exactly the failure this
spec exists to stop. Refusing to filter in that case restores today's behaviour, which is
merely too wide, never too narrow.

On the second half the user was offered a distinct typed reason for the dead-runner case,
worked out by checking whether the same declared pattern matched elsewhere in the run, and
rejected it: the red is identical either way, the runner's captured output already shows the
cause, and a third enum value would move the stamped contract hash on every host repo for what
amounts to a label. Extending the rule to the suite leg was the user's call too, and it is the
half that matters most — the suite leg is blocking, so a vacuous whole-suite run is the larger
of the two escapes even though only the at-risk one was reported.

What to watch during execution: the existing at-risk tests build their fixtures with
`gitRepo()`, which already writes a `.gitignore` containing `.claude/worktrees/`. Any existing
fixture that happens to place a test file under an ignored path will change its expected
`atRisk` — that is the fix working, not a regression, but it must be read carefully rather
than patched away.

**Collision closure (run at lock, 2026-09-07, `--literal pattern-no-match`).** The literals leg
returned nine hits, all waived and none widening the File Plan: `docs/canonical/review.md` and
`docs/canonical/release-pipeline.md` state only that the typed observation is never coerced to a
number, which stays true — this spec changes the leg's `exit`, never the recorded `observed`
value; `spec/templates/grounding-contract.md` is deliberately untouched per D6;
`spec/scripts/verdict.js` and `tests/review/verdict.test.js` cover the gate leg's *skips*
finding, a different slot with no contradiction rule; `spec/scripts/release-legs.js` is the
release e2e leg, which has no force-to-red rule at all today (a separate, pre-existing gap,
queued as its own follow-up rather than folded in here); `docs/roadmap/16-*.md` is historical
brief prose; `tests/review/legs-verdict-pair.test.js` is already a File Plan row. The `executes`
tier lists the suites that spawn the two changed scripts: every fixture among them either builds
its host with `gitRepo()` (whose `.gitignore` names only `.claude/worktrees/`, a path none of
them populate) or is not a repository at all, in which case D2's guard leaves the walk unchanged
— so no fixture repair is planned, and the build-time whole-suite check adjudicates if that
reading is wrong.

**Build and review departures (folded from the deviations sidecar at close).** Two, both
one-offs, neither earning a Gotchas entry (the section stood at its 15-entry cap at verdict).
First, D7 named 7.97.0 as the version-bump target, but sibling specs 20260907/01 and /02 had
already landed and carried the plugin to 7.103.0 by build time; per D7's own standing
moving-target rule the build took the next free minor, **7.104.0**, which is the rule working
rather than a departure from it. Second, the whole-suite leg's first run hard-stopped red on
two browser-launching tests owned by specs/20260905/06 — they exited 127 because the machine
had no Chrome anywhere the test's resolver looks. Neither that test file nor its script is in
this File Plan or this spec's commit, and the reviewer confirmed the file is byte-identical to
the diff base; a browser was then installed and the same untouched file passed with no
environment variable set, so zero code delta flipped the result. The user ruled at disposition
that the hard failure is **correct** and queued no follow-up: a test that steps aside when its
dependency is absent reports green having verified nothing, which is precisely the vacuous-green
class this spec exists to close, and § Test Rules already states that this repo sanctions no
env-gated skips. The remedy for a browserless machine is to install the browser, never to add a
skip guard.

## Canonical Delta

Applied at close. The Delta as locked read "no `docs/canonical/` area covers the review
evidence legs; nothing to apply" — that was wrong: two live reference docs stated the rules
this spec changes, and leaving them would have taught future planning the retired behaviour.

- `docs/canonical/review.md` — the `suite` leg paragraph said a declared `testCountPattern`
  forces exit 1 only on an observed zero; it now states the widened rule (an observed `0` **or**
  a `pattern-no-match` the declared format never matched), that `no-format-declared` never
  forces, and that the at-risk leg carries the identical rule. The `at-risk` leg paragraph gains
  the ignored-path prune and its top-level-root guard.
- `docs/canonical/pipeline.md` — the one-line at-risk derivation summary gains the prune, so the
  short form and the long form agree.

