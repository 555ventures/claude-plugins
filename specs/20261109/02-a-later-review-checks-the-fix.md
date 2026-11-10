---
date: 2026-11-09
status: done
area: run
depends_on: []
brief: n/a
architecture: true
breaking: false
text: e815dbfb04bc75b6b7e87611240462a649fcff4c
acs: [AC-20261109-02-1, AC-20261109-02-2, AC-20261109-02-3, AC-20261109-02-4, AC-20261109-02-5, AC-20261109-02-6, AC-20261109-02-7]
---

# A later review checks the fix

## Goal

A run whose first review blocks and whose fix closes those findings merges after one short second review, unless the fix itself broke something. Measured on five replayed builds, this design let 4 of 5 merge against 1 of 5 today and found 7 of 7 defects the fixes introduced against 2 of 7. `spec/scripts/run.js` ends smaller than it starts.
