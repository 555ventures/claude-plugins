#!/usr/bin/env node
// Deterministic state-machine driver for the review stage.
// Owner: specs/20260820/07-review-driver.md
//
// The driver EXECUTES every deterministic step itself (base derivation, the per-iteration
// manifest lifecycle, review-legs.js, all three verdict.js passes, the ledger appends, the
// implementing->done flip, the merge-back sequence) and prints ONLY the step that needs this
// session's judgment (reviewer dispatch, dispositions, the Canonical Delta + deviations fold, the
// close commit, merge strategy, conflict resolution). State is re-derived from spec frontmatter +
// the <spec>.review/ sidecar + on-disk artifacts on EVERY invocation — a mark whose artifact
// vanished is demanded again, and the fix-iteration cap is counted from the `scope: fix-delta`
// manifests on disk plus this spec's uncleared `escalated:true` ledger rows, never a sidecar
// counter. Every child process is routed through one fail-closed helper (runChild): a null
// spawnSync status (signal, never spawned, maxBuffer overflow) is a refusal, never a pass.
//
// A legs run over an unchanged tree reuses green rows: runLegs records marks.legsTree[n] =
// snapshotTree(); `--mark skips-extracted` and `--mark repair-round` compare a fresh snapshot to
// marks.legsTree[curN] and, when equal, pass review-legs `--reuse-from <prior manifest>`. A leg red
// in the prior manifest and green in the new one over the same tree is recorded in marks.flaky[n].
//
// What this deliberately does NOT do: recommend a disposition, pick a merge strategy, or render
// a user-facing report — it prints machine summaries plus which judgment is due and the
// evidence paths; report assembly stays with the session via report-render.js. It never asserts
// the verdict word itself (verdict.js is the sole derivation, surfaced through this driver).
//
// Ledger writes: the GATE_RED hard-stop row, the ESCALATE row (writeEscalateRow(), written at the
// fix-cap refusal and self-healed from a bare re-invocation parked at ESCALATE, idempotent on
// marks.escalateRunId), and the CLOSE row. Every row names the commit range it judged: the base is
// resolved to a full sha ONCE at startup (resolveBaseSha(); an unresolvable base dies before the
// first leg), headSha() and treeDirty() are re-read at each verdict pass.
//
// The deviations sidecar (<spec>.deviations.md) is classified against the bullets-only entry
// grammar on every invocation; {entries, malformed} persist in the sidecar state (surviving the
// file's deletion), CLOSE enumerates every entry, and `--mark closed` refuses while the file
// exists or the last observation recorded a malformed line.
//
// `--mark closed` re-runs the host's resolved gateCommand and then the bare testCommand over the
// committed close tree (the files CLOSE writes land after the legs ran), with NODE_TEST_CONTEXT
// scrubbed from the child env; it also measures the committed close tree against the judged tree
// (lib/close-tree-drift.js). Review refs refs/spec-review/<runId>/judged and .../close are written
// best-effort (a failed update-ref warns, never blocks).
//
// Survivors split into HARD (dispositioned, `s<i>`) and advisory softs (recorded, never
// dispositioned); an empty hard pool is auto-dispositioned by the driver. Softs land at CLOSE as
// `- a<i> file:line — claim` lines under `## Rationale` (`### Advisory debt (review <runId>)`).
//
// CONTRACT:
//   spec-review-driver <spec.md>                  -> print current state + ONLY that step
//   spec-review-driver <spec.md> --mark <mark>    -> verify artifacts, record, print next step
//     marks: skips-extracted --file <f> | reviewer-returned --file <json> |
//            dispositions [--file <disposer return.json>] --waived N --rejected N
//              --fix-dispatched N | fix-applied | closed |
//            merge-strategy <merge-commit|ff-only|squash|rebase-ff> (bare token)
//              [--prototype delete|keep — required when the closing spec's prototype carries
//              unmerged commits] |
//            conflicts-resolved
//   spec-review-driver <spec.md> --state          -> print the state name only (scripting)
//
// States: LEGS (driver-only) -> STOPPED (terminal on RED_BLOCKING) | SKIPS? -> REVIEWER ->
//   DISPOSITIONS -> FIX/ESCALATE(cap 2, terminal)? -> CLOSE -> MERGE/CONFLICTS -> DONE (terminal)
//
// Exit codes: 0 = step printed · 2 = precondition failure or refused mark (message names the
// repair) — among them: a missing/malformed artifact, a REVIEWER_FAILED return, dispositions
// exceeding the survivor+leg-finding pools, a dirty tree at `closed`, a third `fix-applied` past
// the iteration cap, `merge-strategy` marked while the driver's CWD sits inside the build
// worktree, any wrapped child dying with no exit code, a legs iteration with a missing/empty
// manifest, a cold invocation on a done spec whose sidecar carries no closeRunId (use /spec:fix),
// `--mark closed` while the deviations sidecar exists or recorded a malformed line, an unresolvable
// base ref (names `diff_base` and `git rev-parse HEAD`), a verdict pass with no parseable HEAD sha,
// "gate red at close" / an unresolvable gate, "suite red at close" / no testCommand, `closed` over
// any close-tree drift, `--skip-independence-check-because` passed at all (ADR-0005), and
// `--mark dispositions` with: a non-empty pool and no `--file` (names `spec:disposer`), an
// unreadable or non-JSON file, DISPOSER_FAILED, a non-array `dispositions`, a ref covered zero or
// several times or matching neither pool, a `recommended`/`final` outside `fix|waive|reject`, a
// blank `reason`, a `final` differing from `recommended` without `overriddenBy:"user"` +
// `overrideReason`, a passed count flag that disagrees with the derived tally (omitted flags are
// filled in; a `leg:<name>` ref weighs that leg's whole finding count via lib/leg-findings.js), an
// effective `fix` once marks.escalated is set ("iteration cap 2"), a malformed `repro` (needs
// `{ command, observed }`), an `acceptedBy` outside a recommended+final `reject` with a `repro`,
// or a pass deriving `UNVERIFIED` (quotes verdict.js's line; remedy: delete the sidecar
// directory and re-run the bare driver command).

'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
// Shared spawn wrapper, sync stdout writer, ledger append and sidecar load/save (lib/driver-io.js).
const { runChild, runHost, writeOut, appendLedger: appendLedgerLib, loadSidecar, saveSidecar: saveSidecarLib } = require('./lib/driver-io')
const { fmBlock, fmValue, fmMap } = require('./lib/frontmatter')
const { readConfig, readPipelineRules, policy, agentCall, CONFIG_RELPATH } = require('./lib/host-config')
// The close-time gate re-run shares review-legs.js's own {testDirs}/{scopeDirs} resolution.
const { resolveGate, gateRunsSuite } = require('./lib/gate-resolve')
// Model is derived at row-write time, never once at startup (a fresh /clear transcript has none).
const { sessionModel, sessionUsage, usageDelta } = require('./lib/session-stamp.js')
// A `leg:<name>` disposition covers that leg's WHOLE finding count — the unit verdict.js sums.
const { countLegFinding } = require('./lib/leg-findings')
const { measureDrift } = require('./lib/close-tree-drift')
// Base-candidate ORDER only (pin before ref); this driver keeps its own validity predicate.
const { BASE_KEYS, pinnedBaseCandidates } = require('./lib/base-derivation')
// Delegated stops: in a child session every ask is written to .claude/pending-question.json.
const pq = require('./pending-question.js')

// A worktree review's RED_BLOCKING hard-stop appends here, at the MAIN root, so the row survives
// the worktree; readLedgerRows() already reads every /^spec-runs.*\.jsonl$/ file.
const STOPPED_LEDGER = '.claude/spec-runs.stopped.jsonl'

function die(msg) { process.stderr.write('spec-review-driver: ' + msg + '\n'); process.exit(2) }


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
const testExpiryBin = path.join(PLUGIN, 'scripts/expire-tests.js')

// repoRoot comes from the driver's INHERITED CWD, never the spec's path — the MERGE relocation
// guard depends on where the session's shell is, not where the spec file lives.
const repoRootResult = runChild('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' },
  'git rev-parse --show-toplevel')
if (repoRootResult.status !== 0) {
  die('not inside a git repo (git rev-parse --show-toplevel failed against ' + process.cwd() +
    ') — run this from inside the review root/worktree')
}
const repoRoot = repoRootResult.stdout.trim()
// The main root (first `git worktree list` entry). Ledger + retained evidence are written under
// repoRoot (the worktree, when the review runs in one) and promoted into mainRoot only once a merge
// has landed — finishMerge() then clears repoRoot's copies so `git worktree remove` sees a clean tree.
const mainRoot = mainRootPath()

const resolvedSpecPath = path.resolve(specPath)
const specText = fs.readFileSync(resolvedSpecPath, 'utf8')
const fmRaw = fmBlock(specText)
const fmVal = (k) => fmValue(fmRaw, k)

