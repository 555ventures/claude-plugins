#!/usr/bin/env node
'use strict'
// spec-queue.js <subcommand> [args] — the sole writer of the per-repo session queue
// (<git-common-dir>/spec-queue.json).
// Owner: specs/20260903/03-pipeline-queue-mechanics.md.
// The queue is the pipeline's memory for deferred work: an item can wait behind a spec or a
// brief (an "after" gate) until that target is done, an ad-hoc spec can be queued by path at
// any position, a landed brief is appended last with no mark, and a brief or spec is queued at
// most once. spec-status.js reads this file read-only as an input overlay to its `--next`
// derivation — it never writes it, and this script never re-derives `--next`'s own
// action/blockers shape; for a non-prompt item it delegates the paste line to
// `spec-status.js --next` (the one frozen next-pointer surface). Doneness and readiness (every
// kind) are evaluated exclusively via lib/queue.js's isItemDone/isItemReady — the overlay's
// own evaluators — never a second derivation. `list` never mutates the queue file (it
// reconciles a copy for display numbering only); the retired `bump`/`defer`/`ok` verbs and
// `add --after`/`--brief` flags each exit 2 naming their replacement.
//
// Hygiene: `add` refuses a free-text prompt whose token
// Jaccard against any PENDING prompt is >= 0.35 (`--distinct` overrides; a path-shaped payload
// such as a prototype contract duplicates only an identical path, never by word overlap); `list` prints an age
// column and the flags `📎 cites done <spec>` · `⏳ gate met` · `⌛ stale`; every write verb
// moves ticked and derived-done items out of the queue file into
// <git-common-dir>/spec-queue-done.json (seq stays in the queue file, so ids never repeat);
// `groom` prints the flagged items in buckets and never writes. It deliberately does NOT
// auto-tick anything (the session asks per item), compare against archived prompts, or lock
// the archive file (a concurrent writer can lose archived rows, never queue rows).
//
// Subcommands:
//   next                          reconcile+write, print the pick (or a prompt payload)
//   list                          pending items only, one line each (age, gates, flags), footer
//   groom                         read-only: duplicates · cites done · gate met · stale buckets
//   add <payload…> [--lane plan|prototype|fix|decide] [--top | --at <n>]
//                  [--after-spec <path> | --after-brief NN] [--when <type>:<args>] [--distinct]
//                  --lane is required for free text and refused for a brief/spec; the lane
//                  writes the command, so a free-text payload never opens with one
//   move <ref> <n>                n counts pending positions as `list` prints them
//   done <ref>                    manual tick: stamp ticked
//   show <ref>                    the item's FULL payload (list/status cut rows to one line,
//                                 so this is the only way to read a long one); resolves
//                                 archived ids too
// Payload classification: NN/NNa or a docs/roadmap/NN-*.md path -> brief; ^specs/.*\.md$ ->
// spec; anything else -> prompt verbatim.
// <ref> resolves against an id, a brief number, a spec path (exact or unique basename
// substring), or a unique prompt substring.
// --when <type>:<args>: brief-state:NN:STATE · spec-exists:PATH · ledger-count:STAGE:MIN
//   (baseline auto-stamped from the CURRENT ledger count at add time) · manual.
//
// Exit codes: 0 ok · 2 usage, unresolvable/ambiguous/already-done <ref>, duplicate brief/spec
//   on add (names `spec-queue move <ref> <n>`), a missing --after-spec/--after-brief target,
//   a removed verb/flag (names its replacement), a near-duplicate prompt on add (names the
//   matching id and `--distinct`), `move`/`done` on an archived id, or a corrupt queue file
//   (remove <git-common-dir>/spec-queue.json, re-run `next`) or archive file (remove or
//   repair <git-common-dir>/spec-queue-done.json) · 3 not a git repository (run inside it).

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { readLedgerRows } = require('./lib/observation')
const {
  normBrief, isSupersededBriefText, isItemDone, isItemReady, makeCtx,
  dedupeItems, stripAutoPlaced, reconcileMissingBriefs,
  promptDupScore, citesDoneSpec, LANES, promptAction,
} = require('./lib/queue')

const SPEC_STATUS = path.join(__dirname, 'spec-status.js')

function usage() {
  console.error('usage: spec-queue.js <next|list|groom|add|move|done|show> [args]')
  console.error('  next | list | groom')
  console.error('  add <payload…> [--lane plan|prototype|fix|decide] [--top | --at <n>] [--after-spec <path> | --after-brief NN] [--when <type>:<args>] [--distinct]')
  console.error('  move <ref> <n> | done <ref> | show <ref>')
}

