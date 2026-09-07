---
date: 2026-09-07
status: hardened
tier: standard
area: pipeline-gates
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-07
open_markers: 0
---

# AC-drift backfill: retire or tag the 41 uncited criteria, then hold this repo at zero

## Goal

`ac-drift.js` (doctor check 17, specs/20260906/01) reports 41 acceptance criteria across 13
done specs that no test cites and no sanction covers. Every row was classified at plan time
(Assumptions A1): 38 describe surfaces a later spec or ruling deleted, 1 is covered by two
tests whose titles carry a suffixed id the full-token rule does not count, and 2 pin a
plugin changelog line that the last-3-versions rotation has since rolled off. Done means: each
bullet carries the `[retired: <path>]` provenance that retired it or the test carries the bare
id; `ac-drift --root .` prints zero findings on this repo; and one standing test in this
repo's suite keeps it at zero (JJ ruling 2026-09-07 — this repo blocks on drift; every other
host keeps the advisory doctor check and the advisory review-close line from
specs/20260907/01).

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | A RETIRED row gets ` [retired: <path>]` appended as the bullet's bare trailing tag (after any existing `→ test` reference is removed, since the test no longer exists), the path being the spec or ADR named per row in Contracts; bullet text is otherwise untouched (AC-20260907-02-1) | `[retired:]` is provenance (ac-drift D3): the record of what killed the surface, never a live link. The same `extractTag` slot/trailing grammar the review-time tags use |
| D2 | The two changelog-line criteria (`specs/20260830/02` AC-5, `specs/20260830/03` AC-6) cite `[retired: specs/20260820/08-config-name-ban.md]` — the spec whose AC-20260820-08-14 fixed the changelog at the last three versions, which is what expired both claims (AC-20260907-02-1) | A claim built on a rotating surface retires itself by that surface's rule; asserting `version ≥ 7.39.0` forever would be a test of nothing. Rejected: leaving two residual findings |
| D3 | The three SessionStart-queue-hook criteria (`specs/20260823/08` AC-11/12/13) cite `[retired: docs/adr/0009-session-queue-hook-removed.md]`, an ADR the **planning session authored at this lock** (Contracts carry it verbatim; `docs/roadmap/15-derived-session-queue.md` gains the `Amended by: ADR-0009` backlink in the same planning commit) — build workers never write it (AC-20260907-02-1) | The hook was deleted by a bare chore commit (0a7f8ef, JJ ruling 2026-08-30) with no spec; a `[retired:]` value must be a `specs/` or `docs/adr/` path, and ADR authorship is the planning seat's (ADR-0003) |
| D4 | The TAG row: the two `tests/ac-matrix/rejected-trailing-tag.test.js` titles beginning `AC-20260823-03-13a:` / `AC-20260823-03-13b:` gain the bare token — `AC-20260823-03-13 / AC-20260823-03-13a: …` — test bodies untouched (AC-20260907-02-2) | `acIdOccurs` is full-token: `…-13a` never cites `…-13` (executed, specs/20260907/01 A3). Tagging beats duplicating the test |
| D5 | New `tests/doctor/ac-drift-clean.test.js`: executes `node spec/scripts/ac-drift.js --root <ROOT> --json` against this repository and asserts exit 0 with an empty `findings` array, printing every finding's `spec ac detail` in the assert message (AC-20260907-02-1) | JJ 2026-09-07: this repo's suite fails on new drift so a split or waive that orphans a criterion is caught in the same review run that caused it (the whole-suite leg runs the file). Other hosts are untouched — the plugin ships no such test |
| D6 | No plugin version bump: nothing under `spec/` changes; the standing test is host-local to this repository [no-ac: the absence of a bump is not a testable surface; `tests/consistency/plugin-version.test.js` keeps its form] | Version discipline binds behaviour changes of the plugin; a repo-hygiene test is not one |
| D7 | `specs/20260906/01-ac-drift-doctor-check.md`'s worked example (Contracts, the `[retired:]` line citing `specs/20260830/01-session-queue-removal.md`) is corrected to cite `docs/adr/0009-session-queue-hook-removed.md` [no-ac: a done spec's example prose; the dangling path is the defect, and no script reads it] | The cited spec never existed (dangling-reference class); the ADR D3 authors is the real record |
| D8 | File Plan carries 16 rows, over the ~15 guideline: 13 are one-tag spec edits and slicing them by date would be slicing by nothing — one landing unit, one wave [no-ac: decomposition note] | The cap exists so one build fits one run; sixteen one-line edits do |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| specs/20260817/06-overrides-legacy-keys.md | MODIFY | other | D1: AC-1, AC-2, AC-4 → `[retired: specs/20260820/01-autopilot-removal.md]` |
| specs/20260823/03-silent-drop-hardening.md | MODIFY | other | D1: AC-12 → `[retired: specs/20260824/02-design-stage-on-render-gate.md]` |
| specs/20260823/08-derived-session-queue.md | MODIFY | other | D1/D3: AC-10 → `[retired: specs/20260903/03-pipeline-queue-mechanics.md]`; AC-11, AC-12, AC-13 → `[retired: docs/adr/0009-session-queue-hook-removed.md]` |
| specs/20260825/04-genesis-driver.md | MODIFY | other | D1: AC-1 → `[retired: specs/20260902/08-genesis-shrink-brief-state.md]` |
| specs/20260827/01-genesis-tournament.md | MODIFY | other | D1: AC-5 → `[retired: specs/20260902/08-genesis-shrink-brief-state.md]` |
| specs/20260827/02-genesis-explore-state.md | MODIFY | other | D1: AC-1, AC-2, AC-4, AC-5, AC-6 → `[retired: specs/20260902/08-genesis-shrink-brief-state.md]` |
| specs/20260827/03-genesis-design-state.md | MODIFY | other | D1: AC-2, AC-3, AC-4 → `[retired: specs/20260902/08-genesis-shrink-brief-state.md]` |
| specs/20260830/02-close-gate-rerun.md | MODIFY | other | D2: AC-5 → `[retired: specs/20260820/08-config-name-ban.md]` |
| specs/20260830/03-ci-leg-honest-absence.md | MODIFY | other | D2: AC-6 → `[retired: specs/20260820/08-config-name-ban.md]` (its mid-sentence `[oracle: gate]` stays as prose; the trailing tag is the declaration) |
| specs/20260901/03-unified-build-loop.md | MODIFY | other | D1: AC-2, AC-3, AC-4 → `[retired: specs/20260901/09-disposer-gate.md]` |
| specs/20260901/04-shell-composed-mocks.md | MODIFY | other | D1: AC-14 → `[retired: specs/20260902/08-genesis-shrink-brief-state.md]` |
| specs/20260901/05-checkpoint-fail-closed.md | MODIFY | other | D1: AC-1, AC-2, AC-3, AC-4, AC-5, AC-10 → `[retired: specs/20260901/09-disposer-gate.md]` |
| specs/20260905/02-design-review-hub-and-look-stops.md | MODIFY | other | D1: AC-1..AC-8, AC-17, AC-19 → `[retired: specs/20260905/04-per-project-look-server.md]` |
| specs/20260906/01-ac-drift-doctor-check.md | MODIFY | other | D7: the worked example's `[retired:]` path → `docs/adr/0009-session-queue-hook-removed.md` |
| tests/ac-matrix/rejected-trailing-tag.test.js | MODIFY | tests | AC-20260907-02-2 — D4: bare `AC-20260823-03-13` token prefixed to the two `-13a`/`-13b` titles |
| tests/doctor/ac-drift-clean.test.js | CREATE | tests | AC-20260907-02-1 |

