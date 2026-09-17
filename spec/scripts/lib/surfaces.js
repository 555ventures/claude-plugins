'use strict'
// lib/surfaces.js — the one parser of the roadmap ```surfaces line grammar (a bare label, an
// `a -> b` edge, a `#` comment) and of the seed's beat grammar (`N. "sentence" -> screen[@state]`)
// (specs/20260908/02-driver-dedupe-onto-lib.md D1; specs/20260917/01-the-client-confirms-the-
// story.md D2). The roadmap grammar and the seed's beat grammar are unrelated surfaces sharing
// this module only because both parse a small line-oriented format: `parseSurfacesPlacement`
// folds `docs/roadmap/**.md`'s ```surfaces blocks (genesis's every-brief-without-edges fold,
// tracking every declaring brief so it can catch a double-placement); `parseSeedJourneys` folds
// `design/mocks/seed.md`'s `### <journey>` blocks over the beat grammar, returning each journey's
// beats verbatim plus `labels`/`edges` derived from them (genesis's `briefJourneysCheck` and
// `journeyPlacementCheck` still read `labels` directly) and any body line that isn't a
// well-numbered beat as `malformed`. `beatHash(beats)` is the one hash of a journey's story — the
// driver, `client waive` and the client page's confirm control all compute it the same way, over
// the beats' canonical `beat -> screen[@state]` lines.
//
// What this deliberately does NOT do: read any file itself for `parseSurfaceLines` or
// `parseSeedJourneys` — `parseSeedJourneys` takes the seed's already-read text (`null` on a cold
// root) so this module stays free of path policy; only `parseSurfacesPlacement` takes a
// directory, since its caller already agrees roadmap briefs live at `docs/roadmap/**.md`. Does
// not validate a beat's `screen`/`state` against any registered screen name — that is the
// reviewer's `check --json`, read by the driver's own D4/D5 marks, not this parser. The retired
// atlas's first-brief-wins-with-edges fold (`parseSurfaces`) is gone with the atlas it built — no
// caller has spawned it since (D2).
//
// Exit codes: n/a (library, not an entrypoint).

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

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

// D1's beat line — the one parser: `N. "sentence" -> screen[@state]`. Quotes are mandatory;
// `screen`/`state` match `^[\w][\w-]*$`; `@state` is optional.
const BEAT_RE = /^(\d+)\.\s+"(.+)"\s*->\s*([\w][\w-]*)(?:@([\w][\w-]*))?\s*$/

// D2: sha256 over the canonical `beat -> screen[@state]` lines, joined by "\n", first 12 hex —
// the one hash of a journey's story, shared by every mark and the client page's confirm control.
function beatHash(beats) {
  const canonical = beats
    .map((b) => `${b.beat} -> ${b.screen}` + (b.state ? `@${b.state}` : ''))
    .join('\n')
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 12)
}

// design/mocks/seed.md's `### <journey-kebab>` blocks: the first non-blank body line is the
// persona; every following non-blank line is either a well-numbered beat (`beats`) or reported in
// `malformed` — the raw line text for a line that doesn't match the beat grammar at all, or the
// exact `numbering: expected <k>, got <n>` string for a beat line whose number breaks contiguous
// counting from 1. `labels` (screen targets, deduplicated in beat order) and `edges` (every
// consecutive beat pair whose screens differ) are derived from `beats`. `text === null` (a cold
// root with no seed.md yet) returns an empty Map.
function parseSeedJourneys(text) {
  const journeys = new Map() // kebab -> {persona, beats, malformed, labels, edges}
  if (text === null) return journeys
  const stripped = text.replace(/<!--[\s\S]*?-->/g, '')
  const starts = []
  const re = /^### ([a-z0-9-]+)\s*$/gm
  let m
  while ((m = re.exec(stripped))) starts.push({ name: m[1], index: m.index, headerEnd: m.index + m[0].length })
  for (let i = 0; i < starts.length; i++) {
    const body = stripped.slice(starts[i].headerEnd, i + 1 < starts.length ? starts[i + 1].index : stripped.length)
    const bodyLines = body.split('\n')
    let persona = ''
    let personaSeen = false
    const beats = []
    const malformed = []
    let expected = 1
    for (const raw of bodyLines) {
      const line = raw.trim()
      if (!line) continue
      if (!personaSeen) { persona = line; personaSeen = true; continue }
      const bm = BEAT_RE.exec(line)
      if (!bm) { malformed.push(line); continue }
      const n = parseInt(bm[1], 10)
      if (n !== expected) malformed.push(`numbering: expected ${expected}, got ${n}`)
      beats.push({ n, beat: bm[2], screen: bm[3], state: bm[4] || null })
      expected = n + 1
    }
    const labels = []
    for (const b of beats) if (!labels.includes(b.screen)) labels.push(b.screen)
    const edges = []
    for (let k = 1; k < beats.length; k++) {
      if (beats[k - 1].screen !== beats[k].screen) edges.push([beats[k - 1].screen, beats[k].screen])
    }
    journeys.set(starts[i].name, { persona, beats, malformed, labels, edges })
  }
  return journeys
}

// genesis's fold over the roadmap directory: every declaring brief FILE NAME per label (no
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

module.exports = { parseSurfaceLines, parseSeedJourneys, parseSurfacesPlacement, beatHash }
