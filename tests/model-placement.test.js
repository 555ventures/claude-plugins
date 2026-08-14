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

// v6.11: fork-bound consults produce decision briefs — the retainer frames the fork, the
// user decides it. Pinned so a doctrine edit can't quietly let the retainer absorb forks
// (scope drift by another name) or drop the anchoring guards (citations, could-not-verify).

test('build.md: fork-bound consults yield decision briefs, never decisions', () => {
  const build = read('commands/build.md')
  assert.match(build, /decision brief, never a decision/)
  assert.match(build, /`path:line` citations for every factual claim/,
    'the citation requirement is the anchoring guard — it may not be dropped')
  assert.match(build, /naming what you could not verify/)
  assert.match(build, /the decision is the user's/)
  assert.match(build, /paths, not contents/,
    'follow-up consults pass the delta and paths; pasted file bodies break cache + go stale')
})

test('shared.md: escalation contract has six triggers incl. tdd-red-check; brief rule stated', () => {
  const shared = read('doctrine/shared.md')
  assert.match(shared, /These six are the entire contract/)
  assert.match(shared, /tests pass before implementation \(`tdd-red-check`\)/)
  assert.match(shared, /decision brief, never a decision/)
  assert.match(shared, /never absorbs them/,
    'the retainer frames forks; architecture/scope changes stay user-visible decisions')
})

test('review surfaces: reviewers/verifiers are cross-model — never Fable', () => {
  const review = read('commands/review.md')
  assert.match(review, /Orchestrator: Sonnet/)
  assert.match(review, /never Fable/)
  const wf = read('workflows/wf-review.js')
  assert.doesNotMatch(wf, /model: 'fable'/, 'no workflow review agent may run on the planning model')
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

// 2026-08-07 spec 05-explore-taste-channels: the amateur-tiles incident — Fable's taste
// reached Sonnet builders only through a 3-ingredient prose brief, and the one high-bandwidth
// channel (render critique) was conditional on browser availability in the round the look is
// born. AC-20260807-05-1..7 pin the fix: tokens-as-code authorship, a mandatory-field
// positions template, and an unconditional Round 0 critique loop with a git-diff-backed
// never-alter carrier.

test('AC-20260807-05-1: genesis-explore.md states the session authors starter tokens.css before fan-out and builders never change an authored value', () => {
  const explore = read('commands/genesis-explore.md')
  assert.match(explore, /starter/i,
    'the starter tokens.css authorship step must be documented or the taste-transfer channel silently reverts to builder-authored tokens')
  assert.match(explore, /never change an authored/i,
    'the builder never-alter constraint must be stated verbatim or Sonnet builders may silently overwrite session-authored taste')
})

test('AC-20260807-05-2: genesis-explore.md Phase 2 drops the browser-availability conditional and runs an unconditional render-screenshot-critique leg', () => {
  const explore = read('commands/genesis-explore.md')
  assert.doesNotMatch(explore, /when a browser is\s+available/i,
    'Round 0 critique must never be conditional on browser availability — that conditional is exactly what let amateur tiles through ungated')
  assert.match(explore, /render.*screenshot.*critique|screenshot.*render.*critique/is,
    'an unconditional render, screenshot, and critique leg must be documented for every Round 0 tile')
})

// specs/20260813/10-host-capabilities.md D5: this pin's SUBSTANCE survives (the hard STOP on
// absent render/screenshot capability stays hard) but its TRIGGER wording is retagged from
// enumerated tool names to capability shape — enumerated names silently exclude an equivalent
// capture tool. Chrome/Playwright now belong only in the remedy text, not the trigger condition.

test('AC-20260813-10-10 (retag of AC-20260807-05-3): genesis-explore.md Setup declares a capability-shaped hard STOP on absent scriptable browser-capture capability, remedy names Chrome/Playwright', () => {
  const explore = read('commands/genesis-explore.md')
  assert.match(explore, /no scriptable browser-capture capability/i,
    'the Setup precondition\'s TRIGGER must be capability-shaped ("no scriptable browser-capture capability"), not name Chrome/Playwright as the condition itself — enumerated tool names silently exclude an equivalent capture tool (D5)')
  assert.match(explore, /STOP/,
    'absence of a capture capability must still produce a hard STOP, not a silent degrade — the pinned hardness must survive the D5 retag')
  assert.match(explore, /Chrome/i,
    'the remedy text must still name Chrome (Claude-in-Chrome) as a satisfying capability')
  assert.match(explore, /Playwright/i,
    'the remedy text must still name Playwright MCP as a satisfying capability')
})

test('AC-20260807-05-4: spec/templates/design-positions.md carries all seven mandatory per-position field labels', () => {
  const templatePath = path.join(SPEC, 'templates/design-positions.md')
  assert.ok(fs.existsSync(templatePath),
    'spec/templates/design-positions.md must exist — the position-brief mandatory-field contract has no template to author from otherwise')
  const template = fs.readFileSync(templatePath, 'utf8')
  for (const label of [
    '**Stance:**',
    '**Rules cited:**',
    '**Anti-defaults:**',
    '**Reference direction:**',
    '**Motion character:**',
    '**Density & layout intent:**',
    '**Starter tokens:**',
  ]) {
    assert.ok(template.includes(label),
      `design-positions.md must contain the literal field label "${label}" or a position brief can omit a mandatory execution-level field`)
  }
})

test('AC-20260807-05-5 (regression pin): genesis-explore.md Rules continue to state the session writes no candidate HTML', () => {
  const explore = read('commands/genesis-explore.md')
  assert.match(explore, /The session writes no candidate HTML/,
    'this rule predates the spec and must survive the D1/D2 changes — the session gains tokens.css authorship, never HTML authorship')
})

test('AC-20260807-05-6: genesis.md Explore Stage names the session as author of position briefs and starter tokens.css, Sonnet as builder of tile/prototype HTML', () => {
  const genesis = read('doctrine/genesis.md')
  assert.match(genesis, /starter/i,
    'genesis.md § Genesis: Explore Stage must name the session as author of starter tokens.css or the D1/D2 model-placement amendment is undocumented at the doctrine layer')
  assert.match(genesis, /Sonnet builds every tile/i,
    'genesis.md must continue to name Sonnet as builder of every tile/prototype HTML — the model-placement split must stay explicit after the tokens.css amendment')
})

test('AC-20260807-05-7: genesis-explore.md Phase 2 requires the pre-fan-out commit of starter tokens and an additions-only git diff check', () => {
  const explore = read('commands/genesis-explore.md')
  assert.match(explore, /additions only/i,
    'the D8 additions-only diff requirement must be stated verbatim or the never-alter rule (AC-1) has no deterministic carrier')
  assert.match(explore, /git diff/i,
    'the D8 mechanism (git diff against the positions-authored commit) must be documented — without it the never-alter rule is unenforced prose')
})
