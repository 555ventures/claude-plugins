'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runBash, runNode, SPEC } = require('../helpers')

// specs/20260901/02-run-provenance.md D1/D2/D3 (brief 18): a review row is ledger-answerable
// only when it names which command shape produced it (via) and which model held the session
// (model) — a never-blocking UserPromptSubmit hook (spec/scripts/spec-session-stamp.sh, D1)
// stamps session_id + transcript_path to a per-root file, a library
// (spec/scripts/lib/session-stamp.js, D2) derives the session model from that transcript, and
// verdict.js carries --via/--model (D3). AC-20260901-02-1, -2, -3, -6 below.
//
// specs/20260901/05-checkpoint-fail-closed.md D3 (brief 18a): verdict.js gains --checkpoint
// <cleared|stamp-appeared|overridden|not-reached> and --checkpoint-reason <text>,
// review-profile only, inserting a `checkpoint` key immediately after `verdict` (before
// `escalated`) on the printed row. AC-20260901-05-8 tags the pre-existing AC-20260901-02-6
// byte-identity test in place (D3 requires that test to keep passing untouched — via/model's
// insertion point is unaffected).
//
// specs/20260901/09-disposer-gate.md D5/D9 (brief 18b): CHECKPOINT is retired and
// --checkpoint's enum is <disposer|empty|not-reached> plus --checkpoint-overrides <N> (only
// valid with --checkpoint disposer), accepted with --via loop, --via direct, or --via absent.
// The old AC-20260901-05-6 test is rewritten in place to AC-20260901-09-10 and the old
// AC-20260901-05-7 test to AC-20260901-09-11 — every old-enum value
// (cleared/stamp-appeared/overridden) and --checkpoint-reason are refused. The
// AC-20260901-02-6 byte-identity test is tagged AC-20260901-09-12 in place, untouched (D5
// changes nothing about the flagless row).

function readStamp(root) {
  return JSON.parse(fs.readFileSync(path.join(root, '.claude/spec-session.json'), 'utf8'))
}

function hookInput({ prompt, sessionId = 's1', transcriptPath = '/t/x.jsonl', cwd }) {
  return JSON.stringify({ prompt, session_id: sessionId, transcript_path: transcriptPath, cwd })
}

// AC-20260901-02-1 ------------------------------------------------------------------------------

test('AC-20260901-02-1: WHEN the hook receives a /spec: prompt THE SYSTEM exits 0 with empty stdout and writes <cwd>/.claude/spec-session.json carrying session_id, transcript_path, cwd, and an ISO-8601 ts', () => {
  const root = fs.realpathSync(tmpdir('sess-stamp-happy'))
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  const r = runBash('scripts/spec-session-stamp.sh', [], {
    input: hookInput({ prompt: '/spec:build specs/x.md', sessionId: 's1', transcriptPath: '/t/x.jsonl', cwd: root })
  })
  assert.strictEqual(r.status, 0,
    'a /spec: prompt must exit 0 — this hook must never block a prompt, even on its own happy path: ' + r.stdout + r.stderr)
  assert.strictEqual(r.stdout, '', 'the hook must print nothing on stdout — any output here would be injected into the model\'s context on every /spec: prompt: ' + JSON.stringify(r.stdout))
  const stampPath = path.join(root, '.claude/spec-session.json')
  assert.ok(fs.existsSync(stampPath),
    'a /spec: prompt must write <cwd>/.claude/spec-session.json — without it lib/session-stamp.js has no route to a driver subprocess\'s session id or transcript path')
  const stamp = readStamp(root)
  assert.strictEqual(stamp.session_id, 's1', 'the written stamp must carry the stdin session_id verbatim: ' + JSON.stringify(stamp))
  assert.strictEqual(stamp.transcript_path, '/t/x.jsonl', 'the written stamp must carry the stdin transcript_path verbatim: ' + JSON.stringify(stamp))
  assert.strictEqual(stamp.cwd, root, 'the written stamp must carry the stdin cwd verbatim: ' + JSON.stringify(stamp))
  assert.match(stamp.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    'the written stamp must carry an ISO-8601 ts — without one a reader cannot tell a stale stamp from a fresh one: ' + JSON.stringify(stamp))
})

