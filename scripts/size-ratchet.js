#!/usr/bin/env node
'use strict'
// size-ratchet.js --root <dir> [--baseline <file>] [--json]
// size-ratchet.js --root <dir> --update
// size-ratchet.js --root <dir> --raise <path|tree> --to <bytes> --cite <spec path>
// size-ratchet.js --root <dir> --reconcile --cite <spec path>|direct
//
// Keeps size-baseline.json (repo root) a TIGHT byte ceiling over every tracked file under
// spec/scripts, scripts, and tests, plus a per-tree total, so the plugin's own code can shrink
// freely but can only grow through a raise that names the spec asking for it.
// Owner: specs/20260908/01-size-ratchet.md D1-D6, D13 (AC-20260908-01-1..8); the live standing
// pin is tests/consistency/size-ratchet-live.test.js (AC-20260908-01-9). --reconcile is owned by
// specs/20260909/01-replay-build-shaped-mutation.md D8-D9 (AC-20260909-01-12..14): the same
// tightening --update performs, with the over/tree-over/new-over-cap refusal replaced by one
// cited raises[] entry per lifted finding — the one-shot form of what a build does by hand
// (--update refused, then --raise --cite per finding) after reconciling its own derived artifacts.
//
// specs/20260908/01-size-ratchet.md D15 adds one more admissible cite, to --reconcile alone: the
// literal `direct`, for a fix core.md § Incident Policy forbids to have a spec at all. D4's
// rejection was of free-form reason STRINGS, unverifiable by construction; `direct` carries no
// string to verify, only a byte bound this script measures, git being the provenance of the
// commit that adds the row. Admitted when all three hold: every grown-or-new file is a shell
// gate (`*.sh`) or a test, each such file's own growth is inside its class budget, and the run's
// NET per-tree growth is inside it too (DIRECT_BUDGETS). `--raise --cite direct` is refused —
// only --reconcile sees a whole run, and the budget is a property of the run. D15 carries the
// derivation of both numbers.
//
// Inventory is `git ls-files` over the three roots (D1) — never an fs walk with an ignore
// list, never a name-shape/extension filter. Untracked files never count (AC-8). Trees:
// spec/scripts (everything under it except lib/), spec/scripts/lib, scripts, tests.
//
// Deliberately does NOT: write the baseline except via --update/--raise/--reconcile, allow
// --update against an existing baseline to raise anything (D3), allow --raise/--reconcile to
// lower a ceiling, accept a free-form raise reason (D4/D8 both require --cite; D15's `direct` is
// a fixed literal with a measured bound, not a reason string), accept `--cite direct` on --raise
// or on a check, accept a raise target that is neither a tracked file nor an already-baselined
// path, classify a budget-class member by anything but its path, or lift --reconcile's tracked-but-missing refusal (D9 — a missing file is a broken
// checkout, not a growth to baseline).
//
// Exit codes: 0 tight & under (check) or refusal-free write (update/raise/reconcile) ·
//             1 findings (check) or refused (update/reconcile: a tracked file missing from
//               disk; update also refuses over/tree-over/new-over-cap against an existing
//               baseline, which reconcile lifts into raises[] instead) ·
//             2 bad invocation (missing --root, unreadable/malformed-shape baseline,
//               --update/--raise/--reconcile combined with one another or with --json, --raise
//               without --to/--cite, --reconcile without --cite, a stray --to alongside
//               --reconcile (--reconcile never reads --to — every ceiling comes from actual),
//               --to/--cite without --raise or --reconcile, a non-integer --to,
//               bad/missing/nonexistent --cite, `--cite direct` outside --reconcile, a
//               --reconcile --cite direct whose growth leaves the D15 class or byte budget, a
//               --raise --to below the current ceiling, a
//               --raise target that is neither tracked nor already baselined, unknown flag)
//
// specs/20260908/04-duplicate-window-ratchet.md D9: the synchronous fd writer is imported from
// spec/scripts/lib/driver-io.js rather than carried locally, so this script and
// scripts/dup-windows.js stop duplicating it.

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const io = require(path.join(__dirname, '..', 'spec', 'scripts', 'lib', 'driver-io.js'))

