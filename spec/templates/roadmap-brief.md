# NN — { Brief Title }

Phase: { P0 } · Depends on: { NN, NN | — } · Primary workspaces: { areas } ·
Risk: { T2 | T3 } ({ one-line reason }) · Design stage: { yes | no } ·
Expected specs: { 1–4 }

<!-- One brief = one /spec:plan session = 1–4 sibling specs. A brief is stable intent
     grounded in ADRs — it names WHAT and WHY and where the ground truth lives; the specs it
     hydrates into own HOW. Anything execution-shaped (file plans, function signatures, test
     lists) belongs in the specs, not here. -->

## Result

{ 2–4 sentences: the observable state of the system after this brief's specs are done —
what exists, what has exactly one sanctioned way, what a user/developer can now do. }

## Current state

{ What exists in the repo today that this brief builds on or must reconcile with. At genesis
time this is mostly "nothing — scaffold only"; keep it honest and re-verify at plan time
(the planning session grounds against live code, not this snapshot). }

## Scope

1. **{ Unit }** — { what it delivers, with the ADR constraint(s) it must honor inline }.
2. **{ Unit }** — { … }

## Surfaces

<!-- UI-bearing briefs only (Design stage: yes) — delete the section otherwise. The design
     atlas parses this fenced block (shared § Design Atlas): one line per surface label, one
     per journey edge. NAMES AND ARROWS ONLY — the roadmap owns structure, mocks own pixels.
     Labels are permanent once a mock ships (they are data-screen-label / regionRef anchors).
     To design this brief before planning it, run /spec:sketch on this file — it mocks these
     surfaces, evolves this brief with the mocks (Scope, surfaces, Open questions), and ends
     by ratifying the pair. /spec:plan warns if that never happened, but doesn't block. -->

```surfaces
{ label }
{ label } -> { label }
```

## Out of scope

{ Adjacent work this brief explicitly does NOT cover, with the brief number that owns it —
the anti-scope-creep fence for the planning session. }

## Grounding

{ The ADRs, genesis-brief sections, and deltas that bind this brief — cited by ID/path so
the planning session Reads them. Every hard constraint in Scope should trace to one. }

## Open questions for planning

- { A genuine fork or unknown the planning session must resolve — via AskUserQuestion,
  exploration, or a spike. If a delta in deltas/ binds this brief, point at it here. }
