# Review legs

`spec/scripts/review-legs.js` runs every deterministic review leg and writes the evidence
manifest `verdict.js` derives from. `spec/scripts/release-legs.js` is its release-stage
sibling. Both consume CI evidence through one wrapper, `spec/scripts/ci-query.js`.

## The ci leg's absence vocabulary

CI's verdict about *this commit* is per-SHA or nothing — the per-SHA query is a deliberate
2026-08-10 design and stays. What the leg must never do is collapse distinct absences into
one label. Three are distinguished:

- **`no-adapter`** — there is no forge adapter to consult: the host config's
  `capabilities.forge` is not `github` (absent block, absent key, `none`, or any other value —
  the CI scripts never invoke `gh`), or `forge` is `github` and `gh` is missing or the repo has
  no remote.
- **`transient`** — the forge query failed retryably; the answer is unknown, not absent. It
  arises only on a `forge: "github"` host whose `gh` executed and failed; it is never produced
  for an undeclared forge.
- **`sha-unseen`** — CI exists and was reachable, but this commit is on no remote ref, so no
  run could ever have observed it. The row carries the current branch's latest origin
  conclusion (`{unavailable: "sha-unseen", branch, branchConclusion}`) so the report can say
  what CI last knew about the branch this work sits on.

`/spec:init` writes `forge` from the origin remote and `gh`; `/spec:doctor` check 1's
`grammar-check` reports `undeclared`.

Before 2026-08-30 `sha-unseen` was folded into `no-adapter`: an unpushed commit returned an
empty run list and the leg reported the same shape as a repo with no CI at all. In a repo
where work lands locally first that reads as green forever — the third member of the
vacuous-green class, after skipped-tests-as-passes and the at-risk vacuous pass (salon-os
2026-08-30: origin red four days, local main 23 commits ahead, leg CLEAN).

## The never-block ruling

`sha-unseen` **never reddens the leg** — exit is 0 unconditionally, including when
`branchConclusion` is `failure` (JJ ruling 2026-08-30). A red origin may predate the diff and
the diff may be its fix, so blocking produces false stops in exactly the workflow that
triggers the state. Honest labeling is the cheapest-to-reverse option; blocking can be
layered on later as a host knob.

The product surface is a report warning, not a finding: when the ci row observes `sha-unseen`
with a `branchConclusion` of `failure`, `timed_out`, or `cancelled`, the review stage and
`/spec:release` render one ⚠️ line naming the branch and conclusion. The deterministic
carrier is the manifest row; the ⚠️ line is the render of it.

## One gh home

`ci-query.js` remains the single normalized `gh` wrapper — its 2026-08-05 charter, after two
wrappers were flagged as a drift seam. Its `--commit` mode owns the sha-unseen fallback for
both the review and release legs: on an empty run list it asks `git branch -r --contains
<sha>`, and only when no remote ref contains the commit does it re-query its own `--branch`
mode against the current branch. Placing the fallback there rather than in the leg runners
means review and release share one mapping change and can never disagree about what absence
means.

Every failure of the fallback itself — a detached HEAD, a containment probe error, a failed
or empty or unparseable branch query — degrades to the plain `{available: false, transient:
false}` shape. The fallback is best-effort evidence enrichment; failing toward the previous
behavior is the only non-blocking posture. `sha-unseen` is emitted only when there is real
branch evidence to report.

`verdict.js` needs no case for any of this: the ci row's `observed` object is copied opaquely
into the ledger row and the verdict derives from leg exits.

## Rows carry their scope

Every row this script appends carries `scope` as its last key, `full` or `fix-delta`, from the
one `--fix-delta` flag; rows appended by `ac-matrix.js` and `promise-sweep.js` carry no key and
`verdict.js` treats them as non-carriers. (specs/20260902/05-manifest-stamped-scope.md)

## The review's base reaches the legs

