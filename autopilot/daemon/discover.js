#!/usr/bin/env node
'use strict'
// discover.js — kill the hand-typed --project flag as the only way a machine's repos become
// hub projects (the 2026-08-10 incident: an enroll without it produced "projects": [] and total
// silence). specs/20260810/03-repo-discovery.md.
//
// discoverRepos({reposRoot, fsImpl}): pure one-level scan (D1-D3) for spec-grounded repos —
//   a directory is a candidate iff `<dir>/.claude/spec.config.json` exists (D1); symlinks are
//   never followed (Dirent.isDirectory() is false for a symlink, A1b); dotfiles/node_modules and
//   git-worktree checkouts (`.git` present as a regular file, A1) are skipped. Throws
//   DiscoverError on an unusable reposRoot or a basename collision (D3) — registers nothing.
// resolveReposRoot({flagValue, hubJsonReposRoot, homedir, fsImpl}): --repos-root flag →
//   hub.json.reposRoot → ~/Projects if it exists → DiscoverError naming --repos-root (D5).
// registerRepos({hubUrl, token, authScheme, repos, fetchImpl}): sequential (never parallel, for
//   deterministic output and exact failure attribution), basename-order POST /api/spokes/projects
//   per repo (D4); throws RegisterError naming the failing repo and the underlying hub-http
//   message on the first non-2xx or malformed response — nothing registered after it POSTs.
//
// Deliberately does NOT: follow symlinks, recurse past one level, retry a non-2xx registration
// (hub-http's postJson retries network throws only), remap a repo's project name (D3 — the
// directory basename IS the project name; hooks/session-wrapup.js's repoBasename() depends on
// this), print or log anything (library; autopilot/bin/autopilot owns rendering).
//
// Exit codes: n/a — library module; see autopilot/bin/autopilot for the CLI exit-code wiring.

const fs = require('fs')
const os = require('os')
const path = require('path')

const { postJson } = require('./hub-http')

const PROJECTS_PATH = '/api/spokes/projects'

class DiscoverError extends Error {}
class RegisterError extends Error {}

// D1-D3: one level under reposRoot, dirent.isDirectory() only (symlinks excluded by
// construction, A1b) — skip dotfiles/node_modules, skip git-worktree checkouts (.git present as
// a regular file, A1). Basename collisions are a hard error (D3): both the hub project identity
// (idempotent-route key) and the Stop hook's wrap-up routing (repoBasename()) key on basename.
function discoverRepos({ reposRoot, fsImpl = fs }) {
  let entries
  try {
    entries = fsImpl.readdirSync(reposRoot, { withFileTypes: true })
  } catch (err) {
    throw new DiscoverError(
      `autopilot discover: reposRoot "${reposRoot}" is not usable — ${err.message} ` +
      `(pass a different --repos-root)`
    )
  }

  const byName = new Map()
  const collisions = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const name = entry.name
    if (name.startsWith('.') || name === 'node_modules') continue

    const root = path.join(reposRoot, name)
    const configPath = path.join(root, '.claude', 'spec.config.json')
    if (!fsImpl.existsSync(configPath)) continue

    let isWorktree = false
    try {
      isWorktree = fsImpl.statSync(path.join(root, '.git')).isFile()
    } catch {
      isWorktree = false
    }
    if (isWorktree) continue

    if (byName.has(name)) {
      collisions.push(root, byName.get(name))
    } else {
      byName.set(name, root)
    }
  }

  if (collisions.length) {
    throw new DiscoverError(
      `autopilot discover: basename collision — ${collisions.join(' and ')} would both ` +
      `register as project "${path.basename(collisions[0])}"; rename one directory (project ` +
      `identity is the basename)`
    )
  }

  return Array.from(byName, ([name, root]) => ({ name, root })).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  )
}

// D5: one persisted choice per machine. The flag wins, then the value already persisted in
// hub.json, then the fleet's layout convention (~/Projects) — only if it actually exists, so a
// box without that convention gets a clear remedy instead of a silent scan of the wrong tree.
function resolveReposRoot({ flagValue, hubJsonReposRoot, homedir = os.homedir(), fsImpl = fs }) {
  if (flagValue) return flagValue
  if (hubJsonReposRoot) return hubJsonReposRoot
  const defaultRoot = path.join(homedir, 'Projects')
  if (fsImpl.existsSync(defaultRoot)) return defaultRoot
  throw new DiscoverError(
    `autopilot discover: no reposRoot resolvable — pass --repos-root <dir> (no flag given, ` +
    `nothing persisted in hub.json, and the default ${defaultRoot} does not exist)`
  )
}

// D4: sequential, basename order (repos is assumed pre-sorted by the caller — discoverRepos
// already returns sorted). A non-2xx or malformed response is terminal: it names the failing
// repo (registerRepos is the only place that has both the repo name and the hub-http failure in
// scope at once) and nothing after it in the list is attempted.
async function registerRepos({ hubUrl, token, authScheme = 'Bearer', repos, fetchImpl = fetch }) {
  const results = []
  for (const repo of repos) {
    let response
    try {
      response = await postJson({
        url: hubUrl + PROJECTS_PATH,
        token,
        authScheme,
        body: { name: repo.name },
        fetchImpl,
      })
    } catch (err) {
      throw new RegisterError(
        `autopilot discover: registering "${repo.name}" failed — ${err.message} ` +
        `(hub.json was not rewritten — re-run autopilot discover to retry; the route is idempotent)`
      )
    }
    if (!response || !response.projectId) {
      throw new RegisterError(
        `autopilot discover: hub answered registering "${repo.name}" without a projectId ` +
        `(hub.json was not rewritten — re-run autopilot discover to retry)`
      )
    }
    results.push({
      projectId: response.projectId,
      name: response.name || repo.name,
      created: response.created === true,
      root: repo.root,
    })
  }
  return results
}

module.exports = { discoverRepos, resolveReposRoot, registerRepos, DiscoverError, RegisterError }
