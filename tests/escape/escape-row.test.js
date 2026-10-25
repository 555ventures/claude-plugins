'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20261025/01-the-commit-writes-the-escape-row.md D3/D4: `escape-row.js --check/--append`
// and `lib/escape-row.js`'s slim validator are the one writer of the escape row; --amend is a
// usage error. Each assertion fails differently (wrong status, wrong stdout/stderr shape) so a
// stub that merely exits non-zero cannot pass by accident.

const SCRIPT = 'scripts/escape-row.js'

function validEscapeRow(overrides = {}) {
  return {
    ts: '2026-10-25T00:00:00Z', stage: 'escape', spec: 'specs/1.md', files: ['a.js'],
    reviewRunId: null, class: null, sha: null, via: 'commit',
    ...overrides,
  }
}

function legacyEscapeRow(overrides = {}) {
  return {
    ts: '2026-09-01T00:00:00Z', stage: 'escape', spec: 'specs/1.md', file: 'a.js',
    reviewRunId: null, foundBy: 'user', severity: 'soft', killedMatch: 'maybe',
    class: null, unclassedReason: 'no-fix-diff', preventedBy: 'test', via: 'manual',
    ...overrides,
  }
}

function check(row) {
  return runNode(SCRIPT, ['--check', '--row', JSON.stringify(row)])
}

function seedLedger(root, file, rows) {
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude', file), rows.map(r => JSON.stringify(r)).join('\n') + '\n')
}

// Trailing-newline guard: a ledger seeded WITHOUT a trailing newline (e.g. by an older writer,
// or a session `printf` with no `\n`) followed by --append must not glue the new JSON straight
// onto the end of the last line, producing one unparseable line — every fleet-reader /
// spec-status read would silently drop BOTH the earlier row and the newly appended row from
// that line, with exit 0 masking the corruption.
test('escape-row.js --append prefixes a newline when the existing ledger does not end in one, so the prior row is never glued to the new one', () => {
  const root = tmpdir('escape-row-append-no-trailing-newline')
  // Legacy-shaped rows: the newline guard is independent of row shape and these validate before and after the slim shape lands.
  const original = legacyEscapeRow({ spec: 'specs/orig.md', file: 'orig.js', killedMatch: null, preventedBy: 'none' })
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude', 'spec-runs.jsonl'), JSON.stringify(original))

  const second = legacyEscapeRow({ spec: 'specs/second.md', file: 'second.js', killedMatch: null, preventedBy: 'none' })
  const r = runNode(SCRIPT, ['--append', '--root', root, '--row', JSON.stringify(second)])
  assert.strictEqual(r.status, 0, 'appending a valid row to a newline-less ledger must still succeed: ' + r.stderr)

  const content = fs.readFileSync(path.join(root, '.claude', 'spec-runs.jsonl'), 'utf8')
  assert.ok(content.endsWith('\n'), 'the ledger must end in a newline after --append, or the NEXT append glues onto this one too')
  const lines = content.split('\n').filter(l => l.length > 0)
  assert.strictEqual(lines.length, 2, 'the pre-existing row and the newly appended row must be on two separate lines — one glued line silently drops both rows from every fleet-reader / spec-status count that globs this ledger: ' + JSON.stringify(content))
  assert.deepStrictEqual(JSON.parse(lines[0]), original, 'line 1 must still parse back to the original seeded row untouched — a corrupted merge would lose the original escape row from the fleet count')
  assert.deepStrictEqual(JSON.parse(lines[1]), second, 'line 2 must parse back to the newly appended row — a corrupted merge would lose the appended escape row from the fleet count')
})

