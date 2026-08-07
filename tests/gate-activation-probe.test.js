'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// PRAX-20260721-04 (corroborated by upwell escape 2026-07-24, turbo-cached test leg
// behind a review CLEAN): a gateCommand leg can be a cache LOOKUP instead of an
// execution at two independent levels — the task runner's cache AND each tool's own
// incremental cache (ruff served stale "All checks passed" over files that were red;
// runner-level --force re-invokes the tool, which answers from its own stale cache).
// Six red files stayed invisibly red across ~36 commits behind a CLEAN review. Fix
// contract: an activation probe, not a flag convention — verify each gate leg is an
// execution by injecting a trivially red probe, running the leg, requiring non-zero
// exit, and removing the probe; plus doctrine that legs must be cache-defeating per
// tool, not just per runner.

const init = read('spec/commands/init.md')
const doctor = read('spec/commands/doctor.md')

test('a gate leg is proven an execution by a red activation probe', () => {
  assert.ok(
    /activation probe|inject.*(red|violation|probe)|known-(red|violation)|probe file/i.test(init) ||
    /activation probe|inject.*(red|violation|probe)|known-(red|violation)|probe file/i.test(doctor),
    'neither init nor doctor verifies gate legs actually execute: a leg answering from ' +
    'a stale tool-level cache stays green over known-red files, and the inertness is ' +
    'invisible to any runner-level countermeasure until it surfaces as an escape')
})

test('gate doctrine requires cache-defeat per tool, not just per runner', () => {
  assert.ok(
    /per[- ]tool|tool('s|-level)? (own )?cache|incremental cache/i.test(init) ||
    /per[- ]tool|tool('s|-level)? (own )?cache|incremental cache/i.test(doctor),
    'the runner-level --force lesson (PRAX-20260717-02) is structurally insufficient: ' +
    'the tool underneath can still serve its own stale verdict')
})
