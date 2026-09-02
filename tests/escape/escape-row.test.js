'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// Escape class contract (specs/20260901/07-escape-class-contract.md, 2026-09-01, brief 19): the
// brief's "nothing validates a class" defect — fleet-reader's enums were inline and no script
// owned the escape ledger append, so a session `printf` could (and did) write
// `preventedBy:"test"`/`foundBy:"build"` rows straight into a fleet ledger. D1/D2 give the CLI
// and its validator module one shared home: `escape-row.js --check/--append/--amend` against
// `lib/escape-row.js`'s closed reason set. Neither file exists yet (TDD red phase) — every
// runNode call below currently fails on the missing script, not on the asserted behavior; each
// assertion is written to fail differently (wrong status, wrong stdout/stderr shape) so a future
// stub that merely exits non-zero cannot pass by accident.

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

// AC-20260901-07-1
test('AC-20260901-07-1: escape-row.js --check exits 1 printing exactly one violated reason name for a malformed escape row, and 0 for a valid one', () => {
  const ok = check(validEscapeRow())
  assert.strictEqual(ok.status, 0, 'a fully valid escape row (class null, unclassedReason no-fix-diff) must exit 0 — a script that always rejects would break every legitimate --append call: ' + ok.stderr)
  assert.strictEqual(ok.stdout.trim(), '', 'D2 Contracts: exit 0 prints nothing on stdout — any text here means a caller\'s script-parsing of --append output would misread a clean check as carrying reasons')

  const malformed = check(validEscapeRow({ class: 'Silent_Fallback', unclassedReason: null }))
  assert.strictEqual(malformed.status, 1, 'a class value with an uppercase letter and underscore violates CLASS_ID_RE — this must be a validation failure (exit 1), not a silent accept: ' + malformed.stderr)
  assert.strictEqual(malformed.stdout.trim(), 'class-malformed', 'D1 Contracts: the closed reason set spells this exact violation "class-malformed" — a different string or wording means callers scripting on this token break')

  const missing = check(validEscapeRow({ class: null, unclassedReason: null }))
  assert.strictEqual(missing.status, 1, 'class:null with no unclassedReason must fail — this is exactly the brief\'s "nothing validates a class" defect restated as a row with no class and no excuse')
  assert.strictEqual(missing.stdout.trim(), 'class-missing', 'the reason for a null class with no reason is "class-missing"')

  const withClassAndReason = check(validEscapeRow({ class: 'a-b', unclassedReason: 'deferred' }))
  assert.strictEqual(withClassAndReason.status, 1, 'a row cannot carry both a real class and an unclassedReason — the fields are meant to be mutually exclusive, one XOR the other')
  assert.strictEqual(withClassAndReason.stdout.trim(), 'unclassed-reason-with-class', 'D1 Contracts names this exact reason "unclassed-reason-with-class"')

  const badReason = check(validEscapeRow({ class: null, unclassedReason: 'because' }))
  assert.strictEqual(badReason.status, 1, 'unclassedReason must be one of the closed UNCLASSED_REASONS set (no-fix-diff, deferred) — a free-text excuse must be rejected the same way an out-of-enum preventedBy is')
  assert.strictEqual(badReason.stdout.trim(), 'unclassed-reason-out-of-enum', 'D1 Contracts names this exact reason "unclassed-reason-out-of-enum"')

  const badPreventedBy = check(validEscapeRow({ preventedBy: 'test' }))
  assert.strictEqual(badPreventedBy.status, 1, 'preventedBy:"test" is the literal historical defect this spec exists to prevent (D2 Rationale) — it must still be rejected')
  assert.strictEqual(badPreventedBy.stdout.trim(), 'preventedBy-out-of-enum', 'D1 keeps fleet-reader\'s existing spelling for this reason — a respelled token would break the drift census\'s existing bucket name')
})

