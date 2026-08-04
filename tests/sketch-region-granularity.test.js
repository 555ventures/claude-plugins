'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// PRAX-20260801-02: sketch.md's scoped sweep authors mock regions for the current brief's gap
// surfaces, but has no rule about a surface that also carries capability an OUT-OF-SCOPE brief
// owns. Folding that capability into a region the current brief must bind entangles future-brief
// content inside a region this brief now binds — any later change to it costs an evidence-gated
// delta row (mock supremacy) even though the current brief never owned that content. Fix
// contract: capability belonging to a different brief gets its own region, so it stays
// unbound (inherited for free by the later brief) instead of trapped inside a bound region.

const sketch = read('spec/commands/sketch.md')

test('scoped sweep gives out-of-scope-brief capability its own region rather than folding it into a bound one', () => {
  assert.match(sketch, /own region/,
    'without this rule the sweep can fold a future brief\'s capability into a region the current ' +
    'brief binds, so any later edit to that capability costs an evidence-gated delta row instead ' +
    'of being free to change when its owning brief actually arrives')
})

test('scoped sweep states an unbound region is inherited for free by the later owning brief', () => {
  assert.match(sketch, /inherited for free/,
    'the rule must state the payoff explicitly — an unbound region costs nothing to change later — ' +
    'or there is no reason for the sweep to prefer the extra region over folding capability in')
})
