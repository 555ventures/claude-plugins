---
date: 2026-10-29
status: done
open_markers: 0
tier: critical           # touches spec/scripts/question-style-gate.js (hook surface, rules § Risk Tiers)
area: doctrine
breaking: false
depends_on: []
brief: n/a
build_base: main
diff_base: b888aebf2afab26c7db136a5fba1684b32eaaf87
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261029-01-1, AC-20261029-01-2, AC-20261029-01-3, AC-20261029-01-4, AC-20261029-01-5, AC-20261029-01-6, AC-20261029-01-7, AC-20261029-01-8, AC-20261029-01-9, AC-20261029-01-10]
---

# Model placement refresh: seats pin a tier and an effort, independence is a fresh context

## Goal

Every model seat in the plugin names a tier alias and an effort level, in one per-seat table in
core doctrine and in the agent frontmatter and dispatch lines that act on it. The reviewer and
disposer seats stop depending on which model the invoking session happens to run; review
independence is stated as fresh-context, blind-to-author dispatch with executed evidence, and
the "different model family" sentence is retired. The one hard-pinned model id in the plugin
(the question judge's dated Haiku snapshot) becomes an alias, and the genesis design steps
dispatch a Fable subagent instead of stopping the human to switch models by hand. Done means:
no file under `spec/` names a versioned model id, the three pinned tests read the new table,
and a Fable session running `/spec:run` or `/spec:fix` gets an Opus reviewer.
