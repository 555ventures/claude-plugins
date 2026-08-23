'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('../helpers')

// specs/20260823/01-release-legs.md (2026-08-23): D10 retires the feedback-brief flush
// everywhere it lives (the /intake consumer died in v7), and D11 shrinks release.md's Phase 2
// preamble to judgment steps only, citing the row grammar to release-legs.js's own header
// comment instead of restating it. Pins AC-20260823-01-15 and -17 (RED against the current,
// un-rewritten release.md/doctor.md — they still carry the feedback-brief flush and hand-
// authored leg-row literals) and AC-20260823-01-18 (a SHALL-CONTINUE-TO carrier that must
// already be green against today's release.md and stay green through the rewrite, per D11's own
// promise that the never-autonomous promote rule survives the shrink).

const squash = (s) => s.replace(/\s+/g, ' ')

test('AC-20260823-01-15: release.md and doctor.md contain no occurrence of feedback-template, spec-feedback, or "feedback brief" post-rewrite', () => {
  const release = read('spec/commands/release.md')
  const doctor = read('spec/commands/doctor.md')
  for (const [name, text] of [['release.md', release], ['doctor.md', doctor]]) {
    assert.doesNotMatch(text, /feedback-template/,
      'D10: ' + name + ' must not reference the retired spec-paths feedback-template key — a ' +
      'surviving reference points at a key that no longer resolves')
    assert.doesNotMatch(text, /spec-feedback/,
      'D10: ' + name + ' must not reference docs/spec-feedback/ — the flush that wrote into it ' +
      'is retired (the /intake consumer died in v7, core § Incident Policy bans intake queues)')
    assert.doesNotMatch(text, /feedback brief/i,
      'D10: ' + name + ' must not describe writing or offering a "feedback brief" — the write-a-' +
      'brief offer is retired; doctor\'s Gotchas roll-up REPORT survives, only the offer dies')
  }
})

test('AC-20260823-01-17: release.md cites spec-paths release-legs for its stage/append/record calls and contains no hand-authored leg-row literal', () => {
  const release = read('spec/commands/release.md')
  const citations = (release.match(/spec-paths release-legs/g) || []).length
  assert.ok(citations >= 3,
    'D11: release.md must cite `spec-paths release-legs` at least once per subcommand it invokes ' +
    '(stage, append, record) — fewer than 3 citations means at least one call site still resolves ' +
    'the script some other way, or was left uncited: found ' + citations)
  assert.doesNotMatch(release, /\{"leg":/,
    'D11: the row grammar\'s home is release-legs.js\'s own header comment now — release.md must ' +
    'carry no hand-authored `{"leg":...}` literal at all, or the doc and the script can silently ' +
    'drift apart the way release.md\'s previous Phase 2 preamble did')
})

test('AC-20260823-01-18: release.md SHALL CONTINUE TO gate promotion behind a fresh per-run AskUserQuestion and SHALL CONTINUE TO state that pushing tags/commits is never the pipeline\'s to do [pre-green: predicate-in-test]', () => {
  const release = squash(read('spec/commands/release.md'))
  assert.match(release, /fresh per-run\s+`AskUserQuestion`/,
    'the never-autonomous promote rule must survive the D11 shrink: promotion runs only behind a ' +
    'fresh per-run AskUserQuestion, never inherited approval from a prior release')
  assert.match(release, /never push commits or tags|theirs to make/,
    'release.md must continue to state that pushing (commits or tags) is never the pipeline\'s to ' +
    'do — losing this sentence would leave nothing stopping a future rewrite from having the ' +
    'pipeline push on the user\'s behalf')
})
