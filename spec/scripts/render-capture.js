#!/usr/bin/env node
'use strict'
// render-capture.js --url <u> --width <w> --height <h> --theme <t> --state <s> --script <file> --out <json>
// render-capture.js --batch <cells.json>      # [{url,width,height,theme,state,script,out}, …]
// render-capture.js --which                   # prints the resolved browser path
//
// WHY: specs/20260905/06-plugin-owned-capture-at-approval.md (D1/D2/D10, ADR-0007) —
// render-gate.js's own `--mocks` mode needs a capture command to fall back to when a host
// declares none; this is that command, honouring the exact host contract flag set (D1) so a
// host may still declare its own capture and nothing else changes. It speaks just enough of the
// Chrome DevTools Protocol over Node's global WebSocket (Node >= 22, no dependency) to launch one
// headless Chrome, open one target, and per cell (D10): Emulation.setDeviceMetricsOverride,
// Page.navigate, a load event + 300 ms settle, then Runtime.evaluate `(<script>)({theme,state})`
// by value. `--batch` reuses that one browser/page for every cell it is given.
//
// What this deliberately does NOT do: screenshot or diff pixels (no such flag exists here);
// resolve a browser beyond CHROME_BIN or the fixed macOS/PATH candidate list below (D2 — a wider
// scan would make "no browser" untestable); retry a dead launch or a failed navigation — one
// timeout per stage is the whole story, surfaced as exit 3 naming the cell's url.
//
// Exit codes: 0 = every cell captured and written · 2 = usage, or no browser resolved (stderr
// names CHROME_BIN, Google Chrome, and design.render.capture) · 3 = the browser announced no
// DevTools endpoint within 15s, a navigation never fired load within 20s, or the evaluated
// script threw (stderr names the cell's url)

const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawn, spawnSync } = require('child_process')

function die(code, msg) {
  process.stderr.write('render-capture: ' + msg + '\n')
  process.exit(code)
}

function writeOut(str) {
  const buf = Buffer.from(str, 'utf8')
  let off = 0
  while (off < buf.length) {
    try {
      off += fs.writeSync(1, buf, off, buf.length - off)
    } catch (e) {
      if (e.code === 'EAGAIN') continue
      throw e
    }
  }
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }

// ---- D2: browser resolution ------------------------------------------------------------------
// CHROME_BIN when set is the ONLY candidate — no fallback scan, so "no browser" stays testable
// on a machine that has one. Otherwise the macOS app paths, then four PATH names.
const MAC_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
]
const PATH_NAMES = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']

