# 08 — Design-family thinning (v7.1)

Phase: P3
Depends on: none

## Gate to plan this brief

Five product specs (not self-repair) through the v7.0 pipeline with a self-repair share
below 20% of specs authored in the window. Until the gate is met, `/spec:plan` on this
brief should be declined — the v7.0 bet must prove itself on the core loop before the
design surface is rebuilt on top of it. (Progress: 1 of 5 — specs/20260817/06.)

## Why this brief

The v7.0 redesign (2026-08-17) rebuilt the core pipeline and deliberately carried the design
family **as-is**: the `genesis-explore`/`genesis-design`/`genesis-architect`, `sketch`,
`atlas`, and `design` commands; the design sections of doctrine (moved verbatim to
`spec/doctrine/design.md`, ~800 lines); and the three generated workflow files the family
dispatches, frozen as plain checked-in scripts when the codegen seam died
(`wf-design.js`, `wf-panel.js`, `wf-research.js`; `wf-enforce.js` frozen the same way for
`/spec:enforce`). v7.1 applies the same treatment to that surface: prose-cut, mechanism
review, and direct-dispatch orchestration.

## Scope

- **Prose cut** — `design.md` and `genesis.md` plus the design/genesis command files get the same ~80% cut
  the core commands got: worked examples, incident narratives, and
  choreography-that-should-be-code deleted; contracts and invariants kept.
- **Workflow replacement** — a direct Agent-dispatch equivalent for the design and genesis
  commands (the same inversion build/review got), or each frozen workflow's stages retired
  into scripts + session dispatches. The `FIDELITY_REVIEW` step is re-specified against the
  direct-dispatch shape. Until then the frozen `wf-*.js` files are maintained only under a
  spec that names them.
- **Mechanism review** — each design-stage guard (fidelity gate, skeletons/components
  checks, dc-extract classing, coverage ledger, atlas badges) re-audited under the v7
  evidence bar: deterministic scripts stay; prose choreography becomes code or dies; no
  registry, no standing failing pins.
- **Retainer language** — `design.md` still speaks of the Fable retainer seat for design
  judgment calls; re-derive the model-placement story for the design seats against the v7
  rule (session adjudicates; no resident consultant).

## Out of scope

- Any change to the design family's user-facing surface (mock-first authoring, the atlas,
  sketch-per-brief) — v7.1 is a thinning, not a redesign; surface changes need their own
  brief and explicit approval.
- The frozen v7.0 stable APIs (`spec-status.js`, config keys, `spec-paths` design keys,
  hooks).

## Grounding

- `docs/audit/v7-replay-eval.md` — the evidence bar v7 review work is held to.
- `spec/doctrine/design.md` — the carried-verbatim corpus this brief cuts.
- `spec/doctrine/core.md` § Incident Policy, § Model Placement — the rules the design
  family must land on.
- Memory `research-20260817-ai-first-best-practice` (July-2026+ sweep): stale scaffolding
  actively distorts newer models — they follow outdated instructions MORE faithfully (Corti
  Jul 28 2026) — and the design corpus is the largest v6-era prose block still running
  verbatim on Claude-5-generation models. Keep-signals from the same sweep: mock-first
  ("code-based references beat prose descriptions of intent", claude.com Jul 24 2026) and
  wf-design's planner+workers shape match the field's convergence — the thinning cuts
  choreography, not those two structures.

## Open questions

- Do wf-panel/wf-research (genesis research fan-outs) survive as scripts, become direct
  dispatches, or fold into a simpler single-pass genesis interview?
- Does `/spec:enforce` keep wf-enforce or take the direct-dispatch inversion in the same
  pass?
