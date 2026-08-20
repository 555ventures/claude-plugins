---
date: 2026-08-20
status: done
open_markers: 0
tier: critical
area: review-verification
design: false
breaking: false
depends_on: []
depended_on_by: ["specs/20260820/04-entrypoint-conformance.md"]
brief: n/a
diff_base: b098cd9eb5febc1798c8249f8be9f3a78b8b431c
---

# Review Observation Truth — typed unavailability, env preflight in review, promise-sweep applicability

## Goal

Close the three observation-integrity defects the Salon OS field report (2026-08-20)
demonstrated in this plugin's review path: an unparseable skip observation silently decays
to `testsSkipped.total: 0` and a CLEAN verdict (violating UPWELL-20260716-02's
never-assumed-zero rule the emitter already honors); `env-preflight.js` is authored and
wired into build/design/doctor but absent from the review path (3rd recurrence of the
authored-not-activated class); and `promise-sweep.js` applies retroactively to specs locked
before the carrier convention existed (52 noise findings at Salon OS, which trained
bulk-waiving — escape rv_8b7c4e2e9ec0 shipped inside a 17/17-waive review). Done means:
silence about skips is a visible finding, review refuses to start on an unprovisioned
environment, pre-convention specs produce a typed `not-applicable` row instead of findings,
and a new executed producer→consumer pair test pins the legs→verdict grammar end to end.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `review-legs.js` runs `env-preflight.js --root <root>` (default mode) as a precondition before wave 1; preflight exit 1 → review-legs exits 2 with stderr naming the unset vars and their provision commands, appending no manifest rows (AC-20260820-03-1, AC-20260820-03-2) | Deterministic wiring beats prose wiring — putting the call in the script (not only review.md) makes the activation testable; a red substrate must be unreachable, not just discouraged |
| D2 | `verdict.js` `deriveTestsSkipped`: a gate row whose `observed` starts with `unavailable` derives `testsSkipped: {"unavailable": true}` in the ledger row — never `{total: 0, …}`; parseable `skips=N todos=M` rows keep the existing `{total,sanctioned,unsanctioned}` object shape unchanged (AC-20260820-03-3, AC-20260820-03-4) | An unmade observation typed as absent, never coerced to zero — the ledger must not manufacture a measurement; rejected: `total: null` inside the old shape (consumers doing arithmetic on null get NaN silently) |
| D3 | `verdict.js` counts a gate row with exit 0 and `observed` = `unavailable — skip format did not match gate output` as exactly 1 leg finding in the undispositioned pool (leg findings are hard), making CLEAN unreachable until dispositioned; the `unavailable — host runner declares no skip format` variant raises NO finding — declared config state is sanctioned, only grammar drift pages (AC-20260820-03-5, AC-20260820-03-6) | Dead-man's-switch: silence must page the same run it occurs, not decay over five runs; per-run disposition replaces any consecutive-miss counting (rejected: miss-count machinery — needs cross-run state a deriver must not hold) |
| D4 | Gate-leg verdict derivation stays exit-code-only: the D3 finding rides the leg-findings pool and never derives GATE_RED; `legIsRed` is untouched (AC-20260820-03-12) | The finding needs judgment (fix the pattern vs waive once with reason), which is disposition's job; blocking would hard-stop reviews on a host config issue the session can adjudicate |
| D5 | `promise-sweep.js` gains an applicability cutoff: spec lock date = the `\d{8}` segment of a `specs/<YYYYMMDD>/` path component, compared against built-in `APPLIES_FROM = '20260817'` (the date the carrier convention shipped, specs/20260817/07), overridable via `--applies-from <YYYYMMDD>`; a pre-cutoff spec exits 0 with no findings and (with `--manifest`) appends `{"leg":"promise-sweep","exit":0,"observed":"not-applicable spec=<YYYYMMDD> appliesFrom=<YYYYMMDD>"}`; a path with no dated segment APPLIES the sweep in full (fail-closed) (AC-20260820-03-7, AC-20260820-03-8, AC-20260820-03-9) | One parameter, no baseline files, no config key: the convention's ship date is a plugin fact, not host state; fail-closed on undated paths keeps every existing tmpdir-based test pin green and never exempts a spec by accident; rejected: a `spec.config.json` knob (touches the hash-stamped grounding contract for an edge the recommended one-time host backfill already closes) |
| D6 | New executed pair test `tests/review/legs-verdict-pair.test.js`: drive `review-legs.js` against synthetic hosts producing each gate-observed branch (pattern matches with skips, pattern declared but unmatched, `skipReportPattern: "none"`), then feed the ACTUAL emitted manifest to `verdict.js --ledger` and assert the derived row — the producer generates the strings, never a hand-written fixture (AC-20260820-03-10, AC-20260820-03-11) | The 11 hand-written `skips=` fixtures in verdict.test.js pin the parser against the test author's memory of the grammar, not against the emitter — exactly how the D2 defect survived; unit pins stay as fast regression checks, the pair test is the contract authority |
| D7 | `review.md` Phase 0 step 2 documents the preflight ("review-legs first runs the host's env preflight; unset declared vars stop the run before any leg") — prose parity with D1's mechanism, no separate command-level invocation [no-ac: doc-parity sentence; the mechanism itself is AC-20260820-03-1's surface] | The session reads review.md to predict behavior; an undocumented precondition reads as a review-legs bug |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/review-legs.js | MODIFY | scripts | D1: env-preflight precondition before wave 1; exit 2 + remedy on preflight failure |
| spec/scripts/verdict.js | MODIFY | scripts | D2 typed testsSkipped unavailability; D3 skip-observation leg finding; D4 derivation untouched |
| spec/scripts/promise-sweep.js | MODIFY | scripts | D5: APPLIES_FROM cutoff, `--applies-from` flag, not-applicable manifest row, fail-closed undated paths |
| spec/commands/review.md | MODIFY | doctrine | D7: Phase 0 preflight sentence |
| tests/review/review-legs.test.js | MODIFY | tests | AC-20260820-03-1, AC-20260820-03-2 |
| tests/review/verdict.test.js | MODIFY | tests | AC-20260820-03-3, AC-20260820-03-4, AC-20260820-03-5, AC-20260820-03-6, AC-20260820-03-12 |
| tests/review/promise-sweep.test.js | MODIFY | tests | AC-20260820-03-7, AC-20260820-03-8, AC-20260820-03-9 |
| tests/review/legs-verdict-pair.test.js | CREATE | tests | AC-20260820-03-10, AC-20260820-03-11 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump target 7.7.0 (next free at build time — literal is a target, not a pin) + description changelog |

