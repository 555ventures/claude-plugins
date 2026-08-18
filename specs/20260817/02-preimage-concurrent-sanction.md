---
date: 2026-08-17
status: superseded
open_markers: 0
risk: T2
area: spec-pipeline
design: false
breaking: false
depends_on: ["specs/20260816/01-gate-baseline-reconcile.md"]
depended_on_by: []
brief: n/a
---

# Pre-image concurrent-sanction subtraction — a mid-build declared pin never false-blocks Phase 4

## Goal

`/spec:build` Phase 4's suite pre-image check (`suite-baseline.js --check --pre`,
specs/20260814/03 D10) BLOCKs on `preNewFailing > 0` on the premise that a test failing now
but absent from the Phase 0 pre-image was broken by this build's diff. The pre-image binds to
a single instant and assumes exclusive repo access — but concurrent sessions in this repo are
normal (the semver-race Gotcha exists for exactly that). Observed 2026-08-17 during the build
of specs/20260816/03: a parallel session landed INTAKE JJ-20260817-01's two sanctioned-red TDD
pins (new test file + `.claude/suite-baseline.json` rows, committed as `f85d07a`) between the
snapshot (11:28:08) and Phase 4 (~11:35) — `preNewFailing=2`, a false BLOCK whose only honest
resolution was out-of-band forensics (restore the pre-change file, re-run, diff the output;
full write-up in specs/20260816/03-file-plan-table-scoped-parsing.deviations.md). Done means:
a row that is sanctioned in the declared baseline **but was not sanctioned when this build's
snapshot was taken** is subtracted from `preNewFailing` — loudly, one line per row plus a
count — so a mid-build declared pin is attributed to its declaration, never to this build's
diff; a pin this build's diff genuinely broke SHALL CONTINUE TO BLOCK; and a legacy pre-image
without the new field behaves byte-identically to today.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `--snapshot` additionally records the declared baseline as seen at snapshot time: the pre-image JSON gains `"sanctioned": [{"file":…,"name":…},…]` — every row of `.claude/suite-baseline.json` (flaky rows included, the `flaky` key itself dropped), sorted by file then name; absent baseline file → `"sanctioned": []`. A corrupt baseline at snapshot time exits 2 exactly as `--check` already does (same `readBaselineFile` path). The `failing` key and every other `--snapshot` behavior are unchanged. | Attribution needs the sanctioning *delta*, and only the snapshot can capture the "before" set — timestamps and git archaeology are exactly the forensics this spec deletes. Recording the whole set (not a hash) keeps the check a pure set operation on data the script already owns. |
| D2 | `--check --pre` computes `newlySanctioned` = current baseline rows (flaky included) whose `(file,name)` key is absent from the pre-image's `sanctioned` array, and excludes those keys from `preNewFailing`. Each excluded observed row prints `PRE-SANCTIONED <file> :: <name>` (before the pre summary line), and the pre summary line extends to `preNewFailing=<N> preFixed=<M> preSanctioned=<K>` (K = excluded observed rows; K=0 prints too — the count is always present when `--pre` is given). `preFixed`, both baseline directions, the flaky exemption, and all exit codes are unchanged — a PRE-SANCTIONED row is by construction already in the current baseline, so it never counts toward `newFailing` and never affects the drift exit. | A row sanctioned **after** the snapshot can only have been declared by an actor other than this build's Phase 0 state — a concurrent session's intake pins, or this build's own File-Plan-planned baseline rows; either way the declaration, not this diff, owns the red. Subtracting the *whole* current baseline instead was rejected: a stale (fixed-not-removed-state) row that predates the snapshot would then mask a test this build genuinely re-broke — the delta form keeps that case blocking (AC-3). |
| D3 | Legacy pre-image compatibility, fail-conservative: a `--pre` file with no `sanctioned` key (or a non-array one) is treated as `newlySanctioned` = empty — zero subtraction, `preSanctioned=0`, `preNewFailing` computed exactly as today. Never inferred, never guessed from the current baseline. | Pre-images are per-build gitignored scratch; the compat window is one in-flight build. Guessing a snapshot-time baseline from the current one is the unsound whole-set subtraction D2 rejects — absence of evidence must degrade to today's behavior, not to a wider subtraction. |
| D4 | build.md's Phase 4 D10 block: the four-way disposition stays verbatim; one addition states the new output — `preSanctioned > 0` is **informational, never a disposition**: those rows are sanctioned by a declaration that postdates this build's snapshot (a concurrent session's pins, or this spec's own planned baseline rows), are attributed to that declaration and never to this build's diff, and never enter the repair path. | The 2026-08-17 incident's repair loop was structurally incapable of fixing the class (the only "repair" was implementing an unrelated INTAKE item) — the same category error as JJ-20260815-08 (unprovisioned env) and JJ-20260816-03 (sanctioned gate reds); doctrine must state the routing so it survives as a testable claim. |
| D5 | scaffold-ledger.md row 97 (Suite baseline): the mechanism text gains "pre-image records the snapshot-time sanctioned set; `--check --pre` subtracts only rows sanctioned *after* the snapshot (`PRE-SANCTIONED`, loud), so a concurrent session's declared pins never false-block Phase 4"; a re-examine falsifier is appended: re-examine if a `PRE-SANCTIONED` subtraction is ever contradicted by review's whole-suite `newFailing` finding surviving disposition as this build's own defect. Promote/retire conditions unchanged. | No new mechanism, no new row — this amends the existing guard, and its falsifier must be named (the 01-D8 precedent). |
| D6 | Deliberately NOT done, each with its reopen: (i) file-nonexistence-at-snapshot subtraction (birthtime/git heuristics; misses new failing tests added to *existing* files — the pin-retag carrier — and would silently downgrade an **undeclared** concurrent red from BLOCK to a mislabeled WARN); (ii) an execution-attribution leg re-running `preNewFailing` rows against pre-change file contents (re-pays the detached-base-tree trap D3 of specs/20260814/03 explicitly killed); (iii) any change to `--gate` (specs/20260816/01's mode — disjoint concern). Residual, recorded: an **undeclared** concurrent red landing mid-build still BLOCKs — fail-closed and correct (nobody sanctioned it; someone must adjudicate) — reopen (i) as its own spec on the first observed false-block of that shape. | The observed incident is fully closed by the declaration delta; every rejected alternative either weakens the real signal or re-buys a killed trap. Fencing keeps the blast radius at one script mode + one doctrine paragraph. |
| D7 | Version bump target: spec plugin 6.87.0 (target, not a pin — build bumps to the next free per Gotchas), description = changelog sentence. | House rule. |

## File Plan

<!-- Machine-consumed: /spec:build parses this table into workflow batches. -->

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/suite-baseline.js | MODIFY | scripts | D1–D3: snapshot writes `sanctioned`; check computes newlySanctioned subtraction, PRE-SANCTIONED lines, `preSanctioned=<K>` summary; header incident note (2026-08-17 false BLOCK), pre-image shape + output grammar comment updated; exit codes unchanged |
| spec/commands/build.md | MODIFY | doctrine | D4: the `preSanctioned` informational clause inside the Phase 4 D10 block — additive, the four bullets stay verbatim |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D5: Suite-baseline row mechanism text + appended re-examine falsifier |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | claims ratchet — one whole-corpus regeneration at batch end covers the build.md/scaffold-ledger.md line-count changes |
| spec/.claude-plugin/plugin.json | MODIFY | other | D7: bump to 6.87.0 (or next free), description = changelog |
| tests/suite-baseline/suite-baseline.test.js | MODIFY | tests | AC-20260817-02-1, AC-20260817-02-2, AC-20260817-02-3, AC-20260817-02-4, AC-20260817-02-5 (5 = tag BOTH existing tests AC-20260814-03-15 AND AC-20260814-03-17, never duplicate) |
| tests/suite-baseline/doctrine.test.js | MODIFY | tests | AC-20260817-02-6 |

## Contracts

```text
# Pre-image JSON (written by --snapshot; extended, additive):
{"failing":[{"file":…,"name":…},…],
 "sanctioned":[{"file":…,"name":…},…]}   # the declared baseline at snapshot time, flaky rows
                                          # included (flaky key dropped), sorted file-then-name;
                                          # absent baseline file → []

# --check --pre output (extended; baseline lines/summary and exit codes unchanged):
PRE-SANCTIONED <file> :: <name>           # observed failing, absent from pre-image failing,
                                          # sanctioned NOW but NOT sanctioned at snapshot —
                                          # one line per row, before the pre summary
PRE-NEW-FAILING <file> :: <name>          # unchanged: observed, absent from pre-image failing,
                                          # not flaky-exempt, not newly sanctioned
preNewFailing=<N> preFixed=<M> preSanctioned=<K>   # K always printed when --pre is given
# Legacy --pre file (no `sanctioned` array): zero subtraction, preSanctioned=0,
#   preNewFailing byte-identical to today. Missing/corrupt --pre file: exit 2, unchanged.

# build.md Phase 4 D10 (D4 — additive clause; the four dispositions stay verbatim):
#   preSanctioned > 0 → informational, never a disposition: rows sanctioned by a declaration
#   that postdates the snapshot are attributed to that declaration (a concurrent session's
#   pins, or this spec's own planned baseline rows), never this build's diff, and never enter
#   the repair path.
```

## Behavior

- The incident, replayed: concurrent session lands `tests/x.test.js` (red) + its two baseline
  rows mid-build. Phase 4: both rows are in the current baseline but not in the pre-image's
  `sanctioned` array → two `PRE-SANCTIONED` lines, `preNewFailing=0 … preSanctioned=2`, no
  BLOCK, no repair round, no forensics. They are baselined, so `newFailing=0` too.
- A red-carrier intake spec built through the pipeline (its own File Plan adds sanctioned-red
  TDD pins + their baseline rows): its own deliberate reds are newly sanctioned by Phase 4 →
  subtracted, no self-inflicted false BLOCK — previously this class would also have blocked.
- This build's diff breaks a green test: not in any baseline → `preNewFailing` ≥ 1 → BLOCKs
  exactly as today (AC-2's second leg).
- This build re-breaks a test whose stale baseline row predates the snapshot: the row is in
  the pre-image's `sanctioned` array → not newly sanctioned → still `preNewFailing` → BLOCKs
  (AC-3). Fail-closed on the one shape where declaration and attribution disagree.
- An undeclared concurrent red (new failing test, no baseline row by Phase 4): still BLOCKs —
  the D6 residual, honest and recorded.
- Old script reading a new pre-image: `readBaselineFile` validates only the `failing` array —
  extra keys are ignored (A1). New script reading an old pre-image: D3's zero-subtraction path.

## Acceptance Criteria

<!-- Test authors derive tests from this spec alone. All fixtures are synthetic hosts in
     tmpdir() via runNode, the existing suite-baseline.test.js pattern. -->

- **AC-20260817-02-1**: WHEN `--snapshot` runs in a host whose `.claude/suite-baseline.json`
  declares rows THE SYSTEM SHALL write the pre-image with a `sanctioned` array equal to the
  declared rows' `{file,name}` pairs sorted file-then-name with no `flaky` key (literal:
  baseline `[{file:"t.test.js",name:"x",flaky:true}]` → snapshot `sanctioned:
  [{"file":"t.test.js","name":"x"}]`); and WHEN the baseline file is absent it SHALL write
  `"sanctioned": []`; and WHEN the baseline file is corrupt JSON it SHALL exit 2 naming the
  remedy with no file written (a new exit-2 trigger for `--snapshot` — today's snapshot never
  reads the baseline at all) → tests/suite-baseline/suite-baseline.test.js
- **AC-20260817-02-2**: WHEN `--check --pre` runs with a pre-image whose `sanctioned` array
  is empty and the current baseline declares failing test Y (absent from the pre-image's
  `failing`) THE SYSTEM SHALL print `PRE-SANCTIONED <file> :: Y`, report
  `preNewFailing=<N> preFixed=<M> preSanctioned=1`, and exclude Y from `preNewFailing`; and a
  simultaneously failing test Z in NO baseline SHALL still count toward `preNewFailing`
  (literal: Y and Z both fail, baseline holds only Y, pre-image `failing:[] sanctioned:[]` →
  `preNewFailing=1` naming only Z, `preSanctioned=1` naming only Y) →
  tests/suite-baseline/suite-baseline.test.js
- **AC-20260817-02-3**: WHEN the pre-image's `sanctioned` array already contains Y (sanctioned
  at snapshot time) and Y fails while absent from the pre-image's `failing` THE SYSTEM SHALL
  count Y toward `preNewFailing` with `preSanctioned=0` — a stale declared row that predates
  the snapshot proves nothing about a mid-build landing and must stay blocking (literal: same
  fixture as AC-2's Y but pre-image `sanctioned:[Y]` → `preNewFailing=1`) →
  tests/suite-baseline/suite-baseline.test.js
- **AC-20260817-02-4**: WHEN the `--pre` file lacks a `sanctioned` key THE SYSTEM SHALL apply
  zero subtraction — `preSanctioned=0`, no `PRE-SANCTIONED` line, and `preNewFailing` computed
  exactly as before the field existed (literal: AC-2's fixture minus the pre-image's
  `sanctioned` key → `preNewFailing=2`, `preSanctioned=0`) →
  tests/suite-baseline/suite-baseline.test.js
- **AC-20260817-02-5**: WHEN a test fails that is absent from the pre-image and in no baseline
  THE SYSTEM SHALL CONTINUE TO attribute it as `PRE-NEW-FAILING` with the pre summary counting
  it, and WHEN `--pre` names a missing file it SHALL CONTINUE TO exit 2 — tag the existing
  AC-20260814-03-15 and AC-20260814-03-17 tests with this AC-ID, never duplicate them →
  tests/suite-baseline/suite-baseline.test.js
- **AC-20260817-02-6**: WHEN build.md's Phase 4 suite pre-image block is read THE SYSTEM SHALL
  state that `preSanctioned` rows are informational — sanctioned by a declaration postdating
  the snapshot, attributed to that declaration and never this build's diff, and never entering
  the repair path — and the four-way disposition SHALL CONTINUE TO name `preNewFailing` as the
  only BLOCKing axis → tests/suite-baseline/doctrine.test.js

## Assumptions (escalation triggers)

- A1 (read at HEAD, suite-baseline.js:81–96): `readBaselineFile` validates only that the
  parsed JSON has a `failing` array — extra top-level keys pass through untouched — so a
  new-shape pre-image parses under the current script and a `--pre` file keeps its exit-2
  corrupt-file contract regardless of the `sanctioned` key. **if false** (a stricter shape
  check landed since): extend the check to tolerate the key, never loosen the exit-2 paths.
- A2 (read at HEAD, tests/suite-baseline/suite-baseline.test.js:271, 286): the existing pre
  summary pins are unanchored substring regexes (`/preNewFailing=1 preFixed=0/`,
  `/preNewFailing=0/`), so the appended ` preSanctioned=<K>` reddens nothing. **if false**
  (an anchored pin exists somewhere the sweep missed): retag the colliding pin in place with
  this spec's AC-ID per § Gotchas, never weaken.
- A3: specs/20260816/01 lands first (`depends_on`) — it MODIFIES the same script (adding
  `--gate`), the same header block, and the same two test files. The two changes are disjoint
  functions and disjoint modes; the exit-code alphabet is changed by neither. **if false /
  textual conflict at build:** rebase this spec's hunks onto the landed script; the header's
  usage/exit-codes list is the only expected merge point.
- A4 (grepped 2026-08-17): the pre-image vocabulary (`preNewFailing`, `PRE-NEW-FAILING`,
  `.claude/spec-preimage/`) has exactly three consumers — build.md's D10 block,
  scaffold-ledger row 97, and tests/suite-baseline/ — no workflow body, fragment, or other
  command reads it, so the grammar extension touches no generated surface. **if false:** STOP
  and consult the retainer — a fourth consumer means the closed-alphabet assumption is wrong.
- A5: specs/20260816/02 also MODIFIES build.md, at Phase 0 step 3's wrap point — disjoint
  from this spec's Phase 4 hunk; both additive. **if false / same-region conflict:** rebase,
  keep D10's four bullets verbatim, record the deviation.

## Rationale

The pre-image mechanism (specs/20260814/03 D3a/D10) answers "did *this build* cause it?" by
comparing two instants of one axis: the observed failing set. The 2026-08-17 incident showed
the axis is incomplete — the *sanctioning declaration* also moves between the two instants,
and a row that gained sanction mid-build is provably not this build's diff (the declaration
is a deliberate, recorded act by whoever landed it). Recording the baseline's snapshot-time
row set makes attribution a pure set delta on data the script already owns: no timestamps,
no birthtime, no git, no second tree — the same portability argument that shaped D3a.

