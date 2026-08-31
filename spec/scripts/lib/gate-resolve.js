'use strict'
// lib/gate-resolve.js — the sole derivation of `{testDirs}`/`{scopeDirs}` substitution against a
// host's declared `gateCommand`. Extracted verbatim from review-legs.js's own local resolveGate()
// (specs/20260830/02-close-gate-rerun.md D3, 2026-08-30 salon-os field report): the driver's new
// close-time gate re-run (spec-review-driver.js's handleClosed()) needs to resolve the exact same
// command review-legs.js already resolves for the review-time gate leg — a second, paraphrased
// copy in the driver would be a drift seam (the stated reason ci-query.js was unified 2026-08-05).
// Semantics are byte-identical to the function this replaces: only the config source moved, from
// review-legs.js's module-scope `config` to an explicit second parameter.
//
// resolveGate(specText, config) -> { gate: string } | { gate: null, reason: string }
//   - config.gateCommand without {testDirs}/{scopeDirs} returns { gate: config.gateCommand } as-is
//   - {testDirs} -> space-joined quoted globs derived from the spec's File Plan test rows (glob
//     form — `node --test <dir>` does not run files on Node 26, JJ-20260815-04)
//   - {scopeDirs} -> space-joined (unquoted) unique directories of those same test files
//   - no File Plan test rows to resolve either placeholder -> { gate: null, reason: 'no File Plan
//     test rows to resolve {testDirs}' }
//
// What this deliberately does NOT do: read the host config itself (the caller passes it — this
// module has no opinion on config-read error policy, readConfig vs readConfigStrict), run the
// resolved command, or validate that config.gateCommand is a non-empty string (a caller with no
// gateCommand at all never reaches this function).
//
// Exit codes: n/a (library, not an entrypoint).

const path = require('path')
const { parseFilePlan, parseFilePlanRows } = require('./file-plan')

function resolveGate(specText, config) {
  let gate = config.gateCommand
  if (!/\{testDirs\}|\{scopeDirs\}/.test(gate)) return { gate }
  const layerTests = parseFilePlanRows(specText)
    .filter(r => r.layer && /^tests?$/i.test(r.layer.trim())).flatMap(r => r.paths)
  const heuristic = parseFilePlan(specText)
    .filter(f => /(^|\/)tests?\//.test(f) || /\.(test|spec)\.[a-z]+$/.test(f))
  const testFiles = [...new Set([...layerTests, ...heuristic])]
  if (!testFiles.length) return { gate: null, reason: 'no File Plan test rows to resolve {testDirs}' }
  const globs = new Set()
  for (const f of testFiles) {
    const dir = path.dirname(f)
    const m = path.basename(f).match(/(\.[a-z]+)+$/i)
    const suffix = /\.(test|spec)\./.test(f) ? '*.' + f.split('.').slice(-2).join('.') : (m ? '*' + m[0] : '*')
    globs.add(`'${dir === '.' ? '' : dir + '/'}${suffix}'`)
  }
  const dirsStr = [...globs].join(' ')
  return { gate: gate.replace(/\{testDirs\}/g, dirsStr).replace(/\{scopeDirs\}/g, [...new Set(testFiles.map(f => path.dirname(f)))].join(' ')) }
}

module.exports = { resolveGate }
