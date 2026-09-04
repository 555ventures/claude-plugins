#!/usr/bin/env node
'use strict'
// spec-queue.js <subcommand> [args] — the sole writer of the per-repo session queue
// (<git-common-dir>/spec-queue.json). Why: specs/20260903/03-pipeline-queue-mechanics.md —
// the queue is the pipeline's own memory for deferred work: an item can wait behind a spec
// or a brief (an "after" gate) until that target is done, an ad-hoc spec can be queued by
// path at any position, a brief that lands on the roadmap is appended last with no mark or
// notice, and a brief or spec is queued at most once. spec-status.js reads this file
// read-only, as an input overlay to its `--next` derivation — it never writes it, and this
// script never re-derives `--next`'s own action/blockers shape; for a non-prompt item it
// delegates the paste line entirely to `spec-status.js --next` (the one frozen next-pointer
// surface). Item doneness and readiness (every kind) are evaluated exclusively via
// lib/queue.js's isItemDone/isItemReady — the same evaluators spec-status.js's overlay
// uses — never a second derivation here.
//
// What this deliberately does NOT do: reorder or render spec-status.js's `--next` output
// itself; write a "done" flag onto a brief or spec item (doneness is always derived live
// from spec-status.js, never stored); keep a sidecar journal for manual ticks (the tick
// stamps the item itself, in this file); insert a newly-landed brief anywhere but the very
// end (the dependency-aware/letter-suffix placement and its veto/accept notice are retired
// — D4); alias the retired `bump`/`defer`/`ok` verbs or the retired `add --after`/`--brief`
// flags (each exits 2 naming its `move`/`--at`/payload replacement — D6); have `list` mutate
// the queue file (it virtually reconciles a copy — strip, dedupe, and append missing on-disk
// briefs — purely for display numbering; only a write subcommand persists the result).
//
// Subcommands:
//   next                          reconcile+write, print the pick (or a prompt payload)
//   list                          pending items only, numbered, gates shown, footer
//   add <payload…> [--top | --at <n>] [--after-spec <path> | --after-brief NN]
//                  [--when <type>:<args>]
//   move <ref> <n>                n counts pending positions exactly as `list` prints them
//   done <ref>                    manual tick: stamp ticked
// Payload classification: NN/NNa or a docs/roadmap/NN-*.md path -> brief; a path matching
// ^specs/.*\.md$ -> spec; anything else -> prompt verbatim.
// <ref> resolves against an id, a brief number, a spec path (exact or unique basename
// substring), or a unique prompt-payload substring.
// --when <type>:<args>: brief-state:NN:STATE · spec-exists:PATH · ledger-count:STAGE:MIN
//   (baseline is auto-stamped from the CURRENT ledger count at add time) · manual.
//
// Exit codes: 0 ok · 2 usage, unresolvable/ambiguous/already-done <ref>, duplicate brief/spec
//   on add (names `spec-queue move <ref> <n>`), a missing --after-spec/--after-brief target,
//   a removed verb/flag (names its replacement), or a corrupt queue file (remedy: remove
//   <git-common-dir>/spec-queue.json and re-run `spec-queue next`) · 3 not a git repository
//   (remedy: run inside the repo).

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { readLedgerRows } = require('./lib/observation')
const {
  normBrief, isSupersededBriefText, isItemDone, isItemReady, makeCtx,
  dedupeItems, stripAutoPlaced, reconcileMissingBriefs,
} = require('./lib/queue')

const SPEC_STATUS = path.join(__dirname, 'spec-status.js')

function usage() {
  console.error('usage: spec-queue.js <next|list|add|move|done> [args]')
  console.error('  next | list')
  console.error('  add <payload…> [--top | --at <n>] [--after-spec <path> | --after-brief NN] [--when <type>:<args>]')
  console.error('  move <ref> <n> | done <ref>')
}

const argv = process.argv.slice(2)
const sub = argv[0]
const rest = argv.slice(1)

// D6: the retired verbs are recognized only to name their replacement and exit 2 — they
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

const SUBS = ['next', 'list', 'add', 'move', 'done']
if (!SUBS.includes(sub)) { usage(); process.exit(2) }

const root = process.cwd()

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

function nowIso() { return new Date().toISOString() }

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
  // does (D2: ready ⇔ done or superseded; D3: one readiness derivation for both callers).
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
// `baseSeq` is the queue file's previous `seq` (0 for a brand-new file).
function persist(items, baseSeq) {
  let seq = baseSeq
  const withIds = items.map(it => (it.id === null ? { ...it, id: `q${++seq}` } : it))
  writeQueue({ version: 1, seq, items: withIds })
  return { version: 1, seq, items: withIds }
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
  return it.payload
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
  if (item.kind === 'prompt') { console.log(item.payload); return }
  const r = spawnSync(process.execPath, [SPEC_STATUS, '--root', root, '--next'], { encoding: 'utf8' })
  const lines = (r.stdout || '').split('\n')
  console.log(lines.slice(1).join('\n').trim() || itemDesc(item, new Map()))
}

