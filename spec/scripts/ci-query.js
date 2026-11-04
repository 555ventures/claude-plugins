#!/usr/bin/env node
'use strict'
// ci-query.js --commit <sha> [--root <dir>] — one normalized `gh` wrapper answering "what did CI
// do for this commit?", shared by the review stage's `ci` leg and /spec:release's `ci` leg.
// Owner: specs/20260813/10-host-capabilities.md, specs/20260830/03-ci-leg-honest-absence.md, specs/20261102/01-the-host-names-its-runner-grammar.md
//
// `gh run list --commit <sha>` returns `[]` exit 0 for a commit CI never saw (executed against
// the installed `gh` binary). gh missing, `gh run list` unable to determine a base repo ("no git
// remotes found"), or a completed-but-empty run list are all structurally "no CI to consult"
// (available:false, transient:false); gh executing and exiting non-zero for any other reason is a
// retryable auth/network failure (available:false, transient:true); anything else is a completed
// or in-progress run, passed through.
//
// What this deliberately does NOT do: interpret conclusion into pass/fail (the review/release
// `ci` legs map the normalized fields to their own exit codes), retry, or read more than the most
// recent run for the key (--limit 1) — the one sanctioned second key is the current branch, read
// only inside the sha-unseen fallback below (still --limit 1, never polled or retried).
//
// Forge is fail-closed: only a host declaring `capabilities.forge:"github"` is probed. Anything
// else short-circuits BEFORE `gh`: it prints the canonical line `unavailable — no supported forge
// adapter` (plain text, not the JSON shape below) and exits 0.
//
// Sha-unseen fallback: an empty run list is disambiguated with `git branch -r --contains <sha>`
// (cwd --root). Nonempty means the sha is on a remote ref with no runs — the plain shape stands.
// Empty means the commit is unpushed: `git rev-parse --abbrev-ref HEAD` names the current branch
// and its latest run, when one exists, emits `{available:false, transient:false, shaUnseen:true,
// branch, branchRun:{status,conclusion,url,runAt}}` — never a conclusion for the commit itself.
// Any failure along the fallback (detached HEAD, an unresolvable sha, the branch query failing or
// returning empty/unparseable output) degrades to the plain shape.
//
// Exit codes: 0 = answered (available true or false either way, the shaUnseen shape, OR the
// no-forge-adapter canonical line) · 2 = usage error

const { spawnSync } = require('child_process')
const { declaredForge } = require('./lib/host-config')

function usage() {
  console.error('usage: ci-query.js --commit <sha> [--root <dir>]')
}

let commit = null, root = '.'
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--commit') commit = argv[++i]
  else if (a === '--root') root = argv[++i]
  else { usage(); process.exit(2) }
}
if (!commit) { usage(); process.exit(2) }

// Only a declared `github` forge is probed; lib/host-config.js is the sole reader of that
// declaration for both CI scripts. Remedy for a host that should be probed: /spec:init.
if (declaredForge(root) !== 'github') {
  console.log('unavailable — no supported forge adapter')
  process.exit(0)
}

const NO_REMOTE = /no git remotes found|failed to determine base repo/i

const r = spawnSync('gh', ['run', 'list', '--commit', commit, '--limit', '1',
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
    result = { available: false, transient: false } // structural: no runs recorded for this sha
    // An empty run list for one exact sha is ambiguous — genuinely no CI ran for it, or it hasn't
    // reached a remote ref CI would have seen yet. Disambiguate via git (header).
    {
      const containment = spawnSync('git', ['branch', '-r', '--contains', commit], { cwd: root, encoding: 'utf8' })
      // A non-zero containment probe (e.g. an unresolvable sha, exit 129) degrades —
      // leave `result` as the plain shape already assigned above, never guess.
      if (containment.status === 0 && !containment.stdout.trim()) {
        // Sha is on no remote ref at all — unpushed. Find the current branch and ask what CI last
        // did there; a detached HEAD (`rev-parse` prints the literal `HEAD`) or an unreadable ref
        // degrades the same way as above.
        const headRef = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8' })
        const branchName = headRef.status === 0 ? headRef.stdout.trim() : ''
        if (branchName && branchName !== 'HEAD') {
          const br = spawnSync('gh', ['run', 'list', '--branch', branchName, '--limit', '1',
            '--json', 'status,conclusion,headSha,url,updatedAt'], { cwd: root, encoding: 'utf8' })
          if (br.status === 0) {
            let branchRuns
            try { branchRuns = JSON.parse(br.stdout) } catch { branchRuns = null }
            // A failed gh invocation, an empty list, or unparseable output all fall through to
            // degradation (the plain shape assigned above stays final) — only a real run upgrades it.
            if (Array.isArray(branchRuns) && branchRuns.length > 0) {
              const run = branchRuns[0]
              result = {
                available: false, transient: false, shaUnseen: true, branch: branchName,
                branchRun: { status: run.status, conclusion: run.conclusion, url: run.url, runAt: run.updatedAt },
              }
            }
          }
        }
      }
    }
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
