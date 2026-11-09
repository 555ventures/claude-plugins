'use strict'
// Pins lib/driver.js: argv, step printing, marks, checkpoints, auto steps, refusals.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { tmpdir, runNode, SPEC } = require('./helpers')

// A three-step toy driver: A (mark go [--n v]) → B (auto) → C (mark finish) → END.
function toyDriver({ applied, lib = path.join(SPEC, 'scripts/lib'), env } = {}) {
  const dir = tmpdir('drv')
  const file = path.join(dir, 'toy.js')
  fs.writeFileSync(file, `'use strict'
const fs = require('fs'), path = require('path')
const { makeDriver, refuse } = require(${JSON.stringify(path.join(lib, 'driver.js'))})
const sp = (ctx) => path.join(ctx.root, 'toy-state.json')
const main = makeDriver({
  name: 'toy', specArg: 'thing',
  load: (ctx) => { try { return JSON.parse(fs.readFileSync(sp(ctx), 'utf8')) } catch { return { step: 'A' } } },
  save: (s, ctx) => fs.writeFileSync(sp(ctx), JSON.stringify(s)),
  derive: (s) => s.step === 'A' ? { name: 'A', body: 'do the A thing', mark: 'go [--n <v>]' }
    : s.step === 'B' ? { name: 'B', auto: (st) => ({ ...st, step: 'C', autoRan: true }) }
    : s.step === 'C' ? { name: 'C', body: 'finish up', mark: 'finish', accepts: ['bail'] }
    : { name: 'END' },
  steps: {
    go: (s, flags) => ({ ...s, step: 'B', n: flags.n }),
    finish: (s) => ({ ...s, step: 'END' }),
    bail: () => refuse('cannot bail here — run finish'),
    other: (s) => s,
  },${applied ? `
  applied: ${applied},` : ''}
})
process.exitCode = main()
`)
  return { dir, run: (...a) => runNode(file, ['x', '--root', dir, ...a], { env }), state: () => JSON.parse(fs.readFileSync(path.join(dir, 'toy-state.json'), 'utf8')) }
}

test('a bare run prints the step header, body and the mark line', () => {
  const d = toyDriver()
  const r = d.run()
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /^▶ A · spec \d+\.\d+\.\d+\n/, 'the session finds its step by the ▶ header, which names the running version')
  assert.ok(r.stdout.includes('do the A thing'), 'the step body is the session\'s instruction')
  assert.match(r.stdout, /--root \S+ --mark go/, 'the session needs a runnable mark line')
  const s = d.run('--state')
  assert.strictEqual(s.stdout, 'A\n', '--state must print only the step name')
  const j = JSON.parse(d.run('--json').stdout)
  assert.strictEqual(j.step, 'A', '--json consumers read the step name')
})

test('a mark applies the step, runs auto steps, saves and prints the checkpoint', () => {
  const d = toyDriver()
  const r = d.run('--mark', 'go', '--n', '7')
  assert.strictEqual(r.status, 0, r.stderr)
  assert.strictEqual(r.stdout.trim(), '✅ checkpoint — A → C; safe to /clear and re-run /spec:toy x', 'the checkpoint tells the user a /clear is safe')
  const s = d.state()
  assert.strictEqual(s.n, '7', 'mark flags reach the step handler')
  assert.ok(s.autoRan && s.step === 'C', 'auto steps must run without the session')
  assert.match(d.run().stdout, /^▶ C/, 'a re-run resumes from disk')
})

test('refusals exit 2 with the remedy on stderr', () => {
  const d = toyDriver()
  const wrong = d.run('--mark', 'finish')
  assert.strictEqual(wrong.status, 2, 'a mark for another step must be refused')
  assert.match(wrong.stderr, /^toy: .*expected go/, 'the refusal names the expected mark')
  assert.strictEqual(d.run('--mark', 'nope').status, 2, 'an unknown mark must be refused')
  assert.strictEqual(d.run('--mark', 'other').status, 2, 'a known mark not accepted at this step must be refused')
  d.run('--mark', 'go')
  const bail = d.run('--mark', 'bail')
  assert.strictEqual(bail.status, 2, 'a thrown refusal maps to exit 2')
  assert.match(bail.stderr, /run finish/, 'the handler\'s remedy reaches stderr')
  assert.strictEqual(d.state().step, 'C', 'a refused mark must not change state')
  assert.strictEqual(runNode(path.join(d.dir, 'toy.js'), ['--root', d.dir]).status, 2, 'a missing spec argument is a usage refusal')
})

