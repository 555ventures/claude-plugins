'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read, evalFns, checkWorkflowSyntax } = require('../helpers')

// specs/20260825/02-genesis-consultant-discovery.md (2026-08-25): D6 turns
// spec/workflows/wf-research.js's OPTION_SET_SCHEMA top-level const into a named top-level
// function `optionSetSchema()` (evalFns-extractable, per the capOptions precedent already in
// this file) and adds two REQUIRED string option fields — `because` (the coverage keys/answers
// that drove an option's rank) and `priced` (a consequence priced at the brief's stated scale,
// or the literal "n/a — no number in the brief"). The research prompt must instruct the agent to
// read the brief's `## Coverage` section and fill both fields, and genesis-architect.md's menu
// step must name both as description parts (D7).
//
// AC-20260825-02-4 and AC-20260825-02-5 are RED right now: `optionSetSchema` does not exist yet
// (OPTION_SET_SCHEMA is still a bare top-level const, so evalFns can't extract it), and neither
// `because`/`priced` nor `## Coverage` appear anywhere in the research prompt or in
// genesis-architect.md's menu-build step. AC-20260825-02-6 is a D9 `SHALL CONTINUE TO` regression
// pin and is GREEN right now — wf-research.js already parses under checkWorkflowSyntax, and
// capOptions already caps a 6-option menu to 4 while preserving the is_minority option; this
// spec's schema/prompt edit must not break either.

// ---------------------------------------------------------------------------
// AC-20260825-02-4
// ---------------------------------------------------------------------------

test('AC-20260825-02-4: optionSetSchema(), extracted from wf-research.js via evalFns, requires because and priced as string fields on each option', () => {
  const src = read('spec/workflows/wf-research.js')
  const { optionSetSchema } = evalFns(src, ['optionSetSchema'])
  const schema = optionSetSchema()

  const required = schema && schema.properties && schema.properties.options &&
    schema.properties.options.items && schema.properties.options.items.required
  assert.ok(Array.isArray(required),
    'D6: optionSetSchema().properties.options.items.required must be an array — its absence means ' +
    'the option-item schema shape the harness enforces on agent returns is not what D6 describes: ' +
    JSON.stringify(schema))
  assert.ok(required.includes('because'),
    'D6: optionSetSchema()\'s option-item `required` array must include "because" — its absence ' +
    'means the harness would accept an agent-returned option with no stated reason for its rank, ' +
    'exactly the generic-tradeoff-prose defect D6 exists to refuse: ' + JSON.stringify(required))
  assert.ok(required.includes('priced'),
    'D6: optionSetSchema()\'s option-item `required` array must include "priced" — its absence ' +
    'means the harness would accept an agent-returned option with no consequence priced against ' +
    'the brief\'s stated scale: ' + JSON.stringify(required))

  const props = schema.properties.options.items.properties
  assert.strictEqual(props && props.because && props.because.type, 'string',
    'D6: optionSetSchema()\'s `properties.options.items.properties.because` must be declared ' +
    '`type: "string"` — a missing or non-string type means the schema does not actually constrain ' +
    'the field the harness is meant to enforce: ' + JSON.stringify(props && props.because))
  assert.strictEqual(props && props.priced && props.priced.type, 'string',
    'D6: optionSetSchema()\'s `properties.options.items.properties.priced` must be declared ' +
    '`type: "string"` — a missing or non-string type means "n/a — no number in the brief" (the ' +
    'sanctioned honest value) would not even validate: ' + JSON.stringify(props && props.priced))
})

// ---------------------------------------------------------------------------
// AC-20260825-02-5
// ---------------------------------------------------------------------------

