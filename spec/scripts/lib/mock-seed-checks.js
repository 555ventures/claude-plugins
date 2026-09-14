'use strict'
// lib/mock-seed-checks.js — edgeGaps(journey, readHtml): compares a journey's seed edges
// (design/mocks/seed.md's ```surfaces block, read via lib/surfaces.js's parseSeedJourneys)
// against the `data-to="<label>"` controls actually drawn in each mock.
// specs/20260910/02-click-to-advance-and-real-records.md D1/D2 — mocks-driver.js's
// `journey-drawn` refuses on any `missing` or `unknown` entry (AC-20260910-02-1,
// AC-20260910-02-2).
//
// `journey` is `{labels, edges, declared}` (edges: `[from, to]` pairs); `readHtml(label)`
// returns that label's mock source or a falsy value. Pure: no `fs`, no path policy, no
// network — the caller owns how a label's HTML is read. Does NOT parse full HTML into a DOM: a
// mock's `[data-screen-label]` root is located by regex-matched tag nesting (open/close tags of
// the same name), which is sufficient for the hand-authored, non-pathological markup mocks
// are — it deliberately does not handle self-closing variants of the root tag or malformed
// HTML. A `data-to` sitting outside the root (after it closes) counts as absent, never as
// unknown.
// D1: a `data-to` names "a screen declared in ANY seed journey", not only the marked journey's
// own labels — `journey.declared` (the repo-wide union the caller computes) is what `unknown`
// tests against, defaulting to `labels` when omitted. The screens scanned and the `missing`
// loop stay journey-local: only the `unknown` test widens.
//
// recordValues(records)/recordHits(values, html): specs/20260910/06-real-records-and-two-dense-screens.md
// D3 — `recordValues` walks every one of the client's `## Records` JSON arrays (objects, nested
// objects, and arrays all walked) and collects every string value of length >= 3, stringifying
// numbers first (so a bare `14` — two characters — never becomes a candidate) and deduplicating
// in first-seen order. `recordHits` is the pure substring test against one mock's HTML source
// mocks-driver.js's `journey-drawn` runs per screen. Both are pure: no `fs`, no path policy.
//
// resolveRecordRef/boundBindings/distinctiveValues/recordBindingViolations:
// specs/20260912/10-seeded-data-names-its-source.md D1-D3 (AC-20260912-10-1..4) — a screen names
// the record it shows via `data-record="<entity>[<i>].<field>"`. `resolveRecordRef` walks
// `recordsByEntity` (keyed by the entity basename `mocks-driver.js` already derives from
// `## Records`) and resolves a reference to `{value}` or names the first failing segment as
// `{error}`. `boundBindings` finds every element carrying `data-record` — matched as
// `data-record\s*=`, anchored on a preceding whitespace/tag-open boundary rather than `\b`, so
// the client walk page's own `data-recorded="<date>"` stamp (lib/walk-page.js) is never misread
// as a binding — and returns its reference, its visible text (tags stripped, whitespace
// collapsed, trimmed) and its `[start,end)` span in the source, comments already stripped.
// `distinctiveValues` computes, over every record across every entity, the set of values that
// contain a space or are >= 8 characters long AND occur in exactly one record; every other seed
// value stays a warn rather than a refusal (D3). `recordBindingViolations` composes all three: an
// unresolved or mismatched binding is always a violation; a distinctive value found in the mock's
// text outside every bound element's span is a violation, and every other stray seed value is a
// `⚠️` warn. All four are pure: no `fs`, no path policy — the caller reads the mock's HTML and
// builds `recordsByEntity` from disk.
//
// Exit codes: n/a (library, not an entrypoint).

// D1: comments stripped before anything is derived from a mock's text — a commented-out
// `data-record="…"` must never bind, and a value sitting only inside a comment must never trip
// the stray-value sweep.
function stripComments(html) { return String(html).replace(/<!--[\s\S]*?-->/g, '') }

function findRootHtml(html, label) {
  const openRe = /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g
  let m
  while ((m = openRe.exec(html))) {
    const tag = m[1]
    const attrs = m[2]
    const labelMatch = attrs.match(/data-screen-label\s*=\s*"([^"]*)"/)
    if (!labelMatch || labelMatch[1] !== label) continue
    const tagRe = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'gi')
    tagRe.lastIndex = openRe.lastIndex
    let depth = 1
    let closeIdx = html.length
    let mm
    while ((mm = tagRe.exec(html))) {
      if (mm[1]) { depth -= 1; if (depth === 0) { closeIdx = mm.index; break } } else depth += 1
    }
    return html.slice(openRe.lastIndex, closeIdx)
  }
  return ''
}

