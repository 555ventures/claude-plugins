#!/usr/bin/env node
'use strict'
// spec-status.js [--root <dir>] [--json] [--brief NN] [--next] — derive pipeline status,
// never store it.
//
// Human output is ALWAYS the pretty render: bare invocation → the emoji dashboard;
// --next → the lean 🎯 top-pick line (@-prefixed so it pastes straight into Claude Code).
// --json is the only machine format (doctor check 14, release). --pretty is accepted as a
// no-op for old call sites; there is no plain human render anymore.
//
// The single source of truth for "where is the work": specs/** frontmatter (`status:`,
// `brief:`, `depends_on:`, `design:`, `designed:`) and docs/roadmap/NN-*.md headers
// (`Depends on:`). Roadmap brief status is DERIVED per /spec:doctor check 14 — no specs
// stamped `brief: NN` → unplanned; any matching spec not done → in-flight; all matching
// specs done → done. Nothing here writes; this is a viewer. Consumers: /spec:status
// (render + --next section 2), /spec:doctor check 14 (drift report), /spec:plan Phase 0
// (--brief dependency preflight), the /spec:review close-out Next pointer (--next), and
// external `--json` consumers of the frozen --next --json shape.
//
// A `done` spec also carries a derived observation sub-state read from `.claude/spec-runs*.jsonl`
// (live + year archives) `stage:"observe"` rows — written by observe-ci.js, never here. Offline
// read only (ledger absence = every done spec reports "ok"); the network leg that actually
// queries CI lives solely in observe-ci.js. Observation is a red alarm, not a certification
// (specs/20260807/01-observation-red-alarm.md D2): the derived state is `n/a`/`ok`/`red` only —
// `pending` is retired, nothing renders for "ok" (no ⏳, no "unobserved" anywhere). Observation
// never blocks depends_on satisfaction; a red observation turns the dashboard headline 🔴, prints
// one 📡 line, and becomes the --next top pick as a full oracle-shaped `/spec:escape` entry
// (unchanged from specs/20260805/03's D5).
//
// --next derives the recommended next command per open spec: draft → /spec:plan; hardened
// (with or without `design: true`, `designed:` set or not) and implementing both → /spec:run
// — the loop derives design-due, build, and review from disk itself, so this derivation offers
// exactly one next-command per state (`/spec:design`, `/spec:build`, and `/spec:review` are
// never emitted here). Closest-to-done first, blocked entries last,
// and when every spec is done the next ready unplanned brief becomes the /spec:plan pick.
// Unblocked runner-up entries are annotated parallel-ok/serial relative to the top pick:
// spec-level depends_on can never link two unblocked entries (a non-done dep is a blocker),
// so the check is brief-level — shared brief or a transitive brief dependency path in either
// direction → serial; distinct unrelated briefs → parallel-ok (separate worktrees); either
// side briefless → no claim. The dashboard's ⚡ lanes claim MUTUAL parallelism, so admission
// is pairwise-greedy: a parallel-ok runner-up joins only if also unrelated to every lane
// already admitted (vs-top alone would let two mutually-ordered briefs share the fan-out).
// Everything else lands under 🕓 with a ⛓️/🤷 branch line giving the derived reason (or the
// no-claim) — never an unexplained bucket.
//
// specs/20260823/08-derived-session-queue.md D2/D9 (retooled by specs/20260903/03-pipeline-
// queue-mechanics.md D1-D4): `--next` additionally consults an OPTIONAL per-repo session
// queue (`<git-common-dir>/spec-queue.json`, written only by spec-queue.js) as a read-only
// input overlay to deriveNext(): queue position reorders unblocked entries across briefs
// (deliberately overriding cross-brief closest-to-done) and a queued `spec` item's own
// position overrides its brief's; undone prompt items surface as new entries with no
// `path`; any item may carry an `after` gate on a spec or a brief — a not-ready item's
// entries gain a `after <target> (<state>)` blocker and sink into the blocked tier, per
// lib/queue.js's isItemReady (shared with spec-queue.js's own write path); a linked
// worktree suppresses the overlay entirely (the global pointer misleads mid-spec). A
// newly-landed on-disk brief absent from the queue is appended last with no stamp and no
// anomaly (D4 retires the dependency-aware auto-placement and its veto/accept notice).
// Resolution is fail-soft in every direction (A5) — no git, a git error, no queue file, an
// unparseable file, or a linked worktree all leave today's derivation byte-for-byte
// unchanged, with zero stderr; only an unparseable file additionally earns one
// `queue-unparseable` anomaly. This script never writes the queue file — spec-queue.js is
// its sole writer.
//
// Exit codes: 0 derived (anomalies are report lines, not failures); with --brief NN,
// 1 = that brief has an unmet dependency (no spec at implementing/done); 2 = usage.

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
// The 64 KiB process.exit stdout-truncation mechanism this synchronous writer exists to avoid:
// spec/scripts/lib/driver-io.js.
function writeOut(str) {
  const buf = Buffer.from(str + '\n', 'utf8')
  let off = 0
  while (off < buf.length) {
    try {
      off += fs.writeSync(1, buf, off, buf.length - off)
    } catch (e) {
      if (e.code === 'EAGAIN') continue
      throw e
    }
  }
}
const { parseFilePlan } = require('./lib/file-plan')
const { readLedgerRows, qualifyingObservation } = require('./lib/observation')
const {
  isSupersededBriefText, isItemDone, isItemReady, makeCtx, dedupeItems, stripAutoPlaced,
  reconcileMissingBriefs,
} = require('./lib/queue')
// D2 (specs/20260823/04-review-close-hardening.md, rv_6825fa48c98d): the local frontmatter() kv
// loop this replaced stripped a trailing comment at the FIRST "#" regardless of what preceded it,
// corrupting an unspaced value like `design_source: https://x/p#frag` — the sole shared derivation
// strips only a whitespace-preceded "#", per YAML unquoted-scalar semantics.
const { fmMap } = require('./lib/frontmatter')
// specs/20260902/11-brief-from-approved-set.md D6: the 🧭 misunderstandings line reads
// design/mocks/ledger.md through this lib the same way genesis-driver.js's BRIEF precondition
// check does — never a second ledger parser.
const mocksLedgerLib = require('./lib/mocks-ledger')

