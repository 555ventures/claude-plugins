'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const crypto = require('node:crypto')
const path = require('node:path')
const { ROOT, read } = require('../helpers')

// specs/20260917/01-the-client-confirms-the-story.md D10, AC-20260917-01-14, AC-20260917-01-17,
// AC-20260917-01-18: the CLIENT state collapses out of the doctrine chain, the seed's beat
// grammar retires the roadmap "names and arrows only" wording and the CLIENT command section,
// and § Provenance Ledger's exclusion sentence is rewritten to name --mark approved instead of
// the retired `ledger derive`. Cases still tagged AC-20260914-01-19 (Authoring Rules,
// commands/mocks.md's spec-03 surfaces, the mock-authoring skill) are untouched by this spec.

// Post-change hash of spec/doctrine/mocks.md's "## Provenance Ledger" section body (heading up to
// the next "## " heading) this spec's D10 intends to land: the pre-image section with its first
// sentence — "An `exclusion` row is derived, never hand-typed — `ledger add --kind exclusion`
// refuses, naming `ledger derive`." — replaced verbatim by D10's own quoted replacement text,
// "An `exclusion` row is written by `--mark approved` from each deferred note (`note` =
// `deferred: <id>`); a hand-typed row passes through `ledger add`.", every other byte unchanged.
// Computed 2026-09-17 against that reconstructed body; the doctrine-authoring wave lands the
// prose and the orchestrator reconciles this constant if the landed wording differs.
//
// Reconciled 2026-09-17 after the landed body was corrected: D10 mandated only the first-sentence
// substitution, so the section's next sentence still fixed the `note` grammar to three forms
// (`non-goal:` | `answer:` | `withdrawn:`) that exclude the `deferred: <id>` form the same
// sentence — and the driver — now write. The grammar list gains `deferred: <id>`; every other
// byte of the section is unchanged, and this constant is recomputed from the corrected body.
const PROVENANCE_LEDGER_SHA256 = '558c6a1d0c094bac5e3fccdc7b18416a903dc1108ecd23321c74f9ab5b5ae627'

function extractSection(src, heading) {
  const start = src.indexOf('## ' + heading)
  if (start === -1) return null
  const rest = src.slice(start)
  const nextIdx = rest.indexOf('\n## ', 1)
  return nextIdx === -1 ? rest : rest.slice(0, nextIdx)
}

test('AC-20260917-01-14: mocks.md § Mocks: State Machine names the five-state chain with CLIENT collapsed out, and § Mocks: Page Notes names all four note-status literals including the new deferred', () => {
  const mocksDoctrine = path.join(ROOT, 'spec/doctrine/mocks.md')
  assert.ok(fs.existsSync(mocksDoctrine), 'spec/doctrine/mocks.md must exist — its absence means the whole doctrine surface this AC pins is missing: ' + mocksDoctrine)
  const src = read('spec/doctrine/mocks.md')
  const section = extractSection(src, 'Mocks: State Machine')
  assert.ok(section, '§ Mocks: State Machine must exist under its exact heading name: ' + mocksDoctrine)
  assert.match(section, /SEED\s*→\s*SHELL\s*→\s*SCREENS\s*→\s*THEME\s*→\s*APPROVED/,
    'D10: § Mocks: State Machine must name the five-state chain in order, CLIENT collapsed out — a stale ordering means the doctrine no longer matches what the driver actually derives: ' + section)
  for (const retired of ['KIT', 'WIREFRAMES', 'SHAPES', 'CLIENT']) {
    assert.ok(!new RegExp('\\b' + retired + '\\b').test(section),
      `D10: § Mocks: State Machine must name none of the retired states, CLIENT included — "${retired}" surviving here means the doctrine still describes a state the driver no longer has: ` + section)
  }

  const notesSection = extractSection(src, 'Mocks: Page Notes')
  assert.ok(notesSection, '§ Mocks: Page Notes must exist under its exact heading name: ' + mocksDoctrine)
  for (const status of ['open', 'answered', 'approved', 'deferred']) {
    assert.ok(notesSection.includes(status),
      `D10: § Mocks: Page Notes must name the "${status}" note status — its absence leaves the fourth status (deferred) undocumented, or a session cannot tell the four colors apart: ` + notesSection)
  }
})

test('AC-20260914-01-19: mocks.md § Mocks: Authoring Rules names the four D12 authoring-rule literals', () => {
  const src = read('spec/doctrine/mocks.md')
  const section = extractSection(src, 'Mocks: Authoring Rules')
  assert.ok(section, '§ Mocks: Authoring Rules must exist under its exact heading name: spec/doctrine/mocks.md')
  for (const literal of ['@/components/ui', '/**', 'examples', 'src/records']) {
    assert.ok(section.includes(literal),
      `D12: § Mocks: Authoring Rules must name "${literal}" — its absence means a session reading this section alone cannot reconstruct the authoring rule: ` + section)
  }
})

