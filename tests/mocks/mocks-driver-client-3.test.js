'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const {
  JOURNEY, LABELS,
  bare, mark, decideLook, patchStatus, nowIso, isoDaysAgo,
  advanceToJourneyWalked,
} = require('./mocks-driver-fixtures')

// specs/20260910/03-client-journey-player.md D7 (the `approved` client-confirmation gate,
// `client waive`, `client log`, and the accepted-tail `client:`/`waived journeys:` lines) does
// not exist yet on spec/scripts/mocks-driver.js — every test below is red until it lands.
// AC-20260910-03-7, -8.
//
// File Plan naming note (recorded as a deviation, see the spec's own sidecar): the File Plan
// names this row `tests/mocks/mocks-driver-client-2.test.js`, but that path is already occupied
// by specs/20260910/01-contention-proof-budget-and-uncapped-suite.md's D3 file-budget split
// (AC-20260907-10-11/-22/-14/-15/-16) — the same "next free version" class of race this repo's
// spec-pipeline Gotchas already document for literal version/filename targets. This file takes
// the next free name, `mocks-driver-client-3.test.js`.

function walkJsonPath(dir) { return path.join(dir, 'design/mocks/walk.json') }
function writeWalkJson(dir, journeys) {
  fs.mkdirSync(path.dirname(walkJsonPath(dir)), { recursive: true })
  fs.writeFileSync(walkJsonPath(dir), JSON.stringify({ journeys }, null, 2) + '\n')
}
function readWalkJson(dir) { return JSON.parse(fs.readFileSync(walkJsonPath(dir), 'utf8')) }

// ---------------------------------------------------------------------------
// AC-20260910-03-7
// ---------------------------------------------------------------------------
test('AC-20260910-03-7: --mark approved with walk.json absent exits 2 naming the unconfirmed journey and `client waive --journey <j>`; with the journey confirmed it accepts and prints `client: <j> — "<sentence>"` before `waived:`; with the journey waived instead it accepts and prints `waived journeys: 1`', () => {
  const noWalk = tmpdir('client-approved-no-walk')
  advanceToJourneyWalked(noWalk, JOURNEY)
  decideLook(noWalk, 'approved', 'approve', { by: 'Ren' })
  const refused = mark(noWalk, 'approved')
  assert.strictEqual(refused.status, 2, 'AC-7: `--mark approved` with no walk.json record must exit 2: ' + refused.stdout + refused.stderr)
  assert.match(refused.stderr + refused.stdout, new RegExp('journey "' + JOURNEY + '" is not confirmed by the client'),
    'AC-7: the refusal must name the unconfirmed journey "' + JOURNEY + '": ' + refused.stdout + refused.stderr)
  assert.match(refused.stderr + refused.stdout, new RegExp('client waive --journey ' + JOURNEY),
    'AC-7: the refusal must name the remedy "client waive --journey ' + JOURNEY + '": ' + refused.stdout + refused.stderr)

  const confirmed = tmpdir('client-approved-confirmed')
  advanceToJourneyWalked(confirmed, JOURNEY)
  decideLook(confirmed, 'approved', 'approve', { by: 'Ren' })
  const sentence = '招待を送って、同意をもらって、セッションを始めた'
  writeWalkJson(confirmed, { [JOURNEY]: { reached: LABELS, misses: [], confirmedAt: nowIso(), sentence, waived: null } })
  const accepted = mark(confirmed, 'approved')
  assert.strictEqual(accepted.status, 0, 'AC-7: `--mark approved` with the journey confirmed in walk.json must accept: ' + accepted.stdout + accepted.stderr)
  const clientLineIdx = accepted.stdout.indexOf('client: ' + JOURNEY + ' — "' + sentence + '"')
  const waivedLineIdx = accepted.stdout.indexOf('waived:')
  assert.ok(clientLineIdx !== -1, 'AC-7: the accepted output must print `client: ' + JOURNEY + ' — "' + sentence + '"`: got ' + accepted.stdout)
  assert.ok(waivedLineIdx !== -1 && clientLineIdx < waivedLineIdx,
    'AC-7: the `client: <j> — "<sentence>"` line must print before the `waived:` line: got ' + accepted.stdout)

  const waived = tmpdir('client-approved-waived')
  advanceToJourneyWalked(waived, JOURNEY)
  decideLook(waived, 'approved', 'approve', { by: 'Ren' })
  writeWalkJson(waived, { [JOURNEY]: { reached: [], misses: [], confirmedAt: null, sentence: null, waived: { at: nowIso(), reason: 'no reply', by: 'session' } } })
  const acceptedWaived = mark(waived, 'approved')
  assert.strictEqual(acceptedWaived.status, 0, 'AC-7: `--mark approved` with the journey waived in walk.json must accept: ' + acceptedWaived.stdout + acceptedWaived.stderr)
  assert.match(acceptedWaived.stdout, /waived journeys: 1/,
    'AC-7: the accepted output must print "waived journeys: 1": got ' + acceptedWaived.stdout)
})

