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

test('AC-20260928-03-1: WHEN the build driver runs on a hardened spec with brief: 28 while branch proto/28-functional-prototype exists THE SYSTEM exits 2 naming the open prototype and stamps neither status nor diff_base', () => {
  const host = makeHost({ brief: 28 })
  host.g('branch', 'proto/28-functional-prototype')
  const before = fs.readFileSync(host.spec, 'utf8')

  const r = run(host.root, host.spec)
  assert.strictEqual(r.status, 2,
    'a spec carrying a brief must be refused while that brief\'s proto/ branch is still open — this admission check does not exist on the pre-image, so this exits 0 today: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /prototype proto\/28-functional-prototype is still open for brief 28/,
    'the refusal must name the open branch and the brief literally: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /\/spec:prototype/,
    'the refusal must name the remedy command: ' + r.stdout + r.stderr)

  const after = fs.readFileSync(host.spec, 'utf8')
  assert.strictEqual(after, before,
    'a refused admission must flip no status and stamp no diff_base — the spec file must be byte-identical to before the run: ' + JSON.stringify({ before, after }))
})

test('AC-20260928-03-1: WHEN branch proto/28-functional-prototype is checked out in a linked worktree THE SYSTEM still refuses it, not just a `git branch --list` `*`-prefixed checkout', () => {
  const host = makeHost({ brief: 28 })
  host.g('branch', 'proto/28-functional-prototype')
  const wt = tmpdir('blddrv-wt')
  fs.rmdirSync(wt)
  host.g('worktree', 'add', wt, 'proto/28-functional-prototype')
  const before = fs.readFileSync(host.spec, 'utf8')

  const r = run(host.root, host.spec)
  assert.strictEqual(r.status, 2,
    'a branch checked out in a linked worktree prints with a `+ ` prefix in `git branch --list`, not `*` — stripping only `*` misses this and admits an open prototype: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /prototype proto\/28-functional-prototype is still open for brief 28/,
    'the refusal must name the open branch and the brief literally even when it is checked out in a worktree rather than the host repo itself: ' + r.stdout + r.stderr)
  assert.doesNotMatch(r.stdout + r.stderr, /\+ proto\//,
    'the refusal must not leak the raw `git branch --list` worktree-checkout marker (`+ `) into the message — only the branch name: ' + r.stdout + r.stderr)

  const after = fs.readFileSync(host.spec, 'utf8')
  assert.strictEqual(after, before,
    'a refused admission from a worktree-checked-out proto/ branch must flip no status and stamp no diff_base — the spec file must be byte-identical to before the run: ' + JSON.stringify({ before, after }))
})

