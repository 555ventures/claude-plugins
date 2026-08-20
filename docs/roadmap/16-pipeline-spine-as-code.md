# 16 — Pipeline spine as code (v8 direction)

Phase: P3
Depends on: none

## Why this brief

The 2026-08-20 Salon OS field report exposed a recurring class: the pipeline enforces host
repos with executed gates but enforces itself with prose. Every instance lived at a
prose→script seam — a script authored but never invoked from a command's markdown
(env-preflight, 3rd recurrence), an observation grammar one script emitted and another
re-parsed from memory (the silent testsSkipped zero), a check whose applicability prose
never stated (promise-sweep firing retroactively). specs/20260820/03 fixed the live
defects and specs/20260820/04 pinned the seams (entry-point manifest diffed against
reality); this brief records the deeper move JJ ratified for drafting on 2026-08-20: stop
hardening the seams and delete them.

The repo's own history already points here. Every recurring incident has been closed by
moving prose into a script: two pages of review choreography became review-legs.js
("this script IS that phase"), freehand next-pointers became spec-status.js, hand-performed
sweeps became ac-matrix.js / promise-sweep.js / collision-closure.js. The class exists
because that migration is half-finished — the scripts are deterministic, but the decision
to *call* them still lives in prose a model reads.

Post-July-2026 evidence (researched 2026-08-20, both moves; the pre-2026-forbidden source
rule applied):

- "Procedural hallucination" — an agent skipping or fabricating required steps while still
  reporting success — measured as the largest agent-failure category at 38.5% of
  identified failures, and specifically weak to post-hoc review (agenticrail.nz,
  2026-08-08). This is exactly the authored-not-activated class; a driver-owned sequence
  structurally eliminates it rather than auditing for it.
- Scoped, typed-step pipelines beat open-ended agent autonomy on every task in a 30-day
  six-stack evaluation (promptquorum.com, 2026-07-14); production agent failures
  concentrate at handoff seams, not core reasoning (Openlayer 2026-07-21; Medium/Skill
  Stuff Aug 2026).
- Mnemosyne (arXiv:2607.00269, 2026-07-07) formalizes the split this brief proposes:
  deterministic structural validation, LLM reserved for semantic judgment it can't express.
- Schema-first typed stage contracts are the stated direction for inter-stage evidence
  (Digital Applied 2026-07-28; IETF draft-sharif-agent-audit-trail, updated 2026-08-19 —
  structured JSON fields, enums, explicit omission conventions). No post-July source
  defends regex-parsed packed strings.

## Scope

Two moves, one direction — the deterministic spine of each stage becomes a program; the
model holds explicit judgment points.

- **Stage drivers own sequencing.** For each pipeline stage, one entry-point program runs
  the stage's deterministic sequence — precondition checks, leg execution, evidence
  assembly, state transitions — and surfaces the model's judgment points explicitly
  (adjudication, disposition, repair, surprise handling) instead of the model reading
  phase prose and deciding which scripts to call. review-legs.js is the proven template;
  the brief's question per stage is "what remains in the command markdown when the
  choreography is code" — the target end state is commands as thin shells: invoke the
  driver, host the judgment conversations. Judgment points must stay first-class
  (constrained re-planning, not hand-held branches) — over-mechanizing adjudication is the
  autopilot mistake in new clothes and is the named failure mode to design against.
- **Typed evidence fields replace observed-string grammars.** The evidence manifest's
  packed strings ("skips=N todos=M", "rows=N carried=C …") parsed by verdict.js regexes
  become structured fields ({"skips":2,"todos":1}, {"unavailable":"pattern-no-match"}) —
  the parser is deleted, not tested, and unknown-coerced-to-zero becomes unwritable by
  construction. This changes emitted literals cited in the hash-stamped grounding contract
  (`grounding-contract.md`, `release.md`), so it re-grounds every host — a deliberate
  one-time cost the spec must state up front, paid once at a moment hosts are re-grounding
  anyway, never dribbled across releases.
- **Sequencing.** After specs/20260820/03 and /04 land (03's pair test and 04's manifest
  stay useful mid-migration and their defects are bleeding now); planned before or with
  briefs 12/13, which would otherwise birth new emitter/parser string pairs this brief
  exists to abolish.

## Grounding

- specs/20260820/03-review-observation-truth.md, specs/20260820/04-entrypoint-conformance.md
  — the instance fixes and the seam-pinning guard this brief supersedes-by-deletion where
  the migration reaches; both stay valid until then.
- spec/scripts/review-legs.js header ("This script IS that phase") — the in-repo exemplar
  of the pattern at stage scale; spec/scripts/spec-status.js — the derived-not-stored
  precedent.
- core.md § Model Placement ("expensive model authors the contract; cheap models execute
  behind deterministic gates") — this brief extends the same placement rule to the
  pipeline's own control flow.
- Research citations in Why (post-July-2026 sweep, 2026-08-20, three Sonnet agents).
- The Salon OS field report (2026-08-20) and escape rv_8b7c4e2e9ec0 — the incident record.

## Out of scope

- **Version-stamped specs / self-versioning checks** (every check auto-scoping to
  artifacts born after the check itself): researched 2026-08-20 and found unprecedented in
  post-July-2026 practice — the one fresh design on record (oxlint ratchet proposal,
  2026-08-04) chose the opposite mechanism. Shelved; reopen only if a second check needs
  an applicability cutoff (promise-sweep's per-check constant covers the first).
- Any autonomy layer above the stages (scheduling, queueing, autopilot-shaped daemons) —
  parked by JJ's 2026-08-18 ruling; this brief mechanizes stage interiors, not
  session-level agency.
- Removing the model from adjudication, disposition, or user-facing questions — judgment
  points are repositioned, never deleted.
- Host-facing behavior changes beyond the typed-evidence contract re-stamp — hosts see the
  same stages, verdicts, and reports.
