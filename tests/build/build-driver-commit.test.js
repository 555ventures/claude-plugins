'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { makeHost, run, stateOf, toCommit, toFirstWave, implementScriptsWave, specBody, testFileContent } = require('./build-driver.fixtures')

// specs/20260901/01-build-driver.md + specs/20260901/02-run-provenance.md D5: shard of
// build-driver.test.js, split by specs/20260903/07-test-file-budget-guard.md D7. Owns COMMIT/
// ledger/provenance and the glob-expansion File Plan rows: AC-20260901-01-9, -10,
// AC-20260901-02-5 (--via/model), the "build already DONE" field report, and D10's glob rows.
// Admission/TESTS-stage lives in build-driver.test.js; wave/repair/escalate lives in
// build-driver-repair.test.js. Shared helpers in tests/build/build-driver.fixtures.js.

test('AC-20260901-01-9: WHEN --mark committed is received with every File Plan path clean in git status and HEAD past the base sha THE SYSTEM appends exactly one D6-shaped ledger line and deletes the sidecar; a dirty File Plan path refuses the mark', () => {
  const host = makeHost()
  toCommit(host)

  const rEarly = run(host.root, host.spec, '--mark', 'committed')
  assert.strictEqual(rEarly.status, 2,
    'the wave edits are still uncommitted working-tree changes at this point — a committed mark before the session\'s own checkpoint commit must refuse: ' + rEarly.stdout + rEarly.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'COMMIT', 'a refused committed mark must leave the state at COMMIT')

  fs.writeFileSync(host.spec.replace(/\.md$/, '.deviations.md'),
    '# Deviations — 99-bd-test\n\n- first departure\n- second departure\n- third departure\n')

  execFileSync('git', ['-C', host.root, 'add', 'src/foo.js', 'src/bar.js', 'other.txt', 'tests/foo.test.js', path.relative(host.root, host.spec)], { encoding: 'utf8' })
  execFileSync('git', ['-C', host.root, 'commit', '-q', '-m', 'checkpoint'], { encoding: 'utf8' })

  const specTextAfter = fs.readFileSync(host.spec, 'utf8')
  const diffBase = /^diff_base:\s*(\S+)/m.exec(specTextAfter)[1]
  const shortstat = execFileSync('git', ['-C', host.root, 'diff', '--shortstat', diffBase, 'HEAD'], { encoding: 'utf8' }).trim()
  const sm = /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/.exec(shortstat) || []
  const expectedFiles = sm[1] ? parseInt(sm[1], 10) : 0
  const expectedLoc = (sm[2] ? parseInt(sm[2], 10) : 0) + (sm[3] ? parseInt(sm[3], 10) : 0)

  const ledger = path.join(host.root, '.claude/spec-runs.jsonl')
  const before = fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean) : []

  const r = run(host.root, host.spec, '--mark', 'committed')
  assert.strictEqual(r.status, 0, 'a clean, advanced File Plan must be accepted at COMMIT: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /## DONE/, 'the accepted committed mark must print the ## DONE step: ' + r.stdout)

  const after = fs.readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean)
  assert.strictEqual(after.length, before.length + 1, 'exactly one ledger line must be appended at DONE: ' + JSON.stringify({ before, after }))
  const row = JSON.parse(after[after.length - 1])
  assert.strictEqual(row.stage, 'build', 'the appended row must carry stage:"build": ' + JSON.stringify(row))
  assert.match(row.runId, /^bd_[0-9a-f]{12}$/, 'the row\'s runId must match bd_<12 hex>, the D6 shape: ' + JSON.stringify(row))
  assert.strictEqual(row.gate.finalRounds, 1, 'a single gate run with no repair rounds must record gate.finalRounds:1: ' + JSON.stringify(row))
  assert.strictEqual(row.deviations, 3, 'the deviations count must equal the number of "^- " lines in the deviations sidecar: ' + JSON.stringify(row))
  assert.strictEqual(row.redCheck, 'green', 'a run that genuinely reconciled red-check must carry redCheck:"green": ' + JSON.stringify(row))
  assert.deepStrictEqual(row.workers, { spawned: 3, continued: 0 },
    'the workers sums must equal the wave --workers sums (2 + 1) with zero repairs: ' + JSON.stringify(row))
  assert.strictEqual(row.diff.files, expectedFiles, 'diff.files must equal git diff --shortstat <base>..HEAD\'s file count: ' + JSON.stringify({ row, expectedFiles }))
  assert.strictEqual(row.diff.loc, expectedLoc, 'diff.loc must equal insertions+deletions from the same shortstat: ' + JSON.stringify({ row, expectedLoc }))

  assert.ok(!fs.existsSync(host.sidecar),
    'the sidecar must be deleted at DONE — leaving it behind risks a future invocation re-deriving a finished run\'s stale state: ' + host.sidecar)
})

