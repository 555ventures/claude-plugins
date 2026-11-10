'use strict'
// lib/driver.js — the step-machine frame every driver uses. No CLI of its own.
// makeDriver({name, specArg, load, save, derive, steps, script}) → main(argv) → exit code
//   load(ctx) → state (ctx = {root, arg, json, script}) · save(state, ctx)
//   derive(state, ctx) → step {name, body?, mark?, accepts?, auto?}: mark is the verb line the session replies with;
//     accepts extra verbs allowed here (default: mark's first word); auto (state, ctx) → state runs, saves, re-derives
//   steps[verb](state, flags, ctx) → state (or mutate in place)
//   after(verb, state, ctx) → line? printed under the checkpoint · markArgs(ctx) → words printed after the argument in
//   every mark line · applied(verb, state, flags, ctx) → true when a mark the settled step refuses has already taken
//   effect: a checkpoint says so, exit 0, no step runs
// Refusals: throw {exit: 2, message}. Exit 0 ok · 1 error · 2 refusal.

const fs = require('fs')
const path = require('path')
const plugin = require('./state')

const PLUGIN_ROOT = path.join(__dirname, '..', '..')

function writeOut(fd, text) {
  const buf = Buffer.from(text, 'utf8')
  let off = 0
  while (off < buf.length) {
    try { off += fs.writeSync(fd, buf, off, buf.length - off) } catch (e) {
      if (e.code === 'EAGAIN') continue
      if (e.code === 'EPIPE') return
      throw e
    }
  }
}

class Refusal extends Error {
  constructor(message, exit = 2) { super(message); this.exit = exit }
}

const refuse = (message, exit = 2) => { throw new Refusal(message, exit) }

