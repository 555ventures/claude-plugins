#!/usr/bin/env node
// Deterministic CI-gate parity check for doctor.md check 19.
//
// WHY THIS EXISTS: local-green/CI-red drift (Prax, 2026-08-10) — a host's CI workflow silently
// stopped invoking the configured `gateCommand`, so a red gate only surfaced on the CI dashboard,
// never locally. doctor.md check 19 used to hand-execute a split/trim/floor/substring algorithm
// in prose; that algorithm now lives here once (spec 20260814/02 D1) and check 19 only invokes it.
//
// ALGORITHM (locked): read `.claude/spec.config.json`'s `gateCommand`, split it on /\{[^}]*\}/g
// (placeholder tokens like {testDirs}), trim each piece, and keep pieces of >=10 chars — those are
// the literal, host-specific segments a CI workflow must actually run. If nothing survives (a short
// command with no long literal segment, e.g. "npm test"), fall back to the single segment formed by
// stripping every placeholder from the whole command and trimming it. Each kept segment must appear
// as a substring somewhere in the concatenation of every `.github/workflows/*.yml` and `*.yaml` file.
//
// WHAT THIS DELIBERATELY DOES NOT DO: it never parses YAML (a substring check is enough to catch the
// drift class and needs no YAML dependency); it never inspects which JOB or STEP runs the command,
// only that the literal text appears somewhere in the workflow directory.
//
// CONTRACT: `node ci-gate-parity.js --root <dir>`
// Exit codes:
//   0  parity — every kept segment found in the workflows, OR one of the two advisory sentinels:
//        "inapplicable — no .github/workflows" (no workflow dir to check against)
//        "inapplicable — no gateCommand" (host config declares no gateCommand)
//      Absence of CI or of a gateCommand is not a finding — this check is advisory.
//   1  parity failure — one or more kept segments missing, one linter-style line each
//   2  usage error, or `.claude/spec.config.json` missing/unreadable/invalid JSON

'use strict'
const fs = require('fs')
const path = require('path')

function die(msg) { process.stderr.write('ci-gate-parity: ' + msg + '\n'); process.exit(2) }

const argv = process.argv.slice(2)
const rootIdx = argv.indexOf('--root')
if (rootIdx === -1 || !argv[rootIdx + 1]) die('usage: ci-gate-parity.js --root <dir>')
const root = argv[rootIdx + 1]

const configPath = path.join(root, '.claude', 'spec.config.json')
let config
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
} catch (e) {
  die('cannot read/parse ' + configPath + ' (' + e.message + ') — fix the config or check --root')
}

const gateCommand = typeof config.gateCommand === 'string' ? config.gateCommand : ''
if (!gateCommand.trim()) {
  process.stdout.write('inapplicable — no gateCommand\n')
  process.exit(0)
}

const workflowsDir = path.join(root, '.github', 'workflows')
let workflowFiles = []
try {
  workflowFiles = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
} catch {
  workflowFiles = []
}
if (!workflowFiles.length) {
  process.stdout.write('inapplicable — no .github/workflows\n')
  process.exit(0)
}

const haystack = workflowFiles
  .map(f => { try { return fs.readFileSync(path.join(workflowsDir, f), 'utf8') } catch { return '' } })
  .join('\n')

let kept = gateCommand.split(/\{[^}]*\}/g).map(s => s.trim()).filter(s => s.length >= 10)
if (!kept.length) {
  const stripped = gateCommand.replace(/\{[^}]*\}/g, '').trim()
  kept = [stripped]
}

const missing = kept.filter(seg => !haystack.includes(seg))
if (missing.length) {
  for (const seg of missing) {
    process.stderr.write('ci-gate-parity: segment not found in any .github/workflows/*.yml|*.yaml: "' +
      seg + '" — remedy: make one CI step run the gateCommand verbatim\n')
  }
  process.exit(1)
}

process.stdout.write('ci-gate-parity: parity — ' + kept.length + ' segment(s) found in ' +
  workflowFiles.join(', ') + '\n')
process.exit(0)
