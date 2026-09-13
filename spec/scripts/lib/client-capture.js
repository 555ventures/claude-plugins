'use strict'
// lib/client-capture.js — captureScreen({ port, label, state, viewport, out }) → Promise<{ hash }>
//                          resolveRegion({ port, label, state, viewport, region }) → Promise<{ mode, region }>
// specs/20260907/10-client-review.md D5, AC-20260907-10-8 (captureScreen).
// specs/20260912/12-the-loop-re-anchors-and-everyone-draws.md D2, AC-20260912-12-2 (resolveRegion).
// captureScreen screenshots a served mock through the same loopback URL form and viewport the
// look command already uses (a `/mocks/<label>.html` path, `?clean`, an optional `&state=<s>`),
// then sha256-hexes the written PNG — the one comparable before/after signal D6/D7 close a client
// note on.
//
// resolveRegion opens the served mock at the NON-clean URL (`/mocks/<label>.html`, an optional
// `?state=<s>` — no `?clean`): the served page must carry `window.NotesAnchor` for the eval below
// to call, and design-atlas.js's `?clean` route deliberately injects no notes script at all
// (tests/mocks/notes-layer-isolation.test.js's own "?clean must carry no layer at all" pin) — the
// plain `/mocks/` route already injects anchor.js unconditionally, so no server-side change is
// needed here. It speaks the Chrome DevTools Protocol over Node's global WebSocket (no
// dependency) — the same minimal launch/CDP-client shape spec/scripts/render-capture.js uses
// (duplicated rather than imported: that file is a script, not a lib, and this module stays
// independently loadable), including its exact CHROME_BIN discovery order (CHROME_BIN only when
// set, else the two macOS app paths, else four PATH names).
//
// Called from INSIDE design-atlas.js's own serving process — a client's POST is the raise, so the
// capture must run in the same process that is still answering that very request. This is why the
// child process is always started with the async `spawn` and never `spawnSync`: a synchronous
// wait here would block the process's single event loop for the child's whole lifetime, and the
// child's own screenshot request against this same server could then never be serviced —
// deadlock (gotcha class: in-process fixture under spawnSync, specs/20260825/03).
//
// Does NOT: know about notes.json, design/mocks/captures/ file placement, before/after
// comparison, or the addressed.reanchored field — the caller (design-atlas.js's client route,
// mocks-driver.js's `notes address --port`) owns every filesystem decision and every notes.json
// write beyond the one PNG or {mode, region} pair this module hands back.
//
// Exit codes: none — this is a library, not an executable.

const { spawn, spawnSync } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

function captureScreen({ port, label, state, viewport, out }) {
  return new Promise((resolve, reject) => {
    const vp = viewport || { width: 1280, height: 800 }
    const url = 'http://127.0.0.1:' + port + '/mocks/' + label + '.html?clean' +
      (state ? '&state=' + state : '')
    const args = ['--no-install', 'playwright', 'screenshot',
      '--viewport-size=' + (vp.width | 0) + ',' + (vp.height | 0), url, out]
    let child
    try {
      child = spawn('npx', args)
    } catch (e) {
      reject(new Error('could not spawn npx (' + e.message + ') — run `npx playwright install chromium`'))
      return
    }
    let stderrBuf = ''
    if (child.stderr) child.stderr.on('data', (c) => { stderrBuf += c.toString('utf8') })
    child.on('error', (e) => {
      reject(new Error('npx playwright screenshot failed to start (' + e.message + ') — run `npx playwright install chromium`'))
    })
    child.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(out)) {
        reject(new Error('npx playwright screenshot of ' + url + ' failed (exit ' + code + ') — run `npx playwright install chromium`' +
          (stderrBuf.trim() ? ': ' + stderrBuf.trim() : '')))
        return
      }
      let hash
      try {
        hash = crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex')
      } catch (e) {
        reject(new Error('could not read captured screenshot ' + out + ': ' + e.message))
        return
      }
      resolve({ hash })
    })
  })
}

// ---------------------------------------------------------------------------
// resolveRegion (D2) — same CHROME_BIN discovery as spec/scripts/render-capture.js's own
// resolveBrowser: CHROME_BIN only when set (no fallback scan, so "no browser" stays testable on a
// machine that has one), else the two macOS app paths, else four PATH names.
// ---------------------------------------------------------------------------
const MAC_CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
]
const CHROME_PATH_NAMES = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']

function isExecutable(p) {
  try {
    fs.accessSync(p, fs.constants.X_OK)
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

function resolveChromeBinary() {
  if (process.env.CHROME_BIN) return isExecutable(process.env.CHROME_BIN) ? process.env.CHROME_BIN : null
  for (const p of MAC_CHROME_PATHS) if (isExecutable(p)) return p
  for (const name of CHROME_PATH_NAMES) {
    const r = spawnSync('which', [name], { encoding: 'utf8' })
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim()
  }
  return null
}

const NO_BROWSER_MSG = 'no browser resolved for resolveRegion — set CHROME_BIN to an executable ' +
  'Chrome/Chromium binary, or install Google Chrome'

function launchChrome(bin) {
  return new Promise((resolve, reject) => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-region-'))
    const args = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--user-data-dir=' + userDataDir, '--remote-debugging-port=0', 'about:blank']
    let child
    try {
      child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    } catch (e) {
      reject(new Error('failed to launch ' + bin + ': ' + e.message))
      return
    }
    let stderrBuf = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { child.kill('SIGKILL') } catch { /* already dead */ }
      reject(new Error('the browser announced no DevTools endpoint within 15s (' + bin + ')'))
    }, 15000)
    child.on('error', (e) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error('failed to launch ' + bin + ': ' + e.message))
    })
    child.stderr.on('data', (d) => {
      if (settled) return
      stderrBuf += d.toString()
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(stderrBuf)
      if (m) {
        settled = true
        clearTimeout(timer)
        resolve({ child, wsUrl: m[1], userDataDir })
      }
    })
    child.on('exit', (code, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error('browser exited before announcing a DevTools endpoint (code ' + code + ' signal ' + signal + ')'))
    })
  })
}

