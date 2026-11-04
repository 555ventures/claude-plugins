#!/usr/bin/env node
'use strict'
// review-legs.js --root <dir> --spec <path> --base <ref> --manifest <path>
//   [--skips <file>] [--fix-delta] [--out-dir <dir>] [--reuse-from <manifest>] [--tree <40-hex>]
//
// Owner: specs/20260820/06-typed-evidence-manifest.md; the run cache and at-risk reuse:
// specs/20261103/12-one-suite-run-per-tree.md
//
// Runs every deterministic review leg, appends one JSONL row per leg to --manifest (the evidence
// manifest verdict.js derives from), and prints a red/green summary. The leg scripts
// (scope-reconcile.js, smoke.sh, ci-query.js, ac-matrix.js) are reused as-is — this file only
// orchestrates. Every leg subprocess gets SPEC_REVIEW_BASE=<--base>.
//
// Legs and row shapes (verdict.js's REVIEW_LEGS; observed is always a typed JSON object — the
// manifest's Contracts block is the closed set):
//   reconcile      {"outOfPlan":N,"files":[…],"filesOmitted":M?} — files is scope-reconcile's
//                  outOfPlan array verbatim, capped at 40; exit 0|3
//   gate           {"skips":N,"todos":N,"testsExecuted":N|{"unavailable":…}} — or the whole-row
//                  {"unavailable":"gate-unresolvable","detail":…}, exit 1, when it never ran
//   smoke          {"result":"pass"|"inert"|"fail"}
//   ci             {"conclusion":…}|{"status":"in-progress"}|{"unavailable":"no-adapter"|"transient"}|
//                  {"unavailable":"sha-unseen","branch":…,"branchConclusion":…} — sha-unseen is
//                  always exit 0, even when the branch is red
//   at-risk        {"files":N,"testsExecuted":N|{"unavailable":…}} | {"unavailable":"no-test-command"}
//                  | {"files":N,"testsExecuted":N,"reused":"suite"} — no spawn, when this iteration's suite
//                  row is exit 0 with a numeric testsExecuted and testCommand has no {file}
//                  | {"malformed":{…}} — exit FORCED to 1 when files>0 and testsExecuted is 0 or
//                  {"unavailable":"pattern-no-match"}; "no-format-declared" never forces
//   suite          typed like gate, "reused":"gate"? — wave 1b, bare testCommand, every scope;
//                  exit FORCED to 1 on a declared testCountPattern observing 0 or never matching
//                  on an exit-0 run; BLOCKING
//   (no slow row: slowTestCommand runs at `--mark closed` and in release-legs, never here — specs/20261103/13 D13)
//   tests          {"count":N,"dispositions":{…}} | {"unavailable":"count-failed"} — always exit 0,
//                  every scope, advisory; count from count-tests.js --json
//   ac-matrix / skip-reconcile / promise-sweep — appended by those scripts themselves
//   contract       {"tests":N,"passed":true}|{"unavailable":"no-replay"} — only for a spec with
//                  `prototype: <stem>`, read off the last build ledger row naming the spec
//   patterns       {"matches":N|{"unavailable":"no-count-lines"}} — when config declares patternsScript
//   drift          {"summary":"<first stdout line, ≤120 chars>"} — when config declares driftScript
// Free-text sub-fields are bounded to 120 chars at the emitter. Counts never assume zero: an
// absent/"none"/unmatched pattern is a typed unavailability. Every run writes <out-dir>/timings.json.
//
// --fix-delta skips reconcile/at-risk/patterns and re-runs everything else in full. --reuse-from
// copies a prior green REUSABLE row (gate, suite, at-risk, patterns, smoke) of equal scope,
// stamped observed.reusedFrom; an unreadable path exits 2 before any row is written. Rows
// appended through appendRow carry `scope` ("full"|"fix-delta") as their last key; rows
// ac-matrix.js and promise-sweep.js append themselves carry none.
//
// --tree <40-hex> (the driver passes lib/run-cache.js's cacheTree) arms the run cache for the gate and
// suite legs, resolved in this order: a --reuse-from prior green row (reusedFrom: <basename>), else a
// cache hit for the resolved command over that tree (the recorded observation stamped
// reusedFrom: "cache:<tree7>", no spawn, no gate-output.txt/suite-output.txt), else a spawn — and
// every green spawned gate/suite row with a numeric testsExecuted is recorded under its command.
// Absent --tree, the cache is neither read nor written; a malformed value exits 2.
//
// Before wave 1, env-preflight.js --root <root> runs as a hard precondition: its exit 1 (a
// declared testEnv var unset) exits 2 here with its lines re-emitted on stderr, before any row.
//
// What this deliberately does NOT do: derive a verdict (verdict.js is the sole derivation),
// extract skipped-test NAMES from gate output (the session passes --skips), or retry/poll anything.
//
// Exit codes: 0 = every blocking leg (gate/suite/smoke/ci) green — findings legs may still have
// findings for disposition · 1 = a blocking leg is red (review hard-stops pre-reviewer) ·
// 2 = usage error or precondition failure (unreadable config/spec, malformed --tree, scope-reconcile exit 2, or
// env-preflight.js exit 1 — an unprovisioned declared testEnv var)

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { readConfig, CONFIG_RELPATH } = require('./lib/host-config')
const { resolveGate, gateRunsSuite } = require('./lib/gate-resolve')
const { runAsync, withFiles } = require('./lib/host-run')
const { computeTestsExecuted, computeSkips, isUnobserved } = require('./lib/count-observation')
const { extractSection, parseAcBullets, parseDisposition } = require('./lib/spec-sections')
const { fmMap } = require('./lib/frontmatter')
const runCache = require('./lib/run-cache')
const { readManifest } = require('./lib/manifest')

