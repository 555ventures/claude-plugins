# 23 — Closed feedback loop: hosts emit rows, the plugin reads them

Phase: P2 · Depends on: 17 (fleet reader — every number here is its output), 19 (class
contract; its backfill q11 is this brief's precondition) · Primary workspaces:
spec/scripts/fleet-reader.js (one query), spec/scripts/replay.js (one field),
spec/commands/{escape,replay}.md (one report line each), tests · Risk: T2 (read-only
derivations plus one report line — nothing stores state; a wrong deliverable is deleted) ·
Design stage: no · Expected specs: 1

<!-- One brief = one /spec:plan session = 1–4 sibling specs. Execution-shaped detail belongs in
     the spec. This brief names WHAT and WHY and where the ground truth lives. -->

## Result

A host session that meets a plugin defect records the ledger row it already knows how to write
(escape or replay, classed, with executed evidence) and keeps working; the report it prints
ends with the row key and nothing else — no prompt for JJ to paste. In the plugin repo one
fleet-reader query lists every plugin-blaming row across the fleet (escape rows whose
`preventedBy` is plugin territory, replay rows with outcome `missed`, unstamped findings in the
legacy `docs/spec-feedback/` briefs), grouped by class with the joined recurrence count and
whether a plugin spec already cites the row. Under core § Incident Policy the count alone says
what response is admitted; nothing new enforces that — the policy, the existing
`/doctrine-review` panel, and JJ's yes on doctrine text already do. Replay rows carry an origin
marker so the manual retry path becomes measurable.

## Why this brief

The loop core § Feedback Loop specifies is open at one edge. Measured 2026-09-02:

- **Host reports arrive as prose in JJ's inbox.** Since v7 (2026-08-17) eight host-originated
  items reached this repo: 4 code-plus-test fixes, 2 admission-bar guards, 1 decline, 1
  unfinished roadmap item, **0 overreactions**. The human filter is correct; it is also the
  only way a report gets read, and nothing records that it was.
- **The backlog nobody reads.** 11 fleet escape rows blame a plugin mechanism (review-check /
  runtime-leg); none can be linked to a plugin fix because plugin specs cite AC-IDs, never the
  host row. Seven `docs/spec-feedback/*.md` briefs across four hosts (prax 4, upwell 2,
  salon-os 1, tradoyo 1) have had no consumer since `/intake` was retired with the v7 registry.
- **The sensor is half-installed.** 38 escape rows, 24 unclassed, one class at the
  third-recurrence bar; six repos never replayed (autopilot-hub, bwm-booking, cctop, hiwora,
  zubu-ai, zubu-menu). Brief 19's backfill (queue q11) is still owed. Replay rows have no
  `via`, so whether `/spec:replay`'s manual retry path has ever been used is unknowable.

**Over-engineering check (2026-09-02), so planning does not re-add them.** Rejected: a
per-handoff triage command (judgment over a problem with zero recorded instances); an intake
registry, IDs, or failing-pin backlog (the v7-retired failure, `docs/audit/v7-backlog-drop.md`);
new row fields `owner`/`blocked`/`workaround`/priority (redundant with `preventedBy` and
`severity`; no host has ever been recorded blocked on the plugin); host sessions fixing the
plugin in place (wrong conventions loaded, additive by construction); a commit-side fix-shape
gate (a standing guard for a class with **zero** recurrences — core § Incident Policy forbids
it on its own terms); a guard census / pruning query (80% exists as `legRecency.neverRed`;
build the rest when a kill condition is actually asked — the admission bar's Removability
field names the trigger); the sweep as a new command or as a section of `/spec:status`
(a `fleet-reader` flag is invocable cold and couples nothing).

## Current state

- `spec/commands/escape.md` + `spec/scripts/escape-row.js` — the one writer of escape and
  escape-class rows; `--amend` for backfill. `preventedBy` resolves plugin-vs-host for 23 of 28
  live rows (review-check / runtime-leg = plugin; enforcer / test = host; `doctrine` and `none`
  ambiguous — resolved by the cited gotcha's `[plugin]`/`[host]` tag, else reported ambiguous).
- `spec/scripts/replay.js` — records `stage:"replay"` rows with `class`, `outcome`, `runId`;
  no `via`. Build and review rows carry `via` + session model since brief 18 (specs
  20260901/02) — the same field, same values.
- `spec/scripts/fleet-reader.js` — six fixed queries; `escapes.byClass` joins amendments;
  `legRecency`, `replayDebt`, `cleanContradicted`, `driftCensus`. No query reads
  `docs/spec-feedback/`; none answers "is this row cited by a plugin spec".
- `git/commands/commit.md` step 3–4 — derives the escape moment at commit time (a fix touching
  a file a recent CLEAN passed → one yes/no → `/spec:escape`). Coverage (share of host fix
  commits that go through it) is unmeasured.
- The communication contract's cross-repo rule (JJ's global instructions, outside this repo)
  tells host sessions to compose a ≤15-line prompt for the plugin repo.

## Scope

0. **Precondition, not scope** — q11 (brief 19's fleet backfill) runs first, plus one replay on
   each never-replayed repo that has a review row to replay against. The spec is admitted only
   when the fleet reader reports the post-backfill `unclassed` and `neverReplayed` values.
1. **The owed query** — one fleet-reader query (`--owed`, name at plan) rendering, population
   first (brief 17's silent-absence rule): plugin-blaming escape rows, missed replay rows, and
   unstamped spec-feedback findings, grouped by class, with joined recurrence count, the
   response core § Incident Policy admits at that count (printed as a pointer to the section,
   not restated), and fixed-status derived from a citation convention — a plugin spec's
   Rationale or Decisions cites `escape:<repo>:<ts>` / `replay:<runId>`, the query greps
   `specs/`. No stored state; a fixed or obsolete row stops appearing. Ownership is claimed
   only after reproduction in `tests/fixtures/`; the row's per-item next action says so.
2. **Row as handoff** — `escape.md` and `replay.js`'s reports end, when the row is
   plugin-blaming, with the row key and the sentence that the plugin repo's owed query
   consumes it. No prompt composed. The `docs/spec-feedback/` format is neither revived nor
   deleted; it is read until its last unconsumed finding is derived-fixed, then retired by a
   later one-line spec.
3. **Replay origin** — `replay.js --record` stamps `via` (driver / manual) exactly as build and
   review rows do, so the manual command's usage is a ledger count.

## Out of scope

- Everything in the over-engineering list above, each with its reopen condition stated there.
- The reviewer-contract fix the salon-os replay `rp_c88b27bf13b2` exposed (fixture-equivalence
  is never a kill) — an in-session incident fix to `spec/agents/reviewer.md` under current
  policy; it is the first row the owed query should show as cited once landed.
- Session-start injection of the owed query — JJ ruling 2026-08-30: on-demand surfaces only.

## Grounding

- `spec/doctrine/core.md` § Feedback Loop, § Incident Policy, § Rule Enforcement,
  § Console Output Style.
- `docs/roadmap/17-fleet-evidence-reader.md` (discovery rule, population-first render) and
  `docs/roadmap/19-escape-seeded-replay.md` (class contract, amendment rows).
- `docs/audit/v7-backlog-drop.md` — why the registry died.
- `git/commands/commit.md` — the existing commit-time escape trigger.
- Fleet reader 2026-09-02: escapes 38 / unclassed 24 / one class at bar; never-replayed 6;
  plugin-blaming rows 11, fix status unknown; spec-feedback briefs 7 across 4 hosts; replay
  rows 32, all without `via`.
- Session audits 2026-09-02: 8 host-originated items since v7, 0 overreactions.
- Plugin memory: `feedback-simplicity-is-the-product-bar`, `feedback-holistic-not-additive`,
  `project-session-queue-hook-removed`, `spec-v7-ground-up-redesign`.

## Open questions for planning

- Citation key for escape rows (keyed `ts`+`spec`+`file`, no `runId`): confirm
  `escape:<repo>:<ts>` survives ledger archive rotation.
- Commit-time escape coverage: can the share of host fix commits that pass through
  `git/commands/commit.md` be derived from ledgers, or only asserted? If derivable and low,
  that is the next brief's subject, not this one's.
- The sentence that stops host sessions composing prompts lives in JJ's global instructions;
  confirm it lands alongside this spec.
