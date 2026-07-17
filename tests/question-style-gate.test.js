'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { SPEC } = require('./helpers')
const { spawnSync } = require('node:child_process')

const HOOK = path.join(SPEC, 'scripts/question-style-gate.js')

function run(payload) {
  const input = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return spawnSync('node', [HOOK], { encoding: 'utf8', input })
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
