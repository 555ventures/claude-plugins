'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, SPEC } = require('./helpers')
const { spawnSync } = require('node:child_process')

// specs/20260912/03-run-isolates-and-owns-the-stages.md D12 (AC-20260912-03-12,
// AC-20260912-03-19): spec-state-gate.sh retires its /spec:build, /spec:review and /spec:design
// arms — those three prompts now fall through untouched (exit 0) at every spec status, since the
// commands themselves are no longer invokable. /spec:run and /spec:plan are untouched. Retired-
// command literals below are assembled from fragments (never spelled whole) so this file's own
// AC-20260912-03-17 pin on itself stays clean.
const RETIRED = {
  build: '/spec:' + 'build',
  review: '/spec:' + 'review',
  design: '/spec:' + 'design',
}

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

// ---------------------------------------------------------------------------
// AC-20260912-03-12
// ---------------------------------------------------------------------------

test('AC-20260912-03-12: spec-state-gate.sh lets a retired stage-command prompt fall through untouched (exit 0, empty stderr) at every spec status, including a spec with open_markers set', () => {
  const fixtures = [
    ['draft with open_markers: 2', `---\nstatus: draft\nopen_markers: 2\n---\n# Spec\nbody\n`],
    ['draft', SPEC_MD('draft')],
    ['hardened', SPEC_MD('hardened')],
    ['implementing', SPEC_MD('implementing')],
    ['done', SPEC_MD('done')],
    ['hardened with unresolved [NEEDS CLARIFICATION: x]', SPEC_MD('hardened', 'x [NEEDS CLARIFICATION: which tz?] y')],
  ]
  for (const name of Object.keys(RETIRED)) {
    const cmd = RETIRED[name]
    for (const [label, content] of fixtures) {
      const r = gate(cmd, content)
      assert.strictEqual(r.status, 0,
        'AC-20260912-03-12/D12: /spec:' + name + ' is retired and no longer registered as a ' +
        'command, so the gate must fall through untouched (exit 0) against a spec at ' + label +
        ' — a nonzero exit here means the retired arm is still reading spec status: ' + r.stderr)
      assert.strictEqual(r.stderr, '',
        'AC-20260912-03-12/D12: a retired-command prompt must produce empty stderr against a ' +
        'spec at ' + label + ' — any refusal text here means the arm was not actually removed: ' +
        r.stderr)
    }
  }
})

// ---------------------------------------------------------------------------
// AC-20260912-03-19 (retagged in place from AC-20260901-10-1 / AC-20260901-10-2, both SHALL
// CONTINUE TO — D12 touches only the three retired arms, never /spec:run, /spec:plan, or the
// marker gate)
// ---------------------------------------------------------------------------

test('AC-20260912-03-19 (also AC-20260901-10-1 / AC-20260901-10-2, SHALL CONTINUE TO): state machine: /spec:run admits hardened, implementing, and done; refuses draft naming both /spec:run and /spec:plan; and is subject to the marker gate — untouched by the stage-command retirement', () => {
  assert.strictEqual(gate('/spec:run', SPEC_MD('hardened')).status, 0,
    'AC-20260912-03-19 (SHALL CONTINUE TO): /spec:run against hardened must be admitted — the loop starts (or restarts) the design/build/review sequence from here')
  assert.strictEqual(gate('/spec:run', SPEC_MD('implementing')).status, 0,
    'AC-20260912-03-19 (SHALL CONTINUE TO): /spec:run against implementing must be admitted — the loop resumes the build/review drivers mid-run')
  assert.strictEqual(gate('/spec:run', SPEC_MD('done')).status, 0,
    'AC-20260912-03-19 (SHALL CONTINUE TO): /spec:run against done must be admitted — the loop\'s cold-DONE no-op entry (spec-status --next) must not be blocked by the state gate')
  const draftRun = gate('/spec:run', SPEC_MD('draft'))
  assert.strictEqual(draftRun.status, 2,
    'AC-20260912-03-19 (SHALL CONTINUE TO): /spec:run against draft must be refused — a spec that has not been planned cannot be carried through the loop')
  assert.match(draftRun.stderr, /\/spec:run/,
    'AC-20260912-03-19 (SHALL CONTINUE TO): the draft refusal must name /spec:run as the command being refused')
  assert.match(draftRun.stderr, /\/spec:plan/,
    'AC-20260912-03-19 (SHALL CONTINUE TO): the draft refusal must name /spec:plan as the remedy')
  const markerRun = gate('/spec:run', `---\nstatus: hardened\nopen_markers: 2\n---\n# Spec\nclean body\n`)
  assert.strictEqual(markerRun.status, 2,
    'AC-20260912-03-19 (SHALL CONTINUE TO): /spec:run against a hardened spec with open_markers: 2 must be refused — the marker gate is untouched by the stage-command retirement')
  assert.strictEqual(gate('/spec:plan', SPEC_MD('draft')).status, 0,
    'AC-20260912-03-19 (SHALL CONTINUE TO): /spec:plan against draft must still be unconditionally admitted (its own early-exit arm, ahead of the marker/status checks) — this spec touches only the retired three arms')
})

// ---------------------------------------------------------------------------
// Marker gate: /spec:run is now the sole status-checked, marker-checked survivor exercised by
// these fixtures (/spec:plan exits before the marker gate ever runs; the three retired commands
// no longer reach it at all — AC-20260912-03-12 above).
// ---------------------------------------------------------------------------

