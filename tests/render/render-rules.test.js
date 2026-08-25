'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260824/04-render-rules.md (2026-08-24, D1-D3, Contracts, A1): render-rules.js is the
// script that executes a design-rules.json manifest's `renderCheck` entries over one or more
// render-inventory documents against a resolved `tokens.css` palette — the reader that replaces
// the Sonnet rule-checklist walk. spec/scripts/render-rules.js does not exist yet (this is the
// File Plan's CREATE row); every test here execs the real entry via runNode against synthetic
// fixtures in a tmpdir (never a stand-in reimplementing the four `renderCheck` kinds), so the
// whole file is RED until the script lands. Contrast arithmetic is A1's pinned pair
// (rgb(119,119,119) vs white = 4.48:1, rgb(118,118,118) vs white = 4.54:1). AC-20260824-04-1 …
// AC-20260824-04-7.

const SCRIPT = 'scripts/render-rules.js'

function rulesManifest(rules) {
  return { schemaVersion: 1, archetype: 'web-app', designCatalog: 'storybook', rules }
}

function inventoryDoc(entries) {
  return { schemaVersion: 1, theme: 'light', state: null, root: 'body', entries }
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
// render-rules.js against them.
function runRules({ rules, inventories, tokensCss, extraArgs = [] }) {
  const dir = tmpdir('rr')
  const rulesPath = path.join(dir, 'design-rules.json')
  fs.writeFileSync(rulesPath, JSON.stringify(rulesManifest(rules)))
  const invArgs = []
  inventories.forEach((entries, i) => {
    const p = path.join(dir, 'inv' + i + '.json')
    fs.writeFileSync(p, JSON.stringify(inventoryDoc(entries)))
    invArgs.push('--inventory', p)
  })
  const tokensPath = path.join(dir, 'tokens.css')
  fs.writeFileSync(tokensPath, tokensCss)
  return runNode(SCRIPT, ['--rules', rulesPath, ...invArgs, '--tokens', tokensPath, ...extraArgs])
}

test('AC-20260824-04-1: a manifest rule carrying renderCheck.kind "sparkle" makes render-rules.js exit 2 naming that rule\'s id and the closed target-size/cta-count/contrast/palette kind set', () => {
  const r = runRules({
    rules: [{ id: 'weird-rule', targetCategory: 'layout', renderCheck: { kind: 'sparkle' } }],
    inventories: [[mkEntry({ text: 'x' })]],
    tokensCss: ':root { --accent: #2255cc; }\n',
  })
  assert.strictEqual(r.status, 2,
    'D1: an unknown renderCheck.kind is a manifest error, not a findings run — the exit alphabet must distinguish "the manifest is malformed" from "the render has findings": got ' + r.status + ' stderr: ' + r.stderr + ' stdout: ' + r.stdout)
  assert.match(r.stderr, /weird-rule/,
    'the exit-2 remedy must name the offending rule\'s id, or a manifest author cannot find which rule to fix: ' + r.stderr)
  for (const kind of ['target-size', 'cta-count', 'contrast', 'palette']) {
    assert.match(r.stderr, new RegExp(kind),
      'D1: the exit-2 remedy must name the closed kind set (' + kind + ' missing) — otherwise "nothing is half-checked" has no discoverable fix: ' + r.stderr)
  }
})

test('AC-20260824-04-2: a target-size{min:44} rule prints "rule <id> target-size \\"Tiny\\" 40.7×20px < 44px" and exits 1 for a 40.7x20 button, while a 44x44 button and a 1x1 srOnly link produce no finding', () => {
  const entries = [
    mkEntry({ role: 'button', text: 'Tiny', box: { x: 0, y: 0, w: 40.7, h: 20 }, srOnly: false }),
    mkEntry({ role: 'button', text: 'OK', box: { x: 0, y: 0, w: 44, h: 44 }, srOnly: false }),
    mkEntry({ role: 'link', text: 'Skip', box: { x: 0, y: 0, w: 1, h: 1 }, srOnly: true }),
  ]
  const r = runRules({
    rules: [{ id: 'min-target-size', targetCategory: 'density', renderCheck: { kind: 'target-size', min: 44 } }],
    inventories: [entries],
    tokensCss: ':root {}\n',
  })
  assert.match(r.stdout, /rule min-target-size target-size "Tiny" 40\.7×20px < 44px/,
    'D2: an interactive entry under the declared min must print this exact finding line — a session scanning output for a discoverable fix needs the rule id, kind, label, measured box, and threshold verbatim: ' + r.stdout + ' stderr: ' + r.stderr)
  assert.strictEqual(r.status, 1, 'a target-size finding must fail the run: ' + r.stderr)
  assert.ok(!/target-size "OK"/.test(r.stdout),
    'D2: a 44x44 button meets the min exactly and must produce no finding: ' + r.stdout)
  assert.ok(!/target-size "Skip"/.test(r.stdout),
    'D2: a 1x1 entry flagged srOnly must be exempt from target-size regardless of box size, or every visually-hidden control becomes an unfixable false positive: ' + r.stdout)
})

test('AC-20260824-04-3: a cta-count{max:1, tokens:["--accent"]} rule prints "cta-count 2 > 1" naming both button texts and exits 1 when two buttons resolve to the token background; one such button passes', () => {
  const tokensCss = ':root { --accent: #2255cc; }\n'
  const twoButtons = [
    mkEntry({ role: 'button', text: 'Primary action', background: 'rgb(34, 85, 204)' }),
    mkEntry({ role: 'button', text: 'Save', background: 'rgb(34, 85, 204)' }),
  ]
  const rules = [{ id: 'one-primary-cta', targetCategory: 'layout', renderCheck: { kind: 'cta-count', max: 1, tokens: ['--accent'] } }]

  const r2 = runRules({ rules, inventories: [twoButtons], tokensCss })
  assert.match(r2.stdout, /cta-count 2 > 1/,
    'D2: two buttons whose background resolves to a listed CTA token, over max:1, must print this exact finding: ' + r2.stdout + ' stderr: ' + r2.stderr)
  assert.match(r2.stdout, /Primary action/, 'the finding must name every over-count button, including "Primary action": ' + r2.stdout)
  assert.match(r2.stdout, /Save/, 'the finding must name every over-count button, including "Save": ' + r2.stdout)
  assert.strictEqual(r2.status, 1, 'a cta-count finding must fail the run: ' + r2.stderr)

  const oneButton = [mkEntry({ role: 'button', text: 'Primary action', background: 'rgb(34, 85, 204)' })]
  const r1 = runRules({ rules, inventories: [oneButton], tokensCss })
  assert.ok(!/cta-count/.test(r1.stdout),
    'D2: exactly one CTA-token button is at the max, not over it — it must produce no cta-count finding: ' + r1.stdout + ' stderr: ' + r1.stderr)
})

test('AC-20260824-04-4: a contrast{min:4.5, minLarge:3} rule prints "contrast \\"Muted note\\" 4.48 < 4.5" and exits 1 for rgb(119,119,119) on white, while rgb(118,118,118) on white (4.54) passes and a 24px entry at ~3.2 passes under minLarge', () => {
  const entries = [
    mkEntry({ role: 'text', text: 'Muted note', color: 'rgb(119, 119, 119)', effectiveBackground: 'rgb(255, 255, 255)' }),
    mkEntry({ role: 'text', text: 'OK note', color: 'rgb(118, 118, 118)', effectiveBackground: 'rgb(255, 255, 255)' }),
    mkEntry({ role: 'text', text: 'Large muted', color: 'rgb(144, 144, 144)', effectiveBackground: 'rgb(255, 255, 255)', fontSize: '24px' }),
  ]
  const r = runRules({
    rules: [{ id: 'text-contrast-aa', targetCategory: 'a11y', renderCheck: { kind: 'contrast', min: 4.5, minLarge: 3 } }],
    inventories: [entries],
    tokensCss: ':root {}\n',
  })
  assert.match(r.stdout, /rule text-contrast-aa contrast "Muted note" 4\.48 < 4\.5/,
    'A1/D2: rgb(119,119,119) on white is the pinned 4.48:1 pair, under the 4.5 AA floor — the finding line must name the rule, kind, label, and both numbers verbatim: ' + r.stdout + ' stderr: ' + r.stderr)
  assert.strictEqual(r.status, 1, 'a contrast finding must fail the run: ' + r.stderr)
  assert.ok(!/contrast "OK note"/.test(r.stdout),
    'A1/D2: rgb(118,118,118) on white is the pinned 4.54:1 pair, over the 4.5 floor — it must produce no finding: ' + r.stdout)
  assert.ok(!/contrast "Large muted"/.test(r.stdout),
    'D2: a fontSize>=24px entry must be judged against minLarge (3), not min (4.5) — at ~3.2:1 it clears minLarge and must produce no finding, or large text pays the small-text floor: ' + r.stdout)
})

test('AC-20260824-04-5: a palette{} rule passes an entry whose color resolves to a declared token and prints "palette \\"Badge\\" color rgb(1, 2, 3) not in tokens.css" (exit 1) for a color absent from every token', () => {
  const tokensCss = ':root { --pos: #1a8f3a; --bg: #ffffff; }\n'
  const entries = [
    mkEntry({ role: 'text', text: 'Good badge', color: 'rgb(26, 143, 58)', effectiveBackground: 'rgb(255, 255, 255)' }),
    mkEntry({ role: 'text', text: 'Badge', color: 'rgb(1, 2, 3)', effectiveBackground: 'rgb(255, 255, 255)' }),
  ]
  const r = runRules({
    rules: [{ id: 'no-raw-color', targetCategory: 'color', renderCheck: { kind: 'palette' } }],
    inventories: [entries],
    tokensCss,
  })
  assert.match(r.stdout, /rule no-raw-color palette "Badge" color rgb\(1, 2, 3\) not in tokens\.css/,
    'D2/D3: a color absent from every resolved token must print this exact finding — a session grepping for "not in tokens.css" needs the literal phrase to find every offender: ' + r.stdout + ' stderr: ' + r.stderr)
  assert.strictEqual(r.status, 1, 'a palette finding must fail the run: ' + r.stderr)
  assert.ok(!/palette "Good badge"/.test(r.stdout),
    'D2/D3: rgb(26,143,58) equals --pos (#1a8f3a) resolved, and its effectiveBackground equals --bg (#ffffff) resolved — both fields match a token, so this entry must produce no finding: ' + r.stdout)
})

test('AC-20260824-04-6: a manifest with 3 rules of which 1 carries renderCheck prints "rules=3 checked=1 source-side=2"', () => {
  const r = runRules({
    rules: [
      { id: 'has-check', targetCategory: 'color', renderCheck: { kind: 'palette' } },
      { id: 'no-check-1', targetCategory: 'i18n' },
      { id: 'no-check-2', targetCategory: 'structure' },
    ],
    inventories: [[]],
    tokensCss: ':root {}\n',
  })
  assert.match(r.stdout, /rules=3 checked=1 source-side=2/,
    'D1: the summary must count every rule once, splitting checked (carries renderCheck) from source-side (does not) — a rule without a renderCheck must be reported as source-side, never silently dropped from the total: ' + r.stdout + ' stderr: ' + r.stderr)
})

test('AC-20260824-04-7: tokens.css resolves --text: var(--ink) with no "unresolvable --text" line, while an unparseable --shadow value prints "unresolvable --shadow" exactly once and leaves the exit unaffected', () => {
  const tokensCss = ':root {\n  --ink: #111;\n  --text: var(--ink);\n  --shadow: 0 1px 2px rgba(0,0,0,.2);\n}\n'
  const entries = [mkEntry({ role: 'text', text: 'Ink text', color: 'rgb(17, 17, 17)', effectiveBackground: 'rgb(17, 17, 17)' })]
  const r = runRules({
    rules: [{ id: 'no-raw-color', targetCategory: 'color', renderCheck: { kind: 'palette' } }],
    inventories: [entries],
    tokensCss,
  })
  const shadowHits = (r.stdout.match(/unresolvable --shadow/g) || []).length
  assert.strictEqual(shadowHits, 1,
    'D3: a token value outside #rgb/#rgba/#rrggbb/#rrggbbaa/rgb()/rgba()/one-level var() must be reported exactly once as "unresolvable --shadow", never zero (silently dropped) and never duplicated per use: ' + r.stdout + ' stderr: ' + r.stderr)
  assert.ok(!/unresolvable --text/.test(r.stdout),
    'D3: --text: var(--ink) is a one-level var() reference to a resolvable hex token and must resolve to rgb(17, 17, 17), not be reported unresolvable — an "unresolvable --text" line here means var() resolution regressed: ' + r.stdout)
  assert.ok(!/unresolvable --ink/.test(r.stdout), '--ink is a plain hex token and must never be reported unresolvable: ' + r.stdout)
  assert.strictEqual(r.status, 0,
    'D3: the advisory unresolvable line must never affect the exit — with the one entry passing palette (matching --ink/--text\'s resolved rgb(17, 17, 17)) and only an advisory finding present, the run must still exit 0: ' + r.stderr)
})