function connectSocket(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    ws.addEventListener('open', () => resolve(ws))
    ws.addEventListener('error', () => reject(new Error('DevTools WebSocket connection failed: ' + wsUrl)))
  })
}

// Minimal CDP client: id-correlated request/response plus a fan-out event bus, over one raw
// WebSocket connection — the same shape render-capture.js's own CDP class uses.
class CDP {
  constructor(ws) {
    this.ws = ws
    this.nextId = 1
    this.pending = new Map()
    this.handlers = new Map()
    ws.addEventListener('message', (ev) => {
      let msg
      try { msg = JSON.parse(ev.data) } catch { return }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message || 'CDP error'))
        else resolve(msg.result)
      } else if (msg.method) {
        const hs = this.handlers.get(msg.method)
        if (hs) for (const h of hs) h(msg.params || {}, msg.sessionId)
      }
    })
  }
  send(method, params, sessionId) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      this.pending.set(id, { resolve, reject })
      const payload = { id, method, params: params || {} }
      if (sessionId) payload.sessionId = sessionId
      this.ws.send(JSON.stringify(payload))
    })
  }
  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, [])
    this.handlers.get(method).push(fn)
  }
}

function waitForEvent(cdp, method, sessionId, timeoutMs, timeoutMsg) {
  return new Promise((resolve, reject) => {
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      done = true
      reject(new Error(timeoutMsg))
    }, timeoutMs)
    cdp.on(method, (params, sid) => {
      if (done || (sessionId && sid !== sessionId)) return
      done = true
      clearTimeout(timer)
      resolve(params)
    })
  })
}

function armDialogAutoAccept(cdp, sessionId) {
  cdp.on('Page.javascriptDialogOpening', () => {
    cdp.send('Page.handleJavaScriptDialog', { accept: true, promptText: 'reviewer' }, sessionId).catch(() => { /* best-effort */ })
  })
}

function closeChrome(cdp, child) {
  return new Promise((resolve) => {
    let done = false
    const finish = () => { if (done) return; done = true; resolve() }
    child.once('exit', finish)
    cdp.send('Browser.close', {}).catch(() => { /* best-effort */ })
    setTimeout(() => {
      if (done) return
      try { child.kill('SIGKILL') } catch { /* already dead */ }
      finish()
    }, 2000)
  })
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

// D2: resolveRegion({ port, label, state, viewport, region }) → Promise<{ mode, region }>.
// Evaluates `NotesAnchor.resolve(root, region)` over the same `[data-screen-label]` root
// notes-layer.browser.js itself queries; on a non-null resolve, immediately re-captures a fresh
// region over the resolved box (`NotesAnchor.capture`) — no screenshot is ever taken here.
function resolveRegion({ port, label, state, viewport, region }) {
  return new Promise((resolve, reject) => {
    const bin = resolveChromeBinary()
    if (!bin) { reject(new Error(NO_BROWSER_MSG)); return }
    const vp = viewport || { width: 1280, height: 800 }
    const url = 'http://127.0.0.1:' + port + '/mocks/' + label + '.html' + (state ? '?state=' + state : '')

    launchChrome(bin).then(async ({ child, wsUrl, userDataDir }) => {
      const cleanup = () => { try { fs.rmSync(userDataDir, { recursive: true, force: true }) } catch { /* best-effort */ } }
      try {
        const ws = await connectSocket(wsUrl)
        const cdp = new CDP(ws)
        const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
        await cdp.send('Page.enable', {}, sessionId)
        await cdp.send('Runtime.enable', {}, sessionId)
        armDialogAutoAccept(cdp, sessionId)
        await cdp.send('Emulation.setDeviceMetricsOverride',
          { width: vp.width | 0, height: vp.height | 0, deviceScaleFactor: 1, mobile: false }, sessionId)
        const loaded = waitForEvent(cdp, 'Page.loadEventFired', sessionId, 20000, 'page did not load within 20s: ' + url)
        await cdp.send('Page.navigate', { url }, sessionId)
        await loaded
        await sleep(300)
        const expr = '(function(){' +
          'if(!window.NotesAnchor)return{error:"NotesAnchor is not loaded on "+location.href};' +
          'var root=document.querySelector("[data-screen-label]")||document.body;' +
          'var region=' + JSON.stringify(region) + ';' +
          'var resolved=window.NotesAnchor.resolve(root,region);' +
          'if(!resolved)return{mode:null,region:null};' +
          'var fresh=window.NotesAnchor.capture(root,resolved.box);' +
          'return{mode:resolved.mode,region:fresh};' +
          '})()'
        const result = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId)
        if (result.exceptionDetails) {
          throw new Error('resolveRegion eval threw: ' + (result.exceptionDetails.text || JSON.stringify(result.exceptionDetails)))
        }
        const value = result.result && result.result.value
        if (value && value.error) throw new Error(value.error)
        await closeChrome(cdp, child)
        cleanup()
        resolve(value)
      } catch (e) {
        try { child.kill('SIGKILL') } catch { /* already dead */ }
        cleanup()
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    }).catch(reject)
  })
}

module.exports = { captureScreen, resolveRegion }