## Contracts

Per-row citation table (Assumptions A1 is the evidence; workers apply this table, never
re-derive it):

```
spec                                                    AC        retired-by
specs/20260817/06-overrides-legacy-keys.md              1, 2, 4   specs/20260820/01-autopilot-removal.md
specs/20260823/03-silent-drop-hardening.md              12        specs/20260824/02-design-stage-on-render-gate.md
specs/20260823/08-derived-session-queue.md              10        specs/20260903/03-pipeline-queue-mechanics.md
specs/20260823/08-derived-session-queue.md              11,12,13  docs/adr/0009-session-queue-hook-removed.md
specs/20260825/04-genesis-driver.md                     1         specs/20260902/08-genesis-shrink-brief-state.md
specs/20260827/01-genesis-tournament.md                 5         specs/20260902/08-genesis-shrink-brief-state.md
specs/20260827/02-genesis-explore-state.md              1,2,4,5,6 specs/20260902/08-genesis-shrink-brief-state.md
specs/20260827/03-genesis-design-state.md               2,3,4     specs/20260902/08-genesis-shrink-brief-state.md
specs/20260830/02-close-gate-rerun.md                   5         specs/20260820/08-config-name-ban.md
specs/20260830/03-ci-leg-honest-absence.md              6         specs/20260820/08-config-name-ban.md
specs/20260901/03-unified-build-loop.md                 2,3,4     specs/20260901/09-disposer-gate.md
specs/20260901/04-shell-composed-mocks.md               14        specs/20260902/08-genesis-shrink-brief-state.md
specs/20260901/05-checkpoint-fail-closed.md             1,2,3,4,5,10  specs/20260901/09-disposer-gate.md
specs/20260905/02-design-review-hub-and-look-stops.md   1..8,17,19    specs/20260905/04-per-project-look-server.md
```

