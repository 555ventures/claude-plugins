'use strict'
// lib/state.js — the single reader/writer of every on-disk file in architecture §2 (the queue file: lib/queue.js).
// Writes are atomic (tmp + rename). Parsers are CRLF-safe. No CLI.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')
const spec = require('./spec')

// ---- atomic io ----------------------------------------------------------------------------

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.' + process.pid + '.' + Date.now() + '.tmp'
  fs.writeFileSync(tmp, text)
  fs.renameSync(tmp, file)
  return file
}

const writeJson = (file, obj) => writeText(file, JSON.stringify(obj, null, 2) + '\n')

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}

const readText = (file, fallback = null) => { try { return fs.readFileSync(file, 'utf8') } catch { return fallback } }

// ---- config (§3) --------------------------------------------------------------------------

const DEFAULTS = {
  testCommand: null,
  testFileCommand: null,
  setupCommand: null,
  trunk: 'main',
  lanes: 4,
  gateConcurrency: 2,
  seats: {
    builder: { model: 'sonnet', effort: 'high' },
    reviewer: { model: 'opus', effort: 'low' },
    orchestrator: { model: 'opus', effort: 'medium' },
  },
  worktreePerSpec: true,
  mergeStrategy: 'merge-commit',
  walkthrough: { baseUrl: '', project: '', tokenEnv: 'WALKTHROUGH_TOKEN' },
  prototype: { url: 'http://localhost:{port}' }, // bootCommand has no default: the plugin assumes no language
  release: { deployCommand: '', stagingUrl: '', e2eCommand: '', promoteCommand: '' },
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)

// Defaults applied key by key, objects merged one level deep (seats merged per seat).
function merge(def, over) {
  const out = { ...def }
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = isObj(def[k]) && isObj(v) ? merge(def[k], v) : v
  }
  return out
}

const configPath = (root) => path.join(root, '.claude', 'spec.config.json')
const readConfig = (root) => merge(DEFAULTS, readJson(configPath(root), {}))
const writeConfig = (root, cfg) => writeJson(configPath(root), cfg)
// The host's own command that starts its app, or null when unset or blank — never defaulted.
const bootCommandOf = (cfg) => { const c = cfg && cfg.prototype && cfg.prototype.bootCommand; return typeof c === 'string' && c.trim() ? c.trim() : null }

// ---- spec documents -----------------------------------------------------------------------

// The file is read here; its grammar is lib/spec.js.
const readSpec = (specPath) => spec.parse(fs.readFileSync(specPath, 'utf8'))

// Rewrites only the frontmatter `status:` line (inserted when absent); keeps line endings.
function writeStatus(specPath, status) {
  const text = fs.readFileSync(specPath, 'utf8')
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) throw new Error(`state: ${specPath} has no frontmatter`)
  const block = m[1]
  const next = /^status:.*$/m.test(block)
    ? block.replace(/^status:[^\r\n]*/m, 'status: ' + status)
    : block + eol + 'status: ' + status
  writeText(specPath, '---' + eol + next + text.slice(3 + eol.length + block.length))
}

// ---- run sidecar (§4) ---------------------------------------------------------------------

const runDir = (specPath) => specPath.replace(/\.md$/, '') + '.run'
const runPath = (specPath) => path.join(runDir(specPath), 'state.json')
const readRun = (specPath) => readJson(runPath(specPath))
const writeRun = (specPath, state) => writeJson(runPath(specPath), state)
const clearRun = (specPath) => fs.rmSync(runDir(specPath), { recursive: true, force: true })

// The sidecar of a spec being built: in the root, or in the spec's lane worktree (v8 runs there and
// leaves the root's frontmatter at `hardened`). Live = parses, not ended, not at DONE or STOPPED.
function liveRun(root, rel) {
  const stem = path.basename(rel).replace(/\.md$/, '')
  const wt = path.join(root, '.claude', 'worktrees', 'spec-' + stem)
  for (const base of [root, wt]) {
    const r = readRun(path.join(base, rel))
    if (r && typeof r === 'object' && r.ended !== true && !['DONE', 'STOPPED'].includes(r.step)) return r
  }
  return null
}

// What the screen calls a spec: `implementing` while a live sidecar says it is being built.
const specState = (root, rel, status) => (status !== 'done' && status !== 'superseded' && liveRun(root, rel) ? 'implementing' : status)

// ---- git common dir files ----------------------------------------------------------------

function gitDirOf(root, which) {
  const r = spawnSync('git', ['-C', root, 'rev-parse', which], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`state: ${root} is not inside a git repository — run git init`)
  // One dir, one name: from the main checkout git answers relative to the root as given, from a
  // worktree with its real path, so a root reached through a symlink (macOS /tmp, Windows 8.3) differs.
  return fs.realpathSync.native(path.resolve(root, r.stdout.trim()))
}
const gitCommonDir = (root) => gitDirOf(root, '--git-common-dir')

