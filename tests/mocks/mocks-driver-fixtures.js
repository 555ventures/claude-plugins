'use strict'
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const http = require('node:http')
const { spawn } = require('node:child_process')
const { tmpdir, runNode } = require('../helpers')
const picksLib = require('../../spec/scripts/lib/mocks-picks')

// mocks-driver family shared fixtures — split from tests/mocks/mocks-driver.test.js by
// specs/20260903/07-test-file-budget-guard.md's per-file 45s guard (that file's own review run
// tripped the guard at 50s under full-suite load once specs/20260905/02's D6/D7/D8 tests landed
// beside the spec 06/07 chain). No `test(` calls here — constants and helpers moved verbatim;
// consumed by tests/mocks/mocks-driver.test.js and tests/mocks/mocks-driver-look-stops.test.js
// via module.exports, the same split shape build-driver.fixtures.js established.

const SCRIPT = 'scripts/mocks-driver.js'

const FACT_KEYS = [
  'primary-surface', 'platforms-horizon', 'tenancy', 'offline', 'realtime', 'ai-in-loop',
  'residency', 'payer', 'day-one-integrations', 'scale-outage', 'vendor-limits', 'retention',
  'legal-floor',
]
const JOURNEY = 'onboarding'
const LABELS = ['signin', 'invite', 'consent', 'session-live']
const DENSE = 'session-live'

function bare(dir, extra = []) { return runNode(SCRIPT, ['--root', dir, ...extra]) }
function mark(dir, name, extra = []) { return runNode(SCRIPT, ['--root', dir, '--mark', name, ...extra]) }
function stateOf(dir) { return runNode(SCRIPT, ['--root', dir, '--state']) }
function ledgerCmd(dir, sub, extra = []) { return runNode(SCRIPT, ['--root', dir, 'ledger', sub, ...extra]) }

function writeFile(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}
function writeJSON(p, obj) { writeFile(p, JSON.stringify(obj, null, 2) + '\n') }

function statusPath(dir) { return path.join(dir, 'design/mocks/status.json') }
function statusJson(dir) { return JSON.parse(fs.readFileSync(statusPath(dir), 'utf8')) }

function writeTargets(dir) {
  writeJSON(path.join(dir, 'design/targets.json'), {
    schemaVersion: 1, themes: ['light'],
    viewports: [{ name: 'mobile', width: 390, height: 844 }],
  })
}
function writeResearchBrief(dir) {
  writeFile(path.join(dir, 'docs/design/research-brief.md'),
    '# Research brief\n\n## Findings\nSynthetic test brief for mocks-driver.test.js.\n')
}

function writeSeed(dir, { journeyLabels = LABELS, journeyName = JOURNEY, dense = DENSE } = {}) {
  const factLines = FACT_KEYS.map((k, i) => `- ${k}: P${i + 1}`).join('\n')
  writeFile(path.join(dir, 'design/mocks/seed.md'), `# Seed — Test Product

## Product
It is a synthetic dispatch product for tests.
Built for QA engineers running the driver's test suite.
It must let a user complete a short onboarding.

## Facts
${factLines}

## References
- none

## Journeys
### ${journeyName}
Mika (dispatch lead) signs in, sends an invite, gathers consent, and reaches the live session.
\`\`\`surfaces
${journeyLabels[0]} -> ${journeyLabels[1]}
${journeyLabels[1]} -> ${journeyLabels[2]}
${journeyLabels[2]} -> ${journeyLabels[3]}
\`\`\`

## Dense screen
- ${dense}
`)
}

// D3: confirms all 13 seed facts as said-by-user/confirmed product rows P1..P13, in the same
// order the fact keys are declared, so writeSeed()'s `- <key>: P<n>` lines always resolve.
function confirmFacts(dir) {
  FACT_KEYS.forEach((key, i) => {
    const r = ledgerCmd(dir, 'add', [
      '--id', 'P' + (i + 1), '--step', 'SEED', '--kind', 'product',
      '--claim', key, '--tag', 'said-by-user', '--status', 'confirmed',
    ])
    assert.strictEqual(r.status, 0,
      'test setup requires `ledger add` to accept a said-by-user/confirmed row for fact "' + key + '": ' + r.stderr)
  })
}

