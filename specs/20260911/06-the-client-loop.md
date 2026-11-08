---
date: 2026-09-11
status: done
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: [specs/20260910/05-what-the-journey-does-not-do.md, specs/20260911/01-the-page-waits-for-the-server.md]
depended_on_by: [specs/20260911/05-approval-is-bookkeeping.md]
brief: 22a
build_base: main
open_markers: 0
diff_base: f5c0ed242625c9df305ee9d10599966d2cb2bc4e
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260911-06-1, AC-20260911-06-2, AC-20260911-06-3, AC-20260911-06-4, AC-20260911-06-5, AC-20260911-06-6, AC-20260911-06-7, AC-20260911-06-8, AC-20260911-06-9, AC-20260911-06-10, AC-20260911-06-11, AC-20260911-06-12, AC-20260911-06-13, AC-20260911-06-14, AC-20260911-06-15, AC-20260911-06-16, AC-20260911-06-17, AC-20260911-06-18, AC-20260911-06-19, AC-20260911-06-20, AC-20260911-06-21, AC-20260911-06-22, AC-20260911-06-23, AC-20260911-06-24, AC-20260911-06-25, AC-20260911-06-26]
---

# The client loop: a journey's state follows the client's requests, the session picks up what the client left, and the served pages outlive every session

## Goal

Today the client player is a one-way form: the client walks, presses OK, leaves a note, and
nothing ever comes back to them — the player never shows that a note was addressed, has no
control to accept or reject a fix, has no place to say "a screen is missing", and doctrine tells
the session to stop the server at the end of every session. This spec turns it into the loop JJ
asked for: a journey's state is derived from the client's own requests (`changes requested` →
`fixed — please check` → `OK`, and a new request on an OK'd journey reopens it), the client
index carries a "something missing?" composer and a list of everything they asked for with its
status, the session's CLIENT step prints exactly what the client left and the one command that
answers each item, and the client server is the user's own long-lived process that no session
starts or stops. Done means a client can request, see the fix, request again, and OK — days
apart, across closed sessions — until the session approves.
