'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, read, tmpdir, runNode, gitRepo } = require('../helpers')
const { writeConfig, readRows } = require('./release-legs.fixtures')

// specs/20261029/04-the-four-questions-that-did-not-exist.md D2/D2a/D2b:
// AC-20261029-04-3 (the rollback subcommand), AC-20261029-04-4 (release.md and the contract),
// AC-20261029-04-5 (verdict.js copies the rollback result onto the release ledger row).

const SCRIPT = 'scripts/release-legs.js'
const VERDICT = 'scripts/verdict.js'

const GREEN_LEGS = [
  { leg: 'deploy', exit: 0, observed: { result: 'pass' } },
  { leg: 'ready', exit: 0, observed: { result: 'pass' } },
  { leg: 'e2e', exit: 0, observed: { passed: 10, failed: 0, skipped: 2 } },
  { leg: 'journeys', exit: 0, observed: { walked: 5, failed: 0 } },
  { leg: 'substrate', exit: 0, observed: { checked: 8, failed: 0, inert: 1 } },
  { leg: 'ci', exit: 0, observed: { conclusion: 'success' } },
]

// A synthetic host with an optional rollbackCommand and a manifest holding the green legs plus
// a production row of the given result (null = no production row).
function host(rollbackCommand, productionResult) {
  const dir = fs.realpathSync(tmpdir('rb'))
  gitRepo(dir)
  writeConfig(dir, {
    release: { deployCommand: 'true', ...(rollbackCommand === null ? {} : { rollbackCommand }) },
    capabilities: { forge: 'none' },
  })
  const rows = [...GREEN_LEGS]
  if (productionResult) rows.push({ leg: 'production', exit: productionResult === 'verified' ? 0 : 1, observed: { result: productionResult } })
  const manifest = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(manifest, rows.map(r => JSON.stringify(r)).join('\n') + '\n')
  return { dir, manifest }
}

const rollback = (h, decision, extra = []) =>
  runNode(SCRIPT, ['rollback', '--root', h.dir, '--manifest', h.manifest, '--decision', decision, ...extra])
const rollbackRows = (h) => readRows(h.manifest).filter(r => r.leg === 'rollback')

test('AC-20261029-04-3: WHEN production failed and the configured command succeeds THE SYSTEM SHALL run it in --root and append a rolled-back row with exit 0', () => {
  const h = host('echo rolled > rolled.txt', 'failed')
  const r = rollback(h, 'run')
  assert.strictEqual(r.status, 0, 'a successful rollback command must exit 0: ' + r.stdout + r.stderr)
  assert.ok(fs.existsSync(path.join(h.dir, 'rolled.txt')), 'the command must run with cwd = --root, or the host rollback never happens: ' + r.stderr)
  assert.deepStrictEqual(rollbackRows(h), [{ leg: 'rollback', exit: 0, observed: { result: 'rolled-back' } }],
    'the manifest must record exactly one rolled-back row so the ledger shows production was restored: ' + JSON.stringify(readRows(h.manifest)))
})

test('AC-20261029-04-3: WHEN the configured command exits non-zero THE SYSTEM SHALL append a failed row and exit 1', () => {
  const h = host('exit 3', 'failed')
  const r = rollback(h, 'run')
  assert.strictEqual(r.status, 1, 'a failing rollback command must exit 1 so the session reports production is still down: ' + r.stdout + r.stderr)
  assert.deepStrictEqual(rollbackRows(h), [{ leg: 'rollback', exit: 1, observed: { result: 'failed' } }],
    'a failed rollback must be recorded as failed, never rolled-back: ' + JSON.stringify(readRows(h.manifest)))
})

test('AC-20261029-04-3: WHEN no rollbackCommand is configured THE SYSTEM SHALL append an unavailable row and exit 1', () => {
  const h = host(null, 'failed')
  const r = rollback(h, 'run')
  assert.strictEqual(r.status, 1, 'run with no command must exit 1 — nothing was rolled back: ' + r.stdout + r.stderr)
  assert.deepStrictEqual(rollbackRows(h), [{ leg: 'rollback', exit: 1, observed: { result: 'unavailable' } }],
    'a missing command must be recorded as unavailable so the gap is visible in the ledger: ' + JSON.stringify(readRows(h.manifest)))
})

test('AC-20261029-04-3: WHEN the decision is decline THE SYSTEM SHALL append a declined row with exit 0 and run nothing', () => {
  const h = host('echo rolled > rolled.txt', 'failed')
  const r = rollback(h, 'decline')
  assert.strictEqual(r.status, 0, 'a declined rollback is the owner\'s answer, not an error: ' + r.stdout + r.stderr)
  assert.ok(!fs.existsSync(path.join(h.dir, 'rolled.txt')), 'declining must not run the command, or the owner\'s no is ignored')
  assert.deepStrictEqual(rollbackRows(h), [{ leg: 'rollback', exit: 0, observed: { result: 'declined' } }],
    'the decline must be recorded: ' + JSON.stringify(readRows(h.manifest)))
})

