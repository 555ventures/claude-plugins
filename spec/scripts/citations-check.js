#!/usr/bin/env node
'use strict'
// citations-check.js [--root <dir>] [--verbose] — the § citation checker.
//
// Six broken `§ Heading` citations accumulated silently in doctrine across one audit cycle
// (specs/20260810/09-stale-reference-sweep.md D9) because
// nothing verified that a `§ Name` citation actually names a `## ` heading in the file it
// points at — `shared-for` filtering just silently drops a mismatched section, so a broken
// citation reads as valid doctrine forever. This is the enumerator: it scans every citation
// under spec/commands, spec/doctrine, spec/agents, git/commands and reports every miss.
//
// Grammar (measured against the live corpus, not assumed): a citation is `§`-anchored with
// up to TWO words of lookback resolving the target file; hard-wrapped citations are real in
// this corpus in BOTH directions — a lookback word can sit on the line before the `§`
// ("...(shared\n§ Design Atlas..."), or the heading name can run onto the line after it
// ("...(shared §\nDesign Canon;..."). Each `§` is scanned on its own physical line: lookback
// falls back to the PRIOR line only when this line has nothing before the `§`, and the
// heading capture extends onto the NEXT line only when this line ends before hitting a
// terminator — never both directions for the same citation (residual assumption: no citation
// spans three physical lines). One `§` is therefore found exactly once; no cross-line dedup
// is needed.
//
// Deliberately does NOT check: file-path references without `§` (doctor check 7 owns those),
// or claims/line-count content (unchecked — the claims registry is retired) — this is `§` citations only.
//
// Usage: citations-check.js [--root <dir>] [--verbose]
// Exit codes: 0 = scan completed (advisory — misses are reported, not a failure) · 2 = usage error

const fs = require('fs')
const path = require('path')

function usage() {
  console.error('usage: citations-check.js [--root <dir>] [--verbose]')
  process.exit(2)
}

let root = '.'
let verbose = false
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--root') { root = argv[++i]; if (root === undefined) usage() }
  else if (argv[i] === '--verbose') verbose = true
  else usage()
}

const SCANNED_DIRS = ['spec/commands', 'spec/doctrine', 'spec/agents', 'git/commands']
// core.md and design.md both carry doctrine that a "shared" citation may target a
// heading in either, so shared idioms resolve to BOTH files and the heading check unions.
const SHARED_PATHS = [path.join(root, 'spec/doctrine/core.md'), path.join(root, 'spec/doctrine/design.md')]
const GENESIS_PATH = path.join(root, 'spec/doctrine/genesis.md')
const SKIP_HOST_DIRS = new Set(['node_modules', '.git'])

// ---- gather the scanned corpus -----------------------------------------------------------

function listMd(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.md'))
    .map(e => path.join(dir, e.name))
    .sort()
}

const scannedFiles = SCANNED_DIRS.flatMap(d => listMd(path.join(root, d)))

// scanned-basename index: a bare word (no `.md`) matching a SCANNED file's basename resolves
// to it (D9's "a scanned basename" clause) — deliberately narrower than the full repo index.
const scannedBasenames = new Map()
for (const f of scannedFiles) {
  scannedBasenames.set(path.basename(f, '.md').toLowerCase(), f)
}

// full-repo `.md` index for explicit `<name>.md` tokens (e.g. `adr.md`) that live outside the
// scanned corpus (spec/templates/adr.md) — resolution targets a real file, not just a scanned one.
const repoIndex = new Map() // lowercase basename -> [paths]
function walkAll(dir) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.claude') continue
    if (SKIP_HOST_DIRS.has(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walkAll(p)
    else if (e.name.endsWith('.md')) {
      const key = e.name.toLowerCase()
      if (!repoIndex.has(key)) repoIndex.set(key, [])
      repoIndex.get(key).push(p)
    }
  }
}
walkAll(root)

function resolveMdFile(nameLower, citingDir) {
  const candidates = repoIndex.get(nameLower)
  if (!candidates || candidates.length === 0) return null
  const sameDir = candidates.find(c => path.dirname(c) === citingDir)
  if (sameDir) return sameDir
  return [...candidates].sort()[0]
}

