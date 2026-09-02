#!/usr/bin/env node
'use strict'
// ci-query.js (--branch <name> | --commit <sha>) [--root <dir>] — one normalized `gh` wrapper
// answering "what did CI just do?", shared by /spec:review's `ci` leg (--commit, per-SHA),
// /spec:release's `ci` leg (--commit, per-SHA), and spec 20260805/03's observe-ci.js (--branch,
// trunk latest-run) (review-evidence-manifest D4, spiked A1; per-sha-ci-
// legs D1, spiked A1: `gh run list --commit <sha>` returns `[]` exit 0 for a commit CI never saw
// — executed against the installed `gh` binary).
//
// Two independent gh wrappers was the drift seam a refuter flagged from the review side while
// spec 03 was independently growing its own. This is the one home for the raw-vs-mapped split:
// gh missing, `gh run list` unable to determine a base repo ("no git remotes found" — spiked
// against real gh), or a completed-but-empty run list are all structurally "no CI to
// consult" (available:false, transient:false); gh executing and exiting non-zero for any other
// reason is a retryable auth/network failure (available:false, transient:true); anything else
// is a completed or in-progress run, passed through. --branch and --commit are mutually
// exclusive key modes over the identical normalization — never both, never neither.
//
// What this deliberately does NOT do: interpret conclusion into pass/fail (the review/release
// `ci` legs and observe-ci.js each map the normalized fields to their own exit codes), retry, or
// read more than the most recent run for the key (--limit 1) — the one sanctioned second key is
// the current branch, read only inside the sha-unseen fallback below (still --limit 1, never
// polled or retried).
//
// specs/20260813/10-host-capabilities.md D2: a host with no forge adapter (e.g.
// GitLab/Bitbucket, or no `gh`) was silently probed as if it were GitHub — `gh` missing already
// answered `available:false`, but nothing distinguished "this host declares it has no CI forge"
// from "gh happens to be uninstalled right now." When the host config declares
// `capabilities.forge:"none"`, this script now short-circuits BEFORE ever invoking `gh`: it
// prints the canonical line `unavailable — no supported forge adapter` (plain text, not the JSON
// shape below — a Claude session reads either) and exits 0. `capabilities.forge:"github"` or an
// absent `capabilities` block (legacy mode) fall through to the unchanged dynamic `gh` probe.
//
// specs/20260830/03-ci-leg-honest-absence.md D1/D2/D3:
// an unpushed HEAD's empty --commit run list was indistinguishable from "no CI at all" — origin's
// branch could be red for days while the leg read green (observed: 23 unpushed local commits,
// origin red four days, review CLEAN). --commit mode's empty-run-list branch now disambiguates
// before answering: `git branch -r --contains <sha>` (cwd --root) — a nonempty result means the
// sha genuinely IS on a remote ref with no runs recorded, so today's plain shape stands unchanged
// (D2, the "real absence" case). An empty result means the commit is unpushed; `git rev-parse
// --abbrev-ref HEAD` names the current branch, and this script re-runs its own `--branch <name>`
// query in-process against that branch. A real run found there emits `{available:false,
// transient:false, shaUnseen:true, branch, branchRun:{status,conclusion,url,runAt}}` — never a
// probed conclusion for the commit itself, only the branch's own latest one. Any failure along
// this fallback (detached HEAD — `rev-parse` prints `HEAD`, the containment probe erroring on an
// unresolvable sha, the branch query failing or returning empty/unparseable output) degrades to
// today's plain shape (D3) — the fallback is best-effort evidence enrichment, never a new way to
// crash or redden a leg. Doubles the `gh` call count only in the sha-unseen state; steady-state
// pushed workflows pay nothing extra.
//
// Exit codes: 0 = answered (available true or false either way, the shaUnseen shape, OR the
// forge:"none" canonical line) · 2 = usage error

const { spawnSync } = require('child_process')
const { declaredForge } = require('./lib/host-config')

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

// D2: capabilities.forge:"none" is a declared, not probed, fact — read it before touching `gh`.
// A missing/unreadable/unparsable config is legacy mode (dynamic probing continues unchanged);
// lib/host-config.js is the sole reader of that declaration for both CI scripts.
if (declaredForge(root) === 'none') {
  console.log('unavailable — no supported forge adapter')
  process.exit(0)
}

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
    // D1 (--commit mode only): an empty run list for one exact sha is ambiguous — genuinely no CI
    // ran for it, or it simply hasn't reached a remote ref CI would have seen yet. Disambiguate
    // via git before accepting the plain shape above as final.
    if (commit) {
      const containment = spawnSync('git', ['branch', '-r', '--contains', commit], { cwd: root, encoding: 'utf8' })
      // A non-zero containment probe (e.g. an unresolvable sha, exit 129) is D3 degradation —
      // leave `result` as the plain shape already assigned above, never guess.
      if (containment.status === 0 && !containment.stdout.trim()) {
        // Sha is on no remote ref at all — unpushed. Find the current branch and ask what CI last
        // did there; a detached HEAD (`rev-parse` prints the literal `HEAD`) or an unreadable ref
        // is D3 degradation, same as above.
        const headRef = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8' })
        const branchName = headRef.status === 0 ? headRef.stdout.trim() : ''
        if (branchName && branchName !== 'HEAD') {
          const br = spawnSync('gh', ['run', 'list', '--branch', branchName, '--limit', '1',
            '--json', 'status,conclusion,headSha,url,updatedAt'], { cwd: root, encoding: 'utf8' })
          if (br.status === 0) {
            let branchRuns
            try { branchRuns = JSON.parse(br.stdout) } catch { branchRuns = null }
            // A failed gh invocation, an empty list, or unparseable output all fall through to D3
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
