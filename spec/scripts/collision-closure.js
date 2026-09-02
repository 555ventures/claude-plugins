#!/usr/bin/env node
'use strict'
// collision-closure.js --spec <path> [--root <dir>] [--tests <dir>]… [--literal <stem>]… [--json]
//
// spec 20260814/05-collision-closure: two plan-time collateral-damage
// sweeps — find the tests that pin the files a spec is about to change, find the doctrine prose
// elsewhere that quotes wording a spec is about to retire — have lived as hand-executed prose
// (a § Gotchas bullet, a /spec:plan sentence) and have missed three times
// (specs/20260813/07 D8, specs/20260813/09 D4, specs/20260814/01's spec-paths key-set pin,
// which landed out-of-plan and had to be waived at review). This script is the sole derivation
// of both sweeps, invoked at plan lock: the **paths leg** (always runs) joins every non-tests
// File Plan path against the test corpus; the **literals leg** (--literal, optional, repeatable)
// joins planner-supplied stems against the whole repo. Advisory listing only — it never blocks.
//
// spec 20260830/01-collision-closure-exec-recall: the paths leg matched a File Plan target as
// a literal substring, but this repo's
// test helpers spawn scripts by a root-stripped path (`runNode('scripts/foo.js')`, never
// `spec/scripts/foo.js`) — two out-of-plan genesis test files (7 tests) spawned
// `scripts/genesis-driver.js` and were invisible to the leg (measured: 88/115 execution edges,
// 77%). Targets now key on their last two `/`-segments (subsumes a full-path spelling, no
// host-specific prefix) and runnable targets (`.js`/`.mjs`/`.cjs`/`.sh`, or a sniffed `#!` on an
// extensionless file) tier their hits `executes` — a call-graph fact, not a proximity guess —
// alongside the unchanged `likely`/`mentions` proximity tiering for non-runnable (prose) targets.
//
// What this deliberately does NOT do: gate the lock or any build/review stage (spec
// 20260814/03 D10's blocking whole-suite check owns execution adjudication end-to-end); choose
// which stems to search for (planner judgment); diff a git changed-set against the File Plan
// (that is scope-reconcile.js — disjoint inputs, disjoint stage); expand File Plan globs
// (targets are matched as literal substrings, never as patterns); shell out to grep (BSD/GNU
// flag divergence — a pure Node walk with directory pruning instead); distinguish an `executes`
// hit that merely cites a runnable file from one that truly spawns/loads it at runtime (the
// build-time suite check adjudicates that, never this script).
//
// Exit codes:
//   0 = every hit is already a File Plan row (or there are no hits)
//   1 = one or more hits are not File Plan rows — ADVISORY listing, never a block
//   2 = usage / unreadable spec / no File Plan table / no tests-layer rows and no --tests /
//       a resolved test root that is missing or unreadable

const fs = require('fs')
const path = require('path')
const { parseFilePlanRows } = require('./lib/file-plan')
const { globMatch, pipelineOwnedGlobs } = require('./lib/glob-match')

const HONESTY_LINE = 'likely/mentions tier is a lexical proxy; mentions may contain closed pins; an executes hit names a runnable file the test spawns, loads, or cites — not distinguished; the build-time suite check adjudicates'
const REMEDY_LINE = "remedy: add each literals hit as a File Plan row, or record the waive in the spec's Rationale; an `executes` hit names a test that runs a script you are changing — if the change alters that script's observable behavior, widen the File Plan or plan the fixture repair now; `likely` and `mentions` hits are visibility only and owe no waive line"
const PROXIMITY_LINES = 25

// ---- D1/D2: match-key derivation and runnable classification, applied once at target
// construction (no second pass over targets anywhere below). ------------------------------------
function matchKey(target) {            // D1
  const seg = target.split('/')
  return seg.length >= 2 ? seg.slice(-2).join('/') : target
}
function isRunnable(target, base) {    // D2
  if (/\.(js|mjs|cjs|sh)$/.test(target)) return true
  try { const fd = fs.openSync(path.join(base, target), 'r'); const b = Buffer.alloc(2)
        fs.readSync(fd, b, 0, 2, 0); fs.closeSync(fd); return b.toString() === '#!' }
  catch { return false }
}

function usage() {
  console.error('usage: collision-closure.js --spec <path> [--root <dir>] [--tests <dir>]… [--literal <stem>]… [--json]')
}

let specPath = null, root = null
const testsCli = [], literals = []
let jsonOut = false
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--spec') specPath = argv[++i]
  else if (a === '--root') root = argv[++i]
  else if (a === '--tests') testsCli.push(argv[++i])
  else if (a === '--literal') literals.push(argv[++i])
  else if (a === '--json') jsonOut = true
  else {
    console.error(`collision-closure: unknown flag ${a} — ` + 'usage: collision-closure.js --spec <path> [--root <dir>] [--tests <dir>]… [--literal <stem>]… [--json]')
    process.exit(2)
  }
}
if (!specPath) { usage(); process.exit(2) }
if (root === null) root = process.cwd()
root = path.resolve(root)

