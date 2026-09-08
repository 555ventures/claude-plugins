#!/usr/bin/env node
// spec/scripts/lib/shell-region.js — the shell-canon region mechanics behind design-atlas.js's
// `check` shell family (D4) and `shell sync`/`shell adopt` subcommands (D5/D6), plus the sibling
// kit-canon family (specs/20260907/04-kit-canon-family.md D2-D4/D13).
//
// WHY: specs/20260901/04-shell-composed-mocks.md D1-D6. Chrome drifts because nothing shares it
// and nothing checks it: each mock hand-copying its nav/header markup means a sidebar edit in
// one ratified mock never reaches the others and nothing catches the divergence. This module makes
// a page mock's chrome region a DERIVED value (expectedRegion, D3's byte-equality splice) instead
// of authored prose, and gives `check` a diagnosis (diagnoseMock) and a canon-file rule set
// (checkCanon, D1) built on the same tag walker. It lives under `lib/` deliberately (D12) — the
// entrypoint/spec-paths conformance scan walks by directory, and `lib/` is outside it, so this
// file needs no new `spec-paths` key of its own; `design-atlas.js` is the only caller.
//
// The tag walker (scanTags/findElement/findAllElements) is a depth-counting walk, not an HTML
// parser: void elements (area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr) and any
// tag ending `/>` never open a nesting level, and `<!-- -->` comments are skipped outright — this
// is the same shape as the executed spike recorded in the spec's Assumption A1. It does NOT
// tolerate malformed markup (an unclosed root walks to end-of-string and the caller sees a
// generous — not a refused — element), does NOT understand CSS selectors beyond the flat
// `selector { decls }` reader already used by design-atlas.js's hygiene checks, and does NOT
// track a comment or string literal containing a bare `<` correctly (Assumption A1's documented
// edge: authors keep `<` out of canon comment text).
//
// Exit codes: N/A — this is a library of pure functions and file-reading helpers, never invoked
// directly. Every function that reads a file swallows a missing/unparseable file into a neutral
// return (null / empty array) rather than throwing; the calling script decides what that means.
'use strict'
const fs = require('node:fs')
const path = require('node:path')

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
])

// ---- tag walker ------------------------------------------------------------------------------
// One pass over `html`, emitting {type, name, start, end, raw} tokens: 'comment' | 'open' |
// 'close' | 'void'. Attribute-value quotes are respected while hunting for the tag's closing '>'
// so a `>` inside a quoted attribute value never ends the tag early.
function scanTags(html) {
  const tokens = []
  const n = html.length
  let i = 0
  while (i < n) {
    const lt = html.indexOf('<', i)
    if (lt === -1) break
    if (html.startsWith('<!--', lt)) {
      const close = html.indexOf('-->', lt + 4)
      const end = close === -1 ? n : close + 3
      tokens.push({ type: 'comment', start: lt, end })
      i = end
      continue
    }
    let j = lt + 1
    let quote = null
    while (j < n) {
      const c = html[j]
      if (quote) { if (c === quote) quote = null }
      else if (c === '"' || c === '\'') quote = c
      else if (c === '>') break
      j++
    }
    const end = j + 1
    const raw = html.slice(lt, end)
    const nameMatch = raw.match(/^<\/?([a-zA-Z][\w-]*)/)
    const name = nameMatch ? nameMatch[1].toLowerCase() : ''
    const closing = raw[1] === '/'
    const selfClosing = /\/>\s*$/.test(raw)
    let type
    if (closing) type = 'close'
    else if (VOID_ELEMENTS.has(name) || selfClosing) type = 'void'
    else type = 'open'
    tokens.push({ type, name, start: lt, end, raw })
    i = end
  }
  return tokens
}

