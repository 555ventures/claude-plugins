#!/usr/bin/env node
'use strict'
// scope-reconcile.js --base <ref> --spec <path> --json [--root <dir>] — reconciles
// the WHOLE changed-file set (committed diff UNION untracked) against a spec's File Plan.
// --json emits `changed` (every changed path, sorted) and additionally `atRisk`: test files outside
// the spec's File Plan tests rows whose content references a changed file's path stem.
//
// Owner: specs/20260805/01-review-scope-reconciliation.md.
//
// Every changed file is seen: the plan's misses (out-of-plan) and overshoots (unrealized) both surface
// mechanically, never by reviewer diligence.
//
// What it deliberately does NOT do: resolve `pipelineOwnedPaths` beyond the additive glob list
// in .claude/spec.config.json, or re-derive the changed set anywhere else — the review stage and
// the build stage's Final gate both call this, once each. It DOES read test-file CONTENT, but only
// for the at-risk derivation's substring scan below — the
// outOfPlan/unrealized/excluded/renamed derivation never looks past a path string. The at-risk
// walk does NOT descend into `fixtures`/`__fixtures__` directories.
// Fixture files are never at-risk candidates, even when test-classified.
//
// Changed set = `git diff --name-status -M <base>` (BOTH sides of R/C rows) UNION `??` paths
// from `git status --porcelain --untracked-files=all` (the `=all` flag is required — plain
// `--porcelain` reports a wholly-untracked directory as one `?? dir/` line, not its files).
// A rename whose old path was planned realizes that plan row — reported once in `renamed`,
// never as an out-of-plan + unrealized finding pair.
//
// File Plan glob rows (`*`, `?`, `[`) match concrete changed files via lib/glob-match.js's globMatch;
// realization counts only NON-EXCLUDED changed files. Concrete rows keep exact-match semantics.
//
// Exit codes: 0 = outOfPlan empty · 3 = outOfPlan non-empty · 2 = usage error, spec unreadable,
// spec has no File Plan table, or the git ref/repo is unusable.
//
// --probe-at-risk <file> [--test-globs <csv>] --root <dir>: a read-only mode for init-gen.js's probe —
// `<file>` lists repo-relative source paths; reuses stemsFor and walkTestFiles fed that sample and the
// default test globs (no host config yet). Prints `{sampled, testFiles, refs}`, always exits 0, and is
// checked before the --base/--spec requirement.
//
// `walkTestFiles` prunes every git-ignored path via lib/ignored-paths.js (shared with red-check.js).

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { parseFilePlan, parseFilePlanRows, isTestsRow } = require('./lib/file-plan')
const { globMatch, pipelineOwnedGlobs } = require('./lib/glob-match')
const { readConfig } = require('./lib/host-config')
const { fileShapes, isTestClassified: shapeIsTest } = require('./lib/file-shapes')
const { getIgnoredPaths } = require('./lib/ignored-paths')

function usage() {
  console.error('usage: scope-reconcile.js [--root <dir>] --base <ref> --spec <path> --json | --probe-at-risk <file> [--test-globs <csv>] --root <dir>')
}

let root = '.', base = null, specPath = null, mode = null, probeAtRiskFile = null, testGlobsArg = null
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--root') root = argv[++i]
  else if (a === '--base') base = argv[++i]
  else if (a === '--spec') specPath = argv[++i]
  else if (a === '--json') mode = 'json'
  else if (a === '--probe-at-risk') probeAtRiskFile = argv[++i]
  else if (a === '--test-globs') testGlobsArg = argv[++i]
  else { usage(); process.exit(2) }
}

