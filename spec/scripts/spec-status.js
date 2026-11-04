#!/usr/bin/env node
'use strict'
// spec-status.js [--root <dir>] [--json] [--brief NN | --next | --all | --lanes] — derive pipeline
// status, never store it.
//
// Owner: specs/20260903/05-status-diet.md
//
// Human output is ALWAYS the pretty render: bare invocation → the four-block dashboard —
// 🗺️ Roadmap, 🎯 Next, up to three ⚠️ decide lines, two 📈 ceremony lines (suite runs per spec,
// test:production lines — ledger-derived, render-only, specs/20261103/13 D15), one glyph+sentence
// footer — and nothing else. The 🎯 Next block IS the lane render —
// escape lines first, then the ⚡ parallel-lanes fan-out (or the lone pick's 🚦 solo tag), or
// the blocked top pick's ⏳ branch when nothing is unblocked — identically in the default
// render and under --all. --next → the lean
// 🎯 top-pick line alone (@-prefixed so it pastes straight into Claude Code). --all only lifts
// the decide-line cap and inserts what is genuinely not startable now — 🕓 after that: and
// ⛔ blocked: — directly after the Next block's own lines and before the decide lines,
// plus the hygiene catalogue ahead of the same footer — every anomaly kind classifies
// once, in code, as `audience: "decide"` (a choice only the reader can make) or `"hygiene"`
// (/spec:doctor's findings), never re-derived per call site. --json is the only machine
// format (doctor check 13, release). --pretty is accepted as a no-op for old call sites; there
// is no plain human render anymore.
//
// The single source of truth for "where is the work": specs/** frontmatter (`status:`,
// `brief:`, `depends_on:`) and docs/roadmap/NN-*.md headers
// (`Depends on:`). Roadmap brief status is DERIVED per /spec:doctor check 13 — no specs
// stamped `brief: NN` → unplanned; any matching spec not done → in-flight; all matching
// specs done → done. Nothing here writes; this is a viewer. Consumers: /spec:status
// (render + --next section 2), /spec:doctor check 13 (drift report), /spec:plan Phase 0
// (--brief dependency preflight), the review stage's close-out Next pointer (--next), and
// external `--json` consumers of the frozen --next --json shape.
//
// --next derives the recommended next command per open spec: draft → /spec:plan; hardened and
// implementing both → /spec:run — the loop derives build and review from disk itself, so this
// derivation offers exactly one next-command per state (the build and review stages have no
// command of their own to emit). Closest-to-done first, blocked entries last,
// and when every spec is done the next ready unplanned brief becomes the /spec:plan pick.
// Unblocked runner-up entries are annotated parallel-ok/serial relative to the top pick:
// spec-level depends_on can never link two unblocked entries (a non-done dep is a blocker),
// so the check is brief-level — shared brief or a transitive brief dependency path in either
// direction → serial; distinct unrelated briefs → parallel-ok (separate worktrees); an ad-hoc
// side defers to the File Plan rule. The dashboard's ⚡ lanes claim MUTUAL parallelism, so admission
// is pairwise-greedy: a parallel-ok runner-up joins only if also unrelated to every lane
// already admitted (vs-top alone would let two mutually-ordered briefs share the fan-out).
// Everything else lands under 🕓 with a ⛓️/🤷 branch line giving the derived reason (or the
// no-claim) — never an unexplained bucket.
//
// `--next` additionally consults an OPTIONAL per-repo session
// queue (`<git-common-dir>/spec-queue.json`, written only by spec-queue.js) as a read-only
// input overlay to deriveNext(): queue position reorders unblocked entries across briefs
// (deliberately overriding cross-brief closest-to-done) and a queued `spec` item's own
// position overrides its brief's; undone prompt items surface as new entries with no
// `path`; any item may carry an `after` gate on a spec or a brief — a not-ready item's
// entries gain a `after <target> (<state>)` blocker and sink into the blocked tier, per
// lib/queue.js's isItemReady (shared with spec-queue.js's own write path); a linked
// worktree suppresses the overlay entirely (the global pointer misleads mid-spec). A
// newly-landed on-disk brief absent from the queue is appended last with no stamp and no
// anomaly (the dependency-aware auto-placement and its veto/accept notice are retired).
// Resolution is fail-soft in every direction — no git, a git error, no queue file, an
// unparseable file, or a linked worktree all leave today's derivation byte-for-byte
// unchanged, with zero stderr; only an unparseable file additionally earns one
// `queue-unparseable` anomaly. This script never writes the queue file — spec-queue.js is
// its sole writer.
//
// `--lanes --json` is a third machine mode:
// `{lanes, serialized, fixes}` — laneAdmission's admitted /spec:run entries with their
// `spec/<stem>` branch and the linked worktree holding it (or null), the entries held back with
// their reason, and the /spec:fix escapes and queued fixes with their queue id. It reads the same
// derivation the dashboard draws, never a second one, and refuses (exit 2) outside the main
// worktree. It does NOT change `--next --json` or `--json`, and writes nothing.
//
// Exit codes: 0 derived (anomalies are report lines, not failures); with --brief NN,
// 1 = that brief has an unmet dependency (no spec at implementing/done); 2 = usage, or --lanes
// run outside the main worktree.

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { writeLine } = require('./lib/sync-write')
const { parseFilePlan } = require('./lib/file-plan')
const { globMatch } = require('./lib/glob-match')
const { policy: hostPolicy, readConfig: readHostConfig } = require('./lib/host-config')
// sinceLastRelease feeds the footer's ignorable done-since-release clause.
const { readLedgerRows, sinceLastRelease, ceremonyMetrics } = require('./lib/observation')
const {
  isSupersededBriefText, isItemDone, isItemReady, makeCtx, dedupeItems,
  reconcileMissingBriefs, promptAction, originLine, namedFiles,
} = require('./lib/queue')
const { parseBrief, relateBriefs, briefNum, briefOrd, normBrief } = require('./lib/brief')
const { fmMap } = require('./lib/frontmatter')

// A spec's `brief:` stamp is parsed once by lib/brief.js into briefed | adhoc (`brief: n/a`, none,
// -, — and an absent line are ad-hoc, never an orphan stamp); every external --json surface
// serializes it back with briefNum(). Two briefs are compared only through relateBriefs.

