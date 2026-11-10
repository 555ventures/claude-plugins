'use strict'
// lib/criteria.js — the criteria a project's tests cite (ADR-0048): which files are tests, which AC-IDs they name at a
// commit or on disk, and GATE's check that a build keeps every cited criterion. Names no tool, assumes no language: a
// test file is a name or a glob, a citation is the AC-ID in its text. No CLI.
//   isTest(rel, cfg) the one rule red-check and this check share · cited(root, ref?, cfg?) Map AC-ID → [test files]
//   (ref null = the working tree) · testFiles(root, ref?, cfg?) [{file, ids}] · retiredLines(doc) · retired(doc) Map
//   AC-ID → {by, review} · retiredRefusal(doc) why plan.js lock refuses `## Retired criteria`, or null ·
//   check({wt, base, cfg, doc}) → {red: [lines], warn: [lines]}

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const S = require('./spec')
const git = require('./git')
const { readConfig } = require('./state')

// A test file is named by its basename (*.test.*, *.spec.*, *_test.*, *_spec.*, test_*) or matches a `testGlobs` glob;
// either way a note (*.md) or a run directory's file (.run/) never is.
const TEST_NAME = /^(?:.+\.(?:test|spec)\..+|.+_(?:test|spec)\..+|test_.+)$/
const ID = 'AC-\\d{8}-\\d{2}[a-z]?-\\d+(?!\\d)'
const ONE = new RegExp(`^${ID}$`)
const globs = (cfg) => [].concat((cfg && cfg.testGlobs) || []).filter((g) => typeof g === 'string' && g)
const isTest = (rel, cfg) => !/\.md$/.test(rel) && !/\.run\//.test(rel)
  && (TEST_NAME.test(path.posix.basename(rel)) || globs(cfg).some((g) => S.globToRe(g).test(rel)))
const idsIn = (text) => [...new Set(String(text).match(new RegExp(ID, 'g')) || [])]
const isFile = (p) => fs.statSync(p, { throwIfNoEntry: false })?.isFile()

// [file, text] of every test file: at `ref` (one ls-tree, one cat-file --batch), or on disk for the working tree.
function read(root, ref, cfg) {
  if (!ref) {
    return git.lsFiles(root, ['-c', '-o', '--exclude-standard'])
      .filter((f) => isTest(f, cfg) && isFile(path.join(root, f)))
      .map((f) => [f, fs.readFileSync(path.join(root, f), 'utf8')])
  }
  const entries = git.sh(['ls-tree', '-r', '-z', ref], root).split('\0').filter(Boolean)
    .map((e) => /^\S+ (\S+) (\S+)\t(.*)$/s.exec(e)).filter((m) => m && m[1] === 'blob' && isTest(m[3], cfg))
  if (!entries.length) return []
  const input = entries.map((m) => m[2]).join('\n') + '\n'
  const r = spawnSync('git', ['-C', root, 'cat-file', '--batch'], { input, maxBuffer: 1 << 30 })
  if (r.status !== 0) throw new Error(`git cat-file --batch failed in ${root}: ${String(r.stderr).trim()}`)
  const out = r.stdout; const files = []; let at = 0
  for (const m of entries) { // each object: "<sha> blob <size>\n<bytes>\n"
    const nl = out.indexOf(10, at); const size = Number(out.subarray(at, nl).toString().split(' ')[2])
    files.push([m[3], out.subarray(nl + 1, nl + 1 + size).toString('utf8')]); at = nl + 1 + size + 1
  }
  return files
}

const testFiles = (root, ref = null, cfg = readConfig(root)) =>
  read(root, ref, cfg).map(([file, text]) => ({ file, ids: idsIn(text) }))

function cited(root, ref = null, cfg = readConfig(root)) {
  const map = new Map()
  for (const { file, ids } of testFiles(root, ref, cfg)) {
    for (const id of ids) map.set(id, [...(map.get(id) || []), file])
  }
  return map
}

