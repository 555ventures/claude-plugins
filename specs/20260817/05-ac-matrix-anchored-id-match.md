---
date: 2026-08-17
status: superseded
open_markers: 0
risk: T2
area: scripts
design: false
breaking: false
depends_on: ["specs/20260817/01-ac-duplicate-id-adjudication.md"]
depended_on_by: []
brief: n/a
---

# ac-matrix AC-ID hits are anchored tokens, never bare substrings

## Goal

`ac-matrix.js` credits an AC with a coverage hit whenever a test file *contains* its ID as a
bare substring, and the AC-ID grammar makes one ID a literal prefix of another in the same
spec (`AC-20260815-03-1` is inside `AC-20260815-03-14`). Two symmetric accounting failures
follow from that one root cause: a skipped test owned by an env-gated AC is attributed to
the lowest-numbered prefix-collider and reported as a hard `unsanctioned-skip` (prax,
2026-08-17: 21 false hard findings on a correctly-declared spec), and the prefix AC reads as
covered (`uncovered=0`) though no test cites it. Every host spec with more than 9 ACs is
exposed, independent of stack (intake PRAX-20260817-01). Done = AC-ID occurrences count only
as anchored tokens, both committed red pins in `tests/ac-matrix-skip-attribution.test.js` go
green, and the observed grammar plus every finding class stays byte-unchanged.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Anchor the occurrence check at the single `fileAcMap` ingestion point (the `readTestFile(f).includes(b.id)` loop): an ID occurrence counts only when not preceded by `[A-Za-z0-9]` and not followed by `[0-9A-Za-z]` (regex with lookbehind/lookahead over escaped ID, executed evidence in A1). | One ingestion point fixes both the skip-attribution and the phantom-coverage direction at once. Rejected: longest-match-per-position bookkeeping — same outcome, more state; rejected: changing `mappedIds[0]` — with anchored hits the mapped set no longer contains phantom prefixes, so the pick logic is sound as-is. |
| D2 | `mappedIds`, `mappedIds[0]`, the owning-spec lookup, and all downstream reconciliation logic stay untouched. Residual accepted: a file that legitimately cites several ACs still resolves a content-matched skip line via `mappedIds[0]` arbitrarily — out of scope; the embedded-AC-ID skip-line path remains the precise attribution route. | The intake row scopes the class to prefix collisions; widening into per-test attribution redesign risks the surface 20260817/01 is concurrently hardening. |
| D3 | The embedded skip-line path (`line.matchAll(AC_ID_RE_GLOBAL)`) stays unchanged — the regex's greedy `\d+` already returns full tokens (`AC-20260815-03-14` never yields `-1`). | Verified by execution; touching it adds risk for zero behavior change. |
| D4 | Observed grammar (`uncovered=N oracle=M`, `skipped=N sanctioned=M`), finding classes, and exit codes are byte-unchanged; the fix alters only which AC a hit/skip lands on. | Downstream parsers (verdict.js, review doctrine, host driftScripts) read these strings; the fix must be invisible except in attribution correctness. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/ac-matrix.js | MODIFY | scripts | D1 anchored token match at the fileAcMap ingestion loop; nothing else changes |
| tests/ac-matrix-skip-attribution.test.js | MODIFY | tests | AC-20260817-05-1, AC-20260817-05-2 (existing red pins — tag AC-IDs into test names), AC-20260817-05-3 (new green CONTINUE-TO case: punctuation-adjacent citations still count) |
| tests/ac-matrix-coverage-holes.test.js | MODIFY | tests | AC-20260817-05-4 (regression tag on an existing green coverage case — anchoring must not drop legitimate hits) |

Orchestrator duties (not table rows): after the gate is green, run
`node spec/scripts/suite-baseline.js --update --root .` to retire the two now-green
sanctioned rows for `tests/ac-matrix-skip-attribution.test.js`; flip intake row
PRAX-20260817-01 to `fixed@<version>` in `spec/INTAKE.md` and bump
`spec/.claude-plugin/plugin.json` semver in the same commit.

## Contracts

```js
// The only semantic change, at the single ingestion point (D1):
// an AC-ID b.id is "cited by" file f  ⇔  content matches
//   new RegExp('(?<![A-Za-z0-9])' + escapeRegExp(b.id) + '(?![0-9A-Za-z])')
// escapeRegExp = standard replace(/[.*+?^${}()|[\]\\]/g, '\\$&') — IDs contain `-` only,
// but escape anyway so the helper is safe for any well-formed token.
```

`--json` output shape, manifest row grammar, and exit codes are unchanged (D4).

## Behavior