test('AC-20260825-02-5: the wf-research.js research prompt instructs reading Coverage and filling because/priced, and genesis-architect.md names both as menu description parts', () => {
  const src = read('spec/workflows/wf-research.js')

  // Isolate the literal prompt string handed to the research agent() call — from its opening
  // sentence to the options object that follows it — rather than grepping the whole file, so a
  // `because`/`priced` mention that only lives in the schema's property keys (not in the prompt
  // text the agent actually reads) does not vacuously pass this AC.
  const promptMatch = src.match(/'You are the option-research agent[\s\S]*?\{ label: 'menu:'/)
  assert.ok(promptMatch,
    'the wf-research.js option-research agent() call must still exist — without it there is no ' +
    'prompt string left to check for the D6 Coverage/because/priced instructions')
  const prompt = promptMatch[0]

  assert.match(prompt, /## Coverage/,
    'D6: the research prompt must instruct the agent to read the brief\'s `## Coverage` section — ' +
    'its absence means the agent has no way to know the answers that should drive `because`, and ' +
    'the Rationale\'s "price against scale-outage/vendor-budget" instruction has nothing to key off')
  assert.match(prompt, /\bbecause\b/,
    'D6: the research prompt must instruct the agent to fill `because` — its absence means the ' +
    'schema requires the field but the prompt never tells the agent what to put in it')
  assert.match(prompt, /\bpriced\b/,
    'D6: the research prompt must instruct the agent to fill `priced` — its absence means the ' +
    'schema requires the field but the prompt never tells the agent to price a consequence at the ' +
    'brief\'s stated scale')

  const architectSrc = read('spec/commands/genesis-architect.md')
  const menuStepMatch = architectSrc.match(/Present an `AskUserQuestion` built from the menu:[\s\S]*?(?=\n\d+\.|\n\n)/)
  assert.ok(menuStepMatch,
    'genesis-architect.md\'s Phase 1 menu-build step ("Present an `AskUserQuestion` built from ' +
    'the menu: …") must still exist — without it there is no step left to check for D7\'s ' +
    'because/priced description parts')
  const menuStep = menuStepMatch[0]
  assert.match(menuStep, /\bbecause\b/,
    'D7: genesis-architect.md\'s menu-build step must name `because` as a description part — its ' +
    'absence means the AskUserQuestion the session actually presents drops the reason behind an ' +
    'option\'s rank even though the schema now requires the research agent to supply one')
  assert.match(menuStep, /\bpriced\b/,
    'D7: genesis-architect.md\'s menu-build step must name `priced` as a description part — its ' +
    'absence means the user-facing menu still shows generic tradeoff prose instead of the priced ' +
    'consequence D6/D7 require')
})

// ---------------------------------------------------------------------------
// AC-20260825-02-6 (regression pin — SHALL CONTINUE TO, sanctioned green pre-change)
// ---------------------------------------------------------------------------

test('AC-20260825-02-6: wf-research.js continues to pass checkWorkflowSyntax and capOptions continues to cut a 6-option menu to 4 preserving the is_minority option', () => {
  assert.doesNotThrow(() => checkWorkflowSyntax('spec/workflows/wf-research.js'),
    'D9: wf-research.js must continue to parse as a valid workflow sandbox body — a throw here ' +
    'means the D6 schema/prompt edit broke the script\'s syntax, not just its schema shape')

  const src = read('spec/workflows/wf-research.js')
  const { capOptions } = evalFns(src, ['capOptions'])
  const menus = [{
    dimension: 'hosting',
    options: [1, 2, 3, 4, 5, 6].map((rank) => ({
      label: 'option-' + rank,
      rank,
      is_minority: rank === 5
    }))
  }]
  const { menus: capped } = capOptions(menus)
  const survivorRanks = capped[0].options.map((o) => o.rank).sort((a, b) => a - b)
  assert.deepStrictEqual(survivorRanks, [1, 2, 3, 5],
    'D9: capOptions must continue to cut a 6-option menu to 4, preserving the is_minority-flagged ' +
    'option (rank 5) and cutting worst-rank-first from the non-minority group before the minority ' +
    'group is touched at all — got survivor ranks ' + JSON.stringify(survivorRanks) +
    ' instead of [1, 2, 3, 5]')
})
