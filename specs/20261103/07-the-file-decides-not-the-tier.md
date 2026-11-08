---
date: 2026-11-03
status: done
tier: critical           # adds a key to spec/bin/spec-paths (rules § Risk Tiers: "a wrong key breaks commands silently")
area: build-stage
breaking: false
depends_on: []
brief: n/a
spiked: 2026-11-03
open_markers: 0
diff_base: 4e19cf5b20dabd3019d013a40435546a0426ac27
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261103-07-1, AC-20261103-07-2, AC-20261103-07-3, AC-20261103-07-4, AC-20261103-07-5, AC-20261103-07-6, AC-20261103-07-7, AC-20261103-07-8]
---

# The file decides, not the tier

## Goal

A gate failure in a file outside the File Plan is triaged by that file's own risk, never by the
spec's tier. Today stage-build's `blocked` returns rule asks the user whenever the spec is
`tier: critical`, so a critical spec stops for a test file whose own comment says "update the
expected set here in place" — seven recorded asks, seven answers of "add to scope". After this
spec a deterministic script answers the question from machine facts: a file named by the host's
§ Risk Tiers bullets or by `orchestratorOnly` earns the question; every other file is added to
scope with a printed auto-pick and a `[auto: out-of-plan-triage]` Decisions row the reviewer
checks. The build driver's REPAIR step and the doctrine both point at the script.