// AC-20260901-07-2
test('AC-20260901-07-2: escape-row.js --check applies the amendment rules to a stage:"escape-class" row', () => {
  const noEscapeTs = check(validAmendmentRow({ escapeTs: undefined }))
  assert.strictEqual(noEscapeTs.status, 1, 'an amendment row without a string escapeTs cannot be joined to the escape row it amends — this must fail validation, not silently write an orphan amendment')
  assert.strictEqual(noEscapeTs.stdout.trim(), 'amendment-missing-escape-ts', 'D1 Contracts names this exact reason "amendment-missing-escape-ts"')

  const badVia = check(validAmendmentRow({ via: 'cron' }))
  assert.strictEqual(badVia.status, 1, 'via must be one of backfill|manual — an out-of-enum via must be rejected the same way an out-of-enum preventedBy is on an escape row')
  assert.strictEqual(badVia.stdout.trim(), 'amendment-via-out-of-enum', 'D1 Contracts names this exact reason "amendment-via-out-of-enum"')

  const missingClass = check(validAmendmentRow({ class: null, unclassedReason: null }))
  assert.strictEqual(missingClass.status, 1, 'an amendment with class:null and no reason repeats the same "nothing validates a class" defect on the amendment side — it must fail the same way an unclassed escape row does')
  assert.strictEqual(missingClass.stdout.trim(), 'class-missing', 'the same class-missing reason applies to amendment rows, not a separate amendment-specific name')

  const validAmend = check(validAmendmentRow())
  assert.strictEqual(validAmend.status, 0, 'a fully valid amendment row must exit 0: ' + validAmend.stderr)
  assert.strictEqual(validAmend.stdout.trim(), '', 'exit 0 prints nothing on stdout, same contract as a valid escape row')
})

// AC-20260901-07-3
test('AC-20260901-07-3: escape-row.js --append creates the ledger and appends exactly one canonicalized JSON line for a valid row, and touches nothing for an invalid one', () => {
  const root = tmpdir('escape-row-append')
  const row = validEscapeRow({ spec: 'specs/new.md', file: 'new.js' })
  const r = runNode(SCRIPT, ['--append', '--root', root, '--row', JSON.stringify(row)])
  assert.strictEqual(r.status, 0, 'appending a valid escape row to a root with no ledger must exit 0 and create the ledger, not fail because nothing existed yet: ' + r.stderr)
  assert.match(r.stdout, /appended spec=specs\/new\.md file=new\.js/, 'D2 Contracts: the exact confirmation line names the appended row\'s spec and file so a session can verify what landed')
  const ledgerPath = path.join(root, '.claude', 'spec-runs.jsonl')
  assert.ok(fs.existsSync(ledgerPath), 'AC-3: --append must create .claude/spec-runs.jsonl when it does not exist yet')
  const content = fs.readFileSync(ledgerPath, 'utf8')
  assert.strictEqual(content, JSON.stringify(JSON.parse(JSON.stringify(row))) + '\n',
    'the appended line must be exactly JSON.stringify(JSON.parse(row)) followed by one newline — any re-shaping, pretty-printing, or trailing content would corrupt every other reader (fleet-reader, spec-status) that globs this file')

  const badRow = validEscapeRow({ spec: 'specs/bad.md', file: 'bad.js', class: 'Bad_Id', unclassedReason: null })
  const before = fs.readFileSync(ledgerPath, 'utf8')
  const r2 = runNode(SCRIPT, ['--append', '--root', root, '--row', JSON.stringify(badRow)])
  assert.strictEqual(r2.status, 1, 'an invalid row must never be appended, so --append itself must refuse it with exit 1: ' + r2.stderr)
  assert.match(r2.stdout, /class-malformed/, 'the printed reason must name the actual violation, not a generic append failure')
  assert.strictEqual(fs.readFileSync(ledgerPath, 'utf8'), before,
    'D2 Contracts: "an invalid row -> exit 1 with reasons and the file untouched" — the ledger must be byte-identical after a rejected append')
})

// Review fix 2026-09-01 (soft finding on --append): trailing-newline guard
// A ledger seeded WITHOUT a trailing newline (e.g. by an older writer, or a session `printf`
// with no `\n`) followed by --append glued the new JSON straight onto the end of the last line,
// producing one unparseable line. Every fleet-reader / spec-status read silently drops BOTH the
// original row and the newly appended row from that line — the escaped defect is invisible to
// every count the pipeline derives from the ledger, with exit 0 masking the corruption.
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

