'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { SPEC, tmpdir, gitRepo } = require('./helpers')

const read = (p) => fs.readFileSync(path.join(SPEC, p), 'utf8')

// The run ledger is ONE repo-wide file (.claude/spec-runs.jsonl), never per-spec files in
// specs/ — pinned after the clutter objection that shaped the design. This file pins the
// behavioral core: row-shape derivation is pinned by execution in
// tests/review/verdict.test.js, not by regexing command prose.

const LEDGER = '.claude/spec-runs.jsonl'

// specs/20260823/01-release-legs.md AC-20260823-01-20 [pre-green: predicate-in-test]: the
// release.md leg of this pin (the file already matches .claude/spec-runs.jsonl) is a SHALL-
// CONTINUE-TO carrier through the release-legs.js rewrite (D11) — tagged here rather than
// restated, since the assertion below already exercises exactly this file.
// specs/20260912/03-run-isolates-and-owns-the-stages.md AC-20260912-03-6: build.md's and
// review.md's bodies move to spec/doctrine/stages/stage-{build,review}.md — repointed in place.
test('AC-20260820-07-13 / AC-20260823-01-20: build, review, escape, and release all append to the single repo-wide ledger', () => {
  for (const f of ['doctrine/stages/stage-build.md', 'doctrine/stages/stage-review.md', 'commands/escape.md', 'commands/release.md']) {
    assert.match(read(f), new RegExp(LEDGER.replace(/[./]/g, '\\$&')),
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

// specs/20260820/07-review-driver.md D7 (AC-20260820-07-13): review.md shrinks to a thin
// shell around spec-review-driver.js — these standing pins on its verdict-derivation
// sentences are kept verbatim through that rewrite (load-bearing regression carriers, per
// D7's own rationale), so they are tagged with the new AC-ID here rather than restated.
test('AC-20260820-07-13: review never hand-writes the verdict word — verdict.js is the sole derivation', () => {
  const review = read('doctrine/stages/stage-review.md')
  assert.match(review, /derived by `verdict\.js`, never asserted in prose/,
    'review.md must state that the verdict word is script-derived — the 2026-08-05 incident ' +
    'was a CLEAN printed with nothing executed')
  assert.match(review, /Never hand-write the word/,
    'the ledger row must be the verbatim verdict.js --ledger line, never hand-assembled')
})

// specs/20260822/02-init-generation-script.md D12: init-gen.js (D1/D2) is the sole writer of
// the gitattributes union line, and the behavioral test in tests/init-gen/generate.test.js
// (generate -> .gitattributes contains the line, idempotently) is the pin's home — never a
// regex over init.md prose (§ Test Rules) once an executable oracle exists; the merge-mechanics
// test below is unchanged.

test('union driver resolves concurrent worktree appends under squash merge', () => {
  const root = fs.realpathSync(tmpdir('ledger'))
  gitRepo(root)
  const git = (...a) => spawnSync('git', a, { cwd: root, encoding: 'utf8' })
  const ledger = path.join(root, '.claude/spec-runs.jsonl')
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.gitattributes'), '.claude/spec-runs.jsonl merge=union\n')
  fs.writeFileSync(ledger, '{"spec":"base"}\n')
  git('add', '-A'); git('commit', '-qm', 'base')
  const main = git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim()
  git('checkout', '-qb', 'specB')
  fs.appendFileSync(ledger, '{"spec":"b"}\n')
  git('commit', '-qam', 'b')
  git('checkout', '-q', main)
  fs.appendFileSync(ledger, '{"spec":"c"}\n')
  git('commit', '-qam', 'c')
  const merge = git('merge', '--squash', 'specB')
  assert.strictEqual(merge.status, 0, merge.stderr)
  const lines = fs.readFileSync(ledger, 'utf8').trim().split('\n')
  assert.deepStrictEqual(lines.sort(), ['{"spec":"b"}', '{"spec":"base"}', '{"spec":"c"}'])
})

// specs/20260821/02-replay-review-phase.md D1-D5: the reviewer-replay harness is advisory —
// review's CLEAN close must not merely PRINT that a replay is due while nothing runs it.
// Execution moves into the review driver's own REPLAY state (D1-D3); review.md gains the
// judgment step that executes
// replay.md's phases (D4) and core § Feedback Loop records who executes the cadence (D5). Both
// pins normalize whitespace first: these files hard-wrap at ~90 columns, so a load-bearing
// sentence is split across lines and a contiguous-text regex would be red for a reason no diff
// review surfaces (the host Gotchas record exactly that class).
const squash = (s) => s.replace(/\s+/g, ' ')

test('AC-20260821-02-8 / AC-20260913-09-10: stage-review.md carries no REPLAY token and no replay-recorded mention — D5 deletes the "parks at REPLAY" sentence and the due-replay Rules bullet', () => {
  const review = squash(read('doctrine/stages/stage-review.md'))
  assert.doesNotMatch(review, /REPLAY/,
    'D5: stage-review.md must lose every mention of the REPLAY token — D1 deletes the state from ' +
    'the driver, and doctrine that still names a state the driver no longer has sends the next ' +
    'session to look for a step that never prints: ' + review)
  assert.doesNotMatch(review, /replay-recorded/,
    'D5: stage-review.md must lose the replay-recorded mark reference alongside the REPLAY state ' +
    'it belonged to — the mark itself is deleted from the driver by D1: ' + review)

  const replayCmd = squash(read('commands/replay.md'))
  assert.match(replayCmd, /One entry point/,
    'D5: replay.md\'s "Two entry points, one executor" paragraph must become "One entry point" — ' +
    'the driver no longer invokes Phases 1-5 itself, so /spec:replay is the only entry point left: ' + replayCmd)
})

test('AC-20260821-02-9 / AC-20260913-09-10: core § Feedback Loop states the cadence is replay.js --due policy executed on demand by /spec:replay, names the dashboard footer\'s "replay due" clause as where dueness is seen, and cites docs/adr/0025 for the retirement of the blocking form', () => {
  const core = read('doctrine/core.md')
  const section = squash(core.slice(core.indexOf('## Feedback Loop'), core.indexOf('## Incident Policy')))
  assert.ok(section.length > 0, 'setup: core.md must still carry a § Feedback Loop section ahead of § Incident Policy')
  assert.match(section, /replay\.js --due/,
    'D5: the cadence itself is unchanged and must stay stated as replay.js --due policy, never a ' +
    'session\'s memory: ' + section)
  assert.match(section, /\/spec:replay/,
    'D5: § Feedback Loop must name /spec:replay as the executor, run on demand — the review ' +
    'driver never parks a close any more: ' + section)
  assert.match(section, /replay due/,
    'D5: § Feedback Loop must name the dashboard footer\'s "replay due" clause as where dueness ' +
    'is seen now that the driver no longer parks a close on it: ' + section)
  assert.match(section, /docs\/adr\/0025/,
    'D5/D6: § Feedback Loop must cite docs/adr/0025 as the record of the blocking form\'s ' +
    'retirement — a reversal of a measured ruling must be findable from the doctrine it changed: ' + section)
})

// specs/20260821/02-replay-review-phase.md D10: core § Feedback Loop states the pipeline
// improves "through artifacts — never through anyone's memory" and enumerates carriers that are
// each either derived or passed through a review disposition. `.claude/agent-memory/` was the
// one carrier with none: written by dispatched workers, it shapes future worker behaviour before
// any gate can observe the effect and outlives the session that wrote it — a false memory can
// attribute one session's own edits to a phantom sibling worker and go unexamined until a later
// consult finds it. The disposition step is the whole fix: no memory-review gate, no write hook,
// no lint (unearned under core § Incident Policy at recurrence count 1).
//
// `memory-sweep.js` (specs/20260823/06-prose-debt-pruning.md D13) widens the disposition trigger
// from "the diff touched the note file" to "the diff touched what the note is about", plus a TTL
// of 10 undisposed review closes. It is still not a gate, hook, or lint: it exits 0 with or
// without findings and nothing feeds verdict.js. The duty pinned below is unchanged — this spec
// widened who lands on the disposition desk, never what disposition means.

test('AC-20260821-02-10 / AC-20260823-06-9: agent memory is a disposed artifact, never a silent improvement carrier — review.md\'s close gives every touched memory file one stated fate, and core § Feedback Loop says why', () => {
  const review = squash(read('doctrine/stages/stage-review.md'))
  assert.match(review, /agent-memory/,
    'review.md\'s close step must name .claude/agent-memory/ as something the session disposes — ' +
    'a memory file nobody adjudicates rides the spec\'s own commit into every future session and ' +
    'starts steering workers before any gate can see the effect')
  assert.match(review, /carry, correct, or delete/,
    'the close step must state the three fates explicitly: a disposition rule with no enumerated ' +
    'outcomes collapses back into "leave it alone", which is the behaviour that shipped a false ' +
    'memory in this very build')
  assert.doesNotMatch(review, /§ Feedback Loop/,
    'review.md must state this duty OPERATIONALLY, never by citing § Feedback Loop — `spec-paths ' +
    'shared-for review` does not serve that section, so a citation would point the executing ' +
    'session at text it never receives')

  const core = read('doctrine/core.md')
  const section = squash(core.slice(core.indexOf('## Feedback Loop'), core.indexOf('## Incident Policy')))
  assert.match(section, /agent-memory/,
    '§ Feedback Loop enumerates the pipeline\'s improvement carriers; leaving agent memory out of ' +
    'that enumeration while it demonstrably steers workers is the contract contradiction D10 closes')
  assert.match(section, /not (a|an) .{0,40}carrier|never a carrier|is not one of these carriers/,
    '§ Feedback Loop must say agent memory is NOT a carrier — the doctrine\'s own claim that the ' +
    'pipeline never improves through anyone\'s memory is false while an undisposed memory directory ' +
    'exists, and stating the exclusion is what makes the disposition duty follow')
  assert.match(section, /dispos/,
    '§ Feedback Loop must name the disposition at review close as the mechanism that keeps agent ' +
    'memory from becoming a carrier by default')
})