function dataToValuesIn(rootHtml) {
  const out = []
  const re = /data-to\s*=\s*"([^"]*)"/g
  let m
  while ((m = re.exec(rootHtml))) out.push(m[1])
  return out
}

function edgeGaps(journey, readHtml) {
  const labels = (journey && journey.labels) || []
  const edges = (journey && journey.edges) || []
  const declared = (journey && journey.declared) || labels
  const rootCache = new Map()
  const rootFor = (label) => {
    if (rootCache.has(label)) return rootCache.get(label)
    const html = readHtml(label) || ''
    const root = findRootHtml(html, label)
    rootCache.set(label, root)
    return root
  }

  const missing = []
  for (const edge of edges) {
    const from = edge[0]
    const to = edge[1]
    if (!dataToValuesIn(rootFor(from)).includes(to)) missing.push({ from, to })
  }

  const unknown = []
  for (const label of labels) {
    for (const to of dataToValuesIn(rootFor(label))) {
      if (!declared.includes(to)) unknown.push({ from: label, to })
    }
  }

  return { missing, unknown }
}

// D3: walks one record object (or nested array/object) collecting every string value of length
// >= 3 into `out`, deduplicated via `seen` (first-seen order preserved — the order callers and
// tests observe). A number is stringified before the length test; a bare `14` stringifies to
// two characters and is never collected.
function walkRecordValues(node, out, seen) {
  if (node == null) return
  if (typeof node === 'string') {
    if (node.length >= 3 && !seen.has(node)) { seen.add(node); out.push(node) }
    return
  }
  if (typeof node === 'number') {
    const s = String(node)
    if (s.length >= 3 && !seen.has(s)) { seen.add(s); out.push(s) }
    return
  }
  if (Array.isArray(node)) { for (const v of node) walkRecordValues(v, out, seen); return }
  if (typeof node === 'object') { for (const k of Object.keys(node)) walkRecordValues(node[k], out, seen); return }
}

function recordValues(records) {
  const out = []
  const seen = new Set()
  for (const rec of records || []) walkRecordValues(rec, out, seen)
  return out
}

function recordHits(values, html) {
  const text = html || ''
  return (values || []).filter((v) => text.includes(v))
}

// D1: parses "<entity>[<i>].<field>" — entity `[a-z0-9][a-z0-9-]*`, the first segment always a
// bracketed top-level index, the rest a run of `.<key>` / `[<n>]` segments — and walks
// `recordsByEntity[entity][i]` one segment at a time, returning `{value}` (stringified) or
// `{reason}` naming the first segment that failed. Internal: `resolveRecordRef` below wraps
// `reason` with the reference text for the exported `{error}` shape; `recordBindingViolations`
// uses this directly so it never has to re-parse `error` back apart.
function resolveRefCore(recordsByEntity, ref) {
  const m = /^([a-z0-9][a-z0-9-]*)\[(\d+)\](.*)$/.exec(String(ref || ''))
  if (!m) return { reason: 'is not a valid data-record reference — expected <entity>[<i>].<field>' }
  const entity = m[1]
  const index = Number(m[2])
  const rest = m[3]
  const list = Array.isArray(recordsByEntity && recordsByEntity[entity]) ? recordsByEntity[entity] : []
  if (index < 0 || index >= list.length) {
    return { reason: 'records/' + entity + '.json holds ' + list.length + ' record' + (list.length === 1 ? '' : 's') }
  }
  let node = list[index]
  const segRe = /\.([a-zA-Z0-9_]+)|\[(\d+)\]/g
  let sm
  let consumed = 0
  while ((sm = segRe.exec(rest))) {
    consumed = segRe.lastIndex
    if (sm[1] !== undefined) {
      const key = sm[1]
      if (node === null || typeof node !== 'object' || Array.isArray(node) || !Object.prototype.hasOwnProperty.call(node, key)) {
        return { reason: 'the record has no field "' + key + '"' }
      }
      node = node[key]
    } else {
      const idx = Number(sm[2])
      if (!Array.isArray(node) || idx < 0 || idx >= node.length) {
        return { reason: 'the record has no index [' + idx + ']' }
      }
      node = node[idx]
    }
  }
  if (consumed !== rest.length) {
    return { reason: 'is not a valid data-record reference — expected <entity>[<i>].<field>' }
  }
  if (typeof node === 'string' || typeof node === 'number') return { value: String(node) }
  return { reason: 'the resolved value is not a string or number' }
}

