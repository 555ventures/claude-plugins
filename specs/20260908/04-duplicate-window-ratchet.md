---
date: 2026-09-08
status: done
build_base: main
tier: standard
area: gate-integrity
design: false
breaking: false
depends_on: [specs/20260908/02-driver-dedupe-onto-lib.md, specs/20260908/03-test-fixture-dedupe.md]
depended_on_by: []
brief: n/a
open_markers: 0
spiked: 2026-09-08
diff_base: 29cb1f457090582d4e4bf7f0fafdf00a039d8a2a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260908-04-1, AC-20260908-04-2, AC-20260908-04-3, AC-20260908-04-4, AC-20260908-04-5, AC-20260908-04-6, AC-20260908-04-7]
---

# Duplicate-window ratchet — copy-paste detection that can only tighten

## Goal

Repeated code across `spec/scripts`, `scripts`, and `tests` is counted mechanically the way
jscpd and SonarQube count duplicated lines — identical windows of normalized lines — and the
per-file count is ratcheted in a tracked baseline with the same tight semantics as the size
ratchet: a stale count is red, `--update` only lowers, `--raise --cite` is the only way up.
Done means the repo's own suite runs it green on a baseline seeded after the two dedupe
siblings landed, and every red case is pinned on synthetic trees.