const TREES = ['spec/scripts', 'spec/scripts/lib', 'scripts', 'tests']
const CITE_RE = /^specs\/\d{8}\/\d{2}-/
// D15: the one cite that is a literal rather than a path, admissible on --reconcile only.
const DIRECT_CITE = 'direct'
// Net growth one `--cite direct` run may take, per budget class — D15 derives both numbers from
// the recorded raise distribution: each sits below the median spec-cited raise for its class, so
// growth an ordinary spec would carry cannot fit through this door.
const DIRECT_BUDGETS = { code: 2048, tests: 4096 }
// A shell gate is the D15 file class alongside tests — matched by path, never by intent.
const GATE_FILE_RE = /\.sh$/

function writeOut(str) { io.writeOut(1, str) }
function writeErr(str) { io.writeOut(2, str) }

function fail(msg) {
  writeErr('size-ratchet: ' + msg + '\n')
  process.exit(2)
}

function parseArgs(argv) {
  const args = { root: null, baseline: null, json: false, update: false, raise: null, to: null, cite: null, reconcile: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    switch (a) {
      case '--root': args.root = argv[++i]; break
      case '--baseline': args.baseline = argv[++i]; break
      case '--json': args.json = true; break
      case '--update': args.update = true; break
      case '--raise': args.raise = argv[++i]; break
      case '--to': args.to = argv[++i]; break
      case '--cite': args.cite = argv[++i]; break
      case '--reconcile': args.reconcile = true; break
      default: fail('unknown flag ' + a + ' — usage: size-ratchet.js --root <dir> [--baseline <file>] [--json] | --update | --raise <path|tree> --to <bytes> --cite <spec path> | --reconcile --cite <spec path>|direct')
    }
  }
  if (!args.root) fail('missing --root — usage: size-ratchet.js --root <dir> [--baseline <file>] [--json]')
  const modes = [args.update, args.raise !== null, args.reconcile].filter(Boolean).length
  if (modes > 1) fail('--update, --raise, and --reconcile are mutually exclusive')
  if ((args.update || args.raise !== null || args.reconcile) && args.json) {
    fail('--json is not compatible with --update, --raise, or --reconcile')
  }
  if (args.raise === null && !args.reconcile && (args.to !== null || args.cite !== null)) {
    fail('--to/--cite require --raise — usage: size-ratchet.js --root <dir> --raise <path|tree> --to <bytes> --cite <spec path>')
  }
  // F3 (review, build-repair): --to is meaningless under --reconcile — every ceiling is derived
  // from the tracked file's actual byte count, never from a caller-supplied --to — so a stray
  // --to alongside --reconcile is a bad invocation, not a silently-accepted no-op flag.
  if (args.reconcile && args.to !== null) {
    fail('--to is not compatible with --reconcile — --reconcile derives every ceiling from actual, never ' +
      'from --to; drop --to')
  }
  return args
}

// D8's --cite validation reuses exactly what --raise already demands: shape, then existence.
// The "is --cite even present" requirement stays with each caller, since --raise and --reconcile
// word that requirement differently ("--raise requires --cite" vs "--reconcile requires --cite").
function validateCiteShapeAndExistence(root, cite) {
  if (cite === DIRECT_CITE) return
  if (!CITE_RE.test(cite)) fail('--cite must match ^specs/\\d{8}/\\d{2}- , got ' + cite)
  const citePath = path.join(root, cite)
  if (!fs.existsSync(citePath)) fail('--cite names a file that does not exist: ' + cite)
}

// D15's budget class for any tracked path or tree key. `tests` is its own class because
// core.md § Incident Policy requires a behavioral test with every incident fix: charging the
// mandated test against the same budget as the fix would price the doctrine out of the door
// built for it.
function budgetClassFor(rel) {
  return (rel === 'tests' || rel.startsWith('tests/')) ? 'tests' : 'code'
}

