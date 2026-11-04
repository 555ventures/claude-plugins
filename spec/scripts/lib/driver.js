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

function die(msg, code = 1) {
  writeOut(2, msg.endsWith('\n') ? msg : msg + '\n')
  process.exit(code)
}

// Positional args, --root, --state, --json, --mark <verb>, and every other --flag [value].
function parseArgv(argv) {
  const out = { pos: [], flags: {}, root: process.cwd(), state: false, json: false, mark: null }
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

function makeDriver({ name, specArg = '', load, save, derive, steps = {}, script }) {
  const scriptPath = script || (require.main && require.main.filename) || name
  const MAX_AUTO = 50

  function markLine(ctx, mark) {
    const arg = ctx.arg ? ' ' + ctx.arg : ''
    return `node ${scriptPath}${arg} --root ${ctx.root} --mark ${mark}`
  }

  // Run auto steps until one needs the session (or the machine ends).
  function settle(state, ctx) {
    let step = derive(state, ctx)
    for (let n = 0; step.auto; n++) {
      if (n >= MAX_AUTO) refuse(`${name}: auto steps did not settle (stuck at ${step.name})`, 1)
      state = step.auto(state, ctx) || state
      save(state, ctx)
      step = derive(state, ctx)
    }
    return { state, step }
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
    const ctx = { root: a.root, arg: a.pos[0] || '', json: a.json, script: scriptPath, flags: a.flags }
    if (specArg && !ctx.arg) refuse(`usage: /spec:${name} <${specArg}> [--root <dir>] [--state] [--mark <verb>]`)
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
    if (!allowed.includes(verb)) refuse(`mark '${verb}' is not accepted at ${cur.step.name} — expected ${allowed.join(' | ') || 'no mark'}; re-run without --mark to see the step`)
    state = steps[verb](state, a.flags, ctx) || state
    save(state, ctx)
    const next = settle(state, ctx).step
    const arg = ctx.arg ? ' ' + ctx.arg : ''
    writeOut(1, `✅ checkpoint — ${cur.step.name} → ${next.name}; safe to /clear and re-run /spec:${name}${arg}\n`)
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

module.exports = { makeDriver, parseArgv, refuse, Refusal, die, writeOut }
