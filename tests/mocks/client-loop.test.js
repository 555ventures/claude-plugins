'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tmpdir, freePort, serveAtlas, SPEC, postJson, runNode } = require('../helpers')
const {
  SCRIPT, JOURNEY, LABELS, advanceToThemePicked, stateOf, readNotesFile, statusJson, nowIso,
} = require('./mocks-driver-fixtures')
const walkLib = require('../../spec/scripts/lib/mocks-walk')

// specs/20260911/04-the-client-loop.md D1 (lib/mocks-walk.js journeyState/unconfirmJourney),
// D7 (client open --port, notes address defaults/--screen/--journey, the CLIENT step's own
// pickup block), D8 (--reopen journey:<j> unconfirms), D14 (clientNoteCounts/"client notes: "
// deleted). All unbuilt against the pre-image — every assertion below is red until they land.
// AC-20260911-04-1, -10, -11, -12, -14. A5: this file is the scratch harness
// (scratchpad/loop.js, run client-first against the pre-image at lock) made into a test.

// ---------------------------------------------------------------------------
// PATH-stub npx: unlike mocks-driver-fixtures' stubNpxScreenshot (a fixed byte buffer, one
// script per call), this stub distinguishes the driver's own reachability probe
// (`npx --no-install playwright --version`, which every bare CLIENT-step run performs) from a
// real screenshot invocation, so the SAME stubbed PATH serves both `client open`'s "server
// answering" probe path and the client route's real before/after captures without breaking the
// unrelated look-probe gate. `setShotBytes` lets a test vary the screenshot bytes between an
// add (before) and a `notes address` (after) capture without re-writing the script or the PATH.
// ---------------------------------------------------------------------------
function writeSmartNpxStub(dir) {
  const binDir = path.join(dir, 'smart-npx-bin')
  fs.mkdirSync(binDir, { recursive: true })
  const shotPath = path.join(dir, 'smart-shot.png')
  fs.writeFileSync(shotPath, 'seed-bytes')
  fs.writeFileSync(path.join(binDir, 'npx'), '#!/usr/bin/env bash\n' +
    'if [[ "$*" == *"--version"* ]]; then echo "Version 0.0.0-stub"; exit 0; fi\n' +
    'last="${@: -1}"\n' +
    'cp "' + shotPath + '" "$last"\n' +
    'exit 0\n')
  fs.chmodSync(path.join(binDir, 'npx'), 0o755)
  return { path: binDir + path.delimiter + process.env.PATH, shotPath }
}
function setShotBytes(shotPath, bytes) { fs.writeFileSync(shotPath, bytes) }

// A `https.get` monkey-patch loaded via NODE_OPTIONS=--require before mocks-driver.js runs —
// the only way to make `client open --address https://<any-host>` probe as "answering" without
// a real DNS-resolvable host, so AC-10's "probe stubbed to answer" clause is exercised for real
// rather than skipped.
function writeHttpsStub(dir) {
  const p = path.join(dir, 'https-stub.js')
  fs.writeFileSync(p, "'use strict'\n" +
    "const https = require('https')\n" +
    'https.get = function (opts, cb) {\n' +
    "  const { EventEmitter } = require('events')\n" +
    '  const res = new EventEmitter()\n' +
    '  res.statusCode = 200\n' +
    '  const req = new EventEmitter()\n' +
    '  req.destroy = function () {}\n' +
    '  process.nextTick(function () {\n' +
    '    cb(res)\n' +
    "    process.nextTick(function () { res.emit('data', Buffer.from('[]')); res.emit('end') })\n" +
    '  })\n' +
    '  return req\n' +
    '}\n')
  return p
}

function withPath(pathValue) { return Object.assign({}, process.env, { PATH: pathValue }) }

