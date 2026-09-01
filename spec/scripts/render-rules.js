#!/usr/bin/env node
'use strict'
// render-rules.js --rules <manifest> --inventory <json>… --tokens <tokens.css> [--json]
//
// WHY: specs/20260824/04-render-rules.md (2026-08-24, D1-D3) — a design-rules.json manifest's
// thresholds (CTA count, touch-target size, contrast, colors within the token palette) were only
// ever checked by a Sonnet rule-checklist walk at /spec:sketch exit, in the render gate, and in
// /spec:review's design leg — a rule the manifest can express as a number was still being judged
// by a model at runtime. This is the reader that replaces that walk: it executes a rule's
// `renderCheck` (a closed kind set — target-size, cta-count, contrast, palette) over one or more
// render-inventory.browser.js documents, resolving palette colors from the host's own
// `tokens.css`. A rule with no `renderCheck` is reported once as `source-side=<n>`, never
// silently dropped from the count.
//
// What this deliberately does NOT do: read a rule's `intent` prose to infer a threshold (D1's
// rejected alternative — the manifest field is the number, prose is not); launch a browser or
// capture anything (it reads inventory JSON that already exists, same as render-compare.js);
// support a DTCG token format (D3 — tokens.css is the format that exists on both hosts today,
// out of scope per the spec's Rationale); relax the closed renderCheck.kind set for an unknown
// kind (D1 — half-checked is worse than an exit-2 refusal naming the rule).
//
// specs/20260831/02-viewport-adaptation-rules.md (2026-08-31, D1/D2/D3/D5/D6): the closed
// renderCheck.kind set gains `no-overflow` (a union of the inventory's page-level
// scrollWidth/clientWidth comparison and a per-entry box-edge comparison, exempting
// fixed/outOfFlow/dataPositioned/srOnly entries — mirrors render-compare's own geometry
// exemptions) and `line-length` (an estimated-character-width check gated silently by
// `minViewport`, `severity: "warn"` in the template). An inventory document with no usable
// `page` block fails BOTH new kinds closed with a re-capture finding (D5) rather than passing
// silently — the exact laundering prax measured (spec 20260823/11: a phone-only mock ratified
// clean, its non-adaptation later misattributed to components).
//
// Exit codes: 0 = no findings · 1 = one or more findings (a `severity: "warn"` rule's own
// finding is printed but never contributes to this) · 2 = usage, an unreadable/unparsable
// --rules/--inventory/--tokens file, or a rule's renderCheck.kind outside the closed
// target-size/cta-count/contrast/palette/no-overflow/line-length set (stderr names the
// offending rule's id).

const fs = require('fs')

function die(msg) {
  process.stderr.write('render-rules: ' + msg + '\n')
  process.exit(2)
}

// Worker Rules: a script that prints a payload and exits must route through a synchronous
// writer — console.log()+process.exit() truncates a large payload at the 64 KiB pipe buffer
// while still exiting 0 (this repo's 2026-08-23 spec-status.js incident).
function writeOut(str) {
  const buf = Buffer.from(str + '\n', 'utf8')
  let off = 0
  while (off < buf.length) {
    try {
      off += fs.writeSync(1, buf, off, buf.length - off)
    } catch (e) {
      if (e.code === 'EAGAIN') continue
      throw e
    }
  }
}

// ---- args ------------------------------------------------------------------------------------
const argv = process.argv.slice(2)
function flagVal(name) {
  const i = argv.indexOf('--' + name)
  return i > -1 ? argv[i + 1] : undefined
}
function flagVals(name) {
  const out = []
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--' + name) out.push(argv[i + 1])
  return out
}
const rulesPath = flagVal('rules')
const inventoryPaths = flagVals('inventory')
const tokensPath = flagVal('tokens')
const asJson = argv.includes('--json')

if (!rulesPath || !inventoryPaths.length || !tokensPath) {
  die('usage: render-rules.js --rules <manifest> --inventory <json>… --tokens <tokens.css> [--json]')
}

function readJson(label, p) {
  let raw
  try {
    raw = fs.readFileSync(p, 'utf8')
  } catch (e) {
    die('--' + label + ' ' + p + ' is not readable (' + e.message + ') — pass a real path')
  }
  try {
    return JSON.parse(raw)
  } catch (e) {
    die('--' + label + ' ' + p + ' is not valid JSON (' + e.message + ')')
  }
}

