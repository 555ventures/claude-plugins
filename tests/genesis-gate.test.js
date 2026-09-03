'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runBash } = require('./helpers')

// The genesis state machine's coarse hook (v7, specs/20260827/03-genesis-design-state.md D6):
// only /spec:init is gated now. The old genesis-explore and genesis-design commands
// (and the require_scaffold helper they shared) are both retired — their prompts fall through
// untouched at every state, exit 0, no arm, nothing on stdout or stderr. Legacy status files
// without an explore field still pass /spec:init with an injected note, never a block.

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

// specs/20260827/02-genesis-explore-state.md D9: the driver-fold spec deletes the
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

// specs/20260827/02-genesis-explore-state.md D9: the explore stage folds into the
// driver and the retired command's own hook arm is deleted from both case lists — the prompt
// now falls through untouched (exit 0, no arm) at EVERY architect state, not just
// scaffold-complete.
test('AC-20260827-02-7: the retired explore command now falls through the hook untouched at every architect state, since D9 retires the command\'s arm entirely', () => {
  assert.strictEqual(gate(RETIRED_EXPLORE_CMD + ' idea', { architect: 'pending' }).status, 0,
    'D9: the explore command\'s case arm is removed from both case lists — a nonzero exit here means the retired command is still being gated instead of falling through untouched')
  assert.strictEqual(gate(RETIRED_EXPLORE_CMD + ' idea', { architect: 'scaffold-complete' }).status, 0,
    'D9: the retired explore command must fall through at every architect state, not just scaffold-complete — the command no longer exists for the hook to gate')
})

// specs/20260827/03-genesis-design-state.md D6: the design lock folds into the
// driver as the new DESIGN state and genesis-design's own hook arm (plus the now-callerless
// require_scaffold helper it shared with the retired explore arm) is deleted from both case
// lists — the prompt now falls through untouched (exit 0, no arm, nothing on stdout or stderr)
// at every state, exactly as AC-20260827-02-7 already pins for the retired explore command.
// This test replaces the three old genesis-design tests that pinned the now-deleted gated
// behavior (blocked while explore mid-flight, the legacy ABSENT note, blocked before
// scaffold-complete) — none of that behavior exists to pin once the arm is gone.
// tests/genesis-gate.test.js is waived by path in tests/consistency/genesis-doctrine.test.js's
// genesis-design sweep (AC-20260827-03-7), the same reason AC-20260827-02-7's assertion is
// already waived there for genesis-explore: the literal prompt string is the input under test,
// never a stale reference.
test('AC-20260827-03-6: /spec:genesis-design now falls through the hook untouched (empty stdout and stderr) at every architect and explore state, since D6 retires the command\'s own arm and the now-callerless require_scaffold helper entirely', () => {
  const atPending = gate('/spec:genesis-design idea', { architect: 'pending' })
  assert.strictEqual(atPending.status, 0, 'D6: the genesis-design case arm is removed from both case lists — a nonzero exit here means the retired command is still being gated instead of falling through untouched')
  assert.strictEqual(atPending.stdout, '', 'D6: a fallen-through prompt must inject nothing onto stdout — any output means some arm still ran for a command that no longer exists')
  assert.strictEqual(atPending.stderr, '', 'D6: a fallen-through prompt must inject nothing onto stderr either — the retired command has no arm left to warn or block with')

  const midFlight = gate('/spec:genesis-design idea', { architect: 'scaffold-complete', explore: 'tiles-culled' })
  assert.strictEqual(midFlight.status, 0, 'D6: genesis-design must fall through even while explore is mid-flight (tiles-culled) — the pick-precedes-the-lock gate it used to enforce no longer exists for it to enforce')
  assert.strictEqual(midFlight.stdout, '', 'D6: a fallen-through prompt must inject nothing onto stdout regardless of explore state')
  assert.strictEqual(midFlight.stderr, '', 'D6: a fallen-through prompt must inject nothing onto stderr regardless of explore state')
})