// Brief ids are NN plus an optional letter suffix — ad-hoc briefs slot between neighbors
// as 04a, 04b, … Normalize any spelling (4b, 04B, 04b-auth) to the canonical zero-padded
// lowercase id; briefOrd maps ids to a sortable number where 04 < 04a < 04b < 05.
function normBrief(v) {
  const m = String(v).trim().match(/^(\d+)([A-Za-z]?)(?:-.*)?$/)
  return m ? m[1].padStart(2, '0') + m[2].toLowerCase() : String(v).trim()
}
// `brief: n/a` (also none/-/—) is the sanctioned "ad-hoc spec, no roadmap brief" spelling —
// deliberately briefless, NOT a dangling pointer, so it never earns an orphan-stamp anomaly.
const BRIEFLESS = /^(n\/a|none|-|—)$/i
function briefOrd(num) {
  const m = num.match(/^(\d+)([a-z]?)$/)
  return m ? Number(m[1]) + (m[2] ? (m[2].charCodeAt(0) - 96) / 100 : 0) : NaN
}

let root = '.'
let json = false
let briefFilter = null
let nextMode = false
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--root') root = argv[++i]
  else if (argv[i] === '--json') json = true
  else if (argv[i] === '--brief') briefFilter = normBrief(argv[++i])
  else if (argv[i] === '--next') nextMode = true
  else if (argv[i] === '--pretty') { /* no-op: pretty is the default human render */ }
  else {
    console.error('usage: spec-status.js [--root <dir>] [--json] [--brief NN | --next]')
    process.exit(2)
  }
}
if (nextMode && briefFilter) {
  console.error('--next and --brief are mutually exclusive')
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

// File Plan parsing (parseFilePlan/splitPlanCell) lives in lib/file-plan.js (D2,
// specs/20260805/01-review-scope-reconciliation.md) — scope-reconcile.js shares this derivation
// rather than carrying a second copy that could drift. CLI behavior here is byte-identical
// (AC-20260805-01-7).

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
    brief: fm.brief && !BRIEFLESS.test(fm.brief.trim()) ? normBrief(fm.brief) : null,
    area: fm.area || null,
    date: fm.date || null,
    design: fm.design === 'true',
    designed: fm.designed || null,
    depends_on: parseList(fm.depends_on),
    superseded_by: fm.superseded_by || null,
    filePlan: parseFilePlan(text),
  })
}

// ---- retirement: status: superseded -----------------------------------------------------------
// `status: superseded` retires a preserved spec. It is terminal and UNCONDITIONAL: the spec
// leaves the derivation entirely — no brief membership, no Next entry, no anomaly, ever.
// Silence is the whole point. A retired spec sitting in the repo for a year must never
// accumulate report lines, and this derivation must never invent an errand to earn that
// silence.
// `superseded_by:` is optional provenance: free-form (spec path, ADR path, prose), carried into
// --json for whoever wants the trail, never validated and never a gate.
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
    // Header fields ride `·`-separated lines under the H1 and may wrap mid-list, so flatten
    // the pre-section head to one line before matching — a wrapped `Depends on:` must not
    // silently drop the dependencies on the continuation line.
    const head = text.split(/\n## /)[0].replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ')
    const dep = head.match(/Depends on:\s*([^·]*?)\s*(?:·|$)/)
    const phase = head.match(/Phase:\s*(P\d+)/)
    // Parse the dependency value item-wise: split on commas, accept an item only if it is
    // exactly a brief id (NN/NNa, optional "brief" prefix or name suffix) or a sanctioned
    // "none" spelling. Harvesting digits from the whole line turned a spec reference
    // (`Depends on: spec 20260804/02 at done`) into permanent phantom brief dependencies —
    // 20260804 can never exist, and the 02 fragment binds to an unrelated real brief.
    // Items that parse as neither are kept aside and surfaced as anomalies, never as deps.
    // A trailing parenthetical note — `16 (the review driver this brief mirrors)` — is the
    // author's natural spelling and is read as the bare id: the note is ignored, the
    // dependency binds. Commas inside the note never split the item.
    const deps = [], depRejects = []
    const items = dep ? dep[1].replace(/\([^)]*\)/g, m => m.replace(/,/g, '\u0000')).split(',').map(s => s.replace(/\u0000/g, ',').replace(/\s+/g, ' ').trim()).filter(Boolean) : []
    for (const item of items) {
      if (BRIEFLESS.test(item)) continue
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
      // specs/20260823/08 D6: internal-only (never exposed via --json) — a superseded
      // roadmap brief (the v7 "*(superseded by v7)*" entries) is excluded from the queue
      // overlay's virtual reconcile so it never earns a perpetual auto-placement anomaly.
      superseded: isSupersededBriefText(text),
    })
  }
}

