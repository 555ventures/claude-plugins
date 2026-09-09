'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { tmpdir, gitRepo } = require('../helpers')

// specs/20260908/05-release-e2e-unobserved-count.md D8: the host builders shared by
// tests/release-legs/release-legs.test.js and tests/release-legs/e2e-unobserved.test.js, moved
// verbatim out of release-legs.test.js so neither file exceeds the per-file server-spawning
// test budget (specs/20260903/07). No `test(` calls here — see build-driver.fixtures.js for the
// sibling pattern this file follows.

function writeConfig(dir, config) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify(config, null, 2))
}

function writeReleaseManifest(dir, checks) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/release-manifest.json'), JSON.stringify({ checks }))
}

// TOTAL=2 FAILS=0 INERT=1 — the exact sentinel AC-20260823-01-4 spikes verbatim.
const GREEN_RELEASE_MANIFEST_CHECKS = [
  { claim: 'a verifiable production check', kind: 'exec', target: 'true' },
  { claim: 'an unverifiable-from-this-host check', kind: 'inert', target: 'declared: nothing to verify from here' },
]

function readRows(p) {
  if (!fs.existsSync(p)) return []
  return fs.readFileSync(p, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
}

function rowFor(rows, leg) {
  return rows.find(r => r.leg === leg)
}

function writeExecutable(p, content) {
  fs.writeFileSync(p, content)
  fs.chmodSync(p, 0o755)
}

// A directory holding one PATH-stubbed binary named `name` — prepended onto PATH so bash -c
// resolves it before the real one.
function makeStubBin(dir, name, script) {
  const binDir = path.join(dir, '_stubbin')
  fs.mkdirSync(binDir, { recursive: true })
  writeExecutable(path.join(binDir, name), script)
  return binDir
}

function withStubPath(binDir) {
  return { ...process.env, PATH: binDir + path.delimiter + process.env.PATH }
}

// A REAL child-process HTTP server (never in-process — spawnSync-ing release-legs.js against an
// in-process stub would deadlock the parent event loop for the child's whole lifetime). Binds an
// OS-assigned ephemeral port and writes it to portFile once listening, so the test can poll for
// readiness without guessing a fixed port.
function startStagingServer(dir) {
  const serverFile = path.join(dir, '_stub-server.js')
  fs.writeFileSync(serverFile,
    'const http = require("http")\n' +
    'const fs = require("fs")\n' +
    'const server = http.createServer((req, res) => { res.statusCode = 200; res.end("ok") })\n' +
    'server.listen(0, "127.0.0.1", () => { fs.writeFileSync(process.argv[2], String(server.address().port)) })\n')
  const portFile = path.join(dir, '_stub-port')
  const child = spawn(process.execPath, [serverFile, portFile], { stdio: 'ignore' })
  return { child, portFile }
}

async function waitForPort(portFile, timeoutMs = 5000) {
  const start = Date.now()
  while (!fs.existsSync(portFile)) {
    if (Date.now() - start > timeoutMs) throw new Error('staging stub server never became ready: ' + portFile)
    await new Promise(r => setTimeout(r, 20))
  }
  return Number(fs.readFileSync(portFile, 'utf8').trim())
}

// A working synthetic host: git repo (release-legs' ci leg shells `git rev-parse HEAD`), a
// reachable staging server, a green release-manifest, and a release/capabilities config a caller
// can override piecewise. Returns dir/stagingUrl/kill — callers MUST call kill() when done.
async function setupWorkingHost(prefix, { release = {}, capabilities = {}, checks = GREEN_RELEASE_MANIFEST_CHECKS, e2eCommand = 'true' } = {}) {
  const dir = fs.realpathSync(tmpdir(prefix))
  gitRepo(dir)
  const { child, portFile } = startStagingServer(dir)
  const port = await waitForPort(portFile)
  const stagingUrl = `http://127.0.0.1:${port}`
  writeConfig(dir, {
    release: { deployCommand: 'true', stagingUrl, e2eCommand, ...release },
    capabilities: { forge: 'none', ...capabilities },
  })
  writeReleaseManifest(dir, checks)
  return { dir, stagingUrl, kill: () => child.kill() }
}

module.exports = {
  writeConfig, writeReleaseManifest, GREEN_RELEASE_MANIFEST_CHECKS, readRows, rowFor,
  writeExecutable, makeStubBin, withStubPath, startStagingServer, waitForPort, setupWorkingHost,
}
