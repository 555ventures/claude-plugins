'use strict'
// lib/walk-files.js — exports `walkFiles(root)`, the one recursive file walk
// lib/scan-test-calls.js (specs/20260911/02-tests-have-a-ceiling.md D2's `listTestFiles`) and
// lib/invariants.js (specs/20260911/03-tests-expire-at-close.md D1's universe) share. Two private
// copies of one walk let the count, coverage-scope, and expiry gates disagree with red-check.js
// about which files exist; a single copy is what keeps "a file the pipeline can see" one answer.
//
// Returns absolute paths of every REGULAR file under `root`, in readdir order, depth-first. A
// directory whose bare name is `.git`, `node_modules`, `fixtures`, or `__fixtures__` is never
// descended, nor is the one relative path `.claude/worktrees` (a directory named "worktrees"
// anywhere else IS descended — D2's skip set is a bare-name match everywhere else). A symlink is
// resolved with `statSync`: a link whose target is a regular file is pushed under the LINK's own
// path, so a test file that is itself a link still classifies; a link to a directory is skipped
// and never descended, because following one walks the link's whole target tree (a fixture's
// `node_modules` link) and the skip set keys on the link's own name, not its target's. A broken
// link, a socket, a FIFO, and an unreadable directory are all skipped silently — an unreadable
// directory cannot be a source of truth about scripts or test cases, and every caller here is a
// derivation that reports on what it can see.
//
// What this deliberately does NOT do: apply the host's `testGlobs` (the callers classify what it
// returns); return repo-relative paths (callers hold their own `relPosix`, because one of them
// needs absolute paths for `require` resolution); accept a caller-supplied skip set (the two
// callers share one by derivation — a parameter here would re-open the drift this file closes);
// or consult `.gitignore` (red-check.js's walkAll owns the git-ignored prune and its pruned-path
// counter, which these two callers have no notion of).
//
// Exit codes: n/a (library, not an entrypoint).

const fs = require('fs')
const path = require('path')

const SKIP_DIR_NAMES = new Set(['.git', 'node_modules', 'fixtures', '__fixtures__'])

function relPosix(root, abs) {
  return path.relative(root, abs).split(path.sep).join('/')
}

function walk(dir, root, out) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name) || relPosix(root, full) === '.claude/worktrees') continue
      walk(full, root, out)
    } else if (entry.isFile()) {
      out.push(full)
    } else if (entry.isSymbolicLink()) {
      let target
      try {
        target = fs.statSync(full)
      } catch {
        continue
      }
      if (target.isFile()) out.push(full)
    }
  }
}

function walkFiles(root) {
  const out = []
  walk(root, root, out)
  return out
}

module.exports = { walkFiles, SKIP_DIR_NAMES }
