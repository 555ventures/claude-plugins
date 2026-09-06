'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { runNode, tmpdir } = require('../helpers')
const {
  SCRIPT, JOURNEY, LABELS,
  bare, mark, stateOf,
  writeFile, statusJson,
  writeWireframe, writeSkinned,
  decideLook,
  advanceToSeedDone, advanceToCanonWritten, advanceToJourneyApproved,
  advanceToSkinned, advanceToReviewed,
  writeFixtureCapture, writeCaptureConfig,
  stubNpx,
} = require('./mocks-driver-fixtures')

// specs/20260902/07-mocks-command-driver.md (TDD red): spec/scripts/mocks-driver.js does not
// exist yet — every test below is red until the driver lands. AC-20260902-07-9 .. -11, -13, and
// specs/20260905/06-plugin-owned-capture-at-approval.md's D5 render-gate-at-approval AC-7..9.
// Fixtures build the SEED->APPROVED chain through the real binary (advanceTo* helpers), the way
// tests/genesis/genesis-driver.test.js drives genesis-driver.js, so each later-stage test's
// setup is itself an executed proof that every earlier mark's contract holds.
//
// specs/20260903/07-test-file-budget-guard.md's per-file 45s guard split this file: shared
// fixtures live in mocks-driver-fixtures.js, and the D6/D7/D8 look-stop tests (AC-20260905-02-9..15)
// moved to the sibling mocks-driver-look-stops.test.js.
//
// Split from tests/mocks/mocks-driver.test.js under specs/20260906/01-ac-drift-doctor-check.md D11 (per-file 45 s budget, specs/20260903/06-test-suite-critical-path.md); test logic unchanged.

// ---------------------------------------------------------------------------
// AC-20260902-07-9
// ---------------------------------------------------------------------------
test('AC-20260902-07-9 / AC-20260905-02-18: journey-reviewed refuses before review-opened even with a decided stop present, naming the remedy; records reviewed once review is opened with a decider', () => {
  const dir = tmpdir('mocks-driver')
  advanceToSkinned(dir)
  decideLook(dir, 'journey-reviewed:' + JOURNEY, 'approve', { by: 'jj' })
  const early = mark(dir, 'journey-reviewed', ['--journey', JOURNEY])
  assert.strictEqual(early.status, 2, 'journey-reviewed must refuse before review-opened is recorded, even with a decided approve stop present: ' + early.stdout + early.stderr)
  assert.match(early.stderr + early.stdout, /review-opened --decider/, 'the refusal must name the remedy command "review-opened --decider"')

  const opened = mark(dir, 'review-opened', ['--decider', 'Ren'])
  assert.strictEqual(opened.status, 0, 'review-opened must be accepted with a decider name: ' + opened.stdout + opened.stderr)
  assert.strictEqual(statusJson(dir).decider, 'Ren', 'review-opened must record decider: "Ren" verbatim')

  const r = mark(dir, 'journey-reviewed', ['--journey', JOURNEY])
  assert.strictEqual(r.status, 0, 'journey-reviewed must be accepted once review is opened and the journey is skinned: ' + r.stdout + r.stderr)
  assert.strictEqual(statusJson(dir).journeys[JOURNEY].reviewed !== null, true, 'an accepted journey-reviewed must record journeys.<j>.reviewed')
})

