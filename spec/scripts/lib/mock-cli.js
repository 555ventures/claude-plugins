'use strict'
// lib/mock-cli.js — the one caller of the separate `@555-ventures/mock-review` package this plugin never
// depends on directly. specs/20260914/01-the-mock-contract-and-the-driver.md D1/D2,
// AC-20260914-01-1, AC-20260914-01-2: `run(appDir, verb, args)` spawns `mock-review <verb> …`
// with `cwd: appDir` and `shell: false`, prepending `<appDir>/node_modules/.bin` to the inherited
// PATH so an `npm i -D` bin is found even when nothing put it on PATH itself (a stub earlier on
// PATH still wins — A2). `contractOrDie(appDir)` runs `contract --json` first and refuses (exit
// 2) on a `contractVersion` mismatch against the template, naming both numbers and the pinned-
// major install remedy; an ENOENT spawn refuses naming the plain install remedy. Every JSON verb
// this module runs is parsed and validated against the contract's own `shapes` map (D1) — a
// parse or shape failure is exit 2 naming the verb and the missing key — before any caller reads
// it.
//
// The shape check is key-presence only (per object, and per array/map element), exactly as D1
// scopes it: no library, no type checks, `null` counts as present. It walks the contract's own
// `shapes[verb]` entry rather than hardcoding field names, so a shape addition in the contract
// needs no matching code change here.
//
// What this deliberately does NOT do: retry a dead or mismatched spawn, cache a verb's result
// across calls, call any verb the driver does not need (`sweep`/`answer`/`serve` are the
// session's own `npx mock-review …` invocations, never this module's), or read/write anything
// under design/mocks/ or the app's own `design/notes.json` / `design/approval.json` — this module
// only ever runs the package's CLI and validates its stdout.
//
// Exit codes: 2 — a `contractVersion` mismatch, an ENOENT spawn (no `mock-review` reachable), a
// non-JSON or unparseable stdout from a JSON verb, or a parsed JSON verb response missing a key
// the contract's `shapes` map requires.

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const CONTRACT_PATH = path.join(__dirname, '..', '..', 'templates', 'mock', 'contract.json')

function die(msg) {
  process.stderr.write('mock-cli: ' + msg + '\n')
  process.exit(2)
}

function loadContract() {
  let raw
  try {
    raw = fs.readFileSync(CONTRACT_PATH, 'utf8')
  } catch (e) {
    die('spec/templates/mock/contract.json could not be read (' + e.message + ') — remedy: reinstall the plugin')
    return null // unreachable
  }
  try {
    return JSON.parse(raw)
  } catch (e) {
    die('spec/templates/mock/contract.json is not valid JSON (' + e.message + ') — remedy: reinstall the plugin')
    return null // unreachable
  }
}

// D2: `<appDir>/node_modules/.bin` prepended to the inherited PATH — an `npm i -D` bin is never
// on PATH by itself, and a stub earlier on PATH still wins (A2). `shell: false` throughout, so
// Node's own PATH-searching spawn (posix_spawnp) is what actually finds the executable.
// A2: when the inherited PATH is empty (a caller simulating "nothing else on PATH", never a
// real session's own environment), fall back to the directory of the node running this driver
// followed by the same bare POSIX default `execvp` itself uses when PATH is unset
// (confstr(_CS_PATH), "/bin:/usr/bin" on Linux) — an explicit empty PATH string (unlike an
// absent PATH key) disables that fallback at the OS level, which would otherwise strand the
// installed bin's `#!/usr/bin/env node` shebang. The running node's own directory comes first:
// a version-managed node (nvm, mise, volta) lives nowhere on the bare default, and where a
// system `/usr/bin/node` does exist it is a different major than the one already executing.
function spawnEnv(appDir) {
  const bin = path.join(appDir, 'node_modules', '.bin')
  const fallback = path.dirname(process.execPath) + path.delimiter + '/usr/bin:/bin'
  const base = process.env.PATH || fallback
  return { ...process.env, PATH: bin + path.delimiter + base }
}

