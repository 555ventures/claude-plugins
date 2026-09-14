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
//
// AC-20260912-11-12 (specs/20260912/11-a-note-can-mark-an-area.md D4): the layer gains a third
// shadow host, the overlay, mounted on every mock-scope page alongside the existing bar and strip
// hosts — the executed pin's host count below moves from 2 to 3. `?clean` still carries none.

const LIB = path.join(SPEC, 'scripts/lib/notes-layer.browser.js')
const VIEWER = path.join(SPEC, 'templates/mocks/viewer.css')

// Review finding round 2 (2026-09-13): a regex-bounded capture of the assignment's RHS
// (`[^\n;]+`) stops at the first newline, so a concatenation the source wraps onto a second line
// (`'a' +\n  'b'`) was invisible past `'a'` — this repo's own recorded gotcha class again, one
// line break deeper than round 1's one-quote-form blindness. A single regex cannot bound "the
// whole expression" without effectively parsing it (a `+`-chain can wrap arbitrarily many lines,
// carry comments between segments, and mix quote forms segment to segment), so this is a small
// hand-rolled scanner rather than a wider regex: from each `hostStyle.textContent =`/`+=` site it
// walks forward, skipping whitespace and comments (`//...` and `/*...*/`) and admitting every
// quote form (`'`, `"`, `` ` ``) with backslash-escape awareness, concatenating literal contents,
// and continuing across a `+` (through any whitespace/comments/newlines around it) until the next
// non-whitespace, non-comment token is not `+` — i.e. the expression has ended. Every assignment
// site in the source is scanned this way and concatenated in source order.
//
// What this still cannot see (say so plainly rather than overclaiming): a literal built through
// indirection — `var s = '...'; hostStyle.textContent = s` — carries no quote at the assignment
// site itself and is invisible to a lexical scanner that never evaluates the program; a
// non-`+`-chain expression (a ternary, a function call, a template literal's own `${...}`
// interpolation) ends the scan at the first non-literal, non-`+` token, so any literal AFTER such
// a construct in the same expression is missed too — none of these shapes appear in this file
// today, and any of them appearing would itself be worth a human's attention, not a wider parser.
function extractConcatenatedLiterals(src, propName) {
  const siteRe = new RegExp(propName.replace(/\./g, '\\.') + '\\s*\\+?=\\s*', 'g')
  const combined = []
  let site
  while ((site = siteRe.exec(src))) {
    let i = site.index + site[0].length
    let expectingLiteral = true
    while (i < src.length) {
      // Skip whitespace and comments between tokens.
      let skipped = true
      while (skipped) {
        skipped = false
        while (i < src.length && /\s/.test(src[i])) { i++; skipped = true }
        if (src.startsWith('//', i)) { const nl = src.indexOf('\n', i); i = nl === -1 ? src.length : nl; skipped = true }
        if (src.startsWith('/*', i)) { const close = src.indexOf('*/', i + 2); i = close === -1 ? src.length : close + 2; skipped = true }
      }
      if (i >= src.length) break
      const ch = src[i]
      if (expectingLiteral && (ch === "'" || ch === '"' || ch === '`')) {
        let j = i + 1
        let lit = ''
        while (j < src.length && src[j] !== ch) {
          if (src[j] === '\\') { lit += src[j] + (src[j + 1] || ''); j += 2 } else { lit += src[j]; j++ }
        }
        combined.push(lit)
        i = j + 1
        expectingLiteral = false
      } else if (!expectingLiteral && ch === '+') {
        i++
        expectingLiteral = true
      } else {
        break // expression ended (a non-`+` after a literal, or a non-literal where one was expected)
      }
    }
    siteRe.lastIndex = i
  }
  return combined.join('')
}

// AC-20260913-02-14 (specs/20260913/02-the-layer-owns-one-mode-and-the-page-owns-the-card.md, a
// SHALL CONTINUE TO, reuses this case verbatim): that spec's mode/pointer-capture/reconcile
// rewrite touches the overlay's own in-shadow chrome, never the viewer.css link discipline or the
// one document-level `.nl-host` style below, so this same static case is this AC's own coverage
// too — sanctioned green pre- and post-change.
test('notes layer: viewer.css is linked only inside shadow roots, tokens resolve on :host, and the sole document-level rule is .nl-host-scoped, AC-20260913-02-14', () => {
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
  // Review finding, round 1 (2026-09-13): reading only the FIRST single-quoted `hostStyle.
  // textContent = '...'` literal was evadable by a second concatenated literal (any quote form).
  // Round 2 (2026-09-13): the round-1 fix's own assignment-site capture stopped at the first
  // newline, so a concatenation the source wraps onto a second line was equally invisible.
  // `extractConcatenatedLiterals` (above) fixes both: it never bounds the expression by a regex
  // at all, walking token-by-token across whatever whitespace, comments, and quote forms the
  // source actually uses until the `+`-chain ends.
  const combinedRule = extractConcatenatedLiterals(src, 'hostStyle.textContent')
  assert.ok(combinedRule.length > 0, 'hostStyle\'s assignment(s) must carry at least one string literal to extract')
  for (const sel of combinedRule.split('}').filter(Boolean).map((r) => r.split('{')[0].trim())) {
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

test('notes layer (executed, headless Chrome): a served dark mock computes identical body/box styles with and without the layer', { timeout: 45000 }, async (t) => {
  const chrome = findChrome()
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — the static pin above still runs')
  const dir = tmpdir('notes-isolation')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/m.html'), MOCK)
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const base = 'http://127.0.0.1:' + port + '/mocks/m.html'
    await withChrome(chrome, async ({ navigate, evalJs }) => {
      // evalAt(url) = navigate, wait for load plus withChrome's own settle tick, evaluate PROBE.
      const evalAt = async (url) => { await navigate(url); return evalJs(PROBE) }
      const clean = await evalAt(base + '?clean')
      const injected = await evalAt(base)
      assert.strictEqual(clean.hosts, 0, '?clean must carry no layer at all: ' + JSON.stringify(clean))
      assert.strictEqual(clean.bodyBg, 'rgb(17, 17, 17)', 'the probe mock itself must render dark, else the pin proves nothing: ' + JSON.stringify(clean))
      assert.strictEqual(injected.hosts, 3,
        'AC-20260912-11-12: the served page must carry exactly three .nl-host elements (bar host + strip host + the D4 overlay host): ' + JSON.stringify(injected))
      assert.strictEqual(injected.headLinks, clean.headLinks, 'the layer must add no <link> to the served document\'s <head>: ' + JSON.stringify(injected))
      assert.deepStrictEqual(
        { bodyBg: injected.bodyBg, bodyColor: injected.bodyColor, boxSizing: injected.boxSizing, boxWidth: injected.boxWidth },
        { bodyBg: clean.bodyBg, bodyColor: clean.bodyColor, boxSizing: clean.boxSizing, boxWidth: clean.boxWidth },
        'the layer must not change the mock\'s computed body colours or box model — with layer: ' + JSON.stringify(injected) + ' clean: ' + JSON.stringify(clean))
    })
  } finally {
    await stop()
  }
})
