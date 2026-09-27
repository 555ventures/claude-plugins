'use strict'
// lib/storybook-index.js — reads a Storybook static export's index.json and answers the three
// closure questions genesis-driver.js's kit-landed/journeys-drawn marks need (specs/20260926/05-
// the-kit-and-the-journey-stories.md D2): did the build actually produce a working static export
// (readIndex), does every declared composite state have a story (stateStoriesCheck), does every
// seed journey have a story tagged as a walkable journey (journeyStoriesCheck). importSpecifiers
// and stripComments are the one comment-stripped import/require reader shared by the primitive-ban
// scan and the beats-file-import scan, both in genesis-driver.js.
//
// WHY iframe.html is required, not just index.json: spiked 2026-09-26 on a TanStack Start host —
// `storybook build` exits 0 and prints "completed successfully" while writing index.json but no
// iframe.html at all (Start's planning plugin replaces the client build input). Trusting the exit
// code, or index.json's mere presence, would be a false pass on exactly the host that matters most.
//
// What this deliberately does NOT do: read any file itself beyond staticDir's own index.json/
// iframe.html (the driver resolves staticDir and passes it in) — no path policy lives here; judge
// whether a build command is "right", only whether its output proves what the marks need; resolve
// a relative import specifier against the real filesystem (the primitive ban's own resolution
// logic stays in the driver, which knows --root).
//
// Exit codes: n/a (library, not an entrypoint).

const fs = require('fs')
const path = require('path')

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// D2: `index.json` parsed, `iframe.html` required. A build that exits 0 without writing
// iframe.html at all reports `reason: 'no-iframe'` rather than a false pass; a missing or
// unparseable index.json reports its own distinct reason so the driver's refusal can name the
// right file.
function readIndex(staticDir) {
  const indexPath = path.join(staticDir, 'index.json')
  let raw
  try {
    raw = fs.readFileSync(indexPath, 'utf8')
  } catch (e) {
    return { ok: false, reason: 'no-index' }
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    return { ok: false, reason: 'unparseable' }
  }
  const iframePath = path.join(staticDir, 'iframe.html')
  if (!fs.existsSync(iframePath)) return { ok: false, reason: 'no-iframe' }
  const entries = (parsed && parsed.entries && typeof parsed.entries === 'object')
    ? Object.values(parsed.entries)
    : []
  return { ok: true, entries }
}

// D2: lower-case, non-alphanumerics stripped — "Empty list" and "EmptyList" fold to the same key
// so a story name written with a space still matches a declared state written as one word.
function normalizeName(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '')
}

// An entry belongs to `composite` when either its importPath's basename is
// `<Composite>.stories.<ext>` under `kitDir`, or its title's last `/` segment equals the
// composite — the index spikes on both storybook 10.5.8 and 10.6.0 name composites the second
// way when the file lives elsewhere than `kitDir` names.
function entryBelongsToComposite(entry, composite, kitDir) {
  const ip = typeof entry.importPath === 'string' ? entry.importPath.replace(/^\.\//, '') : ''
  const base = path.posix.basename(ip)
  const dir = path.posix.dirname(ip)
  const nameRe = new RegExp('^' + escapeRegExp(composite) + '\\.stories\\.[^./]+$')
  const pathMatches = dir === kitDir && nameRe.test(base)
  const titleLast = typeof entry.title === 'string' ? entry.title.split('/').pop() : null
  return pathMatches || titleLast === composite
}

// D2: `composites` is `[{ composite, states }]` — the brief's own Composites table, order
// preserved. Returns the first `{ composite, state }` whose story is missing, walked composite by
// composite and state by state so the refusal names the FIRST offender; `null` once every
// declared state has a matching story.
function stateStoriesCheck(entries, composites, kitDir) {
  for (const c of composites) {
    for (const state of c.states) {
      const found = entries.some((e) =>
        entryBelongsToComposite(e, c.composite, kitDir) && normalizeName(e.name) === normalizeName(state))
      if (!found) return { composite: c.composite, state }
    }
  }
  return null
}

// D2: per journey, the entry whose importPath ends `/<journey>.journey.stories.<ext>` under
// `journeysDir` and whose tags include both `journey` and `play-fn` — the two tags together are
// the proof the story exists AND walks (`play-fn` is Storybook's own auto-added tag for a story
// carrying a `play` function). Returns `{ ok: true, stories: { <journey>: <story id> } }` once
// every journey has one, or `{ ok: false, journey }` naming the first missing journey.
function journeyStoriesCheck(entries, journeys, journeysDir) {
  const stories = {}
  for (const name of journeys) {
    const nameRe = new RegExp('^' + escapeRegExp(name) + '\\.journey\\.stories\\.[^./]+$')
    const found = entries.find((e) => {
      const ip = typeof e.importPath === 'string' ? e.importPath.replace(/^\.\//, '') : ''
      const dir = path.posix.dirname(ip)
      const base = path.posix.basename(ip)
      const tags = Array.isArray(e.tags) ? e.tags : []
      return dir === journeysDir && nameRe.test(base) && tags.includes('journey') && tags.includes('play-fn')
    })
    if (!found) return { ok: false, journey: name }
    stories[name] = found.id
  }
  return { ok: true, stories }
}

// Strips `//` line comments and `/* */` block comments before any import/require scan — the
// pipeline rules' own recorded gotcha (a reader that scans commented-out code as if it were live
// is a false positive waiting to happen; specs/20260912/09 D3/D5). Naive by design: it does not
// understand string literals, so a specifier containing a literal `//` (a URL) would be cut short
// — genesis's own specifiers are all relative paths or `@/…` aliases, never URLs.
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

// D2: every specifier from `import … from <specifier>`, a bare `import <specifier>`, a
// require(<specifier>) call, and a dynamic import(<specifier>) call, after stripComments,
// admitting both quote forms, in source order. One combined regex (rather than four separate
// passes merged and re-sorted) so source order falls out of a single left-to-right `exec` walk
// for free. The bare-import alternative is tried BEFORE the from-clause alternative: the
// from-clause alternative's `[\s\S]*?` span is lazy but unbounded, so if it were tried first at a
// bare import's own `import` keyword it would keep expanding right past that whole statement
// looking for the next `from` anywhere later in the file — silently swallowing a bare import that
// precedes an `import … from` statement (repro: `import '@/x'\nimport y from './a.json'`, which
// would report only `./a.json`). Trying the bare form first means it wins outright whenever
// `import` is directly followed by a quote, so the from-clause alternative only ever fires when no
// bare form matches at that position. What this still cannot see: a `from`-clause statement whose
// own span (no bare import in between) has to cross into a LATER statement because the word
// `from` never appears before then — not expected in real import statements, but a contrived
// multi-import block engineered to lack an early `from` could still mis-scan.
const IMPORT_SPECIFIER_RE =
  /import\s*\(\s*(['"])([^'"]+)\1\s*\)|require\s*\(\s*(['"])([^'"]+)\3\s*\)|import\s+(['"])([^'"]+)\5|import\s+[\s\S]*?\bfrom\s+(['"])([^'"]+)\7/g

function importSpecifiers(text) {
  const stripped = stripComments(text)
  const out = []
  let m
  const re = new RegExp(IMPORT_SPECIFIER_RE.source, 'g')
  while ((m = re.exec(stripped))) {
    const spec = m[2] || m[4] || m[6] || m[8]
    if (spec) out.push(spec)
  }
  return out
}

module.exports = { readIndex, normalizeName, stateStoriesCheck, journeyStoriesCheck, importSpecifiers, stripComments }
