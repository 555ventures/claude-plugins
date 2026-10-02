'use strict'
// Shared helpers for the plugin's deterministic-layer tests.
//
// Workflow scripts (spec/workflows/*.js) run in the harness sandbox as an async function body
// (top-level `return` is legal there), so they cannot be require()d. extractFn() brace-matches a
// named top-level `function name(...) {...}` out of the source and evaluates it standalone, which
// is exactly the unit under test for the guard functions (normalizeArgs, validateGroups, isBatch).
const fs = require('fs')
const assert = require('assert')
const path = require('path')
const os = require('os')
const { execFileSync, spawnSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const SPEC = path.join(ROOT, 'spec')

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function extractFn(src, name) {
  const sig = 'function ' + name + '('
  const at = src.indexOf(sig)
  if (at === -1) throw new Error('function ' + name + ' not found')
  // Preserve a leading `async ` keyword — dropping it silently turned every
  // await-bearing extraction into a SyntaxError under evalFns (spec 20260813/09 D7).
  const asyncPrefix = 'async '
  const start = at >= asyncPrefix.length && src.slice(at - asyncPrefix.length, at) === asyncPrefix
    ? at - asyncPrefix.length
    : at
  const open = src.indexOf('{', at)
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1)
  }
  throw new Error('unbalanced braces extracting ' + name)
}

// Evaluate one or more extracted functions and return the last one by name.
function evalFns(src, names) {
  const body = names.map(n => extractFn(src, n)).join('\n')
  // eslint-disable-next-line no-new-func
  return new Function(body + '\nreturn { ' + names.join(', ') + ' }')()
}

// Assert a workflow script is syntactically valid as an async sandbox body.
function checkWorkflowSyntax(rel) {
  const src = read(rel)
  // The sandbox strips the meta export before evaluation; mirror that.
  const body = src.replace(/^export const meta = \{[\s\S]*?\n\}\n/, '')
  // eslint-disable-next-line no-new-func
  new Function('args', 'agent', 'parallel', 'pipeline', 'phase', 'log', 'budget', 'workflow',
    '"use strict"; return (async () => {' + body + '\n})()')
}

// Every temp directory this test process (and every child it spawns) creates lands under one
// per-process root that is removed exactly once when the process ends — normal exit, thrown
// error, or an interrupt signal. Without this, each tmpdir() call left a ~700-inode tree behind
// on /tmp; eight full-suite runs leaked enough fixture trees to fill a 7.8G tmpfs, exhaust the
// inode table, and stall unrelated tools with ENOSPC. TMPDIR is set here so scripts under test
// that call os.tmpdir() themselves (review-legs.js, release-legs.js, render-capture.js) land
// under the same root and are swept with it. Tests that already rmSync their own dirs keep
// working: removing a subtree twice is a no-op.
const RUN_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-tests-' + process.pid + '-'))
process.env.TMPDIR = RUN_ROOT

let swept = false

function removeRunRoot() {
  if (swept) return
  swept = true
  try { fs.rmSync(RUN_ROOT, { recursive: true, force: true, maxRetries: 3 }) } catch { /* best-effort: never fail a run on cleanup */ }
}

process.once('exit', removeRunRoot)
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.once(sig, () => {
    removeRunRoot()
    // Re-deliver the signal with default disposition so the exit status stays signal-shaped
    // (the test runner and the shell see a real interrupt, not a clean exit).
    process.kill(process.pid, sig)
  })
}

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(RUN_ROOT, prefix + '-'))
}

function runNode(script, argv, opts = {}) {
  return spawnSync(process.execPath, [path.join(SPEC, script), ...argv],
    { encoding: 'utf8', ...opts })
}

function runBash(script, argv, opts = {}) {
  return spawnSync('bash', [path.join(SPEC, script), ...argv],
    { encoding: 'utf8', ...opts })
}

