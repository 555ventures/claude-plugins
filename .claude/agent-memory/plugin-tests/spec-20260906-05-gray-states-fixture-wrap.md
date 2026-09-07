---
name: spec-20260906-05-gray-states-fixture-wrap
description: writeWireframe's new default 3-state-button set must be wrapped in data-contract="none" or advanceToApproved's own check --matrix call fails on a pre-existing hygiene rule; opts.states coexists with the legacy opts.stateBtn escape hatch.
metadata:
  type: project
  reviewed: 2026-09-07
---

specs/20260906/05-gray-states-on-every-wireframe.md D4 changed `tests/mocks/mocks-driver-fixtures.js`'s
`writeWireframe(dir, label, opts)` to write `data-state-btn="empty"/"loading"/"error"` by default
(`opts.states = []` to omit, any other array to override). Naively appending the three `<button
data-state-btn="...">` elements straight into the labeled root broke `advanceToApproved`'s fixtures:
design-atlas.js's PRE-EXISTING hygiene(d) rule (specs/20260824/03 D1(d)) requires every
`data-state-btn` to sit before the `[data-screen-label]` root's opening tag OR inside a
`data-contract="none"` ancestor once a mock is bound — and `approved`'s mark runs `check --matrix`,
which binds every mock regardless of its own `data-status`. The fix: wrap the default button set in
`<div data-contract="none">…</div>`.

**Why:** discovered empirically — `node --test 'tests/mocks/*.test.js'` after the naive fixture edit
red across `mocks-driver-look-stops-2.test.js` and the state-derivation test in
`mocks-driver.test.js`, both failing at the `approved` mark with 12 `data-state-btn control inside
the [data-screen-label] root without a data-contract="none" ancestor` violations.

**How to apply:** any future fixture default that injects markup a bound-mode check (`--matrix`,
`ratified`, `approved`) will read must be checked against ALL of design-atlas.js's hygiene rules
((a) box-sizing reset, (b) font-size/line-height pairing, (c) no border on the root class, (d)
state-btn placement), not just the rule the new spec is about — run the full mocks glob before
trusting a "should be harmless" fixture change.

The pre-existing `opts.stateBtn` (raw HTML string) escape hatch — used by three tests in
`tests/mocks/mocks-driver-look-stops.test.js` to declare one exact button with no wrapper — was kept
working unchanged (bypasses `states` entirely when passed) since those tests are out of a
states-spec's own File Plan and must stay green untouched.
