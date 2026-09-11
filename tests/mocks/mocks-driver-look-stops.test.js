'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { runNode, tmpdir } = require('../helpers')
const {
  SCRIPT, JOURNEY, LABELS, DENSE,
  mark, writeFile, writeWireframe, statusJson,
  decideLook, openLook, freePort, startServe, stopServe,
  advanceToSeedDone, advanceToCanonWritten, advanceToJourneyApproved,
  advanceToShortJourneyDrawn,
  writeFixtureCapture, writeCaptureConfig,
} = require('./mocks-driver-fixtures')

// specs/20260905/04-per-project-look-server.md D3/D7: mocks-driver.js's `stop open`/`stop decide`
// now delegate to design-atlas.js's `stop` subcommands (design-hub.js is deleted) — these tests
// drive that delegation with a real `design-atlas.js serve` child on a free port instead of the
// old hub's registry, per fixture (AC-20260905-04-5, AC-20260905-04-9 carrying forward the
// still-true AC-20260905-02-10..-13 mark/bare-step behavior against a serve child).
//
// specs/20260903/07-test-file-budget-guard.md's per-file 45s guard split these tests out of
// tests/mocks/mocks-driver.test.js (that file tripped the guard at 50s under full-suite load once
// these hub-spawning tests landed beside the spec 06/07 chain); shared fixtures live in the
// sibling mocks-driver-fixtures.js, required by both files.
//
// Split under specs/20260906/01-ac-drift-doctor-check.md D11 (per-file 45 s budget, specs/20260903/06-test-suite-critical-path.md): the second half lives in mocks-driver-look-stops-2.test.js; test logic unchanged.
//
// Split again under specs/20260906/05-gray-states-on-every-wireframe.md D7 (per-file 45 s budget,
// specs/20260903/07-test-file-budget-guard.md): the AC-20260906-04-8/-9/-3 tests below moved
// verbatim to mocks-driver-look-stops-3.test.js; test logic unchanged.
//
// specs/20260907/07-mocks-retires-theme.md build (red-check mixed-pin, HARD): AC-20260907-07-3
// and its split-out CONTINUE-TO sibling AC-20260907-07-13 each pin one half of stop open's THEME
// retirement — the unknown-step refusal and the untouched shapes stop, respectively.

