'use strict'
// lib/case-reach.js — exports `topLevelDecls(text)` and `caseReach(callText, absFile, opts)`, the
// one resolver of "what does this test case reach"
// Owner: specs/20261103/05-tests-that-earn-their-keep.md D4 (AC-20261103-05-4, -5, -6).
//
// expire-tests.js's keep clause (b) judges a case by its reach, never by its file: the reach is
// the case's call text plus, transitively, the text of every top-level declaration in its own
// file whose identifier the reach names as a whole word. A reached declaration holding a
// relative `require('./x')` pulls in that module's top-level declarations for the same
// identifiers plus its `module.exports` statement (bound as "__exports__"), resolved with `''`,
// `.js`, `.cjs`, `.mjs`, `/index.js`, recursively to `depth` (default 3).
//
// What this deliberately does NOT do: parse JavaScript (a top-level declaration is a column-0
// line plus its indented or closer-led continuation lines — a documented approximation), follow
// a non-relative require, follow a require that sits in the call text itself (the caller's
// invariants check reads those), or read any file it was not pointed at through a relative
// require. An unreadable module contributes nothing.
//
// Exit codes: n/a (library, not an entrypoint).

const fs = require('fs')
const path = require('path')

const DECL_START = /^(?:(const|let|var)\s+|(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*)|exports\.([A-Za-z_$][\w$]*)\s*=|module\.exports\.([A-Za-z_$][\w$]*)\s*=|(module\.exports)\s*=)/
const IDENT = /[A-Za-z_$][\w$]*/g
const REL_REQUIRE = /require\(\s*(['"])(\.[^'"]*)\1\s*\)/g

// Names bound by the pattern after `const|let|var`: one identifier, or every identifier inside a
// (possibly multi-line, nested) `{…}` / `[…]` destructure.
function boundNames(body, from) {
  const rest = body.slice(from)
  if (rest[0] !== '{' && rest[0] !== '[') {
    const m = /^[A-Za-z_$][\w$]*/.exec(rest)
    return m ? [m[0]] : []
  }
  let depth = 0
  let end = rest.length
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '{' || rest[i] === '[') depth++
    else if (rest[i] === '}' || rest[i] === ']') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  return rest.slice(0, end).match(IDENT) || []
}

// topLevelDecls(text) -> Map<identifier, declarationText>
function topLevelDecls(text) {
  const blocks = []
  let cur = null
  for (const line of String(text).split('\n')) {
    if (line === '' || /^[\s})\]]/.test(line)) {
      if (cur) cur.push(line)
    } else {
      cur = [line]
      blocks.push(cur)
    }
  }
  const decls = new Map()
  for (const lines of blocks) {
    const m = DECL_START.exec(lines[0])
    if (!m) continue
    const body = lines.join('\n')
    let names = []
    if (m[1]) names = boundNames(body, m[0].length)
    else if (m[2] || m[3] || m[4] || m[5]) names = [m[2] || m[3] || m[4] || m[5]]
    else if (m[6]) names = ['__exports__']
    for (const n of names) decls.set(n, decls.has(n) ? decls.get(n) + '\n' + body : body)
  }
  return decls
}

function resolveModule(fromAbs, spec) {
  const base = path.resolve(path.dirname(fromAbs), spec)
  for (const c of [base, base + '.js', base + '.cjs', base + '.mjs', path.join(base, 'index.js')]) {
    try { if (fs.statSync(c).isFile()) return c } catch { /* next candidate */ }
  }
  return null
}

function readSafe(abs) {
  try { return fs.readFileSync(abs, 'utf8') } catch { return null }
}

// Appends every declaration whose identifier `seedText` names as a whole word, to a fixpoint;
// `seen` carries identifiers already pulled. Returns the appended text.
function pullDecls(seedText, decls, seen) {
  let out = ''
  let hay = seedText
  let grew = true
  while (grew) {
    grew = false
    for (const w of new Set(hay.match(IDENT) || [])) {
      if (seen.has(w) || !decls.has(w)) continue
      seen.add(w)
      out += '\n' + decls.get(w)
      hay += '\n' + decls.get(w)
      grew = true
    }
  }
  return out
}

// For each relative require in `declText`, appends the module's declarations for the identifiers
// `declText` names plus its "__exports__", then recurses into what was appended.
function followRequires(declText, absFile, depth, visited) {
  if (depth <= 0) return ''
  let out = ''
  const specs = []
  let m
  REL_REQUIRE.lastIndex = 0
  while ((m = REL_REQUIRE.exec(declText))) specs.push(m[2])
  for (const spec of specs) {
    const modAbs = resolveModule(absFile, spec)
    if (!modAbs || visited.has(modAbs + '|' + depth)) continue
    visited.add(modAbs + '|' + depth)
    const modSrc = readSafe(modAbs)
    if (modSrc === null) continue
    const modDecls = topLevelDecls(modSrc)
    const wanted = new Set(declText.match(IDENT) || [])
    wanted.add('__exports__')
    const seed = [...wanted].filter((n) => modDecls.has(n))
    const seen = new Set(seed)
    let add = ''
    for (const n of seed) add += '\n' + modDecls.get(n)
    add += pullDecls(add, modDecls, seen)
    out += add + followRequires(add, modAbs, depth - 1, visited)
  }
  return out
}

// caseReach(callText, absFile, { depth = 3 } = {}) -> string
function caseReach(callText, absFile, { depth = 3 } = {}) {
  const src = readSafe(absFile)
  if (src === null) return callText
  const pulled = pullDecls(callText, topLevelDecls(src), new Set())
  return callText + pulled + followRequires(pulled, absFile, depth, new Set())
}

module.exports = { topLevelDecls, caseReach }
