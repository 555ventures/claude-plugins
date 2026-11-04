'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runBash } = require('./helpers')

// specs/20260827/03-genesis-design-state.md D6: only /spec:init is gated by genesis-state-gate.sh.

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

// specs/20260902/08-genesis-shrink-brief-state.md D8 (AC-20260902-08-9, AC-20260902-08-16):
// the init arm's init-arm value set gains "ratified" (BRIEF's own successful ratification value,
// D4) as a passing value alongside "skipped"; the blocked message for doctrine-drafted/tokens-landed says "re-run /spec:genesis to
// reach BRIEF" (never "genesis design state"); the pending/absent note says "the genesis BRIEF
// state has not ratified a design canon".
// specs/20261101/08-no-host-needs-the-shims.md D2: the retired closed-canon value falls to the note arm.
test('AC-20260902-08-9 / AC-20261101-08-6 / AC-20261101-08-5: init gating passes silently at design: "ratified" or "skipped"; blocks at doctrine-drafted/tokens-landed naming the value and BRIEF; notes (never blocks) at pending and at a retired closed-canon value naming BRIEF and never "genesis-design"; AC-20260902-08-16: SHALL CONTINUE TO pass at skipped', () => {
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

  const skipped = gate('/spec:init', { architect: 'scaffold-complete', explore: 'picked', design: 'skipped' })
  assert.strictEqual(skipped.status, 0, 'AC-20260902-08-16: design: skipped is a legitimate headless archetype — /spec:init SHALL CONTINUE TO pass')
  assert.strictEqual(skipped.stdout, '', 'a passing design: "skipped" invocation must stay silent — a note here nags every headless host on every /spec:init')

  const retiredValue = gate('/spec:init', { architect: 'scaffold-complete', design: 'rules-' + 'locked' })
  assert.strictEqual(retiredValue.status, 0, 'a retired closed-canon value must never block /spec:init — the prompt would be refused on a host that cannot fix it')
  assert.match(retiredValue.stdout, /^Genesis note:.*BRIEF/m, 'a status carrying a value no writer produces is "no ratified canon" — the note naming BRIEF is the only message that points at the way forward: ' + retiredValue.stdout)

  const pending = gate('/spec:init', { architect: 'scaffold-complete', explore: 'picked' })
  assert.strictEqual(pending.status, 0, 'design: pending must never block /spec:init — a headless archetype legitimately has no design stage')
  assert.match(pending.stdout, /Genesis note/, 'design: pending must still print a note (not a block) so the session knows a design canon is available but unrun')
  assert.match(pending.stdout, /the genesis BRIEF state has not ratified a design canon/, 'D8: the pending note must carry the literal reworded wording naming the BRIEF state, not the retired "genesis design state" phrasing')
  assert.match(pending.stdout, /BRIEF/, 'D8: the pending note must name BRIEF')
  assert.ok(!pending.stdout.includes('genesis-design'), 'D8: the design: pending note must not point the session at the deleted genesis-design command')
})

test('no genesis status on disk → hook is inert for /spec:init', () => {
  assert.strictEqual(gate('/spec:init', null).status, 0)
})

// specs/20260825/04-genesis-driver.md D12: the hook never gates /spec:genesis, which loops on its own re-entry.
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