test('AC-20260905-04-5/AC-20260906-04-8: mocks-driver.js stop open journey:<j> --port <free> prints the D4 hand-off link off that project\'s own serve child (never a `/p/<name>/` hub mount) pointing at the journey review page, exits 3 naming the serve remedy when nothing answers --port, and stop decide keeps passing straight through', async () => {
  const dir = tmpdir('mocks-driver')
  advanceToShortJourneyDrawn(dir, 'onboarding', ['signin', 'invite'])
  const port = await freePort()
  let serveChild = null
  try {
    serveChild = await startServe(dir, port)

    const r = runNode(SCRIPT, ['--root', dir, 'stop', 'open', 'journey:onboarding', '--port', String(port)])
    assert.strictEqual(r.status, 0, 'stop open journey:onboarding must exit 0 once the journey is drawn: ' + r.stdout + r.stderr)
    const lines = r.stdout.split('\n').filter((l) => l.trim() !== '')
    assert.strictEqual(lines.length, 2, 'stop open journey:<j> must print exactly two stdout lines — the link and the fixed reply line: ' + JSON.stringify(r.stdout))
    assert.match(lines[0], /^🎨 ready for review — http:\/\/localhost:\d+\/review\/onboarding\.html#stop-P\d{3}$/,
      'the first line must match the D4 look-server link — the project\'s own served review page (specs/20260906/04 D6), never a `/p/<name>/` hub mount: ' + JSON.stringify(lines[0]))
    assert.match(lines[0], new RegExp('localhost:' + port + '/'),
      'the printed link must name the project\'s own --port ' + port + ', not a shared hub port: ' + JSON.stringify(lines[0]))
    assert.strictEqual(lines[1], 'Reply  ✅ approve  — or —  ✏️ change <what looks wrong>', 'the second line must be the exact fixed reply line for an approve stop: ' + JSON.stringify(lines[1]))

    // advanceToShortJourneyDrawn's own setup runs shape-picked through a decided pick stop
    // (D7), which AC-12 requires to remain on disk as "consumed" — so picks.json legitimately
    // carries more than this one stop; the AC's own wording is "one OPEN stop", so isolate that.
    const stops = JSON.parse(fs.readFileSync(path.join(dir, 'design/mocks/picks.json'), 'utf8'))
    const openStops = stops.filter((s) => s.status === 'open')
    assert.strictEqual(openStops.length, 1, 'stop open journey:onboarding must leave exactly one OPEN stop: ' + JSON.stringify(stops))
    assert.strictEqual(openStops[0].kind, 'approve', 'a journey stop must be an approve stop: ' + JSON.stringify(openStops[0]))
    assert.strictEqual(openStops[0].key, 'journey-approved:onboarding', 'the stop\'s key must be "journey-approved:onboarding" — this is what the mark handler looks up: ' + JSON.stringify(openStops[0]))
    assert.deepStrictEqual(openStops[0].candidates,
      [{ group: null, label: 'signin', path: 'mocks/signin.html' }, { group: null, label: 'invite', path: 'mocks/invite.html' }],
      'the stop\'s candidates must be the journey\'s seed labels mapped to mocks/<label>.html: ' + JSON.stringify(openStops[0].candidates))
    assert.strictEqual(openStops[0].url, lines[0].replace('🎨 ready for review — ', ''), 'the stop\'s recorded url must equal the printed link')

    const busyPort = await freePort()
    const noServe = runNode(SCRIPT, ['--root', dir, 'stop', 'open', 'journey:onboarding', '--port', String(busyPort)])
    assert.strictEqual(noServe.status, 3, 'stop open must exit 3 when nothing answers the given --port: ' + noServe.stdout + noServe.stderr)
    assert.match(noServe.stderr, /serve --root/, 'the exit-3 remedy must name `serve --root`: ' + JSON.stringify(noServe.stderr))

    const liveStop = JSON.parse(fs.readFileSync(path.join(dir, 'design/mocks/picks.json'), 'utf8')).find((s) => s.status === 'open')
    const decided = runNode(SCRIPT, ['--root', dir, 'stop', 'decide', liveStop.id, '--verdict', 'approve', '--by', 'chat'])
    assert.strictEqual(decided.status, 0, 'stop decide must still exit 0, passed straight through: ' + decided.stdout + decided.stderr)
    assert.strictEqual(decided.stdout, 'decided ' + liveStop.id + ' approve\n', 'stop decide must print exactly "decided <id> approve": ' + JSON.stringify(decided.stdout))
  } finally {
    if (serveChild) await stopServe(serveChild)
  }
})

