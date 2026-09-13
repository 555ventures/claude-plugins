'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const { findChrome, serve, withChrome } = require('./chrome-harness')

// specs/20260912/06-the-review-page-answers-to-a-design.md D9/D9a, AC-20260912-06-9 and
// AC-20260912-06-12, both [env: CHROME_BIN]. AC-9 is the pair of measurements the pre-image
// contradicts (badge `color`, `.rv-strip` `border-radius`); AC-12 is the pair that already held
// and is pinned `SHALL CONTINUE TO` so this file survives expiry at close (D6). Both are
// measured in one navigation because they read the same two elements' computed styles:
// five bare `.rv-*` utility classes (`.rv-badge`, `.rv-addnote`, `.rv-fold`, `.rv-keyhint`,
// `.rv-strip`) sit at CSS specificity (0,1,0) on a <button> that `.rv button` (0,1,1) also
// matches, so the generic rule wins every shared property (background, colour, padding, border,
// border-radius) whatever the source order — measured, not read off the selector text, because a
// selector-text assertion cannot see which of two competing rules a real cascade honours. Only
// two of the five (.rv-badge and .rv-strip) are pinned here — the other three (.rv-addnote,
// .rv-fold, .rv-keyhint) are the same defect on the same fix (the `.rv ` ancestor prefix) and are
// left to the file's own eyes-on look per A6/the spec's Rationale, so this pin stays a fast,
// narrow correctness check rather than a fifth CSS-property inventory.

function buildFixture() {
  const dir = tmpdir('review-chrome')
  const mk = (rel, content) => {
    const p = path.join(dir, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, content)
  }
  mk('design/mocks/seed.md',
    '# Seed — Fixture\n\n## Product\nA synthetic product for the review-chrome test.\nBuilt for QA.\nIt must let a user complete a short flow.\n\n' +
    '## Facts\n- primary-surface: P1\n\n## References\n- none\n\n## Journeys\n### j1\nA short flow.\n```surfaces\na\na -> b\n```\n')
  mk('design/mocks/a.html', '<main data-screen-label="a" data-status="sketch">a</main>\n')
  mk('design/mocks/b.html', '<main data-screen-label="b" data-status="sketch">b</main>\n')
  mk('design/mocks/notes.json', JSON.stringify([
    { id: 'N1', kind: 'note', scope: 'mock', screen: 'a', state: null, status: 'open', reason: 'other', text: 'open on a' },
  ], null, 2) + '\n')
  return dir
}

// Reads computed rgb() strings only, never a raw --v-* custom-property string, so every
// comparison below is rgb-to-rgb — a hex token vs. a computed rgb() value would differ in FORMAT
// alone and make the comparison vacuous regardless of which rule actually won the cascade.
const PROBE = '(function () {' +
  'var bodyCs = getComputedStyle(document.body);' +
  // A throwaway element carrying `color: var(--v-warn)` resolves the page's --v-warn ROLE to a
  // real computed rgb() — the AC's own "equal to --v-warn" wording, read the honest way.
  'var probe = document.createElement("span");' +
  'probe.style.color = "var(--v-warn)";' +
  'document.body.appendChild(probe);' +
  'var warnColor = getComputedStyle(probe).color;' +
  'document.body.removeChild(probe);' +
  'var badge = document.querySelector(\'[data-rv="badge"][data-label="a"]\');' +
  'var badgeCs = badge ? getComputedStyle(badge) : null;' +
  'var strip = document.querySelector(\'[data-rv="strip"]\');' +
  'strip.hidden = false;' +
  'var stripCs = getComputedStyle(strip);' +
  'return {' +
  'plainBg: bodyCs.backgroundColor, warnColor: warnColor,' +
  'badgeColor: badgeCs ? badgeCs.color : null,' +
  'badgeBg: badgeCs ? badgeCs.backgroundColor : null,' +
  'stripRadius: stripCs.borderRadius, stripBorderLeftWidth: stripCs.borderLeftWidth' +
  '}' +
  '})()'

test('AC-20260912-06-9, AC-20260912-06-12: a non-zero screen badge renders in the --v-warn tint (not plain button styling), and .rv-strip keeps its own border treatment', { timeout: 45000 }, async (t) => {
  const chrome = findChrome()
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — this pin only runs against a real cascade')
  const dir = buildFixture()
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const url = 'http://127.0.0.1:' + port + '/review/j1.html'
    const result = await withChrome(chrome, async ({ navigate, evalJs }) => {
      await navigate(url)
      return evalJs(PROBE)
    })
    assert.ok(result.badgeColor, 'screen a must render a badge with a non-zero open count to inspect: got ' + JSON.stringify(result))
    // AC-20260912-06-9: the badge's computed color equals the page's --v-warn role, and
    // .rv-strip's computed border-radius is 0px. On the unfixed pre-image `.rv button` (0,1,1)
    // beats `.rv-badge` (0,1,0) and the badge renders the page's plain --v-fg instead — D9's
    // `.rv ` ancestor prefix is what makes .rv-badge win back. The two AC-20260912-06-12
    // assertions interleaved below (badge background, .rv-strip left border) already hold today.
    assert.strictEqual(result.badgeColor, result.warnColor,
      'a non-zero badge\'s computed color must equal the page\'s --v-warn role: got ' + JSON.stringify(result))
    assert.notStrictEqual(result.badgeBg, result.plainBg,
      'a non-zero badge\'s computed background-color must not be the page\'s plain --v-bg: got the same value for both, ' + JSON.stringify(result))
    assert.strictEqual(result.stripRadius, '0px',
      '.rv-strip must render with a computed border-radius of 0px (its own edge-to-edge treatment): got ' + result.stripRadius)
    assert.strictEqual(result.stripBorderLeftWidth, '1px',
      '.rv-strip must render a 1px left border, not the .rv button rule\'s own border treatment: got ' + result.stripBorderLeftWidth)
  } finally {
    await stop()
  }
})
