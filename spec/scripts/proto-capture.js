#!/usr/bin/env node
// proto-capture.js --host <hostRoot> --url <u> --out <file> --composites <csv>
//   [--viewport WxH] [--root <selector>]
// proto-capture.js --diff <baseline> <current>
//
// WHY: specs/20260928/02-freeze-export-and-the-contract.md D1, AC-20260928-02-2, AC-20260928-
// 02-3 — spawned by the prototype driver's `--mark frozen` step (and, per spec 03, by the build
// driver's capture gate), never imported. Loads `@playwright/test` through
// `createRequire(<hostRoot>/package.json)` so the plugin itself carries zero browser
// dependencies — the host owns Playwright, this script only borrows it. Opens Chromium at the
// given viewport (default 1280x800, DPR 1, `reducedMotion: reduce`), waits for `load`, injects
// animation-off CSS, awaits `document.fonts.ready` plus a 150ms settle (the 2026-09-23 spike's
// own mitigations, docs/spikes/20260923-design-retool/spike-structdiff.md), injects
// `spec/templates/proto-stable-id.js` and `spec/templates/proto-capture-page.js` via
// `page.addScriptTag`, then calls the injected `captureComposites(root, composites, props)` and
// writes its result as a capture document. When the host declares `prototype.storageState` (read
// here through lib/host-config.js, specs/20261001/01-the-freeze-signs-in-and-derives-its-tier.md
// D2/D3) the page opens with that saved sign-in; absent = signed out. `--diff` compares two capture files by `id` with no
// browser involved at all.
//
// The 27 longhand computed properties are the spike's own enumerated PROPS list
// (docs/spikes/20260923-design-retool/structsnap.mjs) — the set measured to catch a one-step
// padding change and a one-token colour change with zero cross-run noise.
//
// What this deliberately does NOT do: decide which routes/states to capture (the driver reads
// states.json and calls this once per route x state), retry a failed navigation or capture, or
// write or refresh the sign-in file (the host's own Playwright setup owns it; this script only
// checks it parses), or own the browser-side walk itself (that lives in the injected, no-import
// spec/templates/proto-capture-page.js so the overlay, the capture and the derived tests share
// one algorithm).
//
// Exit codes:
//   0  --out written (capture mode), or an empty diff (--diff mode)
//   1  --diff mode found a non-empty diff (summary printed as JSON on stdout)
//   2  usage error; prototype.storageState not a path string, missing on disk, or not a readable
//      storage-state JSON file (each refused before any browser launches); @playwright/test
//      unresolvable from --host (names it); --url unreachable; the page settled on a different
//      path than --url ("redirected from <url> to <final>" — signed out the browser carries no
//      session, signed in the saved sign-in is stale; either way a login redirect must never be
//      recorded as the route's baseline); no element carries a React fiber ("no fibers — the dev
//      server must run a development build"); fibers present but none carries the dev-only
//      `_debugOwner` field ("production build" — the stable ids need it); zero composite
//      elements found ("no composite on <url> — screens import composites only")

'use strict'
const fs = require('fs')
const path = require('path')
const { createRequire } = require('module')
const { readConfig, CONFIG_RELPATH } = require('./lib/host-config')

function die(msg) {
  writeOut(2, 'proto-capture: ' + msg + '\n')
  process.exit(2)
}

function writeOut(fd, text) {
  const buf = Buffer.from(text, 'utf8')
  let off = 0
  while (off < buf.length) {
    try {
      off += fs.writeSync(fd, buf, off, buf.length - off)
    } catch (e) {
      if (e.code === 'EAGAIN') continue
      throw e
    }
  }
}

// The 2026-09-23 spike's own PROPS list (docs/spikes/20260923-design-retool/structsnap.mjs) —
// the set this repo measured, not an invented one.
const PROPS = [
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'row-gap', 'column-gap',
  'font-size', 'font-weight', 'line-height',
  'color', 'background-color',
  'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-left-radius', 'border-bottom-right-radius',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'display', 'flex-direction', 'align-items', 'justify-content',
]

const argv = process.argv.slice(2)
function flagArg(name) { const i = argv.indexOf(name); return i > -1 ? argv[i + 1] : null }

// ---------------------------------------------------------------------------
// --diff <baseline> <current> — pure, no browser.
// ---------------------------------------------------------------------------
function loadCaptureFile(p) {
  let raw
  try {
    raw = fs.readFileSync(p, 'utf8')
  } catch (e) {
    die('cannot read capture file ' + p + ' (' + e.message + ')')
  }
  try {
    return JSON.parse(raw)
  } catch (e) {
    die(p + ' is not valid JSON (' + e.message + ')')
  }
  return null // unreachable
}

