'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runBash } = require('./helpers')

// specs/20260821/03-cross-spec-skip-mapping.md D4 (2026-08-21, UpWell defect 2 of 2): smoke.sh
// trusted whatever readyCheck answered on the FIRST poll after boot spawn — an orphaned server
// left over from a crashed prior run (or any other environment whose ready predicate is already
// true) makes readiness look instantaneous, so the script credits THIS run's boot for a readiness
// it never produced, then SIGTERMs its own still-building process. A3 (executed red repro,
// 2026-08-21): config {"bootCommand":"sleep 30","readyCheck":"true"} -> __SMOKE_FAIL__
// shutdown-unclean: exit status 143, exit 6 — confirmed again here against the untouched HEAD
// script (2026-08-22): same config, real elapsed ~1s, exit 6, no stale-ready sentinel.
//
// The fix (D4): probe readyCheck ONCE immediately before bootCommand is ever spawned. If it
// already passes, fail closed as `stale-ready`, a new documented exit code 7, naming the remedy,
// WITHOUT spawning boot at all. This file pins that fix — red-first, since no pre-boot probe
// exists at all in the untouched script.

function writeConfig(dir, runtime) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({ runtime }))
  return dir
}

const smoke = (dir, ...args) => runBash('scripts/smoke.sh', args, { cwd: dir, timeout: 30000 })

test('AC-20260821-03-9: smoke.sh fails closed as stale-ready, exit 7, when readyCheck already passes before bootCommand is ever spawned — completing fast without waiting on the 30s child, and never spawning boot at all', () => {
  const dir = tmpdir('smoke-stale-ready')
  const marker = path.join(dir, 'booted')
  writeConfig(dir, {
    bootCommand: `touch ${marker} && sleep 30`,
    readyCheck: 'true',
  })
  const start = Date.now()
  const res = smoke(dir)
  const elapsedMs = Date.now() - start
  assert.strictEqual(res.status, 7,
    `a readyCheck that already passes before bootCommand is ever spawned must fail closed with the ` +
    `new documented exit code 7 (stale-ready) — a process from a previous run is likely still ` +
    `answering, and crediting THIS run's boot for it is the exact defect A3 reproduced ` +
    `(shutdown-unclean, exit 6, after the script SIGTERMed its own still-building process); got ` +
    `status=${res.status} stdout=${res.stdout} stderr=${res.stderr}`)
  assert.match(res.stdout, /__SMOKE_FAIL__ stale-ready/,
    `the stale-ready sentinel must be printed so callers can distinguish this fail-closed edge from ` +
    `every other __SMOKE_FAIL__ cause (not-ready, boot-crashed, shutdown-hung, shutdown-unclean); ` +
    `got stdout=${res.stdout}`)
  assert.match(res.stdout, /stop|clean/i,
    `the sentinel line must name the remedy (find and stop the orphaned process, or clean the stale ` +
    `ready state) — a bare sentinel with no remedy leaves the operator guessing what to do before ` +
    `re-running; got stdout=${res.stdout}`)
  assert.match(res.stdout, /re-?run/i,
    `the remedy must tell the operator to re-run once the stale state is cleared, or the sentinel ` +
    `reads as a dead end rather than an actionable failure; got stdout=${res.stdout}`)
  assert.ok(elapsedMs < 10000,
    `the run must complete WITHOUT waiting on the 30s child — a leg that still spawns boot and waits ` +
    `out any part of its poll/stop-timeout cycle before failing has not actually skipped the boot ` +
    `spawn, defeating the whole point of a pre-boot probe; elapsed=${elapsedMs}ms stdout=${res.stdout}`)
  assert.ok(!fs.existsSync(marker),
    `bootCommand must NEVER be spawned when the pre-boot probe already finds readyCheck true — the ` +
    `marker file bootCommand would touch on its way to the 30s sleep must not exist; its presence ` +
    `would prove boot was spawned despite the stale-ready refusal, contradicting D4's "without ` +
    `spawning boot" requirement`)
})