function usage() {
  console.error('usage: review-legs.js --root <dir> --spec <path> --base <ref> --manifest <path> [--skips <file>] [--fix-delta] [--out-dir <dir>] [--reuse-from <manifest>] [--tree <40-hex>]')
}

let root = null, spec = null, base = null, manifest = null, skips = null, fixDelta = false, outDir = null, reuseFrom = null, tree = null
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--root') root = argv[++i]
  else if (a === '--spec') spec = argv[++i]
  else if (a === '--base') base = argv[++i]
  else if (a === '--manifest') manifest = argv[++i]
  else if (a === '--skips') skips = argv[++i]
  else if (a === '--fix-delta') fixDelta = true
  else if (a === '--out-dir') outDir = argv[++i]
  else if (a === '--reuse-from') reuseFrom = argv[++i]
  else if (a === '--tree') tree = argv[++i]
  else { console.error('review-legs: unknown argument ' + a); usage(); process.exit(2) }
}
if (!root || !spec || !base || !manifest) { usage(); process.exit(2) }
if (tree !== null && !/^[0-9a-f]{40}$/.test(tree || '')) {
  console.error('review-legs.js: --tree must be a 40-hex tree sha — pass the review driver\'s cacheTree, or drop the flag to run uncached')
  process.exit(2)
}
root = path.resolve(root)
// REUSABLE: the legs that run host tests, boot the app or sweep the tree (see header).
const REUSABLE = ['gate', 'suite', 'at-risk', 'patterns', 'smoke']
const priorRows = new Map()
if (reuseFrom) {
  try {
    for (const line of fs.readFileSync(reuseFrom, 'utf8').split('\n')) {
      if (!line.trim()) continue
      const r = JSON.parse(line)
      if (r && typeof r.leg === 'string' && !priorRows.has(r.leg)) priorRows.set(r.leg, r)
    }
  } catch { console.error(`review-legs.js: --reuse-from ${reuseFrom} cannot be read`); process.exit(2) }
}
function reusableRow(leg) {
  if (!REUSABLE.includes(leg)) return null
  const r = priorRows.get(leg)
  if (!r || !r.observed || typeof r.observed !== 'object') return null
  if (r.scope !== (fixDelta ? 'fix-delta' : 'full')) return null
  if (!(r.exit === 0 || (leg === 'smoke' && r.exit === 4))) return null
  return r
}
// The manifest is all-or-nothing: rows land in `<manifest>.partial` (truncated here) and the named
// file exists only after the single rename at the tail, so a runner killed mid-wave never leaves a
// fragment the review driver's manifest count would read as a finished run.
const manifestFinal = manifest
manifest = manifestFinal + '.partial'
fs.rmSync(manifest, { force: true })
let config
try { config = readConfig(root) } catch (e) {
  console.error(`review-legs.js: cannot read ${CONFIG_RELPATH} under --root: ${e.message} — run /spec:init first`)
  process.exit(2)
}
if (!config.gateCommand) {
  console.error(`review-legs.js: no gateCommand in ${CONFIG_RELPATH} under --root — run /spec:init first`)
  process.exit(2)
}

