'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const {
  JOURNEY, LABELS,
  mark, writeFile, statusJson, writeWireframe, advanceToCanonWritten,
} = require('./mocks-driver-fixtures')

// specs/20260908/07-one-wire-register-predicate.md D6, AC-20260908-07-5: journey-drawn's two
// "the wireframe must link the register" checks move onto stylesheetTargets(html), requiring a
// target matching /(^|\/)wire\/tokens\.css$/ and /(^|\/)wire\/wire\.css$/ respectively, instead
// of the bare substring scans `/wire\/tokens\.css/.test(html)` / `/wire\/wire\.css/.test(html)`.
// TDD red: the pre-image substring scan matches a commented-out mention (wrongly accepted, the
// exact bug the Goal names — "a wireframe whose gray links were deleted but left behind in a
// comment passes as drawn"), and design-atlas.js's own pre-image "does not link a tokens.css"
// rule (D7, untouched by this file's assignment but exercised through runDesignAtlasCheck) never
// recognizes an @import-applied register, so an @import-only mock is wrongly refused today —
// the exact mirror-image defect.

const STATE_BTNS = '<div data-contract="none"><button data-state-btn="empty">e</button>' +
  '<button data-state-btn="loading">l</button><button data-state-btn="error">e</button></div>'

function writeCustomWireframe(dir, label, headHtml) {
  writeFile(path.join(dir, 'design/mocks', label + '.html'),
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    headHtml +
    '<main data-screen-label="' + label + '" data-status="sketch">' + label + STATE_BTNS + '</main>\n')
}

test('AC-20260908-07-5: journey-drawn refuses a mock whose only mention of ../wire/tokens.css is a comment with the exact D6 message, and accepts a mock that applies both register stylesheets only through CSS @import', () => {
  const dir = tmpdir('mocks-driver-wire')
  advanceToCanonWritten(dir)
  for (const label of LABELS) writeWireframe(dir, label)
  const target = LABELS[1]

  // A real wire.css link, but the wire/tokens.css mention survives only in a comment — the
  // closure check must stop matching it as a linked stylesheet.
  writeCustomWireframe(dir, target,
    '<!-- was ../wire/tokens.css -->\n<link rel="stylesheet" href="../wire/wire.css">\n' +
    '<style>* { box-sizing: border-box; }</style>\n')
  const refused = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(refused.status, 2,
    'a mock whose only ../wire/tokens.css mention is a commented-out link must refuse journey-drawn — a deleted gray link left behind in a comment must not read as drawn: ' + refused.stdout + refused.stderr)
  assert.match(refused.stderr + refused.stdout,
    new RegExp(target + '\\.html: does not link \\.\\./wire/tokens\\.css'),
    'the refusal must be the exact D6 message naming the file and the missing tokens.css link, not a generic design-atlas.js check failure fallback: ' + JSON.stringify(refused.stdout + refused.stderr))
  const journeyRecord = statusJson(dir).journeys[JOURNEY]
  assert.strictEqual(journeyRecord === undefined || journeyRecord.drawn == null, true,
    'a refused journey-drawn must never record a drawn journeys.<j> entry — the base leaves the record absent entirely, never present with drawn set: ' + JSON.stringify(journeyRecord))

  // Restore, then apply BOTH register stylesheets only through CSS @import — the closure checks
  // must start accepting this, and design-atlas.js's own tokens.css rule must stop refusing it.
  writeCustomWireframe(dir, target,
    '<style>@import "../wire/tokens.css"; @import "../wire/wire.css";</style>\n' +
    '<style>* { box-sizing: border-box; }</style>\n')
  const accepted = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(accepted.status, 0,
    'a mock applying both register stylesheets only through CSS @import must be accepted by journey-drawn, not refused as unlinked — the exact mirror-image of the comment-mention defect: ' + accepted.stdout + accepted.stderr)
  assert.strictEqual(statusJson(dir).journeys[JOURNEY].drawn !== null, true,
    'an accepted journey-drawn over an @import-only register application must record journeys.<j>.drawn')
})
