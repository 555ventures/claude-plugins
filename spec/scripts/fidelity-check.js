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
//   - over-claim (spec 20260814/02 D5): a skeleton binding a surface's ROOT region (bare-surface
//     ref / legacy sliceRef / id == surface id) claims every child region, including chrome no
//     shipped screen renders. When the pass fully satisfies ≥1 obligation-bearing child region
//     while fully missing ≥1 other, one diagnosis line is prepended to that surface's findings
//     naming the true cause — a subset-binding wearing a whole-surface name. It never changes
//     the exit code by itself; it only re-labels findings that already exist.
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
const { readConfig } = require('./lib/host-config')

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
const config = readConfig(repoRoot)
const catalogPaths = (config.design && Array.isArray(config.design.copyCatalogs)) ? config.design.copyCatalogs : []
const catalogs = [] // {rel, values: Set<norm>, templates: [segs[]], text: norm(content)|null}
for (const rel of catalogPaths) {
  let content
  try { content = fs.readFileSync(path.resolve(repoRoot, rel), 'utf8') }
  catch { failures.push('copy catalog ' + rel + ' (spec.config.json design.copyCatalogs) is not readable — fix the config or restore the file'); continue }
  const cat = { rel, values: new Set(), templates: [], text: null, joined: null }
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
    // Every catalog value as one haystack, for the FRAGMENT case below.
    cat.joined = [...cat.values, ...cat.templates.map(segs => segs.join(' '))].join('\x00')
  }
  catalogs.push(cat)
}
// A mock string passes when it appears as a catalog VALUE — verbatim, via a {hole} template, or as
// a FRAGMENT of one. The fragment arm exists because mocks split sentences across inline markup:
// `luck <b>within the data</b> — it does not…` extracts as three entries, while the copy catalog
// correctly holds the sentence as ONE translatable value. Demanding each fragment be its own
// catalog value would shatter copy the one-home rule exists to keep whole, and the alternative —
// exempting fragments with deltas.json rows — is worse still: a mid-sentence <b> is no
// impossibility, and fake rows debase the one mechanism whose value is that every row carries a
// real proof. Note this only aligns catalogs with how CODE files have always been matched
// (`hayOf(f).includes(needle)`, below) — catalogs were the strict outlier, not the loose one, so
// this removes an inconsistency rather than lowering the bar. Absent-everywhere still fails.
// Measured: spec 20260727/07-verdict-ui, 6 residual fragments across two bound regions.
function catalogHit(needle) {
  for (const cat of catalogs) {
    if (cat.values.has(needle)) return cat.rel
    if (cat.templates.some(segs => matchesTemplate(segs, needle))) return cat.rel
    if (cat.text !== null && cat.text.includes(needle)) return cat.rel
    if (cat.joined !== null && cat.joined.includes(needle)) return cat.rel
  }
  return null
}