// ---------------------------------------------------------------------------
// AC-20260911-04-1
// ---------------------------------------------------------------------------
test('AC-20260911-04-1: journeyState derives all six states from the Contracts table\'s own inputs (an open client note outranking a set confirmedAt), and unconfirmJourney nulls confirmedAt/sentence into one history entry, or no-ops on an unconfirmed journey', () => {
  assert.strictEqual(typeof walkLib.journeyState, 'function',
    'AC-1: lib/mocks-walk.js must export journeyState(walk, notes, labels) — D1 is unbuilt')
  assert.strictEqual(typeof walkLib.unconfirmJourney, 'function',
    'AC-1: lib/mocks-walk.js must export unconfirmJourney(walk, {journey, at, cause}) — D1 is unbuilt')

  const labels = ['signin', 'invite', 'consent', 'session-live']
  const clientNote = (overrides) => Object.assign({
    id: 'N003', scope: 'mock', screen: 'invite', text: 'x', by: 'client', status: 'open', origin: 'client',
  }, overrides)

  assert.strictEqual(walkLib.journeyState(undefined, [], labels), 'unseen',
    'AC-1: no record must derive "unseen"')
  assert.strictEqual(walkLib.journeyState({ reached: ['signin', 'invite'] }, [], labels), 'walking',
    'AC-1: a record with reached labels and no confirmedAt must derive "walking"')
  assert.strictEqual(walkLib.journeyState({ confirmedAt: nowIso(), sentence: 'ok' }, [], labels), 'ok',
    'AC-1: confirmedAt set with no client note on the journey\'s labels must derive "ok"')
  assert.strictEqual(walkLib.journeyState({ confirmedAt: nowIso(), sentence: 'ok' }, [clientNote({ status: 'open' })], labels), 'changes-requested',
    'AC-1: confirmedAt set but an open client note on a declared label must derive "changes-requested" — the open request outranks the OK')
  assert.strictEqual(walkLib.journeyState({}, [clientNote({ status: 'addressed' })], labels), 'fixed',
    'AC-1: an addressed client note with none open must derive "fixed"')
  assert.strictEqual(walkLib.journeyState({ waived: { at: nowIso(), reason: 'x', by: 'session' } }, [], labels), 'waived',
    'AC-1: a waived record must derive "waived" regardless of notes')

  const confirmedAt = '2026-09-01T00:00:00.000Z'
  const sentence = 'Looks right'
  const confirmed = { journeys: { onboarding: { reached: labels.slice(), misses: [], confirmedAt, sentence, waived: null } } }
  const unconfirmed = walkLib.unconfirmJourney(confirmed, { journey: 'onboarding', at: '2026-09-05T00:00:00.000Z', cause: 'N003' })
  const rec = unconfirmed.journeys.onboarding
  assert.strictEqual(rec.confirmedAt, null, 'AC-1: unconfirmJourney must null confirmedAt: got ' + JSON.stringify(rec))
  assert.strictEqual(rec.sentence, null, 'AC-1: unconfirmJourney must null sentence: got ' + JSON.stringify(rec))
  assert.ok(Array.isArray(rec.history) && rec.history.length === 1,
    'AC-1: unconfirmJourney must append exactly one history entry: got ' + JSON.stringify(rec.history))
  assert.deepStrictEqual(rec.history[0], { confirmedAt, sentence, clearedAt: '2026-09-05T00:00:00.000Z', cause: 'N003' },
    'AC-1: the history entry must carry the prior confirmedAt/sentence plus clearedAt/cause: got ' + JSON.stringify(rec.history[0]))

  const untouched = { journeys: { onboarding: { reached: [], misses: [], confirmedAt: null, sentence: null, waived: null } } }
  const noOp = walkLib.unconfirmJourney(untouched, { journey: 'onboarding', at: nowIso(), cause: 'N009' })
  assert.deepStrictEqual(noOp.journeys.onboarding, untouched.journeys.onboarding,
    'AC-1: unconfirmJourney on an unconfirmed journey must return the record unchanged, with no history entry: got ' + JSON.stringify(noOp.journeys.onboarding))
})

// ---------------------------------------------------------------------------
// AC-20260911-04-14
// ---------------------------------------------------------------------------
test('AC-20260911-04-14: mocks-driver.js carries neither the retired clientNoteCounts helper nor its "client notes: " counts line — D7\'s pickup lines replace them, not join them', () => {
  const r = spawnSync('grep', ['-n', 'clientNoteCounts\\|client notes: ', path.join(SPEC, 'scripts/mocks-driver.js')])
  assert.strictEqual(r.status, 1,
    'AC-14: grep must find zero hits (exit 1) for clientNoteCounts / "client notes: " in mocks-driver.js — D14\'s deletion is unbuilt: got status ' +
    r.status + ' stdout=\n' + (r.stdout || '').toString())
})

