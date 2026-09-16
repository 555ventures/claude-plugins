---
date: 2026-09-15
status: hardened
tier: critical
area: gate-scripts
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-15
open_markers: 0
---

# One derivation of git-ignored paths, shared by both repo walks

## Goal

`red-check.js` expands a wildcard File Plan tests row by walking the whole tree from `--root`,
and that walk descends into every git-ignored path — in this repo, four full checkouts under
`.claude/worktrees/`. A row starting with `**` therefore resolves test files that live inside a
copy of the repository, and red-check colour-classifies and executes them as if the File Plan
had named them. `scope-reconcile.js` already closed this class for its own walk
(specs/20260907/03-ignored-paths-and-unobserved-count.md D1/D2); this spec lifts that derivation
into a shared library and makes red-check its second consumer. Done means: a wildcard tests row
never reaches inside a git-ignored path on any host layout, an exact-path tests row is still
resolved and checked wherever it points, and a wildcard that resolves nothing says so instead of
passing in silence.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/scripts/lib/ignored-paths.js` is created as the ONE derivation of a root's git-ignored path set. It exports `getIgnoredPaths(root)` → `Set<string>`, derived from a single `git -C <root> ls-files -o -i --exclude-standard --directory -z` behind the `git -C <root> rev-parse --show-prefix` top-level guard, with the empty-set fallback on any other outcome — the D1/D2 contract of specs/20260907/03-ignored-paths-and-unobserved-count.md, carried over unchanged in substance. The result is cached per `root` in a `Map`, so one process asking twice spawns git once. `scope-reconcile.js` deletes its private copy and imports this one; its `walkTestFiles` body keeps its existing `rel/` and `rel` membership checks verbatim (AC-20260915-01-8, AC-20260915-01-9) | The derivation now has two walkers. A second private copy is the exact class `lib/glob-match.js` and `lib/host-config.js` were each extracted to stop, and this repo has already paid that debt down twice. The cache moves from a module-level closure over one `root` to a per-root `Map` because a shared module can no longer assume its caller has exactly one root |
| D2 | `red-check.js`'s `walkAll` prunes through the shared helper: a directory whose repo-relative path plus `/` is in the ignored set is not descended, a file whose repo-relative path is in the set is not pushed. The existing `.git` name skip and the `isFile()` filter stay exactly as they are — this is additive (AC-20260915-01-1, AC-20260915-01-2, AC-20260915-01-4, AC-20260915-01-5) | Pruning during the walk, not filtering after it, is what keeps a whole ignored checkout from being descended at all. `scope-reconcile.js`'s four extra NAME skips (`node_modules`, `fixtures`, `__fixtures__`, `.git`) are deliberately NOT copied: a File Plan may legitimately name a test file under `tests/fixtures/`, and red-check must resolve it |
| D3 | The prune applies to WILDCARD expansion only. A tests row containing no `*` is added to the resolved set directly, never walked, and is never tested against the ignored set — it is still resolved, executed, colour-classified, and still yields `missing-test-file` when absent (AC-20260915-01-3) | An exact path in a File Plan is a claim the spec makes about one named file. Silently dropping it because git ignores that location would turn a plan defect into a green build — the precise failure this spec exists to remove, pointed the other way |
| D4 | A wildcard tests row that expands to ZERO files pushes exactly one entry onto the existing `warnings` channel, naming the row and the number of paths the ignored set pruned from the walk. Exit code, finding classes and the `--json` key set are all unchanged; a wildcard row expanding to one or more files pushes nothing (AC-20260915-01-6, AC-20260915-01-7) | Today that case is total silence, and the prune adds one more way to reach it. A warning is parity with red-check's existing "contributes nothing to the check" sanction (`carries zero AC-IDs — unclassified, never executed`), whereas a new hard finding would be a pre-emptive standing guard at recurrence count zero and would move the exit-code alphabet for every host on the fleet. The trigger is cause-agnostic — "expanded to zero", never "expanded to zero because of the prune" — because computing the unpruned expansion means re-walking the ignored checkouts this spec exists to stop walking, purely to word a diagnostic |
| D5 | Version bump: the next free minor of the `spec` plugin via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`, under the standing moving-target rule `[no-ac: version discipline is a review check, not a behavioural AC]` | § Gotchas, concurrent-session version race: a literal number locked here is a target, never a pin |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| `spec/scripts/lib/ignored-paths.js` | CREATE | scripts | D1: `getIgnoredPaths(root)`, the single derivation — top-level guard, NUL-split `ls-files` set, per-root `Map` cache, empty-set fallback; header carries the owner citation and the `Exit codes: n/a (library, not an entrypoint).` line |
| `spec/scripts/scope-reconcile.js` | MODIFY | scripts | D1: private `getIgnoredPaths`/`ignoredPathsCache` deleted, replaced by an import; `walkTestFiles`'s two membership checks unchanged; the header's ignored-path paragraph shortens to cite the library as the owner |
| `spec/scripts/red-check.js` | MODIFY | scripts | D2/D3/D4: `walkAll` prunes ignored dirs and files and counts what it pruned; the zero-expansion warning at the glob-row loop; header gains the prune rule, the literal-row exemption and the warning, with this spec as the owner citation |
| `tests/red-check/red-check.test.js` | MODIFY | tests | AC-20260915-01-1, AC-20260915-01-2, AC-20260915-01-3, AC-20260915-01-4, AC-20260915-01-5, AC-20260915-01-6, AC-20260915-01-7 |
| `tests/scope-reconcile-at-risk.test.js` | MODIFY | tests | AC-20260915-01-8 — the existing `AC-20260907-03-1` test is retagged in place, never weakened |
| `tests/scope-reconcile-probe.test.js` | MODIFY | tests | AC-20260915-01-9 — the existing `AC-20260907-03-4` test is retagged in place, never weakened |
| `spec/.claude-plugin/plugin.json` | MODIFY | doctrine | D5: semver bump + changelog paragraph in the last-3-versions form |

