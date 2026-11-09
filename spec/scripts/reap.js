#!/usr/bin/env node
'use strict'
// reap.js — the SessionStart and SessionEnd hooks over lib/reap.js (ADR-0049): the Claude session's life bounds
// every process it started. A hook never blocks a session: every path exits 0 and any error is swallowed.
//   session-start   stdin {cwd}: sweeps the repo cwd belongs to (what a session that died without SessionEnd left);
//                   prints one line only when it stopped something; TERM, then KILL after 1 s
//   session-end     stdin {reason}: stops every process carrying this session's CLAUDE_PID (else the nearest ancestor
//                   named claude), TERM then KILL after 1 s; `clear` and `resume` keep the process, so nothing stops

const fs = require('fs')
const path = require('path')
const host = require('./lib/host')
const reap = require('./lib/reap')

// Both arms run under hooks.json's 5 s timeout: a process slow on SIGTERM must still get its SIGKILL before then.
const GRACE_MS = 1000

const readInput = () => {
  try {
    const j = JSON.parse(fs.readFileSync(0, 'utf8'))
    return j && typeof j === 'object' ? j : {}
  } catch { return {} }
}

function sessionStart(input) {
  if (typeof input.cwd !== 'string' || !input.cwd) return
  const n = reap.sweep(path.resolve(host.commonDir(input.cwd), '..'), GRACE_MS)
  if (n > 0) process.stdout.write(`🧹 stopped ${n} process(es) a closed session left in this repo\n`)
}

function sessionEnd(input) {
  if (input.reason === 'clear' || input.reason === 'resume') return
  const self = reap.lineage()
  const owner = Number(process.env.CLAUDE_PID) || [...self].find(reap.ownerAlive)
  if (!owner) return
  reap.kill(reap.procs().filter((p) => p.CLAUDE_PID === owner && !self.has(p.pid)).map((p) => p.pid), GRACE_MS)
}

function main(argv) {
  try {
    const input = readInput()
    if (argv[0] === 'session-start') sessionStart(input)
    else if (argv[0] === 'session-end') sessionEnd(input)
  } catch { /* a hook never blocks a session */ }
  return 0
}

if (require.main === module) process.exitCode = main(process.argv.slice(2))
