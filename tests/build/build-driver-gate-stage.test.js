'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260910/08-gate-sees-created-files.md: AC-20260910-08-1, -2, -3, -4, -5, -8. Owns the
// new stageCreatedFilePlanPaths() step at the head of runGate() — intent-to-add every untracked,
// non-ignored File Plan path before the gate child spawns, so an index-reading host check counts
// the build's own new files at build time instead of first seeing them at review.

const DRIVER = 'scripts/spec-build-driver.js'

// A File Plan with exactly one non-tests layer ("scripts") and no tests-layer row at all: TESTS/
// RED_CHECK/RED_ATTRIBUTION are all driven off hasTestsRows/needsRedAttribution, which read the
// File Plan's own layer column (spec-build-driver.js), so a File Plan with no tests row skips
// straight from a fresh host to the single "scripts" wave — the shortest path to INTEGRATION
// that still exercises runGate() for real.
function specBody(rows) {
  const table = rows.map((r) => `| ${r.path} | ${r.action} | ${r.layer} |`).join('\n')
  return `---
status: hardened
tier: standard
---
# Gate Stage Test Spec

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | the File Plan paths below land as described (AC-20260910-08-1) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
${table}

## Acceptance Criteria

- **AC-20260910-08-1**: the File Plan paths below land as described.
`
}

function makeGateStageHost({ rows, gateCommand, gitignore }) {
  const root = fs.realpathSync(tmpdir('gatestage'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  const cfg = {
    gateCommand,
    testCommand: 'true',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
    layerGroups: [['doctrine', 'scripts']],
    agentMap: { scripts: 'gate-scripts', default: 'general-purpose' },
    pipelineRules: '.claude/rules/spec-pipeline.md',
  }
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify(cfg))
  if (gitignore) fs.writeFileSync(path.join(root, '.gitignore'), gitignore)
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  fs.mkdirSync(path.join(root, 'specs/20260901'), { recursive: true })
  const spec = path.join(root, 'specs/20260901/97-gs-test.md')
  fs.writeFileSync(spec, specBody(rows))
  return { root, spec, sidecar: spec.replace(/\.md$/, '.build'), g }
}

function run(root, spec, ...args) {
  return runNode(DRIVER, [spec, ...args], { cwd: root })
}
const stateOf = (root, spec) => run(root, spec, '--state').stdout.trim()

// Drives a fresh gate-stage host (a single non-tests "scripts" wave, no tests row) from cold to
// INTEGRATION — the state at which `--mark integrated` is the next admissible mark and calls
// runGate() for the first time.
function toIntegration(host) {
  const r0 = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'WAVE:doctrine+scripts',
    'setup precondition: a fresh host with only a "scripts"-layer File Plan row and no tests row ' +
    'must land the single doctrine+scripts wave, skipping TESTS entirely: ' + r0.stdout + r0.stderr)
  const r1 = run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '1')
  assert.strictEqual(stateOf(host.root, host.spec), 'INTEGRATION',
    'setup precondition: the only wave must advance straight to INTEGRATION so --mark integrated ' +
    'is the next admissible mark: ' + r1.stdout + r1.stderr)
}

test('AC-20260910-08-1: WHEN --mark integrated runs the gate on a host whose File Plan names an untracked path THE SYSTEM has that path in the git index before the gate child starts', () => {
  const host = makeGateStageHost({
    rows: [{ path: 'src/created.js', action: 'CREATE', layer: 'scripts' }],
    gateCommand: 'git ls-files -- src/created.js',
  })
  fs.writeFileSync(path.join(host.root, 'src/created.js'), 'module.exports = () => 1\n')
  toIntegration(host)

  const r = run(host.root, host.spec, '--mark', 'integrated')
  assert.strictEqual(stateOf(host.root, host.spec), 'COMMIT',
    'setup precondition: the gate command (git ls-files, always exit 0) must land COMMIT so the ' +
    'log this test reads was actually written: ' + r.stdout + r.stderr)

  const log = fs.readFileSync(path.join(host.sidecar, 'gate-1.log'), 'utf8')
  assert.match(log, /src\/created\.js/,
    'D1: the gate child ran `git ls-files -- src/created.js` and its own log must contain that ' +
    'path — if the driver staged the File Plan path only AFTER the gate child started (or not at ' +
    'all), the untracked file would still be invisible to the gate\'s own git ls-files and the log ' +
    'would be empty: ' + log)
})

