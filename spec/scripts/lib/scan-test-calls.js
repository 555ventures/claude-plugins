'use strict'
// lib/scan-test-calls.js — the one derivation of "a test case".
// Owner: specs/20260911/02-tests-have-a-ceiling.md.
// Exports `listTestFiles(root, config)` (host testGlobs-classified files), `scanCalls(src)` (every
// line-start `test(`/`it(` call), `countCases(root, config)`, `resolveReference(root, file, prefix)` and
// `scanDescribes(src)` — count-tests.js, ac-drift.js and expire-tests.js all import this so they never
// disagree about what a test case is. Named away from `test-*` so `node --test` never discovers it.
//
// A case is a `test(` or `it(` call whose only preceding characters on its own line are
// whitespace — `describe(` and `t.test(` are never counted (the leading-token check fails: the
// former's name doesn't match, the latter has a non-whitespace `t.` before it on the line).
// A modifier chain is the same case: `it.only(`/`.skip(`/`.concurrent(`/`.sequential(`/`.fails(`/
// `.todo(`/`.fixme(` when the first argument is a string or template literal (so a suite-level
// `test.skip(condition, 'why')` is never one), and the table forms `it.each(table)(` /
// `it.each\`table\`(` / `test.for(table)(`, whose title is the SECOND group's first argument.
// Any other member (`test.describe(`, `test.beforeEach(`, `test.use(`, `test.step(`) never
// matches — the first of those is a suite, and reading it as one case would swallow its body.
// The scanner walks the whole source once, skipping string/template literals, `//` and `/* */`
// comments, and regex literals as opaque spans so a quote or paren inside one of them can never
// desynchronize the paren-depth count that finds a call's own closing paren.
// Regex-literal detection follows the standard heuristic: a `/` opens a regex only when the last
// significant character read is one of `( , = : [ ! & | ? { } ; + - * % < > ~ ^`, one of the
// keywords `return typeof case await throw else in of`, or the `=>` arrow token — anywhere else
// (an identifier, a literal, `]`, a postfix `++`/`--`) it is division and left alone; a `/` right
// after `<` or right before `>` (a JSX `</tag>` or `/>`) never opens one. A `)` is
// ambiguous on its own (`(a + b) / 2` is division, `if (a) /re/.test(x)` is a regex) so a paren
// stack tracks, for each `(`, whether the word immediately before it was `if`/`while`/`for`/
// `switch`/`catch` — only a `)` that closed one of those conditionals opens a regex context.
//
// What this deliberately does NOT do: understand JSX beyond its two tag shapes (an apostrophe or
// `//` in JSX text still reads as a string or comment), decorators, or any transpiled syntax
// (plain post-Node-current-syntax test files only); count `describe(`/`describe.each(`/`t.test(`/
// any other call name; or classify a directory tree not already walked into `listTestFiles`'s result.
//
// Host listing: when the host config
// declares `testCaseScanner`, `hostCases(root, config)` runs that command once per process per root
// and `scanCases(root, config, file, src)` lets its listing own every file it names (the walker never
// reads such a file); any other file falls to `scanCalls(src)`. Every case record carries
// `source: 'host' | 'builtin'` and `cuttable` (a host case printed without a span is never cuttable).
// A scanner that fails yields zero host cases and one stderr line per process; every file then falls
// to the walker. The library ships no language-specific scanner besides the JavaScript walker.
//
// Exit codes: n/a (library, not an entrypoint).

const fs = require('fs')
const path = require('path')
const { readConfig } = require('./host-config')
const { fileShapes, isTestClassified } = require('./file-shapes')
const { walkFiles } = require('./walk-files')

// The skip set and its walk live in lib/walk-files.js, shared with lib/invariants.js.

function listTestFiles(root, config) {
  const cfg = config || {}
  const shapes = fileShapes(cfg)
  const all = walkFiles(root)
  const relPosix = (abs) => path.relative(root, abs).split(path.sep).join('/')
  return all.filter((f) => isTestClassified(relPosix(f), shapes))
}

