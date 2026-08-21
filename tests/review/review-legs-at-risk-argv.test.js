'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// Escape, 2026-08-20 (found while reviewing host spec upwell/specs/20260820/02-sandbox-safety-
// activation.md): the at-risk leg never ran a single at-risk test since its mechanization.
//
// scope-reconcile.js has emitted `atRisk` as {file, refs} OBJECTS since the field was introduced
// (specs/20260815/02-at-risk-pins.md D1) — the `refs` provenance is load-bearing and the schema is
// correct. When v7 (4817a9d, 2026-08-17) transcribed /spec:review's hand-performed Phase 0 into
// review-legs.js, the at-risk consumer was written as `atRisk.map(q)`, which quotes String(object).
// The leg therefore invoked `<testCommand> '[object Object]' '[object Object]'` — and `node --test`
// treats an argument matching no test files as zero tests, exit 0. So the leg recorded `files=N`
// as a VACUOUS GREEN (observed in 36c2f14's review evidence: files=11 exit=0, runner printed
// "pass 0" — an observation the leg discarded). Two things made it survive: the adjacent patterns
// consumer four lines below handles the object form correctly (`typeof f === 'string' ? f :
// f.file || ''`), so the schema looked consumed; and a green row draws no eyes — nothing
// distinguishes "N files passed" from "N garbage paths matched nothing".
//
// This is the authored-but-never-executed class: a check that reports a number without looking.
// Before v7 the step was performed by the session, which plausibly read `.file` correctly, so the
// mechanically-guaranteed-dead window is v7 onward — earlier runs are unverified, not exonerated.
//
// The fix has three parts and this file pins all three:
//   (a) extract `.file`, so the runner receives real repo-relative paths;
//   (b) fail closed on a malformed entry — a schema drift must be legible, never silent garbage;
//   (c) write the runner output to `at-risk.txt`, because the leg's founding contract defines its
//       finding as "{failing files/digest, session-extracted from runner output}" — discarding the
//       output makes the finding the leg exists to produce unproducible.

const SCRIPT = 'scripts/review-legs.js'

// The File Plan covers src/foo.js and tests/foo.test.js. `tests/atrisk.test.js` is deliberately
// absent from it while referencing the `foo` stem, which is what puts it in scope-reconcile's
// atRisk set (a test file outside the plan that references a changed in-plan file).
const SPEC_BODY = `---
status: implementing
tier: standard
---
# At-risk argv fixture

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | foo() returns 42 (AC-20260820-99-1) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | edit | scripts |
| tests/foo.test.js | create | tests |

## Acceptance Criteria

- **AC-20260820-99-1**: foo() returns 42.
`

const GREEN_TEST = `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('AC-20260820-99-1: foo() returns 42', () => { assert.strictEqual(foo(), 42) })
`

// Not in the File Plan, references the `foo` stem → lands in atRisk.
const AT_RISK_TEST = `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('sibling coverage of foo', () => { assert.strictEqual(typeof foo, 'function') })
`

// A recorder standing in for the host's real testCommand: it appends its argv, one path per line,
// to a file outside the fixture repo, then exits with the code the fixture asked for. Recording
// argv is the whole point — the defect was invisible to any assertion that only read exit codes.
function makeHost({ exitCode = 0 } = {}) {
  const dir = tmpdir('review-legs-at-risk')
  const argvLog = path.join(tmpdir('review-legs-at-risk-log'), 'argv.txt')
  const g = gitRepo(dir)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'bin/recorder.js'),
    'const fs = require("fs")\n' +
    `fs.appendFileSync(${JSON.stringify(argvLog)}, process.argv.slice(2).join("\\n") + "\\n")\n` +
    'process.stdout.write("recorder saw: " + process.argv.slice(2).join(" ") + "\\n")\n' +
    `process.exit(${exitCode})\n`)
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: `node ${JSON.stringify(path.join(dir, 'bin/recorder.js'))}`,
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'ℹ skipped (\\d+)' },
  }))
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 41\n')
  // The at-risk file must predate the diff and stay untouched by it: scope-reconcile skips any
  // candidate that is itself in the changed set (`changed.has(candidate)`), because a test the
  // spec edited is already covered by the ordinary gate. "At risk" means a test nobody in this
  // spec looked at, which reads a file this spec changed.
  fs.writeFileSync(path.join(dir, 'tests/atrisk.test.js'), AT_RISK_TEST)
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(dir, 'specs/20260820'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260820/99-test.md'), SPEC_BODY)
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), GREEN_TEST)
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { dir, base, argvLog }
}