const argv = process.argv.slice(2)
const sub = argv[0]
const rest = argv.slice(1)

// The retired verbs are recognized only to name their replacement and exit 2 — they
// never touch the queue file. Checked before general usage validation so a typo'd old verb
// gets a helpful message, not a bare usage dump.
const REMOVED_SUBS = {
  bump: ref => `spec-queue: 'bump' is retired — the reorder verb is move: spec-queue move ${ref || '<ref>'} 1`,
  defer: ref => `spec-queue: 'defer' is retired — the reorder verb is move: spec-queue move ${ref || '<ref>'} <n>`,
  ok: () => 'spec-queue: \'ok\' is retired — there is no accept step; a landed brief is placed last automatically. To reorder: spec-queue move <ref> <n>',
}
if (Object.prototype.hasOwnProperty.call(REMOVED_SUBS, sub)) {
  console.error(REMOVED_SUBS[sub](rest[0]))
  process.exit(2)
}

const SUBS = ['next', 'list', 'groom', 'add', 'move', 'done', 'show']
if (!SUBS.includes(sub)) {
  // A lone non-flag token is more often a <ref> typed without its verb (`spec-queue q133`)
  // than a mistyped subcommand, and a usage dump leaves the user guessing. `show` is the only
  // non-mutating verb, so the suggestion is always safe to paste; the verb list rides the same
  // line so a genuine typo self-corrects too, without the dump burying the actionable half.
  if (sub && !sub.startsWith('-') && rest.length === 0) {
    console.error(`spec-queue: '${sub}' is not a subcommand (${SUBS.join('|')}) — did you mean: spec-queue show ${sub}`)
    process.exit(2)
  }
  usage()
  process.exit(2)
}

// The repository root, NOT the shell's CWD: every brief/spec state below is derived by
// `spec-status.js --root <root>` and by `specRoot`-relative existsSync, so a run from a
// subdirectory would otherwise resolve every `docs/roadmap/*` and `specs/*` path against that
// subdirectory — reporting every finished item as pending and every gate target as missing,
// with no error. Same `git rev-parse --show-toplevel` idiom the build and review drivers use;
// falls back to the CWD so the not-a-git-repository exit below stays the one repo gate (and a
// bare repo, which has a common dir but no toplevel, behaves exactly as before).
function resolveToplevel(dir) {
  const r = spawnSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' })
  if (r.error || r.status !== 0) return null
  return r.stdout.trim() || null
}

const root = resolveToplevel(process.cwd()) || process.cwd()

function resolveCommonDir(dir) {
  const r = spawnSync('git', ['-C', dir, 'rev-parse', '--git-common-dir'], { encoding: 'utf8' })
  if (r.error || r.status !== 0) return null
  const raw = r.stdout.trim()
  return path.isAbsolute(raw) ? raw : path.resolve(dir, raw)
}

const common = resolveCommonDir(root)
if (!common) {
  console.error('spec-queue: not a git repository — the queue lives in the git common directory (remedy: run inside a git repo)')
  process.exit(3)
}
const QUEUE_PATH = path.join(common, 'spec-queue.json')
const ARCHIVE_PATH = path.join(common, 'spec-queue-done.json')
const DUP_THRESHOLD = 0.35
const STALE_DAYS = 14

function readSpecStatusJson() {
  const r = spawnSync(process.execPath, [SPEC_STATUS, '--root', root, '--json'], { encoding: 'utf8' })
  if (r.error || r.status !== 0) {
    console.error(`spec-queue: \`spec-status.js --root ${root} --json\` failed — ${(r.stderr || '').trim() || (r.error && r.error.message)}`)
    process.exit(2)
  }
  try {
    return JSON.parse(r.stdout)
  } catch (e) {
    console.error(`spec-queue: spec-status.js --json produced unparseable output — ${e.message}`)
    process.exit(2)
  }
}

function loadQueue() {
  if (!fs.existsSync(QUEUE_PATH)) return null
  let data
  try {
    data = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'))
  } catch (e) {
    console.error(`spec-queue: ${QUEUE_PATH} is not valid JSON (${e.message}) — remove or repair it, then re-run \`spec-queue next\` to reseed`)
    process.exit(2)
  }
  if (!data || !Array.isArray(data.items) || typeof data.seq !== 'number') {
    console.error(`spec-queue: ${QUEUE_PATH} does not match the {version,seq,items} shape — remove or repair it, then re-run \`spec-queue next\` to reseed`)
    process.exit(2)
  }
  return data
}