## Contracts

```
# promise-sweep.js CLI (additive)
promise-sweep.js --spec <path> [--manifest <path>] [--json] [--applies-from <YYYYMMDD>]
  --applies-from   overrides the built-in APPLIES_FROM='20260817'; value must be 8 digits
  applicability    spec date = first specs/<YYYYMMDD>/ path segment; date < appliesFrom
                   → exit 0, stdout `promise-sweep: not-applicable spec=<date> appliesFrom=<date>`,
                   manifest row (when --manifest):
                   {"leg":"promise-sweep","exit":0,"observed":"not-applicable spec=<date> appliesFrom=<date>"}
                   no dated segment → sweep applies in full (unchanged behavior)

# verdict.js ledger row (changed field, one branch)
testsSkipped:
  gate observed matches ^skips=(\d+) todos=(\d+)  → {total,sanctioned,unsanctioned}  (unchanged)
  gate observed starts with "unavailable"          → {"unavailable": true}

# verdict.js leg-findings pool (additive branch)
gate row, exit 0, observed === "unavailable — skip format did not match gate output"
  → +1 leg finding (hard, dispositionable)
gate row, exit 0, observed === "unavailable — host runner declares no skip format"
  → no finding

# review-legs.js exit codes (unchanged alphabet; new path onto existing code 2)
2 = usage error or precondition failure — now including env-preflight exit 1
    (stderr: the preflight's own per-var lines + remedy, prefixed review-legs.js:)
```

Emitted observed literals are byte-unchanged — `spec/templates/grounding-contract.md:112`
and `spec/commands/release.md:142` cite them and must not need edits (A3).

## Behavior

- Review flow: `/spec:review` → review-legs → env preflight (D1). Unset declared var →
  exit 2 before any leg spawns; the session provisions and re-runs. No `testEnv` registry
  (or an empty one) → preflight exits 0 and the run proceeds — hosts without the registry
  see zero change.
- Skip-observation silence: pattern declared but unmatched → the run derives
  HARD_FINDINGS (not CLEAN) until the session dispositions the finding — waiving requires
  the standard reason, so five silent runs become five explicit decisions.
- Salon OS-shaped host on pre-convention specs: reviews of specs dated before 2026-08-17
  get a `not-applicable` promise-sweep row; the leg is present (verdict's required-leg
  presence check still satisfied, exit 0), findings zero. Specs dated on/after the cutoff
  are swept exactly as today.