// The pick is the first item in queue order that is both undone AND ready (D3).
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
    const doneCount = items.length - pending.length
    if (!pending.length) {
      console.log(`✨ nothing pending · ${doneCount} done`)
      process.exit(0)
    }
    pending.forEach((it, i) => {
      let line = `${i + 1}  ${itemDesc(it, briefNameByNum)}`
      if (it.after) {
        const r = isItemReady(it, ctx)
        if (!r.ready) line += `  ⏳ after ${r.target} (${r.state})`
      }
      console.log(line)
    })
    console.log(`— ${doneCount} done · move: spec-queue move <ref> <n>`)
    process.exit(0)
  }

  case 'next': {
    const statusJson = readSpecStatusJson()
    const raw = loadQueue()
    const items = reconciledItems(raw ? raw.items : [], statusJson, { append: true })
    const { items: written } = persist(items, raw ? raw.seq : 0)
    if (!raw) console.log(`seeded queue with ${written.length} briefs (roadmap order)`)
    const ctx = ctxFor(statusJson)
    printTopLine(topPick(written, ctx))
    process.exit(0)
  }

  case 'add': {
    const flags = { when: null, top: false, at: null, afterSpec: null, afterBrief: null }
    const payloadParts = []
    for (let i = 0; i < rest.length; i++) {
      const a = rest[i]
      if (a === '--top') flags.top = true
      else if (a === '--at') flags.at = rest[++i]
      else if (a === '--after-spec') flags.afterSpec = rest[++i]
      else if (a === '--after-brief') flags.afterBrief = rest[++i]
      else if (a === '--when') flags.when = rest[++i]
      else if (a === '--after') { console.error('spec-queue: --after is retired — use --at <n> to insert at a specific pending position'); process.exit(2) }
      else if (a === '--brief') { console.error('spec-queue: --brief is retired — pass the brief number as the payload directly (e.g. spec-queue add 05)'); process.exit(2) }
      else payloadParts.push(a)
    }
    const payload = payloadParts.join(' ')
    if (!payload) { console.error('spec-queue: add needs a payload (a brief number, a spec path, or free text)'); process.exit(2) }
    if (flags.top && flags.at !== null) { console.error('spec-queue: add takes --top or --at <n>, never both'); process.exit(2) }
    if (flags.afterSpec && flags.afterBrief) { console.error('spec-queue: add takes --after-spec or --after-brief, never both'); process.exit(2) }

    const statusJson = readSpecStatusJson() // read-only — never touches the queue file

    // Classification (D1): NN/NNa or docs/roadmap/NN-*.md -> brief; specs/*.md -> spec;
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

    // --after-* target validation (D2) — BEFORE any write, so a refused add creates nothing.
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

    // D5: a brief or spec is queued at most once — refuse regardless of the existing item's
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

    let newItem
    if (kind === 'brief') newItem = { id: null, kind: 'brief', brief: briefNum, added: nowIso() }
    else if (kind === 'spec') newItem = { id: null, kind: 'spec', spec: specPath, added: nowIso() }
    else {
      newItem = { id: null, kind: 'prompt', payload, added: nowIso() }
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
    persist(placed, raw ? raw.seq : 0)
    console.log(`added${kind === 'brief' ? ` brief ${briefNum}` : kind === 'spec' ? ` ${specPath}` : ''}`)
    process.exit(0)
  }

  case 'move': {
    const ref = rest[0]
    const nRaw = rest[1]
    if (!ref || nRaw === undefined) { console.error('spec-queue: move needs a <ref> and <n>'); process.exit(2) }
    const n = Number(nRaw)
    if (!Number.isInteger(n) || n < 1) { console.error(`spec-queue: move <n> must be an integer >= 1 (got "${nRaw}")`); process.exit(2) }

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
    persist(finalItems, raw.seq)
    console.log(`moved ${itemDesc(item, new Map(statusJson.briefs.map(b => [b.num, b.name])))} to pending position ${Math.min(n, pending.length + 1)}`)
    process.exit(0)
  }

  case 'done': {
    const ref = rest[0]
    if (!ref) { console.error('spec-queue: done needs a <ref>'); process.exit(2) }
    const statusJson = readSpecStatusJson()
    const raw = loadQueue()
    if (!raw) { console.error('spec-queue: no queue file — nothing to tick (remedy: spec-queue next to seed one)'); process.exit(2) }
    const items = reconciledItems(raw.items, statusJson, { append: true })
    const item = resolveRef(items, ref)
    item.ticked = nowIso()
    persist(items, raw.seq)
    console.log(`ticked ${item.id || itemDesc(item, new Map())}`)
    process.exit(0)
  }
}