// Written atomically (temp file + rename) — see git history for the concurrency-safety
// rationale this function's shape stands on (pinned by
// tests/queue/spec-queue.test.js's AC-20260823-08-review-concurrent-writer-safety).
function writeQueue(data) {
  const dir = path.dirname(QUEUE_PATH)
  const tmpPath = path.join(dir, `.spec-queue.${process.pid}.tmp`)
  fs.writeFileSync(tmpPath, JSON.stringify({ version: 1, seq: data.seq, items: data.items }, null, 2) + '\n')
  fs.renameSync(tmpPath, QUEUE_PATH)
}

function loadArchive() {
  if (!fs.existsSync(ARCHIVE_PATH)) return { version: 1, items: [] }
  let data
  try {
    data = JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf8'))
  } catch (e) {
    console.error(`spec-queue: ${ARCHIVE_PATH} is not valid JSON (${e.message}) — remove or repair it, then re-run the command`)
    process.exit(2)
  }
  if (!data || !Array.isArray(data.items)) {
    console.error(`spec-queue: ${ARCHIVE_PATH} does not match the {version,items} shape — remove or repair it, then re-run the command`)
    process.exit(2)
  }
  return data
}

function appendArchive(gone) {
  const arc = loadArchive()
  const stamp = nowIso()
  const items = arc.items.concat(gone.map(it => ({ ...it, archived: stamp })))
  const tmpPath = path.join(path.dirname(ARCHIVE_PATH), `.spec-queue-done.${process.pid}.tmp`)
  fs.writeFileSync(tmpPath, JSON.stringify({ version: 1, items }, null, 2) + '\n')
  fs.renameSync(tmpPath, ARCHIVE_PATH)
}

// stdout for payloads: synchronous and looped, so a large print followed by process.exit is
// never truncated at the pipe buffer.
function out(text) {
  const buf = Buffer.from(text + '\n')
  let off = 0
  while (off < buf.length) {
    try {
      off += fs.writeSync(1, buf, off)
    } catch (e) {
      if (e.code === 'EAGAIN') continue
      if (e.code === 'EPIPE') return
      throw e
    }
  }
}

function archivedItem(ref) {
  return loadArchive().items.find(i => i.id === ref) || null
}

function refuseArchived(ref) {
  console.error(`spec-queue: ${ref} is archived (done) — nothing to do (spec-queue show ${ref} still prints it)`)
  process.exit(2)
}

function nowIso() { return new Date().toISOString() }

function ageDays(it) {
  if (!it.added) return null
  const t = Date.parse(it.added)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / 86400000))
}
const ageText = it => { const a = ageDays(it); return a === null ? '?' : `${a}d` }

// Flag predicates, shared by `list` and `groom`: one derivation per rot shape.
function gateMet(it, ctx) { return !!it.after && isItemReady(it, ctx).ready }
function isStale(it) { const a = ageDays(it); return it.kind === 'prompt' && !it.after && a !== null && a >= STALE_DAYS }

function dupPairs(prompts) {
  const pairs = []
  for (let i = 0; i < prompts.length; i++) {
    for (let j = i + 1; j < prompts.length; j++) {
      const score = promptDupScore(prompts[i].payload, prompts[j].payload)
      if (score !== null && score >= DUP_THRESHOLD) pairs.push({ a: prompts[i], b: prompts[j], score })
    }
  }
  return pairs
}

// On-disk briefs the way spec-queue.js needs them: num + status come straight from
// spec-status.js's own derivation (never re-parsed here); superseded exclusion reads each
// brief file once more for isSupersededBriefText.
function onDiskBriefs(statusJson) {
  return statusJson.briefs
    .filter(b => {
      try { return !isSupersededBriefText(fs.readFileSync(path.join(root, b.file), 'utf8')) }
      catch { return true } // file vanished under us — treat as queueable, never silently drop it
    })
    .map(b => ({ num: b.num, status: b.status }))
}

function ctxFor(statusJson) {
  const briefStatusMap = new Map(statusJson.briefs.map(b => [b.num, b.status]))
  // `statusJson.specs` deliberately excludes superseded specs (they live in the separate
  // `superseded` array) — merge both so a gate or queued item pointing at a since-superseded
  // spec resolves to 'superseded' here exactly as spec-status.js's own in-process overlay
  // does (ready ⇔ done or superseded; one readiness derivation for both callers).
  const specStatusMap = new Map(statusJson.specs.map(s => [s.path, s.status]))
  for (const s of statusJson.superseded) specStatusMap.set(s.path, 'superseded')
  return makeCtx({
    ledgerRows: readLedgerRows(root),
    briefStatus: n => briefStatusMap.get(n),
    specStatus: p => (fs.existsSync(path.join(root, p)) ? (specStatusMap.get(p) || null) : null),
    specRoot: root,
  })
}

