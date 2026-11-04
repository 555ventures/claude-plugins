#!/usr/bin/env node
// Env preflight — turns an unprovisioned environment variable into a deterministic STOP before
// any gate, probe, or repair path is reachable, instead of an ordinary red the gate cannot tell
// apart from broken code.
//
// Owner: specs/20260815/05-env-preflight.md
// WHY THIS EXISTS: an unset suite-gating variable fails the gate at parse time and reads as broken code,
// burning a repair round. Hosts declare gating variables in the config's `testEnv` array
// (`[{"var": "<NAME>", "provision": "<command>"}]`); this is the one check against that registry, run at
// build/design Phase 0 (default mode, process.env) and doctor 6b (`--rules` mode, § Test Rules prose).
//
// WHAT THIS DELIBERATELY DOES NOT DO: read the config privately (lib/host-config.js's readConfigStrict),
// infer gating variables from suite code, cross the two modes (`--rules` never reads process.env, default
// mode never reads the rules file), or run direnv / load an .envrc / edit the environment.
//
// Usage:
//   node env-preflight.js --root <dir>                  # default mode: process-env presence
//   node env-preflight.js --root <dir> --rules <path>   # doctor mode: registry <-> § Test Rules
// Exit codes (house convention: findings on 1/3, usage-and-config errors on 2):
//   0  all declared vars set and non-empty (default mode) / registry agrees with rules (--rules) /
//      no, absent, or empty testEnv registry (both modes)
//   1  default mode: >=1 declared var unset or empty (one line per miss, then a remedy line), OR
//      an .envrc at --root while direnv is loaded for a different directory (the gate would run
//      against that directory's environment)
//   2  config missing/unparseable (readConfigStrict, caught), malformed testEnv (not an array,
//      or a row missing var/provision — names the row), bad usage, or --rules path unreadable
//   3  --rules mode: >=1 declared var name absent from the rules file's ## Test Rules section, or
//      the section heading itself is absent (named)

'use strict'
const fs = require('fs')
const path = require('path')
const { readConfigStrict, CONFIG_RELPATH } = require('./lib/host-config')

function die(msg) { process.stderr.write('env-preflight: ' + msg + '\n'); process.exit(2) }

const argv = process.argv.slice(2)
const rootIdx = argv.indexOf('--root')
if (rootIdx === -1 || !argv[rootIdx + 1]) {
  die('usage: env-preflight.js --root <dir> [--rules <path>] — pass --root to run this check')
}
const root = argv[rootIdx + 1]
const rulesIdx = argv.indexOf('--rules')
const rulesArgGiven = rulesIdx !== -1
const rulesPath = rulesArgGiven ? argv[rulesIdx + 1] : undefined
if (rulesArgGiven && !rulesPath) die('--rules needs a path')

let config
try {
  config = readConfigStrict(root)
} catch (e) {
  die(e.message + ' — run /spec:init first')
}

// ---- direnv scope check (default mode only) --------------------------------------------------
// A var that is SET but points at the wrong directory is invisible to a presence check: direnv never
// fires for a non-interactive child, so a worktree build can inherit the MAIN root's `.envrc`.
// direnv exports DIRENV_DIR as `-<loaded dir>`: an `.envrc` at --root with DIRENV_DIR naming a DIFFERENT
// directory is a proven mismatch — STOP; DIRENV_DIR unset is only possible — WARN and continue.
if (!rulesArgGiven && fs.existsSync(path.join(root, '.envrc'))) {
  const rootAbs = fs.realpathSync(root)
  const raw = process.env.DIRENV_DIR
  if (raw) {
    let loaded = raw.startsWith('-') ? raw.slice(1) : raw
    try { loaded = fs.realpathSync(loaded) } catch { /* stale path: compare it as written */ }
    if (loaded !== rootAbs) {
      process.stdout.write('\u2717 direnv is loaded for ' + loaded + ', not for ' + rootAbs +
        ' — this tree has its own .envrc, so the gate would run against the other directory\'s ' +
        'environment (a wrong database reads exactly like broken application code)\n')
      process.stdout.write('env-preflight: environment not provisioned — run `direnv allow` in ' +
        rootAbs + ', or declare a gateCommand that wraps the suite (e.g. `direnv exec . <suite>`) ' +
        'in ' + CONFIG_RELPATH + ', then re-run; this is not a repair-loop issue\n')
      process.exit(1)
    }
  } else {
    process.stdout.write('env-preflight: WARN — ' + rootAbs + ' has an .envrc but DIRENV_DIR is ' +
      'unset, so nothing confirms its environment is loaded; if the gate needs it, declare a ' +
      'gateCommand that wraps the suite (e.g. `direnv exec . <suite>`)\n')
  }
}

const rawTestEnv = config && typeof config === 'object' ? config.testEnv : undefined

// Absent key = legacy mode: nothing declared, nothing to check.
if (rawTestEnv === undefined || rawTestEnv === null) {
  process.exit(0)
}
if (!Array.isArray(rawTestEnv)) {
  die('testEnv in ' + CONFIG_RELPATH + ' must be an array — fix the config (run /spec:init to regenerate it)')
}

rawTestEnv.forEach((row, i) => {
  if (!row || typeof row !== 'object' || typeof row.var !== 'string' || !row.var ||
      typeof row.provision !== 'string' || !row.provision) {
    die('testEnv[' + i + '] in ' + CONFIG_RELPATH + ' is missing "var" or "provision" — fix the row (run /spec:init to regenerate the registry)')
  }
})

// Dedupe by var name — first row wins.
const seen = new Set()
const rows = []
for (const row of rawTestEnv) {
  if (seen.has(row.var)) continue
  seen.add(row.var)
  rows.push(row)
}

if (rows.length === 0) process.exit(0)

if (rulesArgGiven) {
  let rulesContent
  try {
    rulesContent = fs.readFileSync(rulesPath, 'utf8')
  } catch (e) {
    die('cannot read --rules path ' + rulesPath + ' (' + e.message + ')')
  }

  const headingMatch = /^## Test Rules\s*$/m.exec(rulesContent)
  if (!headingMatch) {
    process.stdout.write('env-preflight: "## Test Rules" section is absent from ' + rulesPath +
      ' — a section that does not exist documents no gating variable\n')
    process.exit(3)
  }
  const sectionStart = headingMatch.index + headingMatch[0].length
  const nextHeading = /^## /m.exec(rulesContent.slice(sectionStart))
  const section = nextHeading
    ? rulesContent.slice(sectionStart, sectionStart + nextHeading.index)
    : rulesContent.slice(sectionStart)

  const undocumented = rows.filter(row => !section.includes(row.var))
  if (undocumented.length > 0) {
    for (const row of undocumented) {
      process.stdout.write('✗ ' + row.var + ' is declared in testEnv but not named in ' + rulesPath +
        '\'s "## Test Rules" section — document its provisioning path there or remove it from testEnv\n')
    }
    process.exit(3)
  }
  process.exit(0)
}

const missing = rows.filter(row => {
  const value = process.env[row.var]
  return value === undefined || value === ''
})

if (missing.length > 0) {
  for (const row of missing) {
    process.stdout.write('✗ ' + row.var + ' unset — provision: ' + row.provision + '\n')
  }
  process.stdout.write('env-preflight: environment not provisioned — run the provisioning ' +
    'command(s) above (see pipeline rules § Test Rules), then re-run; this is not a repair-loop issue\n')
  process.exit(1)
}

process.exit(0)