## Contracts

```js
// spec/scripts/lib/ignored-paths.js
// getIgnoredPaths(root) → Set<string>
//   '.claude/worktrees/'      a fully-ignored DIRECTORY arrives with a trailing slash
//   'tests/legacy.test.js'    an individually-ignored FILE arrives as a plain path
//   new Set()                 root is not a repository top level, or git failed — unfiltered
module.exports = { getIgnoredPaths }
```

`red-check.js --json` keeps its exact four top-level keys (`files`, `findings`, `warnings`,
`dispositions`). Only `files` shrinks (ignored paths leave it) and `warnings` may gain one entry
per empty wildcard row:

```
tests/nothing/**: File Plan tests row expanded to 0 files (1 ignored path(s) pruned from the repo walk)
```

Rendered by the existing human formatter as `WARN  <that text>`. No new finding class, no new
exit code, no change to `scope-reconcile.js --json` or `--probe-at-risk`.

## Behavior

**The shared derivation (D1).** `getIgnoredPaths(root)` runs `git -C <root> rev-parse
--show-prefix`; the set is derived only when that exits 0 printing an empty line — root IS the
top level of a repository or of a git worktree. It then NUL-splits `git -C <root> ls-files -o -i
--exclude-standard --directory -z`. Any other outcome (non-empty prefix, missing git, not a
repository, a failing `ls-files`) yields an empty set, and every caller's walk is byte-identical
to today's. Both git calls use explicit `stdio: ['ignore', 'pipe', 'pipe']`, so a handled failure
never leaks git's own stderr onto the caller's. Results cache per `root` string.

**red-check's walk (D2/D3/D4).** `walkAll` asks the helper once per run. A directory whose
repo-relative path plus `/` is in the set is not descended; a file whose repo-relative path is in
the set is not pushed; both cases increment a counter of pruned paths. The `.git` skip and the
`isFile()` filter run first and are untouched. Only wildcard rows consult this walk: a row with
no `*` still goes straight into the resolved set, so a literal row pointing inside an ignored
directory resolves, runs, and is colour-classified exactly as before. After a wildcard row's
matches are collected, a row that matched nothing pushes one warning naming the row and the
pruned-path counter. Nothing about expectation derivation, execution, findings or exit codes
changes.

**Why this reaches the pipeline's own builds.** The build and review stages run red-check with
`--root` pointing at a git worktree, and a worktree root satisfies the top-level guard
(Assumptions A2) — so the prune is active there, not only on in-place builds.

## Acceptance Criteria

