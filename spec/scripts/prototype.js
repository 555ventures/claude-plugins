#!/usr/bin/env node
'use strict'
// prototype.js — /spec:prototype driver. A throwaway worktree on proto/<stem> carries a running app;
// the user argues with it in chat round after round, the session records each ruling as a pin
// sentence, and a literal `approve` plus the user's yes on the sentences makes
// design/prototypes/<stem>/contract.json and a queued /spec:plan.
//
//   node prototype.js <idea words | docs/roadmap/NN-*.md | stem> [--stem <name>] [--mark <verb>]
//   node prototype.js <stem> pin --kind behaviour|look --route </route> [--given "<precondition>"] --note "<note>"
//   node prototype.js <stem> drop pN --why "<reason>"
//
// States OPEN → ROUND (×N) → APPROVED → CONTRACTED → CLOSED. Marks: opened, round-done, approved,
// contracted --confirmed, closed [--force]. State: design/prototypes/<stem>/status.json (marks, rounds,
// handled pin ids, branch, worktree, app {pid, …}, appPort, url); pins.json is the pin list (a plain array);
// contract.json is written and the stem's dir committed on trunk at `contracted`. Exit: 0 ok · 1 error · 2 refusal.

const fs = require('fs')
const path = require('path')
const { makeDriver, parseArgv, refuse, writeOut, shq } = require('./lib/driver')
const state = require('./lib/state')
const Q = require('./lib/queue')
const git = require('./lib/git')
const host = require('./lib/host')
const app = require('./lib/app')
const { render } = require('./lib/report')
const N = require('./lib/next')

