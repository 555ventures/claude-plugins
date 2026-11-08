---
date: 2026-10-05
status: done
build_base: design-retool
tier: standard
area: design
breaking: false
depends_on: []
brief: n/a
spiked: 2026-10-05
open_markers: 0
diff_base: d61c86ad50ed43dda6e6b5864e9da92dda9af653
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261005-02-1, AC-20261005-02-2, AC-20261005-02-3, AC-20261005-02-4, AC-20261005-02-5, AC-20261005-02-6, AC-20261005-02-7, AC-20261005-02-8, AC-20261005-02-9, AC-20261005-02-10, AC-20261005-02-11, AC-20261005-02-12]
---

# Connect runs first

## Goal

`/spec:connect` refuses a project that has no `.claude/spec.config.json`, so a new project
cannot be wired to the review service until genesis or init has run. This spec lets connect run
first: in a project with no config it creates one that holds only the `walkthrough` block, and
the two commands that later generate the config (`/spec:genesis` at its HANDOFF step and
`/spec:init`) carry that block through instead of refusing on it or wiping it. Done means: an
empty git folder can be connected with one command and told to run `/spec:genesis` next; the
block survives every later generate; a hand-edited config is still refused; and a project that
is connected but not yet grounded gets no false "grounding drift" warning.

This reverses criterion 13 of specs/20261005/01-connect-wires-a-project-to-the-review-service.md
(a host with no config is refused).
