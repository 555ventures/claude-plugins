'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')
const { SCRIPT, LABELS, writeSeed, writeNotesFile } = require('./mocks-driver-fixtures')

// specs/20260912/14-the-design-stage-prints-the-work-not-the-inventory.md D1-D4.
// AC-20260912-14-1, -2, -3, -6, -7, -8: every test below must fail against the pre-image, which
// prints the kit inventory and the notes queue in full on every run (D1/D2's --verbose collapse
// and D3/D4's --all collapse/cap do not exist yet).

const atlas = (argv, opts) => runNode('scripts/design-atlas.js', argv, opts)
const notesOpen = (dir, extra = []) => runNode(SCRIPT, ['--root', dir, 'notes', 'open', ...extra])

function writeFileDeep(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}

// A design/kit/ family with one primitive ("card") and `mockCount` labeled sketch mocks under
// design/mocks/, each carrying exactly one top-level content-region child that names neither
// data-kit nor data-bespoke — shell-region.js's diagnoseKitRegions reports that as an "unabsorbed"
// finding per mock, tiered a warn (not a violation) at data-status="sketch".
function kitFixture(dir, mockCount) {
  writeFileDeep(path.join(dir, 'design/kit/kit.html'),
    '<link rel="stylesheet" href="../wire/tokens.css">\n' +
    '<div data-kit-canon="kit"><section data-kit-primitive="card" data-purpose="a card">' +
    '<div data-contract="none"></div><div data-slot="content"></div></section></div>\n')
  for (let i = 1; i <= mockCount; i++) {
    const label = 's' + i
    writeFileDeep(path.join(dir, 'design/mocks', label + '.html'),
      '<link rel="stylesheet" href="../tokens.css">\n' +
      '<main data-screen-label="' + label + '" data-status="sketch"><div>content region ' + i + '</div></main>\n')
  }
  return path.join(dir, 'design/mocks')
}

// One mock whose single content region names data-bespoke against the kit's "card" primitive
// with a real difference — diagnoseKitRegions counts it as `bespoke`, not as an "unabsorbed"
// finding, so kitUnabsorbedTotal/kitScreensWithBespoke go non-zero with zero warns.
function bespokeFixture(dir) {
  writeFileDeep(path.join(dir, 'design/kit/kit.html'),
    '<link rel="stylesheet" href="../wire/tokens.css">\n' +
    '<div data-kit-canon="kit"><section data-kit-primitive="card" data-purpose="a card">' +
    '<div data-contract="none"></div><div data-slot="content"></div></section></div>\n')
  writeFileDeep(path.join(dir, 'design/mocks/b1.html'),
    '<link rel="stylesheet" href="../tokens.css">\n' +
    '<main data-screen-label="b1" data-status="sketch"><div data-bespoke="card: two-column body">x</div></main>\n')
  return path.join(dir, 'design/mocks')
}

test('AC-20260912-14-1: check collapses the per-file warn listing to one count line naming --verbose and prints no per-file warn line', () => {
  const dir = tmpdir('bounded-check-warn')
  const mocksDir = kitFixture(dir, 6)
  const r = atlas(['check', mocksDir])
  assert.strictEqual(r.status, 0, 'a sketch-tier kit-unabsorbed finding is a warn, never a violation, so check must still exit 0: ' + r.stderr)
  const lines = r.stdout.split('\n')
  assert.strictEqual(lines[0], '⚠️ 6 warn(s) — --verbose to list',
    'the six per-file warn lines must collapse to one count line in the position warns print today: got ' + JSON.stringify(r.stdout))
  assert.ok(!/^ {2}⚠️ /m.test(r.stdout),
    'no individual "  ⚠️ <file>: <text>" warn line may print without --verbose: got ' + r.stdout)
})

