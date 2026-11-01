---
date: 2026-11-01
status: draft
tier: critical
area: review-legs
breaking: false
depends_on: [specs/20261101/05-the-gate-that-ran-the-suite-is-the-suite.md]
brief: n/a
---

# A rerun re-runs only what went red

## Goal

Two review-driver marks start a fresh legs iteration: `--mark skips-extracted` (the gate reported
skips, the session extracted their names) and `--mark repair-round` (a blocking leg went red and
the owner asked for one more try). Both re-run every leg from zero, with no look at whether the
tree changed. On the skips path the only consumer of the new input is `ac-matrix`; on the repair
path the owner who changed nothing is asserting the red was flaky, which is exactly when a full
re-run of the green legs proves nothing new. Each costs a full suite run, a smoke boot and an
at-risk run — 15 to 40 minutes on the hosts measured this week, for evidence the manifest already
holds. Done means a legs re-run over an unchanged tree copies the prior iteration's green rows for
the expensive legs and spawns only the red or input-dependent ones, a changed tree re-runs
everything as today, and a leg that went red then green over the same tree is named as flaky in
the driver's output and sidecar.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec-review-driver.js` `runLegs(n, opts)` records `marks.legsTree[String(n)] = snapshotTree()` immediately before invoking review-legs, saved with the other legs marks. A sidecar with no `legsTree[n]` (older run) is treated as "tree unknown" — never reused. (AC-20261101-06-1) | `snapshotTree()` already exists (scratch-index `write-tree`, sidecar excluded); the only new fact is recording it per legs run. |
| D2 | `review-legs.js` gains `--reuse-from <manifest path>`. For each leg in `REUSABLE = ['gate','suite','at-risk','patterns','smoke']` whose row in that manifest is green (`exit 0`; smoke also `4`) and whose `scope` equals this run's scope, the row is appended with `observed` extended by `"reusedFrom":"<basename of the manifest>"` and no child is spawned; every other leg runs exactly as today, including `reconcile`, `ci`, `tests`, `ac-matrix`, `skip-reconcile`, `promise-sweep`, and every red or missing REUSABLE row. A reused `gate` row still feeds `ac-matrix`'s skips count and `--skips` exactly as a spawned one. A `--reuse-from` path that cannot be read or parsed exits 2 naming the path. `timings.json` records `0` for a reused leg. (AC-20261101-06-2, AC-20261101-06-3, AC-20261101-06-4, AC-20261101-06-5) | The expensive legs are the ones that run host tests or boot the app; `reconcile` is cheap and its JSON feeds wave 2 in-process, `ci` is remote state, and the three wave-3 legs are the consumers of a changed skips file. |
| D3 | `handleSkipsExtracted` and `handleRepairRound` compute `snapshotTree()`; when it equals `marks.legsTree[curN]` the legs run receives `--reuse-from <prior manifest>` (`manifest-<curN>.jsonl` for skips; for repair-round the stopped manifest is first copied to `legs-<n>/prior-manifest.jsonl`, since the re-run reuses the number) and the driver prints `♻️ tree unchanged since legs <curN> — reusing green rows: <legs, comma-joined>`; when the trees differ it prints `tree changed since legs <curN> — every leg re-runs` and passes no flag. Both lines go to stdout before the legs output. (AC-20261101-06-6, AC-20261101-06-7, AC-20261101-06-8) | Reuse is decided by the one party that knows both trees; the printed line is the owner's veto surface. |
| D4 | After a reused-mode legs run, every leg that was red in the prior manifest and green in the new one over the same tree is recorded `marks.flaky[String(n)] = [<legs>]` and printed `⚠ flaky: <leg> was red at legs <curN> and green over the same tree` once per leg; the review proceeds normally. (AC-20261101-06-7) | Google's and Buildkite's definition of flaky — pass and fail on one commit — made visible where the plugin can see it, without a verdict or ledger change. |
| D5 | Header comments: `review-legs.js` names `--reuse-from`, `REUSABLE`, and the `reusedFrom` key, and its "there is no flag that skips a leg" sentence becomes "no flag skips a leg; `--reuse-from` copies a prior green row as this run's evidence, provenance-stamped"; the driver header names `legsTree` and `flaky`. `[no-ac: script header prose; the behaviour is pinned by AC-20261101-06-2 and AC-20261101-06-6]` | The header is the script's contract. |
| D6 | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"`. `[no-ac: node scripts/plugin-bump.js --check in the gate is the oracle]` | Behaviour change under `spec/`. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/review-legs.js | MODIFY | scripts | `--reuse-from`, `REUSABLE`, `reusedFrom`, header (D2, D5) |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | `legsTree`, reuse decision in both mark handlers, `flaky`, header (D1, D3, D4, D5) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` (D6) |
| tests/review/review-legs-reuse-from.test.js | CREATE | tests | AC-20261101-06-2, AC-20261101-06-3, AC-20261101-06-4, AC-20261101-06-5 |
| tests/review/review-driver-rerun-reuse.test.js | CREATE | tests | AC-20261101-06-1, AC-20261101-06-6, AC-20261101-06-7, AC-20261101-06-8 |

