'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, runBash } = require('../helpers')

// specs/20260815/01-recurrence-carriers.md (2026-08-15, D1/D2): review.md's advisory smell
// lens used to depend on a model remembering to hand-append a keep/drop-adjudicated row to
// docs/audit/advisory-findings.md — three rewordings of the keep/drop AskUserQuestion were
// structurally blocked by the question-style judge (the paragraph itself declares the fork
// consequence-free). advisory-append.js is the deterministic carrier: it appends, dedupes on
// (class, file-without-line, counterpart-file-without-line-or-empty), and 📌-announces the
// auto-keep mechanically. This file pins the script's exec contract — AC-20260815-01-1
// through AC-20260815-01-6 — against a synthetic root; none of these pass on current code
// because spec/scripts/advisory-append.js does not exist yet.

const SCRIPT = 'scripts/advisory-append.js'
const LEDGER_REL = path.join('docs', 'audit', 'advisory-findings.md')

function writeSmells(dir, entries) {
  const file = path.join(dir, 'smells.json')
  fs.writeFileSync(file, JSON.stringify(entries))
  return file
}

function ledgerPath(root) {
  return path.join(root, LEDGER_REL)
}

test('AC-20260815-01-1: a fresh root gets the ledger created with the byte-identical two-line header and exactly one row matching the row grammar', () => {
  const root = tmpdir('adv-1')
  const smells = writeSmells(root, [{
    file: 'spec/scripts/a.js', line: 9, class: 'duplication', claim: 're-reads X',
    counterpart: 'spec/scripts/lib/b.js:12'
  }])

  const r = runNode(SCRIPT, [
    '--root', root, '--spec', 'specs/x.md', '--run-id', 'wf_test',
    '--smells', smells, '--date', '2026-08-15'
  ])
  assert.strictEqual(r.status, 0,
    'a single valid duplication entry with a counterpart against a root with no existing ledger must exit 0: ' + r.stderr)

  const ledger = ledgerPath(root)
  assert.ok(fs.existsSync(ledger), 'the ledger file must be created on first append — the row was silently dropped otherwise')
  const content = fs.readFileSync(ledger, 'utf8')
  const lines = content.split('\n')
  assert.strictEqual(lines[0], '# Advisory smell findings — accepted at review',
    'first-append header line 1 must be byte-identical to the live artifact\'s header — a drift here breaks the dedupe parser\'s and audit\'s ingest of every future ledger: got ' + JSON.stringify(lines[0]))
  assert.strictEqual(lines[1], '<!-- appended by /spec:review (smell lens); ingested wholesale by the hotspot audit (roadmap brief 05) -->',
    'first-append header line 2 must be byte-identical to the live artifact\'s header: got ' + JSON.stringify(lines[1]))
  assert.match(content,
    /^- 2026-08-15 duplication spec\/scripts\/a\.js:9 duplicates spec\/scripts\/lib\/b\.js:12 — re-reads X \(spec specs\/x\.md, runId wf_test\)\s*$/m,
    'the appended row must exactly match the row grammar (date class file:line duplicates counterpart — claim (spec ..., runId ...)) — a shape drift here breaks audit\'s wholesale ingest of this file: got ' + JSON.stringify(content))
})

test('AC-20260815-01-2: an entry whose dedupe key matches an existing non-RESOLVED row is suppressed, not re-appended', () => {
  const root = tmpdir('adv-2')
  const entry = (line) => [{
    file: 'spec/scripts/a.js', line, class: 'duplication', claim: 're-reads X',
    counterpart: 'spec/scripts/lib/b.js:12'
  }]

  const r1 = runNode(SCRIPT, [
    '--root', root, '--spec', 'specs/x.md', '--run-id', 'wf_test',
    '--smells', writeSmells(root, entry(9)), '--date', '2026-08-15'
  ])
  assert.strictEqual(r1.status, 0, 'first run (seeding the row) must succeed: ' + r1.stderr)
  const afterFirst = fs.readFileSync(ledgerPath(root), 'utf8')

  const r2 = runNode(SCRIPT, [
    '--root', root, '--spec', 'specs/x.md', '--run-id', 'wf_test2',
    '--smells', writeSmells(root, entry(41)), '--date', '2026-08-15'
  ])
  assert.strictEqual(r2.status, 0, 'a suppressed-only run must still exit 0 (suppression is not an error): ' + r2.stderr)
  assert.match(r2.stdout, /1 duplicate\(s\) suppressed/,
    'the second run must report exactly 1 suppressed duplicate in its summary — a differing line number must not defeat the (class, file-without-line, counterpart-without-line) dedupe key: got ' + JSON.stringify(r2.stdout))
  assert.doesNotMatch(r2.stdout, /appended [1-9]/,
    'the second run must append nothing (0 rows) since the key matches a still-open row: got ' + JSON.stringify(r2.stdout))

  const afterSecond = fs.readFileSync(ledgerPath(root), 'utf8')
  assert.strictEqual(afterSecond, afterFirst,
    'the ledger must be byte-identical after a fully-suppressed run — the script must never rewrite the file when nothing new is appended')
})

