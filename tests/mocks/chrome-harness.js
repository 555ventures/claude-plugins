'use strict'
// Shared headless-Chrome harness for this suite's `[env: CHROME_BIN]`-gated tests
// (tests/mocks/notes-layer-isolation.test.js, tests/design-atlas-index.test.js,
// tests/mocks/notes-layer-navigation.test.js): one findChrome()/serve()/withChrome() so the
// three near-identical blocks the host rules flag as a duplication finding live in one place.
// Each caller keeps its own PROBE/eval expressions and interaction sequences — this module only
// owns process/socket plumbing.
// Owner: specs/20260909/03-atlas-test-port-and-deadlines.md D2-D4 — `serve` hands out its own
// port (never a caller-derived one, which two concurrent runs could collide on) and `stop`/
// `withDeadline`/`withChrome` bound every wait so a dead child or socket cannot hang a run
// forever.
const fs = require('node:fs')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { SPEC, tmpdir } = require('../helpers')

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean)
  for (const c of candidates) if (fs.existsSync(c)) return c
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const r = spawnSync('which', [name], { encoding: 'utf8' })
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim()
  }
  return null
}

// withDeadline(promise, ms, label): resolves/rejects with `promise`, or rejects first with a
// named-deadline Error once `ms` elapses (D4).
function withDeadline(promise, ms, label) {
  let timer
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(label + ' did not settle within ' + ms + 'ms')), ms)
  })
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer))
}

// serve(dir, port = 0) → { child, ready, stop } (D2/D3). `ready` resolves to `{ port }` parsed
// from the child's first stdout line when it starts with 'serving http://localhost:'; any other
// verb on that line (an atlas already holds the requested port) or an early exit rejects with a
// message naming the cause, never a silent hang.
function serve(dir, port = 0) {
  const child = spawn(process.execPath,
    [path.join(SPEC, 'scripts/design-atlas.js'), 'serve', '--root', dir, '--port', String(port)])
  let out = ''
  let err = ''
  child.stdout.on('data', (c) => { out += c })
  child.stderr.on('data', (c) => { err += c })
  const ready = new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn) => { if (settled) return; settled = true; child.stdout.removeListener('data', onData); clearTimeout(readyTimer); fn() }
    const onData = () => {
      const nl = out.indexOf('\n')
      if (nl === -1) return
      const line = out.slice(0, nl)
      const m = line.match(/^(.*?) http:\/\/localhost:(\d+)\//)
      if (m && m[1] === 'serving') {
        finish(() => resolve({ port: Number(m[2]) }))
      } else {
        const verb = m ? m[1] : line
        const badPort = m ? m[2] : port
        finish(() => reject(new Error('serve on port ' + badPort + ' answered "' + verb +
          '" — another run holds it; pass no port so the server chooses')))
      }
    }
    child.stdout.on('data', onData)
    child.once('exit', (code) => {
      finish(() => reject(new Error('serve exited (code ' + code + ') before announcing a port: ' + err)))
    })
    const readyTimer = setTimeout(() => {
      finish(() => reject(new Error('serve did not start: ' + out + err)))
    }, 5000)
  })
  const stop = () => new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return }
    // Exit listener attached BEFORE the signal: attaching it after would race a child that has
    // already died by the time this runs, and that listener never fires (specs/20260909/03 A3).
    const killer = setTimeout(() => { try { child.kill('SIGKILL') } catch (e) { /* already gone */ } }, 5000)
    child.once('exit', () => { clearTimeout(killer); resolve() })
    child.kill('SIGTERM')
  })
  return { child, ready, stop }
}

// launchChrome(chrome, opts) → { send, rawSend, listeners, deadlineMs, close } — spawns headless
// Chrome ONCE and opens its DevTools socket, with no page/target yet. `openPage` (below) opens one
// target/session against an already-launched instance; `withChrome` composes launchChrome +
// openPage + one call for a single-page caller, unchanged in behavior from before this split.
// specs/20260913/02-the-layer-owns-one-mode-and-the-page-owns-the-card.md D13 amendment (review
// finding, 2026-09-13): a file with N `[env: CHROME_BIN]` tests calling `withChrome` N times
// spawns N chrome PROCESSES — `node --test`'s default concurrency multiplies that into a thrash
// that starves unrelated wall-clock-bounded tests. `launchChrome`/`openPage` let a file spawn one
// process (in a `before` hook) and open one target per test (cheap — a new tab in the same
// process), closed per test, with the process itself closed once in `after`.
async function launchChrome(chrome, opts = {}) {
  const deadlineMs = opts.deadlineMs || 15000
  const child = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + tmpdir('chrome-profile'), '--remote-debugging-port=0', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  const wsUrl = await new Promise((resolve, reject) => {
    let errOut = ''
    child.stderr.on('data', (c) => {
      errOut += c
      const m = errOut.match(/DevTools listening on (ws:\/\/\S+)/)
      if (m) resolve(m[1])
    })
    child.on('exit', () => reject(new Error('chrome exited before announcing its DevTools endpoint: ' + errOut.slice(-400))))
    setTimeout(() => reject(new Error('chrome announced no DevTools endpoint within 15s: ' + errOut.slice(-400))), 15000)
  })
  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('DevTools socket failed to open')) })
  let seq = 0
  const pending = new Map()
  const listeners = []
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error('DevTools ' + msg.error.message)); else resolve(msg.result)
    } else if (msg.method) listeners.forEach((l) => l(msg))
  }
  const rawSend = (method, params, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify(Object.assign({ id, method, params: params || {} }, sessionId ? { sessionId } : {})))
  })
  const send = (method, params, sessionId) => withDeadline(rawSend(method, params, sessionId), deadlineMs, 'DevTools ' + method)
  const close = async () => {
    try { await Promise.race([rawSend('Browser.close'), new Promise((r) => setTimeout(r, 2000))]) } catch (e) { /* closing anyway */ }
    try { ws.close() } catch (e) { /* closed */ }
    try { child.kill('SIGKILL') } catch (e) { /* gone */ }
  }
  return { send, rawSend, listeners, deadlineMs, close }
}

