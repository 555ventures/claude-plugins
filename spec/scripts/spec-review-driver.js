#!/usr/bin/env node
// Deterministic state-machine driver for /spec:review.
//
// WHY: specs/20260820/07-review-driver.md (brief 16) — /spec:review hand-performed ~14
// choreography steps around review-legs.js/verdict.js/merge-back.sh every review: resolve the
// base, launch legs, append the GATE_RED ledger line by hand, run three separate verdict.js
// passes, flip status, drive merge-back's inspect/merge/cleanup/verify sequence. Every one of
// those steps is deterministic; procedural hallucination — skipping or fabricating a step while
// reporting success — is the measured largest agent-failure class (38.5%, agenticrail.nz
// 2026-08-08). This driver, on the spec-design-driver.js contract, EXECUTES every deterministic
// step itself (base derivation, the per-iteration manifest lifecycle, review-legs.js, all three
// verdict.js passes, both ledger appends, the implementing->done flip, the merge-back sequence,
// REPLAY's own replay --due/--select derivation) and prints ONLY the step that needs this
// session's judgment (reviewer + design-leg dispatch, dispositions, the Canonical Delta +
// deviations fold, the close commit, merge strategy, conflict resolution, and the due replay's
// own execution phases). State is re-derived from spec frontmatter + the <spec>.review/
// sidecar + on-disk artifacts on EVERY invocation — a mark whose artifact vanished is demanded
// again, and the fix-iteration cap is counted from manifest-<n>.jsonl files actually present on
// disk, never a sidecar counter (hand-editing the sidecar cannot reach ESCALATE). Every child
// process this driver spawns — legs, all three verdict.js passes, replay --due/--select,
// spec-status --next, every merge-back.sh subcommand, every git call — is routed through one
// fail-closed helper (runChild): spawnSync's status is null when a child dies by signal,
// never spawns, or overflows maxBuffer, and treating that null as a pass (or as an inline .stdout.trim() of a
// child that never ran) is the exact silent-success failure this driver exists to prevent.
//
// What this deliberately does NOT do: recommend a disposition, pick a merge strategy, or render
// a user-facing report (D9) — it prints machine summaries plus which judgment is due and the
// evidence paths; report assembly stays with the session via report-render.js. It never asserts
// the verdict word itself (verdict.js is the sole derivation, surfaced through this driver).
//
// specs/20260822/01-escalate-ledger-row.md (D5-D10, 2026-08-22): a review that burns its fix loop
// to the cap and is then abandoned used to write ZERO ledger rows — three leg iterations and three
// reviewer dispatches left no trace, because the only two append points were the hard-stop and the
// CLEAN close and the ESCALATE refusal reached neither. writeEscalateRow() is the third write
// point: called from handleFixApplied()'s cap branch before die() (the refusal is the last
// guaranteed execution moment an abandoning session ever runs), self-healed from a bare
// re-invocation parked at ESCALATE (a session that walks away never re-invokes with `fix-applied`
// again), idempotent on marks.escalateRunId, and durable via the exact spec-04 stopped-ledger path
// (never a new filename). A verdict.js exit 2 during the escalate pass (evidence drift — a red leg
// going green between the dispositions pass and the cap) is never a crash: it is embedded in the
// refusal/step text verbatim and retried on the next invocation, so the cap record itself is never
// lost. The D10 silent-loss detector runs once on every entry, stderr-only, and never blocks — it
// exists because spec 04's own A6 assumed a durable-write loss would be observed, when by
// construction it is silent (a dead worktree's durable file simply no longer has the row).
//
// CONTRACT:
//   spec-review-driver <spec.md>                  -> print current state + ONLY that step
//   spec-review-driver <spec.md> --mark <mark>    -> verify artifacts, record, print next step
//     marks: skips-extracted --file <f> | reviewer-returned --file <json> |
//            dispositions --waived N --rejected N --fix-dispatched N | fix-applied | closed |
//            merge-strategy <merge-commit|ff-only|squash|rebase-ff> (bare token) |
//            conflicts-resolved | replay-recorded
//   spec-review-driver <spec.md> --state          -> print the state name only (scripting)
//
// States: LEGS (driver-only) -> STOPPED (terminal on RED_BLOCKING) | SKIPS? -> REVIEWER ->
//   DISPOSITIONS -> FIX/ESCALATE(cap 2, terminal)? -> CLOSE -> MERGE/CONFLICTS -> REPLAY? ->
//   DONE (terminal)
//
// Exit codes: 0 = step printed · 2 = precondition failure or refused mark (message names the
// repair — a missing/malformed artifact, a REVIEWER_FAILED return, dispositions exceeding the
// survivor+leg-finding pools via verdict.js's own contradiction arithmetic, a dirty tree at
// `closed`, a third `fix-applied` past the iteration cap, `merge-strategy` marked while the
// driver's own inherited CWD sits inside the build worktree, ANY wrapped child process dying with
// no exit code — signal-killed, never spawned, or maxBuffer-overflowed — via runChild()'s
// fail-closed refusal, a legs iteration reporting success with a missing/empty manifest, or a
// cold invocation on a spec already marked status: done whose sidecar carries no closeRunId of
// its own (use /spec:escape instead), a `replay-recorded` mark with no new stage:"replay" ledger
// row for the sidecar target's reviewRunId, or replay.js --select exiting 0 while printing no
// parseable selection line).

'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')
// The repo's ONE ledger reader (live + year archives, in read order) — REPLAY counts
// stage:"replay" rows through it rather than opening the ledger a second way.
const { readLedgerRows } = require('./lib/observation')
// D4 (specs/20260823/03-silent-drop-hardening.md): the one shared frontmatter reader, replacing
// this driver's own local copy (rv_e83659d49386). D2 (specs/20260823/04-review-close-hardening.md):
// fmVal renamed fmValue (D8/D9 — no alias survives); fmBlock replaces this file's own
// `/^---\n([\s\S]*?)\n---/` block regex below.
const { fmBlock, fmValue } = require('./lib/frontmatter')

// D1-D6 (specs/20260821/04-stopped-row-durability.md): a worktree review's RED_BLOCKING hard-stop
// durably appends here, at the MAIN root, instead of the worktree's own (destructible)
// spec-runs.jsonl — closes R3(1) of specs/20260820/07. readLedgerRows() already matches
// /^spec-runs.*\.jsonl$/ and union-merges in filename order (this file sorts after
// spec-runs.jsonl) — zero reader changes anywhere.
const STOPPED_LEDGER = '.claude/spec-runs.stopped.jsonl'

function die(msg) { process.stderr.write('spec-review-driver: ' + msg + '\n'); process.exit(2) }

// R9: spawnSync's `status` is null when the child dies by signal, fails to spawn, or overflows
// maxBuffer — every branch in this file that reads `.status`/`.code` or trusts `.stdout` without
// checking either used to tolerate that null silently (a SIGKILLed review-legs.js printed
// `state: REVIEWER` over a manifest that was never written). This is the ONE place that death is
// handled: every spawnSync call in the file is routed through here, and only a genuine no-exit-
// code death is fatal — a legitimate non-zero exit (RED_BLOCKING, merge conflicts, a branch that
// doesn't exist yet) still comes back as a normal result for the caller's own branch to read.
function runChild(cmd, args, opts, what) {
  const r = spawnSync(cmd, args, opts)
  if (r.error || r.status === null) {
    const reason = r.error ? r.error.message
      : r.signal ? 'killed by signal ' + r.signal
      : 'exited with no status (spawn failure)'
    die(what + ' died without an exit code (' + reason + ') — nothing it was meant to produce can ' +
      'be trusted; fix the cause and re-run `node ' + __filename + ' ' + (specPath || '<spec.md>') + '`')
  }
  return r
}

const argv = process.argv.slice(2)
const specPath = argv[0]
if (!specPath || specPath.startsWith('--')) {
  die('usage: spec-review-driver <spec.md> [--mark <mark> [args...]] [--state]')
}
if (!fs.existsSync(specPath)) die('spec not found: ' + specPath)

const flag = (name) => { const i = argv.indexOf(name); return i > -1 ? (argv[i + 1] || true) : null }
const markIdx = argv.indexOf('--mark')
const MARK = markIdx > -1 ? argv[markIdx + 1] : null
const STATE_ONLY = argv.includes('--state')

const PLUGIN = path.resolve(__dirname, '..')
const legsBin = path.join(PLUGIN, 'scripts/review-legs.js')
const verdictBin = path.join(PLUGIN, 'scripts/verdict.js')
const mergeBackBin = path.join(PLUGIN, 'scripts/merge-back.sh')
const specStatusBin = path.join(PLUGIN, 'scripts/spec-status.js')
const replayBin = path.join(PLUGIN, 'scripts/replay.js')

// D6/A3: repoRoot is derived from process.cwd() (the driver's INHERITED CWD), never from the
// spec's own path — the whole relocation guard at MERGE depends on the session's shell CWD, not
// on where the spec file happens to live (which stays inside the build worktree even after the
// session cd's back to the main root to accept `merge-strategy`).
const repoRootResult = runChild('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' },
  'git rev-parse --show-toplevel')
