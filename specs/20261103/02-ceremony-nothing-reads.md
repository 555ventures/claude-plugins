---
date: 2026-11-03
status: done
tier: standard           # spec-status.js is touched render-only (one line deleted, --json shapes untouched) — the same shape specs/20261025/02 and specs/20261024/06 shipped at standard; no § Risk Tiers trigger fires
area: cross-cutting
breaking: false
depends_on: []
brief: n/a
open_markers: 0
diff_base: 61135737158cb84fb1f4b16eef781a403beb254d
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261103-02-1, AC-20261103-02-2, AC-20261103-02-3, AC-20261103-02-4, AC-20261103-02-5, AC-20261103-02-6, AC-20261103-02-7, AC-20261103-02-8, AC-20261103-02-9, AC-20261103-02-10, AC-20261103-02-11, AC-20261103-02-12]
---

# Ceremony nothing reads

## Goal

About two commits in five maintain the pipeline itself, and one feature touches a dozen
decision-bearing artifacts. This spec deletes the ceremony whose output nothing outside the
ceremony consumes: the mocks provenance ledger (its grammar, tags, statuses, gate, confirmation
round, counts line, exclusion rows and the roadmap parking-lot check that read it), the ops-ADR
"derive pass" and "coverage check" that doctrine itself calls non-certifying, the mocks edge
paragraphs and the legacy-status branch behind them, four unread roadmap-brief header fields,
the genesis brief's duplicate `## Journeys` section and the `brief-written` gates on it, and
the scaffold tournament's race-or-skip question, which becomes an auto-picked skip. Nothing is
replaced with lighter prose; no stage, script or config key is added. Done means: the files are
gone, every citation of them is gone or points at the surviving home, the suite is green, and
approving a journey by story hash is the only provenance the mocks stage keeps.
