#!/usr/bin/env node
'use strict'
// mocks.js — /spec:mocks driver: SEED → SCREENS → APPROVED. The wireframe settles structure (screens,
// navigation, content order), not look. `approved` commits design/mocks/ on the root's branch.
//
//   node mocks.js [--mark seed-done | journey-drawn --journey <j> | approved]
//   node mocks.js push | pull     review-service helpers (service mode)
//
// State: design/mocks/status.json {marks:{seedDone, approved}, drawn:{journey: beats-hash}, pushed?}.
// A journey whose beats change after it was drawn is pending again. Service mode when
// config.walkthrough.baseUrl is set (push, then the client confirms each journey; `approved` needs
// every journey confirmed on its current beats); terminal mode otherwise. Exit: 0 · 1 · 2 refusal.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { makeDriver, parseArgv, refuse, writeOut } = require('./lib/driver')
const state = require('./lib/state')
const wt = require('./lib/walkthrough')
const { render } = require('./lib/report')
const git = require('./lib/git')

const BEAT = /^(\d+)\.\s+"(.+)"\s*->\s*([\w][\w-]*)(?:@([\w][\w-]*))?\s*$/
const ID = /^[\w][\w-]*$/
const now = () => new Date().toISOString()
const screensDir = (root) => path.join(root, 'design', 'mocks', 'screens')
const target = (b) => b.screen + (b.state ? '@' + b.state : '')
const screenFile = (root, b) => path.join(screensDir(root), target(b) + '.json')
// The json-render shape, printed at the draw step (the seed's comment is overwritten by then).
const SHAPE = `{ "root": "page", "elements": {
    "page":  { "type": "Stack", "props": { "gap": 16 }, "children": ["title", "go"] },
    "title": { "type": "Heading", "props": { "text": "Invite your team", "level": 1 }, "children": [] },
    "go":    { "type": "Button", "props": { "label": "Send invite" }, "children": [],
               "on": { "press": { "action": "navigate", "params": { "to": "invite-sent" } } } } } }
Components: Stack Row Grid Card Divider Heading Text Badge Alert Button Field Select Checkbox Tabs Nav List Table Image Avatar.`
const beatHash = (beats) => crypto.createHash('sha256').update(beats.map((b) => `${b.beat} -> ${target(b)}`).join('\n')).digest('hex').slice(0, 12)

// seed.md → {journeys: [{id, story, beats: [{beat, screen, state}]}], errors: [string]}
function parseSeed(text) {
  const journeys = []
  const errors = []
  let cur = null
  for (const raw of String(text || '').replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
    const line = raw.trim()
    const h = /^###\s+(.*)$/.exec(line)
    if (h) {
      cur = { id: h[1].trim(), story: null, beats: [] }
      if (!ID.test(cur.id)) errors.push(`journey id '${cur.id}' must match ${ID}`)
      if (journeys.some((j) => j.id === cur.id)) errors.push(`journey '${cur.id}' appears twice`)
      journeys.push(cur)
    } else if (cur && line && !line.startsWith('#')) {
      const m = BEAT.exec(line)
      if (!cur.story && !m) { if (/^When .+/.test(line)) cur.story = line; else errors.push(`${cur.id}: the first line must be the job story ('When …, I want …, so I can …')`) }
      else if (!m) errors.push(`${cur.id}: malformed beat: ${line}`)
      else if (Number(m[1]) !== cur.beats.length + 1) errors.push(`${cur.id}: numbering: expected ${cur.beats.length + 1}, got ${m[1]}`)
      else cur.beats.push({ beat: m[2], screen: m[3], state: m[4] || null })
    }
  }
  for (const j of journeys) { if (!j.story) errors.push(`${j.id}: no job story`); if (!j.beats.length) errors.push(`${j.id}: no beats`) }
  if (!journeys.length) errors.push('no journeys: add one "### <journey>" block')
  return { journeys, errors }
}

const load = (ctx) => {
  ctx.config = state.readConfig(ctx.root)
  return state.readMocks(ctx.root).status || { marks: {}, drawn: {} }
}
const save = (s, ctx) => state.writeMocks(ctx.root, { status: s })
const seedOf = (ctx) => parseSeed(state.readMocks(ctx.root).seed)
const pendingOf = (s, journeys) => journeys.filter((j) => s.drawn[j.id] !== beatHash(j.beats))
const serviceMode = (ctx) => Boolean(ctx.config.walkthrough && ctx.config.walkthrough.baseUrl)