// ---- heading extraction (cached) ---------------------------------------------------------

const headingCache = new Map()
function headingsOf(file) {
  if (headingCache.has(file)) return headingCache.get(file)
  let text = ''
  try { text = fs.readFileSync(file, 'utf8') } catch { /* unresolved target, empty headings */ }
  const heads = text.split('\n')
    .filter(l => l.startsWith('## '))
    .map(l => l.slice(3).trim())
  headingCache.set(file, heads)
  return heads
}

// ---- token cleanup -------------------------------------------------------------------------

// Strip surrounding markdown/punctuation noise (backticks, parens, quotes, sentence
// punctuation) but keep internal characters — `.md` extensions and `spec:design`-style tokens
// must survive.
function cleanTok(t) {
  return t.replace(/^[^A-Za-z0-9]+/, '').replace(/[^A-Za-z0-9]+$/, '')
}

// Resolve the file a citation targets from its up-to-two-word lookback. Order: the two-word
// idioms first (they change meaning as a pair), then each candidate word independently —
// nearest to `§` first, then the farther one, so a lookback like "adr.md template §" still
// resolves via its FAR word even though the NEAR word ("template") matches nothing.
//
// A truly bare § (no lookback word at all) resolves to the citing file itself. Any OTHER
// lookback — words present but naming nothing this checker recognizes (prose like "the
// contract file's §" or "Where §") — is a SKIP, never a match against the citing file: falling
// through to "match the citing file" for arbitrary prose was the AC-20260810-09-2 defect
// (every unresolvable lookback forced a false MISS against whatever file happened to be
// citing, because most files carry no heading answering random prose).
function resolveTarget(farWord, nearWord, citingFile, citingDir) {
  const two = farWord && nearWord ? `${farWord.toLowerCase()} ${nearWord.toLowerCase()}` : null
  if (two === 'shared invariants') return { kind: 'match', target: SHARED_PATHS }
  if (two === 'pipeline rules') return { kind: 'skip', reason: 'pipeline rules — host-generated file, skipped by design' }

  let sawFilenameToken = false
  for (const w of [nearWord, farWord]) {
    if (!w) continue
    const wl = w.toLowerCase()
    if (wl === 'shared' || wl === 'shared.md' || wl === 'core.md' || wl === 'design.md') return { kind: 'match', target: SHARED_PATHS }
    if (wl === 'genesis.md') return { kind: 'match', target: GENESIS_PATH }
    if (wl.endsWith('.md')) {
      sawFilenameToken = true
      const found = resolveMdFile(wl, citingDir)
      if (found) return { kind: 'match', target: found }
    }
  }
  if (sawFilenameToken) return { kind: 'skip', reason: 'named .md file not found on disk' }

  // Bare-basename match checks only the word immediately adjacent to `§` — unlike the
  // explicit-file loops above, a bare word (no `.md`) is indistinguishable from ordinary
  // prose, and widening this to the far word too turns any English word that happens to
  // share a command's name (e.g. "the design direction") into a false resolution.
  if (nearWord) {
    const hit = scannedBasenames.get(nearWord.toLowerCase())
    if (hit) return { kind: 'match', target: hit }
  }

  if (!nearWord && !farWord) return { kind: 'match', target: citingFile } // bare § → the citing file itself
  return { kind: 'skip', reason: 'unresolvable file reference' }
}

// ---- scan -----------------------------------------------------------------------------------

let total = 0, checked = 0, skip = 0, miss = 0
const missLines = []
const skipLines = []