if (repoRootResult.status !== 0) {
  die('not inside a git repo (git rev-parse --show-toplevel failed against ' + process.cwd() +
    ') — run this from inside the review root/worktree')
}
const repoRoot = repoRootResult.stdout.trim()
// mergeBackBin's own `root` subcommand: the first entry of `git worktree list`, self-discovering
// from repoRoot regardless of whether repoRoot IS the main root or a linked worktree. Used for the
// D6 relocation check and the merge/cleanup/verify sequence. Ledger + retained evidence are
// written under repoRoot (wherever THIS review is actually running, worktree included, so a plain
// `git merge --ff-only`/`assert_clean_root` at the main root is never dirtied by a review running
// in a linked worktree) and promoted into mainRoot only once a merge has actually landed — see
// finishMerge()'s evidence-promotion step, which also clears repoRoot's copies (+ the sidecar) so
// `git worktree remove` sees a clean tree (D10: the sidecar "dies with the worktree at cleanup").
const mainRoot = mainRootPath()

const resolvedSpecPath = path.resolve(specPath)
const specText = fs.readFileSync(resolvedSpecPath, 'utf8')
const fmRaw = fmBlock(specText)
// D4 (specs/20260823/03-silent-drop-hardening.md, rv_e83659d49386): the local fmVal this replaced
// captured everything after `key:` verbatim, inline comment included — the mechanism that
// polluted seven live review ledger rows' `tier` fields and once broke `build_base:` outright.
// lib/frontmatter.js's fmValue is quote-aware and strips a whitespace-preceded `#` comment.
const fmVal = (k) => fmValue(fmRaw, k)

let status = fmVal('status')
const tier = fmVal('tier') || 'standard'
const area = fmVal('area') || '{area}'
const buildBase = fmVal('build_base')
const diffBaseFm = fmVal('diff_base')
const designFlag = fmVal('design') === 'true'
const designSource = fmVal('design_source')

if (!['implementing', 'done'].includes(status)) {
  die('spec status is "' + (status || '<missing>') + '" — spec-review-driver requires ' +
    'status: implementing (or done for a re-run); run /spec:build first')
}

// `let`, not `const`: a worktree merge relocates the sidecar into the main root mid-invocation
// (D8 (b)) — REPLAY runs after `merge-back.sh cleanup` has already deleted the worktree the
// sidecar used to live in. `replaySpecPath` is the path the REPLAY step tells the session to
// re-invoke with, which after that relocation is the main root's copy of the spec, never the
// deleted worktree's.
let sidecarDir = resolvedSpecPath.replace(/\.md$/, '.review')
let sidecarRel = path.relative(repoRoot, sidecarDir)
let stateFile = path.join(sidecarDir, 'review-state.json')
let replaySpecPath = specPath
const specRel = path.relative(repoRoot, resolvedSpecPath) || resolvedSpecPath

let marks = {}
try { marks = JSON.parse(fs.readFileSync(stateFile, 'utf8')) } catch { marks = {} }
// D8/D9: set only when a self-heal attempt (deriveState()'s ESCALATE arm) hits a verdict.js drift
// refusal — the ESCALATE step text names it in place of the (unset) escalateLedgerPath. Never
// persisted: a fresh invocation retries the write from scratch rather than trusting a stale error.
let escalateDriftError = null
function saveSidecar() {
  fs.mkdirSync(sidecarDir, { recursive: true })
  fs.writeFileSync(stateFile, JSON.stringify(marks, null, 2) + '\n')
}

// ---- D10: silent-loss detector, run once per invocation, stderr-only, never blocks ------------
// specs/20260822/01-escalate-ledger-row.md: spec 04's own A6 assumed loss would be "observed", but
// the loss is silent by construction (a dead worktree's durable file just quietly no longer has the
// row) — this is the trigger. Checked only against a DURABLE path (one whose basename isn't the
// plain tracked ledger — an in-place spec-runs.jsonl append rides normal git history and has no
// comparable loss mode). Partial by design (a dead worktree's sidecar never speaks at all — this
// only catches the case where THIS sidecar is still readable but the row it points at is not).
function checkDurableRowPresent(ledgerPathKey, runIdKey) {
  const ledgerPath = marks[ledgerPathKey]
  const rid = marks[runIdKey]
  if (!ledgerPath || !rid || path.basename(ledgerPath) === 'spec-runs.jsonl') return
  let rows = []
  try {
    rows = fs.readFileSync(ledgerPath, 'utf8').split('\n').filter((l) => l.trim())
      .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch { rows = [] }
  const present = rows.some((r) => r.spec === specRel && r.runId === rid)
  if (!present) {
    process.stderr.write('spec-review-driver: durable ledger row for ' + specRel + ' (runId ' + rid +
      ') is no longer readable at ' + ledgerPath + ' — the row may have been lost (a dead worktree, ' +
      'a manual edit, or file truncation); this is an observation only and does not block or change ' +
      'this invocation\'s result\n')
  }
}
checkDurableRowPresent('stoppedLedgerPath', 'runId')
checkDurableRowPresent('escalateLedgerPath', 'escalateRunId')

// ---- terminal cold path: no sidecar, status already done -> DONE, no auto-restart -------------
const sidecarExistsAtStart = fs.existsSync(sidecarDir)
if (!sidecarExistsAtStart && status === 'done') {
  printDoneNow('')
}
// R8: a spec already marked done whose sidecar does not carry THIS run's own closeRunId is not
// mid-review — either the promise was already kept and the sidecar is a stray/hand-recreated
// artifact, or an aborted run left one behind. Re-walking a full review here can never reach
// doCloseWork() again (it is gated on status !== 'done'), so it would print CLOSE with
// runId: undefined and append zero ledger rows while looking like a real run. Refuse instead. A
// sidecar that DOES carry this run's own closeRunId is the normal tail of a successful run and
// must keep flowing to MERGE/DONE below (AC-20260820-07-12) — unaffected by this check.
if (status === 'done' && !marks.closeRunId) {
  die('spec status is already "done" and ' + sidecarRel + ' does not record this run\'s own ' +
    'close — the authoritative verdict for this spec already ran; use /spec:escape to record a ' +
    'defect that escaped a review that already passed, not another review run')
}

// ---- base derivation (D2: build_base -> diff_base -> branch) ----------------------------------
function resolveBase() {
  if (buildBase) return buildBase
  if (diffBaseFm) return diffBaseFm
  for (const cand of ['main', 'master']) {
    const r = runChild('git', ['-C', repoRoot, 'merge-base', 'HEAD', cand], { encoding: 'utf8' },
      'git merge-base HEAD ' + cand)
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim()
  }
  die('spec frontmatter carries neither build_base nor diff_base, and no main/master branch ' +
    'exists to derive one from — add build_base (or diff_base) to the spec frontmatter')
}
const base = resolveBase()

// ---- manifest helpers ---------------------------------------------------------------------------
function manifestPathFor(n) { return path.join(sidecarDir, `manifest-${n}.jsonl`) }
function outDirFor(n) { return path.join(sidecarDir, `legs-${n}`) }
function listManifestNumbers() {
  if (!fs.existsSync(sidecarDir)) return []
  return fs.readdirSync(sidecarDir)
    .map((f) => /^manifest-(\d+)\.jsonl$/.exec(f))
    .filter(Boolean).map((m) => Number(m[1])).sort((a, b) => a - b)
}
function readManifestRows(p) {
  if (!fs.existsSync(p)) return []
  return fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
}
// Mirrors review-legs.js's own blocking-leg/exit rule (gate/smoke/ci; smoke's exit 4 = sanctioned
// inert-green) — this is plumbing over review-legs.js's OWN typed exit codes, never a second
// derivation of a verdict word (verdict.js stays the sole derivation of that).
const BLOCKING_LEGS = new Set(['gate', 'smoke', 'ci'])
function isRedBlocking(rows) {
  for (const r of rows) {
    if (!BLOCKING_LEGS.has(r.leg)) continue
    const red = r.leg === 'smoke' ? (r.exit !== 0 && r.exit !== 4) : r.exit !== 0
    if (red) return true
  }
  return false
}
function gateSkipsCount(rows) {
  const gate = rows.find((r) => r.leg === 'gate')
  const skips = gate && gate.observed && gate.observed.skips
  return typeof skips === 'number' ? skips : 0
}

function runLegs(n, opts = {}) {
  fs.mkdirSync(sidecarDir, { recursive: true })
  const args = ['--root', repoRoot, '--spec', specRel, '--base', base,
    '--manifest', manifestPathFor(n), '--out-dir', outDirFor(n)]
  if (opts.skipsFile) args.push('--skips', opts.skipsFile)
  if (opts.fixDelta) args.push('--fix-delta')
  const r = runChild(process.execPath, [legsBin, ...args], { encoding: 'utf8' }, 'review-legs.js')
  if (r.status === 2) {
    die(`review-legs.js precondition failed (iteration ${n}):\n` + (r.stdout + r.stderr).trim())
  }
  marks.legsMode = marks.legsMode || {}
  marks.legsMode[String(n)] = { skipsFile: opts.skipsFile || null, fixDelta: !!opts.fixDelta }
  marks.iteration = n
  saveSidecar()
  return { code: r.status, out: r.stdout, err: r.stderr }
}

// R9 (AC-20260820-07-1): a legs run that did NOT hard-stop must have actually written a
// manifest — the child's own exit code alone is not proof; a killed/never-run leg can still leave
// review-legs.js's wrapper exiting 0 over a manifest nobody wrote. Refuse to advance past an
// unverified artifact rather than trust the exit code in isolation.
function verifyManifestWritten(n) {
  const p = manifestPathFor(n)
  const rows = readManifestRows(p)
  if (!rows.length) {
    die('legs iteration ' + n + ' reported success but ' + p + ' is missing or has no parseable ' +
      'rows — nothing it was meant to produce can be trusted; delete ' + sidecarDir + ' and ' +
      're-run `node ' + __filename + ' ' + specPath + '`')
  }
}

function ensureRunId() {
  if (!marks.runId) { marks.runId = 'rv_' + crypto.randomBytes(6).toString('hex'); saveSidecar() }
  return marks.runId
}

function computeDiffLoc() {
  const r = runChild('git', ['-C', repoRoot, 'diff', '--shortstat', base], { encoding: 'utf8' },
    'git diff --shortstat')
  if (r.status !== 0) return 0
  const m = /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/.exec(r.stdout)
  if (!m) return 0
  return (Number(m[2]) || 0) + (Number(m[3]) || 0)
}

function appendLedger(jsonLine) {
  const ledgerPath = path.join(repoRoot, '.claude/spec-runs.jsonl')
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true })
  fs.appendFileSync(ledgerPath, jsonLine + '\n')
}

