'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const {
  bare, mark, writeFile, writeJSON, writeBrief,
  writeConventionsArtifacts, writeBindingSubset,
} = require('./tournament.fixtures.js')

// specs/20260910/05-what-the-journey-does-not-do.md D6: `--mark roadmap-written` carries the
// parking-lot requirement over every fenced exclusion row. AC-20260910-05-10 is a
// SHALL-CONTINUE-TO pin on the pre-existing roadmap-written checks.
// specs/20260911/05-approval-is-bookkeeping.md D5 widens that fence to `open` (not-contested)
// rows and retires the `exclusions confirmed: <n>` BRIEF line its predecessor pinned — that
// pin is deleted here, its successor is the AC-20260911-05-8 test below.
// AC-20260910-05-7, -10; AC-20260911-05-8.

const DIM = 'hosting'

// ---------------------------------------------------------------------------
// A trimmed, non-visual (data-ml) chain to ROADMAP — this spec's D6 check applies to every
// confirmed exclusion row regardless of archetype, and data-ml owes nothing beyond DISCOVERY,
// so it is the cheapest host that reaches `--mark roadmap-written`.
// ---------------------------------------------------------------------------
function advanceToMenus(dir, archetype = 'data-ml') {
  bare(dir)
  writeBrief(dir, { picks: ['- archetype: ' + archetype] })
  const disco = mark(dir, 'discovery-done')
  assert.strictEqual(disco.status, 0, 'test setup requires discovery-done to be accepted: ' + disco.stderr)
  const bw = mark(dir, 'brief-written')
  assert.strictEqual(bw.status, 0, 'test setup requires brief-written to be accepted immediately for a DISCOVERY-only archetype: ' + bw.stderr)
}

function advanceToDecide(dir, archetype = 'data-ml') {
  advanceToMenus(dir, archetype)
  writeJSON(path.join(dir, '.claude/genesis/interview-research', DIM + '.json'), {
    dimension: DIM, options: [{ label: 'AWS', packages: [] }],
  })
  const written = mark(dir, 'menu-written', 'interview-research/' + DIM + '.json')
  assert.strictEqual(written.status, 0, 'test setup requires menu-written to be accepted on a zero-package menu: ' + written.stderr)
  writeBrief(dir, { picks: ['- archetype: ' + archetype, '- ' + DIM + ': AWS'] })
  const done = mark(dir, 'menus-done')
  assert.strictEqual(done.status, 0, 'test setup requires menus-done to be accepted once every open dimension has a pick: ' + done.stderr)
}

function writeValidDecideArtifacts(dir) {
  writeJSON(path.join(dir, '.claude/genesis/stack-descriptor.json'), {
    schemaVersion: 1, archetype: 'data-ml', language: 'python', framework: 'none',
    packageManager: 'pip', testRunner: 'pytest', linter: 'ruff', typechecker: 'none',
    designCatalog: 'none', gateCommand: 'true', scaffoldCommand: 'true',
    decisionRecords: ['docs/adr/0001-hosting.md'],
  })
  writeFile(path.join(dir, 'docs/adr/0001-hosting.md'), `# 0001. Hosting choice

## Decision
AWS chosen for \`${DIM}\`.

## Dissents
Fly.io was considered and rejected for regional latency — no other minority option surfaced.
`)
}

function advanceThroughScaffold(dir) {
  advanceToDecide(dir)
  writeValidDecideArtifacts(dir)
  writeConventionsArtifacts(dir)
  const decided = mark(dir, 'decided')
  assert.strictEqual(decided.status, 0, 'test setup requires decided to be accepted: ' + decided.stderr)
  const scaffolded = bare(dir)
  assert.match(scaffolded.stdout, /SKELETON/, 'test setup requires the auto-run scaffold to reach SKELETON: ' + scaffolded.stdout)
  writeBindingSubset(dir, 'true')
}

function advanceToRoadmap(dir) {
  advanceThroughScaffold(dir)
  const landed = mark(dir, 'skeleton-landed')
  assert.strictEqual(landed.status, 0, 'test setup requires skeleton-landed to be accepted: ' + landed.stderr)
  assert.match(landed.stdout, /ROADMAP/, 'test setup requires a green zero-day gate to reach ROADMAP: ' + landed.stdout)
}

function writeRoadmap(dir, { parkingLotBody = null } = {}) {
  const parking = parkingLotBody === null ? '' : '\n\n## Parking lot (deferred ideas — not scope, not backlog)\n' + parkingLotBody
  writeFile(path.join(dir, 'docs/roadmap/00-overview.md'), '# Overview\n\nSee Sequence.\n' + parking + '\n')
  writeFile(path.join(dir, 'docs/roadmap/01-first.md'), `# 01-first.md

Phase: P0 · Depends on: none

## Result
Something observable.
`)
}

