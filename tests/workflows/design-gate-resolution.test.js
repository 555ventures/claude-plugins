'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { SPEC, tmpdir, gitRepo, read } = require('../helpers')

// specs/20260813/05-workflow-correctness-repairs.md D1/D2 (AC-20260813-05-1, -2, -3, -12).
// Today spec-design-driver.js does `[config.gateCommand].filter(Boolean).join(' ')` — the raw
// gateCommand (including any unresolved `{testDirs}`-style placeholder) passes straight through
// into the design gate, so a host whose gateCommand composes a `{testDirs}` leg can never pass
// the design-stage gate (gate-exhausted forever). D1 makes the driver split `gateCommand` into
// `&&`-joined legs (parens/quotes protected), drop legs still carrying an unresolved `{...}`
// token, and log the drop; D2 emits the literal sentinel `__UNGATED__` when every leg drops, and
// an explicit `design.gateCommand` config key bypasses the whole derivation.

const DRIVER = path.join(SPEC, 'scripts/spec-design-driver.js')

function fixture(gateCommand, designGateCommand) {
  const root = fs.realpathSync(tmpdir('design-gate'))
  gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  const design = { tool: 'storybook', command: 'bun storybook' }
  if (designGateCommand !== undefined) design.gateCommand = designGateCommand
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({ gateCommand, design }))
  const specDir = path.join(root, 'specs/20260813')
  fs.mkdirSync(specDir, { recursive: true })
  const spec = path.join(specDir, '05-x.md')
  fs.writeFileSync(spec, '---\nstatus: hardened\ndesign: true\n---\n# X\n')
  const sidecar = spec.replace(/\.md$/, '.design')
  fs.mkdirSync(sidecar, { recursive: true })
  // Minimal valid skeletons.json (bind decision needs only id/decision/bind.{component,from}) —
  // enough to reach the AUTHOR state, whose printed step text is the only channel wf-design
  // receives its resolved gate command through (spec Assumptions, refuter-verified).
  fs.writeFileSync(path.join(sidecar, 'skeletons.json'), JSON.stringify({
    skeletons: [{ id: 's1', decision: 'bind', bind: { component: 'Foo', from: './Foo' } }],
  }))
  return spec
}

function run(spec) {
  return spawnSync(process.execPath, [DRIVER, spec], { encoding: 'utf8' })
}

// Pulls the quoted command out of the printed `gate: {command: "..."}` template line.
function gateLine(stdout) {
  const m = /gate:\s*\{command:\s*"([^"]*)"\}/.exec(stdout)
  return m ? m[1] : null
}

test('AC-20260813-05-1: the driver drops a gate leg still carrying an unresolved {testDirs} placeholder and logs the drop', () => {
  const spec = fixture('node spec/scripts/build-workflows.js --check && node --test {testDirs}')
  const r = run(spec)
  assert.strictEqual(r.status, 0, 'AUTHOR state must not be BLOCKED: ' + r.stderr)
  const gate = gateLine(r.stdout)
  assert.strictEqual(gate, 'node spec/scripts/build-workflows.js --check',
    'the {testDirs}-carrying leg must be dropped, leaving only the surviving leg as the design gate — ' +
    'today the whole unresolved gateCommand passes through, so the design gate can never pass')
  assert.ok(!/\{[a-zA-Z]+\}/.test(gate),
    'the emitted gate command must contain no unresolved {placeholder} token')
  assert.match(r.stdout, /dropped leg \(unresolved placeholder\): node --test \{testDirs\}/,
    'the step text must log which leg was dropped and why, so the session can fix the host config')
})

test('AC-20260813-05-2: an explicit design.gateCommand config key bypasses leg-dropping entirely', () => {
  const spec = fixture(
    'node spec/scripts/build-workflows.js --check && node --test {testDirs}', // top-level: would normally drop a leg
    'npm run lint', // design.gateCommand override
  )
  const r = run(spec)
  assert.strictEqual(r.status, 0, r.stderr)
  const gate = gateLine(r.stdout)
  assert.strictEqual(gate, 'npm run lint',
    'design.gateCommand must be emitted verbatim as the gate, bypassing the top-level gateCommand ' +
    'and its leg-dropping entirely — today design.gateCommand is not read at all')
})

