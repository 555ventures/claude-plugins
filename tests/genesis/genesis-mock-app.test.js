'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tmpdir, runNode, SPEC } = require('../helpers')
const { writeBrief } = require('./tournament.fixtures.js')
const mockApp = require('../mocks/mock-app-fixtures.js')

// specs/20260914/02-genesis-run-and-sketch-read-the-mock-app.md D6, AC-20260914-02-4: genesis-
// driver.js derives BRIEF's journey/notes counts from design/approval.json and design/notes.json
// (never lib/mocks-notes). specs/20260926/04-the-design-brief.md D9 retires the mock app's
// product-precedence branches (MENUS' auto-pick, the tournament/scaffold skips, skeleton-landed's
// mock-review gate) outright — the AC-20260914-02-5, AC-20260914-02-6 and "no ## Picks heading"
// tests those branches were pinned by are deleted below (their pointer lines in
// specs/20260914/02-genesis-run-and-sketch-read-the-mock-app.md are tagged
// `[retired: specs/20260926/04-the-design-brief.md]` in the same batch); the AC-20260914-02-4
// test survives untouched and now also carries AC-20260926-04-21 (SHALL CONTINUE TO).

const SCRIPT = 'scripts/genesis-driver.js'

function bare(dir, opts) {
  return runNode(SCRIPT, ['--root', dir], opts)
}

function state(dir, opts) {
  return runNode(SCRIPT, ['--root', dir, '--state'], opts)
}

function mark(dir, name, file, opts) {
  const argv = ['--root', dir, '--mark', name]
  if (file) argv.push('--file', file)
  return runNode(SCRIPT, argv, opts)
}

function statusOf(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, '.claude/genesis/status.json'), 'utf8'))
}

// ---------------------------------------------------------------------------
// AC-20260914-02-4
// ---------------------------------------------------------------------------

test('AC-20260914-02-4/AC-20260926-04-21: WHEN genesis-driver.js --root <host> runs at BRIEF on a host whose design/mocks/status.json is APPROVED (schemaVersion 2), whose design/approval.json has journeys first-visit and daily-check, and whose design/notes.json has one open note and one open journey conversation THE SYSTEM SHALL CONTINUE TO print "seed journeys: 2 · notes open: 2" and never requires lib/mocks-notes', () => {
  const dir = tmpdir('genesis-mock-app-brief')

  mockApp.writeStatus(dir, { state: 'APPROVED' })
  mockApp.writeLedger(dir)
  mockApp.writeSeed(dir, { records: [], journeys: ['first-visit', 'daily-check'] })
  mockApp.writeApp(dir, {
    records: [],
    notes: {
      notes: [{ id: 'N001', screen: 'home', state: 'default', component: 'Card', key: 'title', snippet: 'Welcome', status: 'open', thread: [] }],
      journeys: {
        'first-visit': { status: 'open', thread: [] },
        'daily-check': { status: 'resolved', thread: [] },
      },
    },
    approval: {
      journeys: {
        'first-visit': { approvedAt: '2026-09-01T00:00:00.000Z', client: false },
        'daily-check': { approvedAt: '2026-09-01T00:00:00.000Z', client: false },
      },
    },
  })

  writeBrief(dir, { picks: ['- archetype: web-app'] })
  const disco = mark(dir, 'discovery-done')
  assert.strictEqual(disco.status, 0, 'test setup requires discovery-done to be accepted on a fully-covered brief naming a visual archetype: ' + disco.stderr)

  const r = bare(dir)
  assert.strictEqual(r.status, 0, 'a bare invocation at BRIEF with an APPROVED, open-ledger mocks set must exit 0: ' + r.stderr)
  assert.match(r.stdout, /seed journeys: 2 · notes open: 2/,
    'D6(a): BRIEF must print "seed journeys: 2 · notes open: 2" derived from design/approval.json\'s ' +
    'journeys keys (first-visit, daily-check) and design/notes.json\'s open-status notes+journeys ' +
    '(one note, one journey conversation) — today\'s driver prints a different count from a different ' +
    'source (seedJourneysMap() off design/mocks/seed.md, and "notes unresolved" via lib/mocks-notes ' +
    'reading a root-level design/mocks/notes.json this mock-app host never writes): ' + r.stdout)

  // Second half: the module must be absent from the driver's require graph — deleting it in a
  // copy of the plugin must leave the run's exit unchanged (spec 03 deletes the file for good).
  const specCopy = tmpdir('genesis-mock-app-nolib-spec')
  fs.cpSync(SPEC, specCopy, { recursive: true })
  fs.rmSync(path.join(specCopy, 'scripts/lib/mocks-notes.js'), { force: true })
  const baseline = bare(dir)
  const mutant = spawnSync(process.execPath, [path.join(specCopy, 'scripts/genesis-driver.js'), '--root', dir], { encoding: 'utf8' })
  assert.strictEqual(mutant.status, baseline.status,
    'D6(a): deleting spec/scripts/lib/mocks-notes.js must not change this run\'s exit code — a ' +
    'differing exit here means the driver still requires the module, so a host that later deletes ' +
    'it (spec 03) breaks every BRIEF invocation: baseline=' + baseline.status + ' mutant=' + mutant.status +
    ' mutantStderr=' + mutant.stderr)
})
