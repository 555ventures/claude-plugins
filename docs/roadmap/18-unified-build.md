# 18 — Unified build: design → build → review as one re-entrant command

Phase: P2
Depends on: 16 (pipeline-spine-as-code — the review driver this brief mirrors)

## Why this brief

Per feature, the loop after `/spec:plan` costs the user three pastes and two `/clear`s
(`/spec:design`, `/spec:build`, `/spec:review`) that carry no decision — the next command is
always derivable (`spec-status.js --next` already derives it). Measured 2026-09-01 across the
fleet ledgers on this machine: ~1,400 rows in ~60 days, roughly 7 features a day, so about 14
human touches a day whose only content is "run the next stage".

The stage boundaries were designed around prior-model attention limits, not around anything
the pipeline needs. What the pipeline needs is preserved by the shape below, verified against
the code on 2026-09-01:

- **Review independence** comes from the fresh-context, blind-to-author reviewer dispatch and
  execution-grounded evidence (core § Model Placement) — never from the review running in a
  different *session*. A combined loop keeps the reviewer a fresh subagent.
- **The one thing a separate session did buy** was a disposition step with no memory of the
  build's trade-offs. The loop keeps that by mandating a checkpoint `/clear` between build's
  end and review's DISPOSITIONS state — the genesis pattern (one command, `/clear`
  checkpoints; JJ ruling 2026-08-25) applied to the feature loop. Claude Code's own guidance
  (code.claude.com/docs/en/context-window, read 2026-09-01) is to clear at task boundaries,
  which argues for exactly this shape over one long session.
- **Every human gate survives**: design's catalog look and affordance reconcile, build's
  `blocked`-return forks and unsanctioned-green confirm, review's dispositions, merge
  strategy, and conflict resolution. The loop stops at each; none is automated.

What makes this more than a thin outer loop — the seams found on 2026-09-01:

- **Build has no driver and no state file.** `wf-build.js` was deleted 2026-08-17 (commit
  `61e2e5a`); build is a markdown procedure that resumes by inspecting the diff and
  hand-appends its own ledger row. Design derives its step from disk in prose. Only review has
  a driver with a sidecar and marks. Three state substrates; a loop needs one it can trust.
- **The state-gate hook keys on the typed command name at prompt submit** and never re-fires
  as a command moves a spec internally, and core § State Machine says each transition is
  owned by exactly one command. Both need a deliberate change, not a workaround.
- **Review's merge refuses while the session CWD is inside the build worktree** — a
  relocation only the session can perform, so it becomes a checkpoint instruction, not a
  blocker.

Two Claude Fable 5.1 migration-guide items bind the design (read 2026-09-01):
long-lived, asynchronous sub-agents outperform spawn-and-block (context retained across
subtasks, fewer cache misses) — build today spawns a fresh Sonnet worker per wave and waits;
and "de-prescribe migrated prompts: prefer goal and constraints over enumerated steps, A/B with
the scaffolding removed" — this brief is that A/B for the three highest-traffic commands.

## Result

After `/spec:plan`, one command finishes a feature: `/spec:build <spec>` derives the next stage
from disk, runs it, prints a checkpoint after every stage boundary (`safe to /clear and re-run
/spec:build`), and stops only at a human gate or `done`. Build has a driver and a sidecar like
review; its ledger row is script-written, carries `via` and the session model; workers live
across waves. `/spec:design` and `/spec:review` remain as resume entry points and leave the
README loop. The loop is scored from its first run by the escape ledger.

## Current state

- `spec/scripts/spec-review-driver.js` — driver with `<spec>.review/` sidecar, `--mark`,
  `--state`, one judgment step per invocation, refusal catalogue; `verdict.js` writes review
  rows. `spec/scripts/genesis-driver.js` — the checkpoint/`/clear`-safe precedent.
- `spec/commands/build.md` — driverless; entry `hardened|implementing`; hand-appended row.
- `spec/commands/design.md` — driverless; resume table derived from disk; blocking human look
  at Step 5 and reconcile at Step 6.3; sets `designed:` only.
