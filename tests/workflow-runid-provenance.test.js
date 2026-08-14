'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, read } = require('./helpers')

// INTAKE pin JJ-20260814-02 (2026-08-14, review of specs/20260813/06-report-renderer.md, run
// wf_59aba53d-4a5; grounding: 06-report-renderer.md's "Review disposition" section and
// specs/20260813/06a-return-envelope-corrections.md D1/D2 + Assumption A2). Spec 06 D9
// required every workflow return to pin its own `runId`. A workflow script cannot obtain
// one — the harness mints it at invoke time and delivers it only in the CALLER's tool
// result; no sandbox global carries it (06a A2, executed micro-spike). The build worker
// read spec/commands/build.md's resume wording — "reuse the prior `runId` if known" — as
// implying the orchestrator threads a run id into the workflow's `args`, and echoed
// `args.runId` into all six wf-*.body.js returns, where it was permanently `undefined`.
//
// The pin: build.md's resume sentence still does not say where the runId comes from. It
// reads exactly the same today as it did when it was misread — nothing in it rules out
// "the workflow receives its own runId through args", so the next workflow author is free
// to re-derive the identical mistake. EXPECTED-RED: this is a deliberate backlog pin, not a
// defect in this test. Turns green when build.md's resume clause is edited to state
// explicitly that the runId comes from the Workflow tool's result (orchestrator-held) and
// is never threaded into a workflow's own `args`.
//
// Scope note: this pin does NOT re-assert spec 06a's D1 fix (deleting the six
// `runId: args.runId` echoes from spec/workflows/src/wf-*.body.js) — that symptom is
// already closed as of commits ecf520b/a4aeb97/6a1cb1e (spec 06a, shipped 6.67.0, reviewed
// CLEAN) and is already pinned green by tests/report/return-slots.test.js (AC-20260813-06-8/
// 06a-1, "none of the six pins `runId` anywhere in its source"). A corroborating
// echo-count assertion here would already pass today, which is not a sanctioned backlog
// pin (INTAKE pins must fail on current code) — duplicating an already-green check under an
// EXPECTED-RED header would misrepresent it as open work. What remains open, and what this
// file pins, is the doctrine ambiguity in build.md itself: 06a fixed the six symptomatic
// echoes mechanically without touching the sentence that caused the misreading, so the same
// mistake is still one plausible reading away for the next author.

const BUILD = path.join(ROOT, 'spec/commands/build.md')

test('JJ-20260814-02: build.md\'s resume sentence states the runId comes from the Workflow tool result, never that a workflow receives one through its own args', () => {
  assert.ok(fs.existsSync(BUILD),
    'spec/commands/build.md does not exist — JJ-20260814-02 has nothing to check; the resume ' +
    'wording that caused spec 06 D9\'s misread lives in this file')
  const build = read('spec/commands/build.md')

  // \s+ (not a literal space) between "prior" and "`runId`" — build.md hard-wraps this
  // sentence across a line break, and a literal-space pin would silently never match.
  const resume = /this is a resume[^)]*reuse the prior\s+`runId`\s+if known\)/.exec(build)
  assert.ok(resume,
    'build.md no longer contains the resume-runId sentence ("this is a resume ... reuse the ' +
    'prior `runId` if known)") this pin is aimed at — re-aim or retire JJ-20260814-02 rather ' +
    'than leaving it pointed at text that has moved or been reworded')

  assert.match(resume[0], /Workflow tool(?:'s)? result|orchestrator[- ]held|never (?:passed|threaded|supplied) (?:in|through|via) `?args`?/i,
    'build.md\'s resume clause ("reuse the prior `runId` if known") names no source for the ' +
    'id it tells the reader to reuse, so it reads as consistent with "the workflow already ' +
    'has its runId" — precisely the misreading that produced spec 06 D9\'s `args.runId` echo ' +
    'across all six workflow bodies (repealed mechanically in 06a without this sentence ever ' +
    'changing). Remedy: clarify the resume clause to state the runId is read from the ' +
    'Workflow tool\'s own result (orchestrator-held) and is never something a workflow ' +
    'receives through its args, so the next workflow author cannot re-derive the same mistake.')
})
