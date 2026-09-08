#!/usr/bin/env node
// Deterministic state-machine driver for /spec:build.
//
// spec-build-driver <spec.md> [--via loop|direct]      -> print current state + ONLY that step
// spec-build-driver <spec.md> --mark <mark> [args]     -> verify artifacts, record, print next step
//   marks: tests-authored | red-attributed |
//          wave-done --wave <label> --workers <n> | integrated |
//          repair-applied --continued <n> --spawned <n> | committed
// spec-build-driver <spec.md> --state                  -> print the state name only (scripting)
//
// specs/20260901/02-run-provenance.md (D5): --via <loop|direct> is recorded
// once, at sidecar creation (default "direct"; a later invocation naming a different value is
// ignored) and the DONE row gains `via`/`model` immediately after `tier` — model derived at
// row-write time by lib/session-stamp.js's sessionModel(repoRoot), `null` on a host with no
// .claude/spec-session.json stamp.
//
// States: PREFLIGHT (driver-only) -> TESTS -> RED_CHECK (driver-only) -> RED_FINDINGS? ->
//   RED_ATTRIBUTION? -> WAVE:<label>... -> INTEGRATION -> GATE (driver-only) ->
//   REPAIR? (cap 3; 4th -> ESCALATE, terminal) -> COMMIT -> DONE (terminal)
//
// WHY THIS EXISTS: specs/20260901/01-build-driver.md — /spec:build was a
// 161-line markdown procedure with no driver and no state file: it resumed by inspecting the
// diff, ran the red-check/gate/scope-reconcile by hand, and hand-appended its own ledger row —
// the last stage in the per-feature loop whose deterministic choreography was still performed by
// an LLM. This driver, on spec-review-driver.js's own contract (specs/20260820/07 D1 — a proven
// shape, not a second one to learn), EXECUTES every deterministic step itself (admission, wave
// derivation, gate resolution, env preflight, the hardened->implementing flip, red-check, the
// final gate, scope-reconcile, diff counts, the stage:"build" ledger row) and prints ONLY the
// step that needs this session's judgment (test-author dispatch, red attribution, per-wave
// worker dispatch, host integration, repair dispatch, the checkpoint commit). State is
// re-derived from spec frontmatter + the <spec>.build/ sidecar + on-disk artifacts on EVERY
// invocation — a mark whose artifact vanished is demanded again.
//
// What this deliberately does NOT do: dispatch any agent, write the Decisions table, render a
// user-facing report, or run a git write (its own git calls are rev-parse/diff/status only) —
// D12. It never accepts an "unsanctioned green" itself; the sanction stays in the spec's own
// carriers (`[pre-green:]`, `SHALL CONTINUE TO`) that red-check reads — a driver mark that let
// the session record "the user said it's fine" would be a second sanction channel invisible to
// review's ac-matrix (D4 rationale). It never creates, enters, or leaves a worktree (build_base
// stays /git:enter-worktree's field).
//
// Exit codes: 0 = step printed / mark accepted / --state printed
//             2 = precondition failure or refused mark (stderr names the artifact + remedy;
//                 state unchanged) — includes env-preflight exit non-zero (its output printed
//                 verbatim), red-check exit 2 (a usage/config failure, not the D7 resume-skip
//                 case, which is handled without ever invoking red-check), an unresolved gate
//                 ({gate:null} from lib/gate-resolve.js), a fourth repair-applied past the
//                 3-round cap (touches <spec>.build/gate-cap), a mark issued at a state that does
//                 not print it (stderr names the current state; state unchanged), and any wrapped
//                 child process dying with no exit code (signal-killed, never spawned, or
//                 maxBuffer-overflowed) via lib/driver-io.js's runChild() fail-closed refusal,
//                 and a re-run on a status: implementing spec with no sidecar whose build is
//                 already DONE (a stage:"build" ledger row names this spec) — refused before any
//                 sidecar is opened, remedy = the review driver.

'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { runChild, writeOut, appendLedger, loadSidecar, saveSidecar: saveSidecarLib } = require('./lib/driver-io')
const { fmValue } = require('./lib/frontmatter')
const { readConfig } = require('./lib/host-config')
const { resolveGate } = require('./lib/gate-resolve')
const { parseFilePlanRows } = require('./lib/file-plan')
const { globMatch } = require('./lib/glob-match')
// D5 (specs/20260901/02-run-provenance.md): model is derived at row-write time (never once at
// startup) — the review driver's own sibling reasoning applies here too.
const { sessionModel } = require('./lib/session-stamp.js')

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
const STATE_ONLY = argv.includes('--state')