test('AC-20260901-01-10: WHEN --state is passed THE SYSTEM prints exactly the bare state token and a newline, runs no mutating child process, and leaves build-state.json and the spec file byte-identical', () => {
  const host = makeHost()
  toCommit(host)
  const specBefore = fs.readFileSync(host.spec, 'utf8')
  const sidecarBefore = fs.readFileSync(path.join(host.sidecar, 'build-state.json'), 'utf8')
  const r = run(host.root, host.spec, '--state')
  assert.strictEqual(r.status, 0, '--state must exit 0: ' + r.stdout + r.stderr)
  assert.strictEqual(r.stdout, 'COMMIT\n', 'at COMMIT, --state must print exactly "COMMIT\\n" and nothing else — any extra text breaks a scripting consumer: ' + JSON.stringify(r.stdout))
  assert.strictEqual(fs.readFileSync(host.spec, 'utf8'), specBefore, '--state must never mutate the spec file')
  assert.strictEqual(fs.readFileSync(path.join(host.sidecar, 'build-state.json'), 'utf8'), sidecarBefore, '--state must never mutate build-state.json')
})

// specs/20260901/02-run-provenance.md D5 (brief 18, AC-20260901-02-5): the build
// driver gains the review driver's own --via flag (D4's sibling), recorded at sidecar creation,
// and writes via/model onto the build row immediately after tier — model derived at row-write
// time from lib/session-stamp.js's sessionModel(repoRoot). This test is written before
// spec-session-stamp.sh / lib/session-stamp.js / the driver's --via support exist (TDD red)
// and must fail until the driver genuinely threads --via through sidecar creation and
// stamps the row with a real transcript-derived model.
test('AC-20260901-02-5: a run created with --via loop and a stamp whose transcript ends in an assistant line with model claude-opus-5 appends a build row whose keys after tier begin via, model with "via":"loop","model":"claude-opus-5"; a run created without --via and without a stamp appends via:"direct", model:null', () => {
  const loopHost = makeHost()
  const rInit = run(loopHost.root, loopHost.spec, '--via', 'loop')
  assert.strictEqual(stateOf(loopHost.root, loopHost.spec), 'TESTS',
    'setup precondition: the FIRST invocation (the one that creates the sidecar) must carry --via loop so D5\'s creation-time recording has something to record: ' + rInit.stdout + rInit.stderr)

  fs.mkdirSync(path.join(loopHost.root, '.claude'), { recursive: true })
  const transcript = path.join(loopHost.root, 'transcript.jsonl')
  fs.writeFileSync(transcript, JSON.stringify({ type: 'assistant', message: { model: 'claude-opus-5' } }) + '\n')
  fs.writeFileSync(path.join(loopHost.root, '.claude/spec-session.json'), JSON.stringify({
    session_id: 's1', transcript_path: transcript, cwd: loopHost.root, ts: new Date().toISOString()
  }))

  toCommit(loopHost)
  fs.writeFileSync(loopHost.spec.replace(/\.md$/, '.deviations.md'), '# Deviations — 99-bd-test\n\n- one departure\n')
  execFileSync('git', ['-C', loopHost.root, 'add', 'src/foo.js', 'src/bar.js', 'other.txt', 'tests/foo.test.js', path.relative(loopHost.root, loopHost.spec)], { encoding: 'utf8' })
  execFileSync('git', ['-C', loopHost.root, 'commit', '-q', '-m', 'checkpoint'], { encoding: 'utf8' })

  const ledger = path.join(loopHost.root, '.claude/spec-runs.jsonl')
  const before = fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean) : []
  const r = run(loopHost.root, loopHost.spec, '--mark', 'committed')
  assert.strictEqual(r.status, 0, 'a clean, advanced File Plan must be accepted at COMMIT: ' + r.stdout + r.stderr)
  const after = fs.readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean)
  assert.strictEqual(after.length, before.length + 1, 'exactly one ledger line must be appended at DONE: ' + JSON.stringify({ before, after }))
  const row = JSON.parse(after[after.length - 1])
  const tierIdx = Object.keys(row).indexOf('tier')
  assert.deepStrictEqual(Object.keys(row).slice(tierIdx, tierIdx + 3), ['tier', 'via', 'model'],
    'via and model must be the two keys immediately after tier on the build row: ' + JSON.stringify(row))
  assert.strictEqual(row.via, 'loop', 'a run created with --via loop must carry via:"loop" on its DONE row: ' + JSON.stringify(row))
  assert.strictEqual(row.model, 'claude-opus-5',
    'a run whose stamp names a transcript ending in an assistant line with model claude-opus-5 must carry that model on the DONE row — the model is derived at row-write time, not creation time: ' + JSON.stringify(row))

  const directHost = makeHost()
  toCommit(directHost)
  fs.writeFileSync(directHost.spec.replace(/\.md$/, '.deviations.md'), '# Deviations — 99-bd-test\n\n- one departure\n')
  execFileSync('git', ['-C', directHost.root, 'add', 'src/foo.js', 'src/bar.js', 'other.txt', 'tests/foo.test.js', path.relative(directHost.root, directHost.spec)], { encoding: 'utf8' })
  execFileSync('git', ['-C', directHost.root, 'commit', '-q', '-m', 'checkpoint'], { encoding: 'utf8' })
  const directLedger = path.join(directHost.root, '.claude/spec-runs.jsonl')
  const rDirect = run(directHost.root, directHost.spec, '--mark', 'committed')
  assert.strictEqual(rDirect.status, 0, 'the no-via, no-stamp run must also reach DONE cleanly: ' + rDirect.stdout + rDirect.stderr)
  const directRows = fs.readFileSync(directLedger, 'utf8').trim().split('\n').filter(Boolean)
  const directRow = JSON.parse(directRows[directRows.length - 1])
  assert.strictEqual(directRow.via, 'direct',
    'a run created with no --via flag must default to via:"direct" on its DONE row: ' + JSON.stringify(directRow))
  assert.strictEqual(directRow.model, null,
    'a run with no .claude/spec-session.json stamp anywhere must carry model:null on its DONE row, never a thrown error or a fabricated value: ' + JSON.stringify(directRow))
})

