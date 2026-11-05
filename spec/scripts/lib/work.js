'use strict'
// lib/work.js — the one reader of specs and roadmap briefs: ids, `Depends on:` headers, brief state.
// Shared by queue.js, fanout.js and the status screen. No CLI.

const fs = require('fs')
const path = require('path')
const st = require('./state')

const ID_RE = /^(?:docs\/roadmap\/)?(?:brief\s+)?(\d+)([A-Za-z]?)(?:-[^/]*?)?(?:\.md)?$/i
const DEP_RE = /^(?:brief\s+)?(\d{1,2})([A-Za-z]?)(?:-[\w-]+)?(?:\s*\(.*\))?$/i
const NONE = /^(?:n\/a|none|-|—|–)?$/i

const pad = (d, l) => String(Number.parseInt(d, 10)).padStart(2, '0') + l.toLowerCase()

// `3` -> `03`, `4B` -> `04b`, `04-auth` -> `04`, `docs/roadmap/04B-boards.md` -> `04b`; a non-id is returned trimmed.
function normBrief(v) {
  const s = String(v == null ? '' : v).trim().replace(/^@/, '').replace(/^\.\//, '')
  const m = ID_RE.exec(s)
  return m ? pad(m[1], m[2]) : s
}

// `04 < 04a < 04b < 05`; a non-id sorts last.
function briefOrd(num) {
  const m = /^(\d+)([a-z]?)$/.exec(String(num))
  return m ? Number(m[1]) * 27 + (m[2] ? m[2].charCodeAt(0) - 96 : 0) : Infinity
}

const strip = (p) => String(p).trim().replace(/^@/, '').replace(/^\.\//, '')

function walkSpecs(dir, out) {
  let ents = []
  try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of ents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (!e.name.endsWith('.run')) walkSpecs(p, out) } else if (e.name.endsWith('.md')) out.push(p)
  }
  return out
}

function readSpecs(root) {
  const specs = []
  for (const file of walkSpecs(path.join(root, 'specs'), [])) {
    let doc
    try { doc = st.readSpec(file) } catch { continue }
    const fm = doc.frontmatter
    if (!fm.status) continue
    const rel = path.relative(root, file).split(path.sep).join('/')
    const b = fm.brief === undefined || NONE.test(String(fm.brief).trim()) ? null : normBrief(fm.brief)
    const dep = fm.depends_on
    specs.push({
      path: rel, status: st.specState(root, rel, String(fm.status)), brief: b,
      depends_on: (Array.isArray(dep) ? dep : dep ? [dep] : []).map(strip),
      superseded_by: fm.superseded_by || null, filePlan: doc.filePlan, filePaths: doc.filePaths,
    })
  }
  return specs
}

// Comma split outside parentheses.
function splitTop(s) {
  const out = []; let depth = 0; let cur = ''
  for (const c of s) {
    if (c === '(') depth++
    else if (c === ')') depth = Math.max(0, depth - 1)
    if (c === ',' && !depth) { out.push(cur); cur = '' } else cur += c
  }
  out.push(cur)
  return out.map((x) => x.trim()).filter(Boolean)
}

function parseDepends(head) {
  const m = /Depends on:\s*(.*)$/i.exec(head)
  const depends_on = []; const dep_rejects = []
  if (!m) return { depends_on, dep_rejects }
  let v = m[1].split('·')[0]
  const next = /\s[A-Z][A-Za-z]+:/.exec(v)
  if (next) v = v.slice(0, next.index)
  for (const item of splitTop(v)) {
    const d = DEP_RE.exec(item)
    if (d) { const n = pad(d[1], d[2]); if (!depends_on.includes(n)) depends_on.push(n) } else if (!NONE.test(item)) dep_rejects.push(item)
  }
  return { depends_on, dep_rejects }
}

function readBriefs(root, specs = readSpecs(root)) {
  const dir = path.join(root, 'docs', 'roadmap')
  let names = []
  try { names = fs.readdirSync(dir) } catch { return [] }
  const briefs = []
  for (const file of names.sort()) {
    const m = /^(\d+[A-Za-z]?)-(.+)\.md$/.exec(file)
    if (!m || file === '00-overview.md') continue
    let text = ''
    try { text = fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n') } catch { continue }
    const num = normBrief(m[1])
    const head = text.split('\n## ')[0].replace(/<!--[\s\S]*?-->/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
    const members = specs.filter((s) => s.brief === num && s.status !== 'superseded')
    const superseded = /^>\s*(\*\*)?Superseded by\b/m.test(text)
    const done = members.every((s) => s.status === 'done')
    briefs.push({
      num, name: m[2], file: 'docs/roadmap/' + file, phase: (/Phase:\s*(P\d+)/.exec(head) || [])[1] || null,
      ...parseDepends(head), superseded, specs: members,
      status: superseded && done ? 'superseded' : !members.length ? 'unplanned' : done ? 'done' : 'in-flight',
    })
  }
  return briefs
}

// Why an `after` gate is unmet: null when met, else the blocker words ("brief 03 (unplanned)").
// `cache` ({briefs}) lets a caller walking many items read the roadmap once.
function gateWhy(root, after, cache = {}) {
  if (!after) return null
  if (after.brief !== undefined) {
    const num = normBrief(after.brief)
    const b = (cache.briefs || (cache.briefs = readBriefs(root))).find((x) => x.num === num)
    return b && b.status === 'done' ? null : `brief ${num} (${b ? b.status : 'missing'})`
  }
  const p = strip(after.spec || '')
  let status = 'missing'
  try { status = st.specState(root, p, st.readSpec(path.join(root, p)).frontmatter.status || 'missing') } catch { /* no file */ }
  return status === 'done' || status === 'superseded' ? null : `${p} (${status})`
}

module.exports = { normBrief, briefOrd, readSpecs, readBriefs, gateWhy }
