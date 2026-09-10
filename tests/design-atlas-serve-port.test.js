'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { spawn, spawnSync } = require('node:child_process')
const { ROOT, SPEC, tmpdir, serveAtlas } = require('./helpers')

// specs/20260909/06-ephemeral-serve-ports.md D1/D2: AC-20260909-06-1, -2, -3, -4, -8.

function get(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: urlPath }, (res) => {
      res.resume()
      res.on('end', () => resolve(res.statusCode))
    }).on('error', reject)
  })
}

// Carries specs/20260909/03-atlas-test-port-and-deadlines.md AC-20260909-03-6 (banner names
// the bound port in all three places, GET /atlas/index.html answers 200) forward under its own
// AC-20260909-06-1, which adds the >= 1024 bound and the /__notes/notes.js check on top.
test('AC-20260909-06-1 (retag of AC-20260909-03-6): design-atlas.js serve --root <dir> --port 0 prints the OS-bound port (never the literal 0, always >= 1024) in all three places of its first stdout line, and GET /atlas/index.html and GET /__notes/notes.js on that port both answer 200', async () => {
  const dir = tmpdir('atlas-serve-port0')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/a.html'), '<main data-screen-label="a">hello</main>\n')
  const child = spawn(process.execPath, [path.join(SPEC, 'scripts/design-atlas.js'), 'serve', '--root', dir, '--port', '0'])
  try {
    let firstLine = null
    let buf = ''
    let errBuf = ''
    const firstLinePromise = new Promise((resolve) => {
      child.stdout.on('data', (c) => {
        buf += c
        if (firstLine === null && buf.includes('\n')) { firstLine = buf.split('\n')[0]; resolve() }
      })
    })
    child.stderr.on('data', (c) => { errBuf += c })
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('serve --port 0 did not print its first stdout line within 5s: ' + errBuf)), 5000))
    await Promise.race([firstLinePromise, timeout])

    const m = firstLine.match(/^serving http:\/\/localhost:(\d+)\/atlas\/index\.html — remote: ssh -L (\d+):localhost:(\d+) <host>$/)
    assert.ok(m,
      'the first stdout line must be the banner shape with one integer P substituted in all three places: got ' + JSON.stringify(firstLine))
    const [, p1, p2, p3] = m
    assert.strictEqual(p1, p2, 'all three port occurrences in the banner must be the SAME integer: got ' + JSON.stringify(firstLine))
    assert.strictEqual(p2, p3, 'all three port occurrences in the banner must be the SAME integer: got ' + JSON.stringify(firstLine))
    const port = Number(p1)
    assert.ok(port >= 1024,
      '--port 0 must print the port design-atlas.js actually bound via server.address().port, never the literal requested 0 — got ' + port)

    const atlasStatus = await get(port, '/atlas/index.html')
    assert.strictEqual(atlasStatus, 200,
      'GET /atlas/index.html on the port the banner named must answer 200 — a wrong printed port would 404/refuse here: got ' + atlasStatus)
    const notesStatus = await get(port, '/__notes/notes.js')
    assert.strictEqual(notesStatus, 200,
      'AC-1: GET /__notes/notes.js on the port the banner named must also answer 200: got ' + notesStatus)
  } finally {
    child.kill('SIGTERM')
    if (child.exitCode === null && child.signalCode === null) {
      await Promise.race([
        new Promise((r) => child.once('exit', r)),
        new Promise((r) => setTimeout(r, 5000)),
      ])
    }
  }
})

test('AC-20260909-06-2: two design-atlas.js serve --port 0 children on the same root announce two different ports, and both answer /__notes/notes.js with 200', async () => {
  const dir = tmpdir('serve-port-ac2')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  const a = await serveAtlas(dir)
  const b = await serveAtlas(dir)
  try {
    assert.notStrictEqual(a.port, b.port,
      'two concurrent --port 0 children over the same root must never be handed the same port by the kernel — got ' + a.port + ' twice')
    const statusA = await get(a.port, '/__notes/notes.js')
    const statusB = await get(b.port, '/__notes/notes.js')
    assert.strictEqual(statusA, 200, 'the first child\'s announced port must answer /__notes/notes.js with 200: got ' + statusA)
    assert.strictEqual(statusB, 200, 'the second child\'s announced port must answer /__notes/notes.js with 200: got ' + statusB)
  } finally {
    await a.stop()
    await b.stop()
  }
})

