'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT } = require('../helpers')

// specs/20260907/09-atlas-index-and-note-navigation.md D15: on a multi-core machine, `node
// --test` with no cap fans out one worker per core, and this spec's five Chrome-driving ACs
// running alongside the rest of the suite starved unrelated files of CPU — one full-suite leg
// passed but pushed several pre-existing files over their per-file budget, another leg failed a
// genesis test that passes in isolation. Capping `--test-concurrency` on both `gateCommand` and
// `testCommand` in `.claude/spec.config.json` is what makes a run reproducible; this test is the
// guard a later regeneration of that file cannot silently drop. Intent, not byte-exact text, is
// pinned — an unrelated reordering of flags must not redden this.

function concurrencyValue(command, label) {
  const m = /--test-concurrency=(\d+)\b/.exec(command)
  assert.ok(m,
    'D15: ' + label + ' must carry a --test-concurrency=<n> flag — without it node --test fans out ' +
    'one worker per core again, this spec\'s Chrome-driving ACs starve unrelated files of CPU, and ' +
    'a green full-suite run stops proving anything (the suite becomes a coin flip): got ' + JSON.stringify(command))
  return Number(m[1])
}

test('D15: .claude/spec.config.json caps test-file parallelism at --test-concurrency=3 (or lower) on both gateCommand and testCommand', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/spec.config.json'), 'utf8'))

  const gateN = concurrencyValue(config.gateCommand, 'gateCommand')
  assert.ok(gateN <= 3,
    'D15: gateCommand\'s --test-concurrency value must be 3 or lower — a higher (or removed) cap ' +
    'lets node --test fan out past the budget this spec\'s executed evidence found unsafe on a ' +
    '6-core machine, making gate runs non-reproducible again: got ' + gateN + ' in ' + JSON.stringify(config.gateCommand))

  const testN = concurrencyValue(config.testCommand, 'testCommand')
  assert.ok(testN <= 3,
    'D15: testCommand\'s --test-concurrency value must be 3 or lower — a higher (or removed) cap ' +
    'lets the whole-suite leg fan out past the budget this spec\'s executed evidence found unsafe ' +
    'on a 6-core machine, making a green full-suite run stop proving anything: got ' + testN + ' in ' + JSON.stringify(config.testCommand))
})
