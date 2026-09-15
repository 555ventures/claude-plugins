'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, tmpdir } = require('../helpers')

// specs/20260914/03-the-html-atlas-is-retired.md: AC-20260914-03-3 (helpers.js exports),
// AC-20260914-03-4 (D6 retired-literal sweep), AC-20260914-03-6 (File Plan DELETE rows gone,
// survivors present). This is a CREATE row — see the spec's own File Plan for the deletion list
// this file derives its pins from.

// ---------------------------------------------------------------------------
// AC-20260914-03-3
// ---------------------------------------------------------------------------

test('AC-20260914-03-3: requiring tests/helpers.js exports neither serveAtlas nor withHandler, and its source contains no "client-capture"', () => {
  const helpers = require('../helpers')
  assert.strictEqual(helpers.serveAtlas, undefined,
    'D5: tests/helpers.js must no longer export serveAtlas once every consumer under tests/mocks/, ' +
    'tests/render/, and tests/design-atlas.test.js is deleted — a surviving export is a shim for a ' +
    'harness that serves a retired HTML system')
  assert.strictEqual(helpers.withHandler, undefined,
    'D5: tests/helpers.js must no longer export withHandler for the same reason — its sole caller, ' +
    'design-atlas.js\'s createRequestHandler, no longer exists')
  const src = fs.readFileSync(path.join(ROOT, 'tests', 'helpers.js'), 'utf8')
  assert.ok(!/client-capture/.test(src),
    'D5: tests/helpers.js\'s source must contain no "client-capture" — serveAtlas\'s own doc ' +
    'comment names lib/client-capture.js today, and that comment must leave with the function: ' +
    (src.match(/.{0,40}client-capture.{0,40}/) || [''])[0])
})

// ---------------------------------------------------------------------------
// AC-20260914-03-4: the D6 retired-literal sweep.
// ---------------------------------------------------------------------------

// D6's literal roster, word-boundary matched with [\w-] on both sides (never `\b`, which treats
// `-` as a boundary and would let a bare `style` match inside `data-style=` — the tenth-gotcha
// lesson this spec's Decision explicitly invokes).
const D6_LITERALS = [
  'design-atlas', '/spec:atlas', 'render-gate', 'render-capture', 'notes-layer', 'walk.json',
  'picks.json', 'data-screen-label', 'data-status', 'mocks-kit', 'wire.css', 'viewer.css',
  'client-capture', 'design-coverage', 'components-check', 'design-ac-reconcile',
]

// Scan surface per AC-4: every file under spec/, README.md and docs/canonical/ — nothing else.
// specs/, docs/adr/, docs/roadmap/, docs/audit/, docs/spikes/ and this spec are outside that
// surface already (D6's "exempt as history" note), so no separate exclusion list is needed here.
function walkFiles(dir) {
  if (!fs.existsSync(dir)) return []
  const st = fs.statSync(dir)
  if (st.isFile()) return [dir]
  let out = []
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const s = fs.statSync(full)
    if (s.isDirectory()) out = out.concat(walkFiles(full))
    else if (s.isFile()) out.push(full)
  }
  return out
}