test('AC-20261029-04-3: WHEN production is verified or absent, or a rollback row already exists THE SYSTEM SHALL exit 2 and append nothing', () => {
  const ok = host('echo rolled > rolled.txt', 'failed')
  assert.strictEqual(rollback(ok, 'run').status, 0, 'setup: the first rollback on a failed production must succeed, or the refusals below prove nothing')
  const dup = rollback(ok, 'run')
  assert.strictEqual(dup.status, 2, 'a second rollback row must be refused like a duplicate append: ' + dup.stdout + dup.stderr)
  assert.strictEqual(rollbackRows(ok).length, 1, 'a refused duplicate must append nothing: ' + JSON.stringify(readRows(ok.manifest)))

  for (const [label, result] of [['verified', 'verified'], ['absent', null]]) {
    const h = host('echo rolled > rolled.txt', result)
    const before = fs.readFileSync(h.manifest, 'utf8')
    const r = rollback(h, 'run')
    assert.strictEqual(r.status, 2, `production ${label} must refuse the rollback (exit 2), or a healthy production gets rolled back: ` + r.stdout + r.stderr)
    assert.strictEqual(fs.readFileSync(h.manifest, 'utf8'), before, `a refused rollback (${label}) must leave the manifest byte-identical`)
    assert.ok(!fs.existsSync(path.join(h.dir, 'rolled.txt')), `a refused rollback (${label}) must not run the command`)
  }
})

function sectionOf(text, heading) {
  const m = text.match(new RegExp('^## ' + heading + '[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))', 'm'))
  return m ? m[1] : ''
}

test('AC-20261029-04-4: WHEN release.md and the grounding contract are read THE SYSTEM SHALL carry the rollback step, its question and the rollbackCommand field', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'spec/commands/release.md')), 'release.md is missing')
  const release = read('spec/commands/release.md')
  const p3 = sectionOf(release, 'Phase 3')
  assert.ok(p3.includes('release-legs)" rollback'), 'Phase 3 must invoke the rollback subcommand, or a failed production still stops with no path back')
  assert.match(p3, /AskUserQuestion[\s\S]*Roll back \(Recommended\)/, 'Phase 3 must ask with "Roll back (Recommended)" first, or the safe default is not one keypress')
  assert.ok(sectionOf(release, 'Phase 0').includes('rollbackCommand'), 'Phase 0 must list rollbackCommand beside promoteCommand, or hosts never learn to declare it')
  assert.ok(sectionOf(read('spec/templates/grounding-contract.md'), 'Release').includes('rollbackCommand'),
    'the grounding contract § Release must name rollbackCommand, or hosts have no documented field')
})

test('AC-20261029-04-5: WHEN verdict.js derives a release row over production failed plus a rolled-back row THE SYSTEM SHALL print GATE_RED and put rollback right after production; without the row no rollback key', () => {
  const withRow = host(null, 'failed')
  fs.appendFileSync(withRow.manifest, JSON.stringify({ leg: 'rollback', exit: 0, observed: { result: 'rolled-back' } }) + '\n')
  const r = runNode(VERDICT, ['--manifest', withRow.manifest, '--profile', 'release', '--ledger'], { cwd: withRow.dir })
  const lines = r.stdout.trim().split('\n')
  assert.strictEqual(lines[0], 'GATE_RED', 'a rolled-back production is still a failed release; any other word promotes it: ' + r.stdout + r.stderr)
  const row = JSON.parse(lines[1])
  assert.strictEqual(row.production, 'failed', 'the ledger must keep production as failed: ' + JSON.stringify(row))
  assert.strictEqual(row.rollback, 'rolled-back', 'the ledger row must copy the rollback result, or the recovery is invisible: ' + JSON.stringify(row))
  const keys = Object.keys(row)
  assert.strictEqual(keys.indexOf('rollback'), keys.indexOf('production') + 1, 'rollback must sit immediately after production in the row: ' + keys.join(','))

  const without = host(null, 'failed')
  const r2 = runNode(VERDICT, ['--manifest', without.manifest, '--profile', 'release', '--ledger'], { cwd: without.dir })
  const row2 = JSON.parse(r2.stdout.trim().split('\n')[1])
  assert.ok(!('rollback' in row2), 'no rollback row in the manifest means no rollback key, or every old release row changes shape: ' + JSON.stringify(row2))
  assert.strictEqual(row2.production, 'failed', 'setup: the control row must still carry production failed: ' + JSON.stringify(row2))
})
