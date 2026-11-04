#!/usr/bin/env node
// Deterministic state-machine driver for the build stage.
//
// spec-build-driver <spec.md>                          -> print current state + ONLY that step
// spec-build-driver <spec.md> --mark <mark> [args]     -> verify artifacts, record, print next step
//   marks: tests-authored | red-attributed |
//          wave-done --wave <label> --workers <n> | integrated |
//          repair-applied --continued <n> --spawned <n> | escalate-choice <re-arm|cold|park|amend> | committed |
//          replayed | looked
//            (the last two apply only to a `prototype:` spec at REPLAY)
// spec-build-driver <spec.md> --state                  -> print the state name only (scripting)
//
// Owner: specs/20261007/03-plan-cites-the-build-replays-and-status-derives-the-delete.md
//
// EXECUTES every deterministic step itself (admission, wave derivation, gate resolution, env
// preflight, the hardened->implementing flip, red-check, the final gate, scope-reconcile, diff
// counts, the stage:"build" ledger row) and prints ONLY the step that needs this session's
// judgment (test-author dispatch, red attribution, per-wave worker dispatch, host integration,
// repair dispatch, the checkpoint commit). State is re-derived from spec frontmatter + the
// <spec>.build/ sidecar + on-disk artifacts on EVERY invocation — a mark whose artifact vanished
// is demanded again.
//
// States: PREFLIGHT (driver-only) -> TESTS -> RED_CHECK (driver-only) -> RED_FINDINGS? ->
//   RED_ATTRIBUTION? -> WAVE:<label>... -> INTEGRATION -> GATE (driver-only) -> REPAIR? (cap 3;
//   4th -> ESCALATE, terminal) -> REPLAY? (prototype: spec only, after a green gate) -> COMMIT ->
//   DONE (terminal)
//
// REPLAY: a spec whose frontmatter carries `prototype: <stem>` AND whose File Plan owns the host's
// `prototype.e2eFile` (`{stem}` substituted) gains REPLAY after a green gate; sibling slices go
// straight to COMMIT and record `replay: {owner: false}`. The step prints `prototype.bootCommand`
// (else `runtime.bootCommand`); `--mark replayed` copies the contract's test file to e2eFile, runs
// `prototype.e2eRun` with `PROTO_URL` set, and on green writes `<spec>.build/replay-state.json` and
// prints the look stop; `--mark looked` (on the user's literal `close enough`) advances to COMMIT.
// When `prototype.url` carries `{port}` one replay port lives in `<spec>.build/replay-port.json`.
//
// A `baseline`-layer File Plan row (a screenshot baseline, a golden file) is no tests-layer row and
// no wave owns it; `--mark integrated` refuses while one is missing.
//
// The optional `postGateCommand` config key is chained into the ONE gate child after the scoped
// gate (`<gate> && echo '== postGateCommand' && <post>`); `{testCommand}` inside it substitutes the
// config's testCommand. The optional `orchestratorOnly` key (array of path globs) keeps matching
// File Plan paths out of every worker's file list.
//
// The DONE row records `via: "loop"` (set once at sidecar creation) and `model` (lib/session-stamp.js
// sessionModel at row-write time, null without a stamp).
//
// Worker git ban: every step-print and --mark invocation (never --state) writes or removes
// <private git dir>/spec-wave-open to match the derived state — a file write, not a git operation.
//
// What this deliberately does NOT do: dispatch any agent, write the Decisions table, render a
// user-facing report, or make any git write beyond one — the intent-to-add (`git add -N`) of
// untracked, non-ignored File Plan paths immediately before the gate child spawns (ADR-0015). It
// never accepts an "unsanctioned green" itself; the sanction stays in the spec's own carriers
// (`[pre-green:]`, `SHALL CONTINUE TO`) that red-check reads. It never creates, enters, or leaves a
// worktree.
//
// Exit codes: 0 = step printed / mark accepted / --state printed
//             2 = precondition failure or refused mark (stderr names the artifact + remedy;
//                 state unchanged) — includes a malformed `orchestratorOnly` key, env-preflight
//                 exit non-zero (output printed verbatim), red-check exit 2, an unresolved gate,
//                 a fourth repair-applied past the 3-round cap (touches <spec>.build/gate-cap), a
//                 mark issued at a state that does not print it, a wrapped child dying with no
//                 exit code (lib/driver-io.js runChild), a re-run on a status: implementing spec
//                 with no sidecar whose build is already DONE (remedy = the review driver), a
//                 non-zero exit from the intent-to-add staging, `--mark replayed` refusals (no
//                 `tests.file` in contract.json, undeclared `prototype.e2eRun` or `prototype.url`,
//                 a missing contract test file, e2eRun red — no replay-state.json written),
//                 `--mark looked` before a green replay, and a failed replay-port allocation.

'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { runChild, runHost, writeOut, appendLedger, loadSidecar, saveSidecar: saveSidecarLib } = require('./lib/driver-io')
// Delegated stops (pending-question contract): in a child
// session an ask is written to .claude/pending-question.json instead of printed.
const pq = require('./pending-question.js')
const { fmValue } = require('./lib/frontmatter')
const { readConfig, readPipelineRules, agentCall, CONFIG_RELPATH } = require('./lib/host-config')
const { resolveGate } = require('./lib/gate-resolve')
const { parseFilePlanRows, isTestsRow } = require('./lib/file-plan')
const { globMatch } = require('./lib/glob-match')
// model is derived at row-write time (never once at
// startup) — the review driver's own sibling reasoning applies here too.
const { sessionModel, sessionUsage, usageDelta } = require('./lib/session-stamp.js')
const { CLASS_ID_RE } = require('./lib/escape-row')
const { extractSection } = require('./lib/spec-sections')
const { failCount } = require('./lib/gate-fail-count')
const appPortLib = require('./lib/app-port')
const { printable } = require('./lib/host-run')

function die(msg) { process.stderr.write('spec-build-driver: ' + msg + '\n'); process.exit(2) }

const argv = process.argv.slice(2)
const specPath = argv[0]
if (!specPath || specPath.startsWith('--')) {
  die('usage: spec-build-driver <spec.md> [--mark <mark> [args...]] [--state]')
}
if (!fs.existsSync(specPath)) die('spec not found: ' + specPath)

const flag = (name) => { const i = argv.indexOf(name); return i > -1 ? argv[i + 1] : null }
const markIdx = argv.indexOf('--mark')
const MARK = markIdx > -1 ? argv[markIdx + 1] : null
// `--state` is the scripting flag of a bare (no --mark) invocation only, so a marked invocation's
// own argv can never be mistaken for it.
const STATE_ONLY = !MARK && argv.includes('--state')

const PLUGIN = path.resolve(__dirname, '..')
const redCheckBin = path.join(PLUGIN, 'scripts/red-check.js')
const envPreflightBin = path.join(PLUGIN, 'scripts/env-preflight.js')
const scopeReconcileBin = path.join(PLUGIN, 'scripts/scope-reconcile.js')
const specStatusBin = path.join(PLUGIN, 'scripts/spec-status.js')

// Mirrors spec-review-driver.js: repoRoot is the driver's INHERITED CWD, never derived
// from the spec's own path.
const repoRootResult = runChild('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' },
  'git rev-parse --show-toplevel')
if (repoRootResult.status !== 0) {
  die('not inside a git repo (git rev-parse --show-toplevel failed against ' + process.cwd() +
    ') — run this from inside the build root/worktree')
}
const repoRoot = repoRootResult.stdout.trim()

const resolvedSpecPath = path.resolve(specPath)
let specText = fs.readFileSync(resolvedSpecPath, 'utf8')
const fmVal = (k) => fmValue(specText, k)

let status = fmVal('status')
const tier = fmVal('tier') || 'standard'
// A spec
// stamped `prototype: <stem>` gains the REPLAY state; `lane:` is never read.
const protoStem = fmVal('prototype') || null
const specRel = path.relative(repoRoot, resolvedSpecPath) || resolvedSpecPath
const sidecarDir = resolvedSpecPath.replace(/\.md$/, '.build')
const sidecarRel = path.relative(repoRoot, sidecarDir)
const deviationsPath = resolvedSpecPath.replace(/\.md$/, '.deviations.md')
const gateCapPath = path.join(sidecarDir, 'gate-cap')
const hostConfig = readConfig(repoRoot)
const orchestratorOnly = (() => {
  const v = hostConfig.orchestratorOnly
  if (v === undefined) return []
  if (!Array.isArray(v) || !v.every((g) => typeof g === 'string')) {
    die('orchestratorOnly in ' + CONFIG_RELPATH + ' must be an array of path globs (got ' +
      JSON.stringify(v) + ') — fix it, or remove the key to route every row by layer')
  }
  return v
})()
const isOrchestratorOnly = (p) => orchestratorOnly.some((g) => globMatch(g, p))
const pipelineRules = readPipelineRules(repoRoot, hostConfig)
const pipelineRulesPath = pipelineRules.ok ? pipelineRules.abs : null

// File Plan body text never moves when only the frontmatter is edited (stamping diff_base,
// flipping status) — computed once against the pre-image text.
const filePlanRows = parseFilePlanRows(specText)
// The host's prototype.e2eFile with {stem} substituted — the one File Plan row the driver writes
// itself; its presence makes this spec the contract's replay owner. null when absent.
const replayFile = (() => {
  if (!protoStem) return null
  const f = hostConfig.prototype && hostConfig.prototype.e2eFile
  return (typeof f === 'string' && f) ? f.split('{stem}').join(protoStem) : null
})()
const isReplayRow = (r) => replayFile !== null && r.paths.includes(replayFile)
const replayOwner = !!protoStem && (replayFile === null || filePlanRows.some(isReplayRow))
const isBaselineRow = (r) => /^baselines?$/i.test((r.layer || '').trim())
const baselinePaths = filePlanRows
  .filter((r) => isBaselineRow(r) && (r.action || '').trim().toUpperCase() !== 'DELETE')
  .flatMap((r) => r.paths)
