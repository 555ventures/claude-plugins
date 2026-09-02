'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runNode, runBash, gitRepo } = require('../helpers')

// specs/20260820/07-review-driver.md (2026-08-20, brief 16): the review stage's ~14
// hand-performed choreography steps (base derivation, manifest lifecycle, both verdict
// passes, ledger appends, the status flip, merge-back) move into spec-review-driver.js on
// the spec-design-driver.js contract — a session that only follows printed steps can no
// longer skip or hand-compose any of them. These tests drive the real binary end-to-end
// against synthetic git hosts (the spec-design-driver.js idiom: tmpdir() + gitRepo(),
// runNode with cwd), never poke at internals, and are written BEFORE the driver exists —
// every test here fails on a missing/inert spec-review-driver.js and must go green only
// once the state machine genuinely does what its AC names. AC-20260820-07-1 … -12 below.
//
// specs/20260823/03-silent-drop-hardening.md D4/AC-20260823-03-11 (2026-08-23, rv_e83659d49386):
// this driver's local `fmVal` (line 152) propagates everything after `tier:` verbatim, including
// an inline `#` comment — the exact mechanism that polluted seven live review ledger rows'
// `tier` fields. D4 replaces the local copy with the new shared lib/frontmatter.js. Confirmed RED
// at HEAD by executed run: `fmVal('tier: standard   # any note')` returns
// `"standard   # any note"` verbatim today (only leading/trailing whitespace is trimmed).

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

function makeSkipsHost() {
  const root = fs.realpathSync(tmpdir('rvdrv-skips'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: "echo 'ℹ skipped 1'; node --test {testDirs}",
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'ℹ skipped (\\d+)' },
  }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const diffBase = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(root, 'specs/20260820'), { recursive: true })
  const spec = path.join(root, 'specs/20260820/99-drv-skips.md')
  fs.writeFileSync(spec, specBody({ diffBase, acId: 'AC-20260820-99-2' }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST.replace('AC-20260820-99-1', 'AC-20260820-99-2'))
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

// specs/20260901/09-disposer-gate.md D2/AC-20260901-09-2 (2026-09-01, brief 18b): --mark
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

test('AC-20260820-07-1: WHEN the driver runs on an implementing spec whose legs all pass THE SYSTEM executes review-legs itself (manifest-1.jsonl carries every leg row) and prints the REVIEWER dispatch step, never a leg instruction', () => {
  const { root, spec, sidecar } = makeHost()
  const r = run(root, spec)
  assert.strictEqual(r.status, 0, 'a fully green legs run must exit 0 (step printed), not a precondition failure: ' + r.stdout + r.stderr)
  const manifestPath = path.join(sidecar, 'manifest-1.jsonl')
  assert.ok(fs.existsSync(manifestPath),
    'the driver must execute review-legs.js itself and write manifest-1.jsonl into the <spec>.review sidecar — a session that only follows printed steps could otherwise skip this deterministic leg run entirely: ' + r.stdout + r.stderr)
  const rows = fs.readFileSync(manifestPath, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  for (const leg of ['gate', 'smoke', 'reconcile', 'ac-matrix', 'skip-reconcile', 'ci', 'at-risk', 'promise-sweep']) {
    assert.ok(rows.some(x => x.leg === leg),
      `manifest-1.jsonl must carry a "${leg}" row from the driver's own review-legs.js invocation — a missing row means the driver did not genuinely run the leg it claims to have executed: ${JSON.stringify(rows)}`)
  }
  assert.match(r.stdout, /reviewer/i,
    'a fully green legs run must print the REVIEWER dispatch step — printing a leg instruction instead would ask the session to redo work the driver already did: ' + r.stdout)
  assert.strictEqual(stateOf(root, spec), 'REVIEWER', 'the derived state after a green legs run must be REVIEWER: ' + r.stdout)
})

// specs/20260901/01-build-driver.md AC-20260901-01-17 (2026-09-01, brief 18, tagged in place —
// never weakened): D11 extracts runChild/writeOut/appendLedger/loadSidecar/saveSidecar into the
// new lib/driver-io.js and this driver imports from it, deleting its own private copies, so the
// build driver can share the same fail-closed helpers instead of growing a second set. This
// exact test is the byte-identity regression net for that extraction — a behavior change here
// (including one introduced while splicing in the shared helpers) would show up as a diff
// between the driver's appended row and a direct verdict.js re-invocation with the row's own
// recorded flags.
test('AC-20260820-07-2 (also AC-20260821-04-8, SHALL CONTINUE TO) / AC-20260824-06-5 / AC-20260901-01-17 (SHALL CONTINUE TO) / AC-20260901-09-13: WHEN the synthetic gate fails THE SYSTEM appends exactly one GATE_RED ledger line byte-equal to verdict.js\'s own line, whose diff.base/diff.head/diff.dirty name the reviewed range, prints the red leg + remedy, and reports state STOPPED — the reviewer step is never printed', () => {
  const { root, spec, sidecar } = makeHost({ gateFails: true })
  const ledger = path.join(root, '.claude/spec-runs.jsonl')
  const before = fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8') : ''
  const expectedBase = /^diff_base:\s*(\S+)/m.exec(fs.readFileSync(spec, 'utf8'))[1]
  const r = run(root, spec)
  const expectedHead = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  assert.strictEqual(stateOf(root, spec), 'STOPPED',
    'a red blocking leg must land the driver in the terminal state STOPPED, never proceed as if the substrate were clean: ' + r.stdout + r.stderr)
  assert.doesNotMatch(r.stdout, /reviewer dispatch|dispatch.*reviewer/i,
    'a red substrate must never print the reviewer dispatch step — dispatching the reviewer on a red gate is exactly the procedural-hallucination class this driver exists to structurally eliminate: ' + r.stdout)

  const beforeLines = before.trim() ? before.trim().split('\n') : []
  assert.ok(fs.existsSync(ledger), 'a GATE_RED run must append a ledger line — a stopped attempt left un-appended is invisible to the pipeline: ' + r.stdout + r.stderr)
  const afterLines = fs.readFileSync(ledger, 'utf8').trim().split('\n')
  assert.strictEqual(afterLines.length, beforeLines.length + 1,
    'exactly one ledger line must be appended for the STOPPED run — more than one is a duplicate append, fewer means the append was skipped: before=' + beforeLines.length + ' after=' + afterLines.length)
  const appended = JSON.parse(afterLines[afterLines.length - 1])
  assert.strictEqual(appended.verdict, 'GATE_RED', 'the appended ledger row must carry verdict GATE_RED: ' + JSON.stringify(appended))
  assert.ok(appended.runId, 'the appended row must carry a runId — /spec:escape needs a backlink on every row: ' + JSON.stringify(appended))

  // AC-20260824-06-5: the hard-stop row must name the range it hard-stopped on.
  assert.match((appended.diff && appended.diff.base) || '', /^[0-9a-f]{40}$/,
    'AC-20260824-06-5: the appended GATE_RED row\'s diff.base must be a 40-hex commit sha — D4 resolves the ' +
    'spec\'s base ref once via git rev-parse --verify before the first leg ever runs: ' + JSON.stringify(appended))
  assert.strictEqual(appended.diff.base, expectedBase,
    'AC-20260824-06-5: diff.base must equal git rev-parse --verify <resolved base>^{commit} of the fixture — a ' +
    'mismatch means the driver resolved a different ref than the spec\'s own diff_base frontmatter: ' + JSON.stringify(appended))
  assert.strictEqual(appended.diff.head, expectedHead,
    'AC-20260824-06-5: diff.head must equal git rev-parse HEAD of the fixture at the moment of this hard-stop ' +
    'pass — the row\'s head is the tree the red leg actually ran on: ' + JSON.stringify(appended))
  assert.strictEqual(appended.diff.dirty, false,
    'AC-20260824-06-5: the fixture tree carries no uncommitted edits at hard-stop time — diff.dirty must be ' +
    'false, never true or absent, once the sha pair is threaded onto the hard-stop pass: ' + JSON.stringify(appended))

  // specs/20260901/02-run-provenance.md D4/A6 (2026-09-01, brief 18, AC-20260901-02-4's sibling
  // pin): the driver now always passes --via/--model onto every verdict.js pass, so this fixture
  // (no --via given to the driver, no .claude/spec-session.json stamp anywhere on the host) must
  // land the default row shape — via:"direct", model:null. This assertion is what makes the
  // reproducibility re-run below need the two flags at all: without it, a driver that silently
  // dropped via/model from the row would still pass the byte-identity diff vacuously.
  assert.strictEqual(appended.via, 'direct',
    'AC-20260901-02-4/A6: a driver invocation with no --via and no stamp must default the appended row to via:"direct" — via is fixed at sidecar creation, not derived here: ' + JSON.stringify(appended))
  assert.strictEqual(appended.model, null,
    'AC-20260901-02-4/A6: a host with no .claude/spec-session.json stamp must derive model:null on the appended row, never a thrown error or a fabricated value: ' + JSON.stringify(appended))

  // Reproducibility check for "byte-equal to verdict.js's stdout line 2": feeding verdict.js the
  // SAME manifest with the exact tier/diff/iteration/runId/base-sha/head-sha/dirty/via/model the
  // driver's own row recorded must reproduce an identical row (every field but the call-time
  // timestamp) — proving the driver appended verdict.js's own printed line rather than
  // hand-composing one. A6: --via/--model are taken from the row's OWN recorded via/model
  // fields, never hardcoded here, so this stays a genuine re-invocation proof rather than an
  // assumption about what the driver passed.
  const manifestPath = path.join(sidecar, 'manifest-1.jsonl')
  assert.ok(fs.existsSync(manifestPath), 'a STOPPED run must still have written manifest-1.jsonl before hard-stopping: ' + r.stdout)
  assert.ok(appended.spec && appended.tier, 'the ledger row must carry --spec and --tier so a GATE_RED run is attributable: ' + JSON.stringify(appended))
  const reArgs = ['--manifest', manifestPath, '--ledger', '--spec', appended.spec, '--tier', appended.tier, '--run-id', appended.runId]
  if (appended.diff && typeof appended.diff.loc === 'number') reArgs.push('--diff-loc', String(appended.diff.loc))
  if (appended.iteration !== undefined) reArgs.push('--iteration', String(appended.iteration))
  if (appended.diff && typeof appended.diff.base === 'string') {
    reArgs.push('--base-sha', appended.diff.base, '--head-sha', appended.diff.head)
    if (appended.diff.dirty) reArgs.push('--dirty')
  }
  reArgs.push('--via', appended.via)
  if (appended.model !== null && appended.model !== undefined) reArgs.push('--model', appended.model)
  // AC-20260901-09-13/D6: the driver now threads a derived --checkpoint onto every review verdict
  // pass (both via values) — a GATE_RED hard-stop row is always "not-reached" (no disposer mark
  // can exist before LEGS even finishes). Omitting this from the re-run would make the deep-equal
  // below fail on the checkpoint key the driver's own row carries.
  if (appended.checkpoint) {
    reArgs.push('--checkpoint', appended.checkpoint.outcome)
    if (appended.checkpoint.outcome === 'disposer') reArgs.push('--checkpoint-overrides', String(appended.checkpoint.overrides))
  }
  const reRun = runNode('scripts/verdict.js', reArgs)
  const reRunLine = reRun.stdout.trim().split('\n')[1]
  assert.ok(reRunLine, 'verdict.js must print a ledger line when re-invoked with the driver\'s own recorded flags against the same manifest: ' + reRun.stdout + reRun.stderr)
  const reRunRow = JSON.parse(reRunLine)
  delete reRunRow.ts
  const appendedNoTs = { ...appended }; delete appendedNoTs.ts
  assert.deepStrictEqual(appendedNoTs, reRunRow,
    'the ledger row the driver appended must be byte-equal (aside from the call-time timestamp) to verdict.js\'s own output for the same manifest and flags — any divergence means the driver hand-assembled the row instead of using verdict.js\'s printed line: appended=' + JSON.stringify(appended) + ' reRun=' + JSON.stringify(reRunRow))
})

test('AC-20260820-07-3: WHEN --mark reviewer-returned --file names a missing or malformed file THE SYSTEM exits 2 naming the defect and leaves the state unchanged', () => {
  const host = makeHost()
  toReviewer(host)

  const missing = path.join(fs.realpathSync(tmpdir('rvdrv-scratch')), 'nope.json')
  const rMissing = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', missing)
  assert.strictEqual(rMissing.status, 2,
    'a reviewer-returned mark whose --file is missing must exit 2, never crash uninformatively or silently accept the mark: ' + rMissing.stdout + rMissing.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'a refused mark must leave state at REVIEWER — advancing here would accept an evidence-less reviewer pass')

  const malformed = path.join(fs.realpathSync(tmpdir('rvdrv-scratch2')), 'bad.json')
  fs.writeFileSync(malformed, '{not valid json')
  const rBad = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', malformed)
  assert.strictEqual(rBad.status, 2, 'an unparseable reviewer return file must also exit 2: ' + rBad.stdout + rBad.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'the malformed-file mark must also leave the state unchanged')
})

test('AC-20260820-07-4: WHEN the reviewer return file\'s verdict is REVIEWER_FAILED THE SYSTEM refuses the mark (exit 2) and prints the re-dispatch instruction', () => {
  const host = makeHost()
  toReviewer(host)
  const failedFile = returnFileWith('rvdrv-failed', { verdict: 'REVIEWER_FAILED', survivors: [], killed: [], reviewerCount: 1, scope: 'full', tokens: 10 })
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', failedFile)
  assert.strictEqual(r.status, 2,
    'a REVIEWER_FAILED return must refuse the mark — accepting it would let a reviewer that died mid-run read as a completed pass: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /re-?dispatch/i,
    'the refusal must print the re-dispatch instruction so the session relaunches the reviewer instead of stalling: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'the state must remain REVIEWER so the very next driver run asks for a fresh dispatch')
})

test('AC-20260820-07-5: WHEN --mark dispositions counts exceed the survivor + leg-finding pools THE SYSTEM exits 2 (verdict.js\'s contradiction arithmetic, surfaced through the driver) and leaves the state unchanged', () => {
  const host = makeHost()
  toReviewer(host)
  const returnFile = returnFileWith('rvdrv-disp', SURVIVOR_RETURN)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS', 'setup: a returned non-empty survivor list must land DISPOSITIONS')

  const r = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '5', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(r.status, 2,
    'dispositions summing to more than the survivor+leg-finding pool (1 survivor here) must exit 2 — accepting it would record counts the run never actually found: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS', 'a refused dispositions mark must leave the state at DISPOSITIONS unchanged')
})

// specs/20260901/03-unified-build-loop.md D2/AC-20260901-03-5 (2026-09-01, brief 18, SHALL
// CONTINUE TO, tagged in place, never weakened): this host is built with no --via flag, so it
// defaults to via:"direct" — the new CHECKPOINT state (reached only for via:"loop") must never
// engage here, and the line below asserting DISPOSITIONS directly after reviewer-returned stays
// the correct, unweakened pin for the direct-entry path.
//
// specs/20260901/09-disposer-gate.md D9/AC-20260901-09-5 (2026-09-01, brief 18b, tagged in
// place, never weakened): D9 keeps this exact zero-pool CONTINUES-TO-pass shape as the AC-5
// pin — both pools empty still admits --mark dispositions --waived 0 --rejected 0
// --fix-dispatched 0 with no --file and lands CLOSE, unaffected by the CHECKPOINT retirement.
test('AC-20260820-07-6 / AC-20260901-03-5 / AC-20260901-09-5 (SHALL CONTINUE TO): WHEN a clean run reaches CLOSE (0 survivors, dispositions 0 0 0) THE SYSTEM runs the authoritative verdict with --retain .claude/spec-runs, appends one ledger line, flips status implementing -> done, and prints the close-step instructions', () => {
  const host = makeHost()
  toReviewer(host)
  const returnFile = returnFileWith('rvdrv-clean', CLEAN_RETURN)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS',
    'AC-20260901-03-5 (SHALL CONTINUE TO)/D2: a via:"direct" run (no --via flag given) must land DISPOSITIONS directly after reviewer-returned, never CHECKPOINT — CHECKPOINT exists only for via:"loop"')

  const ledger = path.join(host.root, '.claude/spec-runs.jsonl')
  const before = fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean) : []
  const r = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(r.status, 0, 'a zero-survivor, zero-finding disposition must be accepted: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE', 'zero undispositioned findings must land CLOSE: ' + r.stdout + r.stderr)

  const after = fs.readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean)
  assert.strictEqual(after.length, before.length + 1,
    'exactly one ledger line must be appended for the authoritative CLOSE pass: ' + JSON.stringify({ before, after }))
  const row = JSON.parse(after[after.length - 1])
  assert.strictEqual(row.verdict, 'CLEAN', 'the authoritative pass must derive CLEAN for a zero-survivor, zero-leg-finding run: ' + JSON.stringify(row))

  const retainDir = path.join(host.root, '.claude/spec-runs')
  assert.ok(fs.existsSync(retainDir) && fs.readdirSync(retainDir).includes(row.runId + '.json'),
    'the authoritative verdict must run with --retain .claude/spec-runs, writing <runId>.json — without it the reviewer\'s full-fidelity evidence is never durable: ' + retainDir)

  assert.match(fs.readFileSync(host.spec, 'utf8'), /status:\s*done/,
    'CLOSE must flip the spec\'s frontmatter status from implementing to done')

  assert.match(r.stdout, /Canonical Delta/, 'the CLOSE step must print the Canonical Delta instruction: ' + r.stdout)
  assert.match(r.stdout, /\.claude\/spec-runs\/\*\.json/,
    'the CLOSE step\'s hygiene listing must name .claude/spec-runs/*.json as an EXPECTED artifact — omitting it invites deleting durable evidence as reviewer scratch: ' + r.stdout)
  assert.match(r.stdout, /EXPECTED/, 'the hygiene listing must mark expected artifacts (retained evidence + sidecar) as EXPECTED, not stray paths to clean up: ' + r.stdout)
  assert.match(r.stdout, /close[- ]commit/i, 'the CLOSE step must print the close-commit instruction: ' + r.stdout)
})

