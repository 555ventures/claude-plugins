'use strict'
// lib/surfaces.js — the one parser of the ```surfaces line grammar (a bare label, an `a -> b`
// edge, a `#` comment), shared by design-atlas.js and genesis-driver.js
// (specs/20260908/02-driver-dedupe-onto-lib.md D1). The drivers fold over it differently and
// both folds ship here: genesis's placement check tracks every declaring brief and returns no
// edges (it must catch a double-placement), design-atlas's build keeps only the first declaring
// brief and returns edges (it renders a journey graph). Exported: the grammar itself,
// `parseSurfaceLines`, plus three folds over it — `parseSeedJourneys` (design/mocks/seed.md's
// `### <journey>` blocks), `parseSurfaces` (design-atlas's first-brief-wins-with-edges fold over
// docs/roadmap/**.md), and `parseSurfacesPlacement` (genesis's every-brief-without-edges fold
// over the same directory).
//
// What this deliberately does NOT do: read any file itself for `parseSurfaceLines` or
// `parseSeedJourneys` — `parseSeedJourneys` takes the seed's already-read text (`null` on a cold
// root) so this module stays free of path policy; only `parseSurfaces`/`parseSurfacesPlacement`
// take a directory, because both drivers already agree roadmap briefs live at
// `docs/roadmap/**.md`. Does not merge or reconcile the two roadmap folds into one shape —
// `parseSurfaces`'s `node.brief` is an absolute path (design-atlas's cards link to it),
// `parseSurfacesPlacement`'s values are file *names* (genesis's placement check reports them by
// name) — collapsing them would silently change one caller's semantics.
//
// Exit codes: n/a (library, not an entrypoint).

const fs = require('fs')
const path = require('path')

// The tiny grammar itself. A label matches /^[\w][\w-]*$/. Blank lines, `#`-comments, and lines
// matching neither an edge nor a bare label are dropped.
function parseSurfaceLines(block) {
  const out = []
  for (const raw of block.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const edge = line.split('->').map((s) => s.trim())
    if (edge.length === 2 && edge[0] && edge[1]) {
      out.push({ labels: [edge[0], edge[1]], edge: [edge[0], edge[1]] })
    } else if (/^[\w][\w-]*$/.test(line)) {
      out.push({ labels: [line], edge: null })
    }
  }
  return out
}

// design/mocks/seed.md's `### <journey-kebab>` blocks: the first non-blank body line is the
// persona, a ```surfaces fenced block is the journey's own labels/edges (deduplicated, in
// declaration order). `text === null` (a cold root with no seed.md yet) returns an empty Map.
function parseSeedJourneys(text) {
  const journeys = new Map() // kebab -> {persona, labels, edges}
  if (text === null) return journeys
  const stripped = text.replace(/<!--[\s\S]*?-->/g, '')
  const starts = []
  const re = /^### ([a-z0-9-]+)\s*$/gm
  let m
  while ((m = re.exec(stripped))) starts.push({ name: m[1], index: m.index, headerEnd: m.index + m[0].length })
  for (let i = 0; i < starts.length; i++) {
    const body = stripped.slice(starts[i].headerEnd, i + 1 < starts.length ? starts[i + 1].index : stripped.length)
    let persona = ''
    for (const l of body.split('\n')) { if (l.trim()) { persona = l.trim(); break } }
    const surf = body.match(/```surfaces\n([\s\S]*?)```/)
    const labels = []
    const edges = []
    if (surf) {
      for (const line of parseSurfaceLines(surf[1])) {
        if (line.edge) edges.push(line.edge)
        for (const l of line.labels) if (!labels.includes(l)) labels.push(l)
      }
    }
    journeys.set(starts[i].name, { persona, labels, edges })
  }
  return journeys
}

// design-atlas's fold: every fenced ```surfaces block across docs/roadmap/**.md (sorted file
// order), keeping the FIRST declaring brief per label and every edge seen. A missing roadmap dir
// returns empty structures, never throws.
function parseSurfaces(roadmapDir) {
  const nodes = new Map()   // label -> {brief: absolutePath}
  const edges = []          // [from, to]
  if (!fs.existsSync(roadmapDir)) return { nodes, edges }
  const mds = fs.readdirSync(roadmapDir).sort().filter((f) => f.endsWith('.md')).map((f) => path.join(roadmapDir, f))
  for (const md of mds) {
    const text = fs.readFileSync(md, 'utf8')
    for (const m of text.matchAll(/```surfaces\n([\s\S]*?)```/g)) {
      for (const line of parseSurfaceLines(m[1])) {
        for (const l of line.labels) if (!nodes.has(l)) nodes.set(l, { brief: md })
        if (line.edge) edges.push(line.edge)
      }
    }
  }
  return { nodes, edges }
}

// genesis's fold over the same directory: every declaring brief FILE NAME per label (no
// first-wins, no edges) — genesis's placement check must catch a label declared by two briefs,
// not just an absence. A missing roadmap dir returns an empty Map, never throws.
function parseSurfacesPlacement(roadmapDir) {
  const byLabel = new Map() // label -> [brief file name, ...]
  let files = []
  try { files = fs.readdirSync(roadmapDir).sort().filter((f) => f.endsWith('.md')) } catch (e) { files = [] }
  for (const f of files) {
    const text = fs.readFileSync(path.join(roadmapDir, f), 'utf8')
    const seenInFile = new Set()
    for (const m of text.matchAll(/```surfaces\n([\s\S]*?)```/g)) {
      for (const line of parseSurfaceLines(m[1])) {
        for (const l of line.labels) {
          if (seenInFile.has(l)) continue
          seenInFile.add(l)
          if (!byLabel.has(l)) byLabel.set(l, [])
          byLabel.get(l).push(f)
        }
      }
    }
  }
  return byLabel
}

module.exports = { parseSurfaceLines, parseSeedJourneys, parseSurfaces, parseSurfacesPlacement }
