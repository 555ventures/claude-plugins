#!/usr/bin/env node
'use strict'
// replay.js --due
//         | --select
//         | --setup --commit <sha> (--spec <path>|--dir <path>) [--overlay <closeSha>] [--subject <text>]
//         | --apply --dir <path> --patch <file> --patch-out <file> --class <id> [--subject <text>]
//         | --score --workflow <file> --patch <file>
//         | --record --spec <path> --review-run-id <id> --legs green|red:<leg>|none
//                     --outcome caught|missed|leg-caught|unresolved|setup-failed
//                     [--class <id>] [--patch <file>] [--workflow <file>] [--tokens N]
//                     [--via driver|manual]
//         | --stats
//         | --teardown --dir <path>
//         [--root <path>]  # repo root for every ledger/git read+append; defaults to cwd
//
// specs/20260819/02-mutation-replay.md: this script owns every mechanical step of the replay
// harness (dueness, priority selection, scratch-worktree setup/mutation-apply/teardown,
// deterministic scoring, ledger recording, catch-rate stats) as flag modes, so /spec:replay's
// session supplies only the two judgment steps this file deliberately leaves alone — authoring
// the mutation patch from a corpus recipe, and adjudicating an `ambiguous` score. review-legs.js
// is the sole leg deriver; this script never re-implements it (D6) — the orchestrating session
// runs legs itself and passes the verdict in via --record --legs.
//
// The harness must never leak its own presence into the material the blind reviewer reads.
// --setup's scratch marker lives in the worktree's own private git dir (`git -C <dir> rev-parse
// --git-dir`, under `.git/worktrees/<name>` for a linked worktree, deleted by `git worktree
// remove`) — never the working tree, and never `info/exclude` (that path is NOT per-worktree: it
// resolves into the shared common git dir's `.git/info/exclude`); `git add -A` cannot sweep a
// file that was never in the working tree, and `git status` cannot show it. --apply's commit
// subject is caller-supplied via --subject, which structurally rejects a `replay:`-style subject
// or any value containing the class id, so neither the harness nor the defect class is readable
// via a sanctioned `git log`. --select resolves the close commit's PARENT plus that revision's
// own diff_base/build_base, so the reviewer reads review.md Phase 0's real base-to-HEAD diff,
// never a needle-only diff. --score requires verdict:"CLEAN" plus a survivors array before
// scoring anything, so a crashed or malformed reviewer return is never scored `missed`. What this
// harness must never do: sign its own work into the tree under review — no marker, message, or
// diff shape may tell the reviewer it is being tested.
//
// specs/20260819/03-replay-first-run-fixes.md: (D1) --score takes --patch and scores off EVERY
// hunk in the mutation's own patch — never a single self-reported --file/--line point — catching
// multi-file mutations and misplaced-but-real findings a point score would miss. (D3/D4) a
// dismissed `ambiguous` adjudication and a failed scratch-worktree `setupCommand` both record
// `unresolved`/`setup-failed` so the run is never silent, and (D5) neither resets the
// --due/--select measurement window — only a real `caught`/`missed`/`leg-caught` row does, so a
// broken setup gets retried at the very next review instead of leaving the harness permanently
// unmeasured. (D6) --stats carries the two extra buckets; catch-rate still excludes anything
// that isn't caught/missed. (D7) `files` derives from --patch and gains a validation matrix per
// outcome. (D9) host git config (`diff.noprefix`, `diff.mnemonicPrefix`, `core.quotePath`) can
// make a bare `git diff` produce a patch D1's parser reads as zero hunks — --apply is the
// harness's ONLY patch emitter: it re-emits the mutation diff itself under pinned `-c` flags to a
// REQUIRED --patch-out, and refuses a --patch-out resolving inside --dir (exit 3) before applying
// anything, since writing the emission into the tree under review would itself be a blindness
// leak. (D10) --apply applies with `git apply --index` and commits the index only, never `git add
// -A` — D4's setup-gate runs `setupCommand` BEFORE --apply, and any lockfile/generated-code churn
// it leaves in the working tree must never ride into the diff the blind reviewer reads. (D11)
// --score normalizes a survivor's path (stripping a leading `./`, matching an absolute path at a
// path-segment boundary) before comparing it against the patch, since the reviewer contract never
// pins a path form. What this harness must still never do: sign its own work into the tree under
// review, or let a run with no truth value enter the catch-rate denominator.
//
// specs/20260823/05-replay-unattended-hardening.md: (D1/D2) --setup accepts a --dir inside
// <root>/.claude/worktrees/ specifically (every other in-repo path keeps refusing, exit 3) —
// that directory is already gitignored precedent for agent-editable worktrees (build worktrees
// live there daily); when a host's own ignore rules don't cover it, --setup self-provisions the
// line into the shared common git dir's info/exclude (never a host's tracked .gitignore) before
// creating anything, skipping the append when the line is already present. (D4) --select reads
// frontmatter at the CLOSE commit (not its parent), tries diff_base before build_base, and emits
// only a candidate that `git rev-parse --verify` resolves to a full sha which `git merge-base
// --is-ancestor` confirms is an ancestor of the close commit's parent and not equal to it —
// nothing qualifying is a named exit-4 refusal (stale-base cause + the stamped-at-close remedy,
// spec-review-driver.js's diff_base stamp) rather than a silently wrong diff base.
//
// specs/20260823/09-replay-baseline-attribution.md: ~1 in 4 selectable CLEAN rows closes with a
// leg legitimately red for pre-existing, sanctioned reasons unrelated to the planted defect, so
// (D1) --select derives a baseline straight from the selected review row's OWN `legs` array (zero
// extra leg runs) and appends `baselineRed=<comma-list>|none` and `baselineLegs=<comma-list>`
// after the five existing tokens — `unknown` for both when the row carries no (or an empty) legs
// array. Red follows review-legs.js's own definition (`exit !== 0`, except `smoke` at exit 4,
// which is inert). (D2/D3) --record's --legs grammar carries `baseline-red:<leg>[,<leg>]`, valid
// for caught/missed/unresolved alongside `green` — the row's `legs` field states the literal
// truth instead of collapsing to `green`. `unresolved` is two-armed on the `--legs` shape:
// `green`/`baseline-red:*` requires --patch + --workflow (the reviewer ran, a Phase 3 dismissal);
// `red:<leg>` requires --patch and REFUSES --workflow (the reviewer never ran, a step-7
// dismissal) — riding a --workflow value there would fabricate reviewer evidence that was never
// produced.
//
// specs/20260831/01-replay-range-materialization.md: a `diff.dirty:true` review row's judged
// range is completed by the close commit that follows it (range-identity spec 20260824/06
// D3/D7) — fix-worker edits uncommitted at pass time ride that commit — so a baseline standing at
// the close commit's PARENT sits below the judged range. (D1-D3) --setup takes --overlay
// <closeSha>: after standing the worktree up at --commit, it diffs <commit>..<overlay> with
// --name-status --no-renames, drops every row whose path opens with a D2 meta prefix (specs/,
// .claude/, docs/canonical/ — the three surfaces a close commit uses to record the review's own
// outcome), and materializes the rest (A/M via git checkout, D via git rm) as one commit —
// uniformly, no diff.dirty branch, so a meta-only close degenerates to zero materialized rows and
// no commit. (D4) --overlay must resolve to a strict descendant of --commit (git merge-base
// --is-ancestor, equal shas refused too) or the whole call exits 4 before any worktree is
// created, naming the --select remedy. (D5) --setup's optional --subject (default "build:
// follow-up") is refused with exit 2 when it opens with "replay" (case-insensitive) — the
// class-id half of --apply's F2 refusal does not apply here, since no --class exists at setup
// time. (D7) --setup without --overlay is unaffected; the overlay is additive.
// specs/20260903/01-owed-query-and-row-handoff.md: (D8) --record gains --via driver|manual —
// exactly "driver" stamps via:"driver" on the row and the retained artifact (the review driver's
// REPLAY step is the only caller that knows a run was driver-handed, so it prints the flag in
// the command the session copies); absent or any other value stamps the honest default
// "manual", mirroring build/review's own --via rule so no pre-change --record caller reddens.
// stdout becomes `recorded runId=<rp_…> via=<driver|manual>`. (D9) --stats gains one
// `by-via driver=N manual=N unknown=N` line (unknown = no via field at all) after `catch-rate`
// and before `per-class:`, so the manual-retry-path promise (brief 23 scope 3) is a ledger count
// invocable cold, not a jq exercise.
//
// What this deliberately does NOT do: derive review-legs verdicts, touch the main working tree
// (--setup/--apply/--teardown only ever act on a --dir the caller supplies, or one --setup derives
// itself from --spec (D1, specs/20260826/01) — --setup refuses a caller --dir that resolves inside
// the repo root outside <root>/.claude/worktrees/, and refuses one whose basename announces the
// harness (D2); --teardown refuses a --dir whose private git dir carries no scratch-worktree
// marker — the marker guard means teardown can only ever delete a directory THIS harness created),
// write anything into a worktree's working tree (the marker lives in the worktree's private git
// dir, never in the tree under review), retry/poll anything, or run an automated ambiguity judge
// (an `unresolved` row is retained evidence for a human, never scored).
//
// Root resolution: every ledger/git-reading mode (--select/--setup/--teardown use git; --due/
// --record/--stats read the ledger) resolves against `--root <path>`, defaulting to
// `process.cwd()` when the flag is absent (spec-status.js's cwd-default shape). Pass --root
// whenever the caller's shell may not be standing in the repo whose ledger is being read or
// appended — notably any step taken while a scratch worktree is live, since an inherited CWD
// inside that worktree would otherwise write the row into a tree teardown is about to delete. --apply and --score take their target as
// explicit flags (--dir/--patch/--patch-out, --workflow/--patch) and never consult cwd at all.
//
// Exit codes: 0 = mode succeeded (--due: due; --select: printed a selection; --score: printed a
// score; --pick-class: printed a selection) · 1 = --due not due, or --select found no eligible
// CLEAN review row in the window ·
// 2 = usage error / missing required flag / unreadable or unparseable input / --apply --subject
// names the harness, the defect class, or the mutation class value / --apply missing --patch-out /
// --apply/--record --class names a value spec/scripts/lib/replay-corpus.js's parseCorpus(corpusPath())
// does not carry (specs/20260901/08-corpus-derivation-and-kill-match.md D2 — stderr names the corpus
// path and the comma-joined valid ids in corpus order; nothing is committed/appended) / --pick-class
// finds the corpus parses to zero classes (D3), or .claude/spec.config.json's replay.inapplicableClasses
// is malformed, names an id the corpus does not carry, or rules out every class (direct fix) /
// --setup --subject opens with "replay" (case-insensitive, D5 — the overlay commit message must be
// indistinguishable from a real build commit) /
// --score --workflow is not a CLEAN verdict with a survivors array / --score --patch parses to zero
// hunks / any --record D7 validation-matrix refusal (an --outcome outside the five-value enum, a
// malformed --legs — including a near-miss on the widened `baseline-red:<leg>[,<leg>]` shape (a bare
// `baseline-red` with no colon, or `baseline-red:` with an empty leg) — a missing --patch/--workflow
// or a legs value outside green|baseline-red:<leg> for caught|missed, unresolved's green/baseline-
// red:<leg> arm missing --patch or --workflow, unresolved's red:<leg> arm missing --patch or
// refusing a --workflow that rides along (a step-7 dismissal never ran the reviewer), a missing
// --patch or a non-`red:`-shaped --legs for leg-caught, or setup-failed riding with
// --class/--patch/--workflow)
// · 3 = safety refusal (--setup --dir's basename matches /^replay/i — specs/20260826/01 D2, refused
// before any filesystem or git side effect, in-repo or out-of-repo alike; --setup --dir resolves
// inside the repo root but NOT inside <root>/.claude/worktrees/ — specs/20260823/05 D1 narrows this
// population, the worktrees/ arm itself now succeeds; --apply --patch-out resolves inside --dir,
// refused before the patch is applied; --teardown --dir does not exist, is not a linked worktree, or
// its private git dir carries no scratch-worktree marker — the retired replay-worktree name grants
// nothing, specs/20260826/01 D3) · 4 = a git operation (worktree add/remove, apply, commit, log,
// git-dir resolution, info/exclude provisioning, or --apply's canonical --patch-out re-emission)
// failed, --setup's --dir resolves to a git-dir with no `worktrees` path segment (not a linked
// worktree), --setup's --spec-derived path fails because `merge-back.sh branch-for` errors or does
// not print a `spec/<stem>` line (specs/20260826/01 D1), --select's target spec (read at the
// CLOSE commit, specs/20260823/05 D4) carries no diff_base/build_base candidate that resolves to a
// validated ancestor of the close commit's parent distinct from it — widened by D4 to also cover a
// stale (moving-ref) candidate, not just an absent one — or --setup's --overlay does not resolve to
// a strict descendant of --commit (specs/20260831/01 D4: an unrelated sha, an ancestor, or an equal
// sha), refused before any worktree is created, naming the --select remedy.
//
// specs/20260826/01-replay-scratch-path-blindness.md: a value whose correctness is load-bearing
// for a measurement's validity must be derived by a script, never asserted in prose a session
// copies (core § Incident Policy) — so the scratch worktree's root path is never a hand-typed or
// paraphrased string. D1 gives --setup ownership of the path, deriving a build-shaped name via
// `merge-back.sh branch-for` (the sole owner of that stem rule) plus a random suffix —
// build-shaped because a bland or random name is itself an anomaly next to the `spec-<stem>`
// build worktrees that share its directory (replay.md's own "vocabulary is not the leak,
// provenance is" argument for the commit subject applies equally to the path). D2 adds the
// structural refusal a caller-supplied --dir needs so a hand-typed path can never reintroduce the
// leak `--apply --subject` already closed for commit subjects.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync, spawnSync } = require('child_process')
const { readLedgerRows } = require('./lib/observation')
// D1 (specs/20260901/08-corpus-derivation-and-kill-match.md): the one
// parser for spec/doctrine/replay-corpus.md's class-heading grammar — --apply/--record's --class
// validation (D2) and --pick-class's selection (D3) both key off it, never a second regex sweep.
const { corpusPath, parseCorpus } = require('./lib/replay-corpus')
const { configPath, configExists, readConfigStrict, CONFIG_RELPATH } = require('./lib/host-config')
// D2 (specs/20260823/04-review-close-hardening.md, rv_6825fa48c98d): the local frontmatter() kv
// loop this replaced stripped a trailing comment at the FIRST "#" regardless of what preceded it,
// corrupting an unspaced value like `build_base: <sha>#frag` — the sole shared derivation strips
// only a whitespace-preceded "#", per YAML unquoted-scalar semantics.
const { fmMap } = require('./lib/frontmatter')