const PLUGIN = path.resolve(__dirname, '..')
const redCheckBin = path.join(PLUGIN, 'scripts/red-check.js')
const envPreflightBin = path.join(PLUGIN, 'scripts/env-preflight.js')
const scopeReconcileBin = path.join(PLUGIN, 'scripts/scope-reconcile.js')
const specStatusBin = path.join(PLUGIN, 'scripts/spec-status.js')

// D6/A3 (mirrors spec-review-driver.js): repoRoot is the driver's INHERITED CWD, never derived
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
const specRel = path.relative(repoRoot, resolvedSpecPath) || resolvedSpecPath
const sidecarDir = resolvedSpecPath.replace(/\.md$/, '.build')
const sidecarRel = path.relative(repoRoot, sidecarDir)
const deviationsPath = resolvedSpecPath.replace(/\.md$/, '.deviations.md')
const gateCapPath = path.join(sidecarDir, 'gate-cap')
const hostConfig = readConfig(repoRoot)
const pipelineRulesPath = (() => {
  const rel = hostConfig.pipelineRules
  if (!rel || typeof rel !== 'string') return null
  const abs = path.resolve(repoRoot, rel)
  return fs.existsSync(abs) ? abs : null
})()

// File Plan body text never moves when only the frontmatter is edited (stamping diff_base,
// flipping status) — computed once against the pre-image text.
const filePlanRows = parseFilePlanRows(specText)
const hasTestsRows = filePlanRows.some((r) => /^tests?$/i.test((r.layer || '').trim()))
const needsRedAttribution = filePlanRows.some((r) =>
  !/^tests?$/i.test((r.layer || '').trim()) && (r.action || '').trim().toUpperCase() === 'CREATE')

// ---- D2: admission ------------------------------------------------------------------------------
const OWNING_COMMAND = { draft: '/spec:plan', done: '/spec:status', superseded: '/spec:status' }
if (status !== 'hardened' && status !== 'implementing') {
  die('spec status is "' + (status || '<missing>') + '" — spec-build-driver requires status: ' +
    'hardened (or implementing to resume); ' + (OWNING_COMMAND[status] || '/spec:status') +
    ' is the owning command')
}

let justFlipped = false
if (status === 'hardened') {
  // ---- design admission (D2) ---------------------------------------------------------------
  const hostDesignConfig = hostConfig.design
  if (hostDesignConfig && fmVal('design') === 'true' && !fmVal('designed')) {
    die('spec declares design: true with no designed: in a host whose config declares a design ' +
      'block — run /spec:design ' + specPath + ' first')
  }

  // ---- PREFLIGHT (driver-only) -------------------------------------------------------------
  const pre = runChild(process.execPath, [envPreflightBin, '--root', repoRoot], { encoding: 'utf8' },
    'env-preflight.js')
  if (pre.status !== 0) {
    if (pre.stdout) writeOut(1, pre.stdout)
    if (pre.stderr) process.stderr.write(pre.stderr)
    process.exit(2)
  }

  // ---- stamp diff_base whenever it is absent (specs/20260901/01-build-driver.md) ---
  // Absent-only stamping in BOTH fields would leave a spec already carrying `build_base` unpinned,
  // on the reasoning that build_base already answered "what is this built against". It does not —
  // build_base is conventionally the moving ref `main`, and /git:enter-worktree writes it at any
  // time, including after a build has run. HEAD at build start is the true pre-image in both the
  // in-place and worktree flows, so pin it unconditionally; `build_base` then means only "merge
  // target", which is all merge-back.sh branch-for needs of it. Consumers already prefer the pin
  // (replay.js:374, and now spec-review-driver.js's resolveBase), so an existing build_base must
  // never suppress the one durable fact a later review needs.
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
// A PIN ALWAYS BEATS A REF — see lib/base-derivation.js for the incident. This driver's own
// contradiction ran twelve lines: the stamp block above pins `diff_base` unconditionally and its
// comment says "consumers already prefer the pin (replay.js, and now spec-review-driver.js's
// resolveBase)", while this function was the one consumer that did not. The field symptom was
// red-check refusing "pre-image is not pure" over the very files the design stage had just
// legitimately committed — with the ref winning, the purity set was computed against `main`
// rather than against post-design HEAD.
//
// THE VALIDITY PREDICATE HERE IS ANCESTRY, NOT NON-DEGENERACY. spec-review-driver.js refuses
// `base === HEAD` because an empty range at review time IS the false-CLEAN failure. Porting that
// guard here would be wrong and would refuse every legitimate fresh build: at build start the
// stamp block sets diff_base to HEAD precisely because nothing is built yet, so base === HEAD is
// the correct state (`merge-base --is-ancestor X X` is true, so it passes here by design). What
// is never correct on this side is a base that is NOT an ancestor of HEAD — that is exactly what
// a moving `main` becomes once it advances past the build's branch, and `git diff <base>` against
// it reports edits this build never made. replay.js validates its own candidates the same way.
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

// ---- D7 (specs/20260901/01-build-driver.md, AC-14): resume without a sidecar --------------------
// A status: implementing spec with no <spec>.build/ directory on disk (a resumed cold session
// with landed, uncommitted work) cannot run red-check on the post-image tree — that would prove
// nothing about vacuity (red-check's own purity refusal is correct; the honest alternative is to
// record the skip on the row, never to force a git checkout of landed work to satisfy a check
// whose answer is already unknowable).
// The ONE "differs from base" predicate on this side: tracked edits since `base` union every
// untracked path. Byte-for-byte the set red-check.js computes for its own pre-image purity
// refusal — the two must agree, because a path red-check calls impure is exactly a path this
// driver must call dirty (handleRedAttributed's former private `fs.existsSync` test was a third,
// cruder spelling of the same question, and it disagreed: it called a file dirty for EXISTING,
// which is true of every component the design stage legitimately committed before the build
// started).
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
    .filter((r) => !/^tests?$/i.test((r.layer || '').trim())).flatMap((r) => r.paths)
  return nonTestsPaths.filter((p) => changed.has(p))
}

