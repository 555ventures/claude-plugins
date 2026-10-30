'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, read } = require('../helpers')

// specs/20261029/04-the-four-questions-that-did-not-exist.md D3: AC-20261029-04-6 —
// plan.md's Lock section asks the owner before a critical-tier spec locks.

test('AC-20261029-04-6: WHEN plan.md § Lock is read THE SYSTEM SHALL ask a critical-tier confirm (Lock it / Keep it as a draft) before the ledger row', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'spec/commands/plan.md')), 'plan.md is missing, so no lock question can exist')
  const m = read('spec/commands/plan.md').match(/^## Lock[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m)
  assert.ok(m, 'plan.md lost its Lock section, so nothing can place the confirm')
  const section = m[1]
  const ask = section.indexOf('AskUserQuestion')
  assert.ok(ask !== -1, 'the Lock section asks no question, so a critical spec locks silently')
  assert.match(section.slice(Math.max(0, ask - 400), ask), /tier: critical/,
    'the question must be gated on "tier: critical" within 400 characters, or it fires on standard specs too')
  assert.ok(section.includes('Lock it (Recommended)'), 'the first option must be "Lock it (Recommended)" so the default is one keypress')
  assert.ok(section.includes('Keep it as a draft'), 'the owner needs a way to decline the lock and keep status: draft')
  assert.ok(section.indexOf('Keep it as a draft') < section.indexOf('**Ledger row'),
    'the confirm must precede the ledger row, or a declined lock still leaves a lock row behind')
})
