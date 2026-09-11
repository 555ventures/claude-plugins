'use strict'
// lib/scan-test-calls.js — the one derivation of "a test case" (specs/20260911/02-tests-have-a-
// ceiling.md D2). Exports `listTestFiles(root, config)` (host testGlobs-classified files,
// skipping `.git`, `node_modules`, `fixtures`, `__fixtures__`, `.claude/worktrees`),
// `scanCalls(src)` (every line-start `test(`/`it(` call in one source string), and
// `countCases(root, config)` (the two composed). count-tests.js and ac-drift.js's expiry sweep
// both import this so the two never disagree about what a test case is. Named away from the
// `test-*` prefix (the amendment's forcing incident: `node --test`'s default discovery matches
// `**/test-*.js` anywhere under the root and would execute this library as a test file).
//
// A case is a `test(` or `it(` call whose only preceding characters on its own line are
// whitespace — `describe(` and `t.test(` are never counted (the leading-token check fails: the
// former's name doesn't match, the latter has a non-whitespace `t.` before it on the line).
// The scanner walks the whole source once, skipping string/template literals, `//` and `/* */`
// comments, and regex literals as opaque spans so a quote or paren inside one of them can never
// desynchronize the paren-depth count that finds a call's own closing paren (AC-20260911-02-4).
// Regex-literal detection follows the standard heuristic: a `/` opens a regex only when the last
// significant character read is one of `( , = : [ ! & | ? { } ; + - * % < > ~ ^`, one of the
// keywords `return typeof case await throw else in of`, or the `=>` arrow token — anywhere else
// (an identifier, a literal, `]`, a postfix `++`/`--`) it is division and left alone. A `)` is
// ambiguous on its own (`(a + b) / 2` is division, `if (a) /re/.test(x)` is a regex) so a paren
// stack tracks, for each `(`, whether the word immediately before it was `if`/`while`/`for`/
// `switch`/`catch` — only a `)` that closed one of those conditionals opens a regex context
// (AC-20260911-02-4's second shape, the amendment's forcing incident).
//
// What this deliberately does NOT do: understand JSX, decorators, or any transpiled syntax
// (plain post-Node-current-syntax test files only); count `describe(`/`t.test(`/any other call
// name; or classify a directory tree not already walked into `listTestFiles`'s result.
//
// Exit codes: n/a (library, not an entrypoint).

const fs = require('fs')
const path = require('path')
const { readConfig, DEFAULT_TEST_GLOBS } = require('./host-config')
const { globMatch } = require('./glob-match')

// D2's skip set. `.claude/worktrees` is matched by RELATIVE path (a directory named
// "worktrees" anywhere else in the tree is not skipped) — everything else is a bare name match,
// same as ac-drift.js's own SKIP_DIRS.
const SKIP_DIR_NAMES = new Set(['.git', 'node_modules', 'fixtures', '__fixtures__'])

function walk(dir, root, out) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const rel = path.relative(root, full).split(path.sep).join('/')
      if (SKIP_DIR_NAMES.has(entry.name) || rel === '.claude/worktrees') continue
      walk(full, root, out)
    } else if (entry.isFile()) {
      out.push(full)
    }
  }
}

function listTestFiles(root, config) {
  const cfg = config || {}
  const configTestGlobs = cfg.testGlobs
  const testGlobs = Array.isArray(configTestGlobs) ? configTestGlobs : DEFAULT_TEST_GLOBS
  const all = []
  walk(root, root, all)
  const relPosix = (abs) => path.relative(root, abs).split(path.sep).join('/')
  return all.filter((f) => testGlobs.some((g) => globMatch(g, relPosix(f))))
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

// `sig` collapses every whitespace run to one trailing `' '` (never more — callers only ever
// append a boundary space once per run) so two identifier-like tokens separated only by
// whitespace (`true\n  if`) keep a real word boundary; without it they'd read as one run-on word
// (`trueif`) and a keyword regex anchored on `[^A-Za-z0-9_$]` would never match. Both keyword
// checks below trim that trailing space before testing.
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

// A `/` opens a regex only in the documented contexts (D2/A3) — the trailing significant-
// character buffer `sig` (a boundary space collapses each whitespace run, never fully dropped)
// is checked, never a single char, so the `return`/`=>` checks can match a whole token rather
// than its last letter. `lastCloseWasKeyword` carries whether the most recently closed paren (if
// `sig` currently ends in `)`) matched CONTROL_KEYWORD_PAREN_RE when it was opened — a bare `)`
// is otherwise division, never regex.
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

// Finds the index just past the call's OWN closing paren, given the index of its opening `(`.
// Depth-tracks parens only, skipping every opaque span the same way the top-level scan does —
// this is what keeps a regex literal holding an escaped `\)` and a bare `"` (AC-20260911-02-4)
// from corrupting the count.
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
    if (c === '/' && isRegexContext(sig, lastCloseWasKeyword)) { pos = skipRegex(src, pos); sig = '/'; continue }
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

// scanCalls(src) -> [{ start, end, callText, title, commentAbove }] — see the Contracts block
// in specs/20260911/02-tests-have-a-ceiling.md for the field shapes.
function scanCalls(src) {
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
    if (c === '/' && isRegexContext(sig, lastCloseWasKeyword)) { i = skipRegex(src, i); sig = '/'; continue }
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
    const isTest = c === 't' && src.startsWith('test(', i)
    const isIt = c === 'i' && src.startsWith('it(', i)
    if (isTest || isIt) {
      const lineStart = src.lastIndexOf('\n', i - 1) + 1
      const before = src.slice(lineStart, i)
      if (/^\s*$/.test(before)) {
        const openParen = i + (isTest ? 4 : 2)
        const callEnd = findCallEnd(src, openParen)
        const title = extractTitle(src, openParen)
        // D10 (specs/20260911/04-every-criterion-declares-its-test.md): only a trailing `;` is
        // consumed now — the former unconditional trailing-`\n` consumption pushed a span past
        // its own call's closing paren into the FOLLOWING line, so a call immediately followed by
        // another (the overwhelmingly common shape, one blank-free line between two test( calls)
        // reported `end === <next call's start>` instead of strictly less, and the file's last
        // call (one trailing newline before EOF, equally common) reported `end === src.length`
        // indistinguishable from a swallowed-rest-of-file span — the exact file-corrupting
        // deletion this invariant exists to let spec 03 detect (AC-20260911-04-12).
        let end = callEnd
        if (src[end] === ';' && end + 1 < src.length) end++
        calls.push({
          start: findCommentAbove(src, lineStart),
          end,
          callText: src.slice(i, callEnd),
          title,
          commentAbove: src.slice(findCommentAbove(src, lineStart), lineStart),
        })
        i = end
        sig = ')'
        lastCloseWasKeyword = false
        continue
      }
    }
    sig = (sig + c).slice(-24)
    i++
  }
  return calls
}

function countCases(root, config) {
  const files = listTestFiles(root, config)
  let count = 0
  for (const f of files) {
    let src
    try { src = fs.readFileSync(f, 'utf8') } catch { continue }
    count += scanCalls(src).length
  }
  return { count, files }
}

module.exports = { listTestFiles, scanCalls, countCases }
