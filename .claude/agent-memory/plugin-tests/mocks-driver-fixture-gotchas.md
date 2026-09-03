---
name: mocks-driver-fixture-gotchas
description: mocks-driver.js fixture-chain gotchas for red-phase tests reaching THEME/REVIEW state, plus a serve-endpoint content-type trap.
metadata:
  type: pattern
---

Building a `mocks-driver.js` fixture up to a late state (e.g. REVIEW sign-off, for an AC
asserting the bare-step output text) needs the full SEED→SHAPES→WIREFRAMES→THEME→SKIN→REVIEW
chain driven via real `--mark` calls — no shortcut. `direction-composed` requires >=3 composed
screens per direction, so the journey itself needs >=3 labels (not 2) to have enough approved
labels to compose with once THEME is reached. Each test file writes its own condensed
`advanceTo*` helper chain rather than importing another test file's (no shared fixture module
beyond `tests/helpers.js`) — expect duplication across `tests/mocks/*.test.js` and any doctrine
test that needs to exec the driver.

Trap: `design/targets.json`'s `viewports` array is checked non-empty at `seed-done` time
(`!targets.viewports.length` dies), even though viewport *usage* (the `<meta name="viewport">`
requirement on every mock) only bites at the `approved` mark. Setting `viewports: []` to dodge
the later check breaks fixture setup immediately at `seed-done` instead — always give it one
real entry regardless of how far the fixture needs to go.

`design-atlas.js serve`'s MIME map defaults `.js` → `application/javascript`, but a spec
Contract can require one specific endpoint to declare a different content-type (e.g.
`GET /__notes/notes.js` → `text/javascript` per specs/20260902/10 D2's HTTP contract) — pin the
AC's literal exactly rather than assuming the general static-file MIME table governs a
spec-defined endpoint.

Also reconfirms [[new-spec-ac-green-pre-change]]: an AC phrased "continues to accept once X"
(a non-regression/continuity pin, e.g. specs/20260902/10 AC-10) is legitimately green both
before and after the implementation lands — not a sign the test is wrong.

Same-session reconfirms the top-level-`require`-of-a-not-yet-existing-lib red pattern from
`tests/mocks/mocks-ledger.test.js` (spec 06): when a File Plan CREATEs a lib
(`spec/scripts/lib/mocks-notes.js` for spec 10), `require`ing it at module top level — not
inside each test body — is the sanctioned way to make the whole file red at once via
MODULE_NOT_FOUND.
