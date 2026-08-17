'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// SALONOS-20260815-01 (salon-os brief 2026-08-15, observed twice — specs 20260814/01 and /02,
// runId wf_e4778d03-81b): the gate has no way to distinguish "the code under test is wrong" from
// "the environment the test needs was never provisioned". With DATABASE_URL unset, the DB-backed
// suites failed inside env() at zod parse time, never reaching an assertion; wf-build classified
// that as implementation breakage, burned a full repair round on correct code, and returned
// `blocked`. Both suites passed unchanged the moment the variable was set.
//
// The repair loop is the most expensive thing build runs AND it cannot possibly succeed against
// this class: the code it would edit is not the code that failed. So the cost is paid in full,
// every time, with a guaranteed-useless outcome. Not specific to DATABASE_URL or to that host —
// any host whose pipeline rules declare an environment-gated suite has the same shape.
//
// Fix contract: the environment variables the host's § Test Rules names as gating a suite are
// preflighted BEFORE the gate runs. On a miss, build fails fast and surfaces that section's
// provisioning path instead of entering repair. This pin is deliberately agnostic about whether
// the preflight is a script or a doctrine step — it asserts the obligation is stated at the point
// of gate resolution and that the miss routes away from repair, which any correct carrier
// satisfies.

const build = read('spec/commands/build.md')

test('AC-20260815-05-5, JJ-20260815-08: build doctrine preflights the suite-gating environment variables the host declares before running the gate', () => {
  assert.match(build, /(preflight|provision)[\s\S]{0,400}(environment variable|env var|suite-gating)/i,
    'nothing in build names an environment preflight, so an unprovisioned variable reaches the ' +
    'gate as an ordinary red and is indistinguishable from broken code — the observed salon-os ' +
    'failure, hit twice')
})

test('AC-20260815-05-6, JJ-20260815-08: an unprovisioned environment is routed away from the repair loop and toward the host\'s provisioning path', () => {
  const nearRepair = /(environment|env)[\s\S]{0,300}(never enter|instead of entering|not enter|skip)[\s\S]{0,80}repair/i
  const nearProvision = /(environment|env)[\s\S]{0,300}(Test Rules)[\s\S]{0,200}(provision)/i
  assert.ok(nearRepair.test(build) || nearProvision.test(build),
    'build must say what happens on a preflight miss — fail fast citing the host\'s § Test Rules ' +
    'provisioning path — because a preflight that still falls through to repair spends the ' +
    'expensive loop on code that was never the cause')
})
