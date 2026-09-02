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
// specs/20260824/06-review-range-identity.md (D4, 2026-08-24): every ledger row this driver
// appends now names the commit range it judged. resolveBaseSha() resolves resolveBase()'s own
// build_base -> diff_base -> merge-base result to a full sha via `git rev-parse --verify
// <base>^{commit}` ONCE, at startup, right after resolveBase() returns — a base that cannot
// resolve now dies before the first manifest or leg (previously, stampDiffBaseIfAbsent's own
// separate resolution would warn and continue, leaving diff_base unstamped and every leg's diff
// silently wrong all run). stampDiffBaseIfAbsent reuses this same resolved sha — one resolution,
// two carriers (AC-11) — and its former warn-and-continue branch is removed outright. headSha()
// re-reads `git rev-parse HEAD` fresh at each of the three verdict.js passes (hard-stop, escalate,
// authoritative close) — fix iterations can add commits between passes — and treeDirty() runs
// `git status --porcelain --untracked-files=no` in repoRoot at the same three points (untracked
// files, e.g. the deviations sidecar, never count as dirty). All three (--base-sha/--head-sha/
// [--dirty]) are threaded into every verdict.js invocation runHardStopVerdict, writeEscalateRow,
// and doCloseWork make.
//
// specs/20260823/07-deviations-sidecar-backstop.md (D1-D6, 2026-08-23): the deviations sidecar
// (<spec>.deviations.md) was pure convention — build sessions appended departure entries by hand,
// review folded and deleted the file by hand, and nothing caught a skipped fold or an entry written
// in a shape the ledger's own `^- ` bullet count could never see. This driver now classifies the
// sidecar against the bullets-only entry grammar on every invocation while it exists on disk,
// persists {entries, malformed} into the sidecar state (surviving the file's own deletion),
// enumerates every entry into the printed CLOSE step, and refuses `--mark closed` (exit 2) while the
// sidecar still exists on disk or while the last observation recorded a malformed line even after
// deletion — prevention before loss, since same-commit fold forensics measured vacuous (A5).
//
// specs/20260830/02-close-gate-rerun.md (D1-D5, 2026-08-30, two salon-os host escapes): CLOSE
// writes the canonical doc and folds Gotchas into the host's rules file AFTER review-legs.js's own
// gate leg already ran over the diff, then commits — so the exact files CLOSE itself writes bypass
// the host's deterministic rule enforcement. handleClosed() now runs the host's resolved
// gateCommand (cwd = repoRoot, {testDirs}/{scopeDirs} resolved via lib/gate-resolve.js's
// resolveGate() — the same derivation review-legs.js's gate leg uses) as its LAST refusal check,
// after the deviations, gotchas-ratchet, and dirty-tree refusals, over the already-committed close
// tree. A red gate refuses the mark (exit 2) naming the literal phrase "gate red at close", the
// resolved command, its exit code, the last 40 lines of combined stdout+stderr, and the re-run
// remedy; marks.closed is never set (a refused mark stays side-effect-free, the existing
// invariant). An unresolvable gate (resolveGate returns {gate: null} — {testDirs} with no File
// Plan test rows — or an unreadable host config) refuses the same way rather than silently
// skipping the check, the vacuous-green class this spec exists to close. The child env has
// NODE_TEST_CONTEXT scrubbed before spawning, exactly as review-legs.js's sh() and red-check.js
// already do: this driver is itself invoked from inside `node --test` by its own tests, and a
// nested `node --test` inheriting that var degrades to a silent child-protocol run (exit 0 over
// failing tests), which would make this refusal vacuously green.
//
// CONTRACT:
//   spec-review-driver <spec.md>                  -> print current state + ONLY that step
//   spec-review-driver <spec.md> --mark <mark>    -> verify artifacts, record, print next step
//     marks: skips-extracted --file <f> | reviewer-returned --file <json> |
//            dispositions [--file <disposer return.json>] --waived N --rejected N
//              --fix-dispatched N | fix-applied | closed |
//            merge-strategy <merge-commit|ff-only|squash|rebase-ff> (bare token) |
//            conflicts-resolved | replay-recorded
//   spec-review-driver <spec.md> --state          -> print the state name only (scripting)
//
// States: LEGS (driver-only) -> STOPPED (terminal on RED_BLOCKING) | SKIPS? -> REVIEWER ->
//   DISPOSITIONS (specs/20260901/09-disposer-gate.md D2/D4 — both via values land here directly;
//   the retired session-change CHECKPOINT no longer exists) -> FIX/ESCALATE(cap 2, terminal)? ->
//   CLOSE -> MERGE/CONFLICTS -> REPLAY? -> DONE (terminal)
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
// parseable selection line, `--mark closed` while the deviations sidecar still exists on disk
// (fold-then-delete-then-commit remedy), or while the last persisted deviations observation
// recorded a malformed line even after the sidecar's own deletion (restore-then-repair remedy), a
// resolved base ref that `git rev-parse --verify <ref>^{commit}` cannot turn into a commit —
// resolveBaseSha() dies at startup, before the first manifest or leg, naming `diff_base` and the
// remedy command (specs/20260824/06-review-range-identity.md D4, AC-12), `git rev-parse HEAD`
// printing no parseable 40-hex sha at any of the three verdict passes, or `--mark closed`'s
// close-time host-gate re-run over the committed close tree exiting non-zero (message names the
// literal phrase "gate red at close", the resolved command, and the re-run remedy) or resolving to
// no runnable gate at all (message names the unresolvable-gate reason and the remedy — never a
// silent skip; specs/20260830/02-close-gate-rerun.md D1/D2/D4), or (specs/20260901/09-disposer-
// gate.md D2, the CHECKPOINT/`--skip-independence-check-because` cases above are retired outright)
// `--mark dispositions` on a non-empty survivor/leg-finding pool with `--file` absent (names
// `--file` and `spec:disposer`), the named file unreadable or not valid JSON, a disposer return
// carrying `"verdict":"DISPOSER_FAILED"` (names DISPOSER_FAILED) or a non-array `dispositions`, an
// entry whose `ref` covers a pool member zero times (names the uncovered ref) or more than once
// (names the duplicate), an entry whose `ref` matches neither pool (names the unknown ref), a
// `recommended`/`final` value outside `fix|waive|reject`, a blank `reason`, a `final` that differs
// from `recommended` with no `overriddenBy:"user"` plus non-blank `overrideReason`, a
// `--waived`/`--rejected`/`--fix-dispatched` count that does not match the return's
// `final`-or-`recommended` tallies (names `--fix-dispatched`), or `--skip-independence-check-
// because` passed at all, on any run (names the flag and ADR-0005 — there is no CHECKPOINT left
// for it to bypass).