function run(dir, base) {
  const manifest = path.join(tmpdir('review-legs-at-risk-out'), 'manifest.jsonl')
  const outDir = tmpdir('review-legs-at-risk-outdir')
  const r = runNode(SCRIPT, ['--root', dir, '--spec', 'specs/20260820/99-test.md',
    '--base', base, '--manifest', manifest, '--out-dir', outDir])
  const rows = fs.existsSync(manifest)
    ? fs.readFileSync(manifest, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
    : []
  return { r, byLeg: new Map(rows.map(x => [x.leg, x])), outDir }
}

test('the at-risk leg passes real repo-relative paths to the host testCommand — never "[object Object]"', () => {
  const { dir, base, argvLog } = makeHost()
  const { r, byLeg } = run(dir, base)

  assert.ok(fs.existsSync(argvLog),
    'the host testCommand was never invoked at all — scope-reconcile must classify tests/atrisk.test.js ' +
    'as at-risk (a test file outside the File Plan referencing the changed src/foo.js), and the leg must ' +
    'then run the testCommand against it: ' + r.stdout + r.stderr)
  const argv = fs.readFileSync(argvLog, 'utf8').split('\n').filter(Boolean)

  assert.ok(!argv.some(a => a.includes('[object Object]')),
    'REGRESSION: the leg stringified scope-reconcile\'s {file, refs} entries instead of extracting .file, ' +
    'so the runner received "[object Object]" and executed nothing while the manifest reported files=N. ' +
    'This is the defect that made the at-risk leg dead from v7 (4817a9d) onward. argv was: ' +
    JSON.stringify(argv))
  assert.deepStrictEqual(argv, ['tests/atrisk.test.js'],
    'the leg must hand the runner exactly the at-risk file\'s repo-relative path, so a host testCommand ' +
    'can route and execute it: ' + JSON.stringify(argv))

  assert.strictEqual(byLeg.get('at-risk').exit, 0,
    'the recorder exits 0, so the leg row must be green — a nonzero exit here means the leg failed for a ' +
    'reason other than the tests it was asked to run: ' + JSON.stringify(byLeg.get('at-risk')))
  assert.strictEqual(byLeg.get('at-risk').observed, 'files=1',
    'the observed string counts the at-risk files: ' + JSON.stringify(byLeg.get('at-risk')))
})

test('the at-risk leg saves the runner output to at-risk.txt, so its red finding is diagnosable', () => {
  const { dir, base } = makeHost({ exitCode: 1 })
  const { r, byLeg, outDir } = run(dir, base)

  assert.strictEqual(byLeg.get('at-risk').exit, 1,
    'a failing runner must surface as a red at-risk row: ' + JSON.stringify(byLeg.get('at-risk')))

  const atRiskTxt = path.join(outDir, 'at-risk.txt')
  assert.ok(fs.existsSync(atRiskTxt),
    'the leg\'s founding contract defines its finding as "{failing files/digest, session-extracted from ' +
    'runner output}" — with the output discarded, the reviewer has a bare exit code and cannot produce ' +
    'that finding at all. Every other finding-bearing leg (gate, patterns, ac-matrix, promise-sweep) ' +
    'writes an output file; at-risk must too. outDir held: ' + fs.readdirSync(outDir).join(', '))
  const body = fs.readFileSync(atRiskTxt, 'utf8')
  assert.match(body, /tests\/atrisk\.test\.js/,
    'at-risk.txt must name the file(s) the runner was given, so the red is attributable: ' + body)
  assert.match(body, /recorder saw:/,
    'at-risk.txt must carry the runner\'s own stdout/stderr, not just the command line: ' + body)

  assert.match(r.stdout, /at-risk\.txt/,
    'the outputs summary line must advertise at-risk.txt alongside the other leg outputs, or the reviewer ' +
    'never learns it exists: ' + r.stdout)
})

test('a malformed atRisk entry fails the leg closed rather than shipping garbage to the runner', () => {
  // The schema is correct today, so the fail-closed branch can only be exercised by the shape a
  // future drift would produce. Drive it BEHAVIORALLY: copy spec/scripts into a tmpdir and replace
  // scope-reconcile.js with a stub emitting a fileless entry — the copied review-legs.js runs its
  // real consumer against the drifted schema, end to end.
  const { dir, base, argvLog } = makeHost()
  const scriptsCopy = tmpdir('review-legs-at-risk-scripts')
  fs.cpSync(path.join(__dirname, '../../spec/scripts'), scriptsCopy, { recursive: true })
  fs.writeFileSync(path.join(scriptsCopy, 'scope-reconcile.js'),
    'console.log(JSON.stringify({ outOfPlan: [], unrealized: [], excluded: [], renamed: [],' +
    ' atRisk: [{ refs: ["src/foo.js"] }] }, null, 2))\nprocess.exit(0)\n')

  const manifest = path.join(tmpdir('review-legs-at-risk-out'), 'manifest.jsonl')
  const outDir = tmpdir('review-legs-at-risk-outdir')
  runNode(path.relative(path.join(__dirname, '../../spec'), path.join(scriptsCopy, 'review-legs.js')),
    ['--root', dir, '--spec', 'specs/20260820/99-test.md', '--base', base, '--manifest', manifest, '--out-dir', outDir])
  const rows = fs.readFileSync(manifest, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
  const atRiskRow = rows.find(x => x.leg === 'at-risk')

  assert.ok(!fs.existsSync(argvLog),
    'the runner must never be invoked over entries with no usable path — a schema drift silently ' +
    'degrading to "[object Object]" argv is the exact failure this file exists to prevent, and most ' +
    'hosts hand paths straight to a runner that greens over zero matches: ' +
    (fs.existsSync(argvLog) ? fs.readFileSync(argvLog, 'utf8') : ''))
  assert.strictEqual(atRiskRow && atRiskRow.exit, 1,
    'a malformed entry must surface as a red at-risk row, never a green count: ' + JSON.stringify(atRiskRow))
  assert.match((atRiskRow && atRiskRow.observed) || '', /malformed atRisk entry \(1\/1\)/,
    'the observed string must say the entries were malformed rather than reporting files=N — a count ' +
    'over entries the runner never received is the same lie in a new shape: ' + JSON.stringify(atRiskRow))
  assert.match(fs.readFileSync(path.join(outDir, 'at-risk.txt'), 'utf8'), /malformed atRisk entries/,
    'at-risk.txt must carry the rejected entries so the schema drift is diagnosable from evidence')
})

test('a reused --out-dir never advertises a stale at-risk.txt from a prior run', () => {
  // --fix-delta skips the at-risk leg entirely; reusing the out-dir of a full run plants a stale
  // at-risk.txt there. An existence probe on the summary line would advertise the prior run's file
  // as this run's evidence — only a written-this-run signal is honest.
  const { dir, base } = makeHost()
  const outDir = tmpdir('review-legs-at-risk-outdir')
  const manifest1 = path.join(tmpdir('review-legs-at-risk-out'), 'manifest.jsonl')
  const first = runNode(SCRIPT, ['--root', dir, '--spec', 'specs/20260820/99-test.md',
    '--base', base, '--manifest', manifest1, '--out-dir', outDir])
  assert.match(first.stdout, /at-risk\.txt/,
    'precondition: the full run must write and advertise at-risk.txt, or this test plants nothing: ' + first.stdout)

  const manifest2 = path.join(tmpdir('review-legs-at-risk-out'), 'manifest.jsonl')
  const second = runNode(SCRIPT, ['--root', dir, '--spec', 'specs/20260820/99-test.md',
    '--base', base, '--manifest', manifest2, '--out-dir', outDir, '--fix-delta'])
  assert.ok(fs.existsSync(path.join(outDir, 'at-risk.txt')),
    'precondition: the stale file from the first run must still be present for the probe to be tempted by')
  assert.ok(!/at-risk\.txt/.test(second.stdout),
    'the summary must list only outputs THIS run produced — advertising the prior run\'s at-risk.txt ' +
    'presents stale evidence as current: ' + second.stdout)
})