// D15: refuse a `--cite direct` reconcile whose growth leaves the class or the byte budget.
// Refusal is exit 2 with the baseline untouched (D5's cite bucket) and names the spec-cite
// route, because that is always the remedy — the door is narrow by design, not broken.
//
// The class and per-file tests read the TRUE growth set (every tracked file whose actual byte
// count exceeds its recorded ceiling, plus every tracked file absent from the baseline), not
// the finding list: a new file under `newFileCap` and a file whose growth is offset by a
// shrink elsewhere both raise no file finding at all, and either would otherwise carry
// unbudgeted, out-of-class growth through this door. The byte budget is then the NET per-tree
// growth the findings record, which is what the baseline's own tree ceilings actually move by.
function enforceDirectBudget(root, baseline, actualSize, findings) {
  const files = baseline.files || {}
  const grown = []
  for (const rel of Object.keys(actualSize)) {
    const had = Object.prototype.hasOwnProperty.call(files, rel)
    const ceiling = had ? files[rel] : 0
    if (!had || actualSize[rel] > ceiling) grown.push({ path: rel, from: ceiling, to: actualSize[rel] })
  }

  const offClass = grown.filter((g) => budgetClassFor(g.path) !== 'tests' && !GATE_FILE_RE.test(g.path))
  if (offClass.length > 0) {
    fail('--cite direct admits growth only in shell gates (*.sh) and tests/ — ' +
      offClass.map((g) => g.path).join(', ') + ' ' + (offClass.length === 1 ? 'is' : 'are') +
      ' neither; raise ' + (offClass.length === 1 ? 'it' : 'them') + ' with --cite <spec path> instead')
  }

  for (const g of grown) {
    const cls = budgetClassFor(g.path)
    const delta = g.to - g.from
    if (delta > DIRECT_BUDGETS[cls]) {
      fail('--cite direct allows ' + DIRECT_BUDGETS[cls] + ' bytes per ' + cls + ' file — ' + g.path +
        ' grew ' + delta + ' (' + g.from + ' -> ' + g.to + '); raise it with --cite <spec path> instead')
    }
  }

  const spend = { code: 0, tests: 0 }
  for (const f of findings) {
    if (f.kind !== 'tree-over') continue
    spend[budgetClassFor(f.path)] += f.actual - f.ceiling
  }
  for (const cls of Object.keys(DIRECT_BUDGETS)) {
    if (spend[cls] > DIRECT_BUDGETS[cls]) {
      fail('--cite direct allows ' + DIRECT_BUDGETS[cls] + ' bytes of net ' + cls + ' growth per run — ' +
        'this run grows ' + spend[cls] + '; split it, or raise it with --cite <spec path> instead')
    }
  }
}

// Classify a repo-relative path into one of the tracked trees, or null.
function treeFor(rel) {
  if (rel === 'spec/scripts' || rel.startsWith('spec/scripts/')) {
    if (rel === 'spec/scripts/lib' || rel.startsWith('spec/scripts/lib/')) return 'spec/scripts/lib'
    return 'spec/scripts'
  }
  if (rel === 'scripts' || rel.startsWith('scripts/')) return 'scripts'
  if (rel === 'tests' || rel.startsWith('tests/')) return 'tests'
  return null
}