// D2/D3: is STOPPED_LEDGER ignored at mainRootDir right now? `check-ignore -q` verdicts a
// not-yet-existing path (A3's executed spike), so this runs before the first durable append ever
// happens. Routed through runChild: exit 1 (not ignored) is a legitimate result, not a death —
// only a signal-killed/never-spawned git is fatal here, same as every other git call in this file.
function checkStoppedLedgerIgnored(mainRootDir) {
  const r = runChild('git', ['-C', mainRootDir, 'check-ignore', '-q', STOPPED_LEDGER],
    { encoding: 'utf8' }, 'git check-ignore -q ' + STOPPED_LEDGER)
  return r.status === 0
}

// D2/D3 (Contracts): ensure-ignored guard with self-heal, run once per hard stop before the
// durable write. Not ignored -> append the line to <git-common-dir>/info/exclude (shared by every
// linked worktree, A5) and re-check once. Returns true when the durable write is safe to proceed,
// false when the path genuinely cannot be made ignored (D3: e.g. a .gitignore negation, which
// outranks info/exclude in git's precedence) — the caller falls back to today's behavior.
function ensureStoppedLedgerIgnored(mainRootDir) {
  if (checkStoppedLedgerIgnored(mainRootDir)) return true
  const commonDirR = runChild('git',
    ['-C', mainRootDir, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
    { encoding: 'utf8' }, 'git rev-parse --git-common-dir')
  if (commonDirR.status !== 0) return false
  const excludePath = path.join(commonDirR.stdout.trim(), 'info', 'exclude')
  fs.mkdirSync(path.dirname(excludePath), { recursive: true })
  fs.appendFileSync(excludePath, STOPPED_LEDGER + '\n')
  return checkStoppedLedgerIgnored(mainRootDir)
}

// D5/D6 (Contracts): the one spec-scoped drain, two callers (promoteEvidenceAndClean(),
// doCloseWork() when repoRoot === mainRoot). Reads STOPPED_LEDGER at mainRootDir (absent -> no
// rows to drain), partitions lines by parsed .spec === specRel — unparseable lines are KEPT
// (flagging malformed lines is doctor's job, mirroring readLedgerRows's own silent-drop), rewrites
// the file with only the non-matching lines (deletes it when none remain), and returns the
// matching lines VERBATIM for the caller to append ahead of its own close/promotion lines. This
// MOVES rows, never copies them, so a later close can never double-count a drained row.
function drainStoppedRows(mainRootDir, specRel) {
  const stoppedPath = path.join(mainRootDir, STOPPED_LEDGER)
  if (!fs.existsSync(stoppedPath)) return { drained: [] }
  const lines = fs.readFileSync(stoppedPath, 'utf8').split('\n').filter((l) => l.trim())
  const drained = []
  const kept = []
  for (const line of lines) {
    let row
    try { row = JSON.parse(line) } catch { kept.push(line); continue }
    if (row.spec === specRel) drained.push(line); else kept.push(line)
  }
  if (kept.length) fs.writeFileSync(stoppedPath, kept.join('\n') + '\n')
  else fs.rmSync(stoppedPath, { force: true })
  return { drained }
}

// ---- D1-D4: RED_BLOCKING hard-stop — no-workflow verdict pass, GATE_RED ledger line appended ---
// In-place (repoRoot === mainRoot) keeps today's appendLedger() path unchanged (D1). A worktree
// review durably appends to <mainRoot>/STOPPED_LEDGER instead — surviving an abandoned or
// force-removed worktree (R3(1) of specs/20260820/07) — once the ensure-ignored guard confirms
// the write cannot dirty mainRoot's tree; when it genuinely cannot be ignored (D3), fall back to
// the worktree ledger exactly as before. Either way marks.stoppedLedgerPath records where the row
// actually landed, for the STOPPED step text to name (D4) and for a bare re-invocation to re-print.
function runHardStopVerdict(n) {
  const runId = ensureRunId()
  const diffLoc = computeDiffLoc()
  const args = ['--manifest', manifestPathFor(n), '--ledger', '--spec', specRel, '--tier', tier,
    '--diff-loc', String(diffLoc), '--iteration', String(n), '--run-id', runId]
  const r = runChild(process.execPath, [verdictBin, ...args], { encoding: 'utf8' },
    'verdict.js (hard-stop pass)')
  if (r.status === 2) die('verdict.js (hard-stop pass) failed: ' + (r.stdout + r.stderr).trim())
  const lines = r.stdout.split('\n')
  const line = lines[1]

  if (repoRoot !== mainRoot && ensureStoppedLedgerIgnored(mainRoot)) {
    const stoppedPath = path.join(mainRoot, STOPPED_LEDGER)
    fs.mkdirSync(path.dirname(stoppedPath), { recursive: true })
    fs.appendFileSync(stoppedPath, line + '\n')
    marks.stoppedLedgerPath = stoppedPath
    marks.stoppedFallback = false
  } else {
    appendLedger(line)
    marks.stoppedLedgerPath = path.join(repoRoot, '.claude/spec-runs.jsonl')
    marks.stoppedFallback = repoRoot !== mainRoot // only a real fallback when durable was attempted and lost
  }
  marks.stoppedIteration = n
  saveSidecar()
}

function runLegsIteration(n, opts) {
  const res = runLegs(n, opts)
  if (res.code === 1) { runHardStopVerdict(n); return { stopped: true, n } }
  verifyManifestWritten(n)
  return { stopped: false, n }
}

// ---- D5-D8: writeEscalateRow() — the durable-path branch mirroring runHardStopVerdict(), for the
// fix-cap ESCALATE refusal rather than a RED_BLOCKING hard-stop. specs/20260822/01-escalate-ledger-
// row.md: a review that burns its fix loop to the cap wrote ZERO ledger rows — this is the one
// write point, called from handleFixApplied()'s cap branch (before die()) and self-healed from the
// ESCALATE step arm on a bare re-invocation (D5) — the abandonment path never re-invokes, so the
// refusal moment is the last guaranteed chance to record it. Idempotent via marks.escalateRunId,
// set only after a successful append (D5's own idempotency guard). D2's invocation shape: the
// FINAL manifest/reviewer-return, the recorded dispositions' waived/rejected, --fixDispatched 0
// FORCED (the dispatched fix never landed — crediting it would fabricate coverage), --escalated,
// --retain (a feature: the capped run's survivors are retained full-fidelity under the run's own
// runId). D6: durability reuses spec 04's stopped-ledger path VERBATIM (never a new filename — A2
// falsified sorting a spec-runs.escalated.jsonl ahead of spec-runs.jsonl). D8: any exit-2 from the
// escalate verdict pass (D4's CLEAN guard, or the contradiction guard tripping on a shrunk pool) is
// returned to the caller as { ok: false, error } — loud, row-less, retryable: no row is appended,
// escalateRunId stays unset so a later self-heal retries, and the caller's own refusal message
// embeds `error` verbatim rather than this function calling die() and losing the cap record.
function writeEscalateRow(n) {
  if (marks.escalateRunId) return { ok: true } // already written — never re-append
  const runId = ensureRunId()
  const diffLoc = computeDiffLoc()
  const d = marks.dispositions
  const args = ['--manifest', manifestPathFor(n), '--workflow', marks.reviewerReturnFile,
    '--waived', String(d.waived), '--rejected', String(d.rejected), '--fixDispatched', '0',
    '--escalated', '--ledger', '--spec', specRel, '--tier', tier, '--diff-loc', String(diffLoc),
    '--iteration', String(n), '--run-id', runId, '--retain', path.join(repoRoot, '.claude/spec-runs')]
  const r = runChild(process.execPath, [verdictBin, ...args], { encoding: 'utf8' },
    'verdict.js (escalate pass)')
  if (r.status === 2) return { ok: false, error: (r.stdout + r.stderr).trim() }
  const lines = r.stdout.split('\n')
  const line = lines[1]

  if (repoRoot !== mainRoot && ensureStoppedLedgerIgnored(mainRoot)) {
    const stoppedPath = path.join(mainRoot, STOPPED_LEDGER)
    fs.mkdirSync(path.dirname(stoppedPath), { recursive: true })
    fs.appendFileSync(stoppedPath, line + '\n')
    marks.escalateLedgerPath = stoppedPath
    marks.escalateFallback = false
  } else {
    appendLedger(line)
    marks.escalateLedgerPath = path.join(repoRoot, '.claude/spec-runs.jsonl')
    marks.escalateFallback = repoRoot !== mainRoot // only a real fallback when durable was attempted and lost
  }
  marks.escalateRunId = runId
  saveSidecar()
  return { ok: true }
}

// ---- CLOSE driver work: authoritative verdict + ledger append + status flip --------------------
function doCloseWork(n) {
  const runId = ensureRunId()
  const diffLoc = computeDiffLoc()
  const retainDir = path.join(repoRoot, '.claude/spec-runs')
  const d = marks.dispositions
  // D6: in-place close drain (same helper as D5) — covers a spec that stopped in a since-
  // abandoned worktree and later closed CLEAN in-place. doCloseWork() is the only append point for
  // that path, so the drain has to run here too, ahead of the close-row append below.
  if (repoRoot === mainRoot) {
    const { drained } = drainStoppedRows(mainRoot, specRel)
    if (drained.length) appendLedger(drained.join('\n'))
  }
  const args = ['--manifest', manifestPathFor(n), '--workflow', marks.reviewerReturnFile,
    '--waived', String(d.waived), '--rejected', String(d.rejected), '--fixDispatched', String(d.fixDispatched),
    '--ledger', '--spec', specRel, '--tier', tier, '--diff-loc', String(diffLoc),
    '--iteration', String(n), '--run-id', runId, '--retain', retainDir]
  const r = runChild(process.execPath, [verdictBin, ...args], { encoding: 'utf8' },
    'verdict.js (authoritative pass)')
  if (r.status === 2) die('verdict.js (authoritative pass) failed: ' + (r.stdout + r.stderr).trim())
  const lines = r.stdout.split('\n')
  appendLedger(lines[1])

  const newSpecText = specText.replace(/^status:\s*.*$/m, 'status: done')
  fs.writeFileSync(resolvedSpecPath, newSpecText)

  // D8: no dueness probe here. A printed "run /spec:replay yourself" reminder was the measured
  // failure this state machine replaces (shipped 2026-08-19, skipped through 12+ reviews in ~48h);
  // REPLAY's own entry --due, once MERGE has concluded, is the single dueness derivation.
  marks.closeRunId = runId
  saveSidecar()
}

// ---- git status helper (closed mark's dirty-tree check) ---------------------------------------
function gitStatusPaths(root) {
  const r = runChild('git', ['-C', root, 'status', '--porcelain', '--untracked-files=all'],
    { encoding: 'utf8' }, 'git status --porcelain')
  if (r.status !== 0) return []
  return r.stdout.split('\n').filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ''))
}

