'use strict'
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const { tmpdir, runNode, freePort, serveAtlas } = require('../helpers')
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

// specs/20260910/01-contention-proof-budget-and-uncapped-suite.md gate repair: notesPath through
// stubNpxScreenshot were duplicated byte-for-byte across tests/mocks/mocks-driver-client.test.js
// and its D3 sibling tests/mocks/mocks-driver-client-2.test.js, tripping the repo's duplicate-
// window gate. Both files call these; this is their one shared home.
function notesPath(dir) { return path.join(dir, 'design/mocks/notes.json') }
function writeNotesFile(dir, notes) {
  fs.mkdirSync(path.dirname(notesPath(dir)), { recursive: true })
  fs.writeFileSync(notesPath(dir), JSON.stringify(notes, null, 2) + '\n')
}
function readNotesFile(dir) { return JSON.parse(fs.readFileSync(notesPath(dir), 'utf8')) }
function nowIso() { return new Date().toISOString() }
function isoDaysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString() }
function patchStatus(dir, patch) {
  const s = statusJson(dir)
  Object.assign(s, patch)
  fs.writeFileSync(statusPath(dir), JSON.stringify(s, null, 2) + '\n')
}
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex') }

// file-local PATH-stub for `npx … playwright screenshot … <out>` — copies a fixed byte buffer
// to the invocation's last argv item (the <out> path). Distinct from the exitCode-only
// `stubNpx` this module already exports (that helper never writes a file).
function stubNpxScreenshot(dir, { bytes, exitCode = 0 } = {}) {
  const binDir = path.join(dir, 'npx-shot-bin')
  fs.mkdirSync(binDir, { recursive: true })
  const npxPath = path.join(binDir, 'npx')
  if (exitCode !== 0) {
    fs.writeFileSync(npxPath, '#!/usr/bin/env bash\nexit ' + exitCode + '\n')
  } else {
    const src = path.join(dir, 'shot-src.png')
    fs.writeFileSync(src, bytes)
    fs.writeFileSync(npxPath, '#!/usr/bin/env bash\nlast="${@: -1}"\ncp "' + src + '" "$last"\nexit 0\n')
  }
  fs.chmodSync(npxPath, 0o755)
  return binDir + path.delimiter + process.env.PATH
}

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

// specs/20260906/05-gray-states-on-every-wireframe.md D4: every wireframe carries the three
// data-state-btn gray-box switches by default, so every existing driver test's fixture keeps
// declaring the full state set once the new journey-drawn/journey-approved check-states gate
// lands (D2) — `opts.states = []` is the one escape hatch tests/mocks/mocks-driver.test.js's
// missing-states refusal case needs to isolate that violation. `stateBtn` (a raw HTML string) stays the pre-existing
// escape hatch for the look-stops fixtures that need one exact button element with no wrapper
// markup around it — passing it bypasses `states` entirely, unchanged from its prior behavior.
function writeWireframe(dir, label, opts = {}) {
  const { stateBtn } = opts
  const states = opts.states !== undefined ? opts.states : ['empty', 'loading', 'error']
  // The design-atlas.js hygiene(d) rule (specs/20260824/03 D1(d)) requires every data-state-btn
  // to sit inside a data-contract="none" ancestor once a mock is bound (approved mark runs
  // `check --matrix`) — the default three-button set is wrapped so advanceToApproved's fixtures
  // keep passing under that pre-existing rule; `stateBtn`'s raw-HTML escape hatch stays
  // unwrapped, matching its prior byte-for-byte output for the callers that use it.
  const stateBtnsHtml = stateBtn !== undefined
    ? stateBtn
    : (states.length ? '<div data-contract="none">' +
        states.map((s) => '<button data-state-btn="' + s + '">' + s + '</button>').join('') + '</div>' : '')
  writeFile(path.join(dir, 'design/mocks', label + '.html'),
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<link rel="stylesheet" href="../wire/tokens.css">\n' +
    '<link rel="stylesheet" href="../wire/wire.css">\n' +
    '<style>* { box-sizing: border-box; }</style>\n' +
    '<main data-screen-label="' + label + '" data-status="sketch">' + label + stateBtnsHtml + '</main>\n')
}

// ---------------------------------------------------------------------------
// D11 fixture repair: the gated marks (shape-picked, journey-approved, approved)
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

