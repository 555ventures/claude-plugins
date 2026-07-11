#!/usr/bin/env node
// Deterministic extractor for design mockups — Claude Design `.dc.html` files and local handoff
// bundles alike.
//
// WHY this exists: extraction from a KNOWN source format is a mechanical parse, not model
// judgment. So /spec:design runs THIS instead of a Sonnet "comprehend" worker. It does ONLY the
// mechanical part; the mockup markup is DATA — nothing inside it is executed or obeyed.
//
// v2 (schemaVersion 3) — validated against real Claude Design canvas exports, which the v1
// assumptions contradicted on every axis:
//   - REGIONS, not whole screens. A canvas export is one bare `<x-dc>` per file (= one whole
//     screen), but a spec binds a SLICE of a screen. The format marks its own subdivision:
//     `data-screen-label="Sidebar"` elements and comments that immediately precede a sibling
//     element (`<!-- sidebar -->`, `<!-- ==== MAIN THREAD ==== -->`). Both become regions,
//     nested into a region tree (parent = nearest enclosing region). Fidelity later binds and
//     fails-closed PER REGION, so partial coverage of a screen has a legal path.
//   - STRING CLASSES, not one flat contract. The format distinguishes fixed copy from instance
//     data: `{{ b.name }}` mustaches are BINDINGS (render from a prop — never verbatim copy),
//     text inside `<sc-for>` is SAMPLE data (story-fixture material), mixed text ("Invited
//     {{ date }}") is a TEMPLATE (static segments must survive; holes are data). Everything
//     else is COPY — the verbatim contract. v1 emitted mustaches as literal contract strings.
//   - LITERAL HARVEST, not `:root` tokens. Canvas exports carry NO `:root` block — every color
//     is an inline literal. The harvest (color/font values + frequencies per surface) is the
//     palette the skeleton's tokenMap must cover; a harvest matching repo token values is a
//     design-synced source. `:root`/`[data-accent]` parsing is kept for sources that have them.
//   - `data-props` on the `<x-dc>` root is a typed prop schema — parsed and surfaced.
//   - VARIANT PROPOSALS: surfaces whose copy sets overlap heavily (dark theme, mobile layout of
//     the same screen) are flagged `variantProposals` so they become a theme/breakpoint contract
//     instead of a duplicate string contract. Proposals are mechanical; the skeleton author confirms.
//
// CONTRACT:
//   `node dc-extract.js <raw.dc.html> <outDir>` — Claude Design URL-fetch mode. Requires a
//     `:root` token block (that format emits one); zero `<x-dc>` blocks or unbalanced tags die
//     loud. Writes <outDir>/extract.json + slice files.
//   `node dc-extract.js --bundle <fileOrDir> <outDir>` — local handoff-bundle mode (a directory
//     of exported HTML screens + optional *.prompt.md notes, or a single HTML file). One surface
//     per HTML file (id = file stem; `<x-dc>` blocks slice as usual — an id-less block is named
//     after its FILE stem); a file with no <x-dc> is one surface (body subtree + head <style>
//     blocks prepended so class-based layout reaches the fidelity contract). Tokens/accents merge
//     from every `:root`/`[data-accent]` across .html and .css files in sorted-path order (later
//     wins per role); ZERO tokens is legal (canvas exports bake literals — that is what the
//     literal harvest is for). `*.md` files are indexed as notes (never parsed) and hashed into
//     source.sha256 so a note edit cache-busts the extract. 256 KiB cap per file.
//
// Slices: the surface slice (whole `<x-dc>` subtree, minified) plus PER-REGION slices
// (slice-<surface>__<region>.html) for screen-label regions at any depth and comment regions at
// region-tree depth <= 2 — workers read the region they bind, not a 60 KB screen.

'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const CAP_BYTES = 256 * 1024
const SCHEMA_VERSION = 3

function die(msg) {
  process.stderr.write('dc-extract: ' + msg + '\n')
  process.exit(1)
}

