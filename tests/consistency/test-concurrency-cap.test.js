'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT } = require('../helpers')

// D15 (specs/20260907/09) capped --test-concurrency at 3 on both gateCommand and testCommand
// because a green full-suite run at the runner's default fan-out had stopped proving anything:
// per-file wall time inflated under load, reddening healthy files, and a port collision failed
// a genesis test that passed in isolation. specs/20260910/01-contention-proof-budget-and-uncapped-suite.md
// D4 supersedes the cap: both causes are now closed (port collisions by specs/20260909/06, false
// budget reds by D2's serial confirm step), so this file retires the `<= 3` assertion and pins
// the replacement mechanism instead — neither command may carry --test-concurrency at all, and
// the guard proves itself via the reporter's exported CONFIRMING_ENV, not a hand-picked number.
// AC-20260910-01-6.

test('AC-20260910-01-6: neither gateCommand nor testCommand in .claude/spec.config.json carries a --test-concurrency flag, and the budget reporter module exports CONFIRMING_ENV as the confirm step\'s child-mode env-var name', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/spec.config.json'), 'utf8'))

  assert.ok(!/--test-concurrency\b/.test(config.gateCommand),
    'D4: gateCommand must never carry --test-concurrency again — D2\'s serial confirm step, not a hand-picked cap, is what keeps a scoped gate run reproducible under load: got ' + JSON.stringify(config.gateCommand))
  assert.ok(!/--test-concurrency\b/.test(config.testCommand),
    'D4: testCommand must never carry --test-concurrency again — capping parallelism here is exactly the D15 regression this spec closes: got ' + JSON.stringify(config.testCommand))

  const reporterModule = require(path.join(ROOT, 'scripts/test-file-budget-reporter.js'))
  assert.strictEqual(reporterModule.CONFIRMING_ENV, 'SPEC_TEST_BUDGET_CONFIRMING',
    'D4: the reporter must export CONFIRMING_ENV === \'SPEC_TEST_BUDGET_CONFIRMING\' — this export exists only because the D2 confirm step exists, so a regeneration that silently drops the confirm also drops this export and reds this pin: got ' + JSON.stringify(reporterModule.CONFIRMING_ENV))
})