function isExecutable(p) {
  try {
    fs.accessSync(p, fs.constants.X_OK)
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

function resolveBrowser() {
  if (process.env.CHROME_BIN) return isExecutable(process.env.CHROME_BIN) ? process.env.CHROME_BIN : null
  for (const p of MAC_PATHS) if (isExecutable(p)) return p
  for (const name of PATH_NAMES) {
    const r = spawnSync('which', [name], { encoding: 'utf8' })
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim()
  }
  return null
}

const NO_BROWSER_MSG = 'no browser resolved — set CHROME_BIN to an executable Chrome/Chromium ' +
  'binary, install Google Chrome, or have the host declare design.render.capture instead'

// ---- args -------------------------------------------------------------------------------------
const argv = process.argv.slice(2)
function flagVal(name) {
  const i = argv.indexOf(name)
  return i > -1 ? argv[i + 1] : undefined
}
const isWhich = argv.includes('--which')
const batchPath = flagVal('--batch')

let cells = null
if (!isWhich) {
  if (batchPath) {
    let raw
    try {
      raw = JSON.parse(fs.readFileSync(batchPath, 'utf8'))
    } catch (e) {
      die(2, '--batch ' + batchPath + ' is not readable/parsable JSON (' + e.message + ')')
    }
    if (!Array.isArray(raw) || !raw.length) die(2, '--batch ' + batchPath + ' must be a non-empty JSON array of cells')
    cells = raw
  } else {
    const url = flagVal('--url'), width = flagVal('--width'), height = flagVal('--height'),
      theme = flagVal('--theme'), state = flagVal('--state'), script = flagVal('--script'), out = flagVal('--out')
    const missing = []
    for (const [name, v] of [['--url', url], ['--width', width], ['--height', height], ['--theme', theme],
      ['--state', state], ['--script', script], ['--out', out]]) {
      if (v === undefined) missing.push(name)
    }
    if (missing.length) {
      die(2, 'usage: render-capture.js --url <u> --width <w> --height <h> --theme <t> --state <s> ' +
        '--script <file> --out <json> (missing ' + missing.join(', ') + ') — or --batch <cells.json>, or --which')
    }
    cells = [{ url, width: Number(width), height: Number(height), theme, state, script, out }]
  }
}

// ---- D10: browser launch --------------------------------------------------------------------
function launchBrowser(bin) {
  return new Promise((resolve, reject) => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-capture-'))
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
// WebSocket connection (D10: one browser, one page session for the whole batch).
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

// D10: dialogs are auto-accepted so a mock's own alert()/confirm() never stalls a batch run.
function armDialogAutoAccept(cdp, sessionId) {
  cdp.on('Page.javascriptDialogOpening', () => {
    cdp.send('Page.handleJavaScriptDialog', { accept: true }, sessionId).catch(() => { /* best-effort */ })
  })
}

async function captureOne(cdp, sessionId, cell) {
  await cdp.send('Emulation.setDeviceMetricsOverride',
    { width: cell.width, height: cell.height, deviceScaleFactor: 1, mobile: false }, sessionId)

  const loaded = waitForEvent(cdp, 'Page.loadEventFired', sessionId, 20000,
    'navigation never fired load within 20s for ' + cell.url)
  await cdp.send('Page.navigate', { url: cell.url }, sessionId)
  await loaded
  await sleep(300)

  let scriptSrc
  try {
    scriptSrc = fs.readFileSync(cell.script, 'utf8')
  } catch (e) {
    throw new Error('cannot read --script ' + cell.script + ' for ' + cell.url + ': ' + e.message)
  }
  const expression = '(' + scriptSrc + ')(' + JSON.stringify({ theme: cell.theme, state: cell.state }) + ')'
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails.text || JSON.stringify(result.exceptionDetails)
    throw new Error('script threw for ' + cell.url + ': ' + detail)
  }
  const doc = result.result && result.result.value
  fs.writeFileSync(cell.out, JSON.stringify(doc))
}

// Browser.close raced against a 2s timer, then SIGKILL — a browser that never acknowledges the
// close request must never hang the run.
function closeBrowser(cdp, child) {
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

async function captureAll(bin, allCells) {
  const { child, wsUrl, userDataDir } = await launchBrowser(bin)
  try {
    const ws = await connectSocket(wsUrl)
    const cdp = new CDP(ws)
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
    await cdp.send('Page.enable', {}, sessionId)
    await cdp.send('Runtime.enable', {}, sessionId)
    armDialogAutoAccept(cdp, sessionId)
    for (const cell of allCells) await captureOne(cdp, sessionId, cell)
    await closeBrowser(cdp, child)
  } finally {
    try { child.kill('SIGKILL') } catch { /* already dead or closed cleanly */ }
    try { fs.rmSync(userDataDir, { recursive: true, force: true }) } catch { /* best-effort cleanup */ }
  }
}

async function main() {
  const bin = resolveBrowser()
  if (!bin) die(2, NO_BROWSER_MSG)

  if (isWhich) {
    writeOut(bin + '\n')
    process.exit(0)
  }

  try {
    await captureAll(bin, cells)
  } catch (e) {
    die(3, e && e.message ? e.message : String(e))
  }
  process.exit(0)
}

main()
