'use strict'
// lib/contract.js — the behaviour contract's steps as exported functions, called in order by
// prototype-driver.js's `--mark contracted`, `--mark tests-derived` and `--mark closed` handlers.
//
// WHY: specs/20261007/01-approve-writes-a-behaviour-contract.md D3 — approve writes a contract
// (every pin as a record, one picture per route x state made by the host's own `picture` command,
// one verified end-to-end test per behaviour pin) and nothing else leaves the prototype worktree;
// each step lives here as a small, independently callable function so the driver's mark handlers
// stay readable as an ordered list of calls. Not an entry point: every function is reached only
// through the driver's own ACs (AC-20261007-01-2 .. AC-20261007-01-8), and none of them owns
// status.json/marks bookkeeping — the driver passes whatever facts each step needs.
//
// What this deliberately does NOT do: read or write design/prototypes/<stem>/status.json, decide
// which mark a driver invocation records, run a gate, capture structure, export code, reserve a
// spec number, or print anything — every function returns a plain result object
// (`{ ok: true, ... }` or `{ ok: false, message }`) and the driver is the sole place a refusal
// becomes a stderr line + exit code.
//
// Exit codes: n/a (library, not an entrypoint).

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// ---------------------------------------------------------------------------
// D4(5): pictureAll — one `prototype.picture` run per route x state.
// ---------------------------------------------------------------------------
function routeSlug(routePath) {
  if (routePath === '/') return 'root'
  let s = routePath.replace(/\//g, '_')
  if (s.startsWith('_')) s = s.slice(1)
  return s
}

// `viewport` is the one size the driver resolved from states.json and also writes into the
// contract. `baseUrl` is the resolved app address (a {port} url already substituted); contract
// urls stay the relative state path. `env` rides on top of process.env (PROTO_BRANCH,
// PROTO_WORKTREE, PROTO_BRIEF as dbCreate gets them).
function pictureAll({ root, worktreePath, designDir, config, statesDoc, viewport, baseUrl, env }) {
  const template = config.prototype && config.prototype.picture
  const size = viewport || { width: 1280, height: 800 }
  const capturesDir = path.join(designDir, 'captures')
  fs.mkdirSync(capturesDir, { recursive: true })
  const runEnv = Object.assign({}, process.env, env || {})
  const routesOut = {}
  let stateCount = 0

  for (const [routePath, states] of Object.entries(statesDoc.routes || {})) {
    const slug = routeSlug(routePath)
    routesOut[routePath] = {}
    for (const [stateName, statePath] of Object.entries(states || {})) {
      stateCount++
      const url = baseUrl + statePath
      const outFile = path.join(capturesDir, slug + '--' + stateName + '.png')
      // A stale file from an earlier run must not satisfy the signature check for a command that
      // wrote nothing this time.
      try { fs.rmSync(outFile, { force: true }) } catch { /* the signature check below catches whatever remains */ }
      const cmd = template
        .split('{url}').join(url)
        .split('{out}').join(outFile)
        .split('{width}').join(String(size.width))
        .split('{height}').join(String(size.height))
      const r = spawnSync('bash', ['-c', cmd], { cwd: worktreePath, encoding: 'utf8', env: runEnv })
      if (r.status !== 0) {
        return {
          ok: false,
          message: 'prototype.picture failed for ' + routePath + ' (' + stateName + ') at ' + url +
            ' (exit ' + r.status + '): ' + (r.stderr || '').trim(),
        }
      }
      let head = Buffer.alloc(0)
      try {
        const fd = fs.openSync(outFile, 'r')
        try {
          const buf = Buffer.alloc(8)
          const n = fs.readSync(fd, buf, 0, 8, 0)
          head = buf.subarray(0, n)
        } finally { fs.closeSync(fd) }
      } catch { head = Buffer.alloc(0) }
      if (!head.equals(PNG_SIGNATURE)) {
        return {
          ok: false,
          message: 'prototype.picture wrote no PNG at ' + outFile + ' for ' + routePath + ' (' + stateName +
            ') — remedy: the command must write one PNG file to {out}',
        }
      }
      routesOut[routePath][stateName] = { url: statePath, capture: 'captures/' + path.basename(outFile) }
    }
  }

  return {
    ok: true,
    routes: routesOut,
    routeCount: Object.keys(routesOut).length,
    stateCount,
    captureCount: stateCount,
  }
}

// ---------------------------------------------------------------------------
// D4(6): writeContract — contract.json, schemaVersion 2. `pins` are the records the driver built
// from pins.json; `tests` is null until tests-derived completes it (D6(7)).
// ---------------------------------------------------------------------------
function writeContract({ designDir, stem, brief, idea, approvedAt, base, viewport, routes, pins, tests }) {
  const contract = {
    schemaVersion: 2,
    stem,
    brief,
    idea: idea === undefined ? null : idea,
    approvedAt,
    base,
    viewport,
    routes,
    pins,
    tests: tests === undefined ? null : tests,
  }
  fs.mkdirSync(designDir, { recursive: true })
  fs.writeFileSync(path.join(designDir, 'contract.json'), JSON.stringify(contract, null, 2) + '\n')
  return contract
}

// ---------------------------------------------------------------------------
// D6(6): copyContractTests — `git show <branch>:<e2eFile>` into design/prototypes/<stem>/tests/.
// ---------------------------------------------------------------------------
function copyContractTests({ root, branch, e2eFile, designDir }) {
  const shown = spawnSync('git', ['-C', root, 'show', branch + ':' + e2eFile], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 })
  if (shown.status !== 0) {
    return { ok: false, message: 'git show ' + branch + ':' + e2eFile + ' failed: ' + (shown.stderr || '').trim() + ' — remedy: confirm ' + branch + ' still carries ' + e2eFile + ' (commit it there), then re-run --mark tests-derived' }
  }
  const name = path.basename(e2eFile)
  const dest = path.join(designDir, 'tests', name)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, shown.stdout)
  return { ok: true, file: 'tests/' + name, dest }
}