test('AC-20260910-08-2: WHEN the build has also created an untracked file that no File Plan row names THE SYSTEM leaves that file untracked', () => {
  const host = makeGateStageHost({
    rows: [{ path: 'src/created.js', action: 'CREATE', layer: 'scripts' }],
    gateCommand: 'true',
  })
  fs.writeFileSync(path.join(host.root, 'src/created.js'), 'module.exports = () => 1\n')
  fs.writeFileSync(path.join(host.root, 'src/stray.js'), 'module.exports = () => 2\n')
  toIntegration(host)

  const r = run(host.root, host.spec, '--mark', 'integrated')
  assert.strictEqual(stateOf(host.root, host.spec), 'COMMIT',
    'setup precondition: the always-green gate command must land COMMIT: ' + r.stdout + r.stderr)

  const status = host.g('status', '--porcelain', '--untracked-files=all')
  assert.match(status, /\?\? src\/stray\.js/,
    'D2: a created file that no File Plan row names must still read as untracked in `git status ' +
    '--porcelain` after the gate ran — a pathspec wider than the File Plan would sweep this scratch ' +
    'file into the index and, eventually, into the checkpoint commit: ' + status)
  const strayLs = host.g('ls-files', '--', 'src/stray.js')
  assert.strictEqual(strayLs.trim(), '',
    'D2: `git ls-files -- src/stray.js` must print nothing — the out-of-plan file must never enter ' +
    'the index via this mechanism: ' + JSON.stringify(strayLs))

  const createdLs = host.g('ls-files', '--', 'src/created.js')
  assert.strictEqual(createdLs.trim(), 'src/created.js',
    'contrast check: the File Plan path itself must be staged in the same run that left the ' +
    'out-of-plan file alone — otherwise this test would not distinguish D2\'s bounded pathspec from ' +
    'a driver that simply never stages anything: ' + JSON.stringify(createdLs))
})

test('AC-20260910-08-3: WHEN the gate exits non-zero and the run lands REPAIR THE SYSTEM leaves the staged File Plan path in the index and names it and its undo command on stderr', () => {
  const host = makeGateStageHost({
    rows: [{ path: 'src/created.js', action: 'CREATE', layer: 'scripts' }],
    gateCommand: 'exit 1',
  })
  fs.writeFileSync(path.join(host.root, 'src/created.js'), 'module.exports = () => 1\n')
  toIntegration(host)

  const r = run(host.root, host.spec, '--mark', 'integrated')
  assert.strictEqual(stateOf(host.root, host.spec), 'REPAIR',
    'setup precondition: an always-red gate command must land REPAIR before the staged-index and ' +
    'stderr assertions below can be meaningful: ' + r.stdout + r.stderr)

  const ls = host.g('ls-files', '--', 'src/created.js')
  assert.strictEqual(ls.trim(), 'src/created.js',
    'D3: the staged File Plan path must still be in the index after a red gate — reverting it ' +
    'would hide the very file a repair round\'s own reconcile tooling needs to measure: ' + JSON.stringify(ls))
  assert.match(r.stderr, /src\/created\.js/,
    'D3: the driver must name the staged path on stderr so the session (and a repair worker) can ' +
    'see what was staged without inspecting the index by hand: ' + r.stderr)
  assert.match(r.stderr, /git add -N/,
    'D3: the driver must print the undo command (`git add -N` is the mechanism the reader would ' +
    'reverse with `git reset --`) so the session knows how to remove the staging if it ever needs ' +
    'to: ' + r.stderr)
})