// Every open/void tag matching `predicate`, in document order, skipping the matched element's own
// subtree so a nested match inside it is never reported separately. Each result carries
// openStart/openEnd/innerStart/innerEnd/closeStart/closeEnd/name/openRaw. A void match has an
// empty inner (innerStart === innerEnd === openEnd). An unclosed open tag walks to end-of-string
// rather than being dropped (fail-generous, matching the walker's documented scope above).
function findAllElements(html, predicate) {
  const tokens = scanTags(html)
  const out = []
  let k = 0
  while (k < tokens.length) {
    const t = tokens[k]
    if ((t.type === 'open' || t.type === 'void') && predicate(t)) {
      if (t.type === 'void') {
        out.push({
          openStart: t.start, openEnd: t.end, name: t.name, openRaw: t.raw,
          innerStart: t.end, innerEnd: t.end, closeStart: t.end, closeEnd: t.end,
        })
        k++
        continue
      }
      let depth = 1
      let m = k + 1
      for (; m < tokens.length; m++) {
        if (tokens[m].type === 'open') depth++
        else if (tokens[m].type === 'close') { depth--; if (depth === 0) break }
      }
      const closeTok = tokens[m]
      out.push({
        openStart: t.start, openEnd: t.end, name: t.name, openRaw: t.raw,
        innerStart: t.end,
        innerEnd: closeTok ? closeTok.start : html.length,
        closeStart: closeTok ? closeTok.start : html.length,
        closeEnd: closeTok ? closeTok.end : html.length,
      })
      k = closeTok ? m + 1 : tokens.length
      continue
    }
    k++
  }
  return out
}

function findElement(html, predicate) {
  return findAllElements(html, predicate)[0] || null
}