// ---------------------------------------------------------------------------
// AC-20260911-04-10
// ---------------------------------------------------------------------------
test('AC-20260911-04-10: `client open` derives the port from a localhost address (or refuses naming --port for any other host), and the bare CLIENT step names the server\'s answering state, each journey\'s state, and "what the client left" per note', async () => {
  const dir = tmpdir('client-loop-ac10')
  advanceToThemePicked(dir)
  const stub = writeSmartNpxStub(dir)
  setShotBytes(stub.shotPath, Buffer.from('before-bytes-v1'))
  const port = await freePort()
  const { stop } = await serveAtlas(dir, { port, env: withPath(stub.path) })
  try {
    const address = 'http://127.0.0.1:' + port

    const openLocal = runNode(SCRIPT, ['--root', dir, 'client', 'open', '--address', address])
    assert.strictEqual(openLocal.status, 0, 'AC-10: client open against the running server must be accepted: ' + openLocal.stderr)
    const status1 = statusJson(dir)
    assert.strictEqual(status1.client && status1.client.port, port,
      'AC-10: client open must record status.client.port derived from a localhost address with no --port given — D7 is unbuilt: got ' + JSON.stringify(status1.client))

    const httpsStub = writeHttpsStub(dir)
    const noPort = runNode(SCRIPT, ['--root', dir, 'client', 'open', '--address', 'https://mac.tail.ts.net'],
      { env: Object.assign({}, process.env, { NODE_OPTIONS: '--require ' + httpsStub }) })
    assert.strictEqual(noPort.status, 2,
      'AC-10: client open against a non-localhost address (probe stubbed to answer) with no --port must refuse exit 2 — D7\'s --port requirement is unbuilt: got ' +
      noPort.status + ' ' + noPort.stderr)
    assert.match(noPort.stderr, /--port <n>/,
      'AC-10: the refusal must name --port <n> as the remedy: got ' + noPort.stderr)

    const bareEmpty = runNode(SCRIPT, ['--root', dir], { env: withPath(stub.path) })
    assert.strictEqual(bareEmpty.status, 0, 'AC-10: the bare CLIENT step must succeed: ' + bareEmpty.stderr)
    const escapedAddress = address.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    assert.match(bareEmpty.stdout, new RegExp('server: answering — ' + escapedAddress + '/client/index\\.html'),
      'AC-10: the CLIENT step must print the server-answering line naming the served address — D7 is unbuilt: got\n' + bareEmpty.stdout)
    assert.match(bareEmpty.stdout, /📥 what the client left:\n {2}nothing new/,
      'AC-10: with no client notes yet, the pickup block must read "nothing new": got\n' + bareEmpty.stdout)

    const mockNoteRes = await postJson(address + '/client/__notes/add',
      { scope: 'mock', screen: LABELS[1], text: 'The invite button should say Send, not Submit', by: 'client' })
    assert.strictEqual(mockNoteRes.status, 201, 'AC-10 setup: the client\'s mock note must post: ' + JSON.stringify(mockNoteRes.body))
    const projectNoteRes = await postJson(address + '/client/__notes/add',
      { scope: 'project', text: 'There is no password reset screen at all', by: 'client' })
    assert.strictEqual(projectNoteRes.status, 201, 'AC-10 setup: the client\'s project note must post: ' + JSON.stringify(projectNoteRes.body))

    const bareAfter = runNode(SCRIPT, ['--root', dir], { env: withPath(stub.path) })
    assert.strictEqual(bareAfter.status, 0, 'AC-10: the bare CLIENT step must still succeed once notes exist: ' + bareAfter.stderr)
    assert.match(bareAfter.stdout, /onboarding: changes requested \(1\)/,
      'AC-10: a journey with an open client mock note must print "changes requested (1)": got\n' + bareAfter.stdout)
    assert.match(bareAfter.stdout, new RegExp('  ' + mockNoteRes.body.id + ' open · invite · "'),
      'AC-10: the mock note\'s pickup line must name its id/screen/text: got\n' + bareAfter.stdout)
    assert.match(bareAfter.stdout, new RegExp('notes address --id ' + mockNoteRes.body.id + ' --change "<what changed>"\\s*$', 'm'),
      'AC-10: an open mock note\'s pickup command must carry no --screen/--journey hint: got\n' + bareAfter.stdout)
    assert.match(bareAfter.stdout, new RegExp('  ' + projectNoteRes.body.id + ' open · project · "'),
      'AC-10: the project note\'s pickup line must name its id/scope/text: got\n' + bareAfter.stdout)
    assert.match(bareAfter.stdout, new RegExp('notes address --id ' + projectNoteRes.body.id + ' --change "<what changed>" --screen <label> \\| --journey <j>'),
      'AC-10: a project note\'s pickup command must carry the --screen/--journey hint: got\n' + bareAfter.stdout)

    await stop()
    const bareDown = runNode(SCRIPT, ['--root', dir], { env: withPath(stub.path) })
    assert.match(bareDown.stdout, /server: NOT answering — start it in your own terminal and keep it running until approval: node /,
      'AC-10: once the server is down, the CLIENT step must print the not-answering line naming the serve command: got\n' + bareDown.stdout)
    assert.match(bareDown.stdout, new RegExp('--port ' + port),
      'AC-10: the not-answering serve command must carry the recorded --port: got\n' + bareDown.stdout)
  } finally {
    try { await stop() } catch { /* already stopped */ }
  }
})

