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
  lanes: 4,
  gateConcurrency: 2,
  laneFiles: [],
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
  askPaths: [], // root-relative globs: an out-of-plan edit under one stops the run with a question
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

const FM_RE = /^\uFEFF?---\n([\s\S]*?)\n---(?:\n|$)/

function fmScalar(raw, key) {
  const t = raw.trim()
  const q = /^(["'])(.*)\1/.exec(t)
  if (q) return q[2]
  const v = t.replace(/\s+#.*$/, '')
  if (v === 'true') return true
  if (v === 'false') return false
  const list = (x) => x.split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
  if (/^\[.*\]$/.test(v)) return list(v.slice(1, -1))
  // An unbracketed `depends_on: a.md, b.md` splits like the bracketed form; one value is a one-element list.
  if (key === 'depends_on' && v) return list(v)
  return v
}

function parseFrontmatter(text) {
  const m = FM_RE.exec(text)
  const fm = {}
  if (!m) return { frontmatter: fm, body: text }
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (kv) fm[kv[1]] = fmScalar(kv[2], kv[1])
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
  const intent = { asked: '', build: [], notTouch: [], architecture: false, signoff: null }
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
      else if (key.startsWith('client sign-off')) intent.signoff = /^none\b/i.test(val) || !val ? null : val
      else if (key.startsWith('architecture')) {
        const y = /^yes\b\s*(?:[—–-]+\s*)?(.*)$/i.exec(val)
        intent.architecture = y ? (y[1].trim() || true) : false
      }
    } else if (sub && list) list.push(sub[1].trim())
  }
  return intent
}

// A table row as trimmed cells. One leading and one trailing `|` are stripped, then the line splits on `|`
// that is neither inside a backtick span (a run of backticks opens a span that a run of the same length
// closes; an unclosed span runs to the end of the line) nor escaped as `\|`, which reads `|`.
function splitCells(line) {
  const t = String(line).trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '')
  const cells = []
  let cur = ''
  let span = 0
  for (let i = 0; i < t.length;) {
    const c = t[i]
    if (c === '\\' && t[i + 1] === '|') { cur += '|'; i += 2; continue }
    if (c === '`') {
      let n = 0
      while (t[i + n] === '`') n++
      span = span === 0 ? n : span === n ? 0 : span
      cur += t.slice(i, i + n); i += n
      continue
    }
    if (c === '|' && !span) { cells.push(cur.trim()); cur = ''; i++; continue }
    cur += c; i++
  }
  cells.push(cur.trim())
  return cells
}

// A path cell split into paths: backticks and a trailing `(generated)` dropped, `{a,b}` expanded,
// then cut on `+` and commas.
function splitPlanCell(cell) {
  const c = cell.replace(/`/g, '').replace(/\s*\([^)]*\)\s*$/, '').trim()
  const brace = /^(.*)\{([^}]+)\}(.*)$/.exec(c)
  if (brace) return brace[2].split(',').map((x) => (brace[1] + x.trim() + brace[3]).trim())
  return c.split(/\s*\+\s*|,\s*/).map((x) => x.trim()).filter(Boolean)
}

// Every File Plan table (a maximal run of `|` lines): its first row binds the columns when a cell reads
// `file` or `path`; otherwise column 1 is the path and that first row is data.
function filePlanTables(text) {
  const tables = []
  let cur = null
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t.startsWith('|')) { cur = null; continue }
    const cells = splitCells(t)
    if (cells.every((c) => !c || /^:?-{2,}:?$/.test(c))) continue
    if (!cur) {
      cur = { header: false, path: 0, action: -1, summary: -1, rows: [] }
      tables.push(cur)
      const p = cells.findIndex((c) => /^(file|path)s?$/i.test(c.replace(/`/g, '')))
      if (p >= 0) {
        Object.assign(cur, { header: true, path: p, action: cells.findIndex((c) => /^actions?$/i.test(c)), summary: cells.findIndex((c) => /^summary$/i.test(c)) })
        continue
      }
    }
    cur.rows.push(cells)
  }
  return tables
}

