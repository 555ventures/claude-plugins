'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, read } = require('../helpers')

// Fleet evidence reader (specs/20260820/05-fleet-evidence-reader.md, 2026-08-20): two JJ-ruled
// doctrine changes ride along with the reader (2026-08-20 session, explicit AskUserQuestion,
// spec Rationale). D7 moves core.md's third-recurrence trigger to the fleet denominator
// (26 fleet-wide escapes vs at most 13 visible in any one repo, A2) and pins the literal
// invocation two sessions must derive the same numbers from. D8 gives escape.md's row schema
// a `class` field so recurrence becomes mechanically countable instead of forever hand-
// asserted. Neither edit has landed yet (TDD red phase) — both tests below fail until
// doctrine-author lands D7/D8.

// Literal-phrase pin tolerant of markdown hard-wrap splitting a multi-word phrase across
// lines (tests/doctrine convention — see .claude/agent-memory/plugin-tests notes on this).
function pin(phrase) {
  const words = phrase.trim().split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(words.join('\\s+'))
}

const CORE = path.join(ROOT, 'spec/doctrine/core.md')
const ESCAPE = path.join(ROOT, 'spec/commands/escape.md')

// AC-20260820-05-15 / AC-20260901-07-14 (tagged, no assertion change): the three
// AC-20260820-05-15 phrases must survive specs/20260901/07-escape-class-contract.md D8's edit
// verbatim. The joined-count wording D8 adds is AC-20260901-07-17's own test below.
test('AC-20260820-05-15 / AC-20260901-07-14: core.md Incident Policy adopts the fleet denominator, cites the literal reader invocation, and keeps the degraded-mode sentence', () => {
  assert.ok(fs.existsSync(CORE), 'spec/doctrine/core.md must exist for this pin to mean anything')
  const doc = read('spec/doctrine/core.md')
  const policy = doc.match(/## Incident Policy[\s\S]*?(?=\n## )/)
  assert.ok(policy, 'core.md must still have an "## Incident Policy" section (D7\'s heading is unchanged) — without it there is nothing to pin against')

  assert.match(policy[0], pin('across every readable repo ledger'),
    'D7: "third recurrence of the same class" must gain "counted across every readable repo ledger on this machine" — a per-repo trigger starves the count (26 fleet escapes vs at most 13 visible in any one repo, A2)')
  assert.match(policy[0], /node\s+"\$\(spec-paths\s+fleet-reader\)"\s+--json/,
    'D7: the existing "Derived numbers come from the fleet evidence reader" sentence must gain the literal invocation `node "$(spec-paths fleet-reader)" --json` — without a pinned literal, two sessions can derive two different answers')
  assert.match(policy[0], pin("one repo's ledger says so"),
    'D7: the degraded-mode clause ("a bar filled from one repo\'s ledger says so") must be kept verbatim — losing it removes the honest fallback for a host with no readable fleet')
})

// AC-20260901-07-17: specs/20260901/07-escape-class-contract.md D8 gives the Materiality bullet
// the joined (row + escape-class amendment) count fleet-reader.js's escapes.byClass actually
// derives — the bar must cite the number the reader computes, or two sessions derive two counts
// (spec Rationale).
test('AC-20260901-07-17: core.md Incident Policy names the joined count in the Materiality bullet via the literal escape-class', () => {
  assert.ok(fs.existsSync(CORE), 'spec/doctrine/core.md must exist for this pin to mean anything')
  const doc = read('spec/doctrine/core.md')
  const policy = doc.match(/## Incident Policy[\s\S]*?(?=\n## )/)
  assert.ok(policy, 'core.md must still have an "## Incident Policy" section — without it there is nothing to pin against')

  const materiality = policy[0].match(/\*\*Materiality\*\*[\s\S]*?(?=\n- \*\*|\n\nA proposal)/)
  assert.ok(materiality, 'core.md must still have a Materiality bullet inside Incident Policy — without it there is nothing to check the joined-count wording against')
  assert.match(materiality[0], /escape-class/,
    'D8/AC-20260901-07-17: the Materiality bullet must name the joined count via the literal "escape-class" — the recurrence count is escape rows PLUS their escape-class amendments, as fleet-reader\'s escapes.byClass now derives it, or the bar cites a number the reader does not actually compute')
})

// AC-20260820-05-16
test('AC-20260820-05-16: escape.md\'s row template gains a class field before preventedBy, and step 4 gains a null-when-underivable classification bullet', () => {
  assert.ok(fs.existsSync(ESCAPE), 'spec/commands/escape.md must exist for this pin to mean anything')
  const doc = read('spec/commands/escape.md')

  const templateLine = doc.split('\n').find(l => l.includes('"stage":"escape"') && l.includes('"ts":'))
  assert.ok(templateLine, 'escape.md must still carry the fixed-shape row-template JSON line (the one step 5 appends verbatim) — without it there is nothing to check the class field against')
  assert.match(templateLine, /"class":/,
    'D8: the row-template line must gain a "class" field — the classification the recurrence trigger (D7) now counts on')
  assert.ok(templateLine.indexOf('"class":') < templateLine.indexOf('"preventedBy"'),
    'D8: "class" must sit before "preventedBy" in the row-template line per the Decisions table\'s exact placement — order drift here is a template shape the admission-bar materiality query silently misreads')

  const step4 = doc.match(/4\.\s+\*\*Classify[\s\S]*?(?=\n5\.\s+\*\*Append)/)
  assert.ok(step4, 'escape.md must still have a numbered step 4 (Classify) — without it there is no classification call to add the class bullet to')
  assert.match(step4[0], pin('kebab-case'),
    'D8: step 4 must gain a classification bullet describing class as a stable kebab-case defect-class id, in the same naming style as replay-corpus.md classes')
  assert.match(step4[0], pin('null when underivable'),
    'D8: the bullet must say class is null when underivable — unknown is null, never a guessed value (the file\'s own standing rule, restated for the new field)')
})
