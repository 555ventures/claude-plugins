'use strict'
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// build-driver family shared fixtures — split from tests/build/build-driver.test.js by
// specs/20260903/07-test-file-budget-guard.md D7 (the guard's first review run reddened that
// file at 28 tests / ~31-44s serial). No `test(` calls here. Constants and helpers moved
// verbatim from the pre-image; consumed by the three shards (build-driver.test.js,
// build-driver-repair.test.js, build-driver-commit.test.js) via module.exports.

const DRIVER = 'scripts/spec-build-driver.js'

// specs/20260928/03-the-build-reads-the-freeze.md D3/D4's test seam: a PROTO_CAPTURE_BIN stand-in
// that never touches a browser. Unlike spec 02's own capture-stub.js (which writes a canned
// capture and only ever forces a whole-capture failure), this one also answers `--diff <baseline>
// <current>` — scripted per URL via a PROTO_CAPTURE_SCRIPT JSON map file ({ "<url>": { entries }
// | { exit2 } | { exit2capture } }) — so a build-driver-lane test can dictate exactly which
// route/state pair diffs and by how much, without a real structural comparison.
const PROTO_CAPTURE_STUB_SRC = `#!/usr/bin/env node
'use strict'
const fs = require('fs')
const path = require('path')
const argv = process.argv.slice(2)
function flag(name) { const i = argv.indexOf(name); return i > -1 ? argv[i + 1] : null }
function scriptMap() {
  const p = process.env.PROTO_CAPTURE_SCRIPT
  if (!p) return {}
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return {} }
}
if (argv[0] === '--diff') {
  const currentPath = argv[2]
  let cur
  try { cur = JSON.parse(fs.readFileSync(currentPath, 'utf8')) } catch (e) {
    process.stderr.write('proto-capture-stub: cannot read current capture ' + currentPath + ': ' + e.message + '\\n')
    process.exit(2)
  }
  const rule = scriptMap()[cur.url] || {}
  if (rule.exit2) { process.stderr.write(rule.exit2 + '\\n'); process.exit(2) }
  if (rule.diffRaw) { process.stdout.write(rule.diffRaw + '\\n'); process.exit(1) }
  const entries = rule.entries || []
  const summary = {
    missing: entries.filter((e) => e.kind === 'missing').length,
    extra: entries.filter((e) => e.kind === 'extra').length,
    changed: entries.filter((e) => e.kind === 'changed').length,
  }
  process.stdout.write(JSON.stringify({ summary, entries }, null, 2) + '\\n')
  process.exit(entries.length === 0 ? 0 : 1)
}
const url = flag('--url')
const out = flag('--out')
if (!url || !out) {
  process.stderr.write('proto-capture-stub: usage error — --url/--out required\\n')
  process.exit(2)
}
const rule = scriptMap()[url] || {}
if (rule.exit2capture) { process.stderr.write(rule.exit2capture + '\\n'); process.exit(2) }
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
const asked = /^(\\d+)x(\\d+)$/.exec(flag('--viewport') || '')
const doc = { schemaVersion: 1, url, entries: [] }
if (asked) doc.viewport = { width: Number(asked[1]), height: Number(asked[2]) }
fs.writeFileSync(out, JSON.stringify(doc, null, 2) + '\\n')
process.exit(0)
`

function specBody({ status = 'hardened', tier = 'standard', design = null, diffBase = null, acId = 'AC-20260901-01-1', brief = null, lane = null }) {
  return `---
status: ${status}
tier: ${tier}
${design !== null ? `design: ${design}\n` : ''}${diffBase ? `diff_base: ${diffBase}\n` : ''}${brief !== null ? `brief: ${brief}\n` : ''}${lane !== null ? `lane: ${lane}\n` : ''}---
# Build Driver Test Spec

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | foo() computes the correct value (${acId}) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | MODIFY | scripts |
| src/bar.js | CREATE | scripts |
| other.txt | MODIFY | other |
| tests/foo.test.js | CREATE | tests |

## Acceptance Criteria

- **${acId}**: foo() returns the correct computed value.
`
}

function testFileContent(expected) {
  return `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('AC-20260901-01-1: foo() returns ${expected}', () => { assert.strictEqual(foo(), ${expected}) })
`
}