Tag placement (D1) — the bare trailing run, after the bullet's last word, the `→ tests/…`
reference removed when its file no longer exists:

```
before: - **AC-20260905-02-3**: WHEN `design-hub.js config --base …` runs THE SYSTEM SHALL … → tests/design-hub.test.js
after:  - **AC-20260905-02-3**: WHEN `design-hub.js config --base …` runs THE SYSTEM SHALL … [retired: specs/20260905/04-per-project-look-server.md]
```

`docs/adr/0009-session-queue-hook-removed.md` (D3 — authored by the planning session at
lock; reproduced so the cold reader knows what the citation points at):

```
# 0009. The SessionStart queue hook is removed: /spec:queue is the on-demand surface

- Status: accepted · Date: 2026-08-30 (recorded 2026-09-07) · Deciders: JJ
- Applies to: brief 15 (derived session queue) — the "SessionStart surfacing" mechanism and
  the `hello` subcommand; specs/20260823/08 AC-11/12/13 retired.
- Amended by: —
Context / Decision / Consequences: no session-start injection of queue items, ever; the
queue is read on demand via /spec:queue and folded into /spec:status --next.
```

`tests/doctor/ac-drift-clean.test.js` (D5):

```js
// specs/20260907/02-ac-drift-backfill.md AC-20260907-02-1 — this repository holds zero AC-pin
// drift: every done spec's criterion is cited by a test or carries [retired:]/[oracle:]/
// [pre-green:]/SHALL CONTINUE TO. Fails the moment a split, waive, or retirement orphans one.
test('AC-20260907-02-1: ac-drift --root <this repo> --json exits 0 with zero findings', …)
```

## Behavior

Build is one wave of text edits plus one test file. The worker applies the Contracts table
row by row; `ac-drift --root .` is the worker's own check after each spec file. The standing
test then executes against the real tree in the suite, the build's final gate, and every
future review's whole-suite leg.

## Acceptance Criteria

- **AC-20260907-02-1**: WHEN `node spec/scripts/ac-drift.js --root <repository root> --json` runs against this repository THE SYSTEM SHALL exit 0 with `findings` equal to `[]` and `scanned ≥ 87`, and the plain render SHALL print no `retired-uncited` and no `uncovered-ac` row (today: exit 1, 41 findings across 13 specs) → tests/doctor/ac-drift-clean.test.js
- **AC-20260907-02-2**: WHEN the two rejected-trailing-tag partition tests run THE SYSTEM SHALL CONTINUE TO pass with their titles now beginning `AC-20260823-03-13 / AC-20260823-03-13a:` and `AC-20260823-03-13 / AC-20260823-03-13b:` → tests/ac-matrix/rejected-trailing-tag.test.js

