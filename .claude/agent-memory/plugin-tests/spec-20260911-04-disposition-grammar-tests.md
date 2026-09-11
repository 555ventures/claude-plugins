---
name: spec-20260911-04-disposition-grammar-tests
description: Test-authoring patterns for spec 20260911/04 (every-criterion-declares-its-test) — forcing count-tests.js/scope-reconcile.js crashes via testGlobs:[null], and a legitimate green-pre-change reconstruction pin.
metadata:
  type: project
---

specs/20260911/04-every-criterion-declares-its-test.md (disposition grammar: writes/rewrites/reuses
arrow-tail on AC bullets, D1-D12). Two reusable patterns from authoring its red-phase tests:

**Forcing count-tests.js to crash for a "broken instrument" fixture**: setting host config
`testGlobs: [null]` makes `lib/glob-match.js`'s `globMatch(null, filePath)` throw
`TypeError: Cannot read properties of null (reading 'length')` inside `listTestFiles`, crashing
count-tests.js's child process (non-zero exit, empty stdout) with zero other scaffolding needed.
Collateral: `scope-reconcile.js`'s non-probe mode ALSO reads `config.testGlobs` at module top level,
so this SAME config crashes the `reconcile` leg too when driving it through `review-legs.js` — review-
legs.js still completes and appends every other leg's row regardless (each leg's crash is isolated to
its own row), so this is safe for tests that only inspect one specific leg's row (e.g. the `tests`
leg's `{"unavailable":"count-failed"}` shape, AC-20260911-04-10).

**AC-20260911-04-18 is a legitimate green-pre-change pin** — its own claim ("D10's regex-context
widening moves this repo's live count by exactly zero") is true independent of whether D10 has
landed, per the spec's own Assumptions rationale (no live file exercises the widened shapes). Made
it a real, non-vacuous, executable check rather than skip/block it: capture the real repo's count
via the shipped `count-tests.js --root .`, then textually patch a faithful reconstruction of D10's
exact literal token-list widening onto a SCRATCH COPY of the real `lib/scan-test-calls.js` (string
`.replace()` on two specific lines), fix up that copy's relative `require('./host-config')` /
`require('./glob-match')` to absolute paths (the copy lives outside the real lib/ dir, so relative
requires break — this bit me once), run its `countCases(ROOT, config)` over the SAME real corpus,
and assert the two totals match. Passes today; would catch a real regression if a future edit ever
added a live file matching one of the widened shapes. See [[new-spec-ac-green-pre-change]].

See also [[gate-thresholds-live-in-roadmap-brief]] for the general pattern of forcing instrument
crashes via config, and the repo's `--json` structured-output idiom (query `out.findings.find(...)`
by `.class` rather than string-matching plain-text HARD lines) — much more robust than reconstructing
exact `padEnd()` spacing for a new finding class's plain-text line; use `assert.match(...,  /\s+/)`
regexes only when the AC text itself locks a literal plain-text line.
