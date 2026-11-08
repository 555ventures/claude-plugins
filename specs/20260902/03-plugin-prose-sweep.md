---
date: 2026-09-02
status: done
build_base: main
tier: standard
area: doctrine-governance
design: false
breaking: false
depends_on: ["specs/20260902/02-plugin-code-sweep.md"]
depended_on_by: ["specs/20260902/04-host-generators-owner-citations.md"]
brief: 21
open_markers: 0
diff_base: 3fe76c32694fae5e23a5801781a3acf7e6452c98
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260902-03-1, AC-20260902-03-2, AC-20260902-03-3, AC-20260902-03-4]
---

# Plugin prose sweep: commands, doctrine, agents, rules cite owners

## Goal

Every prose line of the plugin's commands, doctrine, agents, the spec template, the git
commands, and this repo's rules layer states a rule plus one owner id and never narrates
dates, people, hosts, versions, or prior behavior. The 64 narrated prose lines measured at
planning are rewritten or deleted; the 13 Gotchas entries in `.claude/rules/spec-pipeline.md`
collapse to tag + rule + one citation; the seven contract-phrased lines the scanner also
catches are reworded rather than exempted. Done means: the plugin scan reports zero
prose-group findings with the baseline reduced to the grounding contract alone (sibling 04
edits that file and deletes the baseline); every `§` citation still resolves; every
read-load budget and doctrine pin stays green.
