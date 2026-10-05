'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { runNode, tmpdir } = require('../helpers')
const {
  DRIVER, makeHost, run, stateOf, toIntegration, implementScriptsWave, testFileContent,
} = require('./build-driver.fixtures')

// specs/20260928/03-the-build-reads-the-freeze.md — AC-20260928-03-1 through -5. None of
// HARDEN_MERGE, CAPTURE, or the proto/ admission refusal exist on the pre-image driver, so every
// test below is red by construction (an unknown state/mark, or a state the driver simply never
// reaches). `runB` spreads a behaviour-lane host's PROTO_CAPTURE_BIN/PROTO_CAPTURE_SCRIPT env into
// the child so the capture gate never touches a browser.

function runB(host, ...args) {
  return runNode(DRIVER, [host.spec, ...args], { cwd: host.root, env: { ...process.env, ...host.captureEnv } })
}
const stateOfB = (host) => runB(host, '--state').stdout.trim()

function createHardenBranch(host) {
  // `git add harden-marker.txt` ONLY — never `-A`. The spec file (and, once a bare run has
  // happened, its <spec>.build/ sidecar) sits in the working tree UNTRACKED by design (makeHost
  // never commits it): an `add -A` here would sweep it into this commit, tracking it on the
  // harden branch only, and `checkout main` afterward would then DELETE it from disk (a path
  // tracked on the branch you're leaving but not on the one you're entering is removed on
  // checkout) — reproduced and confirmed against a real git checkout before writing this comment.
  host.g('checkout', '-b', 'harden/' + host.stem)
  fs.writeFileSync(path.join(host.root, 'harden-marker.txt'), 'exported data/API layer\n')
  host.g('add', 'harden-marker.txt')
  host.g('commit', '-q', '-m', 'harden: marker')
  host.g('checkout', 'main')
}
function mergeHardenBranch(host) {
  host.g('merge', '--no-ff', '--no-edit', 'harden/' + host.stem)
}

// Drives a fresh behaviour-lane host from admission through a real harden merge and up to
// INTEGRATION (gate not yet run) — the exact point every AC-3/AC-4/AC-5 test needs before marking
// `integrated`. Reuses toIntegration() from the shared fixtures verbatim: once `harden-merged` is
// honored, TESTS-through-GATE is unchanged (D2's own rationale), so the same wave/gate machinery
// applies to a behaviour-lane host as to any other.
function driveBehaviourToIntegration(host) {
  runB(host) // bare admission — discarded; only establishes/ignores HARDEN_MERGE
  createHardenBranch(host)
  mergeHardenBranch(host)
  runB(host, '--mark', 'harden-merged') // discarded on the pre-image (unknown mark)
  toIntegration(host)
}


// The freeze's generated File Plan lists the files the harden branch carries (spec 20260928/02
// D6); createHardenBranch() above merges only a file outside the plan, so it never exercises this.
test('a harden merge that brings File Plan paths still reaches the first wave — red-check and the stub-residue check judge the tree against the merged pre-image, and diff_base stays at the commit before the merge', () => {
  const host = makeHost({ lane: 'behaviour', brief: 28 })
  runB(host)
  const preMerge = host.g('rev-parse', 'HEAD').trim()
  host.g('checkout', '-b', 'harden/' + host.stem)
  fs.writeFileSync(path.join(host.root, 'other.txt'), 'exported data/API layer\n') // a MODIFY row
  fs.writeFileSync(path.join(host.root, 'src/bar.js'), 'module.exports = () => 1\n') // a CREATE row
  host.g('add', 'other.txt', 'src/bar.js')
  host.g('commit', '-q', '-m', 'harden: planned files')
  host.g('checkout', 'main')
  mergeHardenBranch(host)
  const merged = runB(host, '--mark', 'harden-merged')
  assert.strictEqual(merged.status, 0, 'test setup requires the verified merge to be accepted: ' + merged.stdout + merged.stderr)

  fs.writeFileSync(path.join(host.root, 'tests/foo.test.js'), testFileContent(999))
  const authored = runB(host, '--mark', 'tests-authored')
  assert.strictEqual(authored.status, 0,
    'red-check must run against the merged tree, not refuse the merged File Plan files as an impure pre-image — every prototype build would stop here: ' + authored.stdout + authored.stderr)
  assert.strictEqual(stateOfB(host), 'RED_ATTRIBUTION',
    'a red test over the merged pre-image must land RED_ATTRIBUTION: ' + authored.stdout + authored.stderr)

  const attributed = runB(host, '--mark', 'red-attributed')
  assert.strictEqual(attributed.status, 0,
    'a CREATE row the harden merge delivered is not stub residue — refusing it leaves the build with no way forward but hand-editing the plan: ' + attributed.stdout + attributed.stderr)
  assert.strictEqual(stateOfB(host), 'WAVE:doctrine+scripts',
    'with the merged files accepted as pre-image the build must advance to its first wave: ' + attributed.stdout + attributed.stderr)

  assert.match(fs.readFileSync(host.spec, 'utf8'), new RegExp('^diff_base: ' + preMerge + '$', 'm'),
    'diff_base must stay at the commit before the merge — it is review\'s range, and moving it past the merge would land the merged data/API layer on main unreviewed')
})