// ---------------------------------------------------------------------------
// AC-20260905-02-10, AC-20260905-04-9
// ---------------------------------------------------------------------------
test('AC-20260905-02-10/AC-20260905-04-9: stop open shapes writes a pick stop grouped by candidate, and unknown/too-few-candidate steps refuse naming the remedy', async () => {
  let serveChild = null
  try {
    const dir = tmpdir('mocks-driver')
    advanceToSeedDone(dir) // now at SHAPES
    writeFile(path.join(dir, 'design/shapes/card-first.html'), '<main data-screen-label="' + DENSE + '" data-shape="card-first">card-first</main>\n')
    writeFile(path.join(dir, 'design/shapes/orb-hero.html'), '<main data-screen-label="' + DENSE + '" data-shape="orb-hero">orb-hero</main>\n')
    const port = await freePort()
    serveChild = await startServe(dir, port)

    const r = runNode(SCRIPT, ['--root', dir, 'stop', 'open', 'shapes', '--port', String(port)])
    assert.strictEqual(r.status, 0, 'stop open shapes must exit 0 with 2-3 shape candidates on disk: ' + r.stdout + r.stderr)
    const lines = r.stdout.split('\n').filter((l) => l.trim() !== '')
    assert.strictEqual(lines[1], 'Reply  ✅ pick <name>  — or —  ✏️ change <what looks wrong>', 'stop open shapes must print the pick-shaped reply line as its second line: ' + JSON.stringify(lines))
    const stops = JSON.parse(fs.readFileSync(path.join(dir, 'design/mocks/picks.json'), 'utf8'))
    const shapeStop = stops.find((s) => s.key === 'shape-picked')
    assert.strictEqual(shapeStop.kind, 'pick', 'the shapes stop must be a pick stop: ' + JSON.stringify(shapeStop))
    assert.deepStrictEqual(shapeStop.candidates.map((c) => c.group).sort(), ['card-first', 'orb-hero'], 'the shapes stop\'s candidates must be grouped by shape kebab: ' + JSON.stringify(shapeStop.candidates))

    const dir3 = tmpdir('mocks-driver')
    advanceToSeedDone(dir3)
    writeFile(path.join(dir3, 'design/shapes/only-one.html'), '<main data-screen-label="' + DENSE + '" data-shape="only-one">x</main>\n')
    const tooFew = runNode(SCRIPT, ['--root', dir3, 'stop', 'open', 'shapes'])
    assert.strictEqual(tooFew.status, 2, 'stop open shapes must refuse with fewer than 2 shape candidates on disk: ' + tooFew.stdout + tooFew.stderr)
    assert.match(tooFew.stderr + tooFew.stdout, /2-3/, 'the refusal must name the 2-3 candidate floor/ceiling: ' + tooFew.stdout + tooFew.stderr)

    const unknown = runNode(SCRIPT, ['--root', dir3, 'stop', 'open', 'nope'])
    assert.strictEqual(unknown.status, 2, 'stop open nope must refuse an unknown step: ' + unknown.stdout + unknown.stderr)
    // specs/20260907/07-mocks-retires-theme.md D4: "theme" drops out of the live-step list —
    // AC-20260907-07-3 below pins the exact narrowed literal directly.
    for (const step of ['shapes', 'kit', 'signoff']) {
      assert.match(unknown.stderr + unknown.stdout, new RegExp(step), 'the unknown-step refusal must name the valid steps, including "' + step + '": ' + unknown.stdout + unknown.stderr)
    }
    assert.ok(!(unknown.stderr + unknown.stdout).includes('theme'), 'the unknown-step refusal must never name the retired step "theme": ' + unknown.stdout + unknown.stderr)
  } finally {
    if (serveChild) await stopServe(serveChild)
  }
})

// specs/20260907/07-mocks-retires-theme.md build (red-check mixed-pin, HARD): AC-20260907-07-3
// mixed a new promise (stop open theme becomes an unknown step) with a SHALL CONTINUE TO clause
// (stop open shapes keeps working) in one test — split along the same line the spec's own AC
// list now draws, AC-20260907-07-3 keeping only the new promise and AC-20260907-07-13 carrying
// the split-out continue clause. Both tests share the same fixture shape ("a root with two
// composed directions on disk") the spec's own AC wording sets for each.
function writeTwoComposedDirections(dir) {
  // Two composed directions on disk — the mocks driver has no mark that composes a direction, so
  // this fixture writes design/theme/<kebab>/ directly: one tokens.css and one HTML file per
  // direction, naming the dense screen.
  for (const kebab of ['ocean', 'ember']) {
    writeFile(path.join(dir, 'design/theme', kebab, 'tokens.css'), ':root{--text-body:#111}\n')
    writeFile(path.join(dir, 'design/theme', kebab, DENSE + '.html'),
      '<link rel="stylesheet" href="tokens.css">\n<main data-screen-label="' + DENSE + '" data-status="sketch">' + DENSE + '</main>\n')
  }
}

