# v7 replay eval — 2026-08-17

The v7.0.0 cutover's before/after check: three already-reviewed v6 specs whose reviews
produced fix-dispatched findings with demonstrated repros were checked out at their pre-fix
commits (detached scratch worktrees) and driven through the **v7 review path** —
`review-legs.js` + one fresh-context `spec:reviewer` agent under the executed-evidence
standard. Pass condition: v7 rediscovers the defect classes the v6 panel found.

| Target (pre-fix commit) | v6 found | v7 reviewer rediscovered | Notes |
|---|---|---|---|
| specs/20260805/02 review-evidence-manifest (`66f85ba`) | 5 findings, all one class: verdict.js --ledger rows incomplete vs documented schema (review runId/smoke/testsSkipped + nested findings; release milestone fields) | **2/2 classes — full** | Both with executed field-by-field repros against synthetic manifests; the strongest v7 result |
| specs/20260801/03 lane-engine (`7a2db1f`) | 5 findings | **2/5** — checkpoint-gate hole (executed repro incl. the briefless-pick path) + error-prefix violation | Missed: fable model routing, start narration, exit-code doc — all unimplemented-promise clauses that ride green suites |
| specs/20260810/04 hub-wired-daemon (`5835c01`) | 4 findings | **0/4 formal** (found the wrong-flag doc error, demoted it to prose) | The dropped cross-spec pin (AC-20260801-04-5) WAS caught by v7's deterministic ac-matrix leg (2 hard missing-test-file findings) — a class the leg now owns; missed: inert reposRoot override, unpinned failure branch |

**Reading:** the single reviewer is strong exactly where the executed-evidence standard has
teeth (contract-vs-implementation, executed repros) and weak on promise-sweep exhaustiveness
(a Decision/Behavior clause wired nowhere rides a green suite) and on formal reporting of
small verified defects. Response shipped before cutover (commit `reviewer.md promise sweep`):
a mandatory per-clause Decisions/Behavior sweep and a no-prose-demotion rule, both worded
from the measured misses. Open JJ decision: whether critical-tier specs get a second
reviewer on top (the plan's fallback for a replay miss).

Environmental notes for future replays: detached worktrees need `autopilot/node_modules`
symlinked (SDK); v6-era trees carry standing red pins the v7 gate has no baseline for —
gate-red hard-stops on those trees are era artifacts, not v7 defects.
