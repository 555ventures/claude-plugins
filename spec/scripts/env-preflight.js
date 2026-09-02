#!/usr/bin/env node
// Env preflight — turns an unprovisioned environment variable into a deterministic STOP before
// any gate, probe, or repair path is reachable, instead of an ordinary red the gate cannot tell
// apart from broken code.
//
// WHY THIS EXISTS: specs/20260815/05-env-preflight.md — (runId
// wf_e4778d03-81b, observed twice): with a suite-gating variable unset, the gate failed at env()
// parse time, wf-build classified that as implementation breakage, and burned a full repair
// round it could not possibly win — the code the round would edit was never the code that
// failed. Hosts declare their gating variables in `.claude/spec.config.json`'s `testEnv` array
// (`[{"var": "<NAME>", "provision": "<command>"}]`); this script is the one deterministic check
// against that registry, run twice: build/design Phase 0 (default mode, checks process.env) and
// doctor 6b (`--rules` mode, checks the registry agrees with the host's § Test Rules prose).
//
// WHAT THIS DELIBERATELY DOES NOT DO: it never reads spec.config.json privately (all config
// reads go through lib/host-config.js's readConfigStrict — a private read would trip spec
// 20260815/01's closure pin); it never infers gating variables from suite code, only from the
// declared registry; `--rules` mode never touches process.env, and default mode never touches
// the rules file — the two checks are independent legs of the same registry.
//
// Usage:
//   node env-preflight.js --root <dir>                  # default mode: process-env presence
//   node env-preflight.js --root <dir> --rules <path>   # doctor mode: registry <-> § Test Rules
// Exit codes (house convention: findings on 1/3, usage-and-config errors on 2):
//   0  all declared vars set and non-empty (default mode) / registry agrees with rules (--rules) /
//      no, absent, or empty testEnv registry (both modes)
//   1  default mode: >=1 declared var unset or empty — one line per miss, then a remedy line
//   2  config missing/unparseable (readConfigStrict, caught), malformed testEnv (not an array,
//      or a row missing var/provision — names the row), bad usage, or --rules path unreadable
//   3  --rules mode: >=1 declared var name absent from the rules file's ## Test Rules section, or
//      the section heading itself is absent (named)

'use strict'
const fs = require('fs')
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