// Direct (depth-0) children of `html` — used by `shell adopt` to detect chrome siblings without
// reaching into nested markup a mock legitimately owns.
function topLevelChildren(html) {
  const tokens = scanTags(html)
  const out = []
  let k = 0
  while (k < tokens.length) {
    const t = tokens[k]
    if (t.type === 'comment') { k++; continue }
    if (t.type === 'close') { k++; continue } // unmatched at depth 0 — ignore, fail-generous
    if (t.type === 'void') {
      out.push({ start: t.start, end: t.end, name: t.name, raw: t.raw })
      k++
      continue
    }
    // 'open': find its matching close via depth counting, then jump past it.
    let depth = 1
    let m = k + 1
    for (; m < tokens.length; m++) {
      if (tokens[m].type === 'open') depth++
      else if (tokens[m].type === 'close') { depth--; if (depth === 0) break }
    }
    const end = tokens[m] ? tokens[m].end : html.length
    out.push({ start: t.start, end, name: t.name, raw: t.raw })
    k = m + 1
  }
  return out
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const isChromeChild = (c) =>
  ['nav', 'header', 'aside'].includes(c.name) || /role\s*=\s*"(navigation|banner)"/i.test(c.raw)

// ---- D3: expected region derivation -----------------------------------------------------------
// canonHtml's data-shell-canon root, retagged data-shell-region, with contentInner spliced into
// the content slot and aria-current="page" derived onto the one data-nav element matching
// `active` (stripped everywhere else; no match anywhere → no marker at all).
function expectedRegion(canonHtml, name, contentInner, active) {
  const root = findElement(canonHtml, (t) => /data-shell-canon\s*=\s*"[^"]*"/.test(t.raw))
  if (!root) return null
  const openTag = root.openRaw.replace(/data-shell-canon(\s*=\s*"[^"]*")/, 'data-shell-region$1')
  let inner = canonHtml.slice(root.innerStart, root.innerEnd)
  const contentSlot = findElement(inner, (t) => /data-slot\s*=\s*"content"/.test(t.raw))
  if (contentSlot) {
    inner = inner.slice(0, contentSlot.innerStart) + contentInner + inner.slice(contentSlot.innerEnd)
  }
  inner = inner.replace(/<([a-zA-Z][\w-]*)\b([^>]*\bdata-nav\s*=\s*"([^"]*)"[^>]*)>/g,
    (whole, tag, attrs, key) => {
      let newAttrs = attrs.replace(/\s*aria-current\s*=\s*"[^"]*"/g, '')
      if (key === active) newAttrs += ' aria-current="page"'
      return '<' + tag + newAttrs + '>'
    })
  return openTag + inner + '</' + root.name + '>'
}

// ---- D5/build: coverage-ledger derivation (single source, shared by `build` and `shell sync`) -
// label -> {spec, built}. A mock's label is "built" once some spec claiming it in
// .claude/design-coverage.json carries `status: done` — mock authority inverts there (design.md
// § Design Canon), so the default sync walk leaves it alone.
function loadCoverageClaims(root) {
  const claims = new Map()
  try {
    const ledger = JSON.parse(fs.readFileSync(path.join(root, '.claude/design-coverage.json'), 'utf8'))
    for (const src of Object.values(ledger.sources || {})) {
      for (const [ref, v] of Object.entries(src.regions || {})) {
        const label = ref.split('#')[0]
        const spec = v && v.spec
        let built = false
        if (spec) {
          try { built = /^status:\s*done\b/m.test(fs.readFileSync(path.join(root, spec), 'utf8')) } catch {}
        }
        const prev = claims.get(label)
        claims.set(label, { spec, built: built || (prev && prev.built) || false })
      }
    }
  } catch {}
  return claims
}

function builtLabels(root) {
  const out = new Set()
  for (const [label, claim] of loadCoverageClaims(root)) if (claim.built) out.add(label)
  return out
}

// ---- D4: shell family diagnosis for a page mock ----------------------------------------------
// diagnoseMock(mockHtml, shellDir) -> { shell, findings: [{code, text}], expected }
//   codes: undeclared | unknown-shell | drift(slot) | own-chrome | missing-css-link
// `shellDir` is the resolved design/shell/ directory (see resolveShellDir below); the caller is
// responsible for gating the whole family on shellDir existing at all (D4: "bound only when a
// design/shell/ dir resolves").
function diagnoseMock(mockHtml, shellDir) {
  const findings = []
  const root = findElement(mockHtml, (t) => /data-screen-label\s*=\s*"[^"]*"/.test(t.raw))
  if (!root) return { shell: null, findings, expected: null }

  const shellMatch = root.openRaw.match(/data-shell\s*=\s*"([^"]*)"/)
  if (!shellMatch) {
    findings.push({
      code: 'undeclared',
      text: 'no data-shell on the [data-screen-label] root — declare data-shell="<name>" or data-shell="none"',
    })
    return { shell: null, findings, expected: null }
  }
  const name = shellMatch[1]
  if (name === 'none') return { shell: 'none', findings: [], expected: null }

  const canonPath = path.join(shellDir, name + '.html')
  if (!fs.existsSync(canonPath)) {
    findings.push({
      code: 'unknown-shell',
      text: 'declares data-shell="' + name + '" but design/shell/' + name + '.html does not exist — ' +
        'author the shell canon or declare data-shell="none"',
    })
    return { shell: name, findings, expected: null }
  }

  const canonHtml = fs.readFileSync(canonPath, 'utf8')
  const labelMatch = root.openRaw.match(/data-screen-label\s*=\s*"([^"]*)"/)
  const label = labelMatch ? labelMatch[1] : ''
  const activeMatch = root.openRaw.match(/data-active\s*=\s*"([^"]*)"/)
  const active = activeMatch ? activeMatch[1] : label

  const actualRegion = mockHtml.slice(root.innerStart, root.innerEnd)
  const contentSlot = findElement(actualRegion, (t) => /data-slot\s*=\s*"content"/.test(t.raw))
  const contentInner = contentSlot ? actualRegion.slice(contentSlot.innerStart, contentSlot.innerEnd) : ''

  if (/<nav\b/i.test(contentInner) || /<header\b/i.test(contentInner) ||
      /role\s*=\s*"(navigation|banner)"/i.test(contentInner)) {
    findings.push({
      code: 'own-chrome',
      text: 'own nav/header markup inside the content slot — the shell owns chrome; in-content ' +
        'sub-navigation uses role="tablist" or a plain container',
    })
  }

  const cssRe = new RegExp('shell/' + escRe(name) + '\\.css')
  if (!cssRe.test(mockHtml)) {
    findings.push({
      code: 'missing-css-link',
      text: 'declares data-shell="' + name + '" but does not link design/shell/' + name + '.css',
    })
  }

  const expected = expectedRegion(canonHtml, name, contentInner, active)
  if (expected !== null && actualRegion !== expected) {
    const slotNames = [...canonHtml.matchAll(/data-slot\s*=\s*"([^"]+)"/g)].map((m) => m[1])
      .filter((n) => n !== 'content')
    let slotLabel = 'outside slots'
    for (const sn of slotNames) {
      const re = new RegExp('data-slot\\s*=\\s*"' + escRe(sn) + '"')
      const a = findElement(actualRegion, (t) => re.test(t.raw))
      const e = findElement(expected, (t) => re.test(t.raw))
      const aText = a ? actualRegion.slice(a.openStart, a.closeEnd) : null
      const eText = e ? expected.slice(e.openStart, e.closeEnd) : null
      if (aText !== eText) { slotLabel = sn + ' slot'; break }
    }
    findings.push({
      code: 'drift',
      text: 'shell region differs from canon (' + slotLabel + ') — run design-atlas.js shell sync',
    })
  }

  return { shell: name, findings, expected }
}

