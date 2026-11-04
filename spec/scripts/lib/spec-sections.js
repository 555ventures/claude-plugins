'use strict'
// lib/spec-sections.js — the sole authority for the AC-ID grammar, `## `/`### ` section
// extraction, and top-level AC-bullet parsing.
// Owner: specs/20260817/07-promise-sweep-leg.md
// Shared by ac-matrix.js, promise-sweep.js, red-check.js, ac-drift.js and expire-tests.js so none
// duplicates the grammar or requires a CLI script as a module.
//
// What this deliberately does NOT do: parse a spec's `## Decisions` table (promise-sweep.js's
// row-carrier grammar is its own), validate `[pre-green:]` reasons (consumers validate against the
// exported PRE_GREEN_REASONS enum and fail closed), or read a file — every export is pure.
//
// parseAcBullets returns, per bullet: id, the `oracle`/`env`/`preGreen` tag values (raw, or null),
// `raw` (full joined text), and `trailingRejected`/`trailingRejectedCause`. A tag is recognised in
// exactly two positions: (1) the DECLARATION SLOT — between the bold AC token's closing `**` and
// the requirement's `:`, backticked or bare; (2) TRAILING — the last content of the bullet, BARE
// only (a backticked trailing tag is a quoted illustration). Each position holds a RUN of sibling
// tags. A tag anywhere else parses null.
// `trailingRejected` is set when a backtick-tolerant reading of the end (allowing one final
// `→ <reference>` suffix) says something different from what parsed — it never changes what
// parses, it only lets a consumer explain a refusal; `trailingRejectedCause` is
// 'backticked-at-end' | 'not-at-end'.
//
// acIdOccurs(text, id) is a full-token occurrence check (an indexOf scan): `AC-…-1` never counts
// inside `AC-…-12`.

// The v7 floor date shared by promise-sweep.js and ac-drift.js.
const V7_APPLIES_FROM = '20260817'

// The date decision-lint.js starts
// applying; an earlier-dated spec exits 0 not-applicable instead of producing bulk findings.
const DECISION_LINT_APPLIES_FROM = '20261016'

// The date decision-lint.js's structural checks (breaking, dependency rows, data model) start
// applying; specs/20261029/05. An earlier-dated spec is exempt from those three only.
const STRUCTURAL_LINT_APPLIES_FROM = '20261029'

// The disposition-grammar floor (`→ writes|rewrites|reuses`), shared with ac-matrix.js's --lint.
const DISPOSITION_APPLIES_FROM = '20260911'

// The critical-tier literal-example floor: `ac-matrix --lint`'s `missing-literal` arm applies only to a
// `tier: critical` spec dated on or after this day.
const CRITICAL_LINT_APPLIES_FROM = '20261025'

// parseDisposition(bullet): the disposition is the bullet's TRAILING `→` pointer, so scan every
// `→` right-to-left and take the first whose tail matches DISPOSITION_TAIL_RE — that skips both a
// title's own arrow and an earlier quoted example disposition. `::` separates the reference.
// Returns null, never throws, when no `→` tail matches a disposition keyword.
const DISPOSITION_TAIL_RE = /^(writes|rewrites|reuses)\s+(\S+)(?:\s*::\s*([\s\S]*))?$/

function parseDisposition(bullet) {
  if (typeof bullet !== 'string') return null
  // Collect every `→` index first, then walk right-to-left (a `lastIndexOf` loop re-finds index 0
  // forever once fromIndex reaches -1).
  const arrowIndices = []
  for (let i = bullet.indexOf('→'); i !== -1; i = bullet.indexOf('→', i + 1)) {
    arrowIndices.push(i)
  }
  for (let i = arrowIndices.length - 1; i >= 0; i--) {
    const tail = bullet.slice(arrowIndices[i] + 1).trim()
    const m = DISPOSITION_TAIL_RE.exec(tail)
    if (m) {
      const [, kind, file, prefix] = m
      return { kind, file, prefix: kind === 'writes' ? null : (prefix === undefined ? null : prefix.trim()) }
    }
  }
  return null
}

// AC-ID shape: full anchored match of `AC-\d{8}-\d{2}[a-z]?-\d+`.
const AC_ID_RE = /^AC-\d{8}-\d{2}[a-z]?-\d+$/
const AC_ID_RE_GLOBAL = /AC-\d{8}-\d{2}[a-z]?-\d+/g

