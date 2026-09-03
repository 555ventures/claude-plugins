'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { SPEC } = require('./helpers')
const { spawnSync } = require('node:child_process')

const HOOK = path.join(SPEC, 'scripts/question-style-gate.js')

function run(payload, env = {}) {
  const input = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return spawnSync('node', [HOOK], {
    encoding: 'utf8',
    input,
    env: { ...process.env, SPEC_QUESTION_JUDGE: 'off', ...env },
  })
}

// Tier-2 judge tests: point SPEC_QUESTION_JUDGE_BIN at a fake reviewer that emits a
// canned verdict, so no real model call ever happens in the suite.
const fs = require('node:fs')
const os = require('node:os')

function fakeJudge(stdout, exitCode = 0) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'question-judge-'))
  const bin = path.join(dir, 'fake-claude')
  fs.writeFileSync(bin, `#!/bin/sh\nprintf '%s' ${JSON.stringify(stdout)}\nexit ${exitCode}\n`, { mode: 0o755 })
  return bin
}

function runJudged(payload, stdout, exitCode = 0) {
  return run(payload, { SPEC_QUESTION_JUDGE: '', SPEC_QUESTION_JUDGE_BIN: fakeJudge(stdout, exitCode) })
}

function ask(questions) {
  return { tool_name: 'AskUserQuestion', tool_input: { questions } }
}

const GOOD_OPT = {
  label: 'Fixed list (Recommended)',
  description:
    'A typo or unknown notice fails loudly during development instead of shipping as a blank notice; adding a type later is a one-line change.',
}
const GOOD_ALT = {
  label: 'Any text',
  description: 'New notice types need no code change, but a misspelled one ships silently and users see a broken notice.',
}

test('consequence-bearing descriptions allow', () => {
  const res = run(
    ask([
      {
        question: 'Should system notices only come from a fixed list, or accept any text?',
        header: 'Notices',
        multiSelect: false,
        options: [GOOD_OPT, GOOD_ALT],
      },
    ])
  )
  assert.strictEqual(res.status, 0, res.stderr)
})

test('missing or too-short description blocks with rewrite guidance', () => {
  const res = run(
    ask([
      {
        question: 'Validate the notice key as a closed enum?',
        header: 'Schema',
        multiSelect: false,
        options: [{ label: 'Closed z.enum (Recommended)' }, { label: 'Open string key', description: 'open key' }],
      },
    ])
  )
  assert.strictEqual(res.status, 2)
  assert.match(res.stderr, /BLOCKED/)
  assert.match(res.stderr, /consequence/)
  assert.match(res.stderr, /WHY it is recommended/)
})

test('description that merely restates the label blocks', () => {
  const res = run(
    ask([
      {
        question: 'Which storage should the app use for session data?',
        header: 'Storage',
        multiSelect: false,
        options: [
          { label: 'Redis-backed sessions', description: 'Redis backed sessions!' },
          GOOD_ALT,
        ],
      },
    ])
  )
  assert.strictEqual(res.status, 2)
  assert.match(res.stderr, /restates the label/)
})

test('jargon-dense question text blocks (>=2 backticked identifiers)', () => {
  const res = run(
    ask([
      {
        question: 'Should `data-system-notice` be validated by `systemNoticeKeySchema` as a closed enum?',
        header: 'Schema',
        multiSelect: false,
        options: [GOOD_OPT, GOOD_ALT],
      },
    ])
  )
  assert.strictEqual(res.status, 2)
  assert.match(res.stderr, /behavior\/outcome/)
})

test('fail-open: malformed JSON, missing questions, empty payload', () => {
  assert.strictEqual(run('not json{{').status, 0)
  assert.strictEqual(run({ tool_input: {} }).status, 0)
  assert.strictEqual(run({}).status, 0)
  assert.strictEqual(run(ask('nope')).status, 0)
})

const TIER1_CLEAN = ask([
  {
    question: 'Should system notices only come from a fixed list, or accept any text?',
    header: 'Notices',
    multiSelect: false,
    options: [GOOD_OPT, GOOD_ALT],
  },
])

test('AC-20260902-06-7: judge rewrite verdict blocks with the stated problem', () => {
  const res = runJudged(TIER1_CLEAN, '{"verdict":"rewrite","problems":["\\"fixed list\\" assumes the owner knows what feeds the list"]}')
  assert.strictEqual(res.status, 2)
  assert.match(res.stderr, /ten seconds/)
  assert.match(res.stderr, /assumes the owner knows/)
  assert.match(res.stderr, /gains or loses/)
})