function writeCanon(dir) {
  writeFile(path.join(dir, 'design/mocks/canon.md'), `## Shells
none

## Primitives
- **Button** — primary action

## Rules
- One screen at a time.

## Grounding
This canon is binding: see docs/design/research-brief.md for the research basis.
`)
}

function writeWireframe(dir, label, { stateBtn = '' } = {}) {
  writeFile(path.join(dir, 'design/mocks', label + '.html'),
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<link rel="stylesheet" href="../wire/tokens.css">\n' +
    '<link rel="stylesheet" href="../wire/wire.css">\n' +
    '<style>* { box-sizing: border-box; }</style>\n' +
    '<main data-screen-label="' + label + '" data-status="sketch">' + label + stateBtn + '</main>\n')
}

function writeThemeDirection(dir, kebab, labels) {
  writeFile(path.join(dir, 'design/theme', kebab, 'tokens.css'), ':root{--text-body:#111}\n')
  for (const label of labels) {
    writeFile(path.join(dir, 'design/theme', kebab, label + '.html'),
      '<link rel="stylesheet" href="tokens.css">\n' +
      '<main data-screen-label="' + label + '" data-status="sketch">' + label + '</main>\n')
  }
}

// ---------------------------------------------------------------------------
// D11 fixture repair: the gated marks (shape-picked, journey-approved, theme-picked, approved)
// refuse without a decided look stop for the mark's key — decideLook/openLook write that stop
// through lib/mocks-picks.js (spec 01's lib, never by hand), so every advanceTo* helper and
// every direct mark() call below can keep exercising its OWN precondition (drawn-before-approved,
// ledger gate, rejected-cell completeness, …) with the stop precondition already satisfied.
// AC-20260905-02-18.
// ---------------------------------------------------------------------------
function decideLook(dir, key, verdict, extra = {}) {
  let stops = picksLib.readPicks(dir)
  const kind = verdict === 'pick' ? 'pick' : 'approve'
  let candidates = extra.candidates
  if (!candidates) {
    if (kind === 'pick') {
      const groups = [extra.pick || 'a', ...(extra.others || ['b'])]
      candidates = groups.map((g) => ({ group: g, label: extra.label || g, path: extra.path || (g + '.html') }))
    } else {
      candidates = [{ group: null, label: 'a', path: 'mocks/a.html' }]
    }
  }
  const opened = picksLib.openStop(stops, { kind, key, title: extra.title || key, candidates })
  const decided = picksLib.decideStop(opened.stops, opened.stop.id, {
    verdict,
    pick: verdict === 'pick' ? (extra.pick || candidates[0].group) : null,
    note: extra.note || (verdict === 'change' ? 'change requested' : null),
    by: extra.by || 'jj',
  })
  picksLib.writePicks(dir, decided.stops)
  return decided.stop
}

function openLook(dir, key, extra = {}) {
  const stops = picksLib.readPicks(dir)
  const kind = extra.kind || 'approve'
  const candidates = extra.candidates || [{ group: null, label: 'a', path: 'mocks/a.html' }]
  const opened = picksLib.openStop(stops, { kind, key, title: extra.title || key, candidates, url: extra.url || null })
  picksLib.writePicks(dir, opened.stops)
  return opened.stop
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close((err) => (err ? reject(err) : resolve(port)))
    })
    srv.on('error', reject)
  })
}

// specs/20260905/04-per-project-look-server.md D7: the deleted hub script's `killHubIn(home)`
// (kill a registry-recorded pid under a fake per-machine state dir) is replaced by a per-project
// `design-atlas.js serve` child — `startServe` spawns it on the given port and resolves once its
// first stdout line lands (readiness), `stopServe` always tears it down (SIGTERM, then SIGKILL if
// it does not exit) so a failing assertion in a caller's try block never orphans a listener.
function startServe(root, port) {
  return new Promise((resolve, reject) => {
    const designAtlasBin = path.join(__dirname, '../../spec/scripts/design-atlas.js')
    const child = spawn(process.execPath, [designAtlasBin, 'serve', '--root', root, '--port', String(port)])
    let stderrBuf = ''
    child.stderr.on('data', (chunk) => { stderrBuf += chunk.toString('utf8') })
    const timer = setTimeout(() => reject(new Error('design-atlas.js serve --port ' + port + ' did not print its first stdout line within 5s: ' + stderrBuf)), 5000)
    child.stdout.once('data', () => { clearTimeout(timer); resolve(child) })
    child.once('error', (err) => { clearTimeout(timer); reject(err) })
  })
}

