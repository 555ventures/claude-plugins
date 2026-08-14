'use strict'
// lib/host-config.js — the sole reader of the host's `.claude/spec.config.json` for scripts that
// need one fact out of it. Extracted 2026-08-14 (review advisory on specs/20260813/10's own diff:
// ci-query.js and observe-ci.js each grew a byte-identical private readForge block in one diff,
// while lib/glob-match.js's pipelineOwnedGlobs already carried a third copy of the same
// read-parse-swallow shape — the identical class this repo already paid down once, on
// 2026-08-12, when scope-reconcile.js and hotspot.js were deduplicated into glob-match.js).
// Three private readers meant three places for the absent-config contract to drift apart.
//
// `readConfig(root)` is the file read; `declaredForge(root)` is the one derivation of the
// declared forge capability, so the two CI scripts read the same fact the same way rather than
// each restating the key path (specs/20260813/10-host-capabilities.md D1/D2).
//
// What it deliberately does NOT do: validate the config's shape, apply defaults for any key, or
// surface read/parse errors. An absent, unreadable, or unparsable config reads as `{}` — every
// caller degrades to its own documented default (glob-match: baseline globs only; the CI
// scripts: legacy dynamic `gh` probing), which is the contract each of them already had.
//
// Exit codes: n/a (library, not an entrypoint).

const fs = require('fs')
const path = require('path')

// Absent / unreadable / unparsable / non-object config → {} (never a throw).
function readConfig(root) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'spec.config.json'), 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

// The declared forge capability, or undefined when the block/key is absent — undefined is the
// legacy-mode signal (probe `gh` at use time), never the same thing as a declared "none".
function declaredForge(root) {
  const capabilities = readConfig(root).capabilities
  return capabilities && capabilities.forge
}

module.exports = { readConfig, declaredForge }