// ---- low-level opaque-span skippers — each returns the index just past the span it opened at
// the given index (or src.length on an unterminated span, so callers' `< n` loop guards stop
// cleanly rather than looping forever). --------------------------------------------------------

function skipLineComment(src, i) {
  let j = i
  while (j < src.length && src[j] !== '\n') j++
  return j
}

function skipBlockComment(src, i) {
  const idx = src.indexOf('*/', i + 2)
  return idx === -1 ? src.length : idx + 2
}

function skipQuoteString(src, i, quote) {
  let j = i + 1
  while (j < src.length && src[j] !== quote) {
    if (src[j] === '\\') { j += 2; continue }
    j++
  }
  return j < src.length ? j + 1 : src.length
}

function skipTemplate(src, i) {
  let j = i + 1
  let depth = 0
  while (j < src.length) {
    if (src[j] === '\\') { j += 2; continue }
    if (src[j] === '`' && depth === 0) return j + 1
    if (src[j] === '$' && src[j + 1] === '{') { depth++; j += 2; continue }
    if (src[j] === '}' && depth > 0) { depth--; j++; continue }
    j++
  }
  return src.length
}

// Control-flow keywords whose closing `)` re-opens a regex context (`if (a) /re/`) rather than
// division (`foo() / 2`, `(a + b) / 2` — a bare call or grouping paren is never one of these).
const CONTROL_KEYWORD_PAREN_RE = /(^|[^A-Za-z0-9_$])(if|while|for|switch|catch)$/

// `sig` collapses each whitespace run to one trailing ' ' so `true\n  if` keeps a word boundary;
// both keyword checks trim it before testing.
function trailingWord(sig) {
  return sig.replace(/ $/, '')
}

// Every punctuation character after which a `/` can only open a regex literal, never divide:
// nothing here yields a value. `]` and `)` are deliberately absent — `arr[0] / 2` and
// `foo(a) / 2` are division (a `)` is resolved separately by the paren stack).
const REGEX_OPENING_PUNCT = '(,=:[!&|?{};+-*%<>~^'

// Keywords after which a `/` can only open a regex literal — each is followed by an expression,
// never by a value that could be divided (`typeof /re/`, `case /re/:`, `await /re/.test(x)`,
// `throw /re/`, `else /re/.test(x)`, `x in /re/`, `for (x of /re/)`, `return /re/`).
const REGEX_OPENING_KEYWORD_RE = /(^|[^A-Za-z0-9_$])(return|typeof|case|await|throw|else|in|of)$/

// A `/` opens a regex only in the documented contexts, checked against the trailing `sig` buffer so
// `return`/`=>` match whole tokens. `lastCloseWasKeyword` records whether the last-closed paren opened
// after a control keyword — a bare `)` is otherwise division.
function isRegexContext(sig, lastCloseWasKeyword) {
  const word = trailingWord(sig)
  if (!word) return true
  const last = word[word.length - 1]
  if (last === ')') return !!lastCloseWasKeyword
  if (word.slice(-2) === '=>') return true
  // `++`/`--` are the one operator-set exception: a postfix increment yields a value, so
  // `x++ / 2` is division even though a bare `+`/`-` opens a regex context.
  if ((last === '+' || last === '-') && word[word.length - 2] === last) return false
  if (REGEX_OPENING_PUNCT.includes(last)) return true
  return REGEX_OPENING_KEYWORD_RE.test(word)
}

// A JSX closing tag's `</` and a self-closing `/>` never open a regex; other JSX stays unhandled.
function opensRegex(src, i, sig, lastCloseWasKeyword) {
  if (src[i - 1] === '<' || src[i + 1] === '>') return false
  return isRegexContext(sig, lastCloseWasKeyword)
}

function skipRegex(src, i) {
  let j = i + 1
  let inClass = false
  while (j < src.length) {
    if (src[j] === '\\') { j += 2; continue }
    if (src[j] === '\n') return j // unterminated — bail without consuming the newline
    if (src[j] === '[') { inClass = true; j++; continue }
    if (src[j] === ']') { inClass = false; j++; continue }
    if (src[j] === '/' && !inClass) { j++; break }
    j++
  }
  while (j < src.length && /[a-zA-Z]/.test(src[j])) j++
  return j
}