## Acceptance Criteria

- **AC-20260820-03-1**: WHEN a host's `spec.config.json` declares
  `testEnv: [{"var":"SPEC_FAKE_GATE_VAR","provision":"echo provision-me"}]` and that
  variable is unset in the environment WHEN `review-legs.js` runs THE SYSTEM SHALL exit 2
  before appending any manifest row, with stderr naming `SPEC_FAKE_GATE_VAR` and
  `echo provision-me` (literal: manifest file remains absent/empty; stderr contains both
  strings) → new test in tests/review/review-legs.test.js
- **AC-20260820-03-2**: WHEN the host declares no `testEnv` registry THE SYSTEM SHALL
  CONTINUE TO run every leg and append the full manifest exactly as before (tag the
  existing green-path review-legs test with this AC-ID)
- **AC-20260820-03-3**: WHEN the manifest's gate row is
  `{"leg":"gate","exit":0,"observed":"unavailable — skip format did not match gate output"}`
  THE SYSTEM SHALL derive the ledger row's `testsSkipped` as exactly `{"unavailable":true}`
  (literal: that row → `"testsSkipped":{"unavailable":true}`, never `"total":0`) → new test
  in tests/review/verdict.test.js
- **AC-20260820-03-4**: WHEN the gate row is `{"exit":0,"observed":"skips=2 todos=1"}` THE
  SYSTEM SHALL CONTINUE TO derive `testsSkipped.total` 3 with the
  `{total,sanctioned,unsanctioned}` shape (tag existing AC-20260813-02-7 test)