function usage() {
  console.error('usage: replay.js [--root <path>] --due | --select | --setup --commit <sha> (--spec <path>|--dir <path>) ' +
    '[--overlay <closeSha>] [--subject <text>] | ' +
    '--apply --dir <path> --patch <file> --patch-out <file> --class <id> [--subject <text>] | ' +
    '--score --workflow <file> --patch <file> | ' +
    '--record --spec <path> --review-run-id <id> --legs green|red:<leg>|baseline-red:<leg>[,<leg>]|none ' +
    '--outcome caught|missed|leg-caught|unresolved|setup-failed [--class <id>] [--patch <file>] ' +
    '[--workflow <file>] [--tokens N] [--via driver|manual] | --stats | --pick-class [--root <path>] | ' +
    '--teardown --dir <path>')
}

const MODE_FLAGS = {
  '--due': 'due', '--select': 'select', '--setup': 'setup', '--apply': 'apply',
  '--score': 'score', '--record': 'record', '--stats': 'stats', '--teardown': 'teardown',
  '--pick-class': 'pickClass',
}

let mode = null
let commit = null, dir = null, patch = null, cls = null, workflowPath = null, patchOut = null
let specArg = null, reviewRunId = null, legs = null, outcome = null, tokensArg = null, subjectArg = null
let rootArg = null, overlayArg = null, viaArg = null