// Virtual reconcile shared by every subcommand: strip -> dedupe -> append missing on-disk
// briefs last, all on a copy — never written back here. Every subcommand (including `list`,
// which reconciles purely for display numbering) runs the full three-step reconcile with
// `append: true`; only a write subcommand additionally persists the result.
function reconciledItems(rawItems, statusJson, { append }) {
  let items = dedupeItems(stripAutoPlaced(rawItems))
  if (append) {
    const disk = onDiskBriefs(statusJson).filter(b => b.status !== 'done')
    items = reconcileMissingBriefs(items, disk).items
  }
  return items
}

// Assigns real sequential ids to any inserted item (id === null) and writes the file.
// `baseSeq` is the queue file's previous `seq` (0 for a brand-new file). Ticked and
// derived-done items leave the queue file for the archive (written first, so a crash between
// the two renames duplicates rows rather than losing them); `seq` stays so ids never repeat.
function persist(items, baseSeq, ctx) {
  let seq = baseSeq
  const withIds = items.map(it => (it.id === null ? { ...it, id: `q${++seq}` } : it))
  const live = []
  const gone = []
  for (const it of withIds) (isItemDone(it, ctx).done ? gone : live).push(it)
  if (gone.length) appendArchive(gone)
  writeQueue({ version: 1, seq, items: live })
  return { version: 1, seq, items: live }
}

function pendingIndices(items, ctx) {
  return items.map((it, i) => ({ it, i })).filter(({ it }) => !isItemDone(it, ctx).done).map(({ i }) => i)
}

function itemDesc(it, briefNameByNum) {
  if (it.kind === 'brief') {
    const name = briefNameByNum.get(it.brief)
    return `brief ${it.brief}${name ? ` (${name})` : ''}`
  }
  if (it.kind === 'spec') return `spec ${it.spec}`
  return promptAction(it)
}

// The lane lead `next` prints above a prompt item's paste line. A lane-less item gets the
// ⚠️ mark and its remedy (there is no re-lane verb: re-add with --lane, then tick the old id).
const LANE_NAMES = Object.keys(LANES).join('|')
function laneLead(item) {
  if (!item.lane) return `⚠️ no lane — re-add with --lane ${LANE_NAMES}, then spec-queue done ${item.id || '<ref>'}`
  return item.lane === 'decide' ? '📌 decide — needs your yes, nothing to run' : `🛣️ ${item.lane}`
}

// Every rendered row is exactly one line. A free-text payload runs to hundreds of words, and
// a row that wraps across twenty terminal lines stops being a list entry at all — so the
// description is collapsed to a single line and cut to the terminal width, `show <ref>`
// being the way back to the full text. Width falls back to 100 off a TTY so piped output
// (tests, `| less`) is deterministic.
const ROW_WIDTH = () => process.stdout.columns || 100
function oneLine(text, width) {
  const flat = String(text).replace(/\s+/g, ' ').trim()
  return flat.length <= width ? flat : flat.slice(0, Math.max(1, width - 1)) + '…'
}

function resolveRef(items, ref) {
  let matches = items.filter(i => i.id === ref)
  if (!matches.length) matches = items.filter(i => i.kind === 'brief' && i.brief === normBrief(ref))
  if (!matches.length) matches = items.filter(i => i.kind === 'spec' && (i.spec === ref || path.basename(i.spec).includes(ref)))
  if (!matches.length) matches = items.filter(i => i.kind === 'prompt' && i.payload.includes(ref))
  if (!matches.length) {
    console.error(`spec-queue: no item matches "${ref}" — run \`spec-queue list\` to see current ids/briefs/specs/payloads`)
    process.exit(2)
  }
  if (matches.length > 1) {
    console.error(`spec-queue: "${ref}" is ambiguous — matches ${matches.map(m => m.id || itemDesc(m, new Map())).join(', ')} — use the id instead`)
    process.exit(2)
  }
  return matches[0]
}