// AC-20260901-07-4
test('AC-20260901-07-4: escape-row.js --append refuses a same-spec-and-file duplicate found in the live ledger or a spec-runs-2026.jsonl archive, unless --allow-duplicate', () => {
  const liveRoot = tmpdir('escape-row-dup-live')
  seedLedger(liveRoot, 'spec-runs.jsonl', [validEscapeRow({ spec: 'specs/dup.md', file: 'dup.js' })])
  const dupRow = validEscapeRow({ ts: '2026-09-02T00:00:00Z', spec: 'specs/dup.md', file: 'dup.js' })
  const refused = runNode(SCRIPT, ['--append', '--root', liveRoot, '--row', JSON.stringify(dupRow)])
  assert.strictEqual(refused.status, 3, 'a second escape row with the same spec and file in the live ledger must be refused (exit 3), the backstop behind escape.md step 2\'s own grep: ' + refused.stdout)
  assert.match(refused.stderr, /--allow-duplicate/, 'the refusal must name --allow-duplicate as the remedy on stderr — an error path without its remedy command is a hard finding (§ Review Checks)')
  const linesBefore = fs.readFileSync(path.join(liveRoot, '.claude', 'spec-runs.jsonl'), 'utf8').trim().split('\n').length
  assert.strictEqual(linesBefore, 1, 'the refused --append must not have appended anything')

  const allowed = runNode(SCRIPT, ['--append', '--root', liveRoot, '--row', JSON.stringify(dupRow), '--allow-duplicate'])
  assert.strictEqual(allowed.status, 0, 'the same call with --allow-duplicate must succeed: ' + allowed.stderr)
  const linesAfter = fs.readFileSync(path.join(liveRoot, '.claude', 'spec-runs.jsonl'), 'utf8').trim().split('\n').length
  assert.strictEqual(linesAfter, 2, '--allow-duplicate must actually append the second row, not silently no-op')

  // A9: the duplicate check must also see a spec-runs-2026.jsonl archive, not only the live ledger.
  const archiveRoot = tmpdir('escape-row-dup-archive')
  seedLedger(archiveRoot, 'spec-runs-2026.jsonl', [validEscapeRow({ spec: 'specs/arch.md', file: 'arch.js' })])
  const archiveDup = validEscapeRow({ ts: '2026-09-02T00:00:00Z', spec: 'specs/arch.md', file: 'arch.js' })
  const archiveRefused = runNode(SCRIPT, ['--append', '--root', archiveRoot, '--row', JSON.stringify(archiveDup)])
  assert.strictEqual(archiveRefused.status, 3, 'AC-4/A9: a same-spec-and-file duplicate living only in a spec-runs-2026.jsonl archive (not the live ledger) must be found and refused the same way — reading only the live file would silently let archived duplicates back in: ' + archiveRefused.stdout)
  assert.match(archiveRefused.stderr, /--allow-duplicate/, 'the archive-duplicate refusal must also name --allow-duplicate on stderr')
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

// AC-20260901-07-7
test('AC-20260901-07-7: escape-row.js --amend exits 2 on conflicting/missing class flags or a non-directory --root, and exits 1 with class-malformed for a bad --class id', () => {
  const root = tmpdir('escape-row-amend-usage')
  seedLedger(root, 'spec-runs.jsonl', [validEscapeRow({ ts: '2026-08-15T00:00:00Z', spec: 'specs/u.md', file: 'u.js' })])

  const both = runNode(SCRIPT, ['--amend', '--root', root, '--escape-ts', '2026-08-15T00:00:00Z', '--spec', 'specs/u.md', '--file', 'u.js', '--class', 'a-b', '--unclassed-reason', 'deferred'])
  assert.strictEqual(both.status, 2, 'passing both --class and --unclassed-reason is a usage error (the two are meant to be exclusive), not a validation failure to route through --check\'s reason machinery')
  assert.match(both.stderr, /Usage:/, 'D2/Worker Rules: a usage error must print the usage line on stderr')

  const neither = runNode(SCRIPT, ['--amend', '--root', root, '--escape-ts', '2026-08-15T00:00:00Z', '--spec', 'specs/u.md', '--file', 'u.js'])
  assert.strictEqual(neither.status, 2, 'passing neither --class nor --unclassed-reason is also a usage error — --amend cannot infer what to write')
  assert.match(neither.stderr, /Usage:/, 'a usage error must print the usage line on stderr')

  const notADir = path.join(root, 'not-a-dir.txt')
  fs.writeFileSync(notADir, 'x')
  const badRoot = runNode(SCRIPT, ['--amend', '--root', notADir, '--escape-ts', '2026-08-15T00:00:00Z', '--spec', 'specs/u.md', '--file', 'u.js', '--class', 'a-b'])
  assert.strictEqual(badRoot.status, 2, 'a --root that is not a directory must exit 2, not attempt to read a ledger under a file path and crash')
  assert.match(badRoot.stderr, /Usage:/, 'the non-directory --root case must also print the usage line')

  const badClass = runNode(SCRIPT, ['--amend', '--root', root, '--escape-ts', '2026-08-15T00:00:00Z', '--spec', 'specs/u.md', '--file', 'u.js', '--class', 'Bad_Id'])
  assert.strictEqual(badClass.status, 1, 'AC-7: a malformed --class id must fail through validation (exit 1), distinct from the exit-2 usage errors above — the key matched fine, the class itself is what\'s wrong')
  assert.match(badClass.stdout, /class-malformed/, 'the printed reason for the bad --class id must name class-malformed, the same token --check uses')
})
