'use strict'
// lib/stub.js — the one owner of a finished spec's shape on disk (ADR-0046): a done or superseded spec is its
// frontmatter plus `text: <sha>` and `acs: [ids]`, its title and its `## Goal`; the rest is `git show <sha>:<path>`.
// No CLI.
//
//   isStub(frontmatter)       a `text:` of 7–64 hex
//   stubOf(text, sha)         the stub of a spec's text (a stub's own stub moves only `text:`)
//   fullText(cwd, rel, sha)   the text at sha; a sha this clone lacks is a refusal, exit 2
//   readFull(cwd, rel)        the readSpec shape of the full text, stub or not
//   sweep(root, {dry})        every tracked, unedited finished spec not yet a stub, in one commit
//                             → {paths, retired (its `[retired:` tags), sha (null when nothing is committed)}

const fs = require('fs')
const path = require('path')
const S = require('./spec')
const st = require('./state')
const git = require('./git')

const FM_RE = /^﻿?---\n([\s\S]*?)\n---(?:\n|$)/
const FINISHED = ['done', 'superseded']
const CITE = /\(pin (p\d+)\)/g
const isStub = (fm) => typeof (fm && fm.text) === 'string' && /^[0-9a-f]{7,64}$/.test(fm.text)
const posix = (cwd, rel) => path.relative(cwd, path.resolve(cwd, rel)).split(path.sep).join('/')

// `key: value` set in the frontmatter lines: replaced where it stands, else appended.
const setKey = (lines, key, value) => (lines.some((l) => l.startsWith(key + ':'))
  ? lines.map((l) => (l.startsWith(key + ':') ? `${key}: ${value}` : l)) : [...lines, `${key}: ${value}`])

function stubOf(raw, sha) {
  const text = String(raw).replace(/\r\n/g, '\n')
  const m = FM_RE.exec(text)
  const fm = m ? m[1].split('\n') : []
  const body = m ? text.slice(m[0].length) : text
  const acs = S.parse(text).acs
  const listed = fm.find((l) => l.startsWith('acs:'))
  const ids = acs.map((a) => [a.id, ...new Set([...a.text.matchAll(CITE)].map((c) => `(pin ${c[1]})`))].join(' '))
  const lines = body.split('\n')
  const title = lines.find((l) => /^# +\S/.test(l))
  const at = lines.findIndex((l) => /^## +Goal\s*$/.test(l))
  const next = lines.findIndex((l, i) => i > at && /^## /.test(l))
  const goal = at < 0 ? [] : lines.slice(at, next < 0 ? lines.length : next)
  while (goal.length && !goal[goal.length - 1].trim()) goal.pop()
  // A stub carries no AC bullets: its `acs:` line stands as it is.
  const list = !acs.length && listed ? listed.replace(/^acs:\s*/, '') : `[${ids.join(', ')}]`
  const head = setKey(setKey(fm, 'text', sha), 'acs', list)
  const out = ['---', ...head, '---', '', ...(title ? [title, ''] : []), ...goal]
  return out.join('\n').replace(/\n*$/, '\n')
}

function fullText(cwd, rel, sha) {
  const p = posix(cwd, rel)
  const r = git.raw(['show', `${sha}:./${p}`], cwd)
  const why = `${p} names text ${sha}, not in this clone — git fetch --unshallow, then re-run`
  if (r.status !== 0) throw Object.assign(new Error(why), { exit: 2 })
  return r.stdout
}

function readFull(cwd, rel) {
  const doc = st.readSpec(path.resolve(cwd, rel))
  return isStub(doc.frontmatter) ? S.parse(fullText(cwd, rel, doc.frontmatter.text)) : doc
}

const walk = (dir) => {
  let ents = []
  try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return [] }
  return ents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? (e.name.endsWith('.run') ? [] : walk(p)) : e.name.endsWith('.md') ? [p] : []
  })
}
const idOf = (rel) => {
  const m = /(\d{8})\/(\d+)-[^/]+\.md$/.exec(rel)
  return m ? `${m[1]}/${m[2]}` : path.basename(rel, '.md')
}

// Stubs every finished spec that git tracks unedited, as one path-limited commit; a failed commit puts them back.
function sweep(root, { dry = false } = {}) {
  const tracked = new Set(git.sh(['ls-files', '-z', '--', 'specs'], root).split('\0'))
  const dirty = new Set(git.sh(['status', '--porcelain', '-z', '--', 'specs'], root).split('\0').map((e) => e.slice(3)))
  const found = []
  for (const abs of walk(path.join(root, 'specs'))) {
    const rel = path.relative(root, abs).split(path.sep).join('/')
    if (!tracked.has(rel) || dirty.has(rel)) continue
    const text = st.readText(abs, '')
    const fm = S.parseFrontmatter(text.replace(/\r\n/g, '\n')).frontmatter
    if (FINISHED.includes(fm.status) && !isStub(fm)) found.push({ rel, abs, text })
  }
  const paths = found.map((f) => f.rel)
  const retired = found.reduce((n, f) => n + (f.text.match(/\[retired:/g) || []).length, 0)
  if (dry || !found.length) return { paths, retired, sha: null }
  const head = git.headSha(root)
  for (const f of found) st.writeText(f.abs, stubOf(f.text, head))
  const one = paths.length === 1 && !/done/.test(idOf(paths[0])) // the subject never contains done
  const subject = `chore(spec): stub ${one ? idOf(paths[0]) : `${paths.length} spec${paths.length > 1 ? 's' : ''}`}`
  const add = git.raw(['add', '--', ...paths], root)
  const c = add.status === 0 ? git.raw(['commit', '-q', '--no-verify', '-m', subject, '--', ...paths], root) : add
  if (c.status === 0) return { paths, retired, sha: git.headSha(root) }
  for (const f of found) st.writeText(f.abs, f.text) // the next landing sweeps again
  git.raw(['reset', '-q', '--', ...paths], root)
  return { paths: [], retired, sha: null, failed: (c.stderr || c.stdout).trim() }
}

module.exports = { isStub, stubOf, fullText, readFull, sweep }