function stopServe(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) { resolve(); return }
    const done = () => resolve()
    child.once('exit', done)
    child.kill('SIGTERM')
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      done()
    }, 5000)
  })
}

function getBody(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
    }).on('error', reject)
  })
}

// ---------------------------------------------------------------------------
// Chained setup — each advanceTo* runs the REAL binary through the prior marks and asserts each
// is accepted, so a later-stage test's fixture is itself an executed proof of the earlier ACs.
// ---------------------------------------------------------------------------
function advanceToSeedDone(dir) {
  bare(dir) // cold-root creation
  writeTargets(dir)
  writeResearchBrief(dir)
  confirmFacts(dir)
  writeSeed(dir)
  const r = mark(dir, 'seed-done')
  assert.strictEqual(r.status, 0, 'test setup requires seed-done to be accepted on a fully valid seed: ' + r.stderr)
  return r
}

function advanceToShapePicked(dir, chosen = 'calm', others = ['bold']) {
  advanceToSeedDone(dir)
  for (const k of [chosen, ...others]) {
    writeFile(path.join(dir, 'design/shapes', k + '.html'),
      '<main data-screen-label="' + DENSE + '" data-shape="' + k + '">' + k + '</main>\n')
  }
  const ledgerR = ledgerCmd(dir, 'add', [
    '--id', 'P14', '--step', 'SHAPES', '--kind', 'product', '--claim', 'shape: ' + chosen,
    '--tag', 'said-by-user', '--status', 'confirmed', '--rejected', others.join(', '),
  ])
  assert.strictEqual(ledgerR.status, 0, 'test setup requires the shape ledger row to be accepted: ' + ledgerR.stderr)
  decideLook(dir, 'shape-picked', 'pick', { pick: chosen, others, by: 'jj', note: 'test pick' })
  const r = mark(dir, 'shape-picked', ['--shape', chosen])
  assert.strictEqual(r.status, 0, 'test setup requires shape-picked to be accepted once 2+ shapes exist and the ledger row confirms the pick: ' + r.stderr)
  return r
}

function advanceToCanonWritten(dir) {
  advanceToShapePicked(dir)
  writeCanon(dir)
  const r = mark(dir, 'canon-written')
  assert.strictEqual(r.status, 0, 'test setup requires canon-written to be accepted on a valid canon.md with no existing mocks: ' + r.stderr)
  return r
}

// specs/20260905/06-plugin-owned-capture-at-approval.md (D5, Rationale "Executes leg"): once
// the driver runs render-gate --mocks inside journey-approved/approved, every fixture host that
// reaches those marks needs SOME declared capture (or it falls through to the real-Chrome
// --which fallback) — writeCaptureFixture below is a small Node script honouring the host
// capture contract that defaults to a clean inventory (page geometry mirrors the requested
// --width, empty entries), so the default adaptation rules always pass over it unless a test
// overrides FAKE_CAPTURE_ENTRIES/FAKE_CAPTURE_PAGE in its own env for that one mark() call.
const FIXTURE_CAPTURE_SRC = `#!/usr/bin/env node
'use strict'
const fs = require('fs')
const args = process.argv.slice(2)
const flag = (n) => { const i = args.indexOf('--' + n); return i > -1 ? args[i + 1] : undefined }
const out = flag('out')
const w = parseInt(flag('width'), 10) || 0
const page = process.env.FAKE_CAPTURE_PAGE ? JSON.parse(process.env.FAKE_CAPTURE_PAGE) : { scrollWidth: w, clientWidth: w }
const entries = process.env.FAKE_CAPTURE_ENTRIES ? JSON.parse(process.env.FAKE_CAPTURE_ENTRIES) : []
fs.writeFileSync(out, JSON.stringify({
  schemaVersion: 1, theme: flag('theme') || null, state: flag('state') === '-' ? null : flag('state'),
  root: 'body', page, entries,
}))
`
function writeFixtureCapture(dir) {
  const p = path.join(dir, 'fixture-capture.js')
  fs.writeFileSync(p, FIXTURE_CAPTURE_SRC)
  return p
}
function writeCaptureConfig(dir, capturePath) {
  const configPath = path.join(dir, '.claude/spec.config.json')
  let existing = {}
  try { existing = JSON.parse(fs.readFileSync(configPath, 'utf8')) } catch { /* cold root */ }
  existing.design = Object.assign({}, existing.design, { render: { capture: 'node ' + capturePath } })
  writeJSON(configPath, existing)
}

