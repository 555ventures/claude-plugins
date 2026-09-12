'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260901/07-escape-class-contract.md D1/D2: fleet-reader's escape-reason enums were
// inline and no script owned the escape ledger append, so a session `printf` could write
// `preventedBy:"test"`/`foundBy:"build"` rows straight into a fleet ledger. `escape-row.js
// --check/--append/--amend` and its validator module `lib/escape-row.js`'s closed reason set are
// the one shared home. Each assertion is written to fail differently (wrong status, wrong
// stdout/stderr shape) so a future stub that merely exits non-zero cannot pass by accident.

const SCRIPT = 'scripts/escape-row.js'

function validEscapeRow(overrides = {}) {
  return {
    ts: '2026-09-01T00:00:00Z', stage: 'escape', spec: 'specs/1.md', file: 'a.js',
    reviewRunId: null, foundBy: 'user', severity: 'soft', killedMatch: null,
    class: null, unclassedReason: 'no-fix-diff', preventedBy: 'none', via: 'manual',
    ...overrides,
  }
}

function validAmendmentRow(overrides = {}) {
  return {
    ts: '2026-09-01T00:00:00Z', stage: 'escape-class', spec: 'specs/1.md', file: 'a.js',
    escapeTs: '2026-08-01T00:00:00Z', class: 'silent-fallback', unclassedReason: null,
    via: 'manual', ...overrides,
  }
}

function check(row) {
  return runNode(SCRIPT, ['--check', '--row', JSON.stringify(row)])
}

function seedLedger(root, file, rows) {
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude', file), rows.map(r => JSON.stringify(r)).join('\n') + '\n')
}

function lastLine(root, file) {
  const lines = fs.readFileSync(path.join(root, '.claude', file), 'utf8').split('\n').filter(l => l.trim())
  return JSON.parse(lines[lines.length - 1])
}

// Trailing-newline guard: a ledger seeded WITHOUT a trailing newline (e.g. by an older writer,
// or a session `printf` with no `\n`) followed by --append must not glue the new JSON straight
// onto the end of the last line, producing one unparseable line — every fleet-reader /
// spec-status read would silently drop BOTH the earlier row and the newly appended row from
// that line, with exit 0 masking the corruption.
test('escape-row.js --append prefixes a newline when the existing ledger does not end in one, so the prior row is never glued to the new one', () => {
  const root = tmpdir('escape-row-append-no-trailing-newline')
  const original = validEscapeRow({ spec: 'specs/orig.md', file: 'orig.js' })
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude', 'spec-runs.jsonl'), JSON.stringify(original))

  const second = validEscapeRow({ spec: 'specs/second.md', file: 'second.js' })
  const r = runNode(SCRIPT, ['--append', '--root', root, '--row', JSON.stringify(second)])
  assert.strictEqual(r.status, 0, 'appending a valid row to a newline-less ledger must still succeed: ' + r.stderr)

  const content = fs.readFileSync(path.join(root, '.claude', 'spec-runs.jsonl'), 'utf8')
  assert.ok(content.endsWith('\n'), 'the ledger must end in a newline after --append, or the NEXT append glues onto this one too')
  const lines = content.split('\n').filter(l => l.length > 0)
  assert.strictEqual(lines.length, 2, 'the pre-existing row and the newly appended row must be on two separate lines — one glued line silently drops both rows from every fleet-reader / spec-status count that globs this ledger: ' + JSON.stringify(content))
  assert.deepStrictEqual(JSON.parse(lines[0]), original, 'line 1 must still parse back to the original seeded row untouched — a corrupted merge would lose the original escape row from the fleet count')
  assert.deepStrictEqual(JSON.parse(lines[1]), second, 'line 2 must parse back to the newly appended row — a corrupted merge would lose the appended escape row from the fleet count')
})

test('escape-row.js --amend prefixes a newline when the existing ledger does not end in one, so the amendment is never glued onto the row it amends', () => {
  const root = tmpdir('escape-row-amend-no-trailing-newline')
  const original = validEscapeRow({ ts: '2026-08-15T00:00:00Z', spec: 'specs/amend-target.md', file: 'amend-target.js', class: null, unclassedReason: null })
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude', 'spec-runs.jsonl'), JSON.stringify(original))

  const r = runNode(SCRIPT, ['--amend', '--root', root, '--escape-ts', original.ts, '--spec', original.spec, '--file', original.file, '--class', 'silent-fallback'])
  assert.strictEqual(r.status, 0, 'amending a row read out of a newline-less ledger must still succeed: ' + r.stderr)

  const content = fs.readFileSync(path.join(root, '.claude', 'spec-runs.jsonl'), 'utf8')
  assert.ok(content.endsWith('\n'), 'the ledger must end in a newline after --amend, or the next reader/writer glues onto this amendment')
  const lines = content.split('\n').filter(l => l.length > 0)
  assert.strictEqual(lines.length, 2, 'the original escape row and the new escape-class amendment must be on two separate lines — one glued line silently drops both the original row and the amendment from every fleet-reader / spec-status count: ' + JSON.stringify(content))
  assert.deepStrictEqual(JSON.parse(lines[0]), original, 'line 1 must still parse back to the original seeded escape row untouched')
  const amended = JSON.parse(lines[1])
  assert.strictEqual(amended.stage, 'escape-class', 'line 2 must parse as the appended amendment row, carrying stage:"escape-class"')
  assert.strictEqual(amended.class, 'silent-fallback', 'the appended amendment must carry the requested class')
})

