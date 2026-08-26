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
//
// Honest colour of the two admit assertions below (executed 2026-08-26 against the pre-image,
// b53fd97~1): they were ALREADY GREEN. This hook is allow-by-default — any prompt not matched by
// the filter list falls straight through to `exit 0` — so `/spec:genesis idea` and bare
// `/spec:genesis` exited 0 with empty stderr before D12 too, and the entry-point arm is in fact
// behaviorally redundant today (deleting it changes no input's status/stdout/stderr). Every
// plausible mis-implementation of D12 was traced and none of them reddens these two. They are
// kept deliberately, as FORWARD pins: on a critical-tier hook a standing "must continue to
// allow" assertion is what catches a future gating arm that over-matches `/spec:genesis*`.
// D12's own pre-image-red observable is NOT here — it is the remedy-string test below (the
// blocked path used to send users to a command this spec deletes), plus the source-level
// retired-literal sweep over this hook in tests/consistency/genesis-doctrine.test.js.

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

// 2026-08-26 debt closure (Fable consult): the ONE observable of D12 that was genuinely red
// against the pre-image. `require_scaffold`'s remedy is shared by the explore and design blocked
// paths, and it used to read "Finish /spec:genesis-architect first" — a block message directing
// the user at a command this spec deletes. Executed both ways before authoring: pre-image stderr
// carries `/spec:genesis-architect`, post-image carries `/spec:genesis`.
test('AC-20260825-04-8: a blocked arm\'s remedy names /spec:genesis, never the retired genesis-architect', () => {
  const res = gate('/spec:genesis-explore idea', { architect: 'pending' })
  assert.strictEqual(res.status, 2,
    'explore at architect: pending must still block — an allow here would mean this remedy assertion is reading a path that never runs, and the test would pass vacuously')
  assert.match(res.stderr, /Finish \/spec:genesis first/,
    'a blocked user follows this remedy verbatim, so it must name a command that exists — the pre-change string sent them to the deleted /spec:genesis-architect')
  assert.ok(!res.stderr.includes('genesis-architect'),
    'any surviving genesis-architect mention in the hook\'s user-facing stderr strands the one user who is already blocked, which is the stale-reference class D14 exists to prevent')
})
