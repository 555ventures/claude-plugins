'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { SPEC, freePort } = require('../helpers')
const { setupHost, writeStatus, pinsPath, DRIVER, BRIEF_REL } = require('./fixture')

// specs/20260928/01-the-prototype-command-and-the-pin-overlay.md D5, AC-20260928-01-7,
// AC-20260928-01-8 — `serve --port N` does not exist yet (spec/scripts/prototype-driver.js is
// missing entirely), so every case below is genuinely RED.
//
// tests/helpers.js's runNode is spawnSync, which blocks this process's event loop for the
// child's whole lifetime — a client request from THIS process could never be serviced while a
// spawnSync child is up. Every test here therefore drives the server through a file-local async
// child_process.spawn runner instead (§ Gotchas: specs/20260825/03-genesis-currency-executed.md).

function startServe(dir, port) {
  return spawn(process.execPath, [path.join(SPEC, DRIVER), BRIEF_REL, '--root', dir, 'serve', '--port', String(port)],
    { stdio: ['ignore', 'pipe', 'pipe'] })
}

function captureOutput(child) {
  const buf = { stdout: '', stderr: '' }
  child.stdout.on('data', (d) => { buf.stdout += d })
  child.stderr.on('data', (d) => { buf.stderr += d })
  return buf
}

// Races the poll against the child's own exit — a missing/crashing script dies in well under a
// second, and without this race every RED run here would pay the full timeout three times over.
async function waitUntilUp(child, port, timeoutMs = 5000) {
  let dead = null
  const onExit = (code, signal) => { dead = { code, signal } }
  child.once('exit', onExit)
  try {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (dead) throw new Error('serve --port ' + port + ' exited before answering (code=' + dead.code + ' signal=' + dead.signal + ')')
      try {
        const res = await fetch('http://127.0.0.1:' + port + '/pins')
        if (res) return
      } catch {
        // connection refused / not listening yet — poll again
      }
      await new Promise((r) => setTimeout(r, 50))
    }
    throw new Error('serve --port ' + port + ' never answered GET /pins within ' + timeoutMs + 'ms')
  } finally {
    child.removeListener('exit', onExit)
  }
}

function waitForExit(child, timeoutMs = 5000) {
  // A child that already exited (the RED case — the missing script crashes in well under a
  // second) fires 'exit' once and never again; a listener attached after the fact would hang
  // for the full timeout, which every finally-block cleanup below would otherwise pay.
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode })
  }
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('process did not exit within ' + timeoutMs + 'ms')), timeoutMs)
    child.once('exit', (code, signal) => { clearTimeout(t); resolve({ code, signal }) })
  })
}

