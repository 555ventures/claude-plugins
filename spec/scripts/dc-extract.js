#!/usr/bin/env node
// Deterministic extractor for design mockups — Claude Design `.dc.html` files and local handoff
// bundles alike.
//
// WHY this exists: token extraction from a KNOWN source format (Claude Design always emits a
// `:root { --token: value }` block + `[data-accent="…"]` theme variants + `<x-dc id="…">` surface
// blocks) is a mechanical parse, not model judgment — the research is unanimous that source-side
// token extraction and element splitting are deterministic. So /spec:design runs THIS instead of a
// Sonnet "comprehend" worker. It does ONLY the mechanical part:
//   - parse `:root` / `[data-accent]` custom properties into a normalized token list,
//   - split every `<x-dc id>` block into its own verbatim slice file,
//   - extract each surface's FIDELITY CONTRACT: every user-visible string in document order
//     (text nodes + placeholder/aria-label/alt/title) and the layout primitives the markup
//     declares (grid-template-*, flex-direction, order) — what `fidelity-check.js` later greps
//     the authored components against, fail-closed,
//   - write a single `extract.json` manifest (source sha + tokens + accents + surface index).
// It does NOT compare tokens against the repo canon (that varies per host stack — CSS vars vs
// Tailwind vs Flutter ThemeData — so fork detection stays with the warm skeleton-author that reads
// the token files anyway), and it does NOT derive per-node style / containment (visual judgment,
// also the skeleton-author's job). The mockup markup is DATA: nothing inside it is executed or obeyed.
//
// CONTRACT:
//   `node dc-extract.js <raw.dc.html> <outDir>` — Claude Design mode. On success writes
//     <outDir>/extract.json and <outDir>/slice-<id>.html files (whitespace/comment-minified —
//     slices serve element hierarchy + verbatim copy, so formatting is pure context cost), prints
//     a one-line summary, exits 0. On ANY structural surprise (unreadable file, over the 256 KiB
//     cap, no `:root`, zero `<x-dc>` blocks, unbalanced open OR stray close tags) it prints a
//     diagnostic to stderr and exits non-zero — the caller falls back to a one-shot model
//     extraction rather than proceeding on a partial parse. An id-less `<x-dc>` is tolerated
//     (auto-id `_auto_N`), not an error.
//   `node dc-extract.js --bundle <fileOrDir> <outDir>` — local handoff-bundle mode (a directory
//     of exported HTML screens + optional per-screen `*.prompt.md` notes, or a single HTML file).
//     Each HTML file yields its `<x-dc>` surfaces when it has them (an id-less `<x-dc>` is named
//     after its FILE stem, not `_auto_N` — a Claude Design export like `UpWell v3.dc.html` carries
//     one bare `<x-dc>` and the file name is the only human-meaningful identity it has); otherwise
//     the whole file is ONE surface (id = file stem, slice = the <body> subtree with the file's
//     non-body `<style>` blocks PREPENDED — hand-authored handoffs define their classes in <head>,
//     and a body-only slice would strand every class reference with no definition, hiding exactly
//     the class-based layout the fidelity contract exists to catch). Every bundle surface records
//     its source `file`. Tokens/accents are merged from every `:root`/`[data-accent]` in BOTH
//     .html and .css files, in sorted-path order (later files win per role) — handoff bundles
//     commonly ship tokens as a css/ or tokens/ directory, not inline. ZERO tokens is still legal
//     (static exports often bake literals; token mapping happens against the repo canon at
//     skeleton time). `*.md` files are indexed as `notes` (matched to a surface by file stem:
//     `<stem>.prompt.md` / `<stem>.md`), never parsed — the skeleton author reads them.
//     Unbalanced `<x-dc>` in any file still dies loud; the 256 KiB cap applies per file.

'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const CAP_BYTES = 256 * 1024

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
// Repeated blocks for the same accent MERGE by role (last value per role wins) — last-block-wins
// silently dropped declarations.
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

