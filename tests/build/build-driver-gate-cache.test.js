'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20261103/12-one-suite-run-per-tree.md: AC-20261103-12-5, -6, -7, -8 (D3). Pins the build
// driver's GATE as two host children, each keyed in the run cache by its own command and tree.

const DRIVER = 'scripts/spec-build-driver.js'
const HEX40 = /^[0-9a-f]{40}$/

// One non-tests-layer File Plan row plus a test-path row filed under layer "scripts": the gate's
// {testDirs} resolves from the path heuristic while TESTS/RED_CHECK stay skipped, so the shortest
// route to INTEGRATION still reaches runGate() with a resolved scoped gate.
const SPEC = `---
status: hardened
tier: standard
---
# Gate Cache Test Spec

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | src/only.js is the sole change (AC-20261103-12-5) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/only.js | MODIFY | scripts |
| tests/x.test.js | CREATE | scripts |

## Acceptance Criteria

- **AC-20261103-12-5**: src/only.js exists.
`

// Counters and the red flag live OUTSIDE the repo so a counter write never moves the tree.
function makeHost() {
  const root = fs.realpathSync(tmpdir('gatecache'))
  const out = fs.realpathSync(tmpdir('gatecache-out'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  const cfg = {
    gateCommand: 'bash gate.sh {testDirs}',
    postGateCommand: 'bash post.sh',
    testCommand: 'true',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none', testCountPattern: 'ℹ tests (\\d+)' },
    layerGroups: [['doctrine', 'scripts']],
    agentMap: { scripts: 'gate-scripts', default: 'general-purpose' },
    pipelineRules: '.claude/rules/spec-pipeline.md',
  }
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify(cfg))
  fs.writeFileSync(path.join(root, 'src/only.js'), 'module.exports = 1\n')
  fs.writeFileSync(path.join(root, 'gate.sh'),
    `#!/usr/bin/env bash\necho x >> '${out}/gate'\necho 'gate-output'\necho 'ℹ tests 3'\n` +
    `if [ -f '${out}/gate-red' ]; then exit 1; fi\nexit 0\n`)
  fs.writeFileSync(path.join(root, 'post.sh'),
    `#!/usr/bin/env bash\necho x >> '${out}/post'\necho 'post-output'\necho 'ℹ tests 7'\nexit 0\n`)
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  fs.mkdirSync(path.join(root, 'specs/20260901'), { recursive: true })
  const spec = path.join(root, 'specs/20260901/96-gc-test.md')
  fs.writeFileSync(spec, SPEC)
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(root, 'tests/x.test.js'), "'use strict'\n")
  const count = (n) => {
    try { return fs.readFileSync(path.join(out, n), 'utf8').split('\n').filter(Boolean).length } catch { return 0 }
  }
  return { root, out, spec, g, sidecar: spec.replace(/\.md$/, '.build'), count }
}

const run = (h, ...args) => runNode(DRIVER, [h.spec, ...args], { cwd: h.root })
const stateOf = (h) => run(h, '--state').stdout.trim()
const readMarks = (h) => JSON.parse(fs.readFileSync(path.join(h.sidecar, 'build-state.json'), 'utf8'))

function toIntegration(h) {
  run(h)
  const r = run(h, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '1')
  assert.strictEqual(stateOf(h), 'INTEGRATION',
    'setup precondition: the single doctrine+scripts wave must advance to INTEGRATION so --mark integrated runs the gate: ' + r.stdout + r.stderr)
}

// Re-arms GATE over the SAME tree: the sidecar's last gate run is rewritten red (the repair-round
// precondition) and `--mark repair-applied` runs runGate() again with no tracked change.
function rearm(h) {
  const marks = readMarks(h)
  marks.gateRuns[marks.gateRuns.length - 1].exit = 1
  fs.writeFileSync(path.join(h.sidecar, 'build-state.json'), JSON.stringify(marks))
  return run(h, '--mark', 'repair-applied', '--continued', '1', '--spawned', '0')
}

test('AC-20261103-12-5: WHEN GATE runs a gateCommand and a postGateCommand THE SYSTEM spawns two children, writes the == postGateCommand marker between their outputs, and records gateRuns[0] as {exit:0, log, tree:<40-hex>, cached:[]}', () => {
  const h = makeHost()
  toIntegration(h)
  const r = run(h, '--mark', 'integrated')
  assert.strictEqual(r.status, 0, 'setup precondition: a green gate and post-gate must be accepted: ' + r.stdout + r.stderr)

  assert.strictEqual(h.count('gate'), 1, 'the scoped gate must be spawned exactly once on a cold cache: ' + h.count('gate'))
  assert.strictEqual(h.count('post'), 1, 'the post-gate must be spawned exactly once on a cold cache: ' + h.count('post'))

  const log = fs.readFileSync(path.join(h.sidecar, 'gate-1.log'), 'utf8')
  const gi = log.indexOf('gate-output')
  const mi = log.indexOf('== postGateCommand')
  const pi = log.indexOf('post-output')
  assert.ok(gi >= 0 && mi > gi && pi > mi,
    'gate-1.log must hold the gate output, then the driver-written == postGateCommand line, then the post-gate output — a missing or misplaced marker blinds every reader that splits the log on it: ' + log)

  const run0 = readMarks(h).gateRuns[0]
  assert.strictEqual(run0.exit, 0, 'gateRuns[0].exit must be 0 when both children are green: ' + JSON.stringify(run0))
  assert.match(String(run0.tree), HEX40,
    'gateRuns[0].tree must be the 40-hex cache tree — without it the review stage cannot tell which bytes the green vouches for: ' + JSON.stringify(run0))
  assert.deepStrictEqual(run0.cached, [],
    'a cold-cache round reused nothing, so gateRuns[0].cached must be []: ' + JSON.stringify(run0))
})