test('AC-20261105-07-10 a mark the step refuses is a checkpoint when applied says its effect is in the state, and refused when applied says no', () => {
  const d = toyDriver({ applied: "(verb, s) => verb === 'go' && s.step === 'C'" })
  d.run('--mark', 'go')
  const again = d.run('--mark', 'go')
  assert.strictEqual(again.status, 0, again.stderr)
  assert.match(again.stdout, /^✅ checkpoint — C → C; mark go was already applied; safe to \/clear/, again.stdout)
  assert.strictEqual(d.state().step, 'C', 'nothing ran')
  const other = d.run('--mark', 'other')
  assert.strictEqual(other.status, 2, 'applied says no: today\'s refusal')
  assert.match(other.stderr, /mark 'other' is not accepted at C/)
  const plain = toyDriver()
  plain.run('--mark', 'go')
  assert.strictEqual(plain.run('--mark', 'go').status, 2, 'a driver with no hook refuses as before')
})

// A plugin cache the way Claude Code lays one out: <cache>/spec/<version>/ holding scripts/lib and .claude-plugin/plugin.json.
function cachedPlugin(version) {
  const cache = tmpdir('cache')
  const root = path.join(cache, 'spec', version)
  fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude-plugin/plugin.json'), JSON.stringify({ name: 'spec', version }))
  fs.cpSync(path.join(SPEC, 'scripts/lib'), path.join(root, 'scripts/lib'), { recursive: true })
  return { cache, lib: path.join(root, 'scripts/lib') }
}
const registry = (entries) => {
  const cfg = tmpdir('cfg')
  fs.mkdirSync(path.join(cfg, 'plugins'))
  fs.writeFileSync(path.join(cfg, 'plugins/installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'spec@tools': entries } }))
  return { CLAUDE_CONFIG_DIR: cfg }
}

test('AC-20261108-02-1 every step prints the running version in its header and --json carries it', () => {
  const { lib } = cachedPlugin('1.2.3')
  const d = toyDriver({ lib, env: registry([]) })
  assert.match(d.run().stdout, /^▶ A · spec 1\.2\.3\n/)
  assert.doesNotMatch(d.run().stdout, /⚠️/, 'an empty registry warns nothing')
  assert.strictEqual(JSON.parse(d.run('--json').stdout).version, '1.2.3')
  assert.strictEqual(d.run('--state').stdout, 'A\n', '--state stays the bare step name')
})

test('AC-20261108-02-1 a newer installed plugin beside the running one is warned under the step and the checkpoint; one elsewhere is not', () => {
  const { cache, lib } = cachedPlugin('1.2.3')
  const warn = '⚠️ spec 1.2.3 is running but 2.0.0 is installed — restart Claude Code'
  const stale = toyDriver({ lib, env: registry([{ installPath: path.join(cache, 'spec', '2.0.0'), version: '2.0.0' }]) })
  const step = stale.run()
  assert.ok(step.stdout.includes(warn), step.stdout)
  assert.match(step.stdout, /^▶ A · spec 1\.2\.3\n/)
  assert.ok(!step.stdout.slice(0, step.stdout.indexOf(warn)).includes('✅'), 'the warning follows the step')
  const cp = stale.run('--mark', 'go')
  assert.match(cp.stdout, /✅ checkpoint — A → C; safe to \/clear and re-run \/spec:toy x\n⚠️ spec 1\.2\.3 is running but 2\.0\.0 is installed/, cp.stdout)
  assert.strictEqual(stale.run('--json').stdout.includes('⚠️'), false, '--json carries the version, not the prose')
  const same = toyDriver({ lib, env: registry([{ installPath: path.join(cache, 'spec', '1.2.3'), version: '1.2.3' }]) })
  assert.doesNotMatch(same.run().stdout, /⚠️/, 'the installed version is the running one')
  const other = toyDriver({ lib, env: registry([{ installPath: path.join(tmpdir('elsewhere'), 'spec', '9.9.9'), version: '9.9.9' }]) })
  assert.doesNotMatch(other.run().stdout, /⚠️/, 'no entry shares the plugin root\'s parent')
  assert.doesNotMatch(other.run('--mark', 'go').stdout, /⚠️/)
  // two scopes in one cache: user 2.0.0 and a project pin of 1.2.3. The entry for this session's root binds the comparison.
  const scopes = (projectPath) => registry([
    { scope: 'user', installPath: path.join(cache, 'spec', '2.0.0'), version: '2.0.0' },
    { scope: 'project', projectPath, installPath: path.join(cache, 'spec', '1.2.3'), version: '1.2.3' },
  ])
  const env = {}
  const here = toyDriver({ lib, env })
  Object.assign(env, scopes(here.dir))
  assert.doesNotMatch(here.run().stdout, /⚠️/, 'this project pins the running version: not stale')
  assert.doesNotMatch(here.run('--mark', 'go').stdout, /⚠️/)
  const there = toyDriver({ lib, env: scopes(tmpdir('other-project')) })
  assert.ok(there.run().stdout.includes(warn), 'another project\'s pin is not this session\'s install: the user scope binds')
  assert.ok(there.run('--mark', 'go').stdout.includes(warn))
})