const argv = process.argv.slice(2)
const BUNDLE = argv[0] === '--bundle'
const [rawPath, outDir] = BUNDLE ? argv.slice(1) : argv
if (!rawPath || !outDir) die('usage: dc-extract [--bundle] <raw.dc.html | bundle file/dir> <outDir>')

// ---- tokens: custom properties inside a selector block ----------------------------------------
// Token CSS lives inside <style> blocks; anchor all selector searches there so a `:root` in a
// comment or prose can never be mistaken for the token block. (Fallback to the whole document
// only if the file carries no <style> at all — tolerant of fragment exports.)
function styleTextOf(html) {
  return (html.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || []).join('\n') || html
}

// Split on `;` and match each `--name: value` declaration — tolerant of a last declaration
// without a trailing semicolon (valid CSS the old `[^;]+;` regex silently dropped).
function declsIn(blockBody) {
  const out = []
  for (const part of blockBody.split(';')) {
    const m = /^\s*--([A-Za-z0-9-_]+)\s*:\s*([\s\S]+?)\s*$/.exec(part)
    if (m) out.push({ role: '--' + m[1], value: m[2].trim() })
  }
  return out
}
function firstBlockBody(styleText, selectorRe) {
  const m = selectorRe.exec(styleText)
  if (!m) return null
  const open = styleText.indexOf('{', m.index)
  if (open === -1) return null
  const close = styleText.indexOf('}', open)
  if (close === -1) return null
  return styleText.slice(open + 1, close)
}

