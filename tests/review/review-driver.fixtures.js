'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// review-driver family shared fixtures — split from review-driver.test.js by
// specs/20260903/06-test-suite-critical-path.md D2. Provenance carried over from the pre-image
// header: specs/20260820/07-review-driver.md (brief 16) drives spec-review-driver.js end-to-end
// against synthetic git hosts (tmpdir() + gitRepo(), runNode with cwd), never poking at internals;
// specs/20260823/03-silent-drop-hardening.md D4/AC-20260823-03-11 (rv_e83659d49386) is the reason
// specBody threads diff_base/tier verbatim. Consumed by shards A-F via module.exports.

// specs/20260820/07-review-driver.md (brief 16): the review stage's ~14 hand-performed
// choreography steps (base derivation, manifest lifecycle, both verdict passes, ledger
// appends, the status flip, merge-back) move into spec-review-driver.js on the
// driver-stepped contract this spec locks — a session that only follows printed steps
// cannot skip or hand-compose any of them. These tests drive the real binary end-to-end
// against synthetic git hosts (tmpdir() + gitRepo(), runNode with cwd), never poke at
// internals. AC-20260820-07-1 … -12 below.
//
// specs/20260823/03-silent-drop-hardening.md D4/AC-20260823-03-11 (rv_e83659d49386): this
// driver's local `fmVal` (line 152) propagates everything after `tier:` verbatim, including
// an inline `#` comment — the exact mechanism that polluted seven live review ledger rows'
// `tier` fields. D4 replaces the local copy with the shared lib/frontmatter.js.

const DRIVER = 'scripts/spec-review-driver.js'

const GREEN_TEST = `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('AC-20260820-99-1: foo() returns 42', () => { assert.strictEqual(foo(), 42) })
`

function specBody({ status = 'implementing', tier = 'standard', diffBase, acId = 'AC-20260820-99-1', area = null, canonicalDelta = null }) {
  return `---
status: ${status}
tier: ${tier}
diff_base: ${diffBase}${area ? `\narea: ${area}` : ''}
---
# Driver Test Spec

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | foo() returns 42 (${acId}) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | edit | scripts |
| tests/foo.test.js | create | tests |

## Acceptance Criteria

- **${acId}**: foo() returns 42.
${canonicalDelta === null ? '' : `
## Canonical Delta

${canonicalDelta}
`}`
}

// gotchas: when a number, the host declares pipelineRules and ships a rules file holding that
// many Gotchas entries BEFORE the diff base (so reconcile never sees it as out-of-plan).
function makeHost({ gateFails = false, specOpts = {}, gotchas = null } = {}) {
  const root = fs.realpathSync(tmpdir('rvdrv'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  const cfg = {
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }
  if (gotchas !== null) {
    cfg.pipelineRules = '.claude/rules/spec-pipeline.md'
    rulesWithGotchas(root, gotchas)
  }
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify(cfg))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const diffBase = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(root, 'specs/20260820'), { recursive: true })
  const spec = path.join(root, 'specs/20260820/99-drv-test.md')
  fs.writeFileSync(spec, specBody({ diffBase, ...specOpts }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), gateFails ? 'module.exports = () => 0\n' : 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST)
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { root, spec, sidecar: spec.replace(/\.md$/, '.review') }
}

function run(root, spec, ...args) {
  return runNode(DRIVER, [spec, ...args], { cwd: root })
}

const stateOf = (root, spec) => run(root, spec, '--state').stdout.trim()

function toReviewer(host) {
  const r = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'setup precondition: a fresh green-legs fixture must reach REVIEWER before this AC can be exercised: ' + r.stdout + r.stderr)
  return r
}

function returnFileWith(scratchName, body) {
  const scratch = fs.realpathSync(tmpdir(scratchName))
  const file = path.join(scratch, 'return.json')
  fs.writeFileSync(file, JSON.stringify(body))
  return file
}

// specs/20260901/09-disposer-gate.md D2/AC-20260901-09-2 (brief 18b): --mark
// dispositions on a non-empty pool now refuses without --file <disposer return> — every fixture
// below that dispatches a fix must first write a minimal valid disposer return covering every
// ref in that pool exactly once and pass --file <path>.
function oneFixReturnFile(scratchName, ref) {
  return returnFileWith(scratchName, {
    verdict: 'DISPOSED',
    dispositions: [{ ref, recommended: 'fix', reason: 'D3 of specs/20260901/09-disposer-gate.md: fix is the conservative disposition' }],
    tokens: 1,
  })
}

const CLEAN_RETURN = { verdict: 'CLEAN', survivors: [], killed: [], reviewerCount: 1, scope: 'full', tokens: 10 }

const SURVIVOR_RETURN = {
  verdict: 'CLEAN',
  survivors: [{ severity: 'soft', claim: 'x', file: 'src/foo.js', line: 1, impact: 'x', evidence: 'x' }],
  killed: [], reviewerCount: 1, scope: 'full', tokens: 10,
}