const manifest = readJson('rules', rulesPath)
if (!manifest || !Array.isArray(manifest.rules)) {
  die('--rules ' + rulesPath + ' has no rules array — not a design-rules.json manifest')
}

const inventories = inventoryPaths.map((p) => {
  const doc = readJson('inventory', p)
  if (!doc || !Array.isArray(doc.entries)) {
    die('--inventory ' + p + ' has no entries array — not a render-inventory.browser.js document')
  }
  return doc
})

let tokensCss
try {
  tokensCss = fs.readFileSync(tokensPath, 'utf8')
} catch (e) {
  die('--tokens ' + tokensPath + ' is not readable (' + e.message + ') — pass a real tokens.css path')
}

// ---- D1: closed renderCheck.kind set, validated before anything runs --------------------------
const CLOSED_KINDS = ['target-size', 'cta-count', 'contrast', 'palette', 'no-overflow', 'line-length']
for (const rule of manifest.rules) {
  if (rule.renderCheck && !CLOSED_KINDS.includes(rule.renderCheck.kind)) {
    die('rule "' + rule.id + '" declares renderCheck.kind ' + JSON.stringify(rule.renderCheck.kind) +
      ' — the closed set is ' + CLOSED_KINDS.join(', ') + '; fix ' + rulesPath)
  }
}

// ---- D3: tokens.css color parsing + one-level var() resolution --------------------------------
function parseColor(raw) {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  let m
  if ((m = /^#([0-9a-fA-F]{3})$/.exec(s))) {
    const h = m[1]
    return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) }
  }
  if ((m = /^#([0-9a-fA-F]{4})$/.exec(s))) {
    const h = m[1]
    return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) }
  }
  if ((m = /^#([0-9a-fA-F]{6})$/.exec(s))) {
    const h = m[1]
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
  }
  if ((m = /^#([0-9a-fA-F]{8})$/.exec(s))) {
    const h = m[1]
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
  }
  if ((m = /^rgba?\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*(?:,\s*[\d.]+\s*)?\)$/.exec(s))) {
    return { r: Math.round(Number(m[1])), g: Math.round(Number(m[2])), b: Math.round(Number(m[3])) }
  }
  return null
}
function canonical(c) { return 'rgb(' + c.r + ', ' + c.g + ', ' + c.b + ')' }

function parseTokens(text) {
  const declRe = /--([A-Za-z0-9_-]+)\s*:\s*([^;]+);/g
  const decls = []
  let m
  while ((m = declRe.exec(text)) !== null) decls.push({ name: m[1], raw: m[2].trim() })
  const rawByName = new Map()
  for (const d of decls) {
    if (!rawByName.has(d.name)) rawByName.set(d.name, [])
    rawByName.get(d.name).push(d.raw)
  }
  function resolveOne(raw) {
    const direct = parseColor(raw)
    if (direct) return direct
    const varM = /^var\(\s*(--[A-Za-z0-9_-]+)\s*\)$/.exec(raw)
    if (varM) {
      // D3: one level only — the referenced token's own raw value must resolve directly.
      const refRaws = rawByName.get(varM[1].slice(2))
      if (refRaws && refRaws.length) return parseColor(refRaws[0])
    }
    return null
  }
  const paletteColors = new Set()
  const namedColors = new Map()
  const unresolvableSeen = new Set()
  const unresolvableLines = []
  for (const d of decls) {
    const resolved = resolveOne(d.raw)
    if (resolved) {
      const c = canonical(resolved)
      paletteColors.add(c)
      if (!namedColors.has(d.name)) namedColors.set(d.name, new Set())
      namedColors.get(d.name).add(c)
    } else if (!unresolvableSeen.has(d.name)) {
      unresolvableSeen.add(d.name)
      unresolvableLines.push('unresolvable --' + d.name + ' ' + d.raw)
    }
  }
  return { paletteColors, namedColors, unresolvableLines }
}
const { paletteColors, namedColors, unresolvableLines } = parseTokens(tokensCss)

