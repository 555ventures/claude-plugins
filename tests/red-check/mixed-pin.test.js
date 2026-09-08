'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// Pins: specs/20260907/01-mixed-pin-guard-and-drift-line.md D1/D2,
// AC-20260907-01-1, AC-20260907-01-2, AC-20260907-01-3. `pinShape`/`normalizeForPinCheck` do not
// exist yet in spec/scripts/lib/spec-sections.js, and red-check.js does not yet refuse a mixed
// carried AC — every test below is TDD red against a synthetic host in tmpdir(), executed via
// runNode (mirrors tests/red-check/red-check.test.js's idiom).

function specMd(acLines, filePlanRows) {
  return '# Test Spec\n\n## Acceptance Criteria\n\n' + acLines.join('\n') + '\n\n' +
    '## File Plan\n\n| Path | Action | Layer | Summary |\n|------|--------|-------|---------|\n' +
    filePlanRows.join('\n') + '\n'
}

function writeConfig(dir, config) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify(config))
}

// A synthetic host: a real git repo (so --base always resolves) with a plain `node --test`
// testCommand declared, matching tests/red-check/red-check.test.js's newHost().
function newHost(prefix, config = { testCommand: 'node --test' }) {
  const dir = tmpdir(prefix)
  const g = gitRepo(dir)
  const base = g('rev-parse', 'HEAD').trim()
  if (config) writeConfig(dir, config)
  return { dir, base }
}

function run(specPath, root, base, extraArgs = []) {
  return runNode('scripts/red-check.js', ['--spec', specPath, '--root', root, '--base', base, ...extraArgs])
}

function findings(res) {
  let parsed
  try { parsed = JSON.parse(res.stdout) } catch (e) {
    assert.fail(`--json output did not parse as JSON (status ${res.status}, stderr: ${res.stderr}): ${e.message}`)
  }
  return parsed
}

function greenTest(acId) {
  return "'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    `test('${acId}: vacuously true, no implementation required', () => { assert.ok(true) })\n`
}

test('AC-20260907-01-1: a carried AC bullet mixing a new-promise SHALL with a SHALL CONTINUE TO clause is refused with a single mixed-pin finding, exit 1, and never reported unsanctioned-green', () => {
  const { dir, base } = newHost('mp1')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/x1.test.js'), greenTest('AC-20260907-99-1'))
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260907-99-1**: WHEN x runs THE SYSTEM SHALL print the new banner; WHEN y runs THE ' +
      'SYSTEM SHALL CONTINUE TO exit 0 → tests/x1.test.js'],
    ['| tests/x1.test.js | CREATE | tests | mixed bullet: a new promise plus a SHALL CONTINUE TO clause |']))
  const res = run(spec, dir, base, ['--json'])
  assert.strictEqual(res.status, 1,
    `a mixed carried AC must refuse the build with a hard finding, exit 1 — today's red-check ` +
    `treats any bullet containing the phrase SHALL CONTINUE TO as fully sanctioned, letting the ` +
    `banner promise ship untested at exit 0 (stdout: ${res.stdout} stderr: ${res.stderr})`)
  const out = findings(res)
  assert.strictEqual(out.findings.length, 1,
    `exactly one finding is expected for tests/x1.test.js — a second finding would mean the mixed ` +
    `bullet was ALSO scored for its (guessed) colour, the exact harm D2 exists to prevent: ` +
    JSON.stringify(out.findings))
  const [f] = out.findings
  assert.strictEqual(f.severity, 'hard', `a mixed-pin finding must be severity 'hard' — got ${JSON.stringify(f)}`)
  assert.strictEqual(f.class, 'mixed-pin', `the finding class must be exactly 'mixed-pin' — got ${JSON.stringify(f)}`)
  assert.strictEqual(f.path, 'tests/x1.test.js', `the finding must name the carrying file — got ${JSON.stringify(f)}`)
  assert.deepStrictEqual(f.acs, ['AC-20260907-99-1'],
    `the finding must list every mixed AC-ID carried by the file — got ${JSON.stringify(f.acs)}`)
  assert.ok(f.detail.includes('split the SHALL CONTINUE TO clause into its own AC'),
    `the detail must name the split remedy so a build session knows exactly what to do next — got ${JSON.stringify(f.detail)}`)
  assert.ok(!out.findings.some(x => x.class === 'unsanctioned-green'),
    `no unsanctioned-green finding may accompany a mixed-pin finding for the same file — mixed-pin ` +
    `REPLACES the colour classification entirely, it does not stack with it: ${JSON.stringify(out.findings)}`)
})

