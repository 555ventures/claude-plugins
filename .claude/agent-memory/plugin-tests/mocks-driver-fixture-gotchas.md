---
name: mocks-driver-fixture-gotchas
description: mocks-driver.js fixture-chain gotchas for red-phase tests reaching THEME/SIGNOFF state, plus a serve-endpoint content-type trap.
metadata:
  type: pattern
  reviewed: 2026-09-07
---

Building a `mocks-driver.js` fixture up to a late state (e.g. the SIGNOFF look, for an AC
asserting the bare-step output text) needs the full SEED→SHAPES→WIREFRAMES→THEME→SIGNOFF
chain driven via real `--mark` calls — no shortcut. Since specs/20260906/02 `direction-composed`
caps a direction at 2 composed screens with the seed's dense screen first (3+ refuses), so
`writeThemeDirection` takes `[DENSE, one more label]`, never a third. The shared `advanceTo*` builders, `decideLook`/`openLook`,
and the serve-child helpers (`startServe`/`stopServe`, since specs/20260905/04 — no hub exists any more) live in `tests/mocks/mocks-driver-fixtures.js` (module.exports, no `test(`
calls) — require it from a new mocks-driver test file instead of re-writing the chain; doctrine
tests outside `tests/mocks/` still carry their own condensed chain. Since specs/20260905/02 the
four marks `shape-picked`/`journey-approved`/`theme-picked`/`approved` refuse
without a decided look stop in `picks.json`: seed one with `decideLook` (writes through
`lib/mocks-picks.js`) before every acceptance, refusal paths included.

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

Since specs/20260905/06, `journey-approved` and `approved` run `render-gate --mocks` and fall back to the plugin's real-Chrome capture when the fixture host declares no `design.render.capture` — every fixture that reaches those marks calls `writeCaptureConfig(dir, writeFixtureCapture(dir))` from tests/mocks/mocks-driver-fixtures.js first (import it, never a third file-local copy), or the test launches a real browser and goes red without one.