// field report from the first full /spec:run loop (ledger rows bd_9fbf227320f3 +
// rv_f756ae99b428): two reflex traps at the build→review boundary, both closed in the driver.
test('field report 2026-09-02 (build already DONE): WHEN invoked on a status:implementing spec with no sidecar and a stage:"build" ledger row naming this spec THE SYSTEM exits 2 naming the row and the review driver, creates no sidecar, and leaves the spec byte-identical — a build row for a different spec, or a malformed ledger line, never triggers it', () => {
  const host = makeHost()
  const baseHead = execFileSync('git', ['-C', host.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  fs.writeFileSync(host.spec, specBody({ status: 'implementing', diffBase: baseHead }))
  const specText = fs.readFileSync(host.spec, 'utf8')
  const ledger = path.join(host.root, '.claude/spec-runs.jsonl')
  const specRel = path.relative(host.root, host.spec)
  const doneRow = { ts: '2026-09-02T10:00:00.000Z', spec: specRel, stage: 'build', tier: 'standard', via: 'loop', model: null, runId: 'bd_9fbf227320f3', diff: { files: 1, loc: 1 }, gate: { finalRounds: 1 }, deviations: 0, redCheck: 'green', workers: { spawned: 1, continued: 0 } }

  // A row for ANOTHER spec plus a malformed line: this spec's build is not done, so the driver
  // must open a sidecar and print a step exactly as before.
  fs.writeFileSync(ledger, JSON.stringify({ ...doneRow, spec: 'specs/20260901/00-elsewhere.md' }) + '\nnot json at all\n')
  const rOther = run(host.root, host.spec)
  assert.strictEqual(rOther.status, 0, 'a build row for a different spec must not refuse this one: ' + rOther.stdout + rOther.stderr)
  assert.ok(fs.existsSync(host.sidecar), 'an undone build must still open its sidecar')
  fs.rmSync(host.sidecar, { recursive: true, force: true })

  // The same row naming THIS spec: the state a finished build leaves behind (implementing, no
  // sidecar) must route to review, never silently reopen a skipped-resume build.
  fs.appendFileSync(ledger, JSON.stringify(doneRow) + '\n')
  for (const args of [[], ['--via', 'loop'], ['--state']]) {
    const r = run(host.root, host.spec, ...args)
    assert.strictEqual(r.status, 2, 'a re-run after DONE must refuse (args ' + JSON.stringify(args) + '): ' + r.stdout + r.stderr)
    assert.match(r.stderr, /build already DONE/, 'the refusal must say the build is already DONE: ' + r.stderr)
    assert.match(r.stderr, /bd_9fbf227320f3/, 'the refusal must name the ledger row that proves it: ' + r.stderr)
    assert.match(r.stderr, /spec-review-driver\.js/, 'the remedy must name the review driver: ' + r.stderr)
    assert.ok(!fs.existsSync(host.sidecar), 'a refused re-run must never open a sidecar — that is the exact skipped-resume trap: ' + JSON.stringify(args))
  }
  const rLoop = run(host.root, host.spec, '--via', 'loop')
  assert.match(rLoop.stderr, /--via loop/, 'the loop path must be handed a --via loop review invocation: ' + rLoop.stderr)
  assert.strictEqual(fs.readFileSync(host.spec, 'utf8'), specText, 'the spec must be byte-identical after a refusal')
})

// Owner: specs/20260902/02-plugin-code-sweep.md D10 — a tests-layer File Plan row may be a glob,
// expanded through lib/glob-match.js exactly as red-check.js and scope-reconcile.js expand one.
// Deliberately carries no AC-ID: red-check reads an AC-ID anywhere in a file, comments included,
// as a carried-red expectation.
test('a tests-layer File Plan glob row is satisfied by any matching file on disk, and refused by name when the pattern matches nothing', () => {
  const host = makeHost()
  const globbed = fs.readFileSync(host.spec, 'utf8')
    .replace('| tests/foo.test.js | CREATE | tests |', '| tests/**/*.test.js | CREATE | tests |')
  fs.writeFileSync(host.spec, globbed)
  run(host.root, host.spec)
  const before = fs.readFileSync(path.join(host.sidecar, 'build-state.json'), 'utf8')

  const rNoMatch = run(host.root, host.spec, '--mark', 'tests-authored')
  assert.strictEqual(rNoMatch.status, 2,
    'a tests-layer glob matching no file on disk must refuse the mark — accepting it would let a build whose tests were never authored ride through to red-check: ' + rNoMatch.stdout + rNoMatch.stderr)
  assert.match(rNoMatch.stderr, /tests\/\*\*\/\*\.test\.js/,
    'the refusal must name the unmatched pattern verbatim, or the session cannot tell which File Plan row is unsatisfied: ' + rNoMatch.stderr)
  assert.strictEqual(fs.readFileSync(path.join(host.sidecar, 'build-state.json'), 'utf8'), before,
    'a refused glob mark must leave build-state.json byte-unchanged — a recorded mark cannot be withdrawn')

  fs.mkdirSync(path.join(host.root, 'tests/nested'), { recursive: true })
  fs.writeFileSync(path.join(host.root, 'tests/nested/foo.test.js'), testFileContent(42))
  const r = run(host.root, host.spec, '--mark', 'tests-authored')
  assert.strictEqual(r.status, 0,
    'one file matching the glob must satisfy the row — treating a pattern as a literal filename blocks every spec that plans its tests by glob: ' + r.stdout + r.stderr)
  assert.match(fs.readFileSync(path.join(host.sidecar, 'build-state.json'), 'utf8'), /"testsAuthored":\s*true/,
    'the accepted glob mark must be recorded on the sidecar, or the driver re-demands the step forever')
})

// Owner: specs/20260902/02-plugin-code-sweep.md D10 — verifyWaveRows expands a glob row through
// lib/glob-match.js too, not only handleTestsAuthored. This branch runs on EVERY wave-done mark of
// every build, so it is pinned separately from the tests-authored one above. No AC-ID, for the
// same red-check reason.
test('a wave File Plan glob row verifies on at least one match for CREATE/MODIFY and on no match for DELETE', () => {
  const host = makeHost()
  const globbed = fs.readFileSync(host.spec, 'utf8')
    .replace('| src/foo.js | MODIFY | scripts |', '| src/*.js | MODIFY | scripts |')
  fs.writeFileSync(host.spec, globbed)
  toFirstWave(host)
  implementScriptsWave(host)

  const rMatch = run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '1')
  assert.strictEqual(rMatch.status, 0,
    'a MODIFY glob row with matching files on disk must verify — checking the pattern as a literal filename would refuse every wave whose File Plan plans by glob: ' + rMatch.stdout + rMatch.stderr)

  const host2 = makeHost()
  const deleteRow = fs.readFileSync(host2.spec, 'utf8')
    .replace('| src/foo.js | MODIFY | scripts |', '| src/gone-*.js | DELETE | scripts |')
  fs.writeFileSync(host2.spec, deleteRow)
  toFirstWave(host2)
  implementScriptsWave(host2)
  const rAbsent = run(host2.root, host2.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '1')
  assert.strictEqual(rAbsent.status, 0,
    'a DELETE glob row matching nothing on disk is satisfied by that absence — refusing it would strand every wave that plans a deletion by pattern: ' + rAbsent.stdout + rAbsent.stderr)

  const host3 = makeHost()
  fs.writeFileSync(host3.spec, deleteRow)
  toFirstWave(host3)
  implementScriptsWave(host3)
  fs.writeFileSync(path.join(host3.root, 'src/gone-still-here.js'), 'module.exports = () => 1\n')
  const rStillThere = run(host3.root, host3.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '1')
  assert.strictEqual(rStillThere.status, 2,
    'a DELETE glob row must be refused while a matching file still exists — accepting it would record a deletion wave that never deleted anything: ' + rStillThere.stdout + rStillThere.stderr)
  assert.match(rStillThere.stderr, /src\/gone-\*\.js/,
    'the refusal must name the unsatisfied pattern, or the session cannot tell which File Plan row still fails: ' + rStillThere.stderr)
})
