---
date: 2026-08-17
status: hardened
open_markers: 0
risk: T2
area: review-integrity
design: false
breaking: false
depends_on: []
depended_on_by: ["specs/20260817/05-ac-matrix-anchored-id-match.md"]
brief: n/a
---

# ac-matrix duplicate AC-ID adjudication (fail-closed)

## Goal

`ac-matrix.js` depends on AC-ID uniqueness but never adjudicates it: `acById` is a last-wins
Map, so two different criteria sharing one well-formed ID collapse to one entry. Two
execution-verified silent holes follow (intake JJ-20260817-01): a criterion with no test at
all reads as fully covered, and an ungated criterion's skipped test is sanctioned by a
duplicate's `[env:]` declaration — both `exit 0`, zero findings. Done means: every duplicated
occurrence is a hard finding that also fails the coverage accounting closed, a skip mapping to
a duplicated ID can never be sanctioned, the two JJ-20260817-01 pins turn green, and behavior
on unique-ID specs is byte-identical.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | After bullet parsing, adjudicate uniqueness of well-formed tokens: each occurrence of an AC-ID beyond its first is one hard `duplicate-ac` finding AND increments `uncovered`, in BOTH drift modes (placed with the malformed loop, before the drift-gated coverage matrix) — AND non-first occurrences are EXCLUDED from the coverage-matrix loop's iteration domain, so only the first occurrence enters normal coverage (adversarial-check fix: `acHits` is keyed by ID, so an unfiltered loop double-reports the duplicate occurrence as both `duplicate-ac` and `uncovered-ac`, inflating `uncovered`). | Same shape as 20260815/03 D1 (unparseable = unknown = uncovered): a duplicated identity is unknown coverage; a host `driftScript` cannot disambiguate duplicates either, so exempting drift mode reopens the hole exactly where the host can't see it. Rejected: authoring-time lint (the real incident entered via a build-time amendment, after plan lock — that surface can't see it, and a second checker is a second derivation of AC identity, the 20260814/01 class). |
| D2 | Duplicated IDs enter a `duplicateIds` set. The skip loop treats any skip whose primary mapped ID is in that set as a hard `unsanctioned-skip` whose detail names the duplication as the reason — never reading `[env:]` from either copy, and never falling through to the owning-spec lookup. | The owning-spec fallback would `find()` the first copy and re-launder the sanction; a duplicated ID has no trustworthy declaration. Naming the duplication in the detail prevents the wrong "fix" (adding an `[env:]` tag to the surviving copy). |
| D3 | The accounting in D1/D2 is deliberately non-waivable-around: `duplicate-ac` rides the `ac-matrix` leg's exit and `uncovered` count; the forced skip finding rides `skip-reconcile`'s `sanctioned=0`. Waiving the `duplicate-ac` finding in Phase 2 must leave both durable rows still recording the failure-closed counts. | Phase 2 findings are waivable (asserted from review.md prose, A3); without fail-closed counts in the durable rows, one waive silently re-opens both holes — the exact JJ-20260815-01 lesson ("waive the notation finding once and the coverage claim is permanently false"). |
| D4 | Derive `AC_ID_PARTS_RE` from `AC_ID_RE.source` instead of a second hand-spelled regex. | 20260815/03's recorded reopen condition ("compose it from `AC_ID_RE.source` the next time this file is opened") has now fired — this spec opens the file. |
| D5 | Cross-spec global uniqueness is OUT of scope, fenced with a reopen condition: foreign-ID re-declaration is sanctioned by design (AC-20260815-03-6, hit-is-final), and coverage greps only the reviewed spec's File Plan rows, so no cross-spec false-coverage path is demonstrated. Reopen on the first demonstrated cross-spec false-coverage or cross-spec laundering incident. | Same fencing shape as 20260815/03 D5's `[oracle:]` fence; a guard for an undemonstrated path is additive spend. Also rejected: content-hash/structural AC identity — breaks every existing pin, gotcha, and ledger citation of literal IDs for a defect a small fail-closed check closes. |
| D6 | Observed grammar stays byte-unchanged: `uncovered=N oracle=M` and `skipped=N sanctioned=M`, no new fields; `duplicate-ac` joins the `ac-matrix` leg's finding-class set, the forced skip stays class `unsanctioned-skip` in `skip-reconcile`'s set. | Downstream parsers (`verdict.js`'s testsSkipped derivation, doctor correlations) never move — the 20260815/03 precedent's compatibility contract, restated because it is load-bearing here too. |
| D7 | Doctrine carriers: one truthful clause in review.md's Phase 0 step 5 sentence listing the automatic hard findings (adding the duplicated-ID case); EXTEND the existing `ac-matrix.js` scaffold-ledger row's incident/mechanism text — never a new row; `claims-baseline.json` restamped in the same diff; plugin.json bumped to the next free version (target 6.87.0 — 6.86.0 landed with the 20260815/06 build; a target, not a pin, per the version-race gotcha). | The ledger-row extension follows the 20260815/06 D7 precedent (one mechanism, one row, evidence accretes); the claims restamp rides any review.md line-count change per § Review Checks. |
| D8 | INTAKE closure rides the landing batch: JJ-20260817-01 flips `open → fixed@<landed version>` with `Fix: mechanism(spec/scripts/ac-matrix.js)`, and the two sanctioned-red rows come OFF `.claude/suite-baseline.json` in this spec's File Plan (never left to a review-time waive). | The pin-closing gotcha (specs/20260815/03 review): baseline removal is an out-of-plan finding every time unless planned up front; 20260814/03's Contracts say the update rides the landing batch. |

## File Plan

<!-- Machine-consumed: /spec:build parses this table into workflow batches. -->

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/ac-matrix.js | MODIFY | scripts | D1 uniqueness adjudication (`duplicate-ac` + uncovered, both drift modes) · D2 `duplicateIds` skip handling · D4 `AC_ID_PARTS_RE` from `AC_ID_RE.source` · D6 grammar/class-set placement · header comment gains the dated incident |
| tests/ac-matrix-duplicate-id.test.js | MODIFY | tests | AC-20260817-01-1, AC-20260817-01-2 — the two JJ-20260817-01 intake pins turn green; retag test names in place with their AC-IDs (`JJ-20260817-01` reference stays in the header comment) |
| tests/ac-matrix/duplicate-id.test.js | CREATE | tests | AC-20260817-01-3, AC-20260817-01-4, AC-20260817-01-5, AC-20260817-01-7 — drift-mode adjudication, first-copy-`[env:]`/no-fall-through, observed-grammar byte-shape, zero-hit-duplicate exact accounting |
| tests/ac-matrix/ac-matrix.test.js | MODIFY | tests | AC-20260817-01-6 — tag ONE existing unique-ID test (e.g. the AC-20260814-01-2 uncovered-ac test) with the regression-pin AC-ID; no assertion changes |
| spec/commands/review.md | MODIFY | doctrine | D7: extend step 5's automatic-hard-finding list with the duplicated-ID case, one clause |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D7: extend the existing `ac-matrix.js` row's incident/mechanism text with JJ-20260817-01 — never a new row |
| spec/INTAKE.md | MODIFY | doctrine | D8: JJ-20260817-01 → `fixed@<version>`, `Fix: mechanism(spec/scripts/ac-matrix.js)` |
| .claude/suite-baseline.json | MODIFY | other | D8: remove the two JJ-20260817-01 rows (verify with `node "$(spec-paths suite-baseline)" --check`) |
| spec/doctrine/claims-baseline.json | MODIFY | other | D7: `node "$(spec-paths claims-lint)" --update-baseline` after the review.md edit |
| spec/.claude-plugin/plugin.json | MODIFY | other | D7: bump to next free version (target 6.86.0); description paragraph = changelog for this change |

## Contracts

`ac-matrix.js` CLI, exit codes, and both `observed` string grammars are unchanged
(`uncovered=N oracle=M` · `skipped=N sanctioned=M`). New finding class, all fields matching
the existing finding shape:

```
{ severity: 'hard', class: 'duplicate-ac', ac: <the duplicated AC-ID>,
  detail: names the duplicated ID and its occurrence count }
```

`duplicate-ac` is added to `ACM_FINDING_CLASSES` (rides the `ac-matrix` manifest row's exit).
Skips mapping to duplicated IDs keep class `unsanctioned-skip` (already in
`SKIP_FINDING_CLASSES`) with a detail naming the duplication.

## Behavior

- Adjudication input is the well-formed bullet list only: a malformed bullet is already
  counted uncovered by the malformed loop and never participates in duplicate detection
  (no double-counting a bullet as both malformed and duplicate).
- Occurrence counting is per extra occurrence: an ID appearing 3× yields 2 `duplicate-ac`
  findings and `uncovered += 2`. ONLY the first occurrence stays subject to the normal
  coverage matrix (a duplicated ID whose first copy also has zero test hits additionally
  reports one `uncovered-ac` for that copy — exactly two truthful findings and `uncovered=2`
  total for a 2× ID with no test anywhere, never three: non-first occurrences are already
  adjudicated `duplicate-ac` and are excluded from the coverage loop, per D1).
- Placement mirrors the malformed loop: adjudication runs before the drift-gated coverage
  matrix, so `--has-drift-script` suppresses only `uncovered-ac` findings, never
  `duplicate-ac` or its uncovered increments.
- Skip loop: membership in `duplicateIds` is checked before the `acById` hit branch, so
  neither the current-spec `[env:]` read nor the owning-spec fallback is reachable for a
  duplicated ID.

## Acceptance Criteria

- **AC-20260817-01-1**: WHEN two different criteria share one well-formed AC-ID and the later
  one has no test THE SYSTEM SHALL emit one hard `duplicate-ac` finding per occurrence beyond
  the first and count each toward uncovered (literal: two bullets both `AC-20260101-01-1`,
  one test hit on the ID → `uncovered=1`, exit 1) → JJ-20260817-01 pin 1 in
  tests/ac-matrix-duplicate-id.test.js
- **AC-20260817-01-2**: WHEN a skipped test maps to a duplicated AC-ID whose last copy
  declares `[env:]` THE SYSTEM SHALL report a hard `unsanctioned-skip` naming the duplication
  and record `sanctioned=0` (literal: dup ID, `[env: SOME_LIVE_CREDENTIAL]` on the second
  copy, one skip → `skipped=1 sanctioned=0`, exit 1, no "sanctioned by [env:" warning) →
  JJ-20260817-01 pin 2 in tests/ac-matrix-duplicate-id.test.js
- **AC-20260817-01-3**: WHEN `--has-drift-script` is passed THE SYSTEM SHALL still emit
  `duplicate-ac` findings and count duplicates toward uncovered (literal: same fixture as
  AC-1 plus the flag → `uncovered=1`, exit 1) → tests/ac-matrix/duplicate-id.test.js
- **AC-20260817-01-4**: WHEN a skipped test maps to a duplicated AC-ID whose FIRST copy
  declares `[env:]` — including when the reviewed spec is itself the owning spec the
  grammar-derived fallback would resolve to — THE SYSTEM SHALL still report the skip
  unsanctioned (literal: spec at `specs/20260101/01-*.md` with dup `AC-20260101-01-1`,
  `[env:]` on the first copy, one skip → `sanctioned=0`, exit 1) →
  tests/ac-matrix/duplicate-id.test.js
- **AC-20260817-01-5**: WHEN duplicates are found THE SYSTEM SHALL keep both observed strings
  in the exact existing grammar (literal: AC-1's fixture → `ac-matrix` row observed matches
  `^uncovered=\d+ oracle=\d+$`, `skip-reconcile` row matches `^skipped=\d+ sanctioned=\d+$`)
  → tests/ac-matrix/duplicate-id.test.js
- **AC-20260817-01-7**: WHEN a duplicated AC-ID has zero test hits on every occurrence THE
  SYSTEM SHALL report exactly one `duplicate-ac` (the second occurrence) plus exactly one
  `uncovered-ac` (the first occurrence) — never a third finding (literal: two bullets both
  `AC-20260101-01-1`, no test file containing the ID → `uncovered=2`, exit 1, findings =
  [`duplicate-ac`, `uncovered-ac`]) → tests/ac-matrix/duplicate-id.test.js
- **AC-20260817-01-6**: WHEN a spec's AC-IDs are all unique THE SYSTEM SHALL CONTINUE TO
  produce the same findings, observed strings, and exit codes as before this change →
  existing covering test in tests/ac-matrix/ac-matrix.test.js, tagged in place (green
  against pre-change code — sanctioned pin exception to red-first)

## Assumptions (escalation triggers)

- A1: `ac-matrix.js` is the sole consumer of the AC-ID grammar across `spec/scripts/` and
  `spec/workflows/src/` (Fable retainer grep-verified 2026-08-17; `ac-id-lint.test.js` lifts
  the regex from this source; NOT swept: generated `wf-*.js`, command prose) — **if false:**
  the duplicate contract must be mirrored at the other consumer; STOP and widen the File Plan.
- A2: Both holes reproduce exactly as pinned — executed 2026-08-17 against synthetic hosts
  before intake: coverage probe → `uncovered=0 … 0 finding(s)`, exit 0; env probe →
  `skipped=1 sanctioned=1 … 0 finding(s)`, exit 0 with the warning
  `sanctioned by [env: SOME_LIVE_CREDENTIAL]` on the ungated criterion's skip. The pins
  (tests/ac-matrix-duplicate-id.test.js) were then run and observed red (2 fail / 0 pass) —
  **if false:** the pins are wrong, STOP.
- A3: Phase 2 review findings, including `duplicate-ac`, are waivable — asserted from
  review.md prose, not executed — **if false:** D3's fail-closed accounting is belt-and-braces
  and harmless; nothing else changes.
- A4: No existing test pins `uncovered=0`/`sanctioned=1` on a duplicate-ID fixture (targeted
  greps found none; the full pinning suites tests/ac-matrix/ and tests/ac-matrix-*.test.js are
  all in this File Plan, so the scoped gate runs them) — **if false:** the colliding pin is
  updated in place and retagged per the collision gotcha, never weakened.
- A5: Version 6.87.0 is free at build time (adversarial check found 6.86.0 already taken at
  HEAD) — **if false:** bump to the next free version and log the deviation (version-race
  gotcha).

## Rationale

Root cause (Fable 5 retainer brief, 2026-08-17, execution-verified by the planning session):
the checker depends on an identity property it never adjudicates, and the failure is silent.
The brief deliberately narrowed the class — the 20260815/02 owning-spec `[env:]` lookup
incident is NOT a member (it failed loud, a lookup-scope defect) — so the remedy is not an
identity-model redesign but fail-closed adjudication at the single existing ingestion point,
the same shape 20260815/03 D1 established for malformed IDs. Three alternatives were
rejected with reasons recorded in D1/D5: authoring-time lint (blind to build-time
amendments, and a second identity derivation), content-hash identity (breaks every literal-ID
citation for a ~20-line fix), cross-spec global uniqueness (foreign re-declaration is
sanctioned by design; no demonstrated path — fenced with a reopen condition instead).

Fragile points for execution: D2's ordering (duplicate check before the `acById` hit branch)
is the load-bearing line — a plausible implementation that instead deletes duplicates from
`acById` re-opens laundering through the owning-spec fallback, which AC-4's
reviewed-spec-is-owning-spec fixture exists to catch. D6's byte-unchanged grammar is what
keeps `verdict.js` and doctor untouched; any new observed field is a scope violation.

The intake pins were authored and observed red BEFORE this spec (commit `intake(spec):
JJ-20260817-01`), so the build's red-check sees them as open intake pins turning green, with
the remaining ACs red-first as normal.

Adversarial check (1 Sonnet refuter, T2): ONE demonstrated finding, fixed in place — a
literal D1 implementation left non-first occurrences inside the coverage loop, and because
`acHits` is keyed by ID the refuter's executed prototype reported a zero-hit 2× ID as three
findings with `uncovered=3`; D1 now excludes non-first occurrences from the coverage loop and
AC-7 pins the exact two-finding accounting. Minor corroborations folded in: version target
moved to 6.87.0 (6.86.0 already at HEAD); refuter independently re-executed both intake pins
red, the A1 sole-consumer grep, and the D4 regex derivation. No findings rejected.

## Canonical Delta

None — `docs/canonical/` has no area file for review-integrity mechanics; the scaffold-ledger
row extension (D7) is the durable record.
