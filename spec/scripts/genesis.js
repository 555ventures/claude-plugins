'use strict'
// genesis.js — greenfield driver: idea → stack → scaffold → roadmap → grounded config.
// DISCOVERY → MENUS → DECIDE → SCAFFOLD (gate on skeleton-landed) → ROADMAP → HANDOFF → GROUNDED.
// State: .claude/genesis/status.json. Usage: node genesis.js "<idea>" [--root d] [--mark verb ...]

const fs = require('fs')
const path = require('path')
const { makeDriver, parseArgv, refuse, writeOut } = require('./lib/driver')
const git = require('./lib/git')
const S = require('./lib/state')
const host = require('./lib/host')
const report = require('./lib/report')

const TPL = path.join(__dirname, '..', 'templates')

const gdir = (root) => path.join(root, '.claude', 'genesis')
const briefPath = (root) => path.join(gdir(root), 'brief.md')
const descPath = (root) => path.join(gdir(root), 'stack-descriptor.json')
const menuPath = (root, d) => path.join(gdir(root), 'menus', d + '.md')
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const ls = (dir, re) => { try { return fs.readdirSync(dir).filter((f) => re.test(f)).sort() } catch { return [] } }
const adrs = (root) => ls(path.join(root, 'docs', 'adr'), /^\d{4}-.*\.md$/)
const briefs = (root) => ls(path.join(root, 'docs', 'roadmap'), /^(?!00-)\d{2}-.*\.md$/)

