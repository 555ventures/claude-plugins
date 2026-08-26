'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read, evalFns, checkWorkflowSyntax, runBash } = require('../helpers')

// specs/20260825/02-genesis-consultant-discovery.md (2026-08-25): D6 turns
// spec/workflows/wf-research.js's OPTION_SET_SCHEMA top-level const into a named top-level
// function `optionSetSchema()` (evalFns-extractable, per the capOptions precedent already in
// this file) and adds two REQUIRED string option fields — `because` (the coverage keys/answers
// that drove an option's rank) and `priced` (a consequence priced at the brief's stated scale,
// or the literal "n/a — no number in the brief"). The research prompt must instruct the agent to
// read the brief's `## Coverage` section and fill both fields, and genesis-architect.md's menu
// step must name both as description parts (D7).
//
// AC-20260825-02-4 and AC-20260825-02-5 were authored RED against the pre-D6 file
// (OPTION_SET_SCHEMA was still a bare top-level const, so evalFns could not extract it, and
// neither `because`/`priced` nor `## Coverage` appeared in the research prompt or in
// genesis-architect.md's menu-build step); D6/D7 landed both and they are green.
// AC-20260825-02-6 is D9's `SHALL CONTINUE TO` regression pin, green throughout: it holds
// wf-research.js parsing under checkWorkflowSyntax, capOptions still capping a 6-option menu to
// 4 while preserving the is_minority option, and `spec-paths shared-for genesis-architect` still
// serving `## Question Style` (that third pin was added at review close 2026-08-26 — D9 named it
// but the original test covered only the first two); this spec's schema/prompt edit must not
// break any of them.

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
// The checkWorkflowSyntax/capOptions test just below is spec 03's AC-20260825-03-8 — the same
// test, retagged in place per that spec's D10 (never weakened, never rewritten). The
// shared-for/Question Style test after it stays tagged AC-20260825-02-6; spec 03 does not touch it.
// ---------------------------------------------------------------------------

test('AC-20260825-03-8: wf-research.js continues to pass checkWorkflowSyntax and capOptions continues to cut a 6-option menu to 4 preserving the is_minority option', () => {
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

test('AC-20260825-02-6: spec-paths shared-for genesis-architect continues to serve the ## Question Style section', () => {
  const r = runBash('bin/spec-paths', ['shared-for', 'genesis-architect'])
  assert.strictEqual(r.status, 0,
    'D9: `spec-paths shared-for genesis-architect` must continue to exit 0 — a non-zero exit here ' +
    'means this spec\'s D6 schema/prompt edit or D8 Phase 1 rewrite broke the scoped-doctrine ' +
    'resolver itself, not just the section it serves: ' + r.stderr)
  assert.match(r.stdout, /## Question Style/,
    'D9: genesis-architect must continue to be served § Question Style — its absence means the ' +
    'command that raises every AskUserQuestion in the discovery interview (D1/D2/D8) no longer ' +
    'reads the doctrine governing how those questions must be phrased: ' + r.stdout)
})

// specs/20260825/03-genesis-currency-executed.md (2026-08-25) D6 deletes wf-research.js's Verify
// phase outright: the Haiku "still current?" pass was an opinion, never told to pin to release
// pages, replaced by spec/scripts/registry-check.js's deterministic registry GET (this spec's own
// script, pinned separately in tests/genesis/registry-check.test.js). RECENCY_VERDICT_SCHEMA,
// verifyKeys, toVerify, verifyFailed, still_current, verify_note, and every `haiku` seat are
// deleted; meta.phases drops to one entry; optionSetSchema() gains a REQUIRED `packages` array per
// option. AC-20260825-03-7 cannot pass yet — as of 2026-08-26 the Verify phase, RECENCY_VERDICT_
// SCHEMA, verifyKeys, still_current, and the haiku model seat are all still live in the file, and
// optionSetSchema()'s option items do not require `packages` (TDD red).

// Extract the top-level `export const meta = {...}` object literal and evaluate it, mirroring
// checkWorkflowSyntax's own strip pattern (helpers.js) — meta is a bare const, not a named
// function, so evalFns/extractFn (which brace-match a `function name(` signature) cannot reach it.
function extractMeta(src) {
  const m = src.match(/^export const meta = (\{[\s\S]*?\n\})\n/)
  if (!m) throw new Error('export const meta = {...} not found')
  // eslint-disable-next-line no-new-func
  return new Function('return (' + m[1] + ')')()
}

// ---------------------------------------------------------------------------
// AC-20260825-03-7
// ---------------------------------------------------------------------------

test("AC-20260825-03-7: optionSetSchema(), extracted from wf-research.js via evalFns, requires packages per option with registry/name/version items, the source contains none of RECENCY_VERDICT_SCHEMA, verifyKeys, still_current, or 'haiku', and meta.phases has length 1", () => {
  const src = read('spec/workflows/wf-research.js')
  const { optionSetSchema } = evalFns(src, ['optionSetSchema'])
  const schema = optionSetSchema()

  const itemSchema = schema && schema.properties && schema.properties.options && schema.properties.options.items
  const required = itemSchema && itemSchema.required
  assert.ok(Array.isArray(required) && required.includes('packages'),
    'D6: optionSetSchema()\'s option-item `required` array must include "packages" — its absence ' +
    'means the harness would accept an agent-returned option with no package to check, and ' +
    'registry-check.js (this spec\'s replacement for the deleted Haiku pass) would have nothing to ' +
    'resolve: ' + JSON.stringify(required))

  const packagesSchema = itemSchema && itemSchema.properties && itemSchema.properties.packages
  assert.strictEqual(packagesSchema && packagesSchema.type, 'array',
    'D6: `properties.options.items.properties.packages` must be declared `type: "array"` — a ' +
    'missing or wrong type means the schema does not actually constrain the field registry-check.js ' +
    'depends on: ' + JSON.stringify(packagesSchema))
  const pkgItemRequired = packagesSchema && packagesSchema.items && packagesSchema.items.required
  for (const key of ['registry', 'name', 'version']) {
    assert.ok(Array.isArray(pkgItemRequired) && pkgItemRequired.includes(key),
      'D6: each packages[] item must require "' + key + '" — its absence means an agent could ' +
      'return a package entry registry-check.js cannot resolve (e.g. a name with no version), and ' +
      'the mechanical fake-major guard this spec introduces would silently have nothing to check: ' +
      JSON.stringify(pkgItemRequired))
  }

  const banned = [
    [/RECENCY_VERDICT_SCHEMA/, 'RECENCY_VERDICT_SCHEMA'],
    [/verifyKeys/, 'verifyKeys'],
    [/still_current/, 'still_current'],
    [/'haiku'/, "'haiku'"],
    [/phase\('Verify'\)/, "phase('Verify')"]
  ]
  for (const [re, label] of banned) {
    assert.ok(!re.test(src),
      'D6: wf-research.js must not contain the retired literal "' + label + '" — e.g. a surviving ' +
      "model: 'haiku' seat means the opinion pass this spec replaces with a deterministic registry " +
      'check is still wired into the workflow, not actually deleted: ' + JSON.stringify(label))
  }

  const meta = extractMeta(src)
  assert.ok(Array.isArray(meta.phases) && meta.phases.length === 1,
    'D6: meta.phases must have exactly one entry ("Research") now that the Verify phase is ' +
    'deleted — a surviving second phase means the workflow still advertises a currency-check step ' +
    'this spec retires: ' + JSON.stringify(meta.phases))
})
