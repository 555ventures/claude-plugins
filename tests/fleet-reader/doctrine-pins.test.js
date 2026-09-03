'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, read } = require('../helpers')

// specs/20260820/05-fleet-evidence-reader.md D7/D8: core.md's third-recurrence trigger uses
// the fleet-wide escape denominator (all repos, never one repo's count, A2) and pins the
// literal invocation two sessions must derive the same numbers from; escape.md's row schema
// carries a `class` field so recurrence is mechanically countable instead of hand-asserted.

// Literal-phrase pin tolerant of markdown hard-wrap splitting a multi-word phrase across
// lines (tests/doctrine convention — see .claude/agent-memory/plugin-tests notes on this).
function pin(phrase) {
  const words = phrase.trim().split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(words.join('\\s+'))
}

const CORE = path.join(ROOT, 'spec/doctrine/core.md')
const ESCAPE = path.join(ROOT, 'spec/commands/escape.md')
const REPLAY = path.join(ROOT, 'spec/commands/replay.md')
const PLUGIN_JSON = path.join(ROOT, 'spec/.claude-plugin/plugin.json')

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

// AC-20260903-01-14 (part 1): specs/20260903/01-owed-query-and-row-handoff.md D12 — escape.md
// step 7 gains one bullet, gated on preventedBy review-check|runtime-leg, naming the row key and
// the sentence that the plugin repo's fleet-reader --owed consumes it, nothing to paste.
test('AC-20260903-01-14: escape.md step 7 gains a review-check/runtime-leg row-as-handoff bullet naming fleet-reader --owed and that no handoff prompt is composed', () => {
  assert.ok(fs.existsSync(ESCAPE), 'spec/commands/escape.md must exist for this pin to mean anything')
  const doc = read('spec/commands/escape.md')
  const step7 = doc.match(/7\.\s+\*\*Report[\s\S]*?(?=\n## Backfill mode)/)
  assert.ok(step7, 'escape.md must still have a numbered step 7 (Report) — without it there is no report step to add the row-as-handoff bullet to')
  assert.match(step7[0], /fleet-reader --owed/,
    'D12/AC-14: step 7 must name fleet-reader --owed as the consumer of the row key — a bullet with no command name leaves the session with nothing to point at')
  assert.match(step7[0], pin('no handoff prompt'),
    'D12/AC-14: the bullet must state that no handoff prompt is composed — the whole point of the row-as-handoff design is that the session never assembles a prompt for a human to paste')
  assert.match(step7[0], /review-check/,
    'D12/AC-14: the bullet must gate on preventedBy review-check — an ungated bullet would wrongly claim every escape row is plugin-blaming')
  assert.match(step7[0], /runtime-leg/,
    'D12/AC-14: the bullet must also gate on preventedBy runtime-leg, the other plugin-blaming value D2 defines')
})

// AC-20260903-01-14 (part 2): specs/20260903/01-owed-query-and-row-handoff.md D10/D12 — replay.md
// Phase 4's --record invocation gains --via driver|manual with the driver-applies-when rule, and
// Phase 5 gains a `missed`-outcome bullet naming fleet-reader --owed the same way escape.md does.
test('AC-20260903-01-14: replay.md Phase 4 gains --via driver|manual on the --record invocation with the driver-applies-when-REPLAY-step rule, and Phase 5 gains a missed bullet naming fleet-reader --owed', () => {
  assert.ok(fs.existsSync(REPLAY), 'spec/commands/replay.md must exist for this pin to mean anything')
  const doc = read('spec/commands/replay.md')
  const phase4 = doc.match(/## Phase 4[\s\S]*?(?=\n## Phase 5)/)
  assert.ok(phase4, 'replay.md must still have a "## Phase 4" section — without it there is nothing to check the --via addition against')
  assert.match(phase4[0], /--via\s+driver\|manual/,
    'D10/AC-14: Phase 4\'s --record invocation must gain --via driver|manual — omitting it leaves the printed command silently defaulting to manual on every run')
  assert.match(phase4[0], pin('review driver'),
    'D10/AC-14: Phase 4 must state the rule that driver applies when the target came from the review driver\'s REPLAY step')
  assert.match(phase4[0], pin('REPLAY step'),
    'D10/AC-14: the rule must name the REPLAY step specifically — a manual /spec:replay run also invokes this same script and must stay manual')

  const phase5 = doc.match(/## Phase 5[\s\S]*?(?=\n## Rules)/)
  assert.ok(phase5, 'replay.md must still have a "## Phase 5" section — without it there is nothing to check the missed bullet against')
  assert.match(phase5[0], /fleet-reader --owed/,
    'D12/AC-14: Phase 5 must gain a missed-outcome bullet naming fleet-reader --owed as the consumer of the run id — mirroring escape.md\'s row-as-handoff bullet, no prompt is composed for a human to paste')
})

// AC-20260903-01-14 (part 3): D15 — every behavior change in this spec bumps the owning
// plugin's semver (pipeline rules § Planning). The AC pins the pre-image value as the one the
// manifest must have moved past — never a specific target, since the next free number is
// derived at build time (§ Gotchas), so this only asserts the version DIFFERS.
test('AC-20260903-01-14: plugin.json version bumps past 7.68.0', () => {
  assert.ok(fs.existsSync(PLUGIN_JSON), 'spec/.claude-plugin/plugin.json must exist for this pin to mean anything')
  const pkg = JSON.parse(read('spec/.claude-plugin/plugin.json'))
  assert.notStrictEqual(pkg.version, '7.68.0',
    'D15: every behavior change in this spec must bump the owning plugin\'s semver — a version still reading 7.68.0 means the pipeline rules § Planning version-bump discipline was skipped: ' + pkg.version)
})
