'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { read, tmpdir, runNode } = require('../helpers')
const {
  SCRIPT, JOURNEY,
  bare, mark, stateOf, statusPath, statusJson, ledgerCmd,
  decideLook, freePort, startServe, stopServe,
  advanceToJourneyWalked, advanceToApproved, advanceToSeedDone,
  stubNpx,
  notesPath, writeNotesFile, readNotesFile, nowIso, isoDaysAgo, patchStatus, sha256, stubNpxScreenshot,
} = require('./mocks-driver-fixtures')

// specs/20260907/10-client-review.md — the CLIENT state (D1), `client open --address` (D2),
// `notes address --port`'s re-capture closure (D7), `notes waive` (D8), the accepted-mark
// `waived: N` print (D9), and `printClientStep` (D10) do not exist yet on
// spec/scripts/mocks-driver.js — every test below is red until D1/D2/D7/D8/D9/D10 land.
// AC-20260907-10-1, -2, -10, -17.

// ---------------------------------------------------------------------------
// AC-20260907-10-1
// ---------------------------------------------------------------------------
test('AC-20260907-10-1: WHEN every declared journey carries walked and marks.approved is unset THE SYSTEM derives CLIENT (--state prints CLIENT; a legacy status.json stamped state:"SIGNOFF" with those marks derives CLIENT), and the string SIGNOFF does not occur anywhere in spec/scripts/mocks-driver.js', () => {
  const dir = tmpdir('mocks-driver-client-state')
  advanceToJourneyWalked(dir)
  const s = stateOf(dir)
  assert.strictEqual(s.stdout.trim(), 'CLIENT',
    'AC-1: once every declared journey carries walked and marks.approved is unset, --state must print CLIENT: ' + s.stdout + s.stderr)

  const legacy = statusJson(dir)
  legacy.state = 'SIGNOFF'
  fs.writeFileSync(statusPath(dir), JSON.stringify(legacy, null, 2) + '\n')
  const legacyState = stateOf(dir)
  assert.strictEqual(legacyState.stdout.trim(), 'CLIENT',
    'AC-1: a legacy status.json stamped state:"SIGNOFF" with the same marks must still derive CLIENT — the recorded state string is never trusted over the marks-derivation: ' + legacyState.stdout + legacyState.stderr)

  const src = read('spec/scripts/mocks-driver.js')
  assert.ok(!src.includes('SIGNOFF'),
    'AC-1/D1: the literal "SIGNOFF" must not occur anywhere in spec/scripts/mocks-driver.js — the state is renamed CLIENT in place, not merely aliased: got ' +
    JSON.stringify(src.match(/.{0,40}SIGNOFF.{0,40}/)))
})

// ---------------------------------------------------------------------------
// AC-20260907-10-2
// ---------------------------------------------------------------------------
test('AC-20260907-10-2: client open --address refuses (exit 2) naming the cause in a state other than CLIENT, with no --address, and against an address that does not answer /client/__notes/list with 200 JSON; against a live serve it exits 0, writes status.client (trailing slash stripped) and prints the exact open line', async () => {
  const wrongState = tmpdir('client-open-wrongstate')
  advanceToApproved(wrongState) // already APPROVED, not CLIENT
  const r1 = bare(wrongState, ['client', 'open', '--address', 'http://127.0.0.1:1/'])
  assert.strictEqual(r1.status, 2, 'AC-2: `client open` in a state other than CLIENT must exit 2: ' + r1.stdout + r1.stderr)
  assert.match(r1.stderr + r1.stdout, /APPROVED/, 'AC-2: the refusal must name the current state ("APPROVED"): ' + r1.stdout + r1.stderr)

  const noAddress = tmpdir('client-open-noaddress')
  advanceToJourneyWalked(noAddress)
  const r2 = bare(noAddress, ['client', 'open'])
  assert.strictEqual(r2.status, 2, 'AC-2: `client open` with no --address must exit 2: ' + r2.stdout + r2.stderr)
  assert.match(r2.stderr + r2.stdout, /--address/, 'AC-2: the refusal must name the missing "--address" flag: ' + r2.stdout + r2.stderr)

  const unreachable = tmpdir('client-open-unreachable')
  advanceToJourneyWalked(unreachable)
  const busyPort = await freePort() // nothing listens on it
  const r3 = bare(unreachable, ['client', 'open', '--address', 'http://127.0.0.1:' + busyPort])
  assert.strictEqual(r3.status, 2, 'AC-2: `client open` against an address that answers nothing must exit 2: ' + r3.stdout + r3.stderr)
  assert.match(r3.stderr + r3.stdout, /serve/, 'AC-2: the refusal must name the serve command: ' + r3.stdout + r3.stderr)
  assert.match(r3.stderr + r3.stdout, /expose it yourself/, 'AC-2: the refusal must carry the exact "expose it yourself" remedy phrase: ' + r3.stdout + r3.stderr)

  const live = tmpdir('client-open-live')
  advanceToJourneyWalked(live)
  const port = await freePort()
  const child = await startServe(live, port)
  try {
    const r4 = bare(live, ['client', 'open', '--address', 'http://127.0.0.1:' + port + '/'])
    assert.strictEqual(r4.status, 0, 'AC-2: `client open` against a live serve whose /client/__notes/list answers 200 with a JSON array must exit 0: ' + r4.stdout + r4.stderr)
    const written = statusJson(live)
    assert.deepStrictEqual(written.client && { address: written.client.address }, { address: 'http://127.0.0.1:' + port },
      'AC-2: status.client.address must strip the trailing slash from --address: got ' + JSON.stringify(written.client))
    assert.ok(written.client && written.client.openedAt, 'AC-2: status.client.openedAt must be recorded: got ' + JSON.stringify(written.client))
    assert.match(r4.stdout, new RegExp('client: open — http://127\\.0\\.0\\.1:' + port + '/client/index\\.html'),
      'AC-2: the accepted output must print the exact "client: open — <address>/client/index.html" line: ' + r4.stdout)
  } finally {
    await stopServe(child)
  }
})

