---
date: 2026-08-07
status: done
open_markers: 0
risk: T2
area: autopilot
design: false
breaking: true
depends_on: []
depended_on_by: []
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260807-02-1, AC-20260807-02-2, AC-20260807-02-3, AC-20260807-02-4, AC-20260807-02-5]
---

# Autopilot dead-surface deletion: screenshot chain + onText

## Goal

Delete the two adapter surfaces the 2026-08-07 over-engineering audit verified as
zero-consumer: the entire screenshot chain (`screenshotIfConfigured` → `sendPhoto` →
`screenshotCommand` config row) and the `onText`/`textCb` free-text callback registration.
Both shipped to spec-shape ahead of any consumer ("unconsumed completeness") and are defended
only by their own tests. Done = the surfaces are gone, the scoped autopilot suite passes, and
the adapter's living documentation (`docs/canonical/autopilot.md`) matches the real surface.
Deletion-only: net lines down, no new mechanisms.
