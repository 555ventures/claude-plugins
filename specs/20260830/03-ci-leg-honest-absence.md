---
date: 2026-08-30
status: implementing
diff_base: 1c0de02b6da33e35a6efe117157a1b0f8bc8526c
tier: critical
area: review-legs
design: false
breaking: false
depends_on: ["specs/20260830/02-close-gate-rerun.md"]
depended_on_by: []
# brief: n/a — ad-hoc hardening from a salon-os host escape report (2026-08-30)
# tier rationale: review-legs.js and verdict-feeding evidence rows are named critical-tier
# surfaces in this host's pipeline rules § Risk Tiers.
# depends_on is File-Plan ordering only (both specs edit review-legs.js and bump
# plugin.json), not a logical dependency.
open_markers: 0
---

# CI leg honest absence — an unpushed HEAD is not "no CI"

## Goal

The review and release `ci` legs query GitHub per-SHA; a commit never pushed returns an
empty run list, which today maps to `unavailable: "no-adapter"` — indistinguishable from a
repo with no CI at all — and the leg reports green while the branch on origin may have been
red for days (salon-os 2026-08-30: origin red four days, local main 23 commits ahead, leg
CLEAN). Done means: that state is labeled honestly (`sha-unseen`, carrying the origin
branch's actual latest conclusion) and surfaced as a warning in the review/release report —
while never blocking the verdict (JJ ruling 2026-08-30: local work may be exactly what
fixes the red; blocking can be layered on later).

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The fallback lives in `ci-query.js` `--commit` mode, not in the leg runners: when the run list is empty AND `git branch -r --contains <sha>` (cwd `--root`) prints nothing, it runs its own existing `--branch` query for `git rev-parse --abbrev-ref HEAD` and, if that finds a run, emits `{available:false, transient:false, shaUnseen:true, branch, branchRun:{status,conclusion,url,runAt}}` (AC-20260830-03-1) | ci-query is by charter the ONE normalized gh home (its 2026-08-05 header: two wrappers was a flagged drift seam); placing it here fixes review and release with one change |
| D2 | Every other structural-absence path is byte-identical to today: gh missing, no remote, `forge:"none"`, sha contained in a remote ref with empty runs, unpushed sha whose branch query ALSO finds nothing — all keep today's exact output (AC-20260830-03-3) | Minimal delta: `sha-unseen` exists only when there is real branch evidence to report; every existing pin and `--json` consumer sees zero change on today's paths |
| D3 | Any failure of the fallback itself (detached HEAD — `rev-parse` prints `HEAD`, transient gh error on the branch query, unparseable output) degrades to today's plain `{available:false, transient:false}` — never a red leg, never a crash (AC-20260830-03-5) | The fallback is best-effort evidence enrichment; failing toward today's behavior is the only non-blocking posture |
| D4 | `review-legs.js` and `release-legs.js` map `shaUnseen:true` to observed `{unavailable:"sha-unseen", branch, branchConclusion}` with **exit 0 unconditionally** — a red `branchConclusion` never reddens the leg (AC-20260830-03-2, AC-20260830-03-4) | JJ ruling 2026-08-30: report honestly, never block; verdict.js passes `observed` through opaquely so no verdict change is needed |
| D5 | `spec/commands/review.md` and `spec/commands/release.md` report guidance: when the ci row observes `sha-unseen` with `branchConclusion` matching `failure|timed_out|cancelled`, the report includes one ⚠️ line naming the branch and conclusion ("CI has not seen this commit; origin `<branch>`'s latest run: `<conclusion>`") `[no-ac: report prose rendered by the session; the deterministic surface is the manifest row, pinned by AC-20260830-03-2]` | The warning is the product surface JJ chose; the evidence row is the deterministic carrier |
| D6 | `spec/.claude-plugin/plugin.json` bumps to the next free minor (target 7.40.0, after spec 02's 7.39.0) with a changelog line naming the honest ci absence (AC-20260830-03-6) | Behavior change → semver bump; literal is a target, not a pin |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/ci-query.js | MODIFY | scripts | D1 fallback + D3 degradation in `--commit` mode; header updated (the "most recent run for the key" NOT-clause now names the one sanctioned second key: the current branch, on sha-unseen only) |
| spec/scripts/review-legs.js | MODIFY | scripts | D4 mapping in the ci leg (exit 0 unconditional) |
| spec/scripts/release-legs.js | MODIFY | scripts | D4 mapping; header's documented ci row shape gains the `sha-unseen` alternative |
| spec/commands/review.md | MODIFY | doctrine | D5 ⚠️ report line |
| spec/commands/release.md | MODIFY | doctrine | D5 ⚠️ report line |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | version bump + changelog description (D6) |
| tests/review/ci-query.test.js | MODIFY | tests | AC-20260830-03-1, AC-20260830-03-3, AC-20260830-03-5 |
| tests/review/review-legs.test.js | MODIFY | tests | AC-20260830-03-2 |
| tests/release-legs/release-legs.test.js | MODIFY | tests | AC-20260830-03-4 |

## Contracts

`ci-query.js --commit <sha>` output, new alternative (all existing alternatives unchanged):

```json
{"available": false, "transient": false, "shaUnseen": true, "branch": "main",
 "branchRun": {"status": "completed", "conclusion": "failure",
               "url": "https://github.com/o/r/actions/runs/1", "runAt": "2026-08-26T09:00:00Z"}}
```

Evidence-manifest ci row, new alternative (review and release identically):

```json
{"leg": "ci", "exit": 0, "observed": {"unavailable": "sha-unseen", "branch": "main", "branchConclusion": "failure"}}
```

`verdict.js` needs no change: ci `observed` is copied opaquely into the ledger row
(`row.ci = ciRow.observed`) and the verdict derives from exits; exit stays 0.

## Behavior

Decision tree in `ci-query.js --commit`, replacing today's single `runs.length === 0`
branch (every other branch untouched):

1. Run list non-empty → today's pass-through (unchanged).
2. Empty → `git branch -r --contains <sha>`: prints ≥1 ref → sha is on a remote but has no
   runs → today's `{available:false, transient:false}` (unchanged — genuinely no CI).
3. Prints nothing (unpushed) → `git rev-parse --abbrev-ref HEAD`: result `HEAD` (detached)
   or error → D3 degradation. Otherwise run the existing `--branch <name>` gh query
   in-process: finds a run → the D1 `shaUnseen` shape; empty/error/unparseable → D3
   degradation.

Leg mapping (review + release): `j.shaUnseen === true` → observed
`{unavailable:'sha-unseen', branch: j.branch, branchConclusion: j.branchRun.conclusion}`,
exit 0 always. All other shapes: today's mapping verbatim.

## Acceptance Criteria

- **AC-20260830-03-1**: WHEN `ci-query.js --commit <sha>` finds an empty run list, no
  remote ref contains `<sha>`, and the current branch's latest origin run concluded
  `failure` THE SYSTEM SHALL print the `shaUnseen` JSON shape and exit 0 (stubbed `gh`
  returning `[]` for `--commit` and
  `[{"status":"completed","conclusion":"failure","headSha":"abc","url":"u","updatedAt":"t"}]`
  for `--branch main`, in a fixture repo whose HEAD is a commit absent from all
  `origin/*` refs → stdout last line parses to `{available:false, transient:false,
  shaUnseen:true, branch:"main", branchRun:{...conclusion:"failure"...}}`, exit 0) → new
  test in tests/review/ci-query.test.js
- **AC-20260830-03-2**: WHEN the review ci leg receives the `shaUnseen` shape with
  `branchRun.conclusion: "failure"` THE SYSTEM SHALL append exactly
  `{"leg":"ci","exit":0,"observed":{"unavailable":"sha-unseen","branch":"main","branchConclusion":"failure"}}`
  — exit 0 despite the red conclusion (the never-block ruling's literal pin) → new test in
  tests/review/review-legs.test.js
- **AC-20260830-03-3**: WHEN `gh` is missing, the repo has no remote, the host declares
  `capabilities.forge: "none"`, or the sha IS contained in a remote ref with an empty run
  list THE SYSTEM SHALL CONTINUE TO produce today's outputs byte-identically (e.g.
  `forge:"none"` → the literal line `unavailable — no supported forge adapter`, exit 0;
  contained-sha empty list → `{"available":false,"transient":false}`) → existing
  structural-absence tests in tests/review/ci-query.test.js, tagged in place; the
  contained-sha case gets a new test
- **AC-20260830-03-4**: WHEN the release ci leg receives the `shaUnseen` shape THE SYSTEM
  SHALL append the same observed row as AC-20260830-03-2 with exit 0 (literal row identical
  to the review pin) → new test in tests/release-legs/release-legs.test.js
- **AC-20260830-03-5**: WHEN the sha is unpushed and the branch fallback cannot answer
  (detached HEAD, or the `--branch` gh query fails or returns an empty list) THE SYSTEM
  SHALL print today's plain `{"available":false,"transient":false}` and exit 0 (stubbed
  `gh` returning `[]` for `--commit` and exiting 1 for `--branch` → that literal JSON,
  exit 0) → new test in tests/review/ci-query.test.js
- **AC-20260830-03-6**: WHEN this spec lands THE SYSTEM SHALL carry a
  `spec/.claude-plugin/plugin.json` version ≥ 7.40.0 whose description's changelog line
  names the honest ci absence `[oracle: gate]` — the existing version/changelog consistency
  tests are the oracle, never a duplicate pin

## Assumptions (escalation triggers)

- A1: `git branch -r --contains <sha>` prints nothing (exit 0) for a commit no remote ref
  contains, and lists `origin/*` refs for a contained one — **executed 2026-08-30 in this
  repo**: pushed HEAD → `origin/HEAD -> origin/main` + `origin/main`, exit 0; dangling
  commit `bef95ba` (created via `git commit-tree`) → empty output, exit 0; nonexistent sha
  → exit 129 (an error on the containment probe itself is D3 degradation). — **if false:**
  STOP, the labeling premise is wrong.
- A2: `git rev-parse --abbrev-ref HEAD` prints the bare branch name — **executed
  2026-08-30**: `main`. Detached HEAD prints `HEAD` (D3 handles it). — **if false:** D3
  degradation already covers any unexpected output.
- A3: `gh run list --commit <sha>` returns `[]` exit 0 for a commit CI never saw — spiked
  2026-08-10 against installed gh 2.93.0 (per-sha-ci-legs D1, recorded in ci-query.js's
  header); the `--branch` mode ships in production for observe-ci.js since 2026-08-05. Not
  re-executed: both cited spikes are recorded, dated, and version-stamped in the script
  header this spec edits. — **if false:** the header's own contract is wrong; STOP and
  re-spike against installed gh.
- A4: `verdict.js` treats ci `observed` as opaque (copies it into `row.ci`, derives verdict
  from exits) — read from verdict.js and its tests 2026-08-30. — **if false:** the new
  shape would need a verdict.js case; return blocked, that is a verdict-surface change this
  spec deliberately excludes.
- A5: The ci-leg stub tests can stub `gh` via a PATH shim in a `tmpdir()` fixture repo
  (the pattern tests/review/ci-query.test.js already uses). The shim must branch on its
  argv (`--commit` vs `--branch`) — two canned responses in one shim. — **if false:**
  split the shim per invocation via an env-var counter; still the real script, real argv.

## Rationale

The per-SHA query is a deliberate 2026-08-10 design and stays: CI's verdict about *this
commit* is per-SHA or nothing. What changes is the label for one state that design left
merged: "CI never saw this commit" was folded into "there is no CI", and in a repo where
work lands locally first that reads as green forever — the third member of the
vacuous-green class (skipped-tests-as-passes, the at-risk vacuous pass). JJ ruled
2026-08-30 for honest labeling without blocking: a red origin may predate the diff and the
diff may be its fix, so blocking produces false stops in exactly the workflow that
triggers the state (salon-os: 23 unpushed commits); labeling is the cheapest-to-reverse
option and blocking can be layered on later as a host knob. D1 puts the fallback in
ci-query rather than the legs because ci-query's charter is the single gh home — the
review and release legs then share one mapping change. D2's minimal-delta rule exists
because the observed shapes are pinned by verdict tests and consumed via `--json`; the
only new vocabulary is `sha-unseen`, emitted only when there is real branch evidence
(executed greps 2026-08-30: `sha-unseen`/`shaUnseen` appear nowhere in the repo — fresh,
collision-free). Rejected: a `no-runs` label for "on origin but no runs" — it changes an
existing pinned path for zero product gain. Fragile: the fallback doubles gh calls only in
the sha-unseen state; steady-state pushed workflows pay nothing.

## Canonical Delta

`docs/canonical/review-legs.md` (create if absent): the ci leg's absence vocabulary —
`no-adapter` (no CI tooling/forge to consult), `transient` (gh failed retryably),
`sha-unseen` (the commit is on no remote ref; the row carries the current branch's latest
origin conclusion and the leg stays exit 0 by the 2026-08-30 never-block ruling; a red
`branchConclusion` renders as a ⚠️ report line, never a finding). `ci-query.js` remains
the single normalized gh wrapper; its `--commit` mode owns the sha-unseen fallback for
both review and release legs.
