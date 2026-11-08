---
date: 2026-09-10
status: done
tier: standard
area: design-atlas
design: false
breaking: false
depends_on: [specs/20260910/02-click-to-advance-and-real-records.md, specs/20260907/10-client-review.md]
depended_on_by: [specs/20260910/04-theme-before-the-client-walk.md, specs/20260910/05-what-the-journey-does-not-do.md]
brief: 22a
open_markers: 0
build_base: main
diff_base: 360152d3860e82efa328bcf628442e1b0d61460e
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260910-03-1, AC-20260910-03-2, AC-20260910-03-3, AC-20260910-03-4, AC-20260910-03-5, AC-20260910-03-6, AC-20260910-03-7, AC-20260910-03-8, AC-20260910-03-9, AC-20260910-03-10]
---

# The client walks one journey at a time: a player advanced by the real control, the session's guesses marked on the screen, approve unlocked by reaching the end, one sentence at approve

## Goal

Every `/client/…` page 404s today; the draft that would have served the artboard grid there is
superseded by ADR-0013. This spec serves the client's surface: `/client/index.html` (the
journeys, how many guesses are still open on each, which are confirmed) and
`/client/walk/<j>.html` (one screen at a time in a frame, advanced by clicking the control
spec 02 declared, with the session's guesses for that screen beside it as 合ってる / 違う marks,
a free note box, the gray states reachable, and — only once the last screen was reached by
clicking through — an approve control that takes one typed sentence). Wrong clicks are logged
per screen for the session and never shown to the client. A 違う with a reason becomes a new
said-by-user row and the player shows how many guesses are still open. The terminal `approved`
mark refuses while any journey is neither confirmed by the client nor waived, and prints each
journey's sentence beside the waived count. Done means a person with the exposed address can
rehearse every journey and confirm it without a name, a role, or any page that is not the
journey.
