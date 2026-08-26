'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runBash } = require('./helpers')

// The genesis state machine's coarse hook (v6): explore requires the scaffold; genesis-design
// requires the pick (or an explicit skip) — the pick precedes the lock. Legacy status files
// without an explore field pass with an injected note, never a block.

function gate(prompt, status) {
  const dir = tmpdir('ggate')
  if (status !== null) {
    fs.mkdirSync(path.join(dir, '.claude/genesis'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.claude/genesis/status.json'), JSON.stringify(status))
    if (status.architect === 'scaffold-complete') {
      fs.writeFileSync(path.join(dir, '.claude/genesis/stack-descriptor.json'), '{}')
    }
  }
  return runBash('scripts/genesis-state-gate.sh', [], {
    input: JSON.stringify({ prompt }),
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  })
}

test('genesis-explore: blocked before scaffold-complete, passes after', () => {
  assert.strictEqual(gate('/spec:genesis-explore idea', { architect: 'pending' }).status, 2)
  assert.strictEqual(gate('/spec:genesis-explore idea', { architect: 'scaffold-complete' }).status, 0)
})

test('genesis-design: blocked while explore is mid-flight; picked and skipped pass', () => {
  for (const phase of ['pending', 'research-done', 'tiles-culled']) {
    const res = gate('/spec:genesis-design idea', { architect: 'scaffold-complete', explore: phase })
    assert.strictEqual(res.status, 2, 'explore: ' + phase + ' must block')
    assert.match(res.stderr, /the pick precedes the lock/)
  }
  assert.strictEqual(gate('/spec:genesis-design idea', { architect: 'scaffold-complete', explore: 'picked' }).status, 0)
  assert.strictEqual(gate('/spec:genesis-design idea', { architect: 'scaffold-complete', explore: 'skipped' }).status, 0)
})

test('genesis-design: legacy status without an explore field passes with a note, not a block', () => {
  const res = gate('/spec:genesis-design idea', { architect: 'scaffold-complete' })
  assert.strictEqual(res.status, 0, res.stderr)
  assert.match(res.stdout, /predates \/spec:genesis-explore/)
})

test('genesis-design: still blocked before scaffold-complete regardless of explore', () => {
  const res = gate('/spec:genesis-design idea', { architect: 'decisions-recorded', explore: 'picked' })
  assert.strictEqual(res.status, 2)
  assert.match(res.stderr, /scaffold-complete/)
})

test('no genesis status on disk → hook is inert for every genesis command', () => {
  assert.strictEqual(gate('/spec:genesis-explore idea', null).status, 0)
  assert.strictEqual(gate('/spec:genesis-design idea', null).status, 0)
  assert.strictEqual(gate('/spec:init', null).status, 0)
})

test('init gating unchanged: partial design canon blocks, rules-locked passes', () => {
  assert.strictEqual(gate('/spec:init', { architect: 'scaffold-complete', explore: 'picked', design: 'tokens-landed' }).status, 2)
  assert.strictEqual(gate('/spec:init', { architect: 'scaffold-complete', explore: 'picked', design: 'rules-locked' }).status, 0)
})

// specs/20260825/04-genesis-driver.md D12/D15 (2026-08-26): /spec:genesis-architect is retired
// and the entry-point arm becomes "/spec:genesis "*|"/spec:genesis" — the driver owns its own
// re-entry, so the hook must never gate the one command that loops on it, regardless of the
// state on disk. D15 pins the other three arms byte-identical: this edit renames one arm only.

test('AC-20260825-04-8: /spec:genesis is the entry point and is never gated, at any architect state', () => {
  const withArg = gate('/spec:genesis idea', { architect: 'pending' })
  assert.strictEqual(withArg.status, 0, 'the entry point must never be blocked — it owns its own re-entry verification, not this hook: ' + withArg.stderr)
  assert.strictEqual(withArg.stderr, '', 'a passing entry-point invocation must inject nothing onto stderr, or a plain allow reads as a warning')

  for (const architect of ['pending', 'scaffold-complete']) {
    const bareRun = gate('/spec:genesis', { architect })
    assert.strictEqual(bareRun.status, 0, 'bare /spec:genesis re-invocation must pass at architect: ' + architect + ' — the driver, not this coarse hook, re-derives state from disk: ' + bareRun.stderr)
    assert.strictEqual(bareRun.stderr, '', 'a passing /spec:genesis re-invocation at architect: ' + architect + ' must inject nothing onto stderr')
  }
})

test('AC-20260825-04-8: the renamed entry-point arm leaves the other three gate arms byte-identical', () => {
  assert.strictEqual(gate('/spec:genesis-explore idea', { architect: 'pending' }).status, 2, 'genesis-explore must still block before architect: scaffold-complete — D12 renames only the entry-point arm')
  assert.strictEqual(gate('/spec:genesis-design idea', { architect: 'scaffold-complete', explore: 'tiles-culled' }).status, 2, 'genesis-design must still block while explore is mid-flight (tiles-culled) — the pick precedes the lock, unchanged by D12')
  assert.strictEqual(gate('/spec:init', { architect: 'scaffold-complete', explore: 'picked', design: 'rules-locked' }).status, 0, '/spec:init must still pass at design: rules-locked — D12 touches only the genesis entry-point arm')
})
