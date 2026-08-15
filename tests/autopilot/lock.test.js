'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { spawn, execSync } = require('node:child_process')
const { ROOT, tmpdir, extractFn } = require('../helpers')

// spec: specs/20260810/05-service-bootstrap.md — pins AC-20260810-05-11 (daemon/lock.js's
// acquire/release pidfile lock, D5) and AC-20260810-05-12 (autopilotd's lock lifecycle across a
// real start/shutdown, Behavior § Lock lifecycle). daemon/lock.js does not exist yet (CREATE row
// in the File Plan), so the top-level require below throws at module load and every AC-11 test
// in this file fails on current code — the established red-phase pattern (config.test.js,
// enroll.test.js). The AC-12 tests spawn the real bin/autopilotd, which today never requires
// lock.js at all (MODIFY row not yet applied) — they fail because no lockfile is ever created,
// full stop.
//
// D5 pins the exact mechanism: `fs.writeFileSync(path, pid, {flag: 'wx'})` (real O_EXCL) and
// branching on process.kill(pid, 0)'s thrown error CODE (ESRCH=dead, EPERM=foreign-but-live),
// never on any-throw. The AC-11 race case (a second `wx` write hitting EEXIST) is simulated by
// monkey-patching the shared `fs.writeFileSync` — legitimate here because D5 pins that literal
// call shape byte-for-byte, so intercepting it does not couple the test to an unstated
// implementation detail. This file runs in its own subprocess (one process per `node --test`
// file), so the process.env.HOME override and the fs.writeFileSync monkey-patch below cannot
// leak into any other test file.
//
// specs/20260814/04-lock-signal-window.md (escape-driven: the lock-acquire → signal-handler
// window left a stale lockfile on a SIGTERM landing before handlers were installed) adds
// AC-20260814-04-1..3 below, pinning `installEarlyLockRelease` (D1). AC-20260814-04-4 retags
// the existing AC-20260810-05-12 real-start lifecycle test (D4c) as this spec's regression pin.
//
// AC-20260814-04-3 (amended at build, 2026-08-15, D2′) pins TWO orderings in bin/autopilotd, because the
// build's stability duty proved each one is load-bearing and each was originally wrong:
//   (a) installEarlyLockRelease BEFORE acquireLock. "Same tick, immediately after" is not a
//       closed window — the `wx` write and the sigaction install are separate syscalls and the
//       kernel delivers between them (~0.5% under load: lockfile on disk, no handler, default
//       kill, stale lock). Arming first makes lock-implies-handler structural.
//   (b) both full listeners registered BEFORE early.remove(). Removing the last listener for a
//       signal stops libuv's signal handle, discarding a signal already captured but not yet
//       dispatched to JS; the daemon then idles forever in a demonstrably HEALTHY event loop
//       (stack sample: uv_run → kevent) having swallowed its own SIGTERM, holding a lock that
//       stale recovery can never reclaim because the holder is alive. ~0.7% under load with
//       remove() first; 0 in 1500 runs with it last.
// Neither ordering is visible from lock.js, which is why these are source-slice pins on the bin
// — the one file here with no importable seam.
//
// Correction to this file's earlier header claim and to the spec's A2: the AC-12 lifecycle test
// is NOT "green pre-change in isolation". Measured at the pre-spec base it fails ~1-in-40 in
// isolation, carrying the stale-lock signature — i.e. it was already reporting the real defect,
// just too rarely to read as anything but noise. Rates of ~1-in-200 are invisible to a 10-run
// loop; anything asserting stability here needs hundreds of loaded cycles, not ten.

process.env.HOME = tmpdir('lock-home')
process.env.USERPROFILE = process.env.HOME

const LOCK_PATH_MODULE = path.join(ROOT, 'autopilot', 'daemon', 'lock.js')
const { acquireLock, releaseLock, LockError } = require(LOCK_PATH_MODULE)

function esrch() {
  const err = new Error('ESRCH: no such process')
  err.code = 'ESRCH'
  return err
}
function eperm() {
  const err = new Error('EPERM: operation not permitted')
  err.code = 'EPERM'
  return err
}

