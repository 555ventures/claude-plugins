'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { section, phrase } = require('../helpers')

// specs/20261101/04-the-suite-pins-references-not-wording.md — every surface states the narrowed
// prose-pin rule and the test agent prescribes it.

const RETIRED = ['regexes over prose', 'regex pin', 'regex-pin', 'by regex']
const whole = (rel) => section(rel, /^/, /$(?!)/)

test('AC-20261101-04-3: no surface that states the pin rule carries the retired blanket-ban phrases, and core keeps its Incident Policy pointer', () => {
  const surfaces = [
    ['spec/doctrine/core.md', section('spec/doctrine/core.md', /^## Doctrine Authoring$/, /^## /)],
    ['.claude/rules/spec-pipeline.md', section('.claude/rules/spec-pipeline.md', /^## Test Rules$/, /^## /)],
    ...['.claude/rules/conventions/tests.md', '.claude/agents/plugin-tests.md', '.claude/agents/doctrine-author.md',
      '.claude/skills/spec-verify/SKILL.md', '.claude/commands/doctrine-review.md', 'README.md',
      'docs/canonical/doctrine-governance.md'].map((f) => [f, whole(f)]),
  ]
  for (const [name, text] of surfaces) {
    for (const lit of RETIRED) {
      assert.doesNotMatch(text, phrase(lit, 'i'), name + ' still carries "' + lit + '" — the blanket ban contradicts the narrowed rule in core § Doctrine Authoring')
    }
  }
  assert.match(surfaces[0][1], phrase('§ Incident Policy'), 'core § Doctrine Authoring must point a rule that matters at a script')
})

test('AC-20261101-04-4: plugin-tests.md and conventions/tests.md name the prose-pin and exec exemplars, and plugin-tests.md names section and phrase', () => {
  const agent = whole('.claude/agents/plugin-tests.md')
  const conv = whole('.claude/rules/conventions/tests.md')
  for (const [name, text] of [['plugin-tests.md', agent], ['conventions/tests.md', conv]]) {
    assert.ok(text.includes('tests/consistency/dead-stops.test.js'), name + ' must name the prose-pin exemplar, or authors copy the wording-pin file')
    assert.ok(text.includes('tests/merge-back.test.js'), name + ' must keep the exec-a-script exemplar')
  }
  const constraints = section('.claude/agents/plugin-tests.md', /^## Critical Constraints$/, /^## /)
  assert.match(constraints, /\bsection\b/, 'the mode bullet must name section from tests/helpers.js')
  assert.match(constraints, /\bphrase\b/, 'the mode bullet must name phrase from tests/helpers.js')
  assert.ok(!agent.includes('tests/doctrine-review.test.js'), 'plugin-tests.md must stop prescribing the wording-pin file as exemplar')
})