// ---- precondition: env-preflight.js (default mode) before any manifest row -------------------
const preflight = spawnSync(process.execPath, [path.join(__dirname, 'env-preflight.js'), '--root', root], { encoding: 'utf8' })
if (preflight.status !== 0) {
  const detail = `${preflight.stdout || ''}${preflight.stderr || ''}`.trim() || `env-preflight.js exited ${preflight.status}`
  console.error(`review-legs.js: environment not provisioned — env-preflight.js failed before any leg could run:\n${detail}`)
  process.exit(2)
}
outDir = outDir || fs.mkdtempSync(path.join(require('os').tmpdir(), 'review-legs-'))
fs.mkdirSync(outDir, { recursive: true })

const rows = []
const runStart = Date.now()
const timings = {}
// `timed` is the sh() result the row was derived from (it carries `ms`, the spawn's wall-clock);
// a reused/unavailable row passes none and// records 0. Timings live in <out-dir>/timings.json, never in the manifest row.
function appendRow(leg, exit, observed, timed) {
  timings[leg] = timed && Number.isFinite(timed.ms) ? Math.max(0, Math.round(timed.ms)) : 0
  // scope is always the LAST key on a row this writer appends.
  const row = { leg, exit, observed, scope: fixDelta ? 'fix-delta' : 'full' }
  rows.push(row)
  fs.appendFileSync(manifest, JSON.stringify(row) + '\n')
}

// testCountPattern/skipReportPattern: absent or "none" = no declared format (never a finding);
// declared but unmatched = drift. Never assumed zero. Helpers live in ./lib/count-observation.js.
// The patterns script prints one `### <name>: <N>` per sweep; `matches` is their sum, and no
// `###` line at all is a typed unavailability.
// Sweep scope: each nested changed path contributes its dir, a root-level file itself; entries
// nested under another entry are pruned (rg would report an overlapping pair twice).
function appendReused(r) {
  timings[r.leg] = 0
  const row = { leg: r.leg, exit: r.exit, observed: { ...r.observed, reusedFrom: path.basename(reuseFrom) }, scope: r.scope }
  rows.push(row)
  fs.appendFileSync(manifest, JSON.stringify(row) + '\n')
}

// A cache hit for `cmd` over --tree appended as the recorded observation stamped with its provenance.
function cachedEntry(cmd) {
  if (!tree || !cmd) return null
  const e = runCache.lookup(root, cmd, tree)
  return e && e.observed && typeof e.observed.testsExecuted === 'number' ? e : null
}
function appendCached(leg, e) {
  timings[leg] = 0
  const row = { leg, exit: 0, observed: { ...e.observed, reusedFrom: 'cache:' + tree.slice(0, 7) }, scope: fixDelta ? 'fix-delta' : 'full' }
  rows.push(row)
  fs.appendFileSync(manifest, JSON.stringify(row) + '\n')
}
function recordRun(cmd, exit, observed) {
  if (!tree || !cmd) return
  const { reusedFrom, reused, ...clean } = observed || {}
  runCache.record(root, cmd, tree, { exit, observed: clean })
}

// This iteration's suite row is green with a numeric count and testCommand has no {file}.
function suiteReusable() {
  const sr = rows.find(r => r.leg === 'suite')
  return !!(sr && sr.exit === 0 && sr.observed && typeof sr.observed.testsExecuted === 'number' &&
    config.testCommand && !config.testCommand.includes('{file}'))
}

function patternsScope(files) {
  const raw = [...new Set(files.map(f => (f.includes('/') ? path.posix.dirname(f) : f)))].sort()
  return raw.filter(d => !raw.some(o => o !== d && d.startsWith(o + '/')))
}

