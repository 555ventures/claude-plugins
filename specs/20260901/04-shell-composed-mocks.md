---
date: 2026-09-01
status: done
tier: standard
area: design
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 20
open_markers: 0
diff_base: 8486d309a82b754a67d4931a243371e6f4c45919
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260901-04-1, AC-20260901-04-2, AC-20260901-04-3, AC-20260901-04-4, AC-20260901-04-5, AC-20260901-04-6, AC-20260901-04-7, AC-20260901-04-8, AC-20260901-04-9, AC-20260901-04-10, AC-20260901-04-11, AC-20260901-04-12, AC-20260901-04-13, AC-20260901-04-14, AC-20260901-04-15, AC-20260901-04-16]
---

# Shell-composed mocks — one canonical app shell, content-only sketches, planning-seat authorship

## Goal

Every visual host gets one canonical shell mock per declared shell (`design/shell/app.html` at
minimum, with its stylesheet beside it), authored in the planning seat when the navigation
shell is decided. Page mocks declare their shell, author only the content slot, and carry the
shell chrome as a marked region that `design-atlas.js shell sync` rewrites from canon —
byte-identical everywhere by mechanism, never by an author copying. `design-atlas.js check`
turns shell drift into a harness failure at the same tiers the existing checks bind (warn at
`sketch`), genesis refuses `tokens-landed` without the shell canon, and the `AppShell` code
primitive is authored from the shell mock. Sketch-tier authorship moves to the planning seat
for both `/spec:atlas` and `/spec:sketch` (session exemplars, one sequential Fable overflow,
Sonnet mechanical only), grounded in the picked position brief, with the seat and position
named in the report — the rule living in one restored paragraph of design.md § Design Atlas
that both commands cite (ADR-0003, reversing specs/20260810/01 D8). Done means: a host with
page mocks can adopt them in one confirmed pass, a shell edit reaches every non-built mock in
one sync run, and a hand-edited sidebar in any ratified mock fails `check`.
