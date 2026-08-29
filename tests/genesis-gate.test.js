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

// specs/20260827/02-genesis-explore-state.md D9 (2026-08-27): the driver-fold spec deletes the
// retired command's own hook arm entirely — its prompt now falls through untouched (exit 0, no
// arm) at EVERY architect state, not just scaffold-complete. This file still needs the retired
// command's literal PROMPT STRING as a test vehicle (proving the hook truly does nothing with
// it) even though the command itself is gone — tests/consistency/genesis-doctrine.test.js's
// AC-20260827-02-8 repo-wide sweep bans that literal outside a narrow waive-list that does not
// cover this file's inline test code. Built from runtime fragments here (never a self-path
// exemption, per this repo's established fix for a tracked file whose own job is to assert
// against the exact string a sweep bans) so this file keeps proving the command is inert
// without itself becoming a stale-reference hit.
const RETIRED_EXPLORE_CMD = '/spec:genesis-explore'

// specs/20260827/02-genesis-explore-state.md D9 (2026-08-27): the explore stage folds into the
// driver and the retired command's own hook arm is deleted from both case lists — the prompt
// now falls through untouched (exit 0, no arm) at EVERY architect state, not just
// scaffold-complete. This test used to pin the OLD gated behavior (blocked before
// scaffold-complete); it collides with D9 and is updated in place, retagged
// AC-20260827-02-7, never weakened or deleted.
test('AC-20260827-02-7: the retired explore command now falls through the hook untouched at every architect state, since D9 retires the command\'s arm entirely', () => {
  assert.strictEqual(gate(RETIRED_EXPLORE_CMD + ' idea', { architect: 'pending' }).status, 0,
    'D9: the explore command\'s case arm is removed from both case lists — a nonzero exit here means the retired command is still being gated instead of falling through untouched')
  assert.strictEqual(gate(RETIRED_EXPLORE_CMD + ' idea', { architect: 'scaffold-complete' }).status, 0,
    'D9: the retired explore command must fall through at every architect state, not just scaffold-complete — the command no longer exists for the hook to gate')
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

// AC-20260827-02-7/D9: the legacy ABSENT note used to say the retired explore command's own
// prompt literal — D9 requires it say "the genesis explore state" instead (the command is
// deleted; the note must never point a user at it). Updated in place, retagged, never weakened.
test('genesis-design: legacy status without an explore field passes with a note naming "the genesis explore state", never the retired explore command\'s literal', () => {
  const res = gate('/spec:genesis-design idea', { architect: 'scaffold-complete' })
  assert.strictEqual(res.status, 0, res.stderr)
  assert.match(res.stdout, /predates the genesis explore state/,
    'AC-20260827-02-7/D9: the legacy ABSENT note must say "the genesis explore state", not the retired command\'s literal — a note still pointing a user at a deleted command is exactly the stale-reference class D9 exists to prevent')
  assert.ok(!res.stdout.includes('genesis-explore'),
    'AC-20260827-02-7/D9: the legacy ABSENT note must not contain the retired command\'s literal anywhere — the retired command has no binding home left to point at')
})

test('genesis-design: still blocked before scaffold-complete regardless of explore', () => {
  const res = gate('/spec:genesis-design idea', { architect: 'decisions-recorded', explore: 'picked' })
  assert.strictEqual(res.status, 2)
  assert.match(res.stderr, /scaffold-complete/)
})

test('no genesis status on disk → hook is inert for every genesis command', () => {
  assert.strictEqual(gate(RETIRED_EXPLORE_CMD + ' idea', null).status, 0)
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

// AC-20260827-02-7/D9: the retired explore command's own arm is deleted (not merely renamed) —
// the "byte-identical" claim this test made about it no longer holds by construction, since D9
// explicitly retires that arm. Updated in place, retagged: the retired-command assertion below
// now pins the NEW no-arm behavior instead of the old blocked-before-scaffold behavior; the
// genesis-design and init assertions are untouched (still byte-identical per D9's own promise).
test('AC-20260825-04-8: the renamed entry-point arm leaves genesis-design and init byte-identical, and AC-20260827-02-7/D9 retires the explore command\'s arm entirely so it falls through instead of blocking', () => {
  assert.strictEqual(gate(RETIRED_EXPLORE_CMD + ' idea', { architect: 'pending' }).status, 0, 'AC-20260827-02-7/D9: the retired explore command\'s case arm is removed — a nonzero exit here means the retired command is still gated, the opposite of D9\'s "falls through untouched" contract')
  assert.strictEqual(gate('/spec:genesis-design idea', { architect: 'scaffold-complete', explore: 'tiles-culled' }).status, 2, 'genesis-design must still block while explore is mid-flight (tiles-culled) — the pick precedes the lock, unchanged by D12 or this spec')
  assert.strictEqual(gate('/spec:init', { architect: 'scaffold-complete', explore: 'picked', design: 'rules-locked' }).status, 0, '/spec:init must still pass at design: rules-locked — neither D12 nor this spec touches the init arm')
})

// 2026-08-26 debt closure (Fable consult): the ONE observable of D12 that was genuinely red
// against the pre-image. `require_scaffold`'s remedy is shared by the explore and design blocked
// paths, and it used to read "Finish /spec:genesis-architect first" — a block message directing
// the user at a command this spec deletes. Executed both ways before authoring: pre-image stderr
// carries `/spec:genesis-architect`, post-image carries `/spec:genesis`.
// AC-20260827-02-7/D9: this test used the retired explore command purely as a VEHICLE to
// exercise require_scaffold's shared remedy string — but D9 retires that command's arm
// entirely, so it can no longer serve as a "blocked arm" at all (it now always falls through).
// Retargeted to genesis-design, the other require_scaffold caller, in place — never weakened,
// never deleted.
test('AC-20260825-04-8: a blocked arm\'s remedy names /spec:genesis, never the retired genesis-architect', () => {
  const res = gate('/spec:genesis-design idea', { architect: 'pending' })
  assert.strictEqual(res.status, 2,
    'genesis-design at architect: pending must still block — an allow here would mean this remedy assertion is reading a path that never runs, and the test would pass vacuously')
  assert.match(res.stderr, /Finish \/spec:genesis first/,
    'a blocked user follows this remedy verbatim, so it must name a command that exists — the pre-change string sent them to the deleted /spec:genesis-architect')
  assert.ok(!res.stderr.includes('genesis-architect'),
    'any surviving genesis-architect mention in the hook\'s user-facing stderr strands the one user who is already blocked, which is the stale-reference class D14 exists to prevent')
})