test('AC-20260910-08-4: WHEN a File Plan path exists on disk as a regular file and the host\'s .gitignore ignores it THE SYSTEM prints one warning naming it, leaves it out of the index, and still runs the gate', () => {
  const host = makeGateStageHost({
    rows: [{ path: 'src/hidden.js', action: 'CREATE', layer: 'scripts' }],
    gateCommand: 'echo gate-ran',
    gitignore: 'src/hidden.js\n',
  })
  fs.writeFileSync(path.join(host.root, 'src/hidden.js'), 'module.exports = () => 1\n')
  toIntegration(host)

  const r = run(host.root, host.spec, '--mark', 'integrated')
  assert.strictEqual(stateOf(host.root, host.spec), 'COMMIT',
    'D4: an ignored File Plan path must never block the gate from running — the gate command ' +
    'still ran and exited 0, so the run must still land COMMIT: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /⚠️/,
    'D4: the driver must print a ⚠️ warning line for a File Plan path its host ignores: ' + r.stderr)
  assert.match(r.stderr, /ignored/,
    'D4: the warning must say the path is ignored, or a session reading stderr cannot tell this ' +
    'apart from any other warning class: ' + r.stderr)
  assert.match(r.stderr, /src\/hidden\.js/,
    'D4: the warning must name the specific ignored path — a generic warning would not tell the ' +
    'session which File Plan row to look at: ' + r.stderr)

  const ls = host.g('ls-files', '--', 'src/hidden.js')
  assert.strictEqual(ls.trim(), '',
    'D4: an ignored File Plan path must never enter the index via this mechanism — `git ls-files` ' +
    'must print nothing for it: ' + JSON.stringify(ls))
  assert.ok(fs.existsSync(path.join(host.sidecar, 'gate-1.log')),
    'D4: the gate must still have run (gate-1.log must exist) even though one File Plan path was ' +
    'ignored and skipped: ' + host.sidecar)
})

test('AC-20260910-08-5: WHEN the intent-to-add cannot be performed THE SYSTEM exits 2 naming the failing git command, records no gateRuns entry, and spawns no gate child', () => {
  const host = makeGateStageHost({
    rows: [{ path: 'src/created.js', action: 'CREATE', layer: 'scripts' }],
    gateCommand: 'true',
  })
  fs.writeFileSync(path.join(host.root, 'src/created.js'), 'module.exports = () => 1\n')
  toIntegration(host)

  // A4 (executed at spec lock, re-confirmed here empirically): a pre-existing .git/index.lock
  // fails `git add -N` with exit 128 while leaving git ls-files/status/diff/rev-parse all at exit
  // 0 — a clean, isolated trigger for the intent-to-add step specifically, with no gate command
  // involvement at all.
  fs.writeFileSync(path.join(host.root, '.git/index.lock'), '')

  const r = run(host.root, host.spec, '--mark', 'integrated')
  assert.strictEqual(r.status, 2,
    'D5: a failed intent-to-add must refuse the mark with exit 2, the same alphabet member every ' +
    'other precondition failure in this driver uses: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /git add -N/,
    'D5: the refusal must name the failing git command (`git add -N`) so the session knows which ' +
    'invocation died: ' + r.stderr)
  assert.match(r.stderr, /128/,
    'D5: the refusal must name the failing exit code so the session can tell a lock conflict from ' +
    'some other git failure: ' + r.stderr)
  assert.ok(!fs.existsSync(path.join(host.sidecar, 'gate-1.log')),
    'D5: no gate child may have been spawned when the staging itself failed — a gate-1.log on ' +
    'disk would mean the gate ran blind over an inventory the staging never fixed: ' + host.sidecar)

  fs.rmSync(path.join(host.root, '.git/index.lock'))
  assert.strictEqual(stateOf(host.root, host.spec), 'INTEGRATION',
    'D5: the state must be unchanged by the refused mark (no gateRuns entry was recorded) — the ' +
    'mark must be simply re-issuable once the lock is gone, with no gate-cap or repair bookkeeping ' +
    'corrupted by the aborted attempt')
})

test('AC-20260910-08-8: WHEN the driver prints the host-integration step THE SYSTEM states that new File Plan files are staged into the index when the gate runs', () => {
  const host = makeGateStageHost({
    rows: [{ path: 'src/created.js', action: 'CREATE', layer: 'scripts' }],
    gateCommand: 'true',
  })
  fs.writeFileSync(path.join(host.root, 'src/created.js'), 'module.exports = () => 1\n')
  toIntegration(host)

  const bare = run(host.root, host.spec)
  assert.match(bare.stdout, /## Step: host integration/,
    'setup precondition: the bare invocation at INTEGRATION must print the host-integration step ' +
    'body this test inspects: ' + bare.stdout)
  assert.match(bare.stdout, /git add -N/,
    'D8: the INTEGRATION step body must state that new File Plan files are staged into the index ' +
    'when the gate runs (the literal `git add -N`), so a session integrating a host with an index-' +
    'reading check (a size or duplication baseline) knows to reconcile it as part of integration ' +
    'instead of discovering the gap in a repair round: ' + bare.stdout)
})
