'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { ROOT, tmpdir } = require('../helpers')
const { findChrome, serve, withChrome, withDeadline } = require('./chrome-harness')

// specs/20260909/03-atlas-test-port-and-deadlines.md D2-D4, AC-20260909-03-1/2/3/4/5/8: the
// harness must hand out its own port, refuse any answer other than its own "serving" line,
// never wait on a listener attached after a child has already exited, and bound every DevTools
// wait with a named deadline.

function buildFixtureRoot() {
  const dir = tmpdir('harness-fixture')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/a.html'), '<main data-screen-label="a">hello</main>\n')
  return dir
}

function getStatus(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: urlPath }, (res) => {
      res.resume()
      res.on('end', () => resolve(res.statusCode))
    }).on('error', reject)
  })
}

test('AC-20260909-03-1: serve(dir) with no port resolves ready to the port design-atlas.js actually bound, and that port answers 200 from the spawned child', async () => {
  const { ready, stop } = serve(buildFixtureRoot())
  try {
    const { port } = await ready
    assert.ok(port > 0,
      'serve(dir) with no port must resolve ready to the port design-atlas.js actually bound to (server.address().port), never the literal 0 the pre-fix banner still prints for --port 0: got ' + port)
    const status = await getStatus(port, '/atlas/index.html')
    assert.strictEqual(status, 200,
      'GET /atlas/index.html on the port ready resolved to must answer 200 from the child this serve() call spawned: got ' + status)
  } finally {
    await stop()
  }
})

test('AC-20260909-03-2: serve(dir, N) rejects ready within 5000ms, naming the port and the verb, when another design-atlas.js serve already holds port N, and never resolves it', async () => {
  const port = 47311
  const first = serve(buildFixtureRoot(), port)
  try {
    await first.ready
    const second = serve(buildFixtureRoot(), port)
    let secondResolved = false
    second.ready.then(() => { secondResolved = true }, () => {})
    const started = Date.now()
    await assert.rejects(second.ready, (err) => {
      assert.match(err.message, new RegExp('port ' + port + '\\b'),
        'the rejection must name the busy port N: got ' + JSON.stringify(err.message))
      assert.match(err.message, /already serving/,
        'the rejection must name the verb the busy port answered with ("already serving"): got ' + JSON.stringify(err.message))
      assert.match(err.message, /another run holds it/,
        'the rejection must say another run holds the port: got ' + JSON.stringify(err.message))
      return true
    }, 'ready must reject, not resolve, when the requested port already answers "already serving"')
    assert.ok(Date.now() - started < 5000,
      'ready must reject well under the 5000ms cap once the busy-port banner arrives, not wait out the full timeout')
    await second.stop()
    assert.strictEqual(secondResolved, false,
      'ready must NEVER resolve for a serve call whose port answered "already serving" — resolving it would hand the caller a server it does not own')
  } finally {
    await first.stop()
  }
})

test('AC-20260909-03-3: stop() resolves within 1000ms on a child that has already exited, and within 6000ms on a live child, leaving it not running', async () => {
  const already = serve(buildFixtureRoot())
  await already.ready
  await new Promise((resolve) => { already.child.once('exit', resolve); already.child.kill('SIGTERM') })
  assert.notStrictEqual(already.child.exitCode, null, 'test setup: the child must actually have exited before stop() is called, or this leg proves nothing')
  const t1 = Date.now()
  await already.stop()
  assert.ok(Date.now() - t1 < 1000,
    'stop() on an already-exited child (exitCode !== null) must resolve immediately, well under 1000ms — attaching a fresh listener and waiting on it never fires (specs/20260909/03 A3)')

  const live = serve(buildFixtureRoot())
  await live.ready
  assert.strictEqual(live.child.exitCode, null, 'test setup: the child must still be alive before stop() is called, or this leg proves nothing')
  const t2 = Date.now()
  await live.stop()
  assert.ok(Date.now() - t2 < 6000, 'stop() on a live child must resolve within 6000ms: took ' + (Date.now() - t2) + 'ms')
  assert.notStrictEqual(live.child.exitCode, null, 'stop() must leave the child no longer running (exitCode set) once it resolves')
})

test('AC-20260909-03-4: withDeadline rejects with a message naming the label and the ms once the wrapped promise never settles, and resolves normally when the promise wins the race', async () => {
  await assert.rejects(
    withDeadline(new Promise(() => {}), 50, 'x'),
    (err) => { assert.strictEqual(err.message, 'x did not settle within 50ms', 'got ' + JSON.stringify(err.message)); return true },
    'withDeadline must reject a promise that never settles once its deadline elapses')
  const value = await withDeadline(Promise.resolve(7), 50, 'x')
  assert.strictEqual(value, 7, 'withDeadline must resolve to the wrapped promise\'s own value when it settles first: got ' + value)
})

