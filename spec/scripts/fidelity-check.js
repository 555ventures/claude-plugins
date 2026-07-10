#!/usr/bin/env node
// Deterministic mock↔code fidelity gate for /spec:design's mockup path.
//
// WHY this exists: the design stage's acceptance criterion — "the code reproduces the mock" — was
// the one thing no gate checked. Typecheck/lint prove structure; the human catalog loop was the
// only fidelity instrument, so copy drift ("Send invite" → "Send"), reordered actions, and
// collapsed layouts surfaced only when a person caught them. Every one of those divergence classes
// is mechanically checkable against the fidelity contract `dc-extract` already writes, so this
// script checks them — zero model tokens, fail-closed. The driver runs it before accepting
// `--mark author-green` and `--mark round-green`; a red check refuses the mark.
//
// What it checks, per extract.json surface, against the files its skeletons own:
//   - strings: every user-visible mock string appears VERBATIM (whitespace/quote-normalized) in
//     the surface's componentPath/storyPath files — or anywhere in the pass's file set (copy
//     legitimately lives in fixtures); missing = FAIL. Composite strings mixing copy with
//     INSTANCE data ("Remove Jamie Chen") also pass when a code interpolation template matches
//     them (`Remove ${member.name}` / JSX `Invited {date}`) — static segments must align in
//     order, anchored, with ≥1 meaningful segment; a pure-hole template ({label}) excuses
//     nothing. Bare instance strings ("Jamie Chen") have no static part, so they must appear
//     verbatim SOMEWHERE in the pass — story fixtures are the natural home, and carrying the
//     mock's sample data there is what keeps the catalog render comparable to the mock.
//   - order: within each file, mock strings that are unique (in the mock and the file) must appear
//     in the mock's document order; a swap = FAIL (catches Send-then-Cancel → Cancel-then-Send).
//   - layout: each mock layout primitive (grid-template-columns …) must appear in the surface's
//     files — raw CSS, camelCase style-object, or Tailwind (arbitrary `[1fr_auto]` and semantic
//     `flex-col`/`order-N`) forms all count; absent = FAIL.
//
// The ONLY exemption is an evidence-gated delta row in <sidecar>/deltas.json:
//   { deltas: [{ surfaceId, kind: "string"|"order"|"layout", target, sliceQuote, proof }] }
// where `target` is the exact mock string (or "property: value" for layout), `sliceQuote` is a
// verbatim quote THIS SCRIPT VERIFIES against the surface's slice file, and `proof` names the
// mechanical impossibility (failing build output, absent token/primitive, a grounded rule id).
// A delta whose quote does not occur in the slice is itself a failure — taste can't forge evidence.
// A surface in the mock with no skeleton is a NOTE, not a failure (a spec may cover a subset).
//
// CONTRACT: `node fidelity-check.js <sidecarDir> [--repo-root <dir>]`. Exit 0 = clean (or no
// fidelity data — a schemaVersion-1 extract predating the contract); 1 = unexcused findings,
// each printed linter-style; 2 = unusable inputs (no skeletons.json to map surfaces to files).

'use strict'
const fs = require('fs')
const path = require('path')

function die(msg) { process.stderr.write('fidelity-check: ' + msg + '\n'); process.exit(2) }

const argv = process.argv.slice(2)
const sidecar = argv[0]
if (!sidecar || sidecar.startsWith('--')) die('usage: fidelity-check <sidecarDir> [--repo-root <dir>]')
const rrIdx = argv.indexOf('--repo-root')
const repoRoot = rrIdx > -1 ? argv[rrIdx + 1] : process.cwd()

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null }
}

const extract = readJson(path.join(sidecar, 'extract.json'))
if (!extract) { process.stdout.write('fidelity-check: no extract.json — no mock bound; nothing to check\n'); process.exit(0) }
const surfaces = (extract.surfaces || []).filter(s => (s.strings && s.strings.length) || (s.layout && s.layout.length))
if (!surfaces.length) { process.stdout.write('fidelity-check: extract.json carries no fidelity data (pre-contract extract) — nothing to check\n'); process.exit(0) }