// Default root: the repository toplevel, not the shell's CWD; '.' outside a git repo. --root wins.
let root = (() => {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' })
  return r.error || r.status !== 0 ? '.' : (r.stdout.trim() || '.')
})()
let json = false
let briefFilter = null
let nextMode = false
let allMode = false
let lanesMode = false
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--root') root = argv[++i]
  else if (argv[i] === '--json') json = true
  else if (argv[i] === '--brief') briefFilter = normBrief(argv[++i])
  else if (argv[i] === '--next') nextMode = true
  else if (argv[i] === '--all') allMode = true
  else if (argv[i] === '--lanes') lanesMode = true
  else if (argv[i] === '--pretty') { /* no-op: pretty is the default human render */ }
  else {
    console.error('usage: spec-status.js [--root <dir>] [--json] [--brief NN | --next | --all | --lanes --json]')
    process.exit(2)
  }
}
if (lanesMode && (!json || nextMode || briefFilter || allMode)) {
  console.error('spec-status: --lanes is its own mode — run spec-status.js --lanes --json')
  process.exit(2)
}
if (nextMode && briefFilter) {
  console.error('--next and --brief are mutually exclusive')
  process.exit(2)
}
// --all is a render switch only: incompatible with --next/--brief, a no-op with --json.
if (allMode && (nextMode || briefFilter)) {
  console.error('usage: --all cannot combine with --next or --brief')
  process.exit(2)
}

// ---- specs/** frontmatter -------------------------------------------------------------------

function walkMd(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walkMd(p, out)
    else if (e.name.endsWith('.md')) out.push(p)
  }
  return out
}


function parseList(v) {
  if (!v) return []
  return v.replace(/^\[|\]$/g, '').split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
}

const allSpecs = []
for (const file of walkMd(path.join(root, 'specs'))) {
  const text = fs.readFileSync(file, 'utf8')
  const fm = fmMap(text)
  if (!fm.status) continue
  allSpecs.push({
    path: path.relative(root, file),
    status: fm.status,
    brief: parseBrief(fm.brief),
    area: fm.area || null,
    date: fm.date || null,
    depends_on: parseList(fm.depends_on),
    superseded_by: fm.superseded_by || null,
    filePlan: parseFilePlan(text),
  })
}

// ---- retirement: status: superseded -----------------------------------------------------------
// Terminal and unconditional: a superseded spec leaves the derivation entirely — no brief
// membership, no Next entry, no anomaly. `superseded_by:` is free-form provenance carried into
// --json, never validated.
const isRetired = s => s.status === 'superseded'
const retired = allSpecs.filter(isRetired)
const specs = allSpecs.filter(s => !isRetired(s))

// ---- docs/roadmap/NN-*.md headers -----------------------------------------------------------

const roadmapDir = path.join(root, 'docs/roadmap')
const briefs = []
if (fs.existsSync(roadmapDir)) {
  for (const f of fs.readdirSync(roadmapDir).sort()) {
    const m = f.match(/^(\d+[A-Za-z]?)-(.+)\.md$/)
    if (!m || f === '00-overview.md') continue
    const text = fs.readFileSync(path.join(roadmapDir, f), 'utf8')
    // Flatten the pre-section head to one line so a wrapped `Depends on:` keeps its continuation.
    const head = text.split(/\n## /)[0].replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ')
    // Stop at the next header label too, so a label on the following line never joins the value.
    const dep = head.match(/Depends on:\s*([^·]*?)\s*(?:·|\s[A-Z][A-Za-z ]*:|$)/)
    const phase = head.match(/Phase:\s*(P\d+)/)
    // Item-wise: accept only an exact brief id (NN/NNa, optional "brief" prefix, name suffix, or a
    // trailing parenthetical note) or a "none" spelling; anything else is an anomaly, never a dep.
    // Commas inside a parenthetical never split the item.
    const deps = [], depRejects = []
    const items = dep ? dep[1].replace(/\([^)]*\)/g, m => m.replace(/,/g, '\u0000')).split(',').map(s => s.replace(/\u0000/g, ',').replace(/\s+/g, ' ').trim()).filter(Boolean) : []
    for (const item of items) {
      if (parseBrief(item).kind === 'adhoc') continue
      if (/^(?:brief\s+)?\d{1,2}[A-Za-z]?(?:-[\w-]+)?(?: \([^)]*\))?$/.test(item)) deps.push(normBrief(item.replace(/^brief\s+/, '').replace(/ \(.*$/, '')))
      else depRejects.push(item)
    }
    briefs.push({
      num: normBrief(m[1]),
      file: path.join('docs/roadmap', f),
      name: m[2],
      phase: phase ? phase[1] : null,
      depends_on: deps,
      dep_rejects: depRejects,
      // Internal-only: a superseded brief stays out of the queue overlay's virtual reconcile.
      superseded: isSupersededBriefText(text),
    })
  }
}

// ---- derivation (doctor check 13) -----------------------------------------------------------

const DONE = s => s === 'done'
const LANDED = s => s === 'done' || s === 'implementing'
// The hook-enforced spec lifecycle (spec/templates/spec.md). Anything else is a hand edit
// this derivation can't reason about — fail closed: flag it, never route it to an action.
const KNOWN_STATUS = new Set(['draft', 'hardened', 'implementing', 'done'])

const ledgerRows = readLedgerRows(root)

// Brief status is derived HERE and nowhere else — every consumer switches on `status` alone.
// `superseded` = the "Superseded by" banner with no spec still in flight (live work keeps
// `in-flight`).
for (const b of briefs) {
  b.specs = specs.filter(s => relateBriefs(s.brief, parseBrief(b.num)).relation === 'same')
  const allDone = b.specs.every(s => DONE(s.status))
  b.status = b.superseded && allDone ? 'superseded'
    : b.specs.length === 0 ? 'unplanned' : allDone ? 'done' : 'in-flight'
}
const briefByNum = new Map(briefs.map(b => [b.num, b]))

// ---- read-only session queue overlay -------------------------------------------------------
// A linked worktree (git-dir != common-dir, both resolved against <root>) suppresses the overlay.
function resolveQueueOverlay(rootDir) {
  const common = spawnSync('git', ['-C', rootDir, 'rev-parse', '--git-common-dir'], { encoding: 'utf8' })
  if (common.error || common.status !== 0) return { on: false }
  const gitDir = spawnSync('git', ['-C', rootDir, 'rev-parse', '--git-dir'], { encoding: 'utf8' })
  if (gitDir.error || gitDir.status !== 0) return { on: false }
  const abs = p => (path.isAbsolute(p) ? p : path.resolve(rootDir, p))
  if (abs(gitDir.stdout.trim()) !== abs(common.stdout.trim())) return { on: false } // D9
  const queuePath = path.join(abs(common.stdout.trim()), 'spec-queue.json')
  if (!fs.existsSync(queuePath)) return { on: false }
  let data
  try {
    data = JSON.parse(fs.readFileSync(queuePath, 'utf8'))
  } catch (e) {
    return { on: false, parseError: `${queuePath}: ${e.message}` }
  }
  if (!data || !Array.isArray(data.items)) return { on: false, parseError: `${queuePath}: missing "items" array` }
  return { on: true, items: data.items }
}