// ---------------------------------------------------------------------------
// AC-20260907-07-3
// ---------------------------------------------------------------------------
test('AC-20260907-07-3: stop open theme exits 2 as an unknown step naming the exact live list even with two composed directions on disk, and writes no stop', () => {
  const dir = tmpdir('mocks-driver')
  advanceToSeedDone(dir) // now at SHAPES
  writeTwoComposedDirections(dir)

  const themeR = runNode(SCRIPT, ['--root', dir, 'stop', 'open', 'theme'])
  assert.strictEqual(themeR.status, 2, 'AC-20260907-07-3: stop open theme must exit 2 even with two composed directions on disk — the step itself is retired, not merely under-provisioned: ' + themeR.stdout + themeR.stderr)
  assert.match(themeR.stderr + themeR.stdout, /unknown step "theme"/, 'the refusal must name the exact unknown-step message for "theme": ' + themeR.stdout + themeR.stderr)
  assert.match(themeR.stderr + themeR.stdout, /one of: shapes, kit, journey:<j>, signoff/,
    'the refusal must carry the exact D4 live step list with theme dropped: ' + themeR.stdout + themeR.stderr)
  const stopsAfterTheme = fs.existsSync(path.join(dir, 'design/mocks/picks.json'))
    ? JSON.parse(fs.readFileSync(path.join(dir, 'design/mocks/picks.json'), 'utf8')) : []
  assert.strictEqual(stopsAfterTheme.length, 0, 'stop open theme must write no stop at all: ' + JSON.stringify(stopsAfterTheme))
})

// ---------------------------------------------------------------------------
// AC-20260907-07-13
// ---------------------------------------------------------------------------
test('AC-20260907-07-13: stop open shapes on a root with two composed directions on disk CONTINUES TO write one pick stop keyed shape-picked with one candidate group per shape', async () => {
  let serveChild = null
  try {
    const dir = tmpdir('mocks-driver')
    advanceToSeedDone(dir) // now at SHAPES
    writeFile(path.join(dir, 'design/shapes/card-first.html'), '<main data-screen-label="' + DENSE + '" data-shape="card-first">card-first</main>\n')
    writeFile(path.join(dir, 'design/shapes/orb-hero.html'), '<main data-screen-label="' + DENSE + '" data-shape="orb-hero">orb-hero</main>\n')
    writeTwoComposedDirections(dir)

    const port = await freePort()
    serveChild = await startServe(dir, port)
    const shapesR = runNode(SCRIPT, ['--root', dir, 'stop', 'open', 'shapes', '--port', String(port)])
    assert.strictEqual(shapesR.status, 0, 'AC-20260907-07-13: stop open shapes must CONTINUE TO exit 0 on a root with two composed directions on disk: ' + shapesR.stdout + shapesR.stderr)
    const stops = JSON.parse(fs.readFileSync(path.join(dir, 'design/mocks/picks.json'), 'utf8'))
    const shapeStop = stops.find((s) => s.key === 'shape-picked')
    assert.strictEqual(shapeStop.kind, 'pick', 'the shapes stop must CONTINUE TO be a pick stop: ' + JSON.stringify(shapeStop))
    assert.deepStrictEqual(shapeStop.candidates.map((c) => c.group).sort(), ['card-first', 'orb-hero'],
      'the shapes stop must CONTINUE TO group one candidate per shape: ' + JSON.stringify(shapeStop.candidates))
  } finally {
    if (serveChild) await stopServe(serveChild)
  }
})

