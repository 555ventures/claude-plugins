# Deviations — specs/20260817/07-promise-sweep-leg.md (tests layer)

- **AC-20260817-07-12 test already passes on current code, pre-implementation.** The AC-12
  test in `tests/review/verdict.test.js` ("a non-zero promise-sweep exit ... never derives
  GATE_RED") asserts CLEAN is reached with a red-but-present `promise-sweep` manifest row.
  Verified by execution (`node spec/scripts/verdict.js` against a hand-built manifest carrying
  an unrecognized `promise-sweep` leg row): today's `verdict.js` simply ignores any leg name
  outside its `REVIEW_LEGS`/`REVIEW_BLOCKING` sets, so an unknown-but-red leg is already
  indistinguishable from a known-but-non-blocking one — both derive CLEAN once the workflow's
  findings are dispositioned. This is not a stale spec assumption: it mirrors the same shape as
  `specs/20260815/02-at-risk-pins.md`'s AC-20260815-02-7 ("a red at-risk leg does not derive
  GATE_RED"), which is structurally the same claim about a newly-required-but-non-blocking leg
  and is presumably subject to the identical pre-implementation vacuity. The companion
  AC-20260817-07-11 tests (missing-row → UNVERIFIED, both scopes) ARE genuinely red on current
  code and carry the presence half of D4's contract; AC-12's non-blocking half only becomes a
  meaningfully distinct claim once `promise-sweep` is a *recognized* leg at all, which is what
  AC-11 pins. Logged per host rules' conservative-deviation clause rather than blocking, since
  the test is derived directly from the AC text and a real prior spec in this repo shipped the
  same pattern.

- **gate-scripts worker: retargeted `SIX_LEGS_NO_AT_RISK` in `tests/review/verdict.test.js`
  (out of the assigned scripts-layer File Plan) to add a green `promise-sweep` row.** D4 makes
  `promise-sweep` required-but-non-blocking in BOTH scopes — unlike `reconcile`/`at-risk`, it is
  never filtered out of `requiredLegs` under fix-delta. `SIX_LEGS_NO_AT_RISK` (from
  `specs/20260815/02-at-risk-pins.md`, predating this spec) carried no `promise-sweep` row.
  Verified by execution: `SIX_LEGS_NO_AT_RISK.filter(l => l.leg !== 'reconcile')` under fix-delta
  scope is `["gate","smoke","ac-matrix","skip-reconcile","ci"]` — byte-identical to
  AC-20260817-07-11's own fix-delta fixture, which this spec pins as deriving `UNVERIFIED` when
  `promise-sweep` is absent. AC-20260815-02-8 asserted `CLEAN` for that identical row set: the
  two claims are mutually exclusive by construction (proven by execution, not a judgment call),
  the host Gotcha's colliding-test-pin class ("Mid-build a colliding test pin is updated in place
  and retagged... never weakened, never left red"). Since this fixture is also read by
  AC-20260815-02-6/-02-7 (which do not collide — both keep the same expected verdict word with
  the row added), a single one-line addition of `{leg:'promise-sweep',exit:0,observed:'rows=1
  carried=1 sanctioned=0 orphans=0'}` to the shared fixture resolves the collision for all three
  without touching any assertion. This is the "attribute by execution... retarget in place,
  record the deviation" remedy A2's Assumption names for an under-predicted redden. Confirmed by
  running `node --test tests/review/verdict.test.js` before (2 failing: AC-20260815-02-7,
  AC-20260815-02-8) and after (29/29 green) the one-line fixture edit.
