---
date: 2026-09-11
status: done
build_base: main
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: [specs/20260911/06-the-client-loop.md]
depended_on_by: []
brief: 22a
open_markers: 0
diff_base: b8673741aaa1713b7ab91b7fc68338a5cf85da4a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260911-05-1, AC-20260911-05-2, AC-20260911-05-11, AC-20260911-05-3, AC-20260911-05-4, AC-20260911-05-12, AC-20260911-05-5, AC-20260911-05-6, AC-20260911-05-7, AC-20260911-05-8, AC-20260911-05-9, AC-20260911-05-10]
---

# Approval is bookkeeping: exclusions reach the client from their first walk, the client can say "we do need this", and an item the client never answered lands in the parking lot as not contested

## Goal

specs/20260910/05 made `--mark approved` refuse while any derived exclusion row is `open`, and
made the rows exist only after `ledger derive` or that same mark — so on the ordinary order
(client walks first) the closing screen lists nothing, the client confirms, and approval then
refuses with a "stamp it yourself" remedy while `exclusions.md` is never written. JJ's ruling:
approval is the session's own bookkeeping, not a gate on the client's consent to our rows, and
an item the client never pressed lands in the roadmap's parking lot marked not contested. This
spec materializes exclusion rows the moment the client can see them, gives the closing screen a
"No — we need this" answer beside "Correct", deletes the approval refusal, writes the dated file
under two headings, and fences both agreed and not-contested items in the roadmap. Done means a
client who skips the closing screen never blocks approval and never silently unfences a
non-goal.
