# v7.1 roadmap — design-family thinning

**Status:** planned, gated. The v7.0 redesign (2026-08-17) rebuilt the core pipeline
(plan/build/review, doctrine, guards) and deliberately carried the design family **as-is**:
`genesis-explore`, `genesis-design`, `genesis-architect`, `sketch`, `atlas`, and `design`
commands; the design sections of doctrine (moved verbatim to `spec/doctrine/design.md`); and
the three generated workflow files the family dispatches. v7.1 applies the same treatment to
that surface: prose-cut, mechanism review, and direct-dispatch orchestration.

## Proof condition to start

Five product specs (not self-repair) through the v7.0 pipeline with a self-repair share
below 20% of specs authored in the window. Until then the design family stays frozen — the
v7.0 bet must prove itself on the core loop before the design surface is rebuilt on top of
it.

## Scope

- **Prose cut** — `design.md` (~800 lines carried verbatim) plus the design/genesis command
  files get the same ~80% cut the core commands got: worked examples, incident narratives,
  and choreography-that-should-be-code deleted; contracts and invariants kept.
- **Workflow replacement** — `wf-design.js`, `wf-panel.js`, and `wf-research.js` are frozen
  checked-in scripts (the codegen seam that generated them died in v7.0 Stage 1;
  `wf-enforce.js` is frozen the same way for `/spec:enforce`). v7.1 gives the design and
  genesis commands a direct Agent-dispatch equivalent — the same inversion build/review got —
  or retires each workflow's stages into scripts + session dispatches. The `FIDELITY_REVIEW`
  step is re-specified against the direct-dispatch shape. Until then the frozen files are
  maintained only under a spec that names them.
- **Mechanism review** — each design-stage guard (fidelity gate, skeletons/components
  checks, dc-extract classing, coverage ledger, atlas badges) is re-audited under the v7
  evidence bar: deterministic scripts stay; prose choreography becomes code or dies;
  no registry, no standing failing pins.
- **Retainer language** — `design.md` still speaks of the Fable retainer seat for design
  judgment calls; v7.1 re-derives the model-placement story for the design seats against the
  v7 rule (session adjudicates; no resident consultant).

## Non-goals

- No change to the design family's user-facing surface (mock-first authoring, the atlas,
  sketch-per-brief) without separate JJ approval — v7.1 is a thinning, not a redesign.
- No change to the frozen v7.0 stable APIs (`spec-status.js`, config keys, `spec-paths`
  design keys, hooks).
