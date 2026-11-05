#!/usr/bin/env node
'use strict'
// prototype.js — /spec:prototype driver. A throwaway worktree on proto/<stem> carries a dev-only pin
// overlay; the user pins notes from their own browser round after round until they reply `approve`;
// the pins then become design/prototypes/<stem>/contract.json and a queued /spec:plan.
//
//   node prototype.js <idea words | docs/roadmap/NN-*.md | stem> [--stem <name>] [--mark <verb>]
//   node prototype.js serve --stem <s> --port <n>    pin endpoint: POST /pin {pins:[…]}, GET /pins
//
// States OPEN → ROUND (×N) → APPROVED → CONTRACTED → CLOSED. Marks: opened, round-done, approved,
// contracted, closed (accepted from any resting state). State: design/prototypes/<stem>/status.json
// (marks, rounds completed, handled pin ids, branch, worktree, pinsPort); pins.json is the pin
// endpoint's; contract.json is written and the stem's dir committed on trunk at `contracted`. Exit: 0 ok · 1 error · 2 refusal.

const fs = require('fs')
const path = require('path')
const http = require('http')
const { spawnSync } = require('child_process')
const { makeDriver, parseArgv, refuse, writeOut } = require('./lib/driver')
const state = require('./lib/state')
const git = require('./lib/git')
const { render } = require('./lib/report')

const STEM_RE = /^[a-z0-9][a-z0-9._-]*$/
const KINDS = ['behaviour', 'look']
const now = () => new Date().toISOString()
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '')
const pinsPort = (stem) => 4700 + ([...stem].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 200)
const STOP = new Set(['a', 'an', 'the', 'with', 'for'])
const ideaStem = (words) => slug(words.split(/\s+/).filter((w) => w && !STOP.has(w.toLowerCase())).slice(0, 4).join(' '))
const statusFile = (root, stem) => path.join(root, 'design', 'prototypes', stem, 'status.json')

// ---- input: brief path | existing stem | idea words ---------------------------------------

function resolveStem(ctx) {
  const arg = ctx.arg
  let stem, brief = null, auto = false
  if (/\.md$/.test(arg)) { brief = arg; stem = path.basename(arg, '.md') }
  else if (fs.existsSync(statusFile(ctx.root, arg))) stem = arg
  else { stem = ideaStem(arg); auto = true }
  if (ctx.flags.stem && ctx.flags.stem !== true) { stem = String(ctx.flags.stem); auto = false }
  if (!STEM_RE.test(stem)) refuse(`'${stem}' is not a usable stem — pass --stem <lowercase-name>`)
  return { stem, brief, auto, idea: brief || fs.existsSync(statusFile(ctx.root, stem)) ? null : arg }
}

// ---- the driver ---------------------------------------------------------------------------

function load(ctx) {
  const r = resolveStem(ctx)
  ctx.stem = r.stem
  ctx.arg = r.stem // every printed mark line names the resolved stem
  ctx.config = state.readConfig(ctx.root)
  const saved = state.readProto(ctx.root, r.stem).status
  return saved || {
    stem: r.stem, brief: r.brief, idea: r.idea, stemAuto: r.auto, branch: 'proto/' + r.stem,
    worktree: `.claude/worktrees/proto-${r.stem}`, pinsPort: pinsPort(r.stem), rounds: 0, ready: false, marks: {},
  }
}

const save = (s, ctx) => state.writeProto(ctx.root, ctx.stem, { status: s })

function phase(s) {
  const m = s.marks
  if (m.closed) return 'CLOSED'
  if (!m.opened) return 'OPEN'
  if (!m.approved) return 'ROUND'
  return m.contracted ? 'CONTRACTED' : 'APPROVED'
}

// Worktree on proto/<stem> from trunk, with the overlay copied beside the host's dev entry.
function setup(s, ctx) {
  const wt = git.worktreeAdd(ctx.root, s.worktree, s.branch, git.trunk(ctx.config))
  const dest = path.join(wt, path.dirname(ctx.config.prototype.overlay), 'proto-overlay.js')
  const tpl = fs.readFileSync(path.join(__dirname, '..', 'templates', 'proto-overlay.js'), 'utf8')
  state.writeText(dest, tpl.replace('__PIN_ENDPOINT__', `http://127.0.0.1:${s.pinsPort}`))
  s.ready = true
}