const anomalies = []
// Every anomaly kind classifies once, here: DECIDE kinds need the reader's choice; every other
// kind, including future ones, resolves to hygiene.
const DECIDE_KINDS = new Set(['skipped-brief', 'out-of-order'])
function pushAnomaly(a) {
  anomalies.push({ ...a, audience: DECIDE_KINDS.has(a.kind) ? 'decide' : 'hygiene' })
}

// The spec's own frontmatter status, `superseded` included (a queued spec item may point at a
// retired spec); null only for a path that never resolved to a spec file.
const specStatusMap = new Map(allSpecs.map(s => [s.path, s.status]))
const specStatusFor = p => (specStatusMap.has(p) ? specStatusMap.get(p) : null)

const queueOverlay = resolveQueueOverlay(root)
const queuePosByBrief = new Map()
const queuePosBySpec = new Map()
const queueBlockersByBrief = new Map()
const queueBlockersBySpec = new Map()
let queueUndonePromptEntries = []
let queueBorn = []
if (queueOverlay.parseError) {
  pushAnomaly({ kind: 'queue-unparseable', detail: `${queueOverlay.parseError} — the session queue overlay is disabled until this is fixed (or the file removed and reseeded with \`spec-queue next\`)` })
}
if (queueOverlay.on) {
  // Virtual reconcile — computed, never written (spec-queue.js persists the same lib/queue.js
  // algorithm): dedupe brief/spec items, then append absent on-disk open briefs last.
  const onDiskBriefs = briefs
    .filter(b => b.status !== 'done' && b.status !== 'superseded')
    .map(b => ({ num: b.num }))
  const deduped = dedupeItems(queueOverlay.items)
  const { items: reconciled } = reconcileMissingBriefs(deduped, onDiskBriefs)
  const ctx = makeCtx({
    ledgerRows, briefStatus: n => (briefByNum.get(n) || {}).status, specStatus: specStatusFor, specRoot: root,
  })
  reconciled.forEach((it, i) => {
    if (it.kind === 'brief') {
      queuePosByBrief.set(it.brief, i)
      // A ticked orphan is already retired — flagging it would print an applied remedy.
      if (!briefByNum.has(it.brief) && !it.ticked) {
        pushAnomaly({ kind: 'queue-orphan', detail: `spec-queue.json item points at brief ${it.brief}, which has no docs/roadmap/${it.brief}-*.md — remove it with \`spec-queue done ${it.brief}\`, reorder it away with \`spec-queue move ${it.brief} <n>\`, or restore the brief file` })
      }
    } else if (it.kind === 'spec') {
      queuePosBySpec.set(it.spec, i)
    }
    // A gate on a brief item blocks every open spec of that brief; on a spec item, that spec;
    // a prompt item's gate is handled in the prompt-entries map below.
    if (it.kind === 'brief' || it.kind === 'spec') {
      const r = isItemReady(it, ctx)
      if (!r.ready) {
        const blocker = `after ${r.target} (${r.state})`
        if (it.kind === 'brief') queueBlockersByBrief.set(it.brief, blocker)
        else queueBlockersBySpec.set(it.spec, blocker)
      }
    }
  })
  queueUndonePromptEntries = reconciled
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => it.kind === 'prompt' && !isItemDone(it, ctx).done)
    .map(({ it, i }) => {
      const r = isItemReady(it, ctx)
      const blockers = r.ready ? [] : [`after ${r.target} (${r.state})`]
      return {
        action: promptAction(it), path: null, status: 'queued', brief: parseBrief(null), blockers,
        note: `queue item ${it.id}`, rank: 0, queue: true, __queuePos: i, __queueId: it.id,
        __after: (it.after && it.after.spec) || null,
        __origin: it.origin || null, __trigger: it.trigger || null, __batch: it.batch || null,
        __payload: it.payload,
      }
    })
  // `born` every undone item carrying any provenance field, queue order.
  queueBorn = reconciled
    .filter(it => (it.origin || it.trigger || it.batch) && !isItemDone(it, ctx).done)
    .map(it => ({
      id: it.id,
      action: it.kind === 'prompt' ? promptAction(it) : it.kind === 'spec' ? `spec ${it.spec}` : `brief ${it.brief}`,
      origin: it.origin || null, trigger: it.trigger || null, batch: it.batch || null,
    }))
}

// Unknown status: a word outside the lifecycle (a typo or a hand-invented word) — never routed.
for (const s of specs) {
  if (!KNOWN_STATUS.has(s.status)) {
    pushAnomaly({ kind: 'unknown-status', detail: `${s.path} has status: ${s.status} — not in the spec lifecycle (${[...KNOWN_STATUS].join(' → ')}); fix the frontmatter (to retire a preserved spec: status: superseded)` })
  }
}

// Orphan stamps: spec points at a brief file that doesn't exist.
for (const s of specs) {
  if (s.brief.kind === 'briefed' && !briefByNum.has(briefNum(s.brief))) {
    const n = briefNum(s.brief)
    pushAnomaly({ kind: 'orphan-stamp', detail: `${s.path} stamps brief: ${n} but no docs/roadmap/${n}-*.md exists (brief renamed/deleted, or typo)` })
  }
}

// Unparseable dependency item: ignored for derivation but surfaced so a mistyped id never vanishes.
for (const b of briefs) {
  for (const r of b.dep_rejects) {
    pushAnomaly({ kind: 'unparsed-dependency', detail: `${b.file} Depends on: item "${r}" is not a brief id (NN or NNa) — ignored; if it names a spec-level gate, move it into the brief body` })
  }
}

// Skipped dependency: a brief moved while a dependency is still unplanned — a DECIDE anomaly.
for (const b of briefs) {
  if (b.status === 'unplanned' || b.status === 'superseded') continue
  for (const d of b.depends_on) {
    const dep = briefByNum.get(d)
    if (!dep) pushAnomaly({ kind: 'unknown-dependency', detail: `${b.file} depends on brief ${d}, which doesn't exist` })
    else if (dep.status === 'unplanned') pushAnomaly({
      kind: 'skipped-brief',
      detail: `brief ${b.num} (${b.name}) is ${b.status} but its dependency ${d} (${dep.name}) is unplanned — likely skipped; plan it with /spec:plan ${dep.file}`,
      line: `Brief ${b.num} (${b.name}) moved on, but its dependency ${d} (${dep.name}) was never planned.`,
      ask: 'Plan it now?',
      paste: `/spec:plan @${dep.file}`,
    })
  }
}