// ---------------------------------------------------------------------------
// AC-20260911-04-11
// ---------------------------------------------------------------------------
test('AC-20260911-04-11: `notes address` falls back to status.client.port and requires --screen/--journey on a client-origin project note, and the CLIENT step\'s journey line tracks fixed → ok', async () => {
  const dir = tmpdir('client-loop-ac11')
  advanceToThemePicked(dir)
  const stub = writeSmartNpxStub(dir)
  setShotBytes(stub.shotPath, Buffer.from('before-bytes-v1'))
  const port = await freePort()
  const { stop } = await serveAtlas(dir, { port, env: withPath(stub.path) })
  try {
    const address = 'http://127.0.0.1:' + port
    const openR = runNode(SCRIPT, ['--root', dir, 'client', 'open', '--address', address])
    assert.strictEqual(openR.status, 0, 'AC-11 setup: client open must succeed: ' + openR.stderr)

    const mockNoteRes = await postJson(address + '/client/__notes/add', { scope: 'mock', screen: LABELS[1], text: 'Says Submit', by: 'client' })
    assert.strictEqual(mockNoteRes.status, 201, 'AC-11 setup: the mock note must post: ' + JSON.stringify(mockNoteRes.body))
    const projectNoteRes = await postJson(address + '/client/__notes/add', { scope: 'project', text: 'No password reset screen at all', by: 'client' })
    assert.strictEqual(projectNoteRes.status, 201, 'AC-11 setup: the project note must post: ' + JSON.stringify(projectNoteRes.body))

    setShotBytes(stub.shotPath, Buffer.from('after-bytes-v2-different'))
    const addressed = runNode(SCRIPT, ['--root', dir, 'notes', 'address', '--id', mockNoteRes.body.id, '--change', 'Button now says Send'],
      { env: withPath(stub.path) })
    assert.strictEqual(addressed.status, 0,
      'AC-11: `notes address` with no --port must fall back to status.client.port — D7 is unbuilt: got ' + addressed.status + ' ' + addressed.stderr)
    assert.match(addressed.stdout, /→ addressed/, 'AC-11: a successful address must print "→ addressed": got ' + addressed.stdout)

    const projMissingFlags = runNode(SCRIPT, ['--root', dir, 'notes', 'address', '--id', projectNoteRes.body.id, '--change', 'Added the reset screen'])
    assert.strictEqual(projMissingFlags.status, 2,
      'AC-11: addressing a client-origin project-scope note with neither --screen nor --journey must refuse exit 2 — D7 is unbuilt: got ' + projMissingFlags.status)
    assert.match(projMissingFlags.stderr, /--screen/, 'AC-11: the refusal must name --screen: got ' + projMissingFlags.stderr)
    assert.match(projMissingFlags.stderr, /--journey/, 'AC-11: the refusal must name --journey: got ' + projMissingFlags.stderr)

    const projAddressed = runNode(SCRIPT, ['--root', dir, 'notes', 'address', '--id', projectNoteRes.body.id, '--change', 'Added the reset screen', '--journey', JOURNEY])
    assert.strictEqual(projAddressed.status, 0,
      'AC-11: addressing with --journey must be accepted: got ' + projAddressed.status + ' ' + projAddressed.stderr)
    const notesAfter = readNotesFile(dir)
    const projNote = notesAfter.find((n) => n.id === projectNoteRes.body.id)
    assert.strictEqual(projNote && projNote.addressed && projNote.addressed.journey, JOURNEY,
      'AC-11: the addressed project note must carry addressed.journey — D3 is unbuilt: got ' + JSON.stringify(projNote && projNote.addressed))

    const bareFixed = runNode(SCRIPT, ['--root', dir], { env: withPath(stub.path) })
    assert.match(bareFixed.stdout, /onboarding: fixed — waiting for the client \(1\)/,
      'AC-11: with the mock note addressed and none open, the CLIENT step must print "fixed — waiting for the client (1)": got\n' + bareFixed.stdout)

    const resolveRes = await postJson(address + '/client/__notes/resolve', { id: mockNoteRes.body.id, by: 'client' })
    assert.strictEqual(resolveRes.status, 200, 'AC-11 setup: the client\'s accept must resolve the note: ' + JSON.stringify(resolveRes.body))
    const confirmRes = await postJson(address + '/client/__walk/confirm', { journey: JOURNEY, sentence: 'Looks right now' })
    assert.strictEqual(confirmRes.status, 200, 'AC-11: confirm must succeed once the addressed note is resolved: ' + JSON.stringify(confirmRes.body))

    const bareOk = runNode(SCRIPT, ['--root', dir], { env: withPath(stub.path) })
    assert.match(bareOk.stdout, /onboarding: ok — "Looks right now"/,
      'AC-11: once confirmed, the CLIENT step must print \'ok — "<sentence>"\': got\n' + bareOk.stdout)
  } finally {
    await stop()
  }
})