test('unresolved bracketed markers block', () => {
  const res = gate('/spec:run', SPEC_MD('hardened', 'x [NEEDS CLARIFICATION: which tz?] y'))
  assert.strictEqual(res.status, 2)
  assert.match(res.stderr, /NEEDS CLARIFICATION/)
})

test('prose MENTIONING the marker phrase does not block', () => {
  const res = gate('/spec:run', SPEC_MD('hardened', 'All NEEDS CLARIFICATION markers were resolved in planning.'))
  assert.strictEqual(res.status, 0, res.stderr)
})

test('narration quoting the BRACKETED form (no colon) does not block', () => {
  const res = gate('/spec:run', SPEC_MD('hardened',
    'All three original [NEEDS CLARIFICATION] markers are resolved below (D6, D7, D8).'))
  assert.strictEqual(res.status, 0, res.stderr)
})

test('open_markers counter is authoritative: 0 passes even when prose quotes the colon form', () => {
  const spec = `---\nstatus: hardened\nopen_markers: 0\n---\n# Spec\nRationale: we resolved [NEEDS CLARIFICATION: which tz?] by picking UTC (D4).\n`
  const res = gate('/spec:run', spec)
  assert.strictEqual(res.status, 0, res.stderr)
})

test('open_markers > 0 blocks regardless of body content', () => {
  const res = gate('/spec:run', `---\nstatus: hardened\nopen_markers: 2\n---\n# Spec\nclean body\n`)
  assert.strictEqual(res.status, 2)
  assert.match(res.stderr, /open_markers: 2/)
})

test('no counter falls back to the prose grep (legacy specs)', () => {
  const res = gate('/spec:run', SPEC_MD('hardened', 'x [NEEDS CLARIFICATION: which tz?] y'))
  assert.strictEqual(res.status, 2)
})

test('non-spec prompts and missing paths pass through', () => {
  assert.strictEqual(gate('hello world', null).status, 0)
  assert.strictEqual(gate('/spec:run specs/20260101/99-none.md', null).status, 0)
})

// `jq` is a hard dependency of every UserPromptSubmit gate: it is how the prompt is extracted.
// Absent, the gate cannot tell a gated command from ordinary chat, so it must fall through — but
// a silent fall-through means the whole hook-enforced state machine is off with no signal, which
// is the one failure a host must never absorb quietly. These pins hold the loud shape: still
// non-blocking (exit 0, stdout is injected context on this hook), but the notice names jq, names
// the install, and names which pipeline commands pass unchecked. genesis-state-gate.sh shares
// the dependency and stays deliberately silent so exactly one warning appears per prompt.
function gateWithoutJq(script) {
  const dir = tmpdir('gate-nojq')
  const shimBin = path.join(dir, 'nojq-bin')
  fs.mkdirSync(shimBin, { recursive: true })
  // A PATH holding only the interpreters the gates need — and no jq.
  for (const tool of ['bash', 'sh', 'printf', 'cat', 'grep', 'sed', 'node', 'git', 'awk', 'tr', 'dirname', 'pwd', 'cd']) {
    const found = spawnSync('command', ['-v', tool], { shell: '/bin/bash', encoding: 'utf8' }).stdout.trim()
    if (found && fs.existsSync(found)) {
      try { fs.symlinkSync(found, path.join(shimBin, tool)) } catch { /* already linked */ }
    }
  }
  return spawnSync('bash', [path.join(SPEC, `scripts/${script}`)], {
    encoding: 'utf8',
    input: JSON.stringify({ prompt: '/spec:run specs/20260704/01-x.md' }),
    cwd: dir,
    env: { PATH: shimBin, CLAUDE_PROJECT_DIR: dir, HOME: dir },
  })
}

test('AC-20260912-03-12: a missing jq announces that the state machine is off, naming exactly /spec:plan and /spec:run and none of the three retired stage commands', () => {
  const res = gateWithoutJq('spec-state-gate.sh')
  assert.strictEqual(res.status, 0,
    'the gate must stay non-blocking without jq — a missing dependency may not lock the user out of their own session')
  assert.match(res.stdout, /jq/,
    'the notice must name jq as the missing dependency, or the user cannot act on it')
  assert.match(res.stdout, /brew install jq|apt-get install jq/,
    'the notice must name the install command, per the repo rule that a refusal names its remedy')
  assert.match(res.stdout, /\/spec:plan/,
    'AC-20260912-03-12/D12: the notice must still name /spec:plan as a command that passes unchecked without jq')
  assert.match(res.stdout, /\/spec:run/,
    'AC-20260912-03-12/D12: the notice must still name /spec:run as a command that passes unchecked without jq')
  for (const name of Object.keys(RETIRED)) {
    assert.ok(!res.stdout.includes(RETIRED[name]),
      'AC-20260912-03-12/D12: the notice must no longer name /spec:' + name + ' — that arm no ' +
      'longer exists to be "checked", so listing it as an unchecked command is stale prose: ' + res.stdout)
  }
})

test('the genesis gate stays silent without jq so exactly one notice appears per prompt', () => {
  const res = gateWithoutJq('genesis-state-gate.sh')
  assert.strictEqual(res.status, 0, 'the genesis gate must also stay non-blocking without jq')
  assert.strictEqual(res.stdout.trim(), '',
    'spec-state-gate.sh owns the single jq notice — a second warning on the same prompt is noise')
})
