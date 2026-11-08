---
date: 2026-09-13
status: superseded
superseded_by: specs/20260913/07-the-critic-is-out.md
tier: standard
area: design-mocks
design: false
breaking: true
depends_on: [specs/20260913/03-the-critic-stops-filing-notes.md]
depended_on_by: [specs/20260913/05-a-note-is-a-conversation.md]
brief: n/a
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260913-04-1, AC-20260913-04-2, AC-20260913-04-3, AC-20260913-04-4, AC-20260913-04-5, AC-20260913-04-6, AC-20260913-04-7, AC-20260913-04-8, AC-20260913-04-9, AC-20260913-04-10, AC-20260913-04-11, AC-20260913-04-12, AC-20260913-04-13, AC-20260913-04-14]
---

# Only a person starts a note

## Goal

The second and last producer that writes into the annotation queue with no person involved is
the ledger question: while drawing a journey the session pins each inferred product assumption
to a screen as a `kind: "question"` note, and the owner opens their review page to find rows
they never wrote, with the journey blocked until each is answered. This spec deletes that
producer end to end — the two CLI verbs that create one, the answer route and its ledger
writeback, every surface that renders a question row, and every gate that counts one — and
hides the ones an existing store already holds. It retires the composer's reason chips in the
same stroke, the other half of the same locked Decision: a note is what the person wrote, not a
value the system offered them first. Done means every note in the queue was typed by a person,
and the only writer of an assumption row's status is the human-run `ledger set`.