const sidecarExisted = fs.existsSync(sidecarDir)

// ---- build already DONE ----------------------------------------
// The sidecar is removed at DONE, so "status: implementing, no sidecar" is also the state a
// finished build leaves behind until the review driver opens its own sidecar. The ledger is the
// one on-disk fact that tells the two apart: a stage:"build" row is written only at DONE, so its
// presence for this spec IS the terminal outcome — no extra outcome field is needed. Refused
// before any sidecar is opened (state unchanged), remedy = the review driver.
if (!sidecarExisted && !justFlipped) {
  const doneRow = ledgerBuildRow(repoRoot, specRel)
  if (doneRow) {
    die('build already DONE for ' + specRel + ' (ledger row ' + doneRow.runId + ', ' + doneRow.ts +
      ') — run the review driver: node ' + path.join(PLUGIN, 'scripts/spec-review-driver.js') + ' ' +
      specPath + (flag('--via') === 'loop' ? ' --via loop' : ''))
  }
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
  // D5 (specs/20260901/02-run-provenance.md): --via recorded once, at sidecar creation — a later
  // invocation naming a different --via is ignored, mirroring the review driver's own D4 (flag()
  // reads any --via value present, A5-style; anything but exactly "loop" defaults to "direct").
  if (marks.via === undefined) marks.via = flag('--via') === 'loop' ? 'loop' : 'direct'
  saveSidecar()
}

