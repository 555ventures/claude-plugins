#!/usr/bin/env node
'use strict'
// pictures.js [--root <dir>] [--no-send] — sends one round of pictures of the project's real
// screens: derives the wanted list from the seed's stories, runs the project's own declared
// picture command, checks the folder it filled, writes the round file and hands it to walkthrough.js.
//
// Owner: specs/20261005/06-the-design-stage-sends-pictures.md D2-D9 (AC-20261005-06-1 to
// AC-20261005-06-13). The `pictures` config block is the grounding contract's § Pictures.
//
// Run order: preconditions (arguments, config block, seed, connection, picture count), clean the
// folder's top-level pictures and round files, write wanted.json, run the command with cwd = the
// root and SPEC_PICTURES_DIR / SPEC_PICTURES_WANTED, check the folder, write round.json, print,
// send. Every refusal is one stderr line `pictures: <code> — <sentence> — remedy: <what to do>`.
//
// Deliberately NOT here: any browser, test runner or showcase tool; any comparison of a picture's
// pixel width with its declared width; any ignore-file edit; any network call of its own — the
// only way a picture leaves is walkthrough.js, run as a child process, never required.
//
// Exit codes: 0 done (round written, and sent unless --no-send) · 2 refused: usage, no-command,
// bad-config, no-stories, not-connected, too-many, command-failed, missing-picture, bad-picture,
// extra-picture, send-failed.

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { readConfig, CONFIG_RELPATH } = require('./lib/host-config')
const { parseSeedJourneys } = require('./lib/surfaces')
const { assembleRound, readRound } = require('./lib/mocks-round')

const DEFAULT_WIDTHS = [390, 1280]
const WIDTH_MIN = 240
const WIDTH_MAX = 3840
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const CONTRACT = path.join(__dirname, '..', 'templates', 'walkthrough', 'contract.json')

function writeFd(fd, str) {
  const buf = Buffer.from(str, 'utf8')
  let off = 0
  while (off < buf.length) {
    try { off += fs.writeSync(fd, buf, off, buf.length - off) } catch (e) {
      if (e.code === 'EAGAIN') continue
      throw e
    }
  }
}

class Refusal extends Error {
  constructor(code, sentence, remedy) { super(sentence); this.code = code; this.remedy = remedy }
  line() { return `pictures: ${this.code} — ${this.message} — remedy: ${this.remedy}\n` }
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const listNames = (names) => names.slice(0, 10).join(', ') + (names.length > 10 ? ` (and ${names.length - 10} more)` : '')

function parseArgs(argv) {
  const opts = { root: process.cwd(), send: true }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--no-send') opts.send = false
    else if (a === '--root') {
      if (i + 1 >= argv.length) throw new Refusal('usage', '--root needs a folder', 'run: pictures.js [--root <dir>] [--no-send]')
      opts.root = argv[++i]
    } else throw new Refusal('usage', `unknown argument ${a}`, 'run: pictures.js [--root <dir>] [--no-send]')
  }
  opts.root = path.resolve(opts.root)
  return opts
}

// -> { command, dir, widths } or a Refusal.
function readBlock(cfg) {
  const b = cfg.pictures
  if (!isObj(b)) {
    throw new Refusal('no-command', 'the config has no pictures block, so the project has never declared how its pictures are made',
      'add a pictures block { "command", "dir", "widths"? } to ' + CONFIG_RELPATH + ' (see spec-paths contract, § Pictures)')
  }
  if (typeof b.command !== 'string' || !b.command.trim()) {
    throw new Refusal('bad-config', 'pictures.command must be a non-empty shell string', 'set pictures.command to the command that makes one PNG per wanted entry')
  }
  const dir = b.dir
  const segs = typeof dir === 'string' ? dir.split(/[\\/]/) : []
  if (typeof dir !== 'string' || !dir.trim() || path.isAbsolute(dir) || /^[a-zA-Z]:/.test(dir) ||
      segs.includes('..') || path.normalize(dir) === '.' || path.normalize(dir) === './') {
    throw new Refusal('bad-config', 'pictures.dir must be a repo-relative folder with no .. segment, not . and not absolute',
      'set pictures.dir to a folder such as design/pictures')
  }
  let widths = DEFAULT_WIDTHS
  if (b.widths !== undefined) {
    const w = b.widths
    const ok = Array.isArray(w) && w.length >= 1 && w.length <= 4 && new Set(w).size === w.length &&
      w.every((n) => Number.isInteger(n) && n >= WIDTH_MIN && n <= WIDTH_MAX)
    if (!ok) {
      throw new Refusal('bad-config', `pictures.widths must be 1 to 4 distinct whole numbers, each ${WIDTH_MIN} to ${WIDTH_MAX}`,
        `set pictures.widths to widths such as [390, 1280], each ${WIDTH_MIN} to ${WIDTH_MAX}`)
    }
    widths = w
  }
  return { command: b.command, dir: path.normalize(dir).replace(/[\\/]+$/, '').split(path.sep).join('/'), widths: widths.slice().sort((a, b2) => a - b2) }
}