function toRel(absOrRel, base = root) {
  return path.relative(base, path.resolve(base, absOrRel)).split(path.sep).join('/')
}

let specText
try {
  specText = fs.readFileSync(specPath, 'utf8')
} catch (e) {
  console.error(`collision-closure: cannot read --spec ${specPath} — confirm the spec file exists: ${e.message}`)
  process.exit(2)
}
const specRel = toRel(specPath)

const rows = parseFilePlanRows(specText)
if (!rows.length) {
  console.error(`collision-closure: ${specPath} has no ## File Plan table — nothing to close`)
  process.exit(2)
}

const isTestsLayer = r => (r.layer || '').trim().toLowerCase() === 'tests'

const planned = [...new Set(rows.flatMap(r => r.paths))].sort()
const targets = [...new Set(rows.filter(r => !isTestsLayer(r)).flatMap(r => r.paths))].sort()

// ---- D3: test-root derivation --------------------------------------------------------------

let testRoots
if (testsCli.length) {
  testRoots = [...new Set(testsCli)]
} else {
  testRoots = [...new Set(rows.filter(isTestsLayer).flatMap(r => r.paths).map(p => p.split('/')[0]))]
  if (!testRoots.length) {
    console.error('collision-closure: no tests-layer File Plan rows and no --tests supplied — ' +
      "add tests rows to the spec's File Plan, or pass --tests <dir>")
    process.exit(2)
  }
}
testRoots.sort()

for (const t of testRoots) {
  const abs = path.join(root, t)
  let stat
  try {
    stat = fs.statSync(abs)
  } catch (e) {
    console.error(`collision-closure: test root ${t} does not exist under --root ${root} — fix the spec's File Plan tests rows, or pass --tests <dir> naming a directory that exists (${e.message})`)
    process.exit(2)
  }
  if (!stat.isDirectory()) {
    console.error(`collision-closure: test root ${t} is not a directory under --root ${root} — pass --tests <dir> naming a directory`)
    process.exit(2)
  }
}

// ---- walk helpers ---------------------------------------------------------------------------

// Plain recursive walk, no pruning — used for the paths leg, which is already scoped to the
// small derived/declared test roots.
function walkAllFiles(dir, base, out = []) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const full = path.join(e.parentPath || dir, e.name)
    if (e.isDirectory()) walkAllFiles(full, base, out)
    else if (e.isFile()) out.push(toRel(full, base))
  }
  return out
}

// literal prefix of a glob up to its first wildcard char — `specs/**` -> `specs/`.
function literalPrefix(glob) {
  const i = glob.indexOf('*')
  return i === -1 ? glob : glob.slice(0, i)
}

// D5: repo-root walk excluding .git, node_modules, and pipelineOwnedGlobs(root) — pruned at
// directory level where possible (perf, A2/A7) and re-checked per file (correctness: a glob
// like `.claude/spec-runs.jsonl` names a single file, not a directory to prune).
function walkForLiterals(base, ownedGlobs) {
  const dirPrefixes = ownedGlobs.map(literalPrefix).filter(p => p.endsWith('/')).map(p => p.slice(0, -1))
  const out = []
  function rec(dir) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = path.join(e.parentPath || dir, e.name)
      const rel = toRel(full, base)
      if (e.isDirectory()) {
        if (e.name === '.git' || e.name === 'node_modules' || dirPrefixes.includes(rel)) continue
        rec(full)
      } else if (e.isFile()) {
        if (ownedGlobs.some(g => globMatch(g, rel))) continue
        out.push(rel)
      }
    }
  }
  rec(base)
  return out
}

function readSafe(absPath) {
  try {
    return fs.readFileSync(absPath, 'utf8')
  } catch {
    return null
  }
}

// ---- D12: tier — likely iff a `deepStrictEqual` line sits within ±25 lines of a line that
// mentions the target's literal string. ----------------------------------------------------
function isLikely(content, target) {
  const lines = content.split('\n')
  const targetLines = [], deepEqLines = []
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(target)) targetLines.push(i)
    if (lines[i].includes('deepStrictEqual')) deepEqLines.push(i)
  }
  return targetLines.some(ti => deepEqLines.some(di => Math.abs(ti - di) <= PROXIMITY_LINES))
}

// ---- paths leg -------------------------------------------------------------------------------

const pathsResult = targets.map(target => ({
  target,
  key: matchKey(target),
  runnable: isRunnable(target, root),
  hits: new Set(),
  executes: new Set(),
}))
const likelyFiles = new Set()
let anyPathsHit = false