function readScreen(root, b) {
  let doc
  try { doc = JSON.parse(fs.readFileSync(screenFile(root, b), 'utf8')) } catch { return null }
  return doc && typeof doc.root === 'string' && doc.elements && doc.elements[doc.root] ? doc : null
}

const navTargets = (doc) => Object.values(doc.elements).map((e) => e && e.on && e.on.press && e.on.press.action === 'navigate' && e.on.press.params && e.on.press.params.to)

// Problems with a journey's drawn screens: missing/invalid files, a hop with no navigating control.
function drawnProblems(root, j) {
  const out = []
  j.beats.forEach((b, i) => {
    const doc = readScreen(root, b)
    if (!doc) return out.push(`${path.relative(root, screenFile(root, b))} is missing or is not a json-render file (needs "root" and "elements")`)
    const next = j.beats[i + 1]
    if (next && target(next) !== target(b) && !navTargets(doc).some((to) => to === next.screen || to === target(next))) {
      out.push(`${target(b)} has no control whose press navigates to ${target(next)}`)
    }
  })
  return out
}

function derive(s, ctx) {
  const mocks = state.readMocks(ctx.root)
  if (mocks.seed === null) return { name: 'SEED', auto: (st, c) => { state.writeMocks(c.root, { seed: fs.readFileSync(path.join(__dirname, '..', 'templates', 'mocks-seed.md'), 'utf8') }) } }
  if (!s.marks.seedDone) {
    return {
      name: 'SEED', mark: 'seed-done',
      body: 'Fill in design/mocks/seed.md from .claude/genesis/brief.md (ask the user for the product idea only if that file is missing). One journey per job story, numbered beats, one of them an empty or first-run state. Invent sample data; never ask for it. Replace every { placeholder }.',
    }
  }
  const { journeys } = parseSeed(mocks.seed)
  if (s.marks.approved) {
    const counts = journeys.map((j) => `${j.id}: ${new Set(j.beats.map(target)).size} screen(s)`)
    // Genesis is greenfield only: a repo that already has specs/ goes straight to planning.
    const next = fs.existsSync(path.join(ctx.root, 'specs')) ? '/spec:plan' : '/spec:genesis'
    return { name: 'APPROVED', body: render({ outcome: `✅ wireframe approved — ${journeys.length} journeys`, bullets: [...counts, 'design/mocks/ committed'], next }) }
  }
  const pending = pendingOf(s, journeys)
  if (pending.length) {
    const j = pending[0]
    const files = [...new Set(j.beats.map(target))].map((t) => `  design/mocks/screens/${t}.json`)
    return {
      name: 'SCREENS', mark: 'journey-drawn --journey ' + j.id, accepts: ['journey-drawn'],
      body: [
        `Draw journey '${j.id}' (${pending.length} journey(s) still to draw).`, j.story, ...j.beats.map((b, i) => `${i + 1}. "${b.beat}" -> ${target(b)}`),
        'One gray json-render file per screen:', ...files, 'Shape:', SHAPE,
        'Each move between two screens is a control whose on.press navigates there. Copy the beat sentences into the screens as content. Then mark journey-drawn.',
      ].join('\n'),
    }
  }
  if (serviceMode(ctx)) {
    return {
      name: 'SCREENS', mark: 'approved', accepts: ['journey-drawn'],
      body: s.pushed
        ? `Run \`node ${ctx.script} pull --root ${ctx.root}\` for notes and confirmations. Fix each waiting note in the screen files or seed beats (re-mark journey-drawn --journey <j>), then \`node ${ctx.script} push --root ${ctx.root}\` again and end the turn on its link. When every journey is confirmed, mark approved.`
        : `Run \`node ${ctx.script} push --root ${ctx.root}\`. Print \`🎨 ready for review — <link>\` from its output and END THE TURN.`,
    }
  }
  return {
    name: 'SCREENS', mark: 'approved', accepts: ['journey-drawn'],
    body: [...journeys.flatMap((j) => [`### ${j.id}`, j.story, ...j.beats.map((b, i) => `${i + 1}. "${b.beat}" -> ${target(b)}`)]),
      '', 'Print the journeys above, then END THE TURN on: approve all, or name the ones to change',
      'A literal `approve` → mark approved. A named change: edit the seed beats and screens, re-mark journey-drawn --journey <j>, ask again.'].join('\n'),
  }
}