const STEM_RE = /^[a-z0-9][a-z0-9._-]*$/
const KINDS = ['behaviour', 'look']
const now = () => new Date().toISOString()
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '')
const STOP = new Set(['a', 'an', 'the', 'with', 'for'])
const ideaStem = (words) => slug(words.split(/\s+/).filter((w) => w && !STOP.has(w.toLowerCase())).slice(0, 4).join(' '))
const statusFile = (root, stem) => path.join(root, 'design', 'prototypes', stem, 'status.json')
const designDir = (stem) => path.join('design', 'prototypes', stem)
const contractPath = (stem) => `design/prototypes/${stem}/contract.json`
const planItem = (stem) => `/spec:plan ${contractPath(stem)}`
const sentenceOf = (p) => `On ${p.route}${p.given ? `, given ${p.given}` : ''}: ${String(p.note).trim()}`
const picSlug = (route) => (route === '/' ? 'root' : route.replace(/\//g, '_').replace(/^_+/, '').replace(/[^\w.-]/g, '_'))
const copy = (o) => JSON.parse(JSON.stringify(o))
// Fields that live only for the invocation that set them: the report reads them, status.json never holds them.
const TRANSIENT = ['closeWarn', 'removed', 'discarded', 'pictureWarns', 'appError']

// ---- input: brief path | existing stem | idea words ---------------------------------------

function resolveStem(ctx) {
  const arg = ctx.arg
  let stem, brief = null, auto = false
  if (/\.md$/.test(arg)) {
    const abs = path.resolve(ctx.root, arg)
    const outside = path.relative(ctx.root, abs).split(path.sep)[0] === '..'
    if (outside || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      refuse(`no brief at ${arg} — pass a roadmap brief path, idea words or a stem`)
    }
    brief = arg; stem = path.basename(arg, '.md')
  }
  else if (fs.existsSync(statusFile(ctx.root, arg))) stem = arg
  else { stem = ideaStem(arg); auto = true }
  if (ctx.flags.stem && ctx.flags.stem !== true) { stem = String(ctx.flags.stem); auto = false }
  if (!STEM_RE.test(stem)) refuse(`'${stem}' is not a usable stem — pass --stem <lowercase-name>`)
  return { stem, brief, auto, idea: brief || fs.existsSync(statusFile(ctx.root, stem)) ? null : arg }
}

// ---- the driver ---------------------------------------------------------------------------

function load(ctx) {
  const words = ctx.arg
  const r = resolveStem(ctx)
  ctx.stem = r.stem
  ctx.arg = r.stem // every printed mark line names the resolved stem
  ctx.config = state.readConfig(ctx.root)
  const saved = state.readProto(ctx.root, r.stem).status
  // Idea words that only auto-derive an existing stem are a different idea, not a resume.
  if (saved && r.auto && saved.idea !== words) {
    refuse(`stem ${r.stem} belongs to "${saved.idea || saved.brief || r.stem}" — re-run with those words or the stem, or pass --stem <other>`)
  }
  return saved || {
    stem: r.stem, brief: r.brief, idea: r.idea, stemAuto: r.auto, branch: 'proto/' + r.stem,
    worktree: `.claude/worktrees/proto-${r.stem}`, app: null, appPort: null, url: null, rounds: 0, ready: false,
    marks: {}, handled: [],
  }
}

function save(s, ctx) {
  const out = { ...s }
  for (const k of TRANSIENT) delete out[k]
  if (!s.discarded) state.writeProto(ctx.root, ctx.stem, { status: out })
}

function phase(s) {
  const m = s.marks
  if (m.closed) return 'CLOSED'
  if (!m.opened) return 'OPEN'
  if (!m.approved) return 'ROUND'
  return m.contracted ? 'CONTRACTED' : 'APPROVED'
}

// The app's options: the worktree it runs in, its port and its log (lib/app.js owns the rest).
const appOpts = (s, ctx) => ({
  cwd: path.resolve(ctx.root, s.worktree), port: s.appPort, root: ctx.root,
  log: state.appLog(ctx.root, 'proto-' + ctx.stem),
})

// Worktree on proto/<stem> from trunk, provisioned as a run's is (the .worktreeinclude files, the host's setupCommand),
// one free port when the url holds {port}, then the app booted (runtime.envCommand first). A refusal removes the
// worktree this call made, so the re-run provisions afresh.
function setup(s, ctx) {
  const rt = ctx.config.runtime
  const from = git.trunk(ctx.config)
  const had = git.branchExists(ctx.root, s.branch) // a branch it did not create is never deleted
  const made = host.provision(ctx.root, { rel: s.worktree, branch: s.branch, from, config: ctx.config })
  const drop = had ? {} : { deleteBranch: s.branch }
  const undo = () => { if (made.fresh) git.worktreeRemove(ctx.root, made.wt, { force: true, ...drop }) }
  try {
    if (made.setup.status !== 0) {
      const msg = `setupCommand failed in ${made.wt}:\n${made.setup.tail}\nfix setupCommand in .claude/spec.config.json`
      refuse(msg + ', then re-run', 1)
    }
    if (s.url == null) {
      s.appPort = /\{port\}/.test(rt.url) ? host.freePort() : null
      s.url = host.resolveUrl(rt.url, s.appPort)
    }
    s.app = app.start(rt, appOpts(s, ctx))
  } catch (e) { undo(); throw e }
  s.ready = true
  revived = true // just booted: trusted until the next invocation
}

// OPEN (after setup) and ROUND over an app not up (dead, or answering nothing): restarted (a restart failure is the
// step's warning), never restarted while it is up, and at most once per invocation (the restarted app is trusted until
// the next one).
let revived = false
function revive(s, ctx) {
  delete s.appError
  revived = true
  try {
    s.app = app.ensure(ctx.config.runtime, s.app, { ...appOpts(s, ctx), restart: false })
  } catch (e) { s.appError = e.message }
}

const docs = (ctx) => state.readProto(ctx.root, ctx.stem)
const pinsOf = (ctx) => docs(ctx).pins || []
const active = (pins) => pins.filter((p) => p.status === 'active')
const pinLine = (ctx) => `node ${shq(ctx.script)} ${shq(ctx.stem)} pin --kind behaviour|look --route </route> [--given "<precondition in words>"] --note "<note>" --root ${shq(ctx.root)}`
const markCmd = (ctx, mark) => `node ${shq(ctx.script)} ${shq(ctx.stem)} --root ${shq(ctx.root)} --mark ${mark}`
const pinBullet = (p) => `- ${p.id} (${p.kind}): ${sentenceOf(p)}`

function approvedBody(s, ctx) {
  const pins = active(pinsOf(ctx))
  const routes = [...new Set(pins.map((p) => p.route))]
  return [
    `Approved after ${s.rounds} round(s).`,
    ...routes.flatMap((r) => ['', r, ...pins.filter((p) => p.route === r).map(pinBullet)]),
    '',
    `Show the user these sentences. On a yes: ${markCmd(ctx, 'contracted --confirmed')}. To change one: drop it and pin it again, then re-run.`,
    `  drop: node ${shq(ctx.script)} ${shq(ctx.stem)} drop pN --why "<reason>" --root ${shq(ctx.root)}`,
    ...(ctx.config.prototype.picture ? ['', `Pictures are taken from the running app at ${s.url}.`] : []),
  ].join('\n')
}

// The runtime and pin-test keys the host has not set: the pin-test pair counts as missing when either is.
const filled = (v) => typeof v === 'string' && v.trim() !== ''
const PAIR = ['prototype.e2eFile', 'prototype.e2eCommand']
const ASKED = {
  'runtime.bootCommand': 'starts the app; $PORT when runtime.url has {port}',
  'prototype.e2eFile': 'the file the pin tests go in; {stem} substituted',
  'prototype.e2eCommand': 'runs one e2e file against APP_URL; {file} substituted',
}
const undeclared = (cfg) => [
  ...(app.bootOf(cfg.runtime) ? [] : ['runtime.bootCommand']),
  ...(filled(cfg.prototype.e2eFile) && filled(cfg.prototype.e2eCommand) ? [] : PAIR),
]
const runtimeQuestion = (keys) => [
  "The host's runtime is not declared yet.",
  'Ask the user once (AskUserQuestion, one question, free text per key):',
  ...keys.map((k) => `- ${k}: ${ASKED[k]}`),
  'Set the answers in .claude/spec.config.json, then re-run.',
].join('\n')

function derive(s, ctx) {
  const cmd = (mark) => markCmd(ctx, mark)
  switch (phase(s)) {
    case 'OPEN': {
      const asks = !s.ready && undeclared(ctx.config)
      if (asks && asks.length) return { name: 'OPEN', accepts: ['closed'], body: runtimeQuestion(asks) }
      if (!s.ready) return { name: 'OPEN', auto: setup }
      if (!revived && !s.appError && !app.up(ctx.config.runtime, s.app)) return { name: 'OPEN', auto: revive }
      if (s.appError) return { name: 'OPEN', accepts: ['closed'], body: `⚠️ the app did not come up — ${s.appError}` }
      return {
        name: 'OPEN', mark: 'opened', accepts: ['closed'],
        body: [
          s.stemAuto ? `📌 Auto-picked stem ${ctx.stem} (veto anytime: re-run with --stem <name>)` : '',
          `Prototype worktree ${s.worktree} on ${s.branch}, from ${git.trunk(ctx.config)}.`,
          `app up at ${s.url}`,
          s.brief ? `Build a throwaway prototype of ${s.brief}` : `Build a throwaway prototype of ${s.idea || ctx.stem}`,
        ].filter(Boolean).join('\n'),
      }
    }
    case 'ROUND': {
      if (!revived && !s.appError && !app.up(ctx.config.runtime, s.app)) return { name: 'ROUND', auto: revive }
      if (s.appError) {
        return { name: 'ROUND', accepts: ['closed'], body: `⚠️ the app did not come up — ${s.appError}` }
      }
      const round = s.rounds + 1
      const made = active(pinsOf(ctx)).filter((x) => x.round === round)
      return {
        name: 'ROUND', mark: 'round-done', accepts: ['approved', 'closed'],
        body: [
          `Round ${round}.`,
          'Pins made this round:', ...(made.length ? made.map(pinBullet) : ['none yet']),
          `Print exactly: 🎨 ready for pins — ${s.url}   then END YOUR TURN.`,
          `On the user's reply: a literal \`approve\` ends the loop → ${cmd('approved')}`,
          `Anything else: for each ruling run the pin line below, change the app, commit on ${s.branch}, then mark round-done.`,
          `  pin: ${pinLine(ctx)}`,
          '  (--kind behaviour: what the user does or sees; look: how it looks. --given: the production precondition in words, never a switch.)',
        ].join('\n'),
      }
    }
    case 'APPROVED':
      return { name: 'APPROVED', mark: 'contracted --confirmed', accepts: ['closed'], body: approvedBody(s, ctx) }
    case 'CONTRACTED': {
      const pics = (() => { try { return fs.readdirSync(path.join(ctx.root, designDir(ctx.stem), 'pictures')).length } catch { return 0 } })()
      return {
        name: 'CONTRACTED', accepts: ['closed'],
        body: render({
          outcome: `✅ contract written — ${contractPath(ctx.stem)}`,
          bullets: [`design/prototypes/${ctx.stem}/ committed on trunk.`,
            `Worktree and branch stay until the specs built from this contract are done; then: ${cmd('closed')}`,
            ...(pics ? [`${pics} picture(s) under design/prototypes/${ctx.stem}/pictures/`] : [])],
          warns: s.pictureWarns,
          queued: planItem(ctx.stem),
          next: planItem(ctx.stem),
        }),
      }
    }
    default: {
      const d = N.derive(ctx.root)
      const hasContract = fs.existsSync(path.join(ctx.root, contractPath(ctx.stem)))
      return {
        name: 'CLOSED',
        body: render({
          outcome: `✅ prototype closed — ${ctx.stem}`, bullets: s.removed ? 'worktree and branch removed' : [], warns: s.closeWarn,
          next: d.entries.length || !hasContract ? N.topLines(d).join('\n')
            : 'nothing needs you — the contract carries on',
        }),
      }
    }
  }
}

// ---- marks --------------------------------------------------------------------------------

const onTrunk = (ctx, then) => {
  const trunk = git.trunk(ctx.config)
  const on = git.raw(['symbolic-ref', '--short', 'HEAD'], ctx.root).stdout.trim()
  if (on !== trunk) refuse(`${ctx.root} is on ${on || 'a detached HEAD'}, not ${trunk} — check out ${trunk} there, then mark ${then}`)
}

// Commits the stem's dir on trunk; a rejection (a hook) unstages and returns git's message.
function commitDir(ctx, message) {
  const dir = designDir(ctx.stem)
  git.sh(['add', '--', dir], ctx.root)
  if (git.raw(['diff', '--cached', '--quiet', '--', dir], ctx.root).status === 0) return null
  try { git.sh(['commit', '-q', '-m', message, '--', dir], ctx.root) } catch (e) {
    git.raw(['reset', '-q', '--', dir], ctx.root)
    return e.message
  }
  return null
}

// One picture per distinct active-pin route; a failure is a warn naming the route, never a gate.
function takePictures(s, ctx, pins) {
  const cmd = ctx.config.prototype.picture
  if (!cmd) return []
  revive(s, ctx) // the pictures are of the running app
  if (s.appError) return [`no pictures — the app did not come up: ${s.appError.split('\n')[0]}`]
  const warns = []
  const wt = path.resolve(ctx.root, s.worktree)
  const dir = path.join(ctx.root, designDir(ctx.stem), 'pictures')
  fs.mkdirSync(dir, { recursive: true })
  for (const route of [...new Set(active(pins).map((p) => p.route))]) {
    const out = path.join(dir, picSlug(route) + '.png')
    fs.rmSync(out, { force: true })
    const r = host.run(cmd.replace(/\{url\}/g, s.url + route).replace(/\{out\}/g, out), { cwd: wt, timeoutMs: 120000 })
    if (r.status !== 0 || !fs.existsSync(out)) warns.push(`no picture for ${route} — prototype.picture ${r.status !== 0 ? `exited ${r.status}` : 'wrote no file'}: ${(r.tail.split('\n').pop() || '').slice(0, 160)}`.trim())
  }
  return warns
}

// A mark that claims work refuses while the worktree holds uncommitted changes.
function committed(s, ctx, mark) {
  const wt = path.resolve(ctx.root, s.worktree)
  if (!fs.existsSync(wt)) refuse(`no worktree at ${s.worktree} — mark closed --force, then open it again`)
  const dirty = (git.raw(['status', '--porcelain'], wt).stdout || '').trim()
  if (dirty) refuse(`uncommitted changes in ${s.worktree} — commit on ${s.branch}, then mark ${mark}`)
}

const steps = {
  opened(s) { s.marks.opened = now() },
  'round-done'(s, _f, ctx) {
    if (!active(pinsOf(ctx)).some((p) => p.round === s.rounds + 1)) {
      refuse('no pin this round — record each ruling with the pin line, or mark approved')
    }
    committed(s, ctx, 'round-done')
    s.rounds += 1
    s.handled = pinsOf(ctx).filter((p) => p.round <= s.rounds).map((p) => p.id)
    s.marks.lastRound = now()
  },
  // The approving round is a completed round too: "Round 2" then approve reads "after 2 round(s)".
  // Approval is claimed over a live app, with a ruling pinned and the work committed.
  approved(s, _f, ctx) {
    if (!app.up(ctx.config.runtime, s.app)) refuse('the app is down — re-run to restart it, then mark approved')
    if (!active(pinsOf(ctx)).length) refuse('nothing to approve — pin at least one ruling')
    committed(s, ctx, 'approved')
    s.rounds += 1
    s.marks.approved = now()
  },
  contracted(s, flags, ctx) {
    if (flags.confirmed !== true) refuse('the user confirms the sentences first — print them, get a yes, then mark contracted --confirmed')
    if (undeclared(ctx.config).some((k) => PAIR.includes(k))) {
      refuse('pin tests need prototype.e2eFile and prototype.e2eCommand — set them, then re-mark')
    }
    onTrunk(ctx, 'contracted')
    const pins = pinsOf(ctx)
    if (!active(pins).length) refuse('nothing to contract — drop was the last word')
    const rec = ({ id, kind, route, given, note, round, status, why }) => ({
      id, kind, route, ...(given ? { given } : {}), note, sentence: sentenceOf({ route, given, note }), round, status, ...(status === 'dropped' ? { why } : {}),
    })
    state.writeProto(ctx.root, ctx.stem, { contract: { stem: ctx.stem, rounds: s.rounds, pins: pins.map(rec) } })
    s.pictureWarns = takePictures(s, ctx, pins)
    const prev = copy(s)
    s.app = null // a pid is no record for trunk: the app runs on, its rec kept in the worktree's git dir (app.recOf)
    // The committed status.json already carries the contracted mark; a rejected commit puts the old one back.
    s.marks.contracted = now()
    save(s, ctx)
    const bad = commitDir(ctx, `chore(proto): contract ${ctx.stem}`)
    if (bad) {
      save(prev, ctx)
      refuse(`the contract commit was rejected — ${bad}\nfix it, then re-run --mark contracted --confirmed`)
    }
    Q.add(ctx.root, { payload: contractPath(ctx.stem), type: 'plan' })
  },
  closed(s, flags, ctx) {
    onTrunk(ctx, 'closed')
    for (const c of state.specsCiting(ctx.root, ctx.stem)) {
      if (state.liveRun(ctx.root, c.rel)) refuse(`${c.rel} is being run from this prototype's contract — let it finish, then mark closed`)
    }
    const contracted = !!s.marks.contracted
    // Never set up (OPEN's runtime question): no worktree, branch or app of its own — nothing to discard or remove.
    if (!s.ready) {
      fs.rmSync(path.join(ctx.root, designDir(ctx.stem)), { recursive: true, force: true })
      s.marks.closed = now()
      s.removed = false
      s.discarded = true
      return
    }
    if (!contracted && flags.force !== true) {
      const tip = git.raw(['rev-parse', '--short', s.branch], ctx.root)
      refuse(`unmerged prototype work on ${s.branch} (tip ${tip.status === 0 ? tip.stdout.trim() : 'none'}) — re-run with --force to discard it`)
    }
    const queued = Q.open(Q.read(ctx.root)).find((i) => i.type === 'plan' && i.payload === contractPath(ctx.stem))
    const warns = []
    if (queued) warns.push(`${Q.paste(ctx.root, queued)} is still pending in the queue (${queued.id}) — plan it, or drop it with /spec:queue done ${queued.id}`)
    const prev = copy(s)
    app.stop(app.recOf(ctx.root, s))
    s.app = null
    const rm = git.worktreeRemove(ctx.root, s.worktree, { deleteBranch: s.branch, force: true }) // a throwaway prototype
    if (!rm.removed) warns.push(`worktree kept at ${s.worktree}: ${rm.reason} — git worktree remove --force ${s.worktree}`)
    s.marks.closed = now()
    s.removed = rm.removed
    s.closeWarn = warns
    if (!contracted) {
      // Nothing of it was ever committed: the stem is free again.
      fs.rmSync(path.join(ctx.root, designDir(ctx.stem)), { recursive: true, force: true })
      s.discarded = true
      return
    }
    save(s, ctx)
    const bad = commitDir(ctx, `chore(proto): close ${ctx.stem}`)
    if (bad) {
      save(prev, ctx)
      refuse(`the close commit was rejected — ${bad}\nfix it, then re-run --mark closed`)
    }
  },
}

const driver = makeDriver({
  name: 'prototype', specArg: 'idea words | docs/roadmap/NN-*.md | stem', load, save, derive, steps,
  script: __filename,
})

// ---- pin and drop: the session writes down each ruling -----------------------------------------

function existing(a) {
  const stem = a.pos[0]
  if (!STEM_RE.test(stem)) refuse(`'${stem}' is not a usable stem`)
  const d = state.readProto(a.root, stem)
  if (!d.status) refuse(`no prototype '${stem}' here — open it first: prototype.js <idea words>`)
  return { stem, status: d.status, pins: d.pins || [], contract: d.contract, config: state.readConfig(a.root) }
}

function pinCmd(a) {
  const { stem, status, pins } = existing(a)
  const ph = phase(status)
  if (ph !== 'ROUND' && ph !== 'APPROVED') refuse(`pin is accepted at ROUND and APPROVED — ${stem} is at ${ph}`)
  const f = a.flags
  if (!KINDS.includes(f.kind)) refuse(`--kind must be ${KINDS.join(' or ')}`)
  if (typeof f.route !== 'string' || !f.route.startsWith('/')) refuse('--route must be a path starting with /')
  if (/[?&]proto[=]/.test(f.route)) refuse('--route must be a path, not a prototype switch — a pin is a sentence; put the state in --given')
  if (typeof f.note !== 'string' || !f.note.trim()) refuse('--note must not be empty')
  if (f.given !== undefined && (typeof f.given !== 'string' || !f.given.trim())) refuse('--given must not be empty — leave it out when there is no precondition')
  const n = pins.reduce((m, p) => Math.max(m, Number(String(p.id).slice(1)) || 0), 0)
  const rec = {
    id: 'p' + (n + 1), kind: f.kind, route: f.route, ...(f.given ? { given: f.given.trim() } : {}), note: f.note.trim(),
    round: ph === 'ROUND' ? status.rounds + 1 : status.rounds, status: 'active', at: now(),
  }
  state.writeProto(a.root, stem, { pins: [...pins, rec] })
  writeOut(1, `📌 ${rec.id} (${rec.kind}) ${sentenceOf(rec)}\n`)
}

function dropCmd(a) {
  const { stem, status, pins, contract, config } = existing(a)
  const ph = phase(status)
  if (!['ROUND', 'APPROVED', 'CONTRACTED'].includes(ph)) refuse(`drop is accepted at ROUND, APPROVED and CONTRACTED — ${stem} is at ${ph}`)
  const id = a.pos[2]
  const pin = pins.find((p) => p.id === id)
  if (!pin) refuse(`${stem} has no pin ${id} — known: ${pins.map((p) => p.id).join(', ') || 'none'}`)
  if (pin.status === 'dropped') refuse(`${id} is already dropped`)
  const why = a.flags.why
  if (typeof why !== 'string' || !why.trim()) refuse('drop needs --why "<reason>"')
  const dropped = { ...pin, status: 'dropped', why: why.trim(), droppedAt: now() }
  const nextPins = pins.map((p) => (p.id === id ? dropped : p))
  state.writeProto(a.root, stem, { pins: nextPins })
  if (ph === 'CONTRACTED' && contract) {
    const ctx = { root: a.root, stem, config }
    const trunk = git.trunk(config)
    const on = git.raw(['symbolic-ref', '--short', 'HEAD'], a.root).stdout.trim()
    const undo = () => state.writeProto(a.root, stem, { pins, contract })
    if (on !== trunk) { undo(); refuse(`${a.root} is on ${on || 'a detached HEAD'}, not ${trunk} — check out ${trunk} there, then drop ${id}`) }
    state.writeProto(a.root, stem, { contract: { ...contract, pins: contract.pins.map((p) => (p.id === id ? { ...p, status: 'dropped', why: why.trim() } : p)) } })
    const bad = commitDir(ctx, `chore(proto): drop ${id} — ${why.trim()}`)
    if (bad) { undo(); refuse(`the drop commit was rejected — ${bad}`) }
  }
  writeOut(1, `🗑️ ${id} dropped — ${why.trim()}\n`)
}

// ---- entry ---------------------------------------------------------------------------------

function main(argv) {
  try {
    const a = parseArgv(argv)
    // Closing never starts the app it is about to stop, nor does approving one: a dead app is the refusal.
    if (a.mark === 'closed' || a.mark === 'approved') revived = true
    const known = fs.existsSync(statusFile(a.root, a.pos[0] || ''))
    if (known && a.pos[1] === 'pin' && a.pos.length === 2) return void pinCmd(a)
    if (known && a.pos[1] === 'drop' && a.pos.length === 3 && /^p\d+$/.test(a.pos[2])) return void dropCmd(a)
    // `$ARGUMENTS` arrives unquoted: rejoin the idea words into the one argument the driver takes.
    const joined = a.pos.join(' ')
    const out = [joined, '--root', a.root].filter(Boolean)
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
