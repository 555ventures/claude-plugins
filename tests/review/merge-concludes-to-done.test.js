'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const { run, stateOf, seedReplayRow, seedReviewRow, makeReplayHost, driveToClose, commitClose } = require('./review-driver.fixtures')

// specs/20260913/09-the-tool-shows-never-interrupts.md D1: REPLAY leaves the review driver's
// state chain (CLOSE -> MERGE/CONFLICTS -> DONE, terminal, nothing between). AC-20260913-09-1,
// -2, -3.

test('AC-20260913-09-1: WHEN a review host seeded with five prior stage:"review" rows (the pre-image\'s due condition) is driven through CLOSE and MERGE on the originating branch THE SYSTEM prints state DONE (never REPLAY), --state prints DONE, and the sidecar directory does not exist afterwards', () => {
  const host = makeReplayHost('mergedonedue', {
    acId: 'AC-20260820-99-30',
    seedRows: [1, 2, 3, 4, 5].map(seedReviewRow),
  })
  driveToClose(host, 'mergedonedue-ret')
  commitClose(host)
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0,
    'a CLEAN close on the originating branch (nothing to merge) must be accepted regardless of the seeded ledger\'s dueness — D1 deletes the REPLAY gate entirely, so no ledger shape may refuse this mark: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /state: DONE/,
    'D1: MERGE\'s merge-skipped arm must call printDoneNow directly — a due window (5 seeded reviews, the pre-image\'s own >=5 threshold) is exactly the shape the pre-image parks at REPLAY for, and this spec removes that park unconditionally: ' + r.stdout)
  assert.doesNotMatch(r.stdout, /state: REPLAY/,
    'D1: the driver must never print state REPLAY again — the state no longer exists in the chain: ' + r.stdout)
  assert.strictEqual(stateOf(host.root, host.spec), 'DONE',
    '--state must report DONE once MERGE has concluded — the pre-image reports REPLAY here for a due window, which is precisely the park this spec removes: ' + r.stdout)
  assert.ok(!fs.existsSync(host.sidecar),
    'DONE must delete the sidecar directory exactly as it does today — D1 does not touch the DONE-time deletion, only what precedes it')
})

test('AC-20260913-09-2: WHEN spec-review-driver.js <spec> --mark replay-recorded runs THE SYSTEM exits 2 with the unknown-mark refusal enumerating exactly the seven remaining marks (skips-extracted | reviewer-returned | dispositions | fix-applied | closed | merge-strategy | conflicts-resolved)', () => {
  const host = makeReplayHost('mergedonemark', { acId: 'AC-20260820-99-31', seedRows: [] })
  const r = run(host.root, host.spec, '--mark', 'replay-recorded')
  assert.strictEqual(r.status, 2,
    'D1: replay-recorded is no longer a mark this driver understands at all — its handler, case arm, and enumeration entry are all deleted, so this must fall into the generic unknown-mark refusal: ' + r.stdout + r.stderr)
  const out = r.stdout + r.stderr
  assert.match(out, /unknown mark "replay-recorded"/,
    'the refusal must name the mark that was rejected: ' + out)
  assert.match(out,
    /\(skips-extracted \| reviewer-returned \| dispositions \| fix-applied \| closed \| merge-strategy \| conflicts-resolved\)/,
    'D1: the enumeration must list EXACTLY the seven remaining marks, in this order, with replay-recorded removed — an enumeration that still names replay-recorded (the pre-image\'s own eight-mark list) means the case arm and its list entry were not both deleted: ' + out)
})

test('AC-20260913-09-3: WHEN the driver is re-invoked bare after DONE was printed THE SYSTEM prints DONE again and exits 0, with no state re-derivation from deleted manifests', () => {
  const host = makeReplayHost('mergedonereentry', {
    acId: 'AC-20260820-99-32',
    seedRows: [1, 2, 3, 4, 5].map(seedReviewRow),
  })
  driveToClose(host, 'mergedonereentry-ret')
  commitClose(host)
  const closeR = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(stateOf(host.root, host.spec), 'DONE',
    'setup precondition: the fixture must reach DONE straight off a due merge conclusion before re-entry can be exercised — a build that still parks at REPLAY here never reaches the re-entry condition this AC pins: ' + closeR.stdout + closeR.stderr)

  const again = run(host.root, host.spec)
  assert.strictEqual(again.status, 0,
    'a bare re-invocation after DONE must exit 0, not crash trying to re-derive state from manifests the merge already deleted: ' + again.stdout + again.stderr)
  assert.match(again.stdout, /state: DONE/,
    'a bare re-invocation after DONE must print DONE again, not attempt to walk legs/manifests that no longer exist post-merge: ' + again.stdout)
})
