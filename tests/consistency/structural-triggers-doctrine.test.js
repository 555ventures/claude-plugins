'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, read, phrase } = require('../helpers')

// specs/20261029/05-structural-triggers-at-plan-time.md AC-20261029-05-7: the doctrine files
// name each structural-trigger rule once, in the file an author reads.

function section(text, heading) {
  const m = text.match(new RegExp('^## ' + heading + '[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))', 'm'))
  return m ? m[1] : ''
}

test('AC-20261029-05-7: the spec template names [breaking: in its frontmatter comment and existing rows: in its Data Model comment', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'spec/templates/spec.md')), 'the spec template is missing, so no pin can run')
  const tpl = read('spec/templates/spec.md')
  const front = tpl.split(/^---\s*$/m)[1] || ''
  assert.ok(front.includes('[breaking:'),
    'the breaking: frontmatter comment would not name the Decision tag, so authors meet breaking-unasked only at lock')
  const dm = section(tpl, 'Data Model')
  assert.ok(dm.includes('existing rows:'),
    'the Data Model comment would omit the existing rows: line grammar, so authors meet the refusal only at lock')
})

test('AC-20261029-05-7: plan.md § Lock names breaking-unasked and the adds or changes dependencies notice', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'spec/commands/plan.md')), 'plan.md is missing, so no pin can run')
  const lock = section(read('spec/commands/plan.md'), 'Lock').replace(/\s+/g, ' ')
  assert.ok(lock.includes('breaking-unasked'),
    'the lock step would not name the new finding class the session must act on')
  assert.ok(lock.includes('adds or changes dependencies'),
    'the lock step would not carry the dependency notice into the critical confirmation')
})

test('AC-20261029-05-7: release.md Phase 0 lists breaking specs under a ⚠️ breaking heading', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'spec/commands/release.md')), 'release.md is missing, so no pin can run')
  const p0 = section(read('spec/commands/release.md'), 'Phase 0').replace(/\s+/g, ' ')
  assert.ok(p0.includes('⚠️ breaking'),
    'the release owner would never see which shipped specs broke something')
})

test('AC-20261029-05-7: core.md § Tiers states AC-20261102-04-5: core.md § Tiers keeps non-empty Data Model is critical and core § Tiers, the template Data Model comment and plan.md § Lock each name changes: additive-only', () => {
  for (const f of ['spec/doctrine/core.md', 'spec/templates/spec.md', 'spec/commands/plan.md']) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), f + ' is missing, so no pin can run')
  }
  const tiers = section(read('spec/doctrine/core.md'), 'Tiers')
  assert.match(tiers, phrase('non-empty Data Model is critical'),
    'core § Tiers would drop the critical-by-construction rule the carve-out is an exception to')
  assert.match(tiers, phrase('changes: additive-only'),
    'core § Tiers would not state the carve-out, so authors read a rule with no exception')
  assert.match(section(read('spec/templates/spec.md'), 'Data Model'), phrase('changes: additive-only'),
    'the template Data Model comment would omit the grammar, so authors meet the carve-out only at the refusal')
  assert.match(section(read('spec/commands/plan.md'), 'Lock'), phrase('changes: additive-only'),
    'plan.md § Lock would not name the carve-out as the remedy for data-model-requires-critical')
})
