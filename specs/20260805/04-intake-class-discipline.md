---
date: 2026-08-05
status: done
open_markers: 0
risk: T2
area: intake
design: false
breaking: false
depends_on: [03-done-unobserved-observation.md]
depended_on_by: []
brief: n/a
---

# Intake class discipline — second occurrence of a class requires a mechanism

## Goal

Recurring incident classes have been getting prose patches before mechanisms (measured: 5
patches in 3 days on the dashboard seam; 3 versions in 3 days on deltas/fidelity-check) —
the inverted sequencing behind the recent report volume. This spec makes the discipline
mechanical: every closed intake row must declare HOW it was fixed (`mechanism` or `prose`),
and a row whose Category already appeared before may only close as `prose` with a stated
impossibility reason. The carrier is the intake table itself plus a repo test that gates
every version bump — no new command, no judgment pass. Done means: closing a repeat-class
finding with undeclared or unjustified prose makes `npm test` red.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/INTAKE.md` accepted-findings table gains a 7th column `Fix`: `mechanism(<repo path>)` \| `prose(<impossibility reason>)` \| `—` (row still open) \| `pre-contract` (rows predating this spec). Appended last so existing column positions survive. | The disposition must live where the disposition is made; a separate registry would be a second source of truth. |
| D2 | Discipline rule (enforced by test, D3): a non-open, non-pre-contract row whose Category matches ANY earlier accepted-table row (including pre-contract rows) must have `Fix: mechanism(…)`, or `prose(reason)` where the reason is a non-empty statement of why no deterministic carrier exists (≥ 20 chars). First occurrence of a Category may close either way. The Rejected-findings section contributes NO history — it is a bullet list without Category cells (verified INTAKE.md:63-109). | "Second occurrence requires a mechanism" is the pillar; the reason floor keeps `prose(hard)` from satisfying the letter while dodging the point; rejected entries have no structured Category to read, and inventing one from prose would be a heuristic the test can't defend. |
| D3 | Enforcement carrier: `tests/intake/intake-discipline.test.js` parses the table and asserts (a) header has the `Fix` column, (b) every row's `Fix` is one of the four forms, (c) `—` on exactly the rows whose `Fixed in` is `open` (and nothing else on them), (d) `mechanism(<path>)` paths exist in the repo, (e) the D2 repeat-class rule, (f) row IDs are unique, (g) every Category is from the closed vocabulary list carried in the test — adding a category is a deliberate, diff-visible test edit, so respelling a class to dodge the repeat rule fails the suite. Runs in the full suite, so every version bump is gated (Test Rules: the suite gates every bump). | A test is the cheapest deterministic carrier already wired into the release path; (g) closes the novel-category dodge; a new lint script would need its own invocation point. |
| D4 | Backfill: existing rows whose `Fixed in` is a version backfill `Fix: pre-contract`; existing rows whose `Fixed in` is `open` backfill `Fix: —` (their real disposition is recorded when they close, under the new rule). Pre-contract rows still count as Category history for D2. | Retroactively judging ~30 historical fixes is archaeology with no enforcement value; open rows must stay `—` or AC-3 contradicts the backfill; counting history is what makes the rule bite immediately. |
| D6 | The duplicate row ID `PRAX-20260721-01` (INTAKE.md:41 and :45 — two unrelated findings) is repaired in the same edit: the open row at :45 is re-IDed `PRAX-20260721-04` (next free NN for that host+date), and any test header citing the old ID for that finding is updated in the same diff. | Assertion (f) would fail on the live table otherwise; ID-keyed failure messages are ambiguous while the duplicate stands. |
| D5 | INTAKE.md's "Adding a row" section gains the rule in two sentences and the column definition; nothing else in the intake contract changes. `/spec:doctor` check 15 is untouched (it greps `Fixed in` by name; the appended column doesn't shift it). | Minimal prose — the test is the rule's home; the sentences are the pointer to it (the pairing pillar 1 will later formalize as `enforcedBy`). |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/INTAKE.md | MODIFY | doctrine | D1 column + D4 backfill + D5 rule sentences |
| tests/intake/intake-discipline.test.js | CREATE | tests | AC-20260805-04-1 … AC-20260805-04-4 |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | gate row: intake class discipline, promote/retire condition |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | bump 6.42.0 + description line |

## Behavior

- The test parses `spec/INTAKE.md` with the same pipe-table discipline other doctrine pins
  use (`read()` + line split); only the accepted-findings table is parsed — the
  Rejected-findings bullet list is ignored entirely (D2).
- Category matching is exact-string on the Category cell against the closed vocabulary
  (currently `missing-substrate`, `reporting-integrity`, `doctrine-rot`, `workflow-defect`,
  `template-bug`, `checklist-gap` — verified complete on the live table 2026-08-05); the
  list lives in the test (D3g), so growing the vocabulary is a visible test edit, and fuzzy
  matching stays out (disputes the test can't adjudicate).
- Failure messages name the offending row ID and the remedy: "repeat class
  `reporting-integrity` — land a mechanism (script/gate/test) and record
  `mechanism(<path>)`, or state why none is possible in `prose(<reason>)`."
- `depends_on` on spec 03 is file-conflict serialization only (`scaffold-ledger.md`,
  `plugin.json` are shared rows across the series) — there is no semantic dependency.

## Acceptance Criteria

- **AC-20260805-04-1**: WHEN a non-open row's Category matches an earlier row and its `Fix`
  is `prose()` with an empty or < 20-char reason THE SYSTEM SHALL fail the suite naming the
  row ID (fixture table row `X-2 | … | reporting-integrity | … | fixed@1.0 | prose(hard)`
  after an earlier `reporting-integrity` row → test failure naming `X-2`) → exec test
  (fixture INTAKE variants under tests/fixtures/) in tests/intake/intake-discipline.test.js
- **AC-20260805-04-2**: WHEN the same row declares `mechanism(spec/scripts/foo.js)` and that
  path exists THE SYSTEM SHALL pass; WHEN the path does not exist THE SYSTEM SHALL fail
  naming the dangling path → exec test in tests/intake/intake-discipline.test.js
- **AC-20260805-04-3**: WHEN a row's `Fixed in` is `open` THE SYSTEM SHALL require `Fix: —`
  (an open row carrying `mechanism(…)` fails — dispositions are recorded at close, never
  promised) → exec test in tests/intake/intake-discipline.test.js
- **AC-20260805-04-4**: WHEN the live `spec/INTAKE.md` is parsed THE SYSTEM SHALL pass all
  D3 assertions including ID uniqueness and closed-vocabulary Categories (the backfilled
  real table is itself a fixture — this is the row that keeps the actual file honest
  forever) → tests/intake/intake-discipline.test.js
- **AC-20260805-04-6**: WHEN a row's Category is not in the closed vocabulary list THE
  SYSTEM SHALL fail naming the row and the list (fixture row with Category
  `workflow-defects` → failure naming the row and the six valid strings) → exec test in
  tests/intake/intake-discipline.test.js
- **AC-20260805-04-5**: WHEN doctor check 15 greps `Fixed in` against the widened table THE
  SYSTEM SHALL CONTINUE TO resolve the column by name (tag the existing check-15 covering
  test if present; otherwise assert the header contains `Fixed in` before `Fix` so
  name-greps stay unambiguous) → tests/intake/intake-discipline.test.js

## Assumptions (escalation triggers)

- A1: Doctor check 15 references intake columns by header name, never by position (verified
  in doctor.md:218-233 — it names `Fixed in` and `generatedBy` textually). **if false:**
  update the check's column reference in the same diff and add doctor.md to the File Plan
  via the sanctioned mid-build row-add path.
- A2: No other consumer parses the intake table's column count (grep for `INTAKE` across
  spec/ found only doctor check 15 and the feedback-loop prose). **if false:** the consumer
  gains the same name-based resolution, same diff.
- A3: The failing-test-first convention (INTAKE.md:10-17) is untouched — `Fix` records how
  the fix landed, `Pinned by` still records the reproducing test. **if false:** STOP; the
  intake contract itself is being reinterpreted and that is the user's call.

## Rationale

The alternative carriers were a doctor check (runs rarely, advisory) and an `/intake`
command gate (no such command exists — rows are added by hand per INTAKE.md:111-117). The
repo test wins because it runs on every `npm test`, which the version-bump discipline
already makes unavoidable; the discipline therefore costs zero new invocation points.
Backfilling `pre-contract` instead of classifying history (D4) trades completeness for
honesty — retroactive classification would be low-evidence guesswork wearing a column's
authority. The 20-char reason floor is a crude but deterministic proxy; the real quality
bar for `prose()` reasons stays with review (a reviewer can flag a vacuous reason — the
test only guarantees one was stated). This spec is deliberately the smallest of the series:
its value is the ratchet, not the surface. Watch during execution: the live-table AC
(AC-4) means the backfill and the test must land in the same batch or the suite goes red
mid-build — same-row-pair discipline applies.

Adversarial-check dispositions (2026-08-05, one refuter): FIXED — D4/AC-3 contradiction on
open rows (D4 now splits open vs closed backfill); rejected-section Category history was
structurally impossible (D2 now excludes it, with the file evidence); duplicate ID
`PRAX-20260721-01` (new D6 repairs it; assertion f pins uniqueness); unenforced Category
vocabulary (new D3g + AC-6 close the respelling dodge). REJECTED — "move the test flat to
`tests/intake-discipline.test.js`": pipeline rules § Test Rules explicitly route
pipeline-authored tests to `tests/<scope>/` so scoped gate runs stay pin-free; the flat
convention governs hand-authored plugin pins, and the refuter itself verified no functional
break either way.

Review dispositions (2026-08-07, iteration 1 FINDINGS → iteration 2 CLEAN): FIXED —
`tests/feedback-loop.test.js:41` hard-coded a 6-column row assertion against the intake
table and went red when D1 appended the `Fix` column; A2 was in fact false (its grep was
scoped to `spec/` and missed this consumer under `tests/`), so A2's own remedy was applied:
the test now resolves `ID`/`Pinned by`/`Fixed in` by header name and validates row
completeness against the header's column count. WAIVED — scope-reconcile's out-of-plan
finding (14 files): 12 fixtures under `tests/fixtures/intake-discipline/` are explicitly
called for by AC-1's text ("fixture INTAKE variants under tests/fixtures/") — a File Plan
listing gap, not rogue code; the 2-line ID rename in `tests/gate-activation-probe.test.js`
is sanctioned verbatim by D6; the 2 untracked `docs/roadmap/` files predate this build and
were never part of its diff.

## Canonical Delta

docs/canonical/intake.md (create if absent): "Every closed intake row declares its fix kind
in the `Fix` column; a repeat Category may only close as `prose(<impossibility reason>)` —
otherwise a mechanism path is required; enforced by tests/intake/intake-discipline.test.js
on every suite run."