// ---- WCAG 2.x contrast (Contracts: sRGB -> linear, L = 0.2126R + 0.7152G + 0.0722B) ------------
function srgbToLinear(v) {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
function relLuminance(c) {
  return 0.2126 * srgbToLinear(c.r) + 0.7152 * srgbToLinear(c.g) + 0.0722 * srgbToLinear(c.b)
}
function contrastRatio(c1, c2) {
  const L1 = relLuminance(c1), L2 = relLuminance(c2)
  const lighter = Math.max(L1, L2), darker = Math.min(L1, L2)
  return (lighter + 0.05) / (darker + 0.05)
}

// ---- D2: the four renderCheck kinds ------------------------------------------------------------
const INTERACTIVE_ROLES = { button: true, link: true, textbox: true, combobox: true, checkbox: true, radio: true }

const findings = [] // { line, warn }
function pushFinding(rule, line) {
  findings.push({ line: (rule.severity === 'warn' ? '⚠️ ' : '') + line, warn: rule.severity === 'warn' })
}
function labelOf(e) { return e.text || e.name || '' }

function checkTargetSize(rule) {
  const min = rule.renderCheck.min
  for (const doc of inventories) {
    for (const e of doc.entries) {
      if (!INTERACTIVE_ROLES[e.role] || e.srOnly || !e.box) continue
      if (e.box.w >= min && e.box.h >= min) continue
      pushFinding(rule, 'rule ' + rule.id + ' target-size "' + labelOf(e) + '" ' +
        e.box.w + '×' + e.box.h + 'px < ' + min + 'px')
    }
  }
}

function checkCtaCount(rule) {
  const { max, tokens } = rule.renderCheck
  const allowed = new Set()
  for (const t of tokens || []) {
    const set = namedColors.get(String(t).replace(/^--/, ''))
    if (set) for (const c of set) allowed.add(c)
  }
  // D2: "counted per inventory" — one call scope per inventory document, never summed globally.
  for (const doc of inventories) {
    const hits = []
    for (const e of doc.entries) {
      if (e.role !== 'button') continue
      const c = parseColor(e.background)
      if (c && allowed.has(canonical(c))) hits.push(e)
    }
    if (hits.length > max) {
      const names = hits.map((e) => '"' + labelOf(e) + '"').join(', ')
      pushFinding(rule, 'rule ' + rule.id + ' cta-count ' + hits.length + ' > ' + max + ' (' + names + ')')
    }
  }
}

function checkContrast(rule) {
  const { min, minLarge } = rule.renderCheck
  for (const doc of inventories) {
    for (const e of doc.entries) {
      if (!e.text || !e.color || !e.effectiveBackground) continue
      const fg = parseColor(e.color)
      const bg = parseColor(e.effectiveBackground)
      if (!fg || !bg) continue
      const ratio = contrastRatio(fg, bg)
      const fontSize = e.fontSize ? parseFloat(e.fontSize) : null
      const fontWeight = e.fontWeight ? Number(e.fontWeight) : null
      const isLarge = fontSize !== null &&
        (fontSize >= 24 || (fontSize >= 18.66 && fontWeight !== null && fontWeight >= 700))
      const threshold = (isLarge && minLarge != null) ? minLarge : min
      if (ratio >= threshold) continue
      pushFinding(rule, 'rule ' + rule.id + ' contrast "' + e.text + '" ' + ratio.toFixed(2) + ' < ' +
        threshold + ' (' + e.color + ' on ' + e.effectiveBackground + ')')
    }
  }
}

function checkPalette(rule) {
  function checkField(e, field, label) {
    const raw = e[field]
    if (!raw) return
    const c = parseColor(raw)
    if (c && paletteColors.has(canonical(c))) return
    pushFinding(rule, 'rule ' + rule.id + ' palette "' + labelOf(e) + '" ' + label + ' ' + raw + ' not in tokens.css')
  }
  for (const doc of inventories) {
    for (const e of doc.entries) {
      checkField(e, 'color', 'color')
      checkField(e, 'effectiveBackground', 'background')
    }
  }
}

// ---- D2/D3/D5: no-overflow — page leg (scrollWidth vs clientWidth) OR entry leg (box right
// edge vs clientWidth), a union predicate because overflow-x:hidden masks scrollWidth entirely
// while getBoundingClientRect still reports the true edge (A1). A document with no usable page
// block fails closed rather than passing silently (D5) — never treated as "nothing to check".
function hasUsablePage(doc) {
  return !!doc.page && typeof doc.page.scrollWidth === 'number' && typeof doc.page.clientWidth === 'number'
}
function noPageFinding(rule, kind, doc) {
  pushFinding(rule, 'rule ' + rule.id + ' ' + kind + ' inventory has no page geometry (theme ' +
    doc.theme + ' state ' + doc.state + ') — re-capture with the current render-inventory.browser.js')
}

function checkNoOverflow(rule) {
  for (const doc of inventories) {
    if (!hasUsablePage(doc)) { noPageFinding(rule, 'no-overflow', doc); continue }
    const { scrollWidth, clientWidth } = doc.page
    if (scrollWidth > clientWidth + 1) {
      pushFinding(rule, 'rule ' + rule.id + ' no-overflow page scrolls horizontally: scrollWidth ' +
        scrollWidth + ' > ' + clientWidth)
    }
    // D3: fixed/outOfFlow/dataPositioned/srOnly entries are the author's own assertion or
    // invisible content — mirrors render-compare's own geometry exemptions.
    for (const e of doc.entries) {
      if (e.fixed || e.outOfFlow || e.dataPositioned || e.srOnly || !e.box) continue
      const rightEdge = e.box.x + e.box.w
      if (rightEdge > clientWidth + 1) {
        pushFinding(rule, 'rule ' + rule.id + ' no-overflow "' + labelOf(e) + '" right edge ' +
          rightEdge + ' > ' + clientWidth)
      }
    }
  }
}

// ---- D5/D6: line-length — viewport-gated estimated-character-width check. The `minViewport`
// skip is a declared gate, not missing data: SILENT, never a finding of any kind (a missing
// `page` block is the separate D5 fail-closed case, handled identically to no-overflow above).
function checkLineLength(rule) {
  const { maxCh, minViewport } = rule.renderCheck
  for (const doc of inventories) {
    if (!hasUsablePage(doc)) { noPageFinding(rule, 'line-length', doc); continue }
    if (doc.page.clientWidth < minViewport) continue
    for (const e of doc.entries) {
      if (!e.text || !e.box || !e.fontSize) continue
      const fontSize = parseFloat(e.fontSize)
      if (!fontSize || Number.isNaN(fontSize)) continue
      const estimatedCh = e.box.w / (0.5 * fontSize)
      if (estimatedCh > maxCh && e.text.length > maxCh) {
        const label = e.text.length > 40 ? e.text.slice(0, 40) + '…' : e.text
        pushFinding(rule, 'rule ' + rule.id + ' line-length "' + label + '" ~' + Math.round(estimatedCh) +
          'ch > ' + maxCh + 'ch at ' + doc.page.clientWidth + 'px')
      }
    }
  }
}

const CHECKS = {
  'target-size': checkTargetSize, 'cta-count': checkCtaCount, contrast: checkContrast, palette: checkPalette,
  'no-overflow': checkNoOverflow, 'line-length': checkLineLength,
}

const checkedRules = manifest.rules.filter((r) => r.renderCheck)
const sourceSideCount = manifest.rules.length - checkedRules.length
for (const rule of checkedRules) CHECKS[rule.renderCheck.kind](rule)

// ---- output -------------------------------------------------------------------------------------
const hardCount = findings.filter((f) => !f.warn).length
const exitCode = hardCount > 0 ? 1 : 0
const summary = 'rules=' + manifest.rules.length + ' checked=' + checkedRules.length +
  ' source-side=' + sourceSideCount + ' findings=' + findings.length

if (asJson) {
  writeOut(JSON.stringify({
    rules: manifest.rules.length, checked: checkedRules.length, sourceSide: sourceSideCount,
    findings: findings.map((f) => f.line), unresolvable: unresolvableLines, exit: exitCode,
  }))
} else {
  writeOut([...findings.map((f) => f.line), ...unresolvableLines, summary].join('\n'))
}
process.exit(exitCode)