// The raw spawn every verb (JSON or not) goes through. Returns the spawnSync result; callers
// that need JSON use runJson below, which adds parsing + shape validation on top.
function run(appDir, verb, args = []) {
  return spawnSync('mock-review', [verb, ...args], {
    cwd: appDir,
    shell: false,
    encoding: 'utf8',
    env: spawnEnv(appDir),
  })
}

function dieEnoent() {
  die('mock-review not found — remedy: npm i -D ' + loadContract().package)
}

// key-presence check only: returns the first missing key, or null. A non-array `keys` value
// (e.g. approval's `"theme": "string?"`) is not a required-key list — nothing to check.
function firstMissingKey(obj, keys) {
  if (!Array.isArray(keys)) return null
  if (obj === undefined || obj === null || typeof obj !== 'object') return keys[0] || '(object)'
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) return k
  }
  return null
}

function dieShape(verb, path_) {
  die(verb + ' --json response is missing "' + path_ + '" — the installed ' + loadContract().package + ' build disagrees with this plugin\'s contract; remedy: npm i -D ' + loadContract().package + '@' + (loadContract().contractVersion))
}

// D1: walk the contract's own `shapes[verb]` entry — `required` (top-level keys), `<field>[]`
// (every element of that array carries these keys), `<field>{}` (every value of that map carries
// these keys), or a bare nested-object field name (that field's own required keys).
function validateShape(verb, obj, contract) {
  const spec = contract.shapes && contract.shapes[verb]
  if (!spec) return obj
  const topMiss = firstMissingKey(obj, spec.required)
  if (topMiss) dieShape(verb, topMiss)
  for (const key of Object.keys(spec)) {
    if (key === 'required') continue
    if (key.endsWith('[]')) {
      const field = key.slice(0, -2)
      const arr = obj[field]
      if (Array.isArray(arr)) {
        arr.forEach((el, i) => {
          const m = firstMissingKey(el, spec[key])
          if (m) dieShape(verb, field + '[' + i + '].' + m)
        })
      }
    } else if (key.endsWith('{}')) {
      const field = key.slice(0, -2)
      const map = obj[field]
      if (map && typeof map === 'object') {
        for (const k of Object.keys(map)) {
          const m = firstMissingKey(map[k], spec[key])
          if (m) dieShape(verb, field + '.' + k + '.' + m)
        }
      }
    } else {
      const m = firstMissingKey(obj[key], spec[key])
      if (m) dieShape(verb, key + '.' + m)
    }
  }
  return obj
}

// Runs `mock-review <verb> --json [...args]`, parses stdout, validates it against the contract's
// shape for that verb. Every JSON verb this module calls goes through here.
function runJson(appDir, verb, args = [], contract) {
  const r = run(appDir, verb, [...args, '--json'])
  if (r.error) {
    if (r.error.code === 'ENOENT') dieEnoent()
    die(verb + ' --json failed to run: ' + r.error.message + ' — remedy: verify `mock-review` is installed and executable in node_modules/.bin, then re-run')
  }
  let obj
  try {
    obj = JSON.parse(r.stdout)
  } catch (e) {
    die(verb + ' --json printed non-JSON stdout (' + e.message + '): ' + (r.stdout || '').slice(0, 200) +
      ' — remedy: run `mock-review ' + verb + ' --json` directly in the app dir to see the raw error, fix it, then re-run')
    return null // unreachable
  }
  return validateShape(verb, obj, contract || loadContract())
}

// D2: refuses (exit 2) on an ENOENT spawn or a `contractVersion` mismatch, naming both numbers
// and the pinned-major install remedy. Every caller that needs the package on a host runs this
// first — the driver never trusts a verb's output before this has passed.
function contractOrDie(appDir) {
  const template = loadContract()
  const reported = runJson(appDir, 'contract', [], template)
  if (reported.contractVersion !== template.contractVersion) {
    die('contract ' + reported.contractVersion + ' ≠ ' + template.contractVersion +
      ' — remedy: npm i -D ' + template.package + '@' + template.contractVersion)
  }
  return reported
}

// `check --json` — the one structural read the driver relies on (screens, journeys, shells,
// themes, config, serve URL). Never memoized: every mark re-derives from the live host.
function checkJson(appDir) {
  return runJson(appDir, 'check', [])
}

module.exports = { run, runJson, contractOrDie, checkJson, loadContract }
