---
date: 2026-09-13
status: superseded
superseded_by: specs/20260913/07-the-critic-is-out.md
tier: standard
area: design-mocks
design: false
breaking: true
depends_on: [specs/20260913/02-the-layer-owns-one-mode-and-the-page-owns-the-card.md]
depended_on_by: [specs/20260913/04-only-a-person-starts-a-note.md]
brief: n/a
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260913-03-1, AC-20260913-03-2, AC-20260913-03-3, AC-20260913-03-4, AC-20260913-03-5, AC-20260913-03-6, AC-20260913-03-7, AC-20260913-03-8, AC-20260913-03-9, AC-20260913-03-10, AC-20260913-03-11]
---

# The critic stops filing notes

## Goal

The page-notes loop exists so a person can point at what they do not like on a mock. One
producer writes into it with no person involved: at the WALK state the driver dispatches a
fresh critic agent per journey, and every finding it returns is recorded as a `kind: "walk"`
note in the same queue the owner reads, which the journey cannot pass until the session closes
it. This spec deletes that producer end to end — the agent file, the WALK state it gates, the
mark and the reopen target that exist only for it, the `walk` note kind and its six reasons,
and the two command steps that dispatch it. The client's own journey walk is a different
feature that shares the word and is not touched. Done means the mocks chain runs
WIREFRAMES → THEME with nothing between, and no code path in the repo writes a note that a
person did not type.
