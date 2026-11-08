---
date: 2026-08-23
status: done
diff_base: 9e626d2da2960587418c1ce0e30f5a1f8168aa87
tier: standard            # additive spec-paths keys follow 20260823/01's precedent; no critical-trigger file gets a behavioral edit; worst failure is a false exit 1 at review close, repaired by re-running the script
area: scripts
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260823-06-1, AC-20260823-06-2, AC-20260823-06-3, AC-20260823-06-4, AC-20260823-06-5, AC-20260823-06-6, AC-20260823-06-7, AC-20260823-06-8, AC-20260823-06-9, AC-20260823-06-10]
---

# Prose-debt pruning — capped Gotchas, relevance-triggered memory disposition

## Goal

Two prose surfaces are append-only by construction: the host rules' § Gotchas section (23
entries accreted in 23 days, including two that cite machinery deleted at v7.0.0) and
`.claude/agent-memory/` (29 notes, re-examined only when a diff happens to touch the note
file itself). Both violate core § Incident Policy as practiced — standing prose guards
minted on first occurrence, nothing pruning them. This spec makes both surfaces
self-pruning: a hard entry cap on Gotchas enforced by a script wired into the gate and the
review close, an evict-on-append duty for its two writers, a relevance/TTL sweep that
surfaces memory notes for the existing disposition duty, and a one-time triage that pays
the current debt down (23 → 10 entries, six durable truths promoted to a canonical doc).
Done means: the suite goes red on a 16th Gotchas entry with no eviction, and a stale memory
note can no longer outlive its subject silently.