// ---------------------------------------------------------------------------
// D9: deletion — split into two postcondition-checking steps so the driver can persist
// status.json between them. dbDestroy is not assumed idempotent (a resume after a dirty-
// worktree refusal must not run it twice), so the driver records `marks.dbDestroyed` right
// after `runDbDestroy` succeeds, before ever attempting `removeProtoWorktreeAndBranch` — and
// passes `alreadyRan` back in on every subsequent call so a re-run skips it. Worktree removal
// and branch deletion each re-check their own postcondition first (registered / exists) so a
// re-run after either one already succeeded is a no-op rather than the wrong remedy.
// ---------------------------------------------------------------------------
function gitBranchExists(root, name) {
  const r = spawnSync('git', ['-C', root, 'branch', '--list', name], { encoding: 'utf8' })
  return r.status === 0 && r.stdout.trim() !== ''
}

function worktreeIsRegistered(root, worktreePath) {
  const r = spawnSync('git', ['-C', root, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' })
  if (r.status !== 0 || !r.stdout) return false
  const realpath = (p) => { try { return fs.realpathSync(p) } catch { return path.resolve(p) } }
  const target = realpath(worktreePath)
  for (const line of r.stdout.split('\n')) {
    if (!line.startsWith('worktree ')) continue
    if (realpath(line.slice('worktree '.length)) === target) return true
  }
  return false
}

function runDbDestroy({ config, worktreePath, branch, brief, alreadyRan }) {
  if (alreadyRan) return { ok: true, ran: false }
  if (!(config.prototype && config.prototype.dbDestroy)) return { ok: true, ran: false }
  const env = Object.assign({}, process.env, { PROTO_BRANCH: branch, PROTO_WORKTREE: worktreePath, PROTO_BRIEF: brief })
  const r = spawnSync('bash', ['-c', config.prototype.dbDestroy], { cwd: worktreePath, encoding: 'utf8', env })
  if (r.status !== 0) {
    return { ok: false, message: 'prototype.dbDestroy failed (exit ' + r.status + '): ' + ((r.stdout || '') + (r.stderr || '')).trim() }
  }
  return { ok: true, ran: true }
}

// `rerun` names the mark the remedy tells the session to re-run (default: the generic phrase).
function removeProtoWorktreeAndBranch({ root, worktreePath, branch, stem, rerun }) {
  if (worktreeIsRegistered(root, worktreePath)) {
    const remove = spawnSync('git', ['-C', root, 'worktree', 'remove', worktreePath], { encoding: 'utf8' })
    if (remove.status !== 0) {
      return {
        ok: false,
        message: 'commit or discard on proto/' + stem + ', then re-run ' + (rerun || 'the mark') + ' — git worktree remove failed: ' + (remove.stderr || '').trim(),
      }
    }
  }
  if (gitBranchExists(root, branch)) {
    const del = spawnSync('git', ['-C', root, 'branch', '-D', branch], { encoding: 'utf8' })
    if (del.status !== 0) {
      return { ok: false, message: 'git branch -D ' + branch + ' failed: ' + (del.stderr || '').trim() }
    }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// D8: ledgerRow — the plain object; the driver appends it through lib/driver-io.js's
// appendLedger so every driver shares the one JSONL-append implementation.
// ---------------------------------------------------------------------------
function ledgerRow({ stem, brief, branch, rounds, pinsTotal, pinsBehaviour, pinsLook, routes, states, captures, contract }) {
  return {
    ts: new Date().toISOString(),
    stage: 'prototype',
    stem,
    brief,
    branch,
    rounds,
    pins: { total: pinsTotal, behaviour: pinsBehaviour, look: pinsLook },
    routes,
    states,
    captures,
    contract,
    verdict: 'contracted',
  }
}

module.exports = {
  routeSlug,
  pictureAll,
  writeContract,
  copyContractTests,
  runDbDestroy,
  removeProtoWorktreeAndBranch,
  ledgerRow,
}