const hasTestsRows = filePlanRows.some((r) => isTestsRow(r))
const needsRedAttribution = filePlanRows.some((r) =>
  !isTestsRow(r) && !isBaselineRow(r) && !isReplayRow(r) && (r.action || '').trim().toUpperCase() === 'CREATE')

// ---- admission ------------------------------------------------------------------------------
const OWNING_COMMAND = { draft: '/spec:plan', done: '/spec:status', superseded: '/spec:status' }
if (status !== 'hardened' && status !== 'implementing') {
  die('spec status is "' + (status || '<missing>') + '" — spec-build-driver requires status: ' +
    'hardened (or implementing to resume); ' + (OWNING_COMMAND[status] || '/spec:status') +
    ' is the owning command')
}

const sidecarExisted = fs.existsSync(sidecarDir)

// ---- build already DONE ----------------------------------------------------------------------
// A stage:"build" ledger row is written only at DONE, so its presence for this spec tells "finished
// build, review not opened yet" apart from a fresh spec. Refused on BOTH admission branches, before
// any write: a reverted `hardened` spec with a build row would otherwise re-stamp diff_base at the
// current HEAD and rebuild blind.
if (!sidecarExisted) {
  const doneRow = ledgerBuildRow(repoRoot, specRel)
  if (doneRow && status === 'hardened') {
    die('build already DONE for ' + specRel + ' (ledger row ' + doneRow.runId + ', ' + doneRow.ts +
      ') but the spec reads status: hardened — its closed state was reverted, not never built. ' +
      'Restore it: `git log -S\'status: done\' -- ' + specRel + '` names the close commit, then ' +
      '`git checkout <sha> -- ' + specRel + '`. A deliberate from-scratch rebuild is a new spec — ' +
      'mark this one superseded instead')
  }
  if (doneRow) {
    die('build already DONE for ' + specRel + ' (ledger row ' + doneRow.runId + ', ' + doneRow.ts +
      ') — run the review driver: node ' + path.join(PLUGIN, 'scripts/spec-review-driver.js') + ' ' +
      specPath)
  }
}

// ---- PREFLIGHT (driver-only) — every invocation, not only the hardened flip ----------------
// A resume can land in a re-created worktree whose env differs; side-effect free, so rerunning costs nothing.
const pre = runChild(process.execPath, [envPreflightBin, '--root', repoRoot], { encoding: 'utf8' },
  'env-preflight.js')
if (pre.status !== 0) {
  if (pre.stdout) writeOut(1, pre.stdout)
  if (pre.stderr) process.stderr.write(pre.stderr)
  process.exit(2)
}

let justFlipped = false
if (status === 'hardened') {
  // ---- stamp diff_base whenever it is absent ---
  // HEAD at build start is the true pre-image, pinned even when build_base (a moving ref like
  // `main`, meaning only "merge target") is present.
  const diffBaseFm = fmVal('diff_base')
  if (!diffBaseFm) {
    const headR = runChild('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' },
      'git rev-parse HEAD')
    const sha = (headR.stdout || '').trim()
    if (headR.status !== 0 || !/^[0-9a-f]{40}$/.test(sha)) {
      die('git rev-parse HEAD in ' + repoRoot + ' did not print a 40-hex commit sha')
    }
    const m = /^---\n([\s\S]*?)\n---/.exec(specText)
    if (m) {
      const lines = m[1].split('\n')
      lines.push('diff_base: ' + sha)
      specText = specText.slice(0, m.index) + '---\n' + lines.join('\n') + '\n---' +
        specText.slice(m.index + m[0].length)
    }
  }
  specText = specText.replace(/^status:\s*.*$/m, 'status: implementing')
  fs.writeFileSync(resolvedSpecPath, specText)
  status = 'implementing'
  justFlipped = true
}

// ---- base derivation (order from lib/base-derivation.js; validity is this driver's own) --------
// A pin always beats a ref. The validity predicate here is ANCESTRY, not non-degeneracy: at build
// start base === HEAD is correct, while a base that is not an ancestor of HEAD (an advanced `main`)
// would report edits this build never made.
const { pinnedBaseCandidates } = require('./lib/base-derivation')
let baseAncestryChecked = false
function resolveBase() {
  const cands = pinnedBaseCandidates(fmVal)
  if (!cands.length) {
    die('spec frontmatter carries neither diff_base nor build_base — add one to the spec ' +
      'frontmatter to resume')
  }
  const { key, value } = cands[0]
  // Validate once per process: every caller shares one spec and one HEAD, and the check shells out.
  if (!baseAncestryChecked) {
    baseAncestryChecked = true
    const verify = runChild('git', ['-C', repoRoot, 'rev-parse', '--verify', value + '^{commit}'],
      { encoding: 'utf8' }, 'git rev-parse --verify (base resolution)')
    const sha = (verify.stdout || '').trim()
    if (verify.status !== 0 || !/^[0-9a-f]{40}$/.test(sha)) {
      die('the spec\'s base (' + key + ': ' + value + ') does not resolve to a commit in ' +
        repoRoot + ' — set diff_base: <the commit this build started from> in the spec ' +
        'frontmatter (git rev-parse --verify <ref>^{commit} to check one)')
    }
    const head = runChild('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' },
      'git rev-parse HEAD').stdout.trim()
    const anc = runChild('git', ['-C', repoRoot, 'merge-base', '--is-ancestor', sha, head],
      { encoding: 'utf8' }, 'git merge-base --is-ancestor (base ancestry check)')
    if (anc.status !== 0) {
      die('the spec\'s base (' + key + ': ' + value + ' -> ' + sha.slice(0, 12) + ') is not an ' +
        'ancestor of HEAD (' + head.slice(0, 12) + ') — it names a branch that has advanced past ' +
        'this build, so `git diff <base>` would report edits this build never made and red-check ' +
        'would refuse over files it does not own. Remedy: set diff_base: <the commit this build ' +
        'started from> in the spec frontmatter, or delete a build_base: line that names a branch ' +
        'rather than a sha')
    }
  }
  return value
}

// ---- resume without a sidecar --------------------
// A status: implementing spec with no <spec>.build/ (a cold resume with landed, uncommitted work)
// cannot run red-check on the post-image tree; the skip is recorded on the row instead.
// changedSinceBase is the ONE "differs from base" predicate on this side — tracked edits since
// `base` union every untracked path, the same set red-check.js computes for its purity refusal.
function changedSinceBase(base) {
  const trackedR = runChild('git', ['-C', repoRoot, 'diff', '--name-only', base], { encoding: 'utf8' },
    'git diff --name-only')
  const tracked = (trackedR.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean)
  const statusR = runChild('git', ['-C', repoRoot, 'status', '--porcelain', '--untracked-files=all'],
    { encoding: 'utf8' }, 'git status --porcelain')
  const untracked = (statusR.stdout || '').split('\n').map((s) => s.trim())
    .filter((l) => l.startsWith('??')).map((l) => l.replace(/^\?\?\s+/, ''))
  return new Set([...tracked, ...untracked])
}
function dirtyNonTestsPaths(base) {
  const changed = changedSinceBase(base)
  const nonTestsPaths = filePlanRows
    .filter((r) => !isTestsRow(r)).flatMap((r) => r.paths)
  return nonTestsPaths.filter((p) => changed.has(p))
}

function ledgerBuildRow(root, rel) {
  let text = ''
  try { text = fs.readFileSync(path.join(root, '.claude/spec-runs.jsonl'), 'utf8') } catch { return null }
  let found = null
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let row
    try { row = JSON.parse(line) } catch { continue } // a malformed line never blocks a build
    if (row && row.stage === 'build' && row.spec === rel) found = row
  }
  return found
}

let marks = loadSidecar(sidecarDir, 'build-state.json')
// Set only by handleLooked when its mark resolves the state it was printed at — never a generic
// transition log for every mark (every other mark's printed shape is unchanged).
let transitionNote = ''
let resumeDirtyWarning = ''

function saveSidecar() { saveSidecarLib(sidecarDir, 'build-state.json', marks) }

if (!STATE_ONLY) {
  if (!sidecarExisted && !justFlipped) {
    const base = resolveBase()
    const dirty = dirtyNonTestsPaths(base)
    if (dirty.length) {
      resumeDirtyWarning = '⚠️ resumed with no ' + sidecarRel + '/ sidecar and non-tests File ' +
        'Plan path(s) already differ from base ' + base + ': ' + dirty.join(', ') + ' — red-check ' +
        'cannot run on this post-image tree; recorded redCheck: "skipped-resume".\n'
      marks.redCheck = 'skipped-resume'
      marks.redCheckDirty = dirty
    }
  }
  if (!hasTestsRows && marks.redCheck === undefined) marks.redCheck = 'none'
  // `via` is recorded once, at sidecar creation, as "loop"; argv is never consulted.
  if (marks.via === undefined) {
    marks.via = 'loop'
    // session token snapshot at sidecar creation, so the DONE row's sessionTokens is a delta
    marks.tokensAtStart = sessionUsage(repoRoot)
  }
  // The lock-time Decision IDs, snapshotted only on the hardened->implementing flip (the one
  // invocation guaranteed to read the locked text); a sidecar-less resume records null and
  // COMMIT skips the comparison rather than counting rows it cannot date.
  if (marks.decisionsAtLock === undefined) marks.decisionsAtLock = justFlipped ? decisionIds(specText) : null
  saveSidecar()
}