// Distinct screen-and-state pairs, first beat in seed order fixing the place.
function pairsOf(journeys) {
  const seen = new Set()
  const pairs = []
  for (const j of journeys.values()) {
    for (const b of j.beats) {
      const key = b.screen + '@' + (b.state || '')
      if (seen.has(key)) continue
      seen.add(key)
      pairs.push({ screen: b.screen, state: b.state || null })
    }
  }
  return pairs
}

function readScreenLimit() {
  try {
    const n = JSON.parse(fs.readFileSync(CONTRACT, 'utf8')).limits.screens
    if (Number.isInteger(n) && n > 0) return n
  } catch { /* fall through */ }
  throw new Refusal('too-many', 'the walkthrough contract holds no limits.screens', 'restore the contract (spec-paths walkthrough-contract)')
}

function cleanFolder(abs) {
  fs.mkdirSync(abs, { recursive: true })
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (!e.isFile()) continue
    if (e.name.endsWith('.png') || e.name === 'wanted.json' || e.name === 'round.json') fs.unlinkSync(path.join(abs, e.name))
  }
}

function runCommand(block, root, absDir, wantedFile) {
  const r = spawnSync('bash', ['-c', block.command], {
    cwd: root, stdio: ['ignore', 2, 2],
    env: { ...process.env, SPEC_PICTURES_DIR: absDir, SPEC_PICTURES_WANTED: wantedFile },
  })
  if (r.error || r.status !== 0) {
    const how = r.signal ? `was stopped by signal ${r.signal}` : r.error ? `could not start (${r.error.code || r.error.message})` : `exited ${r.status}`
    throw new Refusal('command-failed', `pictures.command ${how}`, 'fix pictures.command until it exits 0 when run from the repo root, then run pictures.js again')
  }
}

function checkFolder(absDir, wanted) {
  const folderRemedy = `fix pictures.command so it writes exactly the files in ${wanted.dirRel}/wanted.json, then run pictures.js again`
  const missing = []
  const bad = []
  for (const p of wanted.pictures) {
    const f = path.join(absDir, p.file)
    let st = null
    try { st = fs.lstatSync(f) } catch { st = null }
    if (!st || !st.isFile() || st.size === 0) { missing.push(p.file); continue }
    const head = Buffer.alloc(8)
    const fd = fs.openSync(f, 'r')
    try { fs.readSync(fd, head, 0, 8, 0) } finally { fs.closeSync(fd) }
    if (!head.equals(PNG_SIG)) bad.push(p.file)
  }
  const n = wanted.pictures.length
  if (missing.length) throw new Refusal('missing-picture', `${missing.length} of ${n} wanted pictures are absent, not a file, or empty: ${listNames(missing)}`, folderRemedy)
  if (bad.length) throw new Refusal('bad-picture', `${bad.length} of ${n} wanted pictures are not PNG files: ${listNames(bad)}`, folderRemedy)
  const names = new Set(wanted.pictures.map((p) => p.file))
  const extra = fs.readdirSync(absDir, { withFileTypes: true }).filter((e) => !e.isDirectory() && e.name.endsWith('.png') && !names.has(e.name)).map((e) => e.name)
  if (extra.length) throw new Refusal('extra-picture', `${extra.length} of ${n + extra.length} pictures in the folder are not wanted: ${listNames(extra)}`, folderRemedy)
}

// The highest round folder whose round file says uploading, else null.
function uploadingRound(root) {
  let top = null
  let entries = []
  try { entries = fs.readdirSync(path.join(root, 'design', 'rounds'), { withFileTypes: true }) } catch { entries = [] }
  for (const e of entries) {
    if (!e.isDirectory() || !/^\d+$/.test(e.name)) continue
    const r = readRound(root, Number(e.name))
    if (r && r.status === 'uploading') top = Math.max(top === null ? 0 : top, Number(e.name))
  }
  return top
}