if (probeAtRiskFile) {
  let listRaw
  try {
    listRaw = fs.readFileSync(probeAtRiskFile, 'utf8')
  } catch (e) {
    console.error(`scope-reconcile: cannot read --probe-at-risk file at ${probeAtRiskFile}: ${e.message}`)
    process.exit(2)
  }
  const sampledFiles = listRaw.split('\n').map(s => s.trim()).filter(Boolean)
  const probeShapes = fileShapes(readConfig(root))
  if (testGlobsArg) probeShapes.testGlobs = testGlobsArg.split(',').map(s => s.trim()).filter(Boolean)
  const probeIsTestClassified = (p) => shapeIsTest(p, probeShapes)

  // Reuses stemsFor (a hoisted function) exactly as the main derivation does, fed the sample list.
  const stemSources = sampledFiles
    .filter(p => !probeIsTestClassified(p))
    .map(p => ({ file: p, stems: stemsFor(p) }))

  // Reuses walkTestFiles with an explicit classifier — the probe path has no host config yet.
  const candidates = []
  walkTestFiles(root, candidates, probeIsTestClassified)

  let refs = 0
  for (const candidate of candidates) {
    let content
    try {
      content = fs.readFileSync(path.join(root, candidate), 'utf8')
    } catch {
      continue
    }
    if (stemSources.some(s => s.stems.some(stem => content.includes(stem)))) refs++
  }

  console.log(JSON.stringify({ sampled: sampledFiles.length, testFiles: candidates.length, refs }, null, 2))
  process.exit(0)
}

if (!base || !specPath || !mode) { usage(); process.exit(2) }

const specFull = path.join(root, specPath)
let specText
try {
  specText = fs.readFileSync(specFull, 'utf8')
} catch {
  console.error(`scope-reconcile: cannot read spec at ${specFull} — pass --spec <path relative to --root>`)
  process.exit(2)
}
const filePlanPaths = new Set(parseFilePlan(specText))
if (filePlanPaths.size === 0) {
  console.error(`scope-reconcile: no File Plan table found in ${specPath} — nothing to reconcile against`)
  process.exit(2)
}

// ---- pipeline-owned exclusions: built-in defaults + additive config globs -------------

const pipelineOwned = pipelineOwnedGlobs(root)

// ---- changed set: git diff --name-status (both sides of R/C) UNION untracked ----------

let diffOut, statusOut
try {
  diffOut = execFileSync('git', ['diff', '--name-status', '-M', base], { cwd: root, encoding: 'utf8' })
  statusOut = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' })
} catch (e) {
  console.error(`scope-reconcile: git failed against --base ${base} in ${root} — confirm the ref exists (git rev-parse ${base}): ${e.message}`)
  process.exit(2)
}

const changed = new Set()
const renamed = []
for (const line of diffOut.split('\n')) {
  if (!line.trim()) continue
  const parts = line.split('\t')
  const kind = parts[0][0]
  if (kind === 'R' || kind === 'C') {
    changed.add(parts[1]); changed.add(parts[2])
    if (kind === 'R') renamed.push({ from: parts[1], to: parts[2] })
  } else {
    changed.add(parts[1])
  }
}
for (const line of statusOut.split('\n')) {
  if (line.startsWith('?? ')) changed.add(line.slice(3).trim())
}

const renamedFrom = new Set(renamed.map(r => r.from))
const excluded = [...changed].filter(p => pipelineOwned.some(g => globMatch(g, p))).sort()
const excludedSet = new Set(excluded)
// A rename's new path is exempt from outOfPlan only when its old path realized a plan row (or was
// itself pipeline-owned) — an unplanned file's rename is an ordinary out-of-plan new path, not a
// free pass; it still appears in `renamed` either way (visibility).
const realizedRenamedTo = new Set(
  renamed.filter(r => filePlanPaths.has(r.from) || excludedSet.has(r.from)).map(r => r.to)
)

// ---- glob-row expansion: a File Plan row with *, ?, or [ is a pattern, not a literal ----

