#!/usr/bin/env node
'use strict'
// claims-lint.js [--root <dir>] [--check | --json | --update-baseline]
//
// specs/20260807/04-claims-registry.md: the sole derivation of the doctrine claims inventory.
// Every blocking-consequence claim (D2 bar: **hard**, "hard finding", uppercase-only STOP/
// MUST/NEVER/ALWAYS) in spec/commands/*.md + spec/doctrine/*.md + spec/agents/*.md (D2a corpus)
// must carry an inline `<!-- enforcedBy: <path>[, <path>...] -->` or `<!-- unenforced: <reason
// >=20 chars> -->` marker (grammar's binding home: shared.md § Doctrine Authoring). This script
// is that check: orphan claims (bar-matching, no marker) and a dual exact-match ratchet against
// spec/doctrine/claims-baseline.json (line count + orphan count, per file) — growth OR shrinkage
// in either direction fails until `--update-baseline` re-stamps it, so every change to the ratio
// is a diffable baseline hunk in the same commit (D4).
//
// specs/20260813/03-gate-script-mechanics.md D1: default-root resolution (no --root) anchors to
// the script's OWN location, never process.cwd() — doctor check 18's only call pattern
// (`node "$(spec-paths claims-lint)" --json`, no --root) was silently scanning nothing from any
// host CWD before this. Three modes:
//   1. `--root <dir>` — explicit, byte-identical to always: corpus at <dir>/spec/{commands,
//      doctrine,agents}, baseline at <dir>/spec/doctrine/claims-baseline.json.
//   2. no --root, dev/marketplace layout — upward walk from __dirname (at most 3 levels) to the
//      first directory D containing spec/doctrine/claims-baseline.json; behaves byte-identical
//      to `--root D`, including enforcedBy: pointer resolution against D.
//   3. no --root, installed-plugin layout (upward walk finds nothing) — PLUGIN_HOME mode:
//      PLUGIN_HOME = the script's own plugin root (one level up from its own directory); corpus
//      at PLUGIN_HOME/{commands,doctrine,agents}, baseline at
//      PLUGIN_HOME/doctrine/claims-baseline.json, report keys stay canonical
//      'spec/<subdir>/<file>'. enforcedBy: targets resolve against PLUGIN_HOME with a leading
//      'spec/' stripped; a target whose first path segment has no directory under PLUGIN_HOME
//      (an unshipped tree, e.g. 'tests/…') is undecidable in this layout — it is counted in the
//      `--json` output's `skippedPointers` list and reported informationally, NEVER as a
//      stale-pointer finding (undecidable is not the same as stale).
//
// What this deliberately does NOT do: edit any doctrine file, decide whether a marker's target
// is the RIGHT carrier (only that the path exists), or special-case bar phrases used as data
// (e.g. a table cell describing a mechanism) — those enter the baseline like any other orphan
// and convert at touch-time (D6). Fenced code blocks (indentation-tolerant) and HTML-comment
// lines are excluded from claim-bar scanning; a genuine claim hiding inside a fence is a known,
// accepted blind spot (doctor's semantic spot-check is the route for those, never a scanner
// heuristic).
//
// Exit codes: 0 = --check clean, or --json/--update-baseline (which never fail the process by
// themselves — they are reporting/writing modes); 1 = --check found orphan-claim, stale-pointer,
// sanction-reason, or baseline-mismatch findings; 2 = usage error, or the corpus/baseline could
// not be read (baseline missing: run `node "$(spec-paths claims-lint)" --update-baseline`).

const fs = require('fs')
const path = require('path')

const REMEDY = 'node "$(spec-paths claims-lint)" --update-baseline'
const BASELINE_DISPLAY = path.join('spec', 'doctrine', 'claims-baseline.json')
const UPWARD_WALK_MAX_LEVELS = 3

