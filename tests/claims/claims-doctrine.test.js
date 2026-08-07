'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('../helpers')

// specs/20260807/04-claims-registry.md § Planning row-pair rule: a doctrine change and its
// pinning test belong in the same File Plan row pair. This file pins the three landed-doctrine
// edits AC-20260807-04-9 requires: doctor.md check 18 (script-driven inventory), shared.md
// § Doctrine Authoring (the marker convention's single binding home, D7, incl. its own live
// marker), and .claude/rules/spec-pipeline.md § Review Checks (the D11 baseline-hunk bullet).
// None of this text exists yet — every assertion here is expected red until the doctrine batch
// lands.

test('AC-20260807-04-9: doctor.md carries check 18 running claims-lint --json and citing § Doctrine Authoring', () => {
  const doc = read('spec/commands/doctor.md')
  const m = doc.match(/\n18\.\s*\*\*[\s\S]*?(?=\n\d+\.\s*\*\*|\n## |$)/)
  assert.ok(m, 'doctor.md has no numbered check 18 — the claims-registry inventory (D3) is missing from the deterministic checks')
  const block = m[0]
  assert.match(block, /spec-paths\s+claims-lint/,
    'check 18 must resolve the script through spec-paths claims-lint, never a literal path (§ Risk Tiers: a wrong key breaks commands silently)')
  assert.match(block, /--json/,
    'check 18 must run claims-lint in --json mode — the only machine format the script emits (D3)')
  assert.match(block, /§ Doctrine Authoring/,
    'check 18 must cite § Doctrine Authoring for the marker convention rather than restating it (D7: one binding home per rule)')
})

test('AC-20260807-04-9: shared.md § Doctrine Authoring carries both marker tokens and its own live enforcedBy marker', () => {
  const shared = read('spec/doctrine/shared.md')
  const sec = shared.match(/## Doctrine Authoring\n([\s\S]*?)(?=\n## |$)/)
  assert.ok(sec, 'shared.md has no § Doctrine Authoring section — the marker convention has no binding home to land in')
  const body = sec[1]
  assert.match(body, /enforcedBy:/,
    'the marker convention\'s enforcedBy: token is missing from § Doctrine Authoring, its single binding home (D7)')
  assert.match(body, /unenforced:/,
    'the marker convention\'s unenforced: token is missing from § Doctrine Authoring, its single binding home (D7)')
  assert.match(body, /<!--\s*enforcedBy:\s*spec\/scripts\/claims-lint\.js\s*-->/,
    'D7: the convention\'s own governing claim must carry the first live marker, self-referentially, or AC-7\'s shared-for passthrough pin exercises nothing real')
})

test('AC-20260807-04-9: .claude/rules/spec-pipeline.md § Review Checks names claims-baseline.json (D11)', () => {
  const rules = read('.claude/rules/spec-pipeline.md')
  const sec = rules.match(/## Review Checks\n([\s\S]*?)(?=\n## |$)/)
  assert.ok(sec, '.claude/rules/spec-pipeline.md has no § Review Checks section for the D11 bullet to land in')
  assert.match(sec[1], /claims-baseline\.json/,
    'D11: § Review Checks must gain a bullet flagging a spec/commands|doctrine|agents line-count hunk with no matching claims-baseline.json hunk in the same diff')
})