// A row ending in `/` names a directory and covers every file beneath it — matched as `<row>**`.
// Trailing slash only, never an on-disk isDirectory() probe: a deleted directory no longer exists.
const toPattern = (p) => (p.endsWith('/') ? p + '**' : p)
const isGlobRow = (p) => /[*?[]/.test(toPattern(p))
const globRows = [...filePlanPaths].filter(isGlobRow)
const concreteRows = new Set([...filePlanPaths].filter(p => !isGlobRow(p)))
const nonExcludedChanged = [...changed].filter(p => !excludedSet.has(p))

const outOfPlan = [...changed]
  .filter(p => !concreteRows.has(p) && !globRows.some(g => globMatch(toPattern(g), p)) &&
    !excludedSet.has(p) && !renamedFrom.has(p) && !realizedRenamedTo.has(p))
  .sort()
const unrealized = [
  ...[...concreteRows].filter(p => !changed.has(p)),
  ...globRows.filter(g => !nonExcludedChanged.some(p => globMatch(toPattern(g), p)))
].sort()

// ---- at-risk derivation ----------------------
// A changed shared script can redden suites outside the spec's File Plan tests rows. For each changed
// file that is not test-classified, pipeline-owned or a rename-from path, substring-scan the repo's
// test files for its path stems; an unplanned, unchanged hit is at-risk. Never affects the exit code.

const shapes = fileShapes(readConfig(root))
const isTestClassified = (p) => shapeIsTest(p, shapes)

function stemsFor(p) {
  // Form (a), the full repo-relative path, is always emitted. Forms (b) and (c) are never a bare
  // single-segment basename and never '' (`content.includes('')` is vacuously true).
  const noExt = p.replace(/\.[^./]+$/, '')
  const stems = [p]
  if (noExt && noExt.includes('/')) stems.push(noExt)
  const segs = noExt.split('/')
  if (segs.length >= 2) stems.push(segs.slice(-2).join('/'))
  return stems.filter((s, i, arr) => arr.indexOf(s) === i)
}

const stemSources = [...changed]
  .filter(p => !isTestClassified(p) && !excludedSet.has(p) && !renamedFrom.has(p))
  .map(p => ({ file: p, stems: stemsFor(p) }))

const filePlanTestsPaths = parseFilePlanRows(specText)
  .filter(r => isTestsRow(r))
  .flatMap(r => r.paths)
const isResolvedByTestsRows = (p) =>
  filePlanTestsPaths.some(row => (isGlobRow(row) ? globMatch(toPattern(row), p) : row === p))

// classifyFn defaults to the config-derived isTestClassified; the --probe-at-risk branch always passes
// its own classifier.
function walkTestFiles(dir, out, classifyFn = isTestClassified) {
  const ignored = getIgnoredPaths(root)
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    // Fixture dirs are never at-risk candidates.
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'fixtures' || entry.name === '__fixtures__') continue
    const full = path.join(dir, entry.name)
    const rel = path.relative(root, full).split(path.sep).join('/')
    if (entry.isDirectory()) {
      // A fully-ignored directory arrives from ls-files as its path plus a trailing slash —
      // pruning here means the subtree is never descended, an ignored second checkout included.
      if (ignored.has(`${rel}/`)) continue
      walkTestFiles(full, out, classifyFn)
    } else if (entry.isFile()) {
      if (ignored.has(rel)) continue
      if (classifyFn(rel)) out.push(rel)
    }
  }
}
const candidates = []
walkTestFiles(root, candidates)

const atRiskMap = new Map()
for (const candidate of candidates) {
  if (changed.has(candidate) || isResolvedByTestsRows(candidate)) continue
  let content
  try {
    content = fs.readFileSync(path.join(root, candidate), 'utf8')
  } catch {
    continue
  }
  const refs = stemSources.filter(s => s.stems.some(stem => content.includes(stem))).map(s => s.file)
  if (refs.length) atRiskMap.set(candidate, refs.sort())
}
const atRisk = [...atRiskMap.entries()]
  .map(([file, refs]) => ({ file, refs }))
  .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))

// `changed` is the full changed set (sorted) so consumers scope to what the diff touched without
// re-deriving it from git (header: no second derivation anywhere) — the patterns leg reads it.
console.log(JSON.stringify({ changed: [...changed].sort(), outOfPlan, unrealized, excluded, renamed, atRisk }, null, 2))
process.exit(outOfPlan.length ? 3 : 0)