// specs/20260824/06-review-range-identity.md D3/D4 (2026-08-24): the close row is written by
// doCloseWork() BEFORE the close commit exists — fix-worker edits may still be uncommitted tracked
// changes at pass time, so `dirty:true` tells a later reader the range's true upper bound is the
// close commit that follows, never `head` alone. Untracked files (the sidecar, scratch artifacts)
// never count — `git status --porcelain --untracked-files=no` is the exact command D4 pins.
test('AC-20260824-06-6: WHEN a clean run reaches CLOSE with one uncommitted tracked-file edit in the fixture tree THE SYSTEM appends a close row with diff.dirty:true and diff.head equal to the fixture\'s HEAD before the close commit, and a retained artifact whose diff deep-equals the row\'s; WHEN the tree is clean apart from untracked files THE SYSTEM records diff.dirty:false', () => {
  const dirtyHost = makeHost()
  toReviewer(dirtyHost)
  run(dirtyHost.root, dirtyHost.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('rvdrv-dirty-clean', CLEAN_RETURN))
  assert.strictEqual(stateOf(dirtyHost.root, dirtyHost.spec), 'DISPOSITIONS', 'setup: a returned CLEAN, zero-survivor result must land DISPOSITIONS')
  fs.writeFileSync(path.join(dirtyHost.root, 'src/foo.js'), 'module.exports = () => 42 // uncommitted fix-worker edit\n')
  const expectedHeadDirty = execFileSync('git', ['-C', dirtyHost.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const dClose = run(dirtyHost.root, dirtyHost.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(dClose.status, 0, 'a zero-survivor disposition must still close even with an uncommitted tracked edit present: ' + dClose.stdout + dClose.stderr)
  const ledgerDirtyLines = fs.readFileSync(path.join(dirtyHost.root, '.claude/spec-runs.jsonl'), 'utf8').trim().split('\n').filter(Boolean)
  const rowDirty = JSON.parse(ledgerDirtyLines[ledgerDirtyLines.length - 1])
  assert.strictEqual(rowDirty.diff && rowDirty.diff.dirty, true,
    'AC-20260824-06-6: a modified TRACKED file uncommitted at close-pass time must record diff.dirty:true — ' +
    'without this a reader cannot tell the close commit that follows is still part of the judged range: ' + JSON.stringify(rowDirty))
  assert.strictEqual(rowDirty.diff.head, expectedHeadDirty,
    'AC-20260824-06-6: diff.head must equal the fixture\'s HEAD BEFORE the close commit (the driver never ' +
    'commits itself) — the close row\'s head is the tree the authoritative pass actually judged: ' + JSON.stringify(rowDirty))
  const artifactDirty = JSON.parse(fs.readFileSync(path.join(dirtyHost.root, '.claude/spec-runs', rowDirty.runId + '.json'), 'utf8'))
  assert.deepStrictEqual(artifactDirty.diff, rowDirty.diff,
    'AC-20260824-06-6: the retained artifact\'s diff must deep-equal the close row\'s diff object: ' +
    JSON.stringify({ row: rowDirty.diff, artifact: artifactDirty.diff }))

  const cleanHost = makeHost()
  toReviewer(cleanHost)
  run(cleanHost.root, cleanHost.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('rvdrv-untracked-clean', CLEAN_RETURN))
  assert.strictEqual(stateOf(cleanHost.root, cleanHost.spec), 'DISPOSITIONS')
  fs.writeFileSync(path.join(cleanHost.root, 'scratch.txt'), 'an untracked scratch file, never git add-ed\n')
  const cClose = run(cleanHost.root, cleanHost.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(cClose.status, 0, 'a zero-survivor disposition must close normally with only an untracked file present: ' + cClose.stdout + cClose.stderr)
  const ledgerCleanLines = fs.readFileSync(path.join(cleanHost.root, '.claude/spec-runs.jsonl'), 'utf8').trim().split('\n').filter(Boolean)
  const rowClean = JSON.parse(ledgerCleanLines[ledgerCleanLines.length - 1])
  assert.strictEqual(rowClean.diff && rowClean.diff.dirty, false,
    'AC-20260824-06-6: an untracked file alone (e.g. a scratch artifact) must never count as dirty — ' +
    '`git status --porcelain --untracked-files=no` reports nothing for it, so diff.dirty must be false: ' +
    JSON.stringify(rowClean))
})

function unresolvableBaseSpecBody(acId) {
  return `---
status: implementing
tier: standard
build_base: no-such-branch-xyz
---
# Driver Test Spec (unresolvable base)

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
`
}

// specs/20260824/06-review-range-identity.md D4/AC-12 (2026-08-24): resolveBaseSha() runs once,
// right after resolveBase(), at driver startup — so an unresolvable base must die before the
// first manifest or leg ever runs, never mid-leg or at the first verdict pass.
test('AC-20260824-06-12: WHEN the spec\'s base ref does not resolve to a commit THE SYSTEM exits 2 before any leg or verdict pass runs, naming diff_base and git rev-parse --verify on stderr, and appends no ledger line and writes no manifest', () => {
  const root = fs.realpathSync(tmpdir('rvdrv-badbase'))
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
  fs.mkdirSync(path.join(root, 'specs/20260820'), { recursive: true })
  const spec = path.join(root, 'specs/20260820/99-drv-badbase.md')
  const acId = 'AC-20260820-99-17'
  fs.writeFileSync(spec, unresolvableBaseSpecBody(acId))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST.replace('AC-20260820-99-1', acId))
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  const sidecar = spec.replace(/\.md$/, '.review')

  const ledger = path.join(root, '.claude/spec-runs.jsonl')
  const before = fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8') : null

  const r = run(root, spec)
  assert.strictEqual(r.status, 2,
    'AC-20260824-06-12: an unresolvable base ref must exit 2 before any leg runs — proceeding would diff ' +
    'every leg against a ref that does not exist: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /diff_base/,
    'AC-20260824-06-12: stderr must name diff_base as the remedy (add diff_base: <sha> to the spec ' +
    'frontmatter) — a generic git error here leaves the fix undiscoverable: ' + r.stderr)
  assert.match(r.stderr, /git rev-parse --verify/,
    'AC-20260824-06-12: stderr must name the resolution command git rev-parse --verify so the remedy is ' +
    'directly runnable: ' + r.stderr)

  const after = fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8') : null
  assert.strictEqual(after, before,
    'AC-20260824-06-12: .claude/spec-runs.jsonl must be byte-unchanged — the base must die BEFORE the first ' +
    'manifest or leg, not after a hard-stop row was already appended: ' + JSON.stringify({ before, after }))
  assert.ok(!fs.existsSync(path.join(sidecar, 'manifest-1.jsonl')),
    'AC-20260824-06-12: no manifest-1.jsonl may exist — review-legs.js must never be invoked once the base ' +
    'fails to resolve: ' + sidecar)
})

// Escape caught by audit 2026-08-24, after specs/20260823/08-derived-session-queue.md had already
// closed CLEAN: the CLOSE step rendered `docs/canonical/${area}.md` straight from frontmatter, so a
// spec carrying `area: session-queue` whose Canonical Delta names `docs/canonical/status.md` was
// told to write a canonical doc that does not exist. Following the printed instruction would have
// fragmented the canonical layer into a second file the spec never named.
test('the CLOSE step names the canonical doc the spec\'s own Canonical Delta section names, not one derived from frontmatter area, when the two differ', () => {
  const host = makeHost({ specOpts: { area: 'session-queue', canonicalDelta: 'docs/canonical/status.md gains one paragraph about the overlay.' } })
  toReviewer(host)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('rvdrv-canon', CLEAN_RETURN))
  const r = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')

  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE', 'setup: a zero-survivor disposition must land CLOSE: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /Apply the spec's Canonical Delta to docs\/canonical\/status\.md\./,
    'the close instruction must name the doc the spec itself names — a session following an area-derived path writes a canonical doc the spec never named, splitting the canonical layer in two: ' + r.stdout)
  assert.doesNotMatch(r.stdout, /docs\/canonical\/session-queue\.md/,
    'the area-derived filename must not appear at all once the Canonical Delta names its own target — printing both leaves the session to guess which is authoritative: ' + r.stdout)
})

test('the CLOSE step falls back to the area-derived canonical filename when the spec has no Canonical Delta section naming one', () => {
  const host = makeHost({ specOpts: { area: 'review' } })
  toReviewer(host)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('rvdrv-canon-fb', CLEAN_RETURN))
  const r = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')

  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE', 'setup: a zero-survivor disposition must land CLOSE: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /Apply the spec's Canonical Delta to docs\/canonical\/review\.md\./,
    'a spec whose Canonical Delta names no path must still get the area-derived target — losing the fallback would leave the close step with no canonical instruction at all: ' + r.stdout)
})