test('AC-20260917-01-18: mocks.md § Provenance Ledger hashes to the post-change body this spec\'s D10 lands, naming "deferred: <id>" and no longer naming the retired `ledger derive`', () => {
  const src = read('spec/doctrine/mocks.md')
  const section = extractSection(src, 'Provenance Ledger')
  assert.ok(section, '§ Provenance Ledger must still exist under its exact heading name: spec/doctrine/mocks.md')
  const actualHash = crypto.createHash('sha256').update(section).digest('hex')
  assert.strictEqual(actualHash, PROVENANCE_LEDGER_SHA256,
    'D10: § Provenance Ledger must hash to the exact post-change body — any other edit here means the doctrine no longer says what D10 committed to')
  assert.match(section, /deferred: <id>/,
    'D10: § Provenance Ledger must name the exclusion row\'s new note grammar, "deferred: <id>" — its absence leaves a session with no way to trace an exclusion row back to the note it came from: ' + section)
  assert.doesNotMatch(section, /ledger derive/,
    'D10: § Provenance Ledger must no longer name the retired `ledger derive` as how an exclusion row is written — that claim is false (A3) and this spec corrects it: ' + section)
})

test('AC-20260917-01-17: commands/mocks.md and mocks-seed.md carry none of the retired CLIENT/surfaces surfaces, and commands/mocks.md\'s SCREENS section names the copy-verbatim rule', () => {
  const commandsSrc = read('spec/commands/mocks.md')
  const seedSrc = read('spec/templates/mocks-seed.md')
  assert.doesNotMatch(commandsSrc, /## CLIENT/, 'D10: spec/commands/mocks.md must carry no "## CLIENT" heading — the command section retires with the state: ' + commandsSrc.slice(0, 50))
  assert.doesNotMatch(commandsSrc, /names and arrows only/, 'D1: spec/commands/mocks.md must never describe the retired "names and arrows only" seed grammar')
  assert.doesNotMatch(seedSrc, /names and arrows only/, 'D1: spec/templates/mocks-seed.md must never describe the retired "names and arrows only" seed grammar')
  assert.doesNotMatch(commandsSrc, /approval\.theme/, 'D6: spec/commands/mocks.md must never name approval.theme — theme-picked reads only check --json now')
  assert.doesNotMatch(seedSrc, /approval\.theme/, 'D6: spec/templates/mocks-seed.md must never name approval.theme')
  assert.doesNotMatch(commandsSrc, /```surfaces/, 'D1: spec/commands/mocks.md must never show the retired ```surfaces fence')
  assert.doesNotMatch(seedSrc, /```surfaces/, 'D1: spec/templates/mocks-seed.md must never show the retired ```surfaces fence — the seed grammar is beats now, not the roadmap grammar')

  const start = commandsSrc.indexOf('## SCREENS')
  assert.ok(start !== -1, 'spec/commands/mocks.md must still carry a ## SCREENS heading: ' + commandsSrc.slice(0, 50))
  const rest = commandsSrc.slice(start)
  const nextIdx = rest.indexOf('\n## ', 1)
  const screensSection = nextIdx === -1 ? rest : rest.slice(0, nextIdx)
  assert.match(screensSection, /verbatim/,
    'D10: the ## SCREENS section must name the copy-verbatim rule ("copy the beats verbatim; ... never invent or paraphrase a step") — its absence leaves the one rule that makes journey-drawn\'s beats check meaningful undocumented: ' + screensSection)
})

test('AC-20260914-01-19: commands/mocks.md names none of the surfaces spec 03 deletes', () => {
  const commandPath = path.join(ROOT, 'spec/commands/mocks.md')
  assert.ok(fs.existsSync(commandPath), 'spec/commands/mocks.md must exist: ' + commandPath)
  const src = read('spec/commands/mocks.md')
  for (const literal of ['design-atlas', 'tokens.css', 'data-status', 'exclusions.md', 'frontend-design']) {
    assert.ok(!src.includes(literal),
      `D14: spec/commands/mocks.md must never name "${literal}" — the command is the session's whole read, and pointing at a surface spec 03 deletes leaves a dead reference: ` + literal)
  }
})

test('AC-20260914-01-19: spec/skills/mock-authoring/SKILL.md exists with frontmatter name: mock-authoring', () => {
  const skillPath = path.join(ROOT, 'spec/skills/mock-authoring/SKILL.md')
  assert.ok(fs.existsSync(skillPath), 'D12: spec/skills/mock-authoring/SKILL.md must exist — the SHELL/SCREENS/THEME step blocks tell the session to load this skill by name: ' + skillPath)
  const src = fs.readFileSync(skillPath, 'utf8')
  assert.match(src, /^---\n[\s\S]*?^name:\s*mock-authoring\s*$/m,
    'the skill\'s frontmatter must carry `name: mock-authoring` exactly, or the driver\'s "Skill: mock-authoring" line resolves nothing: ' + src.slice(0, 200))
})