- **AC-20260820-03-5**: WHEN every leg is green, the workflow return is clean with zero
  survivors, no dispositions are passed, and the gate row's observed is
  `unavailable — skip format did not match gate output` (exit 0) THE SYSTEM SHALL print
  `HARD_FINDINGS` (literal: the exact manifest from AC-3 → first stdout line
  `HARD_FINDINGS`, exit 1's findings semantics — not `CLEAN`) → new test in
  tests/review/verdict.test.js
- **AC-20260820-03-6**: WHEN the same all-green manifest carries gate observed
  `unavailable — host runner declares no skip format` (exit 0) THE SYSTEM SHALL derive
  `CLEAN` with `testsSkipped` `{"unavailable":true}` (declared-none is sanctioned; typed,
  not zero) → new test in tests/review/verdict.test.js
- **AC-20260820-03-7**: WHEN `promise-sweep.js --spec specs/20260701/01-old.md` targets a
  spec containing an uncarried Decision row THE SYSTEM SHALL exit 0 with zero findings,
  stdout containing `not-applicable spec=20260701 appliesFrom=20260817` (literal) → new
  test in tests/review/promise-sweep.test.js
- **AC-20260820-03-8**: WHEN the spec path's dated segment is `20260817` or later, or the
  path has no `specs/<YYYYMMDD>/` segment at all, THE SYSTEM SHALL CONTINUE TO enumerate
  Decisions rows and emit orphan-decision findings exactly as today (tag the existing
  orphan-finding test — its tmpdir path has no dated segment, so it also pins the
  fail-closed default)
- **AC-20260820-03-9**: WHEN `--manifest <path>` is passed for a pre-cutoff spec THE
  SYSTEM SHALL append exactly
  `{"leg":"promise-sweep","exit":0,"observed":"not-applicable spec=20260701 appliesFrom=20260817"}`
  → new test in tests/review/promise-sweep.test.js
- **AC-20260820-03-10**: WHEN `review-legs.js` runs against a synthetic host whose
  `skipReportPattern` matches gate output reporting 2 skips THE SYSTEM SHALL produce a
  manifest which, fed unmodified to `verdict.js --ledger`, derives `testsSkipped.total` 2 —
  the observed string is generated by the emitter, never hand-written in the test → new
  test in tests/review/legs-verdict-pair.test.js
- **AC-20260820-03-11**: WHEN the synthetic host's declared pattern does NOT match the
  gate output THE SYSTEM SHALL produce a manifest which, fed unmodified to
  `verdict.js --ledger`, derives `testsSkipped` `{"unavailable":true}` and
  `findings.legFindings` ≥ 1 → new test in tests/review/legs-verdict-pair.test.js
- **AC-20260820-03-12**: WHEN the gate row's exit flips to 1 THE SYSTEM SHALL CONTINUE TO
  derive `GATE_RED` regardless of its observed text (tag existing AC-20260816-01-12 test —
  D4's exit-code-only derivation survives)

## Assumptions (escalation triggers)

- A1 (executed 2026-08-20): current `verdict.js --ledger` fed a gate row observed
  `unavailable — skip format did not match gate output` (exit 0, all else green, clean
  workflow) printed `CLEAN` and `"testsSkipped":{"total":0,"sanctioned":0,"unsanctioned":0}`
  — the D2/D3 defect demonstrated on the pre-image; AC-3/AC-5's red-first checks must go
  red against exactly this behavior — **if the pre-image already passes either, STOP:**
  the defect was fixed concurrently, re-derive.
- A2 (executed 2026-08-20): current `promise-sweep.js --spec specs/20260701/01-old.md`
  (uncarried D1 row) printed `HARD orphan-decision D1…`, counters
  `rows=1 carried=0 sanctioned=0 orphans=1`, exit 1 — retroactive application demonstrated;
  AC-7's red-first check reds against this — same STOP rule.
- A3: no emitted observed literal changes, so `grounding-contract.md:112` and
  `release.md:142` citations stay valid and the contract hash is untouched — **if false**
  (any fix requires changing an emitted literal): STOP, that is a critical-tier contract
  edit needing its own ruling.
- A4: ledger consumers (`spec-status.js` → `lib/observation.js`) read only
  stage/spec/ci/runAt, never `testsSkipped` (verified 2026-08-20 by agent read) — the D2
  retype breaks no consumer — **if false:** blocked, enumerate the consumer before
  changing the shape.
- A5: the gate child inherits the review session's environment, so `env-preflight`'s
  `process.env` check is representative of what the gate sees — **if false** (a host
  provisions env inside its gate command): the preflight still correctly checks the
  declared registry; record the host pattern and proceed.
- A6: no existing test asserts a CLEAN-family word on a manifest whose gate observed is
  skip-unavailable (grep 2026-08-20: verdict.test.js `unavailable` hits are ci-leg only)
  — D3 reddens no standing pin — **if false:** the colliding pin is updated in place and
  retagged per the collision gotcha, never weakened.

## Rationale

The root cause (Salon OS report, verified here in source) is that this pipeline enforces
hosts with executed gates but enforces itself with prose: each check carries undeclared
coverage, applicability, and liveness obligations, and all three failed independently.
This spec closes the three live defects and pins the producer→consumer grammar; the
sibling 04 spec closes the coverage class structurally (entry-point conformance).
Post-July-2026 research corroborates each mechanism: typed unknown-≠-zero sentinels,
dead-man's-switch on missing observations (silence pages the same run), and new-code-only
gate application (SonarQube 2026.1-style cutoffs) over baseline ratchets. Rejected
wholesale: gate mutation-testing (single-project evidence), consecutive-miss counters
(cross-run state in a stateless deriver), a host config knob for the cutoff (grounding
contract hash cost for an edge the one-time backfill closes — Salon OS spec 05 measured
backfill strictly cheaper than waiving). D3 deliberately splits the two unavailable
variants: declared-none is a host's honest standing config, unmatched-pattern is drift —
only drift pages. Fragile to watch at build: verdict.test.js's SIX_GREEN fixture is
reused by ~30 pins — D3's new branch must key on the exact did-not-match literal so no
fixture reuse reddens; and `computeLegFindings` currently skips blocking legs, so the D3
count is a deliberate special case, not a lifting of that skip. Salon OS's backfill of
its own pre-convention specs stays host-side work, recommended in the report reply.

Build deviation (folded from the deviations sidecar at review close, 2026-08-20): AC-20260820-03-10
could not be demonstrated red pre-implementation and was not artificially reddened. It pins the
producer→consumer pair on the *parseable* gate-observed branch (`skips=N todos=M` →
`testsSkipped.total`), which D2's Contracts block declares byte-unchanged — so it is a
green-carrier regression pin in substance, the same shape as a `SHALL CONTINUE TO` AC, even though
its text is not phrased that way. Kept as the correct post-implementation assertion per the
standing vacuous-AC Gotcha (`.claude/rules/spec-pipeline.md` § Gotchas, specs/20260819/01 entry);
its sibling AC-20260820-03-11, which pins the unmatched-pattern branch this spec actually changes,
did go red and now passes. No contract was weakened and no red was invented.

## Canonical Delta

None — no docs/canonical/ exists in this repo; plugin.json description carries the
changelog per house convention.