test('judge derive verdict blocks with the auto-pick announcement instruction', () => {
  const res = runJudged(TIER1_CLEAN, '{"verdict":"derive","problems":["the failing test already names the notice list"]}')
  assert.strictEqual(res.status, 2)
  assert.match(res.stderr, /answerable without the user/)
  assert.match(res.stderr, /📌 Auto-picked/)
  assert.match(res.stderr, /cheapest to reverse/)
})

test('judge pass verdict allows', () => {
  assert.strictEqual(runJudged(TIER1_CLEAN, '{"verdict":"pass","problems":[]}').status, 0)
})

test('judge fails open: garbage output, nonzero exit, missing binary, judge off', () => {
  assert.strictEqual(runJudged(TIER1_CLEAN, 'sorry, as an AI I cannot').status, 0)
  assert.strictEqual(runJudged(TIER1_CLEAN, '{"verdict":"rewrite","problems":[]}', 1).status, 0)
  assert.strictEqual(run(TIER1_CLEAN, { SPEC_QUESTION_JUDGE: '', SPEC_QUESTION_JUDGE_BIN: '/nonexistent/claude' }).status, 0)
  // judge explicitly off: a bouncing fake binary must never be reached
  assert.strictEqual(run(TIER1_CLEAN, { SPEC_QUESTION_JUDGE: 'off', SPEC_QUESTION_JUDGE_BIN: fakeJudge('{"verdict":"rewrite","problems":["x"]}') }).status, 0)
})

test('AC-20260902-06-7: tier-1 failures block before the judge is ever consulted', () => {
  const res = run(
    ask([
      {
        question: 'Validate the notice key as a closed enum?',
        header: 'Schema',
        multiSelect: false,
        options: [{ label: 'Closed z.enum (Recommended)' }, { label: 'Open string key', description: 'open key' }],
      },
    ]),
    { SPEC_QUESTION_JUDGE: '', SPEC_QUESTION_JUDGE_BIN: fakeJudge('{"verdict":"pass","problems":[]}') }
  )
  assert.strictEqual(res.status, 2)
  assert.match(res.stderr, /consequence/)
})

// specs/20260902/06-mocks-provenance-ledger.md D5/D6, AC-20260902-06-6..8: the product-stage
// exemption (design/mocks/status.json not APPROVED, or .claude/genesis/status.json with no
// handoff) suppresses a `derive` judge verdict; `rewrite` and tier-1 stay unchanged; the judge
// prompt gains the citation-is-not-a-decision sentence everywhere, in or out of a stage.

function stageDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mocks-stage-'))
}

function writeMocksStatus(dir, state) {
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/status.json'), JSON.stringify({ state }))
}

