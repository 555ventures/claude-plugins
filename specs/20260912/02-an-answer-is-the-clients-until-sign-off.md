---
date: 2026-09-12
status: done
build_base: main
tier: standard
area: design-mocks
design: false
design_source: design/client-mocks/walk.html
breaking: false
depends_on: [specs/20260912/01-the-card-explains-itself.md]
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: 4b5d420e89c6b9f74aa3cbc01f5734f44f6baa73
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260912-02-1, AC-20260912-02-2, AC-20260912-02-3, AC-20260912-02-4, AC-20260912-02-5, AC-20260912-02-6, AC-20260912-02-7, AC-20260912-02-8, AC-20260912-02-9, AC-20260912-02-10, AC-20260912-02-11, AC-20260912-02-12, AC-20260912-02-15, AC-20260912-02-13, AC-20260912-02-14]
---

# An answer is the client's until sign-off: change it, put a taken-back request back, and see every write land

## Goal

The client player is a one-way ratchet. An exclusion answer cannot be changed; a request taken
back with `Never mind` becomes a non-goal on a contractual list with no explanation and no
inverse; confirming a journey shows nothing at all, so a second click reads as a failure. And the
answer route has no sign-off gate, so a client can still flip a row after `--mark approved` has
written the dated `design/mocks/exclusions.md` — the ledger and the snapshot a statement of work
cites silently diverge. This spec closes all four: an answer is the client's to change until the
work is signed off and read-only after it, a taken-back request can be put back, and every client
write answers back. Done means nothing the client does on the player is irreversible before
sign-off, nothing they do after it can contradict the dated file, and no client write looks like
it failed.

sibling specs/20260912/01 ships the card's heading, lead, provenance lines and answered-state
sentences; this spec adds the controls beside them. The approved mock
`design/client-mocks/walk.html` (JJ, 2026-09-12) is the binding reference — R4 for `Change
answer`, R5 for the read-only render, R6 for the confirm receipt, R3 and `index.html` for `Put it
back`.