- `spec/scripts/spec-state-gate.sh` — prompt-prefix match, per-command allowed statuses.
- `spec/scripts/spec-status.js:439-443` — the routing a loop can reuse (`design && !designed`
  → design; `designed` set → never route back).
- No `via` or model field on any ledger row. The session model is not in the shell
  environment (executed 2026-09-01); the prompt hook receives `transcript_path`.

## Scope

1. **Build driver** — `spec-build-driver.js` mirroring the review driver: state from spec
   frontmatter + `<spec>.build/` sidecar + on-disk artifacts, re-derived every invocation;
   marks for tests-authored, red-checked, per-wave done, integrated, gate-green; the build
   ledger row written by the script, never by the session. One long-lived Sonnet worker per
   layer group, continued across waves by message rather than re-spawned; the test author and
   the reviewer stay fresh-context. Human gates unchanged (core § Decisions: a dismissed
   question STOPS).
2. **Run provenance** — `via` on build and review rows (`loop` | `direct`) and the session
   model stamped from the transcript by the existing prompt hook into the sidecar, carried
   onto the row. The fleet reader gains one query: escapes-per-CLEAN by `via`.
3. **The outer loop in `/spec:build`** — derive the next stage with the routing spec-status
   already owns; run design (unchanged internals), then the build driver, then the review
   driver; print one checkpoint line at every stage boundary; the checkpoint before review's
   DISPOSITIONS and the one before MERGE (exit the worktree) are mandatory clears, printed as
   the step. Status transitions stay one-per-driver-state; core § State Machine's ownership
   sentence is amended to say so (doctrine edit — explicit JJ yes at plan time), and the
   state-gate hook admits `/spec:build` on `hardened|implementing` as today plus a
   `done` no-op.
4. **Surface** — README loop becomes plan then build; design and review move to the reference
   table as resume entry points; `spec/entrypoints.json` updated; command prose for build
   shrinks to the judgment steps the driver prints (the de-prescribe A/B).
5. **Kill condition (ledger-answerable)** — over the next 30 fleet reviews, if `via:"loop"`
   CLEANs are contradicted by later escapes at a higher rate than `via:"direct"` CLEANs, the
   loop reverts to three commands. The fleet reader's new query answers it with two numbers.

## Out of scope

- `/spec:plan` stays separate — it is the Fable seat and ends in a user-confirmed lock (core
  § Model Placement, § Tiers).
- Design-stage internals (render gate, catalog look) — brief 08 / ADR-0002.
- Drivers for init and genesis prose — a later brief, admitted only if this brief's
  self-repair share moves (docs/roadmap/00-overview.md sequencing).
- Replay corpus and escape classification — brief 19.
- Reviewer model experiments — after brief 19's instrument exists.

## Grounding

- `spec/doctrine/core.md` § State Machine (ownership sentence to amend), § Model Placement,
  § On-Disk Handoff, § Worker Git Ban, § Feedback Loop (`via` is a ledger field, never memory).
- JJ ruling 2026-08-25: one `/spec:genesis` with `/clear` checkpoints, session as proposer
  (memory `spec-20260825-brief-10-genesis-series`).
- Claude Code context-window guidance: clear between tasks; delegate large reads
  (code.claude.com/docs/en/context-window, 2026-09-01).
- Claude Fable 5.1 migration guide § Long-running agent recommendations: asynchronous
  long-lived sub-agents; de-prescribe migrated prompts (claude-api skill, 2026-09-01).
- Measured 2026-09-01: fleet ~1,400 rows / 60 days; 107 self-repair specs in August, 94
  touching prose.

## Open questions for planning

- Doctrine sentence in core § State Machine — the exact amended wording; needs JJ's yes.
- Model stamp route: `transcript_path` last assistant `model` vs the SessionStart hook's
  optional `model` field — micro-spike both; the hook field is documented as not always set.
- Long-lived workers die at a `/clear`; confirm they are continued only within a stage
  (between waves) and re-spawned after a checkpoint — is the cache-read saving still worth it?
- Whether the build sidecar shares `<spec>.review/` or gets `<spec>.build/` (one dir per
  driver keeps the review driver's refusals untouched).
- Loop length cap: after how many consecutive stages without a human gate does the loop
  print a checkpoint anyway (context hygiene)?