// specs/20261005/05-derived-tests-ride-on-the-export-branch.md — the tests-row file arrives with
// the harden merge instead of being written on the base first.
test('AC-20261005-05-10 (SHALL CONTINUE TO): a tests-row file delivered by the harden merge is accepted as merged pre-image — tests-authored lands RED_ATTRIBUTION, red-attributed reaches the first wave, and diff_base stays at the commit before the merge', () => {
  const host = makeHost({ lane: 'behaviour', brief: 28 })
  runB(host)
  const preMerge = host.g('rev-parse', 'HEAD').trim()
  host.g('checkout', '-b', 'harden/' + host.stem)
  fs.writeFileSync(path.join(host.root, 'tests/foo.test.js'), testFileContent(999))
  host.g('add', 'tests/foo.test.js')
  host.g('commit', '-q', '-m', 'harden: derived tests')
  host.g('checkout', 'main')
  assert.ok(!fs.existsSync(path.join(host.root, 'tests/foo.test.js')), 'test setup requires the tests-row file absent from the base before the merge')
  mergeHardenBranch(host)
  const merged = runB(host, '--mark', 'harden-merged')
  assert.strictEqual(merged.status, 0, 'a merge delivering the tests-row file must be accepted: ' + merged.stdout + merged.stderr)
  const authored = runB(host, '--mark', 'tests-authored')
  assert.strictEqual(authored.status, 0,
    'with no session write after the merge, the delivered test file must satisfy tests-authored — refusing it strands every prototype build whose tests ride the harden branch: ' + authored.stdout + authored.stderr)
  assert.strictEqual(stateOfB(host), 'RED_ATTRIBUTION', 'the delivered red test must land RED_ATTRIBUTION: ' + authored.stdout + authored.stderr)
  const attributed = runB(host, '--mark', 'red-attributed')
  assert.strictEqual(attributed.status, 0, 'red-attributed must be accepted on the delivered test: ' + attributed.stdout + attributed.stderr)
  assert.strictEqual(stateOfB(host), 'WAVE:doctrine+scripts', 'the build must advance to its first wave: ' + attributed.stdout + attributed.stderr)
  assert.match(fs.readFileSync(host.spec, 'utf8'), new RegExp('^diff_base: ' + preMerge + '$', 'm'),
    'diff_base must stay at the commit before the merge, so review sees the delivered tests as part of the spec\'s own change')
})