test('AC-20260928-03-1: WHEN branch proto/<NN>-* is absent THE SYSTEM admits the spec as today', () => {
  const host = makeHost({ brief: 28 })
  const r = run(host.root, host.spec)
  assert.strictEqual(r.status, 0,
    'with no open proto/ branch the spec must be admitted exactly as before this spec: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /state: TESTS/, 'a plain brief-carrying spec with no open prototype must still reach TESTS: ' + r.stdout)
})

test('AC-20260928-03-1: WHEN the spec is brief: n/a and a proto/ branch exists THE SYSTEM admits it — the refusal is scoped to a spec that actually carries a brief', () => {
  const host = makeHost({ brief: 'n/a' })
  host.g('branch', 'proto/99-unrelated')
  const r = run(host.root, host.spec)
  assert.strictEqual(r.status, 0,
    'brief: n/a must never be refused by an unrelated proto/ branch — the admission check only applies to a spec that names a real brief: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /state: TESTS/, 'a brief: n/a spec must reach TESTS exactly as before: ' + r.stdout)
})

test('AC-20260928-03-2: WHEN a lane: behaviour spec is admitted for the first time THE SYSTEM prints state HARDEN_MERGE naming the merge command and --mark harden-merged', () => {
  const host = makeHost({ lane: 'behaviour', brief: 28 })
  const r = runB(host)
  assert.strictEqual(r.status, 0, 'a fresh behaviour-lane admission must print a step, not refuse: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /state: HARDEN_MERGE/,
    'a lane: behaviour spec\'s first state must be HARDEN_MERGE — the pre-image has no such state and prints TESTS instead: ' + r.stdout)
  assert.match(r.stdout, /Session:.*git merge --no-ff harden\/28-functional-prototype/,
    'the Session: line must name the literal merge command the user runs: ' + r.stdout)
  assert.match(r.stdout, /--mark harden-merged/,
    'the step must tell the session which mark concludes it: ' + r.stdout)
})

test('AC-20260928-03-2: WHEN --mark harden-merged runs before the harden branch is merged into HEAD THE SYSTEM refuses naming the branch; once merged THE SYSTEM advances to TESTS', () => {
  const host = makeHost({ lane: 'behaviour', brief: 28 })
  runB(host)
  createHardenBranch(host)

  const before = runB(host, '--mark', 'harden-merged')
  assert.strictEqual(before.status, 2,
    'the mark must verify ancestry itself, not trust the session\'s word — the pre-image does not even know this mark, so it refuses for the wrong reason today (unknown mark) rather than this one: ' + before.stdout + before.stderr)
  assert.match(before.stdout + before.stderr, /harden\/28-functional-prototype is not merged into HEAD/,
    'the refusal text is locked verbatim by D2: ' + before.stdout + before.stderr)

  mergeHardenBranch(host)
  const after = runB(host, '--mark', 'harden-merged')
  assert.strictEqual(after.status, 0,
    'once the session has actually run the merge, the mark must be accepted: ' + after.stdout + after.stderr)
  assert.match(after.stdout, /\(HARDEN_MERGE → TESTS\)/,
    'a verified merge must advance the state to TESTS: ' + after.stdout)
})

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

test('AC-20260928-03-2: WHEN no harden/ branch exists at all THE SYSTEM exits 2 naming /spec:prototype', () => {
  const host = makeHost({ lane: 'behaviour', brief: 28 })
  runB(host)
  const r = runB(host, '--mark', 'harden-merged')
  assert.strictEqual(r.status, 2,
    'a harden-merged mark with no harden branch at all must refuse, never silently proceed: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /\/spec:prototype/,
    'the refusal must name the freeze command that would have created harden/<stem>: ' + r.stdout + r.stderr)
})

test('AC-20260928-03-2 (SHALL CONTINUE TO): a spec without lane: still prints state TESTS first', () => {
  const host = makeHost({})
  const r = run(host.root, host.spec)
  assert.match(r.stdout, /state: TESTS/,
    'inserting HARDEN_MERGE must never move where an ordinary spec starts: ' + r.stdout)
})

test('AC-20260928-03-3: WHEN a behaviour-lane build reaches a green gate THE SYSTEM prints state CAPTURE naming contract.json, the boot command, and --mark captured', () => {
  const host = makeHost({ lane: 'behaviour', brief: 28 })
  driveBehaviourToIntegration(host)
  implementScriptsWave(host)
  runB(host, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '2')
  runB(host, '--mark', 'wave-done', '--wave', 'other', '--workers', '1')
  const integrated = runB(host, '--mark', 'integrated')
  assert.strictEqual(integrated.status, 0, 'a green gate must be accepted at integrated: ' + integrated.stdout + integrated.stderr)

  const r = runB(host)
  assert.match(r.stdout, /state: CAPTURE/,
    'a behaviour-lane build with a green gate must land CAPTURE, not COMMIT — the pre-image has no CAPTURE state at all: ' + r.stdout)
  assert.match(r.stdout, /Read only:.*contract\.json/,
    'the step must point at the frozen contract: ' + r.stdout)
  assert.match(r.stdout, /Session:.*node scripts\/dev-server\.js/,
    'the step must name the host\'s own runtime.bootCommand: ' + r.stdout)
  assert.match(r.stdout, /--mark captured/,
    'the step must tell the session which mark concludes it: ' + r.stdout)
})

test('AC-20260928-03-3: WHEN --mark captured runs with the stub reporting zero diffs for both pairs THE SYSTEM writes capture-state.json at zero, advances to COMMIT, and the next run prints state COMMIT', () => {
  const host = makeHost({ lane: 'behaviour', brief: 28 })
  driveBehaviourToIntegration(host)
  implementScriptsWave(host)
  runB(host, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '2')
  runB(host, '--mark', 'wave-done', '--wave', 'other', '--workers', '1')
  runB(host, '--mark', 'integrated')
  // No captureScript rule for either URL — the stub's default (`{}`) yields zero entries for
  // both pairs, exactly AC-3's "zero diffs for both pairs" fixture.

  const r = runB(host, '--mark', 'captured')
  assert.strictEqual(r.status, 0, 'a capture run with zero diffs on every pair must be accepted: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /\(CAPTURE → COMMIT\)/,
    'zero diffs on every pair must advance straight to COMMIT: ' + r.stdout)

  const capturePath = path.join(host.sidecar, 'capture-state.json')
  assert.ok(fs.existsSync(capturePath), 'capture-state.json must be written at <spec>.build/capture-state.json: ' + capturePath)
  const doc = JSON.parse(fs.readFileSync(capturePath, 'utf8'))
  assert.strictEqual(doc.pairs.length, 2, 'both declared route x state pairs must be recorded: ' + JSON.stringify(doc))
  for (const p of doc.pairs) {
    assert.strictEqual(p.diffs, 0, 'every pair must record diffs:0 in the zero-diff fixture: ' + JSON.stringify(doc))
    assert.strictEqual(p.accepted, false, 'a zero-diff pair is never "accepted" — that word only applies to a diffing pair the user cleared: ' + JSON.stringify(doc))
  }

  assert.strictEqual(stateOfB(host), 'COMMIT',
    'the next bare invocation must report state COMMIT once every pair is at zero diffs: ' + stateOfB(host))
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

test('AC-20260928-03-4: WHEN --mark captured runs with 3 diffs on /women (empty) and 0 on (default) THE SYSTEM prints the look stop verbatim and stays at CAPTURE', () => {
  const host = makeHost({ lane: 'behaviour', brief: 28 })
  toCaptureWithDiff(host)

  const r = runB(host, '--mark', 'captured')
  assert.strictEqual(r.status, 0, 'a diffing capture is not itself a failure — it is the look stop, exit 0: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /🎨 route \/women \(empty\): 3 diffs — http:\/\/localhost:3000\/women\?proto=empty/,
    'the diffing pair\'s header line must match the Contracts block verbatim: ' + r.stdout)
  assert.match(r.stdout, /changed WomanRow\[w_01\]<WomenList<WomenScreen#0 styles\.padding-left 16px → 20px/,
    'the first changed entry must be rendered exactly as the Contracts block shows: ' + r.stdout)
  assert.match(r.stdout, /changed WomanRow\[w_01\]<WomenList<WomenScreen#0 box \[399,209,558,54\] → \[399,209,558,58\]/,
    'the second changed entry (a box diff) must be rendered exactly as the Contracts block shows: ' + r.stdout)
  assert.match(r.stdout, /extra {3}WomanRow\[w_04\]<WomenList<WomenScreen#3/,
    'the extra entry must be rendered exactly as the Contracts block shows: ' + r.stdout)
  assert.match(r.stdout, /route \/women \(default\): 0 diffs/,
    'the non-diffing pair must still be listed, at 0 diffs: ' + r.stdout)
  assert.match(r.stdout, /accept \/women empty/,
    'the reply line must name the literal accept phrase for the diffing pair: ' + r.stdout)

  assert.strictEqual(stateOfB(host), 'CAPTURE',
    'a diffing pair must leave the build at CAPTURE — nothing advances until the user accepts or the session re-marks captured: ' + stateOfB(host))
})

test('AC-20260928-03-4: WHEN --mark capture-accepted --route /women --state empty runs on a diffing pair THE SYSTEM marks it accepted and advances to COMMIT', () => {
  const host = makeHost({ lane: 'behaviour', brief: 28 })
  toCaptureWithDiff(host)
  runB(host, '--mark', 'captured')

  const r = runB(host, '--mark', 'capture-accepted', '--route', '/women', '--state', 'empty')
  assert.strictEqual(r.status, 0, 'accepting the one diffing pair must be accepted: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /\(CAPTURE → COMMIT\)/,
    'once every diffing pair is accepted the state must advance to COMMIT: ' + r.stdout)

  const doc = JSON.parse(fs.readFileSync(path.join(host.sidecar, 'capture-state.json'), 'utf8'))
  const empty = doc.pairs.find((p) => p.route === '/women' && p.state === 'empty')
  assert.ok(empty, 'the accepted pair must still be present in capture-state.json: ' + JSON.stringify(doc))
  assert.strictEqual(empty.accepted, true, 'the accepted pair\'s own accepted flag must flip to true: ' + JSON.stringify(doc))
})

test('AC-20260928-03-4: WHEN capture-accepted names a pair with zero diffs THE SYSTEM refuses, naming that the pair has no diffs', () => {
  const host = makeHost({ lane: 'behaviour', brief: 28 })
  toCaptureWithDiff(host)
  runB(host, '--mark', 'captured')

  const r = runB(host, '--mark', 'capture-accepted', '--route', '/women', '--state', 'default')
  assert.strictEqual(r.status, 2,
    'accepting a pair that never diffed is not a real user decision — it must refuse: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /has no diffs/,
    'the refusal must say the named pair has no diffs, so the session understands there is nothing to accept: ' + r.stdout + r.stderr)
})

test('AC-20260928-03-4: WHEN the capture stub exits 2 THE SYSTEM exits 2 forwarding its stderr and writes no capture-state.json', () => {
  const host = makeHost({ lane: 'behaviour', brief: 28 })
  driveBehaviourToIntegration(host)
  implementScriptsWave(host)
  runB(host, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '2')
  runB(host, '--mark', 'wave-done', '--wave', 'other', '--workers', '1')
  runB(host, '--mark', 'integrated')
  host.setCaptureScript({
    'http://localhost:3000/women?proto=empty': { exit2capture: 'proto-capture-stub: forced capture failure for /women (empty)' },
  })

  const r = runB(host, '--mark', 'captured')
  assert.strictEqual(r.status, 2,
    'a capture that fails mid-route must refuse the mark, not silently continue with a partial gate: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /forced capture failure for \/women \(empty\)/,
    'the refusal must forward the capture stub\'s own stderr verbatim: ' + r.stdout + r.stderr)
  assert.ok(!fs.existsSync(path.join(host.sidecar, 'capture-state.json')),
    'a refused capture run must write no capture-state.json — a partial file here would let a later mark believe the gate ran cleanly: ' + host.sidecar)
})

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

test('AC-20260928-03-5: WHEN a behaviour-lane build reaches committed after an accepted diffing pair THE SYSTEM appends a build row carrying capture: { pairs: 2, diffs: 3, accepted: 1 }', () => {
  const host = makeHost({ lane: 'behaviour', brief: 28 })
  toCaptureWithDiff(host)
  runB(host, '--mark', 'captured')
  runB(host, '--mark', 'capture-accepted', '--route', '/women', '--state', 'empty')
  assert.strictEqual(stateOfB(host), 'COMMIT',
    'setup precondition: the fixture must reach COMMIT once the one diffing pair is accepted, or this test never reaches the row it means to inspect: ' + stateOfB(host))

  const specRel = path.relative(host.root, host.spec)
  host.g('add', 'src/foo.js', 'src/bar.js', 'other.txt', 'tests/foo.test.js', specRel)
  host.g('commit', '-q', '-m', 'checkpoint')

  const ledger = path.join(host.root, '.claude/spec-runs.jsonl')
  const r = runB(host, '--mark', 'committed')
  assert.strictEqual(r.status, 0, 'a clean, advanced File Plan must be accepted at COMMIT: ' + r.stdout + r.stderr)

  const rows = fs.readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  const row = rows[rows.length - 1]
  assert.deepStrictEqual(row.capture, { pairs: 2, diffs: 3, accepted: 1 },
    'a behaviour-lane build row must carry the capture counts derived from capture-state.json at committed: ' + JSON.stringify(row))
})

test('AC-20260928-03-5: a non-behaviour build\'s row carries no capture key', () => {
  const host = makeHost({})
  toIntegration(host)
  runB(host, '--mark', 'integrated')
  const specRel = path.relative(host.root, host.spec)
  host.g('add', 'src/foo.js', 'src/bar.js', 'other.txt', 'tests/foo.test.js', specRel)
  host.g('commit', '-q', '-m', 'checkpoint')

  const ledger = path.join(host.root, '.claude/spec-runs.jsonl')
  const r = runB(host, '--mark', 'committed')
  assert.strictEqual(r.status, 0, 'an ordinary build must still reach COMMIT unaffected: ' + r.stdout + r.stderr)

  const rows = fs.readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  const row = rows[rows.length - 1]
  assert.ok(!Object.prototype.hasOwnProperty.call(row, 'capture'),
    'a build with no behaviour lane must carry no capture key at all — adding a capture gate must never change every other spec\'s row shape: ' + JSON.stringify(row))
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