const skDoc = readJson(path.join(sidecar, 'skeletons.json'))
if (!skDoc || !Array.isArray(skDoc.skeletons)) die('no valid skeletons.json in ' + sidecar + ' — cannot map surfaces to files; run the check after the skeleton step')
const skeletons = skDoc.skeletons

// ---- normalization -------------------------------------------------------------------------------
// Both needles and haystacks are compared whitespace-collapsed with typographic quotes and the
// common JSX entity escapes normalized, so `Email&nbsp;address`, `Email  address`, and
// “smart-quoted” variants all count as the same copy.
function norm(s) {
  return String(s)
    .replace(/&nbsp;| /g, ' ')
    .replace(/&amp;/g, '&').replace(/&(apos|#39);/g, "'").replace(/&quot;/g, '"')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}
const compact = s => norm(s).toLowerCase().replace(/\s+/g, '')
const compactNoQuotes = s => compact(s).replace(/["']/g, '')

// ---- surface → files mapping ---------------------------------------------------------------------
// A mock surface may be split across several skeletons (one screen → N components): the surface's
// file set is the union of every skeleton whose sliceRef names its slice (or whose id matches).
function filesOf(sk) {
  return [sk.componentPath, sk.storyPath].filter(v => typeof v === 'string' && v.length > 0)
}
const allFiles = [...new Set(skeletons.flatMap(filesOf))]
const contentCache = new Map()
function contentOf(rel) {
  if (!contentCache.has(rel)) {
    try { contentCache.set(rel, fs.readFileSync(path.resolve(repoRoot, rel), 'utf8')) }
    catch { contentCache.set(rel, null) }
  }
  return contentCache.get(rel)
}

// ---- deltas (the evidence-gated exemption list) --------------------------------------------------
const deltaDoc = readJson(path.join(sidecar, 'deltas.json'))
const deltas = (deltaDoc && Array.isArray(deltaDoc.deltas)) ? deltaDoc.deltas : []
const failures = []
const notes = []
const excused = []

const validDeltas = []
for (const [i, d] of deltas.entries()) {
  const at = 'deltas[' + i + ']'
  if (!d || typeof d !== 'object' || typeof d.surfaceId !== 'string' || typeof d.target !== 'string' ||
      !['string', 'order', 'layout'].includes(d.kind)) {
    failures.push(at + ': malformed — need {surfaceId, kind: string|order|layout, target, sliceQuote, proof}')
    continue
  }
  if (typeof d.proof !== 'string' || !d.proof.trim()) {
    failures.push(at + ' (' + d.target + '): empty proof — a delta must name the mechanical impossibility; taste is not a proof')
    continue
  }
  const surf = surfaces.find(s => s.id === d.surfaceId) || (extract.surfaces || []).find(s => s.id === d.surfaceId)
  const slice = surf ? fs.existsSync(path.join(sidecar, surf.sliceFile)) && fs.readFileSync(path.join(sidecar, surf.sliceFile), 'utf8') : null
  if (!slice || typeof d.sliceQuote !== 'string' || !d.sliceQuote.trim() || !norm(slice).includes(norm(d.sliceQuote))) {
    failures.push(at + ' (' + d.target + '): sliceQuote not found verbatim in the surface\'s slice — a delta must quote the mock line it diverges from')
    continue
  }
  validDeltas.push(d)
}
function excuse(surfaceId, kind, target) {
  const d = validDeltas.find(v => v.surfaceId === surfaceId && v.kind === kind && norm(v.target) === norm(target))
  if (d) excused.push(surfaceId + ' ' + kind + ' "' + target + '" — excused (proof: ' + d.proof.trim() + ')')
  return !!d
}

// ---- interpolation templates ---------------------------------------------------------------------
// A verbatim grep can never find a composite string the code correctly renders from a template,
// and demanding a delta row per sample row ("Remove Jamie Chen", "Remove Sam Patel", …) is pure
// friction. So: collect every interpolation template the code declares and match the mock string
// against its STATIC segments. Two template shapes cover the JSX idioms: template literals with
// ${…} holes, and JSX text runs between tags with {…} holes. Guards that keep this narrow:
//   - a template needs ≥1 static segment of ≥3 chars — `${label}` / {copy} match everything and
//     excuse nothing (that all-hole dodge is exactly what the gate exists to close);
//   - segments match in order, and a template without a leading/trailing hole is anchored at
//     that end — `invite ${n}` cannot claim "Send invite".
// Each raw segment list keeps its ''s: an empty first/last segment IS the leading/trailing hole.
function templatesOf(content) {
  const out = []
  for (const m of content.matchAll(/`([^`]*)`/g)) {
    if (m[1].includes('${')) out.push(m[1].split(/\$\{[^}]*\}/))
  }
  for (const m of content.matchAll(/>([^<>{}]*(?:\{[^{}]*\}[^<>{}]*)+)</g)) {
    out.push(m[1].split(/\{[^{}]*\}/))
  }
  return out.filter(segs => segs.some(seg => norm(seg).length >= 3))
}
function matchesTemplate(segs, needle) {
  // whitespace-only edge segments count as holes for anchoring — norm() collapses them anyway
  const leadAnchor = norm(segs[0]) !== ''
  const tailAnchor = norm(segs[segs.length - 1]) !== ''
  let pos = 0
  for (let i = 0; i < segs.length; i++) {
    const seg = norm(segs[i])
    if (!seg) continue
    const at = needle.indexOf(seg, pos)
    if (at === -1) return false
    if (i === 0 && leadAnchor && at !== 0) return false // no leading hole → anchor the start
    pos = at + seg.length
  }
  if (tailAnchor && pos !== needle.length) return false // no trailing hole → anchor the end
  return true
}
const templateCache = new Map() // rel → segs[][]
function templateHit(files, needle) {
  for (const rel of files) {
    const c = contentOf(rel)
    if (c === null) continue
    if (!templateCache.has(rel)) templateCache.set(rel, templatesOf(c))
    if (templateCache.get(rel).some(segs => matchesTemplate(segs, needle))) return rel
  }
  return null
}

// ---- layout candidates ---------------------------------------------------------------------------
const TW_FLEX = { column: 'flex-col', row: 'flex-row', 'column-reverse': 'flex-col-reverse', 'row-reverse': 'flex-row-reverse' }
function layoutCandidates(property, value) {
  const camel = property.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
  const cands = [property + ':' + value, camel + ':' + value]
  if (property.startsWith('grid-template')) {
    cands.push(value)                        // raw CSS value ("1fr auto") anywhere
    cands.push(value.replace(/\s+/g, '_'))   // Tailwind arbitrary value ("[1fr_auto]")
  }
  if (property === 'flex-direction' && TW_FLEX[value]) cands.push(TW_FLEX[value])
  if (property === 'order') cands.push('order-' + value)
  return cands
}
function layoutFound(files, property, value) {
  const cands = layoutCandidates(property, value)
  for (const rel of files) {
    const c = contentOf(rel)
    if (c === null) continue
    const hay = [compact(c), compactNoQuotes(c), norm(c).toLowerCase()]
    for (const cand of cands) {
      const needles = [compact(cand), compactNoQuotes(cand), norm(cand).toLowerCase()]
      if (needles.some(n => n && hay.some(h => h.includes(n)))) return true
    }
  }
  return false
}

// ---- the checks ----------------------------------------------------------------------------------
let checkedStrings = 0
let interpolated = 0
for (const surf of surfaces) {
  const owners = skeletons.filter(sk =>
    (typeof sk.sliceRef === 'string' && (sk.sliceRef === surf.sliceFile || sk.sliceRef.endsWith('/' + surf.sliceFile))) ||
    sk.id === surf.id)
  if (!owners.length) {
    notes.push('surface "' + surf.id + '" has no skeleton — not planned by this spec; skipped')
    continue
  }
  const files = [...new Set(owners.flatMap(filesOf))]
  const missingFiles = files.filter(f => contentOf(f) === null)
  for (const f of missingFiles) failures.push(surf.id + ': mapped file ' + f + ' does not exist on disk — cannot verify fidelity')
  const readable = files.filter(f => contentOf(f) !== null)

  // strings: verbatim presence (surface files first, then the whole pass's file set)
  const strings = surf.strings || []
  const mockCount = new Map()
  for (const s of strings) mockCount.set(norm(s), (mockCount.get(norm(s)) || 0) + 1)
  const foundAt = new Map() // norm(string) → {file, index} for the order check
  for (const s of strings) {
    checkedStrings++
    const needle = norm(s)
    let where = null
    for (const f of readable) {
      const idx = norm(contentOf(f)).indexOf(needle)
      if (idx > -1) { where = { file: f, index: idx }; break }
    }
    if (!where) {
      // composite copy+instance-data strings pass via a code interpolation template; template
      // hits stay OUT of the order check — N sample rows match ONE template at one position
      if (templateHit(readable, needle)) { interpolated++; continue }
      const elsewhere = allFiles.find(f => !files.includes(f) && contentOf(f) !== null && norm(contentOf(f)).includes(needle))
      if (elsewhere) { notes.push(surf.id + ': "' + s + '" found in ' + elsewhere + ' (outside the surface\'s own files)'); continue }
      if (!excuse(surf.id, 'string', s)) {
        failures.push(surf.id + ': string "' + s + '" missing — the mock copy does not appear in ' +
          (readable.length ? readable.join(', ') : '(no readable files)') + ' nor anywhere in the pass (verbatim or via an interpolation template)')
      }
      continue
    }
    if (!foundAt.has(needle)) foundAt.set(needle, where)
  }

  // order: unique-in-mock strings found in the SAME file must be in mock document order
  const byFile = new Map()
  for (const s of strings) {
    const needle = norm(s)
    if (mockCount.get(needle) !== 1) continue
    const hit = foundAt.get(needle)
    if (!hit) continue
    const hay = norm(contentOf(hit.file))
    // unique in the file too — a repeated occurrence makes first-index ordering meaningless
    if (hay.indexOf(needle) !== hay.lastIndexOf(needle)) continue
    if (!byFile.has(hit.file)) byFile.set(hit.file, [])
    byFile.get(hit.file).push({ s, index: hit.index })
  }
  for (const [file, hits] of byFile) {
    for (let i = 1; i < hits.length; i++) {
      if (hits[i].index < hits[i - 1].index) {
        if (!excuse(surf.id, 'order', hits[i].s) && !excuse(surf.id, 'order', hits[i - 1].s)) {
          failures.push(surf.id + ': order — "' + hits[i].s + '" appears BEFORE "' + hits[i - 1].s +
            '" in ' + file + ' but AFTER it in the mock')
        }
      }
    }
  }

  // layout primitives
  for (const { property, value } of surf.layout || []) {
    if (!layoutFound(readable, property, value)) {
      if (!excuse(surf.id, 'layout', property + ': ' + value)) {
        failures.push(surf.id + ': layout — `' + property + ': ' + value + '` from the mock not found in ' +
          (readable.length ? readable.join(', ') : '(no readable files)') + ' (raw CSS, camelCase, or Tailwind forms all count)')
      }
    }
  }
}

for (const n of notes) process.stdout.write('note: ' + n + '\n')
for (const e of excused) process.stdout.write('excused: ' + e + '\n')
if (failures.length) {
  process.stderr.write('fidelity-check: ' + failures.length + ' unexcused divergence(s) from the mock:\n')
  for (const f of failures) process.stderr.write('  - ' + f + '\n')
  process.stderr.write('Fix the code to match the mock, or record an evidence-gated delta in ' +
    path.join(sidecar, 'deltas.json') + ' (verbatim sliceQuote + mechanical proof).\n')
  process.exit(1)
}
process.stdout.write('fidelity-check: ' + surfaces.length + ' surface(s), ' + checkedStrings +
  ' string(s) verified' + (interpolated ? ' (' + interpolated + ' via interpolation template)' : '') +
  (excused.length ? ', ' + excused.length + ' excused by delta' : '') + ' — clean\n')
