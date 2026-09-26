'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, SPEC, read, runBash } = require('../helpers')

// specs/20260926/04-the-design-brief.md: this file owns AC-20260926-04-10 (the doctor check
// invoking catalog-inventory --check), AC-20260926-04-19 (the design-brief skill's frontmatter
// and body), and AC-20260926-04-20 (the three new spec-paths keys plus the doctrine heading and
// command-file literals D1/D11 add). None of these exist yet.

test('AC-20260926-04-10: spec/commands/doctor.md contains exactly one numbered check line invoking catalog-inventory.js --check against docs/design/catalog.md', () => {
  const src = read('spec/commands/doctor.md')
  const re = /spec-paths catalog-inventory\)" --root \. --out docs\/design\/catalog\.md --check/
  const matches = src.match(new RegExp(re.source, 'g')) || []
  assert.strictEqual(matches.length, 1,
    'doctor.md must invoke `node "$(spec-paths catalog-inventory)" --root . --out docs/design/catalog.md --check` exactly once — zero occurrences means the currency check D5 promises was never added, and more than one means it was duplicated across two check numbers: found ' + matches.length)

  const idx = src.search(re)
  assert.ok(idx > -1, 'the catalog-inventory --check invocation must exist somewhere in doctor.md')
  const before = src.slice(Math.max(0, idx - 400), idx)
  assert.match(before, /docs\/design\/catalog\.md/,
    'the sentence introducing the catalog-inventory --check invocation must itself name docs/design/catalog.md as the existence guard — its absence means the check runs unconditionally instead of only when a catalog already exists: ' + before)
})

test('AC-20260926-04-19: spec/skills/design-brief/SKILL.md exists with frontmatter name: design-brief and its body names JTBD, frequency, docs/design/catalog.md, ## Intent to pattern and ## Naming', () => {
  const skillPath = path.join(SPEC, 'skills/design-brief/SKILL.md')
  assert.ok(fs.existsSync(skillPath),
    'spec/skills/design-brief/SKILL.md must exist — D10 names it as the auto-discovered skill Fable loads before authoring the design brief: ' + skillPath)
  const src = fs.readFileSync(skillPath, 'utf8')
  assert.match(src, /^name:\s*design-brief\s*$/m,
    'the skill\'s frontmatter must carry `name: design-brief` exactly, or the skill auto-discovery mechanism (the same one mock-authoring uses) never finds it: ' + src)
  for (const literal of ['JTBD', 'frequency', 'docs/design/catalog.md', '## Intent to pattern', '## Naming']) {
    assert.ok(src.includes(literal),
      'the design-brief skill body must name "' + literal + '" — its absence means Fable\'s authoring method omits one of D10\'s five method points (JTBD grammar, navigation frequency, the whole-catalog read, the composite table, or the naming tables): ' + literal)
  }
})

test('AC-20260926-04-20: spec-paths catalog-inventory, design-brief-template and design-paths-template each resolve to an existing file, and genesis.md/genesis command file carry the new literals', () => {
  const checkPath = runBash('bin/spec-paths', ['catalog-inventory']).stdout.trim()
  assert.strictEqual(checkPath, path.join(SPEC, 'scripts/catalog-inventory.js'),
    'D4/D12: `spec-paths catalog-inventory` must resolve to spec/scripts/catalog-inventory.js — a wrong or missing key breaks the genesis driver\'s own D5 invocation and /spec:doctor\'s new currency check\'s invocation silently (§ Risk Tiers, spec-paths: "a wrong key breaks commands silently")')
  assert.ok(fs.existsSync(checkPath), 'the resolved catalog-inventory.js path must actually exist on disk: ' + checkPath)

  const briefTemplatePath = runBash('bin/spec-paths', ['design-brief-template']).stdout.trim()
  assert.strictEqual(briefTemplatePath, path.join(SPEC, 'templates/design-brief.md'),
    'D6/D12: `spec-paths design-brief-template` must resolve to spec/templates/design-brief.md — its absence means the DESIGN_BRIEF step\'s "Write docs/design/brief.md (template: design-brief.md via spec-paths templates)" instruction resolves nothing: ' + briefTemplatePath)
  assert.ok(fs.existsSync(briefTemplatePath), 'the resolved design-brief.md template path must actually exist on disk: ' + briefTemplatePath)

  const designPathsTemplatePath = runBash('bin/spec-paths', ['design-paths-template']).stdout.trim()
  assert.strictEqual(designPathsTemplatePath, path.join(SPEC, 'templates/design-paths.json'),
    'D3/D12: `spec-paths design-paths-template` must resolve to spec/templates/design-paths.json — its absence means DESIGN_BRIEF\'s "Write .claude/genesis/design-paths.json (template: design-paths.json)" instruction resolves nothing: ' + designPathsTemplatePath)
  assert.ok(fs.existsSync(designPathsTemplatePath), 'the resolved design-paths.json template path must actually exist on disk: ' + designPathsTemplatePath)

  const doctrineSrc = read('spec/doctrine/genesis.md')
  assert.match(doctrineSrc, /^## Genesis: Design Stage$/m,
    'D11: spec/doctrine/genesis.md must carry a "## Genesis: Design Stage" heading naming the states, marks, files and the fresh-session rule: ' + doctrineSrc.length + ' bytes read, heading not found')
  assert.ok(!doctrineSrc.includes('## Genesis: Design State'),
    'the design-stage heading must never be spelled "## Genesis: Design State" — A5 names this the exact live-pin-banned form: ' + doctrineSrc.includes('## Genesis: Design State'))

  const commandSrc = read('spec/commands/genesis.md')
  assert.ok(commandSrc.includes('DESIGN_BRIEF'),
    'spec/commands/genesis.md must name DESIGN_BRIEF in its chain sentence (D11) — its absence means the command\'s own doc never tells a session the design stage exists: ' + commandSrc)
})