// ---- derivation (doctor check 14) -----------------------------------------------------------

const DONE = s => s === 'done'
const LANDED = s => s === 'done' || s === 'implementing'
// The hook-enforced spec lifecycle (spec/templates/spec.md). Anything else is a hand edit
// this derivation can't reason about — fail closed: flag it, never route it to an action.
const KNOWN_STATUS = new Set(['draft', 'hardened', 'implementing', 'done'])

// ---- .claude/spec-runs*.jsonl (live + archives) — done-spec observation sub-state (D2) --------
// Offline read only — this is a VIEW; the network leg lives solely in observe-ci.js. Absence of
// the ledger means every done spec resolves to "ok" (silent — a host that has never run
// observe-ci has never seen a red run, which renders identically to a host that has and stayed
// green — both collapse to the same "ok" render by design).
// readLedgerRows/qualifyingObservation (D2 algorithm) live in lib/observation.js — shared
// with observe-ci.js instead of a second derivation drifting apart (D2,
// specs/20260805/03-done-unobserved-observation.md). CLI behavior here is byte-identical.
function observationFor(rows, specPath) {
  const row = qualifyingObservation(rows, specPath)
  return row && row.ci === 'red' ? { state: 'red', row } : { state: 'ok', row: null }
}

const ledgerRows = readLedgerRows(root)
// observationRows kept OUT of the spec objects (never leaks into --json specs[] beyond the
// documented "observation" string field, Contracts) — a side map keyed by spec path instead.
const observationRows = new Map()
for (const s of specs) {
  if (!DONE(s.status)) { s.observation = 'n/a'; continue }
  const obs = observationFor(ledgerRows, s.path)
  s.observation = obs.state
  if (obs.row) observationRows.set(s.path, obs.row)
}

for (const b of briefs) {
  b.specs = specs.filter(s => s.brief === b.num)
  b.status = b.specs.length === 0 ? 'unplanned' : b.specs.every(s => DONE(s.status)) ? 'done' : 'in-flight'
}
const briefByNum = new Map(briefs.map(b => [b.num, b]))

// ---- specs/20260823/08: read-only session queue overlay (D2/D6/D9) --------------------------
// `git -C <root> rev-parse --git-common-dir`/`--git-dir`, resolved against <root> (never
// --path-format=absolute, git >=2.31-only, A2) — a linked worktree has git-dir != common-dir,
// which is exactly the D9 suppression signal (no second "am I a worktree" check needed).
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

// specs/20260903/03 D1: specStatus(relPath) -> the spec's own frontmatter status, including
// `superseded` (retired specs are filtered OUT of `specs` above but must still resolve here
// so a queued spec item pointing at a since-superseded spec reads correctly) — null only
// when the path never resolved to any spec file at all (never existed, or deleted).
const specStatusMap = new Map(allSpecs.map(s => [s.path, s.status]))
const specStatusFor = p => (specStatusMap.has(p) ? specStatusMap.get(p) : null)

const queueOverlay = resolveQueueOverlay(root)
const queuePosByBrief = new Map()
const queuePosBySpec = new Map()
const queueBlockersByBrief = new Map()
const queueBlockersBySpec = new Map()
// A spec named as the target of any item's still-unmet `after: {spec: …}` gate — regardless
// of the gated item's OWN kind (a gated prompt is the common case, AC-20260903-03-2) — sinks
// to the bottom of the unblocked tier in its own --next entry: recommending it no higher
// than any other ready, independent spec keeps the top line from oscillating between "the
// thing someone is waiting on" and "unrelated ready work" on every derivation. It stays
// genuinely unblocked (blockers: [] untouched) — only its sort position moves.
const queueGateTargetSpecs = new Set()
let queueUndonePromptEntries = []
if (queueOverlay.parseError) {
  anomalies.push({ kind: 'queue-unparseable', detail: `${queueOverlay.parseError} — the session queue overlay is disabled until this is fixed (or the file removed and reseeded with \`spec-queue next\`)` })
}
if (queueOverlay.on) {
  // D4: virtual reconcile — computed here, never written here (spec-queue.js's own
  // reconcile is the persisted twin of this exact algorithm, from lib/queue.js): strip any
  // stale `auto_placed` key, collapse duplicate brief/spec items to their first occurrence,
  // then append any on-disk non-done, non-superseded brief absent from the queue LAST, with
  // no stamp and no anomaly.
  const onDiskBriefs = briefs
    .filter(b => b.status !== 'done' && !b.superseded)
    .map(b => ({ num: b.num }))
  const stripped = stripAutoPlaced(queueOverlay.items)
  const deduped = dedupeItems(stripped)
  const { items: reconciled } = reconcileMissingBriefs(deduped, onDiskBriefs)
  const ctx = makeCtx({
    ledgerRows, briefStatus: n => (briefByNum.get(n) || {}).status, specStatus: specStatusFor, specRoot: root,
  })
  reconciled.forEach((it, i) => {
    if (it.kind === 'brief') {
      queuePosByBrief.set(it.brief, i)
      if (!briefByNum.has(it.brief)) {
        anomalies.push({ kind: 'queue-orphan', detail: `spec-queue.json item points at brief ${it.brief}, which has no docs/roadmap/${it.brief}-*.md — remove it with \`spec-queue done ${it.brief}\`, reorder it away with \`spec-queue move ${it.brief} <n>\`, or restore the brief file` })
      }
    } else if (it.kind === 'spec') {
      queuePosBySpec.set(it.spec, i)
    }
    // D2/D3: a gate on a brief item blocks every open spec entry of that brief; a gate on a
    // spec item blocks that one spec's entry; a gate on a prompt item blocks its own entry
    // (handled below, in the prompt-entries map).
    if (it.kind === 'brief' || it.kind === 'spec') {
      const r = isItemReady(it, ctx)
      if (!r.ready) {
        const blocker = `after ${r.target} (${r.state})`
        if (it.kind === 'brief') queueBlockersByBrief.set(it.brief, blocker)
        else queueBlockersBySpec.set(it.spec, blocker)
      }
    }
    if (it.after && it.after.spec) {
      const r = isItemReady(it, ctx)
      if (!r.ready) queueGateTargetSpecs.add(it.after.spec)
    }
  })
  queueUndonePromptEntries = reconciled
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => it.kind === 'prompt' && !isItemDone(it, ctx).done)
    .map(({ it, i }) => {
      const r = isItemReady(it, ctx)
      const blockers = r.ready ? [] : [`after ${r.target} (${r.state})`]
      return {
        action: it.payload, path: null, status: 'queued', brief: null, blockers,
        note: `queue item ${it.id}`, rank: 0, queue: true, __queuePos: i,
      }
    })
}

