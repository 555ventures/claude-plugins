'use strict'
// lib/walk-files.js — exports `walkFiles(root)`, the one recursive file walk lib/scan-test-calls.js
// (`listTestFiles`) and lib/invariants.js (its universe) share.
// Owner: specs/20260911/02-tests-have-a-ceiling.md.
//
// Returns absolute paths of every REGULAR file under `root`, in readdir order, depth-first. Never descends
// `.git`, `node_modules`, `fixtures`, `__fixtures__` (bare names) or `.claude/worktrees`. A symlink to a file
// is pushed under the link's own path; a symlink to a directory, a broken link, a socket, a FIFO and an
// unreadable directory are skipped. A git-ignored path (lib/ignored-paths.js) is never returned or descended.
//
// What this deliberately does NOT do: apply `testGlobs`, return repo-relative paths, accept a
// caller-supplied skip set, or count what the ignored prune skipped.
//
// Exit codes: n/a (library, not an entrypoint).

const fs = require('fs')
const path = require('path')
const { getIgnoredPaths } = require('./ignored-paths')

const SKIP_DIR_NAMES = new Set(['.git', 'node_modules', 'fixtures', '__fixtures__'])

const { relPosix } = require('./util')

function walk(dir, root, out, ignored) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    const rel = relPosix(root, full)
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name) || rel === '.claude/worktrees' || ignored.has(rel + '/')) continue
      walk(full, root, out, ignored)
    } else if (ignored.has(rel)) {
      continue
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
  walk(root, root, out, getIgnoredPaths(root))
  return out
}

module.exports = { walkFiles, SKIP_DIR_NAMES }
