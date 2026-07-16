'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC } = require('./helpers')

const read = (p) => fs.readFileSync(path.join(SPEC, p), 'utf8')

// Model policy (v5): the expensive model authors the contract; cheap models execute it
// behind deterministic gates; the expensive model is consulted, not resident. Build runs on
// a Sonnet orchestrator with a Fable retainer (Opus fallback) consulted on surprises only —
// the mandatory T3 checkpoint ritual is retired (ledger: 100% PASS across every measured
// run; see doctrine/scaffold-ledger.md). Reviewers and verifiers stay cross-model from the
// planning author: Sonnet, never Fable. Pinned here so a doctrine edit can't silently
// reintroduce a resident expensive model or a same-model reviewer.

test('build.md: Sonnet orchestrates; retainer is Fable with Opus fallback, consult-on-surprise', () => {
  const build = read('commands/build.md')
  assert.match(build, /orchestrator model: Sonnet/i)
  assert.match(build, /Agent \{model: "fable"\}/)
  assert.match(build, /\{model: "opus"\}/, 'Opus fallback for an unavailable Fable must stay documented')
  assert.doesNotMatch(build, /T3 checkpoint \(mandatory\)/,
    'mandatory T3 checkpoints are retired in v5 — consults are surprise-driven only')
  assert.match(build, /surprise-driven only/i)
})

test('build.md: retainer role brief present with its binding clauses', () => {
  const build = read('commands/build.md')
  assert.match(build, /spec author's proxy/)
  assert.match(build, /never from implementation convenience/)
  assert.match(build, /ESCALATE:/)
  assert.doesNotMatch(build, /a checkpoint\s+is a gate, not a critique/,
    'the checkpoint clause must be gone from the role brief')
})

test('shared.md: unified placement rule; Fable retainer sanctioned; reviewers never Fable', () => {
  const shared = read('doctrine/shared.md')
  assert.match(shared, /expensive model authors the contract/)
  assert.match(shared, /consulted, not resident/)
  assert.match(shared, /Reviewers and verifiers are Sonnet, never Fable/)
  assert.match(shared, /retainer\*?\*? is Fable/i)
  assert.match(shared, /falls back to\s+`\{model: "opus"\}`/, 'Fable→Opus fallback contract stays')
  assert.doesNotMatch(shared, /Never at build time/,
    'the v4 Fable-banned-from-build rule is retired — the retainer seat is Fable now')
  assert.match(shared, /no separate mandatory-checkpoint trigger|no additional mandatory checkpoint/i,
    'the checkpoint retirement must be stated, not just omitted')
  assert.doesNotMatch(shared, /T3 checkpoints apply/,
    'the v4 checkpoint-activation rule may not survive')
})

test('review surfaces: reviewers/verifiers are cross-model — never Fable', () => {
  const review = read('commands/review.md')
  assert.match(review, /Orchestrator: Sonnet/)
  assert.match(review, /never Fable/)
  const wf = read('workflows/wf-review.js')
  assert.doesNotMatch(wf, /model: 'fable'/, 'no workflow review agent may run on the planning model')
})

test('design-brief.md: courier placement — session model, no invented intent, read-only Claude Design', () => {
  const brief = read('commands/design-brief.md')
  assert.match(brief, /the session model — no expensive seat required/i,
    'brief authoring is grounded extraction; taste is spent in Claude Design, not here')
  assert.match(brief, /Every BINDING line is traceable/,
    'an untraceable constraint is invented design intent and belongs in /spec:plan')
  assert.match(brief, /no hex values, px\/spacing numbers/,
    'the Fable-5-reader contract: intent and constraints, never pixel prescriptions')
  assert.match(brief, /never `write_files` \/ `finalize_plan`/,
    'Claude Design stays read-only — the paste is the only write path')
  assert.match(brief, /data-screen-label/,
    'the coordination footer must pin region labels so dc-extract regionRefs line up')
})

// v6 additions: taste is spent at the roadmap level (explore/atlas — Fable seats); /spec:design
// is mock-always with Sonnet resident on roadmap-derived specs; the mock-less Fable-resident
// path is retired. Pinned so a doctrine edit can't silently resurrect it.

test('shared.md v6: roadmap-level design seats are Fable; standalone spec:design is session-model', () => {
  const shared = read('doctrine/shared.md')
  assert.match(shared, /roadmap-level design seats/)
  assert.match(shared, /Standalone `\/spec:design` \(no roadmap\) runs on the session model/)
  assert.doesNotMatch(shared, /Mock-less `\/spec:design` runs on Fable/,
    'the v5 Fable-resident mock-less path is retired — mock-always authors the mock first')
})

test('design.md v6: mock-always — the fork is where the mock comes from, not whether one exists', () => {
  const design = read('commands/design.md')
  assert.match(design, /mock-always/i)
  assert.match(design, /Mock-authoring preamble/)
  assert.match(design, /render→screenshot→critique/i)
  assert.doesNotMatch(design, /Mock-less.*Fable or Opus/s)
})

test('genesis-explore.md: session authors position briefs, Sonnet builds, deterministic gate first', () => {
  const explore = read('commands/genesis-explore.md')
  assert.match(explore, /The session writes no candidate HTML/)
  assert.match(explore, /model: "sonnet"/)
  assert.match(explore, /design-atlas\.js check/)
  assert.match(explore, /Fresh research every project/)
})
