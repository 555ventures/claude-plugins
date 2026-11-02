---
date: 2026-11-01
status: hardened
tier: critical
area: review-legs
breaking: false
depends_on: [specs/20261101/05-the-gate-that-ran-the-suite-is-the-suite.md]
brief: n/a
open_markers: 0
spiked: 2026-11-01
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
| D4 | After a reused-mode legs run, every leg in `REUSABLE` that was red in the prior manifest and green in the new one over the same tree is recorded `marks.flaky[String(n)] = [<legs, manifest order>]` and printed `⚠ flaky: <leg> was red at legs <curN> and green over the same tree` once per leg, to stdout after the legs output; legs outside `REUSABLE` (the consumers of a changed skips file, `ci`, `reconcile`, `tests`) are never named flaky, since their red→green has a cause. The review proceeds normally. (AC-20261101-06-7) | Google's and Buildkite's definition of flaky — pass and fail on one commit — made visible where the plugin can see it, without a verdict or ledger change. |
| D5 | Header comments: `review-legs.js` names `--reuse-from`, `REUSABLE`, and the `reusedFrom` key, and its "there is no flag that skips a leg" sentence becomes "no flag skips a leg; `--reuse-from` copies a prior green row as this run's evidence, provenance-stamped"; the driver header names `legsTree` and `flaky`. `[no-ac: script header prose; the behaviour is pinned by AC-20261101-06-2 and AC-20261101-06-6]` | The header is the script's contract. |
| D6 | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"`. `[no-ac: node scripts/plugin-bump.js --check in the gate is the oracle]` | Behaviour change under `spec/`. |
| D7 | The driver test file builds its own two hosts rather than importing `makeSkipsHost`/`redGateHost` (neither is exported, neither counts runs): a skips host whose tracked `gate.sh` appends one line to a `counter` file and prints `ℹ skipped 1`, and a red-gate host whose tracked `gate.sh` exits 1 while a `flake` file holds `red` and 0 otherwise. Both `counter` and `flake` live OUTSIDE the fixture repo (a `tmpdir()` path baked into the script as an absolute path, the pattern `review-legs-gate-reuse.test.js` already uses for its counter), so flipping `flake` or growing `counter` never moves `snapshotTree()`; the "tree changed" case edits a tracked file. `[no-ac: test-fixture mechanics; exercised by every AC the file writes]` | A flip file inside the repo would have to sit in the sidecar or a gitignored path the fixture host does not carry; outside the repo it is invisible to git by construction (spike S1). |

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

Fixture (review-legs): a file-local copy of `review-legs-gate-reuse.test.js`'s `makeHost` (counter outside the repo; the test files do not export it). Run 1
writes `manifest-a.jsonl` normally. Run 2 with `--reuse-from manifest-a.jsonl` → counter grows by
the at-risk/`tests`-leg spawns only (0 for the stub when at-risk has no files), gate/suite/smoke/
patterns rows carry `reusedFrom`, `reconcile` and `ac-matrix` rows carry none. A prior manifest
whose gate row is `exit 1` → gate spawns (counter +1), suite reused only if its own prior row was
green. `--fix-delta` with a `scope: "full"` prior → nothing reused (scope mismatch).

Fixture (driver, D7): two hosts built in the test file, modelled on `review-driver.test.js`'s
`makeSkipsHost` and `stopped-repair-round.test.js`'s `redGateHost`, each with a tracked `gate.sh`
whose `counter` (and, for the red host, `flake`) file lives outside the repo. Skips host: gate
`bash gate.sh` = `echo x >> <counter>; node --test tests; echo 'ℹ skipped 1'`, `testCommand`
`node --test`. After the bare run (counter 1, state SKIPS) `--mark skips-extracted --file <f>`
with no tree change → stdout carries the ♻️ line naming `gate`, `manifest-2.jsonl` holds a gate
row with `reusedFrom: "manifest-1.jsonl"`, and the counter still shows 1. Edit a tracked file
first → the "tree changed" line and a counter of 2. Red host: `gate.sh` = `echo x >> <counter>;
[ "$(cat <flake>)" = red ] && exit 1; exit 0`; the bare run lands STOPPED (counter 1); write
`green` into `flake` (outside the repo, so the snapshot is unchanged) → `--mark repair-round`
prints ♻️ for the prior green legs, re-runs the gate (counter 2), prints `⚠ flaky: gate …`,
records `marks.flaky["1"] = ["gate"]`, and lands REVIEWER.

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