// ---------------------------------------------------------------------------
// AC-20260911-04-12
// ---------------------------------------------------------------------------
test('AC-20260911-04-12: `--reopen journey:<j>` takes back a confirmed journey\'s OK into one history entry on walk.json, and the next bare run\'s derived state still cascades to WIREFRAMES', () => {
  const dir = tmpdir('client-loop-ac12')
  advanceToThemePicked(dir)
  const walk = walkLib.confirmJourney({ journeys: {} }, { journey: JOURNEY, sentence: 'Looks right', at: nowIso() })
  walkLib.writeWalk(dir, walk)

  const r = runNode(SCRIPT, ['--root', dir, '--reopen', 'journey:' + JOURNEY])
  assert.strictEqual(r.status, 0, 'AC-12: --reopen journey:<j> must be accepted: ' + r.stderr)

  const walkAfter = walkLib.readWalk(dir)
  const rec = walkAfter.journeys[JOURNEY]
  assert.strictEqual(rec.confirmedAt, null,
    'AC-12: --reopen journey:<j> must null the journey\'s confirmedAt on walk.json — the D8 unconfirmJourney call is unbuilt: got ' + JSON.stringify(rec))
  assert.ok(Array.isArray(rec.history) && rec.history.length === 1 && rec.history[0].cause === 'reopen',
    'AC-12: --reopen journey:<j> must append one history entry with cause:"reopen": got ' + JSON.stringify(rec.history))

  const state = stateOf(dir)
  assert.match(state.stdout, /WIREFRAMES/,
    'AC-12: the next bare run\'s derived state must still cascade to WIREFRAMES (the existing --reopen journey cascade, unrelated to D8): got ' + state.stdout)
})