test('AC-20260912-14-2: check prints no per-screen kit/bespoke count line by default, and still prints the unabsorbed total after CHECK PASS( once it is non-zero', () => {
  const dir = tmpdir('bounded-check-kitinfo')
  const mocksDir = bespokeFixture(dir)
  const r = atlas(['check', mocksDir])
  assert.strictEqual(r.status, 0, 'a valid data-bespoke region names no violation, so check must exit 0: ' + r.stderr)
  assert.ok(!/^ {2}ⓘ [^:]+: \d+ kit, \d+ bespoke$/m.test(r.stdout),
    'no per-label "  ⓘ <label>: <n> kit, <m> bespoke" line may print without --verbose: got ' + r.stdout)
  const passIx = r.stdout.indexOf('CHECK PASS (')
  const totalIx = r.stdout.indexOf('  ⓘ unabsorbed total: 1 across 1 screen(s)')
  assert.ok(passIx !== -1 && totalIx !== -1 && totalIx > passIx,
    'the running "  ⓘ unabsorbed total: 1 across 1 screen(s)" line must still print, after the CHECK PASS( line, unchanged by the per-label gate: got ' + JSON.stringify(r.stdout))
})

test('AC-20260912-14-3: check --verbose is accepted as a flag (never a path) and reproduces every pre-change warn and kit-info line in full', () => {
  const dir = tmpdir('bounded-check-verbose')
  const mocksDir = kitFixture(dir, 6)
  const r = atlas(['check', '--verbose', mocksDir])
  assert.strictEqual(r.status, 0, '--verbose must be filtered out of the path list exactly like --matrix/--states, never treated as an unresolvable path: ' + r.stderr)
  assert.doesNotMatch(r.stderr, /no such path: --verbose/,
    '--verbose must never be read as a path argument: got ' + JSON.stringify(r.stderr))
  const lines = r.stdout.split('\n').filter(Boolean)
  assert.strictEqual(lines.length, 13,
    '--verbose must reproduce the full pre-change 13-line shape (6 warn + CHECK PASS + 6 kit-info lines), none collapsed: got ' + lines.length + ' lines in ' + JSON.stringify(r.stdout))
  assert.strictEqual(lines.filter((l) => l.startsWith('  ⚠️ ')).length, 6,
    '--verbose must print all six per-file warn lines: got ' + JSON.stringify(r.stdout))
  assert.strictEqual(lines[6], 'CHECK PASS (6 file(s))',
    '--verbose keeps the CHECK PASS line in its usual position, after every warn line: got ' + JSON.stringify(r.stdout))
  assert.strictEqual(lines.filter((l) => /^ {2}ⓘ [^:]+: \d+ kit, \d+ bespoke$/.test(l)).length, 6,
    '--verbose must print all six per-label kit/bespoke lines: got ' + JSON.stringify(r.stdout))
})

// Questions collapse (D3) — one open question plus a variable count of answered ones on a single
// seeded screen.
function questionsFixture(dir, { answered = 3 } = {}) {
  writeSeed(dir)
  const notes = [
    { id: 'N001', kind: 'question', scope: 'mock', screen: LABELS[0], state: null, status: 'open',
      text: 'single-use link?', by: 'session', ledgerId: 'W1', answer: null },
  ]
  for (let i = 0; i < answered; i++) {
    notes.push({
      id: 'N0' + (10 + i), kind: 'question', scope: 'mock', screen: LABELS[0], state: null, status: 'open',
      text: 'answered question ' + (i + 1), by: 'session', ledgerId: 'W' + (10 + i),
      answer: i === 0 ? { verdict: 'no', text: 'redo it' } : { verdict: 'yes' },
    })
  }
  writeNotesFile(dir, notes)
}

test('AC-20260912-14-6: notes open collapses the answered-questions block to a count naming --all and prints no full answered row, and prints no answered line at all when nothing is answered', () => {
  const dir = tmpdir('bounded-notes-answered')
  questionsFixture(dir, { answered: 3 })
  const r = notesOpen(dir)
  assert.strictEqual(r.status, 0, 'notes open must still exit 0: ' + r.stderr)
  assert.match(r.stdout, /^answered: 3 — --all to list$/m,
    'the answered block must collapse to one count line naming --all: got ' + JSON.stringify(r.stdout))
  assert.doesNotMatch(r.stdout, /^ {2}N\d+ \[[^\]]+\] (yes|no → )/m,
    'no full answered row ("  <id> [<ledgerId>] yes|no → ...") may print without --all: got ' + r.stdout)

  const dir2 = tmpdir('bounded-notes-no-answered')
  questionsFixture(dir2, { answered: 0 })
  const r2 = notesOpen(dir2)
  assert.strictEqual(r2.status, 0, 'notes open must still exit 0 with no answered question: ' + r2.stderr)
  assert.doesNotMatch(r2.stdout, /^answered/m,
    'no "answered" line at all may print while no question has been answered, unchanged by the collapse: got ' + r2.stdout)
})