// Sequence-order skip: an earlier unplanned brief below a later brief that moved — a DECIDE
// anomaly. A superseded brief is retired, never skipped or "moved".
const moved = briefs.filter(b => b.status !== 'unplanned' && b.status !== 'superseded')
if (moved.length) {
  const numOrd = n => briefOrd(parseBrief(n))
  const maxMoved = moved.reduce((m, b) => numOrd(b.num) > numOrd(m.num) ? b : m).num
  for (const b of briefs) {
    if (b.status === 'unplanned' && numOrd(b.num) < numOrd(maxMoved) && !anomalies.some(a => a.detail.includes(`dependency ${b.num} `))) {
      pushAnomaly({
        kind: 'out-of-order',
        detail: `brief ${b.num} (${b.name}) is unplanned while later brief ${maxMoved} has moved — deliberate reordering or a skip; if it still matters: /spec:plan ${b.file}`,
        line: `Brief ${b.num} (${b.name}) is unplanned while later brief ${maxMoved} has moved on.`,
        ask: 'Still wanted?',
        paste: `/spec:plan @${b.file}`,
      })
    }
  }
}

// Unfinished dependency under a done spec: later work completed on top of an unfinished spec.
const specByTail = new Map(specs.map(s => [path.basename(s.path), s]))
for (const s of specs) {
  if (!DONE(s.status)) continue
  for (const d of s.depends_on) {
    const dep = specDep(d)
    if (dep && !DONE(dep.status)) {
      pushAnomaly({ kind: 'skipped-spec', detail: `${s.path} is done but its dependency ${dep.path} is still ${dep.status}` })
    }
  }
}

// Hand-tracked status drift in the overview's Sequence table (doctor check 13 outlaws it).
// Whole-cell match only: a brief legitimately NAMED "mark-as-done flow" is not drift.
const overview = path.join(roadmapDir, '00-overview.md')
if (fs.existsSync(overview)) {
  const rows = fs.readFileSync(overview, 'utf8').split('\n').filter(l => /^\|\s*\d+[A-Za-z]?\s*\|/.test(l))
  const STATUSY = /^(?:[✅✔❌🟢🟠]\s*)?(planned|unplanned|done|in.?progress|in.?flight|shipped|completed?|wip|todo)[.!]?$|^[✅✔❌🟢🟠]$/i
  const cells = rows.flatMap(l => l.split('|').map(c => c.trim())).filter(c => STATUSY.test(c))
  if (cells.length) {
    pushAnomaly({ kind: 'hand-tracked-status', detail: `docs/roadmap/00-overview.md Sequence table carries hand-tracked status cell(s): ${[...new Set(cells)].join(', ')} — statuses live only in this derivation; strip that column` })
  }
}

