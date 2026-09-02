# Roadmap — claude-plugins (spec plugin source)

Planning briefs for work too large or too early to spec directly. Briefs here are planned
via `/spec:plan docs/roadmap/NN-<name>.md`; specs hydrated from a brief carry `brief: NN`
in frontmatter, and `spec-status.js` derives each brief's state from those stamps — nothing
here tracks status by hand.

Conventions: brief files are `NN-<kebab-name>.md` with `Phase:` and `Depends on:` header
lines before the first `## ` heading. The `Out of scope` section is binding — work it
fences off belongs to its owning brief.

## Sequence

| Brief | Name |
|-------|------|
| 01 | claims-registry *(superseded by v7)* |
| 02 | design-path-model-placement |
| 03 | fleet-provisioning |
| 04 | review-smell-lens |
| 05 | hotspot-audit *(superseded by v7)* |
| 06 | mechanized-prose-checks *(delivered by v7)* |
| 07 | suite-baseline *(superseded by v7)* |
| 08 | design-thinning → render-gated redesign (ADR-0002) |
| 09 | promise-sweep-leg |
| 10 | genesis-single-proposer |
| 10a | genesis-tournament-conventions *(successor: units C + D′ of 10)* |
| 11 | init-thinning |
| 12 | release-legs |
| 13 | deviations-sidecar-mechanization |
| 14 | reviewer-measurement |
| 15 | derived-session-queue |
| 16 | pipeline-spine-as-code |
| 17 | fleet-evidence-reader |
| 18 | unified-build *(design → build → review as one re-entrant command)* |
| 18a | checkpoint-fail-closed *(successor: amends 18 D2 via ADR-0004)* |
| 18b | disposer-and-run *(successor: amends 18 D2 + 18a D1–D3 via ADR-0005; fresh-context disposer, loop renamed /spec:run)* |
| 19 | escape-seeded-replay |
| 20 | shell-composed-mocks *(amends 02 D8 via ADR-0003; queued before 19)* |
| 21 | comment-hygiene *(owner citations, never history: narration gate → plugin sweep → host generators + doctor)* |
| 22 | mocks-first-genesis *(amends 10, 10a, 20 and ADR-0003 via ADR-0006; standalone design command → brief → architecture; page notes + provenance ledger gate every advance)* |
