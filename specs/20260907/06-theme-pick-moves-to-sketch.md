---
date: 2026-09-07
status: done
build_base: main
tier: standard
area: design-sketch
design: false
breaking: false
depends_on: [specs/20260907/04-kit-canon-family.md, specs/20260907/05-genesis-drops-the-theme-gates.md]
depended_on_by: [specs/20260907/07-mocks-retires-theme.md]
brief: 22a
spiked: 2026-09-07
open_markers: 0
diff_base: df8d1d942c5b6e8f10f82856409a4582898bc192
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260907-06-1, AC-20260907-06-2, AC-20260907-06-3, AC-20260907-06-4, AC-20260907-06-5, AC-20260907-06-6, AC-20260907-06-7, AC-20260907-06-8, AC-20260907-06-9, AC-20260907-06-10, AC-20260907-06-11, AC-20260907-06-12, AC-20260907-06-13]
---

# The theme is picked in sketch: the signed-off gray kit is re-rendered per candidate direction, and the picked page becomes the fidelity reference

## Goal

`/spec:sketch` gains the theme pick as its own first run. The mocks driver gains a `theme`
subcommand family — `state`, `compose`, `open`, `adopt` — that lives entirely outside the
mocks state machine: candidates are the signed-off gray kit re-rendered at production fidelity
per candidate direction (`design/theme/<kebab>/kit.html`), the winner is picked on the served
atlas exactly as every other look stop is, and `adopt` writes `design/tokens.css` plus the
`theme: <kebab>` provenance row. Sketch's "no theme picked yet, sketching gray" branch becomes
**author the theme if it is missing**, with a gray floor only when no kit family exists at all,
and a hard refusal when `design/tokens.css` is present but is the wireframe gray register
byte-for-byte. Done means a host can pick its theme without ever entering `/spec:mocks` THEME,
while `/spec:mocks` THEME keeps working byte-identically — retiring it is specs/20260907/07.
