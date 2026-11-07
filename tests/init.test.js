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
const seeded = (scripts, cmd, files = {}) => repo({ 'package.json': JSON.stringify({ scripts }), '.claude/spec.config.json': JSON.stringify({ testCommand: cmd }), ...files })
const initRun = (d, extra = []) => { const r = runNode('scripts/init.js', ['--root', d, '--json', ...extra]); assert.strictEqual(r.status, 0, r.stderr); return cfgOf(d).testCommand }
const twice = (d, want, extra) => { assert.strictEqual(initRun(d, extra), want); assert.strictEqual(initRun(d), want, 'a second run changes nothing'); return want }
const sh = (cmd, cwd) => require('child_process').spawnSync('sh', ['-c', cmd], { cwd }).status

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
  assert.strictEqual(out.warns.length, out.probe !== 0 ? 1 : 0)
})

test('undetectable repo returns a testCommand question; --set fills it and gate probe passes', () => {
  const d = repo({})
  const q = JSON.parse(runNode('scripts/init.js', ['--root', d, '--json']).stdout)
  assert.deepStrictEqual(q.questions.map((x) => x.key), ['testCommand'])
  const r = runNode('scripts/init.js', ['--root', d, '--set', 'testCommand=exit 0'])
  assert.match(r.stdout, /initialized — config written, gate verified/)
  assert.strictEqual(cfgOf(d).testCommand, 'exit 0')
  const again = runNode('scripts/init.js', ['--root', d, '--json'])
  assert.strictEqual(cfgOf(d).testCommand, 'exit 0')
  assert.strictEqual(fs.readFileSync(path.join(d, '.gitignore'), 'utf8').split('specs/**/*.run/').length, 2, again.stderr)
  assert.strictEqual(cfgOf(d).testCountPattern, undefined, 'a gate that prints no known summary leaves the key unset')
  // the probe's own summary sets testCountPattern, so the gate's zero-tests check is on; a value already there is kept
  const tap = "printf '# tests 3\\n# pass 3\\n'"
  const t = repo({})
  runNode('scripts/init.js', ['--root', t, '--json', '--set', `testCommand=${tap}`])
  assert.strictEqual(cfgOf(t).testCountPattern, '# tests (\\d+)')
  for (const kept of ['none', 'ran (\\d+)']) {
    const k = repo({ '.claude/spec.config.json': JSON.stringify({ testCommand: tap, testCountPattern: kept }) })
    runNode('scripts/init.js', ['--root', k, '--json'])
    assert.strictEqual(cfgOf(k).testCountPattern, kept)
  }
})

test('AC-20261105-17-1 a gate that exits 1 is written but not verified: warn, exit 0, no verified line', () => {
  const d = repo({})
  const r = runNode('scripts/init.js', ['--root', d, '--set', 'testCommand=exit 1'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /config written — gate not verified/)
  assert.match(r.stdout, /testCommand exited 1/)
  assert.ok(!/gate verified/.test(r.stdout), r.stdout)
  assert.strictEqual(cfgOf(d).testCommand, 'exit 1')
  const j = JSON.parse(runNode('scripts/init.js', ['--root', d, '--json']).stdout)
  assert.strictEqual(j.probe, 1)
  assert.strictEqual(j.warns.length, 1)
  const ok = runNode('scripts/init.js', ['--root', repo({}), '--set', 'testCommand=true'])
  assert.match(ok.stdout, /✅ initialized — config written, gate verified/)
})

test('AC-20261105-17-2 lint:ci and type-check, make targets and a bun lockfile reach the gate; config files alone add nothing', () => {
  assert.strictEqual(initRun(repo({ 'package.json': JSON.stringify({ scripts: { test: 'true', 'lint:ci': 'true', 'type-check': 'true' } }) })), 'npm run lint:ci && npm run type-check && npm test')
  assert.strictEqual(initRun(repo({ 'package.json': JSON.stringify({ scripts: { test: 'true', lint: 'true', 'lint:ci': 'true', typecheck: 'true', 'type-check': 'true' } }) })), 'npm run lint && npm run typecheck && npm test', 'lint beats lint:ci, typecheck beats type-check')
  assert.strictEqual(initRun(repo({ Makefile: 'lint:\n\ttrue\ntypecheck:\n\ttrue\n', 'go.mod': 'module x\n' })), 'make lint && make typecheck && go test ./...')
  assert.strictEqual(initRun(repo({ 'package.json': JSON.stringify({ scripts: { test: 'true', lint: 'true' } }), 'bun.lockb': '' })), 'bun run lint && bun run test')
  assert.strictEqual(initRun(repo({ 'package.json': JSON.stringify({ scripts: { test: 'true', lint: 'true' } }), 'bun.lock': '' })), 'bun run lint && bun run test')
  assert.strictEqual(initRun(repo({ '.eslintrc': '{}', 'tsconfig.json': '{}', '.golangci.yml': 'x: 1\n', 'Cargo.toml': '[package]\n' })), 'cargo test', 'no check from a bare config file')
})

test('AC-20261105-17-3 a hand answer gets the detected checks; a re-run adds a missing one once; a covered gate is byte-identical', () => {
  twice(repo({ 'package.json': JSON.stringify({ scripts: { lint: 'true' } }) }), 'npm run lint && make test', ['--set', 'testCommand=make test'])
  // a re-run on a config whose testCommand lacks a detected check adds it
  twice(seeded({ test: 'true', lint: 'true', typecheck: 'true' }, 'npm test'), 'npm run lint && npm run typecheck && npm test')
  // covered: by the command's own words, by a script it names, by a file it names
  const keep = (files, cmd) => assert.strictEqual(initRun(seeded({ test: 'true', lint: 'true', typecheck: 'true', ...files.scripts }, cmd, files.files)), cmd)
  keep({}, 'pnpm turbo run typecheck lint build test')
  keep({ files: { 'scripts/gate.sh': '#!/bin/sh\nnpm run lint\nnpm run typecheck\n' } }, 'bash scripts/gate.sh')
  keep({ scripts: { check: 'npm run lint && npm run typecheck && node --test' } }, 'npm run check')
})

test('command not found probes warn', () => {
  const d = repo({})
  const out = JSON.parse(runNode('scripts/init.js', ['--root', d, '--json', '--set', 'testCommand=nonexistent-cmd-xyz']).stdout)
  assert.strictEqual(out.probe, 127)
  assert.strictEqual(out.warns.length, 1)
})

test('AC-20261105-17-15 the contract, the footprint and the command files describe the v8 that exists', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
  const contract = read('docs/v8/interface-contract.md')
  for (const gone of ['Bootstraps the grounding layer', 'Turns rules into deterministic checks', 'Next: /spec:enforce', 'Substrate question', 'vacuous-pass']) assert.ok(!contract.includes(gone), gone)
  const row = contract.split('\n').find((l) => l.startsWith('| `.claude/spec.config.json`'))
  assert.ok(row && !row.includes('generatedBy'), 'the config row no longer promises v7 keys')
  for (const kept of ['gateConcurrency', '.worktreeinclude']) assert.ok(contract.includes(kept), kept)
  assert.match(read('docs/v8/host-footprint.md'), /release\.testCountPattern[^\n]*optional|optional[^\n]*release\.testCountPattern|`config\.release\.testCountPattern` verbatim[^\n]*optional/)
  assert.match(read('spec/commands/enforce.md'), /Retired/)
  for (const f of ['spec/commands/enforce.md', 'spec/commands/init.md']) for (const w of ['package.json', 'Makefile', 'pyproject']) assert.ok(read(f).includes(w), `${f} names ${w}`)
  for (const code of ['not-ignored', 'bad-config', 'bad-settings']) assert.ok(read('spec/commands/connect.md').includes(code), code)
})

