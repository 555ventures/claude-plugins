#!/usr/bin/env node
// Deterministic mock↔code fidelity gate for /spec:design's mockup path.
//
// WHY this exists: the design stage's acceptance criterion — "the code reproduces the mock" — was
// the one thing no gate checked. Copy drift ("Send invite" → "Send"), reordered actions, and
// collapsed layouts are mechanically checkable against the contract `dc-extract` writes, so this
// script checks them — zero model tokens, fail-closed. The driver runs it before accepting
// `--mark author-green` and `--mark round-green`; a red check refuses the mark.
//
// v2 — the contract is REGION-SCOPED and expressed in REPO-NATIVE obligations:
//   - A skeleton binds a REGION (`regionRef: "<surfaceId>#<regionId>"`), not a whole screen.
//     The gate fails closed ONLY inside bound regions (binding a region covers its subtree);
//     unbound regions are a note — a spec legitimately covers a slice of a screen, and later
//     briefs inherit the remainder (the driver's coverage ledger tracks that). Legacy `sliceRef`
//     (or a skeleton id matching the surface id) binds the surface's root region — everything.
//   - COPY may live in the code files OR as a VALUE in a declared i18n catalog
//     (spec.config.json design.copyCatalogs) — i18n stacks FORBID literals in components, so the
//     catalog is copy's first-class home. Catalog values with `{holes}` template-match composite
//     mock strings. Order is checked only within code files; catalog key order is arbitrary.
//   - String CLASSES check differently: `copy` = verbatim presence + order; `template`
//     ("Invited {{ date }}") = each static segment present; `sample` (sc-for rows) = present
//     anywhere in the pass (catalog-entry fixtures are the natural home — that keeps the catalog render
//     comparable to the mock), exempt from order; `binding` ({{ b.name }}) = renders from a
//     prop, checked NOWHERE (v1 emitted these as literal contract rows — garbage obligations).
//   - Composite copy mixing INSTANCE data ("Remove Jamie Chen") also passes via a code
//     interpolation template (`Remove ${member.name}` / JSX `Invited {date}`) — static segments
//     align in order, anchored, ≥1 meaningful segment; a pure-hole template ({label}) excuses
//     nothing.
//   - layout: each bound region's primitives (grid-template-*, flex-direction, order) must
//     appear in the region's files — raw CSS, camelCase style-object, or Tailwind forms count.
//
// The ONLY exemption is an evidence-gated delta row in <sidecar>/deltas.json:
//   { deltas: [{ surfaceId, kind: "string"|"order"|"layout", target, sliceQuote, proof }] }
// where `target` is the exact mock string (or "property: value" for layout), `sliceQuote` is a
// verbatim quote THIS SCRIPT VERIFIES against the surface's slice file, and `proof` names the
// mechanical impossibility (failing build output, absent token/primitive, a grounded rule id).
// A delta whose quote does not occur in the slice is itself a failure — taste can't forge evidence.
//
// CONTRACT: `node fidelity-check.js <sidecarDir> [--repo-root <dir>]`. Exit 0 = clean (or no
// fidelity data); 1 = unexcused findings, each printed linter-style; 2 = unusable inputs (no
// skeletons.json to map regions to files). Reads <repoRoot>/.claude/spec.config.json for
// design.copyCatalogs. schemaVersion-2 extracts (flat per-surface strings) still check, as one
// root region.

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