// ---- wave derivation ---------------------------------------------------------------
function computeWaveOrder() {
  const layerGroups = Array.isArray(hostConfig.layerGroups) ? hostConfig.layerGroups : []
  const nonTests = filePlanRows.filter((r) => !isTestsRow(r) && !isBaselineRow(r) && !isReplayRow(r))
  const rowsByLayer = new Map()
  for (const r of nonTests) {
    const layer = (r.layer || 'other').trim() || 'other'
    if (!rowsByLayer.has(layer)) rowsByLayer.set(layer, [])
    rowsByLayer.get(layer).push(r)
  }
  const groupedLayers = new Set(layerGroups.flat())
  const waves = []
  for (const group of layerGroups) {
    const fileSets = group.map((layer) => new Set((rowsByLayer.get(layer) || []).flatMap((r) => r.paths)))
    let intersects = false
    for (let i = 0; i < fileSets.length && !intersects; i++) {
      for (let j = i + 1; j < fileSets.length; j++) {
        for (const f of fileSets[i]) if (fileSets[j].has(f)) { intersects = true; break }
      }
    }
    if (intersects) {
      for (const layer of group) waves.push({ label: layer, rows: rowsByLayer.get(layer) || [] })
    } else {
      waves.push({ label: group.join('+'), rows: group.flatMap((layer) => rowsByLayer.get(layer) || []) })
    }
  }
  const otherRows = [...rowsByLayer.entries()]
    .filter(([layer]) => !groupedLayers.has(layer)).flatMap(([, rows]) => rows)
  if (otherRows.length) waves.push({ label: 'other', rows: otherRows })
  // A declared group with no File Plan rows is not a wave — skipped at derivation; the WAVE step
  // prints the skips once.
  for (const w of waves) if (!w.rows.length) skippedWaves.push(w.label)
  return waves.filter((w) => w.rows.length)
}
const skippedWaves = []
const waveOrder = computeWaveOrder()
function pendingWave() {
  const done = new Set(Object.keys(marks.waves || {}))
  return waveOrder.find((w) => !done.has(w.label)) || null
}

// ---- red-check (RED_CHECK, driver-only) ----------------------------------------------------------
function ensureRedCheckAdvanced() {
  if (!hasTestsRows) return
  if (marks.redCheck === 'green' || marks.redCheck === 'skipped-resume') return
  if (!marks.testsAuthored) return
  const base = resolveBase()
  const k = (marks.redCheckRuns || 0) + 1
  const r = runChild(process.execPath,
    [redCheckBin, '--spec', resolvedSpecPath, '--root', repoRoot, '--base', base], { encoding: 'utf8' },
    'red-check.js')
  fs.mkdirSync(sidecarDir, { recursive: true })
  const logPath = path.join(sidecarDir, 'red-check-' + k + '.log')
  fs.writeFileSync(logPath, (r.stdout || '') + (r.stderr || ''))
  marks.redCheckRuns = k
  marks.redCheckLog = logPath
  const trips = ((r.stdout || '').match(/^WARN\s+watchdog-trip\s+(\S+)/gm) || [])
  for (const t of trips) recordIncident('test-watchdog-trip', 124, 'red-check run ' + k + ': ' + t.replace(/^WARN\s+watchdog-trip\s+/, ''))
  if (r.status === 0) {
    marks.redCheck = 'green'
    marks.lastRedCheckPass = true
  } else if (r.status === 1) {
    marks.lastRedCheckPass = false
    marks.lastRedCheckOutput = (r.stdout || '') + (r.stderr || '')
  } else {
    die('red-check.js failed: ' + ((r.stdout || '') + (r.stderr || '')).trim())
  }
  saveSidecar()
}

// `{testCommand}` inside postGateCommand is replaced with the config's testCommand; no other
// placeholder. Returns null when no non-empty string postGateCommand is declared.
function resolvePostGate() {
  const raw = hostConfig.postGateCommand
  if (typeof raw !== 'string' || raw.length === 0) return null
  const testCommand = typeof hostConfig.testCommand === 'string' ? hostConfig.testCommand : ''
  return raw.split('{testCommand}').join(testCommand)
}

// Before the gate child spawns, the spec's own untracked, non-ignored File Plan paths are added
// with intent-to-add (`git add -N`) so the gate sees what the build created; the entries persist
// until the checkpoint commit and one stderr notice names them with the undo command. A File Plan
// file hidden by the host's .gitignore earns a warning, not a refusal. A non-zero exit from either
// git call refuses the mark before any gate child spawns or gateRuns entry is recorded.
function stageCreatedFilePlanPaths() {
  const paths = [...new Set(filePlanRows.flatMap((r) => r.paths))]
  if (!paths.length) return

  const untrackedR = runChild('git',
    ['-C', repoRoot, 'ls-files', '-o', '--exclude-standard', '-z', '--', ...paths],
    { encoding: 'utf8' }, 'git ls-files -o --exclude-standard (untracked File Plan paths)')
  if (untrackedR.status !== 0) {
    die('git ls-files -o --exclude-standard -- <File Plan paths> exited ' + untrackedR.status +
      ' (' + (untrackedR.stderr || '').trim() + ') — resolve the git failure, then re-run this mark')
  }
  const untracked = untrackedR.stdout.split('\0').filter(Boolean)

  const trackedR = runChild('git', ['-C', repoRoot, 'ls-files', '-z', '--', ...paths],
    { encoding: 'utf8' }, 'git ls-files (tracked File Plan paths)')
  if (trackedR.status !== 0) {
    die('git ls-files -- <File Plan paths> exited ' + trackedR.status +
      ' (' + (trackedR.stderr || '').trim() + ') — resolve the git failure, then re-run this mark')
  }
  const tracked = new Set(trackedR.stdout.split('\0').filter(Boolean))
  const untrackedSet = new Set(untracked)

  // A regular file git knows as neither tracked nor untracked is hidden by the host's .gitignore.
  const ignored = paths.filter((p) => {
    if (tracked.has(p) || untrackedSet.has(p)) return false
    let st
    try { st = fs.statSync(path.join(repoRoot, p)) } catch { return false }
    return st.isFile()
  })
  if (ignored.length) {
    process.stderr.write('spec-build-driver: ⚠️ File Plan path(s) ignored by this ' +
      'host\'s .gitignore — staying untracked and invisible to any index-reading gate check: ' +
      ignored.join(', ') + '\n')
  }

  if (!untracked.length) return
  const addR = runChild('git', ['-C', repoRoot, 'add', '-N', '--', ...untracked],
    { encoding: 'utf8' }, 'git add -N (stage untracked File Plan paths)')
  if (addR.status !== 0) {
    die('git add -N -- <File Plan paths> exited ' + addR.status +
      ' (' + (addR.stderr || '').trim() + ') — resolve the git failure, then re-run this mark')
  }
  process.stderr.write('spec-build-driver: staged File Plan path(s) into the index with `git ' +
    'add -N` so the gate can see them: ' + untracked.join(', ') + ' — undo with `git reset -- ' +
    untracked.join(' ') + '`\n')
}

// ---- gate (GATE, driver-only) ---------------------------------------------------------------------
function runGate() {
  const resolved = resolveGate(specText, hostConfig)
  if (!resolved.gate) {
    die('gate could not be resolved — ' + (resolved.reason || 'no gateCommand declared') +
      ' — add File Plan test rows or a gateCommand, then re-run this driver')
  }
  stageCreatedFilePlanPaths()
  // The postGateCommand rides this SAME bash -c child, so the repair bookkeeping sees exactly one
  // gate run per round; && short-circuits on a red scoped gate.
  const postGate = resolvePostGate()
  const gateCommand = postGate !== null
    ? resolved.gate + " && echo '== postGateCommand' && " + postGate
    : resolved.gate
  const k = (marks.gateRuns || []).length + 1
  fs.mkdirSync(sidecarDir, { recursive: true })
  const logPath = path.join(sidecarDir, 'gate-' + k + '.log')
  // The gate's stdout+stderr go straight to the log fd, never through a Node pipe: a full gate can
  // exceed spawnSync's maxBuffer and get SIGTERM-killed mid-run. Readers follow `gateRuns[k].log`.
  let fd
  try {
    fd = fs.openSync(logPath, 'w')
  } catch (e) {
    die('could not open gate log ' + logPath + ' for writing (' + e.message + ') — check the ' +
      'sidecar directory is writable and re-run')
  }
  let r
  try {
    r = runHost(gateCommand, { cwd: repoRoot, stdio: ['ignore', fd, fd] },
      'gate (' + gateCommand + ')')
  } finally {
    try { fs.closeSync(fd) } catch (e) { /* already closed */ }
  }
  marks.gateRuns = marks.gateRuns || []
  marks.gateRuns.push({ exit: r.status, log: logPath })
  if (r.status === 124) recordIncident('test-watchdog-trip', 124, 'gate run ' + k)
  saveSidecar()
}

// Automatic incident entries (core § Incident Policy): a watchdog trip is observable by exit code,
// so the driver records it with the manual mark's shape plus `source`.
function recordIncident(cls, exit, source) {
  marks.incidents = marks.incidents || []
  marks.incidents.push({ ts: new Date().toISOString(), class: cls, exit, source })
  process.stderr.write('spec-build-driver: incident recorded automatically (' + cls + ', exit ' + exit +
    ', ' + source + ') — ' + marks.incidents.length + ' on this build; it lands on the stage:"build" ledger row at DONE\n')
}

