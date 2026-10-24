---
date: 2026-10-24
status: implementing
tier: standard
area: genesis
breaking: false
depends_on: [specs/20261024/01-review-driver-reads-recorded-facts.md]
brief: n/a
open_markers: 0
build_base: main
diff_base: 72068eda9c517330f39320c3cf6360a26a88ffb4
---

# Genesis reads its marks, and a consistency test bans stand-ins in every driver

## Goal

The genesis driver's MENUS gate advances on a menu file's presence even when the recorded
registry check never ran, and its design-stage states re-check artifact files behind marks
that were only set after those files were verified. Both read a stand-in for a fact the
driver already records. This spec makes those decisions read the record, and adds the
consistency test that keeps every driver's `deriveState()` free of file-count and
file-presence calls, so the class fixed by 20261024/01 cannot return silently.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `menusCheck()` reads `status.menus[key]` (written by `menu-written` after registry-check.js ran) and the `## Picks` line; it never calls `hasMenuFile`. `menus-done` refuses naming every open dimension with no `status.menus` record (AC-20261024-02-1, AC-20261024-02-2) | A hand-written or broken menu file advanced the run to DECIDE with `status.menus` empty (spike 2026-10-24); the record is the fact. |
| D2 | `deriveState()` in genesis-driver.js reads `status.marks.designBriefWritten` and `status.marks.designApproved` alone; the two `fs.existsSync` artifact checks beside them are removed. The mark handlers already verify the artifacts before setting the marks (AC-20261024-02-3, AC-20261024-02-4) | Mark-and-file was two derivations of one fact; the handlers are the verification point, the derivation reads the result. |
| D3 | A consistency test reads the source of `deriveState()` in the five drivers (review, build, genesis, prototype, mocks) and fails on any `existsSync(`, `readdirSync(`, `listManifestNumbers(` or `Math.max(...listManifestNumbers` call inside the function body; it also fails on `Math.max(...listManifestNumbers` anywhere in spec-review-driver.js (AC-20261024-02-5, AC-20261024-02-6) | Behaviour tests pin each incident; this is the one structural pin for the class (core § Incident Policy: third recurrence earns a deterministic guard — the audit counted 13 of 62 fix diffs). |
| D4 | The test extracts each function body by brace matching from `function deriveState(` to its closing brace at column 0 (AC-20261024-02-6) | A regex over the whole file would ban legitimate presence checks inside mark handlers; only the derivation is banned. |
| D5 | Build ruling (2026-10-24): AC-20261024-02-4's `reuses tests/genesis/genesis-driver.test.js :: review finding F1 (D4)` pointer named a test about the MENUS dropped-option re-print, and no existing test pins the `design-brief-written` refusal on an absent `design-paths.json`. The pin moves to a new green-expected file, tests/genesis/design-brief-refusal.test.js (AC-20261024-02-4) | A1's verification point is the handler; D2 removes the second check, so the handler's refusal needs its own pin, and a CONTINUE-TO pin cannot share the red-expected menus-recorded file. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/genesis-driver.js | MODIFY | scripts | D1 `menusCheck` on `status.menus`; D2 mark-only design checks in `deriveState()`; `hasMenuFile` kept only for the MENUS step text that lists written files |
| spec/.claude-plugin/plugin.json | MODIFY | scripts | `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| tests/genesis/menus-recorded.test.js | CREATE | tests | AC-20261024-02-1, AC-20261024-02-2, AC-20261024-02-3, AC-20261024-02-4 |
| tests/consistency/no-stand-ins.test.js | CREATE | tests | AC-20261024-02-5, AC-20261024-02-6 |
| tests/genesis/design-brief-refusal.test.js | CREATE | tests | AC-20261024-02-4 (D5) |

## Contracts

```js
// genesis-driver.js
function menusCheck() {
  const open = openDimensionKeys(), pks = picks()
  const missing = open.filter((k) => !(k in status.menus) || !(k in pks))
  return { ok: missing.length === 0, missing }
}
```

```js
// tests/consistency/no-stand-ins.test.js — the banned call list, one array, exported for the message
const BANNED = ['existsSync(', 'readdirSync(', 'listManifestNumbers(', 'Math.max(...listManifestNumbers']
const DRIVERS = ['spec-review-driver.js', 'spec-build-driver.js', 'genesis-driver.js', 'prototype-driver.js', 'mocks-driver.js']
```

## Behavior

- `menu-written --file m.json` runs registry-check.js and records `status.menus[dimension]`; a
  menu file written by hand and never marked leaves no record, so `menus-done` refuses naming that
  dimension and the derived state stays MENUS.
- The MENUS step text still lists the menu files on disk so the session sees what it wrote; only
  the gate reads the record.
- A session that marks `design-brief-written` and then deletes `docs/design/brief.md` resumes at
  the next state; the deletion is caught by the step that reads the brief, not by `deriveState()`.

## Acceptance Criteria

- **AC-20261024-02-1**: WHEN `interview-research/<key>.json` exists for an open dimension but `menu-written` was never marked for it THE SYSTEM SHALL refuse `--mark menus-done` (exit 2) naming `<key>`, and `--state` SHALL print `MENUS` → writes tests/genesis/menus-recorded.test.js
- **AC-20261024-02-2**: WHEN every open dimension has a `status.menus` record and a `## Picks` line THE SYSTEM SHALL accept `menus-done` and derive the next state (the record alone is sufficient; the test deletes the menu files after marking to prove presence is not read) → writes tests/genesis/menus-recorded.test.js
- **AC-20261024-02-3**: WHEN `status.marks.designBriefWritten` is true THE SYSTEM SHALL derive the post-brief state without reading `docs/design/brief.md` or `design-paths.json` (the test removes both after the mark) → writes tests/genesis/menus-recorded.test.js
- **AC-20261024-02-4**: WHEN `--mark design-brief-written` runs with `design-paths.json` absent THE SYSTEM SHALL CONTINUE TO refuse naming the file → writes tests/genesis/design-brief-refusal.test.js
- **AC-20261024-02-5**: WHEN the consistency test reads the five drivers THE SYSTEM SHALL find zero banned calls inside each `deriveState()` body and zero `Math.max(...listManifestNumbers` occurrences anywhere in spec-review-driver.js → writes tests/consistency/no-stand-ins.test.js
- **AC-20261024-02-6**: WHEN a driver source is given in which `deriveState()` contains `fs.existsSync(` THE SYSTEM SHALL fail the test naming the driver and the call (the test exercises its own checker against a fixture string, not the live file) → writes tests/consistency/no-stand-ins.test.js