## Contracts

`review-legs.js` usage (D2), additive:

```
review-legs.js --root <dir> --spec <path> --base <ref> --manifest <path> [--skips <file>] [--fix-delta] [--out-dir <dir>] [--reuse-from <manifest>]
```

Reused row shape (D2): the prior row verbatim with one key added to `observed`:

```
{"leg":"gate","exit":0,"observed":{"skips":2,"todos":0,"testsExecuted":1251,"reusedFrom":"manifest-1.jsonl"},"scope":"full"}
{"leg":"smoke","exit":4,"observed":{"result":"inert","reusedFrom":"manifest-1.jsonl"},"scope":"full"}
```

Sidecar marks (D1, D4), additive:

```
"legsTree": { "1": "<40-hex tree sha>", "2": "<40-hex>" }
"flaky":    { "2": ["gate"] }
```

Driver stdout lines (D3, D4), exact prefixes:

```
♻️ tree unchanged since legs 1 — reusing green rows: gate, suite, at-risk, patterns, smoke
tree changed since legs 1 — every leg re-runs
⚠ flaky: suite was red at legs 1 and green over the same tree
```

## Behavior

Fixture (review-legs): the gate-reuse fixture from specs/20261101/05 with a counter stub. Run 1
writes `manifest-a.jsonl` normally. Run 2 with `--reuse-from manifest-a.jsonl` → counter grows by
the at-risk/`tests`-leg spawns only (0 for the stub when at-risk has no files), gate/suite/smoke/
patterns rows carry `reusedFrom`, `reconcile` and `ac-matrix` rows carry none. A prior manifest
whose gate row is `exit 1` → gate spawns (counter +1), suite reused only if its own prior row was
green. `--fix-delta` with a `scope: "full"` prior → nothing reused (scope mismatch).

Fixture (driver): `review-driver.test.js`'s `makeSkipsHost` (gate reports skips > 0). After
`--mark skips-extracted --file <f>` with no tree change → stdout carries the ♻️ line naming
`gate, suite, smoke`, `manifest-2.jsonl` holds a gate row with `reusedFrom: "manifest-1.jsonl"`,
and the gate stub's counter shows one run total. Touch a tracked file first → the "tree changed"
line and a counter of two. `stopped-repair-round.test.js`'s `redGateHost` with a gate that reads
`<host>/flake` and exits 1 while it holds `red`, 0 otherwise: write `green` into an UNTRACKED,
gitignored path so the snapshot tree is unchanged → `--mark repair-round` prints ♻️ for the green
legs, re-runs the gate, and prints `⚠ flaky: gate …`; `marks.flaky["1"]` equals `["gate"]`.
`[NEEDS CLARIFICATION: the repair-round flaky fixture needs the flip file outside the snapshot —
confirm at lock that `.claude/<spec>.review/` (the sidecar, already excluded from `snapshotTree`)
is the admissible home for it, or name another gitignored path the fixture host carries]`

## Acceptance Criteria