'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
// D11 (specs/20260901/01-build-driver.md): the fail-closed spawn wrapper, the synchronous
// EAGAIN-retrying stdout writer, the ledger append, and the sidecar load/save pair now live in
// lib/driver-io.js — spec-build-driver.js needs the identical four shapes for its own
// <spec>.build/ sidecar, and a second copy here would be the drift seam ci-query.js and
// lib/gate-resolve.js were each unified over. Local wrappers below (appendLedger/saveSidecar)
// keep every existing call site in this file unchanged — only the load/save primitives moved.
const { runChild, writeOut, appendLedger: appendLedgerLib, loadSidecar, saveSidecar: saveSidecarLib } = require('./lib/driver-io')
// The repo's ONE ledger reader (live + year archives, in read order) — REPLAY counts
// stage:"replay" rows through it rather than opening the ledger a second way.
const { readLedgerRows } = require('./lib/observation')
// D4 (specs/20260823/03-silent-drop-hardening.md): the one shared frontmatter reader, replacing
// this driver's own local copy (rv_e83659d49386). D2 (specs/20260823/04-review-close-hardening.md):
// fmVal renamed fmValue (D8/D9 — no alias survives); fmBlock replaces this file's own
// `/^---\n([\s\S]*?)\n---/` block regex below.
const { fmBlock, fmValue } = require('./lib/frontmatter')
// The one --select stdout parser, shared with parse-selection.js's own direct tests (2026-08-24
// review of specs/20260823/09-replay-baseline-attribution.md: kept here as a local copy, this
// driver's exec-fixture test could never produce a genuine five-token line to prove the absence
// branch against).
const { parseSelection } = require('./lib/parse-selection')
// specs/20260824/01-render-gate.md D16: the REVIEWER step's printed text names the advisory
// render-gate run when the host config declares design.render — text only, this driver never
// runs the render gate itself (review.md's own dispatch line does; the DESIGN render gate is a
// distinct, advisory-only surface from the close-time host gateCommand re-run below). readConfig
// degrades to {} on an absent/unreadable config, which reads as "not declared" here, same as
// every other caller.
const { readConfig, CONFIG_RELPATH } = require('./lib/host-config')
// specs/20260830/02-close-gate-rerun.md D1/D3 (2026-08-30, salon-os field report): the close-time
// host-gate re-run in handleClosed() shares the exact {testDirs}/{scopeDirs} resolution
// review-legs.js's own gate leg uses — a second, paraphrased copy here would be a drift seam.
const { resolveGate } = require('./lib/gate-resolve')
// D4 (specs/20260901/02-run-provenance.md): model is derived at row-write time (never once at
// startup) — right after /clear the new transcript has no assistant line yet, and by the time a
// verdict pass runs the session has spoken many times.
const { sessionModel } = require('./lib/session-stamp.js')

// D1-D6 (specs/20260821/04-stopped-row-durability.md): a worktree review's RED_BLOCKING hard-stop
// durably appends here, at the MAIN root, instead of the worktree's own (destructible)
// spec-runs.jsonl — closes R3(1) of specs/20260820/07. readLedgerRows() already matches
// /^spec-runs.*\.jsonl$/ and union-merges in filename order (this file sorts after
// spec-runs.jsonl) — zero reader changes anywhere.
const STOPPED_LEDGER = '.claude/spec-runs.stopped.jsonl'

function die(msg) { process.stderr.write('spec-review-driver: ' + msg + '\n'); process.exit(2) }

