'use strict'
// lib/state.js — the single reader/writer of every on-disk file in architecture §2.
// Writes are atomic (tmp + rename). Parsers are CRLF-safe. No CLI.

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

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
  lanes: 3,
  seats: {
    builder: { model: 'sonnet', effort: 'high' },
    reviewer: { model: 'opus', effort: 'low' },
    orchestrator: { model: 'opus', effort: 'medium' },
  },
  worktreePerSpec: true,
  mergeStrategy: 'merge-commit',
  walkthrough: { baseUrl: '', project: '', tokenEnv: 'WALKTHROUGH_TOKEN' },
  prototype: { url: 'http://localhost:3000', bootCommand: 'npm run dev', overlay: 'src/main.tsx' },
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

// ---- spec documents -----------------------------------------------------------------------

const FM_RE = /^---\n([\s\S]*?)\n---(?:\n|$)/

function fmScalar(raw) {
  const t = raw.trim()
  const q = /^(["'])(.*)\1/.exec(t)
  if (q) return q[2]
  const v = t.replace(/\s+#.*$/, '')
  if (v === 'true') return true
  if (v === 'false') return false
  if (/^\[.*\]$/.test(v)) return v.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
  return v
}

function parseFrontmatter(text) {
  const m = FM_RE.exec(text)
  const fm = {}
  if (!m) return { frontmatter: fm, body: text }
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (kv) fm[kv[1]] = fmScalar(kv[2])
  }
  return { frontmatter: fm, body: text.slice(m[0].length) }
}

function parseSections(body) {
  const sections = {}
  let cur = null
  for (const line of body.split('\n')) {
    const h = /^## +(.+?)\s*$/.exec(line)
    if (h) { cur = h[1]; sections[cur] = []; continue }
    if (cur) sections[cur].push(line)
  }
  for (const k of Object.keys(sections)) sections[k] = sections[k].join('\n').trim()
  return sections
}

// Find a section by heading prefix ("Decisions" matches "Decisions (locked — …)").
function section(sections, name) {
  const key = Object.keys(sections).find((k) => k === name || k.startsWith(name + ' ') || k.startsWith(name + '('))
  return key ? sections[key] : ''
}

function parseIntent(text) {
  const intent = { asked: '', build: [], notTouch: [], architecture: false }
  let list = null
  for (const line of text.split('\n')) {
    const top = /^- +([^:]+):\s*(.*)$/.exec(line)
    const sub = /^\s+[-*] +(.+)$/.exec(line)
    if (top) {
      const key = top[1].trim().toLowerCase(); const val = top[2].trim()
      list = null
      if (key.startsWith('you asked')) intent.asked = val
      else if (key.startsWith('i will build')) { list = intent.build; if (val) list.push(val) }
      else if (key.startsWith('i will not touch')) { list = intent.notTouch; if (val) list.push(val) }
      else if (key.startsWith('architecture')) {
        const y = /^yes\b\s*(?:[—–-]+\s*)?(.*)$/i.exec(val)
        intent.architecture = y ? (y[1].trim() || true) : false
      }
    } else if (sub && list) list.push(sub[1].trim())
  }
  return intent
}

function parseTableRows(text) {
  const rows = []
  let header = null
  for (const line of text.split('\n')) {
    if (!/^\s*\|/.test(line)) { if (header && rows.length) break; continue }
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue
    if (!header) { header = cells.map((c) => c.toLowerCase()); continue }
    rows.push(cells)
  }
  return { header: header || [], rows }
}

function parseFilePlan(text) {
  const { header, rows } = parseTableRows(text)
  const col = (n) => header.indexOf(n)
  const [p, a, s] = [col('path'), col('action'), col('summary')]
  if (p < 0) return []
  return rows.map((r) => ({
    path: (r[p] || '').replace(/`/g, ''),
    action: a < 0 ? '' : (r[a] || '').toUpperCase(),
    summary: s < 0 ? '' : r[s] || '',
  })).filter((r) => r.path)
}

function parseAcs(text) {
  const acs = []
  let open = false
  for (const line of text.split('\n')) {
    const m = /^- +\*\*(AC-[\w-]+)\*\*:?\s*(.*)$/.exec(line)
    if (m) { acs.push({ id: m[1], text: m[2].trim() }); open = true } else if (open && /^\s+\S/.test(line)) acs[acs.length - 1].text += ' ' + line.trim()
    else open = false
  }
  return acs
}

function readSpec(specPath) {
  const text = fs.readFileSync(specPath, 'utf8').replace(/\r\n/g, '\n')
  const { frontmatter, body } = parseFrontmatter(text)
  const sections = parseSections(body)
  const title = (/^# +(.+)$/m.exec(body) || [])[1] || ''
  return {
    frontmatter, body, title, sections,
    intent: parseIntent(section(sections, 'Intent')),
    filePlan: parseFilePlan(section(sections, 'File Plan')),
    acs: parseAcs(section(sections, 'Acceptance Criteria')),
    markers: (body.match(/\[NEEDS CLARIFICATION:/g) || []).length,
  }
}

// Rewrites only the frontmatter `status:` line (inserted when absent); keeps line endings.
function writeStatus(specPath, status) {
  const text = fs.readFileSync(specPath, 'utf8')
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
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

// ---- git common dir files ----------------------------------------------------------------

function gitCommonDir(root) {
  const r = spawnSync('git', ['-C', root, 'rev-parse', '--git-common-dir'], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`state: ${root} is not inside a git repository — run git init`)
  return path.resolve(root, r.stdout.trim())
}

const queuePath = (root) => path.join(gitCommonDir(root), 'spec-queue.json')
const readQueue = (root) => readJson(queuePath(root), null) || { version: 2, seq: 0, items: [] }
const writeQueue = (root, q) => writeJson(queuePath(root), q)
const fanoutPath = (root) => path.join(gitCommonDir(root), 'spec-fanout.json')
const readFanout = (root) => readJson(fanoutPath(root))
const writeFanout = (root, f) => writeJson(fanoutPath(root), f)

// ---- design / genesis files --------------------------------------------------------------

const PROTO_FILES = ['status', 'pins', 'contract']
const protoDir = (root, stem) => path.join(root, 'design', 'prototypes', stem)

function readProto(root, stem) {
  const out = {}
  for (const f of PROTO_FILES) out[f] = readJson(path.join(protoDir(root, stem), f + '.json'))
  return out
}

// Writes only the keys given ({status?, pins?, contract?}).
function writeProto(root, stem, docs) {
  for (const f of PROTO_FILES) if (docs[f] !== undefined) writeJson(path.join(protoDir(root, stem), f + '.json'), docs[f])
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
  DEFAULTS, readConfig, writeConfig, configPath,
  readSpec, writeStatus, parseFrontmatter,
  runDir, runPath, readRun, writeRun, clearRun,
  gitCommonDir, readQueue, writeQueue, readFanout, writeFanout,
  readProto, writeProto, readMocks, writeMocks, readGenesis, writeGenesis,
}