test('AC-20260901-02-1: WHEN the prompt does not start with /spec: THE SYSTEM exits 0 and writes nothing', () => {
  const root = fs.realpathSync(tmpdir('sess-stamp-nonspec'))
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  const r = runBash('scripts/spec-session-stamp.sh', [], {
    input: hookInput({ prompt: 'git status', cwd: root })
  })
  assert.strictEqual(r.status, 0, 'a non-/spec: prompt must still exit 0 — the hook never blocks: ' + r.stdout + r.stderr)
  assert.ok(!fs.existsSync(path.join(root, '.claude/spec-session.json')),
    'a non-/spec: prompt must never write the stamp file — writing on every prompt would make the ' +
    'per-session file meaningless for a driver invoked well after an unrelated prompt: ' + root)
})

test('AC-20260901-02-1: WHEN stdin is not JSON THE SYSTEM exits 0 and writes nothing', () => {
  const root = fs.realpathSync(tmpdir('sess-stamp-malformed'))
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  const r = runBash('scripts/spec-session-stamp.sh', [], { input: 'not json' })
  assert.strictEqual(r.status, 0, 'malformed stdin must still exit 0 — a hook that blocks on unparseable input breaks every prompt whenever the harness ever changes its stdin shape: ' + r.stdout + r.stderr)
  assert.ok(!fs.existsSync(path.join(root, '.claude/spec-session.json')),
    'malformed stdin must never produce a stamp file — there is no reliable cwd to write to')
})

test('AC-20260901-02-1: WHEN <cwd>/.claude is not writable THE SYSTEM exits 0 and writes no stamp file', () => {
  const root = fs.realpathSync(tmpdir('sess-stamp-unwritable'))
  const claudeDir = path.join(root, '.claude')
  fs.mkdirSync(claudeDir, { recursive: true })
  fs.chmodSync(claudeDir, 0o500)
  try {
    const r = runBash('scripts/spec-session-stamp.sh', [], {
      input: hookInput({ prompt: '/spec:review specs/x.md', cwd: root })
    })
    assert.strictEqual(r.status, 0,
      'an unwritable .claude directory must still exit 0 — a stamp write failure must never surface as a blocked prompt: ' + r.stdout + r.stderr)
    assert.ok(!fs.existsSync(path.join(claudeDir, 'spec-session.json')),
      'an unwritable .claude directory must leave no stamp file behind')
  } finally {
    fs.chmodSync(claudeDir, 0o700)
  }
})

test('AC-20260901-02-1: WHEN jq is unavailable on PATH THE SYSTEM exits 0 and writes no stamp file', () => {
  const root = fs.realpathSync(tmpdir('sess-stamp-nojq'))
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  // /bin carries bash itself but not jq on this platform (jq lives at /usr/bin) — a narrow PATH
  // that resolves `bash` but not `jq` is the cleanest way to simulate a missing dependency without
  // touching the real jq binary the rest of the suite (and this repo's own hooks) depend on.
  const r = runBash('scripts/spec-session-stamp.sh', [], {
    input: hookInput({ prompt: '/spec:build specs/x.md', cwd: root }),
    env: { PATH: '/bin' }
  })
  assert.strictEqual(r.status, 0, 'a missing jq must still exit 0 — the hook degrades to a no-op, never a blocked prompt: ' + r.stdout + r.stderr)
  assert.ok(!fs.existsSync(path.join(root, '.claude/spec-session.json')),
    'a missing jq must leave no stamp file — there is no way to safely parse stdin or write JSON without it')
})

// AC-20260901-02-2 ------------------------------------------------------------------------------

const LIB = path.join(SPEC, 'scripts/lib/session-stamp.js')

function writeStamp(root, { sessionId = 's1', transcriptPath, cwd = root, ts = new Date().toISOString() } = {}) {
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec-session.json'), JSON.stringify({
    session_id: sessionId, transcript_path: transcriptPath, cwd, ts
  }))
}

