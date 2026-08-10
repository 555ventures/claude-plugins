# Design — canonical decisions

## Component vocabulary (2026-08-10, specs/20260810/01-design-path-model-placement.md)

The product's committed building blocks live as **commitment entries** in
`design/components.json` (`name`, `purpose`, `boundaries`) — the same manifest that holds
landed components; absence of `props`/`mockRefs` is what marks an entry as commitment-only.
Seeded by `/spec:genesis-design` Phase 4.3 on visual-archetype greenfield. Validated by
`components-check.js` (spec-paths key `components-check`): **fail-closed** at genesis's
commit step, **advisory** at the design driver's preflight (brownfield files may predate the
canonical shape; the legacy `{"components": [...]}` wrapper is tolerated with a warning).
Consumed as binding canon by `wf-design` workers via the `componentManifestPath` arg — a
named block is bound or authored to fulfil its entry, never re-invented as a lookalike, and
a `boundaries` contradiction is a fork (`blocked`), same standing as a token-value
contradiction. `/spec:review`'s component-manifest check includes commitment entries in its
near-duplicate comparison, and an `author` decision fulfilling a commitment entry cites it
as its justification.

## Exit fidelity review (2026-08-10, same spec)

After the design gate returns green (`author-green`), one expensive-seat review moment —
driver state `FIDELITY_REVIEW`, mark `fidelity-reviewed` — fires whenever the host has any
render path (`design.screenshot` OR `design.command`). With a `design_source` it compares
bound-region screenshots against ratified mock slices; without one it critiques the render
against skeletons + doctrine. Findings route into the iteration loop as rulings — never a
fail-closed gate, never a script. It replaced the `VISUAL` state and the advisory
vision-review consult (ruled 2026-08-10); a legacy sidecar's `visual-done` mark satisfies it.

## Atlas gap sweep dispatch (2026-08-10, same spec)

Atlas gap sweeps author **sequentially with exemplar grounding, never parallel
per-surface** — one warm Sonnet dispatch (chained past ~10 surfaces), citing
ratified/approved mocks then the sweep's own earlier output as exemplars. Single doctrine
home: shared.md § Design Atlas.