// ---- merge-back helpers -------------------------------------------------------------------------
function mainRootPath() {
  const r = runChild('bash', [mergeBackBin, 'root'], { encoding: 'utf8', cwd: repoRoot },
    'merge-back.sh root')
  if (r.status !== 0) die('merge-back.sh root failed: ' + (r.stdout + r.stderr).trim())
  return r.stdout.trim()
}
function sourceBranchFor() {
  const r = runChild('bash', [mergeBackBin, 'branch-for', resolvedSpecPath], { encoding: 'utf8' },
    'merge-back.sh branch-for')
  if (r.status !== 0) die('merge-back.sh branch-for failed: ' + (r.stdout + r.stderr).trim())
  return r.stdout.trim()
}
function branchExists(root, branch) {
  const r = runChild('git', ['-C', root, 'rev-parse', '--verify', '-q', 'refs/heads/' + branch],
    { encoding: 'utf8' }, 'git rev-parse --verify')
  return r.status === 0
}
function findWorktreeForBranch(root, branch) {
  const r = runChild('git', ['-C', root, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' },
    'git worktree list')
  if (r.status !== 0) return null
  const blocks = r.stdout.split('\n\n')
  for (const block of blocks) {
    const lines = block.split('\n')
    let wtPath = null, wtBranch = null
    for (const l of lines) {
      if (l.startsWith('worktree ')) wtPath = l.slice('worktree '.length)
      if (l.startsWith('branch ')) wtBranch = l.slice('branch '.length).replace('refs/heads/', '')
    }
    if (wtBranch === branch) return wtPath
  }
  return null
}

// D8 (a): the sidecar dies HERE, at DONE — not at MERGE's conclusion, which is where 07 deleted
// it. REPLAY runs after the merge and reads it, so the only safe deletion point is the terminal
// state itself. `--state` is answered before the delete: a state query must not be the thing that
// tears down the run it is querying.
function printDoneNow(note, harnessLine) {
  if (STATE_ONLY) { process.stdout.write('DONE\n'); process.exit(0) }
  fs.rmSync(sidecarDir, { recursive: true, force: true })
  const status2 = runChild(process.execPath, [specStatusBin, '--root', repoRoot, '--next'],
    { encoding: 'utf8' }, 'spec-status.js --next')
  const nextLine = status2.status === 0 ? status2.stdout.trim() : '(spec-status --next unavailable)'
  process.stdout.write(`[spec-review-driver] state: DONE  spec: ${replaySpecPath}\n` +
    (note ? note + '\n' : '') +
    (harnessLine ? harnessLine + '\n' : '') +
    '\n## DONE\n' + nextLine + '\n')
  process.exit(0)
}

// ---- REPLAY (D1/D2/D3) ---------------------------------------------------------------------------
// Entered from BOTH of MERGE's conclusions — a landed merge-back and the merge-skipped note — and
// from nowhere else: STOPPED and every non-CLEAN path terminate before it. It never re-derives,
// re-opens, or gates the verdict (D3); CLOSE is committed and the merge has landed by the time a
// single line here runs, so "blocking" the verdict is not even mechanically available. What it
// does block is calling the review FINISHED while the measurement it owes is unrun — the review is
// complete as a verdict and unfinished as a checklist. The advisory form of exactly this reminder
// shipped 2026-08-19 and was skipped through 12+ reviews in ~48 hours; that is the whole argument
// for a state instead of a print.
function countReplayRowsFor(reviewRunId) {
  return readLedgerRows(repoRoot)
    .filter((r) => r.stage === 'replay' && r.reviewRunId === reviewRunId).length
}

function parseSelection(out) {
  const m = /spec=(\S+)\s+reviewRunId=(\S+)\s+commit=(\S+)\s+parent=(\S+)\s+diffBase=(\S+)/.exec(out)
  if (!m) return null
  return { spec: m[1], reviewRunId: m[2], commit: m[3], parent: m[4], diffBase: m[5] }
}

function replayStepBody(t) {
  return `## Step: run the due reviewer replay\n` +
    `The replay window is due and the harness selected a target. Execute ` +
    `spec/commands/replay.md's Phases 1-5 in THIS session — mutation-authoring worker, blind ` +
    `reviewer dispatch, score, record, teardown. Phase 0 is this driver's own entry work above ` +
    `and is never repeated.\n` +
    `  spec:        ${t.spec}\n` +
    `  reviewRunId: ${t.reviewRunId}\n` +
    `  commit:      ${t.commit}\n` +
    `  parent:      ${t.parent}\n` +
    `  diffBase:    ${t.diffBase}\n` +
    `Phase 4 records the outcome via replay.js --record --review-run-id ${t.reviewRunId}. ANY ` +
    `outcome concludes this review; a non-measurement outcome (unresolved/setup-failed) leaves ` +
    `the harness due, so the NEXT review retries rather than this one.\n` +
    `Then: node ${__filename} ${replaySpecPath} --mark replay-recorded`
}

// The entry derivation. Both --due and --select are replay.js's own reads — the driver never
// hand-derives dueness or picks a target, so a change to the measurement window cannot silently
// diverge between the two callers.
function replayEntry(note) {
  const due = runChild(process.execPath, [replayBin, '--due'], { encoding: 'utf8', cwd: repoRoot },
    'replay.js --due')
  if (due.status !== 0) printDoneNow(note, (due.stdout + due.stderr).trim())
  const sel = runChild(process.execPath, [replayBin, '--select'], { encoding: 'utf8', cwd: repoRoot },
    'replay.js --select')
  // Any non-zero --select exit means nothing measurable was resolved in this window; a
  // due-but-unmeasurable close concludes rather than parking on work that cannot be done.
  if (sel.status !== 0) printDoneNow(note, (sel.stdout + sel.stderr).trim())
  const t = parseSelection(sel.stdout)
  if (!t) {
    die('replay.js --select exited 0 but printed no parseable `spec=… reviewRunId=… commit=… ' +
      'parent=… diffBase=…` line (got: ' + JSON.stringify(sel.stdout.trim()) + ') — re-run ' +
      '`node ' + replayBin + ' --select` from ' + repoRoot + ' and fix the harness before ' +
      'concluding this review')
  }
  // rowsAtEntry joins on the SELECTED target's reviewRunId, never a bare row count: a concurrent
  // session appending its own replay row for a different target must not satisfy this mark.
  marks.replayTarget = { ...t, rowsAtEntry: countReplayRowsFor(t.reviewRunId) }
  saveSidecar()
  if (STATE_ONLY) { process.stdout.write('REPLAY\n'); process.exit(0) }
  process.stdout.write(`[spec-review-driver] state: REPLAY  spec: ${replaySpecPath}\n` +
    (note ? note + '\n' : '') +
    '(re-run this driver after completing the step; it verifies artifacts and prints the next one)\n\n' +
    replayStepBody(marks.replayTarget) + '\n')
  process.exit(0)
}

// ---- mark handlers --------------------------------------------------------------------------
// Each handler validates BEFORE mutating anything (a refused mark leaves state unchanged) and
// returns null to let the generic deriveState() below continue naturally, or 'STOPPED' when the
// mark's own fresh legs run hard-stopped (bypassing deriveState()'s own auto-retry, which would
// otherwise treat the just-created red manifest as "needs another retry" in the SAME invocation).

function handleSkipsExtracted() {
  const file = flag('--file')
  if (!file || typeof file !== 'string') die('--mark skips-extracted needs --file <extracted skip names>')
  if (!fs.existsSync(file)) die('--file ' + file + ' does not exist — extract the skipped-test names and pass a real path')
  const resolved = path.resolve(file)
  marks.skipsExtracted = true
  marks.skipsFile = resolved
  saveSidecar()
  const n = (listManifestNumbers().length ? Math.max(...listManifestNumbers()) : 0) + 1
  const r = runLegsIteration(n, { skipsFile: resolved })
  return r.stopped ? 'STOPPED' : null
}

function handleReviewerReturned() {
  const file = flag('--file')
  if (!file || typeof file !== 'string') die('--mark reviewer-returned needs --file <return json>')
  let raw
  try { raw = fs.readFileSync(file, 'utf8') } catch (e) {
    die('--file ' + file + ' could not be read (' + e.message + ') — re-dispatch the reviewer ' +
      'and pass the path it actually wrote its return to')
  }
  let json
  try { json = JSON.parse(raw) } catch (e) {
    die('--file ' + file + ' is not valid JSON (' + e.message + ') — re-dispatch the reviewer ' +
      'and write a clean {verdict, survivors, killed, reviewerCount, scope, tokens} return')
  }
  if (json.verdict === 'REVIEWER_FAILED') {
    die('the reviewer returned REVIEWER_FAILED (the run died mid-review, never CLEAN) — ' +
      're-dispatch Agent {subagent_type: "spec:reviewer"} and mark reviewer-returned again once it completes')
  }
  if (!Array.isArray(json.survivors)) {
    die('--file ' + file + ' is missing a survivors array — the reviewer return shape must be ' +
      '{verdict, survivors, killed, reviewerCount, scope, tokens}; re-dispatch and write a valid return')
  }
  const n = listManifestNumbers().length ? Math.max(...listManifestNumbers()) : 0
  fs.mkdirSync(sidecarDir, { recursive: true })
  const dest = path.join(sidecarDir, `reviewer-return-${n}.json`)
  fs.writeFileSync(dest, raw)
  marks.reviewerReturnFile = dest
  marks.reviewerReturnIteration = n
  marks.dispositions = null
  marks.dispositionsIteration = null
  marks.pendingFix = false
  saveSidecar()
  return null
}

function handleDispositions() {
  if (!marks.reviewerReturnFile) die('no reviewer return recorded yet — mark reviewer-returned first')
  const waivedRaw = flag('--waived'), rejectedRaw = flag('--rejected'), fixRaw = flag('--fix-dispatched')
  const waived = Number(waivedRaw), rejected = Number(rejectedRaw), fixDispatched = Number(fixRaw)
  if (![waived, rejected, fixDispatched].every(Number.isFinite)) {
    die('--mark dispositions needs numeric --waived/--rejected/--fix-dispatched (got ' +
      JSON.stringify({ waivedRaw, rejectedRaw, fixRaw }) + ')')
  }
  const n = marks.reviewerReturnIteration
  const args = ['--manifest', manifestPathFor(n), '--workflow', marks.reviewerReturnFile,
    '--waived', String(waived), '--rejected', String(rejected), '--fixDispatched', String(fixDispatched)]
  const r = runChild(process.execPath, [verdictBin, ...args], { encoding: 'utf8' },
    'verdict.js (dispositions pass)')
  if (r.status === 2) die((r.stderr || r.stdout).trim())
  const word = r.stdout.split('\n')[0].trim()
  marks.dispositions = { waived, rejected, fixDispatched, word }
  marks.dispositionsIteration = n
  marks.pendingFix = fixDispatched > 0
  if (marks.pendingFix) marks.escalated = false // a fresh fix cycle — any stale escalation no longer applies
  saveSidecar()
  return null
}

// D5/AC-20260820-07-8 (manifest-provable cap): the cap itself is enforced HERE, from
// manifest-<n>.jsonl files actually present on disk — a hand-edited sidecar counter cannot
// influence it. Whether the STATE reads FIX vs ESCALATE, though, cannot be re-derived from disk
// alone (a refused 3rd attempt and a not-yet-attempted 3rd attempt look identical on disk: same
// manifest count, same pendingFix=true) — `marks.escalated` is the persisted record of an actual
// refusal, set only here, never by a hand-edited iteration counter.
const FIX_CAP = 2
function handleFixApplied() {
  if (!marks.pendingFix) die('no fix was dispatched for the current findings — mark dispositions --fix-dispatched N first')
  const manifests = listManifestNumbers()
  const fixIterationsDone = manifests.length - 1
  if (fixIterationsDone >= FIX_CAP) {
    marks.escalated = true
    saveSidecar()
    // D5: the refusal is the last guaranteed execution moment — write the escalate row HERE,
    // before die(), never after (the abandonment path never re-invokes).
    const capN = Math.max(...manifests)
    const result = writeEscalateRow(capN)
    const capMsg = 'iteration cap 2 reached — a third fix-applied is refused; the fix/review loop ' +
      'is capped at 2 iterations, escalate to the user instead of dispatching another fix'
    die(result.ok
      ? capMsg + '\nAn escalate ledger line has been appended to ' + marks.escalateLedgerPath + '.'
      // D8: loud, row-less, retryable — embed the verdict.js drift error verbatim, never crash the
      // refusal and lose the cap record; escalateRunId stays unset so the next bare invocation's
      // self-heal (D5) retries the append.
      : capMsg + '\nThe escalate ledger pass could not be completed: ' + result.error +
        '\nRe-run this driver once the evidence is repaired — the append will be retried.')
  }
  const n = Math.max(...manifests) + 1
  const r = runLegsIteration(n, { fixDelta: true })
  if (r.stopped) return 'STOPPED'
  marks.pendingFix = false
  saveSidecar()
  return null
}

function handleClosed() {
  if (status !== 'done') {
    die('spec status is not yet "done" — re-run the driver with no mark first so CLOSE\'s ' +
      'authoritative verdict runs and flips status')
  }
  const dirty = gitStatusPaths(repoRoot)
  const unexpected = dirty.filter((p) =>
    !(p === sidecarRel || p.startsWith(sidecarRel + '/') ||
      p === '.claude/spec-runs.jsonl' || p.startsWith('.claude/spec-runs/')))
  if (unexpected.length) {
    die('tree is dirty beyond the sidecar and retained evidence — unexpected path(s): ' +
      unexpected.join(', ') + ' — commit or clean them (never git add -A past an unadjudicated ' +
      'path), then re-run this mark')
  }
  marks.closed = true
  saveSidecar()
  return null
}

function handleMergeStrategy() {
  const strategy = argv[markIdx + 2]
  const VALID = ['merge-commit', 'ff-only', 'squash', 'rebase-ff']
  if (!VALID.includes(strategy)) {
    die('--mark merge-strategy needs a bare strategy token (' + VALID.join('|') + '), got ' + JSON.stringify(strategy))
  }
  if (!marks.closed) die('spec is not closed yet — mark closed first')
  const here = path.resolve(process.cwd())
  if (here !== path.resolve(mainRoot)) {
    die('refused — the driver\'s inherited CWD (' + here + ') is inside the build worktree, not ' +
      'the main root (' + mainRoot + '); relocate first: ExitWorktree(action="keep") if this ' +
      'session entered it, else `cd ' + mainRoot + '` in the main session, then re-run this mark')
  }
  const source = sourceBranchFor()
  const target = runChild('git', ['-C', mainRoot, 'symbolic-ref', '--short', 'HEAD'],
    { encoding: 'utf8' }, 'git symbolic-ref').stdout.trim()
  const wt = findWorktreeForBranch(mainRoot, source)

  // D4 (specs/20260823/04-review-close-hardening.md, rv_6825fa48c98d): re-entrancy. The recorded
  // deadlock — a retry after a landed merge re-ran merge-back.sh merge and died on
  // assert_clean_root against its own promoted evidence — is broken by detecting "already landed"
  // BEFORE ever invoking merge-back.sh merge. Order: resolve source first (a gone branch means the
  // merge, and cleanup, already landed); otherwise ask git directly whether source is already
  // fully contained in target. Either way, skip straight to finishMerge (promotion/cleanup, both
  // already idempotent) — the first-merge path and assert_clean_root below are untouched when the
  // merge has NOT yet landed (AC-8: SHALL CONTINUE TO refuse a dirty root on the first attempt).
  if (!branchExists(mainRoot, source)) {
    process.stdout.write('[spec-review-driver] source branch ' + source + ' no longer exists — ' +
      'the merge already landed; skipping merge-back.sh merge and resuming at promotion/cleanup.\n')
    finishMerge(mainRoot, source, wt)
    return
  }
  const containedR = runChild('git', ['-C', mainRoot, 'rev-list', '--count', target + '..' + source],
    { encoding: 'utf8' }, 'git rev-list --count')
  if (containedR.status === 0 && containedR.stdout.trim() === '0') {
    process.stdout.write('[spec-review-driver] ' + source + ' is already fully contained in ' +
      target + ' — the merge already landed; skipping merge-back.sh merge and resuming at ' +
      'promotion/cleanup.\n')
    finishMerge(mainRoot, source, wt)
    return
  }

  const mergeArgs = ['merge', '--root', mainRoot, '--target', target, '--source', source, '--strategy', strategy]
  if (wt) mergeArgs.push('--worktree', wt)
  const r = runChild('bash', [mergeBackBin, ...mergeArgs], { encoding: 'utf8' }, 'merge-back.sh merge')
  if (r.status === 3) {
    marks.mergeConflicted = true
    marks.mergeCtx = { mainRoot, target, source, wt: wt || null }
    saveSidecar()
    process.stdout.write(`[spec-review-driver] state: CONFLICTS  spec: ${specPath}\n\n` +
      '## Step: resolve merge conflicts by intent\n' + (r.stdout + r.stderr).trim() + '\n\n' +
      'Read both sides, resolve by INTENT (never a mechanical pick), `git -C ' + mainRoot +
      ' add` each resolved file, then commit.\nThen: node ' + __filename + ' ' + specPath +
      ' --mark conflicts-resolved\n')
    process.exit(0)
  }
  if (r.status !== 0) die('merge-back.sh merge failed: ' + (r.stdout + r.stderr).trim())
  finishMerge(mainRoot, source, wt)
}

function handleConflictsResolved() {
  if (!marks.mergeConflicted) die('no merge is in conflict — nothing to resolve')
  const { mainRoot, source, wt } = marks.mergeCtx
  const unmerged = runChild('git', ['-C', mainRoot, 'ls-files', '-u'], { encoding: 'utf8' },
    'git ls-files -u').stdout.trim()
  if (unmerged) die('unresolved conflicts remain in ' + mainRoot + ' — resolve every path, git add, and commit before marking conflicts-resolved')
  const gitDir = runChild('git', ['-C', mainRoot, 'rev-parse', '--git-dir'], { encoding: 'utf8' },
    'git rev-parse --git-dir').stdout.trim()
  const mergeHead = path.isAbsolute(gitDir) ? path.join(gitDir, 'MERGE_HEAD') : path.join(mainRoot, gitDir, 'MERGE_HEAD')
  if (fs.existsSync(mergeHead)) die('the merge is still in progress (MERGE_HEAD present) in ' + mainRoot + ' — commit the resolution first')
  marks.mergeConflicted = false
  saveSidecar()
  finishMerge(mainRoot, source, wt)
}

// Shared tail for a concluded merge (whether it went straight through or via CONFLICTS ->
// conflicts-resolved): cleanup (removes the worktree, taking the sidecar with it per D10) +
// verify + spec-status --next verbatim, then DONE. Exits the process directly — after cleanup the
// sidecar this invocation loaded may no longer exist on disk, so nothing here re-reads it.
// D10: the ledger + retained evidence were written under the WORKTREE (repoRoot at CLOSE time,
// wherever the review actually ran) so the main root stays clean for `merge-back.sh merge`'s
// assert_clean_root/ff-only preconditions. Once the merge has landed, promote them into mainRoot
// (dedup by exact line / by filename), then per D5 (specs/20260823/04-review-close-hardening.md,
// rv_6825fa48c98d) clear the worktree-local copies by TRACKED STATUS, not by blanket delete: a
// path tracked in the worktree is restored to its own HEAD content (`git -C <wt> checkout --
// <path>`), an untracked path is `fs.rmSync`'d exactly as before (A3: the ledger may be tracked or
// untracked depending on the host, decided per path). Deleting a TRACKED file used to leave it
// "deleted" in `git status`, which made the plain `git worktree remove` below (no --force) refuse
// at exit 128 (A1, spiked) — the second half of the recorded deadlock. Restoring instead of
// deleting keeps `git -C <wt> status --porcelain` empty either way, so cleanup's `worktree remove`
// succeeds without --force.
function isTrackedInWorktree(wt, relPath) {
  const r = runChild('git', ['-C', wt, 'ls-files', '--error-unmatch', relPath],
    { encoding: 'utf8' }, 'git ls-files --error-unmatch ' + relPath)
  return r.status === 0
}
function clearPromotedCopy(wt, absPath, relPath) {
  if (isTrackedInWorktree(wt, relPath)) {
    runChild('git', ['-C', wt, 'checkout', '--', relPath], { encoding: 'utf8' },
      'git checkout -- ' + relPath)
  } else {
    fs.rmSync(absPath, { force: true })
  }
}
function promoteEvidenceAndClean(wt, mainRootDir) {
  const srcLedger = path.join(wt, '.claude/spec-runs.jsonl')
  const dstLedger = path.join(mainRootDir, '.claude/spec-runs.jsonl')
  // D5: drain this spec's durable stopped rows into the tracked ledger BEFORE promoting the
  // worktree's own ledger lines below, so a drained GATE_RED row lands ahead of this run's CLOSE
  // row in read order (A4: qualifyingObservation() picks the LAST review row by read-order
  // position — an undrained-then-appended-after row would poison observation for this spec
  // forever). The key is the spec's path relative to the WORKTREE, not to mainRootDir: this
  // invocation's own repoRoot is mainRootDir (merge-strategy runs from there), so the top-level
  // `specRel` carries the .claude/worktrees/<name>/ prefix and would never match the rows written
  // (from inside the worktree, at hard-stop time) with the plain repo-relative form.
  const specRelInWt = path.relative(wt, resolvedSpecPath)
  const { drained } = drainStoppedRows(mainRootDir, specRelInWt)
  if (drained.length) {
    fs.mkdirSync(path.dirname(dstLedger), { recursive: true })
    fs.appendFileSync(dstLedger, drained.join('\n') + '\n')
  }
  if (fs.existsSync(srcLedger)) {
    const srcLines = fs.readFileSync(srcLedger, 'utf8').split('\n').filter(Boolean)
    const dstLines = fs.existsSync(dstLedger) ? fs.readFileSync(dstLedger, 'utf8').split('\n').filter(Boolean) : []
    const dstSet = new Set(dstLines)
    const toAppend = srcLines.filter((l) => !dstSet.has(l))
    if (toAppend.length) {
      fs.mkdirSync(path.dirname(dstLedger), { recursive: true })
      fs.appendFileSync(dstLedger, toAppend.join('\n') + '\n')
    }
    clearPromotedCopy(wt, srcLedger, path.relative(wt, srcLedger))
  }
  const srcDir = path.join(wt, '.claude/spec-runs')
  const dstDir = path.join(mainRootDir, '.claude/spec-runs')
  if (fs.existsSync(srcDir)) {
    fs.mkdirSync(dstDir, { recursive: true })
    for (const f of fs.readdirSync(srcDir)) {
      const srcFile = path.join(srcDir, f)
      const dst = path.join(dstDir, f)
      if (!fs.existsSync(dst)) fs.copyFileSync(srcFile, dst)
      clearPromotedCopy(wt, srcFile, path.relative(wt, srcFile))
    }
    // The directory itself: a restored tracked file (per clearPromotedCopy above) is put back on
    // disk at its HEAD content, so the directory is non-empty and rmdir refuses — that is a clean
    // worktree state, not a leftover; only remove the directory when nothing tracked remains in it.
    try { fs.rmdirSync(srcDir) } catch { /* non-empty: a restored tracked file remains, by design */ }
  }
}

// D8 (b): `git worktree remove` refuses on ANY untracked file, so the worktree-local sidecar has
// to be gone before cleanup runs — but REPLAY runs AFTER cleanup, from the main root, and needs
// this run's state. Move review-state.json into the main root's own <spec>.review/ and rebind this
// invocation's paths to it. The per-iteration manifests are deliberately NOT carried over: they
// are evidence of a verdict that is already concluded and already retained under
// .claude/spec-runs/, and REPLAY's own derivation never reads them.
function relocateSidecar(wt, mainRootDir) {
  const relSidecar = path.relative(wt, sidecarDir)
  if (relSidecar.startsWith('..') || path.isAbsolute(relSidecar)) return // already outside the worktree
  const dst = path.join(mainRootDir, relSidecar)
  fs.mkdirSync(dst, { recursive: true })
  fs.writeFileSync(path.join(dst, 'review-state.json'), JSON.stringify(marks, null, 2) + '\n')
  fs.rmSync(sidecarDir, { recursive: true, force: true })
  sidecarDir = dst
  stateFile = path.join(dst, 'review-state.json')
  sidecarRel = path.relative(mainRootDir, dst)
  replaySpecPath = path.join(mainRootDir, path.relative(wt, resolvedSpecPath))
}

function finishMerge(mainRootDir, source, wt) {
  if (wt) {
    promoteEvidenceAndClean(wt, mainRootDir)
    relocateSidecar(wt, mainRootDir)
  }
  const cleanupArgs = ['cleanup', '--root', mainRootDir, '--source', source]
  if (wt) cleanupArgs.push('--worktree', wt)
  const c = runChild('bash', [mergeBackBin, ...cleanupArgs], { encoding: 'utf8' }, 'merge-back.sh cleanup')
  if (c.status !== 0) die('merge-back.sh cleanup failed: ' + (c.stdout + c.stderr).trim())
  runChild('bash', [mergeBackBin, 'verify', '--root', mainRootDir], { encoding: 'utf8' }, 'merge-back.sh verify')
  marks.mergeConcluded = true
  saveSidecar()
  replayEntry('merged ' + source + ' into the target branch; worktree and branch cleaned up.')
}

// D2: refused unless the count of stage:"replay" rows carrying the SELECTED target's reviewRunId
// has strictly increased since REPLAY was entered. The join is on the run id, never a bare row
// count, so a concurrent session recording its own replay cannot conclude this review. The
// outcome itself is never inspected: caught, missed, leg-caught, unresolved and setup-failed all
// satisfy the mark, because a broken scratch worktree must not park a finished review (a
// non-measurement outcome leaves the harness due, and the next review retries it).
function handleReplayRecorded() {
  const t = marks.replayTarget
  if (!t) {
    die('no replay target is recorded for this review — re-run the driver with no mark first so ' +
      'REPLAY\'s own --due/--select derivation runs')
  }
  const now = countReplayRowsFor(t.reviewRunId)
  if (now <= t.rowsAtEntry) {
    die('no stage:"replay" ledger row for reviewRunId ' + t.reviewRunId + ' has been appended ' +
      'since REPLAY was entered (' + t.rowsAtEntry + ' then, ' + now + ' now) — run ' +
      'spec/commands/replay.md Phases 1-5 against that target and record the outcome first: ' +
      'node ' + replayBin + ' --record --spec ' + t.spec + ' --review-run-id ' + t.reviewRunId +
      ' --legs <green|red:leg|none> --outcome <caught|missed|leg-caught|unresolved|setup-failed> ' +
      '[--class <id>] [--patch <f>] [--workflow <f>]')
  }
  marks.replayTarget = null
  marks.replayRecorded = { reviewRunId: t.reviewRunId, rows: now }
  saveSidecar()
  printDoneNow('reviewer replay recorded against review ' + t.reviewRunId + '.')
}

function handleMark() {
  switch (MARK) {
    case 'skips-extracted': return handleSkipsExtracted()
    case 'reviewer-returned': return handleReviewerReturned()
    case 'dispositions': return handleDispositions()
    case 'fix-applied': return handleFixApplied()
    case 'closed': return handleClosed()
    case 'merge-strategy': return handleMergeStrategy() // exits the process itself
    case 'conflicts-resolved': return handleConflictsResolved() // exits the process itself
    case 'replay-recorded': return handleReplayRecorded() // exits the process itself
    default:
      die('unknown mark "' + MARK + '" (skips-extracted | reviewer-returned | dispositions | ' +
        'fix-applied | closed | merge-strategy | conflicts-resolved | replay-recorded)')
  }
}

// ---- state derivation (side-effecting: runs deterministic driver work as needed, idempotent) --
function deriveMergeOrDone() {
  if (marks.mergeConflicted) return 'CONFLICTS'
  return 'MERGE'
}

function deriveState() {
  // Post-merge short circuit, BEFORE any manifest/legs logic: after a worktree merge the
  // per-iteration manifests are gone with the worktree, and falling through to the `n === 0`
  // branch below would re-run review-legs.js over a review that is already a committed verdict.
  // The sidecar alone is what a fresh session resuming after the merge can read.
  if (marks.mergeConcluded) {
    if (!marks.replayTarget) printDoneNow('')
    return 'REPLAY'
  }

  const manifests = listManifestNumbers()
  let n = manifests.length ? Math.max(...manifests) : 0

  if (n === 0) {
    const r = runLegsIteration(1, {})
    if (r.stopped) return 'STOPPED'
    n = 1
  } else if (isRedBlocking(readManifestRows(manifestPathFor(n)))) {
    // STOPPED is sticky, like DONE/ESCALATE — it does not auto-retry on a bare re-invocation (a
    // no-mark call must stay idempotent, AC-20260820-07-9's guarantee generalized). Re-entry
    // requires the underlying issue to be fixed AND a fresh attempt: delete the sidecar (or just
    // this iteration's manifest) to force LEGS to run again from cold.
    return 'STOPPED'
  }

  const rows = readManifestRows(manifestPathFor(n))

  if (!marks.skipsExtracted) {
    if (gateSkipsCount(rows) > 0) return 'SKIPS'
  }

  const reviewerFresh = marks.reviewerReturnFile && marks.reviewerReturnIteration === n
  if (!reviewerFresh) return 'REVIEWER'

  const dispositionsFresh = marks.dispositions && marks.dispositionsIteration === n
  if (!dispositionsFresh) return 'DISPOSITIONS'

  if (marks.pendingFix) {
    if (!marks.escalated) return 'FIX'
    // D5 self-heal: a session that hit the cap and walked away never re-invokes with --mark
    // fix-applied again (that mark is refused forever) — a bare re-invocation here is the ONLY
    // remaining chance to append the row for an abandonment that crashed or exited between the
    // cap refusal and the write. D8 applies the same way here as at the direct write point: a
    // drift refusal is stashed for the ESCALATE step text, never thrown — a bare (no --mark)
    // invocation must still exit 0. Gated on !STATE_ONLY — a `--state` query must not be the thing
    // that performs the write it is merely reporting on (same principle as printDoneNow's deferred
    // sidecar deletion).
    if (!marks.escalateRunId && !STATE_ONLY) {
      const result = writeEscalateRow(n)
      if (!result.ok) escalateDriftError = result.error
    }
    return 'ESCALATE'
  }

  if (marks.dispositions.word !== 'CLEAN') return 'DISPOSITIONS'

  if (status !== 'done') {
    doCloseWork(n)
    status = 'done'
  }
  if (!marks.closed) return 'CLOSE'

  return deriveMergeOrDone()
}

// ---- run ----------------------------------------------------------------------------------------
let forcedState = null
if (MARK) forcedState = handleMark()
const state = forcedState || deriveState()
const currentN = listManifestNumbers().length ? Math.max(...listManifestNumbers()) : 0

if (STATE_ONLY) { process.stdout.write(state + '\n'); process.exit(0) }

// ---- step text per state -------------------------------------------------------------------------
const manifestPath = manifestPathFor(currentN)
const outDir = outDirFor(currentN)
const waivedWarn = (marks.dispositions && marks.dispositions.waived > 0)
  ? `⚠ ${marks.dispositions.waived} finding(s) waived this run — confirm in the close report.\n`
  : ''

const STEPS = {
  STOPPED: () => {
    const rows = readManifestRows(manifestPathFor(marks.stoppedIteration || currentN))
    const red = rows.filter((r) => BLOCKING_LEGS.has(r.leg) &&
      (r.leg === 'smoke' ? (r.exit !== 0 && r.exit !== 4) : r.exit !== 0))
    // D4: name the absolute path the GATE_RED row actually landed in (durable main-root path or
    // fallback worktree path), including on a bare re-invocation — sourced from the sidecar mark,
    // never re-derived, so the answer cannot silently change between invocations.
    const remedy = marks.stoppedFallback
      ? `\nThe durable stopped-ledger location could not be made ignored at the main root — add ` +
        `this line to its .gitignore to enable durable hard-stop evidence: ${STOPPED_LEDGER}\n`
      : ''
    return `## STOPPED — a blocking leg is red; the run hard-stopped before any further step\n` +
      red.map((r) => `❌ ${r.leg} exit=${r.exit} ${JSON.stringify(r.observed)}`).join('\n') +
      `\nmanifest: ${manifestPathFor(marks.stoppedIteration || currentN)}\noutputs: ${outDirFor(marks.stoppedIteration || currentN)}\n` +
      `A GATE_RED ledger line has been appended to ${marks.stoppedLedgerPath}.\n` + remedy +
      `Remedy: fix the failing leg(s) above, then delete ` +
      `${sidecarDir} (or just ${manifestPathFor(marks.stoppedIteration || currentN)}) and re-run this driver — it restarts at LEGS with a fresh manifest.`
  },

  SKIPS: () => `## Step: extract skipped-test names\n` +
    `The gate leg reports skipped tests (manifest: ${manifestPath}). Extract the skip names per ` +
    `the host's declared format, write them to a scratch file — keep the runner's own file ` +
    `qualifier (\`<relpath>::<name>\`) on each line when the runner emits one (pytest's ` +
    `path::name form is the worked example); use bare names only when the runner reports no ` +
    `path — then:\n` +
    `  node ${__filename} ${specPath} --mark skips-extracted --file <path>`,

  REVIEWER: () => `## Step: dispatch the reviewer\n` +
    `Legs are green. Dispatch ONE Agent {subagent_type: "spec:reviewer"} with the spec path, ` +
    `diff base ${base}, root ${repoRoot}, and this run's evidence:\n` +
    `  manifest: ${manifestPath}\n  outputs: ${outDir}\n` +
    (designFlag || designSource
      ? '  design specs also get two parallel Sonnet design-leg agents (rule-checklist + ' +
        'component-manifest audit) alongside the reviewer.\n'
      : '') +
    `Write its structured return ({verdict, survivors, killed, reviewerCount, scope, tokens}) to ` +
    `a file, then:\n  node ${__filename} ${specPath} --mark reviewer-returned --file <return.json>\n` +
    `REVIEWER_FAILED is a failed run, never CLEAN — re-dispatch before marking.`,

  DISPOSITIONS: () => {
    let survivors = []
    try { survivors = JSON.parse(fs.readFileSync(marks.reviewerReturnFile, 'utf8')).survivors || [] } catch { /* ignore */ }
    const legRows = readManifestRows(manifestPath).filter((r) => !BLOCKING_LEGS.has(r.leg) &&
      r.exit !== 0)
    return `## Step: dispositions due — judgment on every survivor and leg finding\n` +
      `survivors (${survivors.length}):\n` +
      survivors.map((s) => `  [${s.severity}] ${s.file}:${s.line} — ${s.claim}`).join('\n') + '\n' +
      `leg findings (${legRows.length}):\n` +
      legRows.map((r) => `  ${r.leg} exit=${r.exit} ${JSON.stringify(r.observed)}`).join('\n') + '\n' +
      `Present each with the spec lines its disposition hinges on, quoted verbatim. Fix -> dispatch ` +
      `Sonnet workers, mark dispositions --fix-dispatched N. Waive/Reject -> record in the spec's ` +
      `Rationale (date + reason; only the user waives).\n` +
      `Then: node ${__filename} ${specPath} --mark dispositions --waived N --rejected N --fix-dispatched N`
  },

  FIX: () => `## Step: dispatch fix workers\n` +
    `${marks.dispositions.fixDispatched} finding(s) routed to Fix (via the host's agentMap). ` +
    `Dispatch the workers, wait for them to return, then:\n` +
    `  node ${__filename} ${specPath} --mark fix-applied\n` +
    `(re-runs legs --fix-delta on a fresh manifest and returns to REVIEWER for the fix-delta pass)`,

  // D9: the ESCALATE step names both exit routes plus where the escalate row landed (or, when D8
  // withheld the write, the loud drift note naming why — never silently omitted).
  ESCALATE: () => {
    const rowLine = marks.escalateRunId
      ? `An escalate ledger line has been appended to ${marks.escalateLedgerPath}.\n`
      : (escalateDriftError
          ? `The escalate ledger pass could not be completed: ${escalateDriftError}\n` +
            `Re-run this driver once the evidence is repaired — the append will be retried.\n`
          : '')
    return `## ESCALATE — iteration cap 2 reached\n` +
      `The fix/review loop is capped at 2 iterations (iteration cap 2) and a third fix-applied was ` +
      `refused. Surface this to the user — a capped run needs a decision, not a fourth dispatch.\n` +
      rowLine +
      `Remedy — two exits:\n` +
      `  waive/reject: mark dispositions --fix-dispatched 0 once --waived/--rejected covers the ` +
      `pool — that closes normally:\n` +
      `    node ${__filename} ${specPath} --mark dispositions --waived N --rejected N --fix-dispatched 0\n` +
      `  abandon: delete ${sidecarDir} (the <spec>.review sidecar and its manifests) to restart cold.\n`
  },

  // R10: the close-commit instruction derives from whether this review is running in-place or in
  // a linked worktree. In-place, the ledger + retained evidence ride the close commit as always.
  // In a linked worktree, finishMerge()'s evidence-promotion step is what moves those paths into
  // the main root (only once the merge has actually landed) — committing them here would just
  // have finishMerge() delete now-tracked files back out from under a clean-tree assumption,
  // leaving the worktree dirty and `merge-back.sh cleanup` refusing at exit 2. Excluding them from
  // the close commit in that case is not a lesser standard, it is the correct one; handleClosed()'s
  // dirty-tree tolerance for these exact paths already accounts for both branches unchanged.
  CLOSE: () => {
    const inPlace = repoRoot === mainRoot
    const closeCommitLine = inPlace
      ? `4. Commit everything still uncommitted on the working branch (never --no-verify) — this ` +
        `is the close commit.\n`
      : `4. Commit everything still uncommitted on the working branch EXCEPT ${sidecarRel}/, ` +
        `.claude/spec-runs.jsonl, and .claude/spec-runs/ (never --no-verify) — this review is ` +
        `running in a linked worktree (main root: ${mainRoot}), so the ledger and retained ` +
        `evidence are promoted there only once the merge lands, not committed from the worktree ` +
        `now; this is the close commit.\n`
    return `## Step: close (the driver has already run the authoritative verdict and flipped status: done)\n` +
      `verdict: ${marks.dispositions.word}   runId: ${marks.closeRunId}   ` +
      `retained: .claude/spec-runs/${marks.closeRunId}.json\n` +
      waivedWarn +
      `1. Apply the spec's Canonical Delta to docs/canonical/${area}.md.\n` +
      `2. Fold the deviations sidecar if one exists (recurring -> Gotchas [host]/[plugin]; one-offs ` +
      `-> the spec's Rationale); delete the sidecar.\n` +
      `3. Hygiene listing — everything not marked EXPECTED below is a stray to explain or clean:\n` +
      `   EXPECTED   ${sidecarRel}/            (never committed — deleted at DONE)\n` +
      `   EXPECTED   .claude/spec-runs/*.json  (retained review evidence)\n` +
      `   EXPECTED   .claude/spec-runs.jsonl   (the run ledger)\n` +
      closeCommitLine +
      `Then: node ${__filename} ${specPath} --mark closed`
  },

  MERGE: () => {
    const source = sourceBranchFor()
    if (!branchExists(mainRoot, source)) {
      // D6: review ran directly on the originating branch — nothing to merge. D1: this arm
      // concludes MERGE exactly like a landed merge-back does, so it enters REPLAY too — a review
      // that happened not to run in a worktree owes the same measurement as one that did.
      marks.mergeConcluded = true
      saveSidecar()
      replayEntry('review ran on the originating branch — MERGE skipped, nothing to merge.')
    }
    const target = runChild('git', ['-C', mainRoot, 'symbolic-ref', '--short', 'HEAD'],
      { encoding: 'utf8' }, 'git symbolic-ref').stdout.trim()
    const inspect = runChild('bash',
      [mergeBackBin, 'inspect', '--root', mainRoot, '--target', target, '--source', source],
      { encoding: 'utf8' }, 'merge-back.sh inspect')
    return `## Step: merge strategy\n` + (inspect.stdout + inspect.stderr).trim() + '\n\n' +
      waivedWarn +
      `AskUserQuestion for the strategy (RECOMMEND above first). Then:\n` +
      `  node ${__filename} ${specPath} --mark merge-strategy <merge-commit|ff-only|squash|rebase-ff>\n` +
      `Relocate first if needed: ExitWorktree(action="keep") if this session entered the worktree, ` +
      `else \`cd ${mainRoot}\` in the main session — the mark is refused while the driver's ` +
      `inherited CWD sits inside the build worktree.`
  },

  CONFLICTS: () => `## CONFLICTS — resolve then mark conflicts-resolved (see prior output)`,

  // A bare re-invocation while parked at REPLAY re-prints the same step from the sidecar's own
  // target — it never re-runs --due/--select, which could otherwise select a DIFFERENT target and
  // silently move the goalposts mid-measurement.
  REPLAY: () => replayStepBody(marks.replayTarget),
}

process.stdout.write(`[spec-review-driver] state: ${state}  spec: ${specPath}\n` +
  `(re-run this driver after completing the step; it verifies artifacts and prints the next one)\n\n` +
  STEPS[state]() + '\n')
process.exit(0)