// specs/20260909/06-ephemeral-serve-ports.md D2/D4's one legitimate use — no test in this
// repo chooses a port number itself. freePort() binds :0, reads the
// bound number, and closes so the caller can hand it to a process that will bind it for real
// (D4's one legitimate use: two cooperating processes — a serve child and a second CLI
// invocation, or a deliberate reuse probe — that must agree on the same port ahead of time).
function freePort() {
  return new Promise((resolve, reject) => {
    const net = require('net')
    const srv = net.createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close((err) => (err ? reject(err) : resolve(port)))
    })
  })
}

// specs/20260912/06-the-review-page-answers-to-a-design.md D5: the jsdom-free flat-DOM shim
// tests/design-atlas.test.js wrote for review.browser.js — promoted here (its orphaned siblings
// deleted in the same spec's row) since the review-page test files need it too. One addition
// over the original: matchesCompound also matches a bare `.class` compound (`.rv-home`,
// `a.rv-home`) — before, only `[class="…"]` matched, which no caller in this file's markup ever
// emits. Nodes expose dataset/getAttribute-family/hidden/classList/addEventListener/closest/
// querySelector(All) (single compound selectors, descendant combinators only) — never innerHTML
// parsing, getBoundingClientRect, or MutationObserver, mirroring review.browser.js's own header
// discipline.
function parseFlatDom(html) {
  const VOID = new Set(['input', 'br', 'img', 'link', 'meta', 'hr'])

  function parseAttrs(str) {
    const attrs = {}
    const re = /([a-zA-Z_:][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
    let m
    while ((m = re.exec(str))) {
      const name = m[1]
      const val = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : ''
      attrs[name] = val
    }
    return attrs
  }

  function matchesCompound(node, compound) {
    const tagM = compound.match(/^([a-zA-Z][\w-]*)/)
    const tag = tagM && tagM[1]
    if (tag && node.tagName !== tag.toUpperCase()) return false
    const rest = tag ? compound.slice(tag.length) : compound
    const attrRe = /\[([a-zA-Z_:][-\w:.]*)(?:="([^"]*)")?\]/g
    let m
    while ((m = attrRe.exec(rest))) {
      const key = m[1]; const val = m[2]
      if (!node.hasAttribute(key)) return false
      if (val !== undefined && node.getAttribute(key) !== val) return false
    }
    // D5's one addition: a bare `.class` (or `tag.class`) compound, unreachable before this spec.
    const classRe = /\.([-\w]+)/g
    let cm
    while ((cm = classRe.exec(rest))) {
      if (!node.classList.contains(cm[1])) return false
    }
    return true
  }

  const allNodes = []
  function descendants(node) {
    const out = []
    for (const c of node.children) { out.push(c); out.push(...descendants(c)) }
    return out
  }
  function queryAll(scopeNode, sel) {
    const parts = sel.trim().split(/\s+/)
    const pool = scopeNode === null ? allNodes : descendants(scopeNode)
    let matched = pool.filter((n) => matchesCompound(n, parts[0]))
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i]
      const next = []
      for (const n of pool) {
        if (!matchesCompound(n, part)) continue
        let anc = n.parentNode
        let ok = false
        while (anc) { if (matched.includes(anc)) { ok = true; break } anc = anc.parentNode }
        if (ok) next.push(n)
      }
      matched = next
    }
    return matched
  }

  function makeNode(tagName, attrs) {
    const node = {
      tagName: tagName.toUpperCase(),
      attrs,
      children: [],
      parentNode: null,
      value: '',
      _handlers: {},
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null },
      setAttribute(k, v) { this.attrs[k] = String(v) },
      removeAttribute(k) { delete this.attrs[k] },
      hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) },
      addEventListener(type, fn) { (this._handlers[type] = this._handlers[type] || []).push(fn) },
      focus() { this._focused = true },
      closest(sel) {
        let n = this
        while (n) { if (matchesCompound(n, sel.trim())) return n; n = n.parentNode }
        return null
      },
      querySelector(sel) { return queryAll(this, sel)[0] || null },
      querySelectorAll(sel) { return queryAll(this, sel) },
    }
    Object.defineProperty(node, 'hidden', {
      get() { return this.hasAttribute('hidden') },
      set(v) { if (v) this.setAttribute('hidden', ''); else this.removeAttribute('hidden') },
    })
    Object.defineProperty(node, 'dataset', {
      get() {
        const out = {}
        for (const k of Object.keys(this.attrs)) {
          if (k.startsWith('data-')) out[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = this.attrs[k]
        }
        return out
      },
    })
    Object.defineProperty(node, 'classList', {
      get() {
        const self = this
        const classes = () => (self.attrs.class || '').split(/\s+/).filter(Boolean)
        return {
          add(c) { const cs = classes(); if (!cs.includes(c)) { cs.push(c); self.attrs.class = cs.join(' ') } },
          remove(c) { self.attrs.class = classes().filter((x) => x !== c).join(' ') },
          toggle(c, force) { const has = classes().includes(c); const want = force === undefined ? !has : force; if (want) this.add(c); else this.remove(c) },
          contains(c) { return classes().includes(c) },
        }
      },
    })
    return node
  }

  const root = makeNode('#root', {})
  const stack = [root]
  const tagRe = /<(\/)?([a-zA-Z][\w-]*)((?:[^<>])*?)(\/)?>/g
  let m
  while ((m = tagRe.exec(html))) {
    const closing = !!m[1]
    const tagName = m[2]
    const attrStr = m[3]
    const selfClose = !!m[4] || VOID.has(tagName.toLowerCase())
    if (closing) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName === tagName.toUpperCase()) { stack.length = i; break }
      }
      continue
    }
    const attrs = parseAttrs(attrStr)
    const node = makeNode(tagName, attrs)
    node.parentNode = stack[stack.length - 1]
    stack[stack.length - 1].children.push(node)
    allNodes.push(node)
    if (!selfClose) stack.push(node)
  }

  const document = {
    querySelector(sel) { return queryAll(null, sel)[0] || null },
    querySelectorAll(sel) { return queryAll(null, sel) },
    addEventListener(type, fn) { (root._handlers[type] = root._handlers[type] || []).push(fn) },
    _handlers: root._handlers,
  }
  return { document, allNodes }
}

