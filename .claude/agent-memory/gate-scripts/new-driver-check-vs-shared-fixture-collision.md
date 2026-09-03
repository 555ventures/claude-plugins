---
name: new-driver-check-vs-shared-fixture-collision
description: A spec-wide gate check applied unconditionally per its own Applicability clause will redden every pre-existing shared test fixture that predates it, even fixtures documented as exempt in a sibling test's own header comment — implement literally, log deviations, never narrow the check to match a stale fixture assumption.
metadata:
  type: feedback
  reviewed: 2026-09-03
---

When a spec's Decision table states a new driver check applies unconditionally under some
condition (e.g. "D1/D3/D4/D5 apply when status.brief.mocks is set"), implement it literally —
even when a shared test-fixture helper's own header comment asserts the new check "is exercised
separately... not by every caller." That comment predates the check landing and is simply wrong
once it lands; it is not evidence the check should be narrowed.

**Why:** On specs/20260902/11-brief-from-approved-set.md, `genesis-driver.js`'s new D5
skeleton-landed checks (shell/data-shell/matrix/primitive-coverage) are gated only on
`status.brief.mocks` being set, per the spec's Behavior › Applicability line. Three separate
shared test-fixture helpers across three different test files
(`writeValidBriefArtifacts`/`brief-state.test.js`, `advanceToRoadmapVisual`/
`genesis-driver.test.js`, `ratifyBriefArtifacts`/`tournament.test.js`) all predate D1/D5 and
lack the now-required `## Journeys`/`## Non-UI Coverage` brief sections or the D5 shell/mocks
artifacts. All three reddened once the checks landed — including one
(`advanceToRoadmapVisual`) whose own header comment explicitly (and now incorrectly) claimed
D5's checks were "exercised separately... not by every roadmap-written caller." A correct,
spec-faithful implementation is proven by the dedicated fixture for that AC passing
(AC-20260902-11-5/-13 here) even while shared legacy fixtures fail.

**How to apply:** When a new unconditional check reddens a shared fixture across MULTIPLE test
files (not just the ones your File Plan row names), do not read that as your implementation
being too broad — check whether the dedicated fixture for the AC you're implementing passes. If
it does, the failure is a stale shared-fixture assumption, not a bug. Log each collision as its
own deviations-sidecar bullet (one per test file/helper), quoting the fixture's own outdated
comment when one exists, and name exactly which artifact the tests worker needs to add. Never
narrow Applicability to route around a fixture; never edit the test file yourself.
