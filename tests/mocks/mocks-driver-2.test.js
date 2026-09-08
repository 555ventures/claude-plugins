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
  writeWireframe,
  decideLook,
  advanceToSeedDone, advanceToShapePicked, advanceToCanonWritten, advanceToJourneyApproved,
  advanceToDirectionComposed, advanceToThemePicked, advanceToApproved,
  ledgerCmd,
  writeFixtureCapture, writeCaptureConfig,
  writeKitCanon,
  freePort, startServe, stopServe,
  stubNpx,
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
// moved to the sibling mocks-driver-look-stops.test.js.
//
// Split from tests/mocks/mocks-driver.test.js under specs/20260906/01-ac-drift-doctor-check.md D11 (per-file 45 s budget, specs/20260903/06-test-suite-critical-path.md); test logic unchanged.
//
// specs/20260906/02-mocks-ends-at-wireframes.md: SKIN and REVIEW retire — AC-20260906-02-5
// (rewrite of the former AC-20260902-07-10 approved test + retag of AC-20260905-06-9's pin) and
// AC-20260906-02-7 (rewrite of the former AC-20260902-07-11 reopen test) replace them below; the
// former AC-20260902-07-9 journey-reviewed test is deleted outright — journey-reviewed is not
// among the driver's live marks.

// ---------------------------------------------------------------------------
// AC-20260906-02-5
// ---------------------------------------------------------------------------
test('AC-20260906-02-5: approved refuses before theme-picked; once theme-picked, refuses on an unresolved mock note and refuses with no decided approved stop; once the stop is decided approve it stamps a sketch mock to approved byte-diff-only, records the decider, and derives APPROVED', () => {
  const dir = tmpdir('mocks-driver')
  advanceToJourneyApproved(dir)

  const beforeTheme = mark(dir, 'approved')
  assert.strictEqual(beforeTheme.status, 2, 'approved must refuse before theme-picked has been recorded: ' + beforeTheme.stdout + beforeTheme.stderr)
  assert.match(beforeTheme.stderr + beforeTheme.stdout, /theme-picked first/, 'D5: the refusal must carry the exact "theme-picked first" remedy: ' + beforeTheme.stdout + beforeTheme.stderr)

  advanceToDirectionComposed(dir, 'quiet', [DENSE, LABELS[0]], 'P15')
  advanceToDirectionComposed(dir, 'warm', [DENSE, LABELS[1]], 'P16')
  const themeRow = ledgerCmd(dir, 'add', ['--id', 'P17', '--step', 'THEME', '--kind', 'product', '--claim', 'theme: quiet', '--tag', 'said-by-user', '--status', 'confirmed', '--rejected', 'warm'])
  assert.strictEqual(themeRow.status, 0, 'test setup requires the theme row to be accepted: ' + themeRow.stderr)
  decideLook(dir, 'theme-picked', 'pick', { pick: 'quiet', others: ['warm'], by: 'jj' })
  const picked = mark(dir, 'theme-picked', ['--direction', 'quiet'])
  assert.strictEqual(picked.status, 0, 'test setup requires theme-picked to be accepted: ' + picked.stdout + picked.stderr)

  const openNote = { id: 'N001', scope: 'mock', screen: 'consent', state: null, text: 'wording is off', by: 'Ren', at: new Date().toISOString(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null }
  writeFile(path.join(dir, 'design/mocks/notes.json'), JSON.stringify([openNote]))
  const noteBlocked = mark(dir, 'approved')
  assert.strictEqual(noteBlocked.status, 2, 'approved must refuse while a mock note on "consent" is unresolved: ' + noteBlocked.stdout + noteBlocked.stderr)
  assert.match(noteBlocked.stderr + noteBlocked.stdout, /N001/, 'the refusal must name the offending note id "N001": ' + noteBlocked.stdout + noteBlocked.stderr)
  fs.rmSync(path.join(dir, 'design/mocks/notes.json'))

  const noStop = mark(dir, 'approved')
  assert.strictEqual(noStop.status, 2, 'approved must refuse with no decided approved stop, even once notes are resolved: ' + noStop.stdout + noStop.stderr)
  assert.match(noStop.stderr + noStop.stdout, /no look stop for approved/, 'the refusal must name the exact "no look stop for approved" message: ' + noStop.stdout + noStop.stderr)
  assert.match(noStop.stderr + noStop.stdout, /stop open signoff/, 'the refusal must name the remedy "stop open signoff": ' + noStop.stdout + noStop.stderr)

  const signinPath = path.join(dir, 'design/mocks', LABELS[0] + '.html')
  const beforeStamp = fs.readFileSync(signinPath, 'utf8')
  assert.match(beforeStamp, /data-status="sketch"/, 'test setup requires design/mocks/' + LABELS[0] + '.html to still carry data-status="sketch" before the mark, or the byte-diff assertion below is vacuous')

  decideLook(dir, 'approved', 'approve', { by: 'Ren' })
  const r = mark(dir, 'approved')
  assert.strictEqual(r.status, 0, 'approved must be accepted once theme is picked, notes are resolved, and the stop is decided approve: ' + r.stdout + r.stderr)

  const afterStamp = fs.readFileSync(signinPath, 'utf8')
  assert.strictEqual(afterStamp, beforeStamp.replace('data-status="sketch"', 'data-status="approved"'),
    'AC-5: accepting approved must rewrite ' + LABELS[0] + '.html so the ONLY byte difference is data-status="sketch" -> data-status="approved": ' + JSON.stringify({ beforeStamp, afterStamp }))

  const status = statusJson(dir)
  assert.strictEqual(status.decider, 'Ren', 'accepting approved must record status.decider from the stop\'s "by"')
  assert.ok(status.marks.approved, 'accepting approved must record marks.approved')
  assert.strictEqual(status.state, 'APPROVED', 'accepting approved must derive state APPROVED')
})

test('AC-20260905-06-9 / AC-20260906-02-5: --mark approved on a host declaring no design block with CHROME_BIN=/nonexistent/chrome exits 2 with "render-gate --mocks could not run:" naming CHROME_BIN, marks.approved stays null, and the mock file is byte-unchanged (render-gate runs before any file is stamped approved)', () => {
  const dir = tmpdir('mocks-driver')
  advanceToThemePicked(dir)
  decideLook(dir, 'approved', 'approve', { by: 'Ren' })
  const before = fs.readFileSync(path.join(dir, 'design/mocks', LABELS[0] + '.html'), 'utf8')
  // The chain up to here (via advanceToJourneyApproved) declared a fixture capture command so
  // every earlier journey-approved mark could pass predictably — this AC needs a host declaring
  // NO design block at all when the final `approved` mark itself runs.
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
  const after = fs.readFileSync(path.join(dir, 'design/mocks', LABELS[0] + '.html'), 'utf8')
  assert.strictEqual(after, before,
    'AC-20260906-02-5: a refused approved mark must never rewrite a mock file — the data-status stamp is the mark\'s own write and must only happen on acceptance: ' + JSON.stringify({ before, after }))
})

test('AC-20260906-02-5: approved refuses while a declared journey is not approved, even once theme is picked and the approved stop is decided approve — reopening the journey below journey-approved must re-block the mark it does not stamp', () => {
  const dir = tmpdir('mocks-driver')
  advanceToThemePicked(dir)
  decideLook(dir, 'approved', 'approve', { by: 'Ren' })

  const reopened = runNode(SCRIPT, ['--root', dir, '--reopen', 'journey:' + JOURNEY])
  assert.strictEqual(reopened.status, 0, 'test setup requires --reopen journey:<j> to be accepted on a theme-picked root, or the refusal below is not exercising an unapproved journey: ' + reopened.stdout + reopened.stderr)
  assert.strictEqual(statusJson(dir).journeys[JOURNEY].approved, null, 'test setup requires journeys.<j>.approved to be cleared by the reopen, or the precondition under test is not actually violated: ' + JSON.stringify(statusJson(dir).journeys))

  const signinPath = path.join(dir, 'design/mocks', LABELS[0] + '.html')
  const before = fs.readFileSync(signinPath, 'utf8')

  const r = mark(dir, 'approved')
  assert.strictEqual(r.status, 2,
    'D5: approved must refuse while any declared journey is not approved, even with theme picked and the approved stop already decided approve: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, new RegExp(JOURNEY),
    'D5: the refusal must name the unapproved journey "' + JOURNEY + '", not a generic message: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, /journey-approved/,
    'D5: the refusal must name the remedy mark "journey-approved" so the session knows how to clear it: ' + r.stdout + r.stderr)
  assert.strictEqual(statusJson(dir).marks.approved, null,
    'a refused approved mark must leave marks.approved null, never recorded: ' + JSON.stringify(statusJson(dir).marks))

  const after = fs.readFileSync(signinPath, 'utf8')
  assert.strictEqual(after, before,
    'a refused approved mark must never rewrite a mock file — the data-status stamp is the mark\'s own write and must only happen on acceptance: ' + JSON.stringify({ before, after }))
})

// ---------------------------------------------------------------------------
// AC-20260906-02-7
// ---------------------------------------------------------------------------
test('AC-20260906-02-7: --reopen theme on an APPROVED root clears theme/marks.themePicked/marks.approved/decider, leaves every journeys[j].approved unchanged, and derives THEME; --reopen journey:<j> on an APPROVED root clears that journey\'s approved + marks.approved and derives WIREFRAMES', () => {
  const dir = tmpdir('mocks-driver')
  advanceToApproved(dir)
  const journeyApprovedBefore = statusJson(dir).journeys[JOURNEY].approved
  assert.ok(journeyApprovedBefore, 'test setup requires journeys.<j>.approved to be recorded before reopening theme, or the "leave journeys unchanged" assertion below is vacuous')

  const themeReopen = runNode(SCRIPT, ['--root', dir, '--reopen', 'theme'])
  assert.strictEqual(themeReopen.status, 0, '--reopen theme must exit 0 on an APPROVED root: ' + themeReopen.stdout + themeReopen.stderr)
  assert.match(themeReopen.stdout, /invalidated: theme, approved\(all\)/, 'the reopen output must print the exact D7 invalidated list for a theme reopen: ' + themeReopen.stdout)
  const status = statusJson(dir)
  assert.strictEqual(status.theme, null, '--reopen theme must clear status.theme')
  assert.strictEqual(status.marks.themePicked, null, '--reopen theme must clear marks.themePicked')
  assert.strictEqual(status.marks.approved, null, '--reopen theme must clear marks.approved')
  assert.strictEqual(status.decider, null, '--reopen theme must clear decider')
  assert.strictEqual(status.journeys[JOURNEY].approved, journeyApprovedBefore, '--reopen theme must never touch journeys[j].approved — a theme re-pick must not un-approve a journey\'s wireframes (D7 rationale)')
  const derived = stateOf(dir)
  assert.strictEqual(derived.stdout.trim(), 'THEME', 'the next derivation after --reopen theme must land on THEME')

  const dir2 = tmpdir('mocks-driver')
  advanceToApproved(dir2)
  const journeyReopen = runNode(SCRIPT, ['--root', dir2, '--reopen', 'journey:' + JOURNEY])
  assert.strictEqual(journeyReopen.status, 0, '--reopen journey:<j> must exit 0 on an APPROVED root: ' + journeyReopen.stdout + journeyReopen.stderr)
  assert.match(journeyReopen.stdout, /invalidated:/, 'the reopen output must print the invalidated: prefix: ' + journeyReopen.stdout)
  assert.match(journeyReopen.stdout, /approved/, 'reopening an approved journey must list "approved" among the invalidated marks: ' + journeyReopen.stdout)
  assert.match(journeyReopen.stdout, /approved\(all\)/, 'reopening a journey on an APPROVED root must also invalidate approved(all): ' + journeyReopen.stdout)
  const status2 = statusJson(dir2)
  assert.strictEqual(status2.journeys[JOURNEY].approved, null, '--reopen journey:<j> must clear that journey\'s approved mark')
  assert.strictEqual(status2.marks.approved, null, '--reopen journey:<j> must clear marks.approved')
  const derived2 = stateOf(dir2)
  assert.strictEqual(derived2.stdout.trim(), 'WIREFRAMES', 'the next derivation after --reopen journey:<j> on the only journey must land on WIREFRAMES')
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

// ---------------------------------------------------------------------------
// AC-20260907-04-9
// ---------------------------------------------------------------------------
// specs/20260907/04-kit-canon-family.md D7, TDD red: mocks-driver.js has no "kit-signed" mark
// at all today — every `--mark kit-signed` call below fails on "unknown mark" rather than the
// D7 stop/empty-family refusals this AC pins.
test('AC-20260907-04-9: --mark kit-signed exits non-zero naming "stop open kit" and never sets marks.kitSignedOff with no decided stop; once a stop is decided, exits non-zero naming "design/kit/ holds no .html file" while the family is empty', () => {
  const dir = tmpdir('mocks-driver')
  advanceToShapePicked(dir)

  const noStop = mark(dir, 'kit-signed')
  assert.notStrictEqual(noStop.status, 0, 'D7: kit-signed must refuse with no decided look stop for its key: ' + noStop.stdout + noStop.stderr)
  assert.match(noStop.stderr + noStop.stdout, /stop open kit/,
    'D7: the no-decided-stop refusal must name the remedy "stop open kit": ' + noStop.stdout + noStop.stderr)
  assert.strictEqual(statusJson(dir).marks.kitSignedOff, null,
    'a refused kit-signed must never set marks.kitSignedOff: ' + JSON.stringify(statusJson(dir).marks))

  decideLook(dir, 'kit-signed', 'approve', { title: 'sign off the kit' })
  const kitHtmlFiles = fs.existsSync(path.join(dir, 'design/kit'))
    ? fs.readdirSync(path.join(dir, 'design/kit')).filter((f) => f.endsWith('.html'))
    : []
  assert.deepStrictEqual(kitHtmlFiles, [],
    'test setup requires design/kit/ to hold no .html file for this arm, or the empty-family refusal below is not isolated: ' + JSON.stringify(kitHtmlFiles))

  const emptyFamily = mark(dir, 'kit-signed')
  assert.notStrictEqual(emptyFamily.status, 0, 'D7: kit-signed must refuse once design/kit/ holds no .html file, even with a decided stop present: ' + emptyFamily.stdout + emptyFamily.stderr)
  assert.match(emptyFamily.stderr + emptyFamily.stdout, /design\/kit\/ holds no \.html file/,
    'D7: the empty-family refusal must carry the exact Contracts literal "design/kit/ holds no .html file": ' + emptyFamily.stdout + emptyFamily.stderr)
  assert.strictEqual(statusJson(dir).marks.kitSignedOff, null,
    'a refused kit-signed must never set marks.kitSignedOff, even once a stop is decided: ' + JSON.stringify(statusJson(dir).marks))
})

// ---------------------------------------------------------------------------
// AC-20260907-04-10
// ---------------------------------------------------------------------------
// specs/20260907/04-kit-canon-family.md D7, TDD red: `stop open kit` is not among the driver's
// known steps today (buildStopSpec has no "kit" branch) — it refuses "unknown step", never
// writes a stop.
test('AC-20260907-04-10: stop open kit with two files under design/kit/ writes one stop with kind approve, key kit-signed, and one candidate per file', async () => {
  const dir = tmpdir('mocks-driver')
  advanceToShapePicked(dir)
  writeKitCanon(dir, [{ key: 'sheet', purpose: 'a' }], 'sheet-kit')
  writeKitCanon(dir, [{ key: 'blank-state', purpose: 'b' }], 'empty-kit')

  const port = await freePort()
  let serveChild = null
  try {
    serveChild = await startServe(dir, port)
    const r = runNode(SCRIPT, ['--root', dir, 'stop', 'open', 'kit', '--port', String(port)])
    assert.strictEqual(r.status, 0, 'stop open kit must exit 0 with two design/kit/*.html files on disk: ' + r.stdout + r.stderr)

    const stops = JSON.parse(fs.readFileSync(path.join(dir, 'design/mocks/picks.json'), 'utf8'))
    const kitStop = stops.find((s) => s.key === 'kit-signed')
    assert.ok(kitStop, 'stop open kit must write exactly one stop keyed "kit-signed": ' + JSON.stringify(stops))
    assert.strictEqual(kitStop.kind, 'approve', 'the kit stop must be an approve stop: ' + JSON.stringify(kitStop))
    assert.strictEqual(kitStop.candidates.length, 2, 'the kit stop must carry one candidate per design/kit/*.html file: ' + JSON.stringify(kitStop.candidates))
    assert.deepStrictEqual(kitStop.candidates.map((c) => c.label).sort(), ['empty-kit', 'sheet-kit'],
      'the kit stop\'s candidates must name each design/kit/*.html file by its basename: ' + JSON.stringify(kitStop.candidates))
  } finally {
    if (serveChild) await stopServe(serveChild)
  }
})


// specs/20260907/04-kit-canon-family.md D9: the kit binding fires once per journey, at the last
// gate before a client sees the frame, where amending the kit is still cheap — never at
// wireframe speed across every screen. journey-approved's mocks sit at data-status="sketch",
// where D5 would only warn, so the gate passes --matrix to force the violation tier.
test('AC-20260907-04-12: --mark journey-approved refuses on a journey screen carrying an unabsorbed region with a kit family present, naming the file and the remedy and leaving journeys.<j>.approved unset; it accepts once every region is kit-tagged or bespoke-marked', () => {
  const dir = tmpdir('mocks-driver-kit-journey')
  advanceToCanonWritten(dir) // chains through kit-signed, so design/kit/ resolves above design/mocks/

  // Every label of the journey conforms except the first, which carries a real content region
  // nobody named — the exact shape D4 counts as unabsorbed.
  const regionOf = (inner) =>
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<link rel="stylesheet" href="../wire/tokens.css">\n' +
    '<link rel="stylesheet" href="../wire/wire.css">\n' +
    '<style>* { box-sizing: border-box; }</style>\n'
  const writeRegionMock = (label, regionAttrs) => {
    writeFile(path.join(dir, 'design/mocks', label + '.html'),
      regionOf() +
      '<main data-screen-label="' + label + '" data-status="sketch">\n' +
      '  <div data-contract="none">' +
      ['empty', 'loading', 'error'].map((s) => '<button data-state-btn="' + s + '">' + s + '</button>').join('') +
      '</div>\n' +
      '  <section' + regionAttrs + '>the one region of this screen</section>\n' +
      '</main>\n')
  }

  for (const label of LABELS) writeWireframe(dir, label)
  writeRegionMock(LABELS[0], '') // unabsorbed: neither data-kit nor data-bespoke

  const drawn = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(drawn.status, 0,
    'test setup requires journey-drawn to accept these screens — the kit gate binds at journey-approved, never at journey-drawn, so a refusal here would mean the gate fired one step too early: ' + drawn.stderr)
  writeCaptureConfig(dir, writeFixtureCapture(dir))
  decideLook(dir, 'journey-approved:' + JOURNEY, 'approve', { by: 'jj' })

  const refused = mark(dir, 'journey-approved', ['--journey', JOURNEY])
  assert.notStrictEqual(refused.status, 0,
    'journey-approved must refuse while a screen of the journey carries a region that is neither a kit instance nor an explicitly marked non-instance — this is the last gate before a client sees the frame, and approving here is exactly how an unnamed primitive gets multiplied across the product: ' + refused.stdout + refused.stderr)
  assert.match(refused.stdout + refused.stderr, new RegExp(LABELS[0]),
    'the refusal must name the offending screen — a journey-wide refusal that does not say which screen leaves the author re-reading every mock in the journey: ' + refused.stdout + refused.stderr)
  assert.match(refused.stdout + refused.stderr, /data-kit|data-bespoke/,
    'the refusal must name the remedy marks, not merely report a failed check — an error path that does not name its remedy is a hard finding in this repo: ' + refused.stdout + refused.stderr)
  assert.strictEqual((statusJson(dir).journeys[JOURNEY] || {}).approved || null, null,
    'a refused journey-approved must leave journeys.<j>.approved unset — recording the approval alongside a refusal would make the mark lie about what a human accepted')

  // Marking the same region bespoke, with the difference stated, is the sanctioned way past.
  writeRegionMock(LABELS[0], ' data-bespoke="sheet: two-column body the sheet primitive cannot express"')
  const accepted = mark(dir, 'journey-approved', ['--journey', JOURNEY])
  assert.strictEqual(accepted.status, 0,
    'journey-approved must accept once every region is a kit instance or an honestly marked non-instance — a gate with no way past it stops being a prompt to name a primitive and becomes a wall authors route around: ' + accepted.stdout + accepted.stderr)
  assert.ok((statusJson(dir).journeys[JOURNEY] || {}).approved,
    'the accepted journey must record journeys.<j>.approved — without it the driver re-derives WIREFRAMES forever and the chain can never reach THEME')
})
