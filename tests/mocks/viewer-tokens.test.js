'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC, read } = require('../helpers')

// specs/20260902/09-one-hand-wireframes-one-token-set.md D4, AC-20260902-09-4: viewer.css
// (CREATE, the full shadcn-zinc register chrome pages inline) and wire-tokens.css (MODIFY,
// the flat register a wireframe links) ship the SAME values under two role-name sets; a
// byte-equal-after-trim pin per the Contracts' D4 pair list is what stops the two files
// drifting, and wire.css is re-based onto those roles with zero literal color values.

function parseRootVars(css) {
  const m = css.match(/:root\s*\{([\s\S]*?)\}/)
  if (!m) return {}
  const out = {}
  for (const decl of m[1].split(';')) {
    const mm = decl.match(/--([a-zA-Z0-9-]+)\s*:\s*([^;]+)/)
    if (mm) out[mm[1]] = mm[2].trim()
  }
  return out
}

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

const PAIRS = [
  ['v-bg', 'bg'], ['v-fg', 'fg'], ['v-muted', 'muted'], ['v-muted-bg', 'muted-bg'],
  ['v-border', 'border'], ['v-primary', 'primary'], ['v-primary-fg', 'primary-fg'],
  ['v-ring', 'ring'], ['v-radius', 'radius'], ['v-font', 'font'],
]

test('AC-20260902-09-4: viewer.css exists and every D4 pair is byte-equal (after whitespace trim) to wire-tokens.css', () => {
  const viewerPath = path.join(SPEC, 'templates/mocks/viewer.css')
  assert.ok(fs.existsSync(viewerPath),
    'D4 creates spec/templates/mocks/viewer.css as the one full-register token file every ' +
    'chrome page (atlas, galleries, preview toolbar, sketch workbench) inlines — its absence ' +
    'means no chrome page has a --v-* register to consume and the one-token-set contract has ' +
    'no source file: ' + viewerPath)

  const viewer = parseRootVars(fs.readFileSync(viewerPath, 'utf8'))
  const wireTokens = parseRootVars(read('spec/templates/mocks/wire-tokens.css'))
  for (const [vKey, wKey] of PAIRS) {
    assert.ok(Object.prototype.hasOwnProperty.call(viewer, vKey),
      'viewer.css must declare --' + vKey + ' under :root — a D4 pair with a missing chrome ' +
      'side can never be pinned equal to its wireframe counterpart: got keys ' + JSON.stringify(Object.keys(viewer)))
    assert.ok(Object.prototype.hasOwnProperty.call(wireTokens, wKey),
      'wire-tokens.css must declare --' + wKey + ' under :root — a D4 pair with a missing ' +
      'wireframe side can never be pinned equal to its chrome counterpart: got keys ' + JSON.stringify(Object.keys(wireTokens)))
    assert.strictEqual(viewer[vKey], wireTokens[wKey],
      'D4: viewer.css\'s --' + vKey + ' (' + viewer[vKey] + ') must be byte-equal after ' +
      'whitespace trim to wire-tokens.css\'s --' + wKey + ' (' + wireTokens[wKey] + ') — a ' +
      'divergent value here is exactly the two-files-drifting failure the pin exists to catch')
  }
})

test('AC-20260902-09-4: wire.css carries no literal color and every var(--role) it references resolves in a D4-complete wire-tokens.css', () => {
  const wireTokens = parseRootVars(read('spec/templates/mocks/wire-tokens.css'))
  assert.ok(Object.prototype.hasOwnProperty.call(wireTokens, 'muted-bg'),
    'D4/D6: wire-tokens.css must declare --muted-bg — the flat register\'s gray fills (D6: ' +
    '"gray fills --muted-bg") have no role to resolve to until this key exists, which the ' +
    'pre-D4 file does not carry')

  const wireCss = read('spec/templates/mocks/wire.css')
  for (const re of [/#[0-9a-fA-F]{3,8}\b/, /rgb\(/i, /hsl\(/i, /oklch\(/i]) {
    assert.doesNotMatch(wireCss, re,
      'wire.css must contain no ' + re + ' literal — the flat register\'s whole point is that ' +
      'every color is a var(--role) resolving into wire-tokens.css, and a literal here is an ' +
      'off-token color the wireframe register was built to forbid')
  }

  const refs = [...new Set([...stripComments(wireCss).matchAll(/var\(--([a-zA-Z0-9-]+)/g)].map((m) => m[1]))]
  assert.ok(refs.length > 0,
    'wire.css must reference at least one var(--role) — a file with zero token references is ' +
    'not actually consuming the flat register at all')
  for (const ref of refs) {
    assert.ok(Object.prototype.hasOwnProperty.call(wireTokens, ref),
      'wire.css references var(--' + ref + ') but wire-tokens.css declares no --' + ref + ' — ' +
      'an undeclared role reference resolves to nothing in the browser and silently drops the ' +
      'color instead of failing loudly: wire-tokens.css keys are ' + JSON.stringify(Object.keys(wireTokens)))
  }
})