Fixture that pins the fix (mirrors the prax incident): spec declares `AC-20260815-03-1`
(ungated) and `AC-20260815-03-14` (`[env: AI_GATEWAY_API_KEY]`); the only File-Plan test
file cites `AC-20260815-03-14` and skips `admits when gateway key present`.
Before: skip attributed to `-1` → hard `unsanctioned-skip`, `sanctioned=0`, and
`uncovered=0`. After: skip attributed to `-14` → `sanctioned=1`, zero findings for the skip,
and `-1` reports `uncovered-ac`. Citations followed by punctuation (`AC-…-1:`,
`(AC-…-1)`, `` `AC-…-1` ``) keep counting as hits — the anchor excludes only alphanumeric
continuation.

## Acceptance Criteria

- **AC-20260817-05-1**: WHEN a skipped test lives in a file whose only cited AC is
  `AC-20260815-03-14` `[env: AI_GATEWAY_API_KEY]` and a sibling AC `AC-20260815-03-1` exists
  with no env gate THE SYSTEM SHALL attribute the skip to `AC-20260815-03-14` and sanction
  it by that AC's own `[env:]` (`skip-reconcile` row `observed` matches `/sanctioned=1/`, no
  `unsanctioned-skip` finding naming `AC-20260815-03-1`) → existing red pin in
  tests/ac-matrix-skip-attribution.test.js
- **AC-20260817-05-2**: WHEN no test file cites `AC-20260815-03-1` as an anchored token
  (the only file cites `AC-20260815-03-14`) THE SYSTEM SHALL report `AC-20260815-03-1` as an
  `uncovered-ac` finding → existing red pin in tests/ac-matrix-skip-attribution.test.js
- **AC-20260817-05-3**: WHEN a test file cites an AC-ID immediately followed by
  punctuation or delimiters (`AC-20260815-03-1:` / `(AC-20260815-03-1)` /
  backtick-wrapped) THE SYSTEM SHALL CONTINUE TO count each as a coverage hit
  (`uncovered=0` for that AC) → new green test in tests/ac-matrix-skip-attribution.test.js
- **AC-20260817-05-4**: WHEN a spec's ACs have no prefix collisions THE SYSTEM SHALL
  CONTINUE TO produce the same findings and `observed` strings as today → tag an existing
  green case in tests/ac-matrix-coverage-holes.test.js

## Assumptions (escalation triggers)

- A1: Lookbehind/lookahead anchoring behaves as intended on the installed Node — executed
  2026-08-17: `(?<![A-Za-z0-9])AC-20260815-03-1(?![0-9A-Za-z])` → no match inside
  `AC-20260815-03-14`; matches `// AC-20260815-03-1`, `AC-20260815-03-1: pins`,
  `(AC-20260815-03-1)` — **if false:** the fix mechanism itself is wrong; STOP.
- A2: No legitimate citation convention appends a letter or digit directly to an AC-ID (the
  grammar's trailing `[a-z]?` belongs to the spec-number group, and the final `-k` group is
  digits-only) — **if false:** loosen the lookahead to `(?![0-9])` and record the deviation.
- A3: `specs/20260817/01-ac-duplicate-id-adjudication.md` builds first (depends_on) and may
  reshape the ingestion loop — **if false** (landed differently or reordered): D1 applies at
  whatever the then-single ingestion point is; the invariant is the anchor, not the line
  number. Conflicting edits to the same loop → blocked return, never a hand-merge guess.
- A4: `readTestFile(f).includes(line)` (skip line matched against file CONTENT, line ~374)
  is test-NAME matching, not AC-ID matching, and stays substring — **if false:** re-read the
  intake row; that path is out of scope here.

## Rationale

The root cause is that the ID grammar admits prefix relations inside one spec while the
checker treats "contains the ID string" as "cites the AC". Anchoring at the single ingestion
point (D1) is the smallest change that closes both observed failure directions and any
future consumer of `fileAcMap`. The alternative of preferring the longest match at pick time
treats a symptom (which phantom wins) instead of the disease (phantoms exist). This spec
deliberately does NOT touch duplicate-ID adjudication — that is 20260817/01's surface
(same file, hence `depends_on` serialization) — and does not redesign skip→test attribution
(D2 residual): when a multi-AC file's skip arrives without an embedded ID, `mappedIds[0]` is
still a guess, but post-fix it is at least always a *cited* AC, and prax's embedded-ID
workaround remains the exact route. Refuter attention is best spent on: hosts whose test
files cite IDs in unusual surroundings (would the anchor drop a real hit?), and the
interaction with 01's duplicate-ac findings on the shared loop.

## Canonical Delta

None — this repo keeps behavior canon in tests and INTAKE.md. The fix commit flips
PRAX-20260817-01 to `fixed@<version>` and the two suite-baseline rows retire (orchestrator
duties above).
