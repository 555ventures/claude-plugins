'use strict'
// Shared headless-Chrome harness for this suite's `[env: CHROME_BIN]`-gated tests
// (tests/mocks/notes-layer-isolation.test.js, tests/design-atlas-index.test.js,
// tests/mocks/notes-layer-navigation.test.js): one findChrome()/serve()/withChrome() so the
// three near-identical blocks the host rules flag as a duplication finding live in one place.
// Each caller keeps its own PROBE/eval expressions and interaction sequences — this module only
// owns process/socket plumbing.
// Owner: specs/20260907/09-atlas-index-and-note-navigation.md A5 (the assumption that named
// tests/mocks/notes-layer-isolation.test.js's own findChrome/serve/withChrome trio as the
// precedent this harness generalizes) and this spec's D7′/A5 review-dispositions ruling that
// called for the extraction once a third near-identical copy appeared.
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

function serve(dir, port) {
  const child = spawn(process.execPath, [path.join(SPEC, 'scripts/design-atlas.js'), 'serve', '--root', dir, '--port', String(port)])
  const ready = new Promise((resolve, reject) => {
    let out = ''
    child.stdout.on('data', (c) => { out += c; if (out.includes('\n')) resolve() })
    child.stderr.on('data', (c) => { out += c })
    setTimeout(() => reject(new Error('serve did not start: ' + out)), 5000)
  })
  return { child, ready }
}

// A minimal DevTools client: launch headless Chrome, attach one page session, and expose a
// navigate()/evalJs()/setViewport()/sleep() quartet a caller composes into its own flow (e.g. an
// evalAt(url) that navigates then evaluates one fixed probe expression). Every dialog (the notes
// layer's window.prompt on a fresh profile, A3) is answered as it opens — a pending dialog holds
// the load event forever otherwise.
async function withChrome(chrome, fn) {
  const child = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + tmpdir('chrome-profile'), '--remote-debugging-port=0', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  const wsUrl = await new Promise((resolve, reject) => {
    let err = ''
    child.stderr.on('data', (c) => {
      err += c
      const m = err.match(/DevTools listening on (ws:\/\/\S+)/)
      if (m) resolve(m[1])
    })
    child.on('exit', () => reject(new Error('chrome exited before announcing its DevTools endpoint: ' + err.slice(-400))))
    setTimeout(() => reject(new Error('chrome announced no DevTools endpoint within 15s: ' + err.slice(-400))), 15000)
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
  const send = (method, params, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify(Object.assign({ id, method, params: params || {} }, sessionId ? { sessionId } : {})))
  })
  const waitFor = (method, sessionId) => new Promise((resolve) => {
    listeners.push(function l(msg) { if (msg.method === method && msg.sessionId === sessionId) { listeners.splice(listeners.indexOf(l), 1); resolve(msg.params) } })
  })
  try {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    await send('Page.enable', {}, sessionId)
    await send('Runtime.enable', {}, sessionId)
    // The notes layer asks the reviewer's name through window.prompt on a fresh profile
    // (notes-layer-isolation.test.js A3); a pending dialog holds the load event forever, so
    // every dialog is answered as it opens.
    listeners.push((msg) => {
      if (msg.method === 'Page.javascriptDialogOpening' && msg.sessionId === sessionId) {
        send('Page.handleJavaScriptDialog', { accept: true, promptText: 'reviewer' }, sessionId).catch(() => {})
      }
    })
    const navigate = async (url) => {
      const loaded = waitFor('Page.loadEventFired', sessionId)
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
    return await fn({ navigate, evalJs, setViewport, sleep, send, sessionId })
  } finally {
    try { await Promise.race([send('Browser.close'), new Promise((r) => setTimeout(r, 2000))]) } catch (e) { /* closing anyway */ }
    try { ws.close() } catch (e) { /* closed */ }
    try { child.kill('SIGKILL') } catch (e) { /* gone */ }
  }
}

module.exports = { findChrome, serve, withChrome }