// specs/20260821/02-replay-review-phase.md (brief 14): the reviewer-replay harness shipped
// as an ADVISORY — review's CLEAN close printed `replay is DUE — run /spec:replay` and
// nothing ran it. This repo went due at 5 reviews and skipped the reminder
// through 12+ reviews in ~48 hours; advisory visibility is measured to be insufficient. The
// driver therefore gains a REPLAY state between MERGE's conclusion and DONE (D1): it runs
// `replay.js --due` and `--select` ITSELF (the session never hand-derives dueness) and refuses to
// conclude the review until a `stage:"replay"` ledger row exists for the SELECTED target's
// reviewRunId (D2) — while never re-deriving, re-opening, or gating the already-committed verdict
// (D3). D8 (build ruling) retires the driver's own copy of the measured-to-fail advisory: the
// CLOSE-time `--due` probe and its `replay is DUE — run /spec:replay` line are gone, REPLAY's
// entry `--due` being the single dueness derivation. AC-20260821-02-1 … -7 below.

// A recorded measurement replay (caught|missed|leg-caught) is what closes the dueness window;
// review rows appearing AFTER it are what `--due` counts.
const seedReplayRow = (outcome, reviewRunId) => ({
  ts: '2026-08-20T00:00:00Z', stage: 'replay', spec: 'specs/20260819/02-mutation-replay.md',
  runId: 'rp_seed000000', reviewRunId, class: 'silent-fallback', files: ['spec/scripts/x.js'],
  legs: outcome === 'leg-caught' ? 'red:gate' : 'green', outcome, tokens: 1000,
})

const seedReviewRow = (i) => ({
  ts: `2026-08-20T01:0${i}:00Z`, stage: 'review', spec: `specs/20260820/9${i}-seed.md`,
  verdict: 'CLEAN', runId: `rv_seed00000${i}`, tier: 'standard', survived: 0,
})

const fiveSeedReviews = [1, 2, 3, 4, 5].map(seedReviewRow)

// The REPLAY fixtures are makeHost()'s shape with two additions the replay harness needs: a
// seeded ledger (which decides dueness) and an optional base-less spec frontmatter (which makes
// `replay.js --select` fail at exit 4, the only reachable "due but nothing selectable" arm —
// see AC-20260821-02-3's own note).
function makeReplayHost(prefix, { seedRows = [], withBase = true, acId } = {}) {
  const root = fs.realpathSync(tmpdir(prefix))
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
  fs.mkdirSync(path.join(root, 'specs/20260820'), { recursive: true })
  const specRel = `specs/20260820/${prefix.replace(/[^a-z0-9-]/g, '')}.md`
  const spec = path.join(root, specRel)
  let body = specBody({ diffBase, acId })
  if (!withBase) body = body.replace(/^diff_base:.*\n/m, '')
  fs.writeFileSync(spec, body)
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST.replace('AC-20260820-99-1', acId))
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  if (seedRows.length) {
    fs.writeFileSync(path.join(root, '.claude/spec-runs.jsonl'),
      seedRows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  }
  return { root, spec, specRel, sidecar: spec.replace(/\.md$/, '.review'), g }
}

// Drive a fixture through the green-legs / clean-reviewer / zero-disposition path to CLOSE,
// returning the CLOSE step's own output (the driver has already flipped status: done and
// appended its authoritative CLEAN review row by this point).
function driveToClose(host, scratchName) {
  run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'setup precondition: the replay fixture must reach REVIEWER on green legs before any REPLAY AC can be exercised')
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith(scratchName, CLEAN_RETURN))
  const r = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'setup precondition: a zero-survivor disposition must reach CLOSE: ' + r.stdout + r.stderr)
  return r
}

// The session's close commit. `amend: true` folds the status flip into the implement commit
// instead, so the spec's newest commit has a parent that predates the spec entirely — which is
// what makes `replay.js --select` fail to resolve a target (AC-20260821-02-3).
function commitClose(host, { amend = false } = {}) {
  host.g('add', host.specRel)
  if (amend) host.g('commit', '-q', '--amend', '--no-edit')
  else host.g('commit', '-q', '-m', 'close')
}

const ledgerRows = (root) => {
  const p = path.join(root, '.claude/spec-runs.jsonl')
  if (!fs.existsSync(p)) return []
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
}

const closeRunIdOf = (root) => {
  const reviews = ledgerRows(root).filter((r) => r.stage === 'review' && String(r.runId || '').startsWith('rv_'))
  return reviews[reviews.length - 1].runId
}

// Gotchas ratchet (direct fix, core § Incident Policy): the CLOSE step's prose-cap duty was a
// sentence nothing executed — a review closed CLEAN with the cap "recorded as unmet" despite
// being over it. The driver records the count on the review row and refuses --mark closed
// unless prose-cap passes in ratchet mode against that count.
function rulesWithGotchas(root, n) {
  const dir = path.join(root, '.claude/rules')
  fs.mkdirSync(dir, { recursive: true })
  const entries = []
  for (let i = 1; i <= n; i++) entries.push(`- \`[host]\` fixture gotcha ${i}`)
  fs.writeFileSync(path.join(dir, 'spec-pipeline.md'),
    '# Rules\n\n## Review Checks\n\n- none\n\n## Gotchas (evidence-cited)\n\n' + entries.join('\n') + '\n')
}

module.exports = { DRIVER, GREEN_TEST, specBody, makeHost, run, stateOf, toReviewer, returnFileWith, oneFixReturnFile, CLEAN_RETURN, SURVIVOR_RETURN, seedReplayRow, seedReviewRow, fiveSeedReviews, makeReplayHost, driveToClose, commitClose, ledgerRows, closeRunIdOf, rulesWithGotchas }