// D2: the claim bar is a closed pattern list, data here — never a prompt clause. Last four
// match uppercase only; lowercase normative prose is deliberately below the bar.
const BAR_PATTERNS = [/\*\*hard\*\*/, /hard finding/i, /\bSTOP\b/, /\bMUST\b/, /\bNEVER\b/, /\bALWAYS\b/]

const FENCE_RE = /^\s*```/
const FULL_MARKER_RE = /^\s*<!--\s*(enforcedBy|unenforced):\s*(.*?)\s*-->\s*$/
const INLINE_MARKER_RE = /<!--\s*(enforcedBy|unenforced):\s*(.*?)\s*-->/
const COMMENT_STRIP_RE = /<!--[\s\S]*?-->/g

function usage() {
  console.error('usage: claims-lint.js [--root <dir>] [--check | --json | --update-baseline]')
}

let root = null, mode = null
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--root') root = argv[++i]
  else if (a === '--check' || a === '--json' || a === '--update-baseline') {
    if (mode) { usage(); process.exit(2) }
    mode = a
  } else { usage(); process.exit(2) }
}
if (!mode) { usage(); process.exit(2) }

// D1 mode 2: upward walk from __dirname (at most 3 levels) to the first directory containing
// spec/doctrine/claims-baseline.json — the dev/marketplace layout, where this script lives at
// <repo>/spec/scripts/claims-lint.js.
function findUpwardRoot(startDir, maxLevels) {
  let dir = startDir
  for (let level = 0; level <= maxLevels; level++) {
    if (fs.existsSync(path.join(dir, 'spec', 'doctrine', 'claims-baseline.json'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

let pluginHomeMode = false
if (!root) {
  const discovered = findUpwardRoot(__dirname, UPWARD_WALK_MAX_LEVELS)
  if (discovered) {
    root = discovered
  } else {
    // D1 mode 3: installed-plugin layout — this script's own plugin root, one level up from its
    // own directory (e.g. <plugin>/scripts/claims-lint.js -> PLUGIN_HOME = <plugin>).
    root = path.resolve(__dirname, '..')
    pluginHomeMode = true
  }
}

function countLines(content) {
  return content.endsWith('\n') ? content.split('\n').length - 1 : content.split('\n').length
}

// Scan one file's content for claims + markers. Returns { lines, claims: [{line}],
// orphans: [{line}], findings: [{line, kind, detail}], skipped: [{line, target}] } — findings
// are the per-line defects (stale-pointer, sanction-reason); skipped are enforcedBy: targets
// resolvePath could not decide (PLUGIN_HOME mode's unshipped trees) — informational, never a
// finding; orphans/claims feed the file-level ratchet.
function scanFile(content, resolvePath) {
  const lines = content.split('\n')
  const findings = []
  const claims = []
  const orphans = []
  const skipped = []

  // Pass 1: classify every line as fence-interior, marker-only, or content (with an optional
  // inline trailing marker). Track fence state with indentation-tolerant delimiter detection.
  let fenced = false
  const classified = lines.map((raw) => {
    if (FENCE_RE.test(raw)) { const wasFenced = fenced; fenced = !fenced; return { fenceDelim: true, insideFence: wasFenced || fenced } }
    if (fenced) return { insideFence: true }
    const trimmed = raw.trim()
    if (trimmed === '') return { blank: true }
    const full = trimmed.match(FULL_MARKER_RE)
    if (full) return { markerOnly: true, type: full[1], value: full[2] }
    const inline = raw.match(INLINE_MARKER_RE)
    const scanText = raw.replace(COMMENT_STRIP_RE, '')
    const isClaim = BAR_PATTERNS.some((re) => re.test(scanText))
    return { content: true, isClaim, inlineMarker: inline ? { type: inline[1], value: inline[2] } : null }
  })

  // Pass 2: attach marker-only lines to the nearest preceding non-blank, non-fence-interior line.
  const attach = new Array(lines.length).fill(null)
  let lastContentIdx = -1
  for (let i = 0; i < classified.length; i++) {
    const c = classified[i]
    if (c.markerOnly) {
      if (lastContentIdx !== -1) attach[lastContentIdx] = { type: c.type, value: c.value, markerLine: i + 1 }
      continue
    }
    if (c.content) lastContentIdx = i
  }

  for (let i = 0; i < classified.length; i++) {
    const c = classified[i]
    if (!c.content || !c.isClaim) continue
    const lineNo = i + 1
    claims.push({ line: lineNo })
    const marker = c.inlineMarker || attach[i]
    if (!marker) { orphans.push({ line: lineNo }); continue }
    const markerLine = marker.markerLine || lineNo
    if (marker.type === 'enforcedBy') {
      const targets = marker.value.split(',').map((s) => s.trim()).filter(Boolean)
      const missing = []
      for (const p of targets) {
        const status = resolvePath(p)
        if (status === 'missing') missing.push(p)
        else if (status === 'skipped') skipped.push({ line: markerLine, target: p })
      }
      if (missing.length) findings.push({ line: markerLine, kind: 'stale-pointer', detail: `enforcedBy path does not exist: ${missing.join(', ')} — fix the marker or remove the dead pointer` })
    } else if (marker.type === 'unenforced') {
      if (marker.value.length < 20) findings.push({ line: markerLine, kind: 'sanction-reason', detail: `unenforced reason is ${marker.value.length} chars, needs >= 20 — lengthen the reason to justify the sanction` })
    }
  }

  return { lines: countLines(content), claims, orphans, findings, skipped }
}

// D1: corpus directory entries as [fsDir, keyDir] pairs — fsDir is relative to `root` on disk,
// keyDir is the canonical 'spec/<subdir>' report-key prefix. Identical in every mode except
// PLUGIN_HOME, where the plugin's shipped tree already IS the 'spec' subtree, so fsDir loses the
// 'spec/' prefix while report keys stay canonical.
const CORPUS_ENTRIES = pluginHomeMode
  ? [['commands', 'spec/commands'], ['doctrine', 'spec/doctrine'], ['agents', 'spec/agents']]
  : [['spec/commands', 'spec/commands'], ['spec/doctrine', 'spec/doctrine'], ['spec/agents', 'spec/agents']]

function loadCorpus(rootDir, entries) {
  const files = []
  for (const [fsDir, keyDir] of entries) {
    const abs = path.join(rootDir, fsDir)
    if (!fs.existsSync(abs)) continue
    for (const name of fs.readdirSync(abs).sort()) {
      if (!name.endsWith('.md')) continue
      files.push({ rel: path.posix.join(fsDir, name), key: path.posix.join(keyDir, name) })
    }
  }
  return files
}

// D1: resolvePath returns a tri-state status — 'found' | 'missing' | 'skipped'. Non-PLUGIN_HOME
// modes never return 'skipped' (the full repo is present, so every target is decidable).
function makeResolvePath(rootDir, isPluginHomeMode) {
  if (!isPluginHomeMode) {
    return (p) => (fs.existsSync(path.join(rootDir, p)) ? 'found' : 'missing')
  }
  return (p) => {
    const stripped = p.startsWith('spec/') ? p.slice('spec/'.length) : p
    const firstSeg = stripped.split('/')[0]
    if (!fs.existsSync(path.join(rootDir, firstSeg))) return 'skipped'
    return fs.existsSync(path.join(rootDir, stripped)) ? 'found' : 'missing'
  }
}

if (!fs.existsSync(root)) {
  console.error(`claims-lint: --root ${root} does not exist`)
  process.exit(2)
}

const baselinePath = pluginHomeMode
  ? path.join(root, 'doctrine', 'claims-baseline.json')
  : path.join(root, BASELINE_DISPLAY)
let baseline = null
if (mode !== '--update-baseline') {
  if (!fs.existsSync(baselinePath)) {
    console.error(`claims-lint: no baseline at ${BASELINE_DISPLAY} — run ${REMEDY}`)
    process.exit(2)
  }
  try {
    baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
  } catch (e) {
    console.error(`claims-lint: ${BASELINE_DISPLAY} is not valid JSON — run ${REMEDY} (${e.message})`)
    process.exit(2)
  }
}

const corpusFiles = loadCorpus(root, CORPUS_ENTRIES)
const resolvePath = makeResolvePath(root, pluginHomeMode)

const fileResults = {}
const findings = []
const skippedPointers = []
let totalLines = 0
const deltas = []

for (const entry of corpusFiles) {
  const rel = entry.key
  const content = fs.readFileSync(path.join(root, entry.rel), 'utf8')
  const result = scanFile(content, resolvePath)
  totalLines += result.lines
  const base = (baseline && baseline.files && baseline.files[rel]) || { lines: 0, orphans: 0 }

  fileResults[rel] = { lines: result.lines, claims: result.claims.length, orphans: result.orphans.length, sanctions: result.claims.length - result.orphans.length - result.findings.filter((f) => f.kind === 'stale-pointer').length }

  for (const f of result.findings) findings.push({ file: rel, line: f.line, kind: f.kind, detail: f.detail })
  for (const s of result.skipped) skippedPointers.push({ file: rel, line: s.line, target: s.target })

  const linesMismatch = result.lines !== base.lines
  const orphansMismatch = result.orphans.length !== base.orphans
  if (linesMismatch || orphansMismatch) {
    deltas.push({ file: rel, lines: { actual: result.lines, baseline: base.lines }, orphans: { actual: result.orphans.length, baseline: base.orphans } })
    const direction = (linesMismatch && result.lines > base.lines) || (orphansMismatch && result.orphans.length > base.orphans) ? 'growth' : 'shrinkage'
    findings.push({
      file: rel,
      line: null,
      kind: 'baseline-mismatch',
      detail: `${direction} vs claims-baseline.json — actual {lines: ${result.lines}, orphans: ${result.orphans.length}} vs baselined {lines: ${base.lines}, orphans: ${base.orphans}}; run ${REMEDY}`,
    })
  }
  if (result.orphans.length > base.orphans) {
    const surplus = result.orphans.length - base.orphans
    for (const o of result.orphans) {
      findings.push({ file: rel, line: o.line, kind: 'orphan-claim', detail: `unmarked blocking claim (file has ${result.orphans.length} unmarked claims; baseline accepts ${base.orphans} — surplus ${surplus}); run ${REMEDY} once every new claim above the baselined count carries a marker` })
    }
  }
}

findings.sort((a, b) => a.file.localeCompare(b.file) || (a.line || 0) - (b.line || 0))

if (mode === '--update-baseline') {
  const out = { files: {}, totalLines }
  for (const entry of corpusFiles) out.files[entry.key] = { lines: fileResults[entry.key].lines, orphans: fileResults[entry.key].orphans }
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true })
  fs.writeFileSync(baselinePath, JSON.stringify(out, null, 2) + '\n')
  console.log(`claims-lint: wrote ${BASELINE_DISPLAY} — ${corpusFiles.length} files, ${totalLines} total lines`)
  process.exit(0)
}

if (mode === '--json') {
  const report = { files: fileResults, totalLines, baseline: { stale: deltas.length > 0, deltas }, findings }
  // D1: skippedPointers is PLUGIN_HOME-mode-only — dev/marketplace and --root runs always
  // resolve every enforcedBy: target decidably, so the key stays absent (byte-identical output
  // shape) rather than reporting an always-empty list.
  if (pluginHomeMode) report.skippedPointers = skippedPointers
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

// --check: human render to stderr, exit 1 on any finding.
if (findings.length === 0) {
  console.log(`claims-lint: clean — ${corpusFiles.length} files, ${totalLines} total lines, baseline matches`)
  process.exit(0)
}
for (const f of findings) {
  console.error(`claims-lint: ${f.file}${f.line ? ':' + f.line : ''} [${f.kind}] ${f.detail}`)
}
console.error(`claims-lint: ${findings.length} finding(s) — see above`)
process.exit(1)