// ---- wave derivation (D2/Behavior) ---------------------------------------------------------------
function computeWaveOrder() {
  const layerGroups = Array.isArray(hostConfig.layerGroups) ? hostConfig.layerGroups : []
  const nonTests = filePlanRows.filter((r) => !/^tests?$/i.test((r.layer || '').trim()))
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
  // A declared group with no File Plan rows is not a wave (two
  // empty groups each printed a dispatch step with no layers and demanded a --workers 0 mark).
  // Skipped here, at derivation, so no state ever names it; the WAVE step prints the skips once.
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

// ---- gate (GATE, driver-only) ---------------------------------------------------------------------
function runGate() {
  const resolved = resolveGate(specText, hostConfig)
  if (!resolved.gate) {
    die('gate could not be resolved — ' + (resolved.reason || 'no gateCommand declared') +
      ' — add File Plan test rows or a gateCommand, then re-run this driver')
  }
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const k = (marks.gateRuns || []).length + 1
  fs.mkdirSync(sidecarDir, { recursive: true })
  const logPath = path.join(sidecarDir, 'gate-' + k + '.log')
  // The gate's stdout+stderr go straight to the log fd, never through a Node pipe: a host's
  // full gate (integration suites logging every request) routinely exceeds spawnSync's 1 MiB
  // default maxBuffer, and an in-memory capture then SIGTERM-kills the child mid-run (ENOBUFS)
  // with a null status — a green gate reported as "died without an exit code". Same pattern as
  // genesis-driver.js's runLogged; nothing downstream reads the captured text — every reader
  // follows `gateRuns[k].log`.
  let fd
  try {
    fd = fs.openSync(logPath, 'w')
  } catch (e) {
    die('could not open gate log ' + logPath + ' for writing (' + e.message + ') — check the ' +
      'sidecar directory is writable and re-run')
  }
  let r
  try {
    r = runChild('bash', ['-c', resolved.gate], { cwd: repoRoot, stdio: ['ignore', fd, fd], env },
      'gate (' + resolved.gate + ')')
  } finally {
    try { fs.closeSync(fd) } catch (e) { /* already closed */ }
  }
  marks.gateRuns = marks.gateRuns || []
  marks.gateRuns.push({ exit: r.status, log: logPath })
  saveSidecar()
}

// ---- mark handlers --------------------------------------------------------------------------------
// A tests-layer File Plan row may be a glob (sanctioned by scope-reconcile.js, D2 of
// specs/20260813/03-gate-script-mechanics.md, and expanded the same way by red-check.js). A
// pattern is satisfied by at least one matching file on disk; a literal path by its own
// existence. Expansion goes through lib/glob-match.js — never a private matcher.
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
    /^tests?$/i.test((r.layer || '').trim()) && (r.action || '').trim().toUpperCase() !== 'DELETE')
  const remedy = ' — author it, then re-run `node ' + __filename + ' ' + specPath +
    ' --mark tests-authored`'
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

// Residue is "differs from base", never "exists on disk".
//
// The former predicate was a bare `fs.existsSync` per CREATE path, and it contradicted the design
// stage's own published promise — spec/commands/design.md: "Components built here are real and
// kept — /spec:build wires them, never rebuilds them." A design-landed component is committed
// BEFORE the build starts, so it is in the pre-image, so it exists on disk, so every design:true
// spec had to hand-edit its File Plan CREATE -> MODIFY to get past this mark. Two stages of the
// same pipeline disagreed about what a CREATE row means.
//
// This is a DELETION, not a new rule: `changedSinceBase()` is the predicate red-check.js already
// applies for its pre-image purity refusal, and the one this driver already applies in
// dirtyNonTestsPaths(). Genuine residue — an uncommitted stub left by an abandoned earlier build —
// is untracked or differs from base, so it is still caught, with the same refusal text.
//
// The case the old rule caught that this one does not is a stale stub COMMITTED at base. That is
// deliberate: red-check already catches it, and better. A committed stub is part of the pre-image,
// so the red tests run against it, and if the stub makes them pass, red-check's own vacuity check
// fails honestly ("red-expected file passed against the pre-image") instead of refusing a mark
// with a guess. What a tracked-at-base CREATE row earns here is one WARN naming the row, never a
// refusal — the File Plan is very likely stale, but that is a planning observation, not grounds to
// stop a build whose pre-image is provably clean.
function handleRedAttributed() {
  const rows = filePlanRows.filter((r) =>
    !/^tests?$/i.test((r.layer || '').trim()) && (r.action || '').trim().toUpperCase() === 'CREATE')
  const createPaths = rows.flatMap((r) => r.paths)

  // D7's resume arm already answered the residue question for this run: on a cold resume with
  // landed, uncommitted work, red-check is recorded as "skipped-resume" precisely because the
  // post-image tree cannot be judged for vacuity. Every non-tests path is expected to differ from
  // base there, so refusing here would contradict the skip the driver itself recorded.
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

  const trackedAtBase = createPaths.filter((p) => {
    const r = runChild('git', ['-C', repoRoot, 'cat-file', '-e', base + ':' + p],
      { encoding: 'utf8' }, 'git cat-file -e (CREATE row tracked at base)')
    return r.status === 0
  })
  if (trackedAtBase.length) {
    process.stdout.write('[spec-build-driver] WARN: File Plan CREATE row(s) already tracked at ' +
      'the build base: ' + trackedAtBase.join(', ') + ' — the pre-image is clean, so the build ' +
      'continues; the row is likely stale (a design-stage component the plan still calls CREATE). ' +
      'Consider MODIFY. If a stale stub is what these are, red-check\'s vacuity check is what ' +
      'catches it.\n')
  }

  marks.redAttributed = true
  saveSidecar()
  return null
}

// A File Plan row may be a glob (specs/20260902/02-plugin-code-sweep.md D10, the same rule
// handleTestsAuthored applies): a CREATE/MODIFY pattern verifies when at least one file matches,
// a DELETE pattern when none does. Expansion goes through lib/glob-match.js — never a private
// matcher.
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

