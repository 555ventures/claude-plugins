---
date: 2026-08-10
status: hardened
open_markers: 0
risk: T3
area: pipeline
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
---

# Surface Paths: per-Decision liveness obligation + lock-time path-lint

## Goal

Close the pipeline's dominant escape family — **dead surfaces**: code that typechecks, lints
and tests green but can never execute or renders nothing (~14 recorded instances across hosts;
4 in a single UpWell build on 2026-08-10). The pipeline specifies, batches and verifies at
**file** granularity, while surface liveness is a **path** property (producer → carrier →
consumer → render/registration condition); the File Plan shreds each Decision's end-to-end
path into independent rows and the hops between rows are owned by nobody. This spec gives the
path a home and then attacks it in three layers of increasing strength: a `## Surface Paths`
section with a machine-checkable hop grammar (**form**, blocked at lock by a new
`path-lint.js`), a widened Phase 3 refuter clause (**chain completeness**, at plan time), and
a review path-trace leg plus a mechanical hard finding on unowned hops (**flow**, against built
code). Done = artifact + script + three command duties + pinned tests, ledger-registered,
plugin bumped.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The obligation is authored at **Decision** altitude, in a new `## Surface Paths` section placed directly after `## File Plan` — bullet grammar (`- **P-D{n}**: …`), never a fifth Decisions-table column and never a File Plan column. | The Decision is the only artifact carrying end-to-end intent (the File Plan deliberately destroys it so batches parallelize), so nothing downstream can reconstruct the path; real Decision cells already run 40 lines with nested addenda, where a chained 4–6 hop value wraps unreadably and unparseably. |
| D2 | Hop grammar, split on `→`: each hop names a backticked site plus one verb phrase saying what happens to the value **there**. Every hop's file must be a `## File Plan` row **or** carry `(ro @file:line)` — a cited claim that the value passes through existing, unowned code unchanged. A hop that is neither is a finding. `(ro` (matched only as `(ro ` or `(ro@`, never as a bare substring) without a `@file:line` is a finding, never a warning. | Sites, not files: all four 2026-08-10 escapes were within-file or between-row defects — a path row naming only files degenerates into a restated File Plan. The `(ro `/`(ro@` anchoring is required so a legitimate parenthetical ("(rollback path)", "(rounds down)") cannot false-trigger (refuter A finding 4). |
| D3 | Every path terminates in **evidence**: `AC-{YYYYMMDD-NN}-{n}` (preferred — executable), `catalog:{Component}/{state}` (design-capable hosts; the state must appear in the spec's UI section), or `runtime:{what a human observes}` (weakest — lints as a warning, never silent). The terminal must be the observable the Decision **promises**, not a nearer server-side proxy. | The paper trace substitutes for the integration test layer decomposition doesn't buy; ranking the terminals keeps the executable one the default. The promised-observable rule is what stops the D24 shape — terminating on a handler-level AC while the UI caller that actually had to change goes unnamed. |
| D4 | **Coverage floor is presence, not per-Decision coverage.** Every spec's `## Surface Paths` section must be non-empty at lock: one or more path bullets, or the explicit sanctioned-empty line `- none — {reason ≥ 20 chars}`. Which Decisions get a path stays an in-session lock judgment, like plan.md's existing Goal-promise → Decision → AC trace. A sanctioned-empty spec is **never silent downstream**: the review `paths` leg records `observed:"paths=0 empty-declared"`. | User ruling (2026-08-10, "structural floor only"). Pure policy/naming/no-change Decisions have no path; forcing rows for them is the ceremony that trains authors to pattern-match past the artifact. Presence-with-explicit-empty is host-agnostic (a UI-layer condition needs per-host `layerGroups` knowledge — this repo's layers are doctrine/scripts/workflows and hold no UI). The escape hatch is deliberately cheap and deliberately visible: the reason is unfalsifiable by any script (refuter B finding 3), so the guard is exposure, not verification. |
| D5 | `path-lint --check` **blocks lock**: `/spec:plan` Phase 4 cannot flip `status: hardened` while it exits non-zero. A deliberate, recorded exception to the scaffold-ledger's ADVISORY-first lifecycle. | User ruling (2026-08-10, "blocking at lock"). The exception's reason: the lint verifies *authoring form* — grammar, ownership, citation presence — not a model judgment whose false-positive rate needs calibrating, which is what ADVISORY-first exists for. An advisory lint on an artifact that exists nowhere yet produces zero pressure to author it. |
| D6 | `spec/scripts/path-lint.js` — `[--root <dir>] --spec <path> (--check \| --json) [--built]`. Exit 0 = clean `--check` (warnings allowed) or any `--json`; 1 = `--check` findings; 2 = usage error, unreadable spec, or no `## File Plan` table. File Plan rows resolve **only** through `lib/file-plan.js`'s `parseFilePlan` — never a second derivation. | Matches `claims-lint.js:44–59` / `scope-reconcile.js` arg + exit conventions exactly; the sole-derivation rule for File Plan parsing is already binding (`lib/file-plan.js:3–7`). |
| D7 | **Parsing is line-joined before it is arrow-split.** Within the `## Surface Paths` region: a line matching `^- ` opens a bullet; every following line that is neither blank, nor a new `- ` bullet, nor a heading, nor inside an HTML comment is **appended to the open bullet with a single space**. Only the joined text is split on `→`. Within a hop, the **site token is the first backticked span**; any further backticked spans in the same hop are prose (symbol names, carrier ids) and are not ownership-checked. | Refuter A findings 2 and 3: every bullet in this spec's own dogfooded section wraps across 2–4 physical lines with `→` separators landing on continuation lines, and real hops carry two backtick spans (`` `file-plan.js:28` `` then `` `parseFilePlan` ``). A naive per-line split misparses the very artifact this spec ships. Unlike the File Plan grammar there is no 333-spec corpus to inherit from — this is the first section of its kind, so the join algorithm is specified here rather than assumed. |
| D8 | `/spec:plan` gains three duties: a Phase 2 authoring bullet (write the section as the Decisions land); a Phase 3 refuter clause covering **both** halves — *(a) for every `(ro @file:line)` hop, read the cited code and verify the carrier survives that hop unchanged; a spread-vs-rebuild, a filter, an always-false gate, or a caller that cannot reach the site is a top-severity finding; (b) for every path, name any custody hop the chain **omits** — a value's real route from producer to render, walked in the built code, and any file on that route absent from the bullet is a top-severity finding*; and the Phase 4 lock run of `path-lint --check`. | Refuter B finding 1 is correct that a *missing* hop is invisible to a grammar checking only the hops present, and that "owned" means "listed", not "correct" — which is why the completeness half (b) exists and is the mechanism's real reach on the D13/D24 shape. The refuters already run (T2: 1, T3: 2) and demonstrably land real corrections, so both halves cost zero new dispatches and zero new spend. |
| D9 | `/spec:review` gains two legs: (a) **mechanical** — `path-lint … --check --built` as Phase 0 leg `paths`, `observed:"paths=<N> findings=<M>"`; each `unowned-hop`, `stale-citation` or `carrier-absent` finding it emits is a mechanical **hard** finding entering Phase 2 like an uncovered AC (deterministic fact, skips the refutation filter). (b) **in-session** — a **path-trace leg** (one Sonnet `Agent`, sibling of the design-compliance legs) walking each bullet hop by hop against built code, where a dropped carrier, a computed-then-never-read value, or an unsatisfiable terminal condition is each a `hard` finding and "the identifier appears in the file" is explicitly not a pass. The in-session leg is **scoped**: it runs when the section is non-empty AND (`tier == T3` OR `diffLoc ≥ 300`); otherwise the mechanical leg alone. `verdict.js` is **not** touched — `paths` rides as a non-required manifest row like `patterns`/`drift`. | Split by capability: the script owns form, the model owns flow. (a) is the teeth for the mid-build amendment pattern that D5 structurally cannot reach (refuter B finding 4) — Decisions added while `status: implementing` never revisit lock. (b) is scoped because the design-compliance legs it claims siblinghood with are narrowly gated (`review.md:157–159`, "UI-bearing specs only") while an unscoped leg would be a third mandatory agent on nearly every review, against a ledger row already recording review spend as a live concern (`scaffold-ledger.md:30`) — refuter B finding 5. Leaving `paths` out of `REVIEW_LEGS` (`verdict.js:111`) is load-bearing: adding it would return `UNVERIFIED` for every host that has not upgraded. |
| D10 | `/spec:build` gains two duties: the Phase 2 `blocked` row states that a ruling adding a File Plan row updates the affected `## Surface Paths` bullet(s) **in the same spec edit**; Phase 4 runs `path-lint … --check --built`, report-only (`⚠️` one line naming the owning bullet). | The build orchestrator is the actor that discovers an unowned hop mid-flight — four times in one run on 2026-08-10 — and today records the ruling only in Decision prose, where the next hop has no home. Report-only matches the neighbouring `scope-reconcile` advisory precisely (build.md:227–233); the *blocking* consequence for a mid-build addition lands at review via D9(a), not here. |
| D11 | Under `--built`, a hop's `(ro @file:line)` citation additionally yields `stale-citation` when the file is absent or the line exceeds its length, and `carrier-absent` when the bullet's carrier identifier appears **nowhere** in the cited file. | Refuter A finding 1 and refuter B finding 2: a line-in-range check passes an off-by-one or wholly irrelevant citation, and the spec's own first draft carried two off-by-one citations to `verdict.js`. Whole-file mention is the honest ceiling — a line-content match would false-fire on any carrier renamed or destructured at the hop. |
| D12 | The final hop before the `⇒` terminal must state a **render/registration condition** — the literal marker is `renders when` / `fires when` / `registers when`. A path whose last hop states no condition is a `missing-condition` finding. | The D22 shape (a value computed, frozen and never read) and the D21 shape (a legend behind an always-false gate) both require the author to name *which site renders it, under what condition*. At plan time for spec 04 no row owned that render — so the obligation converts an unaskable question into a lock failure. The script checks only that a condition is stated; whether it is satisfiable is D9(b)'s job. |
| D13 | Two `scaffold-ledger.md` rows: **Surface-path obligation (lock-blocking)** — gate, justified by the 2026-08-10 UpWell measurement, retire condition: two consecutive quarters in which no lock-time path-lint finding and no review path-trace `hard` finding traces to a real dead surface; and **Path-trace review leg** — advisory, promote to a required `verdict.js` leg when ledger data shows its findings track escapes, retire if two quarters show its `hard` findings are predominantly false positives. | Ledger discipline: no mechanism ships without naming what would promote or retire it; D5's ADVISORY-first exception is recorded in the row itself rather than left as an unexplained deviation. |
| D14 | Version bump to **6.50.0** with a description (changelog) paragraph; `claims-baseline.json` regenerated via `claims-lint --update-baseline` in the same change; new `spec-paths` key `path-lint` plus its usage line; `shared.md` gains a `## Surface Paths` doctrine section, added to the `plan`/`build`/`review` `shared-for` section lists in `spec/bin/spec-paths`. | Repo discipline (pipeline rules § Planning, § Review Checks): behavior change ⇒ bump; doctrine line-count change ⇒ baseline hunk in the same diff; a new command-consumed shared.md section is invisible without its `shared-for` list entry, and a `§` citation that doesn't byte-match a `## ` heading is a hard finding. |
| D15 | Mechanizing the deviations sidecar as a backstop is **out of scope**; a roadmap brief `docs/roadmap/03-deviations-sidecar-mechanization.md` is written in this spec's File Plan instead. | User ruling (2026-08-10, "separate spec"). Keeps this to one landing unit inside the decomposition cap; per plan.md Phase 4 step 2, session-discovered follow-up work gets a durable brief, never a conversational promise. |
| D16 | No retrofit and no grandfather clause: hardened/done specs are untouched, and a spec still at `draft` (or re-opened to `draft`) authors the section at its next lock like any other. The state gate (`spec-state-gate.sh`) is untouched. `missing-section`'s finding text names the remedy — *"author `## Surface Paths` from the Decisions now; a path written from memory at lock is the anti-pattern this section exists to prevent — re-walk the code"*. | Refuter B finding 4 is right that an in-flight draft is forced to retrofit from memory. Accepted with eyes open rather than papered over: the author of a draft is by definition still in session with the work, one section is bounded, and a version-pinned grandfather path would exempt precisely the specs most likely to carry unowned hops. The gate stays out of `spec-state-gate.sh` — that hook is deliberately awk/grep-cheap and runs per prompt; a node walk belongs in Phase 4. |

## File Plan

<!-- Machine-consumed: /spec:build parses this table into workflow batches.
     Layer ∈ doctrine | scripts | workflows | tests | other.
     No generated wf-*.js row exists in this spec — no workflow body changes. -->

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/templates/spec.md | MODIFY | doctrine | New `## Surface Paths` section after File Plan: grammar comment + bullet skeleton + sanctioned-empty line (D1, D2, D3, D4, D12) |
| spec/doctrine/shared.md | MODIFY | doctrine | New `## Surface Paths` section — liveness is a path property; hop grammar + line-join rule; the `(ro @file:line)` citation rule; the three-layer reach (form/completeness/flow) and the lint's stated ceiling (D1, D2, D7, D8) |
| spec/bin/spec-paths | MODIFY | scripts | `path-lint` key + usage line; `Surface Paths` added to the `plan`, `build`, `review` `shared-for` section lists (D14) |
| spec/scripts/path-lint.js | CREATE | scripts | The lint per D2/D3/D4/D6/D7/D11/D12; header carries usage, dated incident, deliberate non-goals, exit codes |
| spec/commands/plan.md | MODIFY | doctrine | Phase 2 authoring bullet; Phase 3 refuter clause, both halves; Phase 4 lock step runs `path-lint --check`, exit 0 required to flip `hardened` (D4, D5, D8) |
| spec/commands/review.md | MODIFY | doctrine | Phase 0 step 3 `paths` leg + its mechanical hard findings; scoped in-session path-trace leg beside the design-compliance legs (D9) |
| spec/commands/build.md | MODIFY | doctrine | Phase 2 `blocked` row: a ruling that adds a File Plan row updates the owning path bullet; Phase 4 advisory `path-lint --check --built` (D10) |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | Two rows with promote/retire conditions (D13) |
| tests/path-lint.test.js | CREATE | tests | AC-20260810-02-1 … AC-20260810-02-6 |
| tests/surface-paths-doctrine.test.js | CREATE | tests | AC-20260810-02-7 … AC-20260810-02-11 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | 6.50.0 + description changelog paragraph (D14) |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | `claims-lint --update-baseline` after every doctrine edit lands (D14) |
| docs/roadmap/03-deviations-sidecar-mechanization.md | CREATE | other | Follow-up brief for the sidecar backstop (D15) |

## Surface Paths

<!-- This spec dogfoods its own artifact. Grammar per D2/D3/D7/D12. -->

- **P-D5**: `spec/scripts/path-lint.js` exits 1 on any finding → carrier: the process exit code
  → `spec/commands/plan.md` Phase 4 reads it as a lock precondition → `/spec:plan` **fires when**
  the exit is non-zero, refusing to write `status: hardened` ⇒ **evidence:** AC-20260810-02-7
- **P-D7**: `spec/scripts/path-lint.js` isolates the `## Surface Paths` region by heading-level
  walk → carrier: the joined bullet text (continuation lines appended with a single space) →
  the same function splits the joined text on `→` and takes the first backticked span of each
  hop as the site token → `path-lint.js` **registers when** a site token resolves to neither a
  File Plan row nor an `(ro @file:line)`, emitting `unowned-hop` ⇒ **evidence:** AC-20260810-02-2
- **P-D8**: `spec/commands/plan.md` Phase 3 refuter prompt names both the `(ro)` set and the
  chain-completeness duty → carrier: the refuter agent prompt string → the Sonnet refuter reads
  each cited line and walks the built route → findings **fire when** a cited hop mutates the
  carrier or the chain omits a route file, landing in Decisions or Rationale under the existing
  never-silently-drop rule ⇒ **evidence:** AC-20260810-02-9
- **P-D9**: `spec/commands/review.md` Phase 0 step 3 appends a manifest row `{"leg":"paths",…}`
  → carrier: `leg` — the row key the manifest transports → `spec/scripts/verdict.js:82` stores
  it via `legRows.set(row.leg, row)` (ro @spec/scripts/verdict.js:111 — `REVIEW_LEGS` deliberately excludes `paths`, and only
  `requiredLegs` are presence-checked at `verdict.js:130`, so the row is carried into the ledger
  at `verdict.js:176` without becoming required) → the emitted ledger line **renders when** the
  row exists, and its absence never yields `UNVERIFIED` ⇒ **evidence:** AC-20260810-02-11
- **P-D10**: `spec/commands/build.md` Phase 4 runs `path-lint --check --built` → carrier: the
  printed `⚠️` line naming the owning `P-D{n}` bullet → the build orchestrator reads it before
  the checkpoint-commit → the warning **renders when** a finding exists, surfacing an unowned
  hop pre-commit instead of at review ⇒ **evidence:** AC-20260810-02-8
- **P-D11**: `spec/scripts/path-lint.js` under `--built` extracts each bullet's carrier
  identifier → carrier: that identifier string → the script reads the `(ro)`-cited file whole →
  `carrier-absent` **fires when** the identifier appears nowhere in that file ⇒ **evidence:**
  AC-20260810-02-4
- **P-D12**: `spec/templates/spec.md` documents the `renders/fires/registers when` marker →
  carrier: the marker phrase in the final hop → `path-lint.js` scans the last hop of each bullet
  → `missing-condition` **fires when** no marker is present ⇒ **evidence:** AC-20260810-02-5
- **P-D14**: `spec/bin/spec-paths` `path-lint` key → carrier: the printed absolute path → every
  command's `node "$(spec-paths path-lint)"` invocation **fires when** the key resolves; an
  unknown key exits 1 with the usage line ⇒ **evidence:** AC-20260810-02-6

## Contracts

**`## Surface Paths` template block** (inserted between `## File Plan` and `## Contracts` in
`spec/templates/spec.md`):

```markdown
## Surface Paths

<!-- Machine-checked (path-lint.js at lock; re-run --built at review): one bullet per
     observable path a Decision promises — producer site → carrier → custody hops → consumer
     site → render/registration condition → evidence. Only Decisions that ship an observable
     surface get a path; pure policy/naming/no-change Decisions never appear. A spec with no
     observable path writes the sanctioned-empty line instead of omitting the section:
     `- none — {reason, >= 20 chars}` (it is recorded, and visible at review, never silent).
     Grammar per hop, split on `→` after continuation lines are joined: each hop names a
     backtick site (`file` or `file:symbol` — the FIRST backticked span is the site; later ones
     are prose) plus ONE verb phrase, what happens to the value THERE. Every hop file must be a
     File Plan row, OR carry `(ro @file:line)` — a cited claim that the value passes through
     this existing code UNCHANGED. An `(ro` with no `@file:line` is a finding; the Phase 3
     refuters read every citation AND hunt the hops the chain omits.
     The final hop before `⇒` states the render/registration condition using the literal marker
     `renders when` / `fires when` / `registers when` — a path that never says where and under
     what condition the value becomes observable is the dead-surface shape itself.
     Evidence terminal: `AC-{YYYYMMDD-NN}-{n}` (preferred — executable),
     `catalog:{Component}/{state}` (design-capable hosts; the state must exist in the UI
     section), or `runtime:{what a human observes}` (weakest — warns, never silent). The
     terminal is the observable the Decision PROMISES, never a nearer server-side proxy. -->

- **P-D{n}**: `{producer file:symbol}` {writes/computes what} → `{carrier — the field/prop/key
  that transports it}` → `{custody hop}` {what it does to the value} (ro @{file:line} when the
  hop is not a File Plan row) → `{consumer file:symbol}` {reads it how} → renders when
  {condition} ⇒ **evidence:** AC-{YYYYMMDD-NN}-{n} | catalog:{Component}/{state}
```

**`path-lint.js` CLI** — `node path-lint.js [--root <dir>] --spec <path> (--check | --json) [--built]`

| Exit | Meaning |
|---|---|
| 0 | `--check` clean (warnings permitted), or any `--json` run |
| 1 | `--check` found findings |
| 2 | usage error, spec unreadable, or no `## File Plan` table |

Findings (all block `--check`):

| Kind | Condition |
|---|---|
| `missing-section` | no `## Surface Paths` section, or the section holds no bullet (D4) |
| `malformed-bullet` | a bullet whose leading bold token is not an anchored `P-D\d+`, and which is not the sanctioned `- none — {reason ≥ 20 chars}` line |
| `unknown-decision` | `P-D{n}` whose `D{n}` has no row in the `## Decisions` table |
| `unowned-hop` | a hop's site-token file is in no File Plan row and carries no `(ro @file:line)` |
| `uncited-ro` | `(ro ` or `(ro@` present with no `@file:line` (D2) |
| `missing-condition` | the final hop carries none of `renders when` / `fires when` / `registers when` (D12) |
| `missing-terminal` | no `⇒ **evidence:**`, or an `AC-` terminal naming an AC-ID absent from `## Acceptance Criteria`, or a `catalog:` terminal whose state string is absent from the `## UI` section |
| `stale-citation` | `--built` only: an `(ro @file:line)` whose file is absent, or whose line exceeds the file's length (D11) |
| `carrier-absent` | `--built` only: the bullet's carrier identifier appears nowhere in an `(ro)`-cited file (D11) |
| `missing-hop-file` | `--built` only: a site-token file that does not exist on disk |

Warnings (printed, never blocking): a `runtime:` terminal; every `(ro)` hop (visibility for the
refuter and path-trace legs); a sanctioned-empty section (also surfaced as
`observed:"paths=0 empty-declared"` at review).

`--json` emits `{ paths: [{id, hops, carrier, terminal, warnings}], findings: [{line, kind,
detail}], counts: {paths, findings, warnings}, sanctionedEmpty: <bool> }` and never fails the
process by itself.

**Parsing contract (D7)** — the region is isolated by the same heading-level walk as
`parseFilePlan` (`lib/file-plan.js:31–40`). Inside it: `^- ` opens a bullet; a following line
that is not blank, not `^- `, not `^#{1,6}\s`, and not inside an HTML comment is appended to the
open bullet separated by one space. Only joined bullets are split on `→`. The carrier is the
first backticked span of the **second** hop (the grammar's carrier position); when a bullet has
fewer than three hops, `carrier-absent` does not apply.

## Behavior

- **Authoring (plan Phase 2):** the section is written as the Decisions land, not at lock — a
  path is the shape of the Decision, and writing it late means writing it from memory.
- **Refutation (plan Phase 3):** each refuter receives both halves of D8. A refuted `(ro)` or a
  named omitted hop is a top-severity finding, fixed in the spec (new File Plan row, re-routed
  carrier, changed Decision) or explicitly rejected in Rationale — the never-silently-drop rule
  is unchanged.
- **Lock (plan Phase 4):** `path-lint --check` runs beside the marker sweep. Non-zero exit
  blocks the `draft → hardened` flip; findings name the owning bullet and the remedy.
- **Build (Phase 2 / Phase 4):** a ruling that adds a File Plan row updates the owning path
  bullet in the same spec edit; Phase 4's advisory run reports, never blocks.
- **Review (Phase 0 / in-session):** the `paths` leg is mechanical, non-required, and its
  `unowned-hop`/`stale-citation`/`carrier-absent` findings are hard — that is the teeth for
  Decisions added mid-build, which never revisit lock. The path-trace leg is the semantic half,
  scoped per D9, and its findings enter Phase 2 dispositions like any other.

## Acceptance Criteria

- **AC-20260810-02-1**: WHEN `path-lint.js` runs `--check` on a spec whose every hop file is a
  File Plan row and whose terminals resolve THE SYSTEM SHALL exit 0 and print one line naming
  the path count (a fixture with 2 bullets → exit 0, output contains `paths=2`) →
  tests/path-lint.test.js
- **AC-20260810-02-2**: WHEN a hop's first backticked span names a file absent from the File
  Plan with no `(ro @…)` THE SYSTEM SHALL exit 1 with an `unowned-hop` finding naming that file
  and the owning `P-D{n}` (hop `` `app/x.ts` `` not in plan → exit 1, output contains
  `unowned-hop` and `app/x.ts`); WHEN the same hop carries `(ro @app/x.ts:12)` and that file
  exists THE SYSTEM SHALL exit 0 and print it as a warning →
  tests/path-lint.test.js
- **AC-20260810-02-3**: WHEN a bullet wraps across physical lines such that a `→` and the hop it
  delimits sit on different lines THE SYSTEM SHALL parse the joined bullet as one path with the
  same hop count as the equivalent single-line bullet (a 3-hop bullet split across 3 lines →
  identical `--json` `hops` array as the same bullet on one line); WHEN a hop carries two
  backticked spans (`` `a/b.js:28` `` then `` `someFn` ``) THE SYSTEM SHALL take only the first
  as the site token (no `unowned-hop` for `someFn`) → tests/path-lint.test.js
- **AC-20260810-02-4**: WHEN `--built` runs and an `(ro @file:line)` cites a nonexistent file,
  or a line past the file's end, THE SYSTEM SHALL exit 1 (`stale-citation`); WHEN the cited file
  exists but the bullet's carrier identifier appears nowhere in it THE SYSTEM SHALL exit 1
  (`carrier-absent`); WHEN the carrier appears anywhere in that file THE SYSTEM SHALL exit 0 →
  tests/path-lint.test.js
- **AC-20260810-02-5**: WHEN the final hop carries none of `renders when` / `fires when` /
  `registers when` THE SYSTEM SHALL exit 1 (`missing-condition`); WHEN a bullet's terminal names
  an AC-ID absent from `## Acceptance Criteria` THE SYSTEM SHALL exit 1 (`missing-terminal`);
  WHEN `(ro` appears with no `@file:line` THE SYSTEM SHALL exit 1 (`uncited-ro`), and WHEN the
  hop instead contains the prose `(rollback path)` THE SYSTEM SHALL NOT emit `uncited-ro` →
  tests/path-lint.test.js
- **AC-20260810-02-6**: WHEN the section is missing entirely or holds no bullet THE SYSTEM SHALL
  exit 1 (`missing-section`) with a remedy naming `## Surface Paths`; WHEN it holds exactly
  `- none — this spec ships no observable surface` THE SYSTEM SHALL exit 0 with
  `sanctionedEmpty` true in `--json`; WHEN it holds `- none — too short` THE SYSTEM SHALL exit
  1; WHEN the spec has no `## File Plan` table THE SYSTEM SHALL exit 2 with stderr naming the
  remedy; and WHEN `spec-paths path-lint` runs THE SYSTEM SHALL print the script's absolute path
  with the key listed in the usage line → tests/path-lint.test.js
- **AC-20260810-02-7**: WHEN `spec/commands/plan.md` is read THE SYSTEM SHALL state that Phase 4
  runs `path-lint --check` and that a non-zero exit blocks the `hardened` flip, and
  `spec/templates/spec.md` SHALL carry a `## Surface Paths` section between `## File Plan` and
  `## Contracts` documenting the hop grammar, the `(ro @file:line)` rule, the render-condition
  marker, and the sanctioned-empty line (regex pins) → tests/surface-paths-doctrine.test.js
- **AC-20260810-02-8**: WHEN `spec/commands/build.md` is read THE SYSTEM SHALL state both the
  Phase 2 `blocked`-row duty (a ruling adding a File Plan row updates the owning path bullet)
  and the Phase 4 advisory `path-lint --check --built` run marked report-only (regex pins) →
  tests/surface-paths-doctrine.test.js
- **AC-20260810-02-9**: WHEN `spec/commands/plan.md` Phase 3's refuter prompt is read THE SYSTEM
  SHALL instruct the refuter both to read every `(ro @file:line)` citation (treating a
  spread-vs-rebuild, filter, always-false gate, or unreachable caller as top-severity) and to
  name any custody hop the chain omits (regex pins on both halves) →
  tests/surface-paths-doctrine.test.js
- **AC-20260810-02-10**: WHEN `spec/commands/review.md` is read THE SYSTEM SHALL declare the
  `paths` Phase 0 leg with `unowned-hop`/`stale-citation`/`carrier-absent` as mechanical hard
  findings, AND the in-session path-trace leg scoped to a non-empty section with `tier == T3` or
  `diffLoc ≥ 300` (regex pins) → tests/surface-paths-doctrine.test.js
- **AC-20260810-02-11**: WHEN `spec/scripts/verdict.js` is read THE SYSTEM SHALL CONTINUE TO
  omit `paths` from `REVIEW_LEGS`, and WHEN `verdict.js` runs over a manifest carrying every
  required leg green plus a `paths` row THE SYSTEM SHALL CONTINUE TO derive a non-`UNVERIFIED`
  verdict and carry the `paths` row into the emitted ledger line (source pin + exec run; green
  pre-change) → tests/surface-paths-doctrine.test.js

## Assumptions (escalation triggers)

- A1: `lib/file-plan.js`'s `parseFilePlan` returns repo-relative path strings from column 1 and
  is the sole File Plan derivation (verified at plan time by reading `lib/file-plan.js:28–52`,
  by grepping its two consumers, and by a refuter executing it against this spec's own table).
  **if false:** the ownership check compares against the wrong set — STOP, never add a second
  parser.
- A2: `verdict.js` tolerates manifest rows whose `leg` is outside `REVIEW_LEGS` — rows are
  stored by `legRows.set(row.leg, row)` at `verdict.js:82`, only `requiredLegs` are
  presence-checked at `verdict.js:130`, and every row rides into the ledger via
  `verdict.js:176`. `patterns` and `drift` are existing precedents. **if false:** drop the
  `paths` manifest row and keep the mechanical run as a plain Phase 0 command with no leg.
- A3: The `## Surface Paths` heading is at `## ` level in every host spec, so the region walk
  mirrors `parseFilePlan:31–40`. **if false:** extend that same regex to tolerate `### `, never
  a second walk.
- A4: Adding a `## Surface Paths` section to `shared.md` requires adding it to the `plan`,
  `build`, and `review` `shared-for` section lists in `spec/bin/spec-paths:50–55`, or the
  section is silently dropped from every scoped read. **if false (a fourth command needs it):**
  add that entry in the same change.
- A5: `claims-lint.js:32`'s corpus is `spec/commands`, `spec/doctrine`, `spec/agents` — NOT
  `spec/templates`. Every doctrine file this spec touches moves line counts, so
  `claims-lint --update-baseline` runs after the last doctrine edit and lands in the same diff;
  new prose containing `MUST`/`NEVER`/`ALWAYS`/`STOP`/`hard finding` carries an inline
  `<!-- enforcedBy: spec/scripts/path-lint.js -->` marker or enters the baseline as an orphan.
  **if false:** review's baseline-hunk check is a hard finding — re-run `--update-baseline`.
- A6: No existing test pins the template's section order or `plan.md`'s Phase 4 step list by
  position — `tests/goal-mechanism-audit.test.js` locates the Phase 4 block by header string and
  applies loose regexes over its body (verified by a refuter at plan time). **if false:** update
  the pin in the same change; this is a sanctioned doctrine change, not a weakening.
- A7: This repo's own test suite carries a deliberate red-pin baseline (pipeline rules § Test
  Rules), so the gate is scoped via `{testDirs}` and resolves to the glob form
  `node --test 'tests/<file>.test.js'` — `node --test <dir>` fails on Node 26 here. **if false:**
  see § Gotchas; never "fix" it by changing the gate command.

## Rationale

The intervention was designed against a Fable retainer consult (2026-08-10) that read the
template, all three commands, both existing lint scripts, the state gate, and the UpWell spec
whose build produced four instances of the escape, then hardened against two blind refuters.
Three alternatives were rejected. **Attaching the obligation to Acceptance Criteria** fails on
measurement: ACs already existed and caught none of the four, because every terminal hop lives
in the pure-UI TDD exemption where the component catalog covers rendering — and the catalog lied
each time via invented fixtures. The right relation is *termination* (a path ends in an AC), not
attachment. **A review-time tracing duty with no artifact** discovers the defect after the build
has burned the tokens, and forces the reviewer to reconstruct paths from the diff — the
unowned-hop failure restated. **A runtime reachability check instead of a document check** has
too low a ceiling: computed-then-discarded, always-false-gate, and overwritten-by-a-later-phase
are dataflow properties no grep decides; D7/D11 keep that ceiling stated rather than implied.

**What each layer actually reaches — stated honestly, because refuter B was right that the
first draft overclaimed.** The lock-time lint (D5) reaches *form*: an unowned hop, an uncited
`(ro)`, a missing render condition, a terminal that resolves to nothing. It does **not** reach a
hop the author never wrote, and "owned" means "listed in the File Plan", not "correct" — three
of the four 2026-08-10 escapes (D13's settle rebuild, D22's discarded value, D24's narrow
caller) sat in files the spec was itself creating or had not yet named. That is why the
obligation is not one mechanism but three. The Phase 3 refuter clause (D8) reaches *completeness*
— its second half exists specifically to hunt the omitted hop, and it is the layer that would
have adjudicated D13, where the real custody owner (`fold-advance.ts`) was not a File Plan row
until D26 added it retroactively during the build. The review path-trace leg plus the mechanical
hard findings (D9) reach *flow* against built code, and are the only layer that can see D21's
always-false caption gate or D22's `targetHitSummary: null`; D9(a) is also the only teeth on the
mid-build amendment pattern, since Decisions added while `status: implementing` never revisit
lock. D12's render-condition marker is the cheapest forcing function of the three shapes: it
converts "which site renders this, under what condition?" from an unasked question into a lock
failure.

Two refuter findings were accepted as *limits*, not fixed. The `(ro @file:line)` citation is
cheap to fake — any in-range line satisfies the lint (refuter B finding 2). `--built`'s
`carrier-absent` (D11) raises the cost from "copy any number" to "cite a file that at least
mentions the carrier", which is where the honest ceiling sits: a line-content match would
false-fire on every carrier renamed or destructured at the hop. Beyond that the guard is the
refuters and the trace leg, and D13's ledger row is written so a mechanism catching nothing for
two quarters is removed rather than accumulated. The sanctioned-empty line (D4) is similarly
unfalsifiable by any script (refuter B finding 3); it is deliberately cheap so it never becomes
ceremony, and the guard is exposure — `paths=0 empty-declared` rides into the review manifest and
the ledger, so choosing the hatch is a visible, dated, auditable choice rather than an absence.
Refuter B's finding 6 (T3 ACs want literal input→output pairs, while the doctrine ACs are regex
pins) is **rejected**: doctrine regex pins are this repo's sanctioned Test Rules mode 2, and the
script ACs 1–6 all carry literal pairs.

The load-bearing risk remains that authors write path rows from the same mental model that wrote
the Decisions. The proof is in the record: D13's own addendum *did* name producer, carrier and
consumer in prose and was still unimplementable, because nobody executed "does settle spread or
rebuild?". D8's two halves and D11's carrier check are the near-free guards; D9 is the net under
them.

Fragile spots during execution: the claims baseline (every doctrine row moves line counts —
regenerate last, same diff), the `shared-for` section lists (A4 — a missing entry makes the
doctrine silently invisible), `verdict.js`'s `REVIEW_LEGS` (A2/AC-11 — adding `paths` there
returns `UNVERIFIED` for every un-upgraded host, which is why its absence is pinned as a
regression), and the bullet line-join (D7/AC-3 — the first draft's grammar would have misparsed
its own dogfooded section).

## Canonical Delta

`docs/canonical/pipeline.md` (create if absent): add a **Surface Paths** section — surface
liveness is a path property (producer → carrier → consumer → render/registration condition), not
a file property, and the File Plan deliberately destroys path structure so batches can
parallelize. Each spec therefore records its observable paths as `## Surface Paths` bullets keyed
to Decision IDs, where every hop resolves to an owned File Plan row or a cited `(ro @file:line)`
claim that existing code passes the value through unchanged, every path states the condition
under which the value becomes observable, and every path terminates in an AC, a catalog state,
or a named runtime observation. The obligation is enforced in three layers of increasing
strength: `path-lint.js` (the sole derivation of the section's grammar and hop ownership) blocks
`/spec:plan`'s lock on **form** — ruled 2026-08-10, an explicit exception to advisory-first guard
discipline; the Phase 3 refuters attack **completeness**, reading every `(ro)` citation and
hunting hops the chain omits; and `/spec:review` attacks **flow**, with `path-lint --built` as a
non-required `paths` leg whose ownership findings are mechanical hard findings, plus a scoped
in-session path-trace leg. `/spec:build` Phase 4 runs the same check report-only, and a
mid-build ruling that adds a File Plan row updates the owning path bullet in the same edit.
