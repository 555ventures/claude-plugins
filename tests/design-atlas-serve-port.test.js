'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { spawn } = require('node:child_process')
const { SPEC, tmpdir } = require('./helpers')

// specs/20260909/03-atlas-test-port-and-deadlines.md D1/AC-20260909-03-6: `serve --port 0` must
// print the port `server.address().port` actually bound in its banner — today it prints the
// literal requested `0` in all three places, the one line a caller/harness reads the port back
// from is the line that lies.

test('AC-20260909-03-6: design-atlas.js serve --root <dir> --port 0 prints the OS-bound port (never the literal 0) in all three places of its first stdout line, and GET /atlas/index.html on that port answers 200', async () => {
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
      'D1: the first stdout line must be the banner shape with one integer P substituted in all three places: got ' + JSON.stringify(firstLine))
    const [, p1, p2, p3] = m
    assert.strictEqual(p1, p2, 'D1: all three port occurrences in the banner must be the SAME integer: got ' + JSON.stringify(firstLine))
    assert.strictEqual(p2, p3, 'D1: all three port occurrences in the banner must be the SAME integer: got ' + JSON.stringify(firstLine))
    const port = Number(p1)
    assert.ok(port > 0,
      'D1: --port 0 must print the port design-atlas.js actually bound via server.address().port, never the literal requested 0 — the pre-fix banner prints 0 here: got ' + port)

    const body = await new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port, path: '/atlas/index.html' }, (res) => {
        let b = ''
        res.on('data', (c) => { b += c })
        res.on('end', () => resolve({ status: res.statusCode, body: b }))
      }).on('error', reject)
    })
    assert.strictEqual(body.status, 200,
      'AC-6: GET /atlas/index.html on the port the banner named must answer 200 — a wrong printed port would 404/refuse here: got ' + body.status)
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
