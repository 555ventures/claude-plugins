# 0008. Mocks ends at wireframes: the skin and review states are retired, theme is picked on the dense screens, one sign-off

- Status: accepted
- Date: 2026-09-06
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (brief 22a)
- Applies to: ADR-0006's order (`SEED → SHAPES → WIREFRAMES → THEME → SKIN → REVIEW →
  APPROVED`) and its enumerated D-rows on specs/20260902/07:
  - specs/20260902/07 — D2 narrowed (the state chain drops `SKIN` and `REVIEW`, gains
    `SIGNOFF`; `direction-composed` composes the seed's dense screen per direction, a second
    at most, in place of ≥3 screens); D9 superseded (`journey-skinned` retired, no journey is
    ever skinned inside `/spec:mocks`); D10 superseded (`review-opened --decider`,
    `journey-reviewed`, and the `data-status="approved"` precondition on `approved` retired —
    `approved` now stamps every top-level mock itself and records the sign-off stop's
    decider); D11 narrowed (`--reopen` no longer clears `skinned`/`reviewed` marks, since
    neither exists).
- Amended by: —

## Context

Brief 22a's dry run and the doctrine review that followed it converged on a narrower claim
than ADR-0006 shipped: fidelity work on the *whole* product before the roadmap brief exists
pre-commits scope the brief should be setting. `/spec:mocks`'s SKIN state asked every journey
to be recomposed at full theme fidelity before a single roadmap brief had been written: on a
twenty-journey product that is twenty journeys' worth of production-fidelity work spent before
anyone has decided which journey ships first. The gray comprehension check brief 22a rules for
is enough at this stage — theme is a taste decision, judged on the one screen that stresses it
most, and the rest of the product's fidelity work belongs to `/spec:sketch`, run per brief once
a roadmap exists to prioritize against.

REVIEW's ceremony (a named decider, a second per-journey mark) added a state and a mark set
without adding a decision: sign-off was already the same notes-and-page loop used throughout
the run, wearing a different name for one state. Retiring it removes a state whose only content
was "ask again, the same way."

## Options considered

- **A. Keep SKIN and REVIEW, narrow their contracts** — SKIN would need a screen-count cap and
  REVIEW would need to stop requiring a named decider; two states survive as thinner versions
  of themselves, still asking for full-product fidelity before the brief and still forking the
  notes loop for no new behavior.
- **B. Retire SKIN and REVIEW; THEME composes the dense screen only; sign-off is one SIGNOFF
  state, one look, one stop** — the state a session can no longer skin-then-review its way
  around: the driver cannot ask for whole-product fidelity because the state that would ask
  for it no longer exists (§ Doctrine Authoring's mechanism-not-prose bar, applied to a state
  machine rather than a rule).

## Decision

**Option B.** `mocks-driver.js`'s chain is `SEED → SHAPES → WIREFRAMES → THEME → SIGNOFF →
APPROVED`. THEME's `direction-composed` recomposes the seed's dense screen per direction (a
second screen allowed, never a third) and `theme-picked` is unchanged otherwise. SIGNOFF
replaces REVIEW one-for-one: one look over the atlas index, the same notes layer as every
earlier state, no per-journey re-review and no named decider — `--mark approved` stamps every
top-level mock `data-status="approved"` itself and records the sign-off stop's own decider.
`--decider` is a retired flag; any invocation carrying it refuses naming the stop's `by` field
as its replacement. A host checkpointed mid-SKIN or mid-REVIEW under the old driver derives
THEME or SIGNOFF from its existing marks on the next run — nothing is migrated, nothing on disk
is deleted, and ledger rows written under the retired step names keep parsing. Fidelity work on
the rest of the product moves to `/spec:sketch`, run per roadmap brief, never inside
`/spec:mocks`.

## Consequences

- specs/20260902/07's D9 and D10 are superseded; D2 and D11 are narrowed as enumerated above.
  The cited spec stays `done` and is never edited — this ADR is the durable record of what
  changed and why.
- `spec/doctrine/mocks.md` and `spec/commands/mocks.md` carry the mechanism (specs/20260906/02);
  this ADR is provenance, not a second copy of the contract.
- A theme direction is now judged and composed on one or two screens, never the whole product;
  a host wanting full-product fidelity in a given direction runs `/spec:sketch` per brief after
  the roadmap exists, per ADR-0006's own D. Consequences (the shell canon and component
  inventory extraction is unaffected).
- The provenance ledger's `step` column keeps accepting any `^[A-Z][A-Z-]*$` token, so rows a
  pre-8 host already wrote under `SKIN` or `REVIEW` are never rejected on read; only new rows
  are written under the current chain.