test('a failed lint always fails the gate: a testCommand with || ; or & is grouped behind the chained checks', () => {
  for (const cmd of ['false || true', 'false; true', 'sleep 0 & true']) {
    const got = twice(repo({ 'package.json': JSON.stringify({ scripts: { lint: 'exit 1' } }) }), `npm run lint && (${cmd})`, ['--set', `testCommand=${cmd}`])
    assert.notStrictEqual(sh(got.replace('npm run lint', 'false')), 0, `a failed lint fails the gate for ${cmd}`)
  }
})

test('AC-20261106-04-1 AC-20261106-04-2 an old unsafe chain is grouped behind its checks; a second run is byte-identical', () => {
  twice(seeded({ lint: 'true' }, 'npm run lint && a || b'), 'npm run lint && (a || b)')
  twice(seeded({ lint: 'true', typecheck: 'true' }, 'npm run lint && npm run typecheck && a; b'), 'npm run lint && npm run typecheck && (a; b)')
})

test('AC-20261106-04-3 a hand-written command is never rewritten', () => {
  // Each names the detected `npm run lint`, but not as a leading `npm run lint && ` prefix setup wrote: a repair that
  // matched the check anywhere, without its ` && `, or by its word alone would rewrite them.
  const cmds = ['custom-lint && a || b', '(npm run lint && a) || b', 'npm run lint:ci && a || b', 'npm run lint&& a || b']
  assert.strictEqual(initRun(seeded({}, 'a || b')), 'a || b')
  for (const cmd of cmds) assert.strictEqual(initRun(seeded({ lint: 'true' }, cmd)), cmd)
})

test('AC-20261106-04-4 repairChain groups only what is not one balanced group, skipping quotes and comments', () => {
  const { repairChain } = require(path.join(require('./helpers').SPEC, 'scripts/init.js'))
  assert.strictEqual(repairChain('npm run lint && (a) || (b)', ['npm run lint']), 'npm run lint && ((a) || (b))')
  for (const cmd of ['npm run lint && (a || b)', 'npm run lint && (echo ")" ; b)', 'npm run lint && (a; b # x)\n)']) assert.strictEqual(repairChain(cmd, ['npm run lint']), cmd)
})

test('AC-20261106-04-5 a command ending in a comment groups into one the shell runs; a failed lint still fails it', () => {
  const d = repo({ 'package.json': JSON.stringify({ scripts: { lint: 'true' } }) })
  const got = twice(d, 'npm run lint && (true; true # note\n)', ['--set', 'testCommand=true; true # note'])
  assert.strictEqual(sh(got, d), 0, got)
  assert.notStrictEqual(sh(got.replace('npm run lint', 'false'), d), 0)
})