function advanceToJourneyApproved(dir, journeyName = JOURNEY, labels = LABELS) {
  advanceToCanonWritten(dir)
  for (const label of labels) writeWireframe(dir, label)
  const drawn = mark(dir, 'journey-drawn', ['--journey', journeyName])
  assert.strictEqual(drawn.status, 0, 'test setup requires journey-drawn to be accepted once every label of the journey conforms to D6: ' + drawn.stderr)
  writeCaptureConfig(dir, writeFixtureCapture(dir))
  decideLook(dir, 'journey-approved:' + journeyName, 'approve', { by: 'jj' })
  const approved = mark(dir, 'journey-approved', ['--journey', journeyName])
  assert.strictEqual(approved.status, 0, 'test setup requires journey-approved to be accepted once the journey is drawn and the ledger gate is open: ' + approved.stderr)
  return approved
}

function advanceToDirectionComposed(dir, kebab, labels, ledgerId) {
  const ledgerR = ledgerCmd(dir, 'add', [
    '--id', ledgerId, '--step', 'THEME', '--kind', 'product',
    '--claim', 'theme-directions: ' + kebab, '--tag', 'said-by-user', '--status', 'confirmed',
  ])
  assert.strictEqual(ledgerR.status, 0, 'test setup requires the theme-directions ledger row to be accepted: ' + ledgerR.stderr)
  writeThemeDirection(dir, kebab, labels)
  const r = mark(dir, 'direction-composed', ['--direction', kebab])
  assert.strictEqual(r.status, 0, 'test setup requires direction-composed to be accepted for "' + kebab + '" once at most 2 approved labels (the dense screen first) are composed under design/theme/' + kebab + ': ' + r.stderr)
  return r
}

// D3: at most 2 screens per direction, the dense screen first — callers pass writeThemeDirection
// a labels array shaped that way (specs/20260906/02-mocks-ends-at-wireframes.md D11); the
// negative-path tests that deliberately compose more or a dense-screen-less set (AC-3) keep
// passing whatever shape they need to isolate that one violation.
function advanceToThemePicked(dir, chosen = 'quiet', other = 'warm') {
  advanceToJourneyApproved(dir)
  advanceToDirectionComposed(dir, chosen, [DENSE, LABELS[0]], 'P15')
  advanceToDirectionComposed(dir, other, [DENSE, LABELS[1]], 'P16')
  const ledgerR = ledgerCmd(dir, 'add', [
    '--id', 'P17', '--step', 'THEME', '--kind', 'product', '--claim', 'theme: ' + chosen,
    '--tag', 'said-by-user', '--status', 'confirmed', '--rejected', other,
  ])
  assert.strictEqual(ledgerR.status, 0, 'test setup requires the theme-pick ledger row to be accepted: ' + ledgerR.stderr)
  decideLook(dir, 'theme-picked', 'pick', { pick: chosen, others: [other], by: 'jj' })
  const r = mark(dir, 'theme-picked', ['--direction', chosen])
  assert.strictEqual(r.status, 0, 'test setup requires theme-picked to be accepted once 2+ directions are composed and the theme row rejects every other one: ' + r.stderr)
  return r
}

// D11: the SKIN/REVIEW states are retired — approved now stamps the wireframes produced at
// journey-drawn/journey-approved straight through, with no intervening skin step.
function advanceToApproved(dir) {
  advanceToThemePicked(dir)
  decideLook(dir, 'approved', 'approve', { by: 'Ren' })
  const r = mark(dir, 'approved')
  assert.strictEqual(r.status, 0, 'test setup requires approved to be accepted once theme is picked, the approved stop is decided approve, notes are resolved, and render-gate/matrix check hold: ' + r.stderr)
  return r
}

