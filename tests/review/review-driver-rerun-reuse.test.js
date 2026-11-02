'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, gitRepo } = require('../helpers')
const { GREEN_TEST, specBody, run, stateOf } = require('./review-driver.fixtures')

// specs/20261101/06-a-rerun-re-runs-only-what-went-red.md D1/D3/D4/D7: AC-20261101-06-1, -6, -7, -8.

// The counter and flake files live OUTSIDE the fixture repo (absolute paths baked into the
// tracked gate.sh), so appending to one or flipping the other never moves snapshotTree().
function makeHost(kind) {
  const root = fs.realpathSync(tmpdir('rvdrv-reuse'))
  const aux = fs.realpathSync(tmpdir('rvdrv-reuse-aux'))
  const counter = path.join(aux, 'counter')
  const flake = path.join(aux, 'flake')
  fs.writeFileSync(flake, 'red')
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  const gateSh = kind === 'skips'
    ? `echo x >> '${counter}'\nnode --test tests\necho 'ℹ skipped 1'\n`
    : `echo x >> '${counter}'\n[ "$(cat '${flake}')" = red ] && exit 1\nexit 0\n`
  fs.writeFileSync(path.join(root, 'gate.sh'), gateSh)
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'bash gate.sh',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: kind === 'skips' ? 'ℹ skipped (\\d+)' : 'none' },
  }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const diffBase = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(root, 'specs/20260820'), { recursive: true })
  const spec = path.join(root, 'specs/20260820/99-drv-reuse.md')
  fs.writeFileSync(spec, specBody({ diffBase, acId: 'AC-20260820-99-2' }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST.replace('AC-20260820-99-1', 'AC-20260820-99-2'))
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { root, g, spec, sidecar: spec.replace(/\.md$/, '.review'), counter, flake }
}

const lines = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).length : 0
const rowsOf = file => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
const marksOf = host => JSON.parse(fs.readFileSync(path.join(host.sidecar, 'review-state.json'), 'utf8')).marks || JSON.parse(fs.readFileSync(path.join(host.sidecar, 'review-state.json'), 'utf8'))

function skipsFile() {
  const f = path.join(fs.realpathSync(tmpdir('rvdrv-reuse-skips')), 'skips.txt')
  fs.writeFileSync(f, 'AC-20260820-99-2: foo() returns 42\n')
  return f
}

test('AC-20261101-06-1: a first bare legs run records marks.legsTree["1"] as a 40-hex tree equal to git write-tree over the unchanged tree', () => {
  const host = makeHost('skips')
  const r = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'SKIPS', 'setup precondition: the skips host must land SKIPS: ' + r.stdout + r.stderr)
  const marks = marksOf(host)
  const tree = marks.legsTree && marks.legsTree['1']
  assert.match(String(tree), /^[0-9a-f]{40}$/,
    'without a recorded legsTree the driver cannot tell an unchanged tree from a changed one, so every rerun stays a full re-run: ' + JSON.stringify(marks))
  // Scratch-index write-tree over the working tree, sidecar excluded — the same view snapshotTree() takes.
  const idx = path.join(fs.realpathSync(tmpdir('rvdrv-reuse-idx')), 'index')
  const env = { ...process.env, GIT_INDEX_FILE: idx }
  const git = (...a) => execFileSync('git', ['-C', host.root, ...a], { encoding: 'utf8', env }).trim()
  git('read-tree', 'HEAD')
  git('add', '-A', '--', '.', ':(exclude)' + path.relative(host.root, host.sidecar))
  assert.strictEqual(tree, git('write-tree'),
    'legsTree must be the sidecar-excluded write-tree of the tree the legs judged — any other hash makes the equality test in the marks meaningless: ' + tree)
})