function resolveRecordRef(recordsByEntity, ref) {
  const r = resolveRefCore(recordsByEntity, ref)
  if (r.value !== undefined) return { value: r.value }
  return { error: ref + ' does not resolve — ' + r.reason }
}

function stripTags(s) { return String(s).replace(/<[^>]*>/g, '') }
function collapseWs(s) { return String(s).replace(/\s+/g, ' ').trim() }

// D1: matches `data-record\s*=` anchored on a preceding whitespace/tag-open boundary (never
// `\b`, which "record" immediately followed by "ed" would already survive but a stray prefixed
// attribute would not) — admits double, single and unquoted values.
function dataRecordRef(attrs) {
  const m = /(^|\s)data-record\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/.exec(attrs)
  if (!m) return null
  return m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4]
}

function boundBindings(html) {
  const stripped = stripComments(html)
  const out = []
  const openRe = /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g
  let m
  while ((m = openRe.exec(stripped))) {
    const tag = m[1]
    const attrs = m[2]
    const ref = dataRecordRef(attrs)
    if (ref === null) continue
    const contentStart = openRe.lastIndex
    const tagRe = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'gi')
    tagRe.lastIndex = contentStart
    let depth = 1
    let closeStart = stripped.length
    let closeEnd = stripped.length
    let mm
    while ((mm = tagRe.exec(stripped))) {
      if (mm[1]) { depth -= 1; if (depth === 0) { closeStart = mm.index; closeEnd = tagRe.lastIndex; break } } else depth += 1
    }
    const text = collapseWs(stripTags(stripped.slice(contentStart, closeStart)))
    out.push({ ref, text, start: m.index, end: closeEnd })
    openRe.lastIndex = closeEnd
  }
  return out
}

// D3: per-record string sets (reusing `walkRecordValues`'s length->=3, dedup-within-node walk,
// but fresh per record so a value's count is "how many records", not "how many entities").
function stringsInRecord(rec) {
  const out = []
  walkRecordValues(rec, out, new Set())
  return out
}

function distinctiveValues(recordsByEntity) {
  const counts = new Map()
  for (const entity of Object.keys(recordsByEntity || {})) {
    const list = Array.isArray(recordsByEntity[entity]) ? recordsByEntity[entity] : []
    for (const rec of list) {
      for (const v of stringsInRecord(rec)) counts.set(v, (counts.get(v) || 0) + 1)
    }
  }
  const out = new Set()
  for (const [v, n] of counts) {
    if (n === 1 && (v.includes(' ') || v.length >= 8)) out.add(v)
  }
  return out
}

function allSeedValues(recordsByEntity) {
  const out = []
  const seen = new Set()
  for (const entity of Object.keys(recordsByEntity || {})) {
    const list = Array.isArray(recordsByEntity[entity]) ? recordsByEntity[entity] : []
    for (const v of recordValues(list)) if (!seen.has(v)) { seen.add(v); out.push(v) }
  }
  return out
}

function maskSpans(text, spans) {
  const chars = text.split('')
  for (const span of spans) {
    for (let i = span[0]; i < span[1] && i < chars.length; i++) chars[i] = ' '
  }
  return chars.join('')
}

function recordBindingViolations(html, label, recordsByEntity) {
  const stripped = stripComments(html)
  const bindings = boundBindings(stripped)
  const violations = []
  const warns = []

  for (const b of bindings) {
    const r = resolveRefCore(recordsByEntity, b.ref)
    if (r.value === undefined) {
      violations.push(label + ': data-record="' + b.ref + '" does not resolve — ' + r.reason)
      continue
    }
    if (b.text !== r.value) {
      violations.push(label + ': data-record="' + b.ref + '" shows "' + b.text +
        '" but the record says "' + r.value + '" — bind the record, never a retyped copy')
    }
  }

  const masked = maskSpans(stripped, bindings.map((b) => [b.start, b.end]))
  const outsideText = stripTags(masked)
  const distinctive = distinctiveValues(recordsByEntity)
  for (const v of allSeedValues(recordsByEntity)) {
    if (!outsideText.includes(v)) continue
    if (distinctive.has(v)) {
      violations.push(label + ': "' + v + '" appears outside any data-record element — a screen names the record it shows')
    } else {
      warns.push('⚠️ ' + label + ': "' + v + '" appears outside any data-record element — bind it if it is the record\'s value rather than the product\'s own word')
    }
  }

  return { violations, warns }
}

module.exports = {
  edgeGaps, recordValues, recordHits,
  resolveRecordRef, boundBindings, distinctiveValues, recordBindingViolations,
}
