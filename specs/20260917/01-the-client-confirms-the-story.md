---
date: 2026-09-17
status: done
tier: standard
area: mocks
design: false
breaking: true
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-17
open_markers: 0
build_base: main
diff_base: 5c2a20f055a35a620693b52f729f09631985df36
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260917-01-1, AC-20260917-01-2, AC-20260917-01-3, AC-20260917-01-4, AC-20260917-01-5, AC-20260917-01-6, AC-20260917-01-7, AC-20260917-01-8, AC-20260917-01-9, AC-20260917-01-10, AC-20260917-01-11, AC-20260917-01-12, AC-20260917-01-14, AC-20260917-01-15, AC-20260917-01-16, AC-20260917-01-17, AC-20260917-01-18, AC-20260917-01-19]
---

# The client confirms the story

## Goal

`/spec:mocks` today turns a seed journey into a navigation graph: the seed grammar is "names and
arrows only", the parser keeps one persona line, and so the client's own discovery sentences never
reach the app — the agent draws screens joined by arrows, and there is no story for a client to
confirm. After this spec a seed journey is a numbered list of the client's own sentences, each
bound to one screen; SCREENS copies those sentences verbatim into the app; the driver verifies the
copy mechanically; and the one human gate in the whole mock stage is the client confirming a
journey, once, through the client link, against a hash of the exact sentences they read. Every
other mark is derived from files. Done means: a seed written in the beat grammar drives a run
SEED → SHELL → SCREENS → THEME → APPROVED with no page control outside the client role, a changed
beat silently voids the confirmation it invalidates, and a client's "not now" survives into the
roadmap's parking lot without a human re-typing it.
