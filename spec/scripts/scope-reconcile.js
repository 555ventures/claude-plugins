#!/usr/bin/env node
'use strict'
// scope-reconcile.js --base <ref> --spec <path> (--json | --dirs) [--root <dir>] — reconciles
// the WHOLE changed-file set (committed diff UNION untracked) against a spec's File Plan.
// --json additionally emits `atRisk` (specs/20260815/02-at-risk-pins.md D1): test files outside
// the spec's File Plan tests rows whose content references a changed file's path stem.
//
// specs/20260805/01-review-scope-reconciliation.md: /spec:review diffed only the File Plan's directories, so an
// out-of-plan `waitForExit` edit was structurally invisible to review and rode a CLEAN verdict
// into production. This script inverts the File Plan's role from scope-definer to
// prediction-under-test: every changed file is seen; the plan's misses (out-of-plan) and
// overshoots (unrealized) both surface, mechanically, never by reviewer diligence.
//
// What it deliberately does NOT do: resolve `pipelineOwnedPaths` beyond the additive glob list
// in .claude/spec.config.json, or re-derive the changed set anywhere else — /spec:review and
// /spec:build's Final gate both call this, once each. It DOES read test-file CONTENT, but only
// for the at-risk derivation's substring scan below (specs/20260815/02-at-risk-pins.md D1) — the
// outOfPlan/unrealized/excluded/renamed derivation never looks past a path string. The at-risk
// walk does NOT descend into `fixtures`/`__fixtures__` directories (specs/20260903/07-test-file-
// budget-guard.md D8) — fixture files are never at-risk candidates, even when test-classified.
//
// Changed set = `git diff --name-status -M <base>` (BOTH sides of R/C rows) UNION `??` paths
// from `git status --porcelain --untracked-files=all` (the `=all` flag is required — plain
// `--porcelain` reports a wholly-untracked directory as one `?? dir/` line, not its files).
// A rename whose old path was planned realizes that plan row — reported once in `renamed`,
// never as an out-of-plan + unrealized finding pair.
//
// File Plan glob rows (D2, specs/20260813/03-gate-script-mechanics.md): a row containing `*`,
// `?`, or `[` is a pattern, matched via lib/glob-match.js's `globMatch` against concrete changed
// files — never an exact-string comparison. A changed file matching a glob row is in-plan
// (never outOfPlan); a glob row matched by >=1 changed file is realized (never unrealized).
// Realization counts only NON-EXCLUDED changed files (changed minus excludedSet) so a
// pipeline-owned file overlapping a codegen glob row can't fake that row's realization. Concrete
// rows keep exact-match semantics untouched.
//
// Exit codes: 0 = outOfPlan empty · 3 = outOfPlan non-empty · 2 = usage error, spec unreadable,
// spec has no File Plan table, or the git ref/repo is unusable.
//
// --probe-at-risk <file> [--test-globs <csv>] --root <dir> (D9, specs/20260822/02-init-generation-
// script.md): an ADDITIVE, read-only mode for init-gen.js's at-risk-applicability probe — `<file>`
// is a newline-separated list of repo-relative source paths (init-gen samples up to 20 tracked
// non-test files). It reuses THIS file's existing `stemsFor` derivation and `walkTestFiles` test-file
// scan in place (never a second implementation — the sole-derivation rule), fed the caller-supplied
// sample list instead of a git-diff changed set, and `--test-globs`/the same default array instead of
// the host config (which does not exist yet at init probe time). Prints `{sampled, testFiles, refs}`
// and always exits 0 (D13: probe findings are data). This mode is checked BEFORE the --base/--spec/
// mode requirement below so it never needs a spec or a git ref; it never touches outOfPlan/unrealized/
// excluded/renamed, and D10 pins the existing --json/--dirs modes byte-identical around it.

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { parseFilePlan, parseFilePlanRows } = require('./lib/file-plan')
const { globMatch, pipelineOwnedGlobs } = require('./lib/glob-match')
const { readConfig } = require('./lib/host-config')

// Shared by both the --probe-at-risk mode and the main at-risk derivation further down — moved
// here (from its former inline position) so the probe branch above can use it before requiring a
// spec/base ref.
const defaultTestGlobs = ['tests/**', 'test/**', '**/*.test.*', '**/*.spec.*', '**/*_test.*']

function usage() {
  console.error('usage: scope-reconcile.js [--root <dir>] --base <ref> --spec <path> (--json | --dirs) | --probe-at-risk <file> [--test-globs <csv>] --root <dir>')
}

