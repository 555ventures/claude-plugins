'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC } = require('./helpers')

// PRAX-20260717-01: worktrees live INSIDE the parent repo (`.claude/worktrees/<name>`), so
// any agent whose tooling walks upward for a project root (pnpm workspace resolution, turbo)
// escapes the worktree and lands in the parent checkout — a live sibling session's working
// tree. On prax a build worker ran `pnpm gate` against `/Users/jj/Projects/prax` instead of
// its worktree and reported a failure in a file that exists only in the main checkout
// (another session's uncommitted work); the orchestrator chased a defect that was never in
// the worker's diff. The fix contract: every wf-build prompt that runs host commands (the
// gate agent, the red-check agent, and the worker self-verify rule) must pin execution to
// the current working directory of dispatch and forbid resolving upward out of it.

const src = fs.readFileSync(
  path.join(SPEC, 'workflows/src/wf-build.body.js'), 'utf8')

// Slice a block from a source marker to a closing marker so assertions bind to the prompt
// that actually runs commands, not to a stray comment elsewhere in the file.
function block(startMarker, endMarker) {
  const start = src.indexOf(startMarker)
  assert.ok(start !== -1, `marker not found: ${startMarker}`)
  const rest = src.slice(start)
  const end = rest.indexOf(endMarker)
  return end === -1 ? rest : rest.slice(0, end)
}

test('gate agent prompt pins the working directory against upward escape', () => {
  const gateBlock = block("phase('Gate')", 'Self-contradiction guard')
  assert.match(gateBlock, /working directory|cwd/i,
    'gate prompt never mentions CWD: a worker whose toolchain resolves upward runs the ' +
    'gate against the parent checkout (.claude/worktrees/ is INSIDE the parent repo)')
  assert.match(gateBlock, /never (cd|change|leave|resolve upward)|do not (cd|change director)/i,
    'gate prompt must forbid leaving the dispatch CWD, not merely mention it')
})

test('red-check prompt pins the working directory against upward escape', () => {
  const redBlock = block("phase('RedCheck')", 'FAIL CLOSED')
  assert.match(redBlock, /working directory|cwd/i,
    'red-check runs the host test command with no CWD pin — same upward-escape hole as the gate')
})

test('worker self-verify rule pins scoped checks to the dispatch CWD', () => {
  const hardRules = block('const HARD_RULES', 'const TEST_RULES')
  assert.match(hardRules, /working directory|cwd/i,
    'HARD_RULES lets workers run scoped self-verify checks but never pins where they run — ' +
    'pnpm/turbo root resolution walks out of the worktree into the parent checkout')
})