// runChild is now lib/driver-io.js's shared fail-closed spawn wrapper (D11) — every call site
// below is unchanged (still passes its own `what` label as the 4th arg); only the definition
// moved.

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
// The CLOSE step's canonical target: the spec's own Canonical Delta section is authoritative and
// `area:` is only the fallback. Deriving `docs/canonical/${area}.md` unconditionally printed a
// wrong instruction for every spec whose area names no canonical doc — specs/20260823/08 carried
// `area: session-queue` while its Canonical Delta names `docs/canonical/status.md`, and the close
// nearly fragmented the canonical layer by creating a second file (caught by an audit 2026-08-24,
// after that review had already closed CLEAN). First `docs/canonical/<name>.md` mentioned in the
// section wins; a section naming none falls back to the area-derived name as before.
const canonicalTarget = (() => {
  const after = specText.split(/^##\s+Canonical Delta\s*$/m)[1]
  if (after === undefined) return `docs/canonical/${area}.md`
  const hit = after.split(/^##\s/m)[0].match(/docs\/canonical\/[A-Za-z0-9._-]+\.md/)
  return hit ? hit[0] : `docs/canonical/${area}.md`
})()
const buildBase = fmVal('build_base')
const diffBaseFm = fmVal('diff_base')
const designFlag = fmVal('design') === 'true'
const designSource = fmVal('design_source')
// D16: read once, at entry — repoRoot is already resolved above, and this is a pure text-only
// read (no state written), so it is safe to compute unconditionally rather than only inside the
// REVIEWER step closure.
const hostDesignConfig = readConfig(repoRoot).design
const renderGateDeclared = !!(hostDesignConfig && hostDesignConfig.render)

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
// D2/D5 (specs/20260823/07-deviations-sidecar-backstop.md): derived from resolvedSpecPath, never
// from sidecarDir — worktree-aware the same way the sidecar itself is, but never relocated (unlike
// sidecarDir) because the file is gone (folded) long before any merge-back relocation could run.
const deviationsPath = resolvedSpecPath.replace(/\.md$/, '.deviations.md')

let marks = loadSidecar(sidecarDir, 'review-state.json')
// D8/D9: set only when a self-heal attempt (deriveState()'s ESCALATE arm) hits a verdict.js drift
// refusal — the ESCALATE step text names it in place of the (unset) escalateLedgerPath. Never
// persisted: a fresh invocation retries the write from scratch rather than trusting a stale error.
let escalateDriftError = null
// saveSidecar/appendLedger are thin wrappers over lib/driver-io.js's shared primitives (D11) —
// every existing call site below (`saveSidecar()`, `appendLedger(line)`) is unchanged.
function saveSidecar() { saveSidecarLib(sidecarDir, path.basename(stateFile), marks) }

// D4: --model <sessionModel(repoRoot) or omitted when null> — one shared arg-builder for all
// three verdict.js passes below, read fresh at each call site (never cached) so a session that
// has spoken since the last pass gets its current model, not a startup snapshot.
// D6 (specs/20260901/09-disposer-gate.md): the ONE shared arg-builder for all three verdict.js
// driver passes (hard-stop, escalate, close) — appending --checkpoint here, read fresh at each
// call site against the pass's OWN iteration `n` (marks.disposer can be recorded for a different
// iteration than the one this particular pass is judging — e.g. the hard-stop pass runs before
// any reviewer return exists at all) — reaches all three identically and both via values alike
// (the old loop-only restriction is gone, D5).
function viaModelArgs(n) {
  const m = sessionModel(repoRoot)
  const args = m === null ? ['--via', marks.via] : ['--via', marks.via, '--model', m]
  const outcome = checkpointOutcome(n)
  args.push('--checkpoint', outcome.outcome)
  if (outcome.outcome === 'disposer') args.push('--checkpoint-overrides', String(outcome.overrides))
  return args
}

// D6: the outcome verdict.js's --checkpoint flag carries on every review verdict pass, derived
// from marks — never a separate persisted field. A disposer mark recorded for exactly this pass's
// iteration `n` yields "disposer" (with its overrides count) or "empty" (marks.disposer.empty);
// anything else — no disposer mark yet, or one recorded for a stale iteration — is "not-reached"
// (the hard-stop GATE_RED row, always: LEGS runs before REVIEWER, so no disposer mark can exist
// yet at that pass).
function checkpointOutcome(n) {
  const d = marks.disposer
  if (!d || d.iteration !== n) return { outcome: 'not-reached' }
  if (d.empty) return { outcome: 'empty' }
  return { outcome: 'disposer', overrides: d.overrides }
}

// ---- D2/A5 (specs/20260901/09-disposer-gate.md): the ONE derivation of the two disposition -----
// pools, shared by the printed DISPOSITIONS step body and handleDispositions()'s own --file
// verification — never two derivations that could silently disagree about what needs covering.
// survivors come from the recorded reviewer-return file (0-based `s<i>`); leg findings are the
// current manifest's non-blocking red rows (`leg:<name>`), mirroring BLOCKING_LEGS exactly as
// verdict.js's own leg-findings pool does.
function dispositionPools(n) {
  let survivors = []
  try { survivors = JSON.parse(fs.readFileSync(marks.reviewerReturnFile, 'utf8')).survivors || [] } catch { /* ignore */ }
  const legs = readManifestRows(manifestPathFor(n)).filter((r) => !BLOCKING_LEGS.has(r.leg) && r.exit !== 0)
  return { survivors, legs }
}

// ---- Gotchas cap (prose-cap.js, specs/20260823/06 + 2026-08-25 ratchet) ------------------------
// The cap used to be a CLOSE-step sentence in review.md that nothing executed: Prax closed
// 2026-08-25 at 169/15 with the cap "recorded as unmet" — the fail-open shape core § Rule
// Enforcement forbids. The driver now (a) observes the count when the verdict runs and records
// it on the review row as `gotchas` (derived, never attested), and (b) refuses `--mark closed`
// unless prose-cap passes in ratchet mode against that entry count: at/under cap → hard cap;
// over cap → the section must be strictly smaller than it was at verdict time. A host with no
// declared/readable pipelineRules file is skipped with a printed note (the state-gate hook is the
// grounding gate, not this driver); a rules file with no Gotchas section is a hard refusal.
const proseCapBin = path.join(__dirname, 'prose-cap.js')
const pipelineRulesPath = (() => {
  const rel = readConfig(repoRoot).pipelineRules
  if (!rel || typeof rel !== 'string') return null
  const abs = path.resolve(repoRoot, rel)
  return fs.existsSync(abs) ? abs : null
})()

function runProseCap(extra) {
  const r = runChild(process.execPath,
    [proseCapBin, '--file', pipelineRulesPath, '--section', 'Gotchas', ...extra],
    { encoding: 'utf8' }, 'prose-cap.js')
  if (r.status === 2) die('prose-cap.js could not measure the Gotchas section of ' + pipelineRulesPath + ': ' + (r.stdout + r.stderr).trim())
  const m = /^(\d+)\/(\d+) entries/.exec(r.stdout)
  return { status: r.status, count: m ? Number(m[1]) : null, cap: m ? Number(m[2]) : null, out: (r.stdout + r.stderr).trim() }
}

function observeGotchas() {
  if (!pipelineRulesPath) return null
  const r = runProseCap([])
  marks.gotchasAtVerdict = r.count
  return r.count
}

function refuseUnlessGotchasRatchet() {
  if (!pipelineRulesPath) return
  const baseline = Number.isFinite(marks.gotchasAtVerdict) ? marks.gotchasAtVerdict : null
  const r = runProseCap(baseline === null ? [] : ['--baseline', String(baseline)])
  if (r.status === 0) return
  die('Gotchas section of ' + pipelineRulesPath + ' is over cap and did not shrink this close — ' + r.out +
    '\nEvict at least one entry (delete / merge into docs/canonical/ / mechanize — one Rationale line ' +
    'each in the spec), commit, then re-run `node ' + __filename + ' ' + specPath + ' --mark closed`' +
    (baseline === null ? '' : ' (ratchet: ' + r.count + ' entries now, ' + baseline + ' when the verdict ran; over cap the count must be strictly lower)'))
}

// ---- D2/D5: deviations sidecar observation (specs/20260823/07-deviations-sidecar-backstop.md) --
// Classifies every line of the deviations sidecar per the bullets-only entry grammar (Contracts):
// blank/`#`-header/`- `-bullet are always allowed; a whitespace-indented continuation is allowed
// only while an entry is open (a bullet just opened it, no blank/header line has closed it since);
// anything else is malformed. `entries` counts bullet lines only — identical to build's own ledger
// `^- ` count, so a malformed flush-left line is exactly the content that count could never see.
// Called unconditionally near the top of every invocation (mark or bare) — D5's "on every
// derivation" — and persists {entries, malformed} into the sidecar state, overwriting any prior
// observation. Deliberately a no-op when the file is absent: the previously persisted observation
// must survive the file's own deletion (that survival is what makes refusal 2 possible below).
function observeDeviations() {
  if (!fs.existsSync(deviationsPath)) return
  const lines = fs.readFileSync(deviationsPath, 'utf8').split('\n')
  let entries = 0
  let entryOpen = false
  const malformed = []
  lines.forEach((raw, idx) => {
    if (/^\s*$/.test(raw)) { entryOpen = false; return }
    if (/^#/.test(raw)) { entryOpen = false; return }
    if (/^- /.test(raw)) { entries++; entryOpen = true; return }
    if (entryOpen && /^\s+\S/.test(raw)) return
    malformed.push({ line: idx + 1, text: raw.slice(0, 120) })
  })
  marks.deviations = { entries, malformed }
  saveSidecar()
}
observeDeviations()

// Shared "<line>: <text>" renderer for both `closed` refusals (Contracts: "first 10, then `… and N
// more`") — bare lines, no leading indentation, so a caller printing them straight (the refusal
// messages) gets one evidence line per line-of-file; CLOSE's own enumeration below indents it.
function malformedLines(malformed) {
  const shown = malformed.slice(0, 10).map((m) => m.line + ': ' + m.text)
  if (malformed.length > 10) shown.push('… and ' + (malformed.length - 10) + ' more')
  return shown
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

// ---- D4 (specs/20260901/02-run-provenance.md): --via recorded once, at sidecar creation --------
// A later invocation naming a different --via is ignored — the run's provenance is fixed at
// creation, so a resumed session reports the same via the run started with, never re-derived.
// flag('--via') (A5) reads any --via value present; anything other than exactly "loop" defaults
// to "direct", mirroring verdict.js's own default (D3) — the driver documents no separate --via
// usage refusal, so an unrecognized value is treated the same as its absence rather than dying.
// Placed AFTER the terminal-cold-path short-circuits above (never before them): saving here on a
// spec already status:"done" with no sidecar would resurrect the very directory printDoneNow just
// deleted, corrupting a `--state` query on a finished review into a fresh restart attempt.
if (marks.via === undefined) {
  marks.via = flag('--via') === 'loop' ? 'loop' : 'direct'
  saveSidecar()
}

// ---- base derivation (D2, revised: diff_base -> build_base -> branch) -------------------------
// A PIN ALWAYS BEATS A REF. `diff_base` is a 40-hex sha written at build start (in-place flow) or
// at a prior close; `build_base` is conventionally the moving ref `main`, and two different
// commands write these fields with no ordering guard between them — /git:enter-worktree stamps
// `build_base: main` whenever it runs, including AFTER a build has already pinned the true
// pre-image. Preferring the ref over the pin is how a review comes to judge an empty range: on
// 2026-09-01 (spec 20260901/01) `main` already carried the build's own commits, so `main...HEAD`
// was empty, every diff-scoped leg reported zero and green (at-risk files:0, reconcile listing all
// 27 planned files "unrealized"), and the reviewer was handed nothing to review. replay.js:374
// had already inverted this order for exactly this reason ("build_base is typically the moving
// ref `main`, stale the instant the review's own merge lands") — the fix landed in that consumer
// and was never pushed back here. This is that push-back; the non-degenerate-range invariant in
// resolveBaseSha() below is the backstop for whatever the NEXT base-derivation mistake turns out
// to be, since precedence alone only fixes the failure mode already seen.
function resolveBase() {
  if (diffBaseFm) return diffBaseFm
  if (buildBase) return buildBase
  for (const cand of ['main', 'master']) {
    const r = runChild('git', ['-C', repoRoot, 'merge-base', 'HEAD', cand], { encoding: 'utf8' },
      'git merge-base HEAD ' + cand)
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim()
  }
  die('spec frontmatter carries neither build_base nor diff_base, and no main/master branch ' +
    'exists to derive one from — add build_base (or diff_base) to the spec frontmatter')
}
const base = resolveBase()

// ---- D4 (specs/20260824/06-review-range-identity.md): resolve base to a full sha ONCE, at ------
// startup, right after resolveBase() — so an unresolvable base dies before the first manifest or
// leg (AC-12), not at the first verdict pass. stampDiffBaseIfAbsent() below reuses this exact sha
// (one resolution, two carriers, AC-11) instead of running its own rev-parse; its former
// warn-and-continue branch is removed — a base that cannot resolve already broke every leg's diff,
// so the row must not pretend otherwise.
const SHA40_RE = /^[0-9a-f]{40}$/
function resolveBaseSha() {
  const r = runChild('git', ['-C', repoRoot, 'rev-parse', '--verify', base + '^{commit}'],
    { encoding: 'utf8' }, 'git rev-parse --verify (base resolution)')
  const sha = (r.stdout || '').trim()
  if (r.status !== 0 || !SHA40_RE.test(sha)) {
    die('base "' + base + '" does not resolve to a commit — add diff_base: <sha> to the spec ' +
      'frontmatter (git rev-parse --verify <ref>^{commit})')
  }
  // ---- non-degenerate-range invariant (2026-09-01, spec 20260901/01 review) -------------------
  // A review that judges an empty range is not a review, and it fails GREEN: every diff-scoped leg
  // (at-risk, reconcile, patterns, diffLoc) reports zero and passes, and the reviewer sees nothing.
  // Nothing downstream objects — verdict.js validates sha SHAPE only, so ledger row rv_31224a17550e
  // recorded base === head and no leg, no verdict pass and no ledger append noticed. Refuse here,
  // at the single point where the range is first known, rather than trusting every future caller to
  // have derived it correctly. Mirrors replay.js:386-391, which already validates its own candidates
  // this way (`sha !== parent` + `merge-base --is-ancestor`).
  //
  // SCOPED TO THE JUDGING PHASES. Once `closed` is marked the verdict is already recorded and what
  // remains is merge mechanics, which run from the MAIN ROOT — where HEAD legitimately still sits
  // at the base, because the spec's commits are on a branch that has not merged yet. Checking there
  // refuses every worktree merge-back (executed: it broke 6 merge/promotion/flip tests, all of them
  // correct). The range is validated on the way IN, which is the only point where a bad range can
  // still cause a false verdict.
  if (marks.closed) return sha
  const head = headSha()
  if (sha === head) {
    die('the review range is empty — base and HEAD are the same commit (' + sha.slice(0, 12) +
      '). The spec\'s base names a moving ref that has caught up with HEAD (build_base: ' +
      (buildBase || '<unset>') + '), so there is nothing to review and every diff-scoped leg would ' +
      'report zero and pass. Remedy: set diff_base: <the commit the build started from> in the ' +
      'spec frontmatter (git log --oneline to find it), or delete a build_base: line that names a ' +
      'branch rather than a sha')
  }
  const anc = runChild('git', ['-C', repoRoot, 'merge-base', '--is-ancestor', sha, head],
    { encoding: 'utf8' }, 'git merge-base --is-ancestor (base range check)')
  if (anc.status !== 0) {
    die('the review base ' + sha.slice(0, 12) + ' is not an ancestor of HEAD ' + head.slice(0, 12) +
      ' — the base ref has moved past this branch, so the diff would carry foreign reverse hunks ' +
      'from commits this spec never made. Remedy: set diff_base: <the commit the build started ' +
      'from> in the spec frontmatter')
  }
  return sha
}
const baseSha = resolveBaseSha()

// ---- D4: HEAD is re-read fresh at each verdict pass (fix iterations can add commits between -----
// passes) and the tree's dirty state is checked the same way — --untracked-files=no is deliberate,
// the deviations sidecar and scratch artifacts are always on disk at every pass.
function headSha() {
  const r = runChild('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' },
    'git rev-parse HEAD')
  const sha = (r.stdout || '').trim()
  if (r.status !== 0 || !SHA40_RE.test(sha)) {
    die('git rev-parse HEAD in ' + repoRoot + ' did not print a 40-hex commit sha (got ' +
      JSON.stringify(sha) + ') — confirm ' + repoRoot + ' is a valid git checkout with at least ' +
      'one commit')
  }
  return sha
}
function treeDirty() {
  const r = runChild('git', ['-C', repoRoot, 'status', '--porcelain', '--untracked-files=no'],
    { encoding: 'utf8' }, 'git status --porcelain --untracked-files=no')
  return r.status === 0 && r.stdout.split('\n').some((l) => l.trim())
}

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

function appendLedger(jsonLine) { appendLedgerLib(repoRoot, jsonLine) }

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
    '--diff-loc', String(diffLoc), '--iteration', String(n), '--run-id', runId,
    '--base-sha', baseSha, '--head-sha', headSha(), ...viaModelArgs(n)]
  if (treeDirty()) args.push('--dirty')
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
    '--iteration', String(n), '--run-id', runId, '--retain', path.join(repoRoot, '.claude/spec-runs'),
    '--base-sha', baseSha, '--head-sha', headSha(), ...viaModelArgs(n)]
  if (treeDirty()) args.push('--dirty')
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

// ---- D3 (specs/20260823/05-replay-unattended-hardening.md): stamp diff_base at the close flip --
// specs/20260819/02's replay harness read a spec's build_base — typically the moving ref `main`
// — as its diff base; that ref goes stale the instant THIS review's own merge lands, so a
// scheduled replay run diffed the wrong tree (rv_387d84a3b424). The close commit is the last
// moment the moving ref and the true pre-image coincide, so this is the one durable place to pin
// it: `base` (resolveBase()'s own build_base -> diff_base -> branch derivation, already used for
// every leg's diffing this run) is resolved to a full sha here, pre-merge, and inserted directly
// after the `build_base:` line (or before the closing `---` fence when no build_base line exists)
// — never as a second derivation, and never overwriting a diff_base already present (absent-only:
// a spec closed once already keeps its original pin byte-identical forever).
function stampDiffBaseIfAbsent(text) {
  if (diffBaseFm) return text // already stamped (or hand-authored) — never overwritten
  // D4: reuses baseSha, resolved once at startup (die() already ran there on failure) — never a
  // second rev-parse, and never a warn-and-continue: a base that cannot resolve already broke
  // every leg's diff this run, so the stamp must not pretend otherwise.
  const sha = baseSha
  const m = /^---\n([\s\S]*?)\n---/.exec(text)
  if (!m) return text // no frontmatter fence to stamp into — should not happen for a valid spec
  const lines = m[1].split('\n')
  const buildIdx = lines.findIndex((l) => /^build_base:/.test(l))
  const stampLine = 'diff_base: ' + sha
  if (buildIdx !== -1) lines.splice(buildIdx + 1, 0, stampLine)
  else lines.push(stampLine)
  return text.slice(0, m.index) + '---\n' + lines.join('\n') + '\n---' + text.slice(m.index + m[0].length)
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
    '--iteration', String(n), '--run-id', runId, '--retain', retainDir,
    '--base-sha', baseSha, '--head-sha', headSha(), ...viaModelArgs(n)]
  if (treeDirty()) args.push('--dirty')
  const r = runChild(process.execPath, [verdictBin, ...args], { encoding: 'utf8' },
    'verdict.js (authoritative pass)')
  if (r.status === 2) die('verdict.js (authoritative pass) failed: ' + (r.stdout + r.stderr).trim())
  const lines = r.stdout.split('\n')
  // Gotchas count rides the review row only when a rules file was observed — a host without one
  // keeps verdict.js's line byte-identical.
  const gotchas = observeGotchas()
  if (gotchas !== null) {
    const row = JSON.parse(lines[1])
    row.gotchas = gotchas
    lines[1] = JSON.stringify(row)
  }
  appendLedger(lines[1])

  const newSpecText = specText.replace(/^status:\s*.*$/m, 'status: done')
  const stampedText = stampDiffBaseIfAbsent(newSpecText)
  fs.writeFileSync(resolvedSpecPath, stampedText)

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
  if (STATE_ONLY) { writeOut(1, 'DONE\n'); process.exit(0) }
  fs.rmSync(sidecarDir, { recursive: true, force: true })
  const status2 = runChild(process.execPath, [specStatusBin, '--root', repoRoot, '--next'],
    { encoding: 'utf8' }, 'spec-status.js --next')
  const nextLine = status2.status === 0 ? status2.stdout.trim() : '(spec-status --next unavailable)'
  writeOut(1, `[spec-review-driver] state: DONE  spec: ${replaySpecPath}\n` +
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

function replayStepBody(t) {
  return `## Step: run the due reviewer replay\n` +
    `The replay window is due and the harness selected a target. Execute ` +
    `spec/commands/replay.md's Phases 1-5 in THIS session — in-session mutation authoring, blind ` +
    `reviewer dispatch, score, record, teardown. Phase 0 is this driver's own entry work above ` +
    `and is never repeated.\n` +
    `  spec:        ${t.spec}\n` +
    `  reviewRunId: ${t.reviewRunId}\n` +
    `  commit:      ${t.commit}\n` +
    `  parent:      ${t.parent}\n` +
    `  diffBase:    ${t.diffBase}\n` +
    `  baselineRed: ${t.baselineRed}\n` +
    `  baselineLegs:${t.baselineLegs}\n` +
    `  root:        ${repoRoot}   (pass as replay.js --root — the harness otherwise resolves the ` +
    `ledger from the session's cwd, which the scratch worktree can capture)\n` +
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
  if (STATE_ONLY) { writeOut(1, 'REPLAY\n'); process.exit(0) }
  writeOut(1, `[spec-review-driver] state: REPLAY  spec: ${replaySpecPath}\n` +
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
  // D8 (specs/20260901/08-corpus-derivation-and-kill-match.md, 2026-09-01, brief 19): killed must
  // be an array, and every entry an object carrying a string claim plus BOTH file (string|null)
  // and line (number|null) keys PRESENT — explicit null for a process-level claim, never an
  // omitted key. Extends this same verdict/survivors validation seam; never a second pass, and
  // nothing is written (no sidecar file, no mark mutation) before every entry checks out.
  if (!Array.isArray(json.killed)) {
    die('--file ' + file + ' is missing a killed array — the reviewer return shape must be ' +
      '{claim, file, line, evidence} per killed entry; re-dispatch and write a valid return')
  }
  for (let i = 0; i < json.killed.length; i++) {
    const k = json.killed[i]
    const shapeOk = k && typeof k === 'object'
      && typeof k.claim === 'string'
      && Object.prototype.hasOwnProperty.call(k, 'file') && (k.file === null || typeof k.file === 'string')
      && Object.prototype.hasOwnProperty.call(k, 'line') && (k.line === null || typeof k.line === 'number')
    if (!shapeOk) {
      die('--file ' + file + ' killed[' + i + '] does not match the required shape ' +
        '{claim, file, line, evidence} (claim: string, file: string|null, line: number|null, both ' +
        'keys present) — re-dispatch the reviewer and write a killed entry for every claim it ' +
        'investigated and dismissed, with an explicit null when the claim carries no location')
    }
  }
  const n = listManifestNumbers().length ? Math.max(...listManifestNumbers()) : 0
  fs.mkdirSync(sidecarDir, { recursive: true })
  const dest = path.join(sidecarDir, `reviewer-return-${n}.json`)
  fs.writeFileSync(dest, raw)
  marks.reviewerReturnFile = dest
  marks.reviewerReturnIteration = n
  marks.dispositions = null
  marks.dispositionsIteration = null
  // D4 (specs/20260901/09-disposer-gate.md): reset alongside dispositions — every iteration needs
  // its own disposer return, so a fix-delta pass's second reviewer-returned must never let a stale
  // prior-iteration disposer mark satisfy this iteration's --mark dispositions.
  marks.disposer = null
  marks.pendingFix = false
  saveSidecar()
  return null
}

// D2/D4 (specs/20260901/09-disposer-gate.md): the driver refuses to advance --mark dispositions
// on a non-empty pool without a disposer return covering every finding exactly once, each with a
// non-blank grounded reason. --skip-independence-check-because is retired outright (ADR-0005) —
// there is no CHECKPOINT left for it to bypass, so it is refused unconditionally, before any
// pool/file work, never silently ignored. Nothing is mutated (no saveSidecar()) before every
// check below passes — a refused mark is always side-effect-free, leaving review-state.json
// byte-identical.
const RECOMMEND_ENUM = new Set(['fix', 'waive', 'reject'])
function handleDispositions() {
  if (!marks.reviewerReturnFile) die('no reviewer return recorded yet — mark reviewer-returned first')
  // D4/A4: argv.includes(...) catches the flag whether it is bare (flag() would return `true`) or
  // carries a value — a stale doctrine copy or memory teaching the retired override must never
  // silently succeed.
  if (argv.includes('--skip-independence-check-because')) {
    die('--skip-independence-check-because is retired (ADR-0005, specs/20260901/09-disposer-gate.md) ' +
      '— independence is now the disposer agent (spec:disposer), dispatched at DISPOSITIONS on both ' +
      '/spec:run and /spec:review; drop the flag')
  }
  const n = marks.reviewerReturnIteration
  const pools = dispositionPools(n)
  const poolRefs = [
    ...pools.survivors.map((_, i) => 's' + i),
    ...pools.legs.map((r) => 'leg:' + r.leg),
  ]
  const waivedRaw = flag('--waived'), rejectedRaw = flag('--rejected'), fixRaw = flag('--fix-dispatched')
  const waived = Number(waivedRaw), rejected = Number(rejectedRaw), fixDispatched = Number(fixRaw)
  if (![waived, rejected, fixDispatched].every(Number.isFinite)) {
    die('--mark dispositions needs numeric --waived/--rejected/--fix-dispatched (got ' +
      JSON.stringify({ waivedRaw, rejectedRaw, fixRaw }) + ')')
  }

  let dest = null
  let overrides = 0
  if (poolRefs.length > 0) {
    const file = flag('--file')
    if (!file || typeof file !== 'string') {
      die('--mark dispositions needs --file <disposer return json> — the survivor/leg-finding pools ' +
        'are non-empty, so dispatch Agent {subagent_type: "spec:disposer"} first and pass the path ' +
        'it wrote its return to')
    }
    let raw
    try { raw = fs.readFileSync(file, 'utf8') } catch (e) {
      die('--file ' + file + ' could not be read (' + e.message + ') — re-dispatch spec:disposer and ' +
        'pass the path it actually wrote its return to')
    }
    let ret
    try { ret = JSON.parse(raw) } catch (e) {
      die('--file ' + file + ' is not valid JSON (' + e.message + ') — re-dispatch spec:disposer and ' +
        'write a clean {verdict, dispositions, tokens} return')
    }
    if (ret.verdict === 'DISPOSER_FAILED') {
      die('the disposer returned DISPOSER_FAILED (a failed dispatch, never a disposition) — ' +
        're-dispatch Agent {subagent_type: "spec:disposer"} and mark dispositions again once it completes')
    }
    if (!Array.isArray(ret.dispositions)) {
      die('--file ' + file + ' is missing a dispositions array — the disposer return shape must be ' +
        '{verdict, dispositions, tokens}; re-dispatch and write a valid return')
    }
    const seen = new Map()
    for (const entry of ret.dispositions) {
      const ref = entry && typeof entry.ref === 'string' ? entry.ref : null
      if (ref === null) {
        die('--file ' + file + ' has a dispositions entry with no string ref — every entry must name ' +
          'the survivor (s<i>) or leg finding (leg:<name>) it dispositions')
      }
      seen.set(ref, (seen.get(ref) || 0) + 1)
    }
    for (const [ref, count] of seen) {
      if (count > 1) {
        die('--file ' + file + ' lists ' + ref + ' more than once — every survivor and leg finding ' +
          'must be covered exactly once')
      }
    }
    for (const ref of poolRefs) {
      if (!seen.has(ref)) {
        die('--file ' + file + ' does not cover ' + ref + ' — every survivor and leg finding must ' +
          'receive exactly one recommendation')
      }
    }
    for (const ref of seen.keys()) {
      if (!poolRefs.includes(ref)) {
        die('--file ' + file + ' recommends ' + ref + ', which matches nothing in the survivor or ' +
          'leg-finding pools for this iteration')
      }
    }
    const tally = { fix: 0, waive: 0, reject: 0 }
    for (const entry of ret.dispositions) {
      if (!RECOMMEND_ENUM.has(entry.recommended)) {
        die('--file ' + file + ' entry ' + entry.ref + ' has recommended ' +
          JSON.stringify(entry.recommended) + ' — must be one of fix|waive|reject')
      }
      if (typeof entry.reason !== 'string' || !entry.reason.trim()) {
        die('--file ' + file + ' entry ' + entry.ref + ' has a blank reason — every recommendation ' +
          'must quote the sanctioning spec line or cite an executed check')
      }
      let effective = entry.recommended
      if (entry.final !== undefined) {
        if (!RECOMMEND_ENUM.has(entry.final)) {
          die('--file ' + file + ' entry ' + entry.ref + ' has final ' + JSON.stringify(entry.final) +
            ' — must be one of fix|waive|reject')
        }
        if (entry.final !== entry.recommended) {
          if (entry.overriddenBy !== 'user' || typeof entry.overrideReason !== 'string' ||
              !entry.overrideReason.trim()) {
            die('--file ' + file + ' entry ' + entry.ref + ' has final different from recommended with ' +
              'no overriddenBy:"user" plus a non-blank overrideReason — only the user overrides a ' +
              'disposition')
          }
          overrides++
        }
        effective = entry.final
      }
      tally[effective]++
    }
    if (tally.fix !== fixDispatched || tally.waive !== waived || tally.reject !== rejected) {
      die('--waived/--rejected/--fix-dispatched (' + waived + '/' + rejected + '/' + fixDispatched +
        ') do not match the return\'s final-or-recommended tallies (waive:' + tally.waive +
        ' reject:' + tally.reject + ' fix:' + tally.fix + ') — recount before re-running')
    }
    fs.mkdirSync(sidecarDir, { recursive: true })
    dest = path.join(sidecarDir, `disposer-return-${n}.json`)
    fs.writeFileSync(dest, raw)
  }

  const args = ['--manifest', manifestPathFor(n), '--workflow', marks.reviewerReturnFile,
    '--waived', String(waived), '--rejected', String(rejected), '--fixDispatched', String(fixDispatched)]
  const r = runChild(process.execPath, [verdictBin, ...args], { encoding: 'utf8' },
    'verdict.js (dispositions pass)')
  if (r.status === 2) die((r.stderr || r.stdout).trim())
  const word = r.stdout.split('\n')[0].trim()
  marks.dispositions = { waived, rejected, fixDispatched, word }
  marks.dispositionsIteration = n
  // D2: empty pools -> {file:null, iteration, overrides:0, empty:true}; non-empty, accepted ->
  // {file, iteration, overrides}.
  marks.disposer = poolRefs.length > 0
    ? { file: dest, iteration: n, overrides }
    : { file: null, iteration: n, overrides: 0, empty: true }
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

// ---- D1/D2/D4: close-time host-gate re-run (specs/20260830/02-close-gate-rerun.md) -------------
// The gate re-run's LAST refusal check in handleClosed() — see this file's header comment for the
// incident. Resolves the same {testDirs}/{scopeDirs} form review-legs.js's own gate leg resolves
// (lib/gate-resolve.js's resolveGate(), D3), runs it with cwd = repoRoot, and refuses (exit 2,
// side-effect-free — this runs before any mutation in handleClosed()) on either a non-zero exit or
// an unresolvable gate. NODE_TEST_CONTEXT is scrubbed from the child env exactly as review-legs.js's
// sh() already does: this driver is itself invoked from inside `node --test` by its own tests, and
// a nested `node --test` inheriting that var degrades to a silent child-protocol run (exit 0 over
// failing tests) — which would make this refusal vacuously green.
function tailLines(text, n) {
  const lines = text.split('\n')
  if (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines.slice(-n).join('\n')
}
function runCloseTimeGate() {
  const gateConfig = readConfig(repoRoot)
  const resolved = resolveGate(specText, gateConfig)
  if (!resolved.gate) {
    const reason = resolved.reason ||
      ('no gateCommand declared in ' + CONFIG_RELPATH + ' under ' + repoRoot + ' (host config missing, unreadable, or unparsable)')
    die('close-time host gate could not be resolved — ' + reason + ' — fix the host config / File ' +
      'Plan, then re-run `node ' + __filename + ' ' + specPath + ' --mark closed`')
  }
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const r = runChild('bash', ['-c', resolved.gate], { cwd: repoRoot, encoding: 'utf8', env },
    'close-time host gate (' + resolved.gate + ')')
  if (r.status !== 0) {
    const output = (r.stdout || '') + (r.stderr || '')
    die('gate red at close — ' + resolved.gate + ' exited ' + r.status + ' over the committed ' +
      'close tree.\nThe files written at CLOSE (canonical doc, rules fold) are inside the host\'s ' +
      'rule surface; fix them, commit the fix, then re-run `node ' + __filename + ' ' + specPath +
      ' --mark closed`.\n--- last 40 lines of gate output ---\n' + tailLines(output, 40))
  }
}

function handleClosed() {
  if (status !== 'done') {
    die('spec status is not yet "done" — re-run the driver with no mark first so CLOSE\'s ' +
      'authoritative verdict runs and flips status')
  }
  // D3/D5 (specs/20260823/07-deviations-sidecar-backstop.md): both deviations refusals run BEFORE
  // the dirty-tree check below — a lingering (committed, unchanged) sidecar is invisible to that
  // check entirely (A3), which is the whole gap this closes. Refusal 1 re-observes and persists
  // FIRST, then refuses — otherwise a repair made to the file after the last derivation would be
  // invisible to refusal 2's own check on a later invocation. State is left unchanged either way:
  // die() exits before marks.closed is ever set.
  if (fs.existsSync(deviationsPath)) {
    observeDeviations()
    const dev = marks.deviations
    const foldRemedy = 'fold-then-delete-then-commit: fold ' + deviationsPath + ' into Gotchas ' +
      '[host]/[plugin] (recurring departures) or the spec\'s Rationale (one-offs), delete the ' +
      'sidecar, and commit the deletion, then re-run `node ' + __filename + ' ' + specPath +
      ' --mark closed`'
    if (dev && dev.malformed && dev.malformed.length) {
      die('deviations sidecar ' + deviationsPath + ' still exists on disk and its last observation ' +
        'recorded ' + dev.malformed.length + ' malformed line(s) — repair them, then ' + foldRemedy +
        ':\n' + malformedLines(dev.malformed).join('\n'))
    }
    die('deviations sidecar ' + deviationsPath + ' still exists on disk — ' + foldRemedy)
  }
  if (marks.deviations && marks.deviations.malformed && marks.deviations.malformed.length) {
    const dev = marks.deviations
    die('deviations sidecar ' + deviationsPath + ' is gone but the last observation recorded ' +
      dev.malformed.length + ' malformed line(s) — restore it, repair, then re-run this driver so ' +
      'it re-observes clean, fold, delete, and re-commit before re-marking closed:\n' +
      '  git checkout <ref> -- ' + deviationsPath + '\n' + malformedLines(dev.malformed).join('\n'))
  }
  refuseUnlessGotchasRatchet()
  const dirty = gitStatusPaths(repoRoot)
  const unexpected = dirty.filter((p) =>
    !(p === sidecarRel || p.startsWith(sidecarRel + '/') ||
      p === '.claude/spec-runs.jsonl' || p.startsWith('.claude/spec-runs/')))
  if (unexpected.length) {
    die('tree is dirty beyond the sidecar and retained evidence — unexpected path(s): ' +
      unexpected.join(', ') + ' — commit or clean them (never git add -A past an unadjudicated ' +
      'path), then re-run this mark')
  }
  // D1: LAST refusal check — after deviations, gotchas-ratchet, and dirty-tree above — so the gate
  // observes the exact committed close tree those checks just certified. die()s before any
  // mutation; a refused mark is always side-effect-free.
  runCloseTimeGate()
  marks.closed = true
  saveSidecar()
  return null
}

function gotchasCapLine() {
  if (!pipelineRulesPath) return ''
  const n = marks.gotchasAtVerdict
  const cap = 15
  if (!Number.isFinite(n)) return ''
  if (n <= cap) {
    return `   Gotchas cap: ${n}/${cap} at verdict — after the fold the section must still hold <= ${cap} ` +
      `entries (--mark closed refuses otherwise).\n`
  }
  return `   Gotchas cap: ${n}/${cap} at verdict — OVER CAP. --mark closed refuses unless the section ends ` +
    `this close with fewer than ${n} entries (ratchet: evict at least one net entry — delete / merge ` +
    `into docs/canonical/ / mechanize — one Rationale line each; full pruning is separate direct work).\n`
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
    writeOut(1, `[spec-review-driver] state: CONFLICTS  spec: ${specPath}\n\n` +
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
      ' --legs <green|red:leg|baseline-red:leg[,leg]|none> --outcome ' +
      '<caught|missed|leg-caught|unresolved|setup-failed> [--class <id>] [--patch <f>] [--workflow <f>]')
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

  // D4 (specs/20260901/09-disposer-gate.md): CHECKPOINT retired — both via values land
  // DISPOSITIONS directly after a fresh reviewer return.
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

if (STATE_ONLY) { writeOut(1, state + '\n'); process.exit(0) }

// ---- step text per state -------------------------------------------------------------------------
const manifestPath = manifestPathFor(currentN)
const outDir = outDirFor(currentN)
const waivedWarn = (marks.dispositions && marks.dispositions.waived > 0)
  ? `⚠ ${marks.dispositions.waived} finding(s) waived this run — confirm in the close report.\n`
  : ''

// D4 (specs/20260823/07-deviations-sidecar-backstop.md): the CLOSE enumeration reads entry
// first-lines from the sidecar FILE itself, never a persisted key — at CLOSE-print time the fold
// has not happened yet (Behavior), so the file is still on disk, and the persisted `deviations`
// observation deliberately carries only `entries`/`malformed` (no third key for entry text).
function deviationsEntryLines() {
  if (!fs.existsSync(deviationsPath)) return []
  return fs.readFileSync(deviationsPath, 'utf8').split('\n')
    .filter((l) => /^- /.test(l)).map((l) => l.slice(0, 120))
}
// Additive-only: byte-identical CLOSE print when no observation was ever persisted (no sidecar ever
// seen this run) — `marks.deviations` stays undefined and this returns ''.
function deviationsEnumBlock() {
  if (!marks.deviations || marks.deviations.entries < 1) return ''
  const numbered = deviationsEntryLines().map((l, i) => `  ${i + 1}. ${l}`).join('\n')
  const malformed = marks.deviations.malformed || []
  const malformedPart = malformed.length
    ? `\n⚠️ malformed:\n` + malformedLines(malformed).map((l) => '  ' + l).join('\n')
    : ''
  return numbered + malformedPart + '\n'
}

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
      ? '  design specs also get the component-manifest audit agent alongside the reviewer' +
        (renderGateDeclared
          ? '; also run the advisory render gate review.md names (design.render is declared — its ' +
            'run now carries the design-rules.json renderCheck pass too) and hand its report path ' +
            'to the reviewer as evidence.\n'
          : ' (design.render is not declared — skip the advisory render-gate run).\n')
      : '') +
    `Write its structured return ({verdict, survivors, killed, reviewerCount, scope, tokens}) to ` +
    `a file, then:\n  node ${__filename} ${specPath} --mark reviewer-returned --file <return.json>\n` +
    `REVIEWER_FAILED is a failed run, never CLEAN — re-dispatch before marking.`,

  // D2/D3 (specs/20260901/09-disposer-gate.md): dispositionPools(n) is the SAME derivation
  // handleDispositions()'s own --file verification uses (A5) — this step and that check can never
  // silently disagree about what needs covering.
  DISPOSITIONS: () => {
    const { survivors, legs } = dispositionPools(currentN)
    if (survivors.length === 0 && legs.length === 0) {
      return `## Step: dispositions due — nothing to disposition\n` +
        `survivors (0) · leg findings (0). Then:\n` +
        `  node ${__filename} ${specPath} --mark dispositions --waived 0 --rejected 0 --fix-dispatched 0`
    }
    return `## Step: dispositions due — dispatch the disposer, apply its recommendations\n` +
      `survivors (${survivors.length}):\n` +
      survivors.map((s) => `  [${s.severity}] ${s.file}:${s.line} — ${s.claim}`).join('\n') + '\n' +
      `leg findings (${legs.length}):\n` +
      legs.map((r) => `  ${r.leg} exit=${r.exit} ${JSON.stringify(r.observed)}`).join('\n') + '\n' +
      `Dispatch ONE Agent {subagent_type: "spec:disposer"} with the spec path, diff base ${base}, ` +
      `root ${repoRoot}, the pipeline-rules path${pipelineRulesPath ? ' (' + pipelineRulesPath + ')' : ' (none declared)'}, ` +
      `and this iteration's evidence:\n` +
      `  reviewer return: ${marks.reviewerReturnFile}\n` +
      `  manifest: ${manifestPath}\n` +
      `  outputs: ${outDir}\n` +
      `Fix recommendations dispatch without a question; waive/reject recommendations go to the ` +
      `user (AskUserQuestion; record the answer as final with overriddenBy:"user" when it differs).\n` +
      `Write the return to a file, then:\n` +
      `  node ${__filename} ${specPath} --mark dispositions --file <return.json> --waived N --rejected N --fix-dispatched N\n` +
      `DISPOSER_FAILED is a failed dispatch, never a disposition — re-dispatch before marking.`
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
    const gateRerunNote = `   Marking closed re-runs the host gate over the committed close tree — format the ` +
      `files you wrote in steps 1-2 to the host's rules before committing, or the mark will refuse.\n`
    const closeCommitLine = inPlace
      ? `4. Commit everything still uncommitted on the working branch (never --no-verify) — this ` +
        `is the close commit.\n` + gateRerunNote
      : `4. Commit everything still uncommitted on the working branch EXCEPT ${sidecarRel}/, ` +
        `.claude/spec-runs.jsonl, and .claude/spec-runs/ (never --no-verify) — this review is ` +
        `running in a linked worktree (main root: ${mainRoot}), so the ledger and retained ` +
        `evidence are promoted there only once the merge lands, not committed from the worktree ` +
        `now; this is the close commit.\n` + gateRerunNote
    return `## Step: close (the driver has already run the authoritative verdict and flipped status: done)\n` +
      `verdict: ${marks.dispositions.word}   runId: ${marks.closeRunId}   ` +
      `retained: .claude/spec-runs/${marks.closeRunId}.json\n` +
      waivedWarn +
      `1. Apply the spec's Canonical Delta to ${canonicalTarget}.\n` +
      `2. Fold the deviations sidecar if one exists (recurring -> Gotchas [host]/[plugin]; one-offs ` +
      `-> the spec's Rationale); delete the sidecar.\n` +
      deviationsEnumBlock() +
      gotchasCapLine() +
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

writeOut(1, `[spec-review-driver] state: ${state}  spec: ${specPath}\n` +
  `(re-run this driver after completing the step; it verifies artifacts and prints the next one)\n\n` +
  STEPS[state]() + '\n')
process.exit(0)