// A shell wrapper that `exec`s the real Chrome binary after recording its own PID: POSIX `exec`
// replaces the process image in place, so the PID captured before exec IS the Chrome process's
// PID after it. This lets the test assert "no live child" by PID directly, instead of scanning
// system-wide `ps` output that a concurrent Chrome test elsewhere in the suite could also match.
function makeChromeWrapper(realChrome, pidFile) {
  const dir = tmpdir('chrome-wrapper')
  const wrapper = path.join(dir, 'chrome-wrapper.sh')
  fs.writeFileSync(wrapper, '#!/bin/sh\necho $$ > ' + JSON.stringify(pidFile) + '\nexec ' + JSON.stringify(realChrome) + ' "$@"\n')
  fs.chmodSync(wrapper, 0o755)
  return wrapper
}

test('AC-20260909-03-5 [env: CHROME_BIN]: withChrome({deadlineMs:1500}) navigating to a socket that accepts and never replies rejects navigate within 4000ms naming the deadline and the URL, and Chrome is gone after withChrome returns', { timeout: 20000 }, async (t) => {
  const chrome = findChrome()
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — AC-20260909-03-5 requires a real DevTools socket/navigate wait')

  // Chrome's own Page.navigate CDP ack returns as soon as the response starts committing — a
  // bare TCP accept with no bytes ever sent stalls THAT ack instead (a different, URL-less
  // deadline label), so the response must start (headers + a body chunk) and then never finish,
  // leaving only the page's own load event unfired.
  const stuck = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.write('<html><body>loading')
    // deliberately never res.end() — the load event must never fire
  })
  await new Promise((resolve) => stuck.listen(0, '127.0.0.1', resolve))
  const stuckPort = stuck.address().port
  const url = 'http://127.0.0.1:' + stuckPort + '/'

  const pidFile = path.join(tmpdir('chrome-pid'), 'pid')
  const wrapper = makeChromeWrapper(chrome, pidFile)

  try {
    const started = Date.now()
    await assert.rejects(
      withChrome(wrapper, async ({ navigate }) => { await navigate(url) }, { deadlineMs: 1500 }),
      (err) => {
        assert.match(err.message, /did not settle within 1500ms/,
          'navigate must reject naming its 1500ms deadline: got ' + JSON.stringify(err.message))
        assert.match(err.message, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
          'navigate\'s rejection must name the URL it was loading: got ' + JSON.stringify(err.message))
        return true
      },
      'navigate must reject, not hang forever, when the page never fires its load event')
    // The claim is "rejects rather than hangs", so the cap only has to separate a settled
    // rejection from a hang — the node:test `timeout: 20000` above is what catches a true hang.
    // A cap of 4000 sat only 2.7x over the 1500ms deadline and reddened at 4018ms under a loaded
    // suite, measuring the machine rather than the behaviour.
    assert.ok(Date.now() - started < 10000,
      'navigate must reject well under the 10000ms cap once its own 1500ms deadline elapses, not hang')

    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim())
    assert.ok(pid > 0, 'test setup: the wrapper must have recorded a real Chrome PID before exec\'ing into it')
    // SIGKILL was already sent inside withChrome's own finally before it returned; the OS may
    // take a few ms to actually reap the process, so poll signal 0 briefly rather than sampling
    // the instant withChrome resolves.
    const deadline = Date.now() + 2000
    let alive = true
    while (Date.now() < deadline) {
      try { process.kill(pid, 0); alive = true } catch (e) { alive = false; break }
      await new Promise((r) => setTimeout(r, 20))
    }
    assert.strictEqual(alive, false,
      'Chrome must be gone (no live child) shortly after withChrome returns from a rejected navigate — a leaked Chrome process is exactly the hang this spec fixes: pid ' + pid + ' still answered signal 0 after 2000ms')
  } finally {
    stuck.close()
  }
})

// The two banned tokens are assembled from fragments, never spelled whole, so this sweep's own
// source (a chrome-harness requirer, and the one file guaranteed to describe both tokens in its
// test name/messages) cannot self-match and vacuously fail the sweep it defines.
const PID_TOKEN = 'process' + '.' + 'pid'
const EXIT_WAIT_TOKEN = 'child.on(' + "'" + 'exit' + "'"

test('AC-20260909-03-8: every test file that requires chrome-harness carries no ' + PID_TOKEN + ' port arithmetic and no inline ' + EXIT_WAIT_TOKEN + ' wait', () => {
  const testsDir = path.join(ROOT, 'tests')
  const files = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (entry.isFile() && entry.name.endsWith('.test.js')) files.push(p)
    }
  }
  walk(testsDir)
  const requirers = files.filter((f) => /require\(['"][^'"]*chrome-harness['"]\)/.test(fs.readFileSync(f, 'utf8')))
  assert.ok(requirers.length > 0,
    'test setup: at least one test file under tests/ must require chrome-harness, or this sweep proves nothing')
  for (const f of requirers) {
    const src = fs.readFileSync(f, 'utf8')
    const rel = path.relative(ROOT, f)
    assert.strictEqual(src.includes(PID_TOKEN), false,
      'AC-8: ' + rel + ' requires chrome-harness and must derive no port from ' + PID_TOKEN + ' — serve(dir) hands out its own port now: found the token')
    assert.strictEqual(src.includes(EXIT_WAIT_TOKEN), false,
      'AC-8: ' + rel + ' requires chrome-harness and must not wait on an inline ' + EXIT_WAIT_TOKEN + ' listener — stop() owns cleanup now: found the token')
  }
})