// ---- D1: canon-file rule set --------------------------------------------------------------
// Flat `selector { decls }` reader shared with design-atlas.js's hygiene checks — duplicated here
// (rather than required cross-file) to keep this module's own dependency surface at zero beyond
// fs/path, per the gate-script convention.
const cssRulesOf = (css) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), decls: m[2] }))

function offTokenColorViolations(pathLabel, text) {
  const out = []
  for (const re of [/#[0-9a-fA-F]{3,8}\b/g, /\brgba?\(/g, /\bhsla?\(/g, /\boklch\(/g]) {
    const m = text.match(re)
    if (m) out.push(pathLabel + ': ' + m.length + ' off-token color literal(s) (' + m[0] + '…) — consume var(--role) from tokens.css')
  }
  return out
}

function cssFileFontSizeViolations(pathLabel, cssText) {
  const rules = cssRulesOf(cssText)
  let count = 0
  let firstSel = null
  for (const r of rules) {
    if (/font-size\s*:/.test(r.decls) && !/line-height\s*:/.test(r.decls)) {
      count++
      if (firstSel === null) firstSel = r.selector
    }
  }
  if (!count) return []
  return [pathLabel + ': ' + count + ' CSS block(s) declare font-size without line-height (first: ' +
    firstSel + ') — undeclared leading is up to 13% height error the gate cannot see']
}

// checkCanon(canonPath, html) -> [violation string, ...] ("<path>: <text>" shape, as `check`
// already prints). Applies D1's rule set to any file whose first labeled root is
// data-shell-canon; the caller is responsible for skipping the data-screen-label requirement and
// forcing hygiene/matrix families bound (D1: "as if approved") for such files.
function checkCanon(canonPath, html) {
  const out = []
  const fileBase = path.basename(canonPath, '.html')
  const root = findElement(html, (t) => /data-shell-canon\s*=\s*"[^"]*"/.test(t.raw))
  if (!root) return out

  const declaredMatch = root.openRaw.match(/data-shell-canon\s*=\s*"([^"]*)"/)
  const declaredName = declaredMatch ? declaredMatch[1] : ''
  if (declaredName !== fileBase) {
    out.push(canonPath + ': data-shell-canon="' + declaredName + '" does not match the file name ' + fileBase + ' — rename one')
  }

  if (!new RegExp('<link[^>]+href="[^"]*' + escRe(fileBase) + '\\.css"').test(html)) {
    out.push(canonPath + ': does not link ' + fileBase + '.css — the shell\'s stylesheet lives beside it')
  }

  const inner = html.slice(root.innerStart, root.innerEnd)
  const slots = findAllElements(inner, (t) => /data-slot\s*=\s*"[^"]*"/.test(t.raw)).map((el) => {
    const m = el.openRaw.match(/data-slot\s*=\s*"([^"]*)"/)
    return { name: m ? m[1] : '', el }
  })
  const contentSlots = slots.filter((s) => s.name === 'content')
  if (contentSlots.length !== 1) {
    out.push(canonPath + ': needs exactly one data-slot="content"')
  } else {
    const c = contentSlots[0].el
    if (inner.slice(c.innerStart, c.innerEnd).trim() !== '') {
      out.push(canonPath + ': content slot must be empty — the shell carries no feature content')
    }
  }
  for (const s of slots) {
    if (s.name === 'content') continue
    if (!/data-contract\s*=\s*"none"/.test(s.el.openRaw)) {
      out.push(canonPath + ': slot "' + s.name + '" must carry data-contract="none" — shell chrome never enters the render gate\'s comparison')
    }
  }

  const cssPath = path.join(path.dirname(canonPath), fileBase + '.css')
  let css = null
  try { css = fs.readFileSync(cssPath, 'utf8') } catch {}
  if (css !== null) {
    out.push(...offTokenColorViolations(cssPath, css))
    out.push(...cssFileFontSizeViolations(cssPath, css))
  }
  return out
}