// fooValue=42: the pre-image already computes the "future correct" answer — the
// unsanctioned-green shape AC-4 needs. src/bar.js (a non-tests CREATE row) never exists at base,
// which is what drives RED_ATTRIBUTION once the test itself is made red (AC-3/4/5).
//
// specs/20260928/03-the-build-reads-the-freeze.md File Plan row: `{ lane: 'behaviour', brief,
// contract }` options, additive — every existing caller (no lane/brief) is byte-for-byte
// unaffected. `lane: 'behaviour'` also writes `docs/roadmap/<brief>-functional-prototype.md` (so
// `<stem>` derives the same way the real freeze does), `design/prototypes/<stem>/contract.json`
// plus two baseline capture files for the `/women` route (default/empty — the spec's own Contract
// example), a `prototype.url` + `runtime.bootCommand` host config block, and a PROTO_CAPTURE_BIN
// stub (+ a PROTO_CAPTURE_SCRIPT map file the caller can rewrite via `host.setCaptureScript`) so
// AC-3/AC-4 can script diffs per URL without a browser. `contract` overrides nothing yet — reserved
// for a future host needing a different route/state shape; every current test uses the default.
function makeHost({ fooValue = 42, brief = null, lane = null, contract = null } = {}) {
  const root = fs.realpathSync(tmpdir('blddrv'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  const cfg = {
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
    layerGroups: [['doctrine', 'scripts']],
    agentMap: { tests: 'plugin-tests', scripts: 'gate-scripts', other: 'general-purpose', default: 'general-purpose' },
    pipelineRules: '.claude/rules/spec-pipeline.md',
  }

  let stem = null
  let captureEnv = null
  let scriptPath = null
  if (lane === 'behaviour') {
    if (brief === null) throw new Error('makeHost({ lane: "behaviour" }) requires a brief number')
    stem = `${brief}-functional-prototype`
    cfg.prototype = { url: 'http://localhost:3000' }
    cfg.runtime.bootCommand = 'node scripts/dev-server.js'
  }

  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify(cfg))
  fs.writeFileSync(path.join(root, 'src/foo.js'), `module.exports = () => ${fooValue}\n`)
  fs.writeFileSync(path.join(root, 'other.txt'), 'pre-image other\n')

  if (lane === 'behaviour') {
    fs.mkdirSync(path.join(root, 'docs/roadmap'), { recursive: true })
    fs.writeFileSync(path.join(root, `docs/roadmap/${stem}.md`),
      'Phase: 1\nDepends on: none\n\n# Functional Prototype\n')
    const designDir = path.join(root, 'design/prototypes', stem)
    const capturesDir = path.join(designDir, 'captures')
    fs.mkdirSync(capturesDir, { recursive: true })
    const doc = contract || {
      schemaVersion: 1,
      brief: String(brief),
      stem,
      viewport: { width: 1280, height: 800 },
      composites: ['WomenList', 'WomanRow'],
      routes: {
        '/women': {
          default: { url: 'http://localhost:3000/women', capture: 'captures/women--default.json' },
          empty: { url: 'http://localhost:3000/women?proto=empty', capture: 'captures/women--empty.json' },
        },
      },
    }
    fs.writeFileSync(path.join(designDir, 'contract.json'), JSON.stringify(doc, null, 2) + '\n')
    for (const [, states] of Object.entries(doc.routes)) {
      for (const [, s] of Object.entries(states)) {
        fs.writeFileSync(path.join(designDir, s.capture),
          JSON.stringify({ schemaVersion: 1, url: s.url, entries: [] }, null, 2) + '\n')
      }
    }
    const stubPath = path.join(root, '.proto-capture-stub.js')
    fs.writeFileSync(stubPath, PROTO_CAPTURE_STUB_SRC)
    scriptPath = path.join(root, '.proto-capture-script.json')
    fs.writeFileSync(scriptPath, JSON.stringify({}))
    captureEnv = { PROTO_CAPTURE_BIN: stubPath, PROTO_CAPTURE_SCRIPT: scriptPath }
  }

  g('add', '-A'); g('commit', '-q', '-m', 'base')
  fs.mkdirSync(path.join(root, 'specs/20260901'), { recursive: true })
  const spec = path.join(root, 'specs/20260901/99-bd-test.md')
  fs.writeFileSync(spec, specBody({ brief, lane }))
  return {
    root, spec, sidecar: spec.replace(/\.md$/, '.build'), g, stem, captureEnv,
    setCaptureScript: (map) => fs.writeFileSync(scriptPath, JSON.stringify(map)),
  }
}

// A File Plan with no tests-layer rows at all (AC-12) and a flag-controlled gate.sh
// (AC-7 fail branch / AC-8) — decoupled from red-check entirely so the repair-loop cap can be
// exercised without also driving the TESTS/RED_CHECK machinery.
function makeNoTestsHost() {
  const root = fs.realpathSync(tmpdir('blddrv-notests'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  const cfg = {
    gateCommand: 'bash gate.sh',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
    layerGroups: [['doctrine', 'scripts']],
    agentMap: { scripts: 'gate-scripts', default: 'general-purpose' },
    pipelineRules: '.claude/rules/spec-pipeline.md',
  }
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify(cfg))
  fs.writeFileSync(path.join(root, 'src/only.js'), 'module.exports = 1\n')
  fs.writeFileSync(path.join(root, 'gate.sh'),
    '#!/usr/bin/env bash\nif [ -f FAIL_FLAG ]; then echo GATE_FAILED_MARKER; exit 1; else exit 0; fi\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  fs.mkdirSync(path.join(root, 'specs/20260901'), { recursive: true })
  const spec = path.join(root, 'specs/20260901/98-bd-notests.md')
  fs.writeFileSync(spec, `---
status: hardened
tier: standard
---
# Build Driver No-Tests Spec

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | src/only.js is the sole change (AC-20260901-01-12) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/only.js | MODIFY | scripts |

## Acceptance Criteria

- **AC-20260901-01-12**: src/only.js exists.
`)
  return { root, spec, sidecar: spec.replace(/\.md$/, '.build'), g }
}

function run(root, spec, ...args) {
  return runNode(DRIVER, [spec, ...args], { cwd: root })
}
const stateOf = (root, spec) => run(root, spec, '--state').stdout.trim()

function implementScriptsWave(host) {
  fs.writeFileSync(path.join(host.root, 'src/foo.js'), 'module.exports = () => 999\n')
  fs.writeFileSync(path.join(host.root, 'src/bar.js'), 'module.exports = () => 7\n')
}

// Drives a fresh host from hardened through the unsanctioned-green -> made-red -> RED_ATTRIBUTION
// sequence (AC-3/AC-4's own mechanism), asserting only the setup preconditions later tests build
// on — the AC-specific assertions for each leg live in that AC's own test.
function toRedAttribution(host) {
  const r0 = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'TESTS',
    'setup precondition: a fresh hardened host must start at TESTS before RED_ATTRIBUTION can be reached: ' + r0.stdout + r0.stderr)
  fs.writeFileSync(path.join(host.root, 'tests/foo.test.js'), testFileContent(42))
  const r1 = run(host.root, host.spec, '--mark', 'tests-authored')
  assert.strictEqual(stateOf(host.root, host.spec), 'RED_FINDINGS',
    'setup precondition: an unsanctioned-green pre-image must land RED_FINDINGS: ' + r1.stdout + r1.stderr)
  fs.writeFileSync(path.join(host.root, 'tests/foo.test.js'), testFileContent(999))
  const r2 = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'RED_ATTRIBUTION',
    'setup precondition: a red-expected file matching a File Plan with a non-tests CREATE row must land RED_ATTRIBUTION: ' + r2.stdout + r2.stderr)
}

function toFirstWave(host) {
  toRedAttribution(host)
  const r = run(host.root, host.spec, '--mark', 'red-attributed')
  assert.strictEqual(stateOf(host.root, host.spec), 'WAVE:doctrine+scripts',
    'setup precondition: a red-attributed mark with no stub residue must advance to the first wave: ' + r.stdout + r.stderr)
}

function toIntegration(host) {
  toFirstWave(host)
  implementScriptsWave(host)
  const r1 = run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '2')
  assert.strictEqual(stateOf(host.root, host.spec), 'WAVE:other',
    'setup precondition: the scripts wave must advance to the other wave: ' + r1.stdout + r1.stderr)
  const r2 = run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'other', '--workers', '1')
  assert.strictEqual(stateOf(host.root, host.spec), 'INTEGRATION',
    'setup precondition: the other wave must advance to INTEGRATION: ' + r2.stdout + r2.stderr)
}

