'use strict'
// Pins lib/driver.js: argv, step printing, marks, checkpoints, auto steps, refusals.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { tmpdir, runNode, SPEC } = require('./helpers')

// A three-step toy driver: A (mark go [--n v]) → B (auto) → C (mark finish) → END.
function toyDriver() {
  const dir = tmpdir('drv')
  const file = path.join(dir, 'toy.js')
  fs.writeFileSync(file, `'use strict'
const fs = require('fs'), path = require('path')
const { makeDriver, refuse } = require(${JSON.stringify(path.join(SPEC, 'scripts/lib/driver.js'))})
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
  },
})
process.exitCode = main()
`)
  return { dir, run: (...a) => runNode(file, ['x', '--root', dir, ...a]), state: () => JSON.parse(fs.readFileSync(path.join(dir, 'toy-state.json'), 'utf8')) }
}

test('a bare run prints the step header, body and the mark line', () => {
  const d = toyDriver()
  const r = d.run()
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /^▶ A\n/, 'the session finds its step by the ▶ header')
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