const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (MODE_FLAGS[a]) {
    if (mode) { usage(); process.exit(2) }
    mode = MODE_FLAGS[a]
  }
  else if (a === '--commit') commit = argv[++i]
  else if (a === '--dir') dir = argv[++i]
  else if (a === '--patch') patch = argv[++i]
  else if (a === '--patch-out') patchOut = argv[++i]
  else if (a === '--class') cls = argv[++i]
  else if (a === '--workflow') workflowPath = argv[++i]
  else if (a === '--spec') specArg = argv[++i]
  else if (a === '--review-run-id') reviewRunId = argv[++i]
  else if (a === '--legs') legs = argv[++i]
  else if (a === '--outcome') outcome = argv[++i]
  else if (a === '--tokens') tokensArg = argv[++i]
  else if (a === '--subject') subjectArg = argv[++i]
  else if (a === '--root') rootArg = argv[++i]
  else if (a === '--overlay') overlayArg = argv[++i]
  else if (a === '--via') viaArg = argv[++i]
  else { usage(); process.exit(2) }
}
if (!mode) { usage(); process.exit(2) }

// ---- Root resolution: named, never inferred. The cwd default is a convenience for an operator -----
// ---- standing in the repo; every step run from a scratch worktree passes --root explicitly, so ----
// ---- a relocated shell can never silently redirect a ledger append into a directory that is -------
// ---- about to be torn down (specs/20260827/01). ----------------------------------------------------
const root = (() => {
  if (rootArg === null) return process.cwd()
  const resolved = path.resolve(rootArg)
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    console.error('replay.js: --root ' + rootArg + ' is not an existing directory')
    process.exit(2)
  }
  return resolved
})()

// ---- D5: a "measurement" replay row is one whose outcome actually answers caught/missed/scores --
// ---- the reviewer against a real leg (leg-caught) — unresolved/setup-failed never reset the -----
// ---- --due/--select window, since neither produced a truth value. --------------------------------

const MEASUREMENT_OUTCOMES = new Set(['caught', 'missed', 'leg-caught'])
function isMeasurementReplay(r) {
  return r.stage === 'replay' && MEASUREMENT_OUTCOMES.has(r.outcome)
}

// ---- D2: --apply/--record's --class refusal — a class value absent from the corpus keys ---------
// ---- --stats' per-class catch-rate; one typo forks a class's history into two rows nobody joins. -

function readCorpusClasses() {
  return parseCorpus(fs.readFileSync(corpusPath(), 'utf8'))
}

function validateClass(value) {
  const ids = readCorpusClasses().map((c) => c.id)
  if (!ids.includes(value)) {
    console.error(`replay.js: --class '${value}' is not a class in ${corpusPath()} — valid ids ` +
      `(corpus order): ${ids.join(', ')}`)
    process.exit(2)
  }
}

// ---- --due: reviewsSince = count of stage:"review" rows in READ order after the last MEASUREMENT -
// ---- stage:"replay" row (readLedgerRows already merges live+archives in that order) --------------

function cmdDue() {
  const rows = readLedgerRows(root)
  let lastReplayIdx = -1
  rows.forEach((r, i) => { if (isMeasurementReplay(r)) lastReplayIdx = i })
  const reviewsSince = rows.filter((r, i) => i > lastReplayIdx && r.stage === 'review').length
  if (reviewsSince >= 5) {
    console.log(`due reviewsSince=${reviewsSince}`)
    process.exit(0)
  }
  console.log(`not due reviewsSince=${reviewsSince}`)
  process.exit(1)
}

// ---- --select: among CLEAN review rows with a runId in the same D5 window as --due, prefer ------
// ---- tier:"critical", tie -> latest (read-order); target commit = the close commit for the ------
// ---- selected spec's OWN path. ---------------------------------------------------------------------

// D1 (specs/20260823/09): review-legs.js's own red definition — exit !== 0, except a `smoke` leg
// at exit 4, which is sanctioned inert-green, never red. Mirrors spec-review-driver.js's
// isRedBlocking(), a separate derivation by construction (that one is scoped to BLOCKING_LEGS for
// the hard-stop check; this one reads every leg the row recorded, for attribution).
function isBaselineLegRed(leg) {
  return leg.leg === 'smoke' ? (leg.exit !== 0 && leg.exit !== 4) : leg.exit !== 0
}

// D1: derive {baselineRed, baselineLegs} straight from the selected review row's OWN `legs` array
// — zero extra leg runs. Absent or empty array -> 'unknown' for both (no baseline was ever
// recorded). Otherwise baselineLegs lists every leg name in the array's own order verbatim, and
// baselineRed lists the red ones (comma-joined) or 'none' when none are red.
function deriveBaseline(row) {
  if (!Array.isArray(row.legs) || row.legs.length === 0) return { baselineRed: 'unknown', baselineLegs: 'unknown' }
  const baselineLegs = row.legs.map((l) => l.leg).join(',')
  const redNames = row.legs.filter(isBaselineLegRed).map((l) => l.leg)
  const baselineRed = redNames.length ? redNames.join(',') : 'none'
  return { baselineRed, baselineLegs }
}

function cmdSelect() {
  const rows = readLedgerRows(root)
  let lastReplayIdx = -1
  rows.forEach((r, i) => { if (isMeasurementReplay(r)) lastReplayIdx = i })
  const candidates = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r, i }) => i > lastReplayIdx && r.stage === 'review' && r.verdict === 'CLEAN' && r.runId)
  if (!candidates.length) {
    console.error('replay.js: no eligible CLEAN review row with a runId found in the window since the ' +
      'last measurement replay row — run /spec:review first, or check replay.js --due to confirm one is expected')
    process.exit(1)
  }
  let best = null
  for (const c of candidates) {
    if (!best) { best = c; continue }
    const cCritical = c.r.tier === 'critical'
    const bestCritical = best.r.tier === 'critical'
    if (cCritical && !bestCritical) { best = c; continue }
    if (!cCritical && bestCritical) continue
    if (c.i >= best.i) best = c // same tier-class: later (read-order) wins the tie
  }
  const specPath = best.r.spec
  let commitSha
  try {
    commitSha = execFileSync('git', ['log', '-1', '--format=%H', '--', specPath],
      { cwd: root, encoding: 'utf8' }).trim()
  } catch (e) {
    console.error(`replay.js: git log failed for ${specPath} in ${root} — confirm ${root} is a git repo: ${e.message}`)
    process.exit(4)
  }
  if (!commitSha) {
    console.error(`replay.js: no commit touches ${specPath} in ${root} — confirm the spec path is correct ` +
      'and was actually committed')
    process.exit(4)
  }
  // F3 (specs/20260831/01 D1-D7): the worktree must stand up at the
  // CLOSE commit's PARENT, on the spec's pre-review base — not the close commit itself, which
  // reads status: done and would leak "already reviewed" into the diff the blind reviewer is
  // handed. --select prints `parent=` unchanged (D3: --select is deliberately untouched) — the
  // range's true upper bound (the close commit itself, per range-identity spec 20260824/06 D3/D7)
  // is materialized separately by --setup --overlay, which replay.md now always passes alongside
  // this same `parent=`/`commit=` pair.
  let parent
  try {
    parent = execFileSync('git', ['rev-parse', `${commitSha}^`], { cwd: root, encoding: 'utf8' }).trim()
  } catch (e) {
    console.error(`replay.js: git rev-parse ${commitSha}^ failed in ${root} — confirm ${commitSha} has a ` +
      `parent commit: ${e.message}`)
    process.exit(4)
  }
  // D4 (specs/20260823/05): read frontmatter at the CLOSE commit itself, never its parent — the
  // parent predates spec-review-driver.js's own diff_base stamp (written at the implementing ->
  // done flip), so reading the parent could never see a stamped value.
  let specAtClose
  try {
    specAtClose = execFileSync('git', ['show', `${commitSha}:${specPath}`], { cwd: root, encoding: 'utf8' })
  } catch (e) {
    console.error(`replay.js: git show ${commitSha}:${specPath} failed in ${root} — confirm the spec exists ` +
      `at its own close commit: ${e.message}`)
    process.exit(4)
  }
  const fm = fmMap(specAtClose)
  // D4: try diff_base BEFORE build_base (the reverse of the old preference) — diff_base is now
  // the durable pin spec-review-driver.js stamps at close, while build_base is typically the
  // moving ref `main`, stale the instant the review's own merge lands. Each candidate must
  // resolve to a full sha via `git rev-parse --verify` AND validate as an ancestor of `parent`
  // (and not equal to it) via `git merge-base --is-ancestor` before it is trusted — an
  // unresolvable or non-ancestor candidate (a merged-away `main`) is skipped, never emitted.
  const tried = []
  let diffBase = null
  for (const key of ['diff_base', 'build_base']) {
    const val = fm[key] && fm[key].trim()
    if (!val) continue
    tried.push(`${key}=${val}`)
    const verify = spawnSync('git', ['rev-parse', '--verify', `${val}^{commit}`], { cwd: root, encoding: 'utf8' })
    if (verify.status !== 0) continue
    const sha = verify.stdout.trim()
    if (!sha || sha === parent) continue
    const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', sha, parent], { cwd: root })
    if (ancestor.status !== 0) continue
    diffBase = sha
    break
  }
  if (!diffBase) {
    console.error(`replay.js: no base candidate for ${specPath} at ${commitSha} (tried: ` +
      `${tried.length ? tried.join(', ') : 'none present'}) resolves to a validated ancestor of ${parent} ` +
      'distinct from it — a moving ref like build_base: main no longer names the true pre-image once the ' +
      "review's merge lands into it; reviews closed from this version on stamp diff_base at close " +
      '(spec-review-driver.js), so the next review\'s replay selects cleanly')
    process.exit(4)
  }
  const { baselineRed, baselineLegs } = deriveBaseline(best.r)
  console.log(`spec=${specPath} reviewRunId=${best.r.runId} commit=${commitSha} parent=${parent} ` +
    `diffBase=${diffBase} baselineRed=${baselineRed} baselineLegs=${baselineLegs}`)
  process.exit(0)
}