function parseWhen(raw, ctx) {
  const parts = raw.split(':')
  const type = parts[0]
  if (type === 'brief-state' && parts.length === 3) return { type, brief: normBrief(parts[1]), state: parts[2] }
  if (type === 'spec-exists' && parts.length >= 2) return { type, path: parts.slice(1).join(':') }
  if (type === 'ledger-count' && parts.length === 3) {
    const min = Number(parts[2])
    if (!Number.isFinite(min)) return null
    return { type, stage: parts[1], min, baseline: ctx.ledgerCount(parts[1]) }
  }
  if (type === 'manual' && parts.length === 1) return { type }
  return null
}

// Delegates the actual paste line to spec-status.js's own overlay-aware --next — the sole
// next-pointer derivation — rather than re-deriving a brief/spec's action here.
function printTopLine(item) {
  if (!item) { console.log('✨ queue empty — nothing left undone'); return }
  if (item.kind === 'prompt') { console.log(`${laneLead(item)}\n${promptAction(item)}`); return }
  const r = spawnSync(process.execPath, [SPEC_STATUS, '--root', root, '--next'], { encoding: 'utf8' })
  const lines = (r.stdout || '').split('\n')
  console.log(lines.slice(1).join('\n').trim() || itemDesc(item, new Map()))
}

// The pick is the first item in queue order that is both undone AND ready.
function topPick(items, ctx) {
  for (const it of items) {
    if (isItemDone(it, ctx).done) continue
    if (!isItemReady(it, ctx).ready) continue
    return it
  }
  return null
}