// Unknown status: frontmatter carries a word outside the lifecycle. Without this, deriveNext's
// else-branch would recommend /spec:build for it. `superseded` never reaches here — retirement
// filtered it out above — so every hit is a typo or a hand-invented word, which has a real fix.
for (const s of specs) {
  if (!KNOWN_STATUS.has(s.status)) {
    anomalies.push({ kind: 'unknown-status', detail: `${s.path} has status: ${s.status} — not in the spec lifecycle (${[...KNOWN_STATUS].join(' → ')}); fix the frontmatter (to retire a preserved spec: status: superseded)` })
  }
}

// Orphan stamps: spec points at a brief file that doesn't exist.
for (const s of specs) {
  if (s.brief && !briefByNum.has(s.brief)) {
    anomalies.push({ kind: 'orphan-stamp', detail: `${s.path} stamps brief: ${s.brief} but no docs/roadmap/${s.brief}-*.md exists (brief renamed/deleted, or typo)` })
  }
}

// Unparseable dependency item: prose in the `Depends on:` header (a spec reference, a typo).
// Ignored for derivation — a spec-level gate belongs in the brief body, not this header —
// but surfaced so a mistyped brief id doesn't silently vanish from the dependency graph.
for (const b of briefs) {
  for (const r of b.dep_rejects) {
    anomalies.push({ kind: 'unparsed-dependency', detail: `${b.file} Depends on: item "${r}" is not a brief id (NN or NNa) — ignored; if it names a spec-level gate, move it into the brief body` })
  }
}

// Skipped dependency: a brief moved while a declared dependency is still unplanned.
for (const b of briefs) {
  if (b.status === 'unplanned') continue
  for (const d of b.depends_on) {
    const dep = briefByNum.get(d)
    if (!dep) anomalies.push({ kind: 'unknown-dependency', detail: `${b.file} depends on brief ${d}, which doesn't exist` })
    else if (dep.status === 'unplanned') anomalies.push({ kind: 'skipped-brief', detail: `brief ${b.num} (${b.name}) is ${b.status} but its dependency ${d} (${dep.name}) is unplanned — likely skipped; plan it with /spec:plan ${dep.file}` })
  }
}

// Sequence-order skip: an earlier unplanned brief sitting below any later brief that moved.
const moved = briefs.filter(b => b.status !== 'unplanned')
if (moved.length) {
  const maxMoved = moved.reduce((m, b) => briefOrd(b.num) > briefOrd(m.num) ? b : m).num
  for (const b of briefs) {
    if (b.status === 'unplanned' && briefOrd(b.num) < briefOrd(maxMoved) && !anomalies.some(a => a.detail.includes(`dependency ${b.num} `))) {
      anomalies.push({ kind: 'out-of-order', detail: `brief ${b.num} (${b.name}) is unplanned while later brief ${maxMoved} has moved — deliberate reordering or a skip; if it still matters: /spec:plan ${b.file}` })
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
      anomalies.push({ kind: 'skipped-spec', detail: `${s.path} is done but its dependency ${dep.path} is still ${dep.status}` })
    }
  }
}

// Hand-tracked status drift in the overview's Sequence table (doctor check 14 outlaws it).
// Whole-cell match only: a brief legitimately NAMED "mark-as-done flow" is not drift.
const overview = path.join(roadmapDir, '00-overview.md')
if (fs.existsSync(overview)) {
  const rows = fs.readFileSync(overview, 'utf8').split('\n').filter(l => /^\|\s*\d+[A-Za-z]?\s*\|/.test(l))
  const STATUSY = /^(?:[✅✔❌🟢🟠]\s*)?(planned|unplanned|done|in.?progress|in.?flight|shipped|completed?|wip|todo)[.!]?$|^[✅✔❌🟢🟠]$/i
  const cells = rows.flatMap(l => l.split('|').map(c => c.trim())).filter(c => STATUSY.test(c))
  if (cells.length) {
    anomalies.push({ kind: 'hand-tracked-status', detail: `docs/roadmap/00-overview.md Sequence table carries hand-tracked status cell(s): ${[...new Set(cells)].join(', ')} — statuses live only in this derivation; strip that column` })
  }
}

