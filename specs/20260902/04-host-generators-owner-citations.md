---
date: 2026-09-02
status: done
build_base: main
tier: critical
area: bootstrap
design: false
breaking: false
depends_on: ["specs/20260902/03-plugin-prose-sweep.md"]
depended_on_by: []
brief: 21
open_markers: 0
diff_base: e1b8a86fdf3fa5ba451829100715faf6c86c4e66
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260902-04-1, AC-20260902-04-2, AC-20260902-04-3, AC-20260902-04-4, AC-20260902-04-5]
---

# Host generators stop planting narration; contract re-hashed; baseline deleted

## Goal

The plugin's host generators — `/spec:init`'s rules-file Gotchas header and authoring bar,
`/spec:review`'s CLOSE fold, and `/spec:escape`'s Gotchas draft — write rule notes as tag +
rule + one owner citation and never narrate dates, people, hosts, versions, or prior
behavior. The grounding contract states that grammar once (its single edit this series,
which also removes its own two narrated lines) and is re-hashed; `/spec:enforce` needs no
change (its manifest schema carries no `notes`; legacy notes are doctor check 16's job).
Done means: init-gen renders the new Gotchas header, the three command surfaces carry the
grammar, the contract hash is re-stamped in this repo's config, the narration baseline file
is deleted, and the standing scan is green at zero with no baseline.
