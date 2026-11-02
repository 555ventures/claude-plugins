'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, read } = require('../helpers')

// specs/20261025/03-critical-tier-enforces-its-own-rules.md D5: AC-20261025-03-7 —
// the doctrine sentences name the two mechanical refusals.

function section(text, heading) {
  const m = text.match(new RegExp('^## ' + heading + '[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))', 'm'))
  return m ? m[1] : ''
}

const CORE = path.join(ROOT, 'spec/doctrine/core.md')
const TEMPLATE = path.join(ROOT, 'spec/templates/spec.md')

test('AC-20261025-03-7: core.md names the critical env-skip rule in Runtime Verification and the lint refusal in Tiers, and the template AC comment names critical and missing-literal', () => {
  assert.ok(fs.existsSync(CORE) && fs.existsSync(TEMPLATE), 'core.md or the spec template is missing, so no doctrine pin can run')
  const core = read('spec/doctrine/core.md')
  const tiers = section(core, 'Tiers').replace(/\s+/g, ' ')
  assert.ok(tiers.includes('refused at lock by `ac-matrix --lint`'),
    'Tiers would still describe literal examples as an unchecked wish rather than a lock refusal')
  const ac = section(read('spec/templates/spec.md'), 'Acceptance Criteria')
  assert.ok(ac.length > 0, 'template Acceptance Criteria section not found, so the comment pins cannot be checked')
  assert.match(ac, /missing-literal/, 'the template AC comment omits the missing-literal refusal, so plan authors meet it only at lock')
})