test('AC-20260823-03-11: WHEN the review driver processes a spec whose frontmatter reads "tier: standard   # any note" THE SYSTEM passes exactly "standard" as --tier, so the ledger row it produces carries "tier":"standard" with no "#" (rv_e83659d49386, the same inline-comment mechanism that polluted seven live ledger rows)', () => {
  const root = fs.realpathSync(tmpdir('rvdrv-fm11'))
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
  const spec = path.join(root, 'specs/20260820/99-drv-fm11.md')
  fs.writeFileSync(spec, specBody({ diffBase, tier: 'standard   # any note', acId: 'AC-20260820-99-3' }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST.replace('AC-20260820-99-1', 'AC-20260820-99-3'))
  g('add', '-A'); g('commit', '-q', '-m', 'implement')

  toReviewer({ root, spec })
  const returnFile = returnFileWith('rvdrv-fm11-clean', CLEAN_RETURN)
  run(root, spec, '--mark', 'reviewer-returned', '--file', returnFile)
  assert.strictEqual(stateOf(root, spec), 'DISPOSITIONS', 'setup: a returned CLEAN, zero-survivor result must land DISPOSITIONS')

  const ledger = path.join(root, '.claude/spec-runs.jsonl')
  const r = run(root, spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(r.status, 0, 'a zero-survivor, zero-finding disposition must be accepted even when tier carries a comment: ' + r.stdout + r.stderr)

  const rows = fs.readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
  const row = rows[rows.length - 1]
  assert.strictEqual(row.tier, 'standard',
    'the driver reads tier via fmVal and passes it verbatim as --tier to verdict.js — a frontmatter value carrying an inline comment must be stripped to exactly "standard" before it reaches the ledger row, or the comment text becomes part of the durable tier field, exactly rv_e83659d49386\'s mechanism: got ' + JSON.stringify(row.tier))
  assert.ok(!row.tier.includes('#'),
    'the ledger row\'s tier field must never carry a "#" — a surviving comment fragment here corrupts every downstream tier===\'critical\' comparison and tier-economics derivation reading this row: got ' + JSON.stringify(row.tier))
})

test('AC-20260820-07-7: WHEN --mark closed is passed while the tree is dirty beyond the sidecar THE SYSTEM exits 2 naming the unexpected paths', () => {
  const host = makeHost()
  toReviewer(host)
  const returnFile = returnFileWith('rvdrv-dirty', CLEAN_RETURN)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
  run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE')

  fs.writeFileSync(path.join(host.root, 'stray-uncommitted.txt'), 'oops\n')
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 2,
    'a dirty tree beyond the sidecar must refuse the closed mark — accepting it would leave an unadjudicated stray path riding the close commit: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /stray-uncommitted\.txt/,
    'the refusal must name the unexpected path so the session can adjudicate it, not just report generic dirtiness: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE', 'a refused closed mark must leave the state at CLOSE')
})

// specs/20260830/02-close-gate-rerun.md D1/D2/D4 (2026-08-30, salon-os field report): CLOSE
// writes the canonical doc and folds Gotchas into the host's rules file AFTER the gate leg
// already ran over the diff, then commits — so the exact files CLOSE itself writes bypass the
// host's deterministic rule enforcement. `--mark closed` now re-runs the host's resolved
// gateCommand (cwd = repoRoot) as its LAST refusal check, after the deviations/gotchas/dirty-tree
// refusals, over the committed close tree. Both fixtures below simulate "the close commit itself
// broke the gate" by editing the tree BETWEEN reaching CLOSE on a genuinely green legs run and
// the session's own close commit — exactly where a real canonical-doc/rules-fold write would
// land — never by starting the whole review on an already-broken gate, which would die before
// REVIEWER (via review-legs.js's own gate leg) and never reach CLOSE at all. Both tests must fail
// red today: handleClosed() has no gate-run refusal yet, so `--mark closed` exits 0 on both.

test('AC-20260830-02-1: WHEN --mark closed is invoked with all earlier refusals passing and the resolved host gateCommand exits non-zero THE SYSTEM refuses the mark (exit 2), leaves marks.closed unset (state stays CLOSE), and prints a message naming "gate red at close", the resolved command, and the re-run remedy', () => {
  const host = makeHost()
  toReviewer(host)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('rvdrv-gate1-clean', CLEAN_RETURN))
  const dispR = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'setup precondition: a clean zero-survivor disposition must reach CLOSE before the close-time gate refusal can be exercised: ' + dispR.stdout + dispR.stderr)

  // Simulate the close commit itself breaking the gate (the salon-os mechanism): an always-red
  // script the close-time gate now runs, written and committed alongside the spec's own
  // status:done flip — exactly the class of files CLOSE writes, never a gate broken from the
  // start (which would have died before REVIEWER instead).
  fs.writeFileSync(path.join(host.root, 'always-red.sh'), '#!/usr/bin/env bash\necho ALWAYS_RED_MARKER\nexit 1\n')
  const cfgPath = path.join(host.root, '.claude/spec.config.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  cfg.gateCommand = 'bash always-red.sh'
  fs.writeFileSync(cfgPath, JSON.stringify(cfg))
  const specRel = path.relative(host.root, host.spec)
  execFileSync('git', ['-C', host.root, 'add', specRel, '.claude/spec.config.json', 'always-red.sh'], { encoding: 'utf8' })
  execFileSync('git', ['-C', host.root, 'commit', '-q', '-m', 'close'], { encoding: 'utf8' })

  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 2,
    'a resolved gateCommand exiting non-zero at close must refuse the mark — accepting it would let files CLOSE itself just wrote (here simulating the canonical doc / rules fold) ride the close commit unenforced, exactly the salon-os escape this spec exists to close: ' + r.stdout + r.stderr)
  assert.ok(r.stderr.includes('gate red at close — bash always-red.sh exited 1'),
    'D1/D2: stderr must carry the literal phrase "gate red at close" together with the resolved command and its exit code — the AC\'s own worked example pins this exact substring so a session grepping the refusal always finds the same anchor: ' + r.stderr)
  assert.match(r.stderr, /last 40 lines of gate output/,
    'D2: the refusal must label the tail-of-output block so the session knows what follows is the gate\'s own evidence, not driver prose: ' + r.stderr)
  assert.match(r.stderr, /ALWAYS_RED_MARKER/,
    'D2: the refusal must include the tail of the gate\'s actual output — omitting it leaves the session guessing why the gate failed instead of reading the evidence inline: ' + r.stderr)
  assert.match(r.stderr, /re-run/i,
    'D2: the refusal must name the remedy (fix the flagged files, commit the fix, re-run --mark closed) — an error path without its remedy command is a hard finding under this repo\'s own review rules: ' + r.stderr)
  assert.match(r.stderr, /--mark closed/,
    'D2: the remedy must literally name the re-run command `--mark closed` so the session can retry without re-deriving the mark: ' + r.stderr)

  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'a refused closed mark must leave marks.closed unset and state at CLOSE — advancing here would accept a review whose committed close tree the gate itself rejects: ' + r.stdout + r.stderr)
})

function specBodyNoTestFilePlanRow({ diffBase, acId }) {
  return `---
status: done
tier: standard
diff_base: ${diffBase}
---
# Driver Test Spec (no File Plan test rows)

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | foo() returns 42 (${acId}) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | edit | scripts |

## Acceptance Criteria

- **${acId}**: foo() returns 42.
`
}

test('AC-20260830-02-4: WHEN --mark closed is invoked and gate resolution returns gate:null (gateCommand contains {testDirs}, the spec has no File Plan test rows) THE SYSTEM refuses the mark (exit 2), naming the unresolvable-gate reason and the remedy — never silently skips the check', () => {
  const host = makeHost()
  toReviewer(host)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('rvdrv-gate4-clean', CLEAN_RETURN))
  const dispR = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'setup precondition: a clean zero-survivor disposition must reach CLOSE before the unresolvable-gate refusal can be exercised: ' + dispR.stdout + dispR.stderr)

  // The close commit drops the spec's own File Plan test row while gateCommand still reads
  // 'node --test {testDirs}' (unchanged) — resolution now has nothing to substitute. Per this
  // spec's own Rationale, a real gate:null review leg is already a red row long before close in
  // practice; this is the one reachable synthetic shape of D4's defense-in-depth branch.
  const diffBase = /^diff_base:\s*(\S+)/m.exec(fs.readFileSync(host.spec, 'utf8'))[1]
  fs.writeFileSync(host.spec, specBodyNoTestFilePlanRow({ diffBase, acId: 'AC-20260820-99-1' }))
  const specRel = path.relative(host.root, host.spec)
  execFileSync('git', ['-C', host.root, 'add', specRel], { encoding: 'utf8' })
  execFileSync('git', ['-C', host.root, 'commit', '-q', '-m', 'close (drop File Plan test row)'], { encoding: 'utf8' })

  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 2,
    'an unresolvable {testDirs} gate must refuse the mark exactly like a red gate — silently skipping the check here is the vacuous-green class this spec exists to close: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /no File Plan test rows/,
    'D4: the refusal must name the unresolvable-gate reason "no File Plan test rows" (lib/gate-resolve.js\'s own reason string) so the session knows exactly why {testDirs} could not be substituted: ' + r.stderr)
  assert.match(r.stderr, /--mark closed/,
    'D4: the refusal must still name the re-run remedy (fix the File Plan, then re-run --mark closed) — an error path without its remedy is a hard finding under this repo\'s own review rules: ' + r.stderr)

  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'a refused closed mark must leave marks.closed unset and state at CLOSE — the driver must never silently treat an unresolvable gate as a pass: ' + r.stdout + r.stderr)
})