test('AC-20261101-06-6: skips-extracted over an unchanged tree prints the unchanged line naming gate, reuses the gate row from manifest-1, and the gate stub ran once in total', () => {
  const host = makeHost('skips')
  run(host.root, host.spec)
  assert.strictEqual(lines(host.counter), 1, 'setup precondition: the bare run must run the gate once')
  const m = run(host.root, host.spec, '--mark', 'skips-extracted', '--file', skipsFile())
  assert.strictEqual(m.status, 0, 'the skips-extracted mark must be accepted: ' + m.stdout + m.stderr)
  const line = m.stdout.split('\n').find(l => l.startsWith('♻️ tree unchanged since legs 1 — reusing green rows: ')) || ''
  assert.ok(line.includes('gate'),
    'the owner\'s veto surface must name the reused legs, gate among them: ' + m.stdout)
  const gate = rowsOf(path.join(host.sidecar, 'manifest-2.jsonl')).find(x => x.leg === 'gate')
  assert.ok(gate, 'manifest-2.jsonl must still carry a gate row: ' + m.stdout)
  assert.strictEqual(gate.observed.reusedFrom, 'manifest-1.jsonl',
    'the copied gate row must name the manifest it came from — otherwise provenance is lost: ' + JSON.stringify(gate))
  assert.strictEqual(lines(host.counter), 1,
    'an unchanged tree must not re-run the gate — a second counter line means the full cost was paid again: ' + m.stdout)
})

test('AC-20261101-06-8: skips-extracted after a tracked file changed prints the tree-changed line, passes no reuse, and re-runs the gate', () => {
  const host = makeHost('skips')
  run(host.root, host.spec)
  fs.appendFileSync(path.join(host.root, 'src/foo.js'), '// edited after legs 1\n')
  const m = run(host.root, host.spec, '--mark', 'skips-extracted', '--file', skipsFile())
  assert.strictEqual(m.status, 0, 'the skips-extracted mark must be accepted: ' + m.stdout + m.stderr)
  assert.ok(m.stdout.includes('tree changed since legs 1 — every leg re-runs'),
    'a changed tree must say so — silence would hide that nothing was reused: ' + m.stdout)
  assert.ok(!m.stdout.includes('♻️'), 'a changed tree must not claim reuse: ' + m.stdout)
  const gate = rowsOf(path.join(host.sidecar, 'manifest-2.jsonl')).find(x => x.leg === 'gate')
  assert.ok(gate && !('reusedFrom' in gate.observed),
    'the gate row over a changed tree must be a fresh one, never copied — a copy would vouch for code it never ran: ' + JSON.stringify(gate))
  assert.strictEqual(lines(host.counter), 2, 'the gate must run again over the changed tree: ' + m.stdout)
})

test('AC-20261101-06-7: repair-round over an unchanged tree reuses the green legs, re-runs the red gate, names it flaky in stdout and marks.flaky, and lands REVIEWER', () => {
  const host = makeHost('red')
  const first = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'STOPPED', 'setup precondition: a red gate must land STOPPED: ' + first.stdout + first.stderr)
  assert.strictEqual(lines(host.counter), 1, 'setup precondition: the bare run must run the gate once')
  fs.writeFileSync(host.flake, 'green')
  const m = run(host.root, host.spec, '--mark', 'repair-round')
  assert.strictEqual(m.status, 0, 'the repair-round mark must be admitted at STOPPED: ' + m.stdout + m.stderr)
  assert.match(m.stdout, /^♻️ tree unchanged since legs 1 — reusing green rows: /m,
    'an unchanged tree at repair-round must print the reuse line: ' + m.stdout)
  assert.strictEqual(lines(host.counter), 2,
    'the red gate must re-run exactly once — failures are never reused, and green rows need no gate run: ' + m.stdout)
  assert.ok(m.stdout.includes('⚠ flaky: gate was red at legs 1 and green over the same tree'),
    'red then green over one tree must be named flaky or the owner never learns the gate is unreliable: ' + m.stdout)
  assert.deepStrictEqual(marksOf(host).flaky && marksOf(host).flaky['1'], ['gate'],
    'the flaky leg must be recorded in the sidecar marks: ' + JSON.stringify(marksOf(host)))
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'the review must proceed normally after a flaky green: ' + m.stdout)
})