// The AC-IDs a spec on disk defines: a `- **AC-…**` bullet, or an `acs:` frontmatter line (a done spec's stub).
function defined(root) {
  const ids = new Set(); const dir = path.join(root, 'specs')
  const ls = (d) => { try { return fs.readdirSync(d) } catch { return [] } }
  const bullet = new RegExp(`^- +\\*\\*(${ID})\\*\\*`, 'gm')
  for (const day of ls(dir).filter((n) => /^\d{8}$/.test(n))) {
    for (const f of ls(path.join(dir, day)).filter((n) => /^\d+-.*\.md$/.test(n))) {
      let text = ''
      try { text = fs.readFileSync(path.join(dir, day, f), 'utf8') } catch { continue }
      for (const m of text.matchAll(bullet)) ids.add(m[1])
      const front = (/^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(text) || [])[1] || ''
      for (const l of front.split(/\r?\n/).filter((x) => /^acs:/.test(x))) for (const id of idsIn(l)) ids.add(id)
    }
  }
  return ids
}

// `## Retired criteria`: `- AC-… — retired by Dn: …` or `- AC-… — checked at review: …`, one per line.
const RETIRED = new RegExp(`^- +(${ID})\\s+[—–-]+\\s+(?:retired by (D\\d+[a-z]?)|(checked at review))\\s*:`)
const retiredLines = (doc) => S.section(doc.sections || {}, 'Retired criteria').split('\n')
  .map((l) => l.trim()).filter(Boolean)
function retired(doc) {
  const map = new Map()
  for (const m of retiredLines(doc).map((l) => RETIRED.exec(l)).filter(Boolean)) {
    map.set(m[1], { by: m[2] || null, review: !!m[3] })
  }
  return map
}

function retiredRefusal(doc) {
  const rows = new Set(S.decisionRows(S.section(doc.sections, 'Decisions')).map((c) => c[0]))
  const own = new Set(doc.acs.map((a) => a.id))
  for (const line of retiredLines(doc)) {
    const m = RETIRED.exec(line)
    if (!idsIn(line).length) return `"${line}" names no AC-ID`
    if (!m) return `"${line}" is neither "- AC-… — retired by Dn: …" nor "- AC-… — checked at review: …"`
    if (m[2] && !rows.has(m[2])) return `"${line}" — retired by ${m[2]}, but the Decisions table has no ${m[2]} row`
    if (m[3] && !own.has(m[1])) return `"${line}" — checked at review names ${m[1]}, which is not an AC of this spec`
  }
  return null
}

const isFix = (doc) => doc.acs.length === 1 && doc.acs[0].id === 'FIX-1'
const RESTORE = 'Exits: restore a test that names each ID (in its title), or,'
const exits = (fix) => (fix
  ? `${RESTORE} when the fix must drop one, mark \`needs-plan --why "<why>"\`: dropping a criterion needs a spec`
    + ' that retires it.'
  : `${RESTORE} when a Decision of this spec retires one and the spec does not list it under ## Retired criteria,`
    + ' mark `unmet --decision <Dn> --why "<ID> is retired but not listed"`: the Decision is unmet as written and the'
    + ' user amends the spec.')

// GATE, after a green testCommand: red when a defined criterion cited at `base` is cited by nothing now, or (where
// the base cites any AC) when a criterion of `doc` has no citing test; a warning where the base cites none.
function check({ wt, base, cfg, doc }) {
  const now = cited(wt, null, cfg); const was = cited(wt, base, cfg); const listed = retired(doc)
  const red = []; const warn = []
  const lost = [...was.keys()].filter((id) => !now.has(id) && !listed.has(id)).sort()
  const def = lost.length ? defined(wt) : new Set()
  for (const id of lost.filter((x) => def.has(x))) {
    red.push(`criteria: ${id} was cited at the base by ${was.get(id).join(', ')} and is cited by no test file now`)
  }
  const own = doc.acs.map((a) => a.id).filter((id) => ONE.test(id) && !now.has(id) && !listed.has(id))
  const uncited = (id) => `criteria: ${id} is a criterion of this spec; no test file cites it`
  if (own.length && was.size) red.push(...own.map(uncited))
  else if (own.length) {
    warn.push(`criteria: no test file cites ${own.join(', ')} — this project's tests cite no criterion,`
      + ' so this is a note, never a refusal')
  }
  if (red.length) red.push(exits(isFix(doc)))
  return { red, warn }
}

module.exports = { isFix, isTest, cited, testFiles, retiredLines, retired, retiredRefusal, check }