function writeTranscript(file, lines) {
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
}

test('AC-20260901-02-2: sessionModel(root) returns the last "type":"assistant" line\'s message.model, even after a later user line', () => {
  delete require.cache[LIB]
  const { sessionModel } = require(LIB)
  const root = fs.realpathSync(tmpdir('sess-model-happy'))
  const transcript = path.join(root, 'transcript.jsonl')
  writeTranscript(transcript, [
    { type: 'user', message: { content: 'hi' } },
    { type: 'assistant', message: { model: 'claude-opus-5', content: 'ok' } },
    { type: 'user', message: { content: 'thanks' } }
  ])
  writeStamp(root, { transcriptPath: transcript })
  assert.strictEqual(sessionModel(root), 'claude-opus-5',
    'sessionModel must walk the transcript backwards to find the LAST assistant line, not the first — a later user line must not shadow it')
})

test('AC-20260901-02-2: sessionModel(root) returns null when no stamp file exists, without throwing', () => {
  delete require.cache[LIB]
  const { sessionModel } = require(LIB)
  const root = fs.realpathSync(tmpdir('sess-model-nostamp'))
  assert.strictEqual(sessionModel(root), null,
    'an absent stamp must derive model:null rather than a thrown error — a review or build row must never crash on a host with no stamp')
})

test('AC-20260901-02-2: sessionModel(root) returns null when the stamped transcript file is missing, without throwing', () => {
  delete require.cache[LIB]
  const { sessionModel } = require(LIB)
  const root = fs.realpathSync(tmpdir('sess-model-notranscript'))
  writeStamp(root, { transcriptPath: path.join(root, 'does-not-exist.jsonl') })
  assert.strictEqual(sessionModel(root), null,
    'a stamp naming a missing transcript file must derive model:null, not throw — the transcript format is internal and version-unstable')
})

test('AC-20260901-02-2: sessionModel(root) returns null when the transcript holds no assistant line', () => {
  delete require.cache[LIB]
  const { sessionModel } = require(LIB)
  const root = fs.realpathSync(tmpdir('sess-model-nouser'))
  const transcript = path.join(root, 'transcript.jsonl')
  writeTranscript(transcript, [
    { type: 'user', message: { content: 'hi' } },
    { type: 'system', message: { content: 'boot' } }
  ])
  writeStamp(root, { transcriptPath: transcript })
  assert.strictEqual(sessionModel(root), null,
    'a transcript with only user/system lines must derive model:null — there is no assistant message to attribute the session to')
})