// specs/20260902/08-genesis-shrink-brief-state.md D8 (AC-20260902-08-9, AC-20260902-08-16):
// the init arm's init-arm value set gains "ratified" (BRIEF's own successful ratification value,
// D4) as a third passing value alongside the SHALL-CONTINUE-TO "rules-locked"/"skipped" legacy
// values; the blocked message for doctrine-drafted/tokens-landed says "re-run /spec:genesis to
// reach BRIEF" (never "genesis design state"); the pending/absent note says "the genesis BRIEF
// state has not ratified a design canon".
test('AC-20260902-08-9: init gating passes silently at design: "ratified"; blocks at doctrine-drafted/tokens-landed naming the value and BRIEF; notes (never blocks) at pending naming BRIEF and never "genesis-design"; AC-20260902-08-16: SHALL CONTINUE TO pass at rules-locked and skipped', () => {
  const ratified = gate('/spec:init', { architect: 'scaffold-complete', design: 'ratified' })
  assert.strictEqual(ratified.status, 0, 'D8: design: "ratified" is BRIEF\'s own successful ratification value — /spec:init must pass silently')
  assert.strictEqual(ratified.stdout, '', 'D8: a passing design: "ratified" invocation must inject nothing onto stdout')
  assert.strictEqual(ratified.stderr, '', 'D8: a passing design: "ratified" invocation must inject nothing onto stderr')

  const drafted = gate('/spec:init', { architect: 'scaffold-complete', explore: 'picked', design: 'doctrine-drafted' })
  assert.strictEqual(drafted.status, 2, 'design: doctrine-drafted is a partial legacy canon — /spec:init must still block it')
  assert.match(drafted.stderr, /doctrine-drafted/, 'D8: the blocked message must echo the actual design value "doctrine-drafted" so the session knows exactly what state it is stuck in')
  assert.match(drafted.stderr, /BRIEF/, 'D8: the blocked message must name BRIEF as the state the session needs to reach — its old wording pointed at the retired "genesis design state"')
  assert.match(drafted.stderr, /re-run \/spec:genesis to reach BRIEF/, 'D8: the blocked message must carry the literal remedy "re-run /spec:genesis to reach BRIEF"')
  assert.ok(!drafted.stderr.includes('genesis-design'), 'D8: the blocked message must never mention "genesis-design" — that command is retired and BRIEF is a driver state, not a command')

  const tokensLanded = gate('/spec:init', { architect: 'scaffold-complete', explore: 'picked', design: 'tokens-landed' })
  assert.strictEqual(tokensLanded.status, 2, 'design: tokens-landed is still a partial legacy canon — /spec:init must still block it')
  assert.match(tokensLanded.stderr, /tokens-landed/, 'D8: the blocked message must echo the actual design value "tokens-landed"')
  assert.match(tokensLanded.stderr, /BRIEF/, 'D8: the blocked message must name BRIEF for tokens-landed too')
  assert.ok(!tokensLanded.stderr.includes('genesis-design'), 'D8: the blocked message must not mention "genesis-design" either')

  assert.strictEqual(gate('/spec:init', { architect: 'scaffold-complete', explore: 'picked', design: 'rules-locked' }).status, 0, 'AC-20260902-08-16: design: rules-locked is a legacy closed canon — /spec:init SHALL CONTINUE TO pass')
  assert.strictEqual(gate('/spec:init', { architect: 'scaffold-complete', explore: 'picked', design: 'skipped' }).status, 0, 'AC-20260902-08-16: design: skipped is a legitimate headless archetype — /spec:init SHALL CONTINUE TO pass')

  const pending = gate('/spec:init', { architect: 'scaffold-complete', explore: 'picked' })
  assert.strictEqual(pending.status, 0, 'design: pending must never block /spec:init — a headless archetype legitimately has no design stage')
  assert.match(pending.stdout, /Genesis note/, 'design: pending must still print a note (not a block) so the session knows a design canon is available but unrun')
  assert.match(pending.stdout, /the genesis BRIEF state has not ratified a design canon/, 'D8: the pending note must carry the literal reworded wording naming the BRIEF state, not the retired "genesis design state" phrasing')
  assert.match(pending.stdout, /BRIEF/, 'D8: the pending note must name BRIEF')
  assert.ok(!pending.stdout.includes('genesis-design'), 'D8: the design: pending note must not point the session at the deleted genesis-design command')
})

