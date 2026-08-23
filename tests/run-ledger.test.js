'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { SPEC, tmpdir, gitRepo } = require('./helpers')

const read = (p) => fs.readFileSync(path.join(SPEC, p), 'utf8')

// The run ledger is ONE repo-wide file (.claude/spec-runs.jsonl), never per-spec files in
// specs/ — pinned after the clutter objection that shaped the design. v7.0.0 slimmed this
// file to the behavioral core: row-shape derivation is pinned by execution in
// tests/review/verdict.test.js, not by regexing command prose.

const LEDGER = '.claude/spec-runs.jsonl'

// specs/20260823/01-release-legs.md AC-20260823-01-20 [pre-green: predicate-in-test]: the
// release.md leg of this pin (the file already matches .claude/spec-runs.jsonl) is a SHALL-
// CONTINUE-TO carrier through the release-legs.js rewrite (D11) — tagged here rather than
// restated, since the assertion below already exercises exactly this file.
test('AC-20260820-07-13 / AC-20260823-01-20: build, review, escape, and release all append to the single repo-wide ledger', () => {
  for (const f of ['commands/build.md', 'commands/review.md', 'commands/escape.md', 'commands/release.md']) {
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
  const review = read('commands/review.md')
  assert.match(review, /derived by `verdict\.js`, never asserted in prose/,
    'review.md must state that the verdict word is script-derived — the 2026-08-05 incident ' +
    'was a CLEAN printed with nothing executed')
  assert.match(review, /Never hand-write the word/,
    'the ledger row must be the verbatim verdict.js --ledger line, never hand-assembled')
})

// specs/20260822/02-init-generation-script.md D12: the prose pin over init.md this test used to
// carry is retired — init-gen.js (D1/D2) becomes the sole writer of the gitattributes union
// line, and the behavioral test in tests/init-gen/generate.test.js (generate -> .gitattributes
// contains the line, idempotently) is the pin's new home. Regexes over prose are
// not tests (§ Test Rules) once an executable oracle exists; the merge-mechanics test below is
// unchanged.

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

// specs/20260821/02-replay-review-phase.md (2026-08-21, brief 14): the reviewer-replay harness
// was advisory — review's CLEAN close PRINTED that a replay was due and nothing ran it, and this
// repo skipped that reminder through 12+ reviews in ~48 hours. Execution moves into the review
// driver's own REPLAY state (D1-D3); review.md gains the judgment step that executes
// replay.md's phases (D4) and core § Feedback Loop records who executes the cadence (D5). Both
// pins normalize whitespace first: these files hard-wrap at ~90 columns, so a load-bearing
// sentence is split across lines and a contiguous-text regex would be red for a reason no diff
// review surfaces (the host Gotchas record exactly that class).
const squash = (s) => s.replace(/\s+/g, ' ')

test('AC-20260821-02-8: review.md names the driver\'s REPLAY state as what executes a due replay at CLEAN close, via replay.md\'s phases, and no longer carries the retired advisory warn', () => {
  const review = squash(read('commands/review.md'))
  assert.match(review, /REPLAY/,
    'review.md must name the REPLAY state — the shell is where the session learns it owes the ' +
    'measurement before the review can conclude, and a shell silent about it leaves the driver ' +
    'printing a step with no doctrine behind it')
  assert.match(review, /replay\.md/,
    'review.md must point at spec/commands/replay.md as the executor of the phases — restating ' +
    'those phases here instead would fork the one executor into two copies that drift, the ' +
    'collision class this repo\'s Gotchas already record twice')
  assert.match(review, /replay-recorded/,
    'review.md must name the replay-recorded mark the session returns with, or the loop it ' +
    'describes has no way back into the driver')
  assert.doesNotMatch(review, /reviewer replay due/,
    'the retired advisory warn must not survive anywhere in review.md — a printed reminder is ' +
    'the mechanism this spec exists to replace, measured to be skipped through 12+ reviews')
})

test('AC-20260821-02-9: core § Feedback Loop names the driver\'s REPLAY state as the cadence\'s executor and /spec:replay as the manual/retry surface', () => {
  const core = read('doctrine/core.md')
  const section = squash(core.slice(core.indexOf('## Feedback Loop'), core.indexOf('## Incident Policy')))
  assert.ok(section.length > 0, 'setup: core.md must still carry a § Feedback Loop section ahead of § Incident Policy')
  assert.match(section, /REPLAY/,
    '§ Feedback Loop must record that the review driver\'s REPLAY state executes the cadence — ' +
    'doctrine that only states the policy leaves the next session to re-litigate who runs it ' +
    'from memory, which is how the advisory form survived 12+ skipped reviews')
  assert.match(section, /\/spec:replay/,
    '§ Feedback Loop must still name /spec:replay as the manual and retry surface — a ' +
    'non-measurement outcome leaves the harness due and someone has to be told where to retry it')
  assert.match(section, /replay\.js --due/,
    'the cadence itself is unchanged and must stay stated as replay.js --due policy, never a ' +
    'session\'s memory')
})

// specs/20260821/02-replay-review-phase.md D10 (JJ ruling 2026-08-21, after a Fable 5 consult on
// this build's own recorded debts): core § Feedback Loop states the pipeline improves "through
// artifacts — never through anyone's memory" and enumerates carriers that are each either derived
// or passed through a review disposition. `.claude/agent-memory/` was the one carrier with none:
// written by dispatched workers, it shapes future worker behaviour before any gate can observe
// the effect and outlives the session that wrote it. This build proved the gap by shipping a
// false memory — two entries from one incident both attributed the orchestrator's own concurrent
// edits to a phantom sibling worker and concluded the assignment could be stood down from; one
// was deleted, its twin was committed unexamined until the consult found it. The disposition step
// is the whole fix: no memory-review gate, no write hook, no lint (unearned under core § Incident
// Policy at recurrence count 1). PARTIALLY REOPENED 2026-08-23 by specs/20260823/06 D13, on the
// class's second recorded member — a gate-scripts note falsified by the same diff that shipped it,
// caught only because that diff happened to touch the note's own file. `memory-sweep.js` now
// WIDENS the disposition trigger from "the diff touched the note file" to "the diff touched what
// the note is about", plus a TTL of 10 undisposed review closes. It is still not a gate, hook, or
// lint: it exits 0 with or without findings and nothing feeds verdict.js. The duty pinned below is
// unchanged — this spec widened who lands on the disposition desk, never what disposition means.

test('AC-20260821-02-10 / AC-20260823-06-9: agent memory is a disposed artifact, never a silent improvement carrier — review.md\'s close gives every touched memory file one stated fate, and core § Feedback Loop says why', () => {
  const review = squash(read('commands/review.md'))
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
