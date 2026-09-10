# Review legs

`spec/scripts/review-legs.js` runs every deterministic review leg and writes the evidence
manifest `verdict.js` derives from. `spec/scripts/release-legs.js` is its release-stage
sibling. Both consume CI evidence through one wrapper, `spec/scripts/ci-query.js`.

## The ci leg's absence vocabulary

CI's verdict about *this commit* is per-SHA or nothing — the per-SHA query is a deliberate
2026-08-10 design and stays. What the leg must never do is collapse distinct absences into
one label. Three are distinguished:

- **`no-adapter`** — there is no CI tooling or forge to consult at all: `gh` is missing, the
  repo has no remote, or the host declares `capabilities.forge: "none"`.
- **`transient`** — the forge query failed retryably; the answer is unknown, not absent.
- **`sha-unseen`** — CI exists and was reachable, but this commit is on no remote ref, so no
  run could ever have observed it. The row carries the current branch's latest origin
  conclusion (`{unavailable: "sha-unseen", branch, branchConclusion}`) so the report can say
  what CI last knew about the branch this work sits on.

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
with a `branchConclusion` of `failure`, `timed_out`, or `cancelled`, `/spec:review` and
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
