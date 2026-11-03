'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, read, phrase } = require('../helpers')

// specs/20261029/09-the-commands-read-the-policy-block.md (AC-20261029-09-1, -2, -4, -6): the
// doctrine readers of the host's policy block name their key and print their literal.

function body(rel) {
  assert.ok(fs.existsSync(path.join(ROOT, rel)), rel + ' is missing, so its policy reader cannot be pinned')
  return read(rel)
}

// The text from the heading line matching `startRe` to the next heading at the same or a higher level.
function section(text, startRe, level) {
  const lines = text.split('\n')
  const at = lines.findIndex((l) => startRe.test(l))
  assert.ok(at !== -1, 'heading ' + startRe + ' is gone, so the reader beneath it is unpinned')
  const stop = new RegExp('^#{1,' + level + '} ')
  let end = lines.length
  for (let i = at + 1; i < lines.length; i++) if (stop.test(lines[i])) { end = i; break }
  return lines.slice(at, end).join('\n')
}

test('AC-20261029-09-1: run.md Step 0 reads policy.worktreePerSpec and prints the in-place auto-pick line', () => {
  const step = section(body('spec/commands/run.md'), /^## Step 0/, 2)
  assert.ok(step.includes('policy.worktreePerSpec'),
    'Step 0 never names policy.worktreePerSpec, so a host that opted out of worktrees is still isolated')
  assert.ok(step.includes('📌 Auto-picked in place — host policy worktreePerSpec: false (veto anytime)'),
    'Step 0 lacks the exact auto-pick line, so the in-place choice is silent and the session cannot be vetoed')
})

test('AC-20261029-09-2: core.md Pipeline Entry ties policy.directLaneToMain to /git:merge and still no spec in one sentence', () => {
  const entry = section(body('spec/doctrine/core.md'), /^## Pipeline Entry/, 2)
  const sentences = entry.replace(/\s+/g, ' ').split(/(?<=[.])\s+(?=[A-Z*])/)
  const hit = sentences.find((s) => s.includes('policy.directLaneToMain'))
  assert.ok(hit, 'Pipeline Entry never names policy.directLaneToMain, so a no-direct-to-main host still gets main commits')
  assert.ok(hit.includes('/git:merge'),
    'the directLaneToMain sentence omits /git:merge, so the Direct change has no named landing path: ' + hit)
})

test('AC-20261029-09-4: git merge.md Step 3 and stage-review.md each read policy.mergeStrategy and print host policy (veto anytime)', () => {
  const step = section(body('git/commands/merge.md'), /^## Step 3/, 2)
  for (const [where, text] of [['git/commands/merge.md Step 3', step], ['spec/doctrine/stages/stage-review.md', body('spec/doctrine/stages/stage-review.md')]]) {
    assert.ok(text.includes('policy.mergeStrategy'),
      where + ' never names policy.mergeStrategy, so a host with a standing strategy is still derived from RECOMMEND')
    assert.ok(text.includes('host policy (veto anytime)'),
      where + ' lacks the "host policy (veto anytime)" literal, so the policy pick has no printed veto line')
  }
})

test('AC-20261029-09-6: plan.md Lock step 5 reads policy.ledgerCommitted and doctor.md check 20 prints the disabled-by-policy line', () => {
  const lock = section(body('spec/commands/plan.md'), /^## Lock/, 2)
  const step5 = lock.slice(lock.search(/^5\. \*\*Commit the lock/m)).replace(/\s+/g, ' ')
  assert.ok(step5.includes('policy.ledgerCommitted'),
    'Lock step 5 does not read policy.ledgerCommitted, so git add of an ignored ledger exits 1 and the lock commit dies')
  const doctor = body('spec/commands/doctor.md')
  const at = doctor.search(/^20\. \*\*Expiry readiness/m)
  assert.ok(at !== -1, 'doctor.md lost check 20, so the testExpiry reader is unpinned')
  const check = doctor.slice(at).split(/^21\. /m)[0].replace(/\s+/g, ' ')
  assert.ok(check.includes('policy.testExpiry') && check.includes('⚠️ test expiry: disabled by policy'),
    'doctor check 20 does not print the disabled-by-policy line, so an off host still runs both dry runs every doctor')
})

// specs/20261103/04-predictable-stops-become-host-policy.md D12 (AC-20261103-04-17): every policy.stops key has a prose reader naming it.
test('AC-20261103-04-17: core, fanout, stage-build, stage-review and init each name the policy.stops keys they read, and the retired standing and PREFLIGHT wording is gone', () => {
  const sliceOf = (rel, re, level) => section(body(rel), re, level)
  const has = (text, lit) => phrase(lit).test(text)
  const core = sliceOf('spec/doctrine/core.md', /^## Delegated Stops/, 2)
  assert.ok(has(core, 'by: user') && !has(core, 'by: standing'),
    'core § Delegated Stops must keep by: user only, or a worker is told a standing writer still exists')
  assert.ok(has(core, 'policy.stops'), 'core § Delegated Stops must name policy.stops, or a lane has no rule for a stop the host answered')
  const fanout = body('spec/commands/fanout.md')
  assert.ok(has(sliceOf('spec/commands/fanout.md', /^## Input/, 2), '--ask'), 'fanout § Input must name --ask, or the per-run override is undiscoverable')
  assert.ok(has(sliceOf('spec/commands/fanout.md', /^## Rules/, 2), 'policy.stops'), 'fanout § Rules must name policy.stops in its never-line, or the session answers the stops itself')
  assert.ok(!has(fanout, 'PREFLIGHT'), 'fanout.md must not name the retired PREFLIGHT sheet, or the session waits for a sheet the driver no longer prints')
  const build = sliceOf('spec/doctrine/stages/stage-build.md', /^## Build stage/, 2)
  for (const k of ['policy.stops.redFindings', 'policy.stops.buildEscalate']) {
    assert.ok(has(build, k), 'stage-build § Build stage must name ' + k + ', or the stage prose never mentions the policy that answers the stop')
  }
  const protocol = sliceOf('spec/doctrine/stages/stage-review.md', /^## Protocol/, 2)
  for (const k of ['policy.stops.repairRound', 'policy.stops.reviewEscalate', 'abandon and queue /spec:fix (Recommended)']) {
    assert.ok(has(protocol, k), 'stage-review § Protocol must name ' + k + ', or the review prose disagrees with the driver')
  }
  assert.ok(has(sliceOf('spec/doctrine/stages/stage-review.md', /^## Rules/, 2), 'policy.stops.prototypeClose'),
    'stage-review § Rules must name policy.stops.prototypeClose in the MERGE bullet, or the prototype stop has no prose reader')
  const init = sliceOf('spec/commands/init.md', /^### Policy round 2/, 3)
  assert.ok(has(init, 'policy.stops') && has(init, 'never asked'),
    'init Policy round 2 must say policy.stops is written with defaults and never asked, or init is read as asking a ninth question')
})
