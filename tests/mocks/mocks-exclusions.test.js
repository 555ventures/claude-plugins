'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tmpdir, freePort, serveAtlas, postJson, SPEC } = require('../helpers')
const { parseLedger, gateVerdict, countsLine } = require('../../spec/scripts/lib/mocks-ledger')
const { validateNotes } = require('../../spec/scripts/lib/mocks-notes')
const { advanceToSeedDone, ledgerCmd, writeNotesFile, writeFile, nowIso } = require('./mocks-driver-fixtures')

// specs/20260910/05-what-the-journey-does-not-do.md D1 (the `exclusion` kind), D2
// (`lib/mocks-exclusions.js`'s deriveExclusions), D3 (the withdraw `reason` enum). Every test
// below is red until those land. AC-20260910-05-1, -2, -3.

let deriveExclusions
let materialize
try {
  // eslint-disable-next-line global-require
  ;({ deriveExclusions, materialize } = require('../../spec/scripts/lib/mocks-exclusions'))
} catch (e) {
  const reason = 'spec/scripts/lib/mocks-exclusions.js does not exist yet (D2): ' + e.message
  deriveExclusions = () => { throw new Error(reason) }
}
if (typeof materialize !== 'function') {
  const reason = 'lib/mocks-exclusions.js does not export materialize yet (specs/20260911/05 D1)'
  materialize = () => { throw new Error(reason) }
}

function briefPath(dir) { return path.join(dir, '.claude/genesis/brief.md') }
const EMPTY_LEDGER_TEXT = [
  '# Provenance ledger — test', '', '## Assumptions', '',
  '| id | step | kind | claim | tag | status | rejected | dependents | note |',
  '| - | - | - | - | - | - | - | - | - |',
  '', '## Misunderstandings', '',
  '| id | what | step | cost | note |', '| - | - | - | - | - |', '',
].join('\n')


test('AC-20260911-05-11: `ledger derive` CONTINUES TO print the total/new/retired counts line once the transform moves into lib/mocks-exclusions.js', () => {
  const dir = tmpdir('excl-derive-continue-counts')
  advanceToSeedDone(dir)
  writeFile(briefPath(dir), "## Non-goals\n- SMS reminders — Later\n- Multi-currency — Won't-this-time\n")
  const r = ledgerCmd(dir, 'derive')
  assert.strictEqual(r.status, 0, 'AC-11: `ledger derive` must exit 0 on a valid host: ' + r.stderr)
  assert.match(r.stdout, /📒 exclusions: 2 total · 2 new · 0 retired/,
    'AC-11: `ledger derive` must CONTINUE TO print "📒 exclusions: 2 total · 2 new · 0 retired" — the caller-facing line must not change once D1 moves the transform into the lib: got ' + r.stdout)
})
