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
// Exit codes: n/a (library, not an entrypoint).

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

module.exports = { edgeGaps, recordValues, recordHits }