function corpusFiles(root) {
  const surfaces = ['spec', 'README.md', 'docs/canonical']
  let out = []
  for (const rel of surfaces) out = out.concat(walkFiles(path.join(root, rel)))
  return out
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// D6's boundary grammar: a literal match is disqualified if the character immediately before
// or after it is a member of [\w-] — so a run of word-or-hyphen characters is one token, and a
// literal can only match a whole token or a token boundary, never a fragment of a longer one.
function findLiteralOccurrences(root, literals) {
  const findings = []
  for (const file of corpusFiles(root)) {
    let src
    try { src = fs.readFileSync(file, 'utf8') } catch { continue }
    const rel = path.relative(root, file).split(path.sep).join('/')
    for (const lit of literals) {
      const re = new RegExp('(?<![\\w-])' + escapeRegex(lit) + '(?![\\w-])', 'g')
      if (re.test(src)) findings.push({ file: rel, literal: lit })
    }
  }
  return findings
}

test('AC-20260914-03-4: the D6 word-boundary sweep finds zero D6-literal occurrences under spec/, README.md and docs/canonical/ on the live repo', () => {
  const findings = findLiteralOccurrences(ROOT, D6_LITERALS)
  assert.deepStrictEqual(findings, [],
    'D6: no file under spec/, README.md or docs/canonical/ may contain any retired literal ' +
    '(design-atlas, /spec:atlas, render-gate, render-capture, notes-layer, walk.json, ' +
    'picks.json, data-screen-label, data-status, mocks-kit, wire.css, viewer.css, ' +
    'client-capture, design-coverage, components-check, design-ac-reconcile) — this repo is ' +
    'pre-deletion today, so every finding below names a file the batch must still touch: ' +
    JSON.stringify(findings))
})

test('AC-20260914-03-4: the sweep\'s own worked example — spec/commands/mocks.md containing "design-atlas.js check" — surfaces exactly one finding naming the file and the literal, on a synthetic host', () => {
  const root = tmpdir('atlas-retired-ac4-example')
  fs.mkdirSync(path.join(root, 'spec/commands'), { recursive: true })
  fs.writeFileSync(path.join(root, 'spec/commands/mocks.md'), '# Mocks\n\nRun `design-atlas.js check` before continuing.\n')
  const findings = findLiteralOccurrences(root, D6_LITERALS)
  assert.strictEqual(findings.length, 1,
    'AC-4\'s own worked example must surface exactly one finding: ' + JSON.stringify(findings))
  assert.strictEqual(findings[0].file, 'spec/commands/mocks.md')
  assert.strictEqual(findings[0].literal, 'design-atlas')
})

test('AC-20260914-03-4/D6: the boundary grammar never matches a literal fused into a longer identifier', () => {
  const root = tmpdir('atlas-retired-ac4-boundary-fused')
  fs.mkdirSync(path.join(root, 'spec/doctrine'), { recursive: true })
  fs.writeFileSync(path.join(root, 'spec/doctrine/fused.md'),
    '# Fused\n\npredesign-atlassian and mocks-kitten and wire.cssy are unrelated identifiers.\n')
  const fused = findLiteralOccurrences(root, D6_LITERALS)
  assert.deepStrictEqual(fused, [],
    'D6: a literal fused on either side into a longer [\\w-] run (predesign-ATLASSIAN, ' +
    'mocks-KITTEN, wire.cssY) must never match — that is exactly the recurrence the boundary ' +
    'rule exists to close: ' + JSON.stringify(fused))
})

test('AC-20260914-03-4/D6: the same three literals, written as their own standalone token, are still caught — the boundary rule narrows false positives, it never blinds the sweep entirely', () => {
  const root = tmpdir('atlas-retired-ac4-boundary-bare')
  fs.mkdirSync(path.join(root, 'spec/doctrine'), { recursive: true })
  fs.writeFileSync(path.join(root, 'spec/doctrine/bare.md'),
    '# Bare\n\ndesign-atlas is retired; so is mocks-kit and wire.css.\n')
  const found = findLiteralOccurrences(root, D6_LITERALS)
  const literals = found.map((f) => f.literal).sort()
  assert.deepStrictEqual(literals, ['design-atlas', 'mocks-kit', 'wire.css'],
    'the sweep must still catch a standalone occurrence of each literal: ' + JSON.stringify(found))
})

test('AC-20260914-03-4/D6: "data-status" never matches inside an unrelated hyphenated token like "approval-status"', () => {
  const root = tmpdir('atlas-retired-ac4-data-status')
  fs.mkdirSync(path.join(root, 'spec/doctrine'), { recursive: true })
  fs.writeFileSync(path.join(root, 'spec/doctrine/unrelated.md'),
    '# Unrelated\n\nthe payer\'s approval-status column is unrelated to any retired attribute.\n')
  const findings = findLiteralOccurrences(root, ['data-status'])
  assert.deepStrictEqual(findings, [],
    'D6\'s own worked example: a completely different hyphenated identifier (approval-status) ' +
    'must never be mistaken for the retired data-status literal: ' + JSON.stringify(findings))
})

test('AC-20260914-03-4/D6: the scan surface is exactly spec/, README.md and docs/canonical/ — a D6 literal sitting only under specs/ (history) or docs/roadmap/ never surfaces', () => {
  const root = tmpdir('atlas-retired-ac4-surface')
  fs.mkdirSync(path.join(root, 'specs/20260101'), { recursive: true })
  fs.mkdirSync(path.join(root, 'docs/roadmap'), { recursive: true })
  fs.writeFileSync(path.join(root, 'specs/20260101/01-old.md'), 'the old design-atlas.js script\n')
  fs.writeFileSync(path.join(root, 'docs/roadmap/00-overview.md'), 'design-atlas.js once existed\n')
  const findings = findLiteralOccurrences(root, D6_LITERALS)
  assert.deepStrictEqual(findings, [],
    'D6: specs/ and docs/roadmap/ are history, outside the scan surface (spec/, README.md, ' +
    'docs/canonical/ only) — a literal living only there must never be reported: ' +
    JSON.stringify(findings))
})

// ---------------------------------------------------------------------------
// AC-20260914-03-6: every File Plan DELETE path is gone; the named survivors remain.
// ---------------------------------------------------------------------------

// Transcribed verbatim from this spec's own File Plan DELETE rows (A4: "generated from this
// File Plan at build" — reconciled against the live pre-image tree in the header comment below).
// Four rows the File Plan names do not exist even in the pre-image
// (tests/mocks/client-walk-route.test.js, exclusions-route.test.js, notes-reanchor.test.js,
// wire-register.test.js) — logged in this spec's deviations sidecar; asserting their absence
// stays correct (vacuously true today, true after the batch) so they are kept in the list rather
// than silently dropped.
const DELETE_FILES = [
  'spec/scripts/design-atlas.js',
  'spec/scripts/components-check.js',
  'spec/scripts/lib/notes-layer.browser.js',
  'spec/scripts/lib/walk-page.js',
  'spec/scripts/lib/review.browser.js',
  'spec/scripts/lib/walk.browser.js',
  'spec/scripts/lib/shell-region.js',
  'spec/scripts/lib/mocks-notes.js',
  'spec/scripts/lib/review-page.js',
  'spec/scripts/lib/mock-seed-checks.js',
  'spec/scripts/lib/mocks-exclusions.js',
  'spec/scripts/lib/client-capture.js',
  'spec/scripts/lib/mocks-picks.js',
  'spec/scripts/lib/notes-anchor.browser.js',
  'spec/scripts/lib/mocks-walk.js',
  'spec/scripts/lib/stop-block.js',
  'spec/scripts/lib/kit-layers.js',
  'spec/scripts/lib/wire-register.js',
  'spec/scripts/lib/wire-roles.js',
  'spec/scripts/lib/walk-mode.browser.js',
  'spec/commands/atlas.md',
  'spec/templates/mocks-kit.html',
  'spec/templates/mocks/viewer.css',
  'spec/templates/mocks/wire.css',
  'spec/templates/mocks/wire-tokens.css',
  'spec/templates/mocks/project.css',
  'spec/templates/mocks-canon.md',
  'spec/templates/design-rules.json',
  'spec/templates/design-targets.json',
  'tests/mocks/atlas-card-height.test.js',
  'tests/mocks/client-region.test.js',
  'tests/mocks/client-walk-route.test.js',
  'tests/mocks/exclusions-route.test.js',
  'tests/mocks/kit-layers.test.js',
  'tests/mocks/notes-layer-interaction.test.js',
  'tests/mocks/notes-layer-isolation.test.js',
  'tests/mocks/notes-layer-navigation.test.js',
  'tests/mocks/notes-reanchor.test.js',
  'tests/mocks/review-board-card.test.js',
  'tests/mocks/review-browser.test.js',
  'tests/mocks/review-chrome.test.js',
  'tests/mocks/review-page.test.js',
  'tests/mocks/screen-page-phone.test.js',
  'tests/mocks/screen-page.test.js',
  'tests/mocks/walk-page.test.js',
  'tests/mocks/wire-register.test.js',
  'tests/mocks/chrome-harness.js',
  'tests/design-atlas.test.js',
  'tests/design-atlas-index.test.js',
  'tests/fixtures/mocks-notes/notes.sample.json',
]

const DELETE_DIRS = [
  'design/atlas',
  'design/chrome-mocks',
  'design/client-mocks',
  'docs/spikes/23-atlas-index-nav',
]

const SURVIVORS = [
  'spec/scripts/lib/mocks-ledger.js',
  'spec/scripts/lib/surfaces.js',
  'spec/templates/mocks-ledger.md',
  'spec/templates/mocks-seed.md',
  'spec/templates/mock/contract.json',
]

test('AC-20260914-03-6: none of the File Plan\'s DELETE-marked files or directories exist in the repo tree', () => {
  const stillThere = DELETE_FILES.filter((rel) => fs.existsSync(path.join(ROOT, rel)))
    .concat(DELETE_DIRS.filter((rel) => fs.existsSync(path.join(ROOT, rel))))
  assert.deepStrictEqual(stillThere, [],
    'D1/D5/D7: every File Plan DELETE row must be gone from the tree — a surviving path here is ' +
    'a script, lib, template, chrome mock, or test the deletion batch has not yet removed: ' +
    JSON.stringify(stillThere))
})

test('AC-20260914-03-6: D10\'s named survivors — mocks-ledger.js, surfaces.js, mocks-ledger.md, mocks-seed.md, mock/contract.json — still exist', () => {
  const missing = SURVIVORS.filter((rel) => !fs.existsSync(path.join(ROOT, rel)))
  assert.deepStrictEqual(missing, [],
    'D10: these five paths are explicitly pinned as survivors — the batch deletion must not take ' +
    'them by accident: ' + JSON.stringify(missing))
})