- A1: `snapshotTree()` is callable from both mark handlers before `runLegsIteration` and excludes the sidecar, so a driver-written file never changes the hash (its own header says so; `treeSnapshot[n]` already relies on it). **Spike S1 (executed 2026-11-01, git-adjudicated):** scratch-index `read-tree HEAD` + `add -A -- . ':(exclude)specs/x.review'` + `write-tree` in a throwaway repo printed `86d52bd4…` before and after writing `specs/x.review/legs-1/prior-manifest.jsonl` and `specs/x.review/manifest-2.jsonl`, the same after writing a file outside the repo, and `aac918d8…` after editing tracked `a.txt` — sidecar and outside writes never move the snapshot, a tracked edit does — **if false:** D3 compares `git rev-parse HEAD^{tree}` plus `git status --porcelain` emptiness instead; same decision surface.
- A2: `verdict.js` reads `observed` only as a non-null object for the five REUSABLE legs (verdict.js:491) and derives `testsSkipped` from the gate row's `skips`/`todos` fields and smoke from `result`, which the reused row preserves. **Spike S2 (executed 2026-11-01):** `node spec/scripts/verdict.js --manifest <m> --workflow <CLEAN return>` over an eleven-row manifest whose gate, suite, at-risk, patterns and smoke rows carry `observed.reusedFrom:"manifest-1.jsonl"` printed `CLEAN` exit 0; the same manifest with the reused gate row at `exit 1` printed `GATE_RED` exit 1 — the key is inert to the derivation and a reused red row still reddens — **if false:** `reusedFrom` moves to a top-level key placed before `scope`, and the five `deepStrictEqual` row pins listed in 05's A1 enter the File Plan.
- A3: Existing fixtures that exercise `skips-extracted` or `repair-round` change the tree between runs or do not count gate runs (read at lock: `review-driver.test.js` AC-20260820-07-10 asserts only that a gate row exists; `stopped-repair-round.test.js` flips green via `makeGreen`, a tracked commit, so its re-run takes the "tree changed" path and is byte-identical to today) — **if false:** the fixture enters the File Plan and its pin is retagged with this spec's AC-ID.
- A4: `--skips <file>` is consumed only by the `ac-matrix.js` invocation (read at lock: the one `skips` use in review-legs.js is the wave-3 command line) so a reused gate row loses nothing the skips path needs — **if false:** the dependent leg is named in D2's always-run list.
- A5: `legs-<n>/` (`outDirFor(n)`) exists before the repair-round re-run — review-legs.js `mkdirSync(outDir, {recursive: true})` created it on the stopped run, and `listManifestNumbers()` matches only top-level `manifest-<n>.jsonl`, so a file inside `legs-<n>/` can never read as a manifest number (read at lock) — **if false:** the copy goes to `<sidecar>/manifest-<n>.prior.jsonl` and `listManifestNumbers()` is checked to ignore the suffix.
- A6: `snapshotTree()` before every legs run costs one scratch-index `git add -A` (seconds on the largest host measured, already paid once per iteration at reviewer-returned) — **if false** (a host where it exceeds a leg's own runtime): D1 records it only on the paths D3 reads (first run and the two marks), never on a fix-delta run.

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

Collision closure (D5 narrows review-legs.js's "there is no flag that skips a leg" sentence): both literals-leg hits land in `spec/scripts/review-legs.js`, already a File Plan row; no test pins the sentence, so nothing is waived. The `executes` hits are tests that spawn review-legs.js or the driver without `--reuse-from` and without the two marks over an unchanged tree (A3), which this spec leaves byte-identical.

## Canonical Delta

docs/canonical/review-legs.md — new section after § The suite leg: "## A rerun over an unchanged
tree copies its green rows\n\nThe driver snapshots the tree (`snapshotTree`, sidecar excluded)
before every legs run. When `--mark skips-extracted` or `--mark repair-round` starts a new legs
run over the same tree, review-legs receives `--reuse-from <prior manifest>` and copies the prior
green rows for `gate`, `suite`, `at-risk`, `patterns` and `smoke` with `observed.reusedFrom`
naming the manifest; red rows and every other leg run for real. A leg red before and green over
the same tree is printed and recorded as flaky. A changed tree re-runs everything.
(specs/20261101/06-a-rerun-re-runs-only-what-went-red.md)"
