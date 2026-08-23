---
name: git-committer-date-iso-z-roundtrips
description: GIT_COMMITTER_DATE="...Z" round-trips verbatim through git log -1 --format=%cI, so date-ordering test fixtures can assert exact string equality on the matched/observed date
metadata:
  type: feedback
---

When a test needs deterministic git commit dates (e.g. to control ordering/threshold logic
read via `git log -1 --format=%cI -- <path>`), setting both `GIT_AUTHOR_DATE` and
`GIT_COMMITTER_DATE` to an ISO string ending in `Z` (e.g. `"2026-01-01T00:00:00Z"`) makes
`%cI` print that exact same string back — no `+00:00` normalization, no local-timezone
conversion. Verified empirically (2026-08-23) with a scratch repo commit.

**Why:** Building fixtures for spec 20260823/06's `memory-sweep.js` (ttl-expired notes,
oldest-git-date-first ordering, `matched` field = the note's commit ISO date) needed to
assert the script's JSON output's `matched` field equals the exact date string the fixture
set — if git normalized the offset, a naive string-equality assert would flake depending on
whether `Z` or `+00:00` came back.

**How to apply:** For any test that commits fixture files at controlled dates and then reads
them back via `%cI` (or asserts a script's output against that date), use `Z`-suffixed ISO
strings for both env vars and assert exact string equality on the round-tripped value —
no need to fall back to a looser date-comparison assert. See [[predicate-widening-no-collision-proof]]-adjacent
discipline: verify the round-trip empirically once (a throwaway repo, `git log -1
--format=%cI`) rather than assuming git's normalization behavior.