// The overlay is an ES module the browser loads: the entry must be a browser file the html loads.
function entryProblem(ctx) {
  const o = ctx.config.prototype.overlay
  if (!o || typeof o !== 'string') return 'config.prototype.overlay is not set'
  if (!/^src\/.+\.(tsx|jsx|ts|js)$/.test(o)) return `${o} is not a .tsx/.jsx/.ts/.js file under src/`
  const text = state.readText(path.join(ctx.root, o))
  if (text === null) return `${o} does not exist`
  if (!['index.html', 'public/index.html', 'src/index.html'].some((h) => fs.existsSync(path.join(ctx.root, h)))) return 'no index.html (root, public/ or src/) loads it'
  if (/(?:require\(\s*|from\s+|import\(\s*)['"](?:node:)?https?['"]/.test(text)) return `${o} is a server file (it requires node:http)`
  return null
}

// Any HTTP answer within 2 s counts as listening.
const listening = (url) => spawnSync(process.execPath, ['-e',
  'fetch(process.argv[1], { signal: AbortSignal.timeout(2000) }).then(() => process.exit(0), () => process.exit(1))', url],
{ timeout: 5000 }).status === 0

const entryWired = (s, ctx) => {
  const text = state.readText(path.join(ctx.root, s.worktree, ctx.config.prototype.overlay), '')
  return /proto-overlay/.test(text)
}

const pinIds = (ctx) => (state.readProto(ctx.root, ctx.stem).pins || []).map((p) => p.id)
const unhandled = (s, ctx) => pinIds(ctx).filter((id) => !(s.handled || []).includes(id))
const planItem = (stem) => `/spec:plan design/prototypes/${stem}/contract.json`

function derive(s, ctx) {
  const p = ctx.config.prototype
  const cmd = (mark) => `node ${ctx.script} ${ctx.stem} --root ${ctx.root} --mark ${mark}`
  const serveCmd = `node ${ctx.script} serve --stem ${ctx.stem} --port ${s.pinsPort} --root ${ctx.root}`
  const startLines = [
    `Start the app in the background from ${s.worktree}: ${p.bootCommand || '(the host boot command)'}  — it should answer at ${p.url}`,
    `Start the pin endpoint in the background: ${serveCmd}`,
  ]
  switch (phase(s)) {
    case 'OPEN':
      if (entryProblem(ctx)) {
        return {
          name: 'OPEN', mark: 'opened', accepts: ['closed'],
          body: `⚠️ ${entryProblem(ctx)}. The overlay needs the browser entry file. Ask the user which file their index.html loads first (do not guess), set it as prototype.overlay in .claude/spec.config.json, then re-run.`,
        }
      }
      if (!s.ready) return { name: 'OPEN', auto: setup }
      return {
        name: 'OPEN', mark: 'opened', accepts: ['closed'],
        body: [
          s.stemAuto ? `📌 Auto-picked stem ${ctx.stem} (veto anytime: re-run with --stem <name>)` : '',
          `Prototype worktree ${s.worktree} on ${s.branch}, from ${git.trunk(ctx.config)}. The overlay file is already there as proto-overlay.js beside ${p.overlay}.`,
          `1. In ${s.worktree}, import it from ${p.overlay} behind a dev flag (e.g. \`if (import.meta.env.DEV) import('./proto-overlay.js')\`) and commit on ${s.branch}.`,
          ...startLines.map((l, i) => `${i + 2}. ${l}`),
          s.brief ? `Build what ${s.brief} describes.` : `Build a throwaway prototype of: ${s.idea || ctx.stem}.`,
        ].filter(Boolean).join('\n'),
      }
    case 'ROUND':
      return {
        name: 'ROUND', mark: 'round-done', accepts: ['approved', 'closed'],
        body: [
          `Round ${s.rounds + 1}. If the app or pin endpoint is not running:`, ...startLines.map((l) => '- ' + l),
          `Print exactly: 🎨 ready for pins — ${p.url}   then END YOUR TURN.`,
          `On the user's reply: a literal \`approve\` ends the loop → ${cmd('approved')}`,
          `Anything else: read design/prototypes/${ctx.stem}/pins.json and act on every pin whose id is not in status.json \`handled\`` +
            ` (now: ${unhandled(s, ctx).join(', ') || 'none'}) plus the reply itself; commit on ${s.branch}, then mark round-done (it records those ids as handled).`,
        ].join('\n'),
      }
    case 'APPROVED':
      return { name: 'APPROVED', mark: 'contracted', accepts: ['closed'], body: `Approved after ${s.rounds} round(s). Mark contracted to write the contract from the pins.` }
    case 'CONTRACTED':
      return {
        name: 'CONTRACTED', mark: 'closed',
        body: render({
          outcome: `✅ contract written — design/prototypes/${ctx.stem}/contract.json`,
          bullets: `design/prototypes/${ctx.stem}/ committed on trunk. Worktree and branch stay until the specs built from this are done; then mark closed.`,
          queued: planItem(ctx.stem),
          next: planItem(ctx.stem),
        }),
      }
    default:
      return { name: 'CLOSED', body: render({ outcome: `✅ prototype closed — ${ctx.stem}`, bullets: 'worktree and branch removed', warns: s.closeWarn, next: 'nothing needs you — the contract carries on' }) }
  }
}

const steps = {
  opened(s, _f, ctx) {
    if (entryProblem(ctx)) refuse(`${entryProblem(ctx)} — ask the user for the browser entry file and set prototype.overlay`)
    if (!entryWired(s, ctx)) refuse(`${ctx.config.prototype.overlay} in ${s.worktree} does not import proto-overlay.js yet — add the dev-only import, commit it, then mark opened`)
    const url = ctx.config.prototype.url
    if (!listening(url)) refuse(`nothing answers at ${url} — start the app from ${s.worktree} (${ctx.config.prototype.bootCommand || 'the host boot command'}), or fix prototype.url in .claude/spec.config.json, then mark opened`)
    s.marks.opened = now()
  },
  'round-done'(s, _f, ctx) { s.rounds += 1; s.handled = pinIds(ctx); s.marks.lastRound = now() },
  // The approving round is a completed round too: "Round 2" then approve reads "after 2 round(s)".
  approved(s) { s.rounds += 1; s.marks.approved = now() },
  contracted(s, _f, ctx) {
    const trunk = git.trunk(ctx.config)
    const on = git.raw(['symbolic-ref', '--short', 'HEAD'], ctx.root).stdout.trim()
    if (on !== trunk) refuse(`${ctx.root} is on ${on || 'a detached HEAD'}, not ${trunk} — check out ${trunk} there, then mark contracted`)
    const pins = state.readProto(ctx.root, ctx.stem).pins || []
    if (!pins.length) refuse('no pins were recorded — a prototype that changed nothing is the direct lane; nothing to contract')
    const rec = ({ id, kind, route, selector, note }) => ({
      id, kind, route, ...(selector ? { selector } : {}), note, sentence: `On ${route}: ${String(note).trim()}`,
    })
    state.writeProto(ctx.root, ctx.stem, { contract: { stem: ctx.stem, rounds: s.rounds, pins: pins.map(rec) } })
    const payload = planItem(ctx.stem)
    const q = state.readQueue(ctx.root)
    if (!q.items.some((i) => i.payload === payload && !i.done)) {
      q.seq += 1
      q.items.push({ id: 'q' + q.seq, kind: 'prompt', payload, added: now() })
      state.writeQueue(ctx.root, q)
    }
    s.marks.contracted = now()
    save(s, ctx) // the committed status.json already carries the contracted mark
    const dir = path.join('design', 'prototypes', ctx.stem)
    git.sh(['add', '--', dir], ctx.root)
    if (git.raw(['diff', '--cached', '--quiet', '--', dir], ctx.root).status !== 0) git.sh(['commit', '-q', '-m', `chore(proto): contract ${ctx.stem}`, '--', dir], ctx.root)
  },
  closed(s, _f, ctx) {
    const queued = state.readQueue(ctx.root).items.find((i) => i.payload === planItem(ctx.stem) && !i.done)
    if (queued) s.closeWarn = `${planItem(ctx.stem)} is still pending in the queue (${queued.id}) — plan it, or drop it with /spec:queue done ${queued.id}`
    git.worktreeRemove(ctx.root, s.worktree, { deleteBranch: s.branch })
    s.marks.closed = now()
  },
}

const driver = makeDriver({
  name: 'prototype', specArg: 'idea words | docs/roadmap/NN-*.md | stem', load, save, derive, steps,
  script: __filename,
})

// ---- serve: the pin endpoint ---------------------------------------------------------------

function validPin(p) {
  if (!p || typeof p !== 'object') return 'a pin must be an object'
  if (!KINDS.includes(p.kind)) return `kind must be ${KINDS.join(' or ')}`
  if (typeof p.route !== 'string' || !p.route.startsWith('/')) return 'route must be a path starting with /'
  if (typeof p.note !== 'string' || !p.note.trim()) return 'note must not be empty'
  if (p.selector !== undefined && typeof p.selector !== 'string') return 'selector must be a string'
  return null
}

function serve(a) {
  const stem = a.flags.stem, port = Number(a.flags.port)
  if (!STEM_RE.test(String(stem)) || !Number.isInteger(port)) refuse('usage: serve --stem <stem> --port <n> [--root <dir>]')
  const root = a.root
  const reply = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
  // Only a page served from this machine may write pins: any other site the user has open could
  // otherwise POST notes that later become contract sentences and spec criteria.
  const local = (o) => { try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(o).hostname) } catch { return false } }
  const server = http.createServer((req, res) => {
    const o = req.headers.origin
    if (o !== undefined && !local(o)) return reply(res, 403, { error: 'pins are accepted only from a page on this machine' })
    if (o !== undefined) { res.setHeader('access-control-allow-origin', o); res.setHeader('vary', 'origin') }
    res.setHeader('access-control-allow-headers', 'content-type')
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
    if (req.method === 'GET' && req.url === '/pins') return reply(res, 200, state.readProto(root, stem).pins || [])
    if (req.method !== 'POST' || req.url !== '/pin') return reply(res, 404, { error: 'POST /pin or GET /pins' })
    let raw = ''
    // Over 1 MB: answer 413 once and drain the rest without keeping it.
    req.on('data', (c) => { if (raw === null) return; raw += c; if (raw.length > 1e6) { raw = null; reply(res, 413, { error: 'body over 1 MB' }) } })
    req.on('end', () => {
      if (raw === null) return
      let body
      try { body = JSON.parse(raw) } catch { return reply(res, 400, { error: 'body is not JSON' }) }
      const list = body && body.pins
      if (!Array.isArray(list) || !list.length) return reply(res, 400, { error: 'send {pins: [ … ]} with at least one pin' })
      for (const p of list) { const why = validPin(p); if (why) return reply(res, 400, { error: why }) }
      const docs = state.readProto(root, stem)
      const pins = docs.pins || []
      let n = pins.reduce((m, p) => Math.max(m, Number(String(p.id).slice(1)) || 0), 0)
      const round = ((docs.status && docs.status.rounds) || 0) + 1
      const added = list.map((p) => ({ id: 'p' + ++n, kind: p.kind, route: p.route, ...(p.selector ? { selector: p.selector } : {}), note: p.note.trim(), round, at: now() }))
      state.writeProto(root, stem, { pins: [...pins, ...added] })
      reply(res, 201, { ids: added.map((p) => p.id) })
    })
  })
  server.listen(port, '127.0.0.1', () => writeOut(1, `pin endpoint http://127.0.0.1:${port} (stem ${stem})\n`))
}

// ---- entry ---------------------------------------------------------------------------------

function main(argv) {
  const sub = argv[0] === 'serve' && argv.includes('--stem') ? 'serve' : null
  try {
    const a = parseArgv(sub ? argv.slice(1) : argv)
    if (sub === 'serve') return void serve(a)
    // `$ARGUMENTS` arrives unquoted: rejoin the idea words into the one argument the driver takes.
    const out = [a.pos.join(' '), '--root', a.root].filter(Boolean)
    if (a.mark) out.push('--mark', a.mark)
    if (a.state) out.push('--state')
    if (a.json) out.push('--json')
    for (const [k, v] of Object.entries(a.flags)) out.push('--' + k, ...(v === true ? [] : [v]))
    return driver(out)
  } catch (e) {
    writeOut(2, `prototype: ${e.message}\n`)
    return typeof e.exit === 'number' ? e.exit : 1
  }
}

if (require.main === module) {
  const code = main(process.argv.slice(2))
  if (code !== undefined) process.exitCode = code
}
module.exports = { main }
