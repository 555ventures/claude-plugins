'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { runNode, tmpdir } = require('../helpers')
const {
  SCRIPT, JOURNEY, LABELS, DENSE,
  bare, mark, stateOf,
  writeFile, statusJson,
  writeCanon, writeWireframe, writeKitCanon,
  decideLook,
  advanceToSeedDone, advanceToShapePicked, advanceToKitSigned, advanceToCanonWritten, advanceToJourneyApproved,
  advanceToApproved,
  ledgerCmd,
  writeFixtureCapture, writeCaptureConfig,
  stubNpx, freePort, startServe, stopServe,
} = require('./mocks-driver-fixtures')

// specs/20260902/07-mocks-command-driver.md (TDD red): spec/scripts/mocks-driver.js does not
// exist yet — every test below is red until the driver lands. AC-20260902-07-13, and
// specs/20260905/06-plugin-owned-capture-at-approval.md's D5 render-gate-at-approval AC-7..9.
// Fixtures build the SEED->APPROVED chain through the real binary (advanceTo* helpers), the way
// tests/genesis/genesis-driver.test.js drives genesis-driver.js, so each later-stage test's
// setup is itself an executed proof that every earlier mark's contract holds.
//
// specs/20260903/07-test-file-budget-guard.md's per-file 45s guard split this file: shared
// fixtures live in mocks-driver-fixtures.js, and the D6/D7/D8 look-stop tests (AC-20260905-02-9..15)
// moved to the sibling mocks-driver-look-stops.test.js. This file is the second split of
// mocks-driver-2.test.js (the guard tripped again under full-suite load): the AC-20260902-07-13
// look-probe, AC-20260905-06-7/-8 capture-gate, and AC-20260907-04-9/-10/-12 kit tests moved
// here verbatim; test logic unchanged.
//
// ---------------------------------------------------------------------------
// AC-20260902-07-13
// ---------------------------------------------------------------------------
test('AC-20260902-07-13: look-probe refuses on a failing npx naming the install remedy; a bare run at SHAPES refuses the same way unless look-via browser was recorded; look invokes the screenshot CLI and deletes its sibling', () => {
  const dir = tmpdir('mocks-driver')
  advanceToSeedDone(dir) // now at SHAPES

  const failingPath = stubNpx(dir, { exitCode: 1 })
  const probe = runNode(SCRIPT, ['--root', dir, 'look-probe'], { env: { ...process.env, PATH: failingPath } })
  assert.strictEqual(probe.status, 2, 'look-probe must exit 2 when the npx CLI is unreachable: ' + probe.stdout + probe.stderr)
  assert.match(probe.stderr + probe.stdout, /npx playwright install chromium/, 'the refusal must name the exact install remedy')

  const bareEnv = runNode(SCRIPT, ['--root', dir], { env: { ...process.env, PATH: failingPath } })
  assert.strictEqual(bareEnv.status, 2, 'a bare run reaching SHAPES must refuse the same way when the look probe fails and look-via is not "browser": ' + bareEnv.stdout + bareEnv.stderr)
  assert.match(bareEnv.stderr + bareEnv.stdout, /npx playwright install chromium/, 'the bare-run refusal must carry the same install remedy')

  const viaBrowser = runNode(SCRIPT, ['--root', dir, 'look-via', 'browser'], { env: { ...process.env, PATH: failingPath } })
  assert.strictEqual(viaBrowser.status, 0, 'look-via browser must be accepted (a browser MCP path is declared, not probed): ' + viaBrowser.stdout + viaBrowser.stderr)
  assert.strictEqual(statusJson(dir).look, 'browser', 'look-via browser must record status.look = "browser"')
  const bareAfter = runNode(SCRIPT, ['--root', dir], { env: { ...process.env, PATH: failingPath } })
  assert.strictEqual(bareAfter.status, 0, 'once look is "browser", a bare run must print the step instead of refusing on the unreachable probe: ' + bareAfter.stdout + bareAfter.stderr)

  // look with a stub npx exiting 0 that logs its argv
  const dir2 = tmpdir('mocks-driver')
  advanceToSeedDone(dir2)
  writeFile(path.join(dir2, 'design/mocks/a.html'),
    '<link rel="stylesheet" href="../wire/tokens.css">\n' +
    '<main data-screen-label="a" data-status="sketch"><button data-state-btn="busy">Busy</button></main>\n')
  const argvLog = path.join(dir2, 'npx-argv.log')
  const okPath = stubNpx(dir2, { exitCode: 0, logArgvTo: argvLog })
  const outPng = path.join(dir2, 'out.png')
  const looked = runNode(SCRIPT, ['--root', dir2, 'look', 'a', '--state', 'busy', '--out', outPng],
    { env: { ...process.env, PATH: okPath } })
  assert.strictEqual(looked.status, 0, 'look must exit 0 when the screenshot CLI succeeds: ' + looked.stdout + looked.stderr)
  const argv = fs.readFileSync(argvLog, 'utf8')
  assert.match(argv, /screenshot --viewport-size=390,844/, 'look must invoke `playwright screenshot --viewport-size=390,844` from the first declared viewport')
  assert.match(argv, /file:\/\/.*\.look-a\.html/, 'look must pass a file:// URL to a generated .look-a.html sibling')
  assert.match(argv, new RegExp(outPng.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'look must pass the requested --out path as the screenshot destination')
  const leftoverLooks = fs.readdirSync(path.join(dir2, 'design/mocks')).filter((f) => f.startsWith('.look-'))
  assert.deepStrictEqual(leftoverLooks, [], 'the generated .look-a.html sibling must be deleted after the screenshot runs, leaving no trace on disk')
})

// ---------------------------------------------------------------------------
// specs/20260905/06-plugin-owned-capture-at-approval.md (D5): journey-approved and approved
// now run render-gate --mocks over the journey's / the whole set's top-level mocks and refuse
// on any finding or capture failure. AC-20260905-06-7/-8/-9.
// ---------------------------------------------------------------------------
test('AC-20260905-06-7: --mark journey-approved --journey <j> on a fixture host declaring a capture command whose canned inventory is a phone-width column at the 1440 cell exits 2 naming "fails the rendered adaptation gate" and a desktop-fill line, leaving journeys[j].approved unset', () => {
  const dir = tmpdir('mocks-driver')
  advanceToCanonWritten(dir)
  for (const label of LABELS) writeWireframe(dir, label)
  const drawn = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(drawn.status, 0, 'test setup requires journey-drawn to be accepted once every label conforms to D6: ' + drawn.stderr)

  fs.writeFileSync(path.join(dir, 'design/targets.json'),
    JSON.stringify({ schemaVersion: 1, themes: ['light'], viewports: [{ name: 'wide', width: 1440, height: 900 }] }))
  writeCaptureConfig(dir, writeFixtureCapture(dir))
  decideLook(dir, 'journey-approved:' + JOURNEY, 'approve', { by: 'jj' })

  const phoneColumnEntries = JSON.stringify([{ box: { x: 0, y: 0, w: 390, h: 20 }, fixed: false, outOfFlow: false, dataPositioned: false, srOnly: false }])
  const wideCleanPage = JSON.stringify({ scrollWidth: 1440, clientWidth: 1440 })
  const r = runNode(SCRIPT, ['--root', dir, '--mark', 'journey-approved', '--journey', JOURNEY], {
    env: { ...process.env, FAKE_CAPTURE_ENTRIES: phoneColumnEntries, FAKE_CAPTURE_PAGE: wideCleanPage },
  })

  assert.strictEqual(r.status, 2,
    'D5: a phone-width column at the 1440 cell must fail the adaptation gate and refuse the mark, exit 2: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /fails the rendered adaptation gate/,
    'D5: the refusal must carry the exact "fails the rendered adaptation gate" prefix Contracts names: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /desktop-fill/,
    'D5: the refusal must surface render-gate\'s own desktop-fill finding, not a generic failure: ' + r.stdout + r.stderr)
  const st = statusJson(dir)
  assert.ok(!st.journeys[JOURNEY] || !st.journeys[JOURNEY].approved,
    'a refused journey-approved must never record journeys.<j>.approved: ' + JSON.stringify(st.journeys[JOURNEY]))
})

test('AC-20260905-06-8: the same journey-approved mark with canned inventories that fill the 1440 cell records journeys[j].approved and prints the checkpoint line', () => {
  const dir = tmpdir('mocks-driver')
  advanceToCanonWritten(dir)
  for (const label of LABELS) writeWireframe(dir, label)
  const drawn = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(drawn.status, 0, 'test setup requires journey-drawn to be accepted once every label conforms to D6: ' + drawn.stderr)

  fs.writeFileSync(path.join(dir, 'design/targets.json'),
    JSON.stringify({ schemaVersion: 1, themes: ['light'], viewports: [{ name: 'wide', width: 1440, height: 900 }] }))
  writeCaptureConfig(dir, writeFixtureCapture(dir))
  decideLook(dir, 'journey-approved:' + JOURNEY, 'approve', { by: 'jj' })

  const filledEntries = JSON.stringify([{ box: { x: 0, y: 0, w: 1440, h: 20 }, fixed: false, outOfFlow: false, dataPositioned: false, srOnly: false }])
  const wideCleanPage = JSON.stringify({ scrollWidth: 1440, clientWidth: 1440 })
  const r = runNode(SCRIPT, ['--root', dir, '--mark', 'journey-approved', '--journey', JOURNEY], {
    env: { ...process.env, FAKE_CAPTURE_ENTRIES: filledEntries, FAKE_CAPTURE_PAGE: wideCleanPage },
  })

  assert.strictEqual(r.status, 0,
    'D5: content filling the 1440 cell must pass the adaptation gate and accept the mark: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /checkpoint/i,
    'an accepted mark must print the checkpoint line, same as every other accepted mark in this driver: ' + r.stdout)
  const st = statusJson(dir)
  assert.ok(st.journeys[JOURNEY] && st.journeys[JOURNEY].approved,
    'an accepted journey-approved must record journeys.<j>.approved: ' + JSON.stringify(st.journeys[JOURNEY]))
})

// ---------------------------------------------------------------------------
// specs/20260907/04-kit-canon-family.md D7: --mark kit-signed's own preconditions.
// ---------------------------------------------------------------------------
test('AC-20260907-04-9: --mark kit-signed exits non-zero naming stop open kit with no decided stop, without setting marks.kitSignedOff, and once the stop is decided it exits non-zero naming design/kit/ holds no .html file when the family is empty', () => {
  const dir = tmpdir('mocks-driver')
  advanceToShapePicked(dir)
  writeKitCanon(dir)

  const noStop = mark(dir, 'kit-signed')
  assert.strictEqual(noStop.status, 2,
    '--mark kit-signed must refuse with no decided stop, even once design/kit/ holds a file: ' + noStop.stdout + noStop.stderr)
  assert.match(noStop.stderr + noStop.stdout, /stop open kit/,
    'the refusal must name the remedy "stop open kit": ' + noStop.stdout + noStop.stderr)
  assert.strictEqual(statusJson(dir).marks.kitSignedOff, null,
    'a refused kit-signed mark must leave marks.kitSignedOff null: ' + JSON.stringify(statusJson(dir).marks))

  decideLook(dir, 'kit-signed', 'approve', { by: 'jj' })
  fs.rmSync(path.join(dir, 'design/kit'), { recursive: true, force: true })
  const empty = mark(dir, 'kit-signed')
  assert.strictEqual(empty.status, 2,
    '--mark kit-signed must refuse once design/kit/ holds no .html file, even once its stop is decided approve: ' + empty.stdout + empty.stderr)
  assert.match(empty.stderr + empty.stdout, /design\/kit\/ holds no \.html file/,
    'the refusal must name the exact D7 empty-family message: ' + empty.stdout + empty.stderr)
  assert.strictEqual(statusJson(dir).marks.kitSignedOff, null,
    'a refused kit-signed mark must leave marks.kitSignedOff null: ' + JSON.stringify(statusJson(dir).marks))
})

// ---------------------------------------------------------------------------
// specs/20260907/04-kit-canon-family.md D7: `stop open kit`'s candidate derivation.
// ---------------------------------------------------------------------------
test('AC-20260907-04-10: stop open kit with two files under design/kit/ writes one stop with kind approve, key kit-signed, title "sign off the kit", and one candidate per file', async () => {
  let serveChild = null
  try {
    const dir = tmpdir('mocks-driver')
    advanceToShapePicked(dir)
    writeKitCanon(dir, [{ key: 'sheet', purpose: 'a modal panel for one focused task' }])
    writeFile(path.join(dir, 'design/kit/forms.html'),
      '<link rel="stylesheet" href="../wire/tokens.css">\n<div data-kit-canon="forms"></div>\n')
    const port = await freePort()
    serveChild = await startServe(dir, port)

    const r = runNode(SCRIPT, ['--root', dir, 'stop', 'open', 'kit', '--port', String(port)])
    assert.strictEqual(r.status, 0, 'stop open kit must exit 0 once design/kit/ holds candidates: ' + r.stdout + r.stderr)
    const stops = JSON.parse(fs.readFileSync(path.join(dir, 'design/mocks/picks.json'), 'utf8'))
    const kitStop = stops.find((s) => s.key === 'kit-signed')
    assert.ok(kitStop, 'stop open kit must write one stop keyed kit-signed: ' + JSON.stringify(stops))
    assert.strictEqual(kitStop.kind, 'approve', 'the kit stop must be an approve stop: ' + JSON.stringify(kitStop))
    assert.strictEqual(kitStop.title, 'sign off the kit', 'D7: the kit stop must carry the exact title "sign off the kit": ' + JSON.stringify(kitStop))
    assert.strictEqual(kitStop.candidates.length, 2,
      'the kit stop must carry exactly one candidate per file under design/kit/: ' + JSON.stringify(kitStop.candidates))
    const paths = kitStop.candidates.map((c) => c.path).sort()
    assert.deepStrictEqual(paths, ['kit/forms.html', 'kit/kit.html'],
      'D7: each candidate must be "<name>=kit/<name>.html": ' + JSON.stringify(kitStop.candidates))
  } finally {
    await stopServe(serveChild)
  }
})

// ---------------------------------------------------------------------------
// specs/20260907/04-kit-canon-family.md D9: journey-approved's kit gate.
// ---------------------------------------------------------------------------
function kitAwareWireframe(label, regionAttr) {
  return '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<link rel="stylesheet" href="../wire/tokens.css">\n' +
    '<link rel="stylesheet" href="../wire/wire.css">\n' +
    '<style>* { box-sizing: border-box; }</style>\n' +
    '<main data-screen-label="' + label + '" data-status="sketch">' + label +
    '<div data-contract="none"><button data-state-btn="empty">empty</button>' +
    '<button data-state-btn="loading">loading</button><button data-state-btn="error">error</button></div>' +
    '<section' + (regionAttr ? ' ' + regionAttr : '') + '>content</section>' +
    '</main>\n'
}

test('AC-20260907-04-12: journey-approved refuses naming the file and the D4 remedy when a journey screen carries an unabsorbed content region, once a kit family resolves, and accepts once every region is kit-tagged or bespoke-marked', () => {
  const dir = tmpdir('mocks-driver')
  advanceToKitSigned(dir, [{ key: 'sheet', purpose: 'a modal panel for one focused task' }])
  writeCanon(dir)
  const canonWritten = mark(dir, 'canon-written')
  assert.strictEqual(canonWritten.status, 0, 'test setup requires canon-written to be accepted: ' + canonWritten.stderr)

  for (const label of LABELS) writeFile(path.join(dir, 'design/mocks', label + '.html'), kitAwareWireframe(label, null))
  const drawn = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(drawn.status, 0,
    'test setup requires journey-drawn to be accepted — the unabsorbed-region rule only violates at journey-approved\'s forced --matrix, journey-drawn only warns: ' + drawn.stdout + drawn.stderr)
  writeCaptureConfig(dir, writeFixtureCapture(dir))
  decideLook(dir, 'journey-approved:' + JOURNEY, 'approve', { by: 'jj' })

  const bad = mark(dir, 'journey-approved', ['--journey', JOURNEY])
  assert.strictEqual(bad.status, 2,
    'D9: journey-approved must refuse once a screen carries an unabsorbed content region, with a kit family present: ' + bad.stdout + bad.stderr)
  assert.match(bad.stderr + bad.stdout, new RegExp(LABELS[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'the refusal must name the offending file: ' + bad.stdout + bad.stderr)
  assert.match(bad.stderr + bad.stdout, /carries neither data-kit nor data-bespoke/,
    'the refusal must carry the D4 remedy text: ' + bad.stdout + bad.stderr)
  assert.strictEqual(statusJson(dir).journeys[JOURNEY].approved, null,
    'a refused journey-approved mark must leave journeys.<j>.approved unset: ' + JSON.stringify(statusJson(dir).journeys))

  for (const label of LABELS) writeFile(path.join(dir, 'design/mocks', label + '.html'), kitAwareWireframe(label, 'data-kit="sheet"'))
  const good = mark(dir, 'journey-approved', ['--journey', JOURNEY])
  assert.strictEqual(good.status, 0,
    'journey-approved must accept once every content region is kit-tagged or bespoke-marked: ' + good.stdout + good.stderr)
  assert.ok(statusJson(dir).journeys[JOURNEY].approved,
    'an accepted journey-approved must record journeys.<j>.approved once every region conforms')
})