test('no genesis status on disk → hook is inert for every genesis command', () => {
  assert.strictEqual(gate(RETIRED_EXPLORE_CMD + ' idea', null).status, 0)
  assert.strictEqual(gate('/spec:genesis-design idea', null).status, 0)
  assert.strictEqual(gate('/spec:init', null).status, 0)
})

// specs/20260825/04-genesis-driver.md D12/D15: /spec:genesis-architect is retired
// and the entry-point arm becomes "/spec:genesis "*|"/spec:genesis" — the driver owns its own
// re-entry, so the hook must never gate the one command that loops on it, regardless of the
// state on disk. D15 pins the other three arms byte-identical: this edit renames one arm only.
//
// Honest colour of the two admit assertions below (executed against the pre-image,
// b53fd97~1): they were ALREADY GREEN. This hook is allow-by-default — any prompt not matched by
// the filter list falls straight through to `exit 0` — so `/spec:genesis idea` and bare
// `/spec:genesis` exited 0 with empty stderr before D12 too, and the entry-point arm is in fact
// behaviorally redundant today (deleting it changes no input's status/stdout/stderr). Every
// plausible mis-implementation of D12 was traced and none of them reddens these two. They are
// kept deliberately, as FORWARD pins: on a critical-tier hook a standing "must continue to
// allow" assertion is what catches a future gating arm that over-matches `/spec:genesis*`.
// D12's own pre-image-red observable is NOT here — the remedy-string test that once
// followed this one is retired now that require_scaffold itself is deleted by
// specs/20260827/03-genesis-design-state.md D6, since a deleted helper owes no remedy string to
// pin; the source-level retired-literal sweep over this hook in
// tests/consistency/genesis-doctrine.test.js covers it instead.

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
// the "byte-identical" claim this test made about it does not hold by construction, since D9
// explicitly retires that arm. Updated in place, retagged: the retired-command assertion below
// pins the explore no-arm behavior; the init assertion is untouched (still byte-identical).
// specs/20260827/03-genesis-design-state.md D6: the genesis-design assertion this
// test also carried ("must still block while explore is mid-flight") is a second collision — D6
// retires genesis-design's own arm the same way D9 retired explore's, so that assertion is
// updated in place to the new falls-through invariant (also pinned, in full, by the dedicated
// AC-20260827-03-6 test above) rather than deleted, per this repo's collision convention.
test('AC-20260825-04-8, AC-20260827-03-6: the renamed entry-point arm leaves init byte-identical, and both the retired explore and genesis-design commands\' arms fall through instead of blocking', () => {
  assert.strictEqual(gate(RETIRED_EXPLORE_CMD + ' idea', { architect: 'pending' }).status, 0, 'AC-20260827-02-7/D9: the retired explore command\'s case arm is removed — a nonzero exit here means the retired command is still gated, the opposite of D9\'s "falls through untouched" contract')
  assert.strictEqual(gate('/spec:genesis-design idea', { architect: 'scaffold-complete', explore: 'tiles-culled' }).status, 0, 'D6: genesis-design must now fall through even while explore is mid-flight (tiles-culled) — its own arm and the pick-precedes-the-lock gate it used to enforce are both retired by this spec')
  assert.strictEqual(gate('/spec:init', { architect: 'scaffold-complete', explore: 'picked', design: 'rules-locked' }).status, 0, '/spec:init must still pass at design: rules-locked — neither D12 nor this spec touches the init arm')
})