test('AC-20260810-05-11: acquireLock throws LockError carrying the existing pid when that pid is alive (kill-0 succeeds)', () => {
  const stateDir = tmpdir('lock-alive')
  const lockPath = path.join(stateDir, 'autopilotd.lock')
  fs.writeFileSync(lockPath, '54321', { flag: 'wx' })
  const killImpl = () => {} // kill-0 "succeeds" — a real live same-user process

  assert.throws(() => {
    acquireLock({ stateDir, pid: 99999, killImpl })
  }, (err) => {
    assert.ok(err instanceof LockError,
      `acquireLock must throw the typed LockError (repo convention: EnrollError/DiscoverError/WrapupError all carry a machine-discriminable type) so bin/autopilotd never has to string-match a generic Error`)
    assert.strictEqual(err.pid, 54321,
      `LockError must carry the EXISTING lock-holder's pid (54321, read from the lockfile), not the calling process's own pid — the error message names "that pid" per D5 so an operator knows which process to investigate; got err.pid=${err.pid}`)
    return true
  }, 'a live lock-holder must block a second acquire outright — two daemons driving one repo is exactly the accident this lock exists to prevent')

  assert.strictEqual(fs.readFileSync(lockPath, 'utf8'), '54321',
    'a blocked acquire must never touch the existing lockfile — its content must be untouched after the throw')
})

test('AC-20260810-05-11: acquireLock throws LockError when the existing pid is alive under a foreign user (kill-0 throws EPERM), not just when it throws nothing', () => {
  const stateDir = tmpdir('lock-foreign')
  const lockPath = path.join(stateDir, 'autopilotd.lock')
  fs.writeFileSync(lockPath, '424242', { flag: 'wx' })
  const killImpl = () => { throw eperm() }

  assert.throws(() => {
    acquireLock({ stateDir, pid: 1, killImpl })
  }, (err) => {
    assert.ok(err instanceof LockError,
      'EPERM means a live foreign-user process (D5, A4 refuter-executed) — it must be treated exactly like a same-user alive process, never mistaken for "dead"')
    assert.strictEqual(err.pid, 424242,
      `LockError must name the foreign lock-holder's pid 424242; got err.pid=${err.pid}`)
    return true
  }, 'a foreign-user live holder must block acquisition — treating EPERM as "stale" would let a second daemon start beside a live one it merely lacks permission to signal')
})

test('AC-20260810-05-11: acquireLock recovers a stale lock (kill-0 throws ESRCH) by unlinking and retaking via a fresh wx write', () => {
  const stateDir = tmpdir('lock-stale')
  const lockPath = path.join(stateDir, 'autopilotd.lock')
  fs.writeFileSync(lockPath, '11111', { flag: 'wx' })
  const killImpl = () => { throw esrch() }

  const result = acquireLock({ stateDir, pid: 22222, killImpl })

  assert.deepStrictEqual(result, { acquired: true },
    `a dead pid (ESRCH) must be recovered as stale, not treated as a live conflict — acquireLock must return {acquired: true}; got ${JSON.stringify(result)}`)
  assert.strictEqual(fs.readFileSync(lockPath, 'utf8'), '22222',
    `after recovering a stale lock, the lockfile on disk must hold the NEW caller's pid (22222), proving the unlink-then-fresh-wx-write actually happened rather than leaving the dead pid's stale content behind; got ${fs.readFileSync(lockPath, 'utf8')}`)
})

test('AC-20260810-05-11: acquireLock throws LockError, never overwriting, when the recovery wx write races another starter (EEXIST on the second write)', () => {
  const stateDir = tmpdir('lock-race')
  const lockPath = path.join(stateDir, 'autopilotd.lock')
  fs.writeFileSync(lockPath, '33333', { flag: 'wx' })
  const killImpl = () => { throw esrch() } // the pid we saw is dead — recovery path engages

  // D5 pins the literal recovery call: unlink, THEN a fresh `fs.writeFileSync(path, pid, {flag:
  // 'wx'})`. The first wx write below (the pre-existing lockfile, hit by acquireLock's own
  // initial attempt) throws a REAL EEXIST from the filesystem. This patch intercepts only the
  // SECOND `wx` write to that same path — the recovery retry — and forces it to see EEXIST too,
  // simulating a second starter's write landing in the unlink→retry window. Restored in
  // `finally` so no other test in this process ever observes the patched fs.
  const realWriteFileSync = fs.writeFileSync
  let wxAttempts = 0
  fs.writeFileSync = function (targetPath, data, opts) {
    if (targetPath === lockPath && opts && opts.flag === 'wx') {
      wxAttempts++
      if (wxAttempts === 2) {
        const err = new Error('EEXIST: file already exists')
        err.code = 'EEXIST'
        throw err
      }
    }
    return realWriteFileSync.apply(fs, arguments)
  }

  try {
    assert.throws(() => {
      acquireLock({ stateDir, pid: 44444, killImpl })
    }, (err) => {
      assert.ok(err instanceof LockError,
        'a racing starter winning the recovery retry must still surface as LockError, not an unhandled EEXIST or (worse) a silent success')
      return true
    }, 'acquireLock must never unconditionally rewrite the lock on the recovery path — D5\'s explicit TOCTOU closure requires the SECOND wx write to also respect EEXIST as "someone else won"')
  } finally {
    fs.writeFileSync = realWriteFileSync
  }
})

