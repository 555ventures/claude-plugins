# { Project } Implementation Roadmap — Overview

<!-- Authored by /spec:genesis (its driver's ROADMAP state — or hand-authored from this
     template in brownfield repos). Each numbered file in this directory is one planning brief:
     one brief → one /spec:plan session → 1–4 sibling specs wired via depends_on.
     Briefs are stable intent; specs are perishable execution detail — briefs are hydrated
     into specs lazily, one at a time, when "Current state" can be written against real code.
     NEVER write per-brief status into this file: status is derived from specs' `brief:`
     frontmatter — run /spec:status to see it (/spec:doctor check 14 audits the same
     derivation). -->

Status of the pipeline: { what genesis/init/enforce have produced; what code exists — usually
"scaffold only, no product code" at authoring time }.

Invoke a brief as:

```
/spec:plan docs/roadmap/NN-name.md
```

Briefs are ordered; don't plan a brief before its `depends_on` briefs are done (or at least
implementing with the needed surface merged). **This sequence is the only to-do list** — no
amendment may live outside it. A post-genesis product-shape decision is recorded as an ADR
(`docs/adr/`) whose `Applies to` section names every brief it amends, and its effects are
edited into those briefs in the same session (adr.md template § Applies to): an unplanned
brief is edited in place and gains an `Amended by ADR-NNNN` line in Grounding; a brief whose
specs are planned or shipped gets a letter-suffixed successor brief (`NNa-*`, depends_on NN)
added to the Sequence table below, re-entering the numbered order.

## Sequence

<!-- One row per brief. Phase = delivery horizon (P0 = walking skeleton, P1 = first
     milestone, …). Risk = the tier the bulk of the brief's specs will carry. Design = yes
     only in design-capable archetypes, for briefs with user-facing surface. -->

| #  | Brief      | Phase | Depends on | Workspaces | Risk | Design | Est. specs |
|----|------------|-------|------------|------------|------|--------|------------|
| 01 | { name }   | P0    | —          | { areas }  | T3   | no     | 2–3 |

Milestone gates:

- **After NN**: { the observable, user-verifiable state — from the genesis brief's success
  outcome, not a feature list }.

## Journey map

<!-- Derived view, never authored here: each UI-bearing brief declares its surfaces + journey
     edges in its own `surfaces` block (roadmap-brief.md template); `/spec:atlas` composes
     them into the whole-product journey graph at design/atlas/index.html. Delete this section
     for non-visual archetypes. -->

Run `/spec:atlas` to see every declared surface, its mock, and the journey graph.

## Ops track (external clocks — no code, start immediately, not specs)

<!-- Work with external lead times that must start now: API/OAuth registrations, hosting
     provisioning, partner asks, compliance reviews. Delete the section if empty. -->

- { item — why it's external, who/what it waits on }

## Parking lot (deferred ideas — not scope, not backlog)

<!-- Ideas acknowledged and explicitly deferred so they stop leaking into briefs. Promotion
     out of this list requires an amendment ADR applying to the receiving brief, not a
     planning-session judgment call. -->

- { idea — one line on why it's parked }

## Conventions carried by every brief

- Decomposition caps: the host's /spec:plan caps (≤15 File Plan rows per spec, one primary
  area per spec); a brief that can't be told in ≤1 page of Scope splits into two briefs.
- { project-specific conventions every planning session must honor — invariants, review
  triggers, do-not-build entries }