- **AC-20261101-06-1**: WHEN any legs iteration `n` runs THE SYSTEM SHALL record a 40-hex `legsTree[String(n)]` in the sidecar before review-legs is invoked (e.g. after a first bare invocation `marks.legsTree["1"]` matches `/^[0-9a-f]{40}$/` and equals `git write-tree` over the same tree) → writes tests/review/review-driver-rerun-reuse.test.js
- **AC-20261101-06-2**: WHEN review-legs runs with `--reuse-from <m>` whose gate, suite, at-risk, patterns and smoke rows are green and whose `scope` matches THE SYSTEM SHALL append those five rows with `observed.reusedFrom` equal to `path.basename(m)` (e.g. `"manifest-a.jsonl"`), spawn neither the gate nor the bare testCommand (counter unchanged), and `verdict.js --workflow <CLEAN return>` over the new manifest SHALL print `CLEAN` → writes tests/review/review-legs-reuse-from.test.js
- **AC-20261101-06-3**: WHEN `--reuse-from <m>` names a manifest whose gate row is `exit 1` and suite row `exit 0` THE SYSTEM SHALL spawn the gate (counter +1), append a gate row with no `reusedFrom` key, and append the suite row with `reusedFrom` → writes tests/review/review-legs-reuse-from.test.js
- **AC-20261101-06-4**: WHEN `--reuse-from <m>` is given with `--fix-delta` and `m`'s rows carry `scope: "full"` THE SYSTEM SHALL reuse nothing (no row carries `reusedFrom`) and run every leg as a plain `--fix-delta` run does → writes tests/review/review-legs-reuse-from.test.js
- **AC-20261101-06-5**: WHEN `--reuse-from` names a path that does not exist THE SYSTEM SHALL exit 2 with stderr `review-legs.js: --reuse-from <path> cannot be read` and append no manifest row → writes tests/review/review-legs-reuse-from.test.js
- **AC-20261101-06-6**: WHEN `--mark skips-extracted --file <f>` runs and `snapshotTree()` equals `marks.legsTree[curN]` THE SYSTEM SHALL print one stdout line starting `♻️ tree unchanged since legs 1 — reusing green rows: ` naming `gate`, run review-legs with `--reuse-from <sidecar>/manifest-1.jsonl`, and `manifest-2.jsonl`'s gate row SHALL carry `reusedFrom: "manifest-1.jsonl"` while the gate stub's counter shows exactly 1 run in total → writes tests/review/review-driver-rerun-reuse.test.js
- **AC-20261101-06-7**: WHEN `--mark repair-round` runs at STOPPED, the tree is unchanged since the stopped legs run, and the red gate now exits 0 THE SYSTEM SHALL print the ♻️ line, re-run the gate (counter +1), print `⚠ flaky: gate was red at legs 1 and green over the same tree`, record `marks.flaky["1"]` `["gate"]`, and land state `REVIEWER` → writes tests/review/review-driver-rerun-reuse.test.js
- **AC-20261101-06-8**: WHEN `--mark skips-extracted` runs after a tracked file changed since legs 1 THE SYSTEM SHALL print `tree changed since legs 1 — every leg re-runs`, pass no `--reuse-from`, and `manifest-2.jsonl`'s gate row SHALL carry no `reusedFrom` key (counter 2) → writes tests/review/review-driver-rerun-reuse.test.js
- **AC-20261101-06-9**: WHEN a red gate leg is repaired by changing a tracked file and `--mark repair-round` runs THE SYSTEM SHALL CONTINUE TO re-run the gate at the same iteration number and exit 0 into `REVIEWER` → reuses tests/review/stopped-repair-round.test.js :: AC-20261029-07-5: a red gate leg prints STOPPED
- **AC-20261101-06-10**: WHEN `--mark skips-extracted --file <f>` is accepted THE SYSTEM SHALL CONTINUE TO write a fresh `manifest-2.jsonl` carrying a gate row → reuses tests/review/review-driver.test.js :: AC-20260820-07-10:

## Assumptions (escalation triggers)

