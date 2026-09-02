'use strict'
const { test } = require('node:test')
const assert = require('node:assert')

// specs/20260901/08-corpus-derivation-and-kill-match.md D1 (brief 19): the replay
// corpus (spec/doctrine/replay-corpus.md) grows a second, DERIVED region fed by the escape
// ledger's joined count (sibling spec 07) — a class with >= CORPUS_BAR fleet recurrences and no
// hand-authored entry earns a `### `id`` section under a new `## Derived classes` heading, while
// the six existing classes stay `## `id`` headings above it. `replay.js` (D2/D3) and
// `fleet-reader.js` (D6) both need ONE parser for this grammar rather than two independent
// regex sweeps drifting apart — this module is that parser. `spec/scripts/lib/replay-corpus.js`
// does not exist at HEAD, so every assertion below fails on MODULE_NOT_FOUND (the correct red
// for a from-scratch unit-level pin, per this repo's Test Rules and tests/frontmatter.test.js's
// own precedent) — and once D1 lands but before D5 amends the shipped corpus file, the first
// assertion below (seven classes, the seventh derived) still fails since the shipped file only
// carries six `## ` headings and no `## Derived classes` region yet.

const { CORPUS_BAR, corpusPath, parseCorpus } = require('../../spec/scripts/lib/replay-corpus')

test('AC-20260901-08-1: WHEN parseCorpus reads the shipped replay-corpus.md THE SYSTEM SHALL return seven classes in file order — the six Contracts ids with derived:false, followed by prefix-collision-coverage-fail-open with derived:true', () => {
  const fs = require('node:fs')
  const shippedPath = corpusPath()
  assert.ok(fs.existsSync(shippedPath),
    `D1: corpusPath() must resolve to a real file (the plugin's own doctrine/replay-corpus.md, ` +
    `resolved from __dirname) — a missing file here means every downstream --class validation and ` +
    `--pick-class selection has nothing to read: ${shippedPath}`)
  const text = fs.readFileSync(shippedPath, 'utf8')
  const classes = parseCorpus(text)
  const ids = classes.map((c) => c.id)
  assert.deepStrictEqual(ids, [
    'promise-carried-not-delivered', 'self-consistent-polarity', 'silent-fallback',
    'boundary-shift', 'dead-wiring', 'doc-contract-lie',
    'prefix-collision-coverage-fail-open',
  ], `D1/D5: the shipped corpus must parse to exactly these seven ids in FILE ORDER — the six ` +
    `hand-authored classes followed by the one derived class D5 authors from the Contracts block; ` +
    `a wrong order or a missing/extra id here means replay.js's --class validation and --pick-class ` +
    `tie-break (corpus order) would target the wrong class: ${JSON.stringify(ids)}`)
  for (let i = 0; i < 6; i++) {
    assert.strictEqual(classes[i].derived, false,
      `D1: the six hand-authored classes above the "## Derived classes" heading must each carry ` +
      `derived:false — a wrong value here would make --pick-class's derived-first tie-break prefer ` +
      `a hand-authored class over the real derived one, or vice versa: class "${classes[i].id}" ` +
      `carried derived:${classes[i].derived}`)
  }
  const last = classes[6]
  assert.strictEqual(last.derived, true,
    `D1/D5: prefix-collision-coverage-fail-open sits under "## Derived classes" as a "### " heading ` +
    `and must carry derived:true — a false value here means --pick-class could never prefer it on a ` +
    `tie, defeating D5's whole point of exercising the parser's derived arm against the shipped file`)
  assert.match(last.section, /prefix-collision-coverage-fail-open|recipe/i,
    `D1: the derived class's own section text must be non-empty and belong to it, not bleed in from ` +
    `a neighboring heading: ${JSON.stringify(String(last.section).slice(0, 120))}`)
})

test('AC-20260901-08-1: WHEN parseCorpus reads a synthetic corpus carrying a stray level-3 heading BEFORE "## Derived classes" THE SYSTEM SHALL return only the three real classes (one hand-authored, two derived) and ignore the stray heading entirely', () => {
  const synthetic = [
    '# Replay Corpus: Mutation Classes',
    '',
    'preamble text, ignored',
    '',
    '## `a-b`',
    '',
    'Recipe: do a thing.',
    '',
    '### `g-h`',
    '',
    'A stray level-3 heading placed BEFORE the "## Derived classes" line — per the grammar this is',
    'not a class at all (only a "## `id`" heading counts before the Derived heading) and must be',
    'ignored, not misparsed as a premature derived class.',
    '',
    '## Derived classes',
    '',
    '### `c-d`',
    '',
    'Recipe: do another thing.',
    '',
    '### `e-f`',
    '',
    'Recipe: do a third thing.',
    '',
  ].join('\n')
  const classes = parseCorpus(synthetic)
  assert.deepStrictEqual(classes.map((c) => ({ id: c.id, derived: c.derived })), [
    { id: 'a-b', derived: false },
    { id: 'c-d', derived: true },
    { id: 'e-f', derived: true },
  ], `D1: the stray "### \`g-h\`" heading sits BEFORE "## Derived classes" and must be silently ignored ` +
    `(only a "## \`id\`" heading is a class there); the parser must return exactly [a-b:false, ` +
    `c-d:true, e-f:true] in file order — a leaked g-h entry or a wrong derived flag here would let a ` +
    `hand-authored-region heading masquerade as a derived class or vice versa: ` +
    `${JSON.stringify(classes.map((c) => ({ id: c.id, derived: c.derived })))}`)
  assert.ok(classes.every((c) => typeof c.section === 'string' && c.section.length > 0),
    `D1: every returned class must carry a non-empty section (the recipe text between its heading ` +
    `and the next heading of the same or higher level) — an empty section gives the mutation-` +
    `authoring session nothing to follow: ${JSON.stringify(classes.map((c) => c.section))}`)
})

test('AC-20260901-08-1: CORPUS_BAR is exactly 2, the fleet-recurrence threshold D6\'s corpusGaps and D5\'s "owes a corpus section" rule both key off', () => {
  assert.strictEqual(CORPUS_BAR, 2,
    `D1: CORPUS_BAR must be the literal 2 JJ set on 2026-09-01 (Rationale: "the corpus should grow ` +
    `fast; the standing-guard bar stays at 3") — a drifted value here silently changes fleet-reader.js's ` +
    `corpusGaps threshold and replay-corpus.md's own "owes a section" rule out from under both: got ${CORPUS_BAR}`)
})
