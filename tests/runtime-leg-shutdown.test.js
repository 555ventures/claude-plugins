'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// JJ-20260815-05 — the runtime leg proves a program can START and never that it can STOP.
//
// Both escape rows in this repo's ledger carry `preventedBy: "runtime-leg"`:
//   * wf_1d6e7652-ec3 (2026-08-15, spec specs/20260810/05-service-bootstrap.md,
//     file autopilot/bin/autopilotd, foundBy user, hard) — the daemon's documented
//     "lock released on clean shutdown" contract was false: a SIGTERM landing in the window
//     between the lockfile write and the signal-handler install killed the process by default
//     action and stranded the lock. Two reviews passed CLEAN over it.
//   * wf_e1da0ea6-94c (2026-08-14) — separate cause, tracked as JJ-20260815-03.
//
// The reporter's judgment in both cases is that the runtime leg is the gate that should have
// caught it, and for the first one that judgment is exactly right in a way that is cheap to
// act on: smoke.sh ALREADY sends the host's declared `runtime.stopSignal` to the booted
// process — but only inside its EXIT trap, as teardown. It never waits for the process to
// exit, never checks the exit status, and never re-runs the host's own readiness/state
// assertions afterwards. The signal is spent and the observation is thrown away.
//
// So the substrate is present and the assertion is missing. The pipeline's founding runtime
// argument (shared.md § Runtime Verification — "static legs can all pass at 100% on a program
// that cannot start") has an unclaimed second half: static legs also all pass on a program
// that cannot cleanly stop, and for anything long-running — a daemon, a server, a worker —
// shutdown is where the state-corrupting defects live. A stranded lock is not a cosmetic
// failure: it blocks the service's own next restart.
//
// Cheapest shape: after readiness is observed, send `stopSignal`, wait a bounded interval,
// and require the process to have exited — then let the host's declared readiness/state
// checks run once more to assert cleanup. A host with nothing to boot is already covered by
// the `{"inert": ...}` declaration and stays exempt.
//
// Doctrine + script pin (modes 2 and 3, no synthetic host needed — the absence is textual).

const smoke = read('spec/scripts/smoke.sh')
const shared = read('spec/doctrine/shared.md')

test('JJ-20260815-05: smoke.sh asserts the booted process actually exits on the declared stop signal', () => {
  // The signal is already sent in cleanup(); the question is whether anything OBSERVES it.
  const trapIdx = smoke.indexOf('trap cleanup EXIT')
  assert.notStrictEqual(trapIdx, -1, 'smoke.sh must still install its cleanup trap')

  // An assertion about shutdown has to live outside the EXIT trap — inside it, the script's
  // status is already decided and nothing it observes can change the leg's verdict.
  const afterTrap = smoke.slice(trapIdx)
  assert.ok(/stop|shutdown|exit(ed|s)? clean/i.test(afterTrap) &&
    /__SMOKE_(FAIL|PASS)__/.test(afterTrap.split('\n').filter(l => /stop|shutdown/i.test(l)).join('\n')),
    'smoke.sh sends the host\'s declared runtime.stopSignal only from its EXIT trap, where the ' +
    'leg\'s verdict is already fixed — it never waits for the process to exit, never checks the ' +
    'status, and never re-asserts the host\'s readiness/state checks afterwards. The runtime leg ' +
    'therefore certifies "this program starts" and is silent on "this program stops cleanly", ' +
    'which is where a long-running service\'s state-corrupting defects live. Both escape rows in ' +
    'this repo name runtime-leg as the gate that should have caught them; the first (wf_1d6e7652-ec3) ' +
    'was a stranded pidfile lock on SIGTERM that rode two CLEAN reviews and blocked the daemon\'s ' +
    'own restart. The signal is already being sent — only the observation is missing.')
})

test('JJ-20260815-05: § Runtime Verification claims clean shutdown, not just an observed boot', () => {
  const at = shared.indexOf('## Runtime Verification')
  assert.notStrictEqual(at, -1, 'shared.md must still carry § Runtime Verification')
  const section = shared.slice(at, shared.indexOf('\n## ', at + 4))
  assert.ok(/shut ?down|stop signal|stopSignal|clean(ly)? (stop|exit)/i.test(section),
    'the section argues only that a program must be observed to START. The same argument ' +
    'applies unchanged to stopping — a mocked-boundary unit test cannot see a shutdown path ' +
    'any better than it can see a boot path — and this repo has paid for the omission with a ' +
    'hard escape. State the shutdown half so the leg\'s contract and its implementation can be ' +
    'held to the same standard.')
})