// ---- AC-20260814-04-1/2: installEarlyLockRelease's DI-executed handler chain ----

// A minimal fake `processImpl`: tracks listeners per signal so a test can capture the handler
// installEarlyLockRelease registers and invoke it directly (D1 — zero-timing, no real signals),
// and tracks removeListener/exit calls so AC-2 can assert deregistration and AC-1 can assert the
// recorded exit code without ever touching the real process.
function fakeProcessImpl() {
  const listeners = { SIGTERM: [], SIGINT: [] }
  const exits = []
  return {
    listeners,
    exits,
    on(signal, fn) {
      listeners[signal].push(fn)
    },
    removeListener(signal, fn) {
      listeners[signal] = listeners[signal].filter((f) => f !== fn)
    },
    exit(code) {
      exits.push(code)
    },
  }
}

test('AC-20260814-04-1: installEarlyLockRelease\'s captured SIGTERM listener releases the real lockfile via releaseLock and records exit(0) on the fake processImpl', () => {
  const stateDir = tmpdir('lock-early-sigterm')
  const lockPath = path.join(stateDir, 'autopilotd.lock')
  fs.writeFileSync(lockPath, '12345', { flag: 'wx' })
  const processImpl = fakeProcessImpl()

  const { installEarlyLockRelease } = require(LOCK_PATH_MODULE)
  installEarlyLockRelease({ stateDir, pid: 12345, processImpl, fsImpl: fs })

  assert.strictEqual(processImpl.listeners.SIGTERM.length, 1,
    'installEarlyLockRelease must register exactly one SIGTERM listener on processImpl — the fix only closes the window if a real SIGTERM lands on a real handler')
  processImpl.listeners.SIGTERM[0]()

  assert.ok(!fs.existsSync(lockPath),
    `the SIGTERM listener must remove the lockfile (via the module's own releaseLock, only-if-own-pid) — a lockfile surviving here means a signal in the construction window still leaves a stale lock behind; lockPath=${lockPath}`)
  assert.deepStrictEqual(processImpl.exits, [0],
    `the SIGTERM listener must call processImpl.exit(0) after releasing the lock — exit 0 is the documented normal-shutdown code, and a service manager relies on it to distinguish this from a crash; got exits=${JSON.stringify(processImpl.exits)}`)
})

test('AC-20260814-04-1: installEarlyLockRelease\'s captured SIGINT listener behaves identically to SIGTERM — releases the lock and records exit(0)', () => {
  const stateDir = tmpdir('lock-early-sigint')
  const lockPath = path.join(stateDir, 'autopilotd.lock')
  fs.writeFileSync(lockPath, '67890', { flag: 'wx' })
  const processImpl = fakeProcessImpl()

  const { installEarlyLockRelease } = require(LOCK_PATH_MODULE)
  installEarlyLockRelease({ stateDir, pid: 67890, processImpl, fsImpl: fs })

  assert.strictEqual(processImpl.listeners.SIGINT.length, 1,
    'installEarlyLockRelease must register exactly one SIGINT listener on processImpl — Ctrl-C during construction is the same falsified-contract window as SIGTERM')
  processImpl.listeners.SIGINT[0]()

  assert.ok(!fs.existsSync(lockPath),
    `the SIGINT listener must remove the lockfile identically to SIGTERM — a divergent SIGINT path would leave the lock stale on Ctrl-C even after the SIGTERM fix; lockPath=${lockPath}`)
  assert.deepStrictEqual(processImpl.exits, [0],
    `the SIGINT listener must call processImpl.exit(0); got exits=${JSON.stringify(processImpl.exits)}`)
})

