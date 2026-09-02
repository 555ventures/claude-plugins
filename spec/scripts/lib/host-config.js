'use strict'
// lib/host-config.js — the sole reader of the host's `.claude/spec.config.json` for scripts that
// need one fact out of it. Extracted (review advisory on specs/20260813/10's own diff:
// ci-query.js and observe-ci.js each grew a byte-identical private readForge block in one diff,
// while lib/glob-match.js's pipelineOwnedGlobs already carried a third copy of the same
// read-parse-swallow shape — the identical class this repo already paid down once, on
// the occasion when scope-reconcile.js and hotspot.js were deduplicated into glob-match.js).
// Three private readers meant three places for the absent-config contract to drift apart.
//
// `readConfig(root)` is the file read; `declaredForge(root)` is the one derivation of the
// declared forge capability, so the two CI scripts read the same fact the same way rather than
// each restating the key path (specs/20260813/10-host-capabilities.md D1/D2).
//
// What `readConfig` deliberately does NOT do: validate the config's shape, apply defaults for
// any key, or surface read/parse errors. An absent, unreadable, or unparsable config reads as
// `{}` — every caller degrades to its own documented default (glob-match: baseline globs only;
// the CI scripts: legacy dynamic `gh` probing), which is the contract each of them already had.
//
// `readConfigStrict(root)` is the fail-loud sibling (specs/20260815/01-recurrence-carriers.md
// D5): the divergence across this repo's config readers was always the ERROR POLICY, never the
// read — strict-flavored consumers (ci-gate-parity.js, render-gate.js) structurally
// could not call `readConfig` and read the file privately instead, which is what recurred the
// config-read class a day after its second paydown. It throws on absent/unreadable/unparsable
// and otherwise returns the parsed value VERBATIM — object, array, scalar, or null, with no
// shape coercion and no non-object throw: every caller's existing guard
// (`typeof config.gateCommand === 'string'`, `config.design && …`) already owns shape handling,
// and the verbatim return is what keeps each script's behavior on odd-but-valid JSON identical
// to before the swap (a non-object throw would have silently rewritten ci-gate-parity's locked
// exit-0 "inapplicable — no gateCommand" degrade on a scalar config into an exit-2 crash).
//
// specs/20260820/08-config-name-ban.md D7: `tests/host-config/config-read.test.js`
// bans naming the literal filename `spec.config.json` (stem `spec.config`) in executable text
// anywhere under `spec/scripts/`, with exactly three named exemptions: this file (the sole Node
// reader), and `smoke.sh`/`spec-state-gate.sh` (read via `jq`; bash cannot `require()` this
// library). This file is therefore where the literal legitimately lives — every other script
// routes through the exports below instead of spelling the filename itself. `configPath(root)`
// (the renamed `configPathFor`) and `configExists(root)` (a presence-only probe) are the two
// sanctioned routes for the two legitimate reasons a script needs the filename: a
// presence check and a remedy string (`CONFIG_RELPATH`, for display only, never path-building).
//
// Exit codes: n/a (library, not an entrypoint).

const fs = require('fs')
const path = require('path')

const CONFIG_RELPATH = '.claude/spec.config.json'

function configPath(root) { return path.join(root, '.claude', 'spec.config.json') }

// Presence only — never opens, reads, or parses the file. A directory occupying the path
// returns true (existsSync semantics); callers that need readability call readConfigStrict.
function configExists(root) { return fs.existsSync(configPath(root)) }

// Absent / unreadable / unparsable / non-object config → {} (never a throw).
function readConfig(root) {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath(root), 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

// Absent / unreadable / unparsable config → throws. A successful parse returns verbatim, no
// shape coercion, no non-object throw — callers own shape handling.
function readConfigStrict(root) {
  const p = configPath(root)
  let raw
  try {
    raw = fs.readFileSync(p, 'utf8')
  } catch (e) {
    throw new Error('cannot read/parse ' + p + ' (' + e.message + ')')
  }
  try {
    return JSON.parse(raw)
  } catch (e) {
    throw new Error('cannot read/parse ' + p + ' (' + e.message + ')')
  }
}

// The declared forge capability, or undefined when the block/key is absent — undefined is the
// legacy-mode signal (probe `gh` at use time), never the same thing as a declared "none".
function declaredForge(root) {
  const capabilities = readConfig(root).capabilities
  return capabilities && capabilities.forge
}

module.exports = { readConfig, readConfigStrict, declaredForge, configPath, configExists, CONFIG_RELPATH }
