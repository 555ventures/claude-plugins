'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runNode, runBash, gitRepo } = require('../helpers')
const { GREEN_TEST, specBody, makeHost, run, stateOf, toReviewer, returnFileWith, CLEAN_RETURN, SURVIVOR_RETURN } = require('./review-driver.fixtures')

// Shard A of the review-driver family (split from review-driver.test.js by
// specs/20260903/06-test-suite-critical-path.md D1/D3). Owns:
// specs/20260820/07-review-driver.md (brief 16) AC-20260820-07-1,3,4,5,9,10,11,12,14,15;
// specs/20260821/03-cross-spec-skip-mapping.md AC-20260821-03-8; specs/20260821/04 AC-20260821-04-8/-9;
// specs/20260823/07; specs/20260830/02-2; specs/20260901/02-run-provenance.md AC-20260901-02-4;
// specs/20260901/09-disposer-gate.md AC-20260901-09-6; specs/20260902/05-manifest-stamped-scope.md
// AC-20260902-05-13. Shared helpers live in review-driver.fixtures.js (D2).

function makeSkipsHost() {
  const root = fs.realpathSync(tmpdir('rvdrv-skips'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    // The injected skips line comes AFTER the runner: the skip pattern reads the LAST match, as
    // every real runner prints its summary line last (specs/20260903/02-whole-suite-review-leg.md
    // close record) — an echo ahead of the runner would be shadowed by node's own `ℹ skipped 0`.
    gateCommand: "node --test {testDirs}; echo 'ℹ skipped 1'",
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

// specs/20260901/01-build-driver.md AC-20260901-01-17 (brief 18, tagged in place — never
// weakened): D11 extracts runChild/writeOut/appendLedger/loadSidecar/saveSidecar into the
// new lib/driver-io.js and this driver imports from it, deleting its own private copies, so the
// build driver can share the same fail-closed helpers instead of growing a second set. This
// exact test is the byte-identity regression net for that extraction — a behavior change here
// (including one introduced while splicing in the shared helpers) would show up as a diff
// between the driver's appended row and a direct verdict.js re-invocation with the row's own
// recorded flags.
test('AC-20260820-07-2 (also AC-20260821-04-8, SHALL CONTINUE TO) / AC-20260824-06-5 / AC-20260901-01-17 (SHALL CONTINUE TO) / AC-20260901-09-13 / AC-20260903-02-13 (SHALL CONTINUE TO — the "suite" leg beside this row): WHEN the synthetic gate fails THE SYSTEM appends exactly one GATE_RED ledger line byte-equal to verdict.js\'s own line, whose diff.base/diff.head/diff.dirty name the reviewed range, prints the red leg + remedy, and reports state STOPPED — the reviewer step is never printed', () => {
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

  // specs/20260901/02-run-provenance.md D4/A6 (brief 18, AC-20260901-02-4's sibling pin): the
  // driver always passes --via/--model onto every verdict.js pass, so this fixture
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

// specs/20260902/05-manifest-stamped-scope.md D6: scope leaves the reviewer return contract —
// the REVIEWER step text and both reviewer-returned refusal messages (malformed JSON, missing
// survivors) must name the return shape as {verdict, survivors, killed, reviewerCount, tokens}
// with no "scope" key anywhere in the printed text.
test('AC-20260902-05-13: WHEN the driver prints the REVIEWER step, or refuses a reviewer-returned file that is not JSON or lacks survivors, THE SYSTEM names the return shape as {verdict, survivors, killed, reviewerCount, tokens} and the printed text SHALL NOT contain the substring "scope"', () => {
  const host = makeHost()
  // The printed text embeds the driver's own absolute path and the spec path; a checkout whose
  // directory name carries this spec's slug (its build worktree) would trip the substring check
  // on the path, not on doctrine — scrub paths so the assertion reads only the driver's prose.
  const REPO_ROOT = path.resolve(__dirname, '..', '..')
  const scrub = (text) => text.split(REPO_ROOT).join('<repo>').split(host.spec).join('<spec>')
  const stepR = run(host.root, host.spec)
  stepR.stdout = scrub(stepR.stdout)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'setup: a fresh green-legs fixture must reach REVIEWER before this AC can be exercised')
  assert.match(stepR.stdout, /verdict, survivors, killed, reviewerCount, tokens/,
    'D6: the REVIEWER step must document the trimmed return shape verbatim: ' + stepR.stdout)
  assert.ok(!stepR.stdout.includes('scope'),
    `D6: the REVIEWER step text must not mention "scope" anywhere — a reviewer reading this step must never be ` +
    `asked to hand-type a field only the driver could have known: ${JSON.stringify(stepR.stdout)}`)

  const malformed = path.join(fs.realpathSync(tmpdir('rvdrv-05-13-malformed')), 'bad.json')
  fs.writeFileSync(malformed, '{not valid json')
  const rBad = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', malformed)
  assert.strictEqual(rBad.status, 2, 'an unparseable reviewer return file must exit 2: ' + rBad.stdout + rBad.stderr)
  assert.match(rBad.stdout + rBad.stderr, /verdict, survivors, killed, reviewerCount, tokens/,
    'D6: the malformed-JSON refusal must name the trimmed return shape: ' + (rBad.stdout + rBad.stderr))
  assert.ok(!scrub(rBad.stdout + rBad.stderr).includes('scope'),
    `D6: the malformed-JSON refusal text must not mention "scope": ${JSON.stringify(rBad.stdout + rBad.stderr)}`)

  const noSurvivors = returnFileWith('rvdrv-05-13-nosurvivors', { verdict: 'CLEAN', killed: [], reviewerCount: 1, tokens: 10 })
  const rNoSurvivors = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', noSurvivors)
  assert.strictEqual(rNoSurvivors.status, 2, 'a return missing survivors must exit 2: ' + rNoSurvivors.stdout + rNoSurvivors.stderr)
  assert.match(rNoSurvivors.stdout + rNoSurvivors.stderr, /verdict, survivors, killed, reviewerCount, tokens/,
    'D6: the missing-survivors refusal must name the trimmed return shape: ' + (rNoSurvivors.stdout + rNoSurvivors.stderr))
  assert.ok(!scrub(rNoSurvivors.stdout + rNoSurvivors.stderr).includes('scope'),
    `D6: the missing-survivors refusal text must not mention "scope": ${JSON.stringify(rNoSurvivors.stdout + rNoSurvivors.stderr)}`)
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

// specs/20260821/03-cross-spec-skip-mapping.md D3: ac-matrix.js's new route 3
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

test('AC-20260820-07-12 (also AC-20260821-04-9, AC-20260823-07-6, AC-20260830-02-2, and AC-20260903-02-14, SHALL CONTINUE TO): WHEN merge-strategy is marked from the main root in a two-branch fixture THE SYSTEM runs merge, cleanup, and verify — promoting the worktree\'s ledger and retained evidence into the main root (exact-line / filename dedup) and leaving the worktree clean for a plain `git worktree remove` — prints spec-status --next verbatim, and lands DONE; the same mark from inside the build worktree is refused with a relocate instruction (AC-20260823-07-6: this closed-success call, on a tree carrying no deviations sidecar, must keep succeeding once the deviations backstop lands; AC-20260830-02-2: the same closed-success call, now also running the close-time host-gate re-run over a green gateCommand "true", must keep succeeding and land MERGE, never refuse a genuinely green gate)', () => {
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

// specs/20260820/07-review-driver.md (review, rulings R8/R9/R10): three fixes landed
// past the AC-1..12 build. R9: every child this driver spawns is wrapped by runChild(),
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
  // (the sidecar is removed once DONE is reached) and must keep printing DONE at exit 0 — this refusal must
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

// specs/20260901/02-run-provenance.md D4 (brief 18, AC-20260901-02-4): the review driver
// carries --via loop|direct, recorded in review-state.json at sidecar creation (a later
// different value is ignored — the run's provenance is fixed at creation), and passes
// --via <recorded> --model <sessionModel(repoRoot) or omitted when null> on all three verdict.js
// passes.
//
// specs/20260901/09-disposer-gate.md D4/D9/AC-20260901-09-6 (brief 18b, rewritten in place —
// never left beside a new test): CHECKPOINT is retired — a --via loop run lands DISPOSITIONS
// directly after reviewer-returned, exactly like a --via direct run, with no stamp park/rewrite
// step in between. The close row's checkpoint key is asserted deep-equal to {"outcome":"empty"}
// instead of {"outcome":"cleared"} (D6: a zero-survivor, zero-leg-finding run's disposer mark is
// recorded empty:true, never a checkpoint-clear fact, since CHECKPOINT is retired), for both the
// --via loop run and the run created without --via.
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
  // specs/20260901/09-disposer-gate.md D4: a --via loop run lands DISPOSITIONS directly after
  // reviewer-returned — CHECKPOINT is retired as a reachable state, so there is no park to lift
  // and no second stamp write needed before the dispositions-and-close path below.
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