// AC-20260901-07-5
test('AC-20260901-07-5: escape-row.js --amend appends one escape-class row defaulting via to "manual" and prints the amended confirmation', () => {
  const root = tmpdir('escape-row-amend')
  const original = validEscapeRow({ ts: '2026-08-15T00:00:00Z', spec: 'specs/target.md', file: 'target.js', class: null, unclassedReason: null })
  seedLedger(root, 'spec-runs.jsonl', [original])
  const before = Date.now()
  const r = runNode(SCRIPT, ['--amend', '--root', root, '--escape-ts', original.ts, '--spec', original.spec, '--file', original.file, '--class', 'silent-fallback'])
  assert.strictEqual(r.status, 0, 'amending a row whose key matches an existing escape row in the ledger must succeed: ' + r.stderr)
  assert.match(r.stdout, /amended escapeTs=2026-08-15T00:00:00Z spec=specs\/target\.md file=target\.js class=silent-fallback/,
    'D2 Contracts: the confirmation line names escapeTs/spec/file/class exactly so a backfill session can verify what landed')
  const appended = lastLine(root, 'spec-runs.jsonl')
  assert.strictEqual(appended.stage, 'escape-class', 'the appended row must carry stage:"escape-class"')
  assert.strictEqual(appended.escapeTs, original.ts, 'escapeTs must be the original row\'s ts verbatim, the join key\'s anchor')
  assert.strictEqual(appended.spec, original.spec, 'D3: keyed by escapeTs+spec+file — spec must be copied through unchanged')
  assert.strictEqual(appended.file, original.file, 'D3: file must be copied through unchanged')
  assert.strictEqual(appended.class, 'silent-fallback', 'the requested class must land on the appended amendment')
  assert.strictEqual(appended.unclassedReason, null, 'a --class amendment must carry unclassedReason:null, never leaving both fields populated')
  assert.strictEqual(appended.via, 'manual', 'D3/AC-5: with no --via flag, the amendment defaults to "manual", never "backfill" (backfill must be requested explicitly)')
  assert.match(appended.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/, 'the amendment row\'s own ts must be a fresh ISO-8601 timestamp, not copied from escapeTs')
  assert.ok(Date.parse(appended.ts) >= before - 1000, 'the amendment ts must be generated at append time, not a stale or fabricated value')
})

// AC-20260901-07-6
test('AC-20260901-07-6: escape-row.js --amend exits 3 and appends nothing when the key matches no escape row, and --unclassed-reason/--via backfill append that shape', () => {
  const root = tmpdir('escape-row-amend-nomatch')
  seedLedger(root, 'spec-runs.jsonl', [validEscapeRow({ ts: '2026-08-15T00:00:00Z', spec: 'specs/real.md', file: 'real.js' })])
  const wrongTs = runNode(SCRIPT, ['--amend', '--root', root, '--escape-ts', '2020-01-01T00:00:00Z', '--spec', 'specs/real.md', '--file', 'real.js', '--class', 'silent-fallback'])
  assert.strictEqual(wrongTs.status, 3, 'an --escape-ts that matches no row\'s key must refuse, not append an orphan amendment nothing can join: ' + wrongTs.stdout)
  assert.match(wrongTs.stderr, /2020-01-01T00:00:00Z/, 'D2 Contracts: "nothing appended, stderr names the remedy (--allow-duplicate / the exact key that was searched)" — the searched escapeTs must appear on stderr so the mismatch is diagnosable')
  assert.match(wrongTs.stderr, /specs\/real\.md/, 'the searched spec must also appear in the printed key')
  assert.match(wrongTs.stderr, /real\.js/, 'the searched file must also appear in the printed key')
  const linesAfterWrongTs = fs.readFileSync(path.join(root, '.claude', 'spec-runs.jsonl'), 'utf8').trim().split('\n').length
  assert.strictEqual(linesAfterWrongTs, 1, 'a refused --amend must append nothing')

  const differentRoot = tmpdir('escape-row-amend-elsewhere')
  seedLedger(differentRoot, 'spec-runs.jsonl', [])
  const elsewhere = runNode(SCRIPT, ['--amend', '--root', differentRoot, '--escape-ts', '2026-08-15T00:00:00Z', '--spec', 'specs/real.md', '--file', 'real.js', '--class', 'silent-fallback'])
  assert.strictEqual(elsewhere.status, 3, 'the same key searched in a different root (one whose ledger never had the row) must also refuse — --amend must not consult any other root\'s ledger')

  const backfilled = runNode(SCRIPT, ['--amend', '--root', root, '--escape-ts', '2026-08-15T00:00:00Z', '--spec', 'specs/real.md', '--file', 'real.js', '--unclassed-reason', 'no-fix-diff', '--via', 'backfill'])
  assert.strictEqual(backfilled.status, 0, 'a matching key with --unclassed-reason and --via backfill must succeed: ' + backfilled.stderr)
  const appended = lastLine(root, 'spec-runs.jsonl')
  assert.strictEqual(appended.class, null, '--unclassed-reason must append class:null, never a guessed class')
  assert.strictEqual(appended.unclassedReason, 'no-fix-diff', 'the requested unclassedReason must land on the appended amendment')
  assert.strictEqual(appended.via, 'backfill', 'an explicit --via backfill must be honored, not overridden by the manual default')
})