// "First labeled root" (D1): a file is a shell canon when data-shell-canon appears before any
// data-screen-label in document order (mutually exclusive in every real fixture; the ordering
// check is what keeps a hypothetical file carrying both from being misclassified).
function isCanonFile(html) {
  const canonIx = html.search(/data-shell-canon\s*=\s*"/)
  if (canonIx === -1) return false
  const labelIx = html.search(/data-screen-label\s*=\s*"/)
  return labelIx === -1 || canonIx < labelIx
}

// ---- resolveCanonDir / resolveShellDir ---------------------------------------------------------
// specs/20260907/04-kit-canon-family.md D3: resolveCanonDir(fromPath, family) generalises the
// walk-up design-atlas.js's loadTargets() uses for targets.json over the DIRECTORY NAME — from
// `fromPath`, climb ancestors checking both `<dir>/<family>` (dir IS the design/ folder) and
// `<dir>/design/<family>` (dir is above it), returning the first existing directory. null when no
// design/<family>/ resolves anywhere above fromPath (the family's rule set then stays off
// entirely — the shell family's D4 absence-invariant, generalised). resolveShellDir(fromPath) is
// resolveCanonDir(fromPath, 'shell') — byte-identical in behavior to the pre-D3 implementation
// (A2: it must NOT resolve a tree holding only design/kit/, which is exactly what the generic walk
// checking only the 'shell' family name already guarantees).
function resolveCanonDir(fromPath, family) {
  let dir = path.resolve(fromPath)
  try { if (!fs.statSync(dir).isDirectory()) dir = path.dirname(dir) } catch { dir = path.dirname(dir) }
  for (;;) {
    for (const c of [path.join(dir, family), path.join(dir, 'design', family)]) {
      try { if (fs.statSync(c).isDirectory()) return c } catch {}
    }
    const up = path.dirname(dir)
    if (up === dir) return null
    dir = up
  }
}
function resolveShellDir(fromPath) { return resolveCanonDir(fromPath, 'shell') }

// ---- D2/D3/D4/D13: kit-canon family -----------------------------------------------------------
// "First labeled root" (same ordering test as isCanonFile): a file is a kit canon when
// data-kit-canon appears before any data-screen-label in document order.
function isKitCanonFile(html) {
  const canonIx = html.search(/data-kit-canon\s*=\s*"/)
  if (canonIx === -1) return false
  const labelIx = html.search(/data-screen-label\s*=\s*"/)
  return labelIx === -1 || canonIx < labelIx
}

// htmlFilesIn(dir) -> sorted basenames of the .html files directly in dir, [] on any read error
// (missing dir, not a dir, permission). The one shared body for the "list a design/ subdir's
// .html files" shape that recurs across shell-region.js and mocks-driver.js.
function htmlFilesIn(dir) {
  try { return fs.readdirSync(dir).filter((f) => f.endsWith('.html')).sort() } catch { return [] }
}

// D13: "a primitive is named once per FAMILY, never per file" — every data-kit-primitive key
// declared by every kit-canon .html file sitting directly in `kitDir` (a design/kit/ directory
// already resolved by resolveCanonDir), keyed to the list of files (repeats included) that
// declare it. A file failing to read, or one that is not itself a kit-canon file (first labeled
// root is not data-kit-canon), contributes nothing.
function kitPrimitivesInDir(kitDir) {
  const byKey = new Map()
  for (const f of htmlFilesIn(kitDir)) {
    const p = path.join(kitDir, f)
    let html
    try { html = fs.readFileSync(p, 'utf8') } catch { continue }
    if (!isKitCanonFile(html)) continue
    for (const m of html.matchAll(/data-kit-primitive\s*=\s*"([^"]+)"/g)) {
      if (!byKey.has(m[1])) byKey.set(m[1], [])
      byKey.get(m[1]).push(p)
    }
  }
  return byKey
}

// checkKitCanon(canonPath, html) -> [violation string, ...] ("<path>: <text>" shape, as `check`
// already prints). D2: a duplicate data-kit-primitive key WITHIN this one file is a violation —
// the family-wide half of D13 (a key repeated across two SIBLING files) is derived by the caller
// from kitPrimitivesInDir once per resolved design/kit/ directory (never per file), so this
// function's own scope stays this file's own markup, exactly as checkCanon's scope is its own
// canon file.
function checkKitCanon(canonPath, html) {
  const out = []
  if (!isKitCanonFile(html)) return out
  const counts = new Map()
  for (const m of html.matchAll(/data-kit-primitive\s*=\s*"([^"]+)"/g)) {
    counts.set(m[1], (counts.get(m[1]) || 0) + 1)
  }
  for (const [key, n] of counts) {
    if (n > 1) out.push(canonPath + ': duplicate data-kit-primitive="' + key + '" — a primitive is named once per family')
  }
  return out
}

// D4: the top-level children of the labeled root's CONTENT region — the data-slot="content"
// subtree when the mock declares a shell (data-shell present and resolved to a slot), else the
// labeled root's own top-level children directly.
function kitContentRegionOf(mockHtml, rootEl) {
  const inner = mockHtml.slice(rootEl.innerStart, rootEl.innerEnd)
  const slot = findElement(inner, (t) => /data-slot\s*=\s*"content"/.test(t.raw))
  return slot ? inner.slice(slot.innerStart, slot.innerEnd) : inner
}

// diagnoseKitRegions(mockHtml, kitDir) -> { findings: [{code, text}], kit: <n>, bespoke: <n> }
//   codes: unabsorbed | unknown-kit | bespoke-unnamed
// Each top-level child of the content region (D4), skipping any child itself carrying
// data-contract="none" (the state-button switcher — tooling, never a content region), must carry
// either data-kit="<key>" naming an existing family primitive, or data-bespoke="<key>: <diff>"
// naming an existing primitive and a non-empty difference. `kit`/`bespoke` are D6's raw counts
// (every data-kit / every data-bespoke region, regardless of whether it also finds a violation),
// consumed by the caller's informational ⓘ line — never a gate signal itself.
function diagnoseKitRegions(mockHtml, kitDir) {
  const findings = []
  let kit = 0
  let bespoke = 0
  const root = findElement(mockHtml, (t) => /data-screen-label\s*=\s*"[^"]*"/.test(t.raw))
  if (!root) return { findings, kit, bespoke }
  const validKeys = new Set(kitPrimitivesInDir(kitDir).keys())
  const contentHtml = kitContentRegionOf(mockHtml, root)
  const children = topLevelChildren(contentHtml).filter((c) => !/data-contract\s*=\s*"none"/.test(c.raw))
  let n = 0
  for (const c of children) {
    n++
    const kitMatch = c.raw.match(/data-kit\s*=\s*"([^"]*)"/)
    const bespokeMatch = c.raw.match(/data-bespoke\s*=\s*"([^"]*)"/)
    if (kitMatch) {
      kit++
      if (!validKeys.has(kitMatch[1])) {
        findings.push({
          code: 'unknown-kit',
          text: 'names data-kit="' + kitMatch[1] + '" but design/kit/ declares no primitive "' + kitMatch[1] + '"',
        })
      }
    } else if (bespokeMatch) {
      bespoke++
      // D4: <key> must name an EXISTING primitive, exactly as data-kit's key must. A value with
      // no colon at all keeps the pre-D4-fix fallback (bespoke-unnamed) — there is no key to
      // validate. An empty key (":  <diff>") is not an existing primitive either, so it routes
      // here via the same "" not in validKeys test, ahead of the difference check.
      const m = bespokeMatch[1].match(/^([^:]*):\s*(.*)$/)
      if (m && !validKeys.has(m[1])) {
        findings.push({
          code: 'unknown-kit',
          text: 'names data-bespoke="' + m[1] + ': ' + m[2] + '" but design/kit/ declares no primitive "' + m[1] + '"',
        })
      } else if (!m || !m[2].trim()) {
        findings.push({
          code: 'bespoke-unnamed',
          text: 'data-bespoke="' + bespokeMatch[1] + '" names no difference — say what prevents reuse',
        })
      }
    } else {
      findings.push({
        code: 'unabsorbed',
        text: 'region ' + n + ' carries neither data-kit nor data-bespoke — instantiate a kit primitive ' +
          'or mark it data-bespoke="<key>: <what differs>"',
      })
    }
  }
  return { findings, kit, bespoke }
}

module.exports = {
  VOID_ELEMENTS,
  scanTags,
  findElement,
  findAllElements,
  topLevelChildren,
  isChromeChild,
  expectedRegion,
  diagnoseMock,
  checkCanon,
  isCanonFile,
  offTokenColorViolations,
  resolveCanonDir,
  resolveShellDir,
  isKitCanonFile,
  htmlFilesIn,
  kitPrimitivesInDir,
  checkKitCanon,
  diagnoseKitRegions,
  loadCoverageClaims,
  builtLabels,
}