function writeConfirmedExclusion(dir, { id, claim, note }) {
  const ledgerPath = path.join(dir, 'design/mocks/ledger.md')
  writeFile(ledgerPath, [
    '# Provenance ledger — test project', '', '## Assumptions', '',
    '| id | step | kind | claim | tag | status | rejected | dependents | note |',
    '| - | - | - | - | - | - | - | - | - |',
    '| ' + id + ' | CLIENT | exclusion | ' + claim + ' | said-by-user | confirmed 2026-09-11 | - | - | ' + note + ' |',
    '', '## Misunderstandings', '',
    '| id | what | step | cost | note |', '| - | - | - | - | - |', '',
  ].join('\n'))
}

// specs/20260911/05-approval-is-bookkeeping.md D5: `fencedExclusionRows` widens the parking-lot
// requirement to every `confirmed` OR `open` row — this writes an arbitrary set of exclusion
// rows (status/rejected included) so a single host can carry a mix (a confirmed "agreed" row, an
// open "not contested" one, and an overridden "client-needed" one that must never be fenced).
function writeExclusionRows(dir, rows) {
  const ledgerPath = path.join(dir, 'design/mocks/ledger.md')
  const lines = [
    '# Provenance ledger — test project', '', '## Assumptions', '',
    '| id | step | kind | claim | tag | status | rejected | dependents | note |',
    '| - | - | - | - | - | - | - | - | - |',
  ]
  for (const r of rows) {
    lines.push('| ' + r.id + ' | CLIENT | exclusion | ' + r.claim + ' | said-by-user | ' + r.status +
      ' | ' + (r.rejected || '-') + ' | - | ' + r.note + ' |')
  }
  lines.push('', '## Misunderstandings', '', '| id | what | step | cost | note |', '| - | - | - | - | - |', '')
  writeFile(ledgerPath, lines.join('\n'))
}