test('AC-20260814-04-2: calling remove() on installEarlyLockRelease\'s returned handle deregisters both the SIGTERM and SIGINT listeners from processImpl', () => {
  const stateDir = tmpdir('lock-early-remove')
  const lockPath = path.join(stateDir, 'autopilotd.lock')
  fs.writeFileSync(lockPath, '55555', { flag: 'wx' })
  const processImpl = fakeProcessImpl()

  const { installEarlyLockRelease } = require(LOCK_PATH_MODULE)
  const handle = installEarlyLockRelease({ stateDir, pid: 55555, processImpl, fsImpl: fs })
  handle.remove()

  assert.strictEqual(processImpl.listeners.SIGTERM.length, 0,
    'remove() must deregister the SIGTERM listener via processImpl.removeListener — a listener left registered after the full shutdown handlers take over would double-release (or race) on a later real signal')
  assert.strictEqual(processImpl.listeners.SIGINT.length, 0,
    'remove() must deregister the SIGINT listener via processImpl.removeListener — the same double-handler risk applies to Ctrl-C')
})

// ---- AC-20260814-04-3: bin/autopilotd's source-ordering pin (call-site slice, no importable seam) ----

test('AC-20260814-04-3: bin/autopilotd arms installEarlyLockRelease BEFORE acquireLock({, with no await token in the slice between them', () => {
  const binSrc = fs.readFileSync(path.join(ROOT, 'autopilot', 'bin', 'autopilotd'), 'utf8')
  const mainIdx = binSrc.indexOf('async function main()')
  assert.notStrictEqual(mainIdx, -1, 'bin/autopilotd must still define async function main()')

  const earlyIdx = binSrc.indexOf('installEarlyLockRelease(', mainIdx)
  assert.notStrictEqual(earlyIdx, -1,
    'main() must still call installEarlyLockRelease( — this pin anchors on that literal call expression, never the require line')
  const acquireIdx = binSrc.indexOf('acquireLock({', mainIdx)
  assert.notStrictEqual(acquireIdx, -1,
    'main() must still call acquireLock({ — the pin slices between these two literal call sites and tolerates the surrounding try/catch')

  assert.ok(earlyIdx < acquireIdx,
    `installEarlyLockRelease( must be armed BEFORE acquireLock({ (D2′), never after it: the lockfile write and the sigaction install are two separate syscalls, so "same tick, immediately after" still lets the kernel deliver SIGTERM in between — measured at ~0.5% under load, leaving exactly the stale lockfile this spec exists to prevent. Arming first makes "lockfile on disk implies handler armed" true by construction. Got installEarlyLockRelease at index ${earlyIdx}, acquireLock({ at index ${acquireIdx}`)

  const slice = binSrc.slice(earlyIdx, acquireIdx)
  assert.ok(!/\bawait\b/.test(slice),
    `no await token may appear between installEarlyLockRelease( and acquireLock({ — an await there would let unrelated work (and further signals) interleave between arming the handler and taking the lock, reopening the window from the other side; slice=${JSON.stringify(slice)}`)
})

test('AC-20260814-04-3: installSignalHandlers is called before adapter.start() in bin/autopilotd\'s main(), and its function body calls early.remove()', () => {
  const binSrc = fs.readFileSync(path.join(ROOT, 'autopilot', 'bin', 'autopilotd'), 'utf8')
  const mainIdx = binSrc.indexOf('async function main()')
  assert.notStrictEqual(mainIdx, -1, 'bin/autopilotd must still define async function main()')

  const callSiteIdx = binSrc.indexOf('installSignalHandlers(', mainIdx)
  const adapterStartIdx = binSrc.indexOf('adapter.start()', mainIdx)
  assert.notStrictEqual(callSiteIdx, -1, 'main() must still call installSignalHandlers(')
  assert.notStrictEqual(adapterStartIdx, -1, 'main() must still call adapter.start()')
  assert.ok(callSiteIdx < adapterStartIdx,
    `installSignalHandlers( must be called BEFORE adapter.start() (D2 amended: the full-handler install moves pre-start so the provisional early handler never covers live lanes) — got installSignalHandlers at index ${callSiteIdx}, adapter.start() at index ${adapterStartIdx}`)

  const handlerBody = extractFn(binSrc, 'installSignalHandlers')
  assert.ok(handlerBody.includes('early.remove()'),
    `installSignalHandlers's body must call early.remove() to deregister the provisional early handler once the full graceful-shutdown path is installed (D2) — a missing call here would leave both the early and full handlers registered on the same signal; handlerBody=${JSON.stringify(handlerBody)}`)

  const removeIdx = handlerBody.indexOf('early.remove()')
  const sigtermIdx = handlerBody.indexOf("process.on('SIGTERM'")
  const sigintIdx = handlerBody.indexOf("process.on('SIGINT'")
  assert.notStrictEqual(sigtermIdx, -1, "installSignalHandlers's body must still register a SIGTERM listener via process.on('SIGTERM'")
  assert.notStrictEqual(sigintIdx, -1, "installSignalHandlers's body must still register a SIGINT listener via process.on('SIGINT'")
  assert.ok(removeIdx > sigtermIdx && removeIdx > sigintIdx,
    `early.remove() must run AFTER both full listeners are registered (D2′), never before: dropping the last listener for a signal stops libuv's signal handle, and a signal already captured but not yet dispatched to JS is discarded with it — the daemon then idles forever in a healthy event loop having silently swallowed its own SIGTERM, still holding the lock (measured ~0.7% under load with remove() first; 0 in 1500 runs with it last). Got early.remove() at ${removeIdx}, SIGTERM registration at ${sigtermIdx}, SIGINT registration at ${sigintIdx}`)
})

