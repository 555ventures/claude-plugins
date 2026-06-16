# foundation

Greenfield **genesis** for new projects — the two stages that run *before* the spec pipeline and
decide *what to build with* and *how it should look*, then scaffold a real repo for `/spec:init`
to ground.

```
/foundation:architect   stack + structure decisions (ADRs) → scaffold the project
/foundation:design      UX/visual/voice canon: doctrine + tokens + category-only design rules
        ↓
/spec:init              grounds the scaffolded, designed repo and generates the enforcement
                        machinery (lint/hooks/sweeps) from the design rules, wired to the gate
        ↓
/spec:plan → /spec:design → /spec:build → /spec:review   (the existing spec pipeline)
```

## How it works

Both commands are **highly interactive** sessions (Opus) that own every `AskUserQuestion` and
every file write. The heavy lifting runs in two workflows the command calls as subroutines
*between* question rounds: `wf-interview-research` (the light one — live, web-enabled research that
turns the user's last answer into recency-stamped option menus *during* the interview) and
`wf-foundation` (the heavy one — a **Mixture-of-Agents panel**, 3 blind Sonnet proposers → Opus
aggregator, that adjudicates the hard-to-reverse forks). The session and workflows **interleave**;
nothing human-facing happens inside a workflow.

Key design choices (see `commands/shared.md` for the full contract):

- **Research-backed discovery interview.** Phase 1 is a structured discovery interview (funnel-shaped,
  four lenses — Product/User/Scope/Architect — reflect-back open + read-back sign-off), not a form.
  Crucially it is **not** "you provide everything, the tool summarizes": researchable batches
  (stack, framework, visual trend) are **options-first** — the `wf-interview-research` workflow
  researches your last answer live (current trend / best practice / standard, recency-stamped, with
  sources) and those findings *become* the `AskUserQuestion` choices. Sonnet builds the menu, Haiku
  verifies currency on version-bearing dimensions, Opus curates and presents. A picked dimension is
  marked `constrained` so it skips the heavier panel. Product/user/business/legal only; never
  staffing (Claude is always the implementer). See `commands/shared.md` § Discovery Interview.
- **Archetype-aware.** Web app, mobile app, AI bot, backend, trading sim, CLI, data/ML, desktop —
  the archetype drives stack candidates, research angles, panel roles, and whether a design stage
  runs at all. Audience/locale composes on top (a Japanese app triggers JP typography + cultural
  color research regardless of surface).
- **On-disk-only handoff.** Every cross-stage artifact is a file in `foundation/` or `docs/adr/`;
  the workflow's `args` carries only paths, enum keys, and booleans (the spec pipeline's
  "no free text in args" lesson).
- **Decide vs implement.** `/foundation:design` *decides* design rules (category-only enum);
  `/spec:enforce` *implements* them as stack-specific enforcement, chosen at runtime per stack.
  One enforcement brain, downstream in the spec pipeline.
- **MAINTAINED DISSENT.** Minority panel positions are recorded verbatim in a required `Dissents`
  section, checked mechanically — a correct minority view is never silently averaged away.
- **Selective panel.** When you've already fixed the hard-to-reverse choices, the proposer round
  is skipped; research still runs.

v1 is **greenfield-only**: pointed at a populated repo, `/foundation:architect` defers to
`/spec:init`.

## Files

| Path | Role |
|---|---|
| `commands/shared.md` | Invariants: discovery-interview posture, archetype registry, panel doctrine, handoff contract, state machine |
| `commands/architect.md` | Stage 1: decide stack/structure, scaffold |
| `commands/design.md` | Stage 2: author the design canon |
| `workflows/wf-interview-research.js` | Light: live option-menu research per opened dimension (Sonnet menu + Haiku currency check) |
| `workflows/wf-foundation.js` | Heavy: research fan-out → MoA panel → decision package |
| `scripts/foundation-state-gate.sh` | UserPromptSubmit hook: enforces the state machine |
| `templates/` | `status.json`, `stack-descriptor.json`, `design-rules.json`, `adr.md` skeletons |
