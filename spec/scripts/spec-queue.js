#!/usr/bin/env node
'use strict'
// spec-queue.js <subcommand> [args] — the sole writer of the per-repo session queue
// (<git-common-dir>/spec-queue.json). Why: specs/20260823/08-derived-session-queue.md —
// JJ's intended work order across roadmap briefs, plus free-text work items and their
// done-when predicates, was being reconstructed by hand every session (the 2026-08-18-
// style incident this spec exists to end). spec-status.js reads this file read-only, as
// an input overlay to its `--next` derivation (D2) — it never writes it, and this script
// never re-derives `--next`'s own action/blockers shape; for a `brief` item it delegates
// the paste line entirely to `spec-status.js --next` (the one frozen next-pointer
// surface), layering only queue-specific parts (seed/reconcile summaries, auto-placement
// veto notices) on top. Item doneness (both kinds) is evaluated exclusively via
// lib/queue.js's isItemDone — the same evaluator spec-status.js's overlay uses — never a
// second derivation here.
//
// What this deliberately does NOT do: reorder or render spec-status.js's `--next` output
// itself; write a "done" flag onto a brief item (D4 — brief doneness is always derived
// live from spec-status.js, never stored); keep a sidecar journal for manual ticks (D14 —
// the tick stamps the item itself, in this file); seed or reconcile-insert from `list`/
// `hello` (D7/D8 — those two subcommands are read-only and never write the queue file,
// even when on-disk briefs have drifted since the last write subcommand ran).
//
// Subcommands:
//   next                          reconcile+write, print top undone item + notices
//   list                          full queue: done ✅ · top ▶ · pending ○ · auto-placed 🅰
//   add <payload…> [--brief NN] [--when <type>:<args>] [--top | --after <ref>]
//   bump <ref>                    move to top, clear auto_placed
//   defer <ref> [--after <ref2>]  move to end (or after ref2), clear auto_placed
//   done <ref>                    manual tick: stamp ticked, clear auto_placed
//   ok [<ref>]                    accept auto placement(s): clear flag, keep position
//   hello                         hook mode: silent unless something to say (D8)
// <ref> resolves against an id, a brief number, or a unique payload substring.
// --when <type>:<args>: brief-state:NN:STATE · spec-exists:PATH · ledger-count:STAGE:MIN
//   (baseline is auto-stamped from the CURRENT ledger count at add time, D5) · manual.
//
// Exit codes: 0 ok/nothing-to-say · 2 usage, unresolvable <ref>, or a corrupt queue file
//   (remedy: spec-queue list; or remove .git/spec-queue.json and re-run spec-queue next to
//   reseed) · 3 not a git repository (remedy: run inside the repo; hello exits 0 silently
//   instead, per D8 — a SessionStart hook must never surface a session-start error).

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { readLedgerRows } = require('./lib/observation')
const {
  normBrief, isSupersededBriefText, isItemDone, makeCtx, reconcileMissingBriefs,
} = require('./lib/queue')

const SPEC_STATUS = path.join(__dirname, 'spec-status.js')

function usage() {
  console.error('usage: spec-queue.js <next|list|add|bump|defer|done|ok|hello> [args]')
  console.error('  next | list')
  console.error('  add <payload…> [--brief NN] [--when <type>:<args>] [--top | --after <ref>]')
  console.error('  bump <ref> | defer <ref> [--after <ref2>] | done <ref> | ok [<ref>] | hello')
}

const argv = process.argv.slice(2)
const SUBS = ['next', 'list', 'add', 'bump', 'defer', 'done', 'ok', 'hello']
const sub = argv[0]
if (!SUBS.includes(sub)) { usage(); process.exit(2) }
const rest = argv.slice(1)

const root = process.cwd()

function resolveCommonDir(dir) {
  const r = spawnSync('git', ['-C', dir, 'rev-parse', '--git-common-dir'], { encoding: 'utf8' })
  if (r.error || r.status !== 0) return null
  const raw = r.stdout.trim()
  return path.isAbsolute(raw) ? raw : path.resolve(dir, raw)
}

