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
| 08 | design-thinning |
| 09 | promise-sweep-leg |
| 10 | genesis-single-proposer |
| 11 | init-thinning |
| 12 | release-legs |
| 13 | deviations-sidecar-mechanization |
| 14 | reviewer-measurement |
