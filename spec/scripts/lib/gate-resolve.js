'use strict'
// lib/gate-resolve.js — the sole derivation of `{testDirs}`/`{scopeDirs}` substitution against a host's
// declared `gateCommand`, shared by review-legs.js and the review driver's close-time gate re-run.
// Owner: specs/20260830/02-close-gate-rerun.md.
//
// resolveGate(specText, config) -> { gate: string } | { gate: null, reason: string }
//   - {testFiles} -> the exact File Plan test files, each quote()d and space-joined, in File Plan order
//     (no directory or glob widening; fixtures dropped) — specs/20261103/12-one-suite-run-per-tree.md D4
//   - config.gateCommand without {testDirs}/{scopeDirs} returns { gate: config.gateCommand } as-is
//   - {testDirs} -> space-joined quoted globs derived from the spec's File Plan test rows (glob
//     form — `node --test <dir>` does not run files on Node 26)
//   - {scopeDirs} -> space-joined (quoted only when unsafe) unique directories of those same test files
//   - no File Plan test rows to resolve either placeholder -> { gate: null, reason: 'no File Plan
//     test rows to resolve {testDirs}' }
//
// resolveGateForFiles(gate, testFiles) -> string — the same substitution against an explicit list of
// repo-relative test files, for a caller with no spec to read: expire-tests.js's --apply passes the
// test files the sweep left behind in the directories it touched (an --all-done sweep has no File
// Plan, and running the raw command handed `{testDirs}` to the shell literally). The caller owns
// the empty-list case.
//
// Every path under a `fixtures/` directory is dropped from the File Plan's test rows before either
// placeholder is derived — a fixture is never a test entry point. Fixture-only test rows resolve to the
// `{ gate: null, reason }` form.
//
// What this deliberately does NOT do: read the host config itself (the caller passes it — this
// module has no opinion on config-read error policy, readConfig vs readConfigStrict), run the
// resolved command, or validate that config.gateCommand is a non-empty string (a caller with no
// gateCommand at all never reaches this function).
//
// gateRunsSuite(rawGate, resolvedGate, testCommand) -> boolean — true only when the raw gate has no
// {testDirs}/{scopeDirs}, testCommand is a non-empty string, and an `&&` segment of resolvedGate
// is exactly testCommand (the only operator under which a zero gate exit implies the test command
// ran and passed). Read by review-legs.js (suite-leg reuse) and the driver's close-time re-run so
// the two cannot drift.
//
// Exit codes: n/a (library, not an entrypoint).

const path = require('path')
const { quote } = require('./host-run')
const { parseFilePlan, parseFilePlanRows, isTestsRow } = require('./file-plan')

function resolveGate(specText, config) {
  let gate = config.gateCommand
  if (!/\{testDirs\}|\{scopeDirs\}|\{testFiles\}/.test(gate)) return { gate }
  const rows = parseFilePlanRows(specText)
  const layerTests = rows
    .filter(r => isTestsRow(r)).flatMap(r => r.paths)
  // A baseline-layer file (a screenshot a person approves) usually lives under the tests
  // directory; it is an input to a test, never a test file the gate can be pointed at.
  const baselines = new Set(rows
    .filter(r => r.layer && /^baselines?$/i.test(r.layer.trim())).flatMap(r => r.paths))
  const heuristic = parseFilePlan(specText)
    .filter(f => !baselines.has(f) && (/(^|\/)tests?\//.test(f) || /\.(test|spec)\.[a-z]+$/.test(f)))
  const testFiles = [...new Set([...layerTests, ...heuristic])].filter(f => !/(^|\/)fixtures\//.test(f))
  if (!testFiles.length) return { gate: null, reason: 'no File Plan test rows to resolve {testDirs}' }
  return { gate: resolveGateForFiles(gate, testFiles) }
}

function gateRunsSuite(rawGate, resolvedGate, testCommand) {
  if (typeof rawGate !== 'string' || /\{testDirs\}|\{scopeDirs\}|\{testFiles\}/.test(rawGate)) return false
  if (typeof resolvedGate !== 'string') return false
  if (typeof testCommand !== 'string' || !testCommand.trim()) return false
  return resolvedGate.split('&&').some(seg => seg.trim() === testCommand.trim())
}

function resolveGateForFiles(gate, testFiles) {
  if (!/\{testDirs\}|\{scopeDirs\}|\{testFiles\}/.test(gate)) return gate
  const globs = new Set()
  for (const f of testFiles) {
    const dir = path.dirname(f)
    const m = path.basename(f).match(/(\.[a-z]+)+$/i)
    const suffix = /\.(test|spec)\./.test(f) ? '*.' + f.split('.').slice(-2).join('.') : (m ? '*' + m[0] : '*')
    globs.add(quote(`${dir === '.' ? '' : dir + '/'}${suffix}`))
  }
  const dirsStr = [...globs].join(' ')
  const filesStr = [...new Set(testFiles.filter(f => !/(^|\/)fixtures\//.test(f)))].map(quote).join(' ')
  return gate.replace(/\{testFiles\}/g, filesStr).replace(/\{testDirs\}/g, dirsStr).replace(/\{scopeDirs\}/g, [...new Set(testFiles.map(f => path.dirname(f)))].map(quote).join(' '))
}

module.exports = { resolveGate, resolveGateForFiles, gateRunsSuite }
