'use strict'
// lib/state.js — the single reader/writer of every on-disk file in architecture §2 (the queue file: lib/queue.js).
// Writes are atomic (tmp + rename). Parsers are CRLF-safe. No CLI.

const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')
const spec = require('./spec')
const { real } = require('./reap')

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

// A typed path (`@path` as pasted): under root first (a lane's shell sits in the main checkout); else as typed.
const typedPath = (root, arg) => {
  const t = String(arg || '').replace(/^@/, ''); const here = path.resolve(root, t)
  return fs.existsSync(here) || !fs.existsSync(path.resolve(t)) ? here : path.resolve(t)
}

const DEFAULTS = {
  testCommand: null,
  testFileCommand: null,
  setupCommand: null,
  trunk: 'main',
  lanes: 4,
  gateConcurrency: 2,
  seats: {
    builder: { model: 'sonnet', effort: 'high' },
    reviewer: { model: 'opus', effort: 'high' },
    orchestrator: { model: 'opus', effort: 'medium' },
  },
  worktreePerSpec: true,
  mergeStrategy: 'merge-commit',
  walkthrough: { baseUrl: '', project: '', tokenEnv: 'WALKTHROUGH_TOKEN' },
  prototype: {},
  runtime: { url: 'http://localhost:{port}' }, // bootCommand has no default: the plugin assumes no language (ADR-0049)
  release: { deployCommand: '', stagingUrl: '', e2eCommand: '', promoteCommand: '' },
}

// Every key a v8 config may hold (architecture §3): the defaulted ones and the optional ones with no default.
// `/spec:migrate` keeps exactly these, so a key v8 reads is added here or a migration deletes it.
const CONFIG_KEYS = [...Object.keys(DEFAULTS), 'testCountPattern', 'testGlobs', 'doctorProbeMs', 'design', 'forge']

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
// Strict: the keys that moved to `runtime` stop every reader, naming the one migration. No tolerant read.
const MOVED = ['bootCommand', 'url', 'publicUrl']
function readConfig(root) {
  const raw = readJson(configPath(root), {})
  const old = isObj(raw) && isObj(raw.prototype) && MOVED.find((k) => k in raw.prototype)
  if (old) {
    const msg = `.claude/spec.config.json still has prototype.${old} — run /spec:migrate`
    throw Object.assign(new Error(msg), { exit: 2 })
  }
  return merge(DEFAULTS, raw)
}
const writeConfig = (root, cfg) => writeJson(configPath(root), cfg)

const pluginVersion = (pluginRoot) => {
  return (readJson(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), {}) || {}).version || null
}

// The version Claude Code has installed for this session of the plugin whose cache folder holds pluginRoot: among the
// registry's entries whose installPath sits in that folder, the project or local entry whose projectPath is root (or
// holds it, as for a worktree inside the project), else the user entry. Another project's pin is not this session's
// install. null for a dev checkout or a registry that cannot be read; a registry of another shape is never a refusal.
function installedVersion(pluginRoot, root) {
  const home = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
  const reg = readJson(path.join(home, 'plugins', 'installed_plugins.json'))
  const cache = real(path.dirname(path.resolve(pluginRoot)))
  const mine = Object.values(isObj(reg) && isObj(reg.plugins) ? reg.plugins : {}).flat()
    .filter((e) => isObj(e) && typeof e.installPath === 'string' && typeof e.version === 'string' && e.version &&
      real(path.dirname(path.resolve(e.installPath))) === cache)
  const here = root ? real(root) : null
  const holds = (e) => {
    if (!here) return false
    const rel = path.relative(real(e.projectPath), here)
    return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel))
  }
  const pinned = mine.filter((e) => typeof e.projectPath === 'string' && e.projectPath && holds(e))
    .sort((a, b) => b.projectPath.length - a.projectPath.length)[0]
  const user = mine.find((e) => !e.projectPath && (e.scope === undefined || e.scope === 'user'))
  return (pinned || user || {}).version || null
}

// The line a step prints when this session runs another plugin version than the one installed for root, else null.
function staleNote(pluginRoot, root) {
  const running = pluginVersion(pluginRoot)
  const installed = installedVersion(pluginRoot, root)
  if (!running || !installed || running === installed) return null
  return `⚠️ spec ${running} is running but ${installed} is installed — ` +
    'restart Claude Code (/clear does not reload plugins)'
}

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