// A separator glyph sitting at the EDGE of a mock string is layout punctuation between a value and
// its neighbour, not part of the value: `12 May – 3 Jun 2021 · <span>−18.4%</span>` extracts the
// date fragment with the separator attached, because the author put the `·` outside the span. Its
// one home is the renderer (a local `DOT_SEP`-style constant, the same treatment glyphs get
// everywhere in the doctrine) — demanding a fixture carry `"12 May – 3 Jun 2021 ·"` would push
// punctuation into the data home and break the one-home rule from the other side. So a needle that
// misses everywhere gets one retry with its edge separators trimmed; the remainder must still be
// found verbatim, and must be substantial enough that the retry can't rescue a stray glyph.
// A match sitting in a module-level `const NAME = "…"` is at a DECLARATION site, not where the
// string renders — every use site carries the identifier, not the literal, so the declaration's
// position says nothing about document order. Hosts that forbid bare JSX literals (a
// no-jsx-literals lint plus a glyph allowlist) make this the ONLY literal a glyph ever has, so
// without the exemption such a string is pinned to wherever its constant block sits — by
// convention the top of the file — and inverts against every mock that renders it lower down.
// Presence is unaffected; only order candidacy is. (Measured: spec 20260727/07-verdict-ui, a
// `const STOP_GLYPH = "✕"` at line 35 reported as preceding copy it renders 1000 lines below.)
const DECL_TAIL_RE = /\bconst\s+[A-Za-z_$][\w$]*\s*=\s*["'`]$/
function isDeclarationSite(hay, idx) {
  return typeof hay === 'string' && idx > 0 && DECL_TAIL_RE.test(hay.slice(Math.max(0, idx - 120), idx))
}
const EDGE_SEP_RE = /^[\s·•‧—–|/]+|[\s·•‧—–|/]+$/g
const stripEdgeSeparators = n => n.replace(EDGE_SEP_RE, '').trim()
let separatorTrimmed = 0

// ---- skeleton → region binding ---------------------------------------------------------------------
// regionRef / regionRefs: "<surfaceId>#<regionId>" (or "<surfaceId>" = the root region).
// Legacy sliceRef (slice file name) and skeleton-id-matches-surface-id bind the root region.
// A family's `*.fixtures.*` sitting beside the component IS a resolved file, not an unchecked
// renderer. The design doctrine's one-home rule splits bound strings by KIND — user-read copy
// homes in the i18n catalog, sample data standing in for user content (titles, versions, counts,
// meta lines) homes in the family's fixtures — and states outright that "the mock-fidelity gate
// greps the fixtures home". Resolving only [componentPath, catalogEntryPath] left that half of
// the rule unenforced: a spec whose sample data was correctly homed reported every such string
// as missing, which pushes authors to move sample values into a renderer — the exact duplication
// the one-home rule exists to prevent. This STRENGTHENS the check (those strings go from
// unchecked to verified); it never excuses a string that is absent everywhere.
// Measured: spec 20260727/07-verdict-ui, 80 correctly-homed strings reported missing.
const FIXTURES_RE = /\.fixtures\.[cm]?[jt]sx?$/
function isFixturesFile(rel) { return typeof rel === 'string' && FIXTURES_RE.test(rel) }
function fixturesBeside(rel) {
  if (typeof rel !== 'string' || !rel) return []
  try {
    // sorted: readdirSync order is filesystem-dependent, and `readable`'s order decides which
    // file supplies a string's ORDER position — an unsorted list makes the order check
    // nondeterministic run to run (measured: the same tree reported clean and then reported an
    // inversion, with no edit between).
    const dir = path.dirname(path.resolve(repoRoot, rel))
    return fs.readdirSync(dir)
      .filter(f => FIXTURES_RE.test(f))
      .sort()
      .map(f => path.relative(repoRoot, path.join(dir, f)))
  } catch { return [] }
}
function filesOf(sk) {
  const declared = [sk.componentPath, sk.catalogEntryPath].filter(v => typeof v === 'string' && v.length > 0)
  return [...new Set([...declared, ...declared.flatMap(fixturesBeside)])]
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
// Comments in the haystack: ONE comment form may satisfy the copy gate — a carrier bearing the
// `mock authority:` marker beside an indirected render (`<Note>{copy.unverified}</Note>`), where
// the render is real but sits behind an indirection the grep can't follow and the marker is the
// auditable link back to the mock. Wrapped across `//` lines a carrier would silently fail the
// contiguous match (norm() collapses the newline but the continuation line's own `//` marker
// interleaves), so consecutive full-line `//` comments are joined first. EVERY OTHER comment is
// stripped before matching: an unmarked comment quoting the mock is narration, not a render
// (measured: spec 20260727/07-verdict-ui — a fixtures-file aside quoting "All 24 markets ›"
// satisfied a bound copy obligation for a link the code deliberately omits, leaving its delta row
// silently unused and the gate green over a string that never renders).
// Code-file haystacks only, never catalogs or template extraction.
const COMMENTS_RE = /\/\*[\s\S]*?\*\/|(?:^|\s)\/\/[^\n]*/g
const CARRIER_MARKER_RE = /mock authority:/i
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
    if (c === null) hayCache.set(rel, null)
    else if (rel.endsWith('.json')) hayCache.set(rel, norm(c))
    else hayCache.set(rel, norm(joinLineComments(c)
      .replace(COMMENTS_RE, m => CARRIER_MARKER_RE.test(m) ? m : ' ')))
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

// ---- delta CONTRACT: a recorded divergence must actually have been performed --------------------
// A delta says "the mock says X; we render Y instead". Until now a delta only EXEMPTED X from the
// missing-string check, so a build that transcribed X verbatim passed silently — the file read as a
// divergence contract while verifying nothing, and recording a delta made the gate QUIETER, which is
// backwards: writing down a divergence should tighten the check, not loosen it.
// Measured on spec 20260727/07-verdict-ui: six of nine string deltas were recorded and none
// implemented, shipping a fabricated regime measurement ("close to one and a half macro regimes") and
// a dead affordance promise ("TAP A TRADE TO JUMP TO ITS CANDLE") to the product's honesty screen
// with every gate green. So: for every kind:"string" delta, X must be ABSENT from the pass.
// Comments are stripped first — a code comment quoting the mock line it removed is documentation,
// not a render (measured: the same false-positive class as the order check's comment hits).
function bodyOf(rel) {
  const c = contentOf(rel)
  if (c === null) return null
  return rel.endsWith('.json') ? norm(c) : norm(c.replace(COMMENTS_RE, ' '))
}
for (const d of validDeltas) {
  if (d.kind !== 'string') continue
  const needle = norm(d.target)
  if (!needle) continue
  const rendered = [...new Set([...allFiles, ...catalogPaths])]
    .filter(f => { const b = bodyOf(f); return b !== null && b.includes(needle) })
  if (rendered.length) {
    d._used = true
    failures.push('delta "' + d.target.slice(0, 70) + '" — the mock string STILL RENDERS in ' +
      rendered.join(', ') + '. A delta records what the code renders INSTEAD; this row says it renders: ' +
      (typeof d.renders === 'string' && d.renders.trim() ? d.renders.trim() : '(no "renders" field — add one)'))
  }
}

function excuse(surfaceId, kind, target) {
  const d = validDeltas.find(v => v.surfaceId === surfaceId && v.kind === kind && norm(v.target) === norm(target))
  if (d) {
    d._used = true
    excused.push(surfaceId + ' ' + kind + ' "' + target + '" — excused (proof: ' + d.proof.trim() + ')')
  }
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
  const surfFailStart = failures.length // over-claim detection (D5) splices its line at this index
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
  // over-claim detection (D5): a bare-surface ref, a legacy sliceRef, or a skeleton id matching
  // the surface id all bind the ROOT region — i.e. every region, including chrome no shipped
  // screen renders. Track which skeleton(s) did that so a later mismatch can name the true cause.
  const rootBoundSkeletonIds = []
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
      if (regionId === 'root' && !rootBoundSkeletonIds.includes(sk.id)) rootBoundSkeletonIds.push(sk.id)
    }
    // legacy whole-surface binding: sliceRef names the surface slice, or the ids match
    if ((typeof sk.sliceRef === 'string' && (sk.sliceRef === surf.raw.sliceFile || sk.sliceRef.endsWith('/' + surf.raw.sliceFile))) ||
        sk.id === id) {
      bindTo('root', sk)
      if (!rootBoundSkeletonIds.includes(sk.id)) rootBoundSkeletonIds.push(sk.id)
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
  const entryOutcome = new Map() // entry → 'pass'|'fail', over-claim per-region coverage (D5)
  const layoutOutcome = new Map() // layout row → 'pass'|'fail', over-claim per-region coverage (D5)

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
        entryOutcome.set(e, 'fail')
      } else {
        entryOutcome.set(e, 'pass')
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
        entryOutcome.set(e, 'fail')
      } else {
        entryOutcome.set(e, 'pass')
      }
      continue
    }
    // copy: verbatim in the region's own files → order candidate. Renderers are searched before
    // fixtures: a fixtures file establishes PRESENCE but never document order (below), so letting
    // one win the `where` race would discard the renderer's real position and silently drop the
    // string out of the order check entirely — a hit in a data file must never shadow the
    // renderer that actually lays the string out.
    let where = null
    for (const f of [...readable].sort((a, b) => Number(isFixturesFile(a)) - Number(isFixturesFile(b)))) {
      const idx = hayOf(f).indexOf(needle)
      if (idx > -1) { where = { file: f, index: idx }; break }
    }
    if (!where) {
      // composite copy+instance-data strings pass via a code interpolation template; template
      // hits stay OUT of the order check — N sample rows match ONE template at one position
      if (templateHit(readable, needle)) { interpolated++; entryOutcome.set(e, 'pass'); continue }
      const inCatalog = catalogHit(needle)
      if (inCatalog) { catalogHits++; entryOutcome.set(e, 'pass'); continue } // catalog value = copy's i18n home; order N/A
      const elsewhere = allFiles.find(f => !readable.includes(f) && hayOf(f) !== null && hayOf(f).includes(needle))
      if (elsewhere) { notes.push(id + ': "' + e.value + '" found in ' + elsewhere + ' (outside the region\'s own files)'); entryOutcome.set(e, 'pass'); continue }
      const core = stripEdgeSeparators(needle)
      if (core !== needle && core.length >= 3 &&
        (readable.some(f => hayOf(f).includes(core)) || templateHit(readable, core) || catalogHit(core) ||
          allFiles.some(f => hayOf(f) !== null && hayOf(f).includes(core)))) {
        separatorTrimmed++
        entryOutcome.set(e, 'pass')
        continue // the value is homed; only the edge separator lives in the renderer
      }
      if (!excuse(id, 'string', e.value)) {
        failures.push(id + ' [' + e.region + ']: copy "' + e.value + '" missing — not in ' +
          (readable.length ? readable.join(', ') : '(no readable files)') +
          ', the pass, an interpolation template' + (catalogs.length ? ', or the copy catalogs' : '') +
          (catalogs.length ? '' : ' (no design.copyCatalogs declared — if this repo routes copy through i18n catalogs, declare them in spec.config.json)'))
        entryOutcome.set(e, 'fail')
      } else {
        entryOutcome.set(e, 'pass')
      }
      continue
    }
    entryOutcome.set(e, 'pass')
    // A fixtures file is a DATA home, not a renderer: its declaration order is arbitrary and
    // carries no document order, so a hit there counts for PRESENCE but never as an order
    // candidate — the same "order N/A" treatment the copy catalog gets above. (Without this the
    // fixtures resolution added above reports inversions purely from key order; measured on spec
    // 20260727/07-verdict-ui: 13 phantom order failures, e.g. a flips row's value declared before
    // its group label.) Order remains fully enforced inside real renderers.
    if (!foundAt.has(needle) && !isFixturesFile(where.file) &&
      !isDeclarationSite(hayOf(where.file), where.index)) foundAt.set(needle, where)
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
        layoutOutcome.set(l, 'fail')
      } else {
        layoutOutcome.set(l, 'pass')
      }
    } else {
      layoutOutcome.set(l, 'pass')
    }
  }

  // ---- over-claim detection (D5) ------------------------------------------------------------
  // A root-bound skeleton (bare-surface ref / legacy sliceRef / id == surface id) claims every
  // region of the surface, including chrome no shipped screen renders. When the pass fully
  // satisfies one obligation-bearing child region while fully missing another, THAT SHAPE is the
  // naming-collision incident (PRAX-20260804-02): a bare-surface skeleton binding a subset. Named
  // directly instead of leaving the reader to infer it from an unexplained missing-copy finding.
  // Regions with zero extracted obligations are excluded from the computation entirely (a
  // structural region with no obligations reads identically to an all-failed one otherwise).
  // Detection never changes the exit code by itself — it only prepends a diagnosis line ahead of
  // findings that already exist.
  if (rootBoundSkeletonIds.length && failures.length > surfFailStart) {
    const childRegionIds = surf.regions.filter(r => r.parent === 'root').map(r => r.id)
    const fullySatisfied = []
    const fullyUnreferenced = []
    for (const cid of childRegionIds) {
      const outcomes = []
      for (const e of surf.entries) {
        if (e.kind === 'binding' || !coveredBy(e.region, cid)) continue
        if (entryOutcome.has(e)) outcomes.push(entryOutcome.get(e))
      }
      for (const l of surf.layout) {
        if (!coveredBy(l.region, cid)) continue
        if (layoutOutcome.has(l)) outcomes.push(layoutOutcome.get(l))
      }
      if (!outcomes.length) continue // no obligation — excluded from the computation
      if (outcomes.every(o => o === 'pass')) fullySatisfied.push(cid)
      else if (outcomes.every(o => o === 'fail')) fullyUnreferenced.push(cid)
    }
    if (fullySatisfied.length && fullyUnreferenced.length) {
      failures.splice(surfFailStart, 0,
        "over-claim: skeleton '" + rootBoundSkeletonIds[0] + "' binds all of '" + id +
        "' but only regions [" + fullySatisfied.join(', ') + "] are implemented — if this spec " +
        'builds a subset, bind those regions and name the skeleton distinctly (e.g. ' + id + '-screen)')
    }
  }
}

// A valid delta that neither excused a failing check nor tripped the STILL-RENDERS contract is a
// dead exemption (the no-unused-disable analogue): its target already passes, was never extracted
// as a bound obligation, or is mis-addressed. Silence here is how exemption lists rot — measured
// live on 20260727/07-verdict-ui, where a comment-satisfied obligation left its row unused with
// the gate green.
for (const d of validDeltas) {
  if (d._used) continue
  failures.push('delta "' + d.target.slice(0, 70) + '" (' + d.surfaceId + ', ' + d.kind + ') excused nothing — ' +
    'its target never failed a check. Either the string already renders (then the divergence is fiction: delete the row), ' +
    'or it is not a bound obligation of this spec (mis-addressed surfaceId/target, or an unbound region the coverage ledger owns).')
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
  (separatorTrimmed ? ' (' + separatorTrimmed + ' via edge-separator trim)' : '') +
  (bindingsSkipped ? ', ' + bindingsSkipped + ' prop binding(s) skipped' : '') +
  (excused.length ? ', ' + excused.length + ' excused by delta' : '') + ' — clean\n')