// ---------------------------------------------------------------------------
// AC-20260907-10-17 (client: line format, isolated from AC-2's live-server dependency)
// ---------------------------------------------------------------------------
test('AC-20260907-10-17: the bare driver in CLIENT prints a client: line reading "client: not opened — expose the served atlas yourself, then: <driver> client open --address <url>" when status.client is absent, or the exact "client: open since <date> — <address>/client/index.html · client notes: A open · B addressed · C waived · questions: Q unanswered" line when present; with a failing look probe it exits 2 naming the install remedy', () => {
  const notOpened = tmpdir('client-step-notopened')
  advanceToJourneyWalked(notOpened)
  const step1 = bare(notOpened)
  assert.strictEqual(step1.status, 0, 'a bare invocation in CLIENT with no status.client must exit 0: ' + step1.stdout + step1.stderr)
  assert.match(step1.stdout, /client: not opened — expose the served atlas yourself, then:/,
    'AC-17: the not-opened client: line must read exactly this literal: ' + step1.stdout)
  assert.match(step1.stdout, /client open --address <url>/,
    'AC-17: the not-opened client: block must name the "client open --address <url>" command: ' + step1.stdout)

  const opened = tmpdir('client-step-opened')
  advanceToJourneyWalked(opened)
  patchStatus(opened, { client: { address: 'https://hearwell.example', openedAt: '2026-09-01T00:00:00.000Z' } })
  writeNotesFile(opened, [
    { id: 'N001', scope: 'mock', screen: JOURNEY, state: 'error', text: 'x', by: 'client', at: nowIso(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null, origin: 'client', capture: null, lastClientAt: nowIso(), resolution: null, waived: null, answer: null },
    { id: 'N002', scope: 'mock', screen: JOURNEY, state: 'error', text: 'x', by: 'client', at: nowIso(), status: 'addressed', addressed: { at: nowIso(), change: 'x', ledgerRow: null }, reply: null, resolvedBy: null, resolvedAt: null, origin: 'client', capture: null, lastClientAt: nowIso(), resolution: null, waived: null, answer: null },
    { id: 'N003', scope: 'mock', screen: JOURNEY, state: 'error', text: 'x', by: 'client', at: nowIso(), status: 'resolved', addressed: null, reply: null, resolvedBy: 'waiver', resolvedAt: nowIso(), origin: 'client', capture: null, lastClientAt: nowIso(), resolution: null, waived: { at: nowIso(), reason: 'silent', by: 'session' }, answer: null },
    { id: 'N004', scope: 'mock', screen: JOURNEY, state: null, text: 'x', by: 'session', at: nowIso(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null, kind: 'question', ledgerId: 'W9', answer: null },
  ])
  const step2 = bare(opened)
  assert.strictEqual(step2.status, 0, 'a bare invocation in CLIENT with status.client present must exit 0: ' + step2.stdout + step2.stderr)
  assert.match(step2.stdout,
    /client: open since 2026-09-01 — https:\/\/hearwell\.example\/client\/index\.html · client notes: 1 open · 1 addressed · 1 waived · questions: 1 unanswered/,
    'AC-17: the opened client: line must derive its counts exactly (1 open, 1 addressed, 1 waived, 1 unanswered question): got ' + step2.stdout)

  const failingProbe = tmpdir('client-step-probefail')
  advanceToJourneyWalked(failingProbe)
  const failingPath = stubNpx(failingProbe, { exitCode: 1 })
  const r = runNode(SCRIPT, ['--root', failingProbe], { env: { ...process.env, PATH: failingPath } })
  assert.strictEqual(r.status, 2, 'AC-17: CLIENT must still run the look probe before printing its block — a failing npx on PATH must exit 2: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, /npx playwright install chromium/,
    'AC-17: the probe-failure refusal must name the exact install remedy: ' + r.stdout + r.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260907-10-10
// ---------------------------------------------------------------------------
test('AC-20260907-10-10: notes address on a client-origin mock-scope note exits 2 naming the serve command without --port; with --port and an npx stub writing the same bytes as the before capture it exits 2 containing "the screen has not changed", leaving the note open with no after file; with a stub writing different bytes it exits 0, sets status addressed and stores capture.after', () => {
  const dir = tmpdir('notes-address-client-capture')
  advanceToSeedDone(dir)
  const beforeBytes = Buffer.from('before-frame-fixture-bytes')
  const beforeHash = sha256(beforeBytes)
  const capturesDir = path.join(dir, 'design/mocks/captures')
  fs.mkdirSync(capturesDir, { recursive: true })
  fs.writeFileSync(path.join(capturesDir, 'N001.before.png'), beforeBytes)
  writeNotesFile(dir, [{
    id: 'N001', scope: 'mock', screen: 'signin', state: 'error', text: 'the button is the wrong color',
    by: 'client', at: nowIso(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
    origin: 'client', lastClientAt: nowIso(), resolution: null, waived: null, answer: null,
    capture: { before: { hash: beforeHash, file: 'captures/N001.before.png' }, after: null },
  }])

  const noPort = bare(dir, ['notes', 'address', '--id', 'N001', '--change', 'recolored the button'])
  assert.strictEqual(noPort.status, 2, 'AC-10: `notes address` on a client-origin mock-scope note without --port must exit 2: ' + noPort.stdout + noPort.stderr)
  assert.match(noPort.stderr + noPort.stdout, /serve/, 'AC-10: the no-port refusal must name the serve command: ' + noPort.stdout + noPort.stderr)

  const samePath = stubNpxScreenshot(dir, { bytes: beforeBytes })
  const same = runNode(SCRIPT, ['--root', dir, 'notes', 'address', '--id', 'N001', '--change', 'recolored the button', '--port', '0'],
    { env: { ...process.env, PATH: samePath } })
  assert.strictEqual(same.status, 2, 'AC-10: a re-capture whose hash equals the before capture must exit 2: ' + same.stdout + same.stderr)
  assert.match(same.stderr + same.stdout, /the screen has not changed/,
    'AC-10: the unchanged-screen refusal must contain the exact literal "the screen has not changed": ' + same.stdout + same.stderr)
  const afterSame = readNotesFile(dir).find((n) => n.id === 'N001')
  assert.strictEqual(afterSame.status, 'open', 'AC-10: an unchanged re-capture must leave the note "open": got ' + JSON.stringify(afterSame))
  assert.ok(!fs.existsSync(path.join(capturesDir, 'N001.after.png')),
    'AC-10: an unchanged re-capture must leave no captures/N001.after.png file on disk')

  const diffBytes = Buffer.from('after-frame-fixture-bytes-DIFFERENT')
  const diffPath = stubNpxScreenshot(dir, { bytes: diffBytes })
  const diff = runNode(SCRIPT, ['--root', dir, 'notes', 'address', '--id', 'N001', '--change', 'recolored the button', '--port', '0'],
    { env: { ...process.env, PATH: diffPath } })
  assert.strictEqual(diff.status, 0, 'AC-10: a re-capture whose hash differs from the before capture must exit 0: ' + diff.stdout + diff.stderr)
  const afterDiff = readNotesFile(dir).find((n) => n.id === 'N001')
  assert.strictEqual(afterDiff.status, 'addressed', 'AC-10: a changed re-capture must set the note "addressed": got ' + JSON.stringify(afterDiff))
  assert.strictEqual(afterDiff.capture && afterDiff.capture.after && afterDiff.capture.after.hash, sha256(diffBytes),
    'AC-10: capture.after.hash must equal the new sha256: got ' + JSON.stringify(afterDiff.capture))
  assert.ok(fs.existsSync(path.join(capturesDir, 'N001.after.png')),
    'AC-10: a changed re-capture must write captures/N001.after.png to disk')
})