const steps = {
  'seed-done'(s, _f, ctx) {
    const { errors } = seedOf(ctx)
    if (errors.length) refuse('seed.md is not ready:\n- ' + errors.join('\n- '))
    s.marks.seedDone = now()
  },
  'journey-drawn'(s, f, ctx) {
    const j = seedOf(ctx).journeys.find((x) => x.id === f.journey)
    if (!j) refuse(`no journey '${f.journey}' in design/mocks/seed.md`)
    const bad = drawnProblems(ctx.root, j)
    if (bad.length) refuse(`journey '${j.id}' is not drawn properly:\n- ` + bad.join('\n- '))
    s.drawn[j.id] = beatHash(j.beats)
  },
  approved(s, _f, ctx) {
    const { journeys } = seedOf(ctx)
    const pending = pendingOf(s, journeys)
    if (pending.length) refuse(`not drawn yet: ${pending.map((j) => j.id).join(', ')}`)
    if (serviceMode(ctx)) {
      const n = wt.highestRound(ctx.root)
      const ok = (state.readJson(path.join(wt.roundsDir(ctx.root), String(n), 'approvals.json'), {}).approvals || [])
      const open = journeys.filter((j) => !ok.some((a) => a.journey === j.id && a.beats === beatHash(j.beats)))
      if (open.length) refuse(`not confirmed on their current beats: ${open.map((j) => j.id).join(', ')} — run pull, then fix or wait for the client`)
    }
    s.marks.approved = now()
    save(s, ctx) // the committed status.json already carries the approved mark
    const dirs = ['design/mocks', ...(fs.existsSync(wt.roundsDir(ctx.root)) ? ['design/rounds'] : [])]
    git.sh(['add', '--', ...dirs], ctx.root)
    if (git.raw(['diff', '--cached', '--quiet', '--', ...dirs], ctx.root).status !== 0) git.sh(['commit', '-q', '-m', 'chore(mocks): approved', '--', ...dirs], ctx.root)
  },
}

const driver = makeDriver({ name: 'mocks', load, save, derive, steps, script: __filename })

// ---- service helpers -----------------------------------------------------------------------

async function service(sub, a) {
  const c = wt.openContext(a.root, process.env)
  if (!c) refuse('no review service configured — run /spec:connect, or stay in terminal mode')
  const { journeys } = seedOf({ root: a.root })
  if (sub === 'push') {
    const screens = new Map()
    for (const j of journeys) for (const b of j.beats) {
      const doc = readScreen(a.root, b)
      if (!doc) refuse(`${path.relative(a.root, screenFile(a.root, b))} is missing or invalid — draw every journey first`)
      screens.set(target(b), { name: b.screen, ...(b.state ? { state: b.state } : {}), spec: doc })
    }
    const wire = journeys.map((j) => ({ id: j.id, title: j.id, persona: j.story, beats: beatHash(j.beats), steps: j.beats.map((b) => ({ beat: b.beat, screen: b.screen, ...(b.state ? { state: b.state } : {}) })) }))
    const r = await wt.push(c, { journeys: wire, screens: [...screens.values()] })
    const s = state.readMocks(a.root).status || { marks: {}, drawn: {} }
    state.writeMocks(a.root, { status: { ...s, pushed: { round: r.round, at: now() } } })
    return `round ${r.round} ${r.already ? 'already on the service' : 'pushed'}\n🎨 ready for review — ${c.baseUrl}/p/${c.project}\n`
  }
  await wt.pullNotes(c)
  const { approvals } = await wt.pullApprovals(c)
  const notes = (state.readJson(path.join(wt.roundsDir(a.root), String(wt.highestRound(a.root)), 'notes.json'), {}).notes) || []
  return [
    ...notes.filter((n) => n.status === 'open').map((n) => `waiting ${n.id} (${n.screen || 'journey'}): ${n.text}`),
    ...journeys.map((j) => `${j.id}: ` + (approvals.some((x) => x.journey === j.id && x.beats === beatHash(j.beats)) ? 'confirmed' : approvals.some((x) => x.journey === j.id) ? 'confirmed on an older story' : 'not confirmed')),
  ].join('\n') + '\n'
}

function main(argv) {
  if (['push', 'pull'].includes(argv[0])) {
    const a = parseArgv(argv.slice(1))
    service(argv[0], a).then((out) => writeOut(1, out), (e) => {
      writeOut(2, e instanceof wt.Refusal ? e.line() + '\n' : `mocks: ${e.message}\n`)
      process.exitCode = typeof e.exit === 'number' ? e.exit : 1
    })
    return undefined
  }
  return driver(argv)
}

if (require.main === module) {
  const code = main(process.argv.slice(2))
  if (code !== undefined) process.exitCode = code
}
module.exports = { main, parseSeed }
