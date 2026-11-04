'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC } = require('./helpers')

const read = (p) => fs.readFileSync(path.join(SPEC, p), 'utf8')

// The run ledger is ONE repo-wide file (.claude/spec-runs.jsonl), never per-spec files in
// specs/ — pinned after the clutter objection that shaped the design. This file pins the
// behavioral core: row-shape derivation is pinned by execution in
// tests/review/verdict.test.js, not by matching command prose.

const LEDGER = '.claude/spec-runs.jsonl'

// specs/20260823/01-release-legs.md AC-20260823-01-20 [pre-green: predicate-in-test]: the
// release.md leg of this pin (the file already matches .claude/spec-runs.jsonl) is a SHALL-
// CONTINUE-TO carrier through the release-legs.js rewrite (D11) — tagged here rather than
// restated, since the assertion below already exercises exactly this file.
// specs/20260912/03-run-isolates-and-owns-the-stages.md AC-20260912-03-6: build.md's and
// review.md's bodies move to spec/doctrine/stages/stage-{build,review}.md — repointed in place.
test('AC-20261025-01-11 / AC-20260820-07-13 / AC-20260823-01-20: build, review, commit (the escape row), and release all append to the single repo-wide ledger', () => {
  const readGit = (p) => fs.readFileSync(path.join(SPEC, '..', p), 'utf8')
  for (const [f, src] of [
    ['doctrine/stages/stage-build.md', read('doctrine/stages/stage-build.md')],
    ['doctrine/stages/stage-review.md', read('doctrine/stages/stage-review.md')],
    ['git/commands/commit.md', readGit('git/commands/commit.md')],
    ['commands/release.md', read('commands/release.md')],
  ]) {
    assert.match(src, new RegExp(LEDGER.replace(/[./]/g, '\\$&')),
      `${f} must reference ${LEDGER} — a stage that stops writing ledger rows silently drops ` +
      'out of the durable cost/verdict history')
  }
})

test('no per-spec ledger files: nothing instructs writing runs files under specs/', () => {
  for (const f of fs.readdirSync(path.join(SPEC, 'commands'))) {
    if (!f.endsWith('.md')) continue
    assert.doesNotMatch(read(path.join('commands', f)), /specs\/[^\s`]*\.runs\./,
      `commands/${f} must not create per-spec run files`)
  }
})

// Doctrine hard-wraps, so prose pins compare whitespace-squashed text.
const squash = (s) => s.replace(/\s+/g, ' ')

// Kept while specs/20261024/05-replay-retired.md AC-20261024-05-12 names this test as its carrier.
test('AC-20260821-02-8 / AC-20260913-09-10 / AC-20261024-05-12: stage-review.md carries no REPLAY token and no replay-recorded mention — D5 deletes the "parks at REPLAY" sentence and the due-replay Rules bullet', () => {
  const review = squash(read('doctrine/stages/stage-review.md'))
  assert.doesNotMatch(review, /REPLAY/,
    'D5: stage-review.md must lose every mention of the REPLAY token — D1 deletes the state from ' +
    'the driver, and doctrine that still names a state the driver no longer has sends the next ' +
    'session to look for a step that never prints: ' + review)
  assert.doesNotMatch(review, /replay-recorded/,
    'D5: stage-review.md must lose the replay-recorded mark reference alongside the REPLAY state ' +
    'it belonged to — the mark itself is deleted from the driver by D1: ' + review)
})

// specs/20260821/02-replay-review-phase.md D10: agent memory is disposed at review close.
test('AC-20260821-02-10 / AC-20260823-06-9: agent memory is a disposed artifact, never a silent improvement carrier — review.md\'s close gives every touched memory file one stated fate, and core § Feedback Loop says why', () => {
  const review = squash(read('doctrine/stages/stage-review.md'))
  assert.match(review, /agent-memory/,
    'review.md\'s close step must name .claude/agent-memory/ as something the session disposes — ' +
    'a memory file nobody adjudicates rides the spec\'s own commit into every future session and ' +
    'starts steering workers before any gate can see the effect')
  assert.doesNotMatch(review, /§ Feedback Loop/,
    'review.md must state this duty OPERATIONALLY, never by citing § Feedback Loop — `spec-paths ' +
    'shared-for review` does not serve that section, so a citation would point the executing ' +
    'session at text it never receives')

  const core = read('doctrine/core.md')
  const section = squash(core.slice(core.indexOf('## Feedback Loop'), core.indexOf('## Incident Policy')))
  assert.match(section, /agent-memory/,
    '§ Feedback Loop enumerates the pipeline\'s improvement carriers; leaving agent memory out of ' +
    'that enumeration while it demonstrably steers workers is the contract contradiction D10 closes')
})
