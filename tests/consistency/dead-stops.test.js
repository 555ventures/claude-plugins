'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { section } = require('../helpers')

// specs/20261029/07-every-dead-stop-becomes-a-question-with-a-default.md — the doctrine
// halves of D1, D4, D8-D13: each former dead stop is one question with a recommended default.

const whole = (file) => section(file, /^/, /$(?!)/)

test('AC-20261029-07-1: run.md Step 0 asks one question naming --in-place and exiting the other worktree, with a recommended option, and no longer says hard stop', () => {
  const s = section('spec/commands/run.md', /^## Step 0/, /^## /)
  assert.match(s, /AskUserQuestion/, 'a worktree that cannot be created stays a bare stop without the question: ' + s)
  assert.match(s, /--in-place/, 'the question must name the deliberate opt-out: ' + s)
  assert.match(s, /exit\s+the\s+other\s+worktree/, 'the nested-worktree failure needs its own retry option: ' + s)
  assert.match(s, /\(Recommended\)/, 'every question carries a recommended default: ' + s)
  assert.doesNotMatch(s, /hard\s+stop/, 'the phrase hard stop marks the dead stop this spec retires: ' + s)
})

test('AC-20261029-07-4: stage-build.md blocked returns apply an if-false fallback with an auto-pick and batch the rest of the wave into ONE question, and the anomaly rule no longer defers to the user', () => {
  const s = section('spec/doctrine/stages/stage-build.md', /^## `blocked` returns/, /^## (?!`blocked`)/)
  assert.match(s, /if\s+false/, 'a worker blocked on an assumption with a written fallback must apply it: ' + s)
  assert.match(s, /📌 Auto-picked/, 'the applied fallback must be announced for veto: ' + s)
  assert.doesNotMatch(whole('spec/doctrine/stages/stage-build.md'), /diagnosed\s+with\s+the\s+user/,
    'the anomaly paragraph must carry the mechanical rule, not a diagnosis conversation')
})

test('AC-20261029-07-8: git merge.md derives the strategy from merge-back inspect RECOMMEND with an auto-pick and drops always-ask and its own commit-count list', () => {
  const s = whole('git/commands/merge.md')
  assert.ok(s.includes('merge-back)" inspect'), 'Step 3 must run the single home of the strategy heuristic: ' + s)
  assert.match(s, /RECOMMEND/, 'the derived line is the script RECOMMEND output: ' + s)
  assert.match(s, /📌 Auto-picked/, 'the derived strategy must be announced for veto: ' + s)
  assert.doesNotMatch(s, /always\s+ask/i, 'always ask is the contradiction with the spec lane that this retires')
  assert.doesNotMatch(s, /1\s+commit\s+→\s+fast-forward/, 'a second copy of the commit-count rule drifts from merge-back.sh')
})

test('AC-20261029-07-9: fix.md step 4 states that only the user waives, keeps its Fresh review heading, and drops the self-waiver sentence', () => {
  const s = whole('spec/commands/fix.md')
  assert.ok(s.includes('4. **Fresh review.**'), 'the review step heading is a live pin of the reviewer dispatch: ' + s)
  assert.doesNotMatch(s, /or\s+state\s+why\s+not/, 'the self-disposal sentence lets the session waive its own findings')
})

test('AC-20261029-07-10: fix.md step 1 and merge.md Step 2 each turn the dirty-tree stop into one question with a recommended /git:commit option and a tagged stash, and fix.md caps at four questions', () => {
  const fixStep = section('spec/commands/fix.md', /^1\. \*\*Root-cause/, /^2\. \*\*/)
  const mergeStep = section('git/commands/merge.md', /^## Step 2/, /^## Step 3/)
  for (const [name, s] of [['fix.md step 1', fixStep], ['merge.md Step 2', mergeStep]]) {
    assert.match(s, /AskUserQuestion/, name + ' must ask instead of stopping bare: ' + s)
    assert.match(s, /\/git:commit[^\n]*\(Recommended\)/, name + ' must recommend committing first on one line: ' + s)
    assert.match(s, /git\s+stash\s+push\s+-u\s+-m/, name + ' must offer the tagged stash: ' + s)
  }
})

test('AC-20261029-07-11: release.md queues a red leg or failed journey in Phase 2, reports a queued slot in Phase 4, and asks one question for an unwalkable journey', () => {
  const p2 = section('spec/commands/release.md', /^## Phase 2/, /^## Phase 3/)
  const p4 = section('spec/commands/release.md', /^## Phase 4/, /^## Rules/)
  assert.ok(p2.includes('spec-queue)" add'), 'a known defect must be routed to the queue in Phase 2: ' + p2)
  assert.ok(p2.includes('--lane fix --top'), 'the queued repair goes to the top of the fix lane: ' + p2)
  assert.match(p2, /AskUserQuestion[\s\S]*access\s+or\s+seed\s+data[\s\S]*\(Recommended\)/,
    'an unwalkable journey asks one question with a recommended default: ' + p2)
  assert.match(p4, /queued/, 'the report must list what was queued: ' + p4)
  assert.doesNotMatch(whole('spec/commands/release.md'), /is\s+a\s+\*\*blocking\s+finding\*\*,\s+not\s+a\s+skip/,
    'the outright blocking-finding sentence is the dead stop this retires')
})

test('AC-20261029-07-12: queue.md groom auto-ticks items with hard evidence, still never ticks without a yes for the rest, and stays within 55 lines', () => {
  const render = section('spec/commands/queue.md', /^## Render/, /^## Rules/)
  assert.ok(render.includes('📌 Auto-picked done'), 'hard evidence is already in hand, so the tick is announced not asked: ' + render)
  const lines = whole('spec/commands/queue.md').split('\n').length
  assert.ok(lines <= 55, 'queue.md is pinned at 55 lines by the hygiene suite; this edit made it ' + lines)
})

test('AC-20261029-07-13: git merge.md Step 1 puts the single ahead spec branch first as the recommended option', () => {
  const s = section('git/commands/merge.md', /^## Step 1/, /^## Step 2/)
  assert.match(s, /\(Recommended\)/, 'the question must carry the recommended default: ' + s)
})