function countPatternMatches(out) {
  const totals = [...String(out).matchAll(/^### .*: (\d+)\s*$/gm)].map(m => Number(m[1]))
  return totals.length ? totals.reduce((a, b) => a + b, 0) : { unavailable: 'no-count-lines' }
}

function sh(cmd, opts = {}) {
  // lib/host-run.js scrubs the test-runner context vars. SPEC_REVIEW_BASE is set AFTER opts.env so
  // no leg-local override can redirect the base this review judges against.
  const t0 = Date.now()
  return runAsync(cmd, { cwd: root, env: { ...opts.env, SPEC_REVIEW_BASE: base } })
    .then(r => ({ ...r, ms: Date.now() - t0 }))
}

async function main() {
  let specText
  try { specText = fs.readFileSync(path.resolve(root, spec), 'utf8') } catch (e) {
    console.error(`review-legs.js: cannot read --spec ${spec}: ${e.message}`); process.exit(2)
  }
  const scriptDir = __dirname
  const q = (p) => `"${p}"`
  const reconcilePath = path.join(outDir, 'reconcile.json')
  const gateOutPath = path.join(outDir, 'gate-output.txt')
  const suiteOutPath = path.join(outDir, 'suite-output.txt')
  const patternsPath = path.join(outDir, 'patterns.txt')
  const atRiskPath = path.join(outDir, 'at-risk.txt')
  // Advertise at-risk.txt only when THIS run wrote it — a reused --out-dir can hold a stale
  // copy from a prior run, and an existence probe would advertise it as this run's evidence.
  let wroteAtRisk = false
  let wroteSuiteOutput = false

  // ---- wave 1 (parallel): reconcile, gate, ci ---------------------------------------------
  // smoke runs after every leg that runs host tests or builds the app (its own wave below): a
  // concurrent boot collides with them on shared runtime state.
  const wave1 = []

  let reconcileJson = null
  if (!fixDelta) {
    wave1.push(sh(`node ${q(path.join(scriptDir, 'scope-reconcile.js'))} --root ${q(root)} --base ${q(base)} --spec ${q(spec)} --json`).then(r => {
      if (r.code === 2) { console.error(`review-legs.js: scope-reconcile precondition failure:\n${r.err || r.out}`); process.exit(2) }
      fs.writeFileSync(reconcilePath, r.out)
      try { reconcileJson = JSON.parse(r.out) } catch { reconcileJson = null }
      // files: scope-reconcile's outOfPlan array verbatim, capped at 40; unparseable JSON keeps n=0.
      const paths = reconcileJson ? reconcileJson.outOfPlan : []
      const n = paths.length
      appendRow('reconcile', r.code,
        { outOfPlan: n, files: paths.slice(0, 40), ...(n > 40 ? { filesOmitted: n - 40 } : {}) }, r)
    }))
  }

  const resolved = resolveGate(specText, config)
  const reusedGate = reusableRow('gate')
  const cachedGate = reusedGate ? null : cachedEntry(resolved.gate)
  if (reusedGate) {
    appendReused(reusedGate)
  } else if (cachedGate) {
    appendCached('gate', cachedGate)
  } else if (resolved.gate) {
    wave1.push(sh(resolved.gate).then(r => {
      fs.writeFileSync(gateOutPath, r.out + r.err)
      const output = r.out + r.err
      const skipPat = config.capabilities && config.capabilities.skipReportPattern
      const countPat = config.capabilities && config.capabilities.testCountPattern
      // No match is honestly unavailable, never assumed-zero (the never-assumed-zero rule) —
      // runners that print a zero-skip line still match the declared pattern with count 0.
      const observed = { ...computeSkips(output, skipPat), testsExecuted: computeTestsExecuted(output, countPat) }
      appendRow('gate', r.code, observed, r)
      recordRun(resolved.gate, r.code, observed)
    }))
  } else {
    // the whole-row unavailable alternative — no gate command could be resolved at all — is
    // still a red gate row (exit 1), with the reason bounded to 120 chars at this emitter.
    appendRow('gate', 1, { unavailable: 'gate-unresolvable', detail: String(resolved.reason || '').slice(0, 120) })
  }

  wave1.push(sh(`node ${q(path.join(scriptDir, 'ci-query.js'))} --commit $(git rev-parse HEAD) --root ${q(root)}`).then(r => {
    let observed = { unavailable: 'no-adapter' }, exit = 0
    const line = (r.out || '').trim().split('\n').pop() || ''
    if (/^unavailable/.test(line)) observed = { unavailable: 'no-adapter' }
    else {
      try {
        const j = JSON.parse(line)
        // shaUnseen is an observed row at exit 0 unconditionally (the never-block ruling).
        if (j.shaUnseen === true) observed = { unavailable: 'sha-unseen', branch: j.branch, branchConclusion: j.branchRun.conclusion }
        else if (!j.available) observed = { unavailable: j.transient ? 'transient' : 'no-adapter' }
        else if (j.status && j.status !== 'completed') observed = { status: 'in-progress' }
        else { observed = { conclusion: j.conclusion }; exit = /^(failure|timed_out|cancelled)$/.test(j.conclusion) ? 1 : 0 }
      } catch { observed = { unavailable: 'no-adapter' } }
    }
    appendRow('ci', exit, observed, r)
  }))

  await Promise.all(wave1)

  // ---- wave 1b: suite, ALONE — every scope including --fix-delta; never concurrent with
  // another leg that runs host tests.
  const reusedSuite = reusableRow('suite')
  const cachedSuite = reusedSuite ? null : cachedEntry(config.testCommand)
  if (reusedSuite) {
    appendReused(reusedSuite)
  } else if (cachedSuite) {
    appendCached('suite', cachedSuite)
  } else if (!config.testCommand) {
    // the whole-row unavailable alternative — testCommand is a contract-required config key,
    // so its absence is a broken host, never a silent skip.
    appendRow('suite', 1, { unavailable: 'no-test-command' })
  } else if (gateRunsSuite(config.gateCommand, resolved.gate, config.testCommand) &&
      rows.some(r => r.leg === 'gate' && typeof r.observed.testsExecuted === 'number')) {
    // the gate ran the whole suite over this tree and observed an executed count — copy its
    // evidence, spawn nothing.
    const g = rows.find(r => r.leg === 'gate')
    const gateExit = isUnobserved(g.observed.testsExecuted) ? 1 : g.exit
    appendRow('suite', gateExit, { ...g.observed, reused: 'gate' })
    recordRun(config.testCommand, gateExit, g.observed)
  } else if (config.testCommand.includes('{file}')) {
    // a per-file {file} command has no bare whole-suite form — running it unsubstituted would
    // hand the runner a literal placeholder; the gate leg is the whole-suite observation.
    appendRow('suite', 0, { unavailable: 'file-placeholder' })
  } else {
    const sr = await sh(config.testCommand)
    fs.writeFileSync(suiteOutPath, `$ ${config.testCommand}\n\n${sr.out}${sr.err}`)
    wroteSuiteOutput = true
    const output = sr.out + sr.err
    const skipPat = config.capabilities && config.capabilities.skipReportPattern
    const countPat = config.capabilities && config.capabilities.testCountPattern
    const testsExecuted = computeTestsExecuted(output, countPat)
    // exit FORCED to 1 when a declared testCountPattern observes 0 tests or never matches on an
    // exit-0 run.
    const exit = isUnobserved(testsExecuted) ? 1 : sr.code
    const suiteObserved = { ...computeSkips(output, skipPat), testsExecuted }
    appendRow('suite', exit, suiteObserved, sr)
    recordRun(config.testCommand, exit, suiteObserved)
  }

  // ---- wave 2 (parallel): at-risk + patterns (post-gate; both need reconcile's output) ----
  const wave2 = []
  // `tests` — every scope, advisory only (never BLOCKING); shells out to count-tests.js --json.
  {
    // A failing count-tests.js run is the typed {"unavailable":"count-failed"}, never {"count":0}.
    // dispositions come from the spec's own AC bullets via parseDisposition.
    const tTests = Date.now()
    const testCountResult = spawnSync(process.execPath,
      [path.join(scriptDir, 'count-tests.js'), '--root', root, '--json'], { encoding: 'utf8' })
    const testCountTimed = { ms: Date.now() - tTests }
    let testCountJson = null
    if (testCountResult.status === 0) {
      try { testCountJson = JSON.parse((testCountResult.stdout || '').trim().split('\n').pop() || '') } catch { testCountJson = null }
    }
    if (!testCountJson || !Number.isInteger(testCountJson.count)) {
      appendRow('tests', 0, { unavailable: 'count-failed' }, testCountTimed)
    } else {
      const dispositions = { writes: 0, rewrites: 0, reuses: 0 }
      const acSection = extractSection(specText, 'Acceptance Criteria')
      if (acSection !== null) {
        for (const b of parseAcBullets(acSection)) {
          if (b.malformed) continue
          const d = parseDisposition(b.raw)
          if (d && Object.prototype.hasOwnProperty.call(dispositions, d.kind)) dispositions[d.kind]++
        }
      }
      appendRow('tests', 0, { count: testCountJson.count, dispositions }, testCountTimed)
    }
  }
  if (!fixDelta) {
    const atRisk = (reconcileJson && Array.isArray(reconcileJson.atRisk)) ? reconcileJson.atRisk : []
    // Zero at-risk files is a genuine, known zero (nothing needed to run) — not an unmade
    // observation, so testsExecuted is the literal 0 here, never a typed unavailability.
    const reusedAtRisk = reusableRow('at-risk')
    if (reusedAtRisk) appendReused(reusedAtRisk)
    else if (!atRisk.length) appendRow('at-risk', 0, { files: 0, testsExecuted: 0 })
    else if (!config.testCommand) appendRow('at-risk', 0, { unavailable: 'no-test-command' })
    // scope-reconcile emits atRisk as {file, refs}; pass `.file`, and fail closed on a malformed
    // entry rather than handing the runner a path that matches nothing (a vacuous green).
    else {
      const malformed = atRisk.filter(a => !a || typeof a.file !== 'string' || !a.file.trim())
      if (malformed.length) {
        fs.writeFileSync(atRiskPath, `malformed atRisk entries (expected {file, refs}):\n${JSON.stringify(malformed, null, 2)}\n`)
        wroteAtRisk = true
        appendRow('at-risk', 1, { malformed: { entries: malformed.length, of: atRisk.length } })
      } else if (suiteReusable()) {
        // a bare testCommand run over this tree executed every at-risk file already.
        const sr = rows.find(r => r.leg === 'suite')
        appendRow('at-risk', 0, { files: atRisk.length, testsExecuted: sr.observed.testsExecuted, reused: 'suite' })
      } else {
        const atRiskFiles = atRisk.map(a => a.file)
        const atRiskCmd = withFiles(config.testCommand, atRiskFiles)
        wave2.push(sh(atRiskCmd).then(r => {
          // The leg's finding is contractually "{failing files/digest, session-extracted from
          // runner output}" — discarding the output makes that finding unproducible.
          fs.writeFileSync(atRiskPath, `$ ${atRiskCmd}\n\n${r.out}${r.err}`)
          wroteAtRisk = true
          const testsExecuted = computeTestsExecuted(r.out + r.err, config.capabilities && config.capabilities.testCountPattern)
          // exit FORCED to 1 when files>0 and testsExecuted is 0 or pattern-no-match.
          const exit = isUnobserved(testsExecuted) ? 1 : r.code
          appendRow('at-risk', exit, { files: atRisk.length, testsExecuted }, r)
        }))
      }
    }

    const reusedPatterns = config.patternsScript ? reusableRow('patterns') : null
    if (reusedPatterns) appendReused(reusedPatterns)
    else if (config.patternsScript) {
      // Scope = dirs of every changed file minus pipeline-owned paths, from reconcile's `changed`
      // set (never its exception sets). An empty list leaves the host script on its defaults.
      const excludedSet = new Set(reconcileJson && Array.isArray(reconcileJson.excluded) ? reconcileJson.excluded : [])
      const changed = reconcileJson && Array.isArray(reconcileJson.changed) ? reconcileJson.changed : []
      const dirs = patternsScope(changed.filter(f => !excludedSet.has(f)))
      wave2.push(sh(`DIFF_BASE=${q(base)} bash ${q(path.resolve(root, config.patternsScript))} ${dirs.map(q).join(' ')}`).then(r => {
        fs.writeFileSync(patternsPath, r.out)
        appendRow('patterns', r.code, { matches: countPatternMatches(r.out) }, r)
      }))
    }
  }
  if (config.driftScript) {
    // drift's summary is the one built-in free-text field — bounded to 120 chars at this
    // emitter, never sliced as a whole row downstream.
    wave2.push(sh(`${config.driftScript} ${q(spec)}`).then(r =>
      appendRow('drift', r.code, { summary: (r.out.trim().split('\n')[0] || '').slice(0, 120) }, r)))
  }
  await Promise.all(wave2)

  // ---- wave 2b: smoke, ALONE — after every leg that can run host tests or build the app ---
  // Its full output is retained: a red smoke row needs the boot log.
  const reusedSmoke = reusableRow('smoke')
  if (reusedSmoke) appendReused(reusedSmoke)
  else {
    const smokeR = await sh(`bash ${q(path.join(scriptDir, 'smoke.sh'))}`)
    fs.writeFileSync(path.join(outDir, 'smoke.txt'), smokeR.out + smokeR.err)
    appendRow('smoke', smokeR.code, { result: smokeR.code === 0 ? 'pass' : smokeR.code === 4 ? 'inert' : 'fail' }, smokeR)
  }

  // ---- contract leg: a `prototype:` spec only — the build row is the executed evidence, ----
  // appended before ac-matrix because ac-matrix reads oracle standing by leg name off the manifest.
  if (fmMap(specText).prototype) {
    const specRel = path.relative(root, path.resolve(root, spec))
    let lastBuild = null
    try {
      for (const line of fs.readFileSync(path.join(root, '.claude/spec-runs.jsonl'), 'utf8').split('\n')) {
        if (!line.trim()) continue
        let row
        try { row = JSON.parse(line) } catch { continue }
        if (row && row.stage === 'build' && row.spec === specRel) lastBuild = row
      }
    } catch { /* no ledger: no replay evidence */ }
    const rp = lastBuild && lastBuild.replay
    // A sibling slice (build row `replay: {owner: false}`) gets no contract row at all.
    if (rp && rp.owner === false) { /* not the replay owner */ }
    else if (rp && rp.passed === true && rp.looked === true) appendRow('contract', 0, { tests: rp.tests, passed: true })
    else appendRow('contract', 1, { unavailable: 'no-replay' })
  }

  // ---- wave 3: ac-matrix (+ skip-reconcile) — needs the gate row present in the manifest --
  const acr = await sh(`node ${q(path.join(scriptDir, 'ac-matrix.js'))} --spec ${q(spec)} --root ${q(root)} --manifest ${q(manifest)}${skips ? ` --skips ${q(skips)}` : ''}${config.driftScript ? ' --has-drift-script' : ''}`)
  fs.writeFileSync(path.join(outDir, 'ac-matrix.txt'), acr.out + acr.err)

  // ---- wave 3b: promise-sweep — every scope; appends its own row, never via appendRow.
  const psr = await sh(`node ${q(path.join(scriptDir, 'promise-sweep.js'))} --spec ${q(spec)} --manifest ${q(manifest)}`)
  fs.writeFileSync(path.join(outDir, 'promise-sweep.txt'), psr.out + psr.err)

  // ---- summary ----------------------------------------------------------------------------
  const { byLeg } = readManifest(manifest)
  // rows ac-matrix.js / promise-sweep.js append themselves take their script's wall-clock (the
  // skip-reconcile row rides ac-matrix's spawn, so it records 0); timings.json keeps manifest order.
  const ms = (leg) => leg in timings ? timings[leg]
    : leg === 'ac-matrix' ? acr.ms : leg === 'promise-sweep' ? psr.ms : 0
  const timingsOut = {}
  for (const leg of byLeg.keys()) timingsOut[leg] = Math.max(0, Math.round(ms(leg)))
  timingsOut.total = Math.round(Date.now() - runStart)
  fs.writeFileSync(path.join(outDir, 'timings.json'), JSON.stringify(timingsOut) + '\n')
  const BLOCKING = ['gate', 'suite', 'smoke', 'ci']
  let blockedBy = []
  for (const r of byLeg.values()) {
    const red = r.leg === 'smoke' ? (r.exit !== 0 && r.exit !== 4) : r.exit !== 0
    const blocking = BLOCKING.includes(r.leg)
    if (red && blocking) blockedBy.push(r.leg)
    console.log(`${red ? (blocking ? '❌' : '⚠️ ') : '✅'} ${r.leg.padEnd(14)} exit=${r.exit} ${JSON.stringify(r.observed)}${red && !blocking ? ' (findings — disposition in review)' : ''} (${(timingsOut[r.leg] / 1000).toFixed(1)}s)`)
  }
  // Finalize: only now does the caller's manifest path exist. Both exits below follow it, so
  // a RED_BLOCKING run still hands the driver a complete manifest to derive STOPPED from.
  fs.renameSync(manifest, manifestFinal)
  console.log(`manifest: ${manifestFinal}`)
  console.log(`outputs: ${outDir}  (reconcile.json, gate-output.txt${wroteSuiteOutput ? ', suite-output.txt' : ''}, smoke.txt, ac-matrix.txt, promise-sweep.txt${config.patternsScript ? ', patterns.txt' : ''}${wroteAtRisk ? ', at-risk.txt' : ''})`)
  if (blockedBy.length) {
    console.log(`RED_BLOCKING: ${blockedBy.join(',')}`)
    process.exit(1)
  }
  process.exit(0)
}

main()
