---
date: 2026-09-08
status: done
build_base: main
tier: standard
area: gate-integrity
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260908/02-driver-dedupe-onto-lib.md, specs/20260908/03-test-fixture-dedupe.md, specs/20260908/04-duplicate-window-ratchet.md]
brief: n/a
open_markers: 0
spiked: 2026-09-08
diff_base: 54b398a3b942ca3410fc4db01fcf26e3645d13e3
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260908-01-1, AC-20260908-01-2, AC-20260908-01-3, AC-20260908-01-4, AC-20260908-01-5, AC-20260908-01-6, AC-20260908-01-7, AC-20260908-01-8, AC-20260908-01-9, AC-20260908-01-10, AC-20260908-01-11, AC-20260908-01-12, AC-20260908-01-13]
---

# Size ratchet — a tight, cited-raise byte budget over scripts and tests

## Goal

Every file under `spec/scripts`, `scripts`, and `tests` gets a byte ceiling recorded in one
tracked baseline, and every tree gets a total ceiling, so the plugin's own code can shrink
freely but can only grow through a raise that names the spec asking for it. The baseline is
kept *tight* by the gate itself: a ceiling that has outlived its shrink is a failure, not a
loophole. Done means the repo's own suite runs the check green on a freshly seeded baseline,
every red case is pinned against a synthetic tree, and the host rules state the budget as a
one-line duty.