test('AC-20261025-01-1: escape-row.js --check accepts the slim row and a legacy row (dropped fields ignored) and names exactly one closed reason per malformed field on stdout at exit 1', () => {
  const slim = check(validEscapeRow())
  assert.strictEqual(slim.status, 0, 'the slim D3 row must validate or the commit-time writer can never append it: ' + slim.stdout + slim.stderr)
  assert.strictEqual(slim.stdout, '', 'a valid row must print nothing — stray output on exit 0 would be parsed as reasons by callers')

  const legacy = check(legacyEscapeRow())
  assert.strictEqual(legacy.status, 0, 'a legacy row (file string, six dropped fields with arbitrary values) must still validate or twenty fleet-ledger rows fall out of shape: ' + legacy.stdout + legacy.stderr)

  const noFiles = validEscapeRow()
  delete noFiles.files
  const cases = [
    ['an empty files array', validEscapeRow({ files: [] }), ['files-missing']],
    ['neither file nor files', noFiles, ['files-missing']],
    ['a malformed class', validEscapeRow({ class: 'Bad Class' }), ['class-malformed']],
    ['a malformed sha', validEscapeRow({ sha: 'abc' }), ['sha-malformed']],
    ['a via outside the enum', validEscapeRow({ via: 'loop' }), ['via-out-of-enum']],
    ['a non-string files entry', validEscapeRow({ files: ['a.js', 7] }), ['files-entry-not-string']],
  ]
  for (const [label, row, expected] of cases) {
    const r = check(row)
    assert.strictEqual(r.status, 1, label + ' must refuse at exit 1, not slip into the ledger: ' + r.stdout + r.stderr)
    assert.deepStrictEqual(r.stdout.trim().split('\n'), expected, label + ' must print exactly its closed reason, one per line — a wrong or extra reason misdirects the repair: ' + r.stdout)
  }

  const ok = check(validEscapeRow({ sha: 'a'.repeat(40), class: 'silent-fallback', reviewRunId: 'rv_abc', via: 'spec-fix' }))
  assert.strictEqual(ok.status, 0, 'a 40-hex sha, kebab class and spec-fix via are all in contract and must validate: ' + ok.stdout + ok.stderr)
})

test('AC-20261025-01-2: escape-row.js --amend exits 2 naming --check and --append (never --amend) on stderr and appends nothing', () => {
  const root = tmpdir('escape-row-amend-retired')
  const r = runNode(SCRIPT, ['--amend', '--root', root, '--escape-ts', 'x', '--spec', 's', '--file', 'f', '--class', 'c'])
  assert.strictEqual(r.status, 2, '--amend is retired and must be a usage error, not an amendment write: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /--check/, 'the usage text must name --check so the caller learns the surviving modes')
  assert.match(r.stderr, /--append/, 'the usage text must name --append so the caller learns the surviving modes')
  assert.doesNotMatch(r.stderr, /--amend/, 'naming --amend in the usage text keeps advertising a retired mode')
  assert.ok(!fs.existsSync(path.join(root, '.claude', 'spec-runs.jsonl')), 'a refused --amend must append nothing to the ledger')
})

test('AC-20261025-01-3: escape-row.js --append exits 3 naming the shared file when the same spec shares any file, and with --allow-duplicate or a disjoint file appends one line printing files=<n> with no key= suffix', () => {
  const root = tmpdir('escape-row-shared-file')
  seedLedger(root, 'spec-runs.jsonl', [{ ts: '2026-09-01T00:00:00Z', stage: 'escape', spec: 'specs/1.md', file: 'a.js', class: null, via: 'manual' }])
  const lines = () => fs.readFileSync(path.join(root, '.claude', 'spec-runs.jsonl'), 'utf8').split('\n').filter(l => l.trim()).length

  const dup = runNode(SCRIPT, ['--append', '--root', root, '--row', JSON.stringify(validEscapeRow({ files: ['b.js', 'a.js'] }))])
  assert.strictEqual(dup.status, 3, 'a row sharing a.js with an existing same-spec escape row must refuse — the false-CLEAN count would double-charge one defect: ' + dup.stdout + dup.stderr)
  assert.match(dup.stderr, /a\.js/, 'stderr must name the shared file so the session can compare the diagnoses')
  assert.strictEqual(lines(), 1, 'a refused append must write nothing')

  const allowed = runNode(SCRIPT, ['--append', '--root', root, '--allow-duplicate', '--row', JSON.stringify(validEscapeRow({ files: ['b.js', 'a.js'] }))])
  assert.strictEqual(allowed.status, 0, '--allow-duplicate must let a distinct defect through: ' + allowed.stdout + allowed.stderr)
  assert.strictEqual(allowed.stdout.trim(), 'appended spec=specs/1.md files=2 reviewRunId=null', 'the confirmation line is the machine contract: spec, files count, reviewRunId')
  assert.doesNotMatch(allowed.stdout, /key=/, 'the key= suffix fed the retired owed query and must not be printed')
  assert.strictEqual(lines(), 2, '--allow-duplicate must append exactly one line')

  const disjoint = runNode(SCRIPT, ['--append', '--root', root, '--row', JSON.stringify(validEscapeRow({ files: ['c.js'] }))])
  assert.strictEqual(disjoint.status, 0, 'a same-spec row with no shared file is a distinct defect and must append: ' + disjoint.stdout + disjoint.stderr)
  assert.strictEqual(disjoint.stdout.trim(), 'appended spec=specs/1.md files=1 reviewRunId=null', 'a one-file row prints files=1')
  assert.strictEqual(lines(), 3, 'the disjoint append must add exactly one line')
})