The chosen delta form is the narrowest sound subtraction. Whole-current-baseline subtraction
masks a build-re-broken test behind any stale row; file-nonexistence heuristics miss the
new-test-in-existing-file carrier and mislabel undeclared reds; execution attribution re-buys
the killed detached-tree trap (all in D6 with reopens). The loud `PRE-SANCTIONED` lines and
always-present count follow the repo's subtraction-honesty doctrine (specs/20260816/01 D6,
/02 D2): greenness resting on the baseline trust surface is always visible, never silent.
JJ's approved default (2026-08-17, "ignore failing tests whose file didn't exist when it took
its snapshot") named mechanism (i); this spec derives the declaration-delta form instead
because it covers the observed incident *and* the new-test-in-existing-file carrier while
keeping the undeclared-red case fail-closed — announced as a derived pick, veto per D6's
reopen. 📌 Auto-picked declaration-delta over file-existence — same incident coverage,
no filesystem heuristics, undeclared reds stay blocking (veto anytime).

Fragile spots for build: the `sanctioned` array must drop the `flaky` key (D1) so the
pre-image never becomes a second place flakiness is declared; `newlySanctioned` keys use the
same `\0`-joined `(file,name)` key as every other comparison (the `keyOf` escape incident —
two-character escape, never a raw NUL byte); the `PRE-SANCTIONED` lines print before the pre
summary so the existing line-order pins hold; K counts *observed excluded rows*, not the size
of the newlySanctioned set (a newly sanctioned row that isn't failing prints nothing).

Adversarial check (1 refuter, T2, 2026-08-17) — both findings ACCEPTED and folded: (MEDIUM)
the File Plan row's retag parenthetical named only AC-20260814-03-15 while AC-5's SHALL text
names both -15 and -17 — a worker batching off the row would under-fulfill the AC; the row now
names both. (LOW) D1's corrupt-baseline-at-snapshot exit 2 is a genuine behavior change
(today's `--snapshot` never reads the baseline) that no AC exercised; AC-1 gains the leg
(exit 2, remedy named, no file written). The refuter executed A1's tolerance claim against the
live script (a `--pre` file carrying an extra `sanctioned` key parses and compares normally)
and verified A2's regex citations, AC-2/3/4 fixture arithmetic, A4's consumer sweep, and
non-contradiction with specs/20260816/01 and /02. It independently confirmed a pre-existing
collision that belongs to 01, not this spec: 01's D5 step-3 wrap will redden
tests/suite-baseline/doctrine.test.js's `doesNotMatch(step3, /suite-baseline/)` pin
(AC-20260814-03-12) — the file is in 01's File Plan, so its build retags in place per
§ Gotchas; flagged to JJ at this spec's lock report.

No collision-closure run at lock: no Decision retires or narrows a doctrine literal — every
doctrine edit is additive (the specs/20260816/01 precedent).

## Canonical Delta

None — plugin doctrine edits are the delta itself (repo precedent).
