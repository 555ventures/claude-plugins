---
date: 2026-09-09
status: superseded
superseded_by: "ADR-0013 — the client route serves a journey player, never the artboard grid in client mode"
tier: standard
area: design-atlas
design: false
breaking: false
depends_on: [specs/20260907/10-client-review.md]
depended_on_by: []
brief: 22a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260907-11-1, AC-20260907-11-2, AC-20260907-11-3, AC-20260907-11-4, AC-20260907-11-5, AC-20260907-11-6]
---

# The served client view: a whole-project entry, product-only rows, and before/after under every fixed note

## Goal

Spec 10 makes the client route enforce origin, capture, closure and waiver on the notes file,
but nothing renders on it. This spec serves the client's pages: `/client/index.html` — the
whole-project entry (every journey, its open questions and client notes) — and
`/client/review/<j>.html`, the existing journey review page in client mode: product-kind
questions and the client's own notes only, the walk lane and the session's internal notes
hidden, no approve/change control (the client is never the decider), a before/after strip
under every `addressed` client note, Withdraw on an open note and Accept on an addressed one,
and the composer posting to the client route. Framing follows the project's own first declared
viewport; the template `design/targets.json` becomes desktop-first for new projects, and a
responsive project's client can switch viewports with the same buttons the atlas toolbar has.
Done means a client with the exposed address can read, answer, note and close without ever
seeing a walk finding, a session note, or a control that belongs to the approver.

**Lock precondition (ADR-0012, brief 22a):** one real client is observed on the existing
review page of a real host before this spec locks. The seven-day waiver window and the
withdraw-not-decline rule are the first things that observation may change, and the client
page's shape follows what that client actually did (memory: prototype before plan for
UI-bearing specs — read the forks from reactions).

[NEEDS CLARIFICATION: observe one real client on a real host's existing review page — what
they clicked, whether they left notes at all or only answered questions, and whether the
seven-day window and withdraw-not-decline held; fold the result into D2/D4 before locking]
