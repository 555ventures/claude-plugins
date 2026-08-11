'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { spawn } = require('node:child_process')
const { ROOT, tmpdir } = require('../helpers')

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

test('AC-20260810-05-12: a real (non-check) autopilotd start holds the pidfile lock and releases it on SIGTERM shutdown', async () => {
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
    const acquired = await waitFor(() => fs.existsSync(lockPath))
    assert.ok(acquired,
      `a normal (non---check) start must create ${lockPath} — the Behavior § Lock lifecycle order pins mkdirSync(stateDir) → acquireLock BEFORE lane construction/start; got stderr so far=${stderr}`)

    const lockContent = fs.readFileSync(lockPath, 'utf8').trim()
    assert.strictEqual(lockContent, String(child.pid),
      `the lockfile must hold this daemon process's own pid (${child.pid}) so a status/doctor check or a second starter can identify exactly which process holds the lock; got lockContent=${lockContent}`)

    child.kill('SIGTERM')
    const exited = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), 5000)
      child.on('close', () => { clearTimeout(timer); resolve(true) })
    })
    assert.ok(exited,
      `autopilotd must exit on SIGTERM within 5s of a clean shutdown — a hang here means the lock release logic (or its surrounding shutdown path) is blocking teardown; stderr=${stderr}`)
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