function handleIntegrated() {
  if (pendingWave()) die('integrated refused — a wave is still pending; mark every wave-done first')
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
        'Two exits: edit the tree and delete ' + gateCapPath + ' to re-arm one more round, or ' +
        'delete ' + sidecarDir + ' entirely to restart cold.')
    }
    // capEverTripped is true and gate-cap has been deleted — a deliberate re-arm: one deletion
    // buys exactly one more round. The cap re-trips only if that round is still red; a round
    // that goes green proceeds to COMMIT instead.
    // Gate runs BEFORE the round is recorded: if the child dies with no exit code, runGate()
    // exits the process itself, and `repairs` must not have been persisted for a round that
    // never actually completed (D1 — exit 2 leaves state unchanged).
    runGate()
    marks.repairs.push({ continued, spawned })
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

function gitStatusPaths(root) {
  const r = runChild('git', ['-C', root, 'status', '--porcelain', '--untracked-files=all'],
    { encoding: 'utf8' }, 'git status --porcelain')
  return r.stdout.split('\n').filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ''))
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
  // D3: no File Plan path — tests-layer rows included — may appear in `git status --porcelain`.
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
  // D5: model is derived HERE, at row-write time (never once at startup) — the review driver's
  // own D2/D4 reasoning applies here too: right after /clear the new transcript has no assistant
  // line yet, and by the time COMMIT runs the session has spoken many times.
  const model = sessionModel(repoRoot)
  const row = {
    ts: new Date().toISOString(),
    spec: specRel,
    stage: 'build',
    tier,
    via: marks.via || 'direct',
    model,
    runId,
    diff: { files: diffFiles, loc: diffLoc },
    gate: { finalRounds: (marks.gateRuns || []).length },
    deviations: countDeviations(),
    redCheck: marks.redCheck || 'none',
    workers,
  }
  appendLedger(repoRoot, JSON.stringify(row))
  fs.rmSync(sidecarDir, { recursive: true, force: true })
  printDoneNow()
}

