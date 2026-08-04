'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// HEARWELL-20260804-01: wf-build's gate-agent prompt asks a haiku-tier model to read raw command
// output and list failing files. It has no instruction to distinguish a runner-attributed failure
// (a failing test block, a compiler/lint error line) from an error-SHAPED string a PASSING test
// deliberately logged (a mocked-rejection message, an "expected error" assertion's own console
// output). The model pattern-matches on the string and enumerates a phantom failure, sending a
// repair wave after a file that is already green. Fix contract: the prompt must require
// cross-checking the runner's own per-file pass/fail summary before listing any file.

const src = read('spec/workflows/src/wf-build.body.js')

test('gate-agent prompt requires the runner itself to attribute a failure before it is enumerated', () => {
  assert.match(src, /runner itself attributes/,
    'without this the gate-agent can list a file as failing purely because an error-shaped string ' +
    'appears in its output, even when no test or compiler step in that file actually failed — ' +
    'the prompt must require the runner\'s own attribution, not the model\'s pattern match')
})

test('gate-agent prompt names error strings logged by passing tests as never a failure', () => {
  assert.match(src, /logged by passing tests/i,
    'a mocked-rejection message or an expected-error assertion\'s own console output reads as an ' +
    'error string but belongs to a PASSING test — without this line the gate agent has no reason ' +
    'to exclude it and routes a repair wave at a file that needs no repair')
})