// ---------------------------------------------------------------------------
// AC-20260902-07-10
// ---------------------------------------------------------------------------
test('AC-20260902-07-10 / AC-20260905-02-18: approved refuses a sketch-status screen or a failing matrix check even with a decided stop present, and records approved + APPROVED terminal state once every check holds', () => {
  const dir = tmpdir('mocks-driver')
  advanceToReviewed(dir)
  decideLook(dir, 'approved', 'approve', { by: 'jj' })

  writeSkinned(dir, LABELS, 'approved')
  // leave one screen at sketch
  fs.writeFileSync(path.join(dir, 'design/mocks', LABELS[0] + '.html'),
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<link rel="stylesheet" href="../tokens.css">\n<style>* { box-sizing: border-box; }</style>\n' +
    '<main data-screen-label="' + LABELS[0] + '" data-status="sketch">' + LABELS[0] + '</main>\n')
  let r = mark(dir, 'approved')
  assert.strictEqual(r.status, 2, 'approved must refuse while any design/mocks/*.html is still data-status="sketch", even with a decided approve stop present: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, new RegExp(LABELS[0]), 'the refusal must name the still-sketch file')

  // every screen approved, but strip the viewport meta so `check --matrix` fails
  writeSkinned(dir, LABELS, 'approved')
  fs.writeFileSync(path.join(dir, 'design/mocks', LABELS[0] + '.html'),
    '<link rel="stylesheet" href="../tokens.css">\n<style>* { box-sizing: border-box; }</style>\n' +
    '<main data-screen-label="' + LABELS[0] + '" data-status="approved">' + LABELS[0] + '</main>\n')
  r = mark(dir, 'approved')
  assert.strictEqual(r.status, 2, 'approved must refuse when `design-atlas.js check --matrix` fails: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, /viewport/, 'the refusal must carry check\'s own stdout naming the missing viewport meta')

  writeSkinned(dir, LABELS, 'approved')
  r = mark(dir, 'approved')
  assert.strictEqual(r.status, 0, 'approved must be accepted once every screen is approved, every journey reviewed, and the matrix check passes: ' + r.stdout + r.stderr)
  assert.strictEqual(statusJson(dir).marks.approved !== null, true, 'an accepted approved mark must record marks.approved')
  assert.strictEqual(statusJson(dir).state, 'APPROVED', 'an accepted approved mark must stamp state: "APPROVED"')

  const rerun = bare(dir)
  assert.strictEqual(rerun.status, 0, 'a bare re-run at APPROVED must exit 0 and print the terminal step: ' + rerun.stdout + rerun.stderr)
  assert.match(rerun.stdout, /next: \/spec:genesis/, 'the terminal APPROVED step must print "next: /spec:genesis"')
})

// ---------------------------------------------------------------------------
// AC-20260902-07-11
// ---------------------------------------------------------------------------
test('AC-20260902-07-11: --reopen journey clears that journey\'s marks and derives WIREFRAMES; --reopen theme clears theme + skin/review marks and derives THEME', () => {
  const dir = tmpdir('mocks-driver')
  advanceToSkinned(dir)
  const opened = mark(dir, 'review-opened', ['--decider', 'Ren'])
  assert.strictEqual(opened.status, 0, 'test setup requires review-opened to be accepted: ' + opened.stderr)
  decideLook(dir, 'journey-reviewed:' + JOURNEY, 'approve', { by: 'jj' })
  const reviewed = mark(dir, 'journey-reviewed', ['--journey', JOURNEY])
  assert.strictEqual(reviewed.status, 0, 'test setup requires journey-reviewed to be accepted: ' + reviewed.stderr)

  const beforeFiles = LABELS.map((l) => fs.readFileSync(path.join(dir, 'design/mocks', l + '.html'), 'utf8'))
  const r = runNode(SCRIPT, ['--root', dir, '--reopen', 'journey:' + JOURNEY])
  assert.strictEqual(r.status, 0, '--reopen journey:<j> must exit 0 on a real journey: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /↩ reopened journey:onboarding — invalidated:/, 'the reopen output must print the exact D11 prefix naming what was invalidated')
  assert.match(r.stdout, /skinned/, 'reopening a skinned+reviewed journey must list "skinned" among the invalidated marks')
  assert.match(r.stdout, /reviewed/, 'reopening a skinned+reviewed journey must list "reviewed" among the invalidated marks')

  const status = statusJson(dir)
  assert.strictEqual(status.journeys[JOURNEY].skinned, null, 'reopen must clear journeys.<j>.skinned')
  assert.strictEqual(status.journeys[JOURNEY].reviewed, null, 'reopen must clear journeys.<j>.reviewed')
  assert.ok(Array.isArray(status.reopens) && status.reopens.length === 1, 'reopen must append exactly one entry to status.reopens')

  const afterFiles = LABELS.map((l) => fs.readFileSync(path.join(dir, 'design/mocks', l + '.html'), 'utf8'))
  assert.deepStrictEqual(beforeFiles, afterFiles, 'reopen must never delete or modify any file on disk — only status.json marks change')

  const derived = stateOf(dir)
  assert.strictEqual(derived.stdout.trim(), 'WIREFRAMES', 'the next bare/--state derivation after reopening the only journey must land on WIREFRAMES')

  const dir2 = tmpdir('mocks-driver')
  advanceToSkinned(dir2)
  const themeReopen = runNode(SCRIPT, ['--root', dir2, '--reopen', 'theme'])
  assert.strictEqual(themeReopen.status, 0, '--reopen theme must exit 0: ' + themeReopen.stdout + themeReopen.stderr)
  const status2 = statusJson(dir2)
  assert.strictEqual(status2.theme, null, '--reopen theme must clear status.theme')
  assert.strictEqual(status2.journeys[JOURNEY].skinned, null, '--reopen theme must clear every journey\'s skinned mark')
  const derived2 = stateOf(dir2)
  assert.strictEqual(derived2.stdout.trim(), 'THEME', 'the next derivation after --reopen theme must land on THEME')
})

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

test('AC-20260905-06-9: --mark approved on a host declaring no design block with CHROME_BIN=/nonexistent/chrome exits 2 with "render-gate --mocks could not run:" naming CHROME_BIN, and marks.approved stays null', () => {
  const dir = tmpdir('mocks-driver')
  advanceToReviewed(dir)
  writeSkinned(dir, LABELS, 'approved')
  decideLook(dir, 'approved', 'approve', { by: 'jj' })
  // The chain up to here (via advanceToJourneyApproved) declared a fixture capture command so
  // every earlier journey-approved/journey-reviewed mark could pass predictably — AC-9 needs a
  // host declaring NO design block at all when the final `approved` mark itself runs.
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({}))

  const r = runNode(SCRIPT, ['--root', dir, '--mark', 'approved'],
    { env: { ...process.env, CHROME_BIN: '/nonexistent/chrome' } })

  assert.strictEqual(r.status, 2,
    'D5: no design block declared and no browser resolved must refuse the approved mark, exit 2: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /render-gate --mocks could not run:/,
    'D5: a gate exit 2/3 (capture-family) must be refused with this exact prefix, distinct from an ordinary findings refusal: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /CHROME_BIN/,
    'the underlying render-gate remedy naming CHROME_BIN must still be visible through the driver\'s own prefix: ' + r.stdout + r.stderr)
  assert.strictEqual(statusJson(dir).marks.approved, null,
    'a refused approved mark must leave marks.approved null, never recorded: ' + JSON.stringify(statusJson(dir).marks))
})
