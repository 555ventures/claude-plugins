#!/usr/bin/env node
'use strict'
// Synthetic host gateCommand (spec 20260928/02 D3(4), freeze.test.js's gate-check cases): green
// unless GATE_RED=1, in which case it exits 1 after printing a line the test can find in the
// gate.log freeze.js is required to write. Never actually runs anything test-shaped — this
// fixture host has no real test suite to gate.
if (process.env.GATE_RED === '1') {
  console.error('synthetic gate: red (GATE_RED=1)')
  process.exit(1)
}
console.log('synthetic gate: green')
process.exit(0)
