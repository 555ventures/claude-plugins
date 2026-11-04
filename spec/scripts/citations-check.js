#!/usr/bin/env node
'use strict'
// citations-check.js [--root <dir>] — the § citation checker.
// Owner: specs/20260810/09-stale-reference-sweep.md.
//
// Verifies that every `§ Name` citation names a `## ` heading in the file it points at —
// `shared-for` filtering silently drops a mismatched section. Scans spec/commands, spec/doctrine,
// spec/agents and git/commands and reports every miss.
//
// Grammar: a citation is `§`-anchored with up to TWO words of lookback resolving the target file.
// Hard-wraps are handled one line each way: lookback falls back to the PRIOR line only when this
// line has nothing before the `§`; the heading extends onto the NEXT line only when this line ends
// before a terminator. Each `§` is found exactly once.
//
// Deliberately does NOT check: file-path references without `§` (doctor check 7 owns those),
// or claims/line-count content (unchecked — the claims registry is retired) — this is `§` citations only.
//
// Usage: citations-check.js [--root <dir>]
// Exit codes: 0 = scan completed (advisory — misses are reported, not a failure) · 2 = usage error

const fs = require('fs')
const path = require('path')

function usage() {
  console.error('usage: citations-check.js [--root <dir>]')
  process.exit(2)
}

let root = '.'
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--root') { root = argv[++i]; if (root === undefined) usage() }
  else usage()
}

const SCANNED_DIRS = ['spec/commands', 'spec/doctrine', 'spec/doctrine/stages', 'spec/agents', 'git/commands']
// core.md and design.md both carry doctrine that a "shared" citation may target a
// heading in either, so shared idioms resolve to BOTH files and the heading check unions.
const SHARED_PATHS = [path.join(root, 'spec/doctrine/core.md'), path.join(root, 'spec/doctrine/design.md')]
const GENESIS_PATH = path.join(root, 'spec/doctrine/genesis.md')
// Every doctrine file, for the weak fallback below: a prose lookback names no file, and the
// section it cites is nearly always in the doctrine family the citing command already reads.
// Derived from the directory rather than listed, so a new doctrine file joins without an edit.
const DOCTRINE_PATHS = (() => {
  const dir = path.join(root, 'spec/doctrine')
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort().map(f => path.join(dir, f))
  } catch { return [] }
})()
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
// to it — deliberately narrower than the full repo index.
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
  // A lookback token may be a repo-relative PATH: resolve it against `root` first, then fall back to the
  // basename index.
  if (nameLower.includes('/')) {
    const asPath = path.join(root, nameLower)
    if (fs.existsSync(asPath)) return asPath
    nameLower = path.basename(nameLower)
  }
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

// Resolve the target file from the up-to-two-word lookback: two-word idioms first, then each word
// independently, nearest to `§` first. A truly bare § resolves to the citing file itself; any other
// lookback that names nothing recognizable is a SKIP, never a match against the citing file.
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

  // Bare-basename match checks only the word adjacent to `§` — a far bare word is ordinary prose.
  if (nearWord) {
    const hit = scannedBasenames.get(nearWord.toLowerCase())
    if (hit) return { kind: 'match', target: hit }
  }

  if (!nearWord && !farWord) return { kind: 'match', target: citingFile } // bare § → the citing file itself

  // Prose lookback naming no file: check the heading against the citing file plus the doctrine family,
  // but the resolution is WEAK — a heading matching nothing there stays a SKIP, never a MISS.
  return { kind: 'weak', target: [citingFile, ...DOCTRINE_PATHS] }
}

// ---- scan -----------------------------------------------------------------------------------

let total = 0, checked = 0, skip = 0, miss = 0
const missLines = []

