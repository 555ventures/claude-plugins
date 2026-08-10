#!/usr/bin/env node
'use strict'
// session-wrapup.js — Claude Code Stop hook: relay the session's wrap-up verdict line to
// the autopilot hub (autopilot-hub docs/canonical/spoke-hooks.md § "Session wrap-up Stop
// hook (brief 06)"). Reads the hook JSON from stdin, resolves the project name as the repo
// directory basename (git toplevel of the session cwd, falling back to the cwd itself),
// and delegates everything else to daemon/wrapup.js. This entrypoint owns the contract
// require (bin/autopilot D9 precedent) and the exit rendering.
//
// Deliberately does NOT: ever exit non-zero or print anything (a Stop hook that fails must
// never block the session ending or surface noise — every failure, including an unloadable
// contract copy on Node < 22.18, is a silent skip), consult ~/.config/autopilot/config.json
// (the pre-hub autopilotd daemon stays independent), re-enter on stop_hook_active (this
// hook never blocks stoppage, so the flag is irrelevant).
//
// Exit codes: 0 always.

const path = require('path')
const { execFileSync } = require('child_process')

function readStdin() {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => { data += chunk })
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', () => resolve(data))
  })
}

// spoke-hooks.md D5: project name = the repo directory basename. The session may sit in a
// subdirectory, so prefer the git toplevel; a non-repo cwd falls back to its own basename.
function repoBasename(cwd) {
  try {
    const toplevel = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (toplevel) return path.basename(toplevel)
  } catch {
    // not a git repo — fall through
  }
  return path.basename(cwd)
}

async function main() {
  try {
    const input = JSON.parse(await readStdin())
    const transcriptPath = input.transcript_path
    if (!transcriptPath) return
    const cwd = input.cwd || process.cwd()

    const { SESSION_WRAPUP_VERDICTS, AUTH_SCHEME } = require('../contract/constants.ts')
    const { relayWrapup } = require('../daemon/wrapup')

    await relayWrapup({
      transcriptPath,
      projectName: repoBasename(cwd),
      verdicts: SESSION_WRAPUP_VERDICTS,
      authScheme: AUTH_SCHEME,
    })
  } catch {
    // silent by contract: a malformed transcript, missing credential, unreachable hub, or
    // unloadable contract copy is a skip, never a blocked session end
  }
}

main().finally(() => process.exit(0))
