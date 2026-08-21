'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, read } = require('../helpers')

// specs/20260820/06-typed-evidence-manifest.md (D1/D3, 2026-08-20, brief 16's second move): the
// evidence-manifest row's `observed` field becomes a typed JSON object everywhere, and
// verdict.js's packed-string parser (parseCounts/deriveProduction, plus the regex arms inside
// countLegFinding and deriveTestsSkipped) is DELETED, not hardened — the Rationale states this
// plainly: "verdict.js shrinks from a parser to a copier". This is the source-negative pin for
// that deletion, modeled directly on tests/fleet-reader/drift.test.js's AC-20260820-05-10
// opacity pin ("the reader source contains zero occurrences of the token 'observed'") and
// extended to the deriver the parser is deleted FROM rather than the reader the parser must
// never leak INTO. Every one of the nine banned literal stems below is a live regex fragment in
// verdict.js's pre-image source (grep-verified 2026-08-20) — this test is TDD-red until D3 lands.

const SCRIPT_PATH = path.join(ROOT, 'spec/scripts/verdict.js')

const BANNED_STEMS = [
  'skips=', 'outOfPlan=', 'uncovered=', 'skipped=', 'orphans=',
  'passed=', 'walked=', 'checked=', 'todos=',
]

test('AC-20260820-06-15: verdict.js\'s source contains none of the nine retired packed-string grammar literal stems', () => {
  assert.ok(fs.existsSync(SCRIPT_PATH),
    'spec/scripts/verdict.js does not exist at the expected path — this opacity pin can only fail until the ' +
    'script is present: ' + SCRIPT_PATH)
  const src = read('spec/scripts/verdict.js')
  for (const stem of BANNED_STEMS) {
    assert.ok(!src.includes(stem),
      `D1/D3: verdict.js's source must never contain the retired packed-string grammar literal "${stem}" — ` +
      'every manifest-row field is now read as a typed JSON property, never regex-matched out of a packed ' +
      `string. Finding "${stem}" in the source means the parser this spec exists to delete is still alive.`)
  }
})

test('AC-20260820-06-15: verdict.js\'s source contains zero regex-exec calls — the deleted parser leaves no .exec( invocation behind', () => {
  const src = read('spec/scripts/verdict.js')
  assert.ok(!src.includes('.exec('),
    'D3: every regex-based extraction in the pre-image (deriveTestsSkipped\'s "skips=N todos=M" match, ' +
    'countLegFinding\'s outOfPlan=/uncovered=/skipped=/orphans= matches) runs through RegExp#exec — the ' +
    'post-migration deriver reads typed object fields directly and calls .exec() nowhere. A surviving ' +
    '.exec( call means some field is still being regex-parsed out of a string instead of read off the ' +
    'typed observed object — the exact class AC-20260820-06-15 exists to close, not just the nine named stems.')
})

test('AC-20260820-06-15: verdict.js\'s source contains zero dynamic RegExp construction — parseCounts\' "new RegExp(...)" template is deleted, not merely renamed', () => {
  const src = read('spec/scripts/verdict.js')
  assert.ok(!src.includes('new RegExp('),
    'D3: parseCounts built a fresh RegExp per call ("^" + keys.map(k => `${k}=(\\\\d+)`).join(" ") + "$") to ' +
    'parse the release legs\' packed observed strings — D3 deletes parseCounts entirely, since release ledger ' +
    'keys now copy the typed observed object verbatim. A surviving "new RegExp(" call means a packed-string ' +
    'grammar is still being assembled and parsed somewhere in this file.')
})
