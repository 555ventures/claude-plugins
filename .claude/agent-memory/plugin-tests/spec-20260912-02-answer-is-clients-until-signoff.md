---
name: spec-20260912-02-answer-is-clients-until-signoff
description: tests-layer authoring for the reconsider/sign-off-cutoff/put-back/confirm-receipt spec — status.json marks.approved shape and ledger cell-index gotchas
metadata:
  type: project
  reviewed: 2026-09-12
---

specs/20260912/02-an-answer-is-the-clients-until-sign-off.md's D3 sign-off cut-off reads
`design/mocks/status.json`'s `marks.approved`, which `mocks-driver.js` stamps as a full ISO
timestamp (`nowIso()`), never a bare date — tests that seed it directly write
`'2026-09-12T00:00:00.000Z'` and assert the 409/render date text as the sliced `2026-09-12`
(implementation is expected to `.slice(0,10)` it, matching D3's Contracts example literally).

AC-20260912-02-9's observable ("no exclusion row anchored `withdrawn: <id>` in a non-overridden
status after put-back") is deliberately mechanism-agnostic per the spec's own A6: `reopenNote`
(lib/mocks-notes.js) only ever set `status`/`addressed`/`thread`, never `resolution`/
`withdrawReason` — so whether "leaving withdrawn" clears those fields or `deriveExclusions` grows
a status check is unresolved on purpose; the test asserts the ledger outcome via `parseLedger`,
never the note's own resolution field.

**Resolved at build (2026-09-12):** the first of the two. `reopenNote` now clears `resolution` and
`withdrawReason` alongside the status flip, because `deriveExclusions`'s
`withdrawnNotNeededEntries` keys on those two fields and never on `status` — leaving them set means
the put-back's source never reads as gone and the derived row can never be retired. A6's
"materialize retires a row whose source is gone" holds only once the note stops spelling
`withdrawn`. The mechanism-agnostic AC was the right call and still is; this records which branch
the implementation took.

`tests/mocks/exclusions-route.test.js`'s AC-20260911-05-4 test was rewritten in place and retagged
AC-20260912-02-3 (D2's Contract literally calls it a rewrite) — kept the pre-existing agree/
needed/absent-verdict assertions untouched and only added a `reconsider` name-check to the 400
error assertion, per the host's retag-not-fork convention.

`buildWalkPage`'s D20 filter (`journeyRequestsOn(...).filter(n => n.status !== 'resolved')`)
currently drops EVERY resolved request from the walk page's own request panel — AC-20260912-02-11
pins that a withdrawn one must now render there too (in addition to the index), so that filter
needs a withdrawn-resolution exception, not a status-only check. Confirmed red against the
pre-image via a real fixture (`renderWalkRequest` never sees the note at all today).

Ledger row markdown split-by-`|` has a leading AND trailing empty cell from the surrounding pipes
— `cells[6]` is the status column, not `cells[5]` (id=1, step=2, kind=3, claim=4, tag=5,
status=6, rejected=7, dependents=8, note=9) — easy off-by-one if hand-splitting instead of using
`parseLedger`; used `parseLedger` throughout instead of raw string splitting except one AC-2 route
test that asserts the raw written row text directly (acceptable there since it is asserting on
the file's own bytes, not deriving a status word from them).

Collision sweep at grep for `wk-verdicts`, `wk-req-acts`, `data-wk="confirm"`, `verdict must be
agree or needed` across all of tests/ found zero pins outside this spec's own five files — no
sibling test needed a fix or a waive.