// specs/20260822/01-escalate-ledger-row.md D12 (2026-08-22): the cap refusal below is retagged
// (never weakened) as a SHALL-CONTINUE-TO pin for AC-20260822-01-10 — that spec inserts a
// writeEscalateRow() call ahead of this same die(), but the refusal itself (exit 2, iteration cap
// 2, state ESCALATE) must survive byte-for-byte in spirit. The new escalate-row mechanics are
// pinned separately in tests/review/escalate-row.test.js.
test('AC-20260820-07-8 (also AC-20260822-01-10, SHALL CONTINUE TO) / AC-20260901-09-2: a dispatched fix cycles FIX -> fix-applied (fresh manifest, legs --fix-delta) -> REVIEWER twice, and a third fix-applied is refused with state ESCALATE naming the iteration cap of 2', () => {
  const host = makeHost()
  run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER')

  for (let cycle = 1; cycle <= 2; cycle++) {
    const returnFile = returnFileWith('rvdrv-fix-' + cycle, SURVIVOR_RETURN)
    run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
    assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS', `cycle ${cycle}: a returned survivor must land DISPOSITIONS`)

    // AC-20260901-09-2: SURVIVOR_RETURN's single survivor is the whole pool (s0) — cover it with
    // a minimal "fix" disposer return before --mark dispositions --fix-dispatched 1 is accepted.
    const dispFile = oneFixReturnFile('rvdrv-fix-disp-' + cycle, 's0')
    const dispR = run(host.root, host.spec, '--mark', 'dispositions', '--file', dispFile, '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
    assert.strictEqual(dispR.status, 0, `cycle ${cycle}: fix-dispatched 1 (within the 1-survivor pool) must be accepted: ` + dispR.stdout + dispR.stderr)
    assert.strictEqual(stateOf(host.root, host.spec), 'FIX', `cycle ${cycle}: fix-dispatched 1 must land FIX`)

    const fixR = run(host.root, host.spec, '--mark', 'fix-applied')
    assert.strictEqual(fixR.status, 0, `cycle ${cycle}: fix-applied within the cap must succeed: ` + fixR.stdout + fixR.stderr)
    const manifestN = path.join(host.sidecar, `manifest-${cycle + 1}.jsonl`)
    assert.ok(fs.existsSync(manifestN),
      `cycle ${cycle}: fix-applied must re-run legs --fix-delta on a FRESH manifest-${cycle + 1}.jsonl — reusing the prior manifest would carry stale pre-fix evidence into the fix-delta pass: ` + fixR.stdout + fixR.stderr)
    assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', `cycle ${cycle}: fix-applied must return to REVIEWER for the fix-delta reviewer pass: ` + fixR.stdout + fixR.stderr)
  }

  const returnFile3 = returnFileWith('rvdrv-fix-3', SURVIVOR_RETURN)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile3)
  const dispFile3 = oneFixReturnFile('rvdrv-fix-disp-3', 's0')
  const dispR3 = run(host.root, host.spec, '--mark', 'dispositions', '--file', dispFile3, '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
  assert.strictEqual(dispR3.status, 0, 'a third dispositions-with-fix-dispatched must still be accepted — the cap applies to fix-applied, not to entering FIX: ' + dispR3.stdout + dispR3.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'FIX')

  const manifestsBefore = fs.readdirSync(host.sidecar).filter(f => /^manifest-\d+\.jsonl$/.test(f)).sort()
  const thirdFix = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(thirdFix.status, 2,
    'a third fix-applied must be refused — the iteration cap is 2, and accepting a third cycle re-opens unbounded fix/review churn: ' + thirdFix.stdout + thirdFix.stderr)
  assert.match(thirdFix.stdout + thirdFix.stderr, /iteration cap 2/,
    'the refusal must literally name the iteration cap ("iteration cap 2") per the Contracts\' own literal note: ' + thirdFix.stdout + thirdFix.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'ESCALATE',
    'a refused third fix-applied must land the terminal state ESCALATE and print the escalation step: ' + thirdFix.stdout + thirdFix.stderr)
  const manifestsAfter = fs.readdirSync(host.sidecar).filter(f => /^manifest-\d+\.jsonl$/.test(f)).sort()
  assert.deepStrictEqual(manifestsAfter, manifestsBefore,
    'a refused fix-applied must create NO new manifest file — a manifest-4.jsonl appearing here means legs re-ran on a mark the driver was supposed to refuse: ' + JSON.stringify({ manifestsBefore, manifestsAfter }))
})

test('AC-20260820-07-8 (manifest-provable cap) / AC-20260901-09-2: hand-editing the sidecar\'s stored iteration count cannot reach ESCALATE — only manifest-<n>.jsonl files actually present on disk advance the cap', () => {
  const host = makeHost()
  run(host.root, host.spec)
  const returnFile = returnFileWith('rvdrv-hand-edit', SURVIVOR_RETURN)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
  const dispFile1 = oneFixReturnFile('rvdrv-hand-edit-disp', 's0')
  run(host.root, host.spec, '--mark', 'dispositions', '--file', dispFile1, '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
  assert.strictEqual(stateOf(host.root, host.spec), 'FIX')
  const fixR = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(fixR.status, 0, 'setup: one real fix-applied cycle must succeed: ' + fixR.stdout + fixR.stderr)
  assert.ok(fs.existsSync(path.join(host.sidecar, 'manifest-2.jsonl')), 'setup: one real fix-applied cycle must produce manifest-2.jsonl')
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER')

  // Hand-edit the sidecar to CLAIM the cap is already exhausted, with only manifest-1/2 on disk.
  const stateFile = path.join(host.sidecar, 'review-state.json')
  const stateJson = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  stateJson.iteration = 99
  stateJson.fixIterations = 99
  fs.writeFileSync(stateFile, JSON.stringify(stateJson, null, 2))

  assert.notStrictEqual(stateOf(host.root, host.spec), 'ESCALATE',
    'a hand-edited sidecar counter must NEVER be able to reach ESCALATE on its own — the iteration cap must derive from manifest-<n>.jsonl files actually present on disk (only manifest-1 and manifest-2 exist, within the cap of 2), per the Fragile Spots note that the count must not be a stored counter')

  // The real cap must still be reachable normally afterward — the fabricated counter consumed nothing real.
  const returnFile2 = returnFileWith('rvdrv-hand-edit-2', SURVIVOR_RETURN)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile2)
  const dispFile2 = oneFixReturnFile('rvdrv-hand-edit-disp2', 's0')
  run(host.root, host.spec, '--mark', 'dispositions', '--file', dispFile2, '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
  const fixR2 = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(fixR2.status, 0,
    'the hand-edited counter must not have consumed the real cap — the second genuine fix-applied (only manifest-1/2 on disk beforehand) must still succeed: ' + fixR2.stdout + fixR2.stderr)
  assert.ok(fs.existsSync(path.join(host.sidecar, 'manifest-3.jsonl')), 'the second genuine fix cycle must produce manifest-3.jsonl')
})

test('AC-20260820-07-9: WHEN the driver is re-invoked with no mark THE SYSTEM prints the same step again with no side effects — no duplicate manifest rows, no duplicate ledger lines', () => {
  const host = makeHost()
  run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'setup: fixture must reach REVIEWER before exercising re-invocation idempotency')

  const manifestPath = path.join(host.sidecar, 'manifest-1.jsonl')
  const ledger = path.join(host.root, '.claude/spec-runs.jsonl')
  const readLedger = () => (fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8') : '')

  const manifestSnap = fs.readFileSync(manifestPath, 'utf8')
  const ledgerSnap = readLedger()

  const r1 = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'literal: a no-mark invocation at REVIEWER must derive the identical state: ' + r1.stdout + r1.stderr)
  assert.strictEqual(fs.readFileSync(manifestPath, 'utf8'), manifestSnap,
    'a no-mark invocation must not append duplicate manifest rows — manifest-1.jsonl must stay byte-identical: ' + r1.stdout + r1.stderr)
  assert.strictEqual(readLedger(), ledgerSnap,
    'a no-mark invocation must not append a ledger line — the ledger must stay byte-identical: ' + r1.stdout + r1.stderr)

  const r2 = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'literal: TWO consecutive no-mark invocations at REVIEWER must derive the identical state both times: ' + r2.stdout + r2.stderr)
  assert.strictEqual(fs.readFileSync(manifestPath, 'utf8'), manifestSnap,
    'the second consecutive no-mark invocation must also leave manifest-1.jsonl byte-identical: ' + r2.stdout + r2.stderr)
  assert.strictEqual(readLedger(), ledgerSnap,
    'literal: the ledger must stay byte-identical across both consecutive no-mark invocations at REVIEWER: ' + r2.stdout + r2.stderr)
})

test('AC-20260820-07-10: WHEN the gate row reports skips > 0 and no skips file is marked THE SYSTEM prints the SKIPS extraction step; after skips-extracted --file <f> it re-runs legs with --skips <f> on a fresh manifest', () => {
  const host = makeSkipsHost()
  const r1 = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'SKIPS',
    'a gate row reporting skips > 0 with no skips file marked must land state SKIPS, not proceed straight to REVIEWER: ' + r1.stdout + r1.stderr)
  assert.match(r1.stdout, /skip/i, 'the SKIPS state must print the extraction step instructions: ' + r1.stdout)

  const skipsFile = path.join(fs.realpathSync(tmpdir('rvdrv-skipfile')), 'skips.txt')
  fs.writeFileSync(skipsFile, 'AC-20260820-99-2: foo() returns 42\n')
  const r2 = run(host.root, host.spec, '--mark', 'skips-extracted', '--file', skipsFile)
  assert.strictEqual(r2.status, 0, 'a valid skips-extracted mark must be accepted: ' + r2.stdout + r2.stderr)

  const manifest2 = path.join(host.sidecar, 'manifest-2.jsonl')
  assert.ok(fs.existsSync(manifest2),
    'skips-extracted must re-run legs on a FRESH manifest-2.jsonl — reusing manifest-1.jsonl would mix pre- and post-skip-attribution evidence: ' + r2.stdout + r2.stderr)
  const rows2 = fs.readFileSync(manifest2, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  assert.ok(rows2.some(x => x.leg === 'gate'), 'the fresh manifest must still carry a gate row from the re-run: ' + JSON.stringify(rows2))
})

// specs/20260821/03-cross-spec-skip-mapping.md D3 (2026-08-21): ac-matrix.js's new route 3
// (D1) maps a skipped test through the file its runner names — but only if the SKIPS step's
// printed instruction actually tells the session to keep that qualifier. The pre-existing test
// above pins the SKIPS step only as /skip/i (deliberately loose, per this spec's Rationale), so
// this is a purely additive assertion, not a collision. Red-first: today's SKIPS step says only
// "Extract the skip names ... write them to a scratch file" — it never mentions a file qualifier,
// a bare-names fallback, or pytest's path::name form at all.
test('AC-20260821-03-8: the SKIPS step\'s extraction instruction names the <relpath>::<name> qualifier form (pytest-style) and instructs bare names only when the runner reports no path — red-first, since today\'s step gives no qualifier guidance at all', () => {
  const host = makeSkipsHost()
  const r1 = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'SKIPS',
    'setup precondition: a gate row reporting skips > 0 with no skips file marked must land state SKIPS before this AC can be exercised: ' + r1.stdout + r1.stderr)
  assert.match(r1.stdout, /<relpath>::<name>/,
    'the SKIPS step must literally name the <relpath>::<name> qualifier form — route 3 ' +
    '(specs/20260821/03-cross-spec-skip-mapping.md D1) consumes exactly this shape, and a prompt ' +
    'that omits it starves the fix: a session extracting only bare test names produces the same ' +
    'unmapped input the new mapping route cannot use: ' + r1.stdout)
  assert.match(r1.stdout, /pytest/i,
    'the instruction must name pytest\'s path::name form as the worked example of a runner that ' +
    'emits a file qualifier: ' + r1.stdout)
  assert.match(r1.stdout, /bare names?/i,
    'the instruction must cover the bare-names case for a runner that emits no path at all: ' + r1.stdout)
  assert.match(r1.stdout, /no path/i,
    'the bare-names instruction must be conditioned on "the runner reports no path" — an ' +
    'unconditional bare-names instruction would tell every session to strip qualifiers regardless ' +
    'of what the runner actually emitted, starving route 3 for every runner that DOES emit one: ' + r1.stdout)
})

test('AC-20260820-07-11: WHEN --state is passed THE SYSTEM prints the bare state name only', () => {
  const host = makeHost()
  run(host.root, host.spec)
  const r = run(host.root, host.spec, '--state')
  assert.strictEqual(r.status, 0, '--state must exit 0 for a non-blocked state: ' + r.stdout + r.stderr)
  assert.strictEqual(r.stdout.trim(), 'REVIEWER',
    '--state must print exactly the bare state name and nothing else — a caller scripting against this needs one clean token: ' + JSON.stringify(r.stdout))
})