// specs/20260909/06-ephemeral-serve-ports.md D2/D3: freePort() is re-exported from
// tests/helpers.js verbatim (AC-20260909-06-5) — this module's 8 look-stop callers pass its
// result straight into `--port <p>` on a SEPARATE mocks-driver.js invocation, so the port must
// be known before that second process starts; `--port 0` (an ephemeral pick read back after the
// fact) cannot serve that two-process handshake.
//
// specs/20260905/04-per-project-look-server.md D7: the deleted hub script's `killHubIn(home)`
// (kill a registry-recorded pid under a fake per-machine state dir) is replaced by a per-project
// `design-atlas.js serve` child — `startServe` spawns it on the given port and resolves once its
// first stdout line lands (readiness), `stopServe` always tears it down (SIGTERM, then SIGKILL if
// it does not exit) so a failing assertion in a caller's try block never orphans a listener.
// `startServe` is now a thin call to helpers.serveAtlas for that spawn-and-wait step; `stopServe`
// keeps its own kill ladder because callers hand it a bare ChildProcess, not a serveAtlas result.
function startServe(root, port) {
  return serveAtlas(root, { port }).then((s) => s.child)
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
//
// Fixture repair (mocks-driver-fixtures.js, same worktree as specs/20260907/04-kit-canon-family.md):
// KIT's insertion between SHAPES and WIREFRAMES means a test can now legitimately call two
// advanceTo* helpers on the SAME dir in sequence (e.g. advanceToShapePicked then
// advanceToKitSigned, to observe the state transition between them) — every advanceTo* below
// therefore reads status.json first and skips straight past a stage whose mark is already set,
// rather than unconditionally redoing it (which re-appends ledger rows already present and trips
// parseLedger's own, correct, duplicate-id detection).
// ---------------------------------------------------------------------------
function readMarksOrEmpty(dir) {
  try { return JSON.parse(fs.readFileSync(statusPath(dir), 'utf8')).marks || {} } catch { return {} }
}
function readStatusOrEmpty(dir) {
  try { return JSON.parse(fs.readFileSync(statusPath(dir), 'utf8')) } catch { return {} }
}

function advanceToSeedDone(dir) {
  if (readMarksOrEmpty(dir).seedDone) return
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
  if (readMarksOrEmpty(dir).shapePicked) return
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

// specs/20260907/04-kit-canon-family.md D2: design/kit/<name>.html — root data-kit-canon,
// each primitive data-kit-primitive/data-purpose, its own chrome data-contract="none", its own
// content data-slot="content", states declared exactly as a wireframe does, linking the same
// wireframe register (../wire/tokens.css) every writeWireframe fixture links.
function writeKitCanon(dir, primitives = [{ key: 'sheet', purpose: 'a modal panel for one focused task' }]) {
  const body = primitives.map((p) =>
    '<section data-kit-primitive="' + p.key + '" data-purpose="' + p.purpose + '">' +
    '<div data-contract="none"><button data-state-btn="empty">Empty</button>' +
    '<button data-state-btn="loading">Loading</button><button data-state-btn="error">Error</button></div>' +
    '<div data-slot="content"></div>' +
    '</section>').join('\n')
  writeFile(path.join(dir, 'design/kit/kit.html'),
    '<link rel="stylesheet" href="../wire/tokens.css">\n' +
    '<div data-kit-canon="kit">\n' + body + '\n</div>\n')
}

// Orchestrator duty (specs/20260907/06-theme-pick-moves-to-sketch.md): a candidate direction
// is now the signed-off gray kit re-rendered at production fidelity, one page per direction —
// design/theme/<kebab>/kit.html (root data-kit-canon, every primitive `writeKitCanon` above
// would put in design/kit/, same states/data-slot shape) linking its OWN ./tokens.css (never
// wire/, D2's "a candidate direction is the kit at production fidelity" leg), whose tokens.css
// always carries a [data-theme="dark"] block (D7's dark-block requirement) alongside the light
// `:root` rule. `primitives` takes the identical `{key, purpose}` shape `writeKitCanon` takes so
// a test can pass the SAME array to both and get a matching primitive set by construction; a
// test isolating one D2 violation (an omitted primitive, a wire/ link, a missing tokens.css)
// mutates the written files afterward rather than this fixture growing an opts bag — this
// spec's orchestrator duty pins the signature at exactly (dir, kebab, primitives).
function writeThemeKit(dir, kebab, primitives = [{ key: 'sheet', purpose: 'a modal panel for one focused task' }]) {
  const body = primitives.map((p) =>
    '<section data-kit-primitive="' + p.key + '" data-purpose="' + p.purpose + '">' +
    '<div data-contract="none"><button data-state-btn="empty">Empty</button>' +
    '<button data-state-btn="loading">Loading</button><button data-state-btn="error">Error</button></div>' +
    '<div data-slot="content"></div>' +
    '</section>').join('\n')
  writeFile(path.join(dir, 'design/theme', kebab, 'kit.html'),
    '<link rel="stylesheet" href="./tokens.css">\n' +
    '<div data-kit-canon="' + kebab + '">\n' + body + '\n</div>\n')
  writeFile(path.join(dir, 'design/theme', kebab, 'tokens.css'),
    ':root{--text-body:#111}\n[data-theme="dark"]{--text-body:#eee}\n')
}

// Orchestrator duty (specs/20260907/04-kit-canon-family.md): D1 inserts KIT between SHAPES and
// WIREFRAMES — every advanceTo* helper reaching canon-written or beyond now routes through a
// real `--mark kit-signed` the same way it already routes through shape-picked, so a later
// stage's fixture stays an executed proof of every earlier mark's contract, kit included.
function advanceToKitSigned(dir, primitives) {
  if (readMarksOrEmpty(dir).kitSignedOff) return
  if (!readMarksOrEmpty(dir).shapePicked) advanceToShapePicked(dir)
  writeKitCanon(dir, primitives)
  decideLook(dir, 'kit-signed', 'approve', { by: 'jj' })
  const r = mark(dir, 'kit-signed')
  assert.strictEqual(r.status, 0, 'test setup requires kit-signed to be accepted once design/kit/ holds a valid canon file and its stop is decided approve: ' + r.stderr)
  return r
}

function advanceToCanonWritten(dir) {
  if (readMarksOrEmpty(dir).canonWritten) return
  if (!readMarksOrEmpty(dir).kitSignedOff) advanceToKitSigned(dir)
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
  const already = readStatusOrEmpty(dir)
  if (already.journeys && already.journeys[journeyName] && already.journeys[journeyName].approved) return
  if (!readMarksOrEmpty(dir).canonWritten) advanceToCanonWritten(dir)
  for (const label of labels) writeWireframe(dir, label)
  const drawn = mark(dir, 'journey-drawn', ['--journey', journeyName])
  assert.strictEqual(drawn.status, 0, 'test setup requires journey-drawn to be accepted once every label of the journey conforms to D6: ' + drawn.stderr)
  writeCaptureConfig(dir, writeFixtureCapture(dir))
  decideLook(dir, 'journey-approved:' + journeyName, 'approve', { by: 'jj' })
  const approved = mark(dir, 'journey-approved', ['--journey', journeyName])
  assert.strictEqual(approved.status, 0, 'test setup requires journey-approved to be accepted once the journey is drawn and the ledger gate is open: ' + approved.stderr)
  return approved
}

// specs/20260907/08-walk-critic.md orchestrator duty: WALK sits between WIREFRAMES and
// SIGNOFF — advanceToJourneyWalked runs advanceToJourneyApproved (idempotent, per the
// readStatusOrEmpty guard above) then records the real `--mark journey-walked --journey <j>`,
// so every fixture that reaches SIGNOFF or APPROVED walks first, through the real binary, the
// same executed-proof discipline every other advanceTo* helper in this file already carries.
function advanceToJourneyWalked(dir, journeyName = JOURNEY) {
  const already = readStatusOrEmpty(dir)
  if (already.journeys && already.journeys[journeyName] && already.journeys[journeyName].walked) return
  advanceToJourneyApproved(dir, journeyName)
  const r = mark(dir, 'journey-walked', ['--journey', journeyName])
  assert.strictEqual(r.status, 0, 'test setup requires journey-walked to be accepted once the journey is approved and carries no open walk finding: ' + r.stderr)
  return r
}

// D11: the SKIN/REVIEW states are retired — approved now stamps the wireframes produced at
// journey-drawn/journey-approved straight through, with no intervening skin step.
//
// specs/20260907/07-mocks-retires-theme.md orchestrator duty: the mocks state machine has no
// THEME step — the chain is WIREFRAMES -> SIGNOFF -> APPROVED, so advanceToApproved routes
// through advanceToJourneyApproved directly, with no direction-composing or theme-picking
// helper in between.
//
// specs/20260907/08-walk-critic.md orchestrator duty: WALK now sits ahead of SIGNOFF —
// advanceToApproved routes through advanceToJourneyWalked (which itself routes through
// advanceToJourneyApproved) in place of its prior direct call, so every caller reaching
// APPROVED has walked its journey first.
function advanceToApproved(dir) {
  if (readMarksOrEmpty(dir).approved) return
  advanceToJourneyWalked(dir)
  decideLook(dir, 'approved', 'approve', { by: 'Ren' })
  const r = mark(dir, 'approved')
  assert.strictEqual(r.status, 0, 'test setup requires approved to be accepted once every journey is approved and walked, the approved stop is decided approve, notes are resolved, and render-gate/matrix check hold: ' + r.stderr)
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
  notesPath, writeNotesFile, readNotesFile, nowIso, isoDaysAgo, patchStatus, sha256, stubNpxScreenshot,
  writeTargets, writeResearchBrief, writeSeed, confirmFacts, writeCanon, writeWireframe,
  writeKitCanon, writeThemeKit,
  decideLook, openLook, freePort, startServe, stopServe, getBody,
  writeFixtureCapture, writeCaptureConfig,
  advanceToSeedDone, advanceToShapePicked, advanceToKitSigned, advanceToCanonWritten, advanceToJourneyApproved,
  advanceToJourneyWalked, advanceToApproved,
  writeShortSeed, advanceToShortJourneyDrawn,
  stubNpx,
}