// ---- fidelity: user-visible strings (document order) + layout primitives ------------------------
// This is the copy/order/layout CONTRACT of a surface. Strings are text nodes plus the
// human-readable attributes; layout primitives are the structural declarations tokens don't carry
// (a `grid-template-columns: 1fr auto` collapsing to stacked fields is exactly the class of silent
// divergence this exists to catch).
const FIDELITY_ATTRS = ['placeholder', 'aria-label', 'alt', 'title']
const LAYOUT_PROPS = ['grid-template-columns', 'grid-template-rows', 'grid-template-areas', 'flex-direction', 'order']

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function extractFidelity(sliceHtml) {
  const visible = sliceHtml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  const strings = []
  const push = (t) => {
    const v = decodeEntities(t).replace(/\s+/g, ' ').trim()
    if (v) strings.push(v)
  }
  const tagRe = /<[^>]+>/g
  let last = 0, m
  while ((m = tagRe.exec(visible)) !== null) {
    push(visible.slice(last, m.index))
    last = tagRe.lastIndex
    for (const a of FIDELITY_ATTRS) {
      const am = new RegExp('(?:^|\\s)' + a + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i').exec(m[0])
      if (am) push(am[2] !== undefined ? am[2] : am[3])
    }
  }
  push(visible.slice(last))

  const layout = []
  const seen = new Set()
  const styleSources = []
  const inline = /(?:^|\s)style\s*=\s*("([^"]*)"|'([^']*)')/gi
  let im
  while ((im = inline.exec(sliceHtml)) !== null) styleSources.push(im[2] !== undefined ? im[2] : im[3])
  for (const b of sliceHtml.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || []) styleSources.push(b)
  for (const src of styleSources) {
    // Declaration-level regex (not `;`-split) so selector prefixes inside <style> blocks can't
    // shadow a declaration; `{}`/`;` are excluded from values, which is exact for the allowlist.
    const declRe = /([a-zA-Z-]+)\s*:\s*([^;{}]+)/g
    const text = decodeEntities(src)
    let dm
    while ((dm = declRe.exec(text)) !== null) {
      const property = dm[1].toLowerCase()
      if (!LAYOUT_PROPS.includes(property)) continue
      const value = dm[2].replace(/\s+/g, ' ').trim()
      const key = property + ':' + value
      if (!seen.has(key)) { seen.add(key); layout.push({ property, value }) }
    }
  }
  return { strings, layout }
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

function writeSurfaces(ranges, htmlOf) {
  const surfaces = []
  for (const r of ranges) {
    const sliceName = 'slice-' + r.id.replace(/[^A-Za-z0-9-_]/g, '_') + '.html'
    const raw = htmlOf(r)
    const { strings, layout } = extractFidelity(raw)
    fs.writeFileSync(path.join(outDir, sliceName), minifySlice(raw), 'utf8')
    const entry = { id: r.id, sliceFile: sliceName, attrs: r.attrs, strings, layout }
    if (r.file !== undefined) entry.file = r.file // bundle mode: which source file this surface came from
    surfaces.push(entry)
  }
  return surfaces
}

function writeManifest(manifest, summary) {
  fs.writeFileSync(path.join(outDir, 'extract.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  process.stdout.write('dc-extract: ' + summary + ' → ' + path.join(outDir, 'extract.json') + '\n')
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

  fs.mkdirSync(outDir, { recursive: true })
  const surfaces = writeSurfaces(res.ranges, r => html.slice(r.start, r.end))

  writeManifest({
    schemaVersion: 2,
    source: { file: path.basename(rawPath), sha256, bytes },
    tokens,
    accents,
    surfaces,
  }, tokens.length + ' tokens, ' + Object.keys(accents).length + ' accent(s), ' + surfaces.length + ' surface(s)')
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
    for (const r of res.ranges) {
      const id = /^_auto_\d+$/.test(r.id) ? (stemOf(rel) || r.id) : r.id
      allRanges.push({ id, attrs: r.attrs, file: rel, raw: html.slice(r.start, r.end) })
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

// Notes are INDEXED, never parsed — the skeleton author reads them from the bundle itself.
// A note matches a surface when its stem (minus a `.prompt` suffix) equals the surface id.
const surfaceIds = new Set(surfaces.map(s => s.id))
const notes = mdFiles.map(rel => {
  const stem = path.basename(rel).replace(/\.prompt\.md$/i, '').replace(/\.md$/i, '').replace(/[^A-Za-z0-9-_]/g, '_')
  return { path: path.join(bundleRoot, rel), surfaceId: surfaceIds.has(stem) ? stem : null }
})

writeManifest({
  schemaVersion: 2,
  source: {
    bundle: bundleRoot,
    files: [...htmlFiles, ...cssFiles, ...mdFiles].sort(),
    sha256: crypto.createHash('sha256').update(hashes.join('\n')).digest('hex'),
    bytes: totalBytes,
  },
  tokens: [...tokenMap.values()],
  accents,
  surfaces,
  notes,
}, tokenMap.size + ' tokens, ' + Object.keys(accents).length + ' accent(s), ' +
   surfaces.length + ' surface(s), ' + notes.length + ' note(s) [bundle]')