// ---- D2: is `resolvedDir` (already inside the repo root) covered by the repo's ignore rules -----
// ---- (.gitignore + info/exclude alike)? If not, append the fixed literal ".claude/worktrees/" ----
// ---- to the shared common git dir's info/exclude — never a host's own tracked .gitignore, and ----
// ---- never a duplicate of a line already present. -------------------------------------------------

function provisionWorktreesIgnore(resolvedRoot, resolvedDir) {
  const already = spawnSync('git', ['check-ignore', '-q', resolvedDir], { cwd: resolvedRoot }).status === 0
  if (already) return
  let gitCommonDirRaw
  try {
    gitCommonDirRaw = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: resolvedRoot, encoding: 'utf8' }).trim()
  } catch (e) {
    console.error(`replay.js: git rev-parse --git-common-dir failed in ${resolvedRoot} — confirm ${resolvedRoot} ` +
      `is a git repo: ${e.message}`)
    process.exit(4)
  }
  const gitCommonDirAbs = path.isAbsolute(gitCommonDirRaw) ? gitCommonDirRaw : path.resolve(resolvedRoot, gitCommonDirRaw)
  const excludePath = path.join(gitCommonDirAbs, 'info', 'exclude')
  let existing = ''
  try { existing = fs.readFileSync(excludePath, 'utf8') } catch { /* absent info/exclude is a valid start state */ }
  if (existing.split('\n').some((l) => l.trim() === '.claude/worktrees/')) return
  try {
    fs.mkdirSync(path.dirname(excludePath), { recursive: true })
    const sep = existing.length && !existing.endsWith('\n') ? '\n' : ''
    fs.appendFileSync(excludePath, sep + '.claude/worktrees/\n')
  } catch (e) {
    console.error(`replay.js: failed to append .claude/worktrees/ to ${excludePath} — without it the ` +
      `worktree at ${resolvedDir} would dirty git status in the main root: ${e.message}`)
    process.exit(4)
  }
}

// ---- D1: {dir} for a derived setup — build-shaped, spec-derived, random-suffixed. -----------------
// ---- branch-for is the SOLE owner of the stem rule (merge-back.sh header); never re-derive it here.