test('AC-20260813-05-3: a gateCommand whose every leg drops emits the literal __UNGATED__ sentinel', () => {
  const spec = fixture('vitest {testDirs}')
  const r = run(spec)
  assert.strictEqual(r.status, 0, r.stderr)
  const gate = gateLine(r.stdout)
  assert.strictEqual(gate, '__UNGATED__',
    'when every leg is dropped for an unresolved placeholder, the driver must emit the literal ' +
    'sentinel __UNGATED__ — today the raw unresolved command (still containing {testDirs}) is ' +
    'emitted instead, silently claiming a gate that can never pass')
})

test('AC-20260813-05-3: wf-design.body.js returns stage \'complete-ungated\' for an __UNGATED__/empty gate command', () => {
  const src = read('spec/workflows/src/wf-design.body.js')
  assert.match(src, /'complete-ungated'/,
    'wf-design must return a distinct stage: "complete-ungated" (never the plain "complete") when ' +
    'its gate command is the __UNGATED__ sentinel or empty, so every consumer sees the degradation ' +
    'loudly instead of a false-green "complete" on zero deterministic verification — this literal ' +
    'does not exist in the source today')
  assert.match(src, /__UNGATED__/,
    'the __UNGATED__ sentinel value must be recognized in wf-design.body.js\'s gate-command branch')
})

test('AC-20260813-05-12: the leg-splitter treats a parenthesized group as one leg and never emits a garbage fragment', () => {
  // "(cd sub && node --test {testDirs}) && npm run lint" — the parenthesized group is ONE leg
  // (its inner && must not split it) and that whole leg carries an unresolved {testDirs} token,
  // so it is dropped whole. A naive (non-parens-aware) splitter would instead cut on every &&,
  // producing three legs — "(cd sub", "node --test {testDirs})", "npm run lint" — of which the
  // syntactically-broken "(cd sub" fragment (missing its close paren) would wrongly SURVIVE
  // (it carries no placeholder) and corrupt the final gate.
  const spec = fixture('(cd sub && node --test {testDirs}) && npm run lint')
  const r = run(spec)
  assert.strictEqual(r.status, 0, r.stderr)
  const gate = gateLine(r.stdout)
  assert.strictEqual(gate, 'npm run lint',
    'the whole parenthesized leg must be dropped as one unit (it carries {testDirs}); a naive ' +
    'depth-blind splitter would instead leave a broken "(cd sub" fragment in the gate — today the ' +
    'whole raw string (still containing {testDirs}) is emitted unsplit and unresolved')
  assert.ok(!r.stdout.includes('(cd sub\n') && !/gate:\s*\{command:\s*"\(cd sub/.test(r.stdout),
    'the dropped leg must never be mis-split into the garbage fragment "(cd sub "')

  // Unbalanced parens: the whole command must pass through UNSPLIT as a single leg (never
  // mis-split on every &&). This command also carries an unresolved {testDirs} token, so the
  // single whole-command leg drops entirely -> __UNGATED__. A naive splitter ignoring the
  // unbalanced paren would instead produce a surviving placeholder-free fragment and NOT reach
  // __UNGATED__.
  const spec2 = fixture('(cd sub && npm test && npm run lint {testDirs}')
  const r2 = run(spec2)
  assert.strictEqual(r2.status, 0, r2.stderr)
  assert.strictEqual(gateLine(r2.stdout), '__UNGATED__',
    'unbalanced-paren input must pass through as one unsplit leg; since that whole leg carries an ' +
    'unresolved {testDirs} token it must drop entirely to __UNGATED__ — a naive splitter that cuts ' +
    'on every && regardless of paren balance would instead leave a surviving (wrong) fragment')
})
