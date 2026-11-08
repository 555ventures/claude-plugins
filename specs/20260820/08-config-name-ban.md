---
date: 2026-08-20
status: done
diff_base: 5628834de5418a29561b4d63c9d59ced88fc5fa6
tier: standard
area: gate-integrity
design: false
breaking: false
depends_on: []
depended_on_by: []
spiked: 2026-08-20
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260820-08-1, AC-20260820-08-2, AC-20260820-08-3, AC-20260820-08-4, AC-20260820-08-5, AC-20260820-08-6, AC-20260820-08-7, AC-20260820-08-8, AC-20260820-08-9, AC-20260820-08-10, AC-20260820-08-11, AC-20260820-08-12, AC-20260820-08-15, AC-20260820-08-16, AC-20260820-08-13, AC-20260820-08-14]
---

# Config-read closure: ban naming the settings file instead of detecting reads

## Goal

The pin that is supposed to force every private read of the host's `.claude/spec.config.json`
through `lib/host-config.js` is fail-open in two independent dimensions, both demonstrated by
execution today. Replace its read-detection predicate with a decidable one — **only three named
files under `spec/scripts/` may contain the literal `spec.config.json` in executable text** —
and complete `lib/host-config.js` so every legitimate reason to name the file has a route
through the library. Done means: the two evasions executed today go red, every prose mention
stays green, and the eight offending lines in five files are migrated.