// ---------------------------------------------------------------------------
// AC-20260910-03-8
// ---------------------------------------------------------------------------
test('AC-20260910-03-8: `client waive --journey <j> --reason` refuses at six days since status.client.openedAt naming 6 and 7, accepts at seven days and records walk.json waived.reason, and `client log` prints reached counts and grouped/counted misses', () => {
  const dir = tmpdir('client-waive-and-log')
  advanceToJourneyWalked(dir, JOURNEY)
  patchStatus(dir, { client: { address: 'https://hearwell.example', openedAt: isoDaysAgo(6) } })

  const tooSoon = bare(dir, ['client', 'waive', '--journey', JOURNEY, '--reason', 'no reply'])
  assert.strictEqual(tooSoon.status, 2, 'AC-8: `client waive` at six days silent must exit 2: ' + tooSoon.stdout + tooSoon.stderr)
  assert.match(tooSoon.stderr + tooSoon.stdout, /6/, 'AC-8: the refusal must name "6" (days elapsed): ' + tooSoon.stdout + tooSoon.stderr)
  assert.match(tooSoon.stderr + tooSoon.stdout, /7/, 'AC-8: the refusal must name "7" (days required): ' + tooSoon.stdout + tooSoon.stderr)

  patchStatus(dir, { client: { address: 'https://hearwell.example', openedAt: isoDaysAgo(7) } })
  const accepted = bare(dir, ['client', 'waive', '--journey', JOURNEY, '--reason', 'no reply'])
  assert.strictEqual(accepted.status, 0, 'AC-8: `client waive` at seven days silent must exit 0: ' + accepted.stdout + accepted.stderr)
  const onDisk = readWalkJson(dir)
  assert.strictEqual(onDisk.journeys[JOURNEY].waived && onDisk.journeys[JOURNEY].waived.reason, 'no reply',
    'AC-8: a successful waive must record waived.reason "no reply" in design/mocks/walk.json: got ' + JSON.stringify(onDisk.journeys[JOURNEY]))

  const logDir = tmpdir('client-log')
  advanceToJourneyWalked(logDir, JOURNEY)
  const at = nowIso()
  writeWalkJson(logDir, {
    [JOURNEY]: {
      reached: [LABELS[0], LABELS[1]],
      misses: [
        { at, from: LABELS[0], target: 'button#help Need help?' },
        { at, from: LABELS[0], target: 'button#help Need help?' },
        { at, from: LABELS[1], target: 'a Back' },
      ],
      confirmedAt: null, sentence: null, waived: null,
    },
  })
  const log = bare(logDir, ['client', 'log'])
  assert.strictEqual(log.status, 0, 'AC-8: `client log` must exit 0: ' + log.stdout + log.stderr)
  assert.match(log.stdout, /open — reached 2\/4/, 'AC-8: `client log` must print "open — reached 2/4": got ' + log.stdout)
  assert.match(log.stdout, new RegExp('  ' + LABELS[0] + ': button#help Need help\\? \\(2×\\)'),
    'AC-8: `client log` must print the grouped/counted miss "  ' + LABELS[0] + ': button#help Need help? (2×)": got ' + log.stdout)
  assert.match(log.stdout, new RegExp('  ' + LABELS[1] + ': a Back \\(1×\\)'),
    'AC-8: `client log` must print "  ' + LABELS[1] + ': a Back (1×)": got ' + log.stdout)
})