// Dimensions listed under "## Open dimensions" in brief.md, one `- name` per line.
function openDimensions(root) {
  const m = (S.readText(briefPath(root), '') || '').match(/^##\s+Open dimensions\s*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/im)
  if (!m) return null
  return [...m[1].matchAll(/^\s*[-*]\s+([^:\n(]+)/gm)].map((x) => slug(x[1])).filter(Boolean)
}

const DISCOVERY = (s) => `Idea: ${s.idea}

Interview the user in at most 3 AskUserQuestion rounds (2-4 questions each, recommended option first, free text allowed). Cover:
users · core jobs · platform (web/mobile/both) · data sensitivity · auth · payments · hosting preference · must-use tech.
Guess from the idea first; ask only what the idea leaves open. Never ask about team or ops staffing.
Write .claude/genesis/brief.md (already seeded from the template): Idea, Users, Jobs, Constraints, and under
"Open dimensions" one \`- <dimension>\` per line for every stack choice the user has not fixed (language-runtime,
framework, persistence, auth, hosting, ...).`

const MENUS = (s, ctx) => {
  const dims = openDimensions(ctx.root) || []
  const todo = dims.filter((d) => !s.menus.includes(d))
  return `Open dimensions: ${dims.join(', ') || '(none)'}
Still without a menu: ${todo.join(', ') || '(none)'}

Dispatch ONE Sonnet web-research subagent per dimension without a menu, all in a single parallel message. Each one
web-searches current options (today's date matters) and writes .claude/genesis/menus/<dimension>.md: 3-5 options,
each "- **Name** — one-line why · package names (registry) · as of YYYY-MM-DD", the recommended one first, given
the brief at .claude/genesis/brief.md. After each file lands run --mark menu-written --file <that file> (repeat per menu).
When every dimension has a menu: auto-pick the obvious ones (print "📌 Auto-picked <dim>: <choice> — <why> (veto anytime)")
and ask the user only the real forks, in ONE AskUserQuestion. Then --mark menus-done.`
}

const DECIDE = (s, ctx) => `Write .claude/genesis/stack-descriptor.json:
{"name","language","framework","db","auth","hosting","testCommand","setupCommand","decided":[{"dimension","choice","why"}]}
from the menus and the user's picks. For every non-obvious choice write an ADR from ${path.join(TPL, 'adr.md')} to
docs/adr/NNNN-<slug>.md (next number: ${String(adrs(ctx.root).length + 1).padStart(4, '0')}), status accepted, dated ${new Date().toISOString().slice(0, 10)}.`

const SCAFFOLD = (s, ctx) => `${s.tail ? `The scaffold gate is RED — fix it, then re-mark. Tail:\n${s.tail}\n\n` : ''}Create the app per ${path.relative(ctx.root, descPath(ctx.root))}: project files, dependencies installed (setupCommand),
a test runner wired to testCommand, and ONE passing test. Nothing beyond the thinnest runnable skeleton.
The driver then runs testCommand as the gate; green moves on to ROADMAP.`

const ROADMAP = `Write docs/roadmap/00-overview.md (${path.join(TPL, 'roadmap-overview.md')}) and 3-8 briefs docs/roadmap/NN-<slug>.md
(${path.join(TPL, 'roadmap-brief.md')}: header "Phase: <P> · Depends on: <NN|—> · Primary workspaces: <areas>", then ## Result,
## Scope, ## Out of scope), numbered from 01. Brief 01 is the "first light": the thinnest end-to-end slice through the
whole stack. Honour the ADRs. The driver queues every brief on --mark roadmap-written.`

const HANDOFF = `The driver writes .claude/spec.config.json (testCommand, setupCommand, trunk) from the descriptor, merged over any
existing config. Nothing for you to write.`

function derive(s) {
  switch (s.phase) {
    case 'DISCOVERY': return { name: 'DISCOVERY', body: DISCOVERY(s), mark: 'discovery-done' }
    case 'MENUS': return { name: 'MENUS', body: MENUS, mark: 'menus-done', accepts: ['menu-written'] }
    case 'DECIDE': return { name: 'DECIDE', body: DECIDE, mark: 'decided' }
    case 'SCAFFOLD': return { name: 'SCAFFOLD', body: SCAFFOLD, mark: 'skeleton-landed' }
    case 'ROADMAP': return { name: 'ROADMAP', body: ROADMAP, mark: 'roadmap-written' }
    case 'HANDOFF': return { name: 'HANDOFF', body: HANDOFF, mark: 'profile-written' }
    default: return { name: 'GROUNDED', body: s.report || '' }
  }
}

// derive bodies may be functions of (state, ctx); wrap so the frame sees strings.
const bind = (fn) => (s, ctx) => {
  const st = fn(s, ctx)
  return typeof st.body === 'function' ? { ...st, body: st.body(s, ctx) } : st
}

const steps = {
  'discovery-done': (s, f, ctx) => {
    const dims = openDimensions(ctx.root)
    if (!fs.existsSync(briefPath(ctx.root))) refuse('no .claude/genesis/brief.md — write the brief first')
    if (!dims) refuse('brief.md has no "## Open dimensions" section — add it (one `- <dimension>` per line)')
    s.phase = dims.length ? 'MENUS' : 'DECIDE'
  },
  'menu-written': (s, f, ctx) => {
    if (typeof f.file !== 'string') refuse('menu-written needs --file <.claude/genesis/menus/<dimension>.md>')
    const file = path.resolve(ctx.root, f.file)
    const dim = path.basename(file, '.md')
    if (!fs.existsSync(file) || path.dirname(file) !== path.dirname(menuPath(ctx.root, dim))) refuse(`${f.file} is not a written menu under .claude/genesis/menus/`)
    if (!(openDimensions(ctx.root) || []).includes(dim)) refuse(`'${dim}' is not an open dimension in brief.md`)
    if (!s.menus.includes(dim)) s.menus.push(dim)
  },
  'menus-done': (s, f, ctx) => {
    const missing = (openDimensions(ctx.root) || []).filter((d) => !fs.existsSync(menuPath(ctx.root, d)))
    if (missing.length) refuse(`menus missing for: ${missing.join(', ')} — dispatch them and mark menu-written --file <f>`)
    s.phase = 'DECIDE'
  },
  decided: (s, f, ctx) => {
    const d = S.readJson(descPath(ctx.root))
    if (!d) refuse('no valid .claude/genesis/stack-descriptor.json')
    const miss = ['name', 'language', 'framework', 'testCommand', 'setupCommand'].filter((k) => !d[k])
    if (miss.length) refuse(`stack-descriptor.json lacks: ${miss.join(', ')}`)
    if (!Array.isArray(d.decided) || !d.decided.length) refuse('stack-descriptor.json needs decided: [{dimension, choice, why}]')
    s.phase = 'SCAFFOLD'
  },
  'skeleton-landed': (s, f, ctx) => {
    const d = S.readJson(descPath(ctx.root))
    const g = host.gate(ctx.root, { testCommand: d.testCommand })
    s.tail = g.status === 0 ? '' : g.tail || `testCommand exited ${g.status}`
    if (g.status === 0) s.phase = 'ROADMAP'
  },
  'roadmap-written': (s, f, ctx) => {
    const bs = briefs(ctx.root)
    if (!fs.existsSync(path.join(ctx.root, 'docs/roadmap/00-overview.md'))) refuse('docs/roadmap/00-overview.md is missing')
    if (bs.length < 3 || bs.length > 8) refuse(`the roadmap needs 3-8 briefs, found ${bs.length} in docs/roadmap/`)
    for (const b of bs) {
      const t = S.readText(path.join(ctx.root, 'docs/roadmap', b))
      const bad = !/^Phase:.*Depends on:.*Primary workspaces:/m.test(t) ? 'the Phase · Depends on · Primary workspaces header'
        : ['Result', 'Scope', 'Out of scope'].find((h) => !new RegExp('^##\\s+' + h + '\\s*$', 'm').test(t))
      if (bad) refuse(`docs/roadmap/${b} lacks ${bad}`)
    }
    if (!bs[0].startsWith('01-')) refuse('briefs must be numbered from 01 (01 = first light)')
    const q = S.readQueue(ctx.root)
    for (const b of bs) {
      const payload = 'docs/roadmap/' + b
      if (q.items.some((i) => i.payload === payload)) continue
      q.items.push({ id: 'q' + ++q.seq, kind: 'brief', payload, added: new Date().toISOString() })
    }
    S.writeQueue(ctx.root, q)
    s.phase = 'HANDOFF'
  },
  'profile-written': (s, f, ctx) => {
    const d = S.readJson(descPath(ctx.root))
    const cur = S.readJson(S.configPath(ctx.root), {})
    // A fresh repo's trunk is whatever branch it was born on (git's default may be master).
    const born = git.raw(['rev-parse', '--abbrev-ref', 'HEAD'], ctx.root)
    const trunk = cur.trunk || (born.status === 0 && born.stdout.trim() !== 'HEAD' ? born.stdout.trim() : S.readConfig(ctx.root).trunk)
    S.writeConfig(ctx.root, { ...cur, testCommand: d.testCommand, setupCommand: d.setupCommand, trunk })
    const bs = briefs(ctx.root)
    s.phase = 'GROUNDED'
    s.report = report.render({
      outcome: `✅ architected + grounded — scaffold green, ${adrs(ctx.root).length} ADRs, roadmap of ${bs.length} briefs`,
      artifacts: ['.claude/genesis/stack-descriptor.json', '.claude/spec.config.json', 'docs/roadmap/'],
      queued: bs.map((b) => 'docs/roadmap/' + b),
      next: `/spec:plan docs/roadmap/${bs[0]}`,
    })
  },
}

function load(ctx) {
  const cur = S.readGenesis(ctx.root)
  if (cur) { ctx.arg = ''; return cur }
  if (!ctx.arg) refuse('usage: /spec:genesis "<project idea — what, for whom>" [--root <dir>]')
  const s = { idea: ctx.arg, phase: 'DISCOVERY', menus: [], tail: '' }
  if (!fs.existsSync(briefPath(ctx.root))) {
    const tpl = S.readText(path.join(TPL, 'genesis-brief.md'))
    S.writeText(briefPath(ctx.root), tpl.replace('<idea>', s.idea))
  }
  S.writeGenesis(ctx.root, s)
  ctx.arg = '' // later runs read the idea from status; keep the mark line free of it
  return s
}

const driver = makeDriver({
  name: 'genesis', load, derive: bind(derive), steps,
  save: (s, ctx) => S.writeGenesis(ctx.root, s),
})

// `$ARGUMENTS` arrives unquoted: rejoin the idea words into the one argument the driver takes.
function main(argv = process.argv.slice(2)) {
  try {
    const a = parseArgv(argv)
    const out = [a.pos.join(' '), '--root', a.root].filter(Boolean)
    if (a.mark) out.push('--mark', a.mark)
    if (a.state) out.push('--state')
    if (a.json) out.push('--json')
    for (const [k, v] of Object.entries(a.flags)) out.push('--' + k, ...(v === true ? [] : [v]))
    return driver(out)
  } catch (e) {
    writeOut(2, `genesis: ${e.message}\n`)
    return typeof e.exit === 'number' ? e.exit : 1
  }
}
if (require.main === module) process.exitCode = main()
module.exports = { main }