// openPage(launch) → { navigate, evalJs, setViewport, sleep, send, sessionId, close } — one new
// target/session on an already-launched instance (`launchChrome`'s return). `close()` closes only
// this target, leaving the shared browser process running for the caller's next test.
async function openPage(launch) {
  const { send, rawSend, listeners, deadlineMs } = launch
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Page.enable', {}, sessionId)
  await send('Runtime.enable', {}, sessionId)
  const waitFor = (method) => new Promise((resolve) => {
    listeners.push(function l(msg) { if (msg.method === method && msg.sessionId === sessionId) { listeners.splice(listeners.indexOf(l), 1); resolve(msg.params) } })
  })
  // The notes layer asks the reviewer's name through window.prompt on a fresh profile
  // (notes-layer-isolation.test.js A3); a pending dialog holds the load event forever, so
  // every dialog is answered as it opens.
  listeners.push((msg) => {
    if (msg.method === 'Page.javascriptDialogOpening' && msg.sessionId === sessionId) {
      rawSend('Page.handleJavaScriptDialog', { accept: true, promptText: 'reviewer' }, sessionId).catch(() => {})
    }
  })
  const navigate = async (url) => {
    const loaded = withDeadline(waitFor('Page.loadEventFired'), deadlineMs, 'load of ' + url)
    // A rejected `loaded` racing ahead of `send`'s own deadline (both started in the same tick)
    // must never surface as an unhandled rejection before the `await loaded` line below reaches
    // it — attach a no-op catch immediately and let the real await re-raise it in order.
    loaded.catch(() => {})
    await send('Page.navigate', { url }, sessionId)
    await loaded
    await new Promise((r) => setTimeout(r, 300))
  }
  const evalJs = async (expr) => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId)
    if (exceptionDetails) {
      throw new Error('page eval threw (the markup/script under test is likely still missing): ' +
        (exceptionDetails.exception && exceptionDetails.exception.description || JSON.stringify(exceptionDetails)))
    }
    return result.value
  }
  const setViewport = (width, height) => send('Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor: 1, mobile: false }, sessionId)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const close = async () => { try { await send('Target.closeTarget', { targetId }) } catch (e) { /* browser may already be closing */ } }
  return { navigate, evalJs, setViewport, sleep, send, sessionId, close }
}

// A minimal DevTools client, single-page shape: launch headless Chrome, attach one page session,
// run `fn` against it, and tear the whole browser down — for a file with exactly one (or few)
// `[env: CHROME_BIN]` tests, where a per-file shared launch (`launchChrome`/`openPage`) would be
// more machinery than the file needs. `opts.deadlineMs` (default 15000, D4) bounds every DevTools
// `send` and `navigate`'s load wait; the 15s DevTools-endpoint launch wait and the 2s
// `Browser.close` race are unchanged.
async function withChrome(chrome, fn, opts = {}) {
  const launch = await launchChrome(chrome, opts)
  try {
    const page = await openPage(launch)
    return await fn(page)
  } finally {
    await launch.close()
  }
}

// drag(send, sessionId, from, to, opts): a real `Input.dispatchMouseEvent` press / N moves /
// release — never a script-dispatched PointerEvent, which pointer capture and click-suppression
// cannot observe (only a genuine input event routes through the browser's own hit-testing and
// capture machinery). `from`/`to` are `{x, y}` in the page's own viewport CSS pixels; `opts.steps`
// (default 8) sets the move count, `opts.button` (default 'left'). Four of this repo's interaction
// tests need the identical sequence — specs/20260913/02-the-layer-owns-one-mode-and-the-page-owns-
// the-card.md D13 (AC-20260913-02-2).
async function drag(send, sessionId, from, to, opts) {
  opts = opts || {}
  const steps = opts.steps || 8
  const button = opts.button || 'left'
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button, clickCount: 1 }, sessionId)
  for (let i = 1; i <= steps; i++) {
    const x = from.x + (to.x - from.x) * (i / steps)
    const y = from.y + (to.y - from.y) * (i / steps)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button, buttons: 1 }, sessionId)
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button, clickCount: 1 }, sessionId)
}

module.exports = { findChrome, serve, withChrome, withDeadline, drag, launchChrome, openPage }