switch (sub) {
  case 'list': {
    const statusJson = readSpecStatusJson()
    const raw = loadQueue()
    const ctx = ctxFor(statusJson)
    const items = reconciledItems(raw ? raw.items : [], statusJson, { append: true })
    const briefNameByNum = new Map(statusJson.briefs.map(b => [b.num, b.name]))
    const pending = items.filter(it => !isItemDone(it, ctx).done)
    const doneCount = items.length - pending.length + loadArchive().items.length
    if (!pending.length) {
      out(`✨ nothing pending · ${doneCount} done`)
      process.exit(0)
    }
    // Every item's own id is a valid `<ref>` for move/done, so the listing prints it as a
    // column: a virtually reconciled item has none yet (`id: null`) and shows `—`, its brief
    // number being the ref instead.
    const refWidth = Math.max(...pending.map(it => (it.id || '—').length))
    const ageWidth = Math.max(...pending.map(it => ageText(it).length))
    const lines = []
    pending.forEach((it, i) => {
      const head = `${i + 1}  ${(it.id || '—').padEnd(refWidth)}  ${ageText(it).padEnd(ageWidth)}  `
      let tail = ''
      if (it.after) {
        const r = isItemReady(it, ctx)
        // The gate target is shown by its basename: a full specs/YYYYMMDD/NN-name.md path
        // costs half the row's width and adds nothing a reader of a one-line list needs.
        tail += r.ready ? '  ⏳ gate met' : `  ⏳ after ${path.basename(r.target).replace(/\.md$/, '')} (${r.state})`
      }
      const cited = citesDoneSpec(it, ctx)
      if (cited) tail += `  📎 cites done ${path.basename(cited).replace(/\.md$/, '')}`
      if (isStale(it)) tail += '  ⌛ stale'
      // The flag marks are the row's most decision-relevant part, so they keep their full
      // width and the description absorbs the cut.
      lines.push(head + oneLine(itemDesc(it, briefNameByNum), Math.max(20, ROW_WIDTH() - head.length - tail.length)) + tail)
    })
    lines.push(`— ${doneCount} done · move: spec-queue move <ref> <n> · full text: spec-queue show <ref>`)
    out(lines.join('\n'))
    process.exit(0)
  }

  case 'groom': {
    const statusJson = readSpecStatusJson()
    const raw = loadQueue()
    const ctx = ctxFor(statusJson)
    const items = reconciledItems(raw ? raw.items : [], statusJson, { append: true })
    const briefNameByNum = new Map(statusJson.briefs.map(b => [b.num, b.name]))
    const pending = items.filter(it => !isItemDone(it, ctx).done)
    const prompts = pending.filter(it => it.kind === 'prompt')
    const itemRows = list => {
      const idW = Math.max(0, ...list.map(it => (it.id || '—').length))
      const ageW = Math.max(0, ...list.map(it => ageText(it).length))
      return list.map(it => {
        const head = `  ${(it.id || '—').padEnd(idW)}  ${ageText(it).padEnd(ageW)}  `
        return head + oneLine(itemDesc(it, briefNameByNum), Math.max(20, ROW_WIDTH() - head.length))
      })
    }
    const buckets = [
      ['duplicates', dupPairs(prompts).map(p => `  ${p.a.id} ~ ${p.b.id}  ${p.score.toFixed(2)}`)],
      ['cites done', itemRows(prompts.filter(it => citesDoneSpec(it, ctx)))],
      ['gate met', itemRows(pending.filter(it => gateMet(it, ctx)))],
      ['stale', itemRows(pending.filter(isStale))],
    ].filter(([, rows]) => rows.length)
    if (!buckets.length) {
      out(`✨ nothing to groom · ${pending.length} pending`)
      process.exit(0)
    }
    const lines = []
    for (const [name, rows] of buckets) lines.push(`${name} (${rows.length}):`, ...rows)
    lines.push('fates: spec-queue done <ref> · spec-queue move <ref> <n> · keep — never tick without a yes')
    out(lines.join('\n'))
    process.exit(0)
  }

  case 'next': {
    const statusJson = readSpecStatusJson()
    const raw = loadQueue()
    const items = reconciledItems(raw ? raw.items : [], statusJson, { append: true })
    const ctx = ctxFor(statusJson)
    const { items: written } = persist(items, raw ? raw.seq : 0, ctx)
    if (!raw) console.log(`seeded queue with ${written.length} briefs (roadmap order)`)
    printTopLine(topPick(written, ctx))
    process.exit(0)
  }

  case 'add': {
    const flags = { when: null, top: false, at: null, afterSpec: null, afterBrief: null, distinct: false, lane: null }
    const payloadParts = []
    for (let i = 0; i < rest.length; i++) {
      const a = rest[i]
      if (a === '--top') flags.top = true
      else if (a === '--distinct') flags.distinct = true
      else if (a === '--at') flags.at = rest[++i]
      else if (a === '--after-spec') flags.afterSpec = rest[++i]
      else if (a === '--after-brief') flags.afterBrief = rest[++i]
      else if (a === '--when') flags.when = rest[++i]
      else if (a === '--lane') flags.lane = rest[++i]
      else if (a === '--after') { console.error('spec-queue: --after is retired — use --at <n> to insert at a specific pending position'); process.exit(2) }
      else if (a === '--brief') { console.error('spec-queue: --brief is retired — pass the brief number as the payload directly (e.g. spec-queue add 05)'); process.exit(2) }
      // An unrecognized --flag never folds into the payload: that silently turns a spec path into a
      // free-text prompt item (observed: `add specs/x.md --root /abs` landed as kind "prompt").
      // spec-queue takes no --root — the queue is keyed off the cwd's git common dir; run it from the repo root.
      else if (/^--/.test(a)) { console.error(`spec-queue: add: unknown flag ${a} — spec-queue takes no --root (run from the repo root); flags: --lane <lane> | --top | --at <n> | --after-spec <path> | --after-brief NN | --when <type>:<args> | --distinct`); process.exit(2) }
      else payloadParts.push(a)
    }
    const payload = payloadParts.join(' ')
    if (!payload) { console.error('spec-queue: add needs a payload (a brief number, a spec path, or free text)'); process.exit(2) }
    if (flags.top && flags.at !== null) { console.error('spec-queue: add takes --top or --at <n>, never both'); process.exit(2) }
    if (flags.afterSpec && flags.afterBrief) { console.error('spec-queue: add takes --after-spec or --after-brief, never both'); process.exit(2) }

    const statusJson = readSpecStatusJson() // read-only — never touches the queue file

    // Classification: NN/NNa or docs/roadmap/NN-*.md -> brief; specs/*.md -> spec;
    // else -> prompt verbatim.
    const roadmapPathMatch = /^docs\/roadmap\/(\d+[a-z]?)-/.exec(payload)
    let kind, briefNum, specPath
    if (/^\d{2}[a-z]?$/.test(payload) || roadmapPathMatch) {
      kind = 'brief'
      briefNum = normBrief(roadmapPathMatch ? roadmapPathMatch[1] : payload)
    } else if (/^specs\/.*\.md$/.test(payload)) {
      kind = 'spec'
      specPath = payload
      if (!fs.existsSync(path.join(root, specPath))) {
        console.error(`spec-queue: add ${specPath}: no such spec file — a queued spec path must exist at add time`)
        process.exit(2)
      }
    } else {
      kind = 'prompt'
    }

    // A free-text item must say which command takes it next — the one fact `next` cannot
    // derive. The lane writes the command, so the payload carries the subject only; a payload
    // that opens with its own command would let the two disagree. A brief or spec item's next
    // command is already derived by spec-status.js, so a lane on one is refused, not ignored.
    if (kind === 'prompt') {
      if (!flags.lane) {
        console.error(`spec-queue: add needs --lane ${LANE_NAMES} for free text — a small fix is done now in-session, another repo's work goes to that repo, never this queue`)
        process.exit(2)
      }
      if (!Object.prototype.hasOwnProperty.call(LANES, flags.lane)) {
        console.error(`spec-queue: unknown --lane "${flags.lane}" — one of ${LANE_NAMES}`)
        process.exit(2)
      }
      if (/^\s*\//.test(payload)) {
        console.error(`spec-queue: the lane writes the command — pass the subject only, without "${payload.trim().split(/\s/)[0]}"`)
        process.exit(2)
      }
    } else if (flags.lane) {
      console.error(`spec-queue: --lane is for free text only — a ${kind}'s next command is derived`)
      process.exit(2)
    }

    // --after-* target validation — BEFORE any write, so a refused add creates nothing.
    let after = null
    if (flags.afterSpec) {
      if (!fs.existsSync(path.join(root, flags.afterSpec))) {
        console.error(`spec-queue: --after-spec ${flags.afterSpec}: no such spec file`)
        process.exit(2)
      }
      after = { spec: flags.afterSpec }
    } else if (flags.afterBrief) {
      const num = normBrief(flags.afterBrief)
      if (!statusJson.briefs.some(b => b.num === num)) {
        console.error(`spec-queue: --after-brief ${flags.afterBrief}: no docs/roadmap/${num}-*.md found`)
        process.exit(2)
      }
      after = { brief: num }
    }

    const raw = loadQueue()
    const items = reconciledItems(raw ? raw.items : [], statusJson, { append: true })
    const ctx = ctxFor(statusJson)

    // A brief or spec is queued at most once — refuse regardless of the existing item's
    // doneness (no done-item exception). Position is numbered exactly as `list` (pending)
    // when the existing item is itself pending; a done duplicate has no `list` position (done
    // items are hidden there), so it is named by its raw item-order position instead.
    if (kind === 'brief' || kind === 'spec') {
      const dupIdx = items.findIndex(it => (kind === 'brief' && it.kind === 'brief' && it.brief === briefNum)
        || (kind === 'spec' && it.kind === 'spec' && it.spec === specPath))
      if (dupIdx !== -1) {
        const pending = pendingIndices(items, ctx)
        const pendPos = pending.indexOf(dupIdx)
        const ref = kind === 'brief' ? briefNum : specPath
        const label = kind === 'brief' ? `brief ${briefNum}` : specPath
        const posDesc = pendPos !== -1 ? `position ${pendPos + 1}` : `position ${dupIdx + 1} (done)`
        console.error(`spec-queue: ${label} is already queued at ${posDesc} — spec-queue move ${ref} <n> to reorder it`)
        process.exit(2)
      }
    }

    // A near-duplicate free-text prompt is refused against PENDING prompts only (a ticked
    // prompt re-added is a legitimate reopen); --distinct is the honest override. A path-shaped
    // payload (a prototype contract in the plan lane) duplicates only an identical path — never
    // a prose prompt or another path (promptDupScore).
    if (kind === 'prompt' && !flags.distinct) {
      let best = null
      for (const it of items) {
        if (it.kind !== 'prompt' || isItemDone(it, ctx).done) continue
        const score = promptDupScore(payload, it.payload)
        if (score !== null && score >= DUP_THRESHOLD && (!best || score > best.score)) best = { id: it.id, score }
      }
      if (best) {
        console.error(`spec-queue: near-duplicate of ${best.id} (score ${best.score.toFixed(2)}) — spec-queue show ${best.id}; add it anyway with --distinct`)
        process.exit(2)
      }
    }

    let newItem
    if (kind === 'brief') newItem = { id: null, kind: 'brief', brief: briefNum, added: nowIso() }
    else if (kind === 'spec') newItem = { id: null, kind: 'spec', spec: specPath, added: nowIso() }
    else {
      newItem = { id: null, kind: 'prompt', lane: flags.lane, payload, added: nowIso() }
      if (flags.when) {
        const w = parseWhen(flags.when, ctx)
        if (!w) {
          console.error(`spec-queue: unrecognized --when "${flags.when}" — expected brief-state:NN:STATE, spec-exists:PATH, ledger-count:STAGE:MIN, or manual`)
          process.exit(2)
        }
        newItem.when = w
      }
    }
    if (after) newItem.after = after

    let placed
    if (flags.top) placed = [newItem, ...items]
    else if (flags.at !== null) {
      const n = Number(flags.at)
      if (!Number.isInteger(n) || n < 1) { console.error(`spec-queue: --at <n> must be an integer >= 1 (got "${flags.at}")`); process.exit(2) }
      const pending = pendingIndices(items, ctx)
      const insertAt = n - 1 >= pending.length ? items.length : pending[n - 1]
      placed = [...items.slice(0, insertAt), newItem, ...items.slice(insertAt)]
    } else {
      placed = [...items, newItem]
    }
    persist(placed, raw ? raw.seq : 0, ctx)
    console.log(`added${kind === 'brief' ? ` brief ${briefNum}` : kind === 'spec' ? ` ${specPath}` : ''}`)
    process.exit(0)
  }

  case 'move': {
    const ref = rest[0]
    const nRaw = rest[1]
    if (!ref || nRaw === undefined) { console.error('spec-queue: move needs a <ref> and <n>'); process.exit(2) }
    const n = Number(nRaw)
    if (!Number.isInteger(n) || n < 1) { console.error(`spec-queue: move <n> must be an integer >= 1 (got "${nRaw}")`); process.exit(2) }

    if (archivedItem(ref)) refuseArchived(ref)
    const statusJson = readSpecStatusJson()
    const raw = loadQueue()
    if (!raw) { console.error('spec-queue: no queue file — nothing to move (remedy: spec-queue next to seed one)'); process.exit(2) }
    const ctx = ctxFor(statusJson)
    const items = reconciledItems(raw.items, statusJson, { append: true })

    const item = resolveRef(items, ref)
    if (isItemDone(item, ctx).done) {
      console.error(`spec-queue: "${ref}" is already done — nothing to move`)
      process.exit(2)
    }
    const without = items.filter(it => it !== item)
    const pending = pendingIndices(without, ctx)
    const insertAt = n - 1 >= pending.length ? without.length : pending[n - 1]
    const finalItems = [...without.slice(0, insertAt), item, ...without.slice(insertAt)]
    persist(finalItems, raw.seq, ctx)
    console.log(`moved ${itemDesc(item, new Map(statusJson.briefs.map(b => [b.num, b.name])))} to pending position ${Math.min(n, pending.length + 1)}`)
    process.exit(0)
  }

  case 'done': {
    const ref = rest[0]
    if (!ref) { console.error('spec-queue: done needs a <ref>'); process.exit(2) }
    if (archivedItem(ref)) refuseArchived(ref)
    const statusJson = readSpecStatusJson()
    const raw = loadQueue()
    if (!raw) { console.error('spec-queue: no queue file — nothing to tick (remedy: spec-queue next to seed one)'); process.exit(2) }
    const items = reconciledItems(raw.items, statusJson, { append: true })
    const item = resolveRef(items, ref)
    item.ticked = nowIso()
    persist(items, raw.seq, ctxFor(statusJson))
    console.log(`ticked ${item.id || itemDesc(item, new Map())}`)
    process.exit(0)
  }

  case 'show': {
    const ref = rest[0]
    if (!ref) { console.error('spec-queue: show needs a <ref>'); process.exit(2) }
    const archived = archivedItem(ref)
    if (archived) {
      out(`${archived.id}  ${archived.kind} · done (archived)\n\n${archived.kind === 'prompt' ? promptAction(archived) : itemDesc(archived, new Map())}`)
      process.exit(0)
    }
    const statusJson = readSpecStatusJson()
    const raw = loadQueue()
    if (!raw) { console.error('spec-queue: no queue file — nothing to show (remedy: spec-queue next to seed one)'); process.exit(2) }
    const ctx = ctxFor(statusJson)
    const items = reconciledItems(raw.items, statusJson, { append: true })
    const item = resolveRef(items, ref)
    // Full payload, never truncated — this verb exists precisely because list/status cut.
    const briefNameByNum = new Map(statusJson.briefs.map(b => [b.num, b.name]))
    console.log(`${item.id || '—'}  ${item.kind}${isItemDone(item, ctx).done ? ' · done' : ''}`)
    if (item.after) {
      const r = isItemReady(item, ctx)
      console.log(r.ready ? '⏳ gate met' : `⏳ after ${r.target} (${r.state})`)
    }
    console.log('')
    console.log(item.kind === 'prompt' ? promptAction(item) : itemDesc(item, briefNameByNum))
    process.exit(0)
  }
}
