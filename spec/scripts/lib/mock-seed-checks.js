'use strict'
// lib/mock-seed-checks.js — edgeGaps(journey, readHtml): compares a journey's seed edges
// (design/mocks/seed.md's ```surfaces block, read via lib/surfaces.js's parseSeedJourneys)
// against the `data-to="<label>"` controls actually drawn in each mock.
// specs/20260910/02-click-to-advance-and-real-records.md D1/D2 — mocks-driver.js's
// `journey-drawn` refuses on any `missing` or `unknown` entry (AC-20260910-02-1,
// AC-20260910-02-2).
//
// `journey` is `{labels, edges}` (edges: `[from, to]` pairs); `readHtml(label)` returns that
// label's mock source or a falsy value. Pure: no `fs`, no path policy, no network — the caller
// owns how a label's HTML is read. Does NOT parse full HTML into a DOM: a mock's
// `[data-screen-label]` root is located by regex-matched tag nesting (open/close tags of the
// same name), which is sufficient for the hand-authored, non-pathological markup mocks are —
// it deliberately does not handle self-closing variants of the root tag or malformed HTML.
// A `data-to` sitting outside the root (after it closes) counts as absent, never as unknown.
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
      if (!labels.includes(to)) unknown.push({ from: label, to })
    }
  }

  return { missing, unknown }
}

module.exports = { edgeGaps }