// ---- prototype specs ----
// One replay port per build lives in <spec>.build/replay-port.json ({"port": n}) when prototype.url
// carries {port}, allocated once. Returns { url, port } with port null for a fixed address.
function replayAddress() {
  const raw = (hostConfig.prototype && typeof hostConfig.prototype.url === 'string') ? hostConfig.prototype.url : ''
  if (!appPortLib.hasPortSlot(raw)) return { url: raw, port: null }
  const p = path.join(sidecarDir, 'replay-port.json')
  let port = null
  try {
    const doc = JSON.parse(fs.readFileSync(p, 'utf8'))
    if (doc && Number.isInteger(doc.port)) port = doc.port
  } catch { /* absent or unreadable: allocate below */ }
  if (port === null) {
    try { port = appPortLib.freePort() } catch (e) {
      die('could not allocate a replay port (' + e.message + ') — remedy: free a loopback port, then re-run')
    }
    fs.mkdirSync(sidecarDir, { recursive: true })
    fs.writeFileSync(p, JSON.stringify({ port }) + '\n')
  }
  return { url: appPortLib.resolveUrl(raw, port), port }
}
const replayStatePath = path.join(sidecarDir, 'replay-state.json')
function readReplayState() {
  if (!fs.existsSync(replayStatePath)) return null
  try { return JSON.parse(fs.readFileSync(replayStatePath, 'utf8')) } catch { return null }
}
function replayDone(doc) { return !!(doc && doc.passed === true && doc.looked === true) }
function readContract() {
  const contractPath = path.join(repoRoot, 'design/prototypes', protoStem, 'contract.json')
  let contract
  try {
    contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'))
  } catch (e) {
    die('cannot read ' + contractPath + ': ' + e.message)
  }
  return contract
}
// The command that serves the app the contract's tests and pictures hit: prototype.bootCommand
// when the host declares one, else the smoke boot (runtime.bootCommand). Empty string when neither.
function protoBootCommand() {
  const p = hostConfig.prototype
  if (p && typeof p.bootCommand === 'string' && p.bootCommand) return p.bootCommand
  const rt = hostConfig.runtime
  return (rt && typeof rt.bootCommand === 'string' && rt.bootCommand) ? rt.bootCommand : ''
}
function joinAddress(base, rel) {
  if (/^https?:\/\//.test(rel || '')) return rel
  return base.replace(/\/+$/, '') + (String(rel || '').startsWith('/') ? '' : '/') + (rel || '')
}

function handleReplayed() {
  const contract = readContract()
  const contractRel = 'design/prototypes/' + protoStem + '/contract.json'
  if (!contract.tests || typeof contract.tests.file !== 'string' || !contract.tests.file) {
    die('replayed refused — ' + contractRel + ' carries no tests.file — derive the contract\'s tests ' +
      'first: node "$(spec-paths prototype-driver)" ' + protoStem + ' --root . --mark tests-derived')
  }
  const proto = hostConfig.prototype || {}
  if (typeof proto.e2eRun !== 'string' || !proto.e2eRun || typeof proto.e2eFile !== 'string' || !proto.e2eFile) {
    die('replayed refused — prototype.e2eRun is not declared in the host config (prototype.e2eFile ' +
      'must name where the contract test lands) — declare both (/spec:doctor), then re-run --mark replayed')
  }
  const addr = replayAddress()
  if (!addr.url) {
    die('replayed refused — prototype.url is not declared in the host config — declare it ' +
      '(/spec:doctor), then re-run --mark replayed')
  }
  const source = path.join(repoRoot, 'design/prototypes', protoStem, contract.tests.file)
  if (!fs.existsSync(source)) {
    die('replayed refused — ' + source + ' does not exist — re-derive it: node "$(spec-paths ' +
      'prototype-driver)" ' + protoStem + ' --root . --mark tests-derived')
  }
  const e2eFile = proto.e2eFile.split('{stem}').join(protoStem)
  const dest = path.join(repoRoot, e2eFile)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(source, dest)

  const k = (marks.replayRuns || 0) + 1
  marks.replayRuns = k
  saveSidecar()
  fs.mkdirSync(sidecarDir, { recursive: true })
  const logPath = path.join(sidecarDir, 'replay-' + k + '.log')
  const env = { PROTO_URL: addr.url }
  let fd
  try {
    fd = fs.openSync(logPath, 'w')
  } catch (e) {
    die('could not open replay log ' + logPath + ' for writing (' + e.message + ') — check the ' +
      'sidecar directory is writable and re-run --mark replayed')
  }
  let r
  try {
    r = runHost(proto.e2eRun.split('{file}').join(e2eFile),
      { cwd: repoRoot, stdio: ['ignore', fd, fd], env }, 'prototype.e2eRun (' + proto.e2eRun + ')')
  } finally {
    try { fs.closeSync(fd) } catch (e) { /* already closed */ }
  }
  const logRel = path.relative(repoRoot, logPath)
  if (r.status !== 0) {
    die('contract tests red against the production build (e2eRun exited ' + r.status + ') — see ' +
      logRel + '; fix, then --mark replayed')
  }
  const pins = Array.isArray(contract.tests.pins) ? contract.tests.pins.length : 0
  fs.writeFileSync(replayStatePath,
    JSON.stringify({ tests: pins, passed: true, looked: false, log: logRel }, null, 2) + '\n')
  return null
}

function handleLooked() {
  const doc = readReplayState()
  if (!doc || doc.passed !== true) {
    die('replay has not passed — run `node ' + __filename + ' ' + specPath + ' --mark replayed` first')
  }
  doc.looked = true
  fs.writeFileSync(replayStatePath, JSON.stringify(doc, null, 2) + '\n')
  transitionNote = '(REPLAY → ' + deriveState() + ')'
  return null
}

// ---- mark handlers --------------------------------------------------------------------------------
// A tests-layer File Plan row may be a glob, satisfied by at least one matching file; a literal path
// by its own existence. Expansion goes through lib/glob-match.js.
function walkTree(dir, rootDir, out = []) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name === '.git') continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walkTree(full, rootDir, out)
    else out.push(path.relative(rootDir, full).split(path.sep).join('/'))
  }
  return out
}