test('AC-20260815-01-3: an entry whose only matching key is a RESOLVED row appends a fresh dated row instead of being suppressed', () => {
  const root = tmpdir('adv-3')
  fs.mkdirSync(path.join(root, 'docs', 'audit'), { recursive: true })
  const seeded =
    '# Advisory smell findings — accepted at review\n' +
    '<!-- appended by /spec:review (smell lens); ingested wholesale by the hotspot audit (roadmap brief 05) -->\n\n' +
    '- 2026-08-14 duplication spec/scripts/a.js:5 duplicates spec/scripts/lib/b.js:3 — old claim (spec specs/y.md, runId wf_old) — RESOLVED 2026-08-14: paid down\n'
  fs.writeFileSync(ledgerPath(root), seeded)

  const smells = writeSmells(root, [{
    file: 'spec/scripts/a.js', line: 9, class: 'duplication', claim: 're-reads X again',
    counterpart: 'spec/scripts/lib/b.js:12'
  }])
  const r = runNode(SCRIPT, [
    '--root', root, '--spec', 'specs/z.md', '--run-id', 'wf_new',
    '--smells', smells, '--date', '2026-08-15'
  ])
  assert.strictEqual(r.status, 0, 'a recurrence-after-RESOLVED run must exit 0: ' + r.stderr)
  assert.match(r.stdout, /📌 Auto-kept 1 advisory row\(s\) — 0 duplicate\(s\) suppressed/,
    'exactly one fresh row must be reported appended (and none suppressed) when the only key match is RESOLVED — recurrence after a paydown is the designed-for signal, not a suppression: got ' + JSON.stringify(r.stdout))

  const content = fs.readFileSync(ledgerPath(root), 'utf8')
  assert.match(content, /RESOLVED 2026-08-14: paid down/,
    'the original RESOLVED row must remain untouched — the script is append-only and never edits existing rows')
  assert.match(content,
    /^- 2026-08-15 duplication spec\/scripts\/a\.js:9 duplicates spec\/scripts\/lib\/b\.js:12 — re-reads X again \(spec specs\/z\.md, runId wf_new\)\s*$/m,
    'the new row for the recurring key must be appended fresh, dated today, distinct from the RESOLVED row: got ' + JSON.stringify(content))
})

test('AC-20260815-01-4: an error-masking entry without a counterpart appends a row with no " duplicates " clause; a duplication entry without a counterpart exits 2 naming the workflow\'s counterpart filter', () => {
  const rootA = tmpdir('adv-4a')
  const smellsA = writeSmells(rootA, [{
    file: 'spec/scripts/c.js', line: 3, class: 'error-masking', claim: 'swallows a real failure'
  }])
  const ra = runNode(SCRIPT, [
    '--root', rootA, '--spec', 'specs/x.md', '--run-id', 'wf_test',
    '--smells', smellsA, '--date', '2026-08-15'
  ])
  assert.strictEqual(ra.status, 0, 'a counterpart-less error-masking entry is valid input and must exit 0: ' + ra.stderr)
  const contentA = fs.readFileSync(ledgerPath(rootA), 'utf8')
  assert.match(contentA,
    /^- 2026-08-15 error-masking spec\/scripts\/c\.js:3 — swallows a real failure \(spec specs\/x\.md, runId wf_test\)\s*$/m,
    'an error-masking row without a counterpart must omit the " duplicates <counterpart>" clause entirely: got ' + JSON.stringify(contentA))
  assert.doesNotMatch(contentA, /duplicates/,
    'the counterpart-less error-masking row must contain no "duplicates" clause at all: got ' + JSON.stringify(contentA))

  const rootB = tmpdir('adv-4b')
  const smellsB = writeSmells(rootB, [{
    file: 'spec/scripts/d.js', line: 3, class: 'duplication', claim: 'no counterpart supplied'
  }])
  const rb = runNode(SCRIPT, [
    '--root', rootB, '--spec', 'specs/x.md', '--run-id', 'wf_test',
    '--smells', smellsB, '--date', '2026-08-15'
  ])
  assert.strictEqual(rb.status, 2,
    'a duplication entry with no counterpart must exit 2 — the workflow\'s D6 code filter already drops those, so reaching the script means the upstream contract broke and the script must refuse, not silently accept: ' + JSON.stringify(rb))
  assert.match(rb.stderr, /counterpart/i,
    'the exit-2 stderr must name the counterpart requirement (the workflow\'s filter) as the remedy: ' + rb.stderr)
})