// ---- AC-20260810-05-12: autopilotd's real lock lifecycle across a normal start/shutdown ----

async function waitFor(predicate, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  return predicate()
}

function groundRepo(reposRoot, name) {
  const root = path.join(reposRoot, name)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude', 'spec.config.json'), '{}')
  return root
}

function writeHubConfig(dir, overrides = {}) {
  const p = path.join(dir, 'hub.json')
  const cfg = {
    hubUrl: 'http://127.0.0.1:1',
    token: 'lock-fixture-token-not-a-real-credential',
    spokeId: 'spoke_lock_test',
    machineName: 'lock-test',
    projects: [],
    contractVersion: 1,
    enrolledAt: '2026-08-10T00:00:00.000Z',
    ...overrides,
  }
  fs.writeFileSync(p, JSON.stringify(cfg))
  return p
}

// A stub hub that answers every route benignly: 201 with a projectId for registration (so boot
// proceeds past the D7 registration gate) and 200 with an empty poll body for anything else (so
// the hub adapter's long-poll loop never crashes the process waiting on real events).
function startStub() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => {
        res.writeHead(req.url.startsWith('/api/spokes/projects') ? 201 : 200, { 'content-type': 'application/json' })
        if (req.url.startsWith('/api/spokes/projects')) {
          res.end(JSON.stringify({ projectId: 'proj_lock_test', created: true }))
        } else if (req.url.startsWith('/api/spokes/poll')) {
          res.end(JSON.stringify({ events: [], cursor: '0' }))
        } else {
          res.end(JSON.stringify({}))
        }
      })
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

const AUTOPILOTD = path.join(ROOT, 'autopilot', 'bin', 'autopilotd')

