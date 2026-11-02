'use strict'
// lib/host-run.js — the one module that runs or prints a host's own command string (gate, test,
// e2e, boot, db, picture, scaffold), so cwd, env scrubbing and quoting have one owner.
//
// Owner: specs/20261026/01-one-runner-for-host-commands.md (D1-D3; AC-20261026-01-1..4); specs/20261102/01-the-host-names-its-runner-grammar.md (withFiles).
//
// Library: quote(value), withFiles(cmd, relPaths), printable(command, env), run(command, opts), runAsync(command, {cwd, env}).
//   withFiles substitutes quoted paths at a `{file}` placeholder, else appends them.
//   env is ADDITIONS over process.env; NODE_TEST_CONTEXT is always removed from the final env.
//   run's maxBuffer defaults to 256 MiB (DEFAULT_MAX_BUFFER) when the caller passes none: spawnSync's
//   1 MiB default SIGTERM-kills a passing host command that prints more (ENOBUFS, status null), which
//   every driver reads as "died without an exit code" — niko-hub spec 20261101/12 could never close
//   (2026-11-02, gate exit 0 at 1.24 MB). An explicit caller maxBuffer still wins.
//
// Deliberately does NOT call process.exit (drivers keep their own die-on-no-status discipline via
// driver-io.runHost), resolve a cwd, retry, or decide what counts as a pass — callers read the
// result.
//
// Exit codes: n/a (library, not an entrypoint).
const { spawn, spawnSync } = require('child_process')

const SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/
const DEFAULT_MAX_BUFFER = 256 * 1024 * 1024

// POSIX single-quote form; the one quoting style for any value spliced into a host command.
function quote(value) {
  const s = String(value)
  if (SAFE.test(s)) return s
  return "'" + s.split("'").join("'\\''") + "'"
}

// Every `{file}` in cmd becomes the quoted space-joined paths; with no placeholder the quoted
// paths are appended after one space. quote() stays the only path into the string.
function withFiles(cmd, relPaths) {
  const joined = relPaths.map(quote).join(' ')
  if (cmd.includes('{file}')) return cmd.split('{file}').join(joined)
  return cmd + ' ' + joined
}

// `export K=V[ K2=V2]; <command>` — the export reaches every command of a compound line, which a
// bare `K=V cmd` prefix does not. null/undefined entries are dropped.
function printable(command, env = {}) {
  const entries = Object.entries(env || {}).filter(([, v]) => v !== null && v !== undefined)
  if (entries.length === 0) return command
  return 'export ' + entries.map(([k, v]) => k + '=' + quote(v)).join(' ') + '; ' + command
}

function finalEnv(extra) {
  const env = { ...process.env, ...(extra || {}) }
  delete env.NODE_TEST_CONTEXT
  return env
}

function run(command, opts = {}) {
  return spawnSync('bash', ['-c', command], { maxBuffer: DEFAULT_MAX_BUFFER, ...opts, env: finalEnv(opts.env) })
}

function runAsync(command, { cwd, env } = {}) {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-c', command], { cwd, env: finalEnv(env) })
    let out = '', err = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })
    child.on('error', () => resolve({ code: 127, out, err }))
    child.on('close', code => resolve({ code: code === null ? 1 : code, out, err }))
  })
}

module.exports = { quote, withFiles, printable, run, runAsync }
