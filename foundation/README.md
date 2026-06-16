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
every file write. The heavy lifting — parallel, web-enabled research and a **Mixture-of-Agents
panel** (3 blind Sonnet proposers → Opus aggregator) — runs in the `wf-foundation` workflow,
which the command calls as a subroutine *between* question rounds. The session and workflow
**interleave**; nothing human-facing happens inside the workflow.

Key design choices (see `commands/shared.md` for the full contract):

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
| `commands/shared.md` | Invariants: archetype registry, panel doctrine, handoff contract, state machine |
| `commands/architect.md` | Stage 1: decide stack/structure, scaffold |
| `commands/design.md` | Stage 2: author the design canon |
| `workflows/wf-foundation.js` | Research fan-out → MoA panel → decision package |
| `scripts/foundation-state-gate.sh` | UserPromptSubmit hook: enforces the state machine |
| `templates/` | `status.json`, `stack-descriptor.json`, `design-rules.json`, `adr.md` skeletons |