test('AC-20260820-07-12 (also AC-20260821-04-9, AC-20260823-07-6, and AC-20260830-02-2, SHALL CONTINUE TO): WHEN merge-strategy is marked from the main root in a two-branch fixture THE SYSTEM runs merge, cleanup, and verify — promoting the worktree\'s ledger and retained evidence into the main root (exact-line / filename dedup) and leaving the worktree clean for a plain `git worktree remove` — prints spec-status --next verbatim, and lands DONE; the same mark from inside the build worktree is refused with a relocate instruction (AC-20260823-07-6: this closed-success call, on a tree carrying no deviations sidecar, must keep succeeding once the deviations backstop lands; AC-20260830-02-2: the same closed-success call, now also running the close-time host-gate re-run over a green gateCommand "true", must keep succeeding and land MERGE, never refuse a genuinely green gate)', () => {
  const root = fs.realpathSync(tmpdir('rvdrv-merge'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  // AC-20260830-02-2: gateCommand "true" is the AC's own worked example of a genuinely green
  // gate — the close-time gate re-run (D1) must observe it pass and never refuse this mark.
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'true',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const baseSha = g('rev-parse', 'HEAD').trim()

  const created = runBash('scripts/merge-back.sh', ['create', '--source', 'spec/99-drv-merge', '--root', root])
  assert.strictEqual(created.status, 0, 'setup: worktree creation must succeed: ' + created.stderr)
  const wt = created.stdout.trim().split('\n').pop()

  fs.mkdirSync(path.join(wt, 'specs/20260820'), { recursive: true })
  const spec = path.join(wt, 'specs/20260820/99-drv-merge.md')
  fs.writeFileSync(spec, specBody({ diffBase: baseSha, acId: 'AC-20260820-99-3' }).replace('diff_base:', 'build_base:'))
  fs.writeFileSync(path.join(wt, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.mkdirSync(path.join(wt, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(wt, 'tests/foo.test.js'), GREEN_TEST.replace('AC-20260820-99-1', 'AC-20260820-99-3'))
  const gw = (...a) => execFileSync('git', ['-C', wt, ...a], { encoding: 'utf8' })
  gw('add', '-A'); gw('commit', '-q', '-m', 'implement')

  const sidecarName = path.basename(spec).replace(/\.md$/, '.review')

  run(wt, spec)
  assert.strictEqual(stateOf(wt, spec), 'REVIEWER', 'setup: the two-branch fixture must reach REVIEWER on green legs')
  const returnFile = returnFileWith('rvdrv-merge-return', CLEAN_RETURN)
  run(wt, spec, '--mark', 'reviewer-returned', '--file', returnFile)
  run(wt, spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(wt, spec), 'CLOSE', 'setup: a clean pass must reach CLOSE')

  // The session's close commit — specific file only, never a blind `add -A` that would scoop up
  // the sidecar (never committed, per D10).
  gw('add', 'specs/20260820/99-drv-merge.md')
  gw('commit', '-q', '-m', 'close')
  const closeR = run(wt, spec, '--mark', 'closed')
  assert.strictEqual(closeR.status, 0,
    'AC-20260830-02-2: closed must succeed once the tree is clean apart from the sidecar, INCLUDING the new close-time host-gate re-run over gateCommand "true" — a regression here means D1\'s gate check began refusing a genuinely green gate: ' + closeR.stdout + closeR.stderr)
  assert.strictEqual(stateOf(wt, spec), 'MERGE',
    'AC-20260830-02-2: a closed spec whose gate is green must land state MERGE, unchanged by the new close-time gate check')

  const refused = run(wt, spec, '--mark', 'merge-strategy', 'ff-only')
  assert.strictEqual(refused.status, 2,
    'marking merge-strategy while the driver\'s own inherited CWD is inside the build worktree must be refused — cleanup would otherwise delete the directory the session stands in: ' + refused.stdout + refused.stderr)
  assert.match(refused.stdout + refused.stderr, /relocate/i,
    'the refusal must print the relocate instruction so the session knows to ExitWorktree/cd before retrying: ' + refused.stdout + refused.stderr)
  assert.ok(fs.existsSync(wt), 'a refused merge-strategy mark must never remove the worktree')

  const merged = run(root, spec, '--mark', 'merge-strategy', 'ff-only')
  assert.strictEqual(merged.status, 0,
    'the same mark, issued with CWD relocated to the main root, must be accepted and run merge + cleanup + verify: ' + merged.stdout + merged.stderr)
  assert.match(merged.stdout, /DONE/, 'a completed merge-strategy mark must land (and report) the terminal state DONE: ' + merged.stdout)

  assert.ok(!fs.existsSync(wt),
    'cleanup must remove the build worktree — the sidecar living inside it dies with it, per D10\'s "dies with the worktree at cleanup, by design"')
  assert.match(fs.readFileSync(path.join(root, 'specs/20260820/99-drv-merge.md'), 'utf8'), /status:\s*done/,
    'the merge must fast-forward the close commit into the main root — the root\'s own copy of the spec must now read status: done')
  assert.ok(!fs.existsSync(path.join(root, 'specs/20260820', sidecarName)),
    'the sidecar must never reach the main root through the merge — it is working state the close commit deliberately excludes (D10), and a copy landing here would be committed review scratch that survives the worktree it was supposed to die with')

  const status = runNode('scripts/spec-status.js', ['--root', root, '--next'])
  assert.strictEqual(status.status, 0, 'spec-status.js --next must succeed against the post-merge root: ' + status.stdout + status.stderr)
  assert.ok(status.stdout.trim() && merged.stdout.includes(status.stdout.trim()),
    'the driver must print spec-status --next\'s output VERBATIM as the closing pointer — it is the only source of the "what now" suggestion, and independently re-deriving it against the post-merge root must reproduce byte-identical text: ' + JSON.stringify({ driver: merged.stdout, status: status.stdout }))
})

// specs/20260820/07-review-driver.md (2026-08-21 review, rulings R8/R9/R10): three fixes landed
// past the original AC-1..12 build. R9: every child this driver spawns is wrapped by runChild(),
// which fails closed on spawnSync's status === null (signal death, spawn failure, maxBuffer
// overflow) instead of tolerating it as a silent pass — the reviewer's own executed repro was a
// gateCommand that SIGKILLs review-legs.js itself via the `bash -c` tail-exec trick, which the
// OLD driver let through as `state: REVIEWER` over a manifest nobody wrote. R8: a cold invocation
// on a spec already `status: done` whose sidecar carries no closeRunId of ITS OWN run is refused
// (exit 2, names /spec:escape) rather than silently re-walking a review that records nothing —
// note this refusal fires only when the sidecar directory exists (a stray/hand-recreated
// artifact); a `done` spec with NO sidecar at all stays the legitimate post-merge DONE fast path
// (R2 arm (a), unaffected). R10: the CLOSE step's close-commit instruction now excludes the
// sidecar + ledger + retained-evidence paths when running in a linked worktree (they promote to
// the main root only after the merge lands), but includes them unchanged when running in-place.

function makeKillHost() {
  const root = fs.realpathSync(tmpdir('rvdrv-kill'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    // `bash -c '<cmd>'` tail-exec's a lone last command, so this node process's ppid IS
    // review-legs.js's own pid, not bash's — the SIGKILL lands on the leg runner itself.
    gateCommand: "node -e \"process.kill(process.ppid,'SIGKILL')\"",
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const diffBase = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(root, 'specs/20260820'), { recursive: true })
  const spec = path.join(root, 'specs/20260820/99-drv-kill.md')
  fs.writeFileSync(spec, specBody({ diffBase, acId: 'AC-20260820-99-4' }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST.replace('AC-20260820-99-1', 'AC-20260820-99-4'))
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { root, spec, sidecar: spec.replace(/\.md$/, '.review') }
}

test('AC-20260820-07-14: WHEN the gateCommand SIGKILLs review-legs.js itself THE SYSTEM exits 2 naming the dead child, never reports state REVIEWER, and never writes manifest-1.jsonl', () => {
  const host = makeKillHost()
  const r = run(host.root, host.spec)
  assert.strictEqual(r.status, 2,
    'a leg runner that dies by signal mid-run must be treated as an unrun check, never a pass — exit 0 here would hand the session a manifest path that was never written: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /review-legs\.js/,
    'the refusal must name review-legs.js as the dead child so the session knows which subprocess died, not just that something failed: ' + r.stderr)
  const manifestPath = path.join(host.sidecar, 'manifest-1.jsonl')
  assert.ok(!fs.existsSync(manifestPath),
    'a signal-killed leg runner must leave no manifest-1.jsonl behind — a file existing here would mean partial evidence got treated as trustworthy: ' + JSON.stringify(fs.existsSync(host.sidecar) ? fs.readdirSync(host.sidecar) : []))

  const r2 = run(host.root, host.spec, '--state')
  assert.notStrictEqual(r2.stdout.trim(), 'REVIEWER',
    'a re-invocation after the kill must never derive state REVIEWER — that would mean the driver advanced past a leg run that never actually produced evidence: ' + r2.stdout + r2.stderr)
  assert.strictEqual(r2.status, 2,
    'the SAME unfixed host must refuse identically on re-invocation (the kill reproduces every time) rather than flip to a stale cached REVIEWER state: ' + r2.stdout + r2.stderr)
  assert.ok(!fs.existsSync(manifestPath),
    'the re-invocation must also leave manifest-1.jsonl unwritten — the underlying cause (the gateCommand) was never fixed, so nothing new can have been trusted into existence: ' + r2.stdout + r2.stderr)
})

function makeDoneHost() {
  const root = fs.realpathSync(tmpdir('rvdrv-done'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }))
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const diffBase = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(root, 'specs/20260820'), { recursive: true })
  const spec = path.join(root, 'specs/20260820/99-drv-done.md')
  fs.writeFileSync(spec, specBody({ status: 'done', diffBase, acId: 'AC-20260820-99-5' }))
  g('add', '-A'); g('commit', '-q', '-m', 'spec')
  return { root, spec, sidecar: spec.replace(/\.md$/, '.review') }
}

test('AC-20260820-07-15: WHEN a done spec\'s sidecar exists but does not record this run\'s own closeRunId THE SYSTEM refuses (exit 2, names /spec:escape) and appends no ledger line, in BOTH an empty hand-recreated sidecar and one carrying stray marks with no closeRunId', () => {
  const host = makeDoneHost()
  const ledger = path.join(host.root, '.claude/spec-runs.jsonl')
  const ledgerSnap = () => (fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8') : '')

  // Case 1: sidecar directory hand-recreated with nothing in it (no review-state.json at all).
  fs.mkdirSync(host.sidecar, { recursive: true })
  const before1 = ledgerSnap()
  const r1 = run(host.root, host.spec)
  assert.strictEqual(r1.status, 2,
    'a done spec whose sidecar carries no closeRunId of its own must be refused, not walked as a fresh review that would record nothing: ' + r1.stdout + r1.stderr)
  assert.match(r1.stderr, /\/spec:escape/,
    'the refusal must name /spec:escape as the remedy — that command exists precisely to record a defect escaping an already-passed review: ' + r1.stderr)
  assert.strictEqual(ledgerSnap(), before1,
    'the refused cold invocation must append NO ledger line — the old bug was a full review walk over a done spec recording nothing while looking like a real run: ' + JSON.stringify({ before: before1, after: ledgerSnap() }))

  // Case 2: sidecar carries a hand-written review-state.json with unrelated marks but no closeRunId
  // (an aborted prior run's stray artifact) — must refuse identically.
  fs.writeFileSync(path.join(host.sidecar, 'review-state.json'), JSON.stringify({ iteration: 1, reviewerReturnFile: 'x' }))
  const before2 = ledgerSnap()
  const r2 = run(host.root, host.spec)
  assert.strictEqual(r2.status, 2,
    'a sidecar carrying OTHER marks but still no closeRunId must be refused the same way — closeRunId, not sidecar existence alone, is the signal that THIS run already closed: ' + r2.stdout + r2.stderr)
  assert.match(r2.stderr, /\/spec:escape/,
    'this case must also name /spec:escape: ' + r2.stderr)
  assert.strictEqual(ledgerSnap(), before2,
    'this case must also append no ledger line: ' + JSON.stringify({ before: before2, after: ledgerSnap() }))

  // Non-regression: a done spec with NO sidecar at all is the legitimate post-merge fast path
  // (the sidecar is deleted at DONE) and must keep printing DONE at exit 0 — this refusal must
  // not over-fire onto the ordinary completed-review case.
  fs.rmSync(host.sidecar, { recursive: true, force: true })
  const r3 = run(host.root, host.spec)
  assert.strictEqual(r3.status, 0,
    'a done spec with no sidecar at all must NOT be refused — that is the ordinary post-merge state (sidecar deleted at DONE), and refusing it here would break every already-completed review: ' + r3.stdout + r3.stderr)
  assert.match(r3.stdout, /state: DONE/,
    'a done spec with no sidecar must still print state DONE: ' + r3.stdout)

  // AC-20260820-07-12's own fixture already proves the OTHER direction of R8 (a sidecar that DOES
  // carry this run's own closeRunId keeps flowing to MERGE/DONE) — not duplicated here.
})

test('AC-20260820-07-16: the CLOSE step\'s close-commit instruction excludes the sidecar/ledger/retained-evidence paths in a linked worktree but includes them unchanged when running in-place', () => {
  // In-place branch: a plain tmpdir host has no linked worktree, so repoRoot === mainRoot.
  const host = makeHost()
  toReviewer(host)
  const returnFile = returnFileWith('rvdrv-close-inplace', CLEAN_RETURN)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
  const inPlaceR = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE', 'setup: a clean in-place pass must reach CLOSE')
  assert.doesNotMatch(inPlaceR.stdout, /EXCEPT/,
    'an in-place review (repoRoot === mainRoot) must instruct that EVERYTHING rides the close commit — an EXCEPT clause here would wrongly exclude evidence that has nowhere else to be promoted from: ' + inPlaceR.stdout)
  assert.match(inPlaceR.stdout, /Commit everything still uncommitted on the working branch \(never --no-verify\)/,
    'the in-place close-commit line must instruct committing everything uncommitted, unconditionally: ' + inPlaceR.stdout)

  // Linked-worktree branch: the same two-branch fixture AC-20260820-07-12 drives to CLOSE.
  const root = fs.realpathSync(tmpdir('rvdrv-close-wt'))
  const g = gitRepo(root)
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

  const created = runBash('scripts/merge-back.sh', ['create', '--source', 'spec/99-drv-close-wt', '--root', root])
  assert.strictEqual(created.status, 0, 'setup: worktree creation must succeed: ' + created.stderr)
  const wt = created.stdout.trim().split('\n').pop()

  fs.mkdirSync(path.join(wt, 'specs/20260820'), { recursive: true })
  const spec = path.join(wt, 'specs/20260820/99-drv-close-wt.md')
  fs.writeFileSync(spec, specBody({ diffBase: baseSha, acId: 'AC-20260820-99-6' }).replace('diff_base:', 'build_base:'))
  fs.writeFileSync(path.join(wt, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.mkdirSync(path.join(wt, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(wt, 'tests/foo.test.js'), GREEN_TEST.replace('AC-20260820-99-1', 'AC-20260820-99-6'))
  const gw = (...a) => execFileSync('git', ['-C', wt, ...a], { encoding: 'utf8' })
  gw('add', '-A'); gw('commit', '-q', '-m', 'implement')
  const wtSidecarRel = 'specs/20260820/99-drv-close-wt.review'

  run(wt, spec)
  assert.strictEqual(stateOf(wt, spec), 'REVIEWER', 'setup: the worktree fixture must reach REVIEWER on green legs')
  const wtReturnFile = returnFileWith('rvdrv-close-wt-return', CLEAN_RETURN)
  run(wt, spec, '--mark', 'reviewer-returned', '--file', wtReturnFile)
  const wtR = run(wt, spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(wt, spec), 'CLOSE', 'setup: a clean worktree pass must reach CLOSE')

  assert.match(wtR.stdout, new RegExp('EXCEPT ' + wtSidecarRel.replace(/\//g, '\\/') + '\\/'),
    'a linked-worktree review must name its OWN sidecar path as excluded from the close commit — evidence promotion (only once the merge lands) is what moves it into the main root, not this commit: ' + wtR.stdout)
  assert.match(wtR.stdout, /EXCEPT[^\n]*\.claude\/spec-runs\.jsonl/,
    'the exclusion must name .claude/spec-runs.jsonl — committing the ledger from the worktree now would leave the tree dirty after evidence promotion runs post-merge, per R3\'s "cleanup exits 2 after the merge already landed": ' + wtR.stdout)
  assert.match(wtR.stdout, /EXCEPT[^\n]*\.claude\/spec-runs\//,
    'the exclusion must also name .claude/spec-runs/ (the retained-evidence directory) for the same reason: ' + wtR.stdout)
  assert.doesNotMatch(wtR.stdout, /Commit everything still uncommitted on the working branch \(never --no-verify\) —/,
    'the worktree branch must NOT print the unconditional in-place close-commit line — the two branches must read as genuinely different instructions, not the same text with an aside: ' + wtR.stdout)

  // Clean up: this fixture's worktree is left dangling deliberately (the test never marks
  // closed/merges it) — merge-back.sh has its own idempotent cleanup path and stray worktrees
  // under tmpdir() do not affect other tests, matching this file's existing worktree fixtures.
})

// specs/20260821/02-replay-review-phase.md (2026-08-21, brief 14): the reviewer-replay harness
// shipped 2026-08-19 as an ADVISORY — review's CLEAN close printed `replay is DUE — run
// /spec:replay` and nothing ran it. This repo went due at 5 reviews and skipped the reminder
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

test('AC-20260821-02-1: WHEN a CLEAN close reaches REPLAY and the harness reports the window is not yet due THE SYSTEM transitions straight to DONE, printing the harness\'s own not-due line (reviewsSince=3) rather than deriving dueness itself', () => {
  const host = makeReplayHost('rvdrvreplaynotdue', {
    acId: 'AC-20260820-99-7',
    seedRows: [seedReplayRow('caught', 'rv_prior000000'), seedReviewRow(1), seedReviewRow(2)],
  })
  driveToClose(host, 'rvdrv-replay-notdue-ret')
  commitClose(host)
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0,
    'a not-due CLEAN close must still be accepted — REPLAY may never turn a finished review into a failure: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /not due/,
    'the driver must print the replay harness\'s own not-due verdict; a driver that decides dueness itself becomes a second derivation of the measurement window and will drift from replay.js: ' + r.stdout)
  assert.match(r.stdout, /reviewsSince=3/,
    'the harness\'s own count must be surfaced verbatim (2 seeded review rows + this run\'s close row after the last caught replay) — a hand-composed count hides a window-semantics change instead of failing on it: ' + r.stdout)
  assert.strictEqual(stateOf(host.root, host.spec), 'DONE',
    'a not-due close must pass through REPLAY untouched and land DONE — parking a review that owes no measurement would make every close hostage to the harness: ' + r.stdout)
})

test('AC-20260821-02-2: WHEN due and --select yields an eligible CLEAN row THE SYSTEM prints an execution step naming spec/commands/replay.md plus the selection\'s spec path and reviewRunId, reports state REPLAY, and prints no retired manual /spec:replay reminder anywhere in the run (D8)', () => {
  const host = makeReplayHost('rvdrvreplaydue', { acId: 'AC-20260820-99-8', seedRows: fiveSeedReviews })
  const closeStep = driveToClose(host, 'rvdrv-replay-due-ret')
  assert.doesNotMatch(closeStep.stdout, /replay is DUE/,
    'D8: the CLOSE step must no longer carry the advisory reminder — a printed "run it yourself" line is the exact mechanism this spec exists to replace, and leaving it beside a state machine that now runs the replay itself tells the user to do the work twice: ' + closeStep.stdout)
  assert.doesNotMatch(closeStep.stdout, /run \/spec:replay/,
    'D8: no step may instruct the session to run /spec:replay by hand at close — REPLAY executes replay.md\'s phases in this session instead: ' + closeStep.stdout)
  commitClose(host)
  const runId = closeRunIdOf(host.root)
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0,
    'a due CLEAN close must be accepted and enter REPLAY, never refused: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /spec\/commands\/replay\.md/,
    'the execution step must name spec/commands/replay.md as the executor — duplicating its phases into the driver or review.md is the collision class the host Gotchas already record twice: ' + r.stdout)
  assert.match(r.stdout, new RegExp(host.specRel.replace(/[.\/]/g, '\\$&')),
    'the step must inline --select\'s chosen spec path; a step that omits it forces the session to re-derive the target by hand, which is what the driver exists to prevent: ' + r.stdout)
  assert.ok(r.stdout.includes(runId),
    'the step must inline --select\'s reviewRunId — it is the join key the replay row must carry for the mark to be satisfiable at all: ' + JSON.stringify({ runId, stdout: r.stdout }))
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY',
    'a due close with a selected target must PARK at REPLAY — reaching DONE with the measurement unrun is precisely the skip this spec removes: ' + r.stdout)
  assert.doesNotMatch(r.stdout, /replay is DUE/,
    'D8: the retired advisory line must not survive into the REPLAY step either: ' + r.stdout)
})

// specs/20260823/09-replay-baseline-attribution.md D6 (2026-08-23): replay.js --select gains two
// tokens (baselineRed/baselineLegs) appended after the five this driver already parses — the
// baseline step 7 attributes red legs against. parseSelection must capture them when present
// (AC-7, proven below via the real replay.js's actual seven-token output) and tolerate their
// absence without dying (AC-8) — but the real replay.js NEVER omits those tokens, so AC-8's
// absent-token case cannot be reached through this exec fixture at all; it's proven directly in
// tests/parse-selection/parse-selection.test.js instead (2026-08-24 review finding).
test('AC-20260823-09-7: WHEN --select prints the two new baseline tokens THE SYSTEM prints baselineRed: and baselineLegs: lines in the REPLAY step body, inlining --select\'s own attribution baseline for step 7 to read', () => {
  const host = makeReplayHost('rvdrvreplaybaseline', { acId: 'AC-20260820-99-17', seedRows: fiveSeedReviews })
  driveToClose(host, 'rvdrv-replay-baseline-ret')
  commitClose(host)
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0,
    'D6: a due close with a selected target carrying baseline tokens must still be accepted into REPLAY: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY',
    'setup precondition: the fixture must park at REPLAY before the baseline-token printing can be exercised: ' + r.stdout)
  assert.match(r.stdout, /baselineRed:\s*\S+/,
    'D6/AC-7: the REPLAY step body must print a baselineRed: line — omitting it leaves replay.md\'s step 7 ' +
    'with no baseline to attribute red legs against, forcing the exact rp_1b176ebff5c7 falsification this ' +
    'spec exists to stop: ' + r.stdout)
  assert.match(r.stdout, /baselineLegs:\s*\S+/,
    'D6/AC-7: the REPLAY step body must print a baselineLegs: line alongside baselineRed — step 7\'s D4 ' +
    'reconcile exemption and D5 question seam both need to know which legs the baseline recorded at all, ' +
    'not just which of them were red: ' + r.stdout)
})

// 2026-08-24 review of specs/20260823/09-replay-baseline-attribution.md: this test previously
// claimed AC-20260823-09-8 (a FIVE-token line, neither baseline token present) but its fixture —
// makeReplayHost driving the REAL spec/scripts/replay.js — can never produce one: replay.js:340
// unconditionally prints both baselineRed=/baselineLegs= as VALUES, never omits the keys. So this
// exec test always exercised the seven-token shape and its two assertions passed trivially
// regardless of whether the regex's absence fallback worked. AC-8's actual coverage (the five-token
// / absent-token shape) now lives in tests/parse-selection/parse-selection.test.js, which drives
// the extracted parser directly with a hand-built five-token string — the only way to reach that
// branch. This test is retargeted to what its exec fixture genuinely proves: a seven-token line
// (today's real replay.js output) still enters REPLAY without dying.
test('WHEN the driver parses a seven-token selection line carrying both baseline tokens (replay.js\'s real output shape) THE SYSTEM enters the REPLAY state and prints the step, never a parse die', () => {
  const host = makeReplayHost('rvdrvreplaynobaseline', { acId: 'AC-20260820-99-18', seedRows: fiveSeedReviews })
  driveToClose(host, 'rvdrv-replay-nobaseline-ret')
  commitClose(host)
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0,
    'a seven-token selection line — the only shape the real replay.js binary emits — must be ACCEPTED: ' +
    r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY',
    'a close with a selected target carrying both baseline tokens must park at REPLAY exactly like any ' +
    'other selected close: ' + r.stdout)
  assert.doesNotMatch(r.stdout, /\bdie\b|parse.*fail|cannot parse/i,
    'a well-formed seven-token line must never be treated as a parse failure: ' + r.stdout)
})

test('AC-20260821-02-3: WHEN due but --select resolves no usable CLEAN target THE SYSTEM transitions to DONE printing the harness\'s own advisory — a due-but-unmeasurable close is never parked', () => {
  // The exit-1 arm ("no eligible CLEAN row in the window") is structurally unreachable from
  // REPLAY: the driver's own close appends a CLEAN review row with a runId moments earlier, so a
  // candidate always exists. The reachable arm is --select failing to RESOLVE that candidate
  // (exit 4) — here because the spec's newest commit has no parent revision carrying the spec.
  const host = makeReplayHost('rvdrvreplaynosel', { acId: 'AC-20260820-99-9', seedRows: fiveSeedReviews })
  driveToClose(host, 'rvdrv-replay-nosel-ret')
  commitClose(host, { amend: true })
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0,
    'a close the harness cannot select a target for must still be accepted — an unmeasurable window may never fail a finished review: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /replay\.js:/,
    'the harness\'s own advisory must be printed verbatim so the reason the measurement was skipped is on the record, not silently swallowed: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'DONE',
    'a due close with nothing selectable must land DONE, never park — the review would otherwise be unfinishable through no fault of its own: ' + r.stdout)
})

test('AC-20260821-02-4: WHEN --mark replay-recorded is given and the ledger holds no stage:"replay" row for the sidecar target\'s reviewRunId THE SYSTEM refuses with exit 2, naming the missing row for that reviewRunId and the replay.js --record remedy', () => {
  const host = makeReplayHost('rvdrvreplaynorow', { acId: 'AC-20260820-99-10', seedRows: fiveSeedReviews })
  driveToClose(host, 'rvdrv-replay-norow-ret')
  commitClose(host)
  const runId = closeRunIdOf(host.root)
  run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY', 'setup precondition: the due fixture must park at REPLAY')

  // A replay row for a DIFFERENT target — a concurrent session's measurement — must not satisfy
  // this review's mark: the join is on the selected target's reviewRunId, never a bare count.
  fs.appendFileSync(path.join(host.root, '.claude/spec-runs.jsonl'), JSON.stringify({
    ts: '2026-08-21T00:00:00Z', stage: 'replay', spec: 'specs/other/01-other.md',
    runId: 'rp_other000000', reviewRunId: 'rv_someoneelse', class: 'off-by-one',
    files: ['x.js'], legs: 'green', outcome: 'caught', tokens: 1,
  }) + '\n')

  const r = run(host.root, host.spec, '--mark', 'replay-recorded')
  assert.strictEqual(r.status, 2,
    'marking replay-recorded with no replay row for THIS review\'s target must be refused — accepting it would let the state machine report a measurement that never happened, which is the procedural-hallucination failure the driver exists to block: ' + r.stdout + r.stderr)
  const out = r.stdout + r.stderr
  assert.ok(out.includes(runId),
    'the refusal must name the target reviewRunId whose replay row is missing, or the session cannot tell which measurement it still owes: ' + JSON.stringify({ runId, out }))
  assert.match(out, /--record/,
    'the refusal must name the replay.js --record remedy — an error path without its remedy command is a hard finding under this repo\'s rules: ' + out)
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY',
    'a refused mark must leave the state unchanged; a foreign session\'s replay row must never advance this review: ' + out)
})

test('AC-20260821-02-5: WHEN a stage:"replay" row for the target reviewRunId exists with the non-measurement outcome setup-failed THE SYSTEM accepts replay-recorded and transitions to DONE — any recorded outcome concludes the review', () => {
  const host = makeReplayHost('rvdrvreplaysetupfail', { acId: 'AC-20260820-99-11', seedRows: fiveSeedReviews })
  driveToClose(host, 'rvdrv-replay-setupfail-ret')
  commitClose(host)
  const runId = closeRunIdOf(host.root)
  run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY', 'setup precondition: the due fixture must park at REPLAY')

  // Recorded through the real harness, never a hand-written line — the mark's join must hold
  // against the row shape replay.js actually appends.
  const rec = runNode('scripts/replay.js', ['--record', '--spec', host.specRel, '--review-run-id', runId,
    '--legs', 'none', '--outcome', 'setup-failed'], { cwd: host.root })
  assert.strictEqual(rec.status, 0, 'setup: replay.js --record must accept a setup-failed row: ' + rec.stdout + rec.stderr)

  const r = run(host.root, host.spec, '--mark', 'replay-recorded')
  assert.strictEqual(r.status, 0,
    'a recorded setup-failed outcome must satisfy the mark — parking a finished review on a broken scratch worktree would make an infrastructure failure block delivery: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'DONE',
    'once any outcome is on the record the review must conclude; the harness stays due (replay.js D5) and retries at the NEXT review, never this one: ' + r.stdout)
})

test('AC-20260821-02-6: WHEN the recorded outcome is missed THE SYSTEM CONTINUES TO leave the reviewed spec at status: done and appends no review-stage ledger row from the mark — replay measures the reviewer, never the verdict', () => {
  const host = makeReplayHost('rvdrvreplaymissed', { acId: 'AC-20260820-99-12', seedRows: fiveSeedReviews })
  driveToClose(host, 'rvdrv-replay-missed-ret')
  commitClose(host)
  const runId = closeRunIdOf(host.root)
  run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY', 'setup precondition: the due fixture must park at REPLAY')

  const scratch = fs.realpathSync(tmpdir('rvdrv-replay-missed-art'))
  const patchFile = path.join(scratch, 'mutation.patch')
  fs.writeFileSync(patchFile, [
    'diff --git a/src/foo.js b/src/foo.js',
    'index 1111111..2222222 100644',
    '--- a/src/foo.js',
    '+++ b/src/foo.js',
    '@@ -1 +1 @@',
    '-module.exports = () => 42',
    '+module.exports = () => 41',
    '',
  ].join('\n'))
  const workflowFile = path.join(scratch, 'blind-return.json')
  fs.writeFileSync(workflowFile, JSON.stringify({ verdict: 'CLEAN', survivors: [], killed: [], reviewerCount: 1, scope: 'full', tokens: 10 }))
  const rec = runNode('scripts/replay.js', ['--record', '--spec', host.specRel, '--review-run-id', runId,
    '--legs', 'green', '--outcome', 'missed', '--class', 'silent-fallback',
    '--patch', patchFile, '--workflow', workflowFile], { cwd: host.root })
  assert.strictEqual(rec.status, 0, 'setup: replay.js --record must accept a missed row: ' + rec.stdout + rec.stderr)

  const reviewsBefore = ledgerRows(host.root).filter((x) => x.stage === 'review').length
  const r = run(host.root, host.spec, '--mark', 'replay-recorded')
  assert.strictEqual(r.status, 0,
    'a missed outcome must conclude the review exactly like a caught one — gating the verdict on the reviewer\'s own score confuses what is being measured: ' + r.stdout + r.stderr)
  assert.match(fs.readFileSync(host.spec, 'utf8'), /^status:\s*done$/m,
    'a missed replay must leave the reviewed spec at status: done — the verdict is committed history and REPLAY may never re-open it: ' + r.stdout)
  assert.strictEqual(ledgerRows(host.root).filter((x) => x.stage === 'review').length, reviewsBefore,
    'the mark must append no review-stage ledger row — a second review row for one review would double-count the very denominator the replay window is measured against: ' + r.stdout)
  assert.strictEqual(stateOf(host.root, host.spec), 'DONE',
    'a recorded missed outcome must land DONE: ' + r.stdout)
})

test('AC-20260821-02-7: WHEN review ran on the originating branch (merge-back skipped with its one-line note) THE SYSTEM still enters REPLAY before DONE — the skip path is not a back door around the measurement', () => {
  const host = makeReplayHost('rvdrvreplayskip', { acId: 'AC-20260820-99-13', seedRows: fiveSeedReviews })
  driveToClose(host, 'rvdrv-replay-skip-ret')
  commitClose(host)
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0, 'setup: the merge-skipped close must be accepted: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /originating branch/,
    'setup precondition: this fixture has no build branch, so the driver must take the merge-skipped arm: ' + r.stdout)
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY',
    'the merge-skipped arm must reach REPLAY too — a review that happened not to run in a worktree owes the same measurement as one that did, and an arm that bypasses REPLAY makes the whole state a matter of where the session happened to be standing: ' + r.stdout)
  assert.doesNotMatch(r.stdout, /^## DONE$/m,
    'the merge-skipped arm must NOT print DONE while a due replay is outstanding: ' + r.stdout)
})

test('AC-20260821-02-2 (worktree merge carrier): WHEN a due CLEAN close merges back from a linked worktree THE SYSTEM survives cleanup — the sidecar is retained in the MAIN root, state is REPLAY, and the printed step names the main-root spec path (D8 (b))', () => {
  const root = fs.realpathSync(tmpdir('rvdrv-replay-wt'))
  const g = gitRepo(root)
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

  const created = runBash('scripts/merge-back.sh', ['create', '--source', 'spec/99-drv-replay-wt', '--root', root])
  assert.strictEqual(created.status, 0, 'setup: worktree creation must succeed: ' + created.stderr)
  const wt = created.stdout.trim().split('\n').pop()

  const specRel = 'specs/20260820/99-drv-replay-wt.md'
  fs.mkdirSync(path.join(wt, 'specs/20260820'), { recursive: true })
  const spec = path.join(wt, specRel)
  fs.writeFileSync(spec, specBody({ diffBase: baseSha, acId: 'AC-20260820-99-14' }).replace('diff_base:', 'build_base:'))
  fs.writeFileSync(path.join(wt, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.mkdirSync(path.join(wt, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(wt, 'tests/foo.test.js'), GREEN_TEST.replace('AC-20260820-99-1', 'AC-20260820-99-14'))
  const gw = (...a) => execFileSync('git', ['-C', wt, ...a], { encoding: 'utf8' })
  gw('add', '-A'); gw('commit', '-q', '-m', 'implement')
  // The ledger lives under the review's own root (the worktree) until the merge promotes it.
  fs.mkdirSync(path.join(wt, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(wt, '.claude/spec-runs.jsonl'),
    fiveSeedReviews.map((r) => JSON.stringify(r)).join('\n') + '\n')

  run(wt, spec)
  assert.strictEqual(stateOf(wt, spec), 'REVIEWER', 'setup: the two-branch fixture must reach REVIEWER on green legs')
  run(wt, spec, '--mark', 'reviewer-returned', '--file', returnFileWith('rvdrv-replay-wt-return', CLEAN_RETURN))
  run(wt, spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(wt, spec), 'CLOSE', 'setup: a clean worktree pass must reach CLOSE')
  gw('add', specRel); gw('commit', '-q', '-m', 'close')
  const closed = run(wt, spec, '--mark', 'closed')
  assert.strictEqual(closed.status, 0, 'setup: closed must succeed: ' + closed.stdout + closed.stderr)

  const merged = run(root, spec, '--mark', 'merge-strategy', 'ff-only')
  assert.strictEqual(merged.status, 0,
    'the merge mark must be accepted and run merge + cleanup + verify before REPLAY: ' + merged.stdout + merged.stderr)
  assert.ok(!fs.existsSync(wt),
    'cleanup must still remove the build worktree — retaining the sidecar for REPLAY may never come at the cost of leaving the worktree behind: ' + merged.stdout)
  const mainSpec = path.join(root, specRel)
  const mainSidecar = path.join(root, 'specs/20260820/99-drv-replay-wt.review/review-state.json')
  assert.ok(fs.existsSync(mainSidecar),
    'the sidecar must survive cleanup in the MAIN root — REPLAY runs after the worktree is gone, and a sidecar that died with it would leave the review unfinishable and its own state unreadable: ' + merged.stdout)
  assert.match(merged.stdout, new RegExp(specRel.replace(/[.\/]/g, '\\$&')),
    'the printed step must name the main-root spec path; naming the deleted worktree path would hand the session a command that cannot run: ' + merged.stdout)
  assert.match(merged.stdout, /spec\/commands\/replay\.md/,
    'the merged path must print the same REPLAY execution step as the in-place path: ' + merged.stdout)
  assert.strictEqual(stateOf(root, mainSpec), 'REPLAY',
    'a due close that merged back must park at REPLAY, re-derivable from the main root alone — a fresh session resuming after the merge has nothing else to read: ' + merged.stdout)
})

// specs/20260823/05-replay-unattended-hardening.md D3 (2026-08-23, rv_387d84a3b424's replay):
// replay.js --select emits a spec's build_base ref verbatim — typically the MOVING ref "main",
// stale the instant the review's own merge lands (observed: reconcile exit 3, phantom out-of-plan
// and unrealized files, until hand-pinned to the true pre-image sha). The close commit is the last
// moment a symbolic base ref and the true pre-image coincide, so the driver stamps a durable
// diff_base into the spec frontmatter at the SAME implementing -> done edit that flips status —
// but only when the frontmatter carries no diff_base already, since an existing pin (however it
// got there) must never be silently repointed. AC-20260823-05-7.

function noDiffBaseSpecBody({ status = 'implementing', tier = 'standard', buildBaseRef, acId }) {
  return `---
status: ${status}
tier: ${tier}
build_base: ${buildBaseRef}
---
# Driver Test Spec (no diff_base)

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
`
}

function makeNoDiffBaseHost() {
  const root = fs.realpathSync(tmpdir('rvdrv-stamp'))
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
  // The work lands on a BRANCH, leaving `main` at the pre-image. Before 2026-09-01 this fixture
  // committed the implementation onto main itself, which made `build_base: main` resolve to HEAD —
  // an empty range, the exact defect spec 20260901/01's review uncovered (every diff-scoped leg
  // reports zero and passes, and the reviewer is handed nothing). The driver now refuses that range
  // on the way in, so the fixture has to model a real one. The AC under test is unchanged — only
  // build_base exists, and `rev-parse main` still names the sha the close flip must stamp.
  g('checkout', '-q', '-b', 'spec/99-drv-stamp')
  fs.mkdirSync(path.join(root, 'specs/20260820'), { recursive: true })
  const spec = path.join(root, 'specs/20260820/99-drv-stamp.md')
  fs.writeFileSync(spec, noDiffBaseSpecBody({ buildBaseRef: 'main', acId: 'AC-20260820-99-16' }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST.replace('AC-20260820-99-1', 'AC-20260820-99-16'))
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { root, spec, sidecar: spec.replace(/\.md$/, '.review') }
}

test('AC-20260823-05-7 / AC-20260824-06-11: WHEN the driver flips a spec whose frontmatter has build_base but no diff_base to status: done THE SYSTEM stamps diff_base: <sha> (the base ref resolved at flip time) into the frontmatter in the same edit, directly after build_base, with no inline comment, and that sha equals the close row\'s diff.base', () => {
  const host = makeNoDiffBaseHost()
  toReviewer(host)
  const beforeText = fs.readFileSync(host.spec, 'utf8')
  assert.doesNotMatch(beforeText, /^diff_base:/m,
    'fixture sanity: this spec must start with no diff_base line at all, or this test cannot tell a genuine ' +
    'stamp apart from a pre-existing value')

  const expectedSha = execFileSync('git', ['-C', host.root, 'rev-parse', 'main'], { encoding: 'utf8' }).trim()

  const returnFile = returnFileWith('rvdrv-stamp-clean', CLEAN_RETURN)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS', 'setup: a returned CLEAN, zero-survivor result must land DISPOSITIONS')
  const r = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(r.status, 0, 'D3: the close flip must still succeed for a spec with no diff_base: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE', 'D3: a zero-survivor disposition must still land CLOSE')

  const afterText = fs.readFileSync(host.spec, 'utf8')
  assert.match(afterText, /^status:\s*done$/m, 'D3: the flip must still write status: done alongside the stamp')
  const fmBlock = afterText.slice(0, afterText.indexOf('\n---', 4))
  const lines = fmBlock.split('\n')
  const buildIdx = lines.findIndex((l) => l.startsWith('build_base:'))
  const diffIdx = lines.findIndex((l) => l.startsWith('diff_base:'))
  assert.ok(buildIdx !== -1, 'sanity: build_base: must survive the flip: ' + fmBlock)
  assert.ok(diffIdx !== -1,
    'D3: a diff_base: line must be stamped into the frontmatter at the implementing -> done flip — without ' +
    'it replay.js --select has nothing durable to read once the review\'s merge makes build_base: main a ' +
    'moving, stale ref: ' + fmBlock)
  assert.strictEqual(diffIdx, buildIdx + 1,
    'D3 Contracts: the stamped diff_base: line must be inserted DIRECTLY AFTER the build_base: line — a ' +
    'stamp landing anywhere else deviates from the pinned frontmatter shape: ' + fmBlock)
  assert.strictEqual(lines[diffIdx].trim(), 'diff_base: ' + expectedSha,
    'D3: the stamped value must be EXACTLY "diff_base: <sha>" with no inline comment (the Contracts\' own ' +
    'comment is illustrative, never emitted) and no trailing text — the sha must be the review\'s own base ' +
    'ref (main) resolved at flip time: ' + JSON.stringify(lines[diffIdx]))

  const closeLedgerLines = fs.readFileSync(path.join(host.root, '.claude/spec-runs.jsonl'), 'utf8').trim().split('\n').filter(Boolean)
  const closeRow = JSON.parse(closeLedgerLines[closeLedgerLines.length - 1])
  assert.strictEqual(closeRow.diff && closeRow.diff.base, expectedSha,
    'AC-20260824-06-11: the close row\'s diff.base must equal the freshly-stamped diff_base sha — one ' +
    'resolution, two carriers (D4): a mismatch would mean the driver resolved the same base ref twice and ' +
    'got two different answers: ' + JSON.stringify(closeRow))
})

test('AC-20260823-05-7: WHEN the driver flips a spec whose frontmatter already carries a diff_base THE SYSTEM leaves that value byte-identical, never overwriting it', () => {
  const host = makeHost() // makeHost()'s specBody() already carries a diff_base line
  toReviewer(host)
  const beforeText = fs.readFileSync(host.spec, 'utf8')
  const beforeMatch = beforeText.match(/^diff_base:.*$/m)
  assert.ok(beforeMatch, 'fixture sanity: makeHost()\'s spec must already carry a diff_base line, or this test proves nothing about the absent-only guard')

  const returnFile = returnFileWith('rvdrv-stamp-existing', CLEAN_RETURN)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
  const r = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(r.status, 0, 'the close flip must succeed for a spec that already carries diff_base: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE')

  const afterText = fs.readFileSync(host.spec, 'utf8')
  const afterMatches = afterText.match(/^diff_base:.*$/gm)
  assert.strictEqual(afterMatches.length, 1,
    'D3: an existing diff_base must never gain a SECOND diff_base line at the flip — an absent-only stamp ' +
    'must check for presence before writing, not just unconditionally append: ' + JSON.stringify(afterMatches))
  assert.strictEqual(afterMatches[0], beforeMatch[0],
    'D3: an existing diff_base value must be left BYTE-IDENTICAL by the close flip — overwriting it would ' +
    'silently repoint a review\'s pinned diff base after the fact: before=' + JSON.stringify(beforeMatch[0]) +
    ' after=' + JSON.stringify(afterMatches[0]))
})

// 2026-08-25 Gotchas ratchet (direct fix, core § Incident Policy): the CLOSE step's prose-cap
// duty was a sentence nothing executed — Prax closed 2026-08-25 at 169/15 with the cap "recorded
// as unmet". The driver now records the count on the review row and refuses --mark closed unless
// prose-cap passes in ratchet mode against that count.
function rulesWithGotchas(root, n) {
  const dir = path.join(root, '.claude/rules')
  fs.mkdirSync(dir, { recursive: true })
  const entries = []
  for (let i = 1; i <= n; i++) entries.push(`- \`[host]\` fixture gotcha ${i}`)
  fs.writeFileSync(path.join(dir, 'spec-pipeline.md'),
    '# Rules\n\n## Review Checks\n\n- none\n\n## Gotchas (evidence-cited)\n\n' + entries.join('\n') + '\n')
}
function makeGotchasHost(n) {
  const host = makeHost({ gotchas: n })
  const g = (...a) => execFileSync('git', ['-C', host.root, ...a], { encoding: 'utf8' })
  toReviewer(host)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('rvdrv-gotchas-' + n, CLEAN_RETURN))
  const d = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE', 'setup precondition: dispositions must reach CLOSE: ' + d.stdout + d.stderr)
  return { ...host, g }
}

test('gotchas ratchet: the review row records the Gotchas count observed at verdict time, and an over-cap section that did not shrink refuses --mark closed', () => {
  const host = makeGotchasHost(20)
  const rows = fs.readFileSync(path.join(host.root, '.claude/spec-runs.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
  const row = rows[rows.length - 1]
  assert.strictEqual(row.stage, 'review')
  assert.strictEqual(row.gotchas, 20,
    'the review row must carry the derived Gotchas count — the ratchet baseline is derived from this observation, never attested: ' + JSON.stringify(row))
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 2,
    'an over-cap section unchanged since the verdict must refuse the close — the prose-only duty is exactly what Prax skipped at 169/15: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /20\/15/, 'the refusal must name the count and cap: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /evict/i, 'the refusal must name the eviction remedy')
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE')
})

test('gotchas ratchet: an over-cap section that lost one net entry since the verdict closes — no flag-day eviction', () => {
  const host = makeGotchasHost(20)
  rulesWithGotchas(host.root, 19)
  host.g('add', '-A'); host.g('commit', '-q', '-m', 'evict one')
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0,
    '19 entries against 20 at verdict is a net eviction and must close — refusing it reinstates the unmeetable gate: ' + r.stdout + r.stderr)
  assert.notStrictEqual(stateOf(host.root, host.spec), 'CLOSE', 'a ratchet-admitted close advances past CLOSE: ' + r.stdout)
})

test('gotchas ratchet: the CLOSE step names the over-cap count and the shrink requirement before the session folds', () => {
  const host = makeGotchasHost(20)
  const r = run(host.root, host.spec)
  assert.match(r.stdout, /Gotchas cap: 20\/15 at verdict — OVER CAP/,
    'the printed CLOSE step must carry the number the close will be judged against — a session that learns it only from the refusal folds first and evicts second: ' + r.stdout)
})

// 2026-08-27 (direct fix, no spec — the CWD-relocation trap): the driver's own replay.js calls were
// never vulnerable (they pass cwd: repoRoot explicitly), but the step it PRINTS hands the executing
// session every other --select value and left the root to be inferred from wherever the shell
// happened to stand. During the review of specs/20260827/01 that shell was inside the replay's own
// scratch worktree, so the measurement row was appended into a tree --teardown deleted seconds
// later. replay.js now takes --root; this pin makes the driver name the value so the session
// executing replay.md's phases has it in hand rather than reconstructing it.
test('replay-root-4: the REPLAY execution step inlines the repo root alongside the other --select values, so the session executing replay.md never has to infer the ledger\'s home from its own working directory', () => {
  const host = makeReplayHost('rvdrvreplayroot', { acId: 'AC-20260820-99-9', seedRows: fiveSeedReviews })
  driveToClose(host, 'rvdrv-replay-root-ret')
  commitClose(host)
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0,
    'a due CLEAN close must still be accepted: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'REPLAY',
    'the run must park at REPLAY for this pin to be about the execution step at all: ' + r.stdout)
  assert.match(r.stdout, /root:\s+\S/,
    'the step must carry a root: value beside spec/reviewRunId/commit/parent/diffBase — every other ' +
    'selection value is inlined precisely so the session never re-derives, and the root is the one whose ' +
    'silent re-derivation cost a measurement on 2026-08-27: ' + r.stdout)
  assert.ok(r.stdout.includes(fs.realpathSync(host.root)) || r.stdout.includes(host.root),
    'the printed root must be the actual repo root the driver resolved, not a placeholder: ' +
    JSON.stringify({ root: host.root, stdout: r.stdout }))
  assert.match(r.stdout, /--root/,
    'the step must name the flag the value feeds — a bare path with no flag beside it is a fact, not an ' +
    'instruction, and the incident happened because the instruction was missing: ' + r.stdout)
})

// specs/20260901/02-run-provenance.md D4 (2026-09-01, brief 18, AC-20260901-02-4): the review
// driver gains --via loop|direct, recorded in review-state.json at sidecar creation (a later
// different value is ignored — the run's provenance is fixed at creation), and passes
// --via <recorded> --model <sessionModel(repoRoot) or omitted when null> on all three verdict.js
// passes. This test is written before spec-session-stamp.sh / lib/session-stamp.js / the driver's
// --via support exist (TDD red, 2026-09-01) and must fail until the driver genuinely threads --via
// through sidecar creation and stamps CLOSE's authoritative row with a real transcript-derived
// model.
//
// specs/20260901/09-disposer-gate.md D4/D9/AC-20260901-09-6 (2026-09-01, brief 18b, rewritten
// in place — never left beside a new test): CHECKPOINT is retired, so this test no longer parks
// on stamp "s1" or rewrites it to "s2" before dispositions can close — a --via loop run now
// lands DISPOSITIONS directly after reviewer-returned, exactly like a --via direct run. The
// close row's checkpoint key is asserted deep-equal to {"outcome":"empty"} instead of
// {"outcome":"cleared"} (D6: a zero-survivor, zero-leg-finding run's disposer mark is recorded
// empty:true, never a checkpoint-clear fact that no longer exists), for both the --via loop run
// and the run created without --via.
test('AC-20260901-02-4 (also AC-20260901-09-6, rewritten in place, D9): a run created with --via loop and later driven to a CLEAN close with a stamp whose transcript ends in an assistant line with model claude-sonnet-5 records via:"loop" in review-state.json at creation and appends a CLEAN row carrying via:"loop", model:"claude-sonnet-5", checkpoint:{"outcome":"empty"}; a run created without --via and without a stamp appends via:"direct", model:null, checkpoint:{"outcome":"empty"}', () => {
  const loopHost = makeHost()
  const rInit = run(loopHost.root, loopHost.spec, '--via', 'loop')
  assert.strictEqual(stateOf(loopHost.root, loopHost.spec), 'REVIEWER',
    'setup precondition: the FIRST invocation (the one that creates the sidecar) must carry --via loop so D4\'s creation-time recording has something to record: ' + rInit.stdout + rInit.stderr)
  const stateAtCreation = JSON.parse(fs.readFileSync(path.join(loopHost.sidecar, 'review-state.json'), 'utf8'))
  assert.strictEqual(stateAtCreation.via, 'loop',
    'review-state.json must record via:"loop" at sidecar creation — a resumed session must report the same via the run started with, not re-derive it from a later invocation: ' + JSON.stringify(stateAtCreation))

  fs.mkdirSync(path.join(loopHost.root, '.claude'), { recursive: true })
  const transcript = path.join(loopHost.root, 'transcript.jsonl')
  fs.writeFileSync(transcript, JSON.stringify({ type: 'assistant', message: { model: 'claude-sonnet-5' } }) + '\n')
  fs.writeFileSync(path.join(loopHost.root, '.claude/spec-session.json'), JSON.stringify({
    session_id: 's1', transcript_path: transcript, cwd: loopHost.root, ts: new Date().toISOString()
  }))

  const returnFile = returnFileWith('rvdrv-provenance-clean', CLEAN_RETURN)
  run(loopHost.root, loopHost.spec, '--mark', 'reviewer-returned', '--file', returnFile)
  // specs/20260901/09-disposer-gate.md D4: a --via loop run now lands DISPOSITIONS directly
  // after reviewer-returned — CHECKPOINT no longer exists as a reachable state, so there is no
  // park to lift and no second stamp write needed before the dispositions-and-close path below.
  assert.strictEqual(stateOf(loopHost.root, loopHost.spec), 'DISPOSITIONS',
    'setup precondition/AC-20260901-09-1: a --via loop run\'s reviewer-returned mark must land DISPOSITIONS directly, never CHECKPOINT, so this AC\'s dispositions-and-close path can proceed immediately: ')

  const ledger = path.join(loopHost.root, '.claude/spec-runs.jsonl')
  const before = fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean) : []
  const r = run(loopHost.root, loopHost.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(r.status, 0, 'a zero-survivor, zero-finding disposition must be accepted: ' + r.stdout + r.stderr)
  const after = fs.readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean)
  assert.strictEqual(after.length, before.length + 1, 'exactly one ledger line must be appended for the authoritative CLOSE pass: ' + JSON.stringify({ before, after }))
  const row = JSON.parse(after[after.length - 1])
  assert.strictEqual(row.verdict, 'CLEAN', 'the authoritative pass must still derive CLEAN for a zero-survivor, zero-leg-finding run: ' + JSON.stringify(row))
  assert.strictEqual(row.via, 'loop', 'the appended CLEAN row must carry the via recorded at sidecar creation: ' + JSON.stringify(row))
  assert.strictEqual(row.model, 'claude-sonnet-5',
    'the appended CLEAN row must carry the model derived at row-write time from the stamped transcript\'s last assistant line: ' + JSON.stringify(row))
  const keys = Object.keys(row)
  assert.strictEqual(keys[keys.indexOf('verdict') + 1], 'checkpoint',
    'AC-20260901-09-6/D5: the checkpoint key must sit immediately after verdict on the close row: ' + JSON.stringify(row))
  assert.deepStrictEqual(row.checkpoint, { outcome: 'empty' },
    'AC-20260901-09-6: a zero-survivor, zero-leg-finding --via loop run must carry checkpoint:{"outcome":"empty"} on its close row — no disposer ran because there was nothing to disposition, and D6 must never claim "disposer" when the pools were empty: ' + JSON.stringify(row))

  const directHost = makeHost()
  toReviewer(directHost)
  const directReturnFile = returnFileWith('rvdrv-provenance-direct', CLEAN_RETURN)
  run(directHost.root, directHost.spec, '--mark', 'reviewer-returned', '--file', directReturnFile)
  const directLedger = path.join(directHost.root, '.claude/spec-runs.jsonl')
  const rDirect = run(directHost.root, directHost.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(rDirect.status, 0, 'the no-via, no-stamp run must also close cleanly: ' + rDirect.stdout + rDirect.stderr)
  const directRows = fs.readFileSync(directLedger, 'utf8').trim().split('\n').filter(Boolean)
  const directRow = JSON.parse(directRows[directRows.length - 1])
  assert.strictEqual(directRow.via, 'direct',
    'a run created with no --via flag must default to via:"direct" on its appended CLOSE row: ' + JSON.stringify(directRow))
  assert.strictEqual(directRow.model, null,
    'a run with no .claude/spec-session.json stamp anywhere must carry model:null on its appended CLOSE row: ' + JSON.stringify(directRow))
  assert.deepStrictEqual(directRow.checkpoint, { outcome: 'empty' },
    'AC-20260901-09-6: a run created without --via must ALSO carry checkpoint:{"outcome":"empty"} on its close row — D6 threads the derived outcome onto every review verdict pass for both via values, not just loop: ' + JSON.stringify(directRow))
})
