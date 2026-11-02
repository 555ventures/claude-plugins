'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20261101/03-legs-read-evidence-not-exit-codes.md D1/D2: red-check applies the host's
// capabilities.testCountPattern to each leg's output; a runner that exits 0 over zero executed
// tests is `unobserved`, and a green-expected one raises the hard finding `vacuous-green`.

const PATTERN = 'ℹ tests (\\d+)'

function specMd(acLines) {
  return '# Test Spec\n\n## Acceptance Criteria\n\n' + acLines.join('\n') + '\n\n' +
    '## File Plan\n\n| Path | Action | Layer | Summary |\n|------|--------|-------|---------|\n' +
    '| tests/a.test.js | CREATE | tests | fixture |\n'
}

// A host whose `node stub.js <file>` leg prints `stubOut` and exits 0.
function newHost(prefix, stubOut, capabilities) {
  const dir = tmpdir(prefix)
  const g = gitRepo(dir)
  const base = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  const config = { testCommand: 'node stub.js' }
  if (capabilities) config.capabilities = capabilities
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify(config))
  fs.writeFileSync(path.join(dir, 'stub.js'), `console.log(${JSON.stringify(stubOut)})\n`)
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/a.test.js'), '// AC-20261101-93-1 carried\n')
  return { dir, base }
}

function runRc(dir, base, ac) {
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd([ac]))
  const res = runNode('scripts/red-check.js', ['--spec', spec, '--root', dir, '--base', base, '--json'])
  let out
  try { out = JSON.parse(res.stdout) } catch (e) {
    assert.fail(`--json output did not parse (status ${res.status}, stderr: ${res.stderr}): ${e.message}`)
  }
  return { res, out }
}

const GREEN_AC = '- **AC-20261101-93-1**: WHEN x THE SYSTEM SHALL CONTINUE TO y → tests/a.test.js'
const RED_AC = '- **AC-20261101-93-1**: WHEN x THE SYSTEM SHALL y → tests/a.test.js'

test('AC-20261101-03-1: a green-expected file whose runner exits 0 printing "ℹ tests 0" under a declared testCountPattern is observed unobserved with testsExecuted 0 and one hard vacuous-green finding, exit 1', () => {
  const { dir, base } = newHost('vg1', 'ℹ tests 0', { testCountPattern: PATTERN })
  const { res, out } = runRc(dir, base, GREEN_AC)
  assert.strictEqual(res.status, 1, `a sanctioned-green file that executed no test must exit 1 or a vacuous pin ships as proof (stderr: ${res.stderr})`)
  assert.strictEqual(out.files[0].observed, 'unobserved', `the file must read unobserved, not green — got ${JSON.stringify(out.files)}`)
  assert.strictEqual(out.files[0].testsExecuted, 0, `testsExecuted must surface the parsed count 0 — got ${JSON.stringify(out.files)}`)
  const f = out.findings.filter(x => x.class === 'vacuous-green')
  assert.strictEqual(f.length, 1, `exactly one vacuous-green finding must be raised — got ${JSON.stringify(out.findings)}`)
  assert.strictEqual(f[0].severity, 'hard', 'vacuous-green must be hard or the build driver will not stop on it')
  assert.strictEqual(f[0].path, 'tests/a.test.js', 'the finding must name the file that proved nothing')
  assert.match(f[0].detail, /executed no test/, 'the detail must say the run executed no test so the operator sees the cause')
})

test('AC-20261101-03-2: a runner output with no count line yields testsExecuted {"unavailable":"pattern-no-match"} plus vacuous-green, while "ℹ tests 1" yields observed green, testsExecuted 1 and no finding', () => {
  const a = newHost('vg2a', 'ran fine', { testCountPattern: PATTERN })
  const ra = runRc(a.dir, a.base, GREEN_AC)
  assert.deepStrictEqual(ra.out.files[0].testsExecuted, { unavailable: 'pattern-no-match' },
    `an output the pattern cannot read must be recorded as unavailable, not green-by-default — got ${JSON.stringify(ra.out.files)}`)
  assert.ok(ra.out.findings.some(x => x.class === 'vacuous-green' && x.path === 'tests/a.test.js'),
    `an unreadable count is unobserved and must raise vacuous-green (fail closed) — got ${JSON.stringify(ra.out.findings)}`)

  const b = newHost('vg2b', 'ℹ tests 1', { testCountPattern: PATTERN })
  const rb = runRc(b.dir, b.base, GREEN_AC)
  assert.strictEqual(rb.res.status, 0, `a run that executed one test must pass the gate (stderr: ${rb.res.stderr})`)
  assert.strictEqual(rb.out.files[0].observed, 'green', `executed>0 with exit 0 is green — got ${JSON.stringify(rb.out.files)}`)
  assert.strictEqual(rb.out.files[0].testsExecuted, 1, 'testsExecuted must carry the parsed count 1')
  assert.deepStrictEqual(rb.out.findings, [], `a genuinely executed green file must raise no finding — got ${JSON.stringify(rb.out.findings)}`)
})

test('AC-20261101-03-3: a RED-expected file whose runner exits 0 printing "ℹ tests 0" is observed unobserved and raises neither vacuous-green nor unsanctioned-green', () => {
  const { dir, base } = newHost('vg3', 'ℹ tests 0', { testCountPattern: PATTERN })
  const { out } = runRc(dir, base, RED_AC)
  assert.strictEqual(out.files[0].observed, 'unobserved', `nothing ran, so the file must read unobserved — got ${JSON.stringify(out.files)}`)
  assert.deepStrictEqual(out.findings.filter(x => x.path === 'tests/a.test.js'), [],
    `a red-expected file that ran nothing passed nothing; any finding on it is a false alarm — got ${JSON.stringify(out.findings)}`)
})

test('AC-20261101-03-4: without a declared testCountPattern (absent or "none") red-check keeps exit-code reading, records green with no testsExecuted key and no finding, and warns exactly once that testCountPattern is not declared', () => {
  for (const [label, caps] of [['absent', undefined], ['none', { testCountPattern: 'none' }]]) {
    const { dir, base } = newHost('vg4' + label, 'ℹ tests 0', caps)
    const { res, out } = runRc(dir, base, GREEN_AC)
    assert.strictEqual(res.status, 0, `${label}: no declared pattern means no behaviour change, exit 0 (stderr: ${res.stderr})`)
    assert.strictEqual(out.files[0].observed, 'green', `${label}: exit 0 must still read green — got ${JSON.stringify(out.files)}`)
    assert.ok(!('testsExecuted' in out.files[0]), `${label}: testsExecuted must be omitted when nothing was parsed — got ${JSON.stringify(out.files)}`)
    assert.deepStrictEqual(out.findings, [], `${label}: no finding without a pattern — got ${JSON.stringify(out.findings)}`)
    const w = out.warnings.filter(x => /testCountPattern is not declared/.test(x))
    assert.strictEqual(w.length, 1, `${label}: the blind-spot warning must appear exactly once per run or the operator never learns red-check is exit-code-only — got ${JSON.stringify(out.warnings)}`)
  }
})
