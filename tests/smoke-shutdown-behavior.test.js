'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runBash } = require('./helpers')

// specs/20260815/04-runtime-shutdown-leg.md — the runtime leg sends `runtime.stopSignal`
// (already true, in the EXIT trap) but never observes whether the process actually stopped
// cleanly: the signal is spent and the observation discarded before the leg's verdict is
// fixed — the gate that should have caught a stranded pidfile
// lock (wf_1d6e7652-ec3) that rode two CLEAN reviews. This file pins the new shutdown
// observation (D1/D2): after readiness, smoke.sh sends the stop signal, waits up to
// `runtime.stopTimeout`, and requires an exit status in `runtime.stopExitCodes` (default
// `[0]`) — hung or unclean shutdown both fail the leg with exit 6.
//
// All four tests are red-first: today's smoke.sh has no shutdown block at all — it exits 0
// on readiness alone, regardless of what the booted process does on the stop signal.

function writeConfig(dir, runtime) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({ runtime }))
  return dir
}

const smoke = (dir, ...args) => runBash('scripts/smoke.sh', args, { cwd: dir, timeout: 30000 })

test('AC-20260815-04-1: smoke.sh fails the leg as hung when the booted process ignores the stop signal', () => {
  const dir = tmpdir('smoke-shutdown')
  writeConfig(dir, {
    bootCommand: `touch ${dir}/up && trap '' TERM && while :; do sleep 1; done`,
    readyCheck: `test -f ${dir}/up`,
    readyTimeout: 20,
    stopTimeout: 2,
  })
  const res = smoke(dir)
  assert.strictEqual(res.status, 6,
    `a process that ignores runtime.stopSignal must fail the leg with exit 6 (shutdown-hung) — ` +
    `otherwise a hung, non-stopping process is certified as a passing review boot leg exactly ` +
    `as JJ-20260815-05 recorded; got status=${res.status} stdout=${res.stdout} stderr=${res.stderr}`)
  assert.match(res.stdout, /__SMOKE_FAIL__ shutdown-hung/,
    `the shutdown-hung sentinel must be printed so callers can distinguish "never stops" from ` +
    `other exit-6 causes; got stdout=${res.stdout}`)
})

test('AC-20260815-04-2: smoke.sh fails the leg as unclean when the process dies by the stop signal\'s default action', () => {
  const dir = tmpdir('smoke-shutdown')
  writeConfig(dir, {
    bootCommand: `touch ${dir}/up && exec sleep 60`,
    readyCheck: `test -f ${dir}/up`,
    readyTimeout: 20,
    stopTimeout: 5,
  })
  const res = smoke(dir)
  assert.strictEqual(res.status, 6,
    `a process with no SIGTERM handler dies by default action (status 143) and must fail the ` +
    `leg as unclean — this is the exact escape (a daemon with no shutdown handler) JJ-20260815-05 ` +
    `named runtime-leg as the gate that should have caught; got status=${res.status} stdout=${res.stdout} stderr=${res.stderr}`)
  assert.match(res.stdout, /__SMOKE_FAIL__ shutdown-unclean/,
    `the shutdown-unclean sentinel must be printed to distinguish "exited but with the wrong ` +
    `status" from a hang; got stdout=${res.stdout}`)
  assert.match(res.stdout, /143/,
    `the offending exit status (143 = 128+SIGTERM, the default-action death) must appear so a ` +
    `reader can tell this from any other unclean exit; got stdout=${res.stdout}`)
})

test('AC-20260815-04-3: smoke.sh accepts a declared stopExitCodes value as a clean shutdown', () => {
  const dir = tmpdir('smoke-shutdown')
  writeConfig(dir, {
    bootCommand: `touch ${dir}/up && exec sleep 60`,
    readyCheck: `test -f ${dir}/up`,
    readyTimeout: 20,
    stopTimeout: 5,
    stopExitCodes: [143],
  })
  const res = smoke(dir)
  assert.strictEqual(res.status, 0,
    `a host that declares runtime.stopExitCodes: [143] uses the deliberate re-raise-after-` +
    `cleanup idiom (status-alone can't distinguish it from default-action death) and must pass ` +
    `— rejecting a declared-acceptable status makes the declaration meaningless; got status=${res.status} stdout=${res.stdout} stderr=${res.stderr}`)
  assert.match(res.stdout, /stopped cleanly \(exit 143\)/,
    `the pass line must record the observed exit status against the declared-acceptable set so ` +
    `a reviewer can see what "clean" meant for this host; got stdout=${res.stdout}`)
})

// specs/20260821/03-cross-spec-skip-mapping.md AC-20260821-03-10 (D4's covering
// pin): this fixture's readyCheck (`test -f $dir/up`) is false until bootCommand itself creates
// the marker, so D4's new pre-boot staleness probe never fires here — the pin stays green,
// tagged in place per this spec's Decisions (never duplicated, never weakened).
test('AC-20260815-04-4 (also AC-20260821-03-10, SHALL CONTINUE TO): smoke.sh passes with the shutdown recorded when the process exits 0 on the stop signal', () => {
  const dir = tmpdir('smoke-shutdown')
  writeConfig(dir, {
    bootCommand: `touch ${dir}/up && trap 'exit 0' TERM && while :; do sleep 1; done`,
    readyCheck: `test -f ${dir}/up`,
    readyTimeout: 20,
    stopTimeout: 5,
  })
  const res = smoke(dir)
  assert.strictEqual(res.status, 0,
    `a process with a clean SIGTERM handler exiting 0 must pass the leg; got status=${res.status} stdout=${res.stdout} stderr=${res.stderr}`)
  assert.match(res.stdout, /__SMOKE_PASS__ ready after \d+s, stopped cleanly \(exit 0\)/,
    `the pass line must state BOTH halves of the certification — "ready" (boot) and "stopped ` +
    `cleanly (exit 0)" (shutdown) — a pass line naming only readiness silently drops the ` +
    `shutdown assertion this spec exists to add; got stdout=${res.stdout}`)
})
