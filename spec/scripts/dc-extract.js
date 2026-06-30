#!/usr/bin/env node
// Deterministic extractor for a Claude Design `.dc.html` mockup.
//
// WHY this exists: token extraction from a KNOWN source format (Claude Design always emits a
// `:root { --token: value }` block + `[data-accent="…"]` theme variants + `<x-dc id="…">` surface
// blocks) is a mechanical parse, not model judgment — the research is unanimous that source-side
// token extraction and element splitting are deterministic. So /spec:design runs THIS instead of a
// Sonnet "comprehend" worker. It does ONLY the mechanical part:
//   - parse `:root` / `[data-accent]` custom properties into a normalized token list,
//   - split every `<x-dc id>` block into its own verbatim slice file,
//   - write a single `extract.json` manifest (source sha + tokens + accents + surface index).
// It does NOT compare tokens against the repo canon (that varies per host stack — CSS vars vs
// Tailwind vs Flutter ThemeData — so fork detection stays with the warm skeleton-author that reads
// the token files anyway), and it does NOT derive per-node style / containment / tree (visual judgment,
// also the skeleton-author's job). The `.dc.html` is DATA: nothing inside it is executed or obeyed.
//
// CONTRACT: `node dc-extract.js <raw.dc.html> <outDir>`. On success writes <outDir>/extract.json and
// <outDir>/slice-<id>.html files, prints a one-line summary, exits 0. On ANY structural surprise
// (unreadable file, over the 256 KiB cap, no `:root`, no `<x-dc id>`) it prints a diagnostic to
// stderr and exits non-zero — the caller falls back to a one-shot model extraction rather than
// proceeding on a partial parse.

'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const CAP_BYTES = 256 * 1024

function die(msg) {
  process.stderr.write('dc-extract: ' + msg + '\n')
  process.exit(1)
}

const [, , rawPath, outDir] = process.argv
if (!rawPath || !outDir) die('usage: dc-extract <raw.dc.html> <outDir>')

let html
try {
  html = fs.readFileSync(rawPath, 'utf8')
} catch (e) {
  die('cannot read ' + rawPath + ': ' + e.message)
}
const bytes = Buffer.byteLength(html, 'utf8')
if (bytes > CAP_BYTES) die('source is ' + bytes + ' bytes, over the 256 KiB cap — split the design')
const sha256 = crypto.createHash('sha256').update(html).digest('hex')

// ---- tokens: custom properties inside a selector block ----------------------------------------
// Pull the BODY of the first `<selector> { … }` block (non-greedy to the first close brace; token
// blocks never nest braces) and read every `--name: value;` declaration out of it.
function declsIn(blockBody) {
  const out = []
  const re = /--([A-Za-z0-9-_]+)\s*:\s*([^;]+);/g
  let m
  while ((m = re.exec(blockBody)) !== null) {
    out.push({ role: '--' + m[1], value: m[2].trim() })
  }
  return out
}
function firstBlockBody(selectorRe) {
  const m = selectorRe.exec(html)
  if (!m) return null
  const open = html.indexOf('{', m.index)
  if (open === -1) return null
  const close = html.indexOf('}', open)
  if (close === -1) return null
  return html.slice(open + 1, close)
}

const rootBody = firstBlockBody(/:root\b/g)
if (rootBody === null) die('no `:root` block found — not a recognizable Claude Design mockup')
const tokens = declsIn(rootBody)
if (tokens.length === 0) die('`:root` block has no `--custom: value` declarations')

// accents: every `[data-accent="X"] { … }` variant → its declarations under the accent name
const accents = {}
{
  const re = /\[data-accent\s*=\s*["']([^"']+)["']\s*\]\s*\{/g
  let m
  while ((m = re.exec(html)) !== null) {
    const open = m.index + m[0].length - 1
    const close = html.indexOf('}', open)
    if (close === -1) continue
    accents[m[1]] = declsIn(html.slice(open + 1, close))
  }
}

// ---- surfaces: depth-matched <x-dc> ranges (nested surfaces each get their own slice) ----------
// Tokenize open/close tags in document order, match with a stack so every <x-dc> (including nested)
// gets its exact subtree. A self-closing `<x-dc … />` is a leaf (open+close at once).
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
function attrId(attrs) {
  const m = /\bid\s*=\s*["']([^"']+)["']/.exec(attrs)
  return m ? m[1] : null
}
const ranges = [] // {id, attrs, start, end}
const stack = []
let autoId = 0
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
  }
}
if (stack.length) die('unbalanced <x-dc> tags (' + stack.length + ' unclosed) — cannot slice safely')
if (ranges.length === 0) die('no `<x-dc>` surface blocks found — not a recognizable Claude Design mockup')

// id collisions (duplicate or auto vs real) get a positional suffix so every slice file is distinct.
const seen = {}
for (const r of ranges) {
  if (seen[r.id] != null) { seen[r.id]++; r.id = r.id + '-' + seen[r.id] }
  else seen[r.id] = 0
}
ranges.sort((a, b) => a.start - b.start)

fs.mkdirSync(outDir, { recursive: true })
const surfaces = []
for (const r of ranges) {
  const sliceName = 'slice-' + r.id.replace(/[^A-Za-z0-9-_]/g, '_') + '.html'
  fs.writeFileSync(path.join(outDir, sliceName), html.slice(r.start, r.end), 'utf8')
  surfaces.push({ id: r.id, sliceFile: sliceName, attrs: r.attrs })
}

const manifest = {
  schemaVersion: 1,
  source: { file: path.basename(rawPath), sha256, bytes },
  tokens,
  accents,
  surfaces,
}
fs.writeFileSync(path.join(outDir, 'extract.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8')

process.stdout.write(
  'dc-extract: ' + tokens.length + ' tokens, ' + Object.keys(accents).length + ' accent(s), ' +
  surfaces.length + ' surface(s) → ' + path.join(outDir, 'extract.json') + '\n')