function diffCaptures(a, b) {
  const aEntries = new Map((a.entries || []).map((e) => [e.id, e]))
  const bEntries = new Map((b.entries || []).map((e) => [e.id, e]))
  const entries = []
  let missing = 0
  let extra = 0
  let changed = 0

  function pushChanged(id, field, before, after) {
    entries.push({ id, kind: 'changed', field, before, after })
    changed++
  }

  for (const [id, ea] of aEntries) {
    const eb = bEntries.get(id)
    if (!eb) {
      entries.push({ id, kind: 'missing' })
      missing++
      continue
    }
    if (ea.tag !== eb.tag) pushChanged(id, 'tag', ea.tag, eb.tag)
    if (ea.text !== eb.text) pushChanged(id, 'text', ea.text, eb.text)
    if (JSON.stringify(ea.box) !== JSON.stringify(eb.box)) pushChanged(id, 'box', ea.box, eb.box)
    const sa = ea.styles || {}
    const sb = eb.styles || {}
    const styleKeys = new Set([...Object.keys(sa), ...Object.keys(sb)])
    for (const key of styleKeys) {
      if (sa[key] !== sb[key]) pushChanged(id, 'styles.' + key, sa[key], sb[key])
    }
  }
  for (const [id] of bEntries) {
    if (!aEntries.has(id)) {
      entries.push({ id, kind: 'extra' })
      extra++
    }
  }
  return { summary: { missing, extra, changed }, entries }
}

if (argv[0] === '--diff') {
  const baselinePath = argv[1]
  const currentPath = argv[2]
  if (!baselinePath || !currentPath) die('--diff needs two paths: --diff <baseline> <current>')
  const result = diffCaptures(loadCaptureFile(baselinePath), loadCaptureFile(currentPath))
  const clean = result.summary.missing === 0 && result.summary.extra === 0 && result.summary.changed === 0
  writeOut(1, JSON.stringify(result, null, 2) + '\n')
  process.exit(clean ? 0 : 1)
}

// The page must settle on the path it was sent to. Path (trailing slash ignored) plus the hash
// when the requested URL routes by hash; the query is free to change.
function samePage(requested, final) {
  let a
  let b
  try { a = new URL(requested); b = new URL(final) } catch { return requested === final }
  const norm = (p) => p.replace(/\/+$/, '') || '/'
  if (a.origin !== b.origin || norm(a.pathname) !== norm(b.pathname)) return false
  return !a.hash || a.hash === b.hash
}

// ---------------------------------------------------------------------------
// Capture mode — usage validation first (never depends on @playwright/test resolving).
// ---------------------------------------------------------------------------
const host = flagArg('--host')
const url = flagArg('--url')
const out = flagArg('--out')
const compositesArg = flagArg('--composites')
const viewportArg = flagArg('--viewport')
const rootSelector = flagArg('--root')

if (!host) die('--host <hostRoot> is required — usage: proto-capture.js --host <hostRoot> --url <u> --out <file> --composites <csv>')
if (!url) die('--url <u> is required — usage: proto-capture.js --host <hostRoot> --url <u> --out <file> --composites <csv>')
if (!out) die('--out <file> is required — usage: proto-capture.js --host <hostRoot> --url <u> --out <file> --composites <csv>')
if (!compositesArg) die('--composites <csv> is required — usage: proto-capture.js --host <hostRoot> --url <u> --out <file> --composites <csv>')

let viewport = { width: 1280, height: 800 }
if (viewportArg) {
  const m = /^(\d+)x(\d+)$/.exec(viewportArg)
  if (!m) die('--viewport must be WxH (e.g. 1280x800), got: ' + viewportArg)
  viewport = { width: parseInt(m[1], 10), height: parseInt(m[2], 10) }
}
const composites = compositesArg.split(',').map((s) => s.trim()).filter(Boolean)

// prototype.storageState (D2): validated before @playwright/test is resolved or a browser
// launched, so a bad sign-in never surfaces as Playwright's own remedy-less error.
let storageStateValue = null
let storageStateAbs = null
const declaredState = (readConfig(path.resolve(host)).prototype || {}).storageState
if (declaredState !== undefined) {
  if (typeof declaredState !== 'string' || declaredState === '') {
    die('prototype.storageState must be a path string — remedy: fix it in ' + CONFIG_RELPATH + ', then run /spec:doctor')
  }
  storageStateValue = declaredState
  storageStateAbs = path.resolve(host, declaredState)
  let origin = url
  try { origin = new URL(url).origin } catch { /* keep the raw --url */ }
  if (!fs.existsSync(storageStateAbs)) {
    die('prototype.storageState (' + declaredState + ') does not exist at ' + storageStateAbs +
      ' — remedy: sign in against ' + origin + ' and save the browser state to that path (the host\'s own ' +
      'Playwright sign-in setup); inside a spec worktree, list the path in .worktreeinclude or run the setup there, then re-run')
  }
  let stateOk = true
  let stateErr = ''
  try {
    const parsed = JSON.parse(fs.readFileSync(storageStateAbs, 'utf8'))
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      stateOk = false
      stateErr = 'not a JSON object'
    }
  } catch (e) {
    stateOk = false
    stateErr = e.message
  }
  if (!stateOk) {
    die('prototype.storageState (' + declaredState + ') is not a readable storage-state JSON file (' + stateErr +
      ') — remedy: re-run the sign-in setup to rewrite it')
  }
}

