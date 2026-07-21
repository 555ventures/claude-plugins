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

test('judge rewrite verdict blocks with the stated problem', () => {
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

test('tier-1 failures block before the judge is ever consulted', () => {
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