function writeGenesisStatus(dir, handoff) {
  fs.mkdirSync(path.join(dir, '.claude/genesis'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/genesis/status.json'), JSON.stringify({ handoff }))
}

// Runs the hook with a fully-controlled env: CLAUDE_PROJECT_DIR is always deleted first (the
// host session running this suite may itself have it set), so each test's env override is the
// only source of truth for root resolution.
function runStage(payload, envOverrides) {
  const input = typeof payload === 'string' ? payload : JSON.stringify(payload)
  const env = { ...process.env }
  delete env.CLAUDE_PROJECT_DIR
  Object.assign(env, envOverrides)
  return spawnSync('node', [HOOK], { encoding: 'utf8', input, env })
}

const DERIVE_JSON = '{"verdict":"derive","problems":["x"]}'

test('AC-20260902-06-6: a derive verdict is allowed while CLAUDE_PROJECT_DIR points at a non-APPROVED mocks run or a handoff-less genesis run, still blocked once mocks is APPROVED with no genesis file, and allowed via the hook input\'s cwd when CLAUDE_PROJECT_DIR is unset', () => {
  const wireframes = stageDir()
  writeMocksStatus(wireframes, 'WIREFRAMES')
  const inWireframes = runStage(TIER1_CLEAN, {
    SPEC_QUESTION_JUDGE: '', SPEC_QUESTION_JUDGE_BIN: fakeJudge(DERIVE_JSON), CLAUDE_PROJECT_DIR: wireframes,
  })
  assert.strictEqual(inWireframes.status, 0,
    'a mocks run with state !== APPROVED must exempt a derive verdict — every question inside a mocks run is a user decision by construction (D5), so blocking it here defeats the exemption: ' + inWireframes.stderr)

  const genesis = stageDir()
  writeGenesisStatus(genesis, null)
  const inGenesis = runStage(TIER1_CLEAN, {
    SPEC_QUESTION_JUDGE: '', SPEC_QUESTION_JUDGE_BIN: fakeJudge(DERIVE_JSON), CLAUDE_PROJECT_DIR: genesis,
  })
  assert.strictEqual(inGenesis.status, 0,
    'a genesis run with handoff === null must equally exempt a derive verdict per D5\'s second clause: ' + inGenesis.stderr)

  const approved = stageDir()
  writeMocksStatus(approved, 'APPROVED')
  const inApproved = runStage(TIER1_CLEAN, {
    SPEC_QUESTION_JUDGE: '', SPEC_QUESTION_JUDGE_BIN: fakeJudge(DERIVE_JSON), CLAUDE_PROJECT_DIR: approved,
  })
  assert.strictEqual(inApproved.status, 2,
    'once mocks/status.json says APPROVED (and no genesis file exists) the stage window is closed — a derive verdict here must block exactly as it always has, or the exemption leaks past the mocks run it is scoped to: ' + inApproved.stderr)
  assert.match(inApproved.stderr, /BLOCKED — this looks answerable without the user/,
    'the blocked message outside the stage window must be the existing derive-block text — the exemption changes WHEN derive blocks, never the message it blocks with')

  const cwdPayload = { ...TIER1_CLEAN, cwd: wireframes }
  const viaCwd = runStage(cwdPayload, {
    SPEC_QUESTION_JUDGE: '', SPEC_QUESTION_JUDGE_BIN: fakeJudge(DERIVE_JSON),
  })
  assert.strictEqual(viaCwd.status, 0,
    'with CLAUDE_PROJECT_DIR unset, D5\'s root resolution falls back to the hook input\'s own `cwd` field — a session without that env var still gets the exemption inside a mocks run: ' + viaCwd.stderr)
})

test('AC-20260902-06-7: rewrite and tier-1 continue to block exactly as before inside the product-stage window too', () => {
  const wireframes = stageDir()
  writeMocksStatus(wireframes, 'WIREFRAMES')

  const rewriteInStage = runStage(TIER1_CLEAN, {
    SPEC_QUESTION_JUDGE: '', SPEC_QUESTION_JUDGE_BIN: fakeJudge('{"verdict":"rewrite","problems":["x"]}'),
    CLAUDE_PROJECT_DIR: wireframes,
  })
  assert.strictEqual(rewriteInStage.status, 2,
    'D5 exempts only the derive verdict — a rewrite verdict must still block inside a mocks run, or the tier-2 cold-test floor silently disappears for the entire stage: ' + rewriteInStage.stderr)
  assert.match(rewriteInStage.stderr, /ten seconds/)

  const tier1InStage = runStage(
    ask([
      {
        question: 'Validate the notice key as a closed enum?',
        header: 'Schema',
        multiSelect: false,
        options: [{ label: 'Closed z.enum (Recommended)' }, { label: 'Open string key', description: 'open key' }],
      },
    ]),
    { SPEC_QUESTION_JUDGE: '', SPEC_QUESTION_JUDGE_BIN: fakeJudge('{"verdict":"pass","problems":[]}'), CLAUDE_PROJECT_DIR: wireframes }
  )
  assert.strictEqual(tier1InStage.status, 2,
    'a tier-1 failure (description under the floor) must block before the judge is ever consulted, product-stage window or not — the stage read must never be checked ahead of the deterministic floor: ' + tier1InStage.stderr)
  assert.match(tier1InStage.stderr, /consequence/)
})

test('AC-20260902-06-8: the judge prompt carries the literal citation-is-not-a-decision sentence', () => {
  const argvDir = fs.mkdtempSync(path.join(os.tmpdir(), 'question-judge-argv-'))
  const argvFile = path.join(argvDir, 'argv.txt')
  const capturingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'question-judge-'))
  const bin = path.join(capturingDir, 'fake-claude')
  fs.writeFileSync(
    bin,
    `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(argvFile)}\nprintf '%s' ${JSON.stringify('{"verdict":"pass","problems":[]}')}\nexit 0\n`,
    { mode: 0o755 }
  )
  const res = run(TIER1_CLEAN, { SPEC_QUESTION_JUDGE: '', SPEC_QUESTION_JUDGE_BIN: bin })
  assert.strictEqual(res.status, 0, res.stderr)
  const argv = fs.readFileSync(argvFile, 'utf8')
  assert.match(
    argv,
    /A document that cites, discusses, or recommends a subject is never the user deciding it/,
    'D6\'s exact sentence must be present in the prompt handed to the judge on every invocation — its absence means a document citing a subject can still be judged as the user deciding it'
  )
})