function isAlnumChar(ch) {
  return (ch >= '0' && ch <= '9') || (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z')
}

// Pure, no I/O, sibling to AC_ID_RE. True iff `id` occurs in `text` at a full-token position —
// see the header note above for the exact boundary rule and its provenance.
function acIdOccurs(text, id) {
  let from = 0
  for (;;) {
    const i = text.indexOf(id, from)
    if (i === -1) return false
    const before = i > 0 ? text[i - 1] : null
    const after = i + id.length < text.length ? text[i + id.length] : null
    if ((before === null || !isAlnumChar(before)) && (after === null || !isAlnumChar(after))) {
      return true
    }
    from = i + 1
  }
}

// The closed enum of `[pre-green: <reason>]` sub-shapes — the single authority every
// consumer validates a tagged bullet's raw reason against.
const PRE_GREEN_REASONS = [
  'fallback-rejection', 'absence-invariant', 'predicate-in-test',
]

// normalizeForPinCheck: inline code spans → one space (a quoted marker is no declaration), then
// every whitespace run (a hard-wrap's newline included) → one space, trimmed.
function normalizeForPinCheck(raw) {
  return raw.replace(/`[^`]*`/g, ' ').replace(/\s+/g, ' ').trim()
}

// pinShape(raw): 'promise' (no SHALL CONTINUE TO), 'pin' (every SHALL is part of a SHALL CONTINUE
// TO), else 'mixed' — a whole-bullet SHALL count over the normalized text. The one predicate
// red-check.js, ac-matrix.js and /spec:plan lock import.
function pinShape(raw) {
  const normalized = normalizeForPinCheck(raw)
  const pins = (normalized.match(/\bSHALL CONTINUE TO\b/g) || []).length
  const shalls = (normalized.match(/\bSHALL\b/g) || []).length
  if (pins === 0) return 'promise'
  if (shalls === pins) return 'pin'
  return 'mixed'
}

// One `[tagname: value]` item, optionally backtick-wrapped — consumes a run, never extracts.
const TAG_ITEM_SRC = '`?\\[[a-z][a-z-]*:\\s*[^\\]]+\\]`?'

// The BARE variant — trailing position only (a backticked trailing tag is a quote).
const BARE_TAG_ITEM_SRC = '\\[[a-z][a-z-]*:\\s*[^\\]]+\\]'

// The declaration-slot run — the segment between the bold AC token's closing `**` and the
// requirement's `:` on the first line; zero or more tag items, backticked or bare; null when the
// first line lacks that shape.
function slotRun(firstLine) {
  const re = new RegExp('^- \\*\\*[^*]*\\*\\*\\s*((?:' + TAG_ITEM_SRC + '\\s*)*):')
  const m = firstLine.match(re)
  return m ? m[1] : null
}

// The trailing run — one or more BARE tag items ending the bullet's raw text, or null.
function trailingRun(raw) {
  const re = new RegExp('((?:' + BARE_TAG_ITEM_SRC + '\\s*)+)$')
  const m = raw.replace(/\s+$/, '').match(re)
  return m ? m[1] : null
}

// Backtick-tolerant sibling of trailingRun (same TAG_ITEM_SRC) — only for detecting a refusal.
function tolerantTrailingRun(raw) {
  const re = new RegExp('((?:' + TAG_ITEM_SRC + '\\s*)+)$')
  const m = raw.replace(/\s+$/, '').match(re)
  return m ? m[1] : null
}

// The widened tolerant run — additionally tolerates one final `→ <tail without a second →>`
// reference suffix; trimmed before comparison. Only computes trailingRejected/Cause.
function wideTrailingRun(raw) {
  const re = new RegExp('((?:' + TAG_ITEM_SRC + '\\s*)+)(?:\u2192[^\u2192]*)?$')
  const m = raw.replace(/\s+$/, '').match(re)
  return m ? m[1].replace(/\s+$/, '') : null
}

// The one authority for the `rejected-trailing-tag` remedy text; `underlying` is the consumer's
// own clause. `cause` forks the middle: 'backticked-at-end' says remove the backticks,
// 'not-at-end' only says move the tag into the declaration slot.
function rejectedTrailingTagDetail(acId, trailingRejected, cause, underlying) {
  if (cause === 'not-at-end') {
    return `${acId}: trailing tag ${trailingRejected} was refused as a declaration — it sits ` +
      `before the bullet's final → reference, which is not a recognized declaration position. ` +
      `If this is a genuine declaration: move it into the declaration slot (backticks allowed ` +
      `there). If it is meant only as a quote: ${underlying} still stands and needs its own fix.`
  }
  return `${acId}: trailing tag ${trailingRejected} was refused as a declaration — it ends the ` +
    `bullet backticked, and the bare-only trailing rule (rv_640c582f4902) accepts only a BARE ` +
    `trailing tag as a declaration. If this is a genuine declaration: remove the backticks, or ` +
    `move it into the declaration slot (backticks allowed there). If it is meant only as a quote: ` +
    `${underlying} still stands and needs its own fix.`
}