// specs/20260912/04-softs-get-a-reader.md D3: killedMatch and softMatch are validated by one
// shared tri-state predicate — absent, true, false or null passes; any other value is a reason.
// escape-row.js's --check/--append print each validateEscapeRow reason on STDOUT (never stderr —
// confirmed by reading printReasons()/mode==='check'/mode==='append' as shipped; D3 only extends
// the reason set inside lib/escape-row.js, it does not touch the CLI's I/O plumbing), so this
// test pins the actual stream rather than the Contracts block's illustrative "stderr" wording.
test('AC-20260912-04-1: escape-row.js --append refuses a row whose killedMatch or softMatch value is outside the tri-state (absent/true/false/null), naming the reason on stdout at exit 1, and accepts the row when both are absent-or-in-range', () => {
  const root = tmpdir('escape-row-tristate')

  const badSoft = validEscapeRow({ spec: 'specs/soft.md', file: 'soft.js', softMatch: 'yes' })
  const rSoft = runNode(SCRIPT, ['--append', '--root', root, '--row', JSON.stringify(badSoft)])
  assert.strictEqual(rSoft.status, 1, 'a softMatch value outside {true,false,null,absent} must refuse, not silently ride into the ledger: ' + rSoft.stdout + rSoft.stderr)
  assert.match(rSoft.stdout, /softMatch-out-of-enum/, 'D3 Contracts: the refusal must name the reason "softMatch-out-of-enum" so a session or backfill agent can diagnose it: ' + rSoft.stdout)

  const badKilled = validEscapeRow({ spec: 'specs/killed.md', file: 'killed.js', killedMatch: 0 })
  const rKilled = runNode(SCRIPT, ['--append', '--root', root, '--row', JSON.stringify(badKilled)])
  assert.strictEqual(rKilled.status, 1, 'a killedMatch value outside {true,false,null,absent} (here the number 0, not the boolean false) must refuse: ' + rKilled.stdout + rKilled.stderr)
  assert.match(rKilled.stdout, /killedMatch-out-of-enum/, 'D3: killedMatch has never been validated before this spec — shipping softMatch validated while its twin stays open is the asymmetry D3 exists to close: ' + rKilled.stdout)

  const badBoth = validEscapeRow({ spec: 'specs/both.md', file: 'both.js', killedMatch: 'nope', softMatch: 42 })
  const rBoth = runNode(SCRIPT, ['--append', '--root', root, '--row', JSON.stringify(badBoth)])
  assert.strictEqual(rBoth.status, 1, 'a row with both fields out of range must still refuse once: ' + rBoth.stdout + rBoth.stderr)
  const bothLines = rBoth.stdout.trim().split('\n')
  assert.deepStrictEqual(bothLines, ['killedMatch-out-of-enum', 'softMatch-out-of-enum'],
    'Contracts: the reason list emits killedMatch-out-of-enum THEN softMatch-out-of-enum, appended after the three existing enum reasons in that order: ' + rBoth.stdout)

  const good = validEscapeRow({ spec: 'specs/good.md', file: 'good.js', softMatch: null })
  delete good.killedMatch
  const rGood = runNode(SCRIPT, ['--append', '--root', root, '--row', JSON.stringify(good)])
  assert.strictEqual(rGood.status, 0, 'softMatch:null and no killedMatch key at all must both be accepted — absent stays valid because every historical escape row predates softMatch (A4): ' + rGood.stdout + rGood.stderr)

  const content = fs.readFileSync(path.join(root, '.claude', 'spec-runs.jsonl'), 'utf8')
  const lines = content.trim().split('\n')
  assert.strictEqual(lines.length, 1, 'the three refused rows (bad softMatch, bad killedMatch, both bad) must append nothing — only the one valid row may reach the ledger: ' + content)
  assert.strictEqual(JSON.parse(lines[0]).file, 'good.js', 'the single ledger line must be the accepted row, not one of the refused ones: ' + content)
})

