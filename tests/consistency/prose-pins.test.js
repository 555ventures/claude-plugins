'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { section, phrase } = require('../helpers')

// specs/20261101/04-the-suite-pins-references-not-wording.md — every surface states the narrowed
// prose-pin rule and the test agent prescribes it.

const RETIRED = ['regexes over prose', 'regex pin', 'regex-pin', 'by regex']
const whole = (rel) => section(rel, /^/, /$(?!)/)

test('AC-20261101-04-3: no surface that states the pin rule carries the retired blanket-ban phrases, and core keeps its Incident Policy pointer', () => {
  const surfaces = [
    ['spec/doctrine/core.md', section('spec/doctrine/core.md', /^## Doctrine Authoring$/, /^## /)],
    ['.claude/rules/spec-pipeline.md', section('.claude/rules/spec-pipeline.md', /^## Test Rules$/, /^## /)],
    ...['.claude/rules/conventions/tests.md', '.claude/agents/plugin-tests.md', '.claude/agents/doctrine-author.md',
      '.claude/skills/spec-verify/SKILL.md', '.claude/commands/doctrine-review.md', 'README.md',
      'docs/canonical/doctrine-governance.md'].map((f) => [f, whole(f)]),
  ]
  for (const [name, text] of surfaces) {
    for (const lit of RETIRED) {
      assert.doesNotMatch(text, phrase(lit, 'i'), name + ' still carries "' + lit + '" — the blanket ban contradicts the narrowed rule in core § Doctrine Authoring')
    }
  }
  assert.match(surfaces[0][1], phrase('§ Incident Policy'), 'core § Doctrine Authoring must point a rule that matters at a script')
})

test('AC-20261101-04-4: plugin-tests.md and conventions/tests.md name the prose-pin and exec exemplars, and plugin-tests.md names section and phrase', () => {
  const agent = whole('.claude/agents/plugin-tests.md')
  const conv = whole('.claude/rules/conventions/tests.md')
  for (const [name, text] of [['plugin-tests.md', agent], ['conventions/tests.md', conv]]) {
    assert.ok(text.includes('tests/consistency/dead-stops.test.js'), name + ' must name the prose-pin exemplar, or authors copy the wording-pin file')
    assert.ok(text.includes('tests/merge-back.test.js'), name + ' must keep the exec-a-script exemplar')
  }
  const constraints = section('.claude/agents/plugin-tests.md', /^## Critical Constraints$/, /^## /)
  assert.match(constraints, /\bsection\b/, 'the mode bullet must name section from tests/helpers.js')
  assert.match(constraints, /\bphrase\b/, 'the mode bullet must name phrase from tests/helpers.js')
  assert.ok(!agent.includes('tests/doctrine-review.test.js'), 'plugin-tests.md must stop prescribing the wording-pin file as exemplar')
})

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

// specs/20261102/03-one-session-runs-the-lanes.md D11 — the fanout command keeps the driver key,
// the flags and the two never-lines, and its section list serves the contracts it relies on.

test('fanout.md names the driver key, the three flags and the two never-lines, and the fanout section list in spec-paths serves its contracts', () => {
  const fanout = whole('spec/commands/fanout.md')
  assert.match(fanout, phrase('spec-paths fanout-driver'), 'fanout.md must resolve the driver through its spec-paths key, or the command runs a wrong path silently')
  for (const flag of ['--lanes', '--include-fixes', '--override-serial']) {
    assert.ok(fanout.includes(flag), 'fanout.md must name ' + flag + ', or the session cannot pass the user\'s cap or overrides on')
  }
  assert.match(fanout, phrase("never answer a lane's question yourself", 'i'), 'without the first never-line the session answers a worker\'s question and the user\'s decision is taken from them')
  assert.match(fanout, phrase("never run a lane's driver except the MERGE step", 'i'), 'without the second never-line the session drives a lane the worker still owns')
  const paths = whole('spec/bin/spec-paths')
  const line = paths.split('\n').find((l) => /^\s+fanout\)\s+SECTIONS=/.test(l))
  assert.ok(line, 'spec-paths must carry a fanout section list, or the command reads no doctrine')
  for (const sec of ['Host Grounding', 'Pipeline Entry', 'State Machine', 'Model Placement', 'Decisions', 'Delegated Stops', 'Question Style', 'Console Output Style', 'On-Disk Handoff', 'Session Execution']) {
    assert.ok(line.includes(sec), 'the fanout section list must serve ' + sec + ', or the session never reads it')
  }
})
