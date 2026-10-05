#!/usr/bin/env node
'use strict'
// app-port.js — the one place a launch's app port is allocated, "reads PORT" is decided, and a
// {port} address is resolved (specs/20261005/03-one-port-per-launch.md D4, AC-20261005-03-7).
//
// Usage: node app-port.js --if-reads <command>
//   command reads $PORT  -> prints one free loopback port and a newline
//   command does not     -> prints nothing
// Library: freePort(), readsPort(command), hasPortSlot(url), resolveUrl(url, port).
//
// Deliberately does NOT hold a port open (the window between close and the app's bind is not
// closed here, no retry loop), persist anything, or inspect the host's config — callers pass the
// command or address in.
//
// Exit codes (CLI):
//   0  ok — a port printed, or nothing printed because the command does not read PORT
//   1  allocation failed — `app-port: <cause> — remedy: …` on stderr
//   2  usage — anything other than `--if-reads <command>`
const { spawnSync } = require('child_process')

const READS_PORT = /\$PORT(?![A-Za-z0-9_])|\$\{PORT[}:\-+=?#%]/

const BIND_SCRIPT =
  "const s=require('net').createServer();s.on('error',(e)=>{process.stderr.write(String(e.message));process.exit(1)});" +
  "s.listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port));s.close()})"

function freePort() {
  const r = spawnSync(process.execPath, ['-e', BIND_SCRIPT], { encoding: 'utf8', timeout: 10000 })
  const out = (r.stdout || '').trim()
  if (r.status !== 0 || !/^\d+$/.test(out)) {
    const cause = (r.error && r.error.message) || (r.stderr || '').trim() || 'no port reported'
    throw new Error('could not bind a loopback port (' + cause + ')')
  }
  return Number(out)
}

function readsPort(command) {
  return typeof command === 'string' && READS_PORT.test(command)
}

function hasPortSlot(url) {
  return typeof url === 'string' && url.includes('{port}')
}

function resolveUrl(url, port) {
  return String(url).split('{port}').join(String(port))
}

module.exports = { freePort, readsPort, hasPortSlot, resolveUrl }

if (require.main === module) {
  const argv = process.argv.slice(2)
  if (argv.length !== 2 || argv[0] !== '--if-reads') {
    process.stderr.write('usage: app-port.js --if-reads <command>\n')
    process.exit(2)
  }
  if (!readsPort(argv[1])) process.exit(0)
  try {
    process.stdout.write(freePort() + '\n')
  } catch (e) {
    process.stderr.write('app-port: ' + e.message + ' — remedy: free a loopback port, or give runtime.readyCheck a fixed address\n')
    process.exit(1)
  }
}