// ---------------------------------------------------------------------------
// AC-20260910-05-7
// ---------------------------------------------------------------------------
test('AC-20260910-05-7: `--mark roadmap-written` refuses a confirmed exclusion row absent from the overview\'s Parking lot, naming the claim and id, and accepts once the claim is added as a bullet under that heading', () => {
  const dir = tmpdir('roadmap-parking-lot-missing')
  advanceToRoadmap(dir)
  writeConfirmedExclusion(dir, { id: 'E1', claim: 'SMS reminders', note: 'non-goal: SMS reminders' })

  writeRoadmap(dir, { parkingLotBody: null })
  const missing = mark(dir, 'roadmap-written')
  assert.strictEqual(missing.status, 2,
    'AC-7: roadmap-written must refuse while a confirmed exclusion\'s claim is absent from the Parking lot: got ' + missing.status + ' stdout=' + missing.stdout + ' stderr=' + missing.stderr)
  assert.match(missing.stderr, /exclusion "SMS reminders" \(E1\) is not in the parking lot/,
    'AC-7: the refusal must name the claim and the row id verbatim: got ' + missing.stderr)

  writeRoadmap(dir, { parkingLotBody: '- SMS reminders\n' })
  const present = mark(dir, 'roadmap-written')
  assert.strictEqual(present.status, 0,
    'AC-7: once the claim is added under Parking lot, roadmap-written must accept: got ' + present.status + ' stdout=' + present.stdout + ' stderr=' + present.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260910-05-10
// ---------------------------------------------------------------------------
test('AC-20260910-05-10: `--mark roadmap-written` with no exclusion rows in the ledger CONTINUES TO run the existing journey-placement checks and accept a roadmap that passes them', () => {
  const dir = tmpdir('roadmap-parking-lot-none')
  advanceToRoadmap(dir)
  assert.ok(!fs.existsSync(path.join(dir, 'design/mocks/ledger.md')),
    'test setup requires a data-ml (non-visual) host to carry no design/mocks/ledger.md at all')
  writeRoadmap(dir, { parkingLotBody: null })
  const r = mark(dir, 'roadmap-written')
  assert.strictEqual(r.status, 0,
    'AC-10: with no exclusion rows to check, roadmap-written must CONTINUE TO accept a roadmap that already passes the pre-existing journey-placement checks: got ' + r.status + ' stdout=' + r.stdout + ' stderr=' + r.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260910-05-7 (BRIEF step count) — D6's second half: "the BRIEF step's read-only list
// gains the exclusion count". Neither AC-7 above (roadmap-written's parking-lot refusal) nor
// AC-10 (its no-exclusions pass-through) touches the BRIEF step's own printed text at all, so
// this half of D6 was landing unasserted — this case executes BRIEF directly (`bare(dir)`,
// before `--mark brief-written`) on a VISUAL archetype (only VISUAL_ARCHETYPES print the
// exclusions branch at all — data-ml, used by advanceToRoadmap above, is DISCOVERY-only per D4
// and never reaches this text) with mocks APPROVED and one confirmed exclusion row.
// ---------------------------------------------------------------------------
function advanceToVisualBrief(dir) {
  bare(dir)
  writeBrief(dir, { picks: ['- archetype: web-app'] })
  const disco = mark(dir, 'discovery-done')
  assert.strictEqual(disco.status, 0, 'test setup requires discovery-done to be accepted for web-app: ' + disco.stderr)
  writeJSON(path.join(dir, 'design/mocks/status.json'), { schemaVersion: 1, state: 'APPROVED', journeys: {} })
}

// ---------------------------------------------------------------------------
// specs/20260911/05-approval-is-bookkeeping.md D5: `fencedExclusionRows` widens the parking-lot
// requirement from `confirmed`-only to `confirmed` OR `open` rows — an item the client never
// answered is "not contested", not silently unfenced. AC-20260911-05-8.
// ---------------------------------------------------------------------------
test('AC-20260911-05-8: `--mark roadmap-written` also fences an `open` (not-contested) exclusion row, naming it "not contested" in the refusal, never requires an `overridden`/client-needed row, and the BRIEF step\'s count line reads "<a> agreed · <n> not contested"', () => {
  const dir = tmpdir('roadmap-parking-lot-not-contested')
  advanceToRoadmap(dir)
  writeExclusionRows(dir, [
    { id: 'E1', claim: 'SMS reminders', note: 'non-goal: SMS reminders', status: 'confirmed 2026-09-11' },
    { id: 'E2', claim: 'Multi-currency', note: 'non-goal: Multi-currency', status: 'open' },
    { id: 'E3', claim: 'Offline mode', note: 'non-goal: Offline mode', status: 'overridden 2026-09-11', rejected: 'client-needed' },
  ])

  // Only the confirmed row is fenced so far — the open row must ALSO be required, and the
  // client-needed overridden row must never be.
  writeRoadmap(dir, { parkingLotBody: '- SMS reminders\n' })
  const missing = mark(dir, 'roadmap-written')
  assert.strictEqual(missing.status, 2,
    'AC-8: roadmap-written must refuse while the OPEN exclusion E2\'s claim is absent from the Parking lot — D5 widens the fence to open rows, not confirmed-only: got ' + missing.status + ' stdout=' + missing.stdout + ' stderr=' + missing.stderr)
  assert.match(missing.stderr, /exclusion "Multi-currency" \(E2, not contested\) is not in the parking lot/,
    'AC-8: the refusal for an open row must name it "not contested", distinguishing it from a confirmed (agreed) one: got ' + missing.stderr)
  assert.ok(!/Offline mode/.test(missing.stderr),
    'AC-8: the client-needed overridden row (E3) must never be named in the refusal — it is a feature the client asked for, fenced nowhere: got ' + missing.stderr)

  writeRoadmap(dir, { parkingLotBody: '- SMS reminders\n- Multi-currency\n' })
  const present = mark(dir, 'roadmap-written')
  assert.strictEqual(present.status, 0,
    'AC-8: once both the agreed and the not-contested claims are under Parking lot (with the client-needed row never required), roadmap-written must accept: got ' + present.status + ' stdout=' + present.stdout + ' stderr=' + present.stderr)
})

test('AC-20260911-05-8: the BRIEF step\'s count line reads "<a> agreed · <n> not contested" in place of "exclusions confirmed: <n>"', () => {
  const dir = tmpdir('roadmap-parking-lot-brief-count-2')
  advanceToVisualBrief(dir)
  writeExclusionRows(dir, [
    { id: 'E1', claim: 'SMS reminders', note: 'non-goal: SMS reminders', status: 'confirmed 2026-09-11' },
    { id: 'E2', claim: 'Multi-currency', note: 'non-goal: Multi-currency', status: 'open' },
  ])

  const brief = bare(dir)
  assert.match(brief.stdout, /## Step: brief/,
    'test setup requires the driver to still be sitting at BRIEF before brief-written is marked: got ' + brief.stdout)
  assert.match(brief.stdout, /· exclusions: 1 agreed · 1 not contested/,
    'AC-8: the BRIEF step\'s derived-from line must read "1 agreed · 1 not contested" — the old "exclusions confirmed: <n>" phrasing counted only confirmed rows and is retired: got ' + brief.stdout)
  assert.ok(!/exclusions confirmed:/.test(brief.stdout),
    'AC-8: the retired "exclusions confirmed: <n>" phrasing must be gone, not merely joined by the new one: got ' + brief.stdout)
})
