#!/usr/bin/env node
'use strict'
// ci-query.js (--branch <name> | --commit <sha>) [--root <dir>] — one normalized `gh` wrapper
// answering "what did CI just do?", shared by /spec:review's `ci` leg (--commit, per-SHA),
// /spec:release's `ci` leg (--commit, per-SHA), and spec 20260805/03's observe-ci.js (--branch,
// trunk latest-run) (2026-08-05, review-evidence-manifest D4, spiked A1; 2026-08-10, per-sha-ci-
// legs D1, spiked A1: `gh run list --commit <sha>` returns `[]` exit 0 for a commit CI never saw
// — executed against installed gh 2.93.0 in this repo).
//
// Two independent gh wrappers was the drift seam a refuter flagged from the review side while
// spec 03 was independently growing its own. This is the one home for the raw-vs-mapped split:
// gh missing, `gh run list` unable to determine a base repo ("no git remotes found" — spiked
// against real gh 2026-08-05), or a completed-but-empty run list are all structurally "no CI to
// consult" (available:false, transient:false); gh executing and exiting non-zero for any other
// reason is a retryable auth/network failure (available:false, transient:true); anything else
// is a completed or in-progress run, passed through. --branch and --commit are mutually
// exclusive key modes over the identical normalization — never both, never neither.
//
// What this deliberately does NOT do: interpret conclusion into pass/fail (the review/release
// `ci` legs and observe-ci.js each map the normalized fields to their own exit codes), retry, or
// read more than the most recent run for the key (--limit 1).
//
// Exit codes: 0 = answered (available true or false either way) · 2 = usage error

const { spawnSync } = require('child_process')

function usage() {
  console.error('usage: ci-query.js (--branch <name> | --commit <sha>) [--root <dir>]')
}

let branch = null, commit = null, root = '.'
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--branch') branch = argv[++i]
  else if (a === '--commit') commit = argv[++i]
  else if (a === '--root') root = argv[++i]
  else { usage(); process.exit(2) }
}
if ((!branch && !commit) || (branch && commit)) { usage(); process.exit(2) }

const NO_REMOTE = /no git remotes found|failed to determine base repo/i

const keyArgs = branch ? ['--branch', branch] : ['--commit', commit]
const r = spawnSync('gh', ['run', 'list', ...keyArgs, '--limit', '1',
  '--json', 'status,conclusion,headSha,url,updatedAt'], { cwd: root, encoding: 'utf8' })

let result
if (r.error) {
  // gh not on PATH — structural: no CI tooling to consult.
  result = { available: false, transient: false }
} else if (r.status !== 0) {
  result = NO_REMOTE.test(r.stderr || '')
    ? { available: false, transient: false } // structural: repo has no CI to consult
    : { available: false, transient: true } // gh executed but failed — auth/network, retryable
} else {
  let runs
  try {
    runs = JSON.parse(r.stdout)
  } catch {
    runs = null
  }
  if (!Array.isArray(runs)) {
    result = { available: false, transient: true } // gh exited 0 but printed unparseable output
  } else if (runs.length === 0) {
    result = { available: false, transient: false } // structural: no runs recorded for this branch
  } else {
    const run = runs[0]
    result = {
      available: true,
      transient: false,
      status: run.status,
      conclusion: run.conclusion,
      sha: run.headSha,
      url: run.url,
      runAt: run.updatedAt,
    }
  }
}

console.log(JSON.stringify(result))
process.exit(0)
