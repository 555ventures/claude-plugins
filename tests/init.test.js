'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { tmpdir, gitRepo, runNode } = require('./helpers')

const repo = (files) => {
  const dir = tmpdir('init')
  for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), c) }
  gitRepo(dir)
  return dir
}
const cfgOf = (d) => JSON.parse(fs.readFileSync(path.join(d, '.claude/spec.config.json'), 'utf8'))

test('node repo: detects test, setup, lint+typecheck fold; gitignore written', () => {
  const d = repo({ 'package.json': JSON.stringify({ scripts: { test: 'true', lint: 'true', typecheck: 'true' } }), 'package-lock.json': '{}' })
  const r = runNode('scripts/init.js', ['--root', d, '--json'])
  assert.strictEqual(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.questions.length, 0)
  const c = cfgOf(d)
  assert.strictEqual(c.testCommand, 'npm run lint && npm run typecheck && npm test')
  assert.strictEqual(c.setupCommand, 'npm ci')
  assert.strictEqual(c.trunk, 'main')
  const ig = fs.readFileSync(path.join(d, '.gitignore'), 'utf8')
  for (const e of ['specs/**/*.run/', '.claude/worktrees/', '.claude/pending-question.json', '.claude/settings.local.json']) assert.ok(ig.includes(e), e)
})

test('python repo without a probeable gate asks; --set answers; user keys survive; 127 warns', () => {
  const d = repo({ 'pytest.ini': '[pytest]\n', 'requirements.txt': 'x\n', 'pyproject.toml': '[tool.ruff]\n' })
  fs.mkdirSync(path.join(d, '.claude'))
  fs.writeFileSync(path.join(d, '.claude/spec.config.json'), JSON.stringify({ lanes: 7, trunk: 'dev' }))
  const out = JSON.parse(runNode('scripts/init.js', ['--root', d, '--json', '--set', 'setupCommand=make deps']).stdout)
  const c = cfgOf(d)
  assert.strictEqual(c.lanes, 7)
  assert.strictEqual(c.trunk, 'dev')
  assert.strictEqual(c.setupCommand, 'make deps')
  assert.strictEqual(c.testCommand, 'ruff check . && pytest')
  assert.strictEqual(out.warns.length, out.probe > 1 ? 1 : 0)
})

test('undetectable repo returns a testCommand question; --set fills it and gate probe passes', () => {
  const d = repo({})
  const q = JSON.parse(runNode('scripts/init.js', ['--root', d, '--json']).stdout)
  assert.deepStrictEqual(q.questions.map((x) => x.key), ['testCommand'])
  const r = runNode('scripts/init.js', ['--root', d, '--set', 'testCommand=exit 1'])
  assert.match(r.stdout, /initialized — config written, gate verified/)
  assert.strictEqual(cfgOf(d).testCommand, 'exit 1')
  const again = runNode('scripts/init.js', ['--root', d, '--json'])
  assert.strictEqual(cfgOf(d).testCommand, 'exit 1')
  assert.strictEqual(fs.readFileSync(path.join(d, '.gitignore'), 'utf8').split('specs/**/*.run/').length, 2, again.stderr)
})

test('command not found probes warn', () => {
  const d = repo({})
  const out = JSON.parse(runNode('scripts/init.js', ['--root', d, '--json', '--set', 'testCommand=nonexistent-cmd-xyz']).stdout)
  assert.strictEqual(out.probe, 127)
  assert.strictEqual(out.warns.length, 1)
})