let status = fmVal('status')
const tier = fmVal('tier') || 'standard'
const area = fmVal('area') || '{area}'
// The CLOSE step's canonical target: the first `docs/canonical/<name>.md` the spec's Canonical
// Delta section mentions wins; a section naming none falls back to the area-derived name.
const canonicalTarget = (() => {
  const after = specText.split(/^##\s+Canonical Delta\s*$/m)[1]
  if (after === undefined) return `docs/canonical/${area}.md`
  const hit = after.split(/^##\s/m)[0].match(/docs\/canonical\/[A-Za-z0-9._-]+\.md/)
  return hit ? hit[0] : `docs/canonical/${area}.md`
})()
const buildBase = fmVal(BASE_KEYS[1])
const diffBaseFm = fmVal('diff_base')

if (!['implementing', 'done'].includes(status)) {
  die('spec status is "' + (status || '<missing>') + '" — spec-review-driver requires ' +
    'status: implementing (or done for a re-run); run /spec:run ' + specPath + ' first')
}

// `let`: a worktree merge relocates the sidecar into the main root mid-invocation, and DONE
// prints the main root's copy of the spec (replaySpecPath).
let sidecarDir = resolvedSpecPath.replace(/\.md$/, '.review')
let sidecarRel = path.relative(repoRoot, sidecarDir)
let stateFile = path.join(sidecarDir, 'review-state.json')
let replaySpecPath = specPath
const specRel = path.relative(repoRoot, resolvedSpecPath) || resolvedSpecPath
// Derived from resolvedSpecPath, never relocated: the file is folded long before any merge.
const deviationsPath = resolvedSpecPath.replace(/\.md$/, '.deviations.md')

let marks = loadSidecar(sidecarDir, 'review-state.json')
// Set only when the ESCALATE self-heal hits a verdict.js drift refusal; never persisted, so a fresh
// invocation retries the write.
let escalateDriftError = null
function saveSidecar() { saveSidecarLib(sidecarDir, path.basename(stateFile), marks) }

// The one shared arg-builder for all three verdict.js passes (hard-stop, escalate, close): model
// and --checkpoint are read fresh at each call against the pass's own iteration `n`.
function viaModelArgs(n) {
  const m = sessionModel(repoRoot)
  const args = m === null ? ['--via', marks.via] : ['--via', marks.via, '--model', m]
  // read fresh at each call (never cached), like the model
  args.push('--sessionTokens', JSON.stringify(usageDelta(sessionUsage(repoRoot), marks.tokensAtStart || null)))
  const outcome = checkpointOutcome(n)
  args.push('--checkpoint', outcome.outcome)
  if (outcome.outcome === 'disposer') args.push('--checkpoint-overrides', String(outcome.overrides))
  return args
}

// verdict.js's --checkpoint outcome, derived from marks: a disposer mark for exactly iteration `n`
// yields "disposer" (with overrides) or "empty"; anything else is "not-reached" (always so at the
// hard-stop pass, which runs before any reviewer return).
function checkpointOutcome(n) {
  const d = marks.disposer
  if (!d || d.iteration !== n) return { outcome: 'not-reached' }
  if (d.empty) return { outcome: 'empty' }
  return { outcome: 'disposer', overrides: d.overrides }
}

// The ONE derivation of the disposition pools, shared by the DISPOSITIONS step, the auto-dispose
// check and handleDispositions(). `survivors` is the HARD-only subset of the reviewer return (`s<i>`
// indexes this filtered list); `softs` is every other severity, advisory only, never covered by a
// disposition. Leg findings are the current manifest's non-blocking red rows (`leg:<name>`).
function dispositionPools(n) {
  let allSurvivors = []
  try { allSurvivors = JSON.parse(fs.readFileSync(marks.reviewerReturnFile, 'utf8')).survivors || [] } catch { /* ignore */ }
  const survivors = allSurvivors.filter((s) => s.severity === 'hard')
  const softs = allSurvivors.filter((s) => s.severity !== 'hard')
  const legs = readManifestRows(manifestPathFor(n)).filter((r) => !BLOCKING_LEGS.has(r.leg) && r.exit !== 0)
  return { survivors, softs, legs }
}

// ---- Gotchas cap (prose-cap.js ratchet) ----
// The count observed when the verdict runs rides the review row as `gotchas`; `--mark closed`
// refuses unless prose-cap passes in ratchet mode against it (at/under cap -> hard cap; over cap ->
// strictly smaller than at verdict time). No declared/readable rules file is skipped with a note;
// a rules file with no Gotchas section is a hard refusal.
const proseCapBin = path.join(__dirname, 'prose-cap.js')
const pipelineRules = readPipelineRules(repoRoot)
const pipelineRulesPath = pipelineRules.ok ? pipelineRules.abs : null

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

// ---- deviations sidecar observation --
// Classifies every line per the bullets-only entry grammar: blank/`#`-header/`- `-bullet always
// allowed; an indented continuation only while an entry is open; anything else is malformed.
// `entries` counts bullet lines (build's own `^- ` ledger count). Persists {entries, malformed} on
// every invocation; a no-op when the file is absent, so the last observation survives deletion.
function observeDeviations(persist = true) {
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
  if (persist) saveSidecar()
}
// `--mark closed` defers the persist: its unswept-soft refusal must leave the
// sidecar byte-identical, and handleClosed() saves the observation itself right after that check.
observeDeviations(MARK !== 'closed')

// Shared "<line>: <text>" renderer for both `closed` refusals (first 10, then `… and N more`); the
// grammar itself leads the evidence so the session never rediscovers the rule by trial.
function malformedLines(malformed) {
  const shown = ['a line is well-formed only if it is blank, a `#` heading, a `- ` bullet, or an ' +
    'INDENTED continuation of a bullet that is still open — a blank line and a heading each close ' +
    'the bullet above them, so an indented line that does not sit directly under its bullet is ' +
    'malformed, as is any flush-left prose:']
  for (const m of malformed.slice(0, 10)) shown.push(m.line + ': ' + m.text)
  if (malformed.length > 10) shown.push('… and ' + (malformed.length - 10) + ' more')
  return shown
}

// Silent-loss detector: once per invocation, stderr-only, never blocks. Checked only against a
// DURABLE ledger path (not the plain tracked ledger); the row is matched by runId alone (the
// main-root invocation's specRel carries the worktree prefix). A drained row was retargeted at the
// tracked ledger (retargetDrainedMarks), which the basename guard skips.
function checkDurableRowPresent(ledgerPathKey, runIdKey) {
  const ledgerPath = marks[ledgerPathKey]
  const rid = marks[runIdKey]
  if (!ledgerPath || !rid || path.basename(ledgerPath) === 'spec-runs.jsonl') return
  let rows = []
  try {
    rows = fs.readFileSync(ledgerPath, 'utf8').split('\n').filter((l) => l.trim())
      .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch { rows = [] }
  const present = rows.some((r) => r.runId === rid)
  if (!present) {
    process.stderr.write('spec-review-driver: durable ledger row for ' + specRel + ' (runId ' + rid +
      ') is no longer readable at ' + ledgerPath + ' — the row may have been lost (a dead worktree, ' +
      'a manual edit, or file truncation); this is an observation only and does not block or change ' +
      'this invocation\'s result\n')
  }
}
checkDurableRowPresent('stoppedLedgerPath', 'runId')
checkDurableRowPresent('escalateLedgerPath', 'escalateRunId')

// A mark is an imperative, never a query: a mark aimed at a spec copy with no sidecar beside it
// while the review's sidecar lives in a linked worktree refuses and names the right copy, rather
// than the cold no-op printing DONE and skipping finishMerge().
function sidecarInLinkedWorktree() {
  const r = runChild('git', ['-C', mainRoot, 'worktree', 'list', '--porcelain'],
    { encoding: 'utf8' }, 'git worktree list')
  if (r.status !== 0) return null
  for (const block of r.stdout.split('\n\n')) {
    const line = block.split('\n').find((l) => l.startsWith('worktree '))
    if (!line) continue
    const wtPath = line.slice('worktree '.length)
    if (path.resolve(wtPath) === path.resolve(repoRoot)) continue
    const candidate = path.join(wtPath, specRel)
    if (fs.existsSync(candidate.replace(/\.md$/, '.review'))) return { worktree: wtPath, specPath: candidate }
  }
  return null
}
// The mark's own trailing operands (a strategy token, a --file path), stopping at the next flag —
// so the re-run line the refusal prints is the caller's command with only the spec path corrected.
function markOperands() {
  const out = []
  for (const a of argv.slice(markIdx + 2)) {
    if (a.startsWith('--')) break
    out.push(a)
  }
  return out
}

// ---- terminal cold path: no sidecar, status already done -> DONE, no auto-restart -------------
const sidecarExistsAtStart = fs.existsSync(sidecarDir)
if (!sidecarExistsAtStart && status === 'done') {
  if (MARK && !STATE_ONLY) {
    const elsewhere = sidecarInLinkedWorktree()
    const fileFlag = flag('--file')
    die('--mark ' + MARK + ' has no review state to apply: there is no sidecar at ' + sidecarDir +
      (elsewhere
        ? ', because this review ran in a linked worktree. Re-run the mark against that ' +
          'worktree\'s copy of the spec:\n  node ' + __filename + ' ' + elsewhere.specPath +
          ' --mark ' + MARK + markOperands().map((a) => ' ' + a).join('') +
          (typeof fileFlag === 'string' ? ' --file ' + fileFlag : '')
        : ', and no linked worktree holds one either — the review is already concluded ' +
          '(status: done), so there is nothing left for this mark to apply'))
  }
  printDoneNow('')
}
// A done spec whose sidecar lacks this run's closeRunId is not mid-review (re-walking could never
// reach doCloseWork() and would append zero rows) — refuse. A sidecar carrying closeRunId is the
// normal tail of a successful run and flows on to MERGE/DONE.
if (status === 'done' && !marks.closeRunId) {
  die('spec status is already "done" and ' + sidecarRel + ' does not record this run\'s own ' +
    'close — the authoritative verdict for this spec already ran; use /spec:fix to repair a ' +
    'defect that escaped a review that already passed — its commit records the escape row — not another review run')
}

// `via` is recorded once, at sidecar creation, as "loop". Placed AFTER the terminal cold-path
// short-circuits: saving on a done spec with no sidecar would resurrect the directory DONE deleted.
if (marks.via === undefined) {
  marks.via = 'loop'
  marks.tokensAtStart = sessionUsage(repoRoot)
  saveSidecar()
}

// ---- base derivation (diff_base -> build_base -> branch) ----
// The ORDER lives in lib/base-derivation.js; this driver keeps only its validity predicate
// (resolveBaseSha's non-degenerate-range invariant). A PIN ALWAYS BEATS A REF: `build_base` is
// conventionally the moving ref `main`, which can already carry the build's own commits, making
// `main...HEAD` empty.
let autoPickedAnnounced = false
function resolveBase() {
  const pinned = pinnedBaseCandidates({ diff_base: diffBaseFm, build_base: buildBase })
  if (pinned.length) return pinned[0].value
  const cfgTrunk = readConfig(repoRoot).trunk
  if (typeof cfgTrunk === 'string' && cfgTrunk.trim()) {
    const t = runChild('git', ['-C', repoRoot, 'merge-base', 'HEAD', cfgTrunk], { encoding: 'utf8' },
      'git merge-base HEAD ' + cfgTrunk)
    if (t.status === 0 && t.stdout.trim()) return t.stdout.trim()
    die('config.trunk "' + cfgTrunk + '" does not resolve to a branch \u2014 fix trunk in ' + CONFIG_RELPATH + ' ' +
      'or add build_base (or diff_base) to the spec frontmatter')
  }
  for (const cand of ['main', 'master']) {
    const r = runChild('git', ['-C', repoRoot, 'merge-base', 'HEAD', cand], { encoding: 'utf8' },
      'git merge-base HEAD ' + cand)
    if (r.status === 0 && r.stdout.trim()) {
      if (!autoPickedAnnounced) {
        autoPickedAnnounced = true
        console.error('\u{1F4CC} Auto-picked trunk ' + cand + ' \u2014 no config.trunk declared; /spec:init writes it (veto anytime)')
      }
      return r.stdout.trim()
    }
  }
  die('spec frontmatter carries neither build_base nor diff_base, and no main/master branch ' +
    'exists to derive one from — add build_base (or diff_base) to the spec frontmatter')
}
const base = resolveBase()

// Resolve base to a full sha ONCE, at startup — an unresolvable base dies before the first
// manifest or leg. stampDiffBaseIfAbsent() reuses this sha.
const SHA40_RE = /^[0-9a-f]{40}$/
const RIDE_ALONG = 'softs may ride this fix round (same workers, same files); the fix-delta pass re-reviews whatever changed — never dispositioned here.'
// the FIX step's soft list: the current return's softs under the ride-along sentence, or nothing.
function fixSoftBlock() {
  const softs = currentSofts()
  if (softs.length === 0) return ''
  return `advisory (${softs.length}, recorded, not dispositioned):\n` +
    softs.map((s) => `  [${s.severity}] ${s.file}:${s.line} — ${s.claim}`).join('\n') + '\n' + RIDE_ALONG
}
function resolveBaseSha() {
  const r = runChild('git', ['-C', repoRoot, 'rev-parse', '--verify', base + '^{commit}'],
    { encoding: 'utf8' }, 'git rev-parse --verify (base resolution)')
  const sha = (r.stdout || '').trim()
  if (r.status !== 0 || !SHA40_RE.test(sha)) {
    die('base "' + base + '" does not resolve to a commit — add diff_base: <sha> to the spec ' +
      'frontmatter (git rev-parse --verify <ref>^{commit})')
  }
  // ---- non-degenerate-range invariant ----
  // An empty range fails GREEN (every diff-scoped leg reports zero). The base sha must differ from
  // HEAD and be an ancestor of HEAD (`merge-base --is-ancestor`), else the diff carries foreign
  // hunks. Scoped to the judging phases: after `closed`, merge mechanics run from the main root,
  // where HEAD legitimately still sits at the base.
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

// HEAD is re-read fresh at each verdict pass (fix iterations can add commits between -----
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

// Snapshots the working tree (tracked edits AND untracked files) as a git tree object via a scratch
// index inside the sidecar, always removed afterward, so the real index is never touched. The
// sidecar itself is excluded via a negative pathspec, or every driver write would appear in a fix's
// delta and the scratch index would try to add its own lock file.
function snapshotTree() {
  fs.mkdirSync(sidecarDir, { recursive: true })
  const indexFile = path.join(sidecarDir, 'snap-index')
  const env = Object.assign({}, process.env, { GIT_INDEX_FILE: indexFile })
  try {
    // A sidecar already gitignored makes the negative pathspec an ignored path, which `git add`
    // refuses — the exclusion is carried only when the sidecar is NOT already ignored.
    const ignoredR = runChild('git', ['-C', repoRoot, 'check-ignore', '-q', sidecarRel],
      { encoding: 'utf8' }, 'git check-ignore (sidecar already ignored?)')
    // Seeded from HEAD: against an empty index a tracked-but-gitignored file (a committed
    // .claude/settings.local.json, an older committed *.review/ folder) reads as untracked and
    // ignored, so `add -A` drops it and every diff against the snapshot counts it as deleted.
    const seedR = runChild('git', ['-C', repoRoot, 'read-tree', 'HEAD'], { encoding: 'utf8', env },
      'git read-tree HEAD (seed the scratch index)')
    if (seedR.status !== 0) {
      die('git read-tree HEAD into a scratch index failed (exit ' + seedR.status + '): ' +
        (seedR.stderr || seedR.stdout).trim())
    }
    // A sidecar committed in HEAD would ride in on the seed, and an ignored sidecar carries no
    // exclude pathspec — drop it so the driver's own writes never appear in a delta.
    runChild('git', ['-C', repoRoot, 'rm', '--cached', '-r', '-q', '--ignore-unmatch', '--', sidecarRel],
      { encoding: 'utf8', env }, 'git rm --cached (sidecar out of the scratch index)')
    const addArgs = ['-C', repoRoot, 'add', '-A', '--', '.']
    if (ignoredR.status !== 0) addArgs.push(':(exclude)' + sidecarRel)
    const addR = runChild('git', addArgs,
      { encoding: 'utf8', env }, 'git add -A (scratch-index tree snapshot)')
    if (addR.status !== 0) {
      die('git add -A into a scratch index failed (exit ' + addR.status + '): ' +
        (addR.stderr || addR.stdout).trim())
    }
    const wtR = runChild('git', ['-C', repoRoot, 'write-tree'], { encoding: 'utf8', env },
      'git write-tree (scratch-index tree snapshot)')
    const sha = (wtR.stdout || '').trim()
    if (wtR.status !== 0 || !SHA40_RE.test(sha)) {
      die('git write-tree against the scratch index did not print a 40-hex tree sha (exit ' +
        wtR.status + '): ' + (wtR.stderr || wtR.stdout).trim())
    }
    return sha
  } finally {
    fs.rmSync(indexFile, { force: true })
  }
}

// Fallback snapshot for a sidecar with no marks.treeSnapshot[n]: HEAD's own tree, so the delta
// lists every file dirty against HEAD rather than refusing the pass.
function headTree() {
  const r = runChild('git', ['-C', repoRoot, 'rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' },
    'git rev-parse HEAD^{tree}')
  const sha = (r.stdout || '').trim()
  if (r.status !== 0 || !SHA40_RE.test(sha)) {
    die('git rev-parse HEAD^{tree} in ' + repoRoot + ' did not print a 40-hex tree sha (got ' +
      JSON.stringify(sha) + ')')
  }
  return sha
}

// Contracts: `git diff --name-only <a> <b>` between two tree shas, sorted, LF-joined, no blank
// lines — the exact shape fix-delta-<n>.txt is written in.
function treeDiffNames(a, b) {
  const r = runChild('git', ['-C', repoRoot, 'diff', '--name-only', a, b], { encoding: 'utf8' },
    'git diff --name-only (fix-delta)')
  if (r.status !== 0) die('git diff --name-only ' + a + ' ' + b + ' failed: ' + (r.stderr || r.stdout).trim())
  return r.stdout.split('\n').map((l) => l.trim()).filter(Boolean).sort()
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
// A manifest's number is a storage key only; its kind is the `scope` review-legs.js stamps, and the
// live iteration is the sidecar's recorded `iteration`.
function isFixDeltaManifest(n) {
  return readManifestRows(manifestPathFor(n)).some((r) => r.scope === 'fix-delta')
}
// A fix round is one fix-applied: rounds are the distinct fixDeltaFrom sources (a skips re-run
// inherits its round's source). A manifest with no recorded source counts as its own round.
function fixRoundsDone() {
  const from = marks.fixDeltaFrom || {}
  const sources = new Set()
  let rounds = 0
  for (const n of listManifestNumbers().filter(isFixDeltaManifest)) {
    const src = from[String(n)]
    if (src === undefined) { rounds++; continue }
    if (!sources.has(src)) { sources.add(src); rounds++ }
  }
  return rounds
}
// A recorded iteration is trusted only when a legs run actually recorded it (legsMode[n] exists):
// a hand-edited counter names no legs run and must not move the live iteration.
function legsModeFor(n) { return marks.legsMode && marks.legsMode[String(n)] }
function liveIteration() {
  const it = Number(marks.iteration) || 0
  if (it > 0 && legsModeFor(it)) return it
  const nums = listManifestNumbers()
  return nums.length ? nums[nums.length - 1] : 0
}
// Mirrors review-legs.js's own blocking-leg/exit rule (smoke exit 4 = sanctioned inert-green) —
// plumbing over typed exit codes, never a verdict derivation.
const BLOCKING_LEGS = new Set(['gate', 'suite', 'smoke', 'ci', 'slow'])
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
  if (opts.reuseFrom) args.push('--reuse-from', opts.reuseFrom)
  marks.legsTree = marks.legsTree || {}
  marks.legsTree[String(n)] = opts.tree || snapshotTree()
  saveSidecar()
  const r = runChild(process.execPath, [legsBin, ...args], { encoding: 'utf8' }, 'review-legs.js')
  if (r.status === 2) {
    die(`review-legs.js precondition failed (iteration ${n}):\n` + (r.stdout + r.stderr).trim())
  }
  marks.legsMode = marks.legsMode || {}
  marks.legsMode[String(n)] = { skipsFile: opts.skipsFile || null, fixDelta: !!opts.fixDelta }
  // the gate's skip count AT EXTRACTION rides beside the file; a carried file keeps its
  // original count so a later, larger gate count re-enters SKIPS.
  if (opts.skipsFile) marks.legsMode[String(n)].skipsGateCount = opts.skipsGateCount
  marks.iteration = n
  saveSidecar()
  return { code: r.status, out: r.stdout, err: r.stderr }
}

// A legs run that did NOT hard-stop must have actually written a manifest — a killed leg can leave
// review-legs.js exiting 0 over a manifest nobody wrote.
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

// Is STOPPED_LEDGER ignored at mainRootDir? `check-ignore -q` answers for a not-yet-existing path;
// exit 1 (not ignored) is a result, not a death.
function checkStoppedLedgerIgnored(mainRootDir) {
  const r = runChild('git', ['-C', mainRootDir, 'check-ignore', '-q', STOPPED_LEDGER],
    { encoding: 'utf8' }, 'git check-ignore -q ' + STOPPED_LEDGER)
  return r.status === 0
}

// Ensure-ignored guard: not ignored -> append to <git-common-dir>/info/exclude and re-check once.
// False when it cannot be made ignored (a .gitignore negation outranks info/exclude); the caller
// then falls back to the worktree ledger.
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

// The one spec-scoped drain (promoteEvidenceAndClean(), and doCloseWork() in-place): removes this
// spec's rows from STOPPED_LEDGER (unparseable lines are kept; the file is deleted when empty) and
// returns them verbatim for the caller to append ahead of its own lines — a MOVE, never a copy.
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

// Point each mark whose runId was drained at the tracked ledger the row moved into, so
// checkDurableRowPresent() never reports a deliberate move as a loss. Matched by runId only.
function retargetDrainedMarks(drained, trackedLedger) {
  const ids = new Set()
  for (const line of drained) { try { ids.add(JSON.parse(line).runId) } catch {} }
  if (marks.runId && ids.has(marks.runId) && marks.stoppedLedgerPath) marks.stoppedLedgerPath = trackedLedger
  if (marks.escalateRunId && ids.has(marks.escalateRunId) && marks.escalateLedgerPath) marks.escalateLedgerPath = trackedLedger
}

// ---- RED_BLOCKING hard-stop — no-workflow verdict pass, GATE_RED ledger line appended ---
// In-place appends to the repo ledger. A worktree review appends to <mainRoot>/STOPPED_LEDGER once
// the ensure-ignored guard confirms it cannot dirty mainRoot, else falls back to the worktree
// ledger. marks.stoppedLedgerPath records where the row landed.
function runHardStopVerdict(n) {
  const runId = ensureRunId()
  const diffLoc = computeDiffLoc()
  const args = ['--manifest', manifestPathFor(n), '--ledger', '--spec', specRel, '--tier', tier,
    '--diff-loc', String(diffLoc), '--iteration', String(fixRoundsDone()), '--run-id', runId,
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
  // The STOPPED row just appended is the driver's own write — re-snapshot so it never reads as a tree change at repair-round.
  marks.legsTree = marks.legsTree || {}
  marks.legsTree[String(n)] = snapshotTree()
  saveSidecar()
}

// REUSABLE mirrors review-legs.js's set: the legs a green prior row may stand in for.
const REUSABLE_LEGS = ['gate', 'suite', 'at-risk', 'patterns', 'smoke']
function legGreen(r) { return r.leg === 'smoke' ? (r.exit === 0 || r.exit === 4) : r.exit === 0 }
// Decides reuse for a legs re-run at iteration n from the run curN: returns the opts to merge into
// runLegsIteration's and prints the owner's veto line. priorManifest is the file --reuse-from names.
function decideReuse(curN, priorManifest, fixDelta) {
  const tree = snapshotTree()
  const recorded = marks.legsTree && marks.legsTree[String(curN)]
  if (!recorded || recorded !== tree) {
    console.log('tree changed since legs ' + curN + ' — every leg re-runs')
    return { tree }
  }
  const scope = fixDelta ? 'fix-delta' : 'full'
  const greens = readManifestRows(priorManifest)
    .filter((r) => REUSABLE_LEGS.includes(r.leg) && legGreen(r) && r.scope === scope).map((r) => r.leg)
  console.log('♻️ tree unchanged since legs ' + curN + ' — reusing green rows: ' + greens.join(', '))
  return { tree, reuseFrom: priorManifest }
}
// REUSABLE legs red in the prior rows and green in the new manifest, over the same tree.
function recordFlaky(n, curN, priorRows) {
  const now = readManifestRows(manifestPathFor(n))
  const flaky = priorRows.filter((p) => REUSABLE_LEGS.includes(p.leg) && !legGreen(p) &&
    now.some((r) => r.leg === p.leg && legGreen(r))).map((p) => p.leg)
  if (!flaky.length) return
  marks.flaky = marks.flaky || {}
  marks.flaky[String(n)] = flaky
  saveSidecar()
  for (const leg of flaky) console.log('⚠ flaky: ' + leg + ' was red at legs ' + curN + ' and green over the same tree')
}

function runLegsIteration(n, opts) {
  const res = runLegs(n, opts)
  if (res.code === 1) { runHardStopVerdict(n); return { stopped: true, n } }
  verifyManifestWritten(n)
  return { stopped: false, n }
}

// ---- writeEscalateRow() — the ledger row for the fix-cap ESCALATE refusal ----
// Called from handleFixApplied()'s cap branch (before die()) and self-healed from the ESCALATE arm
// on a bare re-invocation; idempotent via marks.escalateRunId, set only after a successful append.
// Passes the FINAL manifest/reviewer-return, the recorded waived/rejected, --fixDispatched 0
// FORCED (the fix never landed), --escalated and --retain; durability reuses the stopped-ledger
// path. A verdict.js exit 2 returns { ok: false, error }: no row, escalateRunId unset (retried
// later), and the caller embeds `error` verbatim.
function writeEscalateRow(n) {
  if (marks.escalateRunId) return { ok: true } // already written — never re-append
  const runId = ensureRunId()
  const diffLoc = computeDiffLoc()
  const d = marks.dispositions
  const args = ['--manifest', manifestPathFor(n), '--workflow', marks.reviewerReturnFile,
    '--waived', String(d.waived), '--rejected', String(d.rejected), '--fixDispatched', '0',
    '--escalated', '--ledger', '--spec', specRel, '--tier', tier, '--diff-loc', String(diffLoc),
    '--iteration', String(fixRoundsDone()), '--run-id', runId, '--retain', path.join(repoRoot, '.claude/spec-runs'),
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

// ---- stamp diff_base at the close flip ----
// The close commit is the last moment the moving ref and the true pre-image coincide, so the base
// sha is pinned here, after the `build_base:` line (or before the closing fence) — absent-only: a
// diff_base already present stays byte-identical.
function stampDiffBaseIfAbsent(text) {
  if (diffBaseFm) return text // already stamped (or hand-authored) — never overwritten
  // Reuses baseSha, resolved once at startup — never a second rev-parse.
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

// ---- best-effort write of refs/spec-review/<runId>/{judged,close} ----
// A non-zero `git update-ref` prints ONE warning and the driver continues; runChild still dies on a
// genuinely dead child.
function writeReviewRef(runId, leaf, sha) {
  const ref = 'refs/spec-review/' + runId + '/' + leaf
  const r = runChild('git', ['-C', repoRoot, 'update-ref', ref, sha], { encoding: 'utf8' },
    'git update-ref ' + ref)
  if (r.status !== 0) {
    process.stderr.write('spec-review-driver: failed to write ' + ref + ' (best-effort replay-measurement ' +
      'ref) — ' + (r.stderr || '').trim() + ' — continuing without it\n')
  }
}

// ---- CLOSE driver work: authoritative verdict + ledger append + status flip --------------------
function doCloseWork(n) {
  const runId = ensureRunId()
  const diffLoc = computeDiffLoc()
  const retainDir = path.join(repoRoot, '.claude/spec-runs')
  const d = marks.dispositions
  // In-place close drain: a spec that stopped in an abandoned worktree and later closed in-place
  // has its stopped rows moved ahead of the close row.
  if (repoRoot === mainRoot) {
    const { drained } = drainStoppedRows(mainRoot, specRel)
    if (drained.length) {
      appendLedger(drained.join('\n'))
      retargetDrainedMarks(drained, path.join(repoRoot, '.claude/spec-runs.jsonl'))
    }
  }
  const args = ['--manifest', manifestPathFor(n), '--workflow', marks.reviewerReturnFile,
    '--waived', String(d.waived), '--rejected', String(d.rejected), '--fixDispatched', String(d.fixDispatched),
    '--ledger', '--spec', specRel, '--tier', tier, '--diff-loc', String(diffLoc),
    '--iteration', String(fixRoundsDone()), '--run-id', runId, '--retain', retainDir,
    '--base-sha', baseSha, '--head-sha', headSha(), ...viaModelArgs(n)]
  if (treeDirty()) args.push('--dirty')
  const r = runChild(process.execPath, [verdictBin, ...args], { encoding: 'utf8' },
    'verdict.js (authoritative pass)')
  if (r.status === 2) die('verdict.js (authoritative pass) failed: ' + (r.stdout + r.stderr).trim())
  const lines = r.stdout.split('\n')

  // expire-tests.js classifies (never applies) every test tagged with this spec's AC-IDs, after the
  // authoritative verdict and before the ledger append. A non-zero exit or unparseable output
  // refuses the close (status unchanged, no ledger append).
  const expiryOff = policy(repoRoot).testExpiry === 'off'
  const er = expiryOff ? null : runChild(process.execPath, [testExpiryBin, '--root', repoRoot, '--spec', specRel,
    '--json'], { encoding: 'utf8' }, 'expire-tests.js (close-time expiry classification)')
  if (expiryOff) marks.testsExpiry = { off: 'policy' }
  const expiryRemedy = 'node "$(spec-paths test-expiry)" --root . --spec ' + specRel
  if (!expiryOff && er.status !== 0) {
    die('expire-tests.js failed at close — status unchanged. Remedy: ' + expiryRemedy + '\n' +
      (er.stdout + er.stderr).trim())
  }
  let expiry = null
  try {
    expiry = expiryOff ? null : JSON.parse(er.stdout)
  } catch {
    expiry = null
  }
  if (!expiryOff && (!expiry || !Array.isArray(expiry.retired) || typeof expiry.tagged !== 'number')) {
    die('expire-tests.js printed unparseable output at close — status unchanged. Remedy: ' + expiryRemedy)
  }
  const testsRow = expiryOff ? null : { born: expiry.tagged, kept: expiry.tagged - expiry.retired.length, retired: expiry.retired.length }
  if (!expiryOff) marks.testsExpiry = { ...testsRow, filesRemoved: expiry.emptied.length }

  // `gotchas` rides the row only when a rules file was observed; `tests` rides every close row,
  // after gotchas when present.
  const gotchas = observeGotchas()
  const row = JSON.parse(lines[1])
  if (gotchas !== null) row.gotchas = gotchas
  if (testsRow) row.tests = testsRow
  // sessionTokens (when verdict.js carried it) stays the LAST key, after the keys added here.
  if (Object.prototype.hasOwnProperty.call(row, 'sessionTokens')) { const st = row.sessionTokens; delete row.sessionTokens; row.sessionTokens = st }
  lines[1] = JSON.stringify(row)
  appendLedger(lines[1])
  // best-effort — never blocks the close.
  writeReviewRef(runId, 'judged', row.diff.head)
  // The legs judge the WORKING tree (fix-delta passes run over uncommitted fixes), so the judged
  // tree is pinned here as a tree sha for the close-tree drift check; diff.head and the judged ref
  // keep their commit meaning.
  marks.judgedTree = snapshotTree()

  const newSpecText = specText.replace(/^status:\s*.*$/m, 'status: done')
  const stampedText = stampDiffBaseIfAbsent(newSpecText)
  // The advisory debt rides this same write so the close commit carries it; the spec file is an
  // overlay exclude, so it is never read as drift.
  const debtLines = currentSofts().map((s, i) => '- a' + i + ' ' + s.file + ':' + s.line + ' — ' + s.claim)
  fs.writeFileSync(resolvedSpecPath, debtLines.length ? withAdvisoryDebt(stampedText, runId, debtLines) : stampedText)

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
// Every non-superseded spec under <root>/specs whose `prototype` frontmatter equals the stem.
function citersOfPrototype(root, stem) {
  const out = []
  const walk = (dir) => {
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.name.endsWith('.md')) {
        let text = ''
        try { text = fs.readFileSync(full, 'utf8') } catch { continue }
        const m = fmMap(text)
        if (m.prototype === stem && m.status !== 'superseded') out.push(m.status || '')
      }
    }
  }
  walk(path.join(root, 'specs'))
  return out
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

// The sidecar dies HERE, at DONE. `--state` is answered before the delete: a state query must
// never tear down the run it is querying.
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

// ---- mark handlers --------------------------------------------------------------------------
// Each handler validates BEFORE mutating anything and returns null to let deriveState() continue,
// or 'STOPPED' when the mark's own fresh legs run hard-stopped (bypassing deriveState()'s retry).

function handleSkipsExtracted() {
  const file = flag('--file')
  if (!file || typeof file !== 'string') die('--mark skips-extracted needs --file <extracted skip names>')
  if (!fs.existsSync(file)) die('--file ' + file + ' does not exist — extract the skipped-test names and pass a real path')
  const resolved = path.resolve(file)
  // validate before any write. An empty file against a gate reporting skips is refused (exit 2,
  // nothing written); a count mismatch is a warning, not a refusal — runners group identical skips.
  const curN = liveIteration()
  const gateCount = gateSkipsCount(readManifestRows(manifestPathFor(curN)))
  const listed = fs.readFileSync(resolved, 'utf8').split('\n').filter((l) => l.trim()).length
  if (listed === 0 && gateCount > 0) {
    die('--file ' + file + ' lists no skipped-test names but the gate reported ' + gateCount +
      ' skips — extract the real names and re-run `node ' + __filename + ' ' + specPath +
      ' --mark skips-extracted --file <path>`')
  }
  if (listed !== gateCount) {
    process.stderr.write('⚠ skip file lists ' + listed + ' names, gate reported ' + gateCount + ' skips\n')
  }
  // a skips re-run inside a fix round stays a fix-delta pass — same delta file, same prior return.
  const n = curN + 1
  const inheritFix = curN > 0 && isFixDeltaManifest(curN)
  if (inheritFix) {
    fs.copyFileSync(path.join(sidecarDir, `fix-delta-${curN}.txt`), path.join(sidecarDir, `fix-delta-${n}.txt`))
    marks.fixDeltaFrom = marks.fixDeltaFrom || {}
    marks.fixDeltaFrom[String(n)] = marks.fixDeltaFrom[String(curN)]
  }
  const priorManifest = manifestPathFor(curN)
  const priorRows = readManifestRows(priorManifest)
  const reuse = decideReuse(curN, priorManifest, inheritFix)
  const r = runLegsIteration(n, { skipsFile: resolved, skipsGateCount: gateCount, fixDelta: inheritFix, ...reuse })
  if (reuse.reuseFrom) recordFlaky(n, curN, priorRows)
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
      'and write a clean {verdict, survivors, killed, reviewerCount, tokens} return')
  }
  if (json.verdict === 'REVIEWER_FAILED') {
    die('the reviewer returned REVIEWER_FAILED (the run died mid-review, never CLEAN) — ' +
      're-dispatch ' + agentCall(repoRoot, 'reviewer', 'spec:reviewer') + ' and mark reviewer-returned again once it completes')
  }
  if (!Array.isArray(json.survivors)) {
    die('--file ' + file + ' is missing a survivors array — the reviewer return shape must be ' +
      '{verdict, survivors, killed, reviewerCount, tokens}; re-dispatch and write a valid return')
  }
  // `killed` must be an array of objects with a string claim plus BOTH file (string|null) and line
  // (number|null) keys present; nothing is written before every entry checks out.
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
  const n = liveIteration()
  fs.mkdirSync(sidecarDir, { recursive: true })
  const dest = path.join(sidecarDir, `reviewer-return-${n}.json`)
  fs.writeFileSync(dest, raw)
  marks.reviewerReturnFile = dest
  marks.reviewerReturnIteration = n
  marks.dispositions = null
  marks.dispositionsIteration = null
  // Every iteration needs its own disposer return — a prior iteration's mark never satisfies this one.
  marks.disposer = null
  marks.pendingFix = false
  // Snapshot the tree for iteration n; fix-applied diffs against it to derive the fix's delta.
  marks.treeSnapshot = marks.treeSnapshot || {}
  marks.treeSnapshot[String(n)] = snapshotTree()
  // An empty HARD pool needs no session judgment: the driver dispositions it itself (zero counts)
  // and deriveState() proceeds straight to CLOSE. An explicit zero-count `--mark dispositions`
  // against the same empty pool is still accepted afterward.
  const pools = dispositionPools(n)
  if (pools.survivors.length === 0 && pools.legs.length === 0) {
    const args = ['--manifest', manifestPathFor(n), '--workflow', dest,
      '--waived', '0', '--rejected', '0', '--fixDispatched', '0']
    const r = runChild(process.execPath, [verdictBin, ...args], { encoding: 'utf8' },
      'verdict.js (auto-dispositions pass, empty hard pool)')
    if (r.status === 2) die((r.stderr || r.stdout).trim())
    const word = r.stdout.split('\n')[0].trim()
    // An empty hard pool is only auto-dispositioned into a CLEAN pass. Any other word (usually
    // UNVERIFIED: a required leg row is missing) cannot be cured by dispositions, so
    // marks.dispositions is never written; the reviewer-return is already on disk, hence the
    // remedy deletes the sidecar directory.
    if (word !== 'CLEAN') {
      die((r.stderr || '').trim() +
        '\n--mark reviewer-returned refused: the hard pool is empty but the verdict pass derived ' +
        word + ', not CLEAN — dispositions cannot cure missing or contradictory evidence, only a ' +
        'cold legs re-run can. Delete ' + sidecarDir + ' and re-run:\n  node ' + __filename + ' ' + specPath)
    }
    marks.dispositions = { waived: 0, rejected: 0, fixDispatched: 0, word }
    marks.dispositionsIteration = n
    marks.disposer = { file: null, iteration: n, overrides: 0, empty: true }
  }
  saveSidecar()
  return null
}

// --mark dispositions on a non-empty pool needs a disposer return covering every finding exactly
// once, each with a non-blank reason. Nothing is mutated before every check passes.
const RECOMMEND_ENUM = new Set(['fix', 'waive', 'reject'])
function handleDispositions() {
  if (!marks.reviewerReturnFile) die('no reviewer return recorded yet — mark reviewer-returned first')
  // Retired override (ADR-0005): refused whether bare or carrying a value.
  if (argv.includes('--skip-independence-check-because')) {
    die('--skip-independence-check-because is retired (ADR-0005, specs/20260901/09-disposer-gate.md) ' +
      '— independence is now the disposer agent (spec:disposer), dispatched at DISPOSITIONS on every ' +
      '/spec:run pass through the review stage; drop the flag')
  }
  const n = marks.reviewerReturnIteration

  // Refuse before any write when the pass derives UNVERIFIED — dispositions cannot cure missing
  // evidence. A zero-disposition dry pass suffices: verdict.js derives UNVERIFIED before any
  // disposition arithmetic.
  const unverifiedCheck = runChild(process.execPath,
    [verdictBin, '--manifest', manifestPathFor(n), '--workflow', marks.reviewerReturnFile],
    { encoding: 'utf8' }, 'verdict.js (dispositions UNVERIFIED pre-check)')
  if ((unverifiedCheck.stdout || '').split('\n')[0].trim() === 'UNVERIFIED') {
    die((unverifiedCheck.stderr || '').trim() +
      '\n--mark dispositions refused: dispositions cannot cure missing evidence — the legs must ' +
      'run again from cold. Delete ' + sidecarDir + ' and re-run:\n  node ' + __filename + ' ' + specPath)
  }

  const pools = dispositionPools(n)
  const poolRefs = [
    ...pools.survivors.map((_, i) => 's' + i),
    ...pools.legs.map((r) => 'leg:' + r.leg),
  ]
  // Count flags are optional: with --file the derived tally is authoritative and a passed flag must
  // equal it. "Given" tracks presence separately — an omitted flag is never an explicit 0.
  const waivedRaw = flag('--waived'), rejectedRaw = flag('--rejected'), fixRaw = flag('--fix-dispatched')
  const waivedGiven = waivedRaw !== null, rejectedGiven = rejectedRaw !== null, fixGiven = fixRaw !== null
  let waived = Number(waivedRaw), rejected = Number(rejectedRaw), fixDispatched = Number(fixRaw)
  if (![waived, rejected, fixDispatched].every(Number.isFinite)) {
    die('--mark dispositions needs numeric --waived/--rejected/--fix-dispatched when passed (got ' +
      JSON.stringify({ waivedRaw, rejectedRaw, fixRaw }) + ')')
  }

  let dest = null
  let overrides = 0
  if (poolRefs.length > 0) {
    const file = flag('--file')
    if (!file || typeof file !== 'string') {
      die('--mark dispositions needs --file <disposer return json> — the survivor/leg-finding pools ' +
        'are non-empty, so dispatch ' + agentCall(repoRoot, 'disposer', 'spec:disposer') + ' first and pass the path ' +
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
        're-dispatch ' + agentCall(repoRoot, 'disposer', 'spec:disposer') + ' and mark dispositions again once it completes')
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
    // A malformed `repro` fails closed like a blank reason; `acceptedBy` is this driver's own stamp,
    // never the disposer's. A user veto clears the stamp.
    const validRepro = (x) => x !== null && typeof x === 'object' && !Array.isArray(x) &&
      typeof x.command === 'string' && x.command.trim() !== '' &&
      typeof x.observed === 'string' && x.observed.trim() !== ''
    let rewritten = false
    for (const d of ret.dispositions) {
      if (d.repro !== undefined && !validRepro(d.repro)) {
        die('--file ' + file + ' entry ' + d.ref + ' has a malformed repro — it must be an object ' +
          '{ command, observed } of two non-blank strings (the command the disposer ran and the output ' +
          'it observed); fix the entry or drop repro, then re-run this mark')
      }
      if (d.acceptedBy !== undefined) {
        const sane = d.recommended === 'reject' && d.repro !== undefined
        if (sane && d.final !== undefined && d.final !== 'reject' && d.overriddenBy === 'user') {
          delete d.acceptedBy
          rewritten = true
        } else if (!sane || d.final !== 'reject') {
          die('--file ' + file + ' entry ' + d.ref + ' carries acceptedBy — only this driver stamps it, ' +
            'and only on a recommended reject with a repro whose final is reject; remove acceptedBy ' +
            'from the entry and re-run this mark')
        }
      }
    }
    const rejectPool = ret.dispositions.filter((d) => d.recommended === 'reject' && d.repro !== undefined && d.final === undefined)
    if (rejectPool.length) {
      const refs = poolRefs.filter((r) => rejectPool.some((d) => d.ref === r))
      const pick = pq.policyPick(repoRoot, 'rejectWithEvidence', { accept: 'accept reject on executed repro: ' + refs.join(', ') }, marks)
      if (pick) {
        for (const d of rejectPool) { d.final = 'reject'; d.acceptedBy = 'policy' }
        rewritten = true
        markPreamble = pick.line + '\n' +
          'To answer differently: set final to fix or waive on that entry in <file> with overriddenBy "user" and overrideReason, and re-run this mark before the next one.\n'
      }
    }
    if (rewritten) {
      raw = JSON.stringify(ret, null, 2) + '\n'
      fs.writeFileSync(file, raw)
    }
    if (pq.isDelegated(repoRoot)) {
      const open = ret.dispositions.filter((d) => (d.recommended === 'waive' || d.recommended === 'reject') && d.final === undefined)
      if (open.length) {
        const doc = pq.readPending(repoRoot)
        const answers = (doc && doc.kind === 'dispositions' && doc.answers) || {}
        if (!open.every((d) => answers[d.ref])) {
          const markLine = 'node ' + __filename + ' ' + specPath + ' --mark dispositions --file ' + file
          const line = doc
            ? pq.waitingLine(repoRoot)
            : pq.stopLine(repoRoot, 'review', {
              kind: 'dispositions', state: 'DISPOSITIONS', spec: specRel,
              questions: open.map((d) => {
                const other = d.recommended === 'waive' ? 'reject' : 'waive'
                return {
                  id: d.ref, header: 'Disposition',
                  question: 'The disposer recommends to ' + d.recommended + ' finding ' + d.ref + ': ' + String(d.reason).replace(/`/g, '').slice(0, 200) + ' What should the review do with it?',
                  options: [
                    { label: 'accept ' + d.recommended + ' (Recommended)', description: 'The finding is ' + d.recommended + 'd as the disposer recommended, on the evidence it quoted; it stays on the record and the review moves on',
                      resume: markLine },
                    { label: 'fix instead', description: 'The finding goes to a fix round instead, which costs another review pass but removes the defect',
                      resume: markLine },
                    { label: other + ' instead', description: 'The finding is ' + other + 'd instead of ' + d.recommended + 'd, recorded as a user override of the disposer',
                      resume: markLine },
                  ],
                }
              }),
            })
          // The accepting mark may have just recorded the policy pick: persist it before this exit
          // (the resumed mark finds the entry already final and never records it), and print its lines.
          if (markPreamble) saveSidecar()
          writeOut(1, markPreamble + line + '\n')
          process.exit(0)
        }
        for (const d of open) {
          const label = answers[d.ref].label
          const fate = label.startsWith('accept ') ? d.recommended : label.replace(/ instead$/, '')
          d.final = fate
          if (fate !== d.recommended) {
            d.overriddenBy = 'user'
            d.overrideReason = 'answered through the delegated stop by ' + answers[d.ref].by
          }
        }
        raw = JSON.stringify(ret, null, 2) + '\n'
        fs.writeFileSync(file, raw)
        pq.consumePending(repoRoot)
      }
    }
    // Weighted tally: a survivor ref counts 1; a leg ref counts that leg's finding count (the number
    // verdict.js's legFindings sums).
    const legWeight = new Map(pools.legs.map((r) => ['leg:' + r.leg, countLegFinding(r)]))
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
      tally[effective] += legWeight.has(entry.ref) ? legWeight.get(entry.ref) : 1
    }
    // At a cap that has ALREADY tripped this session (marks.escalated), an effective fix is refused —
    // accepting it would promise a cycle the cap forbids. Deliberately narrower than
    // handleFixApplied's count: a FIX for what would be the capping cycle, or a cold restart with an
    // uncleared escalate row, stays accepted here and is refused at fix-applied, where the durable
    // escalate row is written. Checked before the tally cross-check and before any write.
    if (marks.escalated && tally.fix > 0) {
      die('iteration cap 2 reached — a third fix-applied is refused; this disposer return ' +
        'recommends fix for at least one finding, but the fix/review loop is capped at 2 ' +
        'iterations — waive or reject through --mark dispositions --file <return.json> instead')
    }
    if ((waivedGiven && tally.waive !== waived) || (rejectedGiven && tally.reject !== rejected) ||
        (fixGiven && tally.fix !== fixDispatched)) {
      const weights = [...legWeight].filter(([, w]) => w > 1).map(([ref, w]) => ref + '=' + w).join(', ')
      die('--waived/--rejected/--fix-dispatched (' + waived + '/' + rejected + '/' + fixDispatched +
        ') do not match the return\'s final-or-recommended tallies (waive:' + tally.waive +
        ' reject:' + tally.reject + ' fix:' + tally.fix + ') — a leg ref counts that leg\'s whole ' +
        'finding count' + (weights ? ' (' + weights + ')' : '') + '; recount before re-running')
    }
    // The derived tally is authoritative: fills an omitted flag, no-op for a passed (already equal) one.
    waived = tally.waive
    rejected = tally.reject
    fixDispatched = tally.fix
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
  // empty pools -> {file:null, iteration, overrides:0, empty:true}; non-empty, accepted ->
  // {file, iteration, overrides}.
  marks.disposer = poolRefs.length > 0
    ? { file: dest, iteration: n, overrides }
    : { file: null, iteration: n, overrides: 0, empty: true }
  marks.pendingFix = fixDispatched > 0
  if (marks.pendingFix) marks.escalated = false // a fresh fix cycle — any stale escalation no longer applies
  if (marks.pendingFix && unclearedEscalationsFor().length) {
    process.stderr.write('⚠️ the fix cap for ' + specRel + ' is already spent (uncleared escalate row on the ' +
      'ledger) — the fix-applied that follows this dispatch will be refused; prefer the waive/reject ' +
      'close (dispositions --fix-dispatched 0) over dispatching workers\n')
  }
  saveSidecar()
  return null
}

// The cap is enforced from the manifests on disk, never a sidecar counter. FIX vs ESCALATE cannot be
// re-derived from disk alone, so `marks.escalated` records an actual refusal (set only here).
const FIX_CAP = 2

// Durable half of the cap (core § Incident Policy): every `escalated:true` review row for this spec
// not cleared by a later non-escalated review row counts as a spent cap — the ESCALATE abandon exit
// deletes the manifests the count reads. "Later" is read order within one ledger file and `ts`
// date across files (same-day clears). Only a close resets the budget; abandoning never does.
function readLedgerRowsTagged(root) {
  const dir = path.join(root, '.claude')
  if (!fs.existsSync(dir)) return []
  const rows = []
  for (const f of fs.readdirSync(dir).filter((n) => /^spec-runs.*\.jsonl$/.test(n)).sort()) {
    const file = path.join(dir, f)
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, idx) => {
      if (!line.trim()) return
      try { rows.push({ row: JSON.parse(line), file, idx }) } catch { /* doctor's job */ }
    })
  }
  return rows
}
function unclearedEscalationsFor() {
  const roots = repoRoot === mainRoot ? [repoRoot] : [repoRoot, mainRoot]
  const seen = new Set()
  const rows = []
  for (const root of roots) {
    for (const t of readLedgerRowsTagged(root)) {
      if (t.row.stage !== 'review' || t.row.spec !== specRel) continue
      const key = JSON.stringify(t.row)
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(t)
    }
  }
  const closes = rows.filter((t) => t.row.escalated !== true)
  const clearedBy = (esc) => closes.some((c) =>
    c.file === esc.file ? c.idx > esc.idx : String(c.row.ts || '') >= String(esc.row.ts || ''))
  return rows.filter((t) => t.row.escalated === true && !clearedBy(t)).map((t) => t.row)
}

function handleFixApplied() {
  if (!marks.pendingFix) die('no fix was dispatched for the current findings — mark dispositions --fix-dispatched N first')
  const curN = liveIteration()
  const priorEscalations = unclearedEscalationsFor()
  const fixIterationsDone = fixRoundsDone() + priorEscalations.length * FIX_CAP
  if (fixIterationsDone >= FIX_CAP) {
    marks.escalated = true
    saveSidecar()
    // Write the escalate row HERE, before die() — the abandonment path never re-invokes.
    const result = writeEscalateRow(curN)
    const capMsg = 'iteration cap 2 reached — a third fix-applied is refused; the fix/review loop ' +
      'is capped at 2 iterations, escalate to the user instead of dispatching another fix' +
      (priorEscalations.length
        ? '\nThe cap was already spent: ' + priorEscalations.length + ' earlier escalate row(s) for ' +
          specRel + ' (runId ' + priorEscalations.map((r) => r.runId).join(', ') + ') are on the ledger ' +
          'and no later close cleared them — a cold restart resumes the count, it never resets it. ' +
          'Close through the waive/reject route (dispositions --fix-dispatched 0).'
        : '')
    die(result.ok
      ? capMsg + '\nAn escalate ledger line has been appended to ' + marks.escalateLedgerPath + '.'
      // Embed the drift error verbatim; escalateRunId stays unset so the next invocation retries.
      : capMsg + '\nThe escalate ledger pass could not be completed: ' + result.error +
        '\nRe-run this driver once the evidence is repaired — the append will be retried.')
  }
  const n = curN + 1
  // Diff the reviewer-returned snapshot for curN against a fresh one (HEAD's tree when none was
  // recorded). Nothing is mutated before the empty-delta check below.
  const priorSha = (marks.treeSnapshot && marks.treeSnapshot[String(curN)]) || headTree()
  const nowSha = snapshotTree()
  const delta = treeDiffNames(priorSha, nowSha)
  if (delta.length === 0) {
    die('no file changed since the reviewer returned — the fix workers wrote nothing; ' +
      'dispatch them again or close through waive/reject')
  }
  fs.mkdirSync(sidecarDir, { recursive: true })
  fs.writeFileSync(path.join(sidecarDir, `fix-delta-${n}.txt`), delta.join('\n') + '\n')
  // the REVIEWER fix-delta variant names the prior returns from this record, never n - 1.
  marks.fixDeltaFrom = marks.fixDeltaFrom || {}
  marks.fixDeltaFrom[String(n)] = curN
  // carry the prior iteration's skips file (and the count it was extracted against).
  const prior = legsModeFor(curN) || {}
  const r = runLegsIteration(n, { fixDelta: true, skipsFile: prior.skipsFile || undefined, skipsGateCount: prior.skipsGateCount })
  if (r.stopped) return 'STOPPED'
  marks.pendingFix = false
  saveSidecar()
  return null
}

// ---- close-time host-gate re-run ----
// Resolves the same {testDirs}/{scopeDirs} form review-legs.js's gate leg does, runs it with
// cwd = repoRoot and refuses (exit 2, before any mutation) on a non-zero exit or an unresolvable
// gate. NODE_TEST_CONTEXT is scrubbed: a nested `node --test` inheriting it runs silently green.
function tailLines(text, n) {
  const lines = text.split('\n')
  if (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines.slice(-n).join('\n')
}
// Gate + whole-suite only; nothing here deletes a test (that is /spec:doctor check 20's
// `--all-done --apply`, run by a human).
function runCloseTimeGate() {
  const gateConfig = readConfig(repoRoot)
  const resolved = resolveGate(specText, gateConfig)
  if (!resolved.gate) {
    const reason = resolved.reason ||
      ('no gateCommand declared in ' + CONFIG_RELPATH + ' under ' + repoRoot + ' (host config missing, unreadable, or unparsable)')
    die('close-time host gate could not be resolved — ' + reason + ' — fix the host config / File ' +
      'Plan, then re-run `node ' + __filename + ' ' + specPath + ' --mark closed`')
  }
  // The resolved-gate re-run, then the testCommand re-run — skipped only when gateRunsSuite() proves
  // the gate just ran it.
  const r = runHost(resolved.gate, { cwd: repoRoot, encoding: 'utf8' },
    'close-time host gate (' + resolved.gate + ')')
  if (r.status !== 0) {
    const output = (r.stdout || '') + (r.stderr || '')
    die('gate red at close — ' + resolved.gate + ' exited ' + r.status + ' over the committed ' +
      'close tree.\n' +
      'Check WHICH path the gate names first: the pipeline\'s own artifacts under ' +
      '.claude/ (ledger, retained evidence, config) are in the rule surface but this driver ' +
      'wrote them — a finding against one is a plugin defect to report, never a file to edit.\n' +
      'Fix the session-written files, commit the fix, then re-run `node ' + __filename + ' ' +
      specPath + ' --mark closed`.\n--- last 40 lines of gate output ---\n' + tailLines(output, 40))
  }
  if (gateRunsSuite(gateConfig.gateCommand, resolved.gate, gateConfig.testCommand)) {
    console.log('close-time suite: reused the gate run (' + resolved.gate + ')')
    return
  }
  // Additive: a gateCommand may carry typecheck/lint the testCommand lacks. Same env scrub/cwd.
  if (!gateConfig.testCommand) {
    die('close-time whole-suite re-run could not run — no testCommand declared in ' + CONFIG_RELPATH +
      ' under ' + repoRoot + ' — add testCommand to the host config, then re-run `node ' + __filename +
      ' ' + specPath + ' --mark closed`')
  }

  const sr = runHost(gateConfig.testCommand, { cwd: repoRoot, encoding: 'utf8' },
    'close-time whole-suite (' + gateConfig.testCommand + ')')
  if (sr.status === 0) return

  const output = (sr.stdout || '') + (sr.stderr || '')
  die('suite red at close — ' + gateConfig.testCommand + ' exited ' + sr.status + ' over the ' +
    'committed close tree.\n' +
    'The files written at CLOSE (canonical doc, rules fold) are inside ' +
    'the host\'s rule surface; fix them, commit the fix, then re-run `node ' + __filename + ' ' +
    specPath + ' --mark closed`.\n--- last 40 lines of suite output ---\n' + tailLines(output, 40))
}

// ---- re-stamp the build row's deviations count at close ----
// The build row counts the sidecar mid-build; marks.deviations is the LAST observation the file got,
// final once `--mark closed` runs after the fold. Re-stamped in place on the LAST stage:"build" row
// for this spec, only when it differs; a silent no-op when no build row is readable here.
function restampBuildDeviations() {
  if (!marks.deviations || typeof marks.deviations.entries !== 'number') return
  const ledgerPath = path.join(repoRoot, '.claude/spec-runs.jsonl')
  if (!fs.existsSync(ledgerPath)) return
  // split/join round-trips the file byte-for-byte (a trailing newline becomes a final '' element),
  // so an unparseable or unrelated line is preserved exactly as written.
  const lines = fs.readFileSync(ledgerPath, 'utf8').split('\n')
  let idx = -1
  let row = null
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].trim()) continue
    let parsed
    try { parsed = JSON.parse(lines[i]) } catch { continue }
    if (parsed.stage === 'build' && parsed.spec === specRel) { idx = i; row = parsed; break }
  }
  if (idx === -1) return
  const from = row.deviations
  const to = marks.deviations.entries
  if (from === to) return
  row.deviations = to
  lines[idx] = JSON.stringify(row)
  fs.writeFileSync(ledgerPath, lines.join('\n'))
  marks.deviationsRestamp = { from, to }
}

// ---- the CLOSE advisory softs ----------------------
// The soft list is dispositionPools(n).softs of the recorded reviewer return — the same derivation
// the DISPOSITIONS step prints, so `a<i>` indexes the printed order.
function currentSofts() {
  if (!marks.reviewerReturnFile || !Number.isFinite(marks.reviewerReturnIteration)) return []
  return dispositionPools(marks.reviewerReturnIteration).softs
}

// Appends (or rewrites, for the same runId) the `### Advisory debt (review <runId>)` block at the end
// of the spec's `## Rationale` section; a spec with no such heading gets one appended at the end.
function withAdvisoryDebt(text, runId, debtLines) {
  const heading = '### Advisory debt (review ' + runId + ')'
  const lines = text.split('\n')
  const at = lines.indexOf(heading)
  if (at !== -1) {
    let end = at + 1
    while (end < lines.length && /^- /.test(lines[end])) end++
    lines.splice(at, end - at)
  }
  if (debtLines.length === 0) return lines.join('\n')
  let rat = lines.findIndex((l) => /^##\s+Rationale\s*$/.test(l))
  if (rat === -1) {
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
    lines.push('', '## Rationale', '')
    rat = lines.length - 2
  }
  let next = lines.findIndex((l, i) => i > rat && /^##\s/.test(l))
  if (next === -1) next = lines.length
  let ins = next
  while (ins > rat + 1 && lines[ins - 1].trim() === '') ins--
  lines.splice(ins, next - ins, '', heading, ...debtLines, '')
  return lines.join('\n')
}

// the judged sha is the close row's diff.head, read back from the ledger (the ref is the fallback).
function judgedSha() {
  const sha = findJudgedSha()
  if (sha) return sha
  die('cannot find the judged sha for run ' + marks.closeRunId + ' (no close row in .claude/spec-runs.jsonl, no ' +
    'refs/spec-review/' + marks.closeRunId + '/judged) — the close tree drift cannot be measured; restore the ledger row')
}

// null when neither the close row nor the judged ref carries it.
function findJudgedSha() {
  const ledgerPath = path.join(repoRoot, '.claude/spec-runs.jsonl')
  if (fs.existsSync(ledgerPath)) {
    for (const l of fs.readFileSync(ledgerPath, 'utf8').split('\n')) {
      if (!l.trim()) continue
      let row
      try { row = JSON.parse(l) } catch { continue }
      if (row.runId === marks.closeRunId && row.diff && SHA40_RE.test(row.diff.head || '')) return row.diff.head
    }
  }
  const r = runChild('git', ['-C', repoRoot, 'rev-parse', '--verify', 'refs/spec-review/' + marks.closeRunId + '/judged'],
    { encoding: 'utf8' }, 'git rev-parse judged ref')
  const sha = (r.stdout || '').trim()
  return (r.status === 0 && SHA40_RE.test(sha)) ? sha : null
}

// the committed close tree against the judged tree, minus the files CLOSE itself writes. The
// judged tree is the working-tree snapshot taken at the close-row append (marks.judgedTree) — the
// exact tree the authoritative legs ran over; a sidecar older than that mark falls back to the
// close row's diff.head commit.
function refuseCloseTreeDrift() {
  const pinned = SHA40_RE.test(marks.judgedTree || '') && marks.judgedTree
  const sha = pinned || judgedSha()
  const excludes = [specRel, 'docs/canonical/', '.claude/spec-runs.jsonl', '.claude/spec-runs/', sidecarRel,
    path.relative(repoRoot, deviationsPath), '.claude/agent-memory/']
  if (pipelineRulesPath) excludes.push(path.relative(repoRoot, pipelineRulesPath))
  // The judged tree is a working-tree snapshot that also holds whatever the reviewer's legs left
  // behind (untracked build output a host never ignored); lib/close-tree-drift.js counts only paths
  // tracked in the judged commit, in HEAD or in a fix-delta list, so cleaning that output is not drift.
  let m
  try {
    m = measureDrift({ repoRoot, judgedTree: sha, judgedCommit: pinned ? findJudgedSha() : sha,
      alsoTracked: fixDeltaPaths(), excludes, run: runChild })
  } catch (e) {
    die(e.message + ' — fix the repo state, then re-run this mark')
  }
  if (m.skipped.length) {
    writeOut(1, 'ℹ close check ignored ' + m.skipped.length + ' path(s) tracked in neither the judged commit nor HEAD ' +
      '(reviewer-created, since cleaned): ' + m.skipped.slice(0, 5).join(', ') + (m.skipped.length > 5 ? ', …' : '') + '\n')
  }
  if (m.total > 0 || m.binary) {
    die('close tree drifted from the judged tree: ' + m.total + ' changed line(s)' + (m.binary ? ' plus a binary change' : '') +
      ' vs judged ' + sha.slice(0, 7) + ' — revert (git checkout ' + sha + ' -- ' + m.files.join(' ') +
      '), re-commit, then re-run `node ' + __filename + ' ' + specPath + ' --mark closed`')
  }
}

// every path a fix round touched (the fix-delta-<n>.txt lists): a hard fix's brand-new file is in
// the judged snapshot but in neither commit, and must still count when the close commit deletes it.
function fixDeltaPaths() {
  const out = []
  for (const n of listManifestNumbers()) {
    const p = path.join(sidecarDir, `fix-delta-${n}.txt`)
    if (fs.existsSync(p)) out.push(...fs.readFileSync(p, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean))
  }
  return out
}

function handleClosed() {
  if (status !== 'done') {
    die('spec status is not yet "done" — re-run the driver with no mark first so CLOSE\'s ' +
      'authoritative verdict runs and flips status')
  }
  saveSidecar() // persists the deviations observation the startup call deferred for this mark
  // Both deviations refusals run BEFORE the dirty-tree check (a committed, unchanged sidecar is
  // invisible to it). Refusal 1 re-observes and persists first. die() exits before marks.closed.
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
  refuseCloseTreeDrift()
  // LAST refusal check, over the committed close tree the checks above certified.
  runCloseTimeGate()
  restampBuildDeviations()
  // The close commit now exists — best-effort ref write, never blocks the mark.
  if (marks.closeRunId) {
    const closeSha = runChild('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' },
      'git rev-parse HEAD').stdout.trim()
    writeReviewRef(marks.closeRunId, 'close', closeSha)
  }
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

// The prototype the closing spec would close at merge: the spec carries `prototype: <stem>`, the
// prototype's status.json exists without marks.closed, every citing spec is done (read from the
// build worktree — the closing spec is `done` there, not yet on main), and proto/<stem> exists.
// Returns { stem, n, tip } with n = commits on proto/<stem> the target does not hold and tip the
// branch's commit (the restore point a delete prints), else null. A missing branch returns null
// so finishMerge keeps its "still open" warning path.
function prototypeAtRisk(target) {
  const stem = fmVal('prototype')
  if (!stem) return null
  let pst = null
  try { pst = JSON.parse(fs.readFileSync(path.join(mainRoot, 'design/prototypes', stem, 'status.json'), 'utf8')) } catch { return null }
  if (!pst || (pst.marks && pst.marks.closed)) return null
  if (citersOfPrototype(repoRoot, stem).some((st) => st !== 'done')) return null
  if (!branchExists(mainRoot, 'proto/' + stem)) return null
  const r = runChild('git', ['-C', mainRoot, 'rev-list', '--count', target + '..proto/' + stem],
    { encoding: 'utf8' }, 'git rev-list --count')
  if (r.status !== 0) return null
  const tip = runChild('git', ['-C', mainRoot, 'rev-parse', 'proto/' + stem], { encoding: 'utf8' }, 'git rev-parse').stdout.trim()
  return { stem, n: Number(r.stdout.trim()), tip }
}

let protoClose = null // set by handleMergeStrategy; read by finishMerge

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

  // Unmerged prototype commits are the one artifact the close destroys that nothing else holds, so
  // a nonzero count needs an answer BEFORE any merge runs.
  const pIdx = argv.indexOf('--prototype')
  const protoAnswer = pIdx > -1 ? argv[pIdx + 1] : null
  if (pIdx > -1 && protoAnswer !== 'delete' && protoAnswer !== 'keep') {
    die('--prototype needs delete|keep, got ' + JSON.stringify(protoAnswer))
  }
  const atRisk = prototypeAtRisk(target)
  if (atRisk && atRisk.n > 0 && !protoAnswer) {
    die('--mark merge-strategy needs --prototype delete|keep — proto/' + atRisk.stem + ' carries ' +
      atRisk.n + ' unmerged commits')
  }
  protoClose = atRisk ? { stem: atRisk.stem, n: atRisk.n, tip: atRisk.tip, decision: atRisk.n > 0 ? protoAnswer : null } : null
  // the tip is the restore point a delete prints; the sidecar keeps it past this process.
  if (protoClose) { marks.prototypeClose = { unmerged: protoClose.n, decision: protoClose.decision, ...(protoClose.tip ? { tip: protoClose.tip } : {}) }; saveSidecar() }

  // Re-entrancy: detect "already landed" BEFORE invoking merge-back.sh merge (a retry would die on
  // assert_clean_root against its own promoted evidence). A gone source branch, or source fully
  // contained in target, skips straight to finishMerge. Supersession rows are derived while the
  // source branch still exists; finishMerge appends them once the merge sha exists.
  if (marks.supersessions === undefined && !marks.supersessionRowsWritten && branchExists(mainRoot, source)) {
    const sr = runChild(process.execPath, [path.join(__dirname, 'supersession-rows.js'), '--merge', '--root', mainRoot,
      '--target', target, '--source', source, '--by', (wt && (path.resolve(resolvedSpecPath) + path.sep).startsWith(path.resolve(wt) + path.sep)) ? path.relative(wt, resolvedSpecPath) : specRel, '--json'], { encoding: 'utf8' }, 'supersession-rows.js --merge')
    let derived = null
    if (sr.status === 0) { try { derived = JSON.parse(sr.stdout) } catch { derived = null } }
    if (Array.isArray(derived)) { marks.supersessions = derived; saveSidecar() }
    else process.stdout.write('⚠️ supersession rows skipped — exit ' + sr.status + '\n')
  }

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
  // A squash links no ancestry; its proof is merge-back.sh cleanup's: merging source into target
  // yields the target's own tree.
  const mergedTreeR = runChild('git', ['-C', mainRoot, 'merge-tree', '--write-tree', target, source],
    { encoding: 'utf8' }, 'git merge-tree --write-tree')
  const targetTreeR = runChild('git', ['-C', mainRoot, 'rev-parse', target + '^{tree}'],
    { encoding: 'utf8' }, 'git rev-parse ^{tree}')
  if (mergedTreeR.status === 0 && targetTreeR.status === 0 &&
      mergedTreeR.stdout.split('\n')[0].trim() === targetTreeR.stdout.trim()) {
    process.stdout.write('[spec-review-driver] merging ' + source + ' into ' + target +
      ' changes nothing — the squash already landed; skipping merge-back.sh merge and resuming at ' +
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

// Shared tail for a concluded merge: cleanup + verify + spec-status --next, then DONE. Exits the
// process directly. Ledger + evidence written under the worktree are promoted into mainRoot (dedup
// by line / filename), then the worktree copies are cleared by TRACKED STATUS: a tracked path is
// restored to HEAD, an untracked one removed — deleting a tracked file would make the plain
// `git worktree remove` refuse.
function isTrackedInWorktree(wt, relPath) {
  const r = runChild('git', ['-C', wt, 'ls-files', '--error-unmatch', relPath],
    { encoding: 'utf8' }, 'git ls-files --error-unmatch ' + relPath)
  return r.status === 0
}
// A directory is walked, never removed whole: the tracked-restore / untracked-delete decision is
// per PATH, and a leftover untracked file makes `git worktree remove` refuse. Recurse, decide per
// file, then drop the directory only once it is empty.
function clearPromotedCopy(wt, absPath, relPath) {
  const st = fs.lstatSync(absPath, { throwIfNoEntry: false })
  if (st && st.isDirectory()) {
    for (const entry of fs.readdirSync(absPath)) {
      clearPromotedCopy(wt, path.join(absPath, entry), relPath + '/' + entry)
    }
    // Non-empty here means a restored tracked child remains, by design — same reasoning as the
    // srcDir rmdir below.
    try { fs.rmdirSync(absPath) } catch { /* tracked children restored: a clean state, not residue */ }
    return
  }
  if (isTrackedInWorktree(wt, relPath)) {
    runChild('git', ['-C', wt, 'checkout', '--', relPath], { encoding: 'utf8' },
      'git checkout -- ' + relPath)
  } else {
    fs.rmSync(absPath, { force: true })
  }
}

// Directory entries under .claude/spec-runs/ are promoted whole (no fs.cpSync: built-ins only).
function copyTreeIfAbsent(src, dst) {
  const st = fs.lstatSync(src, { throwIfNoEntry: false })
  if (!st) return
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true })
    for (const entry of fs.readdirSync(src)) {
      copyTreeIfAbsent(path.join(src, entry), path.join(dst, entry))
    }
    return
  }
  if (!fs.existsSync(dst)) fs.copyFileSync(src, dst)
}
function promoteEvidenceAndClean(wt, mainRootDir) {
  const srcLedger = path.join(wt, '.claude/spec-runs.jsonl')
  const dstLedger = path.join(mainRootDir, '.claude/spec-runs.jsonl')
  // Drain this spec's stopped rows BEFORE promoting the worktree's ledger lines, so a GATE_RED row
  // lands ahead of this run's CLOSE row. Keyed by the spec path relative to the WORKTREE (the
  // top-level specRel carries the worktree prefix).
  const specRelInWt = path.relative(wt, resolvedSpecPath)
  const { drained } = drainStoppedRows(mainRootDir, specRelInWt)
  if (drained.length) {
    fs.mkdirSync(path.dirname(dstLedger), { recursive: true })
    fs.appendFileSync(dstLedger, drained.join('\n') + '\n')
    retargetDrainedMarks(drained, dstLedger) // relocateSidecar() right after persists the live marks
  }
  if (fs.existsSync(srcLedger)) {
    const srcLines = fs.readFileSync(srcLedger, 'utf8').split('\n').filter(Boolean)
    const dstLines = fs.existsSync(dstLedger) ? fs.readFileSync(dstLedger, 'utf8').split('\n').filter(Boolean) : []
    // A build row's identity is its runId (restampBuildDeviations() may rewrite it after the merge),
    // so the worktree copy replaces main's in place; review rows keep exact-line semantics.
    const buildRunId = (l) => {
      try { const r = JSON.parse(l); return r && r.stage === 'build' && r.runId ? r.runId : null } catch { return null }
    }
    const dstBuildIdx = new Map()
    dstLines.forEach((l, i) => { const id = buildRunId(l); if (id) dstBuildIdx.set(id, i) })
    let replaced = false
    const dstSet = new Set(dstLines)
    const toAppend = srcLines.filter((l) => {
      if (dstSet.has(l)) return false
      const id = buildRunId(l)
      if (id && dstBuildIdx.has(id)) { dstLines[dstBuildIdx.get(id)] = l; replaced = true; return false }
      return true
    })
    if (replaced) fs.writeFileSync(dstLedger, dstLines.join('\n') + '\n')
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
      copyTreeIfAbsent(srcFile, dst)
      clearPromotedCopy(wt, srcFile, path.relative(wt, srcFile))
    }
    // The directory itself: a restored tracked file (per clearPromotedCopy above) is put back on
    // disk at its HEAD content, so the directory is non-empty and rmdir refuses — that is a clean
    // worktree state, not a leftover; only remove the directory when nothing tracked remains in it.
    try { fs.rmdirSync(srcDir) } catch { /* non-empty: a restored tracked file remains, by design */ }
  }
}

// The worktree sidecar must be gone before cleanup, but DONE runs after cleanup from the main root
// and needs this run's state: move review-state.json into the main root's <spec>.review/ and rebind
// paths. Per-iteration manifests are not carried (already retained under .claude/spec-runs/).
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

// Promotion writes ledger rows and evidence into the main root after the merge, so nothing else
// commits them — commit exactly those two paths, pathspec-limited. Ignored paths are skipped;
// nothing staged means no commit; a failed commit dies (a re-run resumes at finishMerge).
function commitPromotedEvidence(mainRootDir, wt) {
  const git = (args, what) => runChild('git', ['-C', mainRootDir, ...args], { encoding: 'utf8' }, what)
  const paths = ['.claude/spec-runs.jsonl', '.claude/spec-runs'].filter((p) =>
    fs.existsSync(path.join(mainRootDir, p)) &&
    git(['check-ignore', '-q', '--', p], 'git check-ignore ' + p).status !== 0)
  if (!paths.length) return
  const add = git(['add', '--', ...paths], 'git add promoted evidence')
  if (add.status !== 0) die('staging promoted evidence failed in ' + mainRootDir + ': ' + (add.stdout + add.stderr).trim())
  if (git(['diff', '--cached', '--quiet', '--', ...paths], 'git diff --cached').status === 0) return
  const specRelInWt = path.relative(wt, resolvedSpecPath)
  const m = /^specs\/(\d{8}\/\d+)-/.exec(specRelInWt.split(path.sep).join('/'))
  const label = m ? m[1] : path.basename(specRelInWt, '.md')
  const c = git(['commit', '-q', '-m', 'chore(ledger): record ' + label + ' build and review rows', '--', ...paths],
    'git commit promoted evidence')
  if (c.status !== 0) {
    die('committing promoted evidence failed in ' + mainRootDir + ' — commit ' + paths.join(' and ') +
      ' by hand, then re-run this mark: ' + (c.stdout + c.stderr).trim())
  }
}

function appendSupersessionRows(mainRootDir) {
  // append the rows derived before the merge, once, with the landed HEAD sha.
  if (Array.isArray(marks.supersessions) && !marks.supersessionRowsWritten) {
    const head = runChild('git', ['-C', mainRootDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }, 'rev-parse HEAD')
    const headSha = head.status === 0 ? head.stdout.trim() : null
    for (const row of marks.supersessions) {
      const w = runChild(process.execPath, [path.join(__dirname, 'escape-row.js'), '--append', '--root', mainRootDir,
        '--row', JSON.stringify({ ...row, stage: 'escape', sha: headSha })], { encoding: 'utf8' }, 'escape-row.js --append')
      if (w.status === 0) process.stdout.write('supersession spec=' + row.spec + ' class=shipped-file-deleted files=' + row.files.length + '\n')
      else if (w.status === 3) process.stdout.write('already recorded spec=' + row.spec + '\n')
      else process.stdout.write('⚠️ supersession row for ' + row.spec + ' skipped — exit ' + w.status + '\n')
    }
    marks.supersessionRowsWritten = true
    saveSidecar()
  }
}

// The sidecar is re-homed only once cleanup exits 0; a failed cleanup writes it back where the same
// mark finds it on a re-run.
function finishMerge(mainRootDir, source, wt) {
  appendSupersessionRows(mainRootDir)
  let vacated = false
  let staged = null
  if (wt) {
    promoteEvidenceAndClean(wt, mainRootDir)
    commitPromotedEvidence(mainRootDir, wt)
    const rel = path.relative(wt, sidecarDir)
    vacated = !(rel.startsWith('..') || path.isAbsolute(rel))
    if (vacated) {
      // staged in the main root first, so a driver killed mid-cleanup still leaves the state on disk
      staged = path.join(mainRootDir, rel)
      saveSidecarLib(staged, 'review-state.json', marks)
      fs.rmSync(sidecarDir, { recursive: true, force: true })
    }
  }
  const cleanupArgs = ['cleanup', '--root', mainRootDir, '--source', source]
  if (wt) cleanupArgs.push('--worktree', wt)
  const c = runChild('bash', [mergeBackBin, ...cleanupArgs], { encoding: 'utf8' }, 'merge-back.sh cleanup')
  if (c.status !== 0) {
    let rerunSpec = specPath
    if (vacated && fs.existsSync(wt)) { fs.rmSync(staged, { recursive: true, force: true }); saveSidecar() }
    else if (vacated) { relocateSidecar(wt, mainRootDir); rerunSpec = replaySpecPath }
    die('merge-back.sh cleanup failed: ' + (c.stdout + c.stderr).trim() + '\nThe merge landed; fix the cause above, ' +
      'then re-run: node ' + __filename + ' ' + rerunSpec + ' --mark merge-strategy <the same strategy> — the landed ' +
      'merge is detected and cleanup resumes.')
  }
  if (vacated) relocateSidecar(wt, mainRootDir)
  runChild('bash', [mergeBackBin, 'verify', '--root', mainRootDir], { encoding: 'utf8' }, 'merge-back.sh verify')
  let doneNote = 'merged ' + source + ' into the target branch; worktree and branch cleaned up.'
  // a `prototype: <stem>` spec closes the prototype when it was the last citer. The close is
  // the prototype driver's own mark (one deletion routine); a refusal never fails a landed merge.
  const protoStem = fmVal('prototype')
  if (protoStem) {
    const statusPath = path.join(mainRootDir, 'design/prototypes', protoStem, 'status.json')
    let pst = null
    try { pst = JSON.parse(fs.readFileSync(statusPath, 'utf8')) } catch { pst = null }
    if (pst && !(pst.marks && pst.marks.closed)) {
      const statuses = citersOfPrototype(mainRootDir, protoStem)
      const open = statuses.filter((st) => st !== 'done').length
      if (open === 0 && protoClose && protoClose.stem === protoStem && protoClose.decision === 'keep') {
        doneNote = 'prototype ' + protoStem + ' kept — ' + protoClose.n + ' unmerged commits on proto/' + protoStem +
          '; close later: node ' + path.join(__dirname, 'prototype-driver.js') + ' ' + protoStem +
          ' --root ' + mainRootDir + ' --mark closed\n' + doneNote
      } else if (open > 0) {
        doneNote = 'prototype ' + protoStem + ' stays open — ' + open + ' citing spec(s) not done\n' + doneNote
      } else {
        const driverBin = path.join(__dirname, 'prototype-driver.js')
        if (protoClose && protoClose.stem === protoStem) {
          process.stdout.write('prototype ' + protoStem + ': ' + protoClose.n +
            ' unmerged commits — deleting worktree, branch and database\n')
        }
        const closeR = runChild(process.execPath,
          [driverBin, protoStem, '--root', mainRootDir, '--mark', 'closed'], { encoding: 'utf8' },
          'prototype-driver.js --mark closed')
        if (closeR.status === 0) {
          doneNote = 'prototype ' + protoStem + ' closed — database, worktree and proto/' + protoStem +
            ' gone' + (protoClose && protoClose.stem === protoStem && protoClose.n > 0 && protoClose.tip
            ? '; restore the branch: git branch proto/' + protoStem + ' ' + protoClose.tip : '') + '\n' + doneNote
        } else {
          const first = ((closeR.stderr || closeR.stdout || '').trim().split('\n')[0]) || 'exit ' + closeR.status
          doneNote = '⚠️ prototype ' + protoStem + ' still open: ' + first + ' — run: node ' + driverBin +
            ' ' + protoStem + ' --root ' + mainRootDir + ' --mark closed\n' + doneNote
        }
      }
    }
  }
  marks.mergeConcluded = true
  saveSidecar()
  printDoneNow(doneNote)
}

// `--mark repair-round` (STOPPED only, cap 1): the mechanized form of the hand remedy -- delete the
// stopped iteration's manifest and re-run legs at the same number. Admission is read from the
// manifest, not deriveState(), so a refused mark has no side effect.
const REPAIR_ROUND_CAP = 1
function handleRepairRound() {
  const n = liveIteration()
  if (n === 0 || !isRedBlocking(readManifestRows(manifestPathFor(n)))) {
    die('--mark repair-round refused \u2014 the run is not at STOPPED (state unchanged); re-run `node ' +
      __filename + ' ' + specPath + '` and execute the step it prints')
  }
  if ((marks.repairRounds || 0) >= REPAIR_ROUND_CAP) {
    die('--mark repair-round refused \u2014 repair round spent (' + REPAIR_ROUND_CAP + ' of ' + REPAIR_ROUND_CAP +
      '); queue `/spec:fix` or abandon the review (state unchanged)')
  }
  marks.repairRounds = (marks.repairRounds || 0) + 1
  saveSidecar()
  const mode = legsModeFor(n) || {}
  // the re-run reuses the number, so the stopped manifest is kept aside as the reuse source.
  fs.mkdirSync(outDirFor(n), { recursive: true })
  const priorManifest = path.join(outDirFor(n), 'prior-manifest.jsonl')
  fs.copyFileSync(manifestPathFor(n), priorManifest)
  const priorRows = readManifestRows(priorManifest)
  fs.rmSync(manifestPathFor(n), { force: true })
  const reuse = decideReuse(n, priorManifest, !!mode.fixDelta)
  const r = runLegsIteration(n, { skipsFile: mode.skipsFile || undefined, skipsGateCount: mode.skipsGateCount, fixDelta: !!mode.fixDelta, ...reuse })
  if (reuse.reuseFrom) recordFlaky(n, n, priorRows)
  return r.stopped ? 'STOPPED' : null
}

let markPreamble = '' // the 📌 + veto lines a dispositions mark prints ahead of the next step
function pickOnce(key, labelByValue) { return pq.pickOnce(repoRoot, key, labelByValue, marks, saveSidecar) }
// The lane-ending exit is recorded once, never guessed.
// pq owns the write: the lane's copy outlives the `delete <sidecarDir>` the same step prints.
function setLaneExit(reason, queued) {
  if (pq.recordLaneExit(repoRoot, marks, { reason, ...(queued ? { queued } : {}) })) saveSidecar()
}

const repairStopKey = () => pq.stopKey('repair-round', marks.stoppedIteration || liveIteration(), marks.repairRounds || 0)
const escalateStopKey = () => pq.stopKey('review-escalate', liveIteration())

function handleMark() {
  if (marks.dismissedStop) {
    die('--mark ' + MARK + ' refused \u2014 marks.dismissedStop records a dismissed question (' + marks.dismissedStop.kind +
      '); the run ended \u2014 delete ' + sidecarDir + ' to restart')
  }
  switch (MARK) {
    case 'skips-extracted': return handleSkipsExtracted()
    case 'reviewer-returned': return handleReviewerReturned()
    case 'dispositions': return handleDispositions()
    case 'fix-applied': return handleFixApplied()
    case 'repair-round': return handleRepairRound()
    case 'closed': return handleClosed()
    case 'merge-strategy': return handleMergeStrategy() // exits the process itself
    case 'conflicts-resolved': return handleConflictsResolved() // exits the process itself
    default:
      die('unknown mark "' + MARK + '" (skips-extracted | reviewer-returned | dispositions | ' +
        'fix-applied | repair-round | closed | merge-strategy | conflicts-resolved)')
  }
}

// ---- state derivation (side-effecting: runs deterministic driver work as needed, idempotent) --
function deriveMergeOrDone() {
  if (marks.mergeConflicted) return 'CONFLICTS'
  return 'MERGE'
}

function deriveState() {
  // Post-merge short circuit: the manifests are gone with the worktree; the sidecar alone resumes.
  if (marks.mergeConcluded) {
    printDoneNow('')
  }

  let n = liveIteration()

  if (n === 0 || readManifestRows(manifestPathFor(n)).length === 0) {
    // the recorded iteration owns the number — a missing manifest is regenerated at that same
    // number, in the mode legs last ran in, never replaced by judging an older one live.
    const mode = (n > 0 && legsModeFor(n)) || {}
    n = n || 1
    const r = runLegsIteration(n, { skipsFile: mode.skipsFile || undefined, skipsGateCount: mode.skipsGateCount, fixDelta: !!mode.fixDelta })
    if (r.stopped) return 'STOPPED'
  } else if (isRedBlocking(readManifestRows(manifestPathFor(n)))) {
    // STOPPED is sticky — a bare re-invocation stays idempotent. Re-entry: fix the issue, delete the
    // sidecar (or this iteration's manifest).
    return 'STOPPED'
  }

  const rows = readManifestRows(manifestPathFor(n))

  // SKIPS is per iteration — the gate's count against the count recorded at this iteration's extraction.
  const liveMode = legsModeFor(n) || {}
  const gateSkips = gateSkipsCount(rows)
  if (gateSkips > 0 && (!liveMode.skipsFile || liveMode.skipsGateCount !== gateSkips)) return 'SKIPS'

  const reviewerFresh = marks.reviewerReturnFile && marks.reviewerReturnIteration === n
  if (!reviewerFresh) return 'REVIEWER'

  const dispositionsFresh = marks.dispositions && marks.dispositionsIteration === n
  if (!dispositionsFresh) return 'DISPOSITIONS'

  if (marks.pendingFix) {
    if (!marks.escalated) return 'FIX'
    // Self-heal: a bare re-invocation is the only remaining chance to append the escalate row. A drift
    // refusal is stashed for the step text, never thrown; a `--state` query never performs the write.
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
if (!MARK && !STATE_ONLY) {
  const bare = pq.bareRun(repoRoot, marks, ['dispositions'], (kind) =>
    kind === 'repair-round' ? repairStopKey() : kind === 'review-escalate' ? escalateStopKey() : null)
  if (bare) {
    if (bare.changed) saveSidecar()
    writeOut(1, bare.text + '\n')
    process.exit(0)
  }
}
let forcedState = null
if (MARK) forcedState = handleMark()
const state = forcedState || deriveState()
const currentN = liveIteration()

if (STATE_ONLY) { writeOut(1, state + '\n'); process.exit(0) }

// ---- step text per state -------------------------------------------------------------------------
const manifestPath = manifestPathFor(currentN)
const outDir = outDirFor(currentN)
const waivedWarn = (marks.dispositions && marks.dispositions.waived > 0)
  ? `${marks.dispositions.waived} finding(s) waived at DISPOSITIONS (recorded)\n`
  : ''
// A silent ledger correction is printed once, live; read from marks so MERGE re-prints it.
const restampLine = (marks.deviationsRestamp)
  ? `📦 build ledger row re-stamped at close: deviations ${marks.deviationsRestamp.from} → ` +
    `${marks.deviationsRestamp.to} (the sidecar's final entry count).\n`
  : ''

// CLOSE reads entry first-lines from the sidecar FILE (still on disk before the fold); the persisted
// observation carries only entries/malformed.
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

// The CLOSE step's advisory AC-pin drift line (never a leg, never touches the verdict). An exit
// other than 0/1 prints a could-not-run line; unparseable stdout on 0/1 (e.g. the `inapplicable`
// sentinel) prints nothing.
const driftBin = path.join(PLUGIN, 'scripts/ac-drift.js')
function acPinDriftLine() {
  const r = runChild(process.execPath, [driftBin, '--root', repoRoot, '--json'], { encoding: 'utf8' },
    'ac-drift.js')
  if (r.status !== 0 && r.status !== 1) {
    return `⚠️ AC-pin drift check could not run (exit ${r.status}) — see /spec:doctor check 17\n`
  }
  let parsed
  try {
    parsed = JSON.parse(r.stdout)
  } catch {
    return ''
  }
  const driftFindings = Array.isArray(parsed.findings) ? parsed.findings : []
  if (driftFindings.length === 0) return ''
  const specCount = new Set(driftFindings.map((f) => f.spec)).size
  return `⚠️ AC-pin drift (advisory): ${driftFindings.length} criteria across ${specCount} done ` +
    `spec(s) have no citing test — node "$(spec-paths ac-drift)" --root . names each\n`
}

// The open pool in DISPOSITIONS order (hard survivors s<i>, then leg findings) and the one
// question that routes it. The driver recommends an exit route, never a disposition.
function escalatePoolBlock() {
  const { survivors, legs } = dispositionPools(currentN)
  const open = survivors.length + legs.length
  const queueAdd = `node "$(spec-paths spec-queue)" add "${specRel}: review escalated at the fix cap \u2014 ${open} open findings" --lane fix --top --origin ${specRel} --stage review --trigger repair-separate`
  const listing = `open findings (${open}):\n` +
    survivors.map((sv, i) => `  s${i} [hard] ${sv.file}:${sv.line} \u2014 ${sv.claim}`).join('\n') +
    (survivors.length && legs.length ? '\n' : '') +
    legs.map((r) => `  leg:${r.leg} exit=${r.exit} count=${countLegFinding(r)}`).join('\n') +
    (open ? '\n' : '')
  const replanAdd = `node "$(spec-paths spec-queue)" add "re-plan ${specRel}: <reason>" --lane plan --origin ${specRel} --stage review --trigger gap`
  const qPick = pickOnce('reviewEscalate', { queue: 'abandon and queue /spec:fix' })
  if (qPick) {
    setLaneExit(`review escalated at the fix cap — ${open} open findings`, `${specRel}: review escalated at the fix cap — ${open} open findings`)
    return listing + qPick.line + '\n' +
      `delete ${sidecarDir}\n` +
      `${queueAdd}\n` +
      `To answer differently:\n` +
      `  waive or reject through the disposer — node ${__filename} ${specPath} --mark dispositions --file <return.json>\n` +
      `  re-plan — ${replanAdd}\n`
  }
  if (pq.isDelegated(repoRoot)) return listing + pq.stopLine(repoRoot, 'review', {
    kind: 'review-escalate', state: 'ESCALATE', spec: specRel,
    stopKey: escalateStopKey(),
    questions: [{
      id: 'q1', header: 'Review cap',
      question: 'The review hit its fix cap with ' + open + ' findings still open. How should the lane exit?',
      options: [
        { label: 'abandon and queue /spec:fix (Recommended)', description: 'The review sidecar is deleted and the repair becomes the queue\'s top item; the escalate row stays on the ledger so the cap is not reset',
          resume: 'stop', then: `delete ${sidecarDir}; ${queueAdd}` },
        { label: 'waive or reject everything through the disposer', description: 'A disposer return waives or rejects every open finding with evidence and the review closes normally; nothing more is fixed in this run',
          resume: `node ${__filename} ${specPath} --mark dispositions --file <return.json>` },
        { label: 'abandon without queuing', description: 'The review sidecar is deleted and the run restarts cold; the escalate row stays on the ledger so the cap is not reset',
          resume: 'stop', then: `delete ${sidecarDir}` },
        { label: 're-plan', description: 'The review ends and the spec returns to planning through the queue, so the findings are addressed by a new plan',
          resume: 'stop', then: replanAdd },
      ],
    }],
  }, marks) + '\n'
  return listing +
    `Ask ONE AskUserQuestion \u2014 options:\n` +
    `  abandon and queue /spec:fix (Recommended) \u2014 delete ${sidecarDir}, then ${queueAdd}\n` +
    `  waive or reject everything through the disposer — a disposer return with every entry waive or reject, then --mark dispositions --file <return.json>\n` +
    `  abandon without queuing — delete ${sidecarDir}\n` +
    `  re-plan — abandon as above, then ${replanAdd}\n`
}

const STEPS = {
  STOPPED: () => {
    const rows = readManifestRows(manifestPathFor(marks.stoppedIteration || currentN))
    const red = rows.filter((r) => BLOCKING_LEGS.has(r.leg) &&
      (r.leg === 'smoke' ? (r.exit !== 0 && r.exit !== 4) : r.exit !== 0))
    // Name the path the GATE_RED row landed in, sourced from the sidecar mark, never re-derived.
    const remedy = marks.stoppedFallback
      ? `\nThe durable stopped-ledger location could not be made ignored at the main root — add ` +
        `this line to its .gitignore to enable durable hard-stop evidence: ${STOPPED_LEDGER}\n`
      : ''
    const spent = (marks.repairRounds || 0) >= REPAIR_ROUND_CAP
    const rrPick = !spent ? pickOnce('repairRound', { repair: 'run one in-session repair round' }) : null
    if (spent) setLaneExit('review stopped, repair round spent', `${specRel}: review stopped, repair round spent`)
    // The spent round's exit is the same lane-ending choice ESCALATE makes, so the same stop answers it.
    const spentPick = spent ? pickOnce('reviewEscalate', { queue: 'queue /spec:fix' }) : null
    const spentQueueAdd = `node "$(spec-paths spec-queue)" add "${specRel}: review stopped, repair round spent" --lane fix --top --origin ${specRel} --stage review --trigger red-leg`
    const repairBody = `fix the failing leg(s) above through the review fix seat ` +
      `(the host's agentMap; ${policy(repoRoot).models.workers.model} at effort: ${policy(repoRoot).models.workers.effort}), commit, then the mark re-runs legs at this iteration; green continues to REVIEWER, ` +
      `red lands here again with the round spent\n` +
      `Then: node ${__filename} ${specPath} --mark repair-round\n`
    return `## STOPPED — a blocking leg is red; the run hard-stopped before any further step\n` +
      red.map((r) => `❌ ${r.leg} exit=${r.exit} ${JSON.stringify(r.observed)}`).join('\n') +
      `\nmanifest: ${manifestPathFor(marks.stoppedIteration || currentN)}\noutputs: ${outDirFor(marks.stoppedIteration || currentN)}\n` +
      `A GATE_RED ledger line has been appended to ${marks.stoppedLedgerPath}.\n` + remedy +
      (rrPick ? rrPick.line + '\n' + repairBody
        : pq.isDelegated(repoRoot) && !spent
        ? pq.stopLine(repoRoot, 'review', {
          kind: 'repair-round', state: 'STOPPED', spec: specRel,
          stopKey: repairStopKey(),
          questions: [{
            id: 'q1', header: 'Review stop',
            question: 'A blocking review leg went red. What should the lane do?',
            options: [
              { label: 'run one in-session repair round (Recommended)', description: 'The lane fixes the failing leg through the review fix seat and re-runs the legs; red again lands here with the round spent',
                resume: `node ${__filename} ${specPath} --mark repair-round` },
              { label: 'queue /spec:fix and stop', description: 'The review ends; the repair becomes the queue\'s top item',
                resume: 'stop', then: `node "$(spec-paths spec-queue)" add "${specRel}: review stopped, blocking leg red" --lane fix --top --origin ${specRel} --stage review --trigger red-leg` },
              { label: 'abandon the review', description: 'The review sidecar is deleted and the run ends; the GATE_RED row stays on the ledger',
                resume: 'stop', then: `delete ${sidecarDir}; the GATE_RED row stays on the ledger` },
            ],
          }],
        }, marks) + '\n'
      : spentPick
        ? `repair round spent (${REPAIR_ROUND_CAP} of ${REPAIR_ROUND_CAP})\n${spentPick.line}\n` +
          `${spentQueueAdd}\nthis review ends\n` +
          `To answer differently:\n` +
          `  abandon the review \u2014 delete ${sidecarDir}; the GATE_RED row stays on the ledger\n`
      : spent
        ? `repair round spent (${REPAIR_ROUND_CAP} of ${REPAIR_ROUND_CAP}) \u2014 two exits:\n` +
          `  queue /spec:fix \u2014 ${spentQueueAdd}\n` +
          `  abandon the review \u2014 delete ${sidecarDir}; the GATE_RED row stays on the ledger\n`
        : `Ask ONE AskUserQuestion \u2014 options, consequences in each description:\n` +
          `  run one in-session repair round (Recommended) \u2014 fix the failing leg(s) above through the review fix seat ` +
          `(the host's agentMap; ${policy(repoRoot).models.workers.model} at effort: ${policy(repoRoot).models.workers.effort}), commit, then the mark re-runs legs at this iteration; green continues to REVIEWER, ` +
          `red lands here again with the round spent\n` +
          `  queue /spec:fix and stop \u2014 node "$(spec-paths spec-queue)" add "${specRel}: review stopped, blocking leg red" --lane fix --top --origin ${specRel} --stage review --trigger red-leg; this review ends\n` +
          `  abandon the review \u2014 delete ${sidecarDir}; the GATE_RED row stays on the ledger\n` +
          `Then: node ${__filename} ${specPath} --mark repair-round\n`)
  },

  SKIPS: () => `## Step: extract skipped-test names\n` +
    `The gate leg reports skipped tests (manifest: ${manifestPath}). Extract the skip names per ` +
    `the host's declared format, write them to a scratch file — keep the runner's own file ` +
    `qualifier (\`<relpath>::<name>\`) on each line when the runner emits one (pytest's ` +
    `path::name form is the worked example); use bare names only when the runner reports no ` +
    `path — then:\n` +
    `  node ${__filename} ${specPath} --mark skips-extracted --file <path>`,

  // iteration >= 2 means a fix-delta cycle just completed: the reviewer's range is the delta file plus
  // the two prior returns, never the whole diff. The word "scope" is banned from this step's text.
  REVIEWER: () => {
    const tail = `Write its structured return ({verdict, survivors, killed, reviewerCount, tokens}) to ` +
      `a file, then:\n  node ${__filename} ${specPath} --mark reviewer-returned --file <return.json>\n` +
      `REVIEWER_FAILED is a failed run, never CLEAN — re-dispatch before marking.`
    if (currentN >= 1 && isFixDeltaManifest(currentN)) {
      const from = marks.fixDeltaFrom && marks.fixDeltaFrom[String(currentN)]
      if (from === undefined) die(`the sidecar predates the fixDeltaFrom record for fix round ${currentN} — re-run: node ${__filename} ${specPath} --mark fix-applied`)
      const deltaFile = path.join(sidecarDir, `fix-delta-${currentN}.txt`)
      const priorReviewer = path.join(sidecarDir, `reviewer-return-${from}.json`)
      const priorDisposer = path.join(sidecarDir, `disposer-return-${from}.json`)
      return `## Step: dispatch the reviewer — fix-delta pass\n` +
        `Legs are green. Dispatch ONE ${agentCall(repoRoot, 'reviewer', 'spec:reviewer')} with the spec path, ` +
        `diff base ${base}, root ${repoRoot}, and this pass's inputs:\n` +
        `  changed files: ${deltaFile}\n` +
        `  prior reviewer return: ${priorReviewer}\n` +
        `  prior disposer return: ${priorDisposer}\n` +
        `  manifest: ${manifestPath}\n  outputs: ${outDir}\n` +
        tail
    }
    return `## Step: dispatch the reviewer\n` +
      `Legs are green. Dispatch ONE ${agentCall(repoRoot, 'reviewer', 'spec:reviewer')} with the spec path, ` +
      `diff base ${base}, root ${repoRoot}, and this run's evidence:\n` +
      `  manifest: ${manifestPath}\n  outputs: ${outDir}\n` +
      tail
  },

  // Same dispositionPools(n) derivation as handleDispositions(); softs print under a separate
  // advisory heading. The mark line drops the count flags — the driver derives them.
  DISPOSITIONS: () => {
    const { survivors, softs, legs } = dispositionPools(currentN)
    if (survivors.length === 0 && legs.length === 0) {
      // Reached only if the auto-disposition did not already close out an empty hard pool.
      return `## Step: dispositions due — nothing to disposition\n` +
        `survivors (0) · leg findings (0). Then:\n` +
        `  node ${__filename} ${specPath} --mark dispositions --file <return.json>`
    }
    const softBlock = softs.length
      ? `advisory (${softs.length}, recorded, not dispositioned):\n` +
        softs.map((s) => `  [${s.severity}] ${s.file}:${s.line} — ${s.claim}`).join('\n') + '\n'
      : ''
    return `## Step: dispositions due — dispatch the disposer, apply its recommendations\n` +
      `survivors (${survivors.length}):\n` +
      survivors.map((s) => `  [${s.severity}] ${s.file}:${s.line} — ${s.claim}`).join('\n') + '\n' +
      softBlock +
      `leg findings (${legs.length} leg(s), ${legs.reduce((t, r) => t + countLegFinding(r), 0)} finding(s) — ` +
      `one leg:<name> disposition covers the leg's whole count):\n` +
      legs.map((r) => `  leg:${r.leg} exit=${r.exit} count=${countLegFinding(r)} ${JSON.stringify(r.observed)}`).join('\n') + '\n' +
      `Dispatch ONE ${agentCall(repoRoot, 'disposer', 'spec:disposer')} with the spec path, diff base ${base}, ` +
      `root ${repoRoot}, the pipeline-rules path${pipelineRulesPath ? ' (' + pipelineRulesPath + ')' : ' (none declared)'}, ` +
      `and this iteration's evidence:\n` +
      `  reviewer return: ${marks.reviewerReturnFile}\n` +
      `  manifest: ${manifestPath}\n` +
      `  outputs: ${outDir}\n` +
      (pq.isDelegated(repoRoot)
        ? `${RIDE_ALONG}\nwrite the return file as the disposer produced it, then:\n`
        : (pq.stopPolicy(repoRoot).rejectWithEvidence === 'accept'
          ? `Fix recommendations dispatch without a question; a reject whose repro names the command the ` +
            `disposer ran and its observed output is accepted at the mark (host policy ` +
            `stops.rejectWithEvidence: accept — the mark prints the 📌 line); every other waive/reject ` +
            `recommendation goes to the user (AskUserQuestion; record the answer as final with ` +
            `overriddenBy:"user" when it differs). `
          : `Fix recommendations dispatch without a question; waive/reject recommendations go to the ` +
            `user (AskUserQuestion; record the answer as final with overriddenBy:"user" when it differs). `) +
          `${RIDE_ALONG}\n` +
          `Write the return to a file, then:\n`) +
      `  node ${__filename} ${specPath} --mark dispositions --file <return.json>\n` +
      `DISPOSER_FAILED is a failed dispatch, never a disposition — re-dispatch before marking.`
  },

  FIX: () => `## Step: dispatch fix workers\n` +
    `${marks.dispositions.fixDispatched} finding(s) routed to Fix (via the host's agentMap). ` +
    `Dispatch the workers, wait for them to return, then:\n` +
    `  node ${__filename} ${specPath} --mark fix-applied\n` +
    `(re-runs legs --fix-delta on a fresh manifest and returns to REVIEWER for the fix-delta pass)\n` +
    fixSoftBlock(),

  // Both exit routes plus where the escalate row landed (or the drift note). The waive/reject exit
  // names the --file form; a return with an effective fix is refused.
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
      `  waive/reject: dispatch ${agentCall(repoRoot, 'disposer', 'spec:disposer')} against the ESCALATE pool ` +
      `with every entry waive or reject (an effective fix is refused at a spent cap) — the derived ` +
      `tally is dispositions --fix-dispatched 0 once every entry is covered, closing normally:\n` +
      `    node ${__filename} ${specPath} --mark dispositions --file <return.json>\n` +
      `  abandon: delete ${sidecarDir} (the <spec>.review sidecar and its manifests) to restart cold — ` +
      `this does NOT reset the cap: the escalate row stays on the ledger and the restarted review's ` +
      `first fix-applied is refused again until a waive/reject close clears it.\n` +
      escalatePoolBlock()
  },

  // In-place, the ledger + evidence ride the close commit. In a linked worktree they are excluded —
  // finishMerge() promotes them once the merge lands.
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
    // Printed only when classification found something retirable; nothing is deleted at close.
    const testsExpiredLine = (marks.testsExpiry && marks.testsExpiry.off === 'policy')
      ? `test expiry: off by policy\n`
      : (marks.testsExpiry && marks.testsExpiry.retired > 0)
      ? `🧹 ${marks.testsExpiry.retired} tests are retirable with this spec (${marks.testsExpiry.filesRemoved} files would empty) — nothing is deleted at close; sweep deliberately with: node "$(spec-paths test-expiry)" --root . --all-done --apply\n`
      : ''
    // the advisory block prints only when the current return carries >= 1 soft.
    const closeSofts = currentSofts()
    const softBlock = closeSofts.length
      ? `advisory — recorded as debt, none fixed here:\n` +
        closeSofts.map((s, i) => `   a${i} [${s.severity}] ${s.file}:${s.line} — ${s.claim}`).join('\n') + '\n' +
        `   A soft worth fixing is a Direct-lane commit through the host gate after merge-back, or rides the next fix round; never a change before --mark closed.\n`
      : ''
    return `## Step: close (the driver has already run the authoritative verdict and flipped status: done)\n` +
      `verdict: ${marks.dispositions.word}   runId: ${marks.closeRunId}   ` +
      `retained: .claude/spec-runs/${marks.closeRunId}.jsonl\n` +
      testsExpiredLine +
      waivedWarn +
      softBlock +
      `1. Apply the spec's Canonical Delta to ${canonicalTarget}.\n` +
      `2. Fold the deviations sidecar if one exists (recurring -> Gotchas [host]/[plugin]; one-offs ` +
      `-> the spec's Rationale); delete the sidecar.\n` +
      deviationsEnumBlock() +
      gotchasCapLine() +
      `3. Hygiene listing — everything not marked EXPECTED below is a stray to explain or clean:\n` +
      `   EXPECTED   ${sidecarRel}/            (never committed — deleted at DONE)\n` +
      `   EXPECTED   .claude/spec-runs/*.jsonl (retained review evidence)\n` +
      `   EXPECTED   .claude/spec-runs.jsonl   (the run ledger)\n` +
      acPinDriftLine() +
      closeCommitLine +
      `Then: node ${__filename} ${specPath} --mark closed`
  },

  MERGE: () => {
    const source = sourceBranchFor()
    if (!branchExists(mainRoot, source)) {
      // Review ran on the originating branch — nothing to merge; conclude straight into DONE.
      marks.mergeConcluded = true
      saveSidecar()
      // The merge-skipped arm never prints MERGE, so the re-stamp note rides the DONE note.
      printDoneNow(restampLine + 'review ran on the originating branch — MERGE skipped, nothing to merge.')
    }
    if (pq.isDelegated(repoRoot)) {
      return `## MERGE_READY \u2014 ${specRel} is closed on ${source}; the parent session runs the merge from ${mainRoot}`
    }
    const target = runChild('git', ['-C', mainRoot, 'symbolic-ref', '--short', 'HEAD'],
      { encoding: 'utf8' }, 'git symbolic-ref').stdout.trim()
    const inspect = runChild('bash',
      [mergeBackBin, 'inspect', '--root', mainRoot, '--target', target, '--source', source],
      { encoding: 'utf8' }, 'merge-back.sh inspect')
    const risk = prototypeAtRisk(target)
    let protoText = ''
    const pPick = risk && risk.n > 0 ? pickOnce('prototypeClose', { delete: 'Delete it', keep: 'Keep it for now' }) : null
    if (pPick) {
      protoText = `prototype ${risk.stem}: ${risk.n} unmerged commits on proto/${risk.stem}\n${pPick.line}\n` +
        (pPick.value === 'delete'
          ? `its contract, pictures and tests stay under design/prototypes/${risk.stem}/; restore the branch after the merge with: git branch proto/${risk.stem} ${risk.tip}\n` +
            `To keep it instead: pass --prototype keep on the mark below\n\n`
          : `To delete it instead: pass --prototype delete on the mark below\n\n`)
    } else if (risk) {
      protoText = `prototype ${risk.stem}: ${risk.n} unmerged commits on proto/${risk.stem}` +
        (risk.n === 0 ? ' — the close proceeds with the merge (notify only)\n\n'
          : `\n\nAsk ONE AskUserQuestion before the mark — question "The prototype has ${risk.n} commits that were never merged. Delete the prototype now?"; ` +
            'options: "Delete it (Recommended)" — The worktree, branch and database go; its contract, pictures and tests stay under the design folder; ' +
            '"Keep it for now" — The worktree and branch stay; close it later by hand with the printed command. ' +
            'Pass the answer as --prototype delete|keep on the mark below (the mark refuses without it).\n\n')
    }
    const named = policy(repoRoot).mergeStrategy
    const inspectText = named === 'derived'
      ? (inspect.stdout + inspect.stderr).trim()
      : (inspect.stdout + inspect.stderr).trim().split('\n').filter((l) => !l.startsWith('RECOMMEND:')).join('\n')
    const deriveText = named === 'derived'
      ? `Derive the strategy — take RECOMMEND above (merge-commit when it is absent or the ` +
        `history contradicts it: it is the cheapest to reverse). Print one line ` +
        `\`📌 Auto-picked <strategy> — <RECOMMEND's reason> (veto anytime)\` and do NOT ask: a ` +
        `merge strategy has no product consequence and its delivery consequence is in the history ` +
        `printed above. Then:\n`
      : `📌 Auto-picked ${named} — host policy (veto anytime)\nDo NOT ask. Then:\n`
    return `## Step: merge strategy\n` + inspectText + '\n\n' +
      protoText +
      restampLine +
      waivedWarn +
      deriveText +
      `  node ${__filename} ${specPath} --mark merge-strategy ${named === 'derived' ? '<merge-commit|ff-only|squash|rebase-ff>' : named}` +
      (risk && risk.n > 0 ? ' --prototype ' + (pPick ? pPick.value : '<delete|keep>') : '') + `\n` +
      `Relocate first if needed: ExitWorktree(action="keep") if this session entered the worktree, ` +
      `else \`cd ${mainRoot}\` in the main session — the mark is refused while the driver's ` +
      `inherited CWD sits inside the build worktree.`
  },

  CONFLICTS: () => `## CONFLICTS — resolve then mark conflicts-resolved (see prior output)`,
}

writeOut(1, markPreamble + `[spec-review-driver] state: ${state}  spec: ${specPath}\n` +
  `(re-run this driver after completing the step; it verifies artifacts and prints the next one)\n\n` +
  STEPS[state]() + '\n')
process.exit(0)
