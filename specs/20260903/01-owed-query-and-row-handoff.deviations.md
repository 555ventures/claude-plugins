# Deviations — 01-owed-query-and-row-handoff

- A6's "if false" branch triggered: adding the `owed` ninth top-level `--json` key reddened a
  SECOND exhaustive key-set pin beyond `tests/fleet-reader/discovery.test.js` (AC-20260903-01-8,
  in File Plan) — `tests/fleet-reader/review-fixes.test.js`'s "review finding 1" 64KB-pipe test
  also `deepStrictEqual`s `Object.keys(parsed).sort()` against the full contracted key set. Not
  named in the File Plan (it predates this spec, pinned under AC-20260901-03-6). Updated in place
  to add `owed` to the sorted expected array, never weakened, per pipeline rules' collision-closure
  Gotchas entry and A6's own remedy.
