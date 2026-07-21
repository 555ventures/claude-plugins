'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC } = require('./helpers')

// PRAX-20260721-01: roadmap deltas were invisible to /spec:plan unless the brief happened
// to cite them — plan.md Phase 0 read "every delta the brief cites", the delta declared its
// own binding, and nothing derived or checked the backlink. A delta binding 01-app-spine
// carried the security rules for a T3 auth change (OAuth account-linking hazard); brief 01
// cited nothing; the delta was silently skipped. Root cause is the artifact class itself: a
// delta is work living outside the numbered sequence the user actually walks. Research
// corroborates (OpenSpec's own tracker documents silent overwrites and orphaned deltas;
// ADR practice documents "decision drift" — recorded but never applied — with no tooling
// that propagates effects). Fix: kill the side-channel. Post-genesis decisions are ADRs
// with an `Applies to:` list; effects are edited into the named briefs AT DECISION TIME
// (unplanned brief → in-place edit + `Amended by ADR-NNNN` backlink; consumed brief → a
// letter-suffixed successor brief that re-enters the numbered sequence). Doctor audits the
// bidirectional links; a leftover deltas/ dir is a migration flag.

const read = (rel) => fs.readFileSync(path.join(SPEC, rel), 'utf8')

const overview = read('templates/roadmap-overview.md')
const brief = read('templates/roadmap-brief.md')
const adr = read('templates/adr.md')
const plan = read('commands/plan.md')
const sketch = read('commands/sketch.md')
const architect = read('commands/genesis-architect.md')
const atlas = read('commands/atlas.md')
const doctor = read('commands/doctor.md')
const genesis = read('doctrine/genesis.md')
const shared = read('doctrine/shared.md')

test('the roadmap-delta side-channel no longer exists anywhere doctrine can route work to', () => {
  // doctor.md is the one sanctioned mention (legacy-migration flag) and is excluded.
  const surfaces = { overview, brief, plan, sketch, architect, atlas, genesis, shared }
  for (const [name, text] of Object.entries(surfaces)) {
    assert.ok(!/roadmap\/deltas|deltas\/`|`deltas\/|delta in deltas|deltas in `|as deltas/.test(text),
      name + ' still routes amendments to a deltas/ side-channel — work parked there is ' +
      'invisible to the numbered sequence the user walks')
  }
  assert.ok(!/every delta the brief/.test(plan),
    'plan.md Phase 0 still relies on the brief citing its own amendments — the exact ' +
    'silent-skip that shipped an unread OAuth account-linking rule set')
})

test('ADR template carries the amendment contract (Applies to + propagation at decision time)', () => {
  assert.match(adr, /Applies\s+to/,
    'no Applies-to section: an amendment ADR has nowhere to name the briefs it touches')
  assert.match(adr, /Amended\s+by\s+ADR/,
    'the template must state the backlink each amended brief receives')
  assert.match(adr, /same\s+session|decision\s+time/i,
    'propagation must be bound to the moment the ADR is written — a pointer left for ' +
    'later is the documented decision-drift failure')
  assert.match(adr, /suffix/i,
    'the consumed-brief case (letter-suffixed successor brief) must be in the contract')
})

test('roadmap-overview template states the single-queue amendment rule', () => {
  assert.match(overview, /Applies\s+to/, 'overview must name the ADR Applies-to mechanism')
  assert.match(overview, /Amended\s+by\s+ADR/, 'overview must name the brief-side backlink')
  assert.match(overview, /suffix/i,
    'overview must give the post-ship route: a letter-suffixed brief re-entering the sequence')
  assert.match(overview, /only\s+to-do\s+list|no amendment may live outside/i,
    'the invariant itself must be stated: the numbered sequence is the only work queue')
})

test('roadmap-brief template: backlink convention in Grounding, no hand-maintained delta slot', () => {
  assert.match(brief, /Amended\s+by\s+ADR/,
    'Grounding must document the Amended-by line amendments write into the brief')
  assert.ok(!/delta/i.test(brief),
    'the brief template still references deltas — the hand-maintained backlink slot was ' +
    'the mechanism nothing derived or checked')
})

test('plan Phase 0 derives amendments from the brief + warns on unpropagated ADRs', () => {
  assert.match(plan, /Amended\s+by\s+ADR/,
    'Phase 0 must read the ADRs behind the brief\'s Amended-by lines')
  assert.match(plan, /Applies\s+to/,
    'Phase 0 needs the cheap drift net: an ADR whose Applies-to names this brief with no ' +
    'matching Amended-by line means a decision was recorded but never propagated')
})

test('genesis-architect: no deltas/ dir scaffolded; parking-lot promotion is an ADR', () => {
  assert.ok(!/deltas/.test(architect),
    'genesis still scaffolds the deltas/ dir the model retires')
  const parking = architect.slice(architect.indexOf('**parking lot**'))
  assert.match(parking.slice(0, 400), /ADR/,
    'parking-lot promotion must require an amendment ADR, not a planning-session judgment call')
})

test('sketch/atlas/shared triage routes cross-brief scope changes through an amendment ADR', () => {
  for (const [name, text] of Object.entries({ sketch, atlas, shared })) {
    assert.match(text, /amendment\s+ADR/i,
      name + ' triage must route cross-brief/product-shape changes to an amendment ADR')
  }
})

test('doctor audits amendment-link integrity and flags legacy deltas/ dirs', () => {
  assert.match(doctor, /Applies\s+to/, 'doctor must grep the ADR-side link direction')
  assert.match(doctor, /Amended\s+by/, 'doctor must grep the brief-side link direction')
  assert.match(doctor, /roadmap\/deltas/,
    'doctor must flag a leftover deltas/ dir as a migration finding (fold, then delete)')
})