// Note-listing cap (D4) — 25 open mock notes spread across three screens of the one seeded
// journey, ordered so the cap trips mid-way through the third screen's own group (8 + 8 + 9,
// cap 20 leaves 4 of the 9 printed) — this is the case the Decision's own "never emit a header
// with no note beneath it" clause needs a partially-printed group to exercise.
function manyNotesFixture(dir) {
  writeSeed(dir)
  const notes = []
  let n = 1
  const plan = [[LABELS[0], 8], [LABELS[1], 8], [LABELS[2], 9]]
  for (const [screen, count] of plan) {
    for (let i = 0; i < count; i++) {
      notes.push({ id: 'N' + String(n).padStart(3, '0'), kind: 'note', scope: 'mock', screen, state: null,
        status: 'open', text: 'note ' + n, by: 'jj', reason: 'other' })
      n++
    }
  }
  writeNotesFile(dir, notes)
  return notes
}

test('AC-20260912-14-7: notes open caps the journey-listed note lines at 20 and prints a tail naming the omitted count, with every printed group header carrying at least one note', () => {
  const dir = tmpdir('bounded-notes-cap')
  manyNotesFixture(dir)
  const r = notesOpen(dir)
  assert.strictEqual(r.status, 0, 'notes open must still exit 0 under the cap: ' + r.stderr)
  const lines = r.stdout.split('\n')
  const noteLines = lines.filter((l) => /^ {6}N\d{3} \[open\]/.test(l))
  assert.strictEqual(noteLines.length, 20,
    'exactly 20 note lines must print under the journey groups (NOTE_LIST_CAP), out of the 25 planted: got ' + noteLines.length + ' in ' + JSON.stringify(r.stdout))
  assert.ok(!noteLines.some((l) => l.includes('N025')),
    'the 9th consent-screen note (N025) must be omitted by the cap, proving the walk truncates WITHIN a group and not only across groups: got ' + r.stdout)
  assert.match(r.stdout, /\n… 5 more open note\(s\) — --all to list\n?$/,
    'a tail line naming the 5 omitted notes must print after the listing, as the last thing printed since no project note is open: got ' + JSON.stringify(r.stdout))
  assert.notStrictEqual(lines.indexOf('  consent'), -1,
    'the consent screen header must still print — 4 of its 9 notes are printed before the cap trips, so the header is never emitted with zero notes beneath it: got ' + r.stdout)
})

test('AC-20260912-14-8: notes open --all prints every one of the capped note lines plus the full answered block, with no cap tail or --all hint', () => {
  const dir = tmpdir('bounded-notes-all')
  const notes = manyNotesFixture(dir)
  const questions = [0, 1, 2].map((i) => ({
    id: 'Q00' + (i + 1), kind: 'question', scope: 'mock', screen: LABELS[0], state: null, status: 'open',
    text: 'q' + (i + 1), by: 'session', ledgerId: 'W' + (i + 1),
    answer: i === 0 ? { verdict: 'no', text: 'redo it' } : { verdict: 'yes' },
  }))
  writeNotesFile(dir, notes.concat(questions))
  const r = notesOpen(dir, ['--all'])
  assert.strictEqual(r.status, 0, 'notes open --all must exit 0: ' + r.stderr)
  const noteLines = r.stdout.split('\n').filter((l) => /^ {6}N\d{3} \[open\]/.test(l))
  assert.strictEqual(noteLines.length, 25,
    'all 25 planted notes must print under --all, none capped: got ' + noteLines.length + ' in ' + JSON.stringify(r.stdout))
  assert.strictEqual((r.stdout.match(/^ {2}Q\d+ \[[^\]]+\] (yes|no → "[^"]*")$/gm) || []).length, 3,
    'the full answered block must print one row per answered question under --all: got ' + JSON.stringify(r.stdout))
  assert.doesNotMatch(r.stdout, /more open note\(s\)/,
    'no capping tail may print under --all: got ' + r.stdout)
  assert.doesNotMatch(r.stdout, /--all to list/,
    'no "--all to list" hint may print once --all is already given: got ' + r.stdout)
})