// ---------------------------------------------------------------------------
// D6/D7/D8's stop-based look — fixtures below build a short, standalone two-label journey
// (writeShortSeed/advanceToShortJourneyDrawn) rather than reusing writeSeed's fixed 4-label
// chain, so `stop open journey:<j>` has a small, exact candidate set to assert on.
// ---------------------------------------------------------------------------
function writeShortSeed(dir, journeyName, labels) {
  const factLines = FACT_KEYS.map((k, i) => `- ${k}: P${i + 1}`).join('\n')
  const edges = labels.slice(0, -1).map((l, i) => `${l} -> ${labels[i + 1]}`).join('\n')
  writeFile(path.join(dir, 'design/mocks/seed.md'), `# Seed — Test Product

## Product
It is a synthetic dispatch product for the hub stop tests.
Built for QA engineers running the driver's test suite.
It must let a user complete a short flow.

## Facts
${factLines}

## References
- none

## Journeys
### ${journeyName}
Mika (dispatch lead) moves through a short flow.
\`\`\`surfaces
${edges}
\`\`\`

## Dense screen
- ${labels[labels.length - 1]}
`)
}

function advanceToShortJourneyDrawn(dir, journeyName, labels) {
  bare(dir)
  writeTargets(dir)
  writeResearchBrief(dir)
  confirmFacts(dir)
  writeShortSeed(dir, journeyName, labels)
  const seedDone = mark(dir, 'seed-done')
  assert.strictEqual(seedDone.status, 0, 'test setup requires seed-done to be accepted on the short-journey seed: ' + seedDone.stderr)
  const dense = labels[labels.length - 1]
  writeFile(path.join(dir, 'design/shapes/calm.html'), '<main data-screen-label="' + dense + '" data-shape="calm">calm</main>\n')
  writeFile(path.join(dir, 'design/shapes/bold.html'), '<main data-screen-label="' + dense + '" data-shape="bold">bold</main>\n')
  const shapeLedger = ledgerCmd(dir, 'add', ['--id', 'P14', '--step', 'SHAPES', '--kind', 'product', '--claim', 'shape: calm', '--tag', 'said-by-user', '--status', 'confirmed', '--rejected', 'bold'])
  assert.strictEqual(shapeLedger.status, 0, 'test setup requires the shape ledger row to be accepted: ' + shapeLedger.stderr)
  decideLook(dir, 'shape-picked', 'pick', { pick: 'calm', others: ['bold'], by: 'jj' })
  const shapePicked = mark(dir, 'shape-picked', ['--shape', 'calm'])
  assert.strictEqual(shapePicked.status, 0, 'test setup requires shape-picked to be accepted: ' + shapePicked.stderr)
  writeCanon(dir)
  const canonWritten = mark(dir, 'canon-written')
  assert.strictEqual(canonWritten.status, 0, 'test setup requires canon-written to be accepted: ' + canonWritten.stderr)
  for (const label of labels) writeWireframe(dir, label)
  const drawn = mark(dir, 'journey-drawn', ['--journey', journeyName])
  assert.strictEqual(drawn.status, 0, 'test setup requires journey-drawn to be accepted once every label of the short journey conforms to D6: ' + drawn.stderr)
}

// ---------------------------------------------------------------------------
// PATH-stub npx binaries: a bash script on a synthetic PATH ahead of the real one, so the driver's
// own `npx --no-install playwright …` calls hit the stub instead of the real CLI (no network, no
// real Playwright install required in this suite).
// ---------------------------------------------------------------------------
function stubNpx(dir, { exitCode = 0, logArgvTo = null } = {}) {
  const binDir = path.join(dir, 'bin')
  fs.mkdirSync(binDir, { recursive: true })
  const npxPath = path.join(binDir, 'npx')
  const log = logArgvTo ? `echo "$@" >> "${logArgvTo}"\n` : ''
  fs.writeFileSync(npxPath, `#!/usr/bin/env bash\n${log}exit ${exitCode}\n`)
  fs.chmodSync(npxPath, 0o755)
  return binDir + path.delimiter + process.env.PATH
}

module.exports = {
  SCRIPT, FACT_KEYS, JOURNEY, LABELS, DENSE,
  bare, mark, stateOf, ledgerCmd,
  writeFile, writeJSON, statusPath, statusJson,
  writeTargets, writeResearchBrief, writeSeed, confirmFacts, writeCanon, writeWireframe,
  writeThemeDirection,
  decideLook, openLook, freePort, startServe, stopServe, getBody,
  writeFixtureCapture, writeCaptureConfig,
  advanceToSeedDone, advanceToShapePicked, advanceToCanonWritten, advanceToJourneyApproved,
  advanceToDirectionComposed, advanceToThemePicked,
  advanceToApproved,
  writeShortSeed, advanceToShortJourneyDrawn,
  stubNpx,
}