// One named tag's value: the declaration-slot run first, then the trailing run; else null.
function extractTag(tagName, firstLine, raw) {
  const tagRe = new RegExp('`?\\[' + tagName + ':\\s*([^\\]]+)\\]`?')
  const slot = slotRun(firstLine)
  if (slot !== null) {
    const m = slot.match(tagRe)
    if (m) return m[1].trim()
  }
  const trail = trailingRun(raw)
  if (trail !== null) {
    const m = trail.match(tagRe)
    if (m) return m[1].trim()
  }
  return null
}

function extractSection(text, heading) {
  const lines = text.split('\n')
  let start = -1, level = 0
  const re = new RegExp(`^(#{2,3}) ${heading}`, 'i')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re)
    if (m) { start = i + 1; level = m[1].length; break }
  }
  if (start === -1) return null
  let end = lines.length
  for (let i = start; i < lines.length; i++) {
    const hm = lines[i].match(/^(#{1,6})\s/)
    if (hm && hm[1].length <= level) { end = i; break }
  }
  return lines.slice(start, end).join('\n')
}

function parseAcBullets(sectionText) {
  const stripped = sectionText.replace(/<!--[\s\S]*?-->/g, '')
  const lines = stripped.split('\n')
  const groups = []
  let cur = null
  for (const line of lines) {
    if (/^- /.test(line)) {
      if (cur) groups.push(cur)
      cur = [line]
    } else if (cur) {
      cur.push(line)
    }
  }
  if (cur) groups.push(cur)
  return groups.map(linesArr => {
    const raw = linesArr.join('\n')
    const tokenMatch = linesArr[0].match(/^- \*\*([^*]*)\*\*/)
    const token = tokenMatch ? tokenMatch[1] : ''
    const malformed = !AC_ID_RE.test(token)
    // Refused iff what was SAID (the widened tolerant reading) differs from what PARSED (the
    // bare-only trailingRun), both trimmed.
    const bareRun = trailingRun(raw)
    const bareTrimmed = bareRun !== null ? bareRun.replace(/\s+$/, '') : null
    const wide = wideTrailingRun(raw)
    const trailingRejected = (wide !== null && wide !== bareTrimmed) ? wide : null
    // 'backticked-at-end' when the unwidened tolerant run equals the wide capture (the refused run
    // is the true end); otherwise 'not-at-end'.
    let trailingRejectedCause = null
    if (trailingRejected !== null) {
      const unwidened = tolerantTrailingRun(raw)
      const unwidenedTrimmed = unwidened !== null ? unwidened.replace(/\s+$/, '') : null
      trailingRejectedCause = (unwidenedTrimmed !== null && unwidenedTrimmed === wide)
        ? 'backticked-at-end' : 'not-at-end'
    }
    return {
      id: malformed ? null : token,
      token,
      malformed,
      raw,
      oracle: extractTag('oracle', linesArr[0], raw),
      env: extractTag('env', linesArr[0], raw),
      preGreen: extractTag('pre-green', linesArr[0], raw),
      trailingRejected,
      trailingRejectedCause,
    }
  })
}

module.exports = {
  AC_ID_RE, AC_ID_RE_GLOBAL, PRE_GREEN_REASONS, V7_APPLIES_FROM, extractSection, parseAcBullets,
  acIdOccurs, rejectedTrailingTagDetail, extractTag, normalizeForPinCheck, pinShape,
  DISPOSITION_APPLIES_FROM, parseDisposition, DECISION_LINT_APPLIES_FROM, STRUCTURAL_LINT_APPLIES_FROM, CRITICAL_LINT_APPLIES_FROM,
  slotRun, trailingRun,
}