test('AC-20260909-06-3: serveAtlas(dir) resolves port equal to the banner\'s port and url equal to http://localhost:<port>, and stop() leaves the child no longer running', async () => {
  const dir = tmpdir('serve-port-ac3')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  const s = await serveAtlas(dir)
  try {
    assert.strictEqual(typeof s.port, 'number', 'serveAtlas must resolve a numeric port, or every caller that builds a URL from it breaks: got ' + JSON.stringify(s.port))
    assert.strictEqual(s.url, 'http://localhost:' + s.port,
      'serveAtlas must resolve url exactly as http://localhost:<port> — a caller building the same string by hand must never diverge: got ' + JSON.stringify(s.url))
    const status = await get(s.port, '/__notes/notes.js')
    assert.strictEqual(status, 200, 'the resolved port must be the one actually bound by the child this call spawned: got status ' + status)
  } finally {
    await s.stop()
    assert.ok(s.child.exitCode !== null || s.child.signalCode !== null,
      'AC-3: await stop() must leave child.exitCode or child.signalCode set — a lingering listener would leak past the test')
  }
})

test('AC-20260909-06-4: serveAtlas(dir, {script: <a stub that prints nothing and stays alive>}) rejects within 6s naming "no banner within 5000 ms", and the stub child is no longer running', async () => {
  const dir = tmpdir('serve-port-ac4-root')
  const stubDir = tmpdir('serve-port-ac4-stub')
  const stubPath = path.join(stubDir, 'silent-serve.js')
  // A stub that never prints a banner but keeps the event loop alive with a 1s interval, so a
  // reject-because-the-child-already-exited false pass cannot happen — the reject must come from
  // serveAtlas's own 5000ms timeout, not from the child dying on its own.
  fs.writeFileSync(stubPath, "#!/usr/bin/env node\n'use strict'\nsetInterval(() => {}, 1000)\n")

  let rejection = null
  try {
    await serveAtlas(dir, { script: stubPath })
    assert.fail('serveAtlas must reject against a script that never prints a banner, not resolve')
  } catch (err) {
    rejection = err
  }
  assert.ok(rejection, 'serveAtlas must reject when the child never prints a banner')
  assert.match(rejection.message, /no banner within 5000 ms/,
    'the rejection message must contain "no banner within 5000 ms" so a caller can tell a hung child from a real crash: got ' + JSON.stringify(rejection.message))

  // The rejection carries the actual child serveAtlas spawned and timed out on (helpers.js
  // attaches it as err.child before rejecting) — asserting on THAT process, not a second stub
  // this test spawns and kills itself, is what proves serveAtlas's own timeout path really
  // kills the child it is responsible for.
  assert.ok(rejection.child, 'AC-4: the rejection must carry the timed-out child as err.child, or this assertion cannot observe the process serveAtlas actually spawned: got ' + JSON.stringify(rejection.child))
  assert.ok(rejection.child.exitCode !== null || rejection.child.signalCode !== null,
    'AC-4: the timed-out serve child must end up with exitCode or signalCode set, never left running')
}, { timeout: 6000 })

test('AC-20260909-06-8: grep -rnE "[0-9]{4,5} *\\+ *\\(?(process\\.pid|Math\\.random)" tests/ finds nothing — no test in this repo computes a port from process.pid or Math.random', () => {
  const pattern = '[0-9]{4,5} *\\+ *\\(?(process\\.pid|Math\\.random)'
  const res = spawnSync('grep', ['-rnE', pattern, path.join(ROOT, 'tests')], { encoding: 'utf8' })
  assert.strictEqual(res.stdout, '',
    'a pid-derived or random port literal survives in tests/ — every such window is a collision window under concurrency (specs/20260909/06 Goal): ' + res.stdout)
  assert.strictEqual(res.status, 1,
    'grep with no match exits 1 — a status of 0 means the pattern matched (stdout above), a status > 1 means grep itself errored: ' + JSON.stringify(res))
})
