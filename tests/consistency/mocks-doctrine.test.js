'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const crypto = require('node:crypto')
const path = require('node:path')
const { ROOT, read } = require('../helpers')

// specs/20260914/01-the-mock-contract-and-the-driver.md D13, D14, D12, AC-20260914-01-19: the
// three doctrine surfaces this spec rewrites (mocks.md's section bodies, commands/mocks.md's
// loop, and the new mock-authoring skill) each pin one literal shape; § Provenance Ledger is
// explicitly untouched by D13 and is pinned byte-identical via a hash captured before this spec.

// Pre-change hash of spec/doctrine/mocks.md's "## Provenance Ledger" section body (heading up to
// the next "## " heading), captured against the pre-image at spec authoring time.
const PROVENANCE_LEDGER_SHA256 = '79f904575cac44c58b87218199235ba95730234bad5f09a4bb12078ada9d35ea'

function extractSection(src, heading) {
  const start = src.indexOf('## ' + heading)
  if (start === -1) return null
  const rest = src.slice(start)
  const nextIdx = rest.indexOf('\n## ', 1)
  return nextIdx === -1 ? rest : rest.slice(0, nextIdx)
}

test('AC-20260914-01-19: mocks.md § Mocks: State Machine names the six new states and none of the retired ones', () => {
  const mocksDoctrine = path.join(ROOT, 'spec/doctrine/mocks.md')
  assert.ok(fs.existsSync(mocksDoctrine), 'spec/doctrine/mocks.md must exist — its absence means the whole doctrine surface this AC pins is missing: ' + mocksDoctrine)
  const src = read('spec/doctrine/mocks.md')
  const section = extractSection(src, 'Mocks: State Machine')
  assert.ok(section, '§ Mocks: State Machine must exist under its exact heading name — D13 keeps every heading name unchanged even as bodies rewrite: ' + mocksDoctrine)
  assert.match(section, /SEED\s*→\s*SHELL\s*→\s*SCREENS\s*→\s*THEME\s*→\s*CLIENT\s*→\s*APPROVED/,
    'D3: § Mocks: State Machine must name the six-state chain in order — a stale ordering means the doctrine no longer matches what the driver actually derives: ' + section)
  for (const retired of ['KIT', 'WIREFRAMES', 'SHAPES']) {
    assert.ok(!new RegExp('\\b' + retired + '\\b').test(section),
      `D3: § Mocks: State Machine must name none of the retired states — "${retired}" surviving here means the doctrine still describes a state the driver no longer has: ` + section)
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

test('AC-20260914-01-19: mocks.md § Provenance Ledger is byte-identical to its pre-change body — D13 leaves this section untouched', () => {
  const src = read('spec/doctrine/mocks.md')
  const section = extractSection(src, 'Provenance Ledger')
  assert.ok(section, '§ Provenance Ledger must still exist under its exact heading name: spec/doctrine/mocks.md')
  const actualHash = crypto.createHash('sha256').update(section).digest('hex')
  assert.strictEqual(actualHash, PROVENANCE_LEDGER_SHA256,
    'D13: § Provenance Ledger must be byte-identical to the pre-change body — any edit here means this spec touched a section explicitly marked untouched, breaking every citation into it that assumed stability')
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