- **AC-20260915-01-1**: WHEN `red-check.js --json` runs at the top level of a repository whose
  `.gitignore` contains the line `ignored/`, with identical passing test files at both
  `tests/real.test.js` (tracked) and `ignored/copy/tests/real.test.js` (untracked, ignored), and
  a File Plan tests row `` `**/*.test.js` ``, THE SYSTEM SHALL emit `files` whose paths are
  exactly `["tests/real.test.js"]` and SHALL NOT emit any path beginning `ignored/` → writes
  `tests/red-check/red-check.test.js`
- **AC-20260915-01-2**: WHEN the same run happens in a repository whose `.gitignore` names a
  single untracked FILE rather than a directory (line `tests/legacy.test.js`, with that file on
  disk beside `tests/real.test.js` and both matched by the row `` `tests/**` ``), THE SYSTEM
  SHALL emit `files` whose paths are exactly `["tests/real.test.js"]`, pinning that the prune is
  ignored-path shaped and never directory-name shaped → writes `tests/red-check/red-check.test.js`
- **AC-20260915-01-3**: WHEN a File Plan tests row is the exact path
  `` `ignored/copy/tests/real.test.js` `` (no `*`) in that same ignored-directory repository, THE
  SYSTEM SHALL CONTINUE TO resolve, execute and colour-classify that file — `files` contains the
  entry `ignored/copy/tests/real.test.js` — and SHALL CONTINUE TO report
  `class: "missing-test-file"` for an exact row naming `ignored/copy/tests/absent.test.js` → writes
  `tests/red-check/red-check.test.js`
- **AC-20260915-01-4**: WHEN `red-check.js` runs with `--root` pointing at a SUBDIRECTORY of a
  repository (`<repo>/sub`, so `git rev-parse --show-prefix` prints `sub/`) holding
  `tests/real.test.js` and an ignored `ignored/copy/tests/real.test.js`, THE SYSTEM SHALL fall
  back to the unfiltered walk — `files` contains BOTH `tests/real.test.js` and
  `ignored/copy/tests/real.test.js` — and SHALL exit without a git error on stderr: refusing to
  filter is the safe outcome, silently pruning against mismatched prefixes is not → writes
  `tests/red-check/red-check.test.js`
- **AC-20260915-01-5**: WHEN `red-check.js --json` runs with `--root` pointing at a git worktree
  created by `git worktree add`, whose tree holds `tests/real.test.js` and an ignored
  `ignored/copy/tests/real.test.js` under a `.gitignore` line `ignored/`, and a row
  `` `**/*.test.js` ``, THE SYSTEM SHALL emit `files` whose paths are exactly
  `["tests/real.test.js"]` — the prune is active in the worktrees the build and review stages
  actually run in → writes `tests/red-check/red-check.test.js`
- **AC-20260915-01-6**: WHEN a File Plan tests row is the wildcard `` `tests/nothing/**` `` that
  matches no file on disk, THE SYSTEM SHALL emit exactly one `warnings` entry whose text begins
  `tests/nothing/**:` and contains `expanded to 0 files`, SHALL emit no `findings` entry for that
  row, and SHALL exit 0 → writes `tests/red-check/red-check.test.js`
- **AC-20260915-01-7**: WHEN a File Plan carries both the empty wildcard row
  `` `tests/nothing/**` `` and a wildcard row `` `tests/**` `` that matches
  `tests/real.test.js`, THE SYSTEM SHALL emit exactly one `expanded to 0 files` warning in the
  whole run and SHALL NOT emit one naming `tests/**` — a row that resolved files is never warned
  about → writes `tests/red-check/red-check.test.js`
- **AC-20260915-01-8**: WHEN `scope-reconcile.js --json` runs at the top level of a repository
  whose `.gitignore` contains `.claude/worktrees/`, with an at-risk-referencing test file at both
  `tests/thing.test.js` (tracked) and `.claude/worktrees/wt/tests/thing.test.js` (ignored), THE
  SYSTEM SHALL CONTINUE TO emit `atRisk` containing exactly one entry whose `file` is
  `tests/thing.test.js` and no entry beginning `.claude/worktrees/` — the extraction moves the
  derivation, never its behaviour → reuses tests/scope-reconcile-at-risk.test.js :: AC-20260907-03-1