let root = '.', base = null, specPath = null, mode = null, probeAtRiskFile = null, testGlobsArg = null
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--root') root = argv[++i]
  else if (a === '--base') base = argv[++i]
  else if (a === '--spec') specPath = argv[++i]
  else if (a === '--json') mode = 'json'
  else if (a === '--dirs') mode = 'dirs'
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
  const probeTestGlobs = testGlobsArg ? testGlobsArg.split(',').map(s => s.trim()).filter(Boolean) : defaultTestGlobs
  const probeIsTestClassified = (p) => probeTestGlobs.some(g => globMatch(g, p))

  // Reuses stemsFor (declared below, a hoisted function — pure over its argument, no TDZ risk
  // at this call site) exactly as the main derivation does, fed the sample list instead of a
  // changed-git-diff set.
  const stemSources = sampledFiles
    .filter(p => !probeIsTestClassified(p))
    .map(p => ({ file: p, stems: stemsFor(p) }))

  // Reuses walkTestFiles (declared below) via its injectable classifier param — the probe path
  // has no host config yet, so it can never use the config-derived isTestClassified the main
  // path uses further down.
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

// ---- pipeline-owned exclusions (D4): built-in defaults + additive config globs -------------

const pipelineOwned = pipelineOwnedGlobs(root)

// ---- changed set: git diff --name-status (both sides of R/C) UNION untracked (D3) ----------

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

// ---- glob-row expansion (D2): a File Plan row with *, ?, or [ is a pattern, not a literal ----

const isGlobRow = (p) => /[*?[]/.test(p)
const globRows = [...filePlanPaths].filter(isGlobRow)
const concreteRows = new Set([...filePlanPaths].filter(p => !isGlobRow(p)))
const nonExcludedChanged = [...changed].filter(p => !excludedSet.has(p))

const outOfPlan = [...changed]
  .filter(p => !concreteRows.has(p) && !globRows.some(g => globMatch(g, p)) &&
    !excludedSet.has(p) && !renamedFrom.has(p) && !realizedRenamedTo.has(p))
  .sort()
const unrealized = [
  ...[...concreteRows].filter(p => !changed.has(p)),
  ...globRows.filter(g => !nonExcludedChanged.some(p => globMatch(g, p)))
].sort()

// ---- at-risk derivation (D1/D2/D5, specs/20260815/02-at-risk-pins.md) ----------------------
// A Decision that changes what a shared script returns reddens suites the scoped gate never
// runs, because those suites live outside the spec's own File Plan tests rows (escape
// wf_e1da0ea6-94c). For each changed file that is neither test-classified
// (testGlobs), pipeline-owned, nor a rename-from path, derive path stems and substring-scan the
// repo's test-classified files for them; a hit that is not resolved by the File Plan's
// tests-layer rows and is not itself in the changed set is at-risk. Additive to outOfPlan/
// unrealized/excluded/renamed above — never affects the exit code (D2).

const configTestGlobs = readConfig(root).testGlobs
const testGlobs = Array.isArray(configTestGlobs) ? configTestGlobs : defaultTestGlobs
const isTestClassified = (p) => testGlobs.some(g => globMatch(g, p))

function stemsFor(p) {
  // Form (a) — the full repo-relative path — is always emitted, even when it is a bare
  // single-segment basename, so a root-level file stays matchable at all (D1). Forms (b) and
  // (c) must be able to discriminate: never a bare single-segment basename (no `/`), and never
  // the empty string (a root dotfile like `.gitignore` strips to '' under the last-extension
  // regex, and `content.includes('')` is vacuously true for every candidate — the reproduced
  // defect this guard closes).
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
  .filter(r => r.layer && /^tests?$/i.test(r.layer))
  .flatMap(r => r.paths)
const isResolvedByTestsRows = (p) =>
  filePlanTestsPaths.some(row => (isGlobRow(row) ? globMatch(row, p) : row === p))

// classifyFn defaults to the config-derived isTestClassified above (evaluated only when the
// argument is omitted, so the --probe-at-risk branch above — which calls this before that const
// exists — always passes its own classifier explicitly and never touches the default).
function walkTestFiles(dir, out, classifyFn = isTestClassified) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    // specs/20260903/07-test-file-budget-guard.md D8: fixture dirs are never at-risk candidates.
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'fixtures' || entry.name === '__fixtures__') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkTestFiles(full, out, classifyFn)
    } else if (entry.isFile()) {
      const rel = path.relative(root, full).split(path.sep).join('/')
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

if (mode === 'dirs') {
  const dirs = [...new Set([...changed].map(p => path.posix.dirname(p)))].sort()
  console.log(dirs.join('\n'))
} else {
  console.log(JSON.stringify({ outOfPlan, unrealized, excluded, renamed, atRisk }, null, 2))
}
process.exit(outOfPlan.length ? 3 : 0)
