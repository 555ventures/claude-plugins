'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, read, runNode } = require('../helpers')

// specs/20260914/02-genesis-run-and-sketch-read-the-mock-app.md D5: design.md loses its
// render-gate/atlas sections, and spec-review-driver.js drops the advisory render-gate clause.
//
// specs/20260918/01-mock-contract-v3.md D4, AC-20260918-01-5: the AC-20260914-02-8 case below
// pins the served-page approve/waive doctrine rewrite across design.md, mocks.md and
// mocks-driver.js (the deleted config template and the four-literal loop of the design-doctrine
// pin are dropped by specs/20261002/01-the-wireframe-command-runs-over-the-service.md D17).
//
// specs/20260926/01-the-approval-file-is-not-a-gate.md D1/D11: the sibling cases this file used
// to carry over the (now-deleted) design command and stage files are retired along with their
// subject — see this spec's own File Plan for the removal.

const DESIGN_DOCTRINE_REL = 'spec/doctrine/design.md'
const REVIEW_DRIVER_REL = 'spec/scripts/spec-review-driver.js'
const MOCKS_DOCTRINE_REL = 'spec/doctrine/mocks.md'
const MOCKS_DRIVER_REL = 'spec/scripts/mocks-driver.js'

// ---------------------------------------------------------------------------
// AC-20260914-02-16
// ---------------------------------------------------------------------------

test('AC-20260914-02-16: WHEN spec/scripts/spec-review-driver.js is read THE SYSTEM SHALL contain no render-gate — the REVIEWER step\'s printed text names no advisory run', () => {
  assert.ok(fs.existsSync(path.join(ROOT, REVIEW_DRIVER_REL)), REVIEW_DRIVER_REL + ' must exist for this pin to mean anything')
  const text = read(REVIEW_DRIVER_REL)
  assert.ok(!text.includes('render-gate'),
    'D5: spec/scripts/spec-review-driver.js must contain no "render-gate" literal anywhere — the ' +
    'REVIEWER step\'s printed text and its surrounding comments must drop the advisory ' +
    'render-gate-run clause whole, since the driver never ran the gate itself even before this spec')
})

// ---------------------------------------------------------------------------
// AC-20260914-02-8
// ---------------------------------------------------------------------------

test('AC-20260914-02-8 / AC-20260918-01-5: the consistency suite finds none of the retired phrases "approvals are recorded on the served page", "pick on the page" or "--decision" anywhere across design.md, mocks.md and mocks-driver.js', () => {
  const mocksDoctrineText = read(MOCKS_DOCTRINE_REL)
  const designDoctrineText = read(DESIGN_DOCTRINE_REL)
  const mocksDriverText = read(MOCKS_DRIVER_REL)
  const retiredPhraseSurfaces = [
    ['design.md', designDoctrineText],
    ['mocks.md', mocksDoctrineText],
    ['mocks-driver.js', mocksDriverText],
  ]
  for (const [label, docText] of retiredPhraseSurfaces) {
    for (const retired of ['approvals are recorded on the served page', 'pick on the page', '--decision']) {
      assert.ok(!docText.includes(retired),
        'D4: ' + label + ' must contain none of the retired phrases naming the removed served-' +
        'page controls — found "' + retired + '", which describes a screen-approve/theme-pick/' +
        'notes-decision control the served page no longer carries once the client\'s confirm on the ' +
        'service is the only writer')
    }
  }
})

// ---------------------------------------------------------------------------
// AC-20260914-02-10
// ---------------------------------------------------------------------------

test('AC-20260914-02-10 / AC-20260926-01-8: WHEN spec/doctrine/design.md is read THE SYSTEM SHALL carry ## Design Canon, ## Design Authoring Contracts, ## Workflows Encode Shape, Not Judgment, neither ## Design Render Gate nor ## Design Atlas, be <=160 lines, and citations-check.js exits 0', () => {
  assert.ok(fs.existsSync(path.join(ROOT, DESIGN_DOCTRINE_REL)), DESIGN_DOCTRINE_REL + ' must exist for this pin to mean anything')
  const text = read(DESIGN_DOCTRINE_REL)

  // A `§ Section Name` citation only needs a byte-for-byte PREFIX match (parentheticals
  // tolerated, doctrine.md convention) — so this pin checks the heading's start-of-line prefix,
  // never the full line, since § Design Canon's own heading already carries a parenthetical.
  for (const heading of ['## Design Canon', '## Design Authoring Contracts', '## Workflows Encode Shape, Not Judgment']) {
    assert.match(text, new RegExp('^' + heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)', 'm'),
      'D10: spec/doctrine/design.md must keep the "' + heading + '" heading — the rewrite keeps ' +
      'this section\'s body while deleting the two render-gate/atlas sections around it')
  }
  assert.doesNotMatch(text, /^## Design Render Gate$/m,
    'D10: "## Design Render Gate" must be deleted whole — the fidelity check it described has no ' +
    'home once the mocks are the components')
  assert.doesNotMatch(text, /^## Design Atlas$/m,
    'D10: "## Design Atlas" must be deleted whole — the whole-product view it described is a ' +
    'retired command (spec 03) with no doctrine section left to justify it')
  const lineCount = text.split('\n').length
  assert.ok(lineCount <= 160,
    'D10: spec/doctrine/design.md must stay at or under 160 lines — found ' + lineCount +
    '; deleting two whole sections must not be offset by growth elsewhere')

  const check = runNode('scripts/citations-check.js', [], { cwd: ROOT })
  assert.strictEqual(check.status, 0, 'citations-check.js must exit 0 (advisory scan, never a usage error) over the repo root: ' + check.stderr)
  assert.match(check.stdout, /\bMISS=0\b/,
    'D10: deleting § Design Render Gate and § Design Atlas must not orphan any citation of either ' +
    'section elsewhere in spec/ — a nonzero MISS here means some command or doctrine file still ' +
    'points at a heading this spec removed: ' + check.stdout)
})
