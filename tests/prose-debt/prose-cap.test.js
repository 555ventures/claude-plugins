'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, tmpdir, runNode, runBash } = require('../helpers')

// specs/20260823/06-prose-debt-pruning.md: the host rules' § Gotchas section
// accreted 23 entries in 23 days with nothing pruning them — two of them citing removed
// machinery (`suite-baseline.js`, `.claude/suite-baseline.json`). `prose-cap.js` converts
// "should we prune?" into arithmetic: a hard entry cap on
// one named markdown section, checked by count alone (D1/D2). AC-20260823-06-3 below is the
// standing enforcement — it runs the script against THIS repo's real rules file and is
// deliberately red until the D9 triage (23 → 10 entries) lands later in this build; do not
// soften it to pass early. Continuation-line exclusion (AC-2) and the overage remedy message
// (AC-1) both guard the same failure mode: a miscount that either hides a real overage or
// invents a false one.
//
// The tag-at-end regression fix: the earlier entry regex required a tag-FIRST bullet — a shape
// only this repo and these self-authored fixtures happened to write. A real host's Gotchas
// section (tag-at-end: `- **Bold claim** … [host]`) held many entries and matched none, so the
// cap never fired on any tag-at-end host. The tag-at-end tests below are the regression
// pin and the deliberate trip in exactly the shape that once counted 0.

function bullet (n) {
  return '- `[host]` fixture entry ' + n + ' citing a synthetic incident, only for AC coverage of prose-cap.js.'
}

// The real host shape the earlier regex missed: bold-opening bullet wrapped onto an
// indented continuation line, bracket tag at the END — mirrors a real host's rules file, where
// that earlier bracket-first regex matched 0 of 138 entries.
function tagAtEndEntry (n) {
  return [
    '- **Bold claim ' + n + '** fixture entry wrapped onto a',
    '  second indented line citing a synthetic incident, tag at the end like real hosts write. [host]'
  ]
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
    (r.stdout || '') + ' — stdout must still report 15, not 17: a continuation line is ' +
    'indented, so it never matches the top-level `- ` entry shape and must never be mistaken ' +
    'for a new entry bullet')
})

test('fail-open regression 2026-08-23: tag-at-end entries (the real host shape) are counted, not silently skipped', () => {
  const dir = tmpdir('prose-cap-tagend')
  const entries = []
  for (let i = 1; i <= 15; i++) entries.push(...tagAtEndEntry(i))
  const file = writeFixture(dir, entries)
  const r = runNode('scripts/prose-cap.js', ['--file', file, '--section', 'Gotchas', '--cap', '15'])
  assert.strictEqual(r.status, 0, (r.stderr || '') +
    ' — 15 logical tag-at-end entries at a cap of 15 must exit 0; a nonzero exit means the ' +
    'indented continuation lines were miscounted as entries')
  assert.match(r.stdout || '', /15\/15/,
    (r.stdout || '') + ' — stdout must report 15/15: under the original bracket-first regex ' +
    'this exact shape counted 0 (Upwell measured 138 entries, 0 matched), leaving every ' +
    'tag-at-end host permanently fail-open with a cap that never fires')
})

test('fail-open regression 2026-08-23: 16 tag-at-end entries over a cap of 15 trip exit 1 naming the count and remedy', () => {
  const dir = tmpdir('prose-cap-tagend-over')
  const entries = []
  for (let i = 1; i <= 16; i++) entries.push(...tagAtEndEntry(i))
  const file = writeFixture(dir, entries)
  const r = runNode('scripts/prose-cap.js', ['--file', file, '--section', 'Gotchas', '--cap', '15'])
  assert.strictEqual(r.status, 1, (r.stderr || '') +
    ' — the cap must trip on the exact shape that previously counted 0; a silent pass here ' +
    'means the guard still only fires on self-authored tag-first fixtures, never on real hosts')
  assert.match(r.stderr || '', /16\/15/,
    'stderr must name the exact overage (16/15) — an evicting session with no count has to ' +
    're-derive it by hand before it can act')
  assert.match(r.stderr || '', /evict/i,
    'stderr must name the eviction remedy — an overage reported with no remedy leaves the ' +
    'session to guess at delete / merge / mechanize instead of being told')
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

// Ratchet mode (direct fix, core § Incident Policy): the cap can postdate existing debt on an
// adopting host, so a first close can meet an unmeetable eviction duty and record the cap as
// "recorded as unmet". --baseline N admits an over-cap section iff it is strictly smaller than N — every close must
// net-shrink the section by one entry, so the debt converges with no flag day.
test('ratchet: an over-cap section strictly below --baseline exits 0 and names the ratchet', () => {
  const dir = tmpdir('prose-cap-ratchet-pass')
  const entries = []
  for (let i = 1; i <= 40; i++) entries.push(bullet(i))
  const file = writeFixture(dir, entries)
  const r = runNode('scripts/prose-cap.js', ['--file', file, '--section', 'Gotchas', '--cap', '15', '--baseline', '41'])
  assert.strictEqual(r.status, 0, (r.stderr || '') +
    ' — 40 entries against a baseline of 41 is a net eviction; refusing it is the flag-day gate that made Prax close with the cap unmet')
  assert.match(r.stdout || '', /ratchet: 40 < baseline 41/,
    'stdout must say the baseline, not the cap, admitted the pass — otherwise a reader believes the section is under cap')
})

test('ratchet: an over-cap section at or above --baseline exits 1 naming the baseline', () => {
  const dir = tmpdir('prose-cap-ratchet-fail')
  const entries = []
  for (let i = 1; i <= 40; i++) entries.push(bullet(i))
  const file = writeFixture(dir, entries)
  const r = runNode('scripts/prose-cap.js', ['--file', file, '--section', 'Gotchas', '--cap', '15', '--baseline', '40'])
  assert.strictEqual(r.status, 1, 'equal to baseline is no shrink — a pass here lets an over-cap section grow forever behind the ratchet')
  assert.match(r.stderr || '', /baseline 40/, 'stderr must name the baseline the count failed against')
})

test('ratchet: at or under cap the baseline is ignored and the hard cap rules', () => {
  const dir = tmpdir('prose-cap-undercap')
  const entries = []
  for (let i = 1; i <= 15; i++) entries.push(bullet(i))
  const file = writeFixture(dir, entries)
  const r = runNode('scripts/prose-cap.js', ['--file', file, '--section', 'Gotchas', '--cap', '15', '--baseline', '10'])
  assert.strictEqual(r.status, 0, 'a section at cap passes regardless of a lower baseline — the ratchet only governs the over-cap regime')
  assert.doesNotMatch(r.stdout || '', /ratchet:/, 'no ratchet note when the cap itself admitted the pass')
})
