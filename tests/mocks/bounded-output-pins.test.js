'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')
const { SCRIPT, LABELS, writeSeed, writeNotesFile } = require('./mocks-driver-fixtures')

// specs/20260912/14-the-design-stage-prints-the-work-not-the-inventory.md D1/D5.
// AC-20260912-14-4, -5, -9: every criterion here is a SHALL CONTINUE TO — green against the
// pre-image by construction (D1/D2/D3/D4 never touch a no-kit, no-warn `check` pass, a `check
// --states` violation listing, or a small notes queue nowhere near NOTE_LIST_CAP).

const atlas = (argv, opts) => runNode('scripts/design-atlas.js', argv, opts)
const notesOpen = (dir, extra = []) => runNode(SCRIPT, ['--root', dir, 'notes', 'open', ...extra])

function writeFileDeep(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}

test('AC-20260912-14-4: check over a tree with no design/kit/ and no warn-producing finding CONTINUES TO print exactly CHECK PASS (2 file(s)), no ⓘ line, and exit 0', () => {
  const dir = tmpdir('pins-check-plain')
  for (const label of ['a', 'b']) {
    writeFileDeep(path.join(dir, 'design/mocks', label + '.html'),
      '<link rel="stylesheet" href="../tokens.css">\n' +
      '<main data-screen-label="' + label + '" data-status="sketch">' + label + ' content</main>\n')
  }
  const r = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(r.status, 0,
    'a two-mock tree with no kit family and no warn-producing finding must still exit 0: ' + r.stderr)
  assert.strictEqual(r.stdout, 'CHECK PASS (2 file(s))\n',
    'the plain pass path must still print exactly this one line, byte-for-byte, unaffected by the --verbose/kit-info gates: got ' + JSON.stringify(r.stdout))
  assert.ok(!r.stdout.includes('ⓘ'),
    'no ⓘ line of any kind may print when no kit family resolves above either mock: got ' + JSON.stringify(r.stdout))
})

test('AC-20260912-14-5: check --states over two mocks each declaring only "empty" CONTINUES TO print the CHECK FAIL headline with one "  - " line per violation and exit 1', () => {
  const dir = tmpdir('pins-check-states')
  for (const label of ['a', 'b']) {
    writeFileDeep(path.join(dir, 'design/mocks', label + '.html'),
      '<link rel="stylesheet" href="../tokens.css">\n' +
      '<main data-screen-label="' + label + '" data-status="sketch">' + label +
      ' <button data-state-btn="empty">Empty</button></main>\n')
  }
  const r = atlas(['check', '--states', path.join(dir, 'design/mocks')])
  assert.strictEqual(r.status, 1,
    'a mock declaring only "empty" is missing "loading"/"error" under --states, so check must still exit 1: ' + r.stderr)
  assert.match(r.stdout, /^CHECK FAIL \(2 violation\(s\) across 2 file\(s\)\):$/m,
    'the CHECK FAIL headline must still name both violations across both files: got ' + JSON.stringify(r.stdout))
  const violationLines = r.stdout.split('\n').filter((l) => l.startsWith('  - '))
  assert.strictEqual(violationLines.length, 2,
    'exactly one "  - " line must still print per violating file: got ' + JSON.stringify(r.stdout))
  for (const l of violationLines) {
    assert.match(l, /missing state\(s\) loading, error/,
      'each violation line must still name the missing states by their real name: got ' + JSON.stringify(l))
  }
})

// specs/20260913/07-the-critic-is-out.md D8/AC-20260913-07-11: `notes open` never produces a
// questions block at all once nothing but a person types a note — the same small queue as
// AC-20260912-14-9 (now folded into this AC) prints its counts line first, with no "❓" line and
// no mention of the legacy question note's own id anywhere in the output.
test('AC-20260912-14-9: (rewritten as AC-20260913-07-11) notes open on a store holding one open project note, two open mock notes, one addressed mock note and one open kind:"question" note prints the counts line first, no "❓" line, and no mention of the question\'s id', () => {
  const dir = tmpdir('pins-notes-small')
  writeSeed(dir)
  writeNotesFile(dir, [
    { id: 'N005', kind: 'note', scope: 'project', screen: null, state: null, status: 'open',
      text: 'the nav is wrong everywhere', by: 'ren', reason: 'other' },
    { id: 'N010', kind: 'note', scope: 'mock', screen: LABELS[0], state: null, status: 'open',
      text: 'wrong copy', by: 'jj', reason: 'other' },
    { id: 'N011', kind: 'note', scope: 'mock', screen: LABELS[0], state: null, status: 'open',
      text: 'also wrong', by: 'jj', reason: 'other' },
    { id: 'N012', kind: 'note', scope: 'mock', screen: LABELS[0], state: null, status: 'addressed',
      text: 'fixed already', by: 'jj', reason: 'other', addressed: { change: 'reworded', ledgerRow: null } },
    { id: 'N020', kind: 'question', scope: 'mock', screen: LABELS[0], state: null, status: 'open',
      text: 'single-use link?', by: 'session', ledgerId: 'W7', answer: null },
  ])
  const r = notesOpen(dir)
  assert.strictEqual(r.status, 0, 'notes open must still exit 0 on a small queue: ' + r.stderr)
  const lines = r.stdout.split('\n')
  // The addressed mock note is still "not resolved" (status "addressed" !== "resolved") and is
  // still counted into both the total and the mock sub-count, exactly as it is today — the
  // literal "3 (1 project · 2 mock)" a first reading of the spec's own worked example suggests
  // undercounts the addressed note; see this spec's deviations sidecar.
  assert.strictEqual(lines[0], '📝 open notes: 4 (1 project · 3 mock) · addressed: 1',
    'the counts line must be the FIRST line once no questions block exists: got ' + JSON.stringify(r.stdout))
  assert.ok(!r.stdout.includes('❓'),
    'a legacy kind:"question" note must never surface a "❓" line — nothing but a person\'s note is ever counted or listed: got ' + JSON.stringify(r.stdout))
  assert.ok(!r.stdout.includes('N020') && !r.stdout.includes('single-use link?'),
    'a legacy question\'s id and text must never appear anywhere in the output: got ' + JSON.stringify(r.stdout))
  const projectIx = lines.indexOf('project')
  const journeyIx = lines.indexOf('onboarding')
  assert.ok(projectIx !== -1 && journeyIx !== -1 && projectIx < journeyIx,
    'the project block must still print before any journey group: got ' + JSON.stringify(r.stdout))
  assert.strictEqual(lines[lines.length - 2],
    '⚠️ a project note is open — answer it (canon change or new directions) before any mock note',
    'the run must still end with the project-note warning while a project note is open: got ' + JSON.stringify(r.stdout))
})