## Assumptions (escalation triggers)

- A1: **Executed classification (2026-09-07)** — every one of the 41 `ac-drift --json` rows was traced to the deleting commit or superseding spec: 38 RETIRED (autopilot removal c6e62c1; design-driver deletion 7c4a9d1; hub deletion 92dd23d; genesis shrink 444f5e0 / specs/20260902/08 D7/D11/D12; disposer gate 479977f / ADR-0005; queue verbs specs/20260903/03; queue hook chore 0a7f8ef), 1 TAG (`-13a`/`-13b` titles), 2 changelog claims (D2). — **if false** (a worker finds a live surface behind a RETIRED row): return `blocked` naming the row; the fallback is a covering test, never a `[retired:]` on a live surface.
- A2: `[retired: docs/adr/0009-session-queue-hook-removed.md]` satisfies ac-drift's citation grammar (`/(^|\s)docs\/adr\//` on the tag value — read at `ac-drift.js` ~line 166) and the ADR file exists at lock (planning commit). — **if false:** STOP, the grammar moved.
- A3: Removing a dead `→ tests/<deleted>.test.js` reference from a retired bullet changes nothing else the pipeline reads: `ac-matrix.js` runs only on the spec under review, `promise-sweep` reads Decisions, `collision-closure` reads File Plans. — **if false:** keep the reference and place the tag after it (the bare trailing run still parses).
- A4: `ac-drift --root <ROOT>` on the real tree takes < 2 s (executed 2026-09-07: 87 specs, 916 criteria); the standing test stays far under the 45 s file budget. — **if false:** the walk is the cost — profile before splitting.
- A5: The two changelog criteria carry no other sanction (`specs/20260830/03` AC-6's `[oracle: gate]` sits mid-sentence and is not a declaration — ac-drift reported the row, which is the executed proof). — **if false:** the row is already clean; skip it.

## Rationale

**Why retire rather than write 38 tests.** Every RETIRED row names a surface that no longer
exists in the tree: the autopilot daemon, the design-driver feed, the machine-wide hub, the
genesis EXPLORE/DESIGN marks, the CHECKPOINT state, the queue's `bump`/`hello`/SessionStart
hook. A test for a deleted surface is a test of absence nobody asked for. `[retired:]` was
added to `ac-drift` for exactly this (specs/20260906/01 D3).

**Why the three hook rows earn an ADR.** The rule is a `specs/` or `docs/adr/` path, and
none exists for a chore-commit deletion made on a verbal ruling. Writing the record is the
planning seat's job (ADR-0003), so it lands at this lock together with brief 15's backlink,
which also cures the brief's stale "SessionStart surfacing" paragraph by amendment rather
than by rewriting history. specs/20260906/01's own worked example cited a spec that never
existed for the same three rows — D7 corrects it.

**Why a blocking test in this repo only.** Asked as a fork on 2026-09-07; JJ chose the suite
test. The plugin's contract for hosts is unchanged (advisory doctor check + advisory review
line); this repository dogfoods a stricter local bar because it is where splits and waives
happen most.

**Why the changelog claims cite 20260820/08.** They asserted "the changelog names X" for a
surface designed to forget X after three releases. The spec that fixed the three-version form
is the reason the claims cannot hold, so it is the honest provenance; an `[oracle:]` retag
would be laundering.

**Fragile.** `[retired:]` must be the bullet's bare trailing run — a backticked tag or one
followed by a `→` reference is refused as a declaration (silent-drop class,
specs/20260823/03). The worker's per-file `ac-drift` run is the check.

## Canonical Delta

None — no `docs/canonical/` in this repo.
