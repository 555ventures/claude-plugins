'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// UPWELL-20260725-01: a File Plan row that bundles an edit to a DIFFERENT file
// ("create cli.ts; add the npm scripts to app/package.json in this row") hands the
// worker a file outside its batch assignment; the worker contract correctly forbids
// touching it, so the bundled edit silently becomes an orchestrator duty nobody
// recorded (upwell spec 20260725/03). Fix contract: plan doctrine requires every
// touched file to get its own File Plan row (or the bundled edit stated explicitly
// under orchestrator duties) — the row grammar, not worker vigilance, prevents the
// silent drop.

const plan = read('spec/commands/plan.md')

test('plan.md forbids File Plan rows that bundle edits to other files', () => {
  assert.match(plan, /own (File Plan )?row|one file per row|every (touched )?file .{0,40}row|bundle/i,
    'nothing stops a row from smuggling a second file\'s edit into its description: ' +
    'the worker may not touch it, the orchestrator never sees it, and the edit is ' +
    'silently dropped from the build')
})
