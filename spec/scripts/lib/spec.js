'use strict'
// lib/spec.js — the spec grammar: frontmatter, sections, Intent, tables, File Plan, criteria, Assumptions,
// and the document a fix runs on. Text in, objects out: no file is read or written here (lib/state.js
// reads the file, `readSpec`). CRLF-safe. No CLI.

const FM_RE = /^﻿?---\n([\s\S]*?)\n---(?:\n|$)/

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

// A section by heading prefix ("Decisions" matches "Decisions (locked — …)"); '' when absent.
function section(sections, name) {
  const key = Object.keys(sections).find((k) => k === name || k.startsWith(name + ' ') || k.startsWith(name + '('))
  return key ? sections[key] : ''
}

function parseIntent(text) {
  const intent = { asked: '', build: [], notTouch: [], architecture: false, signoff: null, notice: '', lose: '' }
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
      else if (key.startsWith('users will notice')) intent.notice = val
      else if (key.startsWith('you lose')) intent.lose = val
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

// A path cell split into paths: backticks and a trailing `(generated)` dropped, cut on `+` and on
// commas outside braces, then each piece's `{a,b}` expanded.
function splitPlanCell(cell) {
  const c = cell.replace(/`/g, '').replace(/\s*\([^)]*\)\s*$/, '').trim()
  const brace = (p) => /^(.*?)\{([^}]+)\}(.*)$/.exec(p)
  return c.split(/\s*\+\s*|,\s*(?![^{]*\})/).map((x) => x.trim()).filter(Boolean)
    .flatMap((p, _i, _a, b = brace(p)) => (b ? b[2].split(',').map((x) => (b[1] + x.trim() + b[3]).trim()) : [p]))
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

// `filePlan`: the rows of every headed table, as the briefs print them. `filePaths`: every path the
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

// File Plan rows as one {action, path} per path (a cell may hold several; braces are expanded).
const planRows = (doc) => doc.filePlan.flatMap((r) => splitPlanCell(r.path).map((p) => ({ action: r.action, path: p })))

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

// A path a File Plan row names, a glob row included; the Decisions section of a spec's raw text.
const inPlan = (rows, f) => rows.some((r) => r.path === f || (/[*?]/.test(r.path) && globToRe(r.path).test(f)))
const decisionsOf = (text) => section(parseSections(parseFrontmatter(String(text).replace(/\r\n/g, '\n')).body), 'Decisions')

// Spec text: what a build may not change in any spec but its own (run.js reverts it), so plan.js will not lock a plan that needs it.
const isSpecText = (f) => /^specs\/.+\.md$/.test(f)

// The document readSpec returns, from the file's text.
function parse(raw) {
  const text = String(raw).replace(/\r\n/g, '\n')
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

// A fix is the same machine with no spec file: the readSpec shape, titled by the symptom, its Intent the
// reproduce-first recipe, one criterion, no File Plan. A spec it is bound to lends its Decisions and Assumptions.
const RECIPE = [
  '1. Reproduce it, then state in one sentence what made the bug possible, not where it shows. A path that exists for one edge, or two paths doing one job, is deleted or merged, not given a branch.',
  '2. Extend the nearest existing test so it fails for that reason; a new test only when no test covers the path, and only for an outcome a user sees (exit code, file, JSON).',
  '3. Fix the cause, then run the test command until green.',
  '4. Write the cause and the test (`<file> :: <test name>`) in evidence.md. When the cause needs an architecture or behaviour change, make no edit and reply `needs a plan: <why>`.',
]
function fixDoc(symptom, spec) {
  const sections = { Intent: [`- Fix: ${symptom}`, ...RECIPE].join('\n') }
  for (const k of ['Decisions', 'Assumptions']) if (spec && section(spec.sections, k)) sections[k] = section(spec.sections, k)
  return {
    frontmatter: spec ? spec.frontmatter : {}, body: '', title: symptom, sections, intent: parseIntent(''), filePlan: [], filePaths: [],
    acs: [{ id: 'FIX-1', text: 'WHEN the symptom is reproduced THE SYSTEM SHALL have a test that fails for its root cause without the fix and passes with it.' }],
    markers: 0,
  }
}

module.exports = {
  parse, parseFrontmatter, section, parseIntent, splitCells, splitPlanCell, parseFilePlan, planRows, parseAcs, parseAssumptions,
  globToRe, inPlan, decisionRows, decisionsOf, isSpecText, fixDoc,
}