function send(root, roundRel, absRound) {
  const script = path.join(__dirname, 'walkthrough.js')
  const r = spawnSync(process.execPath, [script, 'push', '--round-file', absRound, '--root', root, '--json'], { encoding: 'utf8', env: process.env })
  let parsed = null
  try { parsed = JSON.parse(r.stdout) } catch { parsed = null }
  if (r.status === 0 && isObj(parsed) && Number.isInteger(parsed.round)) return parsed.round
  if (r.stderr) writeFd(2, r.stderr.endsWith('\n') ? r.stderr : r.stderr + '\n')
  const n = uploadingRound(root)
  const push = `node ${script} push --round-file ${roundRel}`
  const sentence = r.status === 0 ? 'walkthrough.js push exited 0 without a round number' : `walkthrough.js push exited ${r.status === null ? 'by signal ' + r.signal : r.status}`
  throw new Refusal('send-failed', sentence + '; the pictures and ' + roundRel + ' are kept',
    n === null ? `fix what the line above says, then run ${push}` : `fix what the line above says, then run ${push} --resume ${n}`)
}

function main(argv) {
  const opts = parseArgs(argv)
  const root = opts.root
  const cfg = readConfig(root)
  const block = readBlock(cfg)

  let seedText = null
  try { seedText = fs.readFileSync(path.join(root, 'design', 'mocks', 'seed.md'), 'utf8') } catch { seedText = null }
  const journeys = parseSeedJourneys(seedText)
  if (!journeys.size) {
    throw new Refusal('no-stories', 'design/mocks/seed.md holds no journey, so there is nothing to take pictures of', 'draw the stories first with /spec:mocks, then run pictures.js again')
  }
  if (opts.send && !isObj(cfg.walkthrough)) {
    throw new Refusal('not-connected', 'the config has no walkthrough block, so the round cannot be sent', 'run /spec:connect to connect this project, or run pictures.js with --no-send to only take the pictures')
  }
  const pairs = pairsOf(journeys)
  const limit = readScreenLimit()
  const total = pairs.length * block.widths.length
  if (total > limit) {
    throw new Refusal('too-many', `the stories need ${total} pictures (${pairs.length} screens at ${block.widths.length} widths) and a round holds at most ${limit}`,
      'list fewer widths in pictures.widths, or shorten the stories in design/mocks/seed.md')
  }

  const absDir = path.join(root, block.dir)
  const wantedFile = path.join(absDir, 'wanted.json')
  const roundFile = path.join(absDir, 'round.json')
  const roundRel = block.dir + '/round.json'
  const wanted = { schemaVersion: 1, pictures: [], dirRel: block.dir }
  for (const p of pairs) {
    for (const width of block.widths) {
      wanted.pictures.push({ screen: p.screen, state: p.state, width, file: p.screen + (p.state ? '--' + p.state : '') + '--' + width + '.png' })
    }
  }

  cleanFolder(absDir)
  fs.writeFileSync(wantedFile, JSON.stringify({ schemaVersion: 1, pictures: wanted.pictures }, null, 2) + '\n')
  runCommand(block, root, absDir, wantedFile)
  checkFolder(absDir, wanted)

  const seedRound = assembleRound(journeys, [...journeys.keys()], [])
  const round = {
    kind: 'screenshots',
    journeys: seedRound.journeys,
    screens: wanted.pictures.map((p) => (p.state
      ? { name: p.screen, state: p.state, width: p.width, file: p.file }
      : { name: p.screen, width: p.width, file: p.file })),
  }
  fs.writeFileSync(roundFile, JSON.stringify(round, null, 2) + '\n')
  writeFd(1, `took ${total} pictures — ${pairs.length} screens at ${block.widths.join(' and ')} wide — ${roundRel}\n`)
  if (!opts.send) return

  const n = send(root, roundRel, roundFile)
  const base = String(cfg.walkthrough.baseUrl || '').replace(/\/+$/, '')
  writeFd(1, `sent round ${n} — open at ${base}/p/${cfg.walkthrough.project}\n`)
  writeFd(1, `notes come back with: node ${path.join(__dirname, 'mocks-driver.js')} --root ${root} round pull\n`)
}

try {
  main(process.argv.slice(2))
  process.exit(0)
} catch (e) {
  if (e instanceof Refusal) {
    writeFd(2, e.line())
    process.exit(2)
  }
  writeFd(2, `pictures: script-error — ${String(e && e.message).slice(0, 200)} — remedy: report this with the command you ran\n`)
  process.exit(2)
}