// A contracted, unclosed prototype whose citing specs are all done: a hygiene anomaly carrying
// the one close command.
{
  const protoRoot = path.join(root, 'design/prototypes')
  let stems = []
  try { stems = fs.readdirSync(protoRoot, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort() } catch { stems = [] }
  let citers = null
  for (const stem of stems) {
    let st = null
    try { st = JSON.parse(fs.readFileSync(path.join(protoRoot, stem, 'status.json'), 'utf8')) } catch { continue }
    const marks = (st && st.marks) || {}
    if (!marks.testsDerived || marks.closed) continue
    if (citers === null) {
      citers = new Map()
      for (const file of walkMd(path.join(root, 'specs'))) {
        const fm = fmMap(fs.readFileSync(file, 'utf8'))
        if (!fm.status || !fm.prototype || fm.status === 'superseded') continue
        if (!citers.has(fm.prototype)) citers.set(fm.prototype, [])
        citers.get(fm.prototype).push(fm.status)
      }
    }
    const statuses = citers.get(stem) || []
    if (statuses.length && statuses.every(s => s === 'done')) {
      pushAnomaly({
        kind: 'prototype-open',
        detail: `prototype ${stem}: every citing spec is done; its worktree, proto/${stem} and database are still there`,
        paste: `node "$(spec-paths prototype-driver)" ${stem} --root . --mark closed`,
      })
    }
  }
}

// ---- --next: recommended next command --------------------------------------------------------

// Resolve a depends_on ref against the LIVE specs; a retired dependency never blocks.
function specDep(ref) {
  return specByTail.get(path.basename(ref)) || specs.find(x => x.path === ref || x.path.endsWith('/' + ref))
}

// The serial reason for two DIFFERENT briefs (num strings): the roadmap dependency path, or null
// when unrelated (= parallel-ok). Shared by the vs-top annotation and pairwise lane admission.
function briefSerialReason(a, b) {
  if (briefDepPath(a, b)) return `brief ${a} depends on ${b}`
  if (briefDepPath(b, a)) return `brief ${b} depends on ${a}`
  return null
}

// 'a' | 'a, b' | 'a, b (+3 more)' — shared by the 🔶 heads-up and the File Plan overlap reason.
function shownFiles(paths) {
  return paths.slice(0, 2).join(', ') + (paths.length > 2 ? ` (+${paths.length - 2} more)` : '')
}

// Parallelism verdict between two deriveNext entries — the one derivation for the vs-top
// annotation and pairwise lane admission. Both briefed → the brief verdict; otherwise both
// need a File Plan with rows, and the shared paths minus the exempt set (policy.fanout.overlapExempt
// globs plus the pipeline rules file) decide. string = serial, null = parallel, undefined = no claim.
let exemptCache = null
function exemptSet() {
  if (!exemptCache) {
    const cfg = readHostConfig(root)
    exemptCache = {
      globs: hostPolicy(root).fanout.overlapExempt,
      rules: cfg && typeof cfg.pipelineRules === 'string' && cfg.pipelineRules ? cfg.pipelineRules : null,
    }
  }
  return exemptCache
}
function pairSerialReason(a, b) {
  const rel = relateBriefs(a.brief, b.brief)
  if (rel.relation === 'same') return `shared brief ${briefNum(a.brief)}`
  if (rel.relation === 'different') return briefSerialReason(briefNum(a.brief), briefNum(b.brief))
  const sa = specs.find(x => x.path === a.path), sb = specs.find(x => x.path === b.path)
  if (!sa || !sb || !sa.filePlan.length || !sb.filePlan.length) return undefined
  const ex = exemptSet()
  const shared = sa.filePlan.filter(f => sb.filePlan.includes(f))
    .filter(f => f !== ex.rules && !ex.globs.some(g => globMatch(g, f)))
  return shared.length ? `File Plan overlap: ${shownFiles(shared)}` : null
}

// Does brief a transitively depend on brief b (via roadmap `Depends on:` headers)?
function briefDepPath(a, b) {
  const seen = new Set()
  const stack = [...((briefByNum.get(a) || { depends_on: [] }).depends_on)]
  while (stack.length) {
    const d = stack.pop()
    if (d === b) return true
    if (seen.has(d)) continue
    seen.add(d)
    const dep = briefByNum.get(d)
    if (dep) stack.push(...dep.depends_on)
  }
  return false
}

// Shared by --next (the lean top-pick line, consumed verbatim by the review stage's close-out)
// and the dashboard — one derivation, two renders.
function deriveNext() {
  const entries = []
  for (const s of specs) {
    if (DONE(s.status) || !KNOWN_STATUS.has(s.status)) continue
    // hardened and implementing both route through the loop.
    const action = s.status === 'draft' ? '/spec:plan' : '/spec:run'
    const blockers = []
    for (const d of s.depends_on) {
      const dep = specDep(d)
      if (dep && !DONE(dep.status)) blockers.push(`${dep.path} (${dep.status})`)
    }
    if (s.status === 'draft' && s.brief.kind === 'briefed' && briefByNum.has(briefNum(s.brief))) {
      for (const d of briefByNum.get(briefNum(s.brief)).depends_on) {
        const dep = briefByNum.get(d)
        if (!dep || !dep.specs.some(x => LANDED(x.status))) blockers.push(`brief ${d} (${dep ? dep.status : 'missing'})`)
      }
    }
    // A queue `after` gate on this spec's (or its brief's) queued position adds one blocker.
    if (queueBlockersBySpec.has(s.path)) blockers.push(queueBlockersBySpec.get(s.path))
    else if (s.brief.kind === 'briefed' && queueBlockersByBrief.has(briefNum(s.brief))) blockers.push(queueBlockersByBrief.get(briefNum(s.brief)))
    const rank = s.status === 'implementing' ? 0 : s.status === 'hardened' ? 1 : 2
    entries.push({
      action, path: s.path, status: s.status, brief: s.brief, blockers,
      note: s.status + (s.brief.kind === 'briefed' ? ` (brief ${briefNum(s.brief)})` : ''),
      rank,
    })
  }
  // Undone prompt queue items compete as their own path:null entries, ordered by queue position.
  if (queueOverlay.on) entries.push(...queueUndonePromptEntries)

  // Unblocked first, then queue position (briefless/unqueued entries after every queued one),
  // then closest-to-done rank, brief order, path — the first line is THE recommendation. With the
  // overlay off queuePos is constant.
  function queuePos(e) {
    if (!queueOverlay.on) return 0
    if (e.queue) return e.__queuePos
    // A queued spec item's own position overrides its brief's queued position.
    if (e.path && queuePosBySpec.has(e.path)) return queuePosBySpec.get(e.path)
    if (e.brief.kind === 'briefed' && queuePosByBrief.has(briefNum(e.brief))) return queuePosByBrief.get(briefNum(e.brief))
    return Infinity
  }
  entries.sort((a, b) =>
    (a.blockers.length ? 1 : 0) - (b.blockers.length ? 1 : 0)
    || queuePos(a) - queuePos(b)
    || a.rank - b.rank
    || briefOrd(a.brief) - briefOrd(b.brief)
    || (a.path || '').localeCompare(b.path || ''))

  // Every spec done (or only blocked ones left): the next ready unplanned brief is the pick.
  const readyBriefs = briefs
    .filter(b => b.status === 'unplanned' && b.depends_on.every(d => {
      const dep = briefByNum.get(d)
      return dep && dep.specs.some(x => LANDED(x.status))
    }))
    .sort((a, b) => briefOrd(parseBrief(a.num)) - briefOrd(parseBrief(b.num)))
  if (readyBriefs.length && !entries.some(e => !e.blockers.length)) {
    const b = readyBriefs[0]
    entries.unshift({ action: '/spec:plan', path: b.file, status: 'unplanned', brief: parseBrief(b.num), blockers: [], note: `brief ${b.num} (${b.name}) unplanned, dependencies met`, rank: -1 })
  }

  // Parallel annotation: each unblocked runner-up vs the top pick. Both need a brief to
  // make a claim; shared brief = same surfaces, a brief dependency path = declared order.
  // A queue prompt entry (brief === null) makes no worktree-build parallelism claim.
  const top = entries[0] && entries[0].queue
    ? entries.find(e => !e.queue && !e.blockers.length)
    : entries[0]
  // A queue prompt entry (top.brief === null) makes no worktree-build parallelism claim —
  // same reasoning as the escape exclusion just above.
  if (top && !top.blockers.length) {
    for (const e of entries.slice(1)) {
      if (e === top || e.blockers.length || e.action === '/spec:fix' || e.queue) continue
      const reason = pairSerialReason(e, top)
      if (reason === undefined) {
        const rel = relateBriefs(e.brief, top.brief)
        if (rel.relation === 'unknown') e.parallelUnknown = `${rel.reason}; no File Plan rows`
        continue
      }
      if (reason) { e.parallel = false; e.parallelReason = reason }
      else e.parallel = true
    }
  }
  return entries
}

// Message when the next-derivation has nothing actionable — shared by both renders.
function nothingNextLine() {
  const unplanned = briefs.filter(b => b.status === 'unplanned').length
  return specs.length === 0 && !unplanned ? 'nothing next — no specs or briefs found'
    : unplanned ? `nothing actionable — all specs done; ${unplanned} unplanned brief(s) blocked on unmet dependencies`
    : 'nothing next — all specs done, no unplanned briefs'
}

// --next: the top pick alone, @-prefixed so it pastes straight into Claude Code; --json gets the
// full entry list.
if (nextMode) {
  const entries = deriveNext()
  if (json) {
    // A queue prompt entry's --json shape is a frozen, append-only 7-key object
    // (action/path/queue/status/brief/blockers/note) with no parallel/parallel_reason
    // decoration — it never took part in the parallel-annotation loop above (no brief to
    // claim against), so the generic augmentation is skipped for it, never applied then
    // nulled out.
    writeLine(1, JSON.stringify({
      next: entries.map(({ rank, parallelReason, parallelUnknown, __queuePos, __queueId, __after, __origin, __trigger, __batch, __payload, ...e }) =>
        e.queue ? { ...e, brief: briefNum(e.brief) } : { ...e, brief: briefNum(e.brief), parallel: e.parallel === undefined ? null : e.parallel, parallel_reason: parallelReason || null }),
    }, null, 2))
    process.exit(0)
  }
  const out = ['🎯 Next']
  if (!entries.length) {
    out.push(`✨ ${nothingNextLine()}`)
  } else {
    const top = entries[0]
    // A prompt item's payload prints verbatim, with no `@path` suffix (path is null).
    out.push(top.path ? `${top.action} @${top.path}` : top.action)
    top.blockers.forEach((b, i) =>
      out.push(`   ${i === top.blockers.length - 1 ? '└─' : '├─'} ⏳ ${b}`))
  }
  writeLine(1, out.join('\n'))
  process.exit(0)
}

// ---- --lanes --json: the fan-out's machine surface --------------------------------------------

if (lanesMode) {
  const gitOut = (args) => {
    const r = spawnSync('git', args, { encoding: 'utf8' })
    return r.error || r.status !== 0 ? null : r.stdout
  }
  const realOr = p => { try { return fs.realpathSync(p) } catch (e) { return path.resolve(p) } }
  // Porcelain blocks: `worktree <path>` then `branch refs/heads/<name>` — the first block is the main worktree.
  const wtBlocks = (gitOut(['-C', root, 'worktree', 'list', '--porcelain']) || '').split(/\n\n+/)
    .map(b => ({
      dir: ((b.match(/^worktree (.+)$/m) || [])[1]) || null,
      branch: ((b.match(/^branch refs\/heads\/(.+)$/m) || [])[1]) || null,
    }))
    .filter(b => b.dir)
  const top = (gitOut(['rev-parse', '--show-toplevel']) || '').trim()
  // Refuse when cwd sits in a LINKED worktree of the repo --root names; a cwd outside that repo is
  // not a worker's tree and passes (the --root pair is how callers aim the mode at a host).
  if (wtBlocks.length && top && wtBlocks.slice(1).some(b => realOr(b.dir) === realOr(top))) {
    console.error(`spec-status: --lanes runs from the main worktree — cd ${wtBlocks[0].dir}`)
    process.exit(2)
  }
  const worktreeOf = branch => (wtBlocks.slice(1).find(b => b.branch === branch) || {}).dir || null
  const all = deriveNext()
  const { lanes, laneClash, later } = laneAdmission(all)
  const branchFor = p => 'spec/' + path.basename(p).replace(/\.[^.]*$/, '')
  const runLanes = lanes.filter(e => e.action === '/spec:run').map(e => {
    const branch = branchFor(e.path)
    return { action: e.action, path: e.path, brief: briefNum(e.brief), status: e.status, note: e.note, branch, worktree: worktreeOf(branch) }
  })
  const serialized = later.filter(e => e.action === '/spec:run' || laneClash.has(e)).map(e => ({
    path: e.path, brief: briefNum(e.brief),
    reason: laneClash.get(e) || e.parallelReason || 'queued behind the top pick',
  }))
  // the repo files a fix's text names, and the open specs whose File Plans name them.
  const openPlans = specs.filter(sp => KNOWN_STATUS.has(sp.status) && !DONE(sp.status))
  const filesOf = text => namedFiles(text, {
    exists: f => fs.existsSync(path.join(root, f)),
    plans: openPlans.map(sp => sp.filePlan),
  })
  const overlapsOf = files => (files ? openPlans.filter(sp => files.some(f => sp.filePlan.includes(f))).map(sp => sp.path) : [])
  const fixes = all.filter(e => e.action === '/spec:fix' || (e.queue && String(e.action).startsWith('/spec:fix '))).map(e => {
    if (!e.queue) {
      const files = filesOf(e.note)
      return { action: e.action, path: e.path, note: e.note, queue_id: null, after: null, origin: null, trigger: null, batch: null, files, overlaps: overlapsOf(files), blocker: null }
    }
    const files = filesOf(e.__payload)
    return {
      action: `/spec:fix ${e.__queueId}`, path: null, note: e.note, queue_id: e.__queueId, after: e.__after || null,
      origin: e.__origin, trigger: e.__trigger, batch: e.__batch,
      files, overlaps: overlapsOf(files), blocker: e.blockers[0] || null,
    }
  })
  writeLine(1, JSON.stringify({ lanes: runLanes, serialized, fixes, born: queueBorn }, null, 2))
  process.exit(0)
}

// ---- --brief NN preflight -------------------------------------------------------------------

if (briefFilter) {
  const b = briefByNum.get(briefFilter)
  if (!b) {
    console.error(`no docs/roadmap/${briefFilter}-*.md found`)
    process.exit(2)
  }
  const unmet = b.depends_on.filter(d => {
    const dep = briefByNum.get(d)
    return !dep || !dep.specs.some(s => LANDED(s.status))
  })
  const report = {
    brief: b.num, name: b.name, status: b.status,
    depends_on: b.depends_on.map(d => {
      const dep = briefByNum.get(d)
      return { brief: d, status: dep ? dep.status : 'missing', met: !unmet.includes(d) }
    }),
    ready: unmet.length === 0,
  }
  if (json) console.log(JSON.stringify(report, null, 2))
  else if (report.ready) console.log(`brief ${b.num} (${b.name}): all ${b.depends_on.length || 'zero'} dependencies met`)
  else console.log(`brief ${b.num} (${b.name}): UNMET dependencies — ${unmet.map(d => `${d} (${(briefByNum.get(d) || { status: 'missing' }).status})`).join(', ')}`)
  process.exit(unmet.length ? 1 : 0)
}

// ---- the /spec:status dashboard (default render + --all) --------------------------------------
// A pure view of the same derivation as --json.

if (json) {
  // `superseded` (the brief-level flag, internal-only per its own comment above) is
  // stripped here alongside `specs: ss` — this dashboard JSON shape is unchanged.
  writeLine(1, JSON.stringify({ briefs: briefs.map(({ specs: ss, superseded, ...b }) => ({ ...b, specs: ss.map(s => ({ path: s.path, status: s.status })) })), specs: specs.map(sp => ({ ...sp, brief: briefNum(sp.brief) })), superseded: retired.map(s => ({ path: s.path, superseded_by: s.superseded_by })), anomalies }, null, 2))
  process.exit(0)
}

// Lane admission: pairwise-greedy over unblocked, non-escape entries — shared by the Next block
// and --all's sections so they never disagree.
function laneAdmission(entries) {
  const unblocked = entries.filter(e => !e.blockers.length && e.action !== '/spec:fix' && !e.queue)
  const blocked = entries.filter(e => e.blockers.length)
  const lanes = unblocked.length ? [unblocked[0]] : []
  const laneClash = new Map()
  for (const e of unblocked.slice(1)) {
    if (e.parallel !== true) continue
    const clash = lanes.slice(1).find(l => pairSerialReason(e, l))
    if (clash) laneClash.set(e, pairSerialReason(e, clash))
    else lanes.push(e)
  }
  const later = unblocked.slice(1).filter(e => !lanes.includes(e))
  return { unblocked, blocked, lanes, laneClash, later }
}
// Path-shortening is global, not anchored: a queue gate reads "after specs/2026…/08-x.md
// (hardened)", where the path is not at the start of the string.
const shortBlocker = b => b.replace(/\S*\//g, '').replace(/\s*\([^)]*\)$/, '').replace(/\.md$/, '')
// n counts open work below the top pick —
// every lane the 🎯 Next block printed is startable now, so the clause says "open", not "waiting".
const waitClause = n => `${n} more open`

{
  // Default render: 🗺️ Roadmap, 🎯 Next, up to three ⚠️ decide lines, one footer. `--all` lifts the
  // decide cap and adds 🕓/⛔ under Next plus 🧹 Hygiene before the footer.
  const out = []
  const BRIEF_ICON = { done: '✅', 'in-flight': '🔨', unplanned: '⬜', superseded: '⛔' }

  const entries = deriveNext()
  const decideAnomalies = anomalies.filter(a => a.audience === 'decide')
  const hygieneAnomalies = anomalies.filter(a => a.audience === 'hygiene')
  const shownDecide = allMode ? decideAnomalies : decideAnomalies.slice(0, 3)
  const decideOverflow = allMode ? 0 : Math.max(0, decideAnomalies.length - 3)

  if (briefs.length) {
    out.push('', '🗺️ Roadmap')
    const rows = []
    for (let i = 0; i < briefs.length; i++) {
      const b = briefs[i]
      // Runs of same-status unplanned/done/superseded briefs collapse to one range row.
      let j = i
      const collapsible = b.status === 'unplanned' || b.status === 'done' || b.status === 'superseded'
      while (collapsible && j + 1 < briefs.length && briefs[j + 1].status === b.status) j++
      if (j > i) {
        const run = briefs.slice(i, j + 1)
        const phases = [...new Set(run.map(x => x.phase).filter(Boolean))]
        const phase = phases.length > 1 ? `${phases[0]}–${phases[phases.length - 1]}` : phases[0] || '—'
        const tail = b.status === 'done'
          ? `done (${run.length} briefs, ${run.reduce((n, x) => n + x.specs.length, 0)} specs)`
          : `${b.status} (${run.length} briefs)`
        rows.push({ icon: BRIEF_ICON[b.status], label: `${b.num}–${briefs[j].num}`, phase, tail })
        i = j
        continue
      }
      const total = b.specs.length
      const nDone = b.specs.filter(s => DONE(s.status)).length
      // Open specs are deliberately NOT listed here — the 🎯 Next section owns them; a per-row
      // list wraps hard on narrow terminals and duplicates what's below.
      const bar = total
        ? '▓'.repeat(nDone === total ? 10 : Math.min(9, Math.floor(nDone / total * 10))).padEnd(10, '░') + ` ${nDone}/${total}`
        : b.status
      rows.push({ icon: BRIEF_ICON[b.status], label: `${b.num} ${b.name}`, phase: b.phase || '—', tail: bar })
    }
    const lw = Math.max(...rows.map(r => r.label.length))
    const pw = Math.max(...rows.map(r => r.phase.length))
    for (const r of rows) out.push(`   ${r.icon} ${r.label.padEnd(lw)}  ${r.phase.padEnd(pw)}  ${r.tail}`)
  }

  // Every open-work row is one line: a prose queue row is cut to the terminal width (100 off a
  // TTY) and led by its queue id; a command row stays byte-identical so it survives a copy.
  const rowWidth = process.stdout.columns || 100
  const idWidth = Math.max(0, ...entries.filter(e => e.__queueId).map(e => e.__queueId.length))
  // a prompt row carries its provenance line directly under it (before any ⏳ branch).
  const emit = e => {
    out.push(cmd(e))
    const l = e.queue ? originLine({ origin: e.__origin, trigger: e.__trigger }) : null
    if (l) out.push(`   ${l}`)
  }
  const cmd = e => {
    if (e.path) return `${e.action} @${e.path}`
    const head = e.__queueId ? `${e.__queueId.padEnd(idWidth)}  ` : ''
    const flat = String(e.action).replace(/\s+/g, ' ').trim()
    const room = Math.max(20, rowWidth - head.length)
    return head + (flat.length <= room ? flat : flat.slice(0, room - 1) + '…')
  }

  // 🎯 Next, identical in both renders: (a) every /spec:fix entry; (b) the ⚡ parallel-lanes
  // fan-out with its 🔶 heads-up, or the single lane's 🚦 solo tag; (c) else the top pick plus its
  // ⏳ branch; (d) ✨ nothingNextLine() with no entries. Every command renders through cmd().
  out.push('', '🎯 Next')
  const { blocked, lanes, laneClash, later } = laneAdmission(entries)
  const escapes = entries.filter(e => e.action === '/spec:fix')
  escapes.forEach(e => out.push(cmd(e)))
  const prompts = entries.filter(e => e.queue && !e.blockers.length)
  prompts.forEach(emit)
  let laneRendered = false
  if (lanes.length > 1) {
    laneRendered = true
    out.push(`⚡ ${lanes.length} parallel lanes — first stays on main, each other lane gets a worktree (/git:enter-worktree):`)
    lanes.forEach(emit)
    // Merge-conflict heads-up: annotation only, never a verdict change — the corpus audit
    // showed File Plan overlap can't DECIDE parallelism (51% of unrelated-brief pairs
    // overlap; strict demotion would serialize half of everything) but it can PREDICT
    // where two lanes will collide at merge-back. One branch line per overlapping lane
    // pair; with 3+ lanes each line names its two specs so it stays unambiguous.
    const bySpecPath = new Map(specs.map(s => [s.path, s]))
    const overlaps = []
    for (let i = 0; i < lanes.length; i++) {
      for (let j = i + 1; j < lanes.length; j++) {
        const a = bySpecPath.get(lanes[i].path), b = bySpecPath.get(lanes[j].path)
        const shared = a && b ? a.filePlan.filter(f => b.filePlan.includes(f)) : []
        if (shared.length) overlaps.push({ a: lanes[i], b: lanes[j], shared })
      }
    }
    overlaps.forEach((o, i) => {
      const shown = shownFiles(o.shared)
      const pair = lanes.length > 2 ? `${path.basename(o.a.path)} × ${path.basename(o.b.path)}: ` : ''
      out.push(`   ${i === overlaps.length - 1 ? '└─' : '├─'} 🔶 ${pair}merge-conflict risk: ${shown}`)
    })
  } else if (lanes.length === 1) {
    laneRendered = true
    emit(lanes[0])
    // "Is this parallelable?" must never be answered by the ABSENCE of the ⚡ header —
    // when other open work exists, the solo pick states it out loud.
    if (later.length || blocked.length) out.push('   └─ 🚦 solo')
  }
  // When branch (c) below fires, the top pick it prints is also the head of `blocked` —
  // remembered here so --all's ⛔ section can filter it back out instead of re-printing it.
  let topPrintedAsBlocked = false
  if (!escapes.length && !prompts.length && !laneRendered) {
    if (!entries.length) {
      out.push(`   ✨ ${nothingNextLine()}`)
    } else {
      const top = entries[0]
      topPrintedAsBlocked = true
      emit(top)
      top.blockers.forEach((b, i) =>
        out.push(`   ${i === top.blockers.length - 1 ? '└─' : '├─'} ⏳ ${shortBlocker(b)}`))
    }
  }

  if (allMode) {
    // `--all` adds only what Next did not show as startable: 🕓 after that:, then ⛔ blocked:.
    if (later.length) {
      out.push('', '🕓 after that:')
      // Consecutive entries with the same reason share one branch line.
      const reasonOf = e => e.parallel === false ? `⛓️ ${e.parallelReason}`
        : laneClash.has(e) ? `⛓️ ${laneClash.get(e)}`
        : `🤷 no brief — parallelism unknown (${e.parallelUnknown || 'no File Plan rows'})`
      later.forEach((e, i) => {
        emit(e)
        const reason = reasonOf(e)
        const next = later[i + 1]
        if (!next || reasonOf(next) !== reason) out.push(`   └─ ${reason}`)
      })
    }
    // Filter out the branch-(c) top pick already printed above.
    const blockedForAll = topPrintedAsBlocked ? blocked.filter(e => e !== entries[0]) : blocked
    if (blockedForAll.length) {
      out.push('', '⛔ blocked:')
      blockedForAll.forEach(e => {
        emit(e)
        e.blockers.forEach((b, i) =>
          out.push(`   ${i === e.blockers.length - 1 ? '└─' : '├─'} ⏳ ${shortBlocker(b)}`))
      })
    }
  }

  // ⚠️ Decide lines: `⚠️ {line}` then `   {ask}  {paste}`, capped at three in derivation order;
  // `--all` lifts the cap.
  if (shownDecide.length) {
    out.push('')
    for (const a of shownDecide) {
      out.push(`⚠️ ${a.line}`)
      out.push(`   ${a.ask}  ${a.paste}`)
    }
  }

  if (allMode) {
    // 🧹 Hygiene keeps its place after the decide lines, ahead of the footer.
    out.push('', `🧹 Hygiene (${hygieneAnomalies.length}) — /spec:doctor`)
    for (const a of hygieneAnomalies) out.push(`   [${a.kind}] ${a.detail}`)
  }

  // The one-line footer — glyph + one sentence, the LAST line printed. A blocked top pick names
  // its short blocker; else ready/nothing. Clauses ride after the head, each only when non-zero:
  // wait (the 🟢 line prints "nothing else open" at 0), decide-overflow, hygiene count, then the
  // done-since-release count ("never released" with no CLEAN release row).
  {
    // Wait count n excludes escape entries, then the top pick itself unless it is an escape.
    const nonEscape = entries.filter(e => e.action !== '/spec:fix')
    const topIsEscape = entries.length > 0 && entries[0].action === '/spec:fix'
    const n = topIsEscape ? nonEscape.length : (nonEscape.length ? nonEscape.length - 1 : 0)
    const k = decideOverflow
    const h = hygieneAnomalies.length
    let glyph, head
    if (!entries.length) {
      // Every entries.length === 0 shape is ⬜, paired with the Next block's ✨ line.
      glyph = '⬜'
      head = 'nothing waits'
    } else if (entries[0].blockers.length) {
      glyph = '🟠'
      head = `next is blocked · waiting on ${shortBlocker(entries[0].blockers[0])}`
    } else {
      glyph = '🟢'
      head = 'next is ready'
    }
    const clauses = []
    if (glyph === '🟢') clauses.push(n === 0 ? 'nothing else open' : waitClause(n))
    else if (n > 0) clauses.push(waitClause(n))
    if (k > 0) clauses.push(`${k} more to decide (--all)`)
    if (h > 0) clauses.push(`${h} hygiene finding${h === 1 ? '' : 's'} (/spec:doctor)`)
    const { done, released } = sinceLastRelease(ledgerRows)
    if (done >= 1) clauses.push(released ? `${done} done since last release` : `${done} done, never released`)
    // Two render-only ceremony lines ride just above the footer (specs/20261103/13 D15).
    const cm = ceremonyMetrics(ledgerRows)
    const perSpec = cm.specs > 0 ? (cm.suiteRuns / cm.specs).toFixed(1) : 'n/a'
    const ratio = cm.specs > 0 && cm.productionLines > 0 ? (cm.testLines / cm.productionLines).toFixed(2) : 'n/a'
    out.push('', `📈 suite runs per spec: ${perSpec} (${cm.specs} spec${cm.specs === 1 ? '' : 's'})`,
      `📈 test:production lines: ${ratio} (+${cm.testLines}/+${cm.productionLines} over ${cm.closes} close${cm.closes === 1 ? '' : 's'})`)
    out.push(`${glyph} ${head}${clauses.map(c => ` · ${c}`).join('')}`)
  }

  // Redraw from the top of the viewport, only on a TTY so piped output stays escape-free.
  if (process.stdout.isTTY) process.stdout.write('\x1Bc')
  console.log(out.join('\n'))
}
