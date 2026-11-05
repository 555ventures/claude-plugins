'use strict'
// lib/driver.js — the step-machine frame every driver uses. No CLI of its own.
//
// makeDriver({name, specArg, load, save, derive, steps, script}) → main(argv) → exit code
//   load(ctx) → state                 ctx = {root, arg, json, script}
//   derive(state, ctx) → step         step = {name, body?, mark?, accepts?, auto?}
//     mark     the verb line the session replies with, e.g. 'reviewed --file <json>'
//     accepts  extra verbs allowed at this step (default: the first word of mark)
//     auto     (state, ctx) → state; the driver runs it, saves, and re-derives (no session work)
//   steps[verb](state, flags, ctx) → state (or mutate in place and return nothing)
//   save(state, ctx)
//   after(verb, state, ctx) → line?   optional; printed under the checkpoint (e.g. the gate result)
//   markArgs(ctx) → words   optional; extra argv printed after the argument in every mark line (a spec-less fix's --fix)
//   applied(verb, state, flags, ctx) → boolean   optional; true when a mark the settled step refuses
//     has already taken effect: the frame prints a checkpoint saying so and exits 0, running no step
// Refusals: throw {exit: 2, message} (or call die). Exit 0 ok · 1 error · 2 refusal.

const fs = require('fs')
const path = require('path')

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

function die(msg, code = 1) {
  writeOut(2, msg.endsWith('\n') ? msg : msg + '\n')
  process.exit(code)
}

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

function makeDriver({ name, specArg = '', load, save, derive, steps = {}, script, after, applied, markArgs }) {
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

  function render(step, ctx) {
    if (ctx.json) return JSON.stringify({ step: step.name, body: step.body || '', mark: step.mark ? markLine(ctx, step.mark) : null }) + '\n'
    const lines = [`▶ ${step.name}`]
    if (step.body) lines.push('', step.body.trimEnd())
    if (step.mark) lines.push('', '▶ when done: ' + markLine(ctx, step.mark))
    return lines.join('\n') + '\n'
  }

  function run(argv) {
    const a = parseArgv(argv)
    const ctx = { root: a.root, arg: (a.pos[0] || '').replace(/^@/, ''), json: a.json, script: scriptPath, flags: a.flags }
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
      writeOut(1, `✅ checkpoint — ${cur.from.name} → ${cur.step.name}; mark ${verb} was already applied; safe to /clear and re-run /spec:${name}${ctx.arg ? ' ' + ctx.arg : ''}\n`)
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
    writeOut(1, `✅ checkpoint — ${cur.step.name} → ${next.name}; safe to /clear and re-run /spec:${name}${arg}\n`)
    const extra = after && !ctx.json && after(verb, settled.state, ctx)
    if (extra) writeOut(1, extra + '\n')
    // A terminal step (no mark) is shown now: its state may already be cleared, so a re-run cannot.
    if (!next.mark && next.body && !ctx.json) writeOut(1, '\n' + render(next, ctx))
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

module.exports = { makeDriver, parseArgv, refuse, Refusal, die, writeOut, shq }