for (const file of scannedFiles) {
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split('\n')
  const citingDir = path.dirname(file)
  for (let L = 0; L < lines.length; L++) {
    const line = lines[L]

    for (let idx = line.indexOf('§'); idx !== -1; idx = line.indexOf('§', idx + 1)) {
      // Lookback: this line's own text before `§`; fall back one line only when this line
      // has nothing USABLE before the `§` — markdown decoration alone (`**`, `(`) cleans to
      // nothing, so the emptiness check runs on the CLEANED tokens, not the raw substring,
      // or a bold-wrapped citation ("...whose\n**§ Review Checks**...") would never fall back.
      let lookbackSrc = line.slice(0, idx).trimEnd()
      let cleanedWords = lookbackSrc.split(/\s+/).filter(Boolean).map(cleanTok).filter(Boolean)
      if (cleanedWords.length === 0 && L > 0) {
        cleanedWords = lines[L - 1].trimEnd().split(/\s+/).filter(Boolean).map(cleanTok).filter(Boolean)
      }
      const nearWord = cleanedWords.length ? cleanedWords[cleanedWords.length - 1] : null
      const farWord = cleanedWords.length > 1 ? cleanedWords[cleanedWords.length - 2] : null

      // Heading: this line's text after `§`; extend onto the next line only when no
      // terminator was found before this line ran out. `(` and `**` terminate too — a
      // citation's own trailing annotation ("§ Design Canon (rule checklist)") or bold-close
      // ("§ Review Checks**") is not part of the heading name being cited.
      let afterSrc = line.slice(idx + 1)
      const TERM = /[.,;:)(]|—|\*\*/
      let termIdx = afterSrc.replace(/^\s+/, '').search(TERM)
      let stripped = afterSrc.replace(/^\s+/, '')
      if (termIdx === -1 && L + 1 < lines.length) {
        stripped = stripped + ' ' + lines[L + 1]
        termIdx = stripped.search(TERM)
      }
      // Collapse whitespace (a wrapped heading picks up the next line's leading indent) so a
      // wrapped citation resolves identically to its unwrapped spelling (AC-20260810-09-2).
      const heading = (termIdx === -1 ? stripped : stripped.slice(0, termIdx)).trim().replace(/\s+/g, ' ')

      total++
      const resolution = resolveTarget(farWord, nearWord, file, citingDir)
      const lineNo = L + 1

      if (resolution.kind === 'skip') {
        skip++
        skipLines.push(`SKIP ${file}:${lineNo} § ${heading} — ${resolution.reason}`)
        continue
      }

      // Every real `## ` heading in this corpus is Title Case; a citation whose captured
      // name starts lowercase ("§ mock supremacy") is quoting a bold run-in lead-in, not a
      // heading — D7's own rationale calls this class out as needing a non-`§` reword. Until
      // that reword lands it is a malformed citation, never a checkable one: SKIP, not MISS.
      if (heading.length === 0 || !/^[A-Z]/.test(heading)) {
        skip++
        skipLines.push(`SKIP ${file}:${lineNo} § ${heading || '(empty)'} — citation name is not Title-Case, not a "## " heading reference`)
        continue
      }

      checked++
      const targets = Array.isArray(resolution.target) ? resolution.target : [resolution.target]
      const heads = targets.flatMap(headingsOf)
      // Untruncated text following `§` (joined across the wrap window, same as `heading`'s
      // source) — checks the OTHER direction: a heading with no parenthetical whose
      // name the citation's own sentence over-runs ("§ Risk Tiers makes it universal") still
      // matches because the real heading is a prefix of the full trailing text, even though
      // `heading`'s terminator-bounded capture over-ran the actual name.
      const windowText = stripped.trim().replace(/\s+/g, ' ')
      // genesis.md self-namespaces every heading with a "Genesis: " lead (there is no
      // spec/commands/genesis.md to disambiguate against) — the live corpus cites some of
      // those headings with the prefix and some without, so the prefix is optional on the
      // heading side of the comparison, never required on the citation side.
      const matched = heads.some(h => {
        const core = h.replace(/^Genesis:\s*/, '').trim()
        const coreNoParen = core.replace(/\s*\([^)]*\)\s*$/, '').trim()
        return h.startsWith(heading) || core.startsWith(heading) ||
          (coreNoParen.length > 0 && windowText.startsWith(coreNoParen))
      })
      if (!matched) {
        miss++
        missLines.push(`MISS ${file}:${lineNo} § ${heading} → ${targets.join(' + ')}`)
      }
    }
  }
}

for (const l of missLines) console.log(l)
if (verbose) for (const l of skipLines) console.log(l)
console.log(`TOTAL=${total} CHECKED=${checked} SKIP=${skip} MISS=${miss}`)
process.exit(0)