// A fix with no spec keeps its run state in the checkout's own git dir: never tracked, and a lane's goes
// with its worktree. slugOf keys it: the first six words of the symptom plus a hash of all of it.
const slugOf = (symptom) => {
  const s = String(symptom).trim()
  const words = s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).slice(0, 6).join('-').slice(0, 40).replace(/-+$/, '')
  return `${words || 'fix'}-${crypto.createHash('sha1').update(s).digest('hex').slice(0, 6)}`
}
const fixRunDir = (root, slug) => path.join(gitDirOf(root, '--git-dir'), 'spec-fix', slug + '.run')
const fixRunPath = (root, slug) => path.join(fixRunDir(root, slug), 'state.json')

// The green staging run /spec:release promotes from: {sha, note}. release.js is the only caller; null clears it.
const releasePath = (root) => path.join(gitCommonDir(root), 'spec-release.json')
const readRelease = (root) => readJson(releasePath(root))
const writeRelease = (root, rec) => (rec == null ? fs.rmSync(releasePath(root), { force: true }) : writeJson(releasePath(root), rec))

const fanoutPath = (root) => path.join(gitCommonDir(root), 'spec-fanout.json')
const readFanout = (root) => readJson(fanoutPath(root))
const writeFanout = (root, f) => writeJson(fanoutPath(root), f)

// ---- design / genesis files --------------------------------------------------------------

const PROTO_FILES = ['status', 'pins', 'contract']
const protoDir = (root, stem) => path.join(root, 'design', 'prototypes', stem)

// The v7 files of a stem: status.json and contract.json carrying schemaVersion, pins.json not an array.
function protoV7(root, stem) {
  const d = protoDir(root, stem)
  const status = readJson(path.join(d, 'status.json'))
  const pins = readJson(path.join(d, 'pins.json'))
  const contract = readJson(path.join(d, 'contract.json'))
  const has = (o) => o && typeof o === 'object' && !Array.isArray(o) && 'schemaVersion' in o
  return [has(status) ? 'status' : null, pins != null && !Array.isArray(pins) ? 'pins' : null, has(contract) ? 'contract' : null].filter(Boolean)
}

// Strict: a v7 file stops every reader, naming the one migration. No tolerant read.
function readProto(root, stem) {
  const v7 = protoV7(root, stem)
  if (v7.length) {
    const e = new Error(`design/prototypes/${stem}/${v7[0]}.json is a v7 file — run /spec:migrate`)
    e.exit = 2
    throw e
  }
  const out = {}
  for (const f of PROTO_FILES) out[f] = readJson(path.join(protoDir(root, stem), f + '.json'))
  return out
}

// Writes only the keys given ({status?, pins?, contract?}).
function writeProto(root, stem, docs) {
  for (const f of PROTO_FILES) if (docs[f] !== undefined) writeJson(path.join(protoDir(root, stem), f + '.json'), docs[f])
}

// Every spec whose frontmatter `prototype:` is the stem: [{rel, status}], in path order. Run sidecars are not specs.
function specsCiting(root, stem) {
  const out = []
  const walk = (dir) => {
    let ents = []
    try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of ents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { if (!e.name.endsWith('.run')) walk(p) } else if (e.name.endsWith('.md')) {
        const text = readText(p, '').replace(/\r\n/g, '\n')
        if (!/^prototype:/m.test(text)) continue
        const fm = spec.parseFrontmatter(text).frontmatter
        if (fm.prototype === stem) out.push({ rel: path.relative(root, p).split(path.sep).join('/'), status: String(fm.status || '') })
      }
    }
  }
  walk(path.join(root, 'specs'))
  return out
}

const mocksDir = (root) => path.join(root, 'design', 'mocks')
const readMocks = (root) => ({
  status: readJson(path.join(mocksDir(root), 'status.json')),
  seed: readText(path.join(mocksDir(root), 'seed.md')),
})
function writeMocks(root, { status, seed } = {}) {
  if (status !== undefined) writeJson(path.join(mocksDir(root), 'status.json'), status)
  if (seed !== undefined) writeText(path.join(mocksDir(root), 'seed.md'), seed)
}

const genesisPath = (root) => path.join(root, '.claude', 'genesis', 'status.json')
const readGenesis = (root) => readJson(genesisPath(root))
const writeGenesis = (root, s) => writeJson(genesisPath(root), s)

module.exports = {
  writeText, writeJson, readJson, readText,
  DEFAULTS, readConfig, writeConfig, configPath, bootCommandOf,
  readSpec, writeStatus,
  runDir, runPath, readRun, writeRun, clearRun, liveRun, specState,
  gitCommonDir, slugOf, fixRunDir, fixRunPath, readFanout, writeFanout, readRelease, writeRelease,
  readProto, writeProto, protoV7, protoDir, specsCiting, readMocks, writeMocks, readGenesis, writeGenesis,
}
