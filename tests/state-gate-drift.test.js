'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tmpdir, SPEC } = require('./helpers')

// specs/20261005/02-connect-runs-first.md — AC-20261005-02-11 and AC-20261005-02-12 (D9):
// spec-state-gate.sh prints its grounding-drift warning only for a config that carries a
// generatedBy stamp, and never blocks.

const W = { baseUrl: 'https://x.example', project: 'acme', tokenEnv: 'WALKTHROUGH_TOKEN' }

function gate(config) {
  const dir = tmpdir('gate-drift')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify(config))
  return spawnSync('bash', [path.join(SPEC, 'scripts/spec-state-gate.sh')], {
    encoding: 'utf8',
    input: JSON.stringify({ prompt: '/spec:plan add a thing' }),
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  })
}

test('AC-20261005-02-11: /spec:plan in a project whose config has no generatedBy exits 0 and prints no grounding-drift warning', () => {
  for (const [label, config] of [['a block-only config', { walkthrough: W }], ['an empty config', {}]]) {
    const r = gate(config)
    assert.strictEqual(r.status, 0, label + ' must not block the prompt: ' + r.stderr)
    assert.strictEqual(r.stdout, '', label + ' has no grounding layer, so the drift warning is false and its remedy leads nowhere: ' + JSON.stringify(r.stdout))
  }
})

test('AC-20261005-02-12: /spec:plan in a project whose config has a generatedBy and a stale contractHash still exits 0 and prints the drift warning naming both stamps', () => {
  const r = gate({ generatedBy: 'spec@7.0.0', contractHash: '000000000000' })
  assert.strictEqual(r.status, 0, 'drift must warn, never block: ' + r.stderr)
  assert.ok(r.stdout.includes('Spec grounding drift'), 'a generated host with a stale stamp must still be warned, or real drift goes unseen: ' + JSON.stringify(r.stdout))
  assert.ok(r.stdout.includes('spec@7.0.0') && r.stdout.includes('000000000000'), 'the warning must name both stamps so the user can see what predates what: ' + JSON.stringify(r.stdout))
})