test('AC-20260901-02-2: readSessionStamp(root) returns the parsed stamp object, or null when absent or malformed', () => {
  delete require.cache[LIB]
  const { readSessionStamp } = require(LIB)
  const absentRoot = fs.realpathSync(tmpdir('sess-read-absent'))
  assert.strictEqual(readSessionStamp(absentRoot), null,
    'an absent stamp file must derive null, not throw — every caller treats this as the "no session known" case')

  const malformedRoot = fs.realpathSync(tmpdir('sess-read-malformed'))
  fs.mkdirSync(path.join(malformedRoot, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(malformedRoot, '.claude/spec-session.json'), 'not json')
  assert.strictEqual(readSessionStamp(malformedRoot), null,
    'a malformed stamp file must derive null, not throw — a hand-corrupted or partially-written stamp must never crash a driver mid-run')

  const okRoot = fs.realpathSync(tmpdir('sess-read-ok'))
  writeStamp(okRoot, { sessionId: 's9', transcriptPath: '/t/y.jsonl' })
  const stamp = readSessionStamp(okRoot)
  assert.strictEqual(stamp.sessionId, 's9', 'a valid stamp must be read back with sessionId set from the file\'s session_id: ' + JSON.stringify(stamp))
  assert.strictEqual(stamp.transcriptPath, '/t/y.jsonl', 'a valid stamp must be read back with transcriptPath set from the file\'s transcript_path: ' + JSON.stringify(stamp))
})

// AC-20260901-02-3 / AC-20260901-02-6 ------------------------------------------------------------

// All eight of verdict.js's REVIEW_LEGS, green — the same shape as tests/review/verdict.test.js's
// own SIX_GREEN fixture (a one-leg, all-fields-absent manifest derives UNVERIFIED, never CLEAN,
// so a --status-0 assertion here would fail on the verdict word rather than on the via/model
// contract this file exists to pin).
// specs/20260903/02-whole-suite-review-leg.md D6 (AC-20260903-02-15, SHALL CONTINUE TO): `suite`
// joins here too — A3's executed check confirms the pre-image verdict.js ignores this unknown
// green row entirely, so this fixture's own pin stays green pre-image.
const CLEAN_LEGS = [
  { leg: 'gate', exit: 0, observed: { skips: 0, todos: 0, testsExecuted: 40 } },
  { leg: 'suite', exit: 0, observed: { skips: 0, todos: 0, testsExecuted: 1035 } },
  { leg: 'smoke', exit: 4, observed: { result: 'inert' } },
  { leg: 'reconcile', exit: 0, observed: { outOfPlan: 0 } },
  { leg: 'ac-matrix', exit: 0, observed: { uncovered: 0, oracle: 0 } },
  { leg: 'skip-reconcile', exit: 0, observed: { skipped: 0, sanctioned: 0 } },
  { leg: 'ci', exit: 0, observed: { conclusion: 'success' } },
  { leg: 'at-risk', exit: 0, observed: { files: 0, testsExecuted: 0 } },
  { leg: 'promise-sweep', exit: 0, observed: { rows: 1, carried: 1, sanctioned: 0, orphans: 0 } },
]

function manifestFixture() {
  const dir = fs.realpathSync(tmpdir('verdict-provenance'))
  const manifest = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(manifest, CLEAN_LEGS.map((r) => JSON.stringify(r)).join('\n') + '\n')
  const workflow = path.join(dir, 'workflow.json')
  fs.writeFileSync(workflow, JSON.stringify({
    verdict: 'CLEAN', survivors: [], killed: 0,
    verify: { verified: 0, demonstrated: 0, killedByExecution: 0, sanctioned: 0, miscited: 0, unverifiable: 0, failed: 0, capSkipped: 0 },
    reviewerCount: 1, scope: 'full', tokens: { workflow: 10 },
  }))
  return { manifest, workflow }
}

test('AC-20260901-02-3 (also AC-20260903-02-15, SHALL CONTINUE TO): verdict.js --via loop --model <id> on a review-profile ledger pass prints a row whose key order begins ts, spec, stage, tier, via, model, runId with the passed values', () => {
  const { manifest, workflow } = manifestFixture()
  const retainDir = fs.realpathSync(tmpdir('verdict-retain'))
  const r = runNode('scripts/verdict.js', [
    '--manifest', manifest, '--workflow', workflow, '--ledger', '--spec', 'specs/x.md', '--tier', 'standard',
    '--retain', retainDir, '--via', 'loop', '--model', 'claude-opus-5'
  ])
  assert.strictEqual(r.status, 0, 'a clean manifest+workflow with valid --via/--model must derive CLEAN and exit 0: ' + r.stdout + r.stderr)
  const line = r.stdout.trim().split('\n')[1]
  assert.ok(line, 'a --ledger pass must print a second stdout line carrying the row: ' + r.stdout)
  const row = JSON.parse(line)
  assert.deepStrictEqual(Object.keys(row).slice(0, 7), ['ts', 'spec', 'stage', 'tier', 'via', 'model', 'runId'],
    'the row\'s key order must begin ts, spec, stage, tier, via, model, runId — via/model are inserted immediately after tier, before runId: ' + JSON.stringify(row))
  assert.strictEqual(row.via, 'loop', 'the row must carry the passed --via value verbatim: ' + JSON.stringify(row))
  assert.strictEqual(row.model, 'claude-opus-5', 'the row must carry the passed --model value verbatim: ' + JSON.stringify(row))
})

test('AC-20260901-02-3: verdict.js with neither --via nor --model on a review-profile ledger pass defaults to via:"direct", model:null', () => {
  const { manifest, workflow } = manifestFixture()
  const retainDir = fs.realpathSync(tmpdir('verdict-retain-default'))
  const r = runNode('scripts/verdict.js', [
    '--manifest', manifest, '--workflow', workflow, '--ledger', '--spec', 'specs/x.md', '--tier', 'standard',
    '--retain', retainDir
  ])
  assert.strictEqual(r.status, 0, 'a clean manifest+workflow with no --via/--model must still derive CLEAN and exit 0 — every existing caller must keep working unmodified: ' + r.stdout + r.stderr)
  const row = JSON.parse(r.stdout.trim().split('\n')[1])
  assert.strictEqual(row.via, 'direct', 'omitting --via must default the row to via:"direct" — every pre-existing caller becomes a direct pass, never an unset field: ' + JSON.stringify(row))
  assert.strictEqual(row.model, null, 'omitting --model must default the row to model:null, never an absent key or empty string: ' + JSON.stringify(row))
})

test('AC-20260901-02-3: verdict.js --via manual exits 2 with no row printed', () => {
  const { manifest, workflow } = manifestFixture()
  const r = runNode('scripts/verdict.js', [
    '--manifest', manifest, '--workflow', workflow, '--ledger', '--spec', 'specs/x.md', '--tier', 'standard',
    '--via', 'manual'
  ])
  assert.strictEqual(r.status, 2, '--via must be enum-checked to loop|direct — an out-of-enum value like "manual" (the escape-row via value) must refuse rather than silently ride into a build/review row the fleet query keys on: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /--via/,
    'the refusal must name --via specifically, not fall through to the generic unknown-flag usage line — a refusal that never mentions --via cannot be distinguished from --via simply not being a recognized flag yet: ' + r.stderr)
  assert.strictEqual(r.stdout.trim().split('\n').filter(Boolean).length, 0,
    'a refused --via value must print no ledger row: ' + r.stdout)
})

test('AC-20260901-02-3: verdict.js --via loop --profile release exits 2 with no row printed', () => {
  const dir = fs.realpathSync(tmpdir('verdict-provenance-release'))
  const manifest = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(manifest, JSON.stringify({ leg: 'ready', exit: 0, observed: { result: 'pass' } }) + '\n')
  const r = runNode('scripts/verdict.js', [
    '--manifest', manifest, '--ledger', '--profile', 'release', '--via', 'loop'
  ])
  assert.strictEqual(r.status, 2, '--via with --profile release must refuse — a release row carries no runId/reviewer return for via/model to key: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /--via/,
    'the refusal must name --via specifically, not fall through to the generic unknown-flag usage line — a refusal that never mentions --via cannot be distinguished from --via simply not being a recognized flag yet: ' + r.stderr)
  assert.strictEqual(r.stdout.trim().split('\n').filter(Boolean).length, 0,
    'a refused --profile release + --via combination must print no ledger row: ' + r.stdout)
})

test('AC-20260901-02-6 (also AC-20260901-05-8 / AC-20260901-09-12, SHALL CONTINUE TO): verdict.js run without --via/--model, diffed against the same manifest/workflow WITH --via/--model minus ts and the via/model keys, is byte-identical — every pre-existing field keeps its value and position, and neither pass carries a checkpoint key since neither passes --checkpoint', () => {
  const { manifest, workflow } = manifestFixture()
  const retainDir = fs.realpathSync(tmpdir('verdict-retain-ac6'))
  const argsCommon = ['--manifest', manifest, '--workflow', workflow, '--ledger', '--spec', 'specs/x.md', '--tier', 'standard', '--run-id', 'rv_fixedfixed01', '--retain', retainDir]
  const withoutFlags = runNode('scripts/verdict.js', argsCommon)
  const withFlags = runNode('scripts/verdict.js', [...argsCommon, '--via', 'loop', '--model', 'claude-sonnet-5'])
  assert.strictEqual(withoutFlags.status, 0, 'the flagless pass must exit 0: ' + withoutFlags.stdout + withoutFlags.stderr)
  assert.strictEqual(withFlags.status, 0, 'the flagged pass must exit 0: ' + withFlags.stdout + withFlags.stderr)
  const rowWithout = JSON.parse(withoutFlags.stdout.trim().split('\n')[1])
  const rowWith = JSON.parse(withFlags.stdout.trim().split('\n')[1])
  assert.strictEqual('checkpoint' in rowWithout, false,
    'AC-20260901-05-8: a review-profile pass with no --checkpoint flag must print a row with no checkpoint key at all — a stray key here would break byte-identity with every pre-existing caller that never passes --checkpoint: ' + JSON.stringify(rowWithout))
  assert.strictEqual('checkpoint' in rowWith, false,
    'AC-20260901-05-8: --via/--model alone (no --checkpoint) must never imply a checkpoint key on the row — via/model and checkpoint are independent flags: ' + JSON.stringify(rowWith))
  delete rowWithout.ts; delete rowWith.ts
  delete rowWithout.via; delete rowWith.via
  delete rowWithout.model; delete rowWith.model
  assert.deepStrictEqual(rowWithout, rowWith,
    'every pre-existing field (aside from ts) must keep its exact value once via/model are added to the row — via/model are the ONLY additions this spec makes to an existing caller\'s output: ' +
    JSON.stringify({ rowWithout, rowWith }))
})

// AC-20260901-09-10 / AC-20260901-09-11 (rewrite AC-20260901-05-6 / AC-20260901-05-7 in place,
// D5/D9) ------------------------------------------------------------------------------------

test('AC-20260901-09-10 (rewrites the former AC-20260901-05-6 test in place, D5): verdict.js --via loop --checkpoint disposer --checkpoint-overrides 2 on a review-profile ledger pass prints a row whose checkpoint key sits immediately after verdict, deep-equal to {"outcome":"disposer","overrides":2}; --checkpoint disposer alone deep-equals {"outcome":"disposer","overrides":0}; --checkpoint empty deep-equals {"outcome":"empty"}; --checkpoint not-reached deep-equals {"outcome":"not-reached"}; and the same --checkpoint disposer pass with --via direct and with --via absent exits 0 carrying the same key', () => {
  const { manifest, workflow } = manifestFixture()

  const disposerRetain = fs.realpathSync(tmpdir('verdict-checkpoint-disposer'))
  const rDisposer = runNode('scripts/verdict.js', [
    '--manifest', manifest, '--workflow', workflow, '--ledger', '--spec', 'specs/x.md', '--tier', 'standard',
    '--retain', disposerRetain, '--via', 'loop', '--checkpoint', 'disposer', '--checkpoint-overrides', '2'
  ])
  assert.strictEqual(rDisposer.status, 0, 'a clean manifest+workflow with a valid --checkpoint disposer value must still derive CLEAN and exit 0: ' + rDisposer.stdout + rDisposer.stderr)
  const lineDisposer = rDisposer.stdout.trim().split('\n')[1]
  assert.ok(lineDisposer, 'a --ledger pass with --checkpoint disposer must print a second stdout line carrying the row: ' + rDisposer.stdout)
  const rowDisposer = JSON.parse(lineDisposer)
  const keysDisposer = Object.keys(rowDisposer)
  const verdictIdx = keysDisposer.indexOf('verdict')
  assert.notStrictEqual(verdictIdx, -1, 'the row must carry a verdict key at all: ' + JSON.stringify(rowDisposer))
  assert.strictEqual(keysDisposer[verdictIdx + 1], 'checkpoint',
    'D5: the checkpoint key must be inserted immediately after verdict (before escalated) — a different position would break the fixed key-order sibling AC-20260901-02-3 pins on the first seven keys and would leave escalated ahead of the field that explains why a run reached it: ' + JSON.stringify(rowDisposer))
  assert.deepStrictEqual(rowDisposer.checkpoint, { outcome: 'disposer', overrides: 2 },
    'a --checkpoint disposer --checkpoint-overrides 2 pass must print row.checkpoint deep-equal to {"outcome":"disposer","overrides":2}: ' + JSON.stringify(rowDisposer))

  const disposerNoOverridesRetain = fs.realpathSync(tmpdir('verdict-checkpoint-disposer-default'))
  const rDisposerDefault = runNode('scripts/verdict.js', [
    '--manifest', manifest, '--workflow', workflow, '--ledger', '--spec', 'specs/x.md', '--tier', 'standard',
    '--retain', disposerNoOverridesRetain, '--via', 'loop', '--checkpoint', 'disposer'
  ])
  assert.strictEqual(rDisposerDefault.status, 0, '--checkpoint disposer with no --checkpoint-overrides must still exit 0: ' + rDisposerDefault.stdout + rDisposerDefault.stderr)
  assert.deepStrictEqual(JSON.parse(rDisposerDefault.stdout.trim().split('\n')[1]).checkpoint, { outcome: 'disposer', overrides: 0 },
    '--checkpoint disposer with no --checkpoint-overrides must default overrides to 0, never an absent key or a non-numeric placeholder')

  const emptyRetain = fs.realpathSync(tmpdir('verdict-checkpoint-empty'))
  const rEmpty = runNode('scripts/verdict.js', [
    '--manifest', manifest, '--workflow', workflow, '--ledger', '--spec', 'specs/x.md', '--tier', 'standard',
    '--retain', emptyRetain, '--via', 'loop', '--checkpoint', 'empty'
  ])
  assert.strictEqual(rEmpty.status, 0, '--checkpoint empty must exit 0: ' + rEmpty.stdout + rEmpty.stderr)
  assert.deepStrictEqual(JSON.parse(rEmpty.stdout.trim().split('\n')[1]).checkpoint, { outcome: 'empty' },
    '--checkpoint empty must print row.checkpoint deep-equal to {"outcome":"empty"} — no overrides key belongs on a run with nothing dispositioned')

  const notReachedRetain = fs.realpathSync(tmpdir('verdict-checkpoint-not-reached'))
  const rNotReached = runNode('scripts/verdict.js', [
    '--manifest', manifest, '--workflow', workflow, '--ledger', '--spec', 'specs/x.md', '--tier', 'standard',
    '--retain', notReachedRetain, '--via', 'loop', '--checkpoint', 'not-reached'
  ])
  assert.strictEqual(rNotReached.status, 0, '--checkpoint not-reached must exit 0: ' + rNotReached.stdout + rNotReached.stderr)
  assert.deepStrictEqual(JSON.parse(rNotReached.stdout.trim().split('\n')[1]).checkpoint, { outcome: 'not-reached' },
    '--checkpoint not-reached must print row.checkpoint deep-equal to {"outcome":"not-reached"}')

  // D5: the old enum's --via-loop-only restriction is gone — --checkpoint disposer must now be
  // accepted with --via direct and with --via absent alike, carrying the same key.
  const directRetain = fs.realpathSync(tmpdir('verdict-checkpoint-disposer-direct'))
  const rDirect = runNode('scripts/verdict.js', [
    '--manifest', manifest, '--workflow', workflow, '--ledger', '--spec', 'specs/x.md', '--tier', 'standard',
    '--retain', directRetain, '--via', 'direct', '--checkpoint', 'disposer', '--checkpoint-overrides', '1'
  ])
  assert.strictEqual(rDirect.status, 0,
    'AC-20260901-09-10/D5: --checkpoint disposer must be accepted with --via direct — the disposer runs on both entries, so a direct-entry row must be able to carry the same outcome: ' + rDirect.stdout + rDirect.stderr)
  assert.deepStrictEqual(JSON.parse(rDirect.stdout.trim().split('\n')[1]).checkpoint, { outcome: 'disposer', overrides: 1 },
    'a --via direct pass with --checkpoint disposer must carry the same checkpoint shape as a --via loop pass')

  const noViaRetain = fs.realpathSync(tmpdir('verdict-checkpoint-disposer-novia'))
  const rNoVia = runNode('scripts/verdict.js', [
    '--manifest', manifest, '--workflow', workflow, '--ledger', '--spec', 'specs/x.md', '--tier', 'standard',
    '--retain', noViaRetain, '--checkpoint', 'disposer', '--checkpoint-overrides', '0'
  ])
  assert.strictEqual(rNoVia.status, 0,
    'AC-20260901-09-10/D5: --checkpoint disposer must be accepted with --via absent — every caller, not just an explicit loop/direct one, can now carry the outcome: ' + rNoVia.stdout + rNoVia.stderr)
  assert.deepStrictEqual(JSON.parse(rNoVia.stdout.trim().split('\n')[1]).checkpoint, { outcome: 'disposer', overrides: 0 },
    'a --via-absent pass with --checkpoint disposer must carry the same checkpoint shape as an explicit --via pass')
})

test('AC-20260901-09-11 (rewrites the former AC-20260901-05-7 test in place, D5): verdict.js refuses (exit 2, stderr naming --checkpoint, no ledger row printed) --checkpoint cleared, --checkpoint stamp-appeared, --checkpoint overridden, an out-of-enum --checkpoint value, --checkpoint-reason with any --checkpoint (retired), --checkpoint-overrides without --checkpoint disposer, --checkpoint disposer with a negative or non-integer --checkpoint-overrides, and --checkpoint empty with --profile release', () => {
  const { manifest, workflow } = manifestFixture()
  const retainDir = fs.realpathSync(tmpdir('verdict-checkpoint-refusals-retain'))
  const common = ['--manifest', manifest, '--workflow', workflow, '--ledger', '--spec', 'specs/x.md', '--tier', 'standard', '--retain', retainDir]

  const cases = [
    { name: 'old enum value cleared', args: [...common, '--via', 'loop', '--checkpoint', 'cleared'] },
    { name: 'old enum value stamp-appeared', args: [...common, '--via', 'loop', '--checkpoint', 'stamp-appeared'] },
    { name: 'old enum value overridden', args: [...common, '--via', 'loop', '--checkpoint', 'overridden'] },
    { name: 'out-of-enum value', args: [...common, '--via', 'loop', '--checkpoint', 'bogus'] },
    { name: '--checkpoint-reason (retired)', args: [...common, '--via', 'loop', '--checkpoint', 'disposer', '--checkpoint-reason', 'x'] },
    { name: '--checkpoint-overrides without --checkpoint disposer', args: [...common, '--via', 'loop', '--checkpoint', 'empty', '--checkpoint-overrides', '1'] },
    { name: '--checkpoint-overrides without --checkpoint at all', args: [...common, '--via', 'loop', '--checkpoint-overrides', '1'] },
    { name: 'negative --checkpoint-overrides', args: [...common, '--via', 'loop', '--checkpoint', 'disposer', '--checkpoint-overrides', '-1'] },
    { name: 'non-integer --checkpoint-overrides', args: [...common, '--via', 'loop', '--checkpoint', 'disposer', '--checkpoint-overrides', '1.5'] },
    { name: '--checkpoint empty with --profile release', args: [...common, '--profile', 'release', '--checkpoint', 'empty'] },
  ]
  for (const c of cases) {
    const r = runNode('scripts/verdict.js', c.args)
    assert.strictEqual(r.status, 2,
      `AC-20260901-09-11 (${c.name}): must exit 2 — an admitted refusal case here would let a retired or malformed checkpoint outcome land on the ledger: ` + r.stdout + r.stderr)
    assert.match(r.stderr, /--checkpoint/,
      `AC-20260901-09-11 (${c.name}): the refusal must name --checkpoint specifically, not fall through to the generic unknown-flag usage line: ` + r.stderr)
    assert.strictEqual(r.stdout.trim().split('\n').filter(Boolean).length, 0,
      `AC-20260901-09-11 (${c.name}): a refused --checkpoint combination must print no verdict word and no ledger row: ` + r.stdout)
  }
})
