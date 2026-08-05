'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { ROOT, runBash } = require('../helpers')

// spec: specs/20260801/04-live-smoke.md — pins AC-20260801-04-6 for the boot-smoke leg
// (D3/D4). Today's .claude/spec.config.json still declares `runtime.inert`, the stale
// exemption this spec exists to close — smoke.sh reads that block first and short-circuits
// to __SMOKE_INERT__/exit 4 before ever trying to boot anything, so this fails on current
// code regardless of whether autopilotd's --check/--hold flags land. Runs against the
// repo's OWN real config (not a synthetic fixture) — that is the whole point: a stale
// runtime declaration voided executed verification for three consecutive spec reviews
// (Rationale), and only the real config file can prove the class of failure is closed.

test('AC-20260801-04-6: smoke.sh against this repo\'s real .claude/spec.config.json prints __SMOKE_PASS__ and exits 0', () => {
  const res = runBash('scripts/smoke.sh', [], { cwd: ROOT, timeout: 90000 })
  assert.strictEqual(res.status, 0,
    `smoke.sh must exit 0 against this repo's real runtime config — anything else (4 = still __SMOKE_INERT__, 2 = boot-crashed, 1 = not-ready) means /spec:review's one executed-verification leg still isn't passing against a real bootable process; got status=${res.status} stdout=${res.stdout} stderr=${res.stderr}`)
  assert.match(res.stdout, /__SMOKE_PASS__/,
    `the __SMOKE_PASS__ sentinel is the machine verdict every caller of smoke.sh keys off of; its absence (e.g. __SMOKE_INERT__ from the stale runtime.inert declaration this spec replaces) means every future review still runs with zero executed verification; got stdout=${res.stdout}`)
  assert.doesNotMatch(res.stdout, /__SMOKE_INERT__/,
    `runtime.inert must be replaced by a real bootCommand/readyCheck block (D4) — an __SMOKE_INERT__ line means the stale exemption this spec exists to close is still in place`)
})