// Merge EVERY `:root` block's declarations into tokenMap (later blocks win per role). Claude
// Design mode keeps firstBlockBody (its format emits exactly one); bundle token files routinely
// carry several `:root` blocks across several css files.
function mergeRootDecls(tokenMap, styleText) {
  const re = /:root\s*\{/g
  let m
  while ((m = re.exec(styleText)) !== null) {
    const open = styleText.indexOf('{', m.index)
    if (open === -1) continue
    const close = styleText.indexOf('}', open)
    if (close === -1) continue
    for (const d of declsIn(styleText.slice(open + 1, close))) tokenMap.set(d.role, d)
  }
}

// accents: every `[data-accent="X"] { … }` variant → its declarations under the accent name.
// Repeated blocks for the same accent MERGE by role (last value per role wins).
function mergeAccents(accents, styleText) {
  const re = /\[data-accent\s*=\s*["']([^"']+)["']\s*\]\s*\{/g
  let m
  while ((m = re.exec(styleText)) !== null) {
    const open = m.index + m[0].length - 1
    const close = styleText.indexOf('}', open)
    if (close === -1) continue
    const merged = new Map((accents[m[1]] || []).map(d => [d.role, d]))
    for (const d of declsIn(styleText.slice(open + 1, close))) merged.set(d.role, d)
    accents[m[1]] = [...merged.values()]
  }
}

// ---- surfaces: depth-matched <x-dc> ranges (nested surfaces each get their own slice) ----------
// Tokenize open/close tags in document order, match with a stack so every <x-dc> (including nested)
// gets its exact subtree. A self-closing `<x-dc … />` is a leaf (open+close at once).
// Returns {ranges, autoId} or {error, autoId} — the caller decides whether unbalanced is fatal.
function xdcRanges(html, autoIdStart) {
  const events = []
  const tagRe = /<x-dc\b([^>]*)>|<\/x-dc\s*>/g
  let t
  while ((t = tagRe.exec(html)) !== null) {
    if (t[0].charAt(1) === '/') {
      events.push({ kind: 'close', at: t.index, end: tagRe.lastIndex })
    } else {
      const selfClose = /\/\s*>$/.test(t[0])
      events.push({ kind: 'open', at: t.index, end: tagRe.lastIndex, attrs: t[1] || '', selfClose })
    }
  }
  const attrId = (attrs) => {
    const m = /\bid\s*=\s*["']([^"']+)["']/.exec(attrs)
    return m ? m[1] : null
  }
  const ranges = [] // {id, attrs, start, end}
  const stack = []
  let autoId = autoIdStart
  let strayCloses = 0
  for (const ev of events) {
    if (ev.kind === 'open') {
      const id = attrId(ev.attrs) || ('_auto_' + (autoId++))
      if (ev.selfClose) {
        ranges.push({ id, attrs: ev.attrs.trim(), start: ev.at, end: ev.end })
      } else {
        stack.push({ id, attrs: ev.attrs.trim(), start: ev.at })
      }
    } else {
      const open = stack.pop()
      if (open) ranges.push({ id: open.id, attrs: open.attrs, start: open.start, end: ev.end })
      else strayCloses++ // a close with no matching open is unbalanced too — fail loud
    }
  }
  if (stack.length || strayCloses) {
    return { error: 'unbalanced <x-dc> tags (' + stack.length + ' unclosed, ' + strayCloses +
      ' stray close(s)) — cannot slice safely', autoId }
  }
  ranges.sort((a, b) => a.start - b.start)
  return { ranges, autoId }
}

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

// ---- positional HTML tree ------------------------------------------------------------------------
// A tiny tolerant parser that keeps byte offsets (regions need exact subtree ranges for their
// slices). Elements/comments/text only; <style>/<script> bodies are raw text; a close tag with no
// matching open is ignored; an open tag left unclosed auto-closes when its ancestor closes.
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
const RAWTEXT_TAGS = new Set(['style', 'script'])

function parseAttrs(s) {
  const attrs = new Map()
  const re = /([a-zA-Z_:][-\w:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
  let m
  while ((m = re.exec(s)) !== null) {
    const v = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : ''
    attrs.set(m[1].toLowerCase(), decodeEntities(v))
  }
  return attrs
}

function parseTree(html) {
  const root = { type: 'root', tag: null, children: [] }
  const stack = [root]
  const top = () => stack[stack.length - 1]
  const addText = (text, start) => { if (text) top().children.push({ type: 'text', text, start, end: start + text.length }) }
  let i = 0
  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt === -1) { addText(html.slice(i), i); break }
    if (lt > i) addText(html.slice(i, lt), i)
    if (html.startsWith('<!--', lt)) {
      let end = html.indexOf('-->', lt + 4)
      const stop = end === -1 ? html.length : end + 3
      top().children.push({ type: 'comment', text: html.slice(lt + 4, end === -1 ? html.length : end), start: lt, end: stop })
      i = stop
      continue
    }
    const closeM = /^<\/([a-zA-Z][\w-]*)\s*>/.exec(html.slice(lt, lt + 200))
    if (closeM) {
      const tag = closeM[1].toLowerCase()
      // find the matching open on the stack; auto-close everything above it
      let at = -1
      for (let k = stack.length - 1; k >= 1; k--) if (stack[k].tag === tag) { at = k; break }
      if (at > -1) {
        // auto-closed elements (unclosed children) end BEFORE the close tag; the matched one at it
        while (stack.length > at + 1) { const n = stack.pop(); n.end = lt }
        stack.pop().end = lt + closeM[0].length
      }
      i = lt + closeM[0].length
      continue
    }
    const openM = /^<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/.exec(html.slice(lt))
    if (!openM) { addText('<', lt); i = lt + 1; continue } // stray '<' in text
    const tag = openM[1].toLowerCase()
    const selfClose = /\/\s*$/.test(openM[2]) || VOID_TAGS.has(tag)
    const node = {
      type: 'el', tag, attrs: parseAttrs(openM[2].replace(/\/\s*$/, '')),
      children: [], start: lt, end: lt + openM[0].length,
    }
    top().children.push(node)
    i = lt + openM[0].length
    if (selfClose) continue
    if (RAWTEXT_TAGS.has(tag)) {
      const closeRe = new RegExp('</' + tag + '\\s*>', 'i')
      const m = closeRe.exec(html.slice(i))
      const bodyEnd = m ? i + m.index : html.length
      node.children.push({ type: 'text', text: html.slice(i, bodyEnd), start: i, end: bodyEnd, raw: true })
      node.end = m ? bodyEnd + m[0].length : html.length
      i = node.end
      continue
    }
    stack.push(node)
  }
  while (stack.length > 1) { const n = stack.pop(); n.end = html.length } // unclosed at EOF
  return root
}

// ---- surface analysis: regions + classed entries + layout + literal harvest ---------------------
// This is the fidelity CONTRACT of a surface, region-scoped and string-classed.
const FIDELITY_ATTRS = ['placeholder', 'aria-label', 'alt', 'title']
const LAYOUT_PROPS = ['grid-template-columns', 'grid-template-rows', 'grid-template-areas', 'flex-direction', 'order']
const MUSTACHE_RE = /\{\{[^{}]*\}\}/g

const normText = (s) => decodeEntities(s).replace(/\s+/g, ' ').trim()

// A comment names the next element sibling. Decoration (`====`, `──`, `══`) is stripped; an
// all-decoration comment is not a label.
function commentLabel(text) {
  const t = text.replace(/[=─━═│┃▁▂*_~-]{2,}/g, ' ').replace(/\s+/g, ' ').trim()
  return t || null
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'region'

// Classify one visible string into contract entries. Inside <sc-for>, copy demotes to SAMPLE
// (instance data the story fixture carries); mustache-only text is a BINDING (renders from a
// prop — it must never become a verbatim contract row); mixed text is a TEMPLATE whose static
// segments are the contract and whose holes are data.
function classifyText(text, inFor) {
  const v = normText(text)
  if (!v) return []
  const mustaches = v.match(MUSTACHE_RE)
  if (!mustaches) return [{ kind: inFor ? 'sample' : 'copy', value: v }]
  const segments = v.split(MUSTACHE_RE).map(s => s.replace(/\s+/g, ' ').trim())
  if (segments.every(s => !s)) {
    return mustaches.map(m => ({ kind: 'binding', value: m.replace(/^\{\{\s*|\s*\}\}$/g, '') }))
  }
  return [{ kind: 'template', value: v, segments }]
}

function harvestLiterals(styleText, colorCount, fontCount) {
  const t = decodeEntities(styleText)
  for (const c of t.match(/#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?|oklch|oklab)\([^)]*\)/g) || []) {
    const v = c.replace(/\s+/g, '')
    colorCount.set(v, (colorCount.get(v) || 0) + 1)
  }
  const fontRe = /font(?:-family)?\s*:\s*([^;{}]+)/gi
  let m
  while ((m = fontRe.exec(t)) !== null) {
    // shorthand `font:` values end with the family list; keep the declaration value as-is
    const v = m[1].replace(/\s+/g, ' ').trim()
    if (v) fontCount.set(v, (fontCount.get(v) || 0) + 1)
  }
}

function harvestLayout(styleText, region, layout, seen) {
  const declRe = /([a-zA-Z-]+)\s*:\s*([^;{}]+)/g
  const t = decodeEntities(styleText)
  let m
  while ((m = declRe.exec(t)) !== null) {
    const property = m[1].toLowerCase()
    if (!LAYOUT_PROPS.includes(property)) continue
    const value = m[2].replace(/\s+/g, ' ').trim()
    const key = region + '\0' + property + ':' + value
    if (!seen.has(key)) { seen.add(key); layout.push({ region, property, value }) }
  }
}

// analyzeSurface(raw) → { regions, entries, layout, literals, props, regionRanges }
// regions: [{id, label, source: root|screen-label|comment, parent}] — a tree via parent.
// entries: [{region, kind: copy|template|binding|sample, value, segments?, attr?}] in document order.
// regionRanges: id → {start,end} into `raw` (for per-region slices; root maps to the whole raw).
function analyzeSurface(raw) {
  const tree = parseTree(raw)
  // an <x-dc> wrapper is the surface itself, not content — descend into it
  let nodes = tree.children
  let props = null
  const topEls = nodes.filter(n => n.type === 'el')
  if (topEls.length === 1 && topEls[0].tag === 'x-dc') {
    const dp = topEls[0].attrs.get('data-props')
    if (dp) { try { props = JSON.parse(dp) } catch { /* malformed: ignore, not fatal */ } }
    nodes = topEls[0].children
  }

  const regions = [{ id: 'root', label: null, source: 'root', parent: null }]
  const regionRanges = new Map([['root', { start: 0, end: raw.length }]])
  const usedIds = new Set(['root'])
  const entries = []
  const layout = []
  const layoutSeen = new Set()
  const colorCount = new Map()
  const fontCount = new Map()

  const newRegion = (label, source, parent, node) => {
    let id = slug(label)
    let n = 1
    while (usedIds.has(id)) id = slug(label) + '-' + (++n)
    usedIds.add(id)
    regions.push({ id, label, source, parent })
    regionRanges.set(id, { start: node.start, end: node.end })
    return id
  }

  const walk = (children, region, inFor) => {
    let pending = null // {label} from a comment awaiting its element sibling
    for (const n of children) {
      if (n.type === 'comment') {
        const label = commentLabel(n.text)
        if (label) pending = label
        continue
      }
      if (n.type === 'text') {
        if (n.raw) continue // style/script bodies are handled by their element
        const before = entries.length
        entries.push(...classifyText(n.text, inFor).map(e => ({ region, ...e })))
        if (entries.length > before) pending = null // real content consumed the comment
        continue
      }
      // element
      // the typed prop schema rides on whatever element carries data-props (the <x-dc> root in
      // some exports, a <script type="text/x-dc" data-dc-script> in canvas exports) — first wins
      if (props === null && n.attrs.has('data-props')) {
        try { props = JSON.parse(n.attrs.get('data-props')) } catch { /* malformed: ignore, not fatal */ }
      }
      let rid = region
      const label = n.attrs.get('data-screen-label')
      if (typeof label === 'string' && label.trim()) rid = newRegion(label.trim(), 'screen-label', region, n)
      else if (pending) rid = newRegion(pending, 'comment', region, n)
      pending = null
      if (RAWTEXT_TAGS.has(n.tag)) {
        const body = n.children.map(c => c.text || '').join('')
        if (n.tag === 'style') {
          harvestLayout(body, rid, layout, layoutSeen)
          harvestLiterals(body, colorCount, fontCount)
        }
        continue
      }
      for (const a of FIDELITY_ATTRS) {
        const v = n.attrs.get(a)
        if (typeof v === 'string' && v.trim()) {
          entries.push(...classifyText(v, inFor).map(e => ({ region: rid, attr: a, ...e })))
        }
      }
      const inline = n.attrs.get('style')
      if (inline) {
        harvestLayout(inline, rid, layout, layoutSeen)
        harvestLiterals(inline, colorCount, fontCount)
      }
      walk(n.children, rid, inFor || n.tag === 'sc-for')
    }
  }
  walk(nodes, 'root', false)

  const rank = (map) => [...map.entries()].map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : 1))
  return { regions, entries, layout, literals: { colors: rank(colorCount), fonts: rank(fontCount) }, props, regionRanges }
}

// Canvas exports park the typed prop schema OUTSIDE the `<x-dc>` block, on a sibling
// `<script type="text/x-dc" data-dc-script data-props="…">` — harvest it at file level and
// attach it to the file's surfaces (a surface's own data-props, when present, wins).
function filePropsOf(html) {
  const m = /<script\b((?:"[^"]*"|'[^']*'|[^>"'])*data-dc-script(?:"[^"]*"|'[^']*'|[^>"'])*)>/i.exec(html)
  if (!m) return null
  const dp = parseAttrs(m[1]).get('data-props')
  if (!dp) return null
  try { return JSON.parse(dp) } catch { return null }
}

// Slices are consulted by workers for element hierarchy and verbatim copy, so comments and
// indentation are pure context cost — strip them at write time.
function minifySlice(s) {
  return s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim() + '\n'
}

// id collisions (duplicate or auto vs real) get a positional suffix so every slice file is
// distinct. Suffixed ids are RE-REGISTERED so a genuine surface named e.g. `id-1` can never be
// clobbered by a collision suffix landing on the same name. Maps, not {} — a surface literally
// named `constructor` must not hit Object.prototype.
function dedupeIds(ranges) {
  const used = new Set()
  const counters = new Map()
  for (const r of ranges) {
    let id = r.id
    while (used.has(id)) {
      counters.set(r.id, (counters.get(r.id) || 0) + 1)
      id = r.id + '-' + counters.get(r.id)
    }
    used.add(id)
    r.id = id
  }
}

function readCapped(p) {
  let html
  try {
    html = fs.readFileSync(p, 'utf8')
  } catch (e) {
    die('cannot read ' + p + ': ' + e.message)
  }
  const bytes = Buffer.byteLength(html, 'utf8')
  if (bytes > CAP_BYTES) die(p + ' is ' + bytes + ' bytes, over the 256 KiB cap — split the design')
  return { html, bytes }
}

// region-tree depth via parent chain (root = 0)
function regionDepth(regions, id) {
  const byId = new Map(regions.map(r => [r.id, r]))
  let d = 0
  let cur = byId.get(id)
  while (cur && cur.parent) { d++; cur = byId.get(cur.parent) }
  return d
}

function writeSurfaces(ranges, htmlOf) {
  const surfaces = []
  for (const r of ranges) {
    const safe = r.id.replace(/[^A-Za-z0-9-_]/g, '_')
    const sliceName = 'slice-' + safe + '.html'
    const raw = htmlOf(r)
    const a = analyzeSurface(raw)
    fs.writeFileSync(path.join(outDir, sliceName), minifySlice(raw), 'utf8')
    // per-region slices: screen-label regions always; comment regions at depth <= 2 — deep
    // annotation comments (`<!-- day label -->`) are anchors, not files
    for (const reg of a.regions) {
      if (reg.id === 'root') { reg.sliceFile = sliceName; continue }
      const depth = regionDepth(a.regions, reg.id)
      if (reg.source === 'screen-label' || depth <= 2) {
        const range = a.regionRanges.get(reg.id)
        reg.sliceFile = 'slice-' + safe + '__' + reg.id + '.html'
        fs.writeFileSync(path.join(outDir, reg.sliceFile), minifySlice(raw.slice(range.start, range.end)), 'utf8')
      }
    }
    const entry = {
      id: r.id, sliceFile: sliceName, attrs: r.attrs,
      regions: a.regions, entries: a.entries, layout: a.layout, literals: a.literals,
    }
    if (a.props || r.fileProps) entry.props = a.props || r.fileProps
    if (r.file !== undefined) entry.file = r.file // bundle mode: which source file this surface came from
    surfaces.push(entry)
  }
  return surfaces
}

// ---- variant proposals ---------------------------------------------------------------------------
// Two surfaces whose fixed-copy sets overlap heavily are almost certainly the same screen re-themed
// (dark mode) or re-laid-out (mobile). Binding both as independent string contracts is duplicate
// work and duplicate failure surface — propose the variant link mechanically; the skeleton author
// confirms and turns it into a theme/breakpoint contract. Overlap = |A∩B| / min(|A|,|B|).
function variantProposals(surfaces) {
  const sets = surfaces.map(s => ({
    id: s.id,
    set: new Set(s.entries.filter(e => e.kind === 'copy').map(e => e.value.toLowerCase())),
  }))
  const out = []
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const [a, b] = [sets[i], sets[j]]
      const minSize = Math.min(a.set.size, b.set.size)
      if (minSize < 8) continue // too little copy to call anything a variant
      let inter = 0
      for (const v of a.set) if (b.set.has(v)) inter++
      const overlap = inter / minSize
      if (overlap >= 0.5) {
        // the smaller copy set is the variant; the larger is canonical
        const [variant, of] = a.set.size <= b.set.size ? [a.id, b.id] : [b.id, a.id]
        out.push({ surface: variant, of, overlap: Math.round(overlap * 100) / 100 })
      }
    }
  }
  return out
}

function writeManifest(manifest, summary) {
  fs.writeFileSync(path.join(outDir, 'extract.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  process.stdout.write('dc-extract: ' + summary + ' → ' + path.join(outDir, 'extract.json') + '\n')
}

function surfaceSummary(surfaces, variants) {
  const counts = { copy: 0, template: 0, binding: 0, sample: 0 }
  let regionN = 0
  for (const s of surfaces) {
    regionN += s.regions.length - 1
    for (const e of s.entries) counts[e.kind]++
  }
  return surfaces.length + ' surface(s), ' + regionN + ' region(s), ' +
    counts.copy + ' copy / ' + counts.template + ' template / ' + counts.binding + ' binding / ' +
    counts.sample + ' sample string(s)' + (variants.length ? ', ' + variants.length + ' variant proposal(s)' : '')
}

// ================================ Claude Design mode ============================================
if (!BUNDLE) {
  const { html, bytes } = readCapped(rawPath)
  const sha256 = crypto.createHash('sha256').update(html).digest('hex')
  const styleText = styleTextOf(html)

  const rootBody = firstBlockBody(styleText, /:root\s*\{/g)
  if (rootBody === null) die('no `:root` block found — not a recognizable Claude Design mockup')
  const tokens = declsIn(rootBody)
  if (tokens.length === 0) die('`:root` block has no `--custom: value` declarations')

  const accents = {}
  mergeAccents(accents, styleText)

  const res = xdcRanges(html, 0)
  if (res.error) die(res.error)
  if (res.ranges.length === 0) die('no `<x-dc>` surface blocks found — not a recognizable Claude Design mockup')
  dedupeIds(res.ranges)

  const fp = filePropsOf(html)
  if (fp) for (const r of res.ranges) r.fileProps = fp

  fs.mkdirSync(outDir, { recursive: true })
  const surfaces = writeSurfaces(res.ranges, r => html.slice(r.start, r.end))
  const variants = variantProposals(surfaces)

  writeManifest({
    schemaVersion: SCHEMA_VERSION,
    source: { file: path.basename(rawPath), sha256, bytes },
    tokens,
    accents,
    surfaces,
    variantProposals: variants,
  }, tokens.length + ' tokens, ' + Object.keys(accents).length + ' accent(s), ' + surfaceSummary(surfaces, variants))
  process.exit(0)
}

// ================================ Bundle mode ===================================================
let stat
try {
  stat = fs.statSync(rawPath)
} catch (e) {
  die('cannot read ' + rawPath + ': ' + e.message)
}
const bundleRoot = stat.isDirectory() ? path.resolve(rawPath) : path.resolve(path.dirname(rawPath))
const rels = stat.isDirectory()
  ? fs.readdirSync(rawPath, { recursive: true }).map(String).sort()
  : [path.basename(rawPath)]
const htmlFiles = rels.filter(f => /\.html?$/i.test(f))
const cssFiles = stat.isDirectory() ? rels.filter(f => /\.css$/i.test(f)) : []
const mdFiles = stat.isDirectory() ? rels.filter(f => /\.md$/i.test(f)) : []
if (htmlFiles.length === 0) die('no .html files in bundle ' + rawPath)

// `UpWell v3.dc.html` → `UpWell_v3`: the surface id a human recognizes. The `.dc` marker is a
// format suffix, not identity.
const stemOf = (rel) => path.basename(rel).replace(/\.html?$/i, '').replace(/\.dc$/i, '').replace(/[^A-Za-z0-9-_]/g, '_')

const tokenMap = new Map() // role → {role, value}; later files win per role
const accents = {}
const hashes = []
let totalBytes = 0
const allRanges = [] // {id, attrs, file, raw}
let autoId = 0

// One sorted pass over html + css + md so "later files win per role" is deterministic across
// kinds. css files feed ONLY tokens/accents — handoff bundles ship their palette as css files
// (often a tokens/ subdirectory the html never inlines). md files feed ONLY the source hash:
// they carry binding copy specs, so an edited note must cache-bust the extract (staleness checks
// compare this sha) even though notes are indexed, never parsed.
for (const rel of [...htmlFiles, ...cssFiles, ...mdFiles].sort()) {
  const abs = path.join(bundleRoot, rel)
  const { html, bytes } = readCapped(abs)
  totalBytes += bytes
  hashes.push(rel + '\0' + crypto.createHash('sha256').update(html).digest('hex'))
  if (/\.md$/i.test(rel)) continue

  const styleText = styleTextOf(html) // for a css file there are no <style> tags → whole file
  mergeRootDecls(tokenMap, styleText)
  mergeAccents(accents, styleText)
  if (/\.css$/i.test(rel)) continue

  const res = xdcRanges(html, autoId)
  if (res.error) die(rel + ': ' + res.error)
  autoId = res.autoId
  if (res.ranges.length > 0) {
    // An id-less block is named after its file — `_auto_N` would strip the only human-meaningful
    // identity a one-surface-per-file export has (dedupeIds suffixes a second bare block).
    const fp = filePropsOf(html)
    for (const r of res.ranges) {
      const id = /^_auto_\d+$/.test(r.id) ? (stemOf(rel) || r.id) : r.id
      allRanges.push({ id, attrs: r.attrs, file: rel, raw: html.slice(r.start, r.end), fileProps: fp })
    }
  } else {
    // Whole file = one surface: the <body> subtree PLUS the file's non-body <style> blocks —
    // hand-authored handoffs define their classes in <head>, and a body-only slice would strand
    // every class reference (and hide class-based layout from the fidelity contract). A fragment
    // export (no <body>) is used as-is.
    const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html)
    let raw = html
    if (body) {
      const outside = []
      const styleRe = /<style\b[^>]*>[\s\S]*?<\/style>/gi
      let sm
      while ((sm = styleRe.exec(html)) !== null) {
        if (sm.index < body.index || sm.index >= body.index + body[0].length) outside.push(sm[0])
      }
      raw = (outside.length ? outside.join('\n') + '\n' : '') + body[1]
    }
    allRanges.push({ id: stemOf(rel) || ('_auto_' + (autoId++)), attrs: '', file: rel, raw })
  }
}
dedupeIds(allRanges)

fs.mkdirSync(outDir, { recursive: true })
const surfaces = writeSurfaces(allRanges, r => r.raw)
const variants = variantProposals(surfaces)

// Notes are INDEXED, never parsed — the skeleton author reads them from the bundle itself.
// A note matches a surface when its stem (minus a `.prompt` suffix) equals the surface id.
const surfaceIds = new Set(surfaces.map(s => s.id))
const notes = mdFiles.map(rel => {
  const stem = path.basename(rel).replace(/\.prompt\.md$/i, '').replace(/\.md$/i, '').replace(/[^A-Za-z0-9-_]/g, '_')
  return { path: path.join(bundleRoot, rel), surfaceId: surfaceIds.has(stem) ? stem : null }
})

writeManifest({
  schemaVersion: SCHEMA_VERSION,
  source: {
    bundle: bundleRoot,
    files: [...htmlFiles, ...cssFiles, ...mdFiles].sort(),
    sha256: crypto.createHash('sha256').update(hashes.join('\n')).digest('hex'),
    bytes: totalBytes,
  },
  tokens: [...tokenMap.values()],
  accents,
  surfaces,
  variantProposals: variants,
  notes,
}, tokenMap.size + ' tokens, ' + Object.keys(accents).length + ' accent(s), ' +
   surfaceSummary(surfaces, variants) + ', ' + notes.length + ' note(s) [bundle]')