// ---- D3 admission: a mark is admissible only at the state that prints it -----------------------
// Every handler verifies its own artifacts, but a mark whose artifact predicate is trivially true
// at some OTHER state would otherwise land off-script: `integrated` has no artifact at all, so it
// re-ran the gate from REPAIR (an uncounted repair round that never trips the cap) and from
// ESCALATE (laundering the terminal state into COMMIT with gate-cap still on disk);
// `red-attributed` before TESTS is through pre-records the judgment step so it is never printed.
// deriveState() is pure, so this reuses the exact derivation the bare invocation prints from —
// legitimate re-entry (a gate that died without an exit code leaves the state at INTEGRATION and
// the driver prints `integrated` again) still admits.
const MARK_STATE = {
  'tests-authored': (s) => s === 'TESTS',
  'red-attributed': (s) => s === 'RED_ATTRIBUTION',
  'wave-done': (s) => s.startsWith('WAVE:'),   // the label match stays in handleWaveDone (AC-6's message)
  'integrated': (s) => s === 'INTEGRATION',
  'repair-applied': (s) => s === 'REPAIR',
  'committed': (s) => s === 'COMMIT',
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

function handleMark() {
  switch (MARK) {
    case 'tests-authored': return handleTestsAuthored()
    case 'red-attributed': return handleRedAttributed()
    case 'wave-done': return handleWaveDone()
    case 'integrated': return handleIntegrated()
    case 'repair-applied': return handleRepairApplied()
    case 'committed': return handleCommitted() // exits the process itself
    default:
      die('unknown mark "' + MARK + '" (tests-authored | red-attributed | wave-done --wave ' +
        '<label> --workers <n> | integrated | repair-applied --continued <n> --spawned <n> | committed)')
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
  return afterWaves()
}

// ---- run -------------------------------------------------------------------------------------------
let forcedState = null
if (MARK) { admitMark(); forcedState = handleMark() }
if (!STATE_ONLY) ensureRedCheckAdvanced()
const state = forcedState || deriveState()

if (STATE_ONLY) { writeOut(1, state + '\n'); process.exit(0) }

// ---- step bodies -------------------------------------------------------------------------------
function testsStepBody() {
  const paths = filePlanRows.filter((r) =>
    /^tests?$/i.test((r.layer || '').trim()) && (r.action || '').trim().toUpperCase() !== 'DELETE')
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
function redFindingsStepBody() {
  return `## RED_FINDINGS — red-check reports the pre-image does not match expectations\n` +
    (marks.lastRedCheckOutput || '') + '\n' +
    `Fix the test file(s) above so the pre-image is genuinely red where expected, then re-run ` +
    `this driver with no mark — it re-runs red-check itself:\n  node ${__filename} ${specPath}`
}
function redAttributionStepBody() {
  const createPaths = filePlanRows.filter((r) =>
    !/^tests?$/i.test((r.layer || '').trim()) && (r.action || '').trim().toUpperCase() === 'CREATE')
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
  for (const r of rows) {
    const layer = (r.layer || 'other').trim() || 'other'
    if (!perLayer.has(layer)) perLayer.set(layer, [])
    for (const p of r.paths) perLayer.get(layer).push({ path: p, action: r.action })
  }
  const body = [...perLayer.entries()].map(([layer, files]) => {
    const agent = agentMap[layer] || agentMap.default || 'general-purpose'
    return `  layer: ${layer}  agent: ${agent}\n` + files.map((f) => '    ' + JSON.stringify(f)).join('\n')
  }).join('\n')
  const skippedNote = skippedWaves.length
    ? `empty wave(s) skipped — no File Plan rows: ${skippedWaves.join(', ')}\n`
    : ''
  return skipNote + skippedNote +
    `## Step: wave ${label} — spawn one long-lived Agent {model: sonnet} per layer above and KEEP it\n` +
    body + '\n' +
    `spec: ${specPath}\n` +
    `pipeline rules: ${pipelineRulesPath || '(none declared)'}\n` +
    `deviations sidecar: ${deviationsPath}\n` +
    `Then: node ${__filename} ${specPath} --mark wave-done --wave ${label} --workers <n>`
}
function integrationStepBody() {
  return `## Step: host integration\n` +
    `Every wave has landed. Do the session-only integration work (wiring, README, doctrine), ` +
    `then:\n` +
    `Then: node ${__filename} ${specPath} --mark integrated`
}
function repairStepBody() {
  const runs = marks.gateRuns || []
  const round = runs.length
  const current = runs[runs.length - 1]
  const previous = runs[runs.length - 2]
  const roundLabel = marks.capEverTripped ? `round ${round} (re-armed past the cap of 3)` : `round ${round} of 3`
  return `## REPAIR — ${roundLabel}\n` +
    `gate: ${current ? current.log : '(none)'}` +
    (previous ? `\nprevious gate: ${previous.log}` : '') + '\n' +
    `File Plan rows by layer, so failures route to the worker that owns them:\n` +
    waveOrder.map((w) => `  ${w.label}: ` + w.rows.flatMap((r) => r.paths).join(', ')).join('\n') + '\n' +
    `Route each failing file to the worker that owns its layer (SendMessage; spawn fresh only if ` +
    `that worker is gone). Then:\n` +
    `Then: node ${__filename} ${specPath} --mark repair-applied --continued <n> --spawned <n>`
}
function escalateStepBody() {
  return `## ESCALATE — repair iteration cap (3) reached\n` +
    `A fourth repair-applied was refused. Surface this to the user — a capped run needs a decision.\n` +
    `Remedy — two exits:\n` +
    `  edit the tree and delete ${gateCapPath} to re-arm exactly one more round\n` +
    `  delete ${sidecarDir} entirely to restart cold\n`
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
  return `## Step: checkpoint commit\n` +
    summary +
    `Commit every File Plan path on the working branch (never --no-verify) — this is the ` +
    `checkpoint commit.\n` +
    `Then: node ${__filename} ${specPath} --mark committed`
}
function stepBody(s) {
  if (s === 'TESTS') return testsStepBody()
  if (s === 'RED_FINDINGS') return redFindingsStepBody()
  if (s === 'RED_ATTRIBUTION') return redAttributionStepBody()
  if (s.startsWith('WAVE:')) return waveStepBody(s.slice('WAVE:'.length))
  if (s === 'INTEGRATION') return integrationStepBody()
  if (s === 'REPAIR') return repairStepBody()
  if (s === 'ESCALATE') return escalateStepBody()
  if (s === 'COMMIT') return commitStepBody()
  die('internal error: no step body for state ' + s)
}

writeOut(1, `[spec-build-driver] state: ${state}  spec: ${specPath}\n` +
  `(re-run this driver after completing the step; it verifies artifacts and prints the next one)\n\n` +
  stepBody(state) + '\n')
process.exit(0)
