# Canonical: pipeline

## Liveness is executed, not asserted

Surface liveness is a path property (producer → carrier → consumer → render condition) while
the File Plan deliberately shreds paths into file rows so batches can parallelize — so a
promise's terminal is the hop nobody owns. The pipeline closes this with an authoring rule
rather than a document: a Decision promising a user-observable surface owes a
**terminal-observable AC** — asserting on the observable itself, reached through the real
in-repo route, fed by a fixture **produced** by the spec's own producer chain rather than
hand-authored. The anti-pattern is named **invented-fixture liveness**: a terminal fed
hand-typed props proves the component works, not that the product reaches it. The pure-UI TDD
exemption therefore covers appearance only — reachability is never exempt.

Enforcement rides mechanisms that already exist: `/spec:plan`'s lock audit (widened from Goal
promises to Decision-level observable promises), the Phase 3 refuters (a mocked in-repo hop
between producer and terminal is top-severity), `/spec:build`'s `blocked` ruling duty (a
mid-build ruling adds its AC in the same edit), and `/spec:review`'s AC↔test matrix,
skipped-test reconciliation and semantic backstop. No new script, section, or review leg
exists for this — deliberately (ruled 2026-08-10, superseding the discarded `## Surface
Paths` design; specs/20260810/02-terminal-observable-acs.md).