test('AC-20260815-01-5: a run that appends or suppresses prints exactly one 📌 auto-keep summary line, and an empty smells array exits 0 without creating the ledger', () => {
  const root = tmpdir('adv-5')
  const smells = writeSmells(root, [{
    file: 'spec/scripts/e.js', line: 1, class: 'error-masking', claim: 'x'
  }])
  const r = runNode(SCRIPT, [
    '--root', root, '--spec', 'specs/x.md', '--run-id', 'wf_test',
    '--smells', smells, '--date', '2026-08-15'
  ])
  assert.strictEqual(r.status, 0, r.stderr)
  const summaryLines = r.stdout.split('\n').filter(l => l.includes('📌'))
  assert.strictEqual(summaryLines.length, 1,
    'exactly one 📌 summary line must be printed per run — more than one (or zero) breaks the veto-by-deletion contract review.md prints verbatim: got ' + JSON.stringify(r.stdout))
  assert.match(summaryLines[0],
    /^📌 Auto-kept \d+ advisory row\(s\) — \d+ duplicate\(s\) suppressed → docs\/audit\/advisory-findings\.md \(veto: delete the row\)$/,
    'the summary line must match the exact contract shape (N appended, M suppressed, ledger path, veto instruction): got ' + JSON.stringify(summaryLines[0]))

  const emptyRoot = tmpdir('adv-5-empty')
  const emptySmells = writeSmells(emptyRoot, [])
  const re = runNode(SCRIPT, [
    '--root', emptyRoot, '--spec', 'specs/x.md', '--run-id', 'wf_test',
    '--smells', emptySmells, '--date', '2026-08-15'
  ])
  assert.strictEqual(re.status, 0, 'an empty smells array is a no-op, not an error, and must exit 0: ' + re.stderr)
  assert.ok(re.stdout.trim().length > 0,
    'an empty-array run must still print a no-findings line so review.md has something to echo verbatim')
  assert.ok(!fs.existsSync(ledgerPath(emptyRoot)),
    'an empty smells array must NOT create docs/audit/advisory-findings.md — absent stays absent per the no-op contract')
})

test('AC-20260815-01-6: an unknown flag, unreadable/non-array smells JSON, or an entry missing file/class/claim (or an unknown class) exits 2 naming the remedy; spec-paths advisory-append prints the script\'s path', () => {
  const root = tmpdir('adv-6')

  const rFlag = runNode(SCRIPT, ['--bogus', 'x', '--root', root])
  assert.strictEqual(rFlag.status, 2, 'an unknown flag must exit 2: ' + JSON.stringify(rFlag))
  assert.ok(rFlag.stderr && rFlag.stderr.length > 0, 'an unknown-flag failure must name a remedy on stderr')

  const rMissingFile = runNode(SCRIPT, [
    '--root', root, '--spec', 'specs/x.md', '--run-id', 'wf_test',
    '--smells', path.join(root, 'does-not-exist.json')
  ])
  assert.strictEqual(rMissingFile.status, 2, 'an unreadable --smells path must exit 2: ' + JSON.stringify(rMissingFile))

  const nonArrayFile = path.join(root, 'not-array.json')
  fs.writeFileSync(nonArrayFile, JSON.stringify({ file: 'x' }))
  const rNonArray = runNode(SCRIPT, [
    '--root', root, '--spec', 'specs/x.md', '--run-id', 'wf_test', '--smells', nonArrayFile
  ])
  assert.strictEqual(rNonArray.status, 2, 'a non-array --smells JSON body must exit 2: ' + JSON.stringify(rNonArray))

  const missingClaimFile = writeSmells(root, [{ file: 'spec/scripts/f.js', line: 1, class: 'error-masking' }])
  const rMissingClaim = runNode(SCRIPT, [
    '--root', root, '--spec', 'specs/x.md', '--run-id', 'wf_test', '--smells', missingClaimFile
  ])
  assert.strictEqual(rMissingClaim.status, 2, 'an entry missing the required `claim` field must exit 2: ' + JSON.stringify(rMissingClaim))

  const unknownClassFile = writeSmells(root, [{ file: 'spec/scripts/g.js', line: 1, class: 'bogus-class', claim: 'x' }])
  const rUnknownClass = runNode(SCRIPT, [
    '--root', root, '--spec', 'specs/x.md', '--run-id', 'wf_test', '--smells', unknownClassFile
  ])
  assert.strictEqual(rUnknownClass.status, 2, 'an entry with a class outside the closed duplication|error-masking enum must exit 2: ' + JSON.stringify(rUnknownClass))

  const rPaths = runBash('bin/spec-paths', ['advisory-append'])
  assert.strictEqual(rPaths.status, 0,
    'spec-paths advisory-append must resolve to a registered key, not fall through to the usage/error case: ' + JSON.stringify(rPaths))
  assert.match(rPaths.stdout.trim(), /advisory-append\.js$/,
    'spec-paths advisory-append must print the absolute path to spec/scripts/advisory-append.js — this is the key-registration carrier commands rely on: got ' + JSON.stringify(rPaths.stdout))
})