function listTracked(root) {
  let out
  try {
    out = execFileSync('git', ['-C', root, 'ls-files', '-z', '--', 'spec/scripts', 'scripts', 'tests'],
      { encoding: 'utf8' })
  } catch (e) {
    fail('git ls-files failed under --root ' + root + ' — is it a git repo? (' + (e.message || e) + ')')
  }
  return out.split('\0').filter(Boolean)
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function readBaseline(baselinePath) {
  let raw
  try {
    raw = fs.readFileSync(baselinePath, 'utf8')
  } catch (e) {
    fail('cannot read baseline ' + baselinePath + ' — seed it with: node scripts/size-ratchet.js --root <dir> --update (' + (e.message || e) + ')')
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    fail('baseline ' + baselinePath + ' is not valid JSON — ' + (e.message || e))
  }
  if (!isPlainObject(parsed)) {
    fail('baseline ' + baselinePath + ' must be a JSON object')
  }
  if (typeof parsed.newFileCap !== 'number') {
    fail('baseline ' + baselinePath + ' is missing a numeric newFileCap — seed it with: node scripts/size-ratchet.js --root <dir> --update')
  }
  if (!isPlainObject(parsed.files)) {
    fail('baseline ' + baselinePath + ' is missing a files object — seed it with: node scripts/size-ratchet.js --root <dir> --update')
  }
  if (!isPlainObject(parsed.trees)) {
    fail('baseline ' + baselinePath + ' is missing a trees object — seed it with: node scripts/size-ratchet.js --root <dir> --update')
  }
  return parsed
}

function writeBaseline(baselinePath, baseline) {
  const sorted = {
    newFileCap: baseline.newFileCap,
    trees: sortKeys(baseline.trees || {}),
    files: sortKeys(baseline.files || {}),
    raises: baseline.raises || []
  }
  fs.writeFileSync(baselinePath, JSON.stringify(sorted, null, 2) + '\n')
}

function sortKeys(obj) {
  const out = {}
  for (const k of Object.keys(obj).sort()) out[k] = obj[k]
  return out
}

// Compute findings + actual sizes/sums against a live tracked inventory. Never mutates.
function evaluate(root, baseline) {
  const tracked = listTracked(root)
  const actualSize = {}
  const treeSum = {}
  for (const t of TREES) treeSum[t] = 0
  const files = baseline.files || {}
  const trees = baseline.trees || {}
  const newFileCap = baseline.newFileCap

  const missingTracked = []
  for (const rel of tracked) {
    const tree = treeFor(rel)
    if (!tree) continue
    let size
    try {
      size = fs.statSync(path.join(root, rel)).size
    } catch {
      // git ls-files still reports this path — it is tracked, not deleted. It stays out of
      // actualSize/treeSum (so check mode reports it as `stale` with actual 0, same as any
      // other file short of its ceiling) but --update must refuse rather than treat this as
      // the genuinely-untracked case and quietly drop it from the budget (D1).
      missingTracked.push(rel)
      continue
    }
    actualSize[rel] = size
    treeSum[tree] += size
  }

  const findings = []
  const trackedSet = new Set(tracked)

  // Per-file: over, stale, new-over-cap.
  for (const rel of Object.keys(files)) {
    const ceiling = files[rel]
    const actual = trackedSet.has(rel) ? (actualSize[rel] || 0) : 0
    if (!trackedSet.has(rel)) {
      findings.push({ kind: 'stale', path: rel, actual: 0, ceiling })
    } else if (actual > ceiling) {
      findings.push({ kind: 'over', path: rel, actual, ceiling })
    } else if (actual < ceiling) {
      findings.push({ kind: 'stale', path: rel, actual, ceiling })
    }
  }
  for (const rel of Object.keys(actualSize)) {
    if (Object.prototype.hasOwnProperty.call(files, rel)) continue
    const actual = actualSize[rel]
    if (actual > newFileCap) {
      findings.push({ kind: 'new-over-cap', path: rel, actual, ceiling: newFileCap })
    }
  }

  // Per-tree: true sum vs ceiling, in both directions — a ceiling above the sum is stale
  // slack that must ratchet down just like a stale file ceiling (D2: "every tree ceiling
  // equals its tree sum"), and a ceiling below the sum is tree-over (the anti-split rule).
  for (const t of TREES) {
    const ceiling = trees[t]
    if (typeof ceiling !== 'number') continue
    const actual = treeSum[t]
    if (actual > ceiling) {
      findings.push({ kind: 'tree-over', path: t, actual, ceiling })
    } else if (actual < ceiling) {
      findings.push({ kind: 'stale', path: t, actual, ceiling })
    }
  }

  return { tracked, actualSize, treeSum, findings, missingTracked }
}

function remedyFor(finding) {
  if (finding.kind === 'stale') return '--update'
  return '--raise ' + finding.path + ' --to ' + finding.actual + ' --cite <spec>'
}

function printFindingLine(root, finding) {
  const remedyCmd = 'node scripts/size-ratchet.js --root . ' + remedyFor(finding)
  let line
  switch (finding.kind) {
    case 'over':
      line = 'size-ratchet: over      ' + finding.path + ' ' + finding.actual + ' > ' + finding.ceiling +
        ' — shrink it, or: ' + remedyCmd
      break
    case 'stale':
      line = 'size-ratchet: stale     ' + finding.path + ' ' + finding.actual + ' < ' + finding.ceiling +
        ' — run: ' + remedyCmd
      break
    case 'new-over-cap':
      line = 'size-ratchet: new-over-cap ' + finding.path + ' ' + finding.actual + ' > ' + finding.ceiling +
        ' — split it, or: ' + remedyCmd
      break
    case 'tree-over':
      line = 'size-ratchet: tree-over ' + finding.path + ' ' + finding.actual + ' > ' + finding.ceiling +
        ' — cut ' + (finding.actual - finding.ceiling) + ' bytes under ' + finding.path + '/, or: ' + remedyCmd
      break
    default:
      line = 'size-ratchet: ' + finding.kind + ' ' + finding.path
  }
  writeErr(line + '\n')
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const root = path.resolve(args.root)
  const baselinePath = args.baseline ? path.resolve(args.baseline) : path.join(root, 'size-baseline.json')

  // D8/D13: --update is the seeding command. An absent baseline under --update is not the
  // unreadable-baseline usage error (that's reserved for check/--raise, and for a baseline
  // file that exists but is malformed) — it is the empty starting point --update fills in.
  if (args.update && !fs.existsSync(baselinePath)) {
    return doUpdate(root, baselinePath, { newFileCap: 40000, trees: {}, files: {}, raises: [] }, true)
  }

  const baseline = readBaseline(baselinePath)

  if (args.raise !== null) {
    return doRaise(root, baselinePath, baseline, args)
  }
  if (args.update) {
    return doUpdate(root, baselinePath, baseline)
  }
  if (args.reconcile) {
    return doReconcile(root, baselinePath, baseline, args)
  }
  return doCheck(root, baseline, args)
}

function doCheck(root, baseline, args) {
  const { findings, actualSize, treeSum } = evaluate(root, baseline)
  if (findings.length === 0) {
    const fileCount = Object.keys(baseline.files || {}).length
    const treeCount = TREES.length
    if (args.json) {
      writeOut(JSON.stringify({ ok: true, files: fileCount, trees: treeCount, findings: [] }) + '\n')
    } else {
      writeOut('size-ratchet: ' + fileCount + ' files, ' + treeCount + ' trees, all tight\n')
    }
    process.exit(0)
  }
  if (args.json) {
    writeOut(JSON.stringify({ ok: false, files: Object.keys(actualSize).length, trees: TREES.length, findings }) + '\n')
  } else {
    for (const f of findings) printFindingLine(root, f)
  }
  process.exit(1)
}

function doUpdate(root, baselinePath, baseline, isSeed) {
  const { tracked, actualSize, findings, missingTracked } = evaluate(root, baseline)
  // A path git ls-files still reports is tracked, not deleted — --update must not drop it
  // from the budget or lower a tree ceiling on the strength of its absence (D1).
  if (missingTracked.length > 0) {
    for (const rel of missingTracked) {
      writeErr('size-ratchet: ' + rel + ' is tracked but missing from disk — restore it or `git rm` it before --update can run\n')
    }
    process.exit(1)
  }
  // D13: a from-scratch seed (no baseline file present) writes every tracked file at its
  // actual size and cannot be refused by new-over-cap — "new" means absent from an EXISTING
  // baseline, and there is no existing baseline yet. `over`/`stale` cannot arise either
  // (there are no recorded file ceilings to compare against) and `tree-over` cannot arise
  // (there are no recorded tree ceilings) — both are structurally impossible on an empty
  // baseline, so the only kind that could wrongly block a seed is new-over-cap; it is
  // excluded here rather than "cannot arise" being left unenforced by construction alone.
  const blocking = findings.filter(f =>
    f.kind === 'over' || f.kind === 'tree-over' || (!isSeed && f.kind === 'new-over-cap'))
  if (blocking.length > 0) {
    for (const f of blocking) printFindingLine(root, f)
    writeErr('size-ratchet: --update refused — shrink the above first, or --raise --cite a spec\n')
    process.exit(1)
  }

  const newFiles = {}
  for (const rel of Object.keys(actualSize)) {
    const tree = treeFor(rel)
    if (!tree) continue
    newFiles[rel] = actualSize[rel]
  }
  // newFiles holds only currently-tracked paths, so untracked baseline entries are absent here.
  const newTrees = {}
  for (const t of TREES) {
    let sum = 0
    for (const rel of Object.keys(newFiles)) {
      if (treeFor(rel) === t) sum += newFiles[rel]
    }
    newTrees[t] = sum
  }

  const updated = {
    newFileCap: baseline.newFileCap,
    trees: newTrees,
    files: newFiles,
    raises: baseline.raises || []
  }
  writeBaseline(baselinePath, updated)
  process.exit(0)
}

// D8/D9: --reconcile is --update's own pass (every tracked file's and tree's ceiling set to its
// actual byte count) with the over/tree-over/new-over-cap refusal replaced by one raises[] entry
// per lifted finding, in evaluate()'s own finding order — `from` is the finding's own recorded
// ceiling (0 for new-over-cap, which by definition has none). The tracked-but-missing refusal
// (D9) is untouched: it still exits 1 and writes nothing, exactly like --update.
function doReconcile(root, baselinePath, baseline, args) {
  if (args.cite === null) fail('--reconcile requires --cite <spec path>')
  validateCiteShapeAndExistence(root, args.cite)

  const { actualSize, findings, missingTracked } = evaluate(root, baseline)
  if (missingTracked.length > 0) {
    for (const rel of missingTracked) {
      writeErr('size-ratchet: ' + rel + ' is tracked but missing from disk — restore it or `git rm` it before --reconcile can run\n')
    }
    process.exit(1)
  }

  const newFiles = {}
  for (const rel of Object.keys(actualSize)) {
    const tree = treeFor(rel)
    if (!tree) continue
    newFiles[rel] = actualSize[rel]
  }
  const newTrees = {}
  for (const t of TREES) {
    let sum = 0
    for (const rel of Object.keys(newFiles)) {
      if (treeFor(rel) === t) sum += newFiles[rel]
    }
    newTrees[t] = sum
  }

  if (args.cite === DIRECT_CITE) enforceDirectBudget(root, baseline, actualSize, findings)

  const liftable = findings.filter((f) => f.kind === 'over' || f.kind === 'tree-over' || f.kind === 'new-over-cap')
  const raises = (baseline.raises || []).slice()
  const appended = []
  for (const f of liftable) {
    const from = f.kind === 'new-over-cap' ? 0 : f.ceiling
    const entry = { path: f.path, from, to: f.actual, cite: args.cite }
    raises.push(entry)
    appended.push(entry)
  }

  const updated = { newFileCap: baseline.newFileCap, trees: newTrees, files: newFiles, raises }
  writeBaseline(baselinePath, updated)

  for (const e of appended) {
    writeOut('size-ratchet: reconciled ' + e.path + ' ' + e.from + ' -> ' + e.to + '\n')
  }
  writeOut('size-ratchet: reconciled ' + appended.length + ' raises, ' + Object.keys(newFiles).length +
    ' files, ' + TREES.length + ' trees\n')
  process.exit(0)
}

function doRaise(root, baselinePath, baseline, args) {
  if (args.to === null) fail('--raise requires --to <bytes>')
  if (args.cite === null) fail('--raise requires --cite <spec path>')
  // D15 is a property of a whole run, and only --reconcile sees one: a single --raise names one
  // ceiling with a caller-supplied --to, so there is nothing for the budget to measure.
  if (args.cite === DIRECT_CITE) {
    fail("--cite direct is accepted on --reconcile only — it is bounded by a whole run's measured " +
      'growth, which a single --raise cannot supply; use --reconcile --cite direct, or --raise --cite <spec path>')
  }
  const toNum = Number(args.to)
  if (!Number.isFinite(toNum) || !Number.isInteger(toNum) || toNum < 0) {
    fail('--to must be a non-negative integer byte count, got ' + args.to)
  }
  validateCiteShapeAndExistence(root, args.cite)

  const target = args.raise
  const isTree = TREES.includes(target)
  const bucket = isTree ? (baseline.trees || {}) : (baseline.files || {})
  const known = isTree || Object.prototype.hasOwnProperty.call(bucket, target) || listTracked(root).includes(target)
  if (!known) {
    fail('--raise target ' + target + ' is neither a tracked file nor an already-baselined path')
  }
  const from = Object.prototype.hasOwnProperty.call(bucket, target) ? bucket[target] : 0
  if (toNum < from) {
    fail('--raise cannot lower a ceiling — ' + target + ' is currently ' + from + ', --to ' + toNum + ' is below it')
  }
  bucket[target] = toNum

  const raises = (baseline.raises || []).slice()
  raises.push({ path: target, from, to: toNum, cite: args.cite })

  const updated = {
    newFileCap: baseline.newFileCap,
    trees: isTree ? bucket : (baseline.trees || {}),
    files: isTree ? (baseline.files || {}) : bucket,
    raises
  }
  writeBaseline(baselinePath, updated)
  process.exit(0)
}

main()
