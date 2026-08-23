'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, tmpdir, runNode, runBash } = require('../helpers')

// specs/20260823/06-prose-debt-pruning.md (2026-08-23): the host rules' § Gotchas section
// accreted 23 entries in 23 days with nothing pruning them — two of them citing machinery
// (`suite-baseline.js`, `.claude/suite-baseline.json`) deleted at v7.0.0 and unnoticed for
// six days. `prose-cap.js` converts "should we prune?" into arithmetic: a hard entry cap on
// one named markdown section, checked by count alone (D1/D2). AC-20260823-06-3 below is the
// standing enforcement — it runs the script against THIS repo's real rules file and is
// deliberately red until the D9 triage (23 → 10 entries) lands later in this build; do not
// soften it to pass early. Continuation-line exclusion (AC-2) and the overage remedy message
// (AC-1) both guard the same failure mode: a miscount that either hides a real overage or
// invents a false one.

function bullet (n) {
  return '- `[host]` fixture entry ' + n + ' citing a synthetic incident, only for AC coverage of prose-cap.js.'
}

// Builds a fixture markdown file with a decoy section before and after the named section, so
// a test that counts N entries inside "Gotchas" also proves the count is section-scoped, not
// a whole-file bullet count.
function writeFixture (dir, entryLines) {
  const file = path.join(dir, 'rules.md')
  const lines = [
    '# Fixture rules',
    '',
    '## Other Section',
    '',
    '- `[host]` decoy entry outside the named section, must never be counted',
    '',
    '## Gotchas (evidence-cited)',
    ''
  ].concat(entryLines).concat([
    '',
    '## Next Section',
    '',
    '- `[host]` decoy entry after the named section, must never be counted',
    ''
  ])
  fs.writeFileSync(file, lines.join('\n'))
  return file
}

test('AC-20260823-06-1: a section holding more entry bullets than the cap exits 1 and names the count, cap, and eviction remedy', () => {
  const dir = tmpdir('prose-cap-over')
  const entries = []
  for (let i = 1; i <= 16; i++) entries.push(bullet(i))
  const file = writeFixture(dir, entries)
  const r = runNode('scripts/prose-cap.js', ['--file', file, '--section', 'Gotchas', '--cap', '15'])
  assert.strictEqual(r.status, 1, (r.stderr || '') +
    ' — a 16-entry section over a cap of 15 must exit 1; a silent pass here lets the exact ' +
    'append-only accretion this spec exists to stop continue unchecked')
  assert.match(r.stderr || '', /16\/15/,
    'stderr must name the exact overage (16/15) — an evicting session with no count has to ' +
    're-derive it by hand before it can act')
  assert.match(r.stderr || '', /evict/i,
    'stderr must name the eviction remedy — an overage reported with no remedy leaves the ' +
    'session to guess at delete / merge / mechanize instead of being told')
})

test('AC-20260823-06-2: a section at exactly the cap exits 0 and reports the count', () => {
  const dir = tmpdir('prose-cap-atcap')
  const entries = []
  for (let i = 1; i <= 15; i++) entries.push(bullet(i))
  const file = writeFixture(dir, entries)
  const r = runNode('scripts/prose-cap.js', ['--file', file, '--section', 'Gotchas', '--cap', '15'])
  assert.strictEqual(r.status, 0, (r.stderr || '') +
    ' — a 15-entry section at a cap of 15 must exit 0; a false overage here blocks every ' +
    'review close on a section that is not actually over budget')
  assert.match(r.stdout || '', /15\/15/,
    'stdout must report 15/15 — the printed count must match the true entry-bullet count, ' +
    'not an off-by-one from mis-locating the section boundary')
})

test('AC-20260823-06-2: continuation lines inside a wrapped entry never count as separate entries', () => {
  const dir = tmpdir('prose-cap-wrap')
  const entries = []
  for (let i = 1; i <= 14; i++) entries.push(bullet(i))
  entries.push(
    '- `[host]` a wrapped entry whose first line matches the bullet regex, continuing onto a',
    '  second physical line that must not be counted as its own entry, and a third line that',
    '  also must never count toward the section total.'
  )
  const file = writeFixture(dir, entries)
  const r = runNode('scripts/prose-cap.js', ['--file', file, '--section', 'Gotchas', '--cap', '15'])
  assert.strictEqual(r.status, 0, (r.stderr || '') +
    ' — this section holds 15 logical entries (14 plain + 1 wrapped across 3 physical lines); ' +
    'counting the wrap\'s continuation lines as new entries would falsely push it over the cap')
  assert.match(r.stdout || '', /15\/15/,
    (r.stdout || '') + ' — stdout must still report 15, not 17: a continuation line never ' +
    'opens with `- \\`[` and must never be mistaken for a new entry bullet')
})

test('AC-20260823-06-3: this repo\'s suite runs prose-cap.js against the live rules file\'s Gotchas section — red on the 23-entry pre-image, green once the D9 triage lands', () => {
  const rulesFile = path.join(ROOT, '.claude/rules/spec-pipeline.md')
  const r = runNode('scripts/prose-cap.js', ['--file', rulesFile, '--section', 'Gotchas', '--cap', '15'])
  assert.strictEqual(r.status, 0, (r.stderr || r.stdout || '') +
    ' — the live § Gotchas section must be at or under the cap of 15 for this suite to be ' +
    'green; a nonzero exit here means an eviction (delete / merge / mechanize) is owed before ' +
    'this repo\'s own suite passes, which is this spec\'s standing enforcement, not a fixture ' +
    'stand-in')
})

test('AC-20260823-06-10: spec-paths prints an existing file path for both prose-cap and memory-sweep', () => {
  for (const key of ['prose-cap', 'memory-sweep']) {
    const r = runBash('bin/spec-paths', [key])
    assert.strictEqual(r.status, 0, (r.stderr || '') +
      ` — spec-paths ${key} must exit 0; doctrine that resolves this script through spec-paths ` +
      'has no way to invoke it if the key is missing or errors')
    const printed = (r.stdout || '').trim()
    assert.ok(printed.length > 0 && fs.existsSync(printed),
      `spec-paths ${key} printed "${printed}" — it must resolve to a file that actually exists ` +
      'on disk, or every doctrine invocation via this key fails at runtime with no earlier warning')
  }
})
