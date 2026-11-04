'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { section, phrase } = require('../helpers')

// specs/20261101/04-the-suite-pins-references-not-wording.md — every surface states the narrowed
// prose-pin rule and the test agent prescribes it.

const RETIRED = ['regexes over prose', 'regex pin', 'regex-pin', 'by regex']
const whole = (rel) => section(rel, /^/, /$(?!)/)


// specs/20261102/02-a-delegated-driver-stops-on-disk.md D6/D7/D8 — the delegated-stop contract is
// named once in core, and the command surfaces that depend on it keep their references.

test('core.md keeps a Delegated Stops section naming the pending-question file, so every stage slices one contract', () => {
  const body = section('spec/doctrine/core.md', /^## Delegated Stops/, /^## /)
  assert.match(body, phrase('.claude/pending-question.json'),
    'core § Delegated Stops must name the file a child session writes, or a worker has no contract to follow')
})

test('run.md keeps the already-in-a-spec-worktree skip line, and the run and fix section lists in spec-paths serve Delegated Stops', () => {
  const run = whole('spec/commands/run.md')
  assert.match(run, phrase('📌 Auto-picked in place — this session already sits in a worktree on the spec\'s branch (veto anytime)'),
    'without the skip line a lane sub-agent already on the spec branch is asked to make a second worktree that git refuses')
  const paths = whole('spec/bin/spec-paths')
  for (const cmd of ['run', 'fix']) {
    const line = paths.split('\n').find((l) => new RegExp('^\\s+' + cmd + '\\)\\s+SECTIONS=').test(l))
    assert.ok(line, 'spec-paths must keep the ' + cmd + ' section list')
    assert.match(line, /\|Delegated Stops(\||")/, 'the ' + cmd + ' section list must serve Delegated Stops, or that command never reads the contract')
  }
})

test('fix.md names the two delegated question kinds it writes', () => {
  const fix = whole('spec/commands/fix.md')
  for (const kind of ['fix-decisions', 'fix-dispositions']) {
    assert.ok(fix.includes(kind), 'fix.md must name kind ' + kind + ', or a parent cannot match its standing answers to that ask')
  }
})

// specs/20261103/08-queue-items-remember-their-origin.md D8/D17 — AC-20261103-08-17, AC-20261103-08-27:
// the command text prints the queue flags and the never-touches-main rule verbatim.

test('AC-20261103-08-17: stage-review Rules, plan Lock and queue.md print the --origin/--stage/--trigger protocol tokens a session copies', () => {
  const rules = section('spec/doctrine/stages/stage-review.md', /^## Rules/, /^## /)
  assert.ok(rules.includes('--trigger close-followup'), 'stage-review § Rules must print --trigger close-followup, or the close add line is queued without its trigger')
  const lock = section('spec/commands/plan.md', /^## Lock/, /^## /)
  for (const tok of ['--trigger gap', '--trigger close-followup']) {
    assert.ok(lock.includes(tok), 'plan.md § Lock must print ' + tok + ', or a planner queues the line without it')
  }
  const queue = whole('spec/commands/queue.md')
  for (const tok of ['--origin', '--stage', '--trigger']) {
    assert.ok(queue.includes(tok), 'queue.md must name ' + tok + ', or a session invents the flag value')
  }
})

test('AC-20261103-08-27: fanout.md Rules names the fix worktree branch, the no-commit-on-main rule, the session scratchpad and the unmet after gate', () => {
  const rules = section('spec/commands/fanout.md', /^## Rules/, /^## /)
  for (const tok of ['fix/<queue_id>', 'never by committing on main', 'session scratchpad', 'after gate is unmet']) {
    assert.ok(rules.includes(tok), 'fanout.md § Rules must keep "' + tok + '", or the session follows no rule for it')
  }
})

// specs/20261102/03-one-session-runs-the-lanes.md D11 — the fanout command keeps the driver key,
// the --pick flag and the two never-lines, and its section list serves the contracts it relies on.

test('fanout.md (AC-20261103-06-24) names the driver key, the --pick flag, the two never-lines, and the fanout section list in spec-paths serves its contracts', () => {
  const fanout = whole('spec/commands/fanout.md')
  assert.match(fanout, phrase('spec-paths fanout-driver'), 'fanout.md must resolve the driver through its spec-paths key, or the command runs a wrong path silently')
  assert.ok(fanout.includes('--pick'), 'fanout.md must name --pick, or the session cannot pass the user\'s choice to pick the batch on to the driver')
  assert.match(fanout, phrase("never answer a lane's question yourself", 'i'), 'without the first never-line the session answers a worker\'s question and the user\'s decision is taken from them')
  assert.match(fanout, phrase("never run a lane's driver except the MERGE step", 'i'), 'without the second never-line the session drives a lane the worker still owns')
  const paths = whole('spec/bin/spec-paths')
  const line = paths.split('\n').find((l) => /^\s+fanout\)\s+SECTIONS=/.test(l))
  assert.ok(line, 'spec-paths must carry a fanout section list, or the command reads no doctrine')
  for (const sec of ['Host Grounding', 'Pipeline Entry', 'State Machine', 'Model Placement', 'Decisions', 'Delegated Stops', 'Question Style', 'Console Output Style', 'On-Disk Handoff', 'Session Execution']) {
    assert.ok(line.includes(sec), 'the fanout section list must serve ' + sec + ', or the session never reads it')
  }
})

// Heading and chain references moved from the retired-wording suites; each is cited elsewhere in spec/.
test('AC-20260926-01-8 / AC-20261008-01-6 / AC-20260930-01-7 / AC-20260914-02-14: design.md keeps Design Canon, Design Authoring Contracts and Workflows Encode Shape, genesis.md keeps Genesis: Brief State, and the genesis command names the mocks-genesis-enforce chain', () => {
  for (const heading of [/^## Design Canon\b/, /^## Design Authoring Contracts\b/, /^## Workflows Encode Shape, Not Judgment\b/]) {
    section('spec/doctrine/design.md', heading, /^## /)
  }
  section('spec/doctrine/genesis.md', /^## Genesis: Brief State$/, /^## /)
  assert.match(whole('spec/commands/genesis.md'), phrase('/spec:mocks → /spec:genesis → /spec:enforce'),
    'the genesis command must name the chain, or a visual archetype starts genesis without its mocks')
})
