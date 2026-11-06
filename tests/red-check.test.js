'use strict'
// Pins spec/scripts/red-check.js: new tests must be red on base and green on HEAD; a test green on
// base too is reported as vacuous. Exit 0 always. Only files added since base are checked, named by their
// basename. run.js runs it once per tree after a GREEN gate and prints its line in the reviewer brief.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { tmpdir, gitRepo, runNode, SPEC } = require('./helpers')
const st = require(path.join(SPEC, 'scripts/lib/state.js'))

function repo(cfg) {
  const dir = tmpdir('red')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify(cfg))
  const g = gitRepo(dir)
  const put = (f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t) }
  // a.test.js needs lib.js (new code); b.test.js passes anywhere.
  put('test/a.test.js', "process.exit(require('fs').existsSync(require('path').join(__dirname, '..', 'lib.js')) ? 0 : 1)\n")
  put('test/b.test.js', 'process.exit(0)\n')
  put('lib.js', 'module.exports = 1\n')
  put('notes.md', 'a spec-ish doc that is not a test\n')
  return { dir, base: g('rev-parse', 'HEAD').trim(), g }
}

const check = (base, root) => {
  const r = runNode('scripts/red-check.js', ['--base', base, '--root', root])
  assert.strictEqual(r.status, 0, r.stderr)
  return JSON.parse(r.stdout)
}

test('a test red on base and green on HEAD passes; one green on base is vacuous', () => {
  const h = repo({ testCommand: 'true', testFileCommand: 'node {file}' })
  const out = check(h.base, h.dir)
  const byFile = Object.fromEntries(out.files.map((f) => [f.file, f]))
  assert.deepStrictEqual(Object.keys(byFile).sort(), ['test/a.test.js', 'test/b.test.js'], 'only changed test files are checked')
  assert.deepStrictEqual([byFile['test/a.test.js'].redOnBase, byFile['test/a.test.js'].greenOnHead], [true, true])
  assert.deepStrictEqual([byFile['test/b.test.js'].redOnBase, byFile['test/b.test.js'].greenOnHead], [false, true])
  assert.deepStrictEqual(out.vacuousGreen, ['test/b.test.js'])
  assert.strictEqual(h.g('worktree', 'list').trim().split('\n').length, 1, 'the base tree is removed')
})

test('without testFileCommand it reports an error and still exits 0', () => {
  const h = repo({ testCommand: 'true' })
  const out = check(h.base, h.dir)
  assert.ok(out.error, 'the missing command is reported')
  assert.deepStrictEqual(out.files, [])
})

test('AC-20261105-15-5 an edited existing test file and a new spec/scripts/x.js are left out; each test-named new file is checked', () => {
  const h = repo({ testCommand: 'true', testFileCommand: 'node {file}' })
  const put = (f, t) => { fs.mkdirSync(path.dirname(path.join(h.dir, f)), { recursive: true }); fs.writeFileSync(path.join(h.dir, f), t) }
  put('tests/old.test.js', 'process.exit(0)\n')
  h.g('add', '-A'); h.g('commit', '-q', '-m', 'old test')
  const base = h.g('rev-parse', 'HEAD').trim()
  put('tests/old.test.js', 'process.exit(0) // edited\n')
  put('spec/scripts/x.js', 'module.exports = 1\n')
  put('spec/specimen/inspect.js', 'module.exports = 1\n')
  const names = ['a.test.js', 'b.spec.ts', 'c_test.go', 'd_spec.rb', 'test_e.py']
  for (const n of names) put('new/' + n, 'x\n')
  const out = check(base, h.dir)
  assert.deepStrictEqual(out.files.map((f) => f.file).sort(), names.map((n) => 'new/' + n), 'edited tests and spec/ paths are not checked; every test name is')
})

// ---- run.js: the verdict is information in the reviewer brief --------------------------------

function runHost(cfg) {
  const dir = tmpdir('red-run')
  const rel = 'specs/20261104/02-x.md'
  const put = (f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t) }
  put('.gitignore', '.claude/worktrees/\nspecs/**/*.run/\n')
  put('.claude/spec.config.json', JSON.stringify(cfg))
  put(rel, '---\nstatus: hardened\n---\n\n# X\n\n## Intent\n- You asked: x\n')
  gitRepo(dir)
  const run = (...a) => runNode('scripts/run.js', [rel, '--root', dir, ...a])
  assert.strictEqual(run().status, 0)
  const wt = path.join(dir, '.claude/worktrees/spec-02-x')
  fs.mkdirSync(path.join(wt, 'test'))
  fs.writeFileSync(path.join(wt, 'test/v.test.js'), 'process.exit(0)\n')
  return { dir, wt, rel, run, state: () => st.readRun(path.join(dir, rel)), brief: () => JSON.parse(run('--json').stdout).body }
}

test('AC-20261105-15-4 a green gate with a vacuous new test reaches REVIEW; the reviewer brief names the file; red-check ran once for that tree', () => {
  const log = path.join(tmpdir('rc-log'), 'runs.log')
  const h = runHost({ testCommand: 'true', testFileCommand: `echo run >> ${log}; node {file}` })
  const r = h.run('--mark', 'built')
  assert.strictEqual(r.status, 0, r.stderr)
  const s = h.state()
  assert.strictEqual(s.step, 'REVIEW', 'a vacuous green is information, never a block')
  assert.strictEqual(fs.readFileSync(log, 'utf8').trim().split('\n').length, 2, 'one file: one run on base, one on head, once')
  assert.match(h.brief(), /red-check: vacuous green — test\/v\.test\.js pass on base too/, 'the vacuous test is named in the reviewer brief')
  assert.ok(!/red-check/.test(s.gate.output_tail), 'the gate tail stays the gate\'s')
})

test('AC-20261105-15-4 a red-check error prints its no-verdict line and still reaches REVIEW', () => {
  const h = runHost({ testCommand: 'true', testFileCommand: 'node {file}' })
  fs.rmSync(path.join(h.wt, '.claude/spec.config.json')) // red-check.js reads the config under the worktree: it finds no testFileCommand and reports an error
  assert.strictEqual(h.run('--mark', 'built').status, 0)
  assert.strictEqual(h.state().step, 'REVIEW')
  assert.match(h.brief(), /red-check: no verdict \(/)
})

test('AC-20261105-15-4 without testFileCommand red-check does not run and the brief has no such line; a red gate does not run it', () => {
  const none = runHost({ testCommand: 'true' })
  assert.strictEqual(none.run('--mark', 'built').status, 0)
  assert.strictEqual(none.state().step, 'REVIEW')
  assert.ok(!/red-check/.test(none.brief()))
  const log = path.join(tmpdir('rc-log'), 'runs.log')
  const red = runHost({ testCommand: 'exit 1', testFileCommand: `echo run >> ${log}; node {file}` })
  assert.strictEqual(red.run('--mark', 'built').status, 0)
  assert.strictEqual(red.state().step, 'REPAIR')
  assert.ok(!fs.existsSync(log), 'a red gate never runs red-check')
  assert.ok(!/red-check/.test(red.state().gate.output_tail), 'and its tail has no verdict')
})