// Finds the index just past the call's OWN closing paren, given its opening `(`, skipping every
// opaque span like the top-level scan does.
function findCallEnd(src, openParenIdx) {
  let depth = 1
  let pos = openParenIdx + 1
  let sig = '('
  let lastCloseWasKeyword = false
  const parenStack = []
  const n = src.length
  while (pos < n && depth > 0) {
    const c = src[pos]
    if (c === '/' && src[pos + 1] === '/') { pos = skipLineComment(src, pos); continue }
    if (c === '/' && src[pos + 1] === '*') { pos = skipBlockComment(src, pos); continue }
    if (c === '\'' || c === '"') { pos = skipQuoteString(src, pos, c); sig = c; continue }
    if (c === '`') { pos = skipTemplate(src, pos); sig = '`'; continue }
    if (c === '/' && opensRegex(src, pos, sig, lastCloseWasKeyword)) { pos = skipRegex(src, pos); sig = '/'; continue }
    if (/\s/.test(c)) { if (sig[sig.length - 1] !== ' ') sig = (sig + ' ').slice(-24); pos++; continue }
    if (c === '(') {
      depth++
      parenStack.push(CONTROL_KEYWORD_PAREN_RE.test(trailingWord(sig)))
      sig = (sig + c).slice(-24)
      pos++
      continue
    }
    if (c === ')') {
      depth--
      lastCloseWasKeyword = parenStack.length ? parenStack.pop() : false
      pos++
      sig = ')'
      continue
    }
    sig = (sig + c).slice(-24)
    pos++
  }
  return pos
}

// The first string-literal argument's raw (unescaped-for-backslash) content, or '' when the
// call's first argument is not a string/template literal.
function extractTitle(src, openParenIdx) {
  let pos = openParenIdx + 1
  while (pos < src.length && /\s/.test(src[pos])) pos++
  const quote = src[pos]
  if (quote !== '\'' && quote !== '"' && quote !== '`') return ''
  let j = pos + 1
  let out = ''
  while (j < src.length && src[j] !== quote) {
    if (src[j] === '\\') { out += src[j + 1]; j += 2; continue }
    out += src[j]; j++
  }
  return out
}

