'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, SPEC } = require('./helpers')
const { spawnSync } = require('node:child_process')

function gate(prompt, specContent) {
  const dir = tmpdir('gate')
  let promptText = prompt
  if (specContent !== null) {
    const specDir = path.join(dir, 'specs/20260704')
    fs.mkdirSync(specDir, { recursive: true })
    fs.writeFileSync(path.join(specDir, '01-x.md'), specContent)
    promptText = prompt + ' specs/20260704/01-x.md'
  }
  return spawnSync('bash', [path.join(SPEC, 'scripts/spec-state-gate.sh')], {
    encoding: 'utf8',
    input: JSON.stringify({ prompt: promptText }),
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  })
}

const SPEC_MD = (status, body = '') => `---\nstatus: ${status}\n---\n# Spec\n${body}\n`

test('state machine: right status passes, wrong status blocks', () => {
  assert.strictEqual(gate('/spec:design', SPEC_MD('hardened')).status, 0)
  assert.strictEqual(gate('/spec:design', SPEC_MD('draft')).status, 2)
  assert.strictEqual(gate('/spec:build', SPEC_MD('hardened')).status, 0)
  assert.strictEqual(gate('/spec:build', SPEC_MD('implementing')).status, 0)
  assert.strictEqual(gate('/spec:build', SPEC_MD('done')).status, 2)
  assert.strictEqual(gate('/spec:review', SPEC_MD('implementing')).status, 0)
  assert.strictEqual(gate('/spec:review', SPEC_MD('draft')).status, 2)
  assert.strictEqual(gate('/spec:plan', SPEC_MD('draft')).status, 0)
})

test('design-brief: hardened/implementing/done pass, draft blocks — never swallowed by the design glob', () => {
  assert.strictEqual(gate('/spec:design-brief', SPEC_MD('hardened')).status, 0)
  assert.strictEqual(gate('/spec:design-brief', SPEC_MD('implementing')).status, 0)
  assert.strictEqual(gate('/spec:design-brief', SPEC_MD('done')).status, 0, 'drift mode runs on shipped specs')
  const res = gate('/spec:design-brief', SPEC_MD('draft'))
  assert.strictEqual(res.status, 2)
  assert.match(res.stderr, /design-brief/, 'the block must name design-brief, not fall through to /spec:design')
})

test('unresolved bracketed markers block', () => {
  const res = gate('/spec:build', SPEC_MD('hardened', 'x [NEEDS CLARIFICATION: which tz?] y'))
  assert.strictEqual(res.status, 2)
  assert.match(res.stderr, /NEEDS CLARIFICATION/)
})

test('prose MENTIONING the marker phrase does not block', () => {
  const res = gate('/spec:build', SPEC_MD('hardened', 'All NEEDS CLARIFICATION markers were resolved in planning.'))
  assert.strictEqual(res.status, 0, res.stderr)
})

test('narration quoting the BRACKETED form (no colon) does not block', () => {
  const res = gate('/spec:build', SPEC_MD('hardened',
    'All three original [NEEDS CLARIFICATION] markers are resolved below (D6, D7, D8).'))
  assert.strictEqual(res.status, 0, res.stderr)
})

test('non-spec prompts and missing paths pass through', () => {
  assert.strictEqual(gate('hello world', null).status, 0)
  assert.strictEqual(gate('/spec:build specs/20260101/99-none.md', null).status, 0)
})