- **AC-20260915-01-9**: WHEN `scope-reconcile.js --probe-at-risk <sample-list> --root <repo>`
  runs at the top level of a repository holding `tests/thing.test.js` (tracked) and
  `.claude/worktrees/wt/tests/thing.test.js` (ignored), THE SYSTEM SHALL CONTINUE TO report
  `"testFiles": 1`, not `2` → reuses tests/scope-reconcile-probe.test.js :: AC-20260907-03-4

## Assumptions (escalation triggers)

- **A1**: `git ls-files -o -i --exclude-standard --directory -z` and `git rev-parse
  --show-prefix` behave as measured. *Executed 2026-09-15* in a throwaway repo: at the top level
  `--show-prefix` → `status=0` with empty output and `ls-files` → `ignored/` (a fully-ignored
  directory collapses to one trailing-slash entry); with `.gitignore` also naming
  `tests/legacy.test.js`, `ls-files` → `ignored/` plus `tests/legacy.test.js` (an individually
  ignored file arrives as a plain path); with `-C tests`, `--show-prefix` → `tests/` (the guard
  refuses). Against this repo, `ls-files -o -i --exclude-standard --directory` prints
  `.claude/spec-session.json`, `.claude/worktrees/`, `.playwright-mcp/` and the `*.build/` and
  `*.review/` sidecars. — **if false:** fall back to a post-walk `git check-ignore --stdin -z`
  filter over the collected candidate list (one spawn, correct under any `--root`, at the cost of
  descending the ignored trees first).
- **A2**: a git worktree root satisfies the top-level guard, so the prune is active in the
  worktrees the build and review stages run red-check in. *Executed 2026-09-15*: `git worktree
  add ../wt`, then `git -C ../wt rev-parse --show-prefix` → `status=0` with empty output,
  `rev-parse --show-toplevel` → the worktree's own path, and with an ignored directory present on
  disk `git -C ../wt ls-files -o -i --exclude-standard --directory -z` → `ignored/`. — **if
  false:** the prune degrades to in-place builds only; that is strictly today's behaviour in
  worktrees, so it is a narrowing of the win, never a regression — record it and keep the change.
- **A3**: today's `red-check.js` genuinely resolves test files inside a git-ignored copy, so
  AC-20260915-01-1 is red against the pre-image. *Executed 2026-09-15* against
  `spec/scripts/red-check.js` at HEAD: a synthetic host with `.gitignore` = `ignored/`, passing
  test files at `tests/real.test.js` and `ignored/copy/tests/real.test.js`, and a tests row
  `` `**/*.test.js` `` → `--json` `files` listed BOTH paths, exit 0. — **if false:** STOP, ask the
  user — the premise of the spec is gone.
- **A4**: no consumer outside `scope-reconcile.js` reads the private `getIgnoredPaths` /
  `ignoredPathsCache`, and no test greps either name. Derived 2026-09-15 by grepping both
  identifiers across every `.js` and `.md` in the repo: eight hits, all inside
  `spec/scripts/scope-reconcile.js`. — **if false:** the extra consumer imports the library in
  the same batch; a test asserting on the private name is retagged, never weakened.
- **A5**: no spec currently in flight carries a `**`-prefixed tests row, so the prune changes no
  live build's resolved set — today the descent into the four ignored checkouts costs wall clock
  only. Derived 2026-09-15 by grepping every File Plan tests row across `specs/`. — **if false:**
  that spec's expansion shrinks when this lands; read the removed paths before assuming a
  regression — the shrink is the fix working.
- **A6**: `ignored-paths.js` is a legal filename under node's default test discovery
  (`**/*.test.js`, `**/*-test.js`, `**/*_test.js`, `**/test-*.js`, `**/test.js`, `**/test/**`) —
  it matches none, so the whole-suite post-gate will not execute the library as a test file.
  Derived at lock from the pattern set in § Gotchas. — **if false:** rename before the build
  starts; a renamed library costs a sweep of every reference.

## Rationale

Three things were decided against here, and each is the more obvious move.

The first is doing nothing structural — pruning inside `red-check.js` with its own private copy
of the git call. That is how the repo got `lib/glob-match.js` and `lib/host-config.js`: a second
private reader appears, the two drift on their error policy, and the extraction gets paid for
later under review pressure. The derivation has two walkers the moment this lands, so it gets one
home now.

