'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// JJ-20260801-01 / spec 20260813/01-review-self-report-integrity.md D6: three consecutive
// CLEAN reviews rode a `runtime.inert` config declaration after `autopilot/bin/autopilotd`
// made it false (a bootable entry point had been added), and nothing re-validated the
// exemption. review.md's Phase 0 step 3 smoke-leg bullet (exit 4 = runtime declared inert)
// must gain a session-applied inert-falsifier check: when smoke exits 4 AND the spec's File
// Plan or diff adds a bootable entry point, that is an automatic hard finding naming the
// falsified inert declaration, with a remedy named — and per § Doctrine Authoring the new
// blocking claim must carry its claims-registry marker inline, since an unmarked one would be
// silently baseline-absorbed by claims-lint's own --update-baseline re-stamp.

const review = read('spec/commands/review.md')

test('AC-20260813-01-6: review.md hard-finds a runtime.inert declaration falsified by the spec\'s own File Plan bootable entry point', () => {
  assert.match(review, /inert declaration falsified by (this spec's own|the spec's own) File Plan/,
    'review.md\'s smoke-leg bullet (exit 4 = declared inert) has no check for the exemption ' +
    'going stale: JJ-20260801-01 rode `runtime.inert` through three CLEAN reviews after ' +
    '`autopilot/bin/autopilotd` (a bootable entry point) made the declaration false, because ' +
    'nothing re-validated it against the spec\'s own File Plan or diff — this must be an ' +
    'automatic hard finding, not a silently-off gate')
})

test('AC-20260813-01-6: the inert-falsifier finding names its remedy (declare runtime, re-run /spec:init, or record sanctioned inertness)', () => {
  assert.match(review, /re-run `?\/spec:init`?/,
    'a hard finding without a named remedy leaves the reviewer to invent one — the ' +
    'inert-falsifier clause must name re-running `/spec:init` Phase 1.5 (or declaring the ' +
    'runtime block, or recording the sanctioned inertness in the spec) as the fix')
  assert.match(review, /Phase 1\.5/,
    'the remedy must point at /spec:init\'s Phase 1.5 specifically — the phase that (re)stamps ' +
    'the runtime block — not a bare unqualified re-run of the whole command')
})

test('AC-20260813-01-6: the new inert-falsifier hard-finding claim carries its claims-registry unenforced marker inline', () => {
  assert.match(review, /<!-- unenforced: session-applied File Plan judgment — no deterministic bootable-entry-point detector exists -->/,
    'per § Doctrine Authoring every blocking claim needs a claims-registry marker naming why no ' +
    'deterministic enforcer exists — an unmarked inert-falsifier finding would be silently ' +
    'absorbed as baseline debt by claims-lint\'s own `--update-baseline` re-stamp, with no gate ' +
    'ever presenting it (the refuter finding this spec\'s D6 records)')
})