function handleTestsAuthored() {
  const rows = filePlanRows.filter((r) =>
    isTestsRow(r) && (r.action || '').trim().toUpperCase() !== 'DELETE')
  const remedy = ' — author it, then re-run `node ' + __filename + ' ' + specPath +
    ' --mark tests-authored` (a file only the built product can produce and only a person may ' +
    'approve belongs on a `baseline`-layer row instead: it is expected at INTEGRATION, not here)'
  let treeCache = null
  for (const r of rows) {
    for (const p of r.paths) {
      if (/[*?[]/.test(p)) {
        if (treeCache === null) treeCache = walkTree(repoRoot, repoRoot)
        if (!treeCache.some((f) => globMatch(p, f))) {
          die('tests-authored refused — tests-layer File Plan pattern matches no file: ' + p +
            remedy)
        }
      } else if (!fs.existsSync(path.join(repoRoot, p))) {
        die('tests-authored refused — missing tests-layer File Plan path: ' + p + remedy)
      }
    }
  }
  marks.testsAuthored = true
  saveSidecar()
  return null
}

// Residue is "differs from base" (changedSinceBase, red-check's own purity predicate), never
// "exists on disk". A CREATE row already tracked at base earns one WARN, never a refusal — red-check's
// vacuity check already catches a committed stub that makes the red tests pass.
function handleRedAttributed() {
  const rows = filePlanRows.filter((r) =>
    !isTestsRow(r) && !isBaselineRow(r) && (r.action || '').trim().toUpperCase() === 'CREATE')
  const createPaths = rows.flatMap((r) => r.paths)

  // A cold resume recorded red-check as "skipped-resume": every non-tests path is expected to differ
  // from base there, so refusing would contradict that skip.
  if (marks.redCheck === 'skipped-resume') {
    process.stdout.write('[spec-build-driver] red-check was recorded "skipped-resume" for this ' +
      'run — the stub-residue check is skipped with it (on a resumed post-image tree every ' +
      'planned path differs from base, so the check could only produce a false refusal).\n')
    marks.redAttributed = true
    saveSidecar()
    return null
  }

  const base = resolveBase()
  const changed = changedSinceBase(base)
  const residue = createPaths.filter((p) => changed.has(p))
  if (residue.length) {
    die('red-attributed refused — stub residue: ' + residue.join(', ') + ' already differ(s) from ' +
      'the build base ' + base + ' (a non-tests CREATE row must not be written yet) — reconcile ' +
      'the working tree to match the base, then re-run this mark')
  }

  const buildBase = resolveBase()
  const trackedAtBase = createPaths.filter((p) => {
    const r = runChild('git', ['-C', repoRoot, 'cat-file', '-e', buildBase + ':' + p],
      { encoding: 'utf8' }, 'git cat-file -e (CREATE row tracked at base)')
    return r.status === 0
  })
  if (trackedAtBase.length) {
    process.stdout.write('[spec-build-driver] WARN: File Plan CREATE row(s) already tracked at ' +
      'the build base: ' + trackedAtBase.join(', ') + ' — the pre-image is clean, so the build ' +
      'continues; the row is likely stale (an already-tracked component the plan still calls CREATE). ' +
      'Consider MODIFY. If a stale stub is what these are, red-check\'s vacuity check is what ' +
      'catches it.\n')
  }

  marks.redAttributed = true
  saveSidecar()
  return null
}

// A File Plan row may be a glob: CREATE/MODIFY verifies when at least one file matches, DELETE when
// none does (lib/glob-match.js).
function verifyWaveRows(rows) {
  let treeCache = null
  for (const r of rows) {
    const action = (r.action || '').trim().toUpperCase()
    for (const p of r.paths) {
      if (/[*?[]/.test(p)) {
        if (treeCache === null) treeCache = walkTree(repoRoot, repoRoot)
        const anyMatch = treeCache.some((f) => globMatch(p, f))
        if (action === 'DELETE' ? anyMatch : !anyMatch) return p
        continue
      }
      const full = path.join(repoRoot, p)
      if (action === 'DELETE') {
        if (fs.existsSync(full)) return p
      } else if (!fs.existsSync(full)) {
        return p
      }
    }
  }
  return null
}

function handleWaveDone() {
  const wave = flag('--wave')
  const workersRaw = flag('--workers')
  if (typeof wave !== 'string') die('--mark wave-done needs --wave <label> --workers <n>')
  const workers = Number(workersRaw)
  if (typeof workersRaw !== 'string' || !Number.isInteger(workers) || workers < 0) {
    die('--mark wave-done needs a non-negative integer --workers (got ' + JSON.stringify(workersRaw) + ')')
  }
  const current = pendingWave()
  if (!current) die('wave-done refused — no wave is currently due; every wave is already marked done')
  if (current.label !== wave) {
    die('wave-done refused — "' + wave + '" is not the current wave (' + current.label +
      ') — mark the current wave first')
  }
  const badPath = verifyWaveRows(current.rows)
  if (badPath) {
    die('wave-done refused — ' + badPath + ' does not verify for wave ' + wave +
      ' (CREATE/MODIFY rows must exist on disk, DELETE rows must be absent)')
  }
  marks.waves = marks.waves || {}
  marks.waves[wave] = { workers }
  saveSidecar()
  return null
}

// A baseline-layer row is verified here rather than at TESTS or a wave: the file does not exist
// until the waves have landed the product it is drawn from. Globs expand as every other row's do.
function missingBaselinePaths() {
  let treeCache = null
  return baselinePaths.filter((p) => {
    if (!/[*?[]/.test(p)) return !fs.existsSync(path.join(repoRoot, p))
    if (treeCache === null) treeCache = walkTree(repoRoot, repoRoot)
    return !treeCache.some((f) => globMatch(p, f))
  })
}

function handleIntegrated() {
  if (pendingWave()) die('integrated refused — a wave is still pending; mark every wave-done first')
  const missing = missingBaselinePaths()
  if (missing.length) {
    die('integrated refused — missing baseline-layer File Plan path(s): ' + missing.join(', ') +
      ' — a person produces these from the built product and approves them (the host\'s ' +
      'pipeline rules § Build names the command); the gate has not run and no repair round is ' +
      'spent. Then re-run `node ' + __filename + ' ' + specPath + ' --mark integrated`')
  }
  marks.integrated = true
  saveSidecar()
  runGate()
  return null
}

const REPAIR_CAP = 3
function isAtRepairNow() {
  const runs = marks.gateRuns || []
  const last = runs[runs.length - 1]
  return !!marks.integrated && !!last && last.exit !== 0 && !fs.existsSync(gateCapPath)
}
// `--mark incident --class <id> [--exit <n>]` (core § Incident Policy): records a build-time
// incident as an entry on the build row so fleet-reader's escapes.byClass can join it. The mark
// never moves the state.
function handleIncident() {
  const cls = flag('--class')
  if (typeof cls !== 'string' || !CLASS_ID_RE.test(cls)) {
    die('--mark incident needs --class <kebab-case id> (the fleet\'s class vocabulary — ' +
      'read `.escapes.registry` from fleet-reader --json first) — got ' + JSON.stringify(cls))
  }
  const exitRaw = flag('--exit')
  let exit = null
  if (exitRaw !== null) {
    exit = Number(exitRaw)
    if (!Number.isInteger(exit) || exit < 0) die('--mark incident --exit must be a non-negative integer (got ' + JSON.stringify(exitRaw) + ')')
  }
  marks.incidents = marks.incidents || []
  marks.incidents.push({ ts: new Date().toISOString(), class: cls, exit })
  saveSidecar()
  process.stderr.write('spec-build-driver: incident recorded (' + cls + (exit === null ? '' : ', exit ' + exit) +
    ') — ' + marks.incidents.length + ' on this build; it lands on the stage:"build" ledger row at DONE\n')
  return null
}
function handleRepairApplied() {
  const continuedRaw = flag('--continued')
  const spawnedRaw = flag('--spawned')
  const continued = Number(continuedRaw)
  const spawned = Number(spawnedRaw)
  if (typeof continuedRaw !== 'string' || typeof spawnedRaw !== 'string' ||
    !Number.isInteger(continued) || continued < 0 || !Number.isInteger(spawned) || spawned < 0) {
    die('--mark repair-applied needs non-negative integer --continued/--spawned')
  }
  if (!isAtRepairNow() && !fs.existsSync(gateCapPath)) {
    die('repair-applied refused — no repair round is currently due (the gate is not red, or the ' +
      'run is not yet integrated)')
  }
  marks.repairs = marks.repairs || []
  if (marks.repairs.length >= REPAIR_CAP) {
    if (!marks.capEverTripped || fs.existsSync(gateCapPath)) {
      fs.mkdirSync(sidecarDir, { recursive: true })
      fs.writeFileSync(gateCapPath, '')
      marks.capEverTripped = true
      saveSidecar()
      die('repair iteration cap (3) reached — a fourth repair-applied is refused; the repair loop ' +
        'is capped at 3 rounds — surface this to the user instead of dispatching another repair. ' +
        'Re-run `node ' + __filename + ' ' + specPath + '` for the ESCALATE question, then ' +
        '`--mark escalate-choice <re-arm|cold|park|amend>`.')
    }
    // A deliberate re-arm (gate-cap deleted) buys exactly one more round. The gate runs BEFORE the
    // round is recorded: a child dying with no exit code exits the process with state unchanged.
    runGate()
    marks.repairs.push({ continued, spawned })
    delete marks.escalateChoice
    saveSidecar()
    const reArmed = marks.gateRuns[marks.gateRuns.length - 1]
    if (reArmed.exit !== 0) fs.writeFileSync(gateCapPath, '')
    return null
  }
  // Same ordering as the re-arm branch above: gate first, then record.
  runGate()
  marks.repairs.push({ continued, spawned })
  saveSidecar()
  return null
}

// `--mark escalate-choice <re-arm|cold|park|amend>` (ESCALATE only): the sanctioned surface for
// the capped run's four exits. re-arm and cold perform the deletions the step used to ask for.
function handleEscalateChoice() {
  const choice = argv[markIdx + 2]
  if (!['re-arm', 'cold', 'park', 'amend'].includes(choice)) {
    die('--mark escalate-choice needs one of re-arm | cold | park | amend (got ' + JSON.stringify(choice) + ')')
  }
  // A veto of a derived re-arm arrives at REPAIR (the pick deleted gate-cap): restore the cap so the
  // choice lands exactly what the explicit mark lands from ESCALATE.
  if (deriveState() === 'REPAIR') {
    fs.mkdirSync(sidecarDir, { recursive: true })
    fs.writeFileSync(gateCapPath, '')
  }
  if (choice === 're-arm') {
    fs.rmSync(gateCapPath, { force: true })
    delete marks.escalateChoice
    pq.clearLaneExit(repoRoot, marks)
    saveSidecar()
    return null
  }
  if (choice === 'cold') {
    pq.clearLaneExit(repoRoot, marks)
    fs.rmSync(sidecarDir, { recursive: true, force: true })
    writeOut(1, 'sidecar removed \u2014 the next run resumes from the tree as it is:\n  node ' + __filename + ' ' + specPath + '\n')
    process.exit(0)
  }
  marks.escalateChoice = choice
  if (choice === 'park') recordParkExit()
  else pq.clearLaneExit(repoRoot, marks)
  saveSidecar()
  return null
}

// A policy pick is recorded once per key: a bare re-invocation reprints the step but never
// appends a second record. Saves the sidecar when a new pick lands.
function pickOnce(key, labelByValue) { return pq.pickOnce(repoRoot, key, labelByValue, marks, saveSidecar) }
// The queue subject a parked build prints, and the lane exit recorded with it.
function parkQueueSubject() {
  const runs = marks.gateRuns || []
  const lastLog = runs.length ? path.relative(repoRoot, runs[runs.length - 1].log) : '(none)'
  return `${specRel}: build parked at the repair cap \u2014 ${lastLog}`
}
function recordParkExit() {
  pq.recordLaneExit(repoRoot, marks, { reason: 'build parked at the repair cap', queued: parkQueueSubject() })
}

function gitStatusPaths(root) {
  const r = runChild('git', ['-C', root, 'status', '--porcelain', '--untracked-files=all'],
    { encoding: 'utf8' }, 'git status --porcelain')
  return r.stdout.split('\n').filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ''))
}

function decisionIds(text) {
  const section = extractSection(text, 'Decisions')
  if (section === null) return []
  return section.split('\n').map((l) => /^\|\s*(D\d+[a-zA-Z′']*)\s*\|/.exec(l)).filter(Boolean).map((m) => m[1])
}

// A Decision row added after lock is a ruling the plan missed (core § Incident Policy) — one
// incident entry per build, its source naming the added IDs.
function recordAddedDecisions() {
  if (!Array.isArray(marks.decisionsAtLock)) return
  const atLock = new Set(marks.decisionsAtLock)
  const added = decisionIds(specText).filter((id) => !atLock.has(id))
  if (added.length) recordIncident('decision-added-at-build', null, added.join(', '))
}

function countDeviations() {
  if (!fs.existsSync(deviationsPath)) return 0
  return fs.readFileSync(deviationsPath, 'utf8').split('\n').filter((l) => /^- /.test(l)).length
}

function sumWorkers() {
  const waveSum = Object.values(marks.waves || {}).reduce((s, w) => s + (w.workers || 0), 0)
  const repairSpawnedSum = (marks.repairs || []).reduce((s, r) => s + (r.spawned || 0), 0)
  const repairContinuedSum = (marks.repairs || []).reduce((s, r) => s + (r.continued || 0), 0)
  return { spawned: waveSum + repairSpawnedSum, continued: repairContinuedSum }
}

function printDoneNow() {
  const status2 = runChild(process.execPath, [specStatusBin, '--root', repoRoot, '--next'],
    { encoding: 'utf8' }, 'spec-status.js --next')
  const nextLine = status2.status === 0 ? status2.stdout.trim() : '(spec-status --next unavailable)'
  writeOut(1, `[spec-build-driver] state: DONE  spec: ${specPath}\n\n## DONE\n${nextLine}\n`)
  process.exit(0)
}

function handleCommitted() {
  // no File Plan path — tests-layer rows included — may appear in `git status --porcelain`.
  const filePlanPaths = filePlanRows.flatMap((r) => r.paths)
  const dirty = gitStatusPaths(repoRoot)
  const dirtyFilePlan = filePlanPaths.filter((p) => dirty.includes(p))
  if (dirtyFilePlan.length) {
    die('committed refused — File Plan path(s) still dirty in `git status --porcelain`: ' +
      dirtyFilePlan.join(', ') + ' — commit the checkpoint first')
  }
  const base = resolveBase()
  const baseShaR = runChild('git', ['-C', repoRoot, 'rev-parse', '--verify', base + '^{commit}'],
    { encoding: 'utf8' }, 'git rev-parse --verify (base resolution)')
  const baseSha = (baseShaR.stdout || '').trim()
  if (baseShaR.status !== 0 || !/^[0-9a-f]{40}$/.test(baseSha)) {
    die('base "' + base + '" does not resolve to a commit')
  }
  const headR = runChild('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' },
    'git rev-parse HEAD')
  const head = (headR.stdout || '').trim()
  if (headR.status !== 0 || !/^[0-9a-f]{40}$/.test(head)) {
    die('git rev-parse HEAD did not print a 40-hex commit sha')
  }
  if (head === baseSha) {
    die('committed refused — HEAD equals the base sha (' + baseSha + ') — nothing has been committed yet')
  }
  const diffR = runChild('git', ['-C', repoRoot, 'diff', '--shortstat', baseSha, head], { encoding: 'utf8' },
    'git diff --shortstat')
  const m = /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/.exec(diffR.stdout || '')
  const diffFiles = m ? Number(m[1]) : 0
  const diffLoc = m ? (Number(m[2]) || 0) + (Number(m[3]) || 0) : 0

  const runId = 'bd_' + crypto.randomBytes(6).toString('hex')
  const workers = sumWorkers()
  // model is derived at row-write time, never once at startup (right after /clear there is no assistant line yet).
  const model = sessionModel(repoRoot)
  recordAddedDecisions()
  const row = {
    ts: new Date().toISOString(),
    spec: specRel,
    stage: 'build',
    tier,
    via: marks.via || 'direct',
    model,
    runId,
    diff: { files: diffFiles, loc: diffLoc },
    // postGate records whether a non-empty postGateCommand was declared at row-write time —
    // the only way to later compare review-time GATE_RED rates for builds with the knob on vs off.
    gate: { finalRounds: (marks.gateRuns || []).length, postGate: resolvePostGate() !== null },
    deviations: countDeviations(),
    redCheck: marks.redCheck || 'none',
    workers,
    incidents: marks.incidents || [],
  }
  // the replay evidence lands on the build row for a `prototype:` spec only — every other
  // spec's row shape is unaffected; review's contract leg reads this key.
  if (protoStem) {
    const rs = readReplayState() || {}
    row.replay = replayOwner
      ? { tests: rs.tests, passed: rs.passed === true, looked: rs.looked === true }
      : { owner: false }
  }
  // sessionTokens is the LAST key: counter-wise delta since sidecar creation, null when either
  // snapshot is absent or a counter went backwards.
  row.sessionTokens = usageDelta(sessionUsage(repoRoot), marks.tokensAtStart || null)
  appendLedger(repoRoot, JSON.stringify(row))
  fs.rmSync(sidecarDir, { recursive: true, force: true })
  printDoneNow()
}

// ---- admission: a mark is admissible only at the state that prints it -----------------------
// A mark whose artifact predicate is trivially true elsewhere (`integrated` has none) would
// otherwise land off-script; deriveState() is pure, so legitimate re-entry still admits.
const MARK_STATE = {
  'tests-authored': (s) => s === 'TESTS',
  'red-attributed': (s) => s === 'RED_ATTRIBUTION',
  'wave-done': (s) => s.startsWith('WAVE:'),   // the label match stays in handleWaveDone (AC-6's message)
  'integrated': (s) => s === 'INTEGRATION',
  'repair-applied': (s) => s === 'REPAIR',
  // REPAIR admits it only inside the window a derived re-arm pick opens (escalateChoice 're-arm'
  // survives until repair-applied clears it; an explicit re-arm deletes it).
  'escalate-choice': (s) => s === 'ESCALATE' || (s === 'REPAIR' && marks.escalateChoice === 're-arm' && !!marks.capEverTripped),
  'committed': (s) => s === 'COMMIT',
  'incident': (s) => s !== 'DONE',   // any live step — an incident has no state of its own
  'replayed': (s) => s === 'REPLAY',
  'looked': (s) => s === 'REPLAY',
}
function admitMark() {
  const admits = MARK_STATE[MARK]
  if (!admits) return // unknown mark — handleMark's default branch names the closed set
  const s = deriveState()
  if (!admits(s)) {
    die('--mark ' + MARK + ' refused — the current state is ' + s + ', which does not print this ' +
      'mark (state unchanged); re-run `node ' + __filename + ' ' + specPath + '` and execute the ' +
      'step it prints')
  }
}

const redStopKey = () => pq.stopKey('red-findings', marks.lastRedCheckOutput || '')
const escalateStopKey = () => pq.stopKey('build-escalate', (marks.gateRuns || []).length)

function handleMark() {
  switch (MARK) {
    case 'tests-authored': return handleTestsAuthored()
    case 'red-attributed': return handleRedAttributed()
    case 'wave-done': return handleWaveDone()
    case 'integrated': return handleIntegrated()
    case 'repair-applied': return handleRepairApplied()
    case 'escalate-choice': return handleEscalateChoice()
    case 'committed': return handleCommitted() // exits the process itself
    case 'incident': return handleIncident()
    case 'replayed': return handleReplayed()
    case 'looked': return handleLooked()
    default:
      die('unknown mark "' + MARK + '" (tests-authored | red-attributed | wave-done --wave ' +
        '<label> --workers <n> | integrated | repair-applied --continued <n> --spawned <n> | committed | ' +
        'incident --class <id> [--exit <n>] | replayed | looked)')
  }
}

// ---- state derivation (pure — no child processes, no writes) -------------------------------------
function afterWaves() {
  if (!marks.integrated) return 'INTEGRATION'
  const runs = marks.gateRuns || []
  const last = runs[runs.length - 1]
  if (!last) return 'INTEGRATION'
  if (last.exit === 0) return 'COMMIT'
  return fs.existsSync(gateCapPath) ? 'ESCALATE' : 'REPAIR'
}
function deriveState() {
  if (hasTestsRows) {
    if (!marks.testsAuthored) return 'TESTS'
    if (!(marks.redCheck === 'green' || marks.redCheck === 'skipped-resume')) {
      return marks.lastRedCheckPass === false ? 'RED_FINDINGS' : 'TESTS'
    }
    if (needsRedAttribution && !marks.redAttributed) return 'RED_ATTRIBUTION'
  }
  const w = pendingWave()
  if (w) return 'WAVE:' + w.label
  const after = afterWaves()
  // derived only once the gate is actually green — REPAIR/ESCALATE are unaffected.
  if (replayOwner && after === 'COMMIT' && !replayDone(readReplayState())) return 'REPLAY'
  return after
}

// ---- run -------------------------------------------------------------------------------------------
if (!MARK && !STATE_ONLY) {
  const bare = pq.bareRun(repoRoot, marks, [], (kind) =>
    kind === 'red-findings' ? redStopKey() : kind === 'build-escalate' ? escalateStopKey() : null)
  if (bare) {
    if (bare.changed) saveSidecar()
    writeOut(1, bare.text + '\n')
    process.exit(0)
  }
}
if (MARK && marks.dismissedStop) {
  die('--mark ' + MARK + ' refused \u2014 marks.dismissedStop records a dismissed question (' + marks.dismissedStop.kind +
    '); the run ended \u2014 delete ' + sidecarDir + ' to restart')
}
let forcedState = null
if (MARK) { admitMark(); forcedState = handleMark() }
if (!STATE_ONLY) ensureRedCheckAdvanced()
const state = forcedState || deriveState()

if (STATE_ONLY) { writeOut(1, state + '\n'); process.exit(0) }

// The worker-git-ban signal: a file in the tree's private git dir, present exactly while the
// derived state dispatches workers. block-worker-git.sh reads it; --state never reaches here.
function syncWaveMarker(st) {
  const gdR = runChild('git', ['-C', repoRoot, 'rev-parse', '--git-dir'], { encoding: 'utf8' },
    'git rev-parse --git-dir')
  const gd = (gdR.stdout || '').trim()
  if (gdR.status !== 0 || !gd) die('cannot resolve the private git dir under ' + repoRoot + ' for the spec-wave-open marker')
  const marker = path.join(path.isAbsolute(gd) ? gd : path.join(repoRoot, gd), 'spec-wave-open')
  const dispatching = st === 'TESTS' || st === 'RED_FINDINGS' || st === 'RED_ATTRIBUTION' ||
    st.startsWith('WAVE:') || st === 'REPAIR'
  try {
    if (dispatching) fs.writeFileSync(marker, JSON.stringify({ spec: specRel, state: st }))
    else if (fs.existsSync(marker)) fs.unlinkSync(marker)
  } catch (e) {
    die('cannot ' + (dispatching ? 'write' : 'remove') + ' ' + marker + ' (' + e.message +
      ') — the worker git ban would be inert; fix the path permissions and rerun')
  }
}
syncWaveMarker(state)

// ---- step bodies -------------------------------------------------------------------------------
function testsStepBody() {
  const paths = filePlanRows.filter((r) =>
    isTestsRow(r) && (r.action || '').trim().toUpperCase() !== 'DELETE')
    .flatMap((r) => r.paths)
  return resumeDirtyWarning +
    `## Step: author the tests\n` +
    `Author every tests-layer File Plan path below against the untouched pre-image — each must be ` +
    `genuinely red until its owning wave lands the implementation:\n` +
    paths.map((p) => '  ' + p).join('\n') + '\n' +
    `spec: ${specPath}\n` +
    `pipeline rules: ${pipelineRulesPath || '(none declared)'}\n` +
    `deviations sidecar: ${deviationsPath}\n` +
    `Then: node ${__filename} ${specPath} --mark tests-authored`
}
// Each HARD line of the red-check output is classified. mixed-pin and a standard-tier
// unsanctioned-green have one mechanical fix, announced as an auto-pick; a critical-tier green
// stays a question. Other classes print only in the verbatim output above.
function redFindingsGuidance() {
  const out = []
  let askGreen = false
  for (const line of (marks.lastRedCheckOutput || '').split('\n')) {
    const m = /^HARD\s+(\S+)\s+(\S+)/.exec(line)
    if (!m) continue
    if (m[1] === 'mixed-pin') {
      const acs = (line.slice(line.indexOf(m[2]) + m[2].length).match(/AC-\d{8}-\d+-\d+/g) || [])
      out.push(`\ud83d\udccc Auto-picked split the bullet \u2014 ${m[2]}: ${[...new Set(acs)].join(', ')} (veto anytime)\n` +
        `  split the SHALL CONTINUE TO clause into its own AC, then re-run`)
    } else if (m[1] === 'unsanctioned-green') {
      const rp = tier === 'critical' ? pickOnce('redFindings', { 'remove-mention': 'remove the AC-ID mention' }) : null
      if (tier === 'critical' && !rp) askGreen = true
      else if (rp) out.push(`${rp.line}\n` +
        `  known cause (spec-pipeline \u00a7 Gotchas): the file mentions a carried AC-ID in a comment or test name, ` +
        `which forces a red expectation onto a green file \u2014 remove the mention. If that does not match, the ` +
        `test is vacuous: rewrite it red.`)
      else out.push(`\ud83d\udccc Auto-picked remove the AC-ID mention \u2014 ${m[2]} (veto anytime)\n` +
        `  known cause (spec-pipeline \u00a7 Gotchas): the file mentions a carried AC-ID in a comment or test name, ` +
        `which forces a red expectation onto a green file \u2014 remove the mention. If that does not match, the ` +
        `test is vacuous: rewrite it red.`)
    }
  }
  if (askGreen && pq.isDelegated(repoRoot)) {
    const editThenRerun = `edit then node ${__filename} ${specPath}`
    out.push(pq.stopLine(repoRoot, 'build', {
      kind: 'red-findings', state: 'RED_FINDINGS', spec: specRel,
      stopKey: redStopKey(),
      questions: [{
        id: 'q1', header: 'Red check',
        question: 'The red check found a test that is green before any code was written, on a critical-tier spec. How should the build proceed?',
        options: [
          { label: 'remove the AC-ID mention (Recommended)', description: 'The known cause: the file mentions an acceptance ID in a comment or test name; the test keeps its assertions and the red check re-runs',
            resume: editThenRerun },
          { label: 'rewrite the test red', description: 'Use when the test is vacuous: the test is rewritten to fail before the code lands, which costs a rewrite',
            resume: editThenRerun },
          { label: 'pause the build', description: 'The build stops here and the lane ends so the green test can be investigated by hand',
            resume: 'stop' },
        ],
      }],
    }, marks))
  } else if (askGreen) {
    out.push(`Ask ONE AskUserQuestion \u2014 an unsanctioned-green on a critical-tier spec:\n` +
      `  remove the AC-ID mention (Recommended) \u2014 the known cause; the test keeps its assertions\n` +
      `  rewrite the test red \u2014 when the test is vacuous\n` +
      `  pause the build \u2014 stop here and investigate`)
  }
  return out.length ? out.join('\n') + '\n' : ''
}
function redFindingsStepBody() {
  return `## RED_FINDINGS \u2014 red-check reports the pre-image does not match expectations\n` +
    (marks.lastRedCheckOutput || '') + '\n' + redFindingsGuidance() +
    `Fix the test file(s) above so the pre-image is genuinely red where expected, then re-run ` +
    `this driver with no mark \u2014 it re-runs red-check itself:\n  node ${__filename} ${specPath}`
}
function redAttributionStepBody() {
  const createPaths = filePlanRows.filter((r) =>
    !isTestsRow(r) && !isBaselineRow(r) && (r.action || '').trim().toUpperCase() === 'CREATE')
    .flatMap((r) => r.paths)
  return `## Step: red attribution — confirm the red is attributable to code that does not exist yet\n` +
    `Non-tests CREATE row(s) that must NOT exist on disk yet:\n` +
    createPaths.map((p) => '  ' + p).join('\n') + '\n' +
    `Then: node ${__filename} ${specPath} --mark red-attributed`
}
function waveStepBody(label) {
  const w = waveOrder.find((x) => x.label === label)
  const rows = (w && w.rows) || []
  const skipNote = !hasTestsRows
    ? `TESTS/RED_CHECK/RED_FINDINGS/RED_ATTRIBUTION skipped — no tests-layer File Plan rows.\n`
    : ''
  const agentMap = hostConfig.agentMap || {}
  const perLayer = new Map()
  const orchFiles = []
  for (const r of rows) {
    const layer = (r.layer || 'other').trim() || 'other'
    for (const p of r.paths) {
      if (isOrchestratorOnly(p)) { orchFiles.push({ path: p, action: r.action }); continue }
      if (!perLayer.has(layer)) perLayer.set(layer, [])
      perLayer.get(layer).push({ path: p, action: r.action })
    }
  }
  const layerBlocks = [...perLayer.entries()].map(([layer, files]) => {
    const agent = agentMap[layer] || agentMap.default || 'general-purpose'
    return `  layer: ${layer}  agent: ${agent}\n` + files.map((f) => '    ' + JSON.stringify(f)).join('\n')
  })
  const orchBlock = orchFiles.length
    ? `  orchestrator — never in a worker's file list; change each through its route in pipeline rules § Worker Rules, before dispatch when a worker's files depend on it, else after the workers return:\n` +
      orchFiles.map((f) => '    ' + JSON.stringify(f)).join('\n')
    : null
  const body = [...layerBlocks, ...(orchBlock ? [orchBlock] : [])].join('\n')
  const header = (perLayer.size === 0 && orchBlock)
    ? `## Step: wave ${label} — orchestrator rows only, spawn no worker\n`
    : `## Step: wave ${label} — spawn one long-lived ${agentCall(repoRoot, 'workers')} per layer above and KEEP it\n`
  const skippedNote = skippedWaves.length
    ? `empty wave(s) skipped — no File Plan rows: ${skippedWaves.join(', ')}\n`
    : ''
  return skipNote + skippedNote +
    header +
    body + '\n' +
    `spec: ${specPath}\n` +
    `pipeline rules: ${pipelineRulesPath || '(none declared)'}\n` +
    `deviations sidecar: ${deviationsPath}\n` +
    `Then: node ${__filename} ${specPath} --mark wave-done --wave ${label} --workers <n>`
}
function integrationStepBody() {
  return `## Step: host integration\n` +
    `Every wave has landed. Do the session-only integration work (wiring, README, doctrine). ` +
    `New File Plan files this build created are staged into the index with \`git add -N\` when ` +
    `the gate runs, so an index-reading host check (a size or duplication baseline) already ` +
    `counts them — reconcile it now if it needs raising, rather than in a repair round. Then:\n` +
    (baselinePaths.length
      ? `STOP for a person first — these baseline-layer File Plan files are produced from the ` +
        `built product and approved by a person, never by this session (the mark below refuses ` +
        `while one is missing):\n` + baselinePaths.map((p) => '  ' + p).join('\n') + '\n'
      : '') +
    `Then: node ${__filename} ${specPath} --mark integrated`
}
function repairStepBody() {
  const runs = marks.gateRuns || []
  const round = runs.length
  const current = runs[runs.length - 1]
  const previous = runs[runs.length - 2]
  const roundLabel = marks.capEverTripped ? `round ${round} (re-armed past the cap of 3)` : `round ${round} of 3`
  const orchPaths = waveOrder.flatMap((w) => w.rows.flatMap((r) => r.paths)).filter(isOrchestratorOnly)
  const postGate = resolvePostGate()
  const postGateLine = postGate !== null
    ? `\npost-gate: ${postGate} — red only after the scoped gate passed; find '== postGateCommand' in the log`
    : ''
  return `## REPAIR — ${roundLabel}\n` +
    `gate: ${current ? current.log : '(none)'}` +
    postGateLine +
    (previous ? `\nprevious gate: ${previous.log}` : '') + '\n' +
    `File Plan rows by layer, so failures route to the worker that owns them:\n` +
    waveOrder.map((w) => ({ label: w.label, paths: w.rows.flatMap((r) => r.paths).filter((p) => !isOrchestratorOnly(p)) }))
      .filter((w) => orchestratorOnly.length === 0 || w.paths.length > 0)
      .map((w) => `  ${w.label}: ` + w.paths.join(', ')).join('\n') + '\n' +
    (orchPaths.length
      ? `orchestrator-owned — fix these yourself, never route them to a worker: ${orchPaths.join(', ')}\n`
      : '') +
    `a failing file outside the File Plan: node "$(spec-paths out-of-plan-triage)" --spec ${specPath} --file <path> — exit 0 prints the two rows to paste, exit 1 asks (add to scope / file separately / pause)\n` +
    `Route each failing file to the worker that owns its layer (SendMessage; spawn fresh only if ` +
    `that worker is gone). Then:\n` +
    `Then: node ${__filename} ${specPath} --mark repair-applied --continued <n> --spawned <n>`
}
// Failure counts of the last three red gate runs, oldest first; any null makes the trend
// not derivable. The recommendation is a heuristic: a wrong re-arm costs one gate run, so
// unknown falls to park.
function escalateRecommendation() {
  const failPattern = hostConfig.capabilities && hostConfig.capabilities.failCountPattern
  if (failPattern === 'none') {
    return { pick: 'park', text: 'recommended: park (fail count unavailable \u2014 the host declares failCountPattern "none")' }
  }
  const reds = (marks.gateRuns || []).filter((r) => r.exit !== 0).slice(-3)
  const counts = reds.map((r) => {
    try { return failCount(fs.readFileSync(r.log, 'utf8'), failPattern) } catch { return null }
  })
  if (counts.length < 3 || counts.some((c) => c === null)) {
    return { pick: 'park', text: 'recommended: park (failure count not derivable from the gate logs)' }
  }
  const trend = counts.join(' \u2192 ')
  return counts[0] > counts[1] && counts[1] > counts[2]
    ? { pick: 're-arm', text: `recommended: re-arm (failures shrank ${trend})` }
    : { pick: 'park', text: `recommended: park (failures did not shrink: ${trend})` }
}
function escalateStepBody() {
  const runs = marks.gateRuns || []
  const lastLog = runs.length ? path.relative(repoRoot, runs[runs.length - 1].log) : '(none)'
  const queueLine = `node "$(spec-paths spec-queue)" add "${specRel}: build parked at the repair cap \u2014 ${lastLog}" --lane fix --top`
  if (marks.escalateChoice === 'park') {
    return `## ESCALATE \u2014 parked at the repair cap\n` +
      `The build stays parked. Queue the repair (run this line):\n  ${queueLine}\n` +
      `To change the answer: node ${__filename} ${specPath} --mark escalate-choice <re-arm|cold|amend>\n`
  }
  if (marks.escalateChoice === 'amend') {
    return `## ESCALATE \u2014 amend the spec\n` +
      `Edit the spec's Decisions table (the \`decision-added-at-build\` incident records it), then:\n` +
      `  node ${__filename} ${specPath} --mark escalate-choice re-arm\n`
  }
  const rec = escalateRecommendation()
  const ePick = pickOnce('buildEscalate', { derived: rec.pick === 're-arm' ? 're-arm one more round' : 'park and queue a /spec:fix' })
  if (ePick) {
    const pickLine = ePick.line.replace(/ \(veto anytime\)$/, ` (${rec.text}) (veto anytime)`)
    const override = `To answer differently: node ${__filename} ${specPath} --mark escalate-choice <re-arm|cold|park|amend>\n`
    if (rec.pick === 're-arm') {
      fs.rmSync(gateCapPath, { force: true })
      marks.escalateChoice = 're-arm'
      saveSidecar()
      return pickLine + '\n' + repairStepBody() + '\n' + override
    }
    marks.escalateChoice = 'park'
    recordParkExit()
    saveSidecar()
    return pickLine + '\n' +
      `## ESCALATE \u2014 parked at the repair cap\n` +
      `The build stays parked. Queue the repair (run this line):\n  ${queueLine}\n` + override
  }
  if (pq.isDelegated(repoRoot)) {
    const choice = (c) => `node ${__filename} ${specPath} --mark escalate-choice ${c}`
    return `## ESCALATE \u2014 repair iteration cap (3) reached\n` +
      `${rec.text}\n` +
      pq.stopLine(repoRoot, 'build', {
        kind: 'build-escalate', state: 'ESCALATE', spec: specRel,
        stopKey: escalateStopKey(),
        questions: [{
          id: 'q1', header: 'Repair cap',
          question: 'The build hit its repair cap with the gate still red. How should the lane continue?',
          options: [
            { label: `re-arm one more round${rec.pick === 're-arm' ? ' (Recommended when shrinking)' : ''}`, description: 'One more gate run is allowed; the failures were shrinking, and red again re-trips the cap',
              resume: choice('re-arm') },
            { label: 'restart cold', description: 'The build sidecar is deleted and the next run resumes from the tree as it is, which costs the recorded progress',
              resume: choice('cold') },
            { label: 'park and queue a /spec:fix', description: 'The build stays parked and the queue\'s top item becomes the repair, which ends this lane',
              resume: choice('park') },
            { label: 'amend the spec', description: 'The Decisions table is edited first, then the build re-arms; costs a spec change but fixes a wrong decision',
              resume: choice('amend') },
          ],
        }],
      }, marks) + '\n'
  }
  return `## ESCALATE \u2014 repair iteration cap (3) reached\n` +
    `${rec.text}\n` +
    `Ask ONE AskUserQuestion \u2014 options, consequences in each description:\n` +
    `  re-arm one more round${rec.pick === 're-arm' ? ' (Recommended when shrinking)' : ''} \u2014 one more gate run; red again re-trips the cap\n` +
    `  restart cold \u2014 the build sidecar is deleted; the next run resumes from the tree as it is\n` +
    `  park and queue a /spec:fix \u2014 the build stays parked; the queue's top item is the repair\n` +
    `  amend the spec \u2014 edit the Decisions table, then re-arm\n` +
    `Then: node ${__filename} ${specPath} --mark escalate-choice <re-arm|cold|park|amend>\n`
}
function commitStepBody() {
  const base = resolveBase()
  const r = runChild(process.execPath,
    [scopeReconcileBin, '--root', repoRoot, '--base', base, '--spec', resolvedSpecPath, '--json'],
    { encoding: 'utf8' }, 'scope-reconcile.js')
  let summary = ''
  try {
    const j = JSON.parse(r.stdout)
    fs.mkdirSync(sidecarDir, { recursive: true })
    fs.writeFileSync(path.join(sidecarDir, 'reconcile.json'), JSON.stringify(j, null, 2) + '\n')
    if (j.outOfPlan && j.outOfPlan.length) summary += `⚠️ out-of-plan: ${j.outOfPlan.join(', ')}\n`
  } catch { /* advisory only — a scope-reconcile.js precondition failure never blocks COMMIT */ }
  if (protoStem && !replayOwner) {
    summary += `ℹ️ prototype ${protoStem}: REPLAY skipped — this spec's File Plan does not own ${replayFile}; ` +
      `the sibling spec that carries that row replays the contract\n`
  }
  return `## Step: checkpoint commit\n` +
    summary +
    `Commit every File Plan path on the working branch (never --no-verify) — this is the ` +
    `checkpoint commit.\n` +
    `Then: node ${__filename} ${specPath} --mark committed`
}
// Before a green replay this prints the invitation (boot the app, then --mark replayed);
// once replay-state.json records a pass it re-prints as the look stop — same state, different
// render — until `--mark looked` ends it.
function replayStepBody() {
  const contractRel = 'design/prototypes/' + protoStem + '/contract.json'
  const doc = readReplayState()
  const addr = replayAddress()
  if (!doc || doc.passed !== true) {
    const boot = protoBootCommand() ||
      '(neither prototype.bootCommand nor runtime.bootCommand is declared in the host config)'
    const where = addr.url ? addr.url : '(no prototype.url declared in the host config)'
    return `## Step: replay the contract's tests against the production build\n` +
      `Read only: ${contractRel}\n` +
      `Session: start the app in the background (tracked) so it answers at ${where}: ${printable(boot, { PORT: addr.port })}\n` +
      `Then: node ${__filename} ${specPath} --mark replayed`
  }
  const contract = readContract()
  const stateRel = path.relative(repoRoot, replayStatePath)
  const lines = [
    `## Step: the production screens beside the prototype's pictures`,
    `Read only: ${contractRel}, ${stateRel}`,
    `✅ contract tests green against the production build — ${doc.tests} tests (${doc.log})`,
    `🎨 production screens beside the prototype captures — ${addr.url}`,
  ]
  for (const [route, states] of Object.entries(contract.routes || {})) {
    for (const [stateName, entry] of Object.entries(states)) {
      lines.push(`route ${route} (${stateName}): ${joinAddress(addr.url, entry.url)} · ` +
        `design/prototypes/${protoStem}/${entry.capture}`)
    }
  }
  lines.push('Reply `close enough` to continue; anything else is a fix for this session, then:')
  lines.push(`  node ${__filename} ${specPath} --mark replayed`)
  lines.push('Then (only on the literal close enough):')
  lines.push(`  node ${__filename} ${specPath} --mark looked`)
  return lines.join('\n')
}
function stepBody(s) {
  if (s === 'TESTS') return testsStepBody()
  if (s === 'RED_FINDINGS') return redFindingsStepBody()
  if (s === 'RED_ATTRIBUTION') return redAttributionStepBody()
  if (s.startsWith('WAVE:')) return waveStepBody(s.slice('WAVE:'.length))
  if (s === 'INTEGRATION') return integrationStepBody()
  if (s === 'REPAIR') return repairStepBody()
  if (s === 'ESCALATE') return escalateStepBody()
  if (s === 'REPLAY') return replayStepBody()
  if (s === 'COMMIT') return commitStepBody()
  die('internal error: no step body for state ' + s)
}

writeOut(1, `[spec-build-driver] state: ${state}  spec: ${specPath}\n` +
  (transitionNote ? transitionNote + '\n' : '') +
  `(re-run this driver after completing the step; it verifies artifacts and prints the next one)\n\n` +
  stepBody(state) + '\n')
process.exit(0)