function toCommit(host) {
  toIntegration(host)
  const r = run(host.root, host.spec, '--mark', 'integrated')
  assert.strictEqual(stateOf(host.root, host.spec), 'COMMIT',
    'setup precondition: a passing gate at INTEGRATION must land COMMIT: ' + r.stdout + r.stderr)
}

// Drives a fresh makeNoTestsHost() through the same wave -> integrated -> 3x repair-applied ->
// refused-fourth sequence as the AC-7(fail)/AC-8 test above, leaving FAIL_FLAG present so the
// gate stays red the whole way, and asserts only the ESCALATE + gate-cap setup precondition the
// re-arm legs below build on.
function toEscalateCap(host) {
  fs.writeFileSync(path.join(host.root, 'FAIL_FLAG'), '')
  host.g('add', '-A'); host.g('commit', '-q', '-m', 'fail flag')
  run(host.root, host.spec)
  run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '3')
  run(host.root, host.spec, '--mark', 'integrated')
  for (let i = 1; i <= 3; i++) {
    run(host.root, host.spec, '--mark', 'repair-applied', '--continued', '1', '--spawned', '0')
  }
  const fourth = run(host.root, host.spec, '--mark', 'repair-applied', '--continued', '1', '--spawned', '0')
  assert.strictEqual(stateOf(host.root, host.spec), 'ESCALATE',
    'setup precondition: a refused fourth repair-applied must park the run at ESCALATE before either re-arm leg runs: ' +
    fourth.stdout + fourth.stderr)
  assert.ok(fs.existsSync(path.join(host.sidecar, 'gate-cap')),
    'setup precondition: gate-cap must exist before a deletion can exercise the re-arm: ' + host.sidecar)
}

module.exports = {
  DRIVER, specBody, testFileContent, makeHost, makeNoTestsHost, run, stateOf,
  implementScriptsWave, toRedAttribution, toFirstWave, toIntegration, toCommit, toEscalateCap,
}
