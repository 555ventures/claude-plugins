---
date: 2026-09-13
status: done
build_base: main
tier: standard
area: design-mocks
design: false
design_source: design/chrome-mocks/notes.html
breaking: true
depends_on: [specs/20260913/07-the-critic-is-out.md]
depended_on_by: [specs/20260913/06-every-mock-has-a-page-you-can-mark.md]
brief: n/a
open_markers: 0
diff_base: 27306bd260416fc7c7e085a30311e52f1fe54aaf
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260913-05-1, AC-20260913-05-2, AC-20260913-05-3, AC-20260913-05-4, AC-20260913-05-5, AC-20260913-05-6, AC-20260913-05-7, AC-20260913-05-8, AC-20260913-05-9, AC-20260913-05-10, AC-20260913-05-11, AC-20260913-05-12, AC-20260913-05-13, AC-20260913-05-14, AC-20260913-05-15, AC-20260913-05-17, AC-20260913-05-16]
---

# A note is a conversation

## Goal

A note already stores a conversation — every reply is appended to its `thread` — but the owner
cannot hold one. The review page's `Still not right` button posts no words, so the server refuses
it and the page swallows the refusal: that control has never worked. The note card shows only the
person's side of the thread, never what the session answered. A person can reply only to a note
the session has already addressed. Approve and Reject write identical records on the owner's
route, so a rejected note cannot be hidden. The box, its badge, the row and its pin each colour a
note by a different rule. And `notes open` lists notes the session already answered, so a fresh
session re-reads its own words. This spec makes the owner able to reply as often as they like,
shows both sides of the thread, makes Reject final and hidden, colours every per-note surface by
whose turn it is, and lists for the session only the notes waiting on it. It also closes the two
gaps specs/20260913/02 left: the `Mark an area` button stays pressed after marking ends, and a
note card stays open after its board switches state tab. Done means the owner can keep writing on
a note until they approve or reject it, and the colour says whose turn it is.
