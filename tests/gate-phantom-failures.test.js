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
//
// Widened by specs/20260813/05-workflow-correctness-repairs.md D5/AC-20260813-05-9: the gate
// loop (including this phantom-failure hardening) moves into a fragment shared by wf-build AND
// wf-design, so the pin now reads the GENERATED wf-*.js files (where the shared text lands via
// splicing regardless of which body/fragment source it lives in) and asserts it is reachable from
// BOTH workflows — the wf-build half is a regression pin (green pre-change); wf-design gaining it
// is the new behavior wf-design never received when its gate loop was hand-copied instead of shared.

const build = read('spec/workflows/wf-build.js')
const design = read('spec/workflows/wf-design.js')

test('gate-agent prompt requires the runner itself to attribute a failure before it is enumerated (wf-build)', () => {
  assert.match(build, /runner itself attributes/,
    'without this the gate-agent can list a file as failing purely because an error-shaped string ' +
    'appears in its output, even when no test or compiler step in that file actually failed — ' +
    'the prompt must require the runner\'s own attribution, not the model\'s pattern match')
})

test('gate-agent prompt names error strings logged by passing tests as never a failure (wf-build)', () => {
  assert.match(build, /logged by passing tests/i,
    'a mocked-rejection message or an expected-error assertion\'s own console output reads as an ' +
    'error string but belongs to a PASSING test — without this line the gate agent has no reason ' +
    'to exclude it and routes a repair wave at a file that needs no repair')
})

test('AC-20260813-05-9: gate-agent prompt requires the runner itself to attribute a failure before it is enumerated (wf-design)', () => {
  assert.match(design, /runner itself attributes/,
    'wf-design\'s gate loop was hand-copied from wf-build and never received this hardening — ' +
    'the shared gate-loop fragment (D5) must carry it into wf-design too, or a phantom failure ' +
    'can still send a repair wave after an already-green design-stage file')
})

test('AC-20260813-05-9: gate-agent prompt names error strings logged by passing tests as never a failure (wf-design)', () => {
  assert.match(design, /logged by passing tests/i,
    'the same phantom-failure exclusion wf-build carries must reach wf-design via the shared ' +
    'gate-loop fragment — without it, wf-design\'s gate agent has no reason to exclude an error-' +
    'shaped string logged by a passing check and can route a repair wave at a file needing none')
})