if (targets.length) {
  const testFiles = new Set()
  for (const t of testRoots) for (const f of walkAllFiles(path.join(root, t), root)) testFiles.add(f)

  for (const f of testFiles) {
    if (f === specRel) continue
    const content = readSafe(path.join(root, f))
    if (content === null) continue
    for (const entry of pathsResult) {
      if (!content.includes(entry.key)) continue
      entry.hits.add(f)
      anyPathsHit = true
      // D3: executes is additive on top of the unchanged likely/mentions proximity computation —
      // a runnable target's hit that also sits near a deepStrictEqual tiers BOTH executes and
      // likely (Contracts: "a file... may appear in both executes and likely"); isLikely runs
      // unconditionally, keyed on the D1 suffix.
      if (entry.runnable) entry.executes.add(f)
      if (isLikely(content, entry.key)) likelyFiles.add(f)
    }
  }
}

// ---- literals leg ------------------------------------------------------------------------------

const literalsResult = literals.map(stem => ({ stem, hits: new Set() }))

if (literals.length) {
  const ownedGlobs = pipelineOwnedGlobs(root)
  const files = walkForLiterals(root, ownedGlobs)
  const lowerStems = literals.map(s => s.toLowerCase())
  for (const f of files) {
    if (f === specRel) continue
    const content = readSafe(path.join(root, f))
    if (content === null) continue
    const lower = content.toLowerCase()
    lowerStems.forEach((stem, i) => {
      if (lower.includes(stem)) literalsResult[i].hits.add(f)
    })
  }
}

// ---- assemble: unplanned = union of all hits minus planned minus the spec's own path --------

const plannedSet = new Set(planned)
const allHits = new Set()
for (const p of pathsResult) for (const h of p.hits) allHits.add(h)
for (const l of literalsResult) for (const h of l.hits) allHits.add(h)

const unplanned = [...allHits].filter(h => h !== specRel && !plannedSet.has(h)).sort()
const unplannedSet = new Set(unplanned)
const likely = [...likelyFiles].filter(f => unplannedSet.has(f)).sort()

// D3: executes = union of per-target executes sets, filtered to unplanned, sorted — the
// identical derivation `likely` uses above.
const executesFiles = new Set()
for (const p of pathsResult) for (const h of p.executes) executesFiles.add(h)
const executes = [...executesFiles].filter(f => unplannedSet.has(f)).sort()

// ---- output -----------------------------------------------------------------------------------

if (jsonOut) {
  console.log(JSON.stringify({
    spec: specRel,
    testRoots,
    planned,
    paths: pathsResult.map(p => ({ target: p.target, hits: [...p.hits].sort() })),
    literals: literalsResult.map(l => ({ stem: l.stem, hits: [...l.hits].sort() })),
    unplanned,
    likely,
    executes,
  }, null, 2))
} else {
  const out = []
  out.push('paths leg:')
  if (!targets.length) {
    out.push('  (no non-tests File Plan rows)')
  }
  for (const p of pathsResult) {
    if (!p.hits.size) {
      out.push(`  ${p.target}: — none`)
      continue
    }
    out.push(`  ${p.target}:`)
    // D3: executes: first, always; likely: is unconditional (a runnable hit that is also
    // proximate to a deepStrictEqual prints under both); mentions: is the non-runnable catch-all
    // only — a runnable target's every hit is already accounted for under executes:, so it never
    // gets a redundant mentions: bucket.
    const executeHits = [...p.executes].sort()
    const likelyHits = [...p.hits].filter(h => likelyFiles.has(h)).sort()
    const mentionHits = p.runnable ? [] : [...p.hits].filter(h => !likelyFiles.has(h)).sort()
    if (executeHits.length) {
      out.push('    executes:')
      for (const h of executeHits) out.push(`      ${h}`)
    }
    if (likelyHits.length) {
      out.push('    likely:')
      for (const h of likelyHits) out.push(`      ${h}`)
    }
    if (mentionHits.length) {
      out.push('    mentions:')
      for (const h of mentionHits) out.push(`      ${h}`)
    }
  }
  if (anyPathsHit) {
    out.push('')
    out.push(HONESTY_LINE)
  }
  if (literals.length) {
    out.push('')
    out.push('literals leg:')
    for (const l of literalsResult) {
      if (!l.hits.size) {
        out.push(`  ${l.stem}: — none`)
        continue
      }
      out.push(`  ${l.stem}:`)
      for (const h of [...l.hits].sort()) out.push(`    ${h}`)
    }
  }
  out.push('')
  out.push(`unplanned=${unplanned.length} likely=${likely.length}`)
  out.push(REMEDY_LINE)
  console.log(out.join('\n'))
}

process.exit(unplanned.length ? 1 : 0)