// Residue is still residue on this lane: a planned file written after the merge, before any wave.
test('on the behaviour lane an uncommitted CREATE-row file written after the harden merge is still refused as stub residue', () => {
  const host = makeHost({ lane: 'behaviour', brief: 28 })
  runB(host)
  createHardenBranch(host)
  mergeHardenBranch(host)
  runB(host, '--mark', 'harden-merged')
  fs.writeFileSync(path.join(host.root, 'tests/foo.test.js'), testFileContent(999))
  runB(host, '--mark', 'tests-authored')
  assert.strictEqual(stateOfB(host), 'RED_ATTRIBUTION', 'test setup requires RED_ATTRIBUTION before the residue check can run')
  fs.writeFileSync(path.join(host.root, 'src/bar.js'), 'module.exports = () => 1\n')
  const r = runB(host, '--mark', 'red-attributed')
  assert.strictEqual(r.status, 2,
    'a stub written before its wave makes the red run meaningless — the merged pre-image must not blind the check to it: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /stub residue: src\/bar\.js/, 'the refusal must name the residue file: ' + r.stdout + r.stderr)
})


// The freeze writes contract urls relative to prototype.url (spec 20260928/02 Contracts); every
// other fixture here spells them absolute, which is how the bare-path defect stayed invisible.
test('--mark captured joins prototype.url onto a relative contract url, so the capture is sent to a full address', () => {
  const contract = {
    schemaVersion: 1, brief: '28', stem: '28-functional-prototype',
    viewport: { width: 1280, height: 800 }, composites: ['WomenList'],
    routes: { '/women': { default: { url: '/women', capture: 'captures/women--default.json' } } },
  }
  const host = makeHost({ lane: 'behaviour', brief: 28, contract })
  driveBehaviourToIntegration(host)
  implementScriptsWave(host)
  runB(host, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '2')
  runB(host, '--mark', 'wave-done', '--wave', 'other', '--workers', '1')
  runB(host, '--mark', 'integrated')

  const r = runB(host, '--mark', 'captured')
  assert.strictEqual(r.status, 0, 'a contract written by the real freeze (relative urls) must capture, not die on an invalid address: ' + r.stdout + r.stderr)
  const current = JSON.parse(fs.readFileSync(path.join(host.sidecar, 'captures/women--default.json'), 'utf8'))
  assert.strictEqual(current.url, 'http://localhost:3000/women',
    'the capture child must receive prototype.url + the relative contract url — a bare path is refused by the browser as an invalid URL: ' + current.url)
})

// Builds a fresh behaviour-lane host driven all the way to a captured-and-diffing CAPTURE state
// (AC-4's own fixture: 3 diffs on /women (empty), 0 on /women (default), matching the spec's
// Contracts block verbatim) so every AC-4 test starts from the same point.
function toCaptureWithDiff(host) {
  driveBehaviourToIntegration(host)
  implementScriptsWave(host)
  runB(host, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '2')
  runB(host, '--mark', 'wave-done', '--wave', 'other', '--workers', '1')
  runB(host, '--mark', 'integrated')
  host.setCaptureScript({
    'http://localhost:3000/women?proto=empty': {
      entries: [
        { id: 'WomanRow[w_01]<WomenList<WomenScreen#0', kind: 'changed', field: 'styles.padding-left', before: '16px', after: '20px' },
        { id: 'WomanRow[w_01]<WomenList<WomenScreen#0', kind: 'changed', field: 'box', before: [399, 209, 558, 54], after: [399, 209, 558, 58] },
        { id: 'WomanRow[w_04]<WomenList<WomenScreen#3', kind: 'extra' },
      ],
    },
  })
}


// Review finding rv_347ba49bed5d (queue q294): a --diff that exits 1 (a diff exists) but prints no
// readable JSON was recorded as a zero-diff pair and the gate advanced — fail-open.
test('WHEN the capture tool\'s --diff exits 1 but prints no readable result THE SYSTEM refuses the mark instead of counting the pair as zero diffs', () => {
  const host = makeHost({ lane: 'behaviour', brief: 28 })
  toCaptureWithDiff(host)
  host.setCaptureScript({
    'http://localhost:3000/women?proto=empty': { diffRaw: 'diff: 3 entries changed (not json)' },
  })

  const r = runB(host, '--mark', 'captured')
  assert.strictEqual(r.status, 2,
    'a diff the driver cannot read must refuse — counting it as zero lets a changed screen through the gate unseen: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /proto-capture\.js --diff .*\/women \(empty\).*no readable result/,
    'the refusal must name the tool and the pair, so the session knows which comparison to fix: ' + r.stdout + r.stderr)
  assert.ok(!fs.existsSync(path.join(host.sidecar, 'capture-state.json')),
    'a refused capture run must write no capture-state.json, or a later mark could treat the gate as run: ' + host.sidecar)
  assert.strictEqual(stateOfB(host), 'CAPTURE',
    'a refused capture must leave the build at CAPTURE, never advance to COMMIT: ' + stateOfB(host))
})

// Review finding rv_347ba49bed5d (queue q294): the look stop repeated the whole Reply/Then block
// once per diffing pair; the spec's Contracts block renders it once.
test('WHEN two pairs diff THE SYSTEM prints the reply line and the Then header once, with one capture-accepted command per diffing pair', () => {
  const host = makeHost({ lane: 'behaviour', brief: 28 })
  toCaptureWithDiff(host)
  host.setCaptureScript({
    'http://localhost:3000/women?proto=empty': { entries: [{ id: 'A#0', kind: 'extra' }] },
    'http://localhost:3000/women': { entries: [{ id: 'B#0', kind: 'missing' }] },
  })

  const r = runB(host, '--mark', 'captured')
  assert.strictEqual(r.status, 0, 'a diffing capture is the look stop, exit 0: ' + r.stdout + r.stderr)
  const count = (re) => (r.stdout.match(re) || []).length
  assert.strictEqual(count(/^Reply /gm), 1,
    'the reply instruction must print once, not once per screen, or several diffs bury the stop in repeats: ' + r.stdout)
  assert.strictEqual(count(/^Then \(only on the literal accept\):/gm), 1,
    'the Then header must print once: ' + r.stdout)
  assert.strictEqual(count(/--mark captured$/gm), 1,
    'the re-capture command must print once: ' + r.stdout)
  assert.match(r.stdout, /--mark capture-accepted --route \/women --state default/,
    'the default pair must keep its own accept command: ' + r.stdout)
  assert.match(r.stdout, /--mark capture-accepted --route \/women --state empty/,
    'the empty pair must keep its own accept command: ' + r.stdout)
  assert.match(r.stdout, /`accept \/women default`/, 'the reply line must name the default pair\'s accept phrase: ' + r.stdout)
  assert.match(r.stdout, /`accept \/women empty`/, 'the reply line must name the empty pair\'s accept phrase: ' + r.stdout)
})


// The capture gate replays the size each baseline was frozen at and names the conditions the
// session must restore; no spec owns these — the pins hold the behaviour. Fixtures use 1440x900
// because every other fixture is 1280x800, the size a dropped viewport falls back to.
function toCaptureState(host) {
  driveBehaviourToIntegration(host)
  implementScriptsWave(host)
  runB(host, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '2')
  runB(host, '--mark', 'wave-done', '--wave', 'other', '--workers', '1')
  const integrated = runB(host, '--mark', 'integrated')
  assert.strictEqual(integrated.status, 0, 'test setup requires a green gate at integrated: ' + integrated.stdout + integrated.stderr)
}

function baselineFile(host, name) {
  return path.join(host.root, 'design/prototypes', host.stem, 'captures', name)
}

test('--mark captured replays the size a baseline was frozen at, notes the contract disagreement on stderr, and falls back to the contract size for a baseline with no viewport', () => {
  const host = makeHost({ lane: 'behaviour', brief: 28 })
  toCaptureState(host)
  const withSize = baselineFile(host, 'women--default.json')
  const doc = JSON.parse(fs.readFileSync(withSize, 'utf8'))
  doc.viewport = { width: 1440, height: 900 }
  fs.writeFileSync(withSize, JSON.stringify(doc, null, 2) + '\n')

  const r = runB(host, '--mark', 'captured')
  assert.strictEqual(r.status, 0, 'a size disagreement is a note, not a refusal: ' + r.stdout + r.stderr)
  const read = (name) => JSON.parse(fs.readFileSync(path.join(host.sidecar, 'captures', name), 'utf8'))
  assert.deepStrictEqual(read('women--default.json').viewport, { width: 1440, height: 900 },
    'the current capture must be taken at the baseline\'s own size, or the pair compares unlike windows: ' + JSON.stringify(read('women--default.json')))
  assert.match(r.stderr, /frozen at 1440x900/, 'the note must name the size the baseline was frozen at: ' + r.stderr)
  assert.match(r.stderr, /contract says 1280x800/, 'the note must name the contract size it disagrees with: ' + r.stderr)
  assert.deepStrictEqual(read('women--empty.json').viewport, { width: 1280, height: 800 },
    'a baseline that records no size must fall back to the contract size: ' + JSON.stringify(read('women--empty.json')))
  assert.strictEqual((r.stderr.match(/frozen at/g) || []).length, 1,
    'only the disagreeing pair earns a note: ' + r.stderr)
})

function captureStepHost(storageState) {
  const host = makeHost({ lane: 'behaviour', brief: 28 })
  if (storageState) {
    const cfgPath = path.join(host.root, '.claude/spec.config.json')
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
    cfg.prototype.storageState = storageState
    fs.writeFileSync(cfgPath, JSON.stringify(cfg))
  }
  toCaptureState(host)
  return host
}

test('the CAPTURE step names the address, a development build, recreating the data, and the sign-in file when prototype.storageState is declared', () => {
  const host = captureStepHost('design/auth/state.json')
  const r = runB(host)
  assert.match(r.stdout, /state: CAPTURE/, 'setup must reach CAPTURE: ' + r.stdout)
  assert.ok(r.stdout.includes('http://localhost:3000'), 'the step must say where the app has to answer: ' + r.stdout)
  assert.match(r.stdout, /development build/, 'the step must say the capture needs a dev server: ' + r.stdout)
  assert.match(r.stdout, /the prototype's database is gone/, 'the step must say the data has to be recreated: ' + r.stdout)
  assert.match(r.stdout, /signs in from design\/auth\/state\.json/, 'the step must name the sign-in file: ' + r.stdout)
  assert.ok(!/runs signed out/.test(r.stdout), 'a declared sign-in must not also claim signed out: ' + r.stdout)
})

test('the CAPTURE step says the capture runs signed out when no prototype.storageState is declared', () => {
  const host = captureStepHost(null)
  const r = runB(host)
  assert.match(r.stdout, /runs signed out/, 'the session must be told no sign-in is used: ' + r.stdout)
  assert.ok(!/signs in from/.test(r.stdout), 'no sign-in file may be named when none is declared: ' + r.stdout)
})