test('AC-20260907-01-2: a genuine two-clause pin bullet (every SHALL is SHALL CONTINUE TO) with a green file exits 0 with no finding, while a bullet quoting the phrase only inside a code span with a green file still reports unsanctioned-green, never mixed-pin', () => {
  const { dir, base } = newHost('mp2')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/pin.test.js'), greenTest('AC-20260907-99-2'))
  fs.writeFileSync(path.join(dir, 'tests/quoted.test.js'), greenTest('AC-20260907-99-3'))
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260907-99-2**: WHEN y runs THE SYSTEM SHALL CONTINUE TO exit 0 and SHALL CONTINUE TO ' +
      'print usage → tests/pin.test.js',
      '- **AC-20260907-99-3**: WHEN x runs THE SYSTEM SHALL emit the literal `SHALL CONTINUE TO` in ' +
      'its output → tests/quoted.test.js'],
    ['| tests/pin.test.js | CREATE | tests | a pure two-clause pin, every SHALL is SHALL CONTINUE TO |',
      '| tests/quoted.test.js | CREATE | tests | the phrase appears only inside a backticked code span |']))
  const res = run(spec, dir, base, ['--json'])
  assert.strictEqual(res.status, 1,
    `tests/quoted.test.js's promise-shaped AC (the quoted phrase is stripped by normalizeForPinCheck ` +
    `before counting, so it is a promise, not a pin) must still trip a finding — a run reporting 0 ` +
    `findings here means the code-span AC was accidentally sanctioned (stdout: ${res.stdout} stderr: ${res.stderr})`)
  const out = findings(res)
  assert.strictEqual(out.findings.length, 1,
    `exactly one finding is expected — the pure two-clause pin (tests/pin.test.js) must contribute none: ` +
    JSON.stringify(out.findings))
  const [f] = out.findings
  assert.strictEqual(f.path, 'tests/quoted.test.js',
    `the sole finding must be for tests/quoted.test.js — tests/pin.test.js's bullet is a genuine pin ` +
    `(both clauses are SHALL CONTINUE TO) and must never be flagged: ${JSON.stringify(out.findings)}`)
  assert.strictEqual(f.class, 'unsanctioned-green',
    `a code-span-only mention of the phrase is not a declared pin (normalizeForPinCheck strips the ` +
    `backticked span before pinShape counts SHALLs) — this must classify as the ordinary ` +
    `unsanctioned-green finding, never mixed-pin: ${JSON.stringify(f)}`)
  assert.ok(f.acs.includes('AC-20260907-99-3'),
    `the unsanctioned-green finding must name AC-20260907-99-3 — got ${JSON.stringify(f.acs)}`)
})

test('AC-20260907-01-3: pinShape classifies the seven Contracts worked examples in order, normalizeForPinCheck strips a code span and collapses hard-wrapped whitespace to one space, and red-check.js\'s own source carries no local normalizeForPinCheck function', () => {
  const { pinShape, normalizeForPinCheck } = require('../../spec/scripts/lib/spec-sections')
  const inputs = [
    'WHEN a THE SYSTEM SHALL b',
    'WHEN a THE SYSTEM SHALL CONTINUE TO b',
    'WHEN a THE SYSTEM SHALL b; WHEN c THE SYSTEM SHALL CONTINUE TO d',
    'WHEN a THE SYSTEM SHALL CONTINUE TO b and SHALL CONTINUE TO c',
    'WHEN a THE SYSTEM SHALL\n  CONTINUE TO b',
    'WHEN a THE SYSTEM SHALL emit the literal `SHALL CONTINUE TO`',
    'WHEN a THE SYSTEM SHALL NOT b and SHALL CONTINUE TO c',
  ]
  const expected = ['promise', 'pin', 'mixed', 'pin', 'pin', 'promise', 'mixed']
  const actual = inputs.map((raw) => pinShape(raw))
  assert.deepStrictEqual(actual, expected,
    `pinShape must classify the spec's own seven Contracts examples, in order, as ${JSON.stringify(expected)} ` +
    `— D1's rule is "shalls === pins -> pin, pins === 0 -> promise, else mixed" over ` +
    `normalizeForPinCheck(raw); a divergence here means the shipped predicate disagrees with its own ` +
    `spec: got ${JSON.stringify(actual)}`)

  assert.strictEqual(normalizeForPinCheck('a  `x`\n b'), 'a b',
    `normalizeForPinCheck must strip an inline code span to a single space, then collapse the ` +
    `resulting whitespace run (the newline included) down to one space and trim — got ` +
    `${JSON.stringify(normalizeForPinCheck('a  \`x\`\n b'))}`)

  const redCheckSrc = fs.readFileSync(path.join(__dirname, '../../spec/scripts/red-check.js'), 'utf8')
  assert.doesNotMatch(redCheckSrc, /function normalizeForPinCheck/,
    `red-check.js must import normalizeForPinCheck from lib/spec-sections.js and delete its own local ` +
    `copy (D1: "red-check.js and ac-drift.js import it and drop their local copies") — a surviving ` +
    `local function definition means the two-copies duplication D1 exists to remove is still live`)
})
