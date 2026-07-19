'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC } = require('./helpers')

// UPWELL-20260718-01: wf-build's TDD red-check joins File Plan paths (repo-root relative,
// e.g. `app/src/foo.test.ts`) directly onto `gate.testCommand`. When the host's test
// command is workspace-filtered (`pnpm --filter app test`), vitest resolves those paths
// relative to the filtered workspace (`app/`), collects zero files, the red-check cannot
// prove allRed, and the workflow conservatively returns `tdd-red-check` with
// `passing: []` — forcing the orchestrator to abandon the workflow for direct dispatch on
// every TDD build on that host. The fix contract: the red-check must hand the agent paths
// it can adapt — either normalize File Plan paths relative to the filtered workspace, or
// instruct the red-check agent to rewrite paths that collect zero files before concluding.

const src = fs.readFileSync(
  path.join(SPEC, 'workflows/src/wf-build.body.js'), 'utf8')

const start = src.indexOf("phase('RedCheck')")
assert.ok(start !== -1, 'RedCheck phase missing from wf-build source')
const redBlock = src.slice(start, src.indexOf('FAIL CLOSED', start))

test('red-check adapts File Plan paths to workspace-filtered test commands', () => {
  assert.match(redBlock, /workspace|relative to/i,
    'red-check joins repo-root-relative File Plan paths onto the test command verbatim: ' +
    'under `pnpm --filter <ws> test` the runner resolves them inside the workspace, ' +
    'collects zero files, and every TDD build falls back to direct dispatch')
})

test('red-check treats "no test files collected" as a path problem, not a red state', () => {
  assert.match(redBlock, /no test files|zero (test )?files|collect/i,
    'a runner that collects zero files proves nothing about red/green — the prompt must ' +
    'name this case so the agent does not report it as an unverified red state')
})
