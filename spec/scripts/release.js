#!/usr/bin/env node
'use strict'
// release.js — linear release gate. node release.js [note] [--promote] [--root <dir>] [--json]
// Without --promote: deployCommand, then e2eCommand against STAGING_URL, then asks "promote?".
// With --promote: runs promoteCommand. Missing config keys -> exit 2.

const path = require('path')
const { readConfig } = require('./lib/state')
const { run } = require('./lib/host')
const { render } = require('./lib/report')

function main(argv) {
  let root = process.cwd()
  const words = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') root = path.resolve(argv[++i])
    else if (!argv[i].startsWith('--')) words.push(argv[i])
  }
  const promote = argv.includes('--promote')
  const rel = readConfig(root).release || {}
  const need = promote ? ['promoteCommand'] : ['deployCommand', 'stagingUrl', 'e2eCommand']
  const missing = need.filter((k) => !rel[k])
  if (missing.length) {
    process.stderr.write(`release: config.release is missing ${missing.join(', ')} in .claude/spec.config.json — add ${missing.length > 1 ? 'them' : 'it'} or run /spec:init\n`)
    return 2
  }
  const note = words.join(' ')
  const env = { STAGING_URL: process.env.STAGING_URL || rel.stagingUrl, RELEASE_NOTE: note }
  const out = (o) => {
    process.stdout.write(argv.includes('--json') ? JSON.stringify(o) + '\n' : render(o))
    return o.blocks ? 1 : 0
  }
  const steps = promote ? [['promote', rel.promoteCommand]] : [['deploy', rel.deployCommand], ['e2e', rel.e2eCommand]]
  const bullets = []
  for (const [name, cmd] of steps) {
    const r = run(cmd, { cwd: root, env })
    if (r.status !== 0) return out({ outcome: `release stopped at ${name}`, bullets, blocks: `${name} exited ${r.status}:\n${r.tail}`, next: `fix ${name}, then re-run /spec:release` })
    bullets.push(`${name} ok`)
  }
  if (promote) return out({ outcome: `✅ released${note ? ' — ' + note : ''}`, bullets, next: 'nothing needs you — promoted' })
  return out({ outcome: `✅ staging verified${note ? ' — ' + note : ''}`, bullets, pins: `promote? re-run with --promote${note ? ' ' + JSON.stringify(note) : ''}`, next: 'promote to production when ready' })
}

if (require.main === module) process.exitCode = main(process.argv.slice(2))
