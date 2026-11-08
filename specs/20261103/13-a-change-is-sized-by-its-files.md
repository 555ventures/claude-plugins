---
date: 2026-11-03
status: done
tier: standard           # per ADR-0039 D3 the tier is a property of files touched: the spec-status.js and grounding-contract.md rows are § Risk Tiers surfaces, so their ACs carry literal examples; the spec as a whole is standard
area: pipeline
breaking: false
depends_on: []
brief: n/a
open_markers: 0
diff_base: ef99329883a59bb18451b50a68c6c991ffe2f41a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261103-13-1, AC-20261103-13-2, AC-20261103-13-3, AC-20261103-13-4, AC-20261103-13-5, AC-20261103-13-6, AC-20261103-13-7, AC-20261103-13-8, AC-20261103-13-9, AC-20261103-13-10, AC-20261103-13-11, AC-20261103-13-12, AC-20261103-13-13, AC-20261103-13-14]
---

# A change is sized by its files

## Goal

The pipeline's per-change ceremony shrinks to what the change's size and files justify, as
ADR-0039 decided: a small repair takes the fix lane whatever the host's `layerGroups` say; a spec
is one capability and folds into a fresh sibling it overlaps instead of racing it; the tier is
read off the files touched; the plugin version bumps once per release or landing, never per spec;
an AC test is scaffolding that review close deletes unless it is tagged to stay; and `/spec:status`
shows the two numbers a future ratchet would need. Done means: every decision below is live in
doctrine, template, contract and the five scripts named, and the next close after this lands
deletes what it classified.
