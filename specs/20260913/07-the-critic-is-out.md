---
date: 2026-09-13
status: done
build_base: main
tier: standard
area: design-mocks
design: false
breaking: true
depends_on: [specs/20260913/02-the-layer-owns-one-mode-and-the-page-owns-the-card.md]
depended_on_by: [specs/20260913/05-a-note-is-a-conversation.md]
brief: n/a
supersedes: [specs/20260913/03-the-critic-stops-filing-notes.md, specs/20260913/04-only-a-person-starts-a-note.md]
open_markers: 0
diff_base: 26a222450f4e0c1047343a9256c87384136b30f2
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260913-07-1, AC-20260913-07-2, AC-20260913-07-3, AC-20260913-07-4, AC-20260913-07-5, AC-20260913-07-6, AC-20260913-07-7, AC-20260913-07-8, AC-20260913-07-9, AC-20260913-07-10, AC-20260913-07-11, AC-20260913-07-12, AC-20260913-07-13, AC-20260913-07-14, AC-20260913-07-15, AC-20260913-07-17, AC-20260913-07-18, AC-20260913-07-19, AC-20260913-07-20, AC-20260913-07-21, AC-20260913-07-22, AC-20260913-07-23, AC-20260913-07-24, AC-20260913-07-25, AC-20260913-07-26]
---

# The critic is out

## Goal

The page-notes loop exists so a person can point at what they do not like on a mock. Two
producers write into that queue with no person involved. At the WALK state the driver dispatches
a critic agent per journey and records every finding as a `kind: "walk"` note the journey cannot
pass until the session closes it; while drawing, the session pins each inferred assumption to a
screen as a `kind: "question"` note the owner must answer before the journey approves. This spec
deletes both producers end to end — the WALK state, its mark, its reopen target and its agent;
the two ledger verbs that create a question, the answer route and every surface that renders or
counts one — and hides the question and walk notes an existing store already holds without
touching them on disk. It retires the composer's reason chips in the same stroke. Done means the
mocks chain runs WIREFRAMES → THEME with nothing between, every note the page shows or the
driver counts was typed by a person, and the only writer of an assumption row's status is the
human-run `ledger set`.