// Minimal git repo factory for merge-back / gate tests.
//
// Seeding from scratch costs 5 git subprocesses (init, config x2, add, commit), and every repo
// this helper makes starts from one of two fixed shapes. Each shape is therefore built once per
// test-runner process and later callers get a copy-on-write clone of it — a near-free reflink on
// APFS/btrfs. COPYFILE_FICLONE (not _FORCE) degrades to a normal recursive copy where reflinks
// are unavailable, so the helper stays portable.
//
// The clone path requires an EMPTY target directory. Callers may write files into the dir first
// and rely on `git add -A` sweeping them into the base commit; a clone would leave those files
// uncommitted and silently change what the test observes, so a non-empty target seeds from
// scratch instead. The branch is chosen by inspection at call time, never by the caller.
//
// Does NOT: change the returned `g` helper, the branch name, the committer identity, the seeded
// file set, or the base commit's content. Repos cloned from one template within a process share
// a base commit SHA — tests read that SHA at runtime (`g('rev-parse','HEAD')`) rather than
// pinning a literal, so sharing it is invisible to them.
const gitTemplates = new Map()

function seedGitRepo(dir, opts) {
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' })
  execFileSync('git', ['init', '-q', '-b', 'main', dir], { encoding: 'utf8' })
  g('config', 'user.email', 'test@test')
  g('config', 'user.name', 'test')
  if (!opts.empty) {
    fs.writeFileSync(path.join(dir, '.gitignore'), '.claude/worktrees/\n')
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n')
    g('add', '-A')
    g('commit', '-q', '-m', 'init')
  }
  return g
}

