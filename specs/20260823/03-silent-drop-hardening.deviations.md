# Deviations — specs/20260823/03-silent-drop-hardening.md

- **Test-authoring, tests layer, 2026-08-23**: File Plan row `tests/ac-matrix/ac-matrix.test.js`
  (MODIFY) was scoped to retag two existing pins (AC-5 bare-trailing, AC-6 mid-sentence-null,
  assertions untouched). While authoring `tests/ac-matrix/rejected-trailing-tag.test.js` I found a
  third, unlisted collision in the same file: the existing test `'AC-20260821-01-2: a bullet
  ending in a BACKTICKED trailing tag illustration ...'` drives ac-matrix.js against a fixture
  (AC-20260822-71-1, zero literal test hits, bullet ends `` `[oracle: gate]` ``) and pinned the
  CURRENT behavior — a hard `uncovered-ac` finding. That fixture is exactly D1's rule 1
  (`uncovered-ac` with a refused trailing `[oracle:]` — confirmed by running the fixture against
  HEAD: `ac-matrix.js` returns `class: 'uncovered-ac'` today), so once D1 lands the finding class
  must become `rejected-trailing-tag` and this pin would go from a correct green to a false red
  (asserting behavior D1 explicitly retires) with no File Plan row authorized to fix it — a
  guaranteed post-implementation gate break. Per this repo's own collision-resolution convention
  (`.claude/rules/spec-pipeline.md` Gotchas: "a colliding test pin is updated in place and
  retagged with the new AC-ID, never weakened, never left red"), I updated the test's assertions
  in place to expect `rejected-trailing-tag` (not `uncovered-ac`) for AC-20260822-71-1, split the
  parse-only assertion into its own small test, and retagged the exec assertion to
  AC-20260823-03-1 (superseding its own zero-hit-plus-refused-oracle scenario, alongside the new
  dedicated fixture in rejected-trailing-tag.test.js). No assertion was weakened — the expected
  finding class changed because D1 changes the correct behavior for this exact fixture shape, not
  because the invariant under test got looser. Forced (leaving it unaddressed guarantees a broken
  gate once D1/D2 land), not blocking (D1's own text fully determines the correct new behavior —
  no ambiguity, no guess).

- **Scripts-layer worker, 2026-08-23**: `tests/red-check/red-check.test.js`'s
  `AC-20260823-03-3` fixture cannot pass against D2's own locked Contract as implemented
  verbatim, and I did not weaken the implementation to fit it (tests are out of my File Plan
  rows). The fixture's AC bullet is `` - **AC-20260823-33-1**: WHEN x THE SYSTEM SHALL y
  `[pre-green: absence-invariant]` → tests/x3.test.js `` — the `→ tests/x3.test.js` File-Plan-
  reference suffix (spec/templates/spec.md line 128's own AC-1 grammar) follows the backticked
  tag, so the tag is NOT the last non-whitespace content of the bullet's raw text. D2's Contract
  is explicit and exact: `tolerantTrailingRun(raw)` must match `((?:TAG_ITEM_SRC\s*)+)$` on
  trailing-whitespace-trimmed `raw` — an anchored match at the literal end of the (trimmed)
  string, no exception for a following `→ file` annotation. Executed check:
  `parseAcBullets` on this exact fixture text returns `trailingRejected: null` (verified both
  with and without the backticks — a BARE trailing `[pre-green:]` immediately followed by
  `→ tests/x3.test.js` also parses `null`, confirming this is pre-existing anchor behavior, not
  a D2 regression). Every other fixture in this spec's own test suite that exercises trailing-tag
  refusal (`tests/ac-matrix/rejected-trailing-tag.test.js` AC-1/AC-2/AC-4, and the retagged AC-5/
  AC-6 pins) places the tag literally at the bullet's end with no `→ file` suffix; this is the
  one fixture in the batch that combines both, and per the executed check above it cannot satisfy
  D1's causal-relevance gate as a result — `red-check.js` correctly (per D2) reports
  `unsanctioned-green`, not `rejected-trailing-tag`, and the test's own assertion that the latter
  must fire is unreachable under the locked Contract. I did not edit the test (tests/ layer, not
  mine) or loosen D2's anchor to accommodate it (not a sanctioned Decision). Blocked-but-reported,
  not fixed: the options are (a) retarget the fixture to place the tag at the true trailing
  position (drop the `→ tests/x3.test.js` suffix, or move it before the tag) so it exercises the
  same causal-relevance path AC-1/AC-2 already prove, or (b) lock a new Decision explicitly
  widening the trailing-tag anchor to tolerate a `→ {test reference} in {test file}` suffix
  (spec.md's own AC-1 grammar) — which would also require re-deriving `trailingRun`'s own
  pre-existing (unaffected-by-this-spec) bare-tag behavior, since it has the identical blind spot.
  Recommendation: (a) — it is a one-line fixture fix consistent with every sibling fixture in this
  same spec's test batch, versus (b)'s wider grammar change with no other AC requiring it.

- **Orchestrator ruling, D8 (locked, 2026-08-23), applied by the tests-layer worker**: option (a)
  from the entry above was ratified — the anchor stays exactly as D2 locked it (no widening), and
  `tests/red-check/red-check.test.js`'s `AC-20260823-03-3` fixture was retargeted instead. The
  bullet's `→ tests/x3.test.js` suffix was dropped so the bullet now reads `` - **AC-20260823-33-1**:
  WHEN x THE SYSTEM SHALL y `[pre-green: absence-invariant]` `` with the tag as the true trailing
  content — the File Plan row in the same fixture already names `tests/x3.test.js`, which is what
  red-check.js actually reads; the arrow was only a human-facing reference and carried no functional
  weight. No assertion was touched, no other test or implementation file was edited. Confirmed:
  `node --test 'tests/red-check/*.test.js'` — 15/15 green; `node --test 'tests/**/*.test.js'` —
  651/651 green (full suite).

- **Scripts-layer worker, D9 (locked, 2026-08-23)**: fixed `spec/scripts/ac-matrix.js`'s leg-exit
  cross-contamination per D9/AC-20260823-03-13. `rejected-trailing-tag` is emitted from three
  sites (step 5's coverage loop; step 6's current-spec skip branch; step 6's owning-spec skip
  branch) and was added to both `ACM_FINDING_CLASSES` and `SKIP_FINDING_CLASSES` in the original
  D1 pass, so any single emission reddened both manifest legs. Fix: removed the class from both
  sets; each emission site now also adds its finding object (by reference) to one of two plain
  `Set`s (`acMatrixOrigin`, `skipOrigin`) declared alongside `findings`/`warnings`; the two exit
  derivations OR the existing class-set test with the corresponding origin-Set membership test.
  No key was added to any pushed finding object — origin lives only in the Sets, never on the
  object itself, so `--json`'s findings array and each finding's key set
  (`ac`,`class`,`detail`,`severity`) are unchanged. Confirmed: `node --test
  'tests/ac-matrix/*.test.js'` — 46/46 green (incl. AC-20260823-03-13a/13b); `node --test
  'tests/**/*.test.js'` — 653/653 green (full suite).

- **Scripts-layer worker, D10 (locked, 2026-08-23)**: extracted `rejectedTrailingTagDetail` out of
  its two byte-identical local copies (`spec/scripts/ac-matrix.js`, `spec/scripts/red-check.js`)
  into `spec/scripts/lib/spec-sections.js` and exported it, per D10 — the module already owns the
  refusal predicate (D2's `trailingRejected`) the remedy text explains. Both consumers import it;
  the per-consumer `underlying` parameter is unchanged. Pure move, no line of the function body
  edited — message bytes are unchanged (pinned by the AC-20260823-03-1/-2/-3 detail assertions,
  all still green). Corrected both scripts' header comments where they said the builder was
  local/per-script. Confirmed: `node --test 'tests/ac-matrix/*.test.js'` — 46/46; `node --test
  'tests/red-check/*.test.js'` — 15/15; `node --test 'tests/**/*.test.js'` — 653/653 (full suite).
- **Orchestrator ruling, D11 (locked, JJ-approved, 2026-08-23), amendment before review**: both
  `trailingRun` and `tolerantTrailingRun` are end-of-bullet anchored, so a declaration placed
  before the canonical `→ tests/…` File-Plan reference is at NEITHER recognized position —
  it neither parses nor sets `trailingRejected`, the exact silent-drop class this spec closes.
  Live instances: specs/20260823/01 AC-20260823-01-18 and AC-20260823-01-20 (their own review
  row rv_6825fa48c98d recorded `preGreen:0` with both declarations present). D11 widens the
  TOLERANT side only (a `(?:→[^→]*)?$` suffix tolerance on the same TAG_ITEM_SRC authority),
  generalizes the refusal predicate to said-vs-parsed (`wide !== trailingRun(raw)`), adds
  `trailingRejectedCause` (`backticked-at-end`/`not-at-end`), and forks the remedy text on
  cause — "remove the backticks" is never emitted for `not-at-end`, where it is false. The
  predicate generalization (beyond the initially staged widen-only form) was adopted after the
  staged form was shown to still silently drop a backticked tag standing beside an accepted
  bare tag at the true end (AC-20260823-03-16 pins it). Evidence: executed corpus run over all
  843 AC bullets in specs/ — exactly the 2 known drops fire, both `not-at-end`, zero prose
  false positives; 10 synthetic edge shapes verified. D8's ruling stands but its rationale is
  corrected in D11's own text (D1 freezes what PARSES; the tolerant run is the what-is-SAID
  side D2 built to be widenable). **Out-of-plan repair, JJ-approved explicitly**: the two
  specs/20260823/01 bullets moved their `[pre-green: predicate-in-test]` tag into the
  declaration slot; executed check post-repair: both parse `preGreen: "predicate-in-test"`,
  `trailingRejected: null`, `malformed: false`. File Plan row added for
  specs/20260823/01-release-legs.md in the same amendment.