// Shell-quotes a word for a printed command line; plain paths stay as they are.
const shq = (w) => (/^[\w@%+=:,./-]+$/.test(String(w)) ? String(w) : "'" + String(w).replace(/'/g, "'\\''") + "'")

// Positional args, --root, --state, --json, --mark <verb>, and every other --flag [value].
function parseArgv(argv) {
  const out = { pos: [], flags: {}, root: require('./git').repoRoot(process.cwd()), state: false, json: false, mark: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--state') out.state = true
    else if (a === '--json') out.json = true
    else if (a === '--root' || a === '--mark') {
      const v = argv[++i]
      if (v === undefined || v.startsWith('--')) refuse(`${a} needs a value`)
      if (a === '--root') out.root = path.resolve(v); else out.mark = v
    } else if (a.startsWith('--')) {
      const next = argv[i + 1]
      out.flags[a.slice(2)] = next === undefined || next.startsWith('--') ? true : argv[++i]
    } else out.pos.push(a)
  }
  return out
}

function makeDriver({ name, specArg = '', load, save, derive, steps = {}, script, after, applied, markArgs, words }) {
  const scriptPath = script || (require.main && require.main.filename) || name
  const MAX_AUTO = 50

  function markLine(ctx, mark) {
    const arg = (ctx.arg ? ' ' + shq(ctx.arg) : '') + (markArgs ? markArgs(ctx).map((w) => ' ' + shq(w)).join('') : '')
    return `node ${shq(scriptPath)}${arg} --root ${shq(ctx.root)} --mark ${mark}`
  }

  // Run auto steps until one needs the session (or the machine ends).
  function settle(state, ctx) {
    let step = derive(state, ctx)
    const from = step
    for (let n = 0; step.auto; n++) {
      if (n >= MAX_AUTO) refuse(`${name}: auto steps did not settle (stuck at ${step.name})`, 1)
      state = step.auto(state, ctx) || state
      save(state, ctx)
      step = derive(state, ctx)
    }
    return { state, step, from }
  }

  // Every step names the plugin version it runs; a newer installed one is said under it (restart, not /clear).
  function render(step, ctx, { warn = true } = {}) {
    const version = plugin.pluginVersion(PLUGIN_ROOT)
    if (ctx.json) {
      const mark = step.mark ? markLine(ctx, step.mark) : null
      return JSON.stringify({ step: step.name, version, body: step.body || '', mark }) + '\n'
    }
    const lines = [`▶ ${step.name}${version ? ' · spec ' + version : ''}`]
    if (step.body) lines.push('', step.body.trimEnd())
    if (step.mark) lines.push('', '▶ when done: ' + markLine(ctx, step.mark))
    const stale = warn && plugin.staleNote(PLUGIN_ROOT, ctx.root)
    if (stale) lines.push('', stale)
    return lines.join('\n') + '\n'
  }

  const checkpoint = (text, ctx) => {
    const stale = plugin.staleNote(PLUGIN_ROOT, ctx.root)
    writeOut(1, text + '\n' + (stale ? stale + '\n' : ''))
  }

  function run(argv) {
    const a = parseArgv(argv)
    const typed = (words ? a.pos.join(' ') : a.pos[0] || '').replace(/^@/, '')
    const ctx = { root: a.root, arg: typed, json: a.json, script: scriptPath, flags: a.flags }
    if (specArg && !ctx.arg && a.flags.fix === undefined) refuse(`usage: /spec:${name} <${specArg}> [--root <dir>] [--state] [--mark <verb>]`)
    let state = load(ctx)
    if (a.state) return writeOut(1, derive(state, ctx).name + '\n')
    if (!a.mark) {
      const { step } = settle(state, ctx)
      return writeOut(1, render(step, ctx))
    }
    const cur = settle(state, ctx)
    state = cur.state
    const verb = a.mark
    const allowed = [...(cur.step.accepts || []), ...(cur.step.mark ? [cur.step.mark.split(/\s+/)[0]] : [])]
    if (!steps[verb]) refuse(`unknown mark '${verb}' — known: ${Object.keys(steps).join(', ') || 'none'}`)
    const alreadyApplied = () => {
      const rerun = `/spec:${name}${ctx.arg ? ' ' + ctx.arg : ''}`
      const move = `${cur.from.name} → ${cur.step.name}`
      checkpoint(`✅ checkpoint — ${move}; mark ${verb} was already applied; safe to /clear and re-run ${rerun}`, ctx)
    }
    if (!allowed.includes(verb)) {
      if (applied && applied(verb, state, a.flags, ctx)) return alreadyApplied()
      refuse(`mark '${verb}' is not accepted at ${cur.step.name} — expected ${allowed.join(' | ') || 'no mark'}; re-run without --mark to see the step`)
    }
    try {
      state = steps[verb](state, a.flags, ctx) || state
    } catch (e) {
      // The step's own refusal of a mark whose effect is already in the state is not an error either.
      if (e instanceof Refusal && applied && applied(verb, state, a.flags, ctx)) return alreadyApplied()
      throw e
    }
    save(state, ctx)
    const settled = settle(state, ctx)
    const next = settled.step
    const arg = ctx.arg ? ' ' + ctx.arg : ''
    checkpoint(`✅ checkpoint — ${cur.step.name} → ${next.name}; safe to /clear and re-run /spec:${name}${arg}`, ctx)
    const extra = after && !ctx.json && after(verb, settled.state, ctx)
    if (extra) writeOut(1, extra + '\n')
    // A terminal step (no mark) is shown now: its state may already be cleared, so a re-run cannot.
    if (!next.mark && next.body && !ctx.json) writeOut(1, '\n' + render(next, ctx, { warn: false }))
  }

  return function main(argv = process.argv.slice(2)) {
    try {
      run(argv)
      return 0
    } catch (e) {
      const code = typeof e.exit === 'number' ? e.exit : 1
      writeOut(2, `${name}: ${e.message || e}\n`)
      return code
    }
  }
}

module.exports = { makeDriver, parseArgv, refuse, Refusal, writeOut, shq }
