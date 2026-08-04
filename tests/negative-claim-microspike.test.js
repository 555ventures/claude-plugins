'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// PRAX-20260804-01: plan.md's shape-triggered micro-spike currently fires only on claims a
// third-party DEPENDENCY adjudicates (queue-name constraints, API shapes, etc). A claim of the
// opposite polarity — "mutating X will make check Y fail" or "installing dependency Z will repair
// state W" — is just as falsifiable in one executed line, and just as capable of entering a
// Decision/Contract/AC unverified (a proof-of-falsifiability nobody actually ran the fault
// against). Fix contract: the micro-spike paragraph must classify negative claims identically —
// execute and observe the red/repair before the claim locks — and state that an unexecuted
// falsifiability proof is unverified.

const plan = read('spec/commands/plan.md')
const start = plan.indexOf('## Phase 1.5')
assert.ok(start !== -1, 'Phase 1.5 heading missing from plan.md')
const nextHeading = plan.indexOf('\n## ', start + 1)
const phase15 = plan.slice(start, nextHeading === -1 ? plan.length : nextHeading)
const microSpikeEnd = phase15.indexOf('**Full spike:**')
const microSpike = microSpikeEnd === -1 ? phase15 : phase15.slice(0, microSpikeEnd)

test('Phase 1.5 shape-triggered micro-spike paragraph names negative claims as dependency-adjudicated', () => {
  assert.match(microSpike, /negative claims/,
    'a mutation/fault/misconfiguration-will-fail claim (or a dependency-will-repair claim) has no ' +
    'trigger in the micro-spike paragraph, so it can lock into a Decision/Contract/AC without ever ' +
    'being executed against the real dependency — the paragraph must name this claim shape')
})

test('Phase 1.5 states an unexecuted falsifiability proof is unverified', () => {
  assert.match(microSpike, /never itself failed is unverified/,
    'without this line a falsifiability proof that was never actually run against the fault can ' +
    'still be cited as evidence — the paragraph must say plainly that an unexecuted proof carries no weight')
})
