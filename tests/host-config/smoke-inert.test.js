'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { ROOT, runBash } = require('../helpers')

// spec: specs/20260801/04-live-smoke.md — originally pinned AC-20260801-04-6: smoke.sh
// against this repo's REAL config must boot autopilotd and print __SMOKE_PASS__, closing a
// stale runtime.inert exemption that had voided executed verification for three reviews
// while a bootable daemon existed.
//
// REVERSED 2026-08-20 (JJ ruling, autopilot parked as product failure 2026-08-18): there is
// no bootable product in this repo any more, so `runtime.inert` is now the TRUE declaration
// and a bootCommand claiming otherwise would be the stale lie. The pin's job is unchanged in
// spirit — smoke.sh against the real config must yield its sanctioned outcome, and the
// config must never silently drift — but the sanctioned outcome is now __SMOKE_INERT__/exit 4
// with a reason naming the parked daemon. If autopilot is ever revived as a bootable
// product, this pin must flip back to __SMOKE_PASS__/exit 0 in the same commit that revives
// it — an inert declaration alongside a real bootable app is exactly the class of lie the
// original AC existed to kill.

test('JJ-20260820 (supersedes AC-20260801-04-6): smoke.sh against this repo\'s real .claude/spec.config.json prints __SMOKE_INERT__ naming the parked daemon and exits 4', () => {
  const res = runBash('scripts/smoke.sh', [], { cwd: ROOT, timeout: 90000 })
  assert.strictEqual(res.status, 4,
    `smoke.sh must exit 4 (sanctioned inert) against this repo's real runtime config — exit 0 means a bootCommand crept back in without reviving this pin's boot assertions, and 1/2/6 mean the config claims something bootable that is not; got status=${res.status} stdout=${res.stdout} stderr=${res.stderr}`)
  assert.match(res.stdout, /__SMOKE_INERT__/,
    `the __SMOKE_INERT__ sentinel is the machine verdict callers key off for an inert host; its absence means the config's runtime block no longer declares inert and every review's smoke leg is now booting something in a repo with no bootable product; got stdout=${res.stdout}`)
  assert.match(res.stdout, /parked/,
    `the inert reason must name WHY there is nothing to boot (the parked autopilot daemon) — a reasonless or rewritten inert declaration loses the audit trail that distinguishes an honest inert from the stale-exemption lie the original AC-20260801-04-6 closed`)
})