// ---- --next: recommended next command --------------------------------------------------------

// Resolve a depends_on ref against the LIVE specs. A ref naming a retired spec resolves to
// nothing, and both callers read nothing as non-blocking — which is the intent: a spec must
// never block or nag about a dependency that has been retired.
function specDep(ref) {
  return specByTail.get(path.basename(ref)) || specs.find(x => x.path === ref || x.path.endsWith('/' + ref))
}

// Brief-level serial verdict between two briefed entries: the reason string when the pair is
// provably serial, null when the roadmap declares them unrelated (= parallel-ok). One helper
// for both the vs-top annotation and pairwise lane admission — the two must never disagree.
function briefSerialReason(a, b) {
  if (a === b) return `shared brief ${a}`
  if (briefDepPath(a, b)) return `brief ${a} depends on ${b}`
  if (briefDepPath(b, a)) return `brief ${b} depends on ${a}`
  return null
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

// Shared by --next (the lean top-pick line, consumed verbatim by /spec:review close-out)
// and the dashboard — one derivation, two renders.
function deriveNext() {
  const entries = []
  for (const s of specs) {
    if (DONE(s.status) || !KNOWN_STATUS.has(s.status)) continue
    // hardened (any design state) and implementing both route through the loop — the loop derives
    // design-due itself, so this derivation treats them identically (D5).
    const action = s.status === 'draft' ? '/spec:plan' : '/spec:run'
    const blockers = []
    for (const d of s.depends_on) {
      const dep = specDep(d)
      if (dep && !DONE(dep.status)) blockers.push(`${dep.path} (${dep.status})`)
    }
    if (s.status === 'draft' && s.brief && briefByNum.has(s.brief)) {
      for (const d of briefByNum.get(s.brief).depends_on) {
        const dep = briefByNum.get(d)
        if (!dep || !dep.specs.some(x => LANDED(x.status))) blockers.push(`brief ${d} (${dep ? dep.status : 'missing'})`)
      }
    }
    // specs/20260903/03 D2/D3: a queue `after` gate on this spec's own queued position, or
    // on its brief's queued position, adds one more blocker string — reusing the existing
    // blocked tier rather than a new field.
    if (queueBlockersBySpec.has(s.path)) blockers.push(queueBlockersBySpec.get(s.path))
    else if (s.brief && queueBlockersByBrief.has(s.brief)) blockers.push(queueBlockersByBrief.get(s.brief))
    const rank = s.status === 'implementing' ? 0 : s.status === 'hardened' ? 1 : 2
    entries.push({
      action, path: s.path, status: s.status, brief: s.brief, blockers,
      note: s.status + (s.design ? (s.designed ? ' [designed]' : ' [design]') : '')
        + (s.brief ? ` (brief ${s.brief})` : ''),
      rank,
      __gateTargetPending: queueGateTargetSpecs.has(s.path),
    })
  }
  // D5: a red observation is a dashboard-level alarm — it outranks every build/review/plan
  // action and every unplanned brief as a full oracle-shaped /spec:escape entry, carrying its
  // evidence (branch/sha/url) in `note` so the escape session derives from it, never guesses.
  // blockers:[] (an escape is always actionable) plus parallel:false/parallel_reason:null
  // (never part of the ⚡ fan-out — it isn't worktree build work) are pinned, not derived.
  for (const s of specs) {
    if (s.observation !== 'red') continue
    const row = observationRows.get(s.path)
    entries.push({
      action: '/spec:escape', path: s.path, status: s.status, brief: s.brief, blockers: [],
      parallel: false, parallelReason: null,
      note: `CI red on ${row.branch} @${row.sha} — ${row.url}`,
      rank: -3,
    })
  }
  // specs/20260823/08 D11/Behavior: undone prompt queue items surface as their own entries
  // (no underlying spec — path:null) so they can compete for the top pick like any other
  // entry, ordered purely by their own queue position (queuePos below).
  if (queueOverlay.on) entries.push(...queueUndonePromptEntries)

  // Closest-to-done first (review > build/design > plan), blocked entries last, then brief
  // order, then path — the first line is THE recommendation. D10: a red-observation escape
  // (rank -3) keeps supremacy over every queue position — its own sort tier, ahead of queue
  // position, unconditionally. D6/Behavior: queue position (a briefed entry maps to its
  // queue item's index, real or virtually reconciled above; briefless/unqueued entries sort
  // after every queued position via Infinity) deliberately overrides the existing
  // closest-to-done rank, which still breaks ties within one queue position/brief. `queuePos`
  // degenerates to a constant when the overlay is off, so ordering is byte-identical then.
  function queuePos(e) {
    if (!queueOverlay.on) return 0
    if (e.queue) return e.__queuePos
    // D1: a queued spec item's own position overrides its brief's queued position.
    if (e.path && queuePosBySpec.has(e.path)) return queuePosBySpec.get(e.path)
    if (e.brief && queuePosByBrief.has(e.brief)) return queuePosByBrief.get(e.brief)
    return Infinity
  }
  entries.sort((a, b) =>
    (a.blockers.length ? 1 : 0) - (b.blockers.length ? 1 : 0)
    || (a.rank === -3 ? 0 : 1) - (b.rank === -3 ? 0 : 1)
    || (a.__gateTargetPending ? 1 : 0) - (b.__gateTargetPending ? 1 : 0)
    || queuePos(a) - queuePos(b)
    || a.rank - b.rank
    || (a.brief ? briefOrd(a.brief) : Infinity) - (b.brief ? briefOrd(b.brief) : Infinity)
    || (a.path || '').localeCompare(b.path || ''))

  // Every spec done (or only blocked ones left): the next ready unplanned brief is the pick.
  const readyBriefs = briefs
    .filter(b => b.status === 'unplanned' && b.depends_on.every(d => {
      const dep = briefByNum.get(d)
      return dep && dep.specs.some(x => LANDED(x.status))
    }))
    .sort((a, b) => briefOrd(a.num) - briefOrd(b.num))
  if (readyBriefs.length && !entries.some(e => !e.blockers.length)) {
    const b = readyBriefs[0]
    entries.unshift({ action: '/spec:plan', path: b.file, status: 'unplanned', brief: b.num, blockers: [], note: `brief ${b.num} (${b.name}) unplanned, dependencies met`, rank: -1 })
  }

  // Parallel annotation: each unblocked runner-up vs the top pick. Both need a brief to
  // make a claim; shared brief = same surfaces, a brief dependency path = declared order.
  // Escape entries never take part (top or runner-up) — they always sort first (rank -3) when
  // present, but they carry no worktree-build parallel claim of their own (pinned above) and
  // must never receive one derived against them either.
  const top = entries[0] && entries[0].action === '/spec:escape'
    ? entries.find(e => e.action !== '/spec:escape' && !e.blockers.length)
    : entries[0]
  // A queue prompt entry (top.brief === null) makes no worktree-build parallelism claim —
  // same reasoning as the escape exclusion just above.
  if (top && !top.blockers.length && top.brief) {
    for (const e of entries.slice(1)) {
      if (e.blockers.length || !e.brief || !top.brief || e.action === '/spec:escape') continue
      const reason = briefSerialReason(e.brief, top.brief)
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

// --next: the lean terminal view — just the top pick, @-prefixed so it triple-click pastes
// straight into Claude Code, with none of the full dashboard's other sections. --json gets
// the full entry list instead.
if (nextMode) {
  const entries = deriveNext()
  if (json) {
    // D11: a queue prompt entry's --json shape is a frozen, append-only 7-key object
    // (action/path/queue/status/brief/blockers/note) with no parallel/parallel_reason
    // decoration — it never took part in the parallel-annotation loop above (no brief to
    // claim against), so the generic augmentation is skipped for it, never applied then
    // nulled out.
    writeOut(JSON.stringify({
      next: entries.map(({ rank, parallelReason, __queuePos, __gateTargetPending, ...e }) =>
        e.queue ? e : { ...e, parallel: e.parallel === undefined ? null : e.parallel, parallel_reason: parallelReason || null }),
    }, null, 2))
    process.exit(0)
  }
  const out = ['🎯 Next']
  if (!entries.length) {
    out.push(`✨ ${nothingNextLine()}`)
  } else {
    const top = entries[0]
    // D11: a prompt item's payload prints verbatim, with no `@path` suffix (path is null).
    out.push(top.path ? `${top.action} @${top.path}` : top.action)
    top.blockers.forEach((b, i) =>
      out.push(`   ${i === top.blockers.length - 1 ? '└─' : '├─'} ⏳ ${b}`))
  }
  writeOut(out.join('\n'))
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

// ---- the /spec:status dashboard (default render) --------------------------------------------
// Deterministic emoji render of the same derivation: verdict line, roadmap with per-brief
// progress bars (consecutive unplanned briefs collapse to one row), the next-action lanes
// (parallel-ok runner-ups drawn as fan-out lanes under the top pick, a 🔶 branch line when
// two lanes' File Plan tables share a path), anomalies. Purely a view — same data as --json,
// styled here so no renderer re-derives it.

if (json) {
  // `superseded` (the brief-level flag, internal-only per its own comment above) is
  // stripped here alongside `specs: ss` — this dashboard JSON shape is unchanged by
  // specs/20260823/08.
  writeOut(JSON.stringify({ briefs: briefs.map(({ specs: ss, superseded, ...b }) => ({ ...b, specs: ss.map(s => ({ path: s.path, status: s.status })) })), specs, superseded: retired.map(s => ({ path: s.path, superseded_by: s.superseded_by })), anomalies }, null, 2))
  process.exit(0)
}

{
  // D1: a terminal shows the TAIL of output, so section order bottom-anchors the actionable
  // content — 🗺️ Roadmap → 📡 red-alarm lines (only when red) → ⚠️ Anomalies → 🎯 Next → the
  // one-line headline verdict LAST. Content within each section is unchanged; only the order
  // moves, plus the ⏳/"unobserved" segment dies with the retired `pending` state (D2).
  const out = []
  const BRIEF_ICON = { done: '✅', 'in-flight': '🔨', unplanned: '⬜' }

  const doneB = briefs.filter(b => b.status === 'done').length
  const flightB = briefs.filter(b => b.status === 'in-flight').length
  const unplB = briefs.filter(b => b.status === 'unplanned').length
  const doneS = specs.filter(s => DONE(s.status)).length
  const scope = briefs.length
    ? [`${doneB} brief${doneB === 1 ? '' : 's'} done`, flightB && `${flightB} in flight`, unplB && `${unplB} unplanned`].filter(Boolean).join(' · ')
    : specs.length ? `${doneS}/${specs.length} specs done` : 'no specs or briefs found'
  // D2/D5(a): a red observation is a dashboard-level alarm, not a lane detail — it overrides the
  // ordinary 🟢/🟠 anomaly-driven glyph outright. "ok" never renders anywhere.
  const doneRed = specs.filter(s => s.observation === 'red')
  const headline = doneRed.length ? '🔴' : anomalies.length ? '🟠' : '🟢'
  const headlineLine = `${headline} ${scope}${retired.length ? ` · ${retired.length} superseded` : ''} · ${anomalies.length ? `⚠️ ${anomalies.length} anomal${anomalies.length === 1 ? 'y' : 'ies'}` : 'no anomalies'}`

  // Computed early: the anomaly-fold (which entries carry a ⚠️ tag vs. stand alone) is needed by
  // both the ⚠️ Anomalies section and the 🎯 Next section, and D1 now renders Anomalies first.
  const entries = deriveNext()
  // An anomaly about a spec that already has a Next line folds onto that line as a ⚠️ tag —
  // no bottom section repeating the path. Only anomalies with no line of their own (done
  // specs, brief-level drift, hand-tracked cells) keep a section entry.
  const inlineKinds = new Map()
  const standalone = []
  for (const a of anomalies) {
    const hit = entries.find(e => e.path && a.detail.includes(e.path))
    if (hit) inlineKinds.set(hit.path, [...new Set([...(inlineKinds.get(hit.path) || []), a.kind])])
    else standalone.push(a)
  }

  if (briefs.length) {
    out.push('', '🗺️ Roadmap')
    const rows = []
    for (let i = 0; i < briefs.length; i++) {
      const b = briefs[i]
      // Runs of same-status briefs with nothing actionable per row (unplanned = no state yet,
      // done = all specs green) collapse to one range row — avoiding a long run of shipped
      // history filling the screen. In-flight briefs never collapse.
      let j = i
      while ((b.status === 'unplanned' || b.status === 'done') && j + 1 < briefs.length && briefs[j + 1].status === b.status) j++
      if (j > i) {
        const run = briefs.slice(i, j + 1)
        const phases = [...new Set(run.map(x => x.phase).filter(Boolean))]
        const phase = phases.length > 1 ? `${phases[0]}–${phases[phases.length - 1]}` : phases[0] || '—'
        const tail = b.status === 'done'
          ? `done (${run.length} briefs, ${run.reduce((n, x) => n + x.specs.length, 0)} specs)`
          : `unplanned (${run.length} briefs)`
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
        : 'unplanned'
      rows.push({ icon: BRIEF_ICON[b.status], label: `${b.num} ${b.name}`, phase: b.phase || '—', tail: bar })
    }
    const lw = Math.max(...rows.map(r => r.label.length))
    const pw = Math.max(...rows.map(r => r.phase.length))
    for (const r of rows) out.push(`   ${r.icon} ${r.label.padEnd(lw)}  ${r.phase.padEnd(pw)}  ${r.tail}`)
  }

  // D6: 🧭 misunderstandings — a render-only pipeline-record line read from
  // design/mocks/ledger.md's own Misunderstandings table (spec 06's grammar), directly under
  // 🗺️ Roadmap and ahead of 📡 Observation. Any absence or read/parse failure omits the line
  // silently (Behavior: "a viewer, never a verdict") — never a second derivation surfaced via
  // --json, which stays byte-for-byte unchanged (AC-20260902-11-7).
  {
    let ledgerText = null
    try { ledgerText = fs.readFileSync(path.join(root, 'design/mocks/ledger.md'), 'utf8') } catch (e) { ledgerText = null }
    if (ledgerText !== null) {
      const ledger = mocksLedgerLib.parseLedger(ledgerText)
      if (!ledger.errors.length && ledger.catches.length) {
        const latest = ledger.catches[ledger.catches.length - 1]
        out.push(`   🧭 misunderstandings: ${ledger.catches.length} caught before build (latest ${latest.id} at ${latest.step})`)
      }
    }
  }

  // 📡 red-alarm lines (D1: right after Roadmap, only when at least one done spec is red — "ok"
  // renders nothing at all, D2).
  if (doneRed.length) {
    out.push('', '📡 Observation')
    for (const s of doneRed) {
      const row = observationRows.get(s.path)
      out.push(`   🔴 done-but-red ${s.path} — ${row.branch}@${row.sha} (${row.url})`)
    }
  }

  // ⚠️ Anomalies (D1: above 🎯 Next now, so a scrolled-to-bottom terminal still lands on Next).
  out.push('')
  const folded = anomalies.length - standalone.length
  if (!anomalies.length) {
    out.push('✅ No anomalies — nothing skipped, no drift')
  } else if (!standalone.length) {
    out.push(`⚠️ ${anomalies.length} anomal${anomalies.length === 1 ? 'y' : 'ies'} — each tagged ⚠️ on its 🎯 Next line`)
  } else {
    const ANOM_ICON = { 'orphan-stamp': '🏷️', 'skipped-brief': '⏭️', 'out-of-order': '🔀', 'unknown-dependency': '❓', 'skipped-spec': '🕳️', 'hand-tracked-status': '✍️', 'unknown-status': '🚧', 'queue-orphan': '🔗', 'queue-unparseable': '💥' }
    out.push(`⚠️ Anomalies (${standalone.length}${folded ? ` here · ${folded} tagged ⚠️ below` : ''})`)
    for (const a of standalone) out.push(`   ${ANOM_ICON[a.kind] || '⚠️'} [${a.kind}] ${a.detail}`)
  }

  out.push('', '🎯 Next')
  if (!entries.length) {
    out.push(`   ✨ ${nothingNextLine()}`)
  } else {
    // Operator-first: every runnable line IS exactly what you paste into Claude Code —
    // flush-left "action @path", no icons, indent, padding, or status words around it
    // (any of those poison a triple-click paste or slash-command detection). Status is
    // already encoded one-to-one in the action itself. Context rides only on headers and
    // on lines never pasted as-is: blocked ⏳ reasons and 🕓 parallel-verdict branches get
    // their own indented line (narrow terminals wrap trailing text); only the compact
    // anomaly ⚠️ tag trails the command.
    const warn = e => e.path && inlineKinds.has(e.path) ? `  ⚠️ ${inlineKinds.get(e.path).join(', ')}` : ''
    // A queue prompt entry (D11) has no path — print its payload alone, same as --next.
    const cmd = e => e.path ? `${e.action} @${e.path}${warn(e)}` : `${e.action}${warn(e)}`
    const shortBlocker = b => b.replace(/^\S*\//, '').replace(/\s*\([^)]*\)$/, '').replace(/\.md$/, '')
    // Escape entries (D5) rank first but are never worktree build work — they print as their
    // own bare command line(s) ahead of everything else, excluded from the ⚡ lane fan-out.
    const escapes = entries.filter(e => e.action === '/spec:escape')
    escapes.forEach(e => out.push(cmd(e)))
    const unblocked = entries.filter(e => !e.blockers.length && e.action !== '/spec:escape')
    const blocked = entries.filter(e => e.blockers.length)
    if (unblocked.length) {
      // Lane admission is pairwise, not vs-top-only: `parallel === true` proves safety against
      // the top pick, but two runner-ups can still be ordered against EACH OTHER (03 and 04
      // both unrelated to the pick, 04 depends on 03). Greedy in sort order: a candidate joins
      // only if the roadmap declares it unrelated to every lane already admitted — the ⚡
      // header claims mutual parallelism, so mutual is what gets checked.
      const lanes = [unblocked[0]]
      const laneClash = new Map()
      for (const e of unblocked.slice(1)) {
        if (e.parallel !== true) continue
        const clash = lanes.slice(1).find(l => briefSerialReason(e.brief, l.brief))
        if (clash) laneClash.set(e, briefSerialReason(e.brief, clash.brief))
        else lanes.push(e)
      }
      const later = unblocked.slice(1).filter(e => !lanes.includes(e))
      if (lanes.length > 1) {
        out.push(`⚡ ${lanes.length} parallel lanes — first stays on main, each other lane gets a worktree (/git:enter-worktree):`)
        lanes.forEach(e => out.push(cmd(e)))
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
          const shown = o.shared.slice(0, 2).join(', ') + (o.shared.length > 2 ? ` (+${o.shared.length - 2} more)` : '')
          const pair = lanes.length > 2 ? `${path.basename(o.a.path)} × ${path.basename(o.b.path)}: ` : ''
          out.push(`   ${i === overlaps.length - 1 ? '└─' : '├─'} 🔶 ${pair}merge-conflict risk: ${shown}`)
        })
      } else {
        out.push(cmd(unblocked[0]))
        // "Is this parallelable?" must never be answered by the ABSENCE of the ⚡ header —
        // when other open work exists, the solo pick states it out loud.
        if (later.length || blocked.length) out.push('   └─ 🚦 solo')
      }
      // Every "after that" entry says WHY it isn't a lane, on its own ⏳-style branch line
      // (trailing tags wrap badly on narrow terminals): provably-serial entries carry the
      // derived reason in plain words. No-claim entries: among unblocked specs, spec-level
      // depends_on carries no signal (a non-done dep = blocked, a done dep = no ordering),
      // so briefs are the only declared-surfaces source — briefless means unknowable, and
      // the line explains that instead of masquerading as serial. Commands stay bare.
      if (later.length) {
        out.push('', '🕓 after that:')
        for (const e of later) {
          out.push(cmd(e))
          out.push(`   └─ ${
            e.parallel === false ? `⛓️ ${e.parallelReason}`
            : laneClash.has(e) ? `⛓️ ${laneClash.get(e)}`
            : '🤷 no brief — parallelism unknown'}`)
        }
      }
    }
    if (blocked.length) {
      out.push('', '⛔ blocked:')
      blocked.forEach(e => {
        out.push(cmd(e))
        e.blockers.forEach((b, i) =>
          out.push(`   ${i === e.blockers.length - 1 ? '└─' : '├─'} ⏳ ${shortBlocker(b)}`))
      })
    }
  }

  // D1: the one-line headline verdict is the LAST thing printed — everything actionable must
  // already be on screen by the time a terminal shows only its tail.
  out.push('', headlineLine)

  // Redraw from the top of the viewport (not a scrollback wipe) so re-invoking the dashboard
  // never leaves it stranded wherever the cursor last scrolled to — only when stdout is a TTY,
  // so piped/redirected output stays clean of escape codes.
  if (process.stdout.isTTY) process.stdout.write('\x1Bc')
  console.log(out.join('\n'))
}
