'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC, tmpdir } = require('../helpers')
const { findChrome, serve, withChrome } = require('./chrome-harness')

// Chrome isolation of the served notes layer (spec/scripts/lib/notes-layer.browser.js), the
// invariant behind specs/20260902/10-page-notes-review-loop.md D3's "touches no mock markup":
// a served mock computes the SAME styles with and without the layer attached. viewer.css carries
// chrome-page rules (`body{background;color}`, `*{box-sizing}`) — linked into a mock's document
// they cascade over the mock's own rules (later sheet, equal specificity) and repaint the mock in
// the light palette whatever its theme. The layer therefore links viewer.css only inside its
// shadow roots (tokens declared on `:host,:root`), and its one document-level rule targets its
// own `.nl-host` elements only.
//
// Two pins: a static one over the source (runs everywhere) and an executed one that boots
// `serve`, renders a dark mock in headless Chrome with and without the layer, and diffs computed
// styles. The executed pin is environment-gated on a Chrome binary (CHROME_BIN, else the macOS
// bundle, else `google-chrome`/`chromium` on PATH) and skips with the reason named when none is
// found — the static pin never skips.

const LIB = path.join(SPEC, 'scripts/lib/notes-layer.browser.js')
const VIEWER = path.join(SPEC, 'templates/mocks/viewer.css')

test('notes layer: viewer.css is linked only inside shadow roots, tokens resolve on :host, and the sole document-level rule is .nl-host-scoped', () => {
  const src = fs.readFileSync(LIB, 'utf8')
  const viewer = fs.readFileSync(VIEWER, 'utf8')
  assert.match(viewer, /^:host,:root\s*\{/m,
    'viewer.css must declare its --v-* register on `:host,:root` so the tokens resolve inside the layer\'s shadow roots')
  assert.match(src, /attachShadow\(\{ mode: 'open' \}\)/, 'the layer must mount its chrome behind a shadow root')
  // Every document-level style the layer appends is collected: `document.head.appendChild(X)` where X
  // is a <style>; its selectors must all start with `body.lb-open .nl-host` or `.nl-host`.
  const headAppends = [...src.matchAll(/document\.head\.appendChild\((\w+)\)/g)].map((m) => m[1])
  assert.deepStrictEqual(headAppends, ['hostStyle'],
    'the layer may append exactly one element to the served document\'s <head> (its .nl-host hide rule): got ' + JSON.stringify(headAppends))
  const hostRule = src.match(/hostStyle\.textContent = '([^']*)'/)
  assert.ok(hostRule, 'hostStyle must carry a literal rule string')
  for (const sel of hostRule[1].split('}').filter(Boolean).map((r) => r.split('{')[0].trim())) {
    assert.match(sel, /(^|\s)\.nl-host(\s|$|,)/,
      'every document-level selector the layer adds must target .nl-host: got "' + sel + '"')
  }
  // The viewer link is created inside mount() (the shadow root), never appended to document.head.
  assert.doesNotMatch(src, /document\.head\.appendChild\(link\)/, 'the viewer.css <link> must never land in the served document\'s <head>')
  assert.match(src, /root\.appendChild\(link\)/, 'the viewer.css <link> must be appended to the shadow root')
})

// The probe mock: dark by default, with a content-box element — the two things viewer.css's
// chrome rules (`body{background;color}`, `*{box-sizing}`) would repaint if they reached the
// document. Computed styles are read over the DevTools Protocol (Node's built-in WebSocket, no
// package), which also closes the browser cleanly — Chrome's --dump-dom never exits on its own.
const MOCK = [
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
  '<style>:root{--bg:#111;--fg:#eee}body{margin:0;background:var(--bg);color:var(--fg)}',
  '.box{box-sizing:content-box;width:100px;padding:10px;border:0}</style></head>',
  '<body data-screen-label="probe"><main><div class="box">hi</div></main></body></html>',
].join('')
const PROBE = '(function(){var b=getComputedStyle(document.body),x=getComputedStyle(document.querySelector(".box"));' +
  'return {bodyBg:b.backgroundColor,bodyColor:b.color,boxSizing:x.boxSizing,boxWidth:x.width,' +
  'headLinks:document.querySelectorAll("head link").length,hosts:document.querySelectorAll(".nl-host").length}})()'

test('notes layer (executed, headless Chrome): a served dark mock computes identical body/box styles with and without the layer', { timeout: 60000 }, async (t) => {
  const chrome = findChrome()
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — the static pin above still runs')
  const dir = tmpdir('notes-isolation')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/m.html'), MOCK)
  const port = 42230 + (process.pid % 300)
  const { child, ready } = serve(dir, port)
  try {
    await ready
    const base = 'http://127.0.0.1:' + port + '/mocks/m.html'
    await withChrome(chrome, async ({ navigate, evalJs }) => {
      // evalAt(url) = navigate, wait for load plus withChrome's own settle tick, evaluate PROBE.
      const evalAt = async (url) => { await navigate(url); return evalJs(PROBE) }
      const clean = await evalAt(base + '?clean')
      const injected = await evalAt(base)
      assert.strictEqual(clean.hosts, 0, '?clean must carry no layer at all: ' + JSON.stringify(clean))
      assert.strictEqual(clean.bodyBg, 'rgb(17, 17, 17)', 'the probe mock itself must render dark, else the pin proves nothing: ' + JSON.stringify(clean))
      assert.strictEqual(injected.hosts, 2, 'the served page must carry the layer (bar host + strip host): ' + JSON.stringify(injected))
      assert.strictEqual(injected.headLinks, clean.headLinks, 'the layer must add no <link> to the served document\'s <head>: ' + JSON.stringify(injected))
      assert.deepStrictEqual(
        { bodyBg: injected.bodyBg, bodyColor: injected.bodyColor, boxSizing: injected.boxSizing, boxWidth: injected.boxWidth },
        { bodyBg: clean.bodyBg, bodyColor: clean.bodyColor, boxSizing: clean.boxSizing, boxWidth: clean.boxWidth },
        'the layer must not change the mock\'s computed body colours or box model — with layer: ' + JSON.stringify(injected) + ' clean: ' + JSON.stringify(clean))
    })
  } finally {
    child.kill('SIGTERM')
    await new Promise((r) => child.on('exit', r))
  }
})