// ---------------------------------------------------------------------------
// AC-20260905-02-11
// ---------------------------------------------------------------------------
test('AC-20260905-02-11/AC-20260905-04-9: --mark journey-approved refuses naming the remedy when no stop exists, "waiting on" when one is open, and the change note when one is decided change', () => {
  const dir = tmpdir('mocks-driver')
  advanceToCanonWritten(dir)
  for (let i = 0; i < LABELS.length; i++) writeWireframe(dir, LABELS[i], { to: LABELS[i + 1] })
  const drawn = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(drawn.status, 0, 'test setup requires journey-drawn to be accepted: ' + drawn.stderr)
  writeCaptureConfig(dir, writeFixtureCapture(dir))

  const noStop = mark(dir, 'journey-approved', ['--journey', JOURNEY])
  assert.strictEqual(noStop.status, 2, 'journey-approved must refuse when no look stop exists for its key: ' + noStop.stdout + noStop.stderr)
  assert.match(noStop.stderr + noStop.stdout, /no look stop for journey-approved:onboarding/, 'the refusal must name the exact D7 "no look stop for <key>" message: ' + noStop.stdout + noStop.stderr)
  assert.match(noStop.stderr + noStop.stdout, /stop open journey:onboarding/, 'the refusal must name the remedy command: ' + noStop.stdout + noStop.stderr)
  assert.strictEqual(statusJson(dir).journeys[JOURNEY].approved, null, 'a refused journey-approved must leave journeys.<j>.approved null')

  openLook(dir, 'journey-approved:' + JOURNEY, { title: 'approve journey ' + JOURNEY, url: 'http://localhost:0/p/x/atlas/index.html#stop-P001' })
  const waiting = mark(dir, 'journey-approved', ['--journey', JOURNEY])
  assert.strictEqual(waiting.status, 2, 'journey-approved must refuse while the stop is open, naming "waiting on" its url: ' + waiting.stdout + waiting.stderr)
  assert.match(waiting.stderr + waiting.stdout, /waiting on/, 'the refusal must name "waiting on": ' + waiting.stdout + waiting.stderr)

  decideLook(dir, 'journey-approved:' + JOURNEY, 'change', { by: 'jj', note: 'too dense' })
  const changed = mark(dir, 'journey-approved', ['--journey', JOURNEY])
  assert.strictEqual(changed.status, 2, 'journey-approved must refuse when the stop is decided change: ' + changed.stdout + changed.stderr)
  assert.match(changed.stderr + changed.stdout, /change requested by jj: "too dense"/, 'the refusal must name the deciding user and the note verbatim: ' + changed.stdout + changed.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260905-02-12
// ---------------------------------------------------------------------------
test('AC-20260905-02-12/AC-20260905-04-9: journey-approved accepts a decided-approve stop and consumes it; a newer open stop sharing the key makes it refuse "waiting on" that newer url', () => {
  const dir = tmpdir('mocks-driver')
  advanceToCanonWritten(dir)
  for (let i = 0; i < LABELS.length; i++) writeWireframe(dir, LABELS[i], { to: LABELS[i + 1] })
  assert.strictEqual(mark(dir, 'journey-drawn', ['--journey', JOURNEY]).status, 0, 'test setup requires journey-drawn to be accepted')
  writeCaptureConfig(dir, writeFixtureCapture(dir))

  decideLook(dir, 'journey-approved:' + JOURNEY, 'approve', { by: 'jj' })
  const accepted = mark(dir, 'journey-approved', ['--journey', JOURNEY])
  assert.strictEqual(accepted.status, 0, 'journey-approved must accept once its stop is decided approve: ' + accepted.stdout + accepted.stderr)
  assert.strictEqual(statusJson(dir).journeys[JOURNEY].approved !== null, true, 'an accepted journey-approved must record journeys.<j>.approved')
  const stops = JSON.parse(fs.readFileSync(path.join(dir, 'design/mocks/picks.json'), 'utf8'))
  const live = stops.find((s) => s.key === 'journey-approved:' + JOURNEY && s.status !== 'superseded')
  assert.strictEqual(live.status, 'consumed', 'accepting the mark must consume the decided stop in the same write as status.json: ' + JSON.stringify(stops))

  const dir2 = tmpdir('mocks-driver')
  advanceToCanonWritten(dir2)
  for (let i = 0; i < LABELS.length; i++) writeWireframe(dir2, LABELS[i], { to: LABELS[i + 1] })
  assert.strictEqual(mark(dir2, 'journey-drawn', ['--journey', JOURNEY]).status, 0, 'test setup requires journey-drawn to be accepted')
  writeCaptureConfig(dir2, writeFixtureCapture(dir2))
  decideLook(dir2, 'journey-approved:' + JOURNEY, 'approve', { by: 'jj' })
  openLook(dir2, 'journey-approved:' + JOURNEY, { title: 'approve journey ' + JOURNEY, url: 'http://localhost:0/p/x/atlas/index.html#stop-newer' })
  const refused = mark(dir2, 'journey-approved', ['--journey', JOURNEY])
  assert.strictEqual(refused.status, 2, 'a newer open stop sharing the key must make journey-approved refuse again, never accept the now-superseded decision: ' + refused.stdout + refused.stderr)
  assert.match(refused.stderr + refused.stdout, /waiting on/, 'the refusal must name "waiting on": ' + refused.stdout + refused.stderr)
  assert.match(refused.stderr + refused.stdout, /stop-newer/, 'the refusal must name the NEWER stop\'s url, not the superseded one\'s: ' + refused.stdout + refused.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260905-02-13
// ---------------------------------------------------------------------------
test('AC-20260905-02-13/AC-20260905-04-9: a decided shape pick accepts without the flag, appends the ledger row when absent, and refuses a flag that disagrees with the pick', () => {
  const dir = tmpdir('mocks-driver')
  advanceToSeedDone(dir)
  writeFile(path.join(dir, 'design/shapes/card-first.html'), '<main data-screen-label="' + DENSE + '" data-shape="card-first">card-first</main>\n')
  writeFile(path.join(dir, 'design/shapes/orb-hero.html'), '<main data-screen-label="' + DENSE + '" data-shape="orb-hero">orb-hero</main>\n')
  decideLook(dir, 'shape-picked', 'pick', { pick: 'card-first', others: ['orb-hero'], by: 'jj', note: 'cards read faster' })
  const noFlag = mark(dir, 'shape-picked')
  assert.strictEqual(noFlag.status, 0, 'shape-picked must accept with no --shape flag once the page decided a pick: ' + noFlag.stdout + noFlag.stderr)
  assert.strictEqual(statusJson(dir).shape, 'card-first', 'the accepted pick must record status.shape from the page\'s decision')
  const ledgerText = fs.readFileSync(path.join(dir, 'design/mocks/ledger.md'), 'utf8')
  assert.match(ledgerText, /\| product \| shape: card-first \| said-by-user \| confirmed \d{4}-\d{2}-\d{2} \| orb-hero \|/,
    'the driver must append the shape ledger row when absent, kind product, tag said-by-user, status confirmed <today>, rejected the other candidate: ' + ledgerText)

  const dir2 = tmpdir('mocks-driver')
  advanceToSeedDone(dir2)
  writeFile(path.join(dir2, 'design/shapes/card-first.html'), '<main data-screen-label="' + DENSE + '" data-shape="card-first">card-first</main>\n')
  writeFile(path.join(dir2, 'design/shapes/orb-hero.html'), '<main data-screen-label="' + DENSE + '" data-shape="orb-hero">orb-hero</main>\n')
  decideLook(dir2, 'shape-picked', 'pick', { pick: 'card-first', others: ['orb-hero'], by: 'jj' })
  const disagree = mark(dir2, 'shape-picked', ['--shape', 'orb-hero'])
  assert.strictEqual(disagree.status, 2, 'a --shape flag disagreeing with the page\'s pick must be refused: ' + disagree.stdout + disagree.stderr)
  assert.match(disagree.stderr + disagree.stdout, /disagrees with the page pick "card-first"/, 'the refusal must name the page\'s actual pick: ' + disagree.stdout + disagree.stderr)
})