function gitTemplate(kind) {
  if (!gitTemplates.has(kind)) {
    const dir = fs.mkdtempSync(path.join(RUN_ROOT, 'git-template-' + kind + '-'))
    seedGitRepo(dir, { empty: kind === 'empty' })
    gitTemplates.set(kind, dir)
  }
  return gitTemplates.get(kind)
}

function isEmptyDir(dir) {
  try { return fs.readdirSync(dir).length === 0 } catch { return true }
}

function gitRepo(dir, opts = {}) {
  fs.mkdirSync(dir, { recursive: true })
  if (!isEmptyDir(dir)) return seedGitRepo(dir, opts)
  fs.cpSync(gitTemplate(opts.empty ? 'empty' : 'seeded'), dir,
    { recursive: true, mode: fs.constants.COPYFILE_FICLONE })
  return (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' })
}

// Repo-wide retired-name sweep, shared by the retired-command sweeps in
// tests/consistency/genesis-doctrine.test.js and the retired-package sweep in
// tests/consistency/reviewer-retired.test.js — per § Review Checks (three or more
// near-identical blocks names the extraction); exported from here once a second file called it
// (specs/20261002/01-the-wireframe-command-runs-over-the-service.md D12).
//
// `citations` is the structural answer to the self-reference trap: a spec that retires a
// command usually has the command's name inside its OWN filename, so every dated provenance
// header citing that spec (Test Rules require those headers), the run ledger's plan row, and
// the driver's retained review evidence all contain the banned literal while pointing at the
// record of the kill rather than at the dead command. Each citation string is DELETED from a
// file's content before the literal is looked for, so citing the killing spec is always legal
// and pointing at the command never is. Exact strings only — never a "looks like a path" shape
// rule, which is the evadable-guard class § Gotchas bans (a live stale reference written as a
// path would hide behind it). Each citation must strictly contain and exceed the literal, so
// nobody can hollow the sweep out by passing the bare name as its own citation.
//
// Returns offending repo-relative paths; each call site keeps its own assert and its own
// spec-cited consequence message.
function sweepRetiredLiteral (literal, { citations = [], waivedPaths = [], waivedPrefixes = [] }) {
  for (const c of citations) {
    assert.ok(c.includes(literal) && c.length > literal.length,
      'sweep misuse: citation "' + c + '" must strictly contain and exceed the literal "' +
      literal + '" — a citation equal to (or not containing) the literal would subtract every ' +
      'live mention and silently hollow out the sweep it is supposed to narrow')
  }
  const isWaived = (rel) =>
    waivedPaths.includes(rel) || waivedPrefixes.some((pre) => rel.startsWith(pre))
  const walk = (dir, acc) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === '.git' || ent.name === 'node_modules') continue
      // A sibling session's live /spec:run worktree (.claude/worktrees/<branch>/) is a
      // checkout of an OLDER commit, not this repo's content — sweeping it reddens every
      // retired-literal pin whenever a run is in flight.
      if (dir === path.join(ROOT, '.claude') && ent.name === 'worktrees') continue
      const abs = path.join(dir, ent.name)
      if (ent.isDirectory()) walk(abs, acc)
      else if (ent.isFile()) acc.push(abs)
    }
    return acc
  }
  const offenders = []
  for (const abs of walk(ROOT, [])) {
    const rel = path.relative(ROOT, abs).split(path.sep).join('/')
    if (isWaived(rel)) continue
    let content = fs.readFileSync(abs, 'utf8')
    for (const c of citations) content = content.split(c).join('')
    if (content.includes(literal)) offenders.push(rel)
  }
  return offenders
}

module.exports = {
  ROOT, SPEC, read, extractFn, evalFns, checkWorkflowSyntax, tmpdir, runNode, runBash, gitRepo,
  freePort, parseFlatDom, sweepRetiredLiteral,
}