for (const file of scannedFiles) {
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split('\n')
  const citingDir = path.dirname(file)
  for (let L = 0; L < lines.length; L++) {
    const line = lines[L]

    for (let idx = line.indexOf('§'); idx !== -1; idx = line.indexOf('§', idx + 1)) {
      // Lookback: this line's text before `§`; fall back one line only when the CLEANED tokens are empty
      // (markdown decoration like `**` cleans to nothing).
      let lookbackSrc = line.slice(0, idx).trimEnd()
      let cleanedWords = lookbackSrc.split(/\s+/).filter(Boolean).map(cleanTok).filter(Boolean)
      if (cleanedWords.length === 0 && L > 0) {
        cleanedWords = lines[L - 1].trimEnd().split(/\s+/).filter(Boolean).map(cleanTok).filter(Boolean)
      }
      const nearWord = cleanedWords.length ? cleanedWords[cleanedWords.length - 1] : null
      const farWord = cleanedWords.length > 1 ? cleanedWords[cleanedWords.length - 2] : null

      // Heading: this line's text after `§`, extended onto the next line only when no terminator was found.
      // `(` and `**` terminate; `:` deliberately does not (headings self-namespace as "Genesis: ..."), and an
      // over-run past a real heading is caught by the `windowText` prefix check below.
      let afterSrc = line.slice(idx + 1)
      const TERM = /[.,;)(]|—|\*\*/
      let termIdx = afterSrc.replace(/^\s+/, '').search(TERM)
      let stripped = afterSrc.replace(/^\s+/, '')
      if (termIdx === -1 && L + 1 < lines.length) {
        stripped = stripped + ' ' + lines[L + 1]
        termIdx = stripped.search(TERM)
      }
      // Collapse whitespace (a wrapped heading picks up the next line's leading indent) so a
      // wrapped citation resolves identically to its unwrapped spelling.
      const heading = (termIdx === -1 ? stripped : stripped.slice(0, termIdx)).trim().replace(/\s+/g, ' ')

      total++
      const resolution = resolveTarget(farWord, nearWord, file, citingDir)
      const lineNo = L + 1

      if (resolution.kind === 'skip') {
        skip++
        continue
      }

      // A lowercase captured name ("§ mock supremacy") quotes a bold run-in lead-in, not a Title-Case
      // heading: SKIP, not MISS.
      if (heading.length === 0 || !/^[A-Z]/.test(heading)) {
        skip++
        continue
      }

      checked++
      const targets = Array.isArray(resolution.target) ? resolution.target : [resolution.target]
      // A `§ Genesis: ...` citation always names genesis.md, whatever the nearest `.md` token was.
      if (/^Genesis\b/.test(heading) && !targets.includes(GENESIS_PATH)) targets.push(GENESIS_PATH)
      const heads = targets.flatMap(headingsOf)
      // Untruncated text after `§` (across the wrap window): a heading that is a prefix of it still matches
      // ("§ Risk Tiers makes it universal"), compared against the FULL heading too since `:` never terminates.
      const windowText = stripped.trim().replace(/\s+/g, ' ')
      // genesis.md's "Genesis: " prefix is optional on the heading side, never required on the citation side.
      const matched = heads.some(h => {
        const core = h.replace(/^Genesis:\s*/, '').trim()
        const coreNoParen = core.replace(/\s*\([^)]*\)\s*$/, '').trim()
        const hNoParen = h.replace(/\s*\([^)]*\)\s*$/, '').trim()
        return h.startsWith(heading) || core.startsWith(heading) ||
          (coreNoParen.length > 0 && windowText.startsWith(coreNoParen)) ||
          (hNoParen.length > 0 && windowText.startsWith(hNoParen))
      })
      if (!matched) {
        // A weak resolution never accuses: the lookback named no file, so a non-match means
        // the checker could not find the target, not that the citation is broken.
        if (resolution.kind === 'weak') {
          checked--
          skip++
          continue
        }
        miss++
        missLines.push(`MISS ${file}:${lineNo} § ${heading} → ${targets.join(' + ')}`)
      }
    }
  }
}

for (const l of missLines) console.log(l)
console.log(`TOTAL=${total} CHECKED=${checked} SKIP=${skip} MISS=${miss}`)
process.exit(0)