- A1: `snapshotTree()` is callable from both mark handlers before `runLegsIteration` and excludes the sidecar, so a driver-written file never changes the hash (its own header says so; `treeSnapshot[n]` already relies on it) — **if false:** D3 compares `git rev-parse HEAD^{tree}` plus `git status --porcelain` emptiness instead; same decision surface.
- A2: `verdict.js` reads `observed` only as a non-null object for the five REUSABLE legs and derives `testsSkipped` from the gate row's `skips` field, which the reused row preserves (specs/20261101/05 A2 re-checked here for `at-risk`, `patterns`, `smoke`) — **if false:** `reusedFrom` moves to a top-level key placed before `scope`, and the five `deepStrictEqual` row pins listed in 05's A1 enter the File Plan.
- A3: Existing fixtures that exercise `skips-extracted` or `repair-round` change the tree between runs or do not assert the gate ran twice (`review-driver.test.js` AC-20260820-07-10 asserts only that a gate row exists; `stopped-repair-round.test.js` flips green via `makeGreen`, a tracked edit) — **if false:** the fixture enters the File Plan and its pin is retagged with this spec's AC-ID.
- A4: `--skips <file>` is consumed only by `ac-matrix.js` (review-legs.js:476) so a reused gate row loses nothing the skips path needs — **if false:** `skip-reconcile` is added to the always-run set (it already is) and the dependent leg is named in D2's exclusion list.
- A5: `legs-<n>/` (`outDirFor(n)`) exists or can be created before review-legs runs in the repair-round path, so `prior-manifest.jsonl` has a home — **if false:** the copy goes to `<sidecar>/manifest-<n>.prior.jsonl` and `listManifestNumbers()` is checked to ignore the suffix.

## Rationale

Both marks re-run every leg because, when they were written, "fresh manifest" was the simplest
way to guarantee the new evidence is not mixed with the old. The guarantee still holds here: the
new manifest is a new file, every row in it is either freshly produced or copied with a
provenance key naming where it came from, and the copy is admitted only when the tree the prior
run judged is byte-identical to the tree this run judges. That is Bazel's test-result cache
(`(cached) PASSED`, keyed on inputs, failures never cached) and Turborepo's input-hash replay,
applied to legs instead of targets. Failures are never reused: a red row always re-runs.

The REUSABLE set is the cost set. `gate` and `suite` run host tests, `at-risk` runs them over a
file list, `smoke` boots the app, `patterns` greps the tree — the five legs that take minutes.
`reconcile` is a git diff whose JSON feeds the at-risk and patterns waves in-process, `ci` is
remote state that may have moved without the tree moving, `tests` is a count, and the three
wave-3 legs are precisely what a new skips file changes. Keeping those seven always-on keeps the
reuse rule explainable in one sentence.

D4 is the flaky signal the prior-art search found everywhere (Google 2016: a test that both
passes and fails on the same code; Buildkite and CircleCI: same commit) and the plugin had
nowhere. It is a printed line and a sidecar mark, deliberately not a ledger field: the ledger row
shape is `verdict.js`'s and this spec does not touch it. Rejected: an automatic retry of a red
blocking leg inside review-legs (the owner's repair-round IS the one retry, and review-legs'
header forbids retry/poll by design); reusing across different iterations' scopes (a fix-delta
run judges a different question); reusing `ci`.

## Canonical Delta

docs/canonical/review-legs.md — new section after § The suite leg: "## A rerun over an unchanged
tree copies its green rows\n\nThe driver snapshots the tree (`snapshotTree`, sidecar excluded)
before every legs run. When `--mark skips-extracted` or `--mark repair-round` starts a new legs
run over the same tree, review-legs receives `--reuse-from <prior manifest>` and copies the prior
green rows for `gate`, `suite`, `at-risk`, `patterns` and `smoke` with `observed.reusedFrom`
naming the manifest; red rows and every other leg run for real. A leg red before and green over
the same tree is printed and recorded as flaky. A changed tree re-runs everything.
(specs/20261101/06-a-rerun-re-runs-only-what-went-red.md)"