const common = resolveCommonDir(root)
if (!common) {
  if (sub === 'hello') process.exit(0) // D8: the hook must never surface a session-start error
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

function writeQueue(data) {
  fs.writeFileSync(QUEUE_PATH, JSON.stringify({ version: 1, seq: data.seq, items: data.items }, null, 2) + '\n')
}

function nowIso() { return new Date().toISOString() }

// On-disk briefs the way spec-queue.js needs them: num + dependsOn + status come straight
// from spec-status.js's own derivation (never re-parsed here — see the module header);
// superseded exclusion (D6) reads each brief file once more for isSupersededBriefText.
function onDiskBriefs(statusJson) {
  return statusJson.briefs
    .filter(b => {
      try { return !isSupersededBriefText(fs.readFileSync(path.join(root, b.file), 'utf8')) }
      catch { return true } // file vanished under us — treat as queueable, never silently drop it
    })
    .map(b => ({ num: b.num, dependsOn: b.depends_on, status: b.status }))
}

// Write-path reconcile (D6/D7): seed an absent file (non-done briefs only, roadmap order,
// zero auto_placed, one summary line) or insert on-disk non-done briefs missing from an
// existing file (auto_placed + a veto notice each). Every write subcommand calls this
// before its own mutation; `list`/`hello` never do.
function reconcileForWrite(statusJson) {
  const disk = onDiskBriefs(statusJson).filter(b => b.status !== 'done')
  let data = loadQueue()
  if (!data) {
    const items = disk.map((b, i) => ({ id: `q${i + 1}`, kind: 'brief', brief: b.num, added: nowIso() }))
    data = { version: 1, seq: items.length, items }
    writeQueue(data)
    console.log(`seeded queue with ${items.length} briefs (roadmap order)`)
    return { data, notices: [] }
  }
  const { items: reconciled, inserted } = reconcileMissingBriefs(data.items, disk, { stamp: nowIso })
  if (inserted.length) {
    let seq = data.seq
    for (const it of inserted) it.id = `q${++seq}`
    data = { version: 1, seq, items: reconciled }
    writeQueue(data)
  }
  const notices = reconciled
    .filter(it => it.kind === 'brief' && it.auto_placed)
    .map(it => autoPlacedNotice(reconciled, it))
  return { data, notices }
}

function autoPlacedNotice(items, item) {
  const idx = items.indexOf(item)
  let after = null
  for (let i = idx - 1; i >= 0; i--) { if (items[i].kind === 'brief') { after = items[i].brief; break } }
  return `⚠️ auto-queued: brief ${item.brief} ${after ? `after ${after}` : 'at the top'} — veto: spec-queue bump ${item.brief} · accept: spec-queue ok ${item.brief}`
}

function ctxFor(statusJson) {
  const briefStatusMap = new Map(statusJson.briefs.map(b => [b.num, b.status]))
  return makeCtx({ ledgerRows: readLedgerRows(root), briefStatus: n => briefStatusMap.get(n), specRoot: root })
}

function topUndone(items, ctx) {
  for (const it of items) if (!isItemDone(it, ctx).done) return it
  return null
}

// Delegates the actual paste line to spec-status.js's own overlay-aware --next — the sole
// next-pointer derivation (D2) — rather than re-deriving a brief's action here.
function printTopLine(item) {
  if (!item) { console.log('✨ queue empty — nothing left undone'); return }
  if (item.kind === 'prompt') { console.log(item.payload); return }
  const r = spawnSync(process.execPath, [SPEC_STATUS, '--root', root, '--next'], { encoding: 'utf8' })
  const lines = (r.stdout || '').split('\n')
  console.log(lines.slice(1).join('\n').trim() || `brief ${item.brief}`)
}

function resolveRef(items, ref) {
  let matches = items.filter(i => i.id === ref)
  if (!matches.length) matches = items.filter(i => i.kind === 'brief' && i.brief === normBrief(ref))
  if (!matches.length) matches = items.filter(i => i.kind === 'prompt' && i.payload.includes(ref))
  if (!matches.length) {
    console.error(`spec-queue: no item matches "${ref}" — run \`spec-queue list\` to see current ids/briefs/payloads`)
    process.exit(2)
  }
  if (matches.length > 1) {
    console.error(`spec-queue: "${ref}" is ambiguous — matches ${matches.map(m => m.id).join(', ')} — use the id instead`)
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

switch (sub) {
  case 'hello': {
    if (!fs.existsSync(QUEUE_PATH)) process.exit(0) // D8: the hook never creates the file
    const data = loadQueue()
    const ctx = ctxFor(readSpecStatusJson())
    const notices = data.items.filter(i => i.kind === 'brief' && i.auto_placed).map(i => autoPlacedNotice(data.items, i))
    const top = topUndone(data.items, ctx)
    if (!top && !notices.length) process.exit(0) // D8: nothing to say -> silent
    if (top) printTopLine(top)
    notices.forEach(n => console.log(n))
    process.exit(0)
  }

  case 'list': {
    const data = loadQueue()
    if (!data || !data.items.length) {
      console.log('queue is empty — seed it with `spec-queue next`, or start it with `spec-queue add <payload>`')
      process.exit(0)
    }
    const ctx = ctxFor(readSpecStatusJson())
    let sawTop = false
    for (const it of data.items) {
      const done = isItemDone(it, ctx).done
      const glyph = done ? '✅' : (!sawTop ? '▶' : '○')
      if (!done) sawTop = true
      const desc = it.kind === 'brief' ? `brief ${it.brief}` : it.payload
      const tags = [it.auto_placed ? '🅰' : null, it.ticked ? `ticked ${it.ticked}` : null].filter(Boolean)
      console.log(`${glyph} ${it.id}  ${desc}${tags.length ? '  (' + tags.join(', ') + ')' : ''}`)
    }
    process.exit(0)
  }

  case 'next': {
    const { data, notices } = reconcileForWrite(readSpecStatusJson())
    const ctx = ctxFor(readSpecStatusJson())
    notices.forEach(n => console.log(n))
    printTopLine(topUndone(data.items, ctx))
    process.exit(0)
  }

  case 'add': {
    const flags = { brief: null, when: null, top: false, after: null }
    const payloadParts = []
    for (let i = 0; i < rest.length; i++) {
      const a = rest[i]
      if (a === '--brief') flags.brief = rest[++i]
      else if (a === '--when') flags.when = rest[++i]
      else if (a === '--top') flags.top = true
      else if (a === '--after') flags.after = rest[++i]
      else payloadParts.push(a)
    }
    const payload = payloadParts.join(' ')
    if (!payload && !flags.brief) { console.error('spec-queue: add needs a payload (a brief number, a roadmap path, or free text)'); process.exit(2) }
    const statusJson = readSpecStatusJson()
    const { data } = reconcileForWrite(statusJson)

    let newItem
    const roadmapPathMatch = /^docs\/roadmap\/(\d+[a-z]?)-/.exec(payload)
    if (flags.brief || /^\d{2}[a-z]?$/.test(payload) || roadmapPathMatch) {
      const num = normBrief(flags.brief || (roadmapPathMatch ? roadmapPathMatch[1] : payload))
      newItem = { id: null, kind: 'brief', brief: num, added: nowIso() }
    } else {
      newItem = { id: null, kind: 'prompt', payload, added: nowIso() }
      if (flags.when) {
        const w = parseWhen(flags.when, ctxFor(statusJson))
        if (!w) {
          console.error(`spec-queue: unrecognized --when "${flags.when}" — expected brief-state:NN:STATE, spec-exists:PATH, ledger-count:STAGE:MIN, or manual`)
          process.exit(2)
        }
        newItem.when = w
      }
    }
    let seq = data.seq
    newItem.id = `q${++seq}`
    const items = data.items.slice()
    if (flags.top) items.unshift(newItem)
    else if (flags.after) { const ref = resolveRef(items, flags.after); items.splice(items.indexOf(ref) + 1, 0, newItem) }
    else items.push(newItem)
    writeQueue({ version: 1, seq, items })
    console.log(`added ${newItem.id}${newItem.kind === 'brief' ? ` (brief ${newItem.brief})` : ''}`)
    process.exit(0)
  }

  case 'bump': {
    const ref = rest[0]
    if (!ref) { console.error('spec-queue: bump needs a <ref>'); process.exit(2) }
    const { data } = reconcileForWrite(readSpecStatusJson())
    const item = resolveRef(data.items, ref)
    const items = data.items.filter(i => i !== item)
    delete item.auto_placed
    items.unshift(item)
    writeQueue({ version: 1, seq: data.seq, items })
    console.log(`bumped ${item.id} to the top`)
    process.exit(0)
  }

  case 'defer': {
    const ref = rest[0]
    let after = null
    for (let i = 1; i < rest.length; i++) if (rest[i] === '--after') after = rest[++i]
    if (!ref) { console.error('spec-queue: defer needs a <ref>'); process.exit(2) }
    const { data } = reconcileForWrite(readSpecStatusJson())
    const item = resolveRef(data.items, ref)
    const items = data.items.filter(i => i !== item)
    delete item.auto_placed
    if (after) { const target = resolveRef(items, after); items.splice(items.indexOf(target) + 1, 0, item) }
    else items.push(item)
    writeQueue({ version: 1, seq: data.seq, items })
    console.log(`deferred ${item.id}`)
    process.exit(0)
  }

  case 'done': {
    const ref = rest[0]
    if (!ref) { console.error('spec-queue: done needs a <ref>'); process.exit(2) }
    const { data } = reconcileForWrite(readSpecStatusJson())
    const item = resolveRef(data.items, ref)
    item.ticked = nowIso()
    delete item.auto_placed
    writeQueue(data)
    console.log(`ticked ${item.id}`)
    process.exit(0)
  }

  case 'ok': {
    const ref = rest[0]
    const { data } = reconcileForWrite(readSpecStatusJson())
    if (ref) {
      const item = resolveRef(data.items, ref)
      delete item.auto_placed
      writeQueue(data)
      console.log(`accepted placement of ${item.id}`)
    } else {
      const cleared = data.items.filter(i => i.auto_placed)
      cleared.forEach(i => delete i.auto_placed)
      writeQueue(data)
      console.log(`accepted placement of ${cleared.length} item(s)`)
    }
    process.exit(0)
  }
}
