# NN — { Brief Title }

Phase: { P0 } · Depends on: { NN, NN | — } · Primary workspaces: { areas } ·
Risk: { T2 | T3 } ({ one-line reason }) · Design stage: { yes | no } ·
Lane: { behaviour | structural } · Expected specs: { 1–4 }

First light: { brief 01 only — the one real record through the production path, and where a
person observes it }

<!-- One brief = one /spec:plan session = 1–4 sibling specs. A brief is stable intent
     grounded in ADRs — it names WHAT and WHY and where the ground truth lives; the specs it
     hydrates into own HOW. Anything execution-shaped (file plans, function signatures, test
     lists) belongs in the specs, not here. Lane is advisory — a hint at mint time that the ask
     is behaviour-shaped. /spec:prototype is the behaviour lane by choice: running it on any
     brief, or on no brief, is choosing that lane (spec/doctrine/core.md § Pipeline Entry);
     nothing reads the field. -->

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

<!-- UI-bearing briefs only (Design stage: yes) — delete the section otherwise. Genesis and
     `/spec:mocks` parse this fenced block (shared § Design Canon): one line per surface label,
     one per journey edge. NAMES AND ARROWS ONLY — the roadmap owns structure, the wireframe owns
     pixels. Labels are permanent once a wireframe ships (they are screen file names under
     design/mocks/screens/). `/spec:plan` reads this block as structure only — labels and journey
     edges — with no check against an approval record. -->

```surfaces
{ label }
{ label } -> { label }
```

## Out of scope

{ Adjacent work this brief explicitly does NOT cover, with the brief number that owns it —
the anti-scope-creep fence for the planning session. }

## Grounding

{ The ADRs and genesis-brief sections that bind this brief — cited by ID/path so the
planning session Reads them. Every hard constraint in Scope should trace to one.
Post-authoring amendments land here as `Amended by ADR-NNNN — { one line }`, written by the
same session that writes the ADR (adr.md template § Applies to) — this brief stays
self-contained; the ADR holds the why. }

## Open questions for planning

- { A genuine fork or unknown the planning session must resolve — via AskUserQuestion,
  exploration, or a spike. }
