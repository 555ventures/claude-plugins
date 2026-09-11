'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, tmpdir, runNode } = require('../helpers')

// specs/20260824/04-render-rules.md D1-D3 (Contracts, A1): render-rules.js is the script that
// executes a design-rules.json manifest's `renderCheck` entries over one or more
// render-inventory documents against a resolved `tokens.css` palette — the reader that replaces
// the Sonnet rule-checklist walk. Every test here execs the real entry via runNode against
// synthetic fixtures in a tmpdir (never a stand-in reimplementing the four `renderCheck`
// kinds). Contrast arithmetic is A1's pinned pair
// (rgb(119,119,119) vs white = 4.48:1, rgb(118,118,118) vs white = 4.54:1). AC-20260824-04-1 …
// AC-20260824-04-7.

const SCRIPT = 'scripts/render-rules.js'

function rulesManifest(rules) {
  return { schemaVersion: 1, archetype: 'web-app', designCatalog: 'storybook', rules }
}

function inventoryDoc(entries, page, narrow) {
  const doc = { schemaVersion: 1, theme: 'light', state: null, root: 'body', entries }
  if (page !== undefined) doc.page = page
  if (narrow !== undefined) doc.narrow = narrow
  return doc
}

// Defaults mirror render-inventory.browser.js's real entry shape (D4 adds effectiveBackground
// and fontWeight) so a fixture only needs to override the fields its own renderCheck reads.
function mkEntry(overrides = {}) {
  return {
    i: 0, role: 'text', text: '', name: null, tag: 'div',
    box: { x: 0, y: 0, w: 100, h: 20 }, srOnly: false,
    fixed: false, outOfFlow: false, dataPositioned: false,
    color: null, background: null, effectiveBackground: null,
    fontSize: null, fontWeight: null, lineHeight: null,
    ...overrides,
  }
}

// Writes one manifest + N inventories + one tokens.css into a fresh tmpdir and execs the real
// render-rules.js against them. Each `inventories` entry is either a plain entries array (page
// omitted, the pre-D4 shape every AC-20260824-04 test uses) or { entries, page } (specs/20260831/02
// D4 — the AC-20260831-02-2..6 no-overflow/line-length tests need to control page.scrollWidth/
// clientWidth directly).
function runRules({ rules, inventories, tokensCss, extraArgs = [] }) {
  const dir = tmpdir('rr')
  const rulesPath = path.join(dir, 'design-rules.json')
  fs.writeFileSync(rulesPath, JSON.stringify(rulesManifest(rules)))
  const invArgs = []
  inventories.forEach((invSpec, i) => {
    const entries = Array.isArray(invSpec) ? invSpec : invSpec.entries
    const page = Array.isArray(invSpec) ? undefined : invSpec.page
    const narrow = Array.isArray(invSpec) ? undefined : invSpec.narrow
    const p = path.join(dir, 'inv' + i + '.json')
    fs.writeFileSync(p, JSON.stringify(inventoryDoc(entries, page, narrow)))
    invArgs.push('--inventory', p)
  })
  const tokensPath = path.join(dir, 'tokens.css')
  fs.writeFileSync(tokensPath, tokensCss)
  return runNode(SCRIPT, ['--rules', rulesPath, ...invArgs, '--tokens', tokensPath, ...extraArgs])
}

// specs/20260831/02-viewport-adaptation-rules.md D1-D3/D5/D6/D8: render-rules.js gains two
// renderCheck kinds no manifest could express before — `no-overflow` (a union of the page-level
// scrollWidth/clientWidth comparison and a per-entry box-edge comparison, D2) and `line-length`
// (a viewport-gated estimated-character-width check, D6) — closing the gap where no
// `renderCheck` kind related any measurement to the declared viewport. `no-overflow` findings
// sit at severity "error" (blocking, D1's manifest example); `line-length` ships severity "warn"
// in the template (D6: signal at zero blocking risk). AC-20260831-02-2 … AC-20260831-02-6,
// AC-20260831-02-8.

// specs/20260905/05-desktop-fill-render-rule.md D2-D7 (Contracts, A1/A2): render-rules.js
// gains a third viewport-gated renderCheck kind, `desktop-fill`, measuring the horizontal span
// of a document's in-flow entries against page.clientWidth — never the labeled root's own box,
// which A1's spike found is body-wide on the spec's measured case and would pass the exact
// phone-column-at-desktop escape this spec exists to close. AC-20260905-05-1 …
// AC-20260905-05-6.

// The manifest row every AC-20260905-05-1/2/3/4/6 fixture below runs against — hoisted so the
// calibrated threshold/gate pair is written once, not re-typed (and re-risked) five times.
const DESKTOP_FILL_RULE = { id: 'desktop-fill', targetCategory: 'layout', severity: 'error', renderCheck: { kind: 'desktop-fill', minFraction: 0.5, minViewport: 1024 } }

// Owner: pass-1 review finding of specs/20260905/05-desktop-fill-render-rule.md — a
// thresholdless row measured nothing and passed.
test('a thresholdless desktop-fill row is refused at validation, never silently green', () => {
  const entries = [
    mkEntry({ text: 'Client shell body', box: { x: 522, y: 0, w: 396, h: 20 } }),
    mkEntry({ text: 'Client shell footer', box: { x: 522, y: 100, w: 200, h: 20 } }),
  ]
  const r = runRules({
    rules: [{ id: 'desktop-fill', targetCategory: 'layout', severity: 'error', renderCheck: { kind: 'desktop-fill' } }],
    inventories: [{ entries, page: { scrollWidth: 1440, clientWidth: 1440 }, narrow: false }],
    tokensCss: ':root {}\n',
  })
  assert.strictEqual(r.status, 2,
    'a desktop-fill row with no thresholds declared is a malformed manifest, not a run to score — a rule with an unusable measurand must be refused at validation, never silently scored against the AC-1 28%-fill inventory: got status ' + r.status + ' stdout: ' + r.stdout + ' stderr: ' + r.stderr)
  assert.match(r.stderr, /desktop-fill/,
    'the exit-2 refusal must name the offending rule\'s id ("desktop-fill"), or a manifest author fixing a missing threshold has no discoverable pointer to which rule is broken: ' + r.stderr)
  assert.match(r.stderr, /minFraction/,
    'the exit-2 refusal must name the missing field ("minFraction"), or a manifest author sees a bare rule-id and still cannot tell which threshold to add: ' + r.stderr)
})