test('AC-20260810-05-12 / AC-20260814-04-4: a real (non-check) autopilotd start holds the pidfile lock and releases it on SIGTERM shutdown', async () => {
  const { server, port } = await startStub()
  let child
  try {
    const reposRoot = tmpdir('lock-lifecycle-repos')
    groundRepo(reposRoot, 'alpha')
    const hubDir = tmpdir('lock-lifecycle-hub')
    const hubConfigPath = writeHubConfig(hubDir, { reposRoot, hubUrl: `http://127.0.0.1:${port}` })
    const stateDir = tmpdir('lock-lifecycle-state')
    const home = tmpdir('lock-lifecycle-daemon-home')

    child = spawn(process.execPath, [AUTOPILOTD, '--hub-config', hubConfigPath, '--state-dir', stateDir], {
      env: { ...process.env, HOME: home, USERPROFILE: home },
    })
    let stderr = ''
    child.stderr.on('data', (d) => { stderr += d })

    const lockPath = path.join(stateDir, 'autopilotd.lock')
    // Wait for CONTENT, not mere existence: D5 pins `writeFileSync(path, pid, {flag:'wx'})`, which
    // is an O_CREAT|O_EXCL open followed by a separate write — so a bare existsSync() poll can win
    // the race against the daemon between those two syscalls and read an empty file. That window is
    // microseconds when idle but widens to milliseconds when the child is descheduled under a
    // loaded full-suite run, which is exactly when this test was observed flaking (2026-08-13).
    const acquired = await waitFor(() =>
      fs.existsSync(lockPath) && fs.readFileSync(lockPath, 'utf8').trim() !== '')
    assert.ok(acquired,
      `a normal (non---check) start must create ${lockPath} and write its pid — the Behavior § Lock lifecycle order pins mkdirSync(stateDir) → acquireLock BEFORE lane construction/start; got stderr so far=${stderr}`)

    const lockContent = fs.readFileSync(lockPath, 'utf8').trim()
    assert.strictEqual(lockContent, String(child.pid),
      `the lockfile must hold this daemon process's own pid (${child.pid}) so a status/doctor check or a second starter can identify exactly which process holds the lock; got lockContent=${lockContent}`)

    child.kill('SIGTERM')
    // Observe 'exit' (process termination), never 'close' (termination AND all stdio closed): a
    // grandchild inheriting stderr would delay 'close' indefinitely on a daemon that in fact shut
    // down correctly, turning a healthy run into an indistinguishable timeout. 'exit' fires on
    // termination regardless of stream state, so this asserts the thing the contract is about.
    const exited = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), 5000)
      child.on('exit', () => { clearTimeout(timer); resolve(true) })
    })
    // A bare `exited=false` is not diagnosable after the fact — the 2026-08-15 investigation of
    // this exact timeout burned ~1500 runs distinguishing "child alive and blocked" from "child
    // already dead, exit unobserved", because the failure message carried neither. Capture that
    // distinction here so the next occurrence self-diagnoses: STAT Z = dead-but-unreaped, S/R =
    // genuinely alive (the daemon swallowed its signal), no row at all = gone.
    let postMortem = ''
    if (!exited) {
      let live
      try { process.kill(child.pid, 0); live = true } catch (err) { live = err.code === 'EPERM' }
      let stat = ''
      try { stat = execSync(`ps -o stat=,command= -p ${child.pid}`, { encoding: 'utf8' }).trim() } catch { stat = '(no ps row — process gone)' }
      postMortem = ` | pid=${child.pid} liveProbe=${live} ps=${JSON.stringify(stat)} lockPresent=${fs.existsSync(lockPath)}`
    }
    assert.ok(exited,
      `autopilotd must exit on SIGTERM within 5s of a clean shutdown — a hang here means either the shutdown path is blocking teardown, or (2026-08-15, specs/20260814/04 D2′) a signal-listener gap let the daemon swallow the signal entirely and idle on forever holding the lock; stderr=${stderr}${postMortem}`)
    assert.ok(!fs.existsSync(lockPath),
      `the lockfile must be removed on clean SIGTERM shutdown — a lockfile left behind after a graceful stop would wrongly block the daemon's own next restart (Restart=always) until it happens to win an ESRCH-recovery race; stderr=${stderr}`)
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await new Promise((resolve) => server.close(resolve))
  }
})

test('AC-20260810-05-12: autopilotd --check runs preflight without ever creating the lockfile, so it can run beside a live daemon', async () => {
  const reposRoot = tmpdir('lock-check-repos')
  groundRepo(reposRoot, 'alpha')
  const hubDir = tmpdir('lock-check-hub')
  const hubConfigPath = writeHubConfig(hubDir, { reposRoot })
  const stateDir = tmpdir('lock-check-state')
  const home = tmpdir('lock-check-daemon-home')

  const child = spawn(process.execPath, [AUTOPILOTD, '--check', '--hub-config', hubConfigPath, '--state-dir', stateDir], {
    env: { ...process.env, HOME: home, USERPROFILE: home },
  })
  let stderr = ''
  child.stderr.on('data', (d) => { stderr += d })
  const status = await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill('SIGTERM'); resolve(null) }, 5000)
    child.on('close', (code) => { clearTimeout(timer); resolve(code) })
  })

  assert.strictEqual(status, 0,
    `--check must still pass preflight for a valid hub.json (unrelated to the lock work landing in this batch); got status=${status} stderr=${stderr}`)
  const lockPath = path.join(stateDir, 'autopilotd.lock')
  assert.ok(!fs.existsSync(lockPath),
    `--check must NEVER create or touch the lockfile (Behavior § Lock lifecycle: "--check never touches the lock — preflight must be able to run beside a live daemon") — a lockfile appearing here would mean a --check run could spuriously block (or steal) a real running daemon's lock; stderr=${stderr}`)
})