function deriveScratchDir(resolvedRoot, specPath) {
  let branch
  try {
    branch = execFileSync('bash', [path.join(__dirname, 'merge-back.sh'), 'branch-for', specPath],
      { encoding: 'utf8' }).trim()
  } catch (e) {
    console.error(`replay.js: merge-back.sh branch-for ${specPath} failed — branch-for is the sole owner of ` +
      `the build-worktree stem rule and must succeed before a scratch dir can be derived: ${e.message}`)
    process.exit(4)
  }
  if (!/^spec\//.test(branch)) {
    console.error(`replay.js: merge-back.sh branch-for ${specPath} printed '${branch}', not a 'spec/<stem>' ` +
      'line — refusing to derive a scratch dir from output the stem-rule owner did not actually produce')
    process.exit(4)
  }
  const name = branch.replace(/\//g, '-') // "spec-<stem>"
  const suffix = crypto.randomBytes(3).toString('hex') // 6 lowercase hex
  return path.join(resolvedRoot, '.claude', 'worktrees', `${name}-${suffix}`)
}

// ---- D2 (specs/20260831/01): the meta prefix set — the three surfaces a close commit uses to -----
// ---- record the review's own outcome (status flip + Decision amendments + retained sidecar; ------
// ---- ledger + evidence + rules; canonical delta citing the spec). Overlay rows under any of these -
// ---- are never materialized, keeping the blindness invariant F3 bought — except the one carve-out -
// ---- below. ----------------------------------------------------------------------------------------

const OVERLAY_META_PREFIXES = ['specs/', '.claude/', 'docs/canonical/']

// ---- Direct fix (core § Incident Policy): `.claude/agent-memory/` is a build surface, not a --------
// ---- review record — worker notes land there during the build, and a host whose gate sweeps -------
// ---- those notes (this repo's AC-12 literal sweep) reddened the scratch gate on every replay -----
// ---- because the overlay withheld the note edits the close commit carried. Carve it out of the ---
// ---- `.claude/` meta prefix; the ledger, evidence, worktrees and rules stay withheld. --------------

const OVERLAY_META_EXEMPT = ['.claude/agent-memory/']

function isOverlayMetaPath(p) {
  if (OVERLAY_META_EXEMPT.some((e) => p.startsWith(e))) return false
  return OVERLAY_META_PREFIXES.some((m) => p.startsWith(m))
}

// ---- D1/D3 (specs/20260831/01): materialize <commit>..<overlay>'s non-meta delta into `dir`, ------
// ---- uniformly (no diff.dirty branch) — `git diff --name-status --no-renames` under --no-renames --
// ---- only ever prints A/M/D; A/M rows checkout the overlay side, D rows `git rm`. Zero materialized
// ---- rows means the close commit was meta-only (the degenerate clean-close case) — no commit is ----
// ---- created and HEAD stays at --commit. Returns the count of materialized rows. --------------------

function materializeOverlay(dirPath, commitSha, overlaySha, subject) {
  let diffOut
  try {
    diffOut = execFileSync('git', ['diff', '--name-status', '--no-renames', commitSha, overlaySha],
      { cwd: dirPath, encoding: 'utf8' })
  } catch (e) {
    console.error(`replay.js: git diff --name-status --no-renames ${commitSha} ${overlaySha} failed in ` +
      `${dirPath} — confirm both commits exist in the worktree: ${e.message}`)
    process.exit(4)
  }
  const rows = diffOut.split('\n').filter(Boolean).map((line) => {
    const idx = line.indexOf('\t')
    return { status: line.slice(0, idx), path: line.slice(idx + 1) }
  })
  const materializable = rows.filter((r) => !isOverlayMetaPath(r.path))
  if (materializable.length === 0) return 0
  for (const row of materializable) {
    try {
      if (row.status === 'D') {
        execFileSync('git', ['rm', '-q', '--', row.path], { cwd: dirPath, stdio: 'pipe' })
      } else {
        execFileSync('git', ['checkout', overlaySha, '--', row.path], { cwd: dirPath, stdio: 'pipe' })
      }
    } catch (e) {
      console.error(`replay.js: overlay materialization failed for ${row.status} ${row.path} in ${dirPath} ` +
        `— inspect with git -C ${dirPath} status: ${e.message}`)
      process.exit(4)
    }
  }
  try {
    execFileSync('git', ['commit', '-q', '-m', subject], { cwd: dirPath, stdio: 'pipe' })
  } catch (e) {
    console.error(`replay.js: overlay commit failed in ${dirPath} after materializing ` +
      `${materializable.length} row(s) — inspect with git -C ${dirPath} status: ${e.message}`)
    process.exit(4)
  }
  return materializable.length
}

// ---- --setup: derives {dir} from --spec via deriveScratchDir when --dir is omitted (D1); refuses --
// ---- a caller-supplied --dir whose basename announces the harness (D2, exit 3, before any side -----
// ---- effect); otherwise refuses a --dir that resolves inside the repo root UNLESS it resolves ------
// ---- inside <root>/.claude/worktrees/ (specs/20260823/05) — exit 3, creates nothing for every other-
// ---- in-repo path; otherwise self-provisions the ignore line then `git worktree add --detach` and --
// ---- drops a scratch-worktree marker into the new worktree's own private git dir — never into its --
// ---- working tree. Optional --overlay <closeSha> (specs/20260831/01 D1-D5) then materializes the ---
// ---- judged range's true upper bound: validated as a strict descendant of --commit (D4, exit 4 -----
// ---- before any side effect), it re-applies <commit>..<overlay>'s non-meta delta as one commit -----
// ---- under an optionally-supplied, harness-silent --subject (D5). ----------------------------------

function cmdSetup() {
  if (!commit || (!dir && !specArg)) { usage(); process.exit(2) }
  // D5: --subject is refused when it opens with "replay" (case-insensitive) — narrower than
  // --apply's F2 refusal, since no --class exists at setup time to also check against. Checked
  // first, before any filesystem or git side effect, exactly like D4's descendant check below.
  const overlaySubject = subjectArg === null ? 'build: follow-up' : subjectArg
  if (subjectArg !== null && /^\s*replay\b/i.test(overlaySubject)) {
    console.error(`replay.js: --subject '${overlaySubject}' announces the harness — the overlay commit ` +
      'message must be indistinguishable from a normal build commit; pass a build-commit-shaped --subject ' +
      'that does not start with "replay", or omit it to use the default "build: follow-up"')
    process.exit(2)
  }
  // D4: --overlay must resolve to a strict descendant of --commit — an unrelated sha, an ancestor,
  // or an equal sha are all refused, before any worktree is created.
  if (overlayArg) {
    if (overlayArg === commit) {
      console.error(`replay.js: --overlay ${overlayArg} equals --commit ${commit} — --overlay must be a ` +
        'strict descendant of --commit; re-run --select and pass its printed commit/parent pair')
      process.exit(4)
    }
    const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', commit, overlayArg], { cwd: root })
    if (ancestor.status !== 0) {
      console.error(`replay.js: --overlay ${overlayArg} is not a descendant of --commit ${commit} — confirm ` +
        `both are valid commits in ${root} and that --overlay comes after --commit; re-run --select and pass ` +
        'its printed commit/parent pair')
      process.exit(4)
    }
  }
  const resolvedRoot = path.resolve(root)
  let resolvedDir
  if (dir) {
    resolvedDir = path.resolve(dir)
    // D2: a caller-supplied --dir whose basename announces the harness is refused BEFORE any
    // filesystem or git side effect — in-repo or out-of-repo alike. A basename that merely
    // contains "replay" (e.g. this harness's own derived name for its own spec, A5) is not refused.
    if (/^replay/i.test(path.basename(resolvedDir))) {
      console.error(`replay.js: --dir ${dir} basename announces the harness — refusing to create it; omit ` +
        '--dir and pass --spec <path> so the harness derives a build-shaped name')
      process.exit(3)
    }
  } else {
    // D1: --spec supplied, no --dir — read it, then derive a build-shaped path.
    const resolvedSpec = path.resolve(root, specArg)
    try {
      fs.accessSync(resolvedSpec, fs.constants.R_OK)
    } catch (e) {
      console.error(`replay.js: --spec ${specArg} is not readable relative to ${root} — confirm the path: ${e.message}`)
      process.exit(2)
    }
    resolvedDir = deriveScratchDir(resolvedRoot, specArg)
  }
  const rel = path.relative(resolvedRoot, resolvedDir)
  const isInsideRepo = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
  if (isInsideRepo) {
    // D1: the ONLY in-repo location this harness allows is <root>/.claude/worktrees/ itself —
    // resolved by location (path.relative), never by name/string-prefix, so a lookalike directory
    // (.claude/worktrees-evil/) cannot evade the narrower refusal below.
    const worktreesRoot = path.join(resolvedRoot, '.claude', 'worktrees')
    const relToWorktrees = path.relative(worktreesRoot, resolvedDir)
    const isInsideWorktreesDir = relToWorktrees !== '' && !relToWorktrees.startsWith('..') && !path.isAbsolute(relToWorktrees)
    if (!isInsideWorktreesDir) {
      console.error(`replay.js: --dir ${dir} resolves inside the repo root ${root} — refusing to create a ` +
        'worktree there (the main tree must never be touched by this harness); pass a --dir outside the repo, ' +
        'or inside <root>/.claude/worktrees/, which this harness self-provisions as ignored')
      process.exit(3)
    }
    provisionWorktreesIgnore(resolvedRoot, resolvedDir)
  }
  try {
    execFileSync('git', ['worktree', 'add', '--detach', resolvedDir, commit], { cwd: root, stdio: 'pipe' })
  } catch (e) {
    console.error(`replay.js: git worktree add --detach failed for ${resolvedDir} at ${commit} in ${root} — ` +
      `confirm the commit exists (git -C ${root} rev-parse ${commit}) and the --dir's parent is writable: ${e.message}`)
    process.exit(4)
  }
  // F1 (specs/20260819/02): the marker must never touch the worktree's WORKING tree — write
  // it into the worktree's own private git dir instead, which `git worktree remove` deletes for
  // free. `git -C <dir> rev-parse --git-dir` for a linked worktree resolves under
  // .git/worktrees/<name> in the shared common git dir; info/exclude does NOT have this property
  // (it resolves into the MAIN repo's .git/info/exclude) and must never be used for this again.
  let gitDirAbs
  try {
    const gitDirRaw = execFileSync('git', ['rev-parse', '--git-dir'], { cwd: resolvedDir, encoding: 'utf8' }).trim()
    gitDirAbs = path.isAbsolute(gitDirRaw) ? gitDirRaw : path.resolve(resolvedDir, gitDirRaw)
  } catch (e) {
    console.error(`replay.js: git rev-parse --git-dir failed in ${resolvedDir} right after worktree add — the ` +
      `worktree is registered but unusable; remove it with git -C ${root} worktree remove --force ${resolvedDir}: ${e.message}`)
    process.exit(4)
  }
  if (!gitDirAbs.split(path.sep).includes('worktrees')) {
    console.error(`replay.js: resolved git-dir ${gitDirAbs} for ${resolvedDir} carries no 'worktrees' path ` +
      'segment — this is not a linked worktree, so no private git dir exists to hold the marker; remove it ' +
      `with git -C ${root} worktree remove --force ${resolvedDir}`)
    process.exit(4)
  }
  try {
    fs.writeFileSync(path.join(gitDirAbs, 'scratch-worktree'), '')
  } catch (e) {
    console.error(`replay.js: failed to write the scratch-worktree marker in ${gitDirAbs} — the worktree is ` +
      `registered but unusable; remove it with git -C ${root} worktree remove --force ${resolvedDir}: ${e.message}`)
    process.exit(4)
  }
  let overlaySuffix = ''
  if (overlayArg) {
    const overlaid = materializeOverlay(resolvedDir, commit, overlayArg, overlaySubject)
    overlaySuffix = ` overlay=${overlayArg} overlaid=${overlaid}`
  }
  console.log(`setup dir=${resolvedDir} commit=${commit}${overlaySuffix}`)
  process.exit(0)
}

// ---- --apply (D9/D10): git apply --index (never `git add -A`, D10) then commit on the -----------
// ---- worktree's detached HEAD, so the mutation lands inside base..HEAD — the diff surface --------
// ---- review-legs.js and the reviewer both read. After committing, re-emit the canonical patch -----
// ---- under pinned git config to the REQUIRED --patch-out (D9) — this harness's only emitter. ------

function cmdApply() {
  if (!dir || !patch || !cls) { usage(); process.exit(2) }
  // D2 (specs/20260901/08-corpus-derivation-and-kill-match.md): refuse a --class the corpus does
  // not carry BEFORE anything else — earlier than the --patch-out/subject checks below, since a
  // rejected class must leave the worktree untouched and write nothing.
  validateClass(cls)
  // D9: --patch-out is required — --apply is now the harness's only patch emitter, so every
  // downstream --score/--record call depends on this file existing.
  if (!patchOut) {
    console.error('replay.js: --apply requires --patch-out <file> — --apply is the harness\'s only patch ' +
      'emitter (specs/20260819/03 D9); pass a --patch-out path OUTSIDE --dir to receive the canonically ' +
      're-emitted patch')
    process.exit(2)
  }
  // F2 (specs/20260819/02): the commit subject must never let a reviewer's sanctioned `git log` reveal
  // this is a test, or which defect class to hunt — reject structurally, not by convention. The
  // rejected set is deliberately narrow: the --class value (which names the defect to hunt) and a
  // `replay:`-style subject (the harness announcing itself). A subject derived from the target
  // spec's own build commit is indistinguishable from the real thing BECAUSE it is the real thing
  // — even when that spec's title happens to contain 'replay' or 'mutation'. An earlier draft
  // rejected those words anywhere in the subject and thereby refused exactly the derived subject
  // replay.md mandates (this spec's own build subject is 'build(20260819/02): scheduled mutation
  // replay harness'); vocabulary is not a leak, provenance is.
  const subject = subjectArg === null ? 'build: follow-up' : subjectArg
  if (/^\s*replay\b/i.test(subject) || subject.includes(cls)) {
    console.error(`replay.js: --subject '${subject}' announces the harness or names the --class ` +
      `value '${cls}' — the commit message must be indistinguishable from a normal commit; pass a ` +
      'build-commit-shaped --subject that neither starts with "replay" nor contains the class id, ' +
      'or omit it to use the default')
    process.exit(2)
  }
  // D9: a --patch-out resolving inside --dir would write the harness's own emission into the exact
  // tree the blind reviewer reads — refused structurally, BEFORE anything is applied or committed.
  const resolvedDir = path.resolve(dir)
  const resolvedPatchOut = path.resolve(patchOut)
  const relOut = path.relative(resolvedDir, resolvedPatchOut)
  const patchOutInsideDir = relOut === '' || (!relOut.startsWith('..') && !path.isAbsolute(relOut))
  if (patchOutInsideDir) {
    console.error(`replay.js: --patch-out ${patchOut} resolves inside --dir ${dir} — writing the harness's ` +
      'own emitted patch into the exact tree the blind reviewer reads is a blindness violation; pass a ' +
      '--patch-out path outside the worktree')
    process.exit(3)
  }
  const patchAbs = path.resolve(patch)
  // D10: --index stages only the files the patch itself touches — never `git add -A`, which would
  // sweep whatever D4's setup-gate `setupCommand` left dirty in the worktree into this exact commit.
  try {
    execFileSync('git', ['apply', '--index', patchAbs], { cwd: dir, stdio: 'pipe' })
  } catch (e) {
    console.error(`replay.js: git apply --index ${patch} failed in ${dir} — confirm the patch applies cleanly ` +
      `against the worktree's current HEAD (git -C ${dir} apply --check ${patch}): ${e.message}`)
    process.exit(4)
  }
  try {
    execFileSync('git', ['commit', '-q', '-m', subject], { cwd: dir, stdio: 'pipe' })
  } catch (e) {
    console.error(`replay.js: git commit failed in ${dir} after applying the mutation — inspect with ` +
      `git -C ${dir} status: ${e.message}`)
    process.exit(4)
  }
  // D9: re-emit the just-committed mutation under pinned flags that neutralize a hostile host git
  // config (diff.noprefix/diff.mnemonicPrefix/core.quotePath) — every downstream --score/--record
  // call reads THIS file, never a caller's own raw `git diff` capture.
  let emitted
  try {
    emitted = execFileSync('git', [
      '-c', 'core.quotePath=off', '-c', 'diff.noprefix=false', '-c', 'diff.mnemonicPrefix=false',
      '-c', 'diff.srcPrefix=a/', '-c', 'diff.dstPrefix=b/',
      'diff', '--no-ext-diff', '--no-color', 'HEAD^', 'HEAD',
    ], { cwd: dir, encoding: 'utf8' })
  } catch (e) {
    console.error(`replay.js: canonical patch re-emission (git diff HEAD^ HEAD) failed in ${dir} after the ` +
      `mutation was committed — inspect with git -C ${dir} log: ${e.message}`)
    process.exit(4)
  }
  try {
    fs.writeFileSync(resolvedPatchOut, emitted)
  } catch (e) {
    console.error(`replay.js: failed to write --patch-out ${patchOut} — the mutation IS committed in ${dir}, ` +
      `but no canonical patch was written for --score/--record to read: ${e.message}`)
    process.exit(4)
  }
  console.log(`applied class=${cls} dir=${dir} patchOut=${resolvedPatchOut}`)
  process.exit(0)
}

// ---- Patch parsing (D1/D7 shared): a mutated file is every `+++ b/<path>` header; each `@@` ------
// ---- hunk header under it contributes a post-image range [start, start+max(count,1)-1] -----------
// ---- (omitted count = 1; a pure-deletion count-0 hunk keeps a 1-line window at start). ------------

function parsePatch(patchText) {
  const files = [] // order of first appearance
  const ranges = new Map() // file -> array of [lo, hi] (unwidened post-image ranges)
  let hunkCount = 0
  let currentFile = null
  for (const line of patchText.split('\n')) {
    const fm = line.match(/^\+\+\+ b\/(.*)$/)
    if (fm) {
      currentFile = fm[1]
      if (!ranges.has(currentFile)) { ranges.set(currentFile, []); files.push(currentFile) }
      continue
    }
    const hm = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
    if (hm && currentFile) {
      const start = Number(hm[1])
      const count = hm[2] !== undefined ? Number(hm[2]) : 1
      const effCount = Math.max(count, 1)
      ranges.get(currentFile).push([start, start + effCount - 1])
      hunkCount++
    }
  }
  return { files, ranges, hunkCount }
}

// ---- D11: normalize a survivor's file before matching — strip a leading "./"; an absolute path ---
// ---- matches a mutated file when it ends on that file's repo-relative path at a path-segment ------
// ---- boundary (the reviewer contract never pins a path form, and the reviewer is rooted at --dir).

function matchesMutatedFile(survivorFile, mutatedFile) {
  if (typeof survivorFile !== 'string') return false
  const norm = survivorFile.startsWith('./') ? survivorFile.slice(2) : survivorFile
  if (path.isAbsolute(norm)) return norm === '/' + mutatedFile || norm.endsWith('/' + mutatedFile)
  return norm === mutatedFile
}

// ---- --score (D1): scores off EVERY hunk in the mutation's own --patch, never a single self- -----
// ---- reported point — caught (a survivor lands within +/-5 lines of any hunk in a mutated file), --
// ---- ambiguous (survivors present, none matching), missed (zero survivors). Always exit 0 once ----
// ---- the workflow return and patch are both usable. -------------------------------------------------

function cmdScore() {
  if (!workflowPath || !patch) { usage(); process.exit(2) }
  let wf
  try {
    wf = JSON.parse(fs.readFileSync(workflowPath, 'utf8'))
  } catch (e) {
    console.error(`replay.js: cannot read/parse --workflow ${workflowPath} — the reviewer's workflow ` +
      `return must be written to this path as JSON before scoring: ${e.message}`)
    process.exit(2)
  }
  // F4 (specs/20260819/02): a crashed or malformed reviewer return must never be scored as `missed` —
  // that converts "the reviewer never ran" into permanent, indistinguishable-from-real evidence.
  if (wf.verdict !== 'CLEAN' || !Array.isArray(wf.survivors)) {
    console.error(`replay.js: --workflow ${workflowPath} has verdict=${JSON.stringify(wf.verdict)} ` +
      `survivors=${Array.isArray(wf.survivors) ? 'array' : typeof wf.survivors} — a non-CLEAN or malformed ` +
      'reviewer return must never be scored; re-dispatch the reviewer and retry --score')
    process.exit(2)
  }
  let patchText
  try {
    patchText = fs.readFileSync(patch, 'utf8')
  } catch (e) {
    console.error(`replay.js: cannot read --patch ${patch} — pass the canonical patch --apply --patch-out ` +
      `emitted, never a caller's own raw capture: ${e.message}`)
    process.exit(2)
  }
  const { ranges, hunkCount } = parsePatch(patchText)
  if (hunkCount === 0) {
    console.error(`replay.js: --patch ${patch} parses to zero @@ hunks under a +++ b/ file header — this is ` +
      'unusable input, most likely a patch this harness did not emit itself; re-run --apply --patch-out to ' +
      `regenerate a scoreable canonical patch: ${patch}`)
    process.exit(2)
  }
  const survivors = wf.survivors
  const hit = survivors.some(s => {
    if (!s || !Number.isFinite(Number(s.line))) return false
    const line = Number(s.line)
    for (const [mutatedFile, fileRanges] of ranges) {
      if (!matchesMutatedFile(s.file, mutatedFile)) continue
      if (fileRanges.some(([lo, hi]) => line >= lo - 5 && line <= hi + 5)) return true
    }
    return false
  })
  if (hit) { console.log('caught'); process.exit(0) }
  if (survivors.length > 0) { console.log('ambiguous'); process.exit(0) }
  console.log('missed')
  process.exit(0)
}

// ---- --record (D7 successor D2/D3, specs/20260823/09): validation matrix per --outcome, ---------
// ---- widened with `baseline-red:<leg>[,<leg>]` — the truthful variant of `green` for a run whose --
// ---- target closed with sanctioned red legs — and `unresolved`'s two-armed shape: `green`/ --------
// ---- `baseline-red:*` requires --patch + --workflow (the reviewer ran, a Phase 3 dismissal); -----
// ---- `red:<leg>` requires --patch and REFUSES --workflow (the reviewer never ran, a step-7 -------
// ---- dismissal). Then appends one Contracts-shaped ledger row with a fresh rp_ runId (files -----
// ---- DERIVED from --patch, never hand-passed) and writes the full-fidelity evidence artifact -----
// ---- (patch verbatim or null, reviewer verbatim or null). -----------------------------------------

const RECORD_OUTCOMES = ['caught', 'missed', 'leg-caught', 'unresolved', 'setup-failed']
const BASELINE_RED_RE = /^baseline-red:.+/

function cmdRecord() {
  if (!specArg || !reviewRunId || !legs || !outcome) { usage(); process.exit(2) }
  if (!RECORD_OUTCOMES.includes(outcome)) {
    console.error(`replay.js: --outcome must be one of ${RECORD_OUTCOMES.join('|')}, got '${outcome}'`)
    process.exit(2)
  }
  if (legs !== 'green' && legs !== 'none' && !/^red:.+/.test(legs) && !BASELINE_RED_RE.test(legs)) {
    console.error(`replay.js: --legs must be 'green', 'red:<leg>', 'baseline-red:<leg>[,<leg>]', or 'none', got '${legs}'`)
    process.exit(2)
  }
  // D2/D3 validation matrix.
  if (outcome === 'caught' || outcome === 'missed') {
    if (!patch) {
      console.error(`replay.js: --outcome ${outcome} requires --patch`)
      process.exit(2)
    }
    if (!workflowPath) {
      console.error(`replay.js: --outcome ${outcome} requires --workflow`)
      process.exit(2)
    }
    if (legs !== 'green' && !BASELINE_RED_RE.test(legs)) {
      console.error(`replay.js: --outcome ${outcome} requires --legs green or baseline-red:<leg>[,<leg>], got '${legs}'`)
      process.exit(2)
    }
  } else if (outcome === 'unresolved') {
    // D3: two-armed on the --legs shape. green/baseline-red:* = Phase 3 dismissal (the reviewer
    // ran) -> requires --patch + --workflow, same as caught/missed. red:<leg> = step-7 dismissal
    // (the reviewer never ran) -> requires --patch and REFUSES --workflow.
    if (!patch) {
      console.error('replay.js: --outcome unresolved requires --patch')
      process.exit(2)
    }
    const isGreenOrBaseline = legs === 'green' || BASELINE_RED_RE.test(legs)
    const isRedLeg = /^red:.+/.test(legs)
    if (!isGreenOrBaseline && !isRedLeg) {
      console.error(`replay.js: --outcome unresolved requires --legs green, baseline-red:<leg>[,<leg>], ` +
        `or red:<leg>, got '${legs}'`)
      process.exit(2)
    }
    if (isGreenOrBaseline && !workflowPath) {
      console.error('replay.js: --outcome unresolved with --legs green or baseline-red:<leg> requires ' +
        '--workflow (the reviewer ran — a Phase 3 dismissal)')
      process.exit(2)
    }
    if (isRedLeg && workflowPath) {
      console.error('replay.js: --outcome unresolved with --legs red:<leg> refuses --workflow — a step-7 ' +
        'dismissal means the reviewer never ran; a --workflow value here would fabricate reviewer evidence ' +
        'that was never produced — omit --workflow')
      process.exit(2)
    }
  } else if (outcome === 'leg-caught') {
    if (!patch) {
      console.error('replay.js: --outcome leg-caught requires --patch')
      process.exit(2)
    }
    if (!/^red:.+/.test(legs)) {
      console.error(`replay.js: --outcome leg-caught requires --legs red:<leg>, got '${legs}'`)
      process.exit(2)
    }
  } else { // setup-failed
    if (legs !== 'none') {
      console.error(`replay.js: --outcome setup-failed requires --legs none, got '${legs}'`)
      process.exit(2)
    }
    if (cls) {
      console.error('replay.js: --outcome setup-failed refuses --class — no class was ever selected when ' +
        'setup itself failed')
      process.exit(2)
    }
    if (patch) {
      console.error('replay.js: --outcome setup-failed refuses --patch — nothing was ever measured')
      process.exit(2)
    }
    if (workflowPath) {
      console.error('replay.js: --outcome setup-failed refuses --workflow — the reviewer was never dispatched')
      process.exit(2)
    }
  }
  // D2: validate --class against the corpus AFTER the D7 matrix above (so a matrix violation is
  // still reported first) but BEFORE any read of --patch/--workflow — a rejected class must
  // append nothing to the ledger.
  if (cls) validateClass(cls)
  const tokens = tokensArg === null ? 0 : Number(tokensArg)
  if (!Number.isFinite(tokens)) {
    console.error(`replay.js: --tokens must be a number, got '${tokensArg}'`)
    process.exit(2)
  }
  let patchContent = null
  let filesArr = null
  if (patch) {
    try {
      patchContent = fs.readFileSync(patch, 'utf8')
    } catch (e) {
      console.error(`replay.js: cannot read --patch ${patch}: ${e.message}`)
      process.exit(2)
    }
    filesArr = parsePatch(patchContent).files
  }
  let reviewer = null
  if (workflowPath) {
    try {
      reviewer = JSON.parse(fs.readFileSync(workflowPath, 'utf8'))
    } catch (e) {
      console.error(`replay.js: cannot read/parse --workflow ${workflowPath}: ${e.message}`)
      process.exit(2)
    }
  }
  const runId = 'rp_' + crypto.randomBytes(6).toString('hex')
  const ts = new Date().toISOString()
  // D8 (specs/20260903/01-owed-query-and-row-handoff.md): mirrors build/review's --via rule —
  // exactly "driver" stamps "driver" (the review driver's REPLAY step is the only caller that
  // knows the run was driver-handed); absent or any other value stamps the honest default
  // "manual", so every pre-change --record caller keeps working unchanged.
  const via = viaArg === 'driver' ? 'driver' : 'manual'
  const row = {
    ts, stage: 'replay', spec: specArg, runId, reviewRunId,
    class: cls || null, files: filesArr, legs, outcome, tokens, via,
  }
  const claudeDir = path.join(root, '.claude')
  fs.mkdirSync(claudeDir, { recursive: true })
  fs.appendFileSync(path.join(claudeDir, 'spec-runs.jsonl'), JSON.stringify(row) + '\n')
  const artifactDir = path.join(claudeDir, 'spec-runs')
  fs.mkdirSync(artifactDir, { recursive: true })
  const artifact = { ...row, patch: patchContent, reviewer }
  fs.writeFileSync(path.join(artifactDir, runId + '.json'), JSON.stringify(artifact, null, 2) + '\n')
  console.log(`recorded runId=${runId} via=${via}`)
  process.exit(0)
}

// ---- --stats (D6): per-outcome totals across all five buckets, per-class counts, catch-rate = ----
// ---- caught/(caught+missed) — leg-caught is corpus feedback, unresolved/setup-failed carry no -----
// ---- truth value; none of the three ever enters the denominator. ----------------------------------

const STATS_BUCKETS = ['caught', 'missed', 'leg-caught', 'unresolved', 'setup-failed']

function cmdStats() {
  const rows = readLedgerRows(root).filter(r => r.stage === 'replay')
  const total = rows.length
  const counts = {}
  for (const b of STATS_BUCKETS) counts[b] = rows.filter(r => r.outcome === b).length
  const byClass = new Map()
  for (const r of rows) {
    if (!byClass.has(r.class)) byClass.set(r.class, Object.fromEntries(STATS_BUCKETS.map(b => [b, 0])))
    const c = byClass.get(r.class)
    if (Object.prototype.hasOwnProperty.call(c, r.outcome)) c[r.outcome]++
  }
  console.log(`total ${total}`)
  for (const b of STATS_BUCKETS) console.log(`${b} ${counts[b]}`)
  console.log(`catch-rate ${counts.caught}/${counts.caught + counts.missed}`)
  // D9 (specs/20260903/01-owed-query-and-row-handoff.md): manual-path usage as a ledger count —
  // "unknown" is a row with no via field at all (every pre-D8 --record row).
  const viaCounts = { driver: 0, manual: 0, unknown: 0 }
  for (const r of rows) {
    if (r.via === 'driver') viaCounts.driver++
    else if (r.via === 'manual') viaCounts.manual++
    else viaCounts.unknown++
  }
  console.log(`by-via driver=${viaCounts.driver} manual=${viaCounts.manual} unknown=${viaCounts.unknown}`)
  console.log('per-class:')
  for (const [name, c] of byClass) {
    console.log(`  ${name} ` + STATS_BUCKETS.map(b => `${b}=${c[b]}`).join(' '))
  }
  process.exit(0)
}

// ---- --pick-class (D3): counts MEASUREMENT replay rows (caught/missed/leg-caught) per corpus ----
// ---- class in <root>'s ledger; picks the class with the fewest rows — every corpus class starts -
// ---- at 0 even with zero rows recorded for it. Ties resolve derived-first, then corpus file -----
// ---- order (the array is already in that order, and a tie only replaces `best` when the ---------
// ---- challenger is derived and `best` is not, so the earliest corpus-order class among equals ---
// ---- that are otherwise tied stays picked). --------------------------------------------------------

// ---- Direct fix (core § Incident Policy): a corpus class can declare in prose that it does not ----
// ---- apply to some hosts ("pick another") — nothing the picker can evaluate. The host says so -----
// ---- once, in the host config → `replay.inapplicableClasses: [<id>, …]`; every id is -----------
// ---- validated against the corpus (exit 2 on a typo, naming the valid ids), the picker skips them
// ---- and prints `skipped=<ids>` so the exclusion is visible in the step's own output. A host that
// ---- rules every class out gets exit 2, never a silent pick. ---------------------------------------

function readInapplicableClasses(rootDir, classes) {
  if (!configExists(rootDir)) return []
  const cfgPath = configPath(rootDir)
  let config
  try { config = readConfigStrict(rootDir) } catch (e) {
    console.error(`replay.js: ${e.message} — cannot read replay.inapplicableClasses`)
    process.exit(2)
  }
  const declared = config && config.replay && config.replay.inapplicableClasses
  if (declared === undefined || declared === null) return []
  if (!Array.isArray(declared) || declared.some((v) => typeof v !== 'string')) {
    console.error(`replay.js: ${cfgPath} replay.inapplicableClasses must be an array of corpus class ids`)
    process.exit(2)
  }
  const ids = classes.map((c) => c.id)
  const unknown = declared.filter((v) => !ids.includes(v))
  if (unknown.length > 0) {
    console.error(`replay.js: ${cfgPath} replay.inapplicableClasses names ${unknown.join(', ')} — not a class in ` +
      `${corpusPath()}; valid ids (corpus order): ${ids.join(', ')}`)
    process.exit(2)
  }
  return declared
}

function cmdPickClass() {
  const allClasses = readCorpusClasses()
  if (allClasses.length === 0) {
    console.error(`replay.js: ${corpusPath()} parses to zero classes — nothing to pick from; ` +
      'confirm the corpus file carries at least one `## `id`` heading')
    process.exit(2)
  }
  const skipped = readInapplicableClasses(root, allClasses)
  const classes = allClasses.filter((c) => !skipped.includes(c.id))
  if (classes.length === 0) {
    console.error(`replay.js: every corpus class is listed in ${CONFIG_RELPATH} replay.inapplicableClasses ` +
      `(${skipped.join(', ')}) — nothing is left to pick; remove at least one id`)
    process.exit(2)
  }
  const rows = readLedgerRows(root).filter(isMeasurementReplay)
  const rowCounts = new Map()
  for (const r of rows) rowCounts.set(r.class, (rowCounts.get(r.class) || 0) + 1)
  let best = null
  for (const c of classes) {
    const n = rowCounts.get(c.id) || 0
    if (!best || n < best.rows || (n === best.rows && c.derived && !best.derived)) {
      best = { id: c.id, derived: c.derived, rows: n }
    }
  }
  console.log(`class=${best.id} derived=${best.derived} rows=${best.rows}` +
    (skipped.length > 0 ? ` skipped=${skipped.join(',')}` : ''))
  process.exit(0)
}

// ---- --teardown: refuse a --dir whose private git dir carries no scratch-worktree marker ----------
// ---- (exit 3, deletes nothing) — the retired replay-worktree name is NOT grandfathered (D3, A4: no
// ---- tree carrying only that name existed at build time); otherwise `git worktree remove --force` --
// ---- so git's own registry is pruned too, taking the marker with it. -------------------------------

function cmdTeardown() {
  if (!dir) { usage(); process.exit(2) }
  const resolvedDir = path.resolve(dir)
  if (!fs.existsSync(resolvedDir)) {
    console.error(`replay.js: --dir ${dir} does not exist — refusing to remove nothing; if this really is a ` +
      `stale replay worktree, confirm the path with git -C ${root} worktree list`)
    process.exit(3)
  }
  let gitDirAbs
  try {
    const gitDirRaw = execFileSync('git', ['rev-parse', '--git-dir'], { cwd: resolvedDir, encoding: 'utf8' }).trim()
    gitDirAbs = path.isAbsolute(gitDirRaw) ? gitDirRaw : path.resolve(resolvedDir, gitDirRaw)
  } catch (e) {
    console.error(`replay.js: git rev-parse --git-dir failed in ${resolvedDir} — refusing to remove a ` +
      `directory that is not a git worktree; if this really is a stale replay worktree, remove it manually ` +
      `with rm -rf ${dir}: ${e.message}`)
    process.exit(3)
  }
  if (!gitDirAbs.split(path.sep).includes('worktrees')) {
    console.error(`replay.js: resolved git-dir ${gitDirAbs} for ${resolvedDir} carries no 'worktrees' path ` +
      'segment — refusing to remove a directory this harness did not create as a linked worktree; if this ' +
      `really is a stale replay worktree, remove it manually with git -C ${root} worktree remove --force ${dir}`)
    process.exit(3)
  }
  const marker = path.join(gitDirAbs, 'scratch-worktree')
  if (!fs.existsSync(marker)) {
    console.error(`replay.js: ${gitDirAbs} carries no scratch-worktree marker — refusing to remove a ` +
      'directory this harness did not create (the retired replay-worktree name is not grandfathered); if ' +
      `this really is a stale replay worktree, remove it manually with git -C ${root} worktree remove ` +
      `--force ${dir}`)
    process.exit(3)
  }
  try {
    execFileSync('git', ['worktree', 'remove', '--force', resolvedDir], { cwd: root, stdio: 'pipe' })
  } catch (e) {
    console.error(`replay.js: git worktree remove --force failed for ${resolvedDir} — inspect with ` +
      `git -C ${root} worktree list: ${e.message}`)
    process.exit(4)
  }
  console.log(`torn down dir=${resolvedDir}`)
  process.exit(0)
}

switch (mode) {
  case 'due': cmdDue(); break
  case 'select': cmdSelect(); break
  case 'setup': cmdSetup(); break
  case 'apply': cmdApply(); break
  case 'score': cmdScore(); break
  case 'record': cmdRecord(); break
  case 'stats': cmdStats(); break
  case 'pickClass': cmdPickClass(); break
  case 'teardown': cmdTeardown(); break
  default: usage(); process.exit(2)
}
