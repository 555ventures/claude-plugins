#!/usr/bin/env node
'use strict'
// config.js — loadConfig({configPath}): load and validate the autopilot daemon's per-host
// config (specs/20260801/03-lane-engine.md D3, D8). Config lives at
// ~/.config/autopilot/config.json by default; host-level required fields are botToken,
// supergroupId, allowedUserIds, specPluginRoot, pluginPaths; each entry in `lanes[]` requires
// project, root, topicId (devServerCommand/tunnelCommand/pollSeconds/screenshotCommand are
// optional). A missing required field, or two lanes sharing a topicId or root, throws an Error
// naming the field/projects and the config path verbatim (AC-20260801-03-8) — those invariants
// are load-bearing: one pending ask per topic (spec 01 A2) and one lane per repo (D1). This
// module never calls process.exit or parses `--config` itself; bin/autopilotd owns argv
// parsing and the exit-2 + stderr rendering, which keeps this surface pure and unit-testable
// in-process (§ Test Rules mode 4).
//
// Deliberately does NOT: apply any default beyond pollSeconds (300s, per the Behavior
// section's lane-loop default); read secrets from the environment (botToken lives in the
// config file only, per D3); catch or wrap JSON.parse/fs errors into anything other than a
// plain Error naming the config path and the remedy.
//
// Exit codes: n/a — library module; see autopilot/bin/autopilotd for the CLI exit-2 wiring.

const fs = require('fs')
const os = require('os')
const path = require('path')

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.config', 'autopilot', 'config.json')
const DEFAULT_POLL_SECONDS = 300

const HOST_REQUIRED_FIELDS = ['botToken', 'supergroupId', 'allowedUserIds', 'specPluginRoot', 'pluginPaths']
const LANE_REQUIRED_FIELDS = ['project', 'root', 'topicId']

function readConfigFile(configPath) {
  let raw
  try {
    raw = fs.readFileSync(configPath, 'utf8')
  } catch {
    throw new Error(`config not found at ${configPath} — create it (see autopilot/config.example.json)`)
  }
  try {
    return JSON.parse(raw)
  } catch (err) {
    throw new Error(`config at ${configPath} is not valid JSON — ${err.message}`)
  }
}

function assertHostFields(cfg, configPath) {
  for (const field of HOST_REQUIRED_FIELDS) {
    if (cfg[field] === undefined) {
      throw new Error(`config missing "${field}" — edit ${configPath}`)
    }
  }
  if (!Array.isArray(cfg.lanes) || cfg.lanes.length === 0) {
    throw new Error(`config missing "lanes" — edit ${configPath}`)
  }
}

function assertLaneFields(lane, index, configPath) {
  for (const field of LANE_REQUIRED_FIELDS) {
    if (lane[field] === undefined) {
      throw new Error(`config lane ${index} missing "${field}" — edit ${configPath}`)
    }
  }
}

// Cross-lane invariants (AC-20260801-03-8): a shared topicId breaks "one pending ask per
// topic" (spec 01 A2); a shared root breaks "one lane per repo" (D1). Both name every
// offending project so the fix is unambiguous.
function assertNoDuplicateField(lanes, field, configPath) {
  const seen = new Map()
  for (const lane of lanes) {
    const key = lane[field]
    if (!seen.has(key)) {
      seen.set(key, lane.project)
      continue
    }
    const first = seen.get(key)
    throw new Error(
      `config lanes "${first}" and "${lane.project}" share ${field} "${key}" — edit ${configPath}`
    )
  }
}

// loadConfig({configPath}): resolves the config path (default ~/.config/autopilot/config.json),
// reads+parses it, validates host and per-lane required fields plus cross-lane topicId/root
// uniqueness, and fills in the one documented default (pollSeconds). Returns the validated
// config with lane defaults applied.
function loadConfig({ configPath = DEFAULT_CONFIG_PATH } = {}) {
  const cfg = readConfigFile(configPath)
  assertHostFields(cfg, configPath)
  cfg.lanes.forEach((lane, index) => assertLaneFields(lane, index, configPath))
  assertNoDuplicateField(cfg.lanes, 'topicId', configPath)
  assertNoDuplicateField(cfg.lanes, 'root', configPath)
  const lanes = cfg.lanes.map((lane) => ({ pollSeconds: DEFAULT_POLL_SECONDS, ...lane }))
  return { ...cfg, lanes, configPath }
}

module.exports = { loadConfig, DEFAULT_CONFIG_PATH, DEFAULT_POLL_SECONDS }
