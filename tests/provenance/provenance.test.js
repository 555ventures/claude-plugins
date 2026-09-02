'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runBash, runNode, SPEC } = require('../helpers')

// specs/20260901/02-run-provenance.md (2026-09-01, brief 18): a review row is ledger-answerable
// only when it names which command shape produced it (via) and which model held the session
// (model). Neither exists today — no row carries a model, and the session model is not in the
// shell environment (measured 2026-09-01, spike A1). This spec adds a never-blocking
// UserPromptSubmit hook (spec/scripts/spec-session-stamp.sh, D1) that stamps session_id +
// transcript_path to a per-root file, a library (spec/scripts/lib/session-stamp.js, D2) that
// derives the session model from that transcript, and --via/--model on verdict.js (D3). These
// tests are written BEFORE any of the three exist (TDD red, 2026-09-01) — every test here fails
// on a missing spec-session-stamp.sh / lib/session-stamp.js / unknown-flag verdict.js and must go
// green only once the mechanism genuinely behaves as D1/D2/D3 and the Behavior table describe.
// AC-20260901-02-1, -2, -3, -6 below.
//
// specs/20260901/05-checkpoint-fail-closed.md D3 (2026-09-01, brief 18a): verdict.js gains
// --checkpoint <cleared|stamp-appeared|overridden|not-reached> and --checkpoint-reason <text>,
// review-profile only, inserting a `checkpoint` key immediately after `verdict` (before
// `escalated`) on the printed row. Written before either flag exists (TDD red, 2026-09-01) —
// AC-20260901-05-6 and -05-7 below fail against current code because --checkpoint falls through
// to the generic unknown-flag usage() refusal, and the row never carries the key at all.
// AC-20260901-05-8 tags the pre-existing AC-20260901-02-6 byte-identity test in place (D3
// requires that test to keep passing untouched — via/model's insertion point is unaffected).

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
// own SIX_GREEN fixture (2026-09-01 fixture-defect repair: the original one-leg, all-fields-absent
// manifest here derived UNVERIFIED, never CLEAN, so every --status-0 assertion below failed on the
// verdict word rather than on the via/model contract this file exists to pin).
const CLEAN_LEGS = [
  { leg: 'gate', exit: 0, observed: { skips: 0, todos: 0, testsExecuted: 40 } },
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

test('AC-20260901-02-3: verdict.js --via loop --model <id> on a review-profile ledger pass prints a row whose key order begins ts, spec, stage, tier, via, model, runId with the passed values', () => {
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

test('AC-20260901-02-6 (also AC-20260901-05-8, SHALL CONTINUE TO): verdict.js run without --via/--model, diffed against the same manifest/workflow WITH --via/--model minus ts and the via/model keys, is byte-identical — every pre-existing field keeps its value and position, and neither pass carries a checkpoint key since neither passes --checkpoint', () => {
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

// AC-20260901-05-6 / AC-20260901-05-7 --------------------------------------------------------

test('AC-20260901-05-6: verdict.js --via loop --checkpoint cleared on a review-profile ledger pass prints a row whose keys carry checkpoint immediately after verdict, deep-equal to {"outcome":"cleared"}; --checkpoint overridden --checkpoint-reason "jq missing" prints checkpoint deep-equal to {"outcome":"overridden","reason":"jq missing"}', () => {
  const { manifest, workflow } = manifestFixture()
  const clearedRetain = fs.realpathSync(tmpdir('verdict-checkpoint-cleared'))
  const rCleared = runNode('scripts/verdict.js', [
    '--manifest', manifest, '--workflow', workflow, '--ledger', '--spec', 'specs/x.md', '--tier', 'standard',
    '--retain', clearedRetain, '--via', 'loop', '--checkpoint', 'cleared'
  ])
  assert.strictEqual(rCleared.status, 0, 'a clean manifest+workflow with a valid --checkpoint value must still derive CLEAN and exit 0: ' + rCleared.stdout + rCleared.stderr)
  const lineCleared = rCleared.stdout.trim().split('\n')[1]
  assert.ok(lineCleared, 'a --ledger pass with --checkpoint cleared must print a second stdout line carrying the row: ' + rCleared.stdout)
  const rowCleared = JSON.parse(lineCleared)
  const keysCleared = Object.keys(rowCleared)
  const verdictIdx = keysCleared.indexOf('verdict')
  assert.notStrictEqual(verdictIdx, -1, 'the row must carry a verdict key at all: ' + JSON.stringify(rowCleared))
  assert.strictEqual(keysCleared[verdictIdx + 1], 'checkpoint',
    'D3: the checkpoint key must be inserted immediately after verdict (before escalated) — a different position would break the fixed key-order sibling AC-20260901-02-3 pins on the first seven keys and would leave escalated ahead of the field that explains why a run reached it: ' + JSON.stringify(rowCleared))
  assert.deepStrictEqual(rowCleared.checkpoint, { outcome: 'cleared' },
    'a --checkpoint cleared pass must print row.checkpoint deep-equal to {"outcome":"cleared"} — no reason key belongs on a non-overridden outcome: ' + JSON.stringify(rowCleared))

  const overriddenRetain = fs.realpathSync(tmpdir('verdict-checkpoint-overridden'))
  const rOverridden = runNode('scripts/verdict.js', [
    '--manifest', manifest, '--workflow', workflow, '--ledger', '--spec', 'specs/x.md', '--tier', 'standard',
    '--retain', overriddenRetain, '--via', 'loop', '--checkpoint', 'overridden', '--checkpoint-reason', 'jq missing'
  ])
  assert.strictEqual(rOverridden.status, 0, 'a clean manifest+workflow with --checkpoint overridden and a non-blank reason must exit 0: ' + rOverridden.stdout + rOverridden.stderr)
  const rowOverridden = JSON.parse(rOverridden.stdout.trim().split('\n')[1])
  assert.deepStrictEqual(rowOverridden.checkpoint, { outcome: 'overridden', reason: 'jq missing' },
    'a --checkpoint overridden pass must print row.checkpoint deep-equal to {"outcome":"overridden","reason":"jq missing"} — the reason is what makes an overridden row auditable on the ledger: ' + JSON.stringify(rowOverridden))
})

test('AC-20260901-05-7: verdict.js refuses (exit 2, stderr naming --checkpoint, no ledger row printed) an out-of-enum --checkpoint value, --checkpoint overridden with no --checkpoint-reason, --checkpoint-reason without --checkpoint overridden, --checkpoint with --profile release, and --checkpoint with --via direct or --via absent', () => {
  const { manifest, workflow } = manifestFixture()
  const common = ['--manifest', manifest, '--workflow', workflow, '--ledger', '--spec', 'specs/x.md', '--tier', 'standard']

  const cases = [
    { name: 'out-of-enum value', args: [...common, '--via', 'loop', '--checkpoint', 'skipped'] },
    { name: 'overridden with no reason', args: [...common, '--via', 'loop', '--checkpoint', 'overridden'] },
    { name: 'reason without overridden', args: [...common, '--via', 'loop', '--checkpoint', 'cleared', '--checkpoint-reason', 'x'] },
    { name: '--profile release', args: [...common, '--profile', 'release', '--checkpoint', 'cleared'] },
    { name: '--via direct', args: [...common, '--via', 'direct', '--checkpoint', 'cleared'] },
    { name: 'no --via at all', args: [...common, '--checkpoint', 'cleared'] },
  ]
  for (const c of cases) {
    const r = runNode('scripts/verdict.js', c.args)
    assert.strictEqual(r.status, 2,
      `AC-20260901-05-7 (${c.name}): must exit 2 — an admitted refusal case here would let a malformed or contextually-invalid checkpoint outcome land on the ledger: ` + r.stdout + r.stderr)
    assert.match(r.stderr, /--checkpoint/,
      `AC-20260901-05-7 (${c.name}): the refusal must name --checkpoint specifically, not fall through to the generic unknown-flag usage line: ` + r.stderr)
    assert.strictEqual(r.stdout.trim().split('\n').filter(Boolean).length, 0,
      `AC-20260901-05-7 (${c.name}): a refused --checkpoint combination must print no verdict word and no ledger row: ` + r.stdout)
  }
})