// What the screen calls a spec: a `hardened` one (the only status a run leaves in the root) is
// `implementing` while a live sidecar says it is being built; every other status is the frontmatter's.
const specState = (root, rel, status) => (status === 'hardened' && liveRun(root, rel) ? 'implementing' : status)

// Does a STOPPED run's wait end? `ref` is the branch the spec lands on. An `after` run waits for its spec to be `done`
// there; an `amend` run for it to be `hardened` again with a blob unlike the one the build began from: the lock commit,
// not the status alone.
function resumes(cwd, run, ref) {
  const git = (...args) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  const shown = git('show', `${ref}:${run.on}`)
  if (shown.status !== 0) return false
  const status = spec.parseFrontmatter(shown.stdout.replace(/\r\n/g, '\n')).frontmatter.status
  if (run.why === 'after') return status === 'done'
  if (run.why !== 'amend' || status !== 'hardened') return false
  const now = git('rev-parse', `${ref}:${run.on}`); const was = git('rev-parse', `${run.at || run.base}:${run.on}`)
  return now.status === 0 && (was.status !== 0 || now.stdout.trim() !== was.stdout.trim())
}

function gitCommonDir(root) {
  const r = spawnSync('git', ['-C', root, 'rev-parse', '--git-common-dir'], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`state: ${root} is not inside a git repository — run git init`)
  // One dir, one name: from the main checkout git answers relative to the root as given, from a
  // worktree with its real path, so a root reached through a symlink (macOS /tmp, Windows 8.3) differs.
  return fs.realpathSync.native(path.resolve(root, r.stdout.trim()))
}

// A fix with no spec keeps its run state in a `.run` dir (covered by the `specs/**/*.run/` ignore line) in the checkout
// it runs in. slugOf keys it: the first six words of the symptom plus a hash of all of it, whitespace runs as one
// blank.
const slugOf = (symptom) => {
  const s = String(symptom).trim().replace(/\s+/g, ' ')
  const words = s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).slice(0, 6).join('-').slice(0, 40).replace(/-+$/, '')
  return `${words || 'fix'}-${crypto.createHash('sha1').update(s).digest('hex').slice(0, 6)}`
}
const fixRunDir = (root, slug) => path.join(root, 'specs', 'fix', slug + '.run')
const fixRunPath = (root, slug) => path.join(fixRunDir(root, slug), 'state.json')

// The green staging run /spec:release promotes from: {sha, note}. release.js is the only caller; null clears it.
const releasePath = (root) => path.join(gitCommonDir(root), 'spec-release.json')
const readRelease = (root) => readJson(releasePath(root))
const writeRelease = (root, rec) => (rec == null ? fs.rmSync(releasePath(root), { force: true }) : writeJson(releasePath(root), rec))

// The log of a host's app (lib/app.js), kept in the git common dir beside the other driver files.
const appLog = (root, name) => path.join(gitCommonDir(root), 'spec-app', name + '.log')

const fanoutPath = (root) => path.join(gitCommonDir(root), 'spec-fanout.json')
const readFanout = (root) => readJson(fanoutPath(root))
const writeFanout = (root, f) => writeJson(fanoutPath(root), f)

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

// Every .md under specs/, in path order: run sidecars are not specs.
function specFiles(root, dir = path.join(root, 'specs')) {
  let ents = []
  try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return [] }
  return ents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? (e.name.endsWith('.run') ? [] : specFiles(root, p)) : e.name.endsWith('.md') ? [p] : []
  })
}

// Every spec whose frontmatter `prototype:` is the stem: [{rel, status}], in path order.
function specsCiting(root, stem) {
  const out = []
  for (const p of specFiles(root)) {
    const text = readText(p, '').replace(/\r\n/g, '\n')
    if (!/^prototype:/m.test(text)) continue
    const fm = spec.parseFrontmatter(text).frontmatter
    const rel = path.relative(root, p).split(path.sep).join('/')
    if (fm.prototype === stem) out.push({ rel, status: String(fm.status || '') })
  }
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
  writeText, writeJson, readJson, readText, typedPath,
  DEFAULTS, CONFIG_KEYS, readConfig, writeConfig, configPath, appLog, pluginVersion, staleNote,
  readSpec, writeStatus,
  runDir, readRun, writeRun, clearRun, liveRun, specState, resumes,
  gitCommonDir, slugOf, fixRunDir, fixRunPath, readFanout, writeFanout, readRelease, writeRelease,
  readProto, writeProto, protoV7, protoDir, specFiles, specsCiting, readMocks, writeMocks, readGenesis, writeGenesis,
}