// `filePlan`: the rows of every headed table, as run.js prints them. `filePaths`: every path the
// tables name, split, deduplicated, in first-seen order.
const FILE_ACTION = /^(create|modify|delete|rename|move)\b/i
function parseFilePlan(text) {
  const filePlan = []; const filePaths = []
  for (const t of filePlanTables(text)) {
    for (const r of t.rows) {
      const action = t.action < 0 ? '' : r[t.action] || ''
      if (t.header) filePlan.push({ path: (r[t.path] || '').replace(/`/g, ''), action: action.toUpperCase(), summary: t.summary < 0 ? '' : r[t.summary] || '' })
      for (const p of splitPlanCell(r[t.path] || '')) {
        const isPath = p.includes('/') || /\.[A-Za-z0-9]+$/.test(p) || (FILE_ACTION.test(action) && /^[A-Za-z0-9_-]+$/.test(p))
        if (isPath && !filePaths.includes(p)) filePaths.push(p)
      }
    }
  }
  return { filePlan: filePlan.filter((r) => r.path), filePaths }
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

// `- A<n>: <text> — if false: <arm>`; arm is `ask`, `ask: <option> | <option>…`, or a written fallback.
function parseAssumptions(text) {
  const out = []
  for (const line of String(text || '').split('\n')) {
    const m = /^- +(A\d+):\s*(.*?)\s+[—–-]+\s+\**if false:?\**\s*(.*?)\s*$/i.exec(line.trim())
    if (!m) continue
    const arm = m[3]
    const ask = /^ask\b/i.test(arm)
    const options = ask ? arm.replace(/^ask\s*:?\s*/i, '').split('|').map((o) => o.trim()).filter(Boolean) : []
    out.push({ id: m[1], text: m[2], line: line.trim(), arm: { ask, text: arm, options } })
  }
  return out
}

// A root-relative glob as a RegExp: `**` crosses directories (`**/` may be empty), `*` and `?` stay in one.
function globToRe(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2 } else { re += '.*'; i += 1 }
    } else if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp('^' + re + '$')
}

// A Decisions table as rows of cells; the header and template leftovers (a cell exactly <placeholder>) are dropped.
function decisionRows(text) {
  return String(text || '').split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|') && !/^\|[\s|:-]*$/.test(l))
    .map(splitCells)
    .filter((c) => c.length >= 2 && !/^id$/i.test(c[0]) && !c.some((x) => /^<[^>]+>$/.test(x)))
}

function readSpec(specPath) {
  const text = fs.readFileSync(specPath, 'utf8').replace(/\r\n/g, '\n')
  const { frontmatter, body } = parseFrontmatter(text)
  const sections = parseSections(body)
  const title = (/^# +(.+)$/m.exec(body) || [])[1] || ''
  return {
    frontmatter, body, title, sections,
    intent: parseIntent(section(sections, 'Intent')),
    ...parseFilePlan(section(sections, 'File Plan')),
    acs: parseAcs(section(sections, 'Acceptance Criteria')),
    markers: (body.match(/\[NEEDS CLARIFICATION:/g) || []).length,
  }
}

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
// leaves the root's frontmatter at `hardened`). Live = parses, not ended, not at DONE/PARKED/AMENDED.
function liveRun(root, rel) {
  const stem = path.basename(rel).replace(/\.md$/, '')
  const wt = path.join(root, '.claude', 'worktrees', 'spec-' + stem)
  for (const base of [root, wt]) {
    const r = readRun(path.join(base, rel))
    if (r && typeof r === 'object' && r.ended !== true && !['DONE', 'PARKED', 'AMENDED'].includes(r.step)) return r
  }
  return null
}

// What the screen calls a spec: `implementing` while a live sidecar says it is being built.
const specState = (root, rel, status) => (status !== 'done' && status !== 'superseded' && liveRun(root, rel) ? 'implementing' : status)

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
  readSpec, writeStatus, parseFrontmatter, parseAssumptions, globToRe, decisionRows, splitCells,
  runDir, runPath, readRun, writeRun, clearRun, liveRun, specState,
  gitCommonDir, readQueue, writeQueue, readFanout, writeFanout,
  readProto, writeProto, readMocks, writeMocks, readGenesis, writeGenesis,
}
