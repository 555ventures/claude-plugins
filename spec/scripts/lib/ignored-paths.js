'use strict'
// lib/ignored-paths.js — getIgnoredPaths(root) → Set<string>, the ONE derivation of a root's
// git-ignored path set (specs/20260915/01-one-derivation-of-ignored-paths.md D1, carrying over
// the D1/D2 contract of specs/20260907/03-ignored-paths-and-unobserved-count.md unchanged in
// substance). scope-reconcile.js's at-risk walk, red-check.js's wildcard tests-row expansion and
// collision-closure.js's literals leg are its three consumers — a second private copy of this
// derivation is the exact class
// lib/glob-match.js and lib/host-config.js were each extracted to stop.
//
// The set is derived only when `git -C <root> rev-parse --show-prefix` exits 0 printing an empty
// line — root IS the top level of a repository or of a git worktree. It is then the NUL-split
// entries of `git -C <root> ls-files -o -i --exclude-standard --directory -z`: a fully-ignored
// directory arrives with a trailing slash, an individually-ignored file arrives as a plain path.
// Any other outcome (non-empty prefix, missing git, not a repository, a failing `ls-files`)
// yields an empty set — refusing to filter is always safe; silently pruning against a mismatched
// prefix (a `--root` below the top level) is not, since `ls-files` prints paths relative to the
// true repository root.
//
// What this deliberately does NOT do: walk the tree itself (callers own their own walk and
// membership checks against the returned Set), validate that `root` is a directory, or retry a
// failing git call. Results cache per `root` string in a module-level `Map`, so one process
// asking about the same root twice spawns git once; a caller with more than one root gets one
// cache entry each.
//
// Exit codes: n/a (library, not an entrypoint).

const { execFileSync } = require('child_process')

const cache = new Map()

function getIgnoredPaths(root) {
  if (cache.has(root)) return cache.get(root)
  const ignored = new Set()
  // stdio is explicit (never the execFileSync default) — the default forwards a failing child's
  // stderr straight to this process's own stderr in ADDITION to capturing it on the thrown
  // error, so a plain non-repository root would otherwise print git's "fatal: not a git
  // repository" onto the caller's stderr even though the failure is fully handled below.
  const gitOpts = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  try {
    const prefix = execFileSync('git', ['-C', root, 'rev-parse', '--show-prefix'], gitOpts)
    // root must BE the repository top level — ls-files prints paths relative to the repo root,
    // so a subdirectory root would compare mismatched prefixes and could prune the wrong
    // subtree. A non-empty prefix leaves the set empty (safe: unfiltered, never wrong).
    if (prefix.trim() !== '') {
      cache.set(root, ignored)
      return ignored
    }
    const listing = execFileSync(
      'git', ['-C', root, 'ls-files', '-o', '-i', '--exclude-standard', '--directory', '-z'], gitOpts)
    for (const entry of listing.split('\0')) {
      if (entry) ignored.add(entry)
    }
  } catch {
    // Not a repository, git unavailable, or the ls-files call itself failed — the safe
    // fallback: leave the set empty so the caller's walk is byte-identical to an unfiltered walk.
  }
  cache.set(root, ignored)
  return ignored
}

module.exports = { getIgnoredPaths }
