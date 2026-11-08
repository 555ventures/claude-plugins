---
date: 2026-09-05
status: done
tier: critical
area: design-render
design: false
breaking: false
depends_on: [specs/20260905/05-desktop-fill-render-rule.md]
depended_on_by: []
brief: n/a
spiked: 2026-09-05
open_markers: 0
diff_base: 13f5d831d9f2336f7c1ca6aa5cb1f1a28ff7ef16
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260905-06-1, AC-20260905-06-2, AC-20260905-06-3, AC-20260905-06-4, AC-20260905-06-5, AC-20260905-06-6, AC-20260905-06-7, AC-20260905-06-8, AC-20260905-06-9, AC-20260905-06-10, AC-20260905-06-11]
---

# Plugin-owned browser capture, bound at the mocks-first approval marks

## Goal

No rendered check has ever run on a mocks-first product: `/spec:mocks`'s `journey-approved`
and `approved` marks run only the static `design-atlas.js check --matrix`, and
`render-gate --mocks` refuses any host that has not declared `design.render.capture` — none
of Hearwell, nor any genesis-born product, ever has. Done means: the plugin ships its own
dependency-free capture script (an installed Chrome driven over the DevTools protocol with
Node built-ins — executed today on all 31 Hearwell mocks), `render-gate --mocks` falls back to
it when the host declares no capture command and runs the plugin's adaptation rules when the
host declares no manifest, and the mocks driver runs that gate at every `journey-approved`
and at `approved`, refusing the mark on a finding or on a machine with no browser. JJ's ruling
2026-09-05 overturns specs/20260824/01 D1's "never launches a browser itself" for this path
(ADR-0007 amends ADR-0002).

Tier critical: this edits `spec/bin/spec-paths` (a listed critical surface) and changes what
a terminal approval stamp requires of every mocks-first host.
