'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, tmpdir, runNode } = require('../helpers')

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

function inventoryDoc(entries, page) {
  const doc = { schemaVersion: 1, theme: 'light', state: null, root: 'body', entries }
  if (page !== undefined) doc.page = page
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
    const p = path.join(dir, 'inv' + i + '.json')
    fs.writeFileSync(p, JSON.stringify(inventoryDoc(entries, page)))
    invArgs.push('--inventory', p)
  })
  const tokensPath = path.join(dir, 'tokens.css')
  fs.writeFileSync(tokensPath, tokensCss)
  return runNode(SCRIPT, ['--rules', rulesPath, ...invArgs, '--tokens', tokensPath, ...extraArgs])
}

test('AC-20260824-04-1/AC-20260831-02-7: a manifest rule carrying renderCheck.kind "sparkle" makes render-rules.js exit 2 naming that rule\'s id and the closed target-size/cta-count/contrast/palette/no-overflow/line-length kind set', () => {
  const r = runRules({
    rules: [{ id: 'weird-rule', targetCategory: 'layout', renderCheck: { kind: 'sparkle' } }],
    inventories: [[mkEntry({ text: 'x' })]],
    tokensCss: ':root { --accent: #2255cc; }\n',
  })
  assert.strictEqual(r.status, 2,
    'D1: an unknown renderCheck.kind is a manifest error, not a findings run — the exit alphabet must distinguish "the manifest is malformed" from "the render has findings": got ' + r.status + ' stderr: ' + r.stderr + ' stdout: ' + r.stdout)
  assert.match(r.stderr, /weird-rule/,
    'the exit-2 remedy must name the offending rule\'s id, or a manifest author cannot find which rule to fix: ' + r.stderr)
  // specs/20260831/02 D1 amends this closed set's MEMBER LIST (adding no-overflow/line-length),
  // never its refusal contract — the printed set must still name all six kinds, or a manifest
  // author fixing a typo'd kind after this spec lands sees a stale, incomplete remedy.
  for (const kind of ['target-size', 'cta-count', 'contrast', 'palette', 'no-overflow', 'line-length']) {
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

// specs/20260831/02-viewport-adaptation-rules.md (2026-08-31, D1-D3, D5, D6, D8): render-rules.js
// gains two renderCheck kinds no manifest could express before — `no-overflow` (a union of the
// page-level scrollWidth/clientWidth comparison and a per-entry box-edge comparison, D2) and
// `line-length` (a viewport-gated estimated-character-width check, D6) — closing the measured
// gap where no `renderCheck` kind related any measurement to the declared viewport (prax, spec
// 20260823/11: a phone-only mock ratified clean, its non-adaptation later misattributed to
// components). `no-overflow` findings sit at severity "error" (blocking, D1's manifest example);
// `line-length` ships severity "warn" in the template (D6, JJ ruling this session: signal at
// zero blocking risk). AC-20260831-02-2 … AC-20260831-02-6, AC-20260831-02-8.

test('AC-20260831-02-2: a no-overflow rule over an inventory with page: { scrollWidth: 900, clientWidth: 390 } exits 1 and prints "rule no-mock-overflow no-overflow page scrolls horizontally: scrollWidth 900 > 390"', () => {
  const r = runRules({
    rules: [{ id: 'no-mock-overflow', targetCategory: 'layout', severity: 'error', renderCheck: { kind: 'no-overflow' } }],
    inventories: [{ entries: [mkEntry({ text: 'Fine' })], page: { scrollWidth: 900, clientWidth: 390 } }],
    tokensCss: ':root {}\n',
  })
  assert.match(r.stdout, /rule no-mock-overflow no-overflow page scrolls horizontally: scrollWidth 900 > 390/,
    'D2: page.scrollWidth 900 > page.clientWidth 390 + 1 must print this exact finding line naming both numbers — a session scanning output for the phone-only-mock escape needs the literal contract line: ' + r.stdout + ' stderr: ' + r.stderr)
  assert.strictEqual(r.status, 1,
    'a no-overflow page-leg finding must fail the run, or a mock that only works at one viewport still ratifies clean — the exact prax escape this spec exists to close: ' + r.stderr)
})

test('AC-20260831-02-3: a no-overflow rule over an inventory whose page.scrollWidth equals clientWidth (the overflow-x:hidden masking case) still fires when an in-flow entry\'s box right edge exceeds clientWidth, naming that entry\'s label and both edges', () => {
  const r = runRules({
    rules: [{ id: 'no-mock-overflow', targetCategory: 'layout', severity: 'error', renderCheck: { kind: 'no-overflow' } }],
    inventories: [{
      entries: [mkEntry({ text: 'Wide row', box: { x: 0, y: 0, w: 900, h: 20 } })],
      page: { scrollWidth: 390, clientWidth: 390 },
    }],
    tokensCss: ':root {}\n',
  })
  assert.match(r.stdout, /rule no-mock-overflow no-overflow "Wide row" right edge 900 > 390/,
    'D2/A1: overflow-x:hidden masks scrollWidth entirely (390 = 390 here, no page-leg finding) but getBoundingClientRect still reports the true edge — the entry leg must still fire, naming the entry and both edges, or a single CSS line evades the whole check: ' + r.stdout + ' stderr: ' + r.stderr)
  assert.strictEqual(r.status, 1, 'a no-overflow entry-leg finding must fail the run: ' + r.stderr)
})

test('AC-20260831-02-4: a no-overflow rule emits no finding and exits 0 when every entry whose box would exceed clientWidth carries fixed, outOfFlow, dataPositioned, or srOnly, with page.scrollWidth within 1px of clientWidth', () => {
  const entries = [
    mkEntry({ text: 'Fixed banner', box: { x: 0, y: 0, w: 900, h: 20 }, fixed: true }),
    mkEntry({ text: 'Absolute chip', box: { x: 0, y: 0, w: 900, h: 20 }, outOfFlow: true }),
    mkEntry({ text: 'Chart decoration', box: { x: 0, y: 0, w: 900, h: 20 }, dataPositioned: true }),
    mkEntry({ text: 'Off-canvas nav', box: { x: 0, y: 0, w: 900, h: 20 }, srOnly: true }),
  ]
  const r = runRules({
    rules: [{ id: 'no-mock-overflow', targetCategory: 'layout', severity: 'error', renderCheck: { kind: 'no-overflow' } }],
    inventories: [{ entries, page: { scrollWidth: 390, clientWidth: 390 } }],
    tokensCss: ':root {}\n',
  })
  assert.ok(!/no-overflow/.test(r.stdout),
    'D3: every entry here has box.x + box.w (900) far past clientWidth (390) and WOULD fire absent its exemption flag — the entry leg must exempt fixed/outOfFlow/dataPositioned/srOnly entries exactly as render-compare\'s own geometry exemptions do, or a clipped positioned decoration blocks ratification for content that is only the author\'s own assertion: ' + r.stdout + ' stderr: ' + r.stderr)
  assert.strictEqual(r.status, 0,
    'with the page leg clean (390 within 1px of 390) and every offending entry exempt, the run must exit 0: ' + r.stderr)
})

test('AC-20260831-02-5: a no-overflow rule over an inventory document with no page block exits 1 with a finding naming re-capture with the current render-inventory.browser.js, never a silent pass', () => {
  const r = runRules({
    rules: [{ id: 'no-mock-overflow', targetCategory: 'layout', severity: 'error', renderCheck: { kind: 'no-overflow' } }],
    inventories: [[mkEntry({ text: 'Fine' })]],
    tokensCss: ':root {}\n',
  })
  assert.match(r.stdout, /rule no-mock-overflow no-overflow inventory has no page geometry \(theme light state null\) — re-capture with the current render-inventory\.browser\.js/,
    'D5: an inventory document with no usable page block must fail closed and name the remedy — a stale pre-D4 inventory silently passing is exactly the laundering this spec exists to close: ' + r.stdout + ' stderr: ' + r.stderr)
  assert.strictEqual(r.status, 1,
    'D5: fail-closed means this must exit 1, never 0, on a document with no page geometry: ' + r.stderr)
})

test('AC-20260831-02-6: a line-length rule (maxCh 90, minViewport 768) over page.clientWidth 1200 flags a >90-char entry at box.w 1200 fontSize 16px ("~150ch > 90ch at 1200px", warn-prefixed, exit 0 alone) but not a 28-char entry in the same box, and emits no finding at all when page.clientWidth is 390 (< minViewport)', () => {
  const longText = 'A'.repeat(100)
  const shortText = 'Short heading in a wide hero'
  assert.strictEqual(shortText.length, 28,
    'fixture setup sanity: the short-text control entry must be exactly 28 characters, matching the spec\'s own Contracts literal example')

  const rules = [{ id: 'line-length', targetCategory: 'typography', severity: 'warn', grounding: 'taste', renderCheck: { kind: 'line-length', maxCh: 90, minViewport: 768 } }]

  const rWide = runRules({
    rules,
    inventories: [{
      entries: [
        mkEntry({ text: longText, box: { x: 0, y: 0, w: 1200, h: 20 }, fontSize: '16px' }),
        mkEntry({ text: shortText, box: { x: 0, y: 0, w: 1200, h: 20 }, fontSize: '16px' }),
      ],
      page: { scrollWidth: 1200, clientWidth: 1200 },
    }],
    tokensCss: ':root {}\n',
  })
  assert.match(rWide.stdout, new RegExp('⚠️ rule line-length line-length "' + 'A'.repeat(40) + '…" ~150ch > 90ch at 1200px'),
    'D6: box.w 1200 / (0.5 × fontSize 16) = 150 estimated ch, over maxCh 90, with the entry\'s own text longer than 90 characters — both conditions true, so the finding must print at warn severity with the first-40-chars-plus-ellipsis label: ' + rWide.stdout + ' stderr: ' + rWide.stderr)
  assert.strictEqual(rWide.status, 0,
    'D6: line-length ships severity "warn" in the template — a run whose only finding is this one must still exit 0, or a taste-grounded signal blocks ratification the same as an a11y floor: ' + rWide.stderr)
  const lineLengthHits = (rWide.stdout.match(/line-length "/g) || []).length
  assert.strictEqual(lineLengthHits, 1,
    'D6: the 28-character control entry shares the same box/fontSize (same ~150ch estimate) but its own text is under maxCh — the double condition (estimated ch AND text.length > maxCh) must suppress this entry, so exactly one line-length finding (the long entry\'s) must print, or every short label in a wide box becomes a false positive: ' + rWide.stdout)

  const rNarrow = runRules({
    rules,
    inventories: [{
      entries: [mkEntry({ text: longText, box: { x: 0, y: 0, w: 1200, h: 20 }, fontSize: '16px' })],
      page: { scrollWidth: 390, clientWidth: 390 },
    }],
    tokensCss: ':root {}\n',
  })
  assert.ok(!/line-length/.test(rNarrow.stdout),
    'D6: page.clientWidth 390 is under minViewport 768 — this is a declared gate, not missing data, so the document must be skipped SILENTLY (no finding of any kind, not even an advisory line) even though the same entry would fire at a wider viewport: ' + rNarrow.stdout + ' stderr: ' + rNarrow.stderr)
  assert.strictEqual(rNarrow.status, 0, 'a minViewport-skipped document must exit 0: ' + rNarrow.stderr)
})

test('AC-20260831-02-8: render-rules.js run with the shipped spec/templates/design-rules.json as --rules over an empty inventory exits 0 — the template\'s new no-overflow/line-length rows are valid under the extended closed set', () => {
  const dir = tmpdir('rr-shipped')
  const rulesPath = path.join(ROOT, 'spec', 'templates', 'design-rules.json')
  const invPath = path.join(dir, 'inv0.json')
  fs.writeFileSync(invPath, JSON.stringify({
    schemaVersion: 1, theme: 'light', state: null, root: 'body',
    page: { scrollWidth: 800, clientWidth: 800 }, entries: [],
  }))
  const tokensPath = path.join(dir, 'tokens.css')
  fs.writeFileSync(tokensPath, ':root { --accent: #2255cc; }\n')
  const r = runNode(SCRIPT, ['--rules', rulesPath, '--inventory', invPath, '--tokens', tokensPath])
  assert.strictEqual(r.status, 0,
    'D1/D8: the shipped manifest\'s new no-overflow and line-length rows must be valid under the closed renderCheck.kind set, and an empty inventory with a non-overflowing page block must produce zero findings from either — a non-zero exit here means the template itself fails its own closed-set contract: ' + r.stderr + ' stdout: ' + r.stdout)
})
