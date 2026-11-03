'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, read, section, phrase, runNode } = require('../helpers')

// specs/20261103/01-the-user-reaches-build.md AC-20261103-01-6..8: the doctrine carries the job
// story, the Users block and the cold walk, the wireframe binds structure only, and the dead
// UX research brief is gone.

const NEXT_H2 = /^## /

function files(dir) {
  const out = []
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir + '/' + e.name
    if (e.isDirectory()) out.push(...files(rel))
    else out.push(rel)
  }
  return out
}

test('AC-20261103-01-6: the templates, plan, build, reviewer and mocks doctrine carry the Users references and the job-story form', () => {
  assert.match(read('spec/templates/spec.md'), /^## Users$/m, 'spec.md without a ## Users heading leaves the planner no slot for the user image the lock now demands')

  const brief = read('spec/templates/roadmap-brief.md')
  assert.ok(brief.slice(0, brief.search(/^## /m)).includes('Journeys:'),
    'the roadmap brief header must carry Journeys:, or the stories seeded at genesis stop at the brief')

  assert.ok(section('spec/commands/plan.md', /^## Entry$/, NEXT_H2).includes('Journeys:'),
    'plan § Entry must read the brief\'s Journeys: lines, or the planner never copies them into ## Users')
  assert.ok(section('spec/commands/plan.md', /^## Lock$/, NEXT_H2).includes('missing-users-section'),
    'plan § Lock must name missing-users-section, or the planner meets the refusal with no remedy')

  assert.match(section('spec/doctrine/stages/stage-build.md', /^## Worker Contract/, NEXT_H2), /Workers\s+Read[^.]*\bUsers\b/i,
    'the Worker Contract read list must include Users, or build workers never see who the feature is for')

  assert.match(section('spec/agents/reviewer.md', /^## Ground yourself first$/, NEXT_H2), /\bUsers\b/,
    'reviewer § Ground yourself first must list Users among the spec sections, or the cold walk has nothing to walk')
  assert.match(read('spec/agents/reviewer.md'), /^## The cold walk$/m, 'the reviewer without a cold-walk section never walks a journey as its user')

  assert.match(read('spec/templates/mocks-seed.md'), phrase('When <situation>, I want <motivation>, so I can <outcome>.'),
    'the seed template must show the job-story form, or authors keep writing a named person')

  const seed = section('spec/doctrine/mocks.md', /^## Mocks: Seed$/, NEXT_H2)
  for (const token of ['first-run', 'empty', 'seed-done']) {
    assert.ok(seed.includes(token), 'mocks § Mocks: Seed must name ' + token + ', or the off-path rule is invisible to the seed author')
  }

  for (const rel of ['spec/templates/mocks-seed.md', 'spec/doctrine/mocks.md', 'spec/commands/mocks.md']) {
    assert.doesNotMatch(read(rel), /persona/i, rel + ' still names the seed line a persona, so the line keeps being written as a named person')
  }
})

test('AC-20261103-01-7: design.md leads § Design Authoring Contracts with the wireframe-binds-structure rule and no doctrine file says mock supremacy', () => {
  assert.match(section('spec/doctrine/design.md', /^## Design Authoring Contracts$/, NEXT_H2), phrase('The wireframe binds structure, not looks.'),
    'without the lead-in the gray wireframe keeps being read as the finished design')
  for (const dir of ['spec/doctrine', 'spec/commands', 'spec/agents', 'spec/templates']) {
    for (const rel of files(dir)) {
      assert.doesNotMatch(read(rel), phrase('mock supremacy', 'i'), rel + ' still carries the retired mock-wins-everything doctrine')
    }
  }
})

test('AC-20261103-01-8: the UX research brief template and genesis section are gone, nothing under spec/ names them, and citations-check.js reports MISS=0', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'spec/templates/ux-research-brief.md')), 'the dead template still ships to every host')
  assert.doesNotMatch(read('spec/doctrine/genesis.md'), /^## Genesis: Fresh UX Research/m, 'the section promises an artifact nothing produces')
  for (const rel of files('spec')) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8')
    assert.ok(!text.includes('ux-research-brief') && !text.includes('research-brief.md'), rel + ' still names the deleted research brief')
  }
  const check = runNode('scripts/citations-check.js', [], { cwd: ROOT })
  assert.strictEqual(check.status, 0, 'citations-check.js must complete: ' + check.stderr)
  assert.match(check.stdout, /\bMISS=0\b/, 'deleting the section orphaned a § citation that now points nowhere: ' + check.stdout)
})