// ---- normalization -------------------------------------------------------------------------------
// Both needles and haystacks are compared whitespace-collapsed with typographic quotes and the
// common JSX entity escapes normalized, so `Email&nbsp;address`, `Email  address`, and
// “smart-quoted” variants all count as the same copy.
function norm(s) {
  return String(s)
    .replace(/&nbsp;| /g, ' ')
    .replace(/&amp;/g, '&').replace(/&(apos|#39|rsquo|lsquo);/g, "'").replace(/&(quot|rdquo|ldquo);/g, '"')
    .replace(/&mdash;/g, '—').replace(/&hellip;/g, '…')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}
const compact = s => norm(s).toLowerCase().replace(/\s+/g, '')
const compactNoQuotes = s => compact(s).replace(/["']/g, '')

// ---- surface model (v3 regions/entries; v2 flat strings become one root region) -------------------
function surfaceModel(surf) {
  if (Array.isArray(surf.regions) && Array.isArray(surf.entries)) {
    return { regions: surf.regions, entries: surf.entries, layout: surf.layout || [] }
  }
  return {
    regions: [{ id: 'root', parent: null, source: 'root' }],
    entries: (surf.strings || []).map(v => ({ region: 'root', kind: 'copy', value: v })),
    layout: (surf.layout || []).map(l => ({ region: 'root', property: l.property, value: l.value })),
  }
}
const surfaces = (extract.surfaces || [])
  .map(s => ({ raw: s, ...surfaceModel(s) }))
  .filter(s => s.entries.length || s.layout.length)
if (!surfaces.length) { process.stdout.write('fidelity-check: extract.json carries no fidelity data — nothing to check\n'); process.exit(0) }

const skDoc = readJson(path.join(sidecar, 'skeletons.json'))
if (!skDoc || !Array.isArray(skDoc.skeletons)) die('no valid skeletons.json in ' + sidecar + ' — cannot map regions to files; run the check after the skeleton step')
const skeletons = skDoc.skeletons

const failures = []
const notes = []
const excused = []

// ---- copy catalogs (the i18n home for mock copy) --------------------------------------------------
// design.copyCatalogs in the host config names the message catalog files (e.g. app/messages/en.json).
// A mock copy string passes when it appears as a catalog VALUE — verbatim, or via a {hole} template
// ("Hello {name}" matches "Hello Jamie"). Order never applies to catalogs: key order is arbitrary.
const config = readJson(path.join(repoRoot, '.claude/spec.config.json')) || {}
const catalogPaths = (config.design && Array.isArray(config.design.copyCatalogs)) ? config.design.copyCatalogs : []
const catalogs = [] // {rel, values: Set<norm>, templates: [segs[]], text: norm(content)|null}
for (const rel of catalogPaths) {
  let content
  try { content = fs.readFileSync(path.resolve(repoRoot, rel), 'utf8') }
  catch { failures.push('copy catalog ' + rel + ' (spec.config.json design.copyCatalogs) is not readable — fix the config or restore the file'); continue }
  const cat = { rel, values: new Set(), templates: [], text: null }
  let doc = null
  try { doc = JSON.parse(content) } catch { cat.text = norm(content) } // non-JSON catalog: raw text haystack
  if (doc !== null) {
    const collect = (v) => {
      if (typeof v === 'string') {
        const n = norm(v)
        if (!n) return
        if (/\{[^{}]*\}/.test(n)) cat.templates.push(n.split(/\{[^{}]*\}/))
        else cat.values.add(n)
      } else if (Array.isArray(v)) v.forEach(collect)
      else if (v && typeof v === 'object') Object.values(v).forEach(collect)
    }
    collect(doc)
  }
  catalogs.push(cat)
}
function catalogHit(needle) {
  for (const cat of catalogs) {
    if (cat.values.has(needle)) return cat.rel
    if (cat.templates.some(segs => matchesTemplate(segs, needle))) return cat.rel
    if (cat.text !== null && cat.text.includes(needle)) return cat.rel
  }
  return null
}

// ---- skeleton → region binding ---------------------------------------------------------------------
// regionRef / regionRefs: "<surfaceId>#<regionId>" (or "<surfaceId>" = the root region).
// Legacy sliceRef (slice file name) and skeleton-id-matches-surface-id bind the root region.
function filesOf(sk) {
  return [sk.componentPath, sk.catalogEntryPath].filter(v => typeof v === 'string' && v.length > 0)
}
function refsOf(sk) {
  const raw = []
  if (typeof sk.regionRef === 'string') raw.push(sk.regionRef)
  if (Array.isArray(sk.regionRefs)) for (const r of sk.regionRefs) if (typeof r === 'string') raw.push(r)
  return raw
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
// A sanctioned verbatim-comment carrier (e.g. a mock-authority comment) wrapped across `//` lines
// would silently fail the contiguous match: norm() collapses the newline but the continuation
// line's own `//` marker interleaves into the collapsed text. Join consecutive full-line `//`
// comments before matching — code-file haystacks only, never catalogs or template extraction.
function joinLineComments(content) {
  const lines = content.split('\n'); const out = []
  for (const line of lines) {
    const m = line.match(/^\s*\/\/ ?(.*)$/)
    if (m && out.length && /^\s*\/\//.test(out[out.length - 1])) out[out.length - 1] += ' ' + m[1]
    else out.push(line)
  }
  return out.join('\n')
}
const hayCache = new Map()
function hayOf(rel) { // norm'd code-file haystack for copy/template-segment matching
  if (!hayCache.has(rel)) {
    const c = contentOf(rel)
    hayCache.set(rel, c === null ? null : norm(joinLineComments(c)))
  }
  return hayCache.get(rel)
}

// ---- deltas (the evidence-gated exemption list) --------------------------------------------------
const deltaDoc = readJson(path.join(sidecar, 'deltas.json'))
const deltas = (deltaDoc && Array.isArray(deltaDoc.deltas)) ? deltaDoc.deltas : []
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
  const surf = (extract.surfaces || []).find(s => s.id === d.surfaceId)
  if (!surf) {
    failures.push(at + ' (' + d.target + '): unknown surfaceId "' + d.surfaceId + '" — not a surface in extract.json (known: ' +
      ((extract.surfaces || []).map(s => s.id).join(', ') || 'none') + '); a region label is not a surface id')
    continue
  }
  const slicePath = path.join(sidecar, surf.sliceFile)
  const slice = fs.existsSync(slicePath) ? fs.readFileSync(slicePath, 'utf8') : null
  if (slice === null) {
    failures.push(at + ' (' + d.target + '): slice file ' + surf.sliceFile + ' missing from the sidecar — cannot verify the quote')
    continue
  }
  if (typeof d.sliceQuote !== 'string' || !d.sliceQuote.trim() || !norm(slice).includes(norm(d.sliceQuote))) {
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
  if (!segs.some(seg => norm(seg).length >= 3)) return false // a pure/near-pure-hole template excuses nothing
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
let catalogHits = 0
let bindingsSkipped = 0
for (const surf of surfaces) {
  const id = surf.raw.id
  const regionIds = new Set(surf.regions.map(r => r.id))
  const parentOf = new Map(surf.regions.map(r => [r.id, r.parent]))
  const coveredBy = (regionId, boundId) => { // is boundId an ancestor-or-self of regionId?
    let cur = regionId
    while (cur !== undefined && cur !== null) {
      if (cur === boundId) return true
      cur = parentOf.get(cur) ?? null
    }
    return false
  }

  // which regions did this spec bind, and with which files?
  const bound = new Map() // regionId → Set(files)
  const bindTo = (regionId, sk) => {
    if (!bound.has(regionId)) bound.set(regionId, new Set())
    for (const f of filesOf(sk)) bound.get(regionId).add(f)
  }
  for (const sk of skeletons) {
    for (const ref of refsOf(sk)) {
      const hash = ref.indexOf('#')
      const surfId = hash === -1 ? ref : ref.slice(0, hash)
      const regionId = hash === -1 ? 'root' : ref.slice(hash + 1)
      if (surfId !== id) continue
      if (!regionIds.has(regionId)) {
        failures.push(id + ': skeleton "' + (sk.id || '?') + '" binds unknown region "' + regionId +
          '" — extract.json knows: ' + [...regionIds].join(', '))
        continue
      }
      bindTo(regionId, sk)
    }
    // legacy whole-surface binding: sliceRef names the surface slice, or the ids match
    if ((typeof sk.sliceRef === 'string' && (sk.sliceRef === surf.raw.sliceFile || sk.sliceRef.endsWith('/' + surf.raw.sliceFile))) ||
        sk.id === id) {
      bindTo('root', sk)
    }
  }
  if (!bound.size) {
    notes.push('surface "' + id + '" has no bound region — not planned by this spec; skipped')
    continue
  }

  // per-entry owner files = files of every bound region whose subtree contains the entry
  const ownersFor = (regionId) => {
    const files = new Set()
    for (const [bId, fset] of bound) if (coveredBy(regionId, bId)) for (const f of fset) files.add(f)
    return files
  }
  const unboundWithCopy = [...regionIds].filter(rid =>
    !ownersFor(rid).size && surf.entries.some(e => e.region === rid && e.kind === 'copy'))
  if (unboundWithCopy.length) {
    notes.push(id + ': unbound region(s) ' + unboundWithCopy.join(', ') + ' — not claimed by this spec; their strings are not checked (the coverage ledger tracks the remainder)')
  }

  const missingChecked = new Set()
  const requireFiles = (files) => {
    const readable = []
    for (const f of files) {
      if (contentOf(f) === null) {
        if (!missingChecked.has(f)) { missingChecked.add(f); failures.push(id + ': mapped file ' + f + ' does not exist on disk — cannot verify fidelity') }
      } else readable.push(f)
    }
    return readable
  }

  // strings, by class
  const covered = surf.entries.filter(e => ownersFor(e.region).size)
  const copyEntries = covered.filter(e => e.kind === 'copy')
  const mockCount = new Map()
  for (const e of copyEntries) mockCount.set(norm(e.value), (mockCount.get(norm(e.value)) || 0) + 1)
  const foundAt = new Map() // norm(string) → {file, index} for the order check

  for (const e of covered) {
    if (e.kind === 'binding') { bindingsSkipped++; continue } // renders from a prop — no verbatim obligation
    const readable = requireFiles(ownersFor(e.region))
    if (e.kind === 'template') {
      checkedStrings++
      // the mock's own template: every meaningful STATIC segment must survive somewhere
      const segs = (e.segments || []).map(norm).filter(s => s.length >= 3)
      const missing = segs.filter(seg =>
        !readable.some(f => hayOf(f).includes(seg)) &&
        !allFiles.some(f => hayOf(f) !== null && hayOf(f).includes(seg)) &&
        !catalogHit(seg) &&
        !catalogs.some(c => c.templates.some(t => t.map(norm).includes(seg)) ||
          [...c.values].some(v => v.includes(seg)) || (c.text !== null && c.text.includes(seg))))
      if (missing.length && !excuse(id, 'string', e.value)) {
        failures.push(id + ' [' + e.region + ']: template "' + e.value + '" — static segment(s) ' +
          missing.map(s => '"' + s + '"').join(', ') + ' missing from the pass and the copy catalogs')
      }
      continue
    }
    checkedStrings++
    const needle = norm(e.value)
    // sample data: instance rows the catalog-entry fixture carries — anywhere in the pass, order-exempt
    if (e.kind === 'sample') {
      const hit = allFiles.some(f => hayOf(f) !== null && hayOf(f).includes(needle)) ||
        templateHit(allFiles, needle)
      if (!hit && !excuse(id, 'string', e.value)) {
        failures.push(id + ' [' + e.region + ']: sample "' + e.value + '" missing — mock instance data must appear in the pass (catalog-entry fixtures are the natural home)')
      }
      continue
    }
    // copy: verbatim in the region's own files → order candidate
    let where = null
    for (const f of readable) {
      const idx = hayOf(f).indexOf(needle)
      if (idx > -1) { where = { file: f, index: idx }; break }
    }
    if (!where) {
      // composite copy+instance-data strings pass via a code interpolation template; template
      // hits stay OUT of the order check — N sample rows match ONE template at one position
      if (templateHit(readable, needle)) { interpolated++; continue }
      const inCatalog = catalogHit(needle)
      if (inCatalog) { catalogHits++; continue } // catalog value = copy's i18n home; order N/A
      const elsewhere = allFiles.find(f => !readable.includes(f) && hayOf(f) !== null && hayOf(f).includes(needle))
      if (elsewhere) { notes.push(id + ': "' + e.value + '" found in ' + elsewhere + ' (outside the region\'s own files)'); continue }
      if (!excuse(id, 'string', e.value)) {
        failures.push(id + ' [' + e.region + ']: copy "' + e.value + '" missing — not in ' +
          (readable.length ? readable.join(', ') : '(no readable files)') +
          ', the pass, an interpolation template' + (catalogs.length ? ', or the copy catalogs' : '') +
          (catalogs.length ? '' : ' (no design.copyCatalogs declared — if this repo routes copy through i18n catalogs, declare them in spec.config.json)'))
      }
      continue
    }
    if (!foundAt.has(needle)) foundAt.set(needle, where)
  }

  // order: unique-in-mock copy found in the SAME code file must be in mock document order
  const byFile = new Map()
  for (const e of copyEntries) {
    const needle = norm(e.value)
    if (mockCount.get(needle) !== 1) continue
    const hit = foundAt.get(needle)
    if (!hit) continue
    const hay = hayOf(hit.file)
    // unique in the file too — a repeated occurrence makes first-index ordering meaningless
    if (hay.indexOf(needle) !== hay.lastIndexOf(needle)) continue
    if (!byFile.has(hit.file)) byFile.set(hit.file, [])
    byFile.get(hit.file).push({ s: e.value, index: hit.index })
  }
  for (const [file, hits] of byFile) {
    for (let i = 1; i < hits.length; i++) {
      if (hits[i].index < hits[i - 1].index) {
        if (!excuse(id, 'order', hits[i].s) && !excuse(id, 'order', hits[i - 1].s)) {
          failures.push(id + ': order — "' + hits[i].s + '" appears BEFORE "' + hits[i - 1].s +
            '" in ' + file + ' but AFTER it in the mock')
        }
      }
    }
  }

  // layout primitives, per bound region
  for (const l of surf.layout) {
    const owners = ownersFor(l.region)
    if (!owners.size) continue
    const readable = requireFiles(owners)
    if (!layoutFound(readable, l.property, l.value)) {
      if (!excuse(id, 'layout', l.property + ': ' + l.value)) {
        failures.push(id + ' [' + l.region + ']: layout — `' + l.property + ': ' + l.value + '` from the mock not found in ' +
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
  (catalogHits ? ' (' + catalogHits + ' via copy catalog)' : '') +
  (bindingsSkipped ? ', ' + bindingsSkipped + ' prop binding(s) skipped' : '') +
  (excused.length ? ', ' + excused.length + ' excused by delta' : '') + ' — clean\n')