test('AC-20261103-12-6: WHEN GATE re-runs over the same tree and both parts printed a count THE SYSTEM spawns neither child, writes == reused cache:<tree7> bash post.sh to the new log, and records cached [gate, postGate]', () => {
  const h = makeHost()
  toIntegration(h)
  const r1 = run(h, '--mark', 'integrated')
  assert.strictEqual(r1.status, 0, 'setup precondition: round 1 must be green: ' + r1.stdout + r1.stderr)
  const tree = readMarks(h).gateRuns[0].tree

  const r2 = rearm(h)
  assert.strictEqual(r2.status, 0, 'setup precondition: the re-armed round must be accepted: ' + r2.stdout + r2.stderr)

  assert.strictEqual(h.count('gate'), 1,
    'a gate that already vouched for this exact tree must not spawn again — a second spawn is the duplicated suite run this cache exists to remove: ' + h.count('gate'))
  assert.strictEqual(h.count('post'), 1,
    'the post-gate (the whole suite) must not spawn again over an unchanged tree: ' + h.count('post'))

  const log2 = fs.readFileSync(path.join(h.sidecar, 'gate-2.log'), 'utf8')
  assert.ok(log2.includes('== reused cache:' + String(tree).slice(0, 7) + ' bash post.sh'),
    'gate-2.log must carry the == reused cache:<tree7> <cmd> provenance line, or a reader cannot tell a reuse from a silent no-run: ' + log2)

  const run1 = readMarks(h).gateRuns[1]
  assert.deepStrictEqual(run1.cached, ['gate', 'postGate'],
    'gateRuns[1].cached must name both reused parts: ' + JSON.stringify(run1))
  assert.strictEqual(run1.tree, tree, 'the unchanged tree must key both rounds identically: ' + JSON.stringify(run1))
})

test('AC-20261103-12-7: WHEN the scoped gate exits 1 THE SYSTEM spawns no post-gate, writes no == postGateCommand line, records nothing in the cache, and the next GATE over the same tree spawns the gate again', () => {
  const h = makeHost()
  fs.writeFileSync(path.join(h.out, 'gate-red'), '')
  toIntegration(h)
  const r = run(h, '--mark', 'integrated')
  assert.strictEqual(stateOf(h), 'REPAIR',
    'setup precondition: a red scoped gate must land REPAIR: ' + r.stdout + r.stderr)

  assert.strictEqual(h.count('post'), 0, 'a red scoped gate must skip the post-gate child: ' + h.count('post'))
  const log = fs.readFileSync(path.join(h.sidecar, 'gate-1.log'), 'utf8')
  assert.ok(!log.includes('== postGateCommand'),
    'the marker must never land after a red scoped gate — readers treat it as "the gate passed": ' + log)
  const run0 = readMarks(h).gateRuns[0]
  assert.strictEqual(run0.exit, 1, 'gateRuns[0].exit must carry the red exit: ' + JSON.stringify(run0))
  assert.match(String(run0.tree), HEX40,
    'a red round still records the tree it ran over — a missing tree field means the driver never derived the cache tree: ' + JSON.stringify(run0))

  const cacheDir = path.join(h.root, '.git', 'spec-run-cache')
  const entries = fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir) : []
  assert.deepStrictEqual(entries, [],
    'a red gate — though it printed ℹ tests — must record nothing under cacheDir, or a later round would reuse a failure as a pass: ' + JSON.stringify(entries))

  const r2 = run(h, '--mark', 'repair-applied', '--continued', '1', '--spawned', '0')
  assert.strictEqual(r2.status, 0, 'setup precondition: repair-applied must run a second gate: ' + r2.stdout + r2.stderr)
  assert.strictEqual(h.count('gate'), 2,
    'an unchanged tree after a red must spawn the gate again (counter 2) — a red was never recorded, so reuse would hide the failure: ' + h.count('gate'))
})

test('AC-20261103-12-8: WHEN the build reaches DONE THE SYSTEM appends a stage:"build" ledger row whose gate block carries tree and cached equal to the last gateRuns entry', () => {
  const h = makeHost()
  toIntegration(h)
  const r = run(h, '--mark', 'integrated')
  assert.strictEqual(stateOf(h), 'COMMIT', 'setup precondition: a green gate must land COMMIT: ' + r.stdout + r.stderr)
  const last = readMarks(h).gateRuns.at(-1)

  fs.writeFileSync(path.join(h.root, 'src/only.js'), 'module.exports = 2\n')
  h.g('add', 'src/only.js', 'tests/x.test.js', path.relative(h.root, h.spec))
  h.g('commit', '-q', '-m', 'checkpoint')
  const rc = run(h, '--mark', 'committed')
  assert.strictEqual(rc.status, 0, 'setup precondition: committed must reach DONE: ' + rc.stdout + rc.stderr)

  const lines = fs.readFileSync(path.join(h.root, '.claude/spec-runs.jsonl'), 'utf8').trim().split('\n').filter(Boolean)
  const row = JSON.parse(lines[lines.length - 1])
  assert.strictEqual(row.stage, 'build', 'the last ledger row must be the build row: ' + JSON.stringify(row))
  assert.match(String(row.gate && row.gate.tree), HEX40,
    'the ledger gate block must carry the 40-hex tree — review joins on it to know which bytes the build vouched for: ' + JSON.stringify(row.gate))
  assert.strictEqual(row.gate.tree, last.tree, 'gate.tree must equal the last gateRuns entry\'s tree: ' + JSON.stringify({ gate: row.gate, last }))
  assert.deepStrictEqual(row.gate.cached, last.cached,
    'gate.cached must equal the last gateRuns entry\'s cached list: ' + JSON.stringify({ gate: row.gate, last }))
})