Two legs used to be the only ones told what this review is judging against: `scope-reconcile`
receives it as an argument, and the host patterns script receives it as an inline `DIFF_BASE=`
prefix. The gate and suite legs run the host's whole test suite, which can contain checks that
resolve a comparison point of their own — and a check that derives its own base from branch
topology reads a different history than the one the review is judging. A merged branch is the
clearest case: `merge-base(HEAD, main)` collapses onto a commit above the change the check
exists to see, so the check reports a skipped step on a tree that never skipped it.
`review-legs.js` therefore sets `SPEC_REVIEW_BASE` to its `--base` value in every leg
subprocess's environment, at the one place all of them are spawned, applied after any leg-local
environment so a leg cannot redirect it. A host check reads it as one candidate among its own
and must ignore any value that is not a full 40-hex commit sha — a ref name resolves in every
repository, including a synthetic one a test builds in a temporary directory, so only a commit
identity may cross that boundary. It never outranks an explicit flag and never becomes a
required input. `DIFF_BASE` keeps its own meaning as the patterns script's documented input.

**One row per review run id is the CLEAN one.** A review appends a row per iteration under one
`runId`, and the failing iterations record their legs red. Only the CLEAN row describes the
state the close was judged on, so every consumer that asks "what did this review observe"
resolves the run id through one shared selector — the CLEAN row, the last when several — rather
than restating the rule. Two replay rows were recorded claiming a leg was already failing at
review because that ambiguity had no owner.
(specs/20260909/02-replay-base-and-label-honesty.md)

## The suite leg

`review-legs.js` runs the host's bare `testCommand` once per legs iteration as the `suite` leg —
the one observation that sees repo-wide scanner tests the scoped gate glob and the at-risk stem
match cannot. It is blocking in `review-legs.js`, `verdict.js` (`REVIEW_LEGS` + `REVIEW_BLOCKING`,
required in both scopes) and the review driver's `BLOCKING_LEGS` alike; `--require` was not the
mechanism because on the review profile it widens the required set only. It has its own wave so
it never overlaps another leg that runs host tests. (specs/20260903/02-whole-suite-review-leg.md)

When the host's raw `gateCommand` carries no `{testDirs}`/`{scopeDirs}` and one of its `&&`
segments is exactly `testCommand`, the gate already ran the whole suite; the suite row then copies
the gate row's evidence with `"reused":"gate"` and spawns nothing, provided the gate's
executed-test count was observed — with no count the bare run stays, so a gate green on lint alone
never vouches for the suite. The same helper, `gateRunsSuite` in `lib/gate-resolve.js`, lets the
driver's close-time re-run skip its whole-suite half. Every legs run also writes `timings.json`
beside the manifest, one wall-clock millisecond count per leg.
(specs/20261101/05-the-gate-that-ran-the-suite-is-the-suite.md)

## The slow leg

Review legs run no slow leg; `slowTestCommand` runs at `--mark closed` and as `release-legs.js`'s
`slow` leg (specs/20261103/13).

## A rerun over an unchanged tree copies its green rows

The driver snapshots the tree (`snapshotTree`, sidecar excluded)
before every legs run. When `--mark skips-extracted` or `--mark repair-round` starts a new legs
run over the same tree, review-legs receives `--reuse-from <prior manifest>` and copies the prior
green rows for `gate`, `suite`, `at-risk`, `patterns` and `smoke` with `observed.reusedFrom`
naming the manifest; red rows and every other leg run for real. A leg red before and green over
the same tree is printed and recorded as flaky. A changed tree re-runs everything.
(specs/20261101/06-a-rerun-re-runs-only-what-went-red.md)

## One suite run per tree

A green gate, suite or post-gate run is recorded once per (resolved command string, tree sha
with the pipeline's own write paths excluded, declared `testEnv` names) in
`<git common dir>/spec-run-cache`, shared by every worktree of the repo; a red run, or a green
one with no count from the host's declared `testCountPattern`, is never recorded.
`review-legs.js` consults it with `--tree` after the `--reuse-from` path and appends a hit as
the prior row with `observed.reusedFrom: 'cache:<tree7>'`. The at-risk leg appends
`reused: 'suite'` with no spawn when this iteration's suite row is green with a count and
`testCommand` has no `{file}`. The build driver records each part of its gate round, the
fan-out driver consults it for the post-merge gate, and the review driver's close-time gate
consults it with the close tree. (specs/20261103/12-one-suite-run-per-tree.md)