The second is copying `scope-reconcile.js`'s four directory-NAME skips into red-check along with
the prune. They look like the same rule and are not. scope-reconcile skips `fixtures` because a
fixture is never an at-risk candidate; red-check resolves whatever the File Plan names, and a
spec may legitimately put a test under `tests/fixtures/`. Only the git-ignored prune crosses
over.

The third is making an empty wildcard row a hard finding. The repo's instinct runs that way — it
forces a review leg red when a declared test-count format matches nothing, on the reasoning that
nothing observed is the same broken promise as an observed zero. It loses here on two counts.
red-check's finding classes are all verdicts on a file it resolved, each carrying a `path`; a row
that resolved nothing has no colour to report, and red-check already warns rather than fails for
exactly this shape (`carries zero AC-IDs — unclassified, never executed`). And a new exit-1 class
is a standing guard at recurrence zero — no spec in the repo uses a `**` row today — with blast
radius across every host running the plugin. The warning is the recurrence counter: if an empty
wildcard ever bites for real, promoting it is a one-line change with a paper trail behind it.

The fail-safe guard (D1, inherited) matters more than it looks. `ls-files` prints paths relative
to the repository root, so a `--root` below the top level would compare mismatched prefixes and
could prune a real test directory — silently shrinking what red-check checks is the failure this
spec exists to stop, pointed backwards. Refusing to filter restores today's behaviour, which is
merely too wide.

Tier is `critical` because `scope-reconcile.js` is a named critical-tier trigger in this repo's
pipeline rules (the sole derivation behind review's reconcile and at-risk legs). The edit to it
is a pure extraction with its walk body untouched, which is why AC-20260915-01-8 and
AC-20260915-01-9 are `reuses` pins on its existing green tests rather than new assertions: the
proof obligation is that nothing moved.

What to watch during execution: `tests/red-check/red-check.test.js` already holds a fixture whose
row is `tests/mocks/**` and whose subtree carries a `node_modules` directory symlink. That row
matches real files, so it never trips the new warning — but if the fixture's tree ever becomes
fully ignored, that test's expectation changes, and the change would be the prune working rather
than a regression.

**Collision closure (run at lock, 2026-09-15, `--literal getIgnoredPaths --literal
ignoredPathsCache`).** Ten literals hits, all waived, none widening the File Plan. Both symbols
resolve to `spec/scripts/scope-reconcile.js`, already a File Plan row; the other eight are the
same two lines inside the four git-ignored repository checkouts under `.claude/worktrees/` —
which is this spec's own subject arriving as its own evidence: `collision-closure.js` runs the
third un-pruned repo walk in the plugin, and it is queued as the follow-up consumer of the new
library rather than folded in here. The suite is behavioural throughout, so no test spells either
symbol (Assumptions A4).

The paths leg's `executes` tier lists the suites that spawn the two changed scripts. Read at
lock: exactly one fixture in the whole suite uses a wildcard tests row
(`tests/red-check/red-check.test.js`'s `tests/mocks/**`), it matches two real files under a
`tmpdir()` host whose `.gitignore` names only `.claude/worktrees/` — a path it never populates —
so it neither loses a match to the prune nor trips the new zero-expansion warning. Every warning
assertion in those suites is a `.some(...)` over the array or a filter scoped to its own warning
family, never a length equality, so an added warning class cannot redden one. No fixture repair
is planned; the build-time whole-suite check adjudicates if that reading is wrong.

## Canonical Delta

Applied at close.

- `docs/canonical/build-integrity.md` — the § Mechanized red-check paragraph gains one sentence:
  a wildcard tests row is expanded by a tree walk that prunes git-ignored paths through the
  shared derivation, an exact-path row is resolved directly and is never pruned, and a wildcard
  row that expands to zero files raises a warning rather than a finding.
- `docs/canonical/pipeline.md` — the at-risk paragraph's "git-ignored paths pruned" clause names
  the shared library as the owner instead of implying `scope-reconcile.js` derives it privately.
- `docs/canonical/scripts.md` — a new bullet in the sole-derivation list:
  `spec/scripts/lib/ignored-paths.js` is the one derivation of a root's git-ignored path set,
  with its top-level guard and its empty-set fallback, and its two consumers are
  `scope-reconcile.js`'s at-risk walk and `red-check.js`'s wildcard expansion.
