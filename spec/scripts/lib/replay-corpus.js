'use strict'
// lib/replay-corpus.js — the one parser for spec/doctrine/replay-corpus.md's class-heading
// grammar. `replay.js` (--class validation, --pick-class selection) and `fleet-reader.js`
// (escapes.corpusGaps/registry) both need to know which ids the corpus carries and whether each
// is hand-authored or derived; before this module existed each would have grown its own regex
// sweep over the same file, the exact "two sessions derive two answers" shape this repo's own
// Incident Policy forbids (specs/20260901/08-corpus-derivation-and-kill-match.md D1,
// brief 19).
//
// Grammar (line-anchored — see the spec's Contracts block for the authoritative statement):
//   ^## `id`$           before the first ^## Derived classes$ line  -> { derived: false }
//   ^## Derived classes$                                            -> opens the derived region
//   ^### `id`$          after that line                             -> { derived: true }
//   id must match /^[a-z0-9]+(?:-[a-z0-9]+)*$/ (escape-row's CLASS_ID_RE); any other heading is
//   not a class. `section` = the text from the heading to the next heading of the same or higher
//   level (fewer or equal `#` characters). A `### ` before the Derived heading, or a `## ` after
//   it, is ignored — neither is a class under this grammar.
//
// What this deliberately does NOT do: read or cache the file itself (corpusPath() only resolves
// the path; every caller reads it), validate that a class's section carries any particular
// prose shape, or track corpus membership across calls (parseCorpus is a pure function of the
// text it is given, called fresh every time — no derived value is ever stored, core § Incident
// Policy).
//
// Exit codes: n/a (library, not an entrypoint).

const path = require('path')

const CORPUS_BAR = 2 // fleet recurrences (joined count) at which a class owes a corpus section

function corpusPath() {
  return path.join(__dirname, '..', '..', 'doctrine', 'replay-corpus.md')
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/
const CLASS_HEADING_RE = /^`([a-z0-9]+(?:-[a-z0-9]+)*)`$/

function parseCorpus(text) {
  const lines = text.split('\n')
  const headings = []
  for (let i = 0; i < lines.length; i++) {
    const m = HEADING_RE.exec(lines[i])
    if (m) headings.push({ idx: i, level: m[1].length, text: m[2] })
  }
  const classes = []
  let derivedOpened = false
  for (let h = 0; h < headings.length; h++) {
    const { idx, level, text } = headings[h]
    if (level === 2 && text === 'Derived classes') {
      derivedOpened = true
      continue
    }
    const idMatch = CLASS_HEADING_RE.exec(text)
    if (!idMatch) continue
    let derived
    if (level === 2 && !derivedOpened) derived = false
    else if (level === 3 && derivedOpened) derived = true
    else continue // a stray ### before the Derived heading, or a ## after it — not a class
    let boundary = lines.length
    for (let k = h + 1; k < headings.length; k++) {
      if (headings[k].level <= level) { boundary = headings[k].idx; break }
    }
    const section = lines.slice(idx, boundary).join('\n').trim()
    classes.push({ id: idMatch[1], derived, section })
  }
  return classes
}

module.exports = { CORPUS_BAR, corpusPath, parseCorpus }