## Assumptions (escalation triggers)

- A1: `handleDesignBriefWritten` and `handleDesignApproved` verify their artifacts before setting the marks (genesis-driver.js ~960–1010 and ~1328–1380 die on a missing or invalid file) — **if false:** add the verification to the handler, never back into `deriveState()`.
- A2: with 20261024/01 landed, spec-review-driver.js's `deriveState()` reads `marks.iteration` and `readManifestRows` only — **if false:** the build of this spec is blocked on 01; `depends_on` carries it.
- A3: AC-20261024-02-4's reused test title prefix `review finding F1 (D4)` is unique in its file — **if false:** grow the prefix at build.

## Rationale

The audit's spike wrote `not json{{{` into a menu file, never marked `menu-written`, and
marked `menus-done`: exit 0, `status.menus` empty, state DECIDE. The registry check is the
reason the MENUS state exists; a file's presence proves nothing about it. The design-stage
checks are the same shape in the other direction: the handler verifies, then the derivation
verifies again from disk, so the two can disagree (a moved artifact) and the resume lands in
the wrong state.

D3 is the one standing guard this work earns. Core's Incident Policy asks for a third
recurrence and a deterministic script; the recurrence count is 13 of 62 sampled fix diffs
in 90 days (audit 2026-10-24), the guard is a test with an exit code, and it is removable:
"how many `fix(` commits in the last 90 days touched a `deriveState()` body?" answered by
`git log -L` is the kill query. Build-driver's "ledger row present means DONE" and the
genesis MENUS step text's file listing are deliberately outside the ban: the first is a
read of the recorded fact (the row), the second is display, not derivation.

## Canonical Delta

docs/canonical/genesis.md, MENUS: "The MENUS gate reads `status.menus` (written by
`menu-written` after registry-check.js) and the `## Picks` line; a menu file's presence is
display, never the gate." docs/canonical/scripts.md: "Every driver's `deriveState()` reads
recorded marks and evidence rows, never file presence or counts;
tests/consistency/no-stand-ins.test.js pins it."