// The start of the contiguous run of `//` comment lines directly above `lineStart` (no blank
// line breaks the run), or `lineStart` itself when the line directly above is not a comment.
function findCommentAbove(src, lineStart) {
  let idx = lineStart
  while (idx > 0) {
    const prevLineEnd = idx - 1 // index of the '\n' separating the previous line from this one
    const prevLineStart = src.lastIndexOf('\n', prevLineEnd - 1) + 1
    const prevLine = src.slice(prevLineStart, prevLineEnd)
    if (!/^\s*\/\//.test(prevLine)) break
    idx = prevLineStart
  }
  return idx
}

// Members that leave a `test`/`it` call a case, and the two whose first group is a table.
const CASE_MODIFIERS = new Set(['only', 'skip', 'concurrent', 'sequential', 'fails', 'todo', 'fixme'])
const TABLE_MODIFIERS = new Set(['each', 'for'])

// The index of the `(` that opens the call's own argument list when `name`, optionally followed
// by a modifier chain, starts at `i` — or -1. `modifiers` false matches the bare `name(` only.
function matchCallOpen(src, i, name, modifiers) {
  if (!src.startsWith(name, i)) return -1
  let pos = i + name.length
  if (src[pos] === '(') return pos
  if (!modifiers) return -1
  let table = false
  while (src[pos] === '.') {
    const m = /^[A-Za-z]+/.exec(src.slice(pos + 1, pos + 24))
    if (!m) return -1
    pos += 1 + m[0].length
    if (TABLE_MODIFIERS.has(m[0])) { table = true; break }
    if (!CASE_MODIFIERS.has(m[0])) return -1
  }
  if (table) {
    if (src[pos] === '(') pos = findCallEnd(src, pos)
    else if (src[pos] === '`') pos = skipTemplate(src, pos)
    else return -1
    while (pos < src.length && /\s/.test(src[pos])) pos++
    return src[pos] === '(' ? pos : -1
  }
  if (src[pos] !== '(') return -1
  let arg = pos + 1
  while (arg < src.length && /\s/.test(src[arg])) arg++
  return src[arg] === '\'' || src[arg] === '"' || src[arg] === '`' ? pos : -1
}

// scanCalls(src) -> [{ start, end, callText, title, commentAbove }]
function scanCalls(src) {
  return scanLineStartCalls(src, ['test', 'it'], true)
}

// scanDescribes(src) -> the same record shape for every line-start `describe(` call, nested ones
// included (a describe's body is walked, never skipped). Never a case: expire-tests.js reads it
// only to delete a describe its own removals left empty. `describe.each(` never matches.
function scanDescribes(src) {
  return scanLineStartCalls(src, ['describe'], false)
}

// The one opaque-span-aware walk behind both: `names` are the call names matched at line start;
// `skipBody` jumps past a matched call's own closing paren (cases never nest) and admits a case's
// modifier chain, otherwise the walk continues into the body so a nested match is found too.

function scanLineStartCalls(src, names, skipBody) {
  const calls = []
  const n = src.length
  let i = 0
  let sig = ''
  let lastCloseWasKeyword = false
  const parenStack = []
  while (i < n) {
    const c = src[i]
    if (c === '/' && src[i + 1] === '/') { i = skipLineComment(src, i); continue }
    if (c === '/' && src[i + 1] === '*') { i = skipBlockComment(src, i); continue }
    if (c === '\'' || c === '"') { i = skipQuoteString(src, i, c); sig = c; continue }
    if (c === '`') { i = skipTemplate(src, i); sig = '`'; continue }
    if (c === '/' && opensRegex(src, i, sig, lastCloseWasKeyword)) { i = skipRegex(src, i); sig = '/'; continue }
    if (/\s/.test(c)) { if (sig[sig.length - 1] !== ' ') sig = (sig + ' ').slice(-24); i++; continue }
    if (c === '(') {
      parenStack.push(CONTROL_KEYWORD_PAREN_RE.test(trailingWord(sig)))
      sig = (sig + c).slice(-24)
      i++
      continue
    }
    if (c === ')') {
      lastCloseWasKeyword = parenStack.length ? parenStack.pop() : false
      sig = ')'
      i++
      continue
    }
    let openParen = -1
    for (const nm of names) {
      if (c !== nm[0]) continue
      openParen = matchCallOpen(src, i, nm, skipBody)
      if (openParen !== -1) break
    }
    if (openParen !== -1) {
      const lineStart = src.lastIndexOf('\n', i - 1) + 1
      const before = src.slice(lineStart, i)
      if (/^\s*$/.test(before)) {
        const callEnd = findCallEnd(src, openParen)
        const title = extractTitle(src, openParen)
        // Only a trailing `;` is consumed, never a trailing newline: `end` stays strictly before the next
        // call's start, and a file's last call never reports `end === src.length`.
        let end = callEnd
        if (src[end] === ';' && end + 1 < src.length) end++
        calls.push({
          start: findCommentAbove(src, lineStart),
          end,
          callText: src.slice(i, callEnd),
          title,
          commentAbove: src.slice(findCommentAbove(src, lineStart), lineStart),
        })
        if (skipBody) {
          i = end
          sig = ')'
          lastCloseWasKeyword = false
          continue
        }
      }
    }
    sig = (sig + c).slice(-24)
    i++
  }
  return calls
}

// ---- host listing -----------------------------------------------------------------------------

const HOST_TIMEOUT_MS = 120000
const hostMemo = new Map() // root + command -> result
const hostWarned = new Set()

function parseListingLine(line) {
  if (line.trim() === '') return { skip: true }
  if (line[0] === '{') {
    let o
    try { o = JSON.parse(line) } catch { return null }
    if (!o || typeof o.file !== 'string' || !o.file || typeof o.title !== 'string') return null
    const span = Number.isInteger(o.start) && Number.isInteger(o.end) && o.start >= 1 && o.end >= o.start
    return { file: o.file, title: o.title, start: span ? o.start : null, end: span ? o.end : null }
  }
  const at = line.indexOf(' :: ')
  if (at <= 0) return null
  return { file: line.slice(0, at), title: line.slice(at + 4), start: null, end: null }
}

// hostCases(root, config[, {quiet}]) -> { ok, exit, command, byFile: Map<rel, [{title, start, end}]>, malformed }
function hostCases(root, config, opts) {
  const cfg = config || {}
  const command = typeof cfg.testCaseScanner === 'string' && cfg.testCaseScanner.trim() ? cfg.testCaseScanner : null
  const empty = { ok: true, exit: null, command: null, byFile: new Map(), malformed: 0 }
  if (!command) return empty
  const key = root + '\0' + command
  if (hostMemo.has(key)) return hostMemo.get(key)
  const r = require('./host-run').run(command, {
    cwd: root, encoding: 'utf8', timeout: HOST_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
  })
  let exit = r.status
  if (r.error) exit = r.error.code === 'ETIMEDOUT' ? null : 127
  const res = { ok: exit === 0, exit, command, byFile: new Map(), malformed: 0 }
  if (!res.ok) {
    if (!hostWarned.has(key) && !(opts && opts.quiet)) {
      hostWarned.add(key)
      process.stderr.write('testCaseScanner failed (exit ' + (exit === null ? 'timeout' : exit) + '): ' + command + '\n')
    }
  } else {
    for (const line of String(r.stdout || '').split('\n')) {
      const rec = parseListingLine(line.replace(/\r$/, ''))
      if (rec === null) { res.malformed++; continue }
      if (rec.skip) continue
      if (!res.byFile.has(rec.file)) res.byFile.set(rec.file, [])
      res.byFile.get(rec.file).push({ title: rec.title, start: rec.start, end: rec.end })
    }
  }
  hostMemo.set(key, res)
  return res
}

// scanCases(root, config, file, src) -> Case[]; `file` is repo-relative POSIX.
function scanCases(root, config, file, src) {
  const host = hostCases(root, config)
  const listed = host.ok ? host.byFile.get(file) : null
  if (!listed) {
    return scanCalls(src).map((c) => ({ ...c, cuttable: true, source: 'builtin' }))
  }
  const offsets = [0]
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') offsets.push(i + 1)
  return listed.map((h) => {
    if (h.start === null) {
      return { start: 0, end: 0, callText: '', title: h.title, commentAbove: '', cuttable: false, source: 'host' }
    }
    const start = h.start - 1 < offsets.length ? offsets[h.start - 1] : src.length
    const end = h.end < offsets.length ? offsets[h.end] : src.length
    return { start, end, callText: '', title: h.title, commentAbove: src.slice(start, end), cuttable: true, source: 'host' }
  })
}

// resolveReference(root, file, prefix) -> the cases in `file` whose title starts with `prefix` —
// the one reading of a `→ reuses <file> :: <title>` pointer (lib/spec-sections.js's
// parseDisposition), shared by the review coverage matrix, the drift check and the expiry sweep.
// An unreadable file or a null prefix resolves to no case.
function resolveReference(root, file, prefix) {
  if (typeof prefix !== 'string' || !prefix) return []
  let src
  try { src = fs.readFileSync(path.join(root, file), 'utf8') } catch { return [] }
  return scanCases(root, readConfig(root), file, src).filter((c) => c.title.startsWith(prefix))
}

function countCases(root, config) {
  const files = listTestFiles(root, config)
  let count = 0
  for (const f of files) {
    let src
    try { src = fs.readFileSync(f, 'utf8') } catch { continue }
    const rel = path.relative(root, f).split(path.sep).join('/')
    count += scanCases(root, config, rel, src).length
  }
  return { count, files }
}

module.exports = { listTestFiles, scanCalls, scanDescribes, scanCases, hostCases, countCases, resolveReference }
