#!/usr/bin/env node
'use strict'
// config.js — loadHubConfig({hubConfigPath, overridesPath}): boot the autopilot daemon's
// lane set from hub.json + repo discovery (specs/20260810/04-hub-wired-daemon.md D7),
// replacing the old hand-written botToken/supergroupId/topicId config (specs/20260801/03
// -lane-engine.md D3/D8, deleted here per D1 — direct-Telegram mode is retired). hub.json
// (written by `autopilot enroll`/`autopilot discover`, specs/20260810/03-repo-discovery.md)
// supplies the hub credential + persisted reposRoot; discoverRepos() re-scans that root on
// every call so a fleet box self-heals its lane set on restart with zero hand-editing.
// `overridesPath` (the old config.json path) demotes to OPTIONAL per-project overrides
// ({devServerCommand, tunnelCommand, pollSeconds} keyed by project name) plus optional
// host-level overrides (specPluginRoot, pluginPaths, reposRoot) — an overrides file is not
// required at all. Host-level defaults are derived from the plugin checkout itself
// (`<checkout>/spec`, `[<checkout>/spec, <checkout>/git]` where `<checkout> =
// path.resolve(__dirname, '../..')`) since every box previously hand-typed exactly these
// values. This module never calls process.exit or parses argv itself — bin/autopilotd owns
// `--hub-config`/exit-2 rendering, which keeps this surface pure and unit-testable in-process
// (§ Test Rules mode 4). Performs zero network I/O — discovery is fs-only — so `--check`'s
// offline guarantee holds through this call (AC-20260810-04-12).
//
// Deliberately does NOT: apply any lane default beyond pollSeconds (300s); read secrets from
// the environment (the hub credential lives in hub.json only); register anything with the
// hub (that's `autopilot discover`'s job, not boot's); resolve a reposRoot other than the one
// already persisted in hub.json (no `--repos-root` flag here — that lives on the discover
// subcommand); catch DiscoverError — it propagates verbatim so the caller's exit-2 message
// matches the discovery failure exactly.
//
// Exit codes: n/a — library module; see autopilot/bin/autopilotd for the CLI exit-2 wiring.

const fs = require('fs')
const os = require('os')
const path = require('path')

const { discoverRepos } = require('./discover')
const { readCredential } = require('./hub-http')

const DEFAULT_HUB_CONFIG_PATH = path.join(os.homedir(), '.config', 'autopilot', 'hub.json')
const DEFAULT_OVERRIDES_PATH = path.join(os.homedir(), '.config', 'autopilot', 'config.json')
const DEFAULT_POLL_SECONDS = 300

// Host-level override keys live at the top of the overrides object, alongside per-project
// keys (keyed by discovered project name) — the two namespaces are disjoint because no repo
// basename may collide with these names (D3's basename-collision guard already refuses that).
const HOST_OVERRIDE_FIELDS = ['specPluginRoot', 'pluginPaths', 'reposRoot']

function checkoutRoot() {
  return path.resolve(__dirname, '..', '..')
}

// Missing file → {} (an overrides file is optional, D7). Present-but-unparsable → a plain
// Error naming the path and the remedy — the same discipline the deleted config.js applied
// to config.json before this rewrite.
function readOverrides(overridesPath) {
  let raw
  try {
    raw = fs.readFileSync(overridesPath, 'utf8')
  } catch {
    return {}
  }
  try {
    return JSON.parse(raw)
  } catch (err) {
    throw new Error(`autopilotd: overrides file ${overridesPath} is not valid JSON — ${err.message}`)
  }
}

// loadHubConfig: read hub.json (throws naming "autopilot enroll" if absent/invalid) → read its
// persisted reposRoot → discoverRepos() that root (DiscoverError propagates verbatim, e.g. a
// stale reposRoot after a directory move) → merge per-project overrides onto each discovered
// lane, applying host-level overrides (specPluginRoot/pluginPaths/reposRoot) on top of the
// checkout-derived defaults. An overrides key naming no discovered project is a typo guard
// (AC-20260810-04-9): it throws naming the key and the reposRoot that was scanned.
function loadHubConfig({ hubConfigPath = DEFAULT_HUB_CONFIG_PATH, overridesPath = DEFAULT_OVERRIDES_PATH } = {}) {
  const hubJson = readCredential(hubConfigPath)
  if (!hubJson) {
    throw new Error(`autopilotd: no hub.json at ${hubConfigPath} — run "autopilot enroll" first`)
  }

  const reposRoot = hubJson.reposRoot
  if (!reposRoot) {
    throw new Error(
      `autopilotd: hub.json at ${hubConfigPath} has no reposRoot — run "autopilot discover" ` +
      `(or re-enroll with --repos-root)`
    )
  }

  // Overrides must be parsed BEFORE discovery: a host-level reposRoot override has to steer
  // which directory actually gets scanned, not just relabel the return value after the fact
  // (that was the bug — discovery ran against hub.json's root while the override sat unused).
  // Per-project keys can't be typo-checked yet (that needs the post-override discovery below).
  const overrides = readOverrides(overridesPath)
  const hostOverrides = {}
  const laneOverrideCandidates = {}
  for (const key of Object.keys(overrides)) {
    if (HOST_OVERRIDE_FIELDS.includes(key)) {
      hostOverrides[key] = overrides[key]
      continue
    }
    laneOverrideCandidates[key] = overrides[key]
  }

  const root = checkoutRoot()
  const specPluginRoot = hostOverrides.specPluginRoot || path.join(root, 'spec')
  const pluginPaths = hostOverrides.pluginPaths || [path.join(root, 'spec'), path.join(root, 'git')]
  const resolvedReposRoot = hostOverrides.reposRoot || reposRoot

  const discovered = discoverRepos({ reposRoot: resolvedReposRoot })
  const projectNames = new Set(discovered.map((repo) => repo.name))

  const laneOverrides = {}
  for (const key of Object.keys(laneOverrideCandidates)) {
    if (!projectNames.has(key)) {
      throw new Error(
        `autopilotd: overrides file ${overridesPath} names unknown project "${key}" — ` +
        `no discovered repo under ${resolvedReposRoot} matches (typo? re-run autopilot discover)`
      )
    }
    laneOverrides[key] = laneOverrideCandidates[key]
  }

  const lanes = discovered.map((repo) => ({
    pollSeconds: DEFAULT_POLL_SECONDS,
    ...(laneOverrides[repo.name] || {}),
    project: repo.name,
    root: repo.root,
  }))

  return { credential: hubJson, reposRoot: resolvedReposRoot, specPluginRoot, pluginPaths, lanes }
}

module.exports = { loadHubConfig, DEFAULT_HUB_CONFIG_PATH, DEFAULT_OVERRIDES_PATH, DEFAULT_POLL_SECONDS }