test('AC-20260928-01-7: POST /pins accepts a valid batch, stamps round and at, answers 200 with assigned ids and CORS, continues the id sequence on a second batch, answers OPTIONS 204, and exits 0 on SIGTERM', async () => {
  const dir = setupHost()
  const port = await freePort()
  writeStatus(dir, { rounds: [] })
  const child = startServe(dir, port)
  const out = captureOutput(child)
  try {
    await waitUntilUp(child, port)

    const batch1 = [
      { screen: '/women', state: 'default', anchor: { id: 'A#0', loc: 'x.tsx:1' }, note: 'n', who: 'JJ', kind: 'behaviour' },
      { screen: '/women', state: 'empty', anchor: null, note: 'm', who: 'JJ', kind: 'look' },
    ]
    const res1 = await fetch('http://127.0.0.1:' + port + '/pins', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(batch1),
    })
    assert.strictEqual(res1.status, 200, 'a valid batch must be accepted with 200: ' + out.stderr)
    assert.strictEqual(res1.headers.get('access-control-allow-origin'), '*',
      'every response must carry Access-Control-Allow-Origin: * (D5) — without it the overlay running on the app\'s own origin cannot read the answer')
    const body1 = await res1.json()
    assert.deepStrictEqual(body1, { accepted: ['p1', 'p2'] },
      'the answer must assign sequential ids starting at p1 and echo them back: ' + JSON.stringify(body1))

    const onDisk = JSON.parse(fs.readFileSync(pinsPath(dir), 'utf8'))
    assert.strictEqual(onDisk.pins.length, 2, 'both pins from the batch must be written to pins.json: ' + JSON.stringify(onDisk))
    for (const pin of onDisk.pins) {
      assert.strictEqual(pin.round, 1, 'every written pin must be stamped with round = status.rounds.length + 1 (D5): ' + JSON.stringify(pin))
      assert.match(pin.at, /^\d{4}-\d{2}-\d{2}T/, 'every written pin must be stamped with an ISO "at" timestamp: ' + JSON.stringify(pin))
    }

    const batch2 = [{ screen: '/women', state: 'default', anchor: null, note: 'third', who: 'JJ', kind: 'look' }]
    const res2 = await fetch('http://127.0.0.1:' + port + '/pins', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(batch2),
    })
    const body2 = await res2.json()
    assert.deepStrictEqual(body2, { accepted: ['p3'] },
      'a second batch must continue the id sequence at p3, never restart at p1 (D5): ' + JSON.stringify(body2))

    const optionsRes = await fetch('http://127.0.0.1:' + port + '/pins', { method: 'OPTIONS' })
    assert.strictEqual(optionsRes.status, 204, 'OPTIONS /pins must answer 204 (D5, the CORS preflight): got ' + optionsRes.status)
    assert.strictEqual(optionsRes.headers.get('access-control-allow-origin'), '*',
      'the OPTIONS answer must carry the same CORS header as every other response')
  } finally {
    child.kill('SIGTERM')
  }
  const { code, signal } = await waitForExit(child)
  assert.strictEqual(code, 0,
    'SIGTERM must end the serve process with exit 0 (D5) — a nonzero or signal-only exit means a round the driver was told to stop leaves a stray process: got code=' + code + ' signal=' + signal + ' stderr=' + out.stderr)
})

test('AC-20260928-01-8: a batch with one valid pin and one invalid kind is refused 400 naming kind and writes nothing', async () => {
  const dir = setupHost()
  const port = await freePort()
  writeStatus(dir, { rounds: [] })
  const child = startServe(dir, port)
  const out = captureOutput(child)
  try {
    await waitUntilUp(child, port)
    const batch = [
      { screen: '/women', state: 'default', anchor: null, note: 'ok', who: 'JJ', kind: 'behaviour' },
      { screen: '/women', state: 'default', anchor: null, note: 'bad', who: 'JJ', kind: 'urgent' },
    ]
    const res = await fetch('http://127.0.0.1:' + port + '/pins', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(batch),
    })
    assert.strictEqual(res.status, 400, 'a batch containing an out-of-enum kind must be refused 400, not partially accepted: ' + out.stderr)
    const text = await res.text()
    assert.match(text, /kind/, 'the 400 body must name the offending field "kind": ' + text)
    assert.ok(!fs.existsSync(pinsPath(dir)) || JSON.parse(fs.readFileSync(pinsPath(dir), 'utf8')).pins.length === 0,
      'a refused batch must write nothing — not even the one valid pin in it (D5: "nothing in the batch is written")')
  } finally {
    child.kill('SIGTERM')
    await waitForExit(child).catch(() => {})
  }
})

test('AC-20260928-01-8: a pin whose anchor carries loc without id is refused 400 naming anchor.id', async () => {
  const dir = setupHost()
  const port = await freePort()
  writeStatus(dir, { rounds: [] })
  const child = startServe(dir, port)
  const out = captureOutput(child)
  try {
    await waitUntilUp(child, port)
    const batch = [
      { screen: '/women', state: 'default', anchor: { loc: 'x.tsx:1' }, note: 'bad anchor', who: 'JJ', kind: 'look' },
    ]
    const res = await fetch('http://127.0.0.1:' + port + '/pins', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(batch),
    })
    assert.strictEqual(res.status, 400, 'an anchor with loc but no id must be refused 400: ' + out.stderr)
    const text = await res.text()
    assert.match(text, /anchor\.id/, 'the 400 body must name "anchor.id" specifically, not just "anchor": ' + text)
  } finally {
    child.kill('SIGTERM')
    await waitForExit(child).catch(() => {})
  }
})
