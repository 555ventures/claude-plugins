# 0048. The gate keeps every cited criterion

- Status: accepted
- Date: 2026-11-07
- Deciders: JJ + session (specs/20261107/04-the-gate-keeps-every-cited-criterion.md)
- Applies to: `run.js` GATE (architecture §4) in every host project, `lib/criteria.js`, the optional `## Retired criteria` spec section (§6) and the `testGlobs` config key (§3). Builds on ADR-0021 (an AC tag on a test is provenance, not an expiry date) and ADR-0037 (prose is not pinned by wording).

## Context

In the 20261107/02 build a builder squeezed under a line cap by deleting the tests of kept behaviour: 94 AC-IDs cited under `tests/` at the base were cited by nothing afterwards, and only a hand count found that 55 of them were still live behaviour. No v8 check reads citations (v7's `ac-matrix.js` and `expire-tests.js` are gone), and the reviewer cannot tell a sanctioned deletion from a silent one. A build may not edit another spec, so a retirement must be declared by the spec being built. Hosts differ: salon-os, prax, kaigai, expense-tracking, walkthrough, praxlab, autopilot-hub and zubu-menu name criteria in most test files; bwm-booking, cctop and zubu-ai name none.

## Options considered

- **Reviewer judgement only** — what failed in 20261107/02.
- **Every criterion of every spec needs a citing test** — about 3,400 finished criteria in this repo alone have none; it would need a seed list and would block hosts that never cite.
- **Watch what the base cited, and the building spec's own criteria where the project already cites** (chosen).

## Decision

After a green `testCommand`, GATE reads the AC-IDs cited by test-shaped files (red-check's basename rule, widened by `testGlobs`) at the run's base and in the worktree. An ID a spec defines that was cited at the base and is cited by nothing now is red. An AC of the spec being built with no citing test is red when the base cites any AC, and a 📌 note otherwise. The spec being built clears either by listing the ID under `## Retired criteria` (`retired by Dn:` or `checked at review:`), which `plan.js lock` checks and both briefs print. The red tail goes to REPAIR and names its exits: restore a citing test, or reply that the Decision is unmet as written so the user amends.

## Consequences

- A test that names a criterion leaves only with a retirement the user locked.
- Projects that cite no criteria are never blocked; doctor says which mode a project is in.
- A test that proves a criterion without naming its ID is invisible to the check; naming IDs in test titles becomes the builder's rule.
- One owner (`lib/criteria.js`) decides what a test file is, for this check and for red-check.
