---
date: 2026-09-10
status: done
build_base: main
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: [specs/20260910/03-client-journey-player.md]
depended_on_by: []
brief: 22a
open_markers: 0
diff_base: d6f994a63950ef59827959f939f1e675adeabdc3
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260910-05-1, AC-20260910-05-2, AC-20260910-05-3, AC-20260910-05-4, AC-20260910-05-5, AC-20260910-05-6, AC-20260910-05-7, AC-20260910-05-10, AC-20260910-05-8, AC-20260910-05-12, AC-20260910-05-13, AC-20260910-05-9]
---

# What the journey does not do: exclusion rows derived from decisions already made, rendered on the last screen, in the roadmap's parking lot, and as a versioned appendix

## Goal

A client who confirms a journey has confirmed what is on the screens; nothing tells them what
was deliberately left out, so the first "where is X?" arrives after launch. ADR-0013 names the
fix: exclusions are a derived ledger row kind, never typed by hand, accumulated from decisions
the pipeline already records — a discovery non-goal marked Later or Won't-this-time, a client's
"that's not right" on a row the session invented, a client note withdrawn as not needed. This spec adds the
kind, the derivation, and its three renders: the closing screen of each journey in the player
("what this journey does not do", confirmed with one button), the roadmap parking lot genesis
writes (every exclusion must appear there or `roadmap-written` refuses), and
`design/mocks/exclusions.md`, regenerated at `approved` and stamped with the approval date so a
statement of work can cite it by date. Done means nothing left out is left unsaid.
