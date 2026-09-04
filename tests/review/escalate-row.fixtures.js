'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runNode, runBash, gitRepo } = require('../helpers')

// escalate-row family shared fixtures — split from escalate-row.test.js by
// specs/20260903/06-test-suite-critical-path.md D2. Provenance carried over from the pre-image
// header: specs/20260822/01-escalate-ledger-row.md pins verdict.js's --escalated flag and the
// driver's writeEscalateRow() write point. Consumed by shards G/H via module.exports.

// specs/20260822/01-escalate-ledger-row.md: a review that burns its fix loop to the
// cap (2 iterations) and is then abandoned writes ZERO ledger rows today — the driver's only two
// append points are the GATE_RED hard-stop and the CLEAN close, and the ESCALATE refusal reaches
// neither. This file pins verdict.js's new `--escalated` flag (D1-D4: no new verdict word, the
// escalation fact is a typed `escalated:true` row field, refused with --fixDispatched>0/--profile
// release before file I/O, refused when derivation reaches CLEAN — evidence drift) and the
// driver's `writeEscalateRow()` write point (D5-D10: the durable path, idempotency, self-heal,
// loud-row-less-retryable drift handling, the ESCALATE step's remedy block, the silent-loss
// detector). Every test here fails against current code: verdict.js rejects `--escalated` as an
// unknown flag (usage, exit 2, spike A3) and the driver has no escalate-row mechanism at all.
// AC-20260822-01-1 .. -9, -12, -13.
//
// AC-20260901-08-9 (tagged, no assertion change, specs/20260901/08-corpus-derivation-and-kill-
// match.md D8): `reviewerReturn()` below carries `killed: []` alongside a `survivors` array, and
// every `--mark reviewer-returned` call in this file (directly and via `driveToCapEdge()`) feeds
// that exact shape through the driver and depends on it landing FIX/DISPOSITIONS successfully —
// D8's new killed[] shape validation must CONTINUE TO accept an empty killed array exactly as it
// does today, or every escalation test below would break on its own setup before ever reaching
// the escalate-row behavior it actually pins.

const VERDICT = 'scripts/verdict.js'

const DRIVER = 'scripts/spec-review-driver.js'

const STOPPED_LEDGER_REL = '.claude/spec-runs.stopped.jsonl'

const GREEN_TEST = `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('AC-20260822-99-1: foo() returns 42', () => { assert.strictEqual(foo(), 42) })
`

function specBody(diffBase) {
  return `---
status: implementing
tier: standard
diff_base: ${diffBase}
---
# Escalate Row Test Spec

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | foo() returns 42 (AC-20260822-99-1) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | edit | scripts |
| tests/foo.test.js | create | tests |

## Acceptance Criteria

- **AC-20260822-99-1**: foo() returns 42.
`
}

function run(root, spec, ...args) {
  return runNode(DRIVER, [spec, ...args], { cwd: root })
}

const stateOf = (root, spec) => run(root, spec, '--state').stdout.trim()

function returnFileWith(scratchName, body) {
  const scratch = fs.realpathSync(tmpdir(scratchName))
  const file = path.join(scratch, 'return.json')
  fs.writeFileSync(file, JSON.stringify(body))
  return file
}

// specs/20260901/09-disposer-gate.md D2/AC-20260901-09-2 (brief 18b): --mark
// dispositions on a non-empty pool now refuses without --file <disposer return> — every fix-cycle
// setup below that dispatches a fix must first write a minimal valid disposer return covering
// every ref in that pool exactly once (here: always a single "fix" recommendation, since these
// fixtures only ever carry one survivor or one injected leg finding) and pass --file <path>.
function oneFixReturnFile(scratchName, ref) {
  return returnFileWith(scratchName, {
    verdict: 'DISPOSED',
    dispositions: [{ ref, recommended: 'fix', reason: 'D3 of specs/20260901/09-disposer-gate.md: fix is the conservative disposition' }],
    tokens: 1,
  })
}

// One soft survivor, scope fix-delta throughout (sidesteps the reconcile/at-risk required-legs
// filter entirely — those two legs are excluded from fix-delta's required set, and a fix-delta
// manifest never emits rows for them, so declaring this scope keeps every cycle's dispositions
// pass a clean, uncomplicated pool of exactly 1).
// AC-20260901-08-9 (tagged): killed: [] here, riding with a non-empty survivors array, is the
// exact shape D8's new validation must SHALL CONTINUE TO accept for the reviewer-returned mark —
// every test below that calls driveToCapEdge() (or marks reviewer-returned directly) depends on
// this acceptance holding.
function reviewerReturn() {
  return {
    verdict: 'CLEAN',
    survivors: [{ severity: 'soft', claim: 'x', file: 'src/foo.js', line: 1, impact: 'x', evidence: 'x' }],
    killed: [], reviewerCount: 1, scope: 'fix-delta', tokens: 10,
  }
}

const readJsonl = (file) =>
  fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []

function readSidecar(sidecarDir) {
  return JSON.parse(fs.readFileSync(path.join(sidecarDir, 'review-state.json'), 'utf8'))
}

// Appends a NEW line for `leg` — verdict.js's manifest parser is last-line-wins per leg key
// (a Map keyed on leg name, populated in file order), so this overrides whatever review-legs.js
// itself wrote for that leg without touching the rest of the manifest.
function overrideLeg(manifestPath, leg, exit, observed) {
  fs.appendFileSync(manifestPath, JSON.stringify({ leg, exit, observed }) + '\n')
}

function makeHost(name) {
  const root = fs.realpathSync(tmpdir(name))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const diffBase = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(root, 'specs/20260822'), { recursive: true })
  const specRel = `specs/20260822/${name}.md`
  const spec = path.join(root, specRel)
  fs.writeFileSync(spec, specBody(diffBase))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST)
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { root, spec, specRel, sidecar: spec.replace(/\.md$/, '.review') }
}

function makeWorktreeHost({ name, ignoreStopped }) {
  const root = fs.realpathSync(tmpdir(name + '-root'))
  const g = gitRepo(root)
  if (ignoreStopped) {
    fs.appendFileSync(path.join(root, '.gitignore'), STOPPED_LEDGER_REL + '\n')
    g('add', '.gitignore'); g('commit', '-q', '-m', 'ignore stopped ledger')
  }
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const baseSha = g('rev-parse', 'HEAD').trim()

  const created = runBash('scripts/merge-back.sh', ['create', '--source', 'spec/' + name, '--root', root])
  assert.strictEqual(created.status, 0, 'setup: worktree creation must succeed: ' + created.stderr)
  const wt = created.stdout.trim().split('\n').pop()

  const specRel = `specs/20260822/${name}.md`
  fs.mkdirSync(path.join(wt, 'specs/20260822'), { recursive: true })
  const spec = path.join(wt, specRel)
  fs.writeFileSync(spec, specBody(baseSha).replace('diff_base:', 'build_base:'))
  fs.writeFileSync(path.join(wt, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.mkdirSync(path.join(wt, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(wt, 'tests/foo.test.js'), GREEN_TEST)
  const gw = (...a) => execFileSync('git', ['-C', wt, ...a], { encoding: 'utf8' })
  gw('add', '-A'); gw('commit', '-q', '-m', 'implement')
  return { root, wt, spec, specRel, sidecar: spec.replace(/\.md$/, '.review') }
}

// Drives an in-place or worktree host through 2 full fix cycles plus a third reviewer-returned +
// dispositions --fix-dispatched 1, landing state FIX poised for the CAPPING (3rd) fix-applied —
// mirrors AC-20260820-07-8's own cap-approach idiom, generalized so every AC below can supply its
// own final fix-applied call (or hand-edit the sidecar instead, for the self-heal AC).
function driveToCapEdge(root, spec) {
  const r0 = run(root, spec)
  assert.strictEqual(stateOf(root, spec), 'REVIEWER',
    'setup precondition: a fresh green-legs fixture must reach REVIEWER before the fix cap can be exercised: ' + r0.stdout + r0.stderr)
  for (let cycle = 1; cycle <= 2; cycle++) {
    const rf = returnFileWith('esc-drive-' + cycle, reviewerReturn())
    run(root, spec, '--mark', 'reviewer-returned', '--file', rf)
    // AC-20260901-09-2: reviewerReturn()'s single survivor is the whole pool (s0) — cover it with
    // a minimal "fix" disposer return before --mark dispositions --fix-dispatched 1 is accepted.
    const dispFile = oneFixReturnFile('esc-drive-disp-' + cycle, 's0')
    const d = run(root, spec, '--mark', 'dispositions', '--file', dispFile, '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
    assert.strictEqual(stateOf(root, spec), 'FIX',
      `setup cycle ${cycle}: fix-dispatched 1 (within the 1-survivor pool) must land FIX: ` + d.stdout + d.stderr)
    const f = run(root, spec, '--mark', 'fix-applied')
    assert.strictEqual(f.status, 0, `setup cycle ${cycle}: fix-applied within the cap must succeed: ` + f.stdout + f.stderr)
  }
  const rf3 = returnFileWith('esc-drive-3', reviewerReturn())
  run(root, spec, '--mark', 'reviewer-returned', '--file', rf3)
  const dispFile3 = oneFixReturnFile('esc-drive-disp-3', 's0')
  const d3 = run(root, spec, '--mark', 'dispositions', '--file', dispFile3, '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
  assert.strictEqual(stateOf(root, spec), 'FIX',
    'setup: the third dispositions --fix-dispatched 1 must land FIX, poised for the capping fix-applied: ' + d3.stdout + d3.stderr)
}

module.exports = { VERDICT, DRIVER, STOPPED_LEDGER_REL, GREEN_TEST, specBody, run, stateOf, returnFileWith, oneFixReturnFile, reviewerReturn, readJsonl, readSidecar, overrideLeg, makeHost, makeWorktreeHost, driveToCapEdge }
