'use strict'
// Shared setup for tests/walkthrough/*.test.js — specs/20260929/01-the-walkthrough-contract-and-the-client.md
// (File Plan: tests/walkthrough/fixture.js). Not a *.test.js file, so node's discovery skips it.
//
// Every test whose subject makes a request goes through runWalkthrough (async child_process.spawn)
// against startStub (a child-process node:http server): tests/helpers.js runNode is spawnSync and
// deadlocks against a server living in the test process (spec-pipeline § Gotchas).
//
// Exit codes: n/a (library).

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const { ROOT, SPEC, tmpdir } = require('../helpers')

const SCRIPT = path.join(SPEC, 'scripts/walkthrough.js')
const CONTRACT = path.join(SPEC, 'templates/walkthrough/contract.json')
const CATALOG = path.join(SPEC, 'templates/walkthrough/catalog.json')
const FIXTURES = path.join(ROOT, 'tests/fixtures/walkthrough')
const HEARWELL = path.join(FIXTURES, 'hearwell-round.json')
const PICTURES = path.join(FIXTURES, 'pictures-round.json')
const STUB = path.join(__dirname, 'stub-service.js')

const TOKEN = 'tok_0123456789abcdef0123456789abcdef'
const ZEROS = '0'.repeat(64)
const HELLO_OK = { status: 200, body: { apiVersion: 1, revision: 1, sunset: null } }

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex') }
function loadJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')) }
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
}

// A tmp host whose .claude/spec.config.json carries `block` as its walkthrough block
// (null = the block is absent).
function makeHost(block) {
  const dir = tmpdir('walkthrough-host')
  writeConfig(dir, block)
  return dir
}

function writeConfig(dir, block) {
  const cfg = { generatedBy: 'test' }
  if (block) cfg.walkthrough = block
  writeJson(path.join(dir, '.claude/spec.config.json'), cfg)
}

function block(url, over = {}) {
  return { baseUrl: url, project: 'hearwell', tokenEnv: 'WALKTHROUGH_TOKEN', ...over }
}

// design/rounds/<n>/round.json as a pushed wireframe round leaves it, for pull/reply/mark hosts.
function seedRound(dir, n, over = {}) {
  writeJson(path.join(dir, 'design/rounds', String(n), 'round.json'), {
    apiVersion: 1, round: n, kind: 'wireframe', status: 'open', contentHash: ZEROS,
    journeys: [{ id: 'owner-onboarding', beats: '08363cd98ef8' }],
    screens: [{ name: 'owner-intro', state: null }], ...over,
  })
}

// Start the stub as a child process; resolves once it has printed its bound port.
async function startStub(t, answers) {
  const dir = tmpdir('walkthrough-stub')
  const answersFile = path.join(dir, 'answers.json')
  const logFile = path.join(dir, 'log.jsonl')
  fs.writeFileSync(answersFile, JSON.stringify(answers))
  fs.writeFileSync(logFile, '')
  const child = spawn(process.execPath, [STUB, '0', answersFile, logFile], { stdio: ['ignore', 'pipe', 'pipe'] })
  const exited = new Promise((resolve) => child.once('exit', resolve))
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await exited
  }
  t.after(stop)
  const port = await new Promise((resolve, reject) => {
    let buf = ''
    const timer = setTimeout(() => reject(new Error('stub did not report a port within 5 s')), 5000)
    child.stderr.on('data', (d) => { buf += d })
    child.stdout.on('data', (d) => {
      buf += d
      const m = /PORT (\d+)/.exec(buf)
      if (m) { clearTimeout(timer); resolve(Number(m[1])) }
    })
    child.once('exit', () => { clearTimeout(timer); reject(new Error('stub exited early: ' + buf)) })
  })
  return {
    port,
    url: 'http://127.0.0.1:' + port,
    log: () => fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)),
    stop,
  }
}

// Run the script under test as an async child: `args[0]` is the verb. `--root <dir>` is appended,
// cwd is the host, the token variable is set unless env overrides it (null deletes a variable).
function runWalkthrough(dir, args, opts = {}) {
  const env = { ...process.env, WALKTHROUGH_TOKEN: TOKEN }
  for (const [k, v] of Object.entries(opts.env || {})) {
    if (v === null || v === undefined) delete env[k]
    else env[k] = v
  }
  const argv = [SCRIPT, ...args, ...(opts.noRoot ? [] : ['--root', dir])]
  return new Promise((resolve) => {
    const child = spawn(process.execPath, argv, { cwd: opts.cwd || dir, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    const killer = setTimeout(() => child.kill('SIGKILL'), opts.limitMs || 30000)
    child.once('close', (status, signal) => {
      clearTimeout(killer)
      resolve({ status, signal, stdout, stderr })
    })
  })
}

// Every file under dir, recursively.
function allFiles(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...allFiles(p))
    else out.push(p)
  }
  return out
}

// PNG bytes for the picture fixtures: 8 signature bytes plus filler; nothing binary is committed.
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
function pngBytes(total, fill) { return Buffer.concat([PNG_SIG, Buffer.alloc(total - 8, fill)]) }

// A work dir holding the pictures round file and its three PNGs beside it.
function makePictureWork() {
  const work = tmpdir('walkthrough-pictures')
  const files = {
    'captures/owner-intro-390.png': pngBytes(200008, 1),
    'captures/owner-intro-1280.png': pngBytes(300008, 2),
    'captures/roster-empty-390.png': pngBytes(150008, 3),
  }
  fs.mkdirSync(path.join(work, 'captures'), { recursive: true })
  for (const [rel, buf] of Object.entries(files)) fs.writeFileSync(path.join(work, rel), buf)
  const roundFile = path.join(work, 'pictures-round.json')
  fs.copyFileSync(PICTURES, roundFile)
  return { work, roundFile, files }
}

module.exports = {
  SCRIPT, CONTRACT, CATALOG, FIXTURES, HEARWELL, PICTURES, TOKEN, ZEROS, HELLO_OK,
  sha256, loadJson, writeJson, makeHost, writeConfig, block, seedRound, startStub,
  runWalkthrough, allFiles, pngBytes, makePictureWork,
}
