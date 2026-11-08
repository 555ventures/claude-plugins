---
date: 2026-09-06
status: done
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: [specs/20260906/02-mocks-ends-at-wireframes.md]
depended_on_by: [specs/20260906/04-journey-review-page.md, specs/20260906/06-sketch-high-fidelity-and-critique.md]
brief: 22a
open_markers: 0
spiked: 2026-09-06
diff_base: cbe3423ba6ab845def4369d6407bb58ac09d03e9
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260906-03-1, AC-20260906-03-2, AC-20260906-03-3, AC-20260906-03-4, AC-20260906-03-5, AC-20260906-03-6, AC-20260906-03-7, AC-20260906-03-8]
---

# Questions on the wireframe: the session's assumptions pinned to the screen, answered inline, gating approval; free-form messages with a reason; catch provenance derived

## Goal

Every inferred or invented product assumption the session writes while drawing a journey is pinned as a **question** on the screen it belongs to. The served page shows it as "I assumed … I rejected …" with Yes / No, it's… / Later; an answer writes the ledger row's status and resolves the note, and `journey-approved` refuses while a question on the journey is unanswered. The client (or JJ) sends free-form messages at two scopes with a reason (missing screen, wrong direction, wrong words, other); each blocks approval until the session addresses it. Catch provenance (question · note · unlinked) is derived from the notes store and printed by `ledger counts`. One store for status (the ledger), one store for placement (notes.json), no new ledger column.
