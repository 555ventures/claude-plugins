'use strict'
// Pins spec/scripts/red-check.js: new tests must be red on base and green on HEAD; a test green on
// base too is reported as vacuous. Exit 0 always. Also: run.js puts the verdict in a red gate's tail.
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

test('run.js adds the red-check verdict to a red gate tail', () => {
  const dir = tmpdir('red-run')
  const rel = 'specs/20261104/02-x.md'
  const put = (f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t) }
  put('.gitignore', '.claude/worktrees/\nspecs/**/*.run/\n')
  put('.claude/spec.config.json', JSON.stringify({ testCommand: 'exit 1', testFileCommand: 'node {file}' }))
  put(rel, '---\nstatus: hardened\n---\n\n# X\n\n## Intent\n- You asked: x\n')
  gitRepo(dir)
  const run = (...a) => runNode('scripts/run.js', [rel, '--root', dir, ...a])
  assert.strictEqual(run().status, 0)
  const wt = path.join(dir, '.claude/worktrees/spec-02-x')
  fs.mkdirSync(path.join(wt, 'test'))
  fs.writeFileSync(path.join(wt, 'test/v.test.js'), 'process.exit(0)\n')
  assert.strictEqual(run('--mark', 'built').status, 0)
  const tail = st.readRun(path.join(dir, rel)).gate.output_tail
  assert.match(tail, /red-check: vacuous green — test\/v\.test\.js/, 'the vacuous test is named in the gate tail')
})
