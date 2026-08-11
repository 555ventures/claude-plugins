'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read, evalFns } = require('../helpers')

// 2026-08-10 specs/20260810/06-ratchet-enforcers.md — the reserved category taxonomy is
// duplicated across four homes (grounding-contract.md canonical, enforce.md, doctor.md prose,
// wf-enforce.body.js CATEGORIES) with no test pinning them in sync (verified by grep — A4).
// This spec grows the taxonomy by two ratchet-mode categories, `duplication` and `cycle`, and
// this file is the first pin on the 4-way sync plus the new ratchet doctrine prose. AC-IDs:
// AC-20260810-06-1 (enum sync), AC-20260810-06-2/AC-20260810-06-5 (validateCells extraction),
// AC-20260810-06-3 (ratchet doctrine text), AC-20260810-06-4 (Phase 5 gap-hunt class).

const EXPECTED_CATEGORIES = [
  'module-boundary', 'naming', 'forbidden-symbol', 'structural-pattern',
  'datetime', 'schema-validation', 'format', 'duplication', 'cycle',
]

// AC-20260810-06-1: the reserved category enum must be byte-identical (as a member set) across
// all four homes, and the member list must be exactly the nine categories including the two new
// ratchet ones.
test('AC-20260810-06-1: the reserved category taxonomy includes duplication and cycle identically across all four homes', () => {
  const wfSrc = read('spec/workflows/src/wf-enforce.body.js')
  const catMatch = wfSrc.match(/const CATEGORIES = \[([\s\S]*?)\]/)
  assert.ok(catMatch, 'wf-enforce.body.js must declare a CATEGORIES array — without it there is ' +
    'no reference list to reconcile the other three prose homes against')
  const wfCategories = catMatch[1]
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.replace(/^['"]|['"]$/g, ''))
  const wfSet = new Set(wfCategories)
  assert.deepStrictEqual(
    [...wfSet].sort(),
    [...EXPECTED_CATEGORIES].sort(),
    'wf-enforce.body.js CATEGORIES must be exactly the nine reserved categories (including the ' +
    'new duplication and cycle ratchet categories) — a drifted array silently accepts or rejects ' +
    'the wrong cells at classify time'
  )

  const contract = read('spec/templates/grounding-contract.md')
  for (const cat of EXPECTED_CATEGORIES) {
    assert.match(contract, new RegExp('\\b' + cat + '\\b'),
      `grounding-contract.md's reserved taxonomy sentence must list '${cat}' — it is the ` +
      'canonical home stamped into every host contract-hash; missing it means every host ' +
      'grounds against a taxonomy that omits the new ratchet category')
  }

  const enforceMd = read('spec/commands/enforce.md')
  for (const cat of EXPECTED_CATEGORIES) {
    assert.match(enforceMd, new RegExp('\\b' + cat + '\\b'),
      `enforce.md's operational taxonomy copy must list '${cat}' — the command's own copy ` +
      'drifting from the contract means the interactive classify phase never offers the category')
  }

  const doctorMd = read('spec/commands/doctor.md')
  for (const cat of EXPECTED_CATEGORIES) {
    assert.match(doctorMd, new RegExp('\\b' + cat + '\\b'),
      `doctor.md's enum restatement must list '${cat}' — doctor's drift check compares a host's ` +
      'wired categories against this restatement, so a missing category makes doctor unable to ' +
      'recognize a correctly-wired duplication/cycle enforcer as valid')
  }
})

// AC-20260810-06-2 / AC-20260810-06-5: wf-enforce.body.js must extract the inline cell-validation
// filter into a pure, named, top-level `validateCells(cells, categories, log)` function so
// extractFn/evalFns (which only match named top-level functions and evaluate without module
// scope) can reach it. It must accept both pre-existing categories (AC-5, e.g.
// `module-boundary`) and the two new ratchet categories (AC-2, `duplication` and `cycle`).
test('AC-20260810-06-2: validateCells accepts a cell whose category is duplication or cycle', () => {
  const src = read('spec/workflows/src/wf-enforce.body.js')
  const { validateCells } = evalFns(src, ['validateCells'])

  const dupResult = validateCells(
    [{ id: 'js:duplication', stack: 'js', category: 'duplication' }],
    EXPECTED_CATEGORIES,
    () => {}
  )
  assert.ok(
    dupResult.accepted.some(c => c.id === 'js:duplication'),
    'validateCells must accept a duplication-category cell into `accepted` — rejecting it means ' +
    'every host classifying a duplication rule silently loses the cell before research ever runs'
  )
  assert.ok(
    !dupResult.skipped.some(c => c.id === 'js:duplication'),
    'a duplication-category cell must not land in `skipped` with reason unknown-category — the ' +
    'category was just added to the reserved set, so treating it as unknown would defeat this spec'
  )

  const cycleResult = validateCells(
    [{ id: 'js:cycle', stack: 'js', category: 'cycle' }],
    EXPECTED_CATEGORIES,
    () => {}
  )
  assert.ok(
    cycleResult.accepted.some(c => c.id === 'js:cycle'),
    'validateCells must accept a cycle-category cell into `accepted` — rejecting it means every ' +
    'host classifying a cycle rule silently loses the cell before research ever runs'
  )
  assert.ok(
    !cycleResult.skipped.some(c => c.id === 'js:cycle'),
    'a cycle-category cell must not land in `skipped` with reason unknown-category — the category ' +
    'was just added to the reserved set, so treating it as unknown would defeat this spec'
  )
})

test('AC-20260810-06-5: validateCells continues to accept a cell with a pre-existing category such as module-boundary', () => {
  const src = read('spec/workflows/src/wf-enforce.body.js')
  const { validateCells } = evalFns(src, ['validateCells'])

  const result = validateCells(
    [{ id: 'js:module-boundary', stack: 'js', category: 'module-boundary' }],
    EXPECTED_CATEGORIES,
    () => {}
  )
  assert.ok(
    result.accepted.some(c => c.id === 'js:module-boundary'),
    'validateCells must still accept a pre-existing category (module-boundary) into `accepted` — ' +
    'this behavior predates the spec and the mechanical extraction into a named top-level ' +
    'function must not change it'
  )
  assert.ok(
    !result.skipped.some(c => c.id === 'js:module-boundary'),
    'a module-boundary cell must not be skipped as unknown-category — a regression here means the ' +
    'extraction silently narrowed the accepted category set for every existing host'
  )
})

// AC-20260810-06-3: enforce.md must carry the ratchet doctrine — a verify-phase requirement that
// ratchet-category candidates support a baseline/known-violations mode, a Phase 4 rule that the
// baseline is established once and recorded as `baseline` with `path`/`establishCmd`, gate wiring
// in no-new-violations form, and the disambiguation clause separating the ratchet baseline from
// the pre-existing baselineRun write-mode carve-out.
test('AC-20260810-06-3: enforce.md documents the ratchet verify requirement, the baseline manifest field, no-new-violations wiring, and the baselineRun disambiguation', () => {
  const md = read('spec/commands/enforce.md')

  assert.match(md, /baseline[\s\S]{0,200}?known-violations|known-violations[\s\S]{0,200}?baseline/i,
    'enforce.md must state the verify-phase requirement that ratchet-category candidates support ' +
    'a baseline / known-violations mode — without this text a worker or host has no doctrine ' +
    'telling them a candidate lacking that capability fails verify for duplication/cycle'
  )

  assert.match(md, /establishCmd/,
    'enforce.md must name the `establishCmd` manifest field recorded at Phase 4 wiring — without ' +
    'it a host has no documented way to know what command snapshots the ratchet baseline once'
  )

  assert.match(md, /no-new-violations/i,
    'enforce.md must document the gate invocation running in no-new-violations form for ratchet ' +
    'categories — omitting this leaves the gate wiring ambiguous between full-scan and ratchet mode'
  )

  assert.match(md, /ratchet baseline/i,
    'enforce.md must use the phrase "ratchet baseline" to name the new snapshot concept — the ' +
    'spec requires this exact term to disambiguate it in prose from the pre-existing baselineRun'
  )

  assert.match(md, /distinct from the (?:existing )?(?:ratchet )?baseline(?: pass)? snapshot|distinct from the ratchet baseline/i,
    'enforce.md must carry the disambiguating clause stating the write-mode baselineRun carve-out ' +
    'is distinct from the new ratchet baseline snapshot — without it a worker or host can conflate ' +
    'the never-edit-application-source baselineRun pass with the new quarantine-only mechanism'
  )
})

// AC-20260810-06-4: enforce.md's Phase 5 (create missing rules — propose, never auto-author) must
// name architecture-smell gaps (duplication/cycle rules absent from the host's rule surface) as
// an explicit class of gap to propose.
test('AC-20260810-06-4: enforce.md Phase 5 names architecture-smell gaps (duplication/cycle) as a propose-only gap class', () => {
  const md = read('spec/commands/enforce.md')
  const phase5Match = md.match(/## Phase 5 — Create missing rules[\s\S]*?(?=\n## Phase 6|$)/)
  assert.ok(phase5Match, 'enforce.md must have a Phase 5 section — without it there is no home ' +
    'for the architecture-smell gap-hunt class this AC requires')
  const phase5 = phase5Match[0]

  assert.match(phase5, /architecture[- ]smell/i,
    'enforce.md Phase 5 must name "architecture-smell" gaps as an explicit class to propose — ' +
    'without this a host with no written duplication/cycle rule has no doctrine directing the ' +
    'gap-hunt to surface one via AskUserQuestion rather than silently skipping the category'
  )

  assert.match(phase5, /duplication[\s\S]{0,80}?cycle|cycle[\s\S]{0,80}?duplication/i,
    'enforce.md Phase 5 must reference both duplication and cycle in the architecture-smell gap ' +
    'class — naming only one leaves the other category permanently unproposable on a host with ' +
    'no written rule for it'
  )
})