let playwrightTest
try {
  const req = createRequire(path.join(path.resolve(host), 'package.json'))
  playwrightTest = req('@playwright/test')
} catch (e) {
  die('@playwright/test is not resolvable from ' + host + ' (' + e.message +
    ') — remedy: install it in the host (`npm i -D @playwright/test` or the host\'s equivalent), then re-run')
}

;(async () => {
  const { chromium } = playwrightTest
  const browser = await chromium.launch()
  let page
  try {
    const pageOpts = { viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' }
    if (storageStateAbs) pageOpts.storageState = storageStateAbs
    page = await browser.newPage(pageOpts)
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 15000 })
    } catch (e) {
      await browser.close()
      die('cannot reach ' + url + ' (' + e.message + ') — remedy: confirm the dev server is running at prototype.url, then re-run')
      return
    }
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' })
    await page.evaluate(() => document.fonts && document.fonts.ready)
    await page.waitForTimeout(150)

    // Checked after the settle so a client-side router redirect is caught too, not only a 302.
    const finalUrl = page.url()
    if (!samePage(url, finalUrl)) {
      await browser.close()
      if (storageStateAbs) {
        die('redirected from ' + url + ' to ' + finalUrl + ' — the capture browser was signed in from ' + storageStateValue +
          ', so the saved sign-in has expired, belongs to another server, or this route only renders signed out; ' +
          'remedy: sign in again to rewrite ' + storageStateValue + ', or drop the route from states.json, then re-run')
      } else {
        die('redirected from ' + url + ' to ' + finalUrl + ' — the capture browser starts signed out, so a ' +
          'signed-in route lands on its login page; remedy: declare prototype.storageState (a saved sign-in) in ' +
          CONFIG_RELPATH + ', capture only routes that render signed out, or serve the route without its auth guard in the prototype')
      }
      return
    }

    const stableIdPath = path.join(__dirname, '..', 'templates', 'proto-stable-id.js')
    const capturePagePath = path.join(__dirname, '..', 'templates', 'proto-capture-page.js')
    await page.addScriptTag({ path: stableIdPath, type: 'module' })
    await page.addScriptTag({ path: capturePagePath })

    const result = await page.evaluate(({ composites, props, rootSelector }) => {
      const allEls = Array.from(document.querySelectorAll('*'))
      const hasFiber = allEls.some((el) => Object.keys(el).some((k) => k.indexOf('__reactFiber$') === 0))
      if (!hasFiber) return { error: 'no-fibers' }
      // React development builds give every fiber a `_debugOwner` field (null at the root);
      // production builds never define it, and the stable ids walk that owner chain.
      const devBuild = allEls.some((el) => Object.keys(el).some((k) => k.indexOf('__reactFiber$') === 0 && el[k] && '_debugOwner' in el[k]))
      if (!devBuild) return { error: 'production-build' }
      const root = rootSelector ? document.querySelector(rootSelector) : document.body
      if (!root) return { error: 'root-not-found' }
      const api = (window.__protoCapture && window.__protoCapture.captureComposites) ? window.__protoCapture : window
      return { entries: api.captureComposites(root, composites, props) }
    }, { composites, props: PROPS, rootSelector })

    await browser.close()

    if (result.error === 'no-fibers') {
      die('no fibers — the dev server must run a development build')
      return
    }
    if (result.error === 'production-build') {
      die('production build on ' + url + ' — React fibers carry no _debugOwner, so no stable id can be derived; ' +
        'remedy: point prototype.url at the dev server (a development build), then re-run')
      return
    }
    if (result.error === 'root-not-found') {
      die('--root ' + rootSelector + ' matched no element on ' + url)
      return
    }
    if (!result.entries || result.entries.length === 0) {
      die('no composite on ' + url + ' — screens import composites only')
      return
    }

    const doc = { schemaVersion: 1, url, viewport, composites, entries: result.entries }
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
    fs.writeFileSync(out, JSON.stringify(doc, null, 2) + '\n')
    process.exit(0)
  } catch (e) {
    try { await browser.close() } catch { /* best-effort */ }
    die('capture failed: ' + e.message)
  }
})()
