# Deviations — 20260901/03-unified-build-loop

- `tests/review/review-driver.test.js`'s `AC-20260901-02-4` test (sibling 02, out of this spec's
  File Plan) collides with D2's new CHECKPOINT state: its `loopHost` fixture is created with
  `--via loop`, writes a session stamp, then marks `reviewer-returned` while that stamp is still
  the one on disk — before D2, this landed `DISPOSITIONS` directly; under D2 the same sequence
  must park at `CHECKPOINT` first (AC-20260901-03-2). Updated in place, never weakened: the test
  now asserts the `CHECKPOINT` park as an added setup precondition, then rewrites the stamp to a
  new `session_id` (the `/clear` signature) before proceeding, exactly mirroring what a real
  build session would do to reach DISPOSITIONS. The test's actual assertions (CLEAN row,
  `via:"loop"`, `model:"claude-sonnet-5"`) are unchanged.

- Orchestrator, host integration: D9's `cleanByVia` is an eighth top-level `--json` key on
  `fleet-reader.js`, which invalidates two exhaustive key-set pins that live OUTSIDE this spec's
  File Plan — `tests/fleet-reader/discovery.test.js` (AC-20260820-05-13, the contracted-key-set
  pin) and `tests/fleet-reader/review-fixes.test.js` (the >64KB pipe-truncation pin, whose
  exhaustive key compare is how it detects a truncated write). Both updated in place and retagged
  with AC-20260901-03-6, never weakened: the new key was added to each expected set and the
  "seven"/"eight" wording corrected; both pins remain exhaustive, so a missing key still fails.
  This is the documented add-a-member-to-an-exhaustive-live-file-pin class (§ Gotchas) — caught by
  the whole-suite check at build Phase 4, the seventh recorded recurrence; a lock-time guard for it
  was measured and rejected 2026-08-24.
- Orchestrator, red-check `broken-pin` at Phase 1: AC-20260901-03-1 as locked mixed one new promise
  (the state gate admits `/spec:build` on `done`) with four `SHALL CONTINUE TO` clauses in one
  bullet, and `red-check.js` sanctions a file green per AC bullet on a literal `SHALL CONTINUE TO`
  occurrence — so the bullet sanctioned `tests/state-gates.test.js` green while the spec's own File
  Plan requires its `done` assertion flipped in place, i.e. genuinely red until D5 lands. Resolved
  against Assumption A2 (which states the `done` admission is new behavior and names the pre-D5
  exit-2 pin it replaces) by splitting the bullet: AC-20260901-03-1 keeps the new promise only,
  AC-20260901-03-10 carries the SHALL CONTINUE TO clauses verbatim. Recorded as D12 in the spec's
  Decisions table; the File Plan row and the test's tags were updated to name both IDs. No promise
  was added, removed, or weakened — the same six admissions are asserted in the same file.
