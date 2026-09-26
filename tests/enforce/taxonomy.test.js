'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read, evalFns } = require('../helpers')

// specs/20260926/02-the-design-contract-is-code.md D7/D8, AC-20260926-02-8: `kit-discipline`
// must join the reserved category taxonomy in all three homes at once — wf-enforce.js's
// CATEGORIES array, the grounding contract's canonical taxonomy sentence, and enforce.md's
// operational copy — or a workflow classifies cells a doctrine reader never learns exist, or
// doctrine promises a category the workflow silently refuses as unknown-category.

const WF_ENFORCE_REL = 'spec/workflows/wf-enforce.js'
const CONTRACT_REL = 'spec/templates/grounding-contract.md'
const ENFORCE_MD_REL = 'spec/commands/enforce.md'

const EXPECTED = [
  'module-boundary', 'naming', 'forbidden-symbol', 'structural-pattern', 'datetime',
  'schema-validation', 'format', 'duplication', 'cycle', 'kit-discipline',
]

// wf-enforce.js's CATEGORIES is a top-level `const` array literal, not a named function, so
// extractFn/evalFns (which only lift `function name(...) {...}` bodies) cannot reach it — A2's
// documented fallback: parse the literal out of the source with a regex and evaluate just that
// slice, never require() the workflow (it uses top-level `await`/`return` outside a function).
function extractCategoriesArray(src) {
  const m = src.match(/const CATEGORIES = \[([\s\S]*?)\]/)
  assert.ok(m, 'no `const CATEGORIES = [...]` literal found in ' + WF_ENFORCE_REL + ' — this pin has nothing to compare against')
  // eslint-disable-next-line no-new-func
  return new Function('return [' + m[1] + ']')()
}

// The grounding contract spells the taxonomy as one backtick-quoted, pipe-separated list inside
// a sentence: `` `module-boundary | naming | ... | cycle` ``.
function extractPipeList(text) {
  const m = text.match(/`(module-boundary[\s\S]*?)`/)
  assert.ok(m, 'no backtick-quoted "module-boundary | ..." taxonomy sentence found in ' + CONTRACT_REL)
  return m[1].split('|').map(s => s.trim())
}

// enforce.md spells the same list as one backtick per name, joined by " · ", ending in a period —
// its own "operational copy" of the contract's canonical list.
function extractDotList(text) {
  const m = text.match(/(`[a-z-]+`(?:\s*·\s*`[a-z-]+`)+)\./)
  assert.ok(m, 'no backtick-per-name "`x` · `y`" taxonomy sentence found in ' + ENFORCE_MD_REL)
  return [...m[1].matchAll(/`([a-z-]+)`/g)].map(x => x[1])
}

test('AC-20260926-02-8: WHEN the CATEGORIES array is extracted from spec/workflows/wf-enforce.js THE SYSTEM SHALL yield exactly the ten reserved category names, in order, ending in kit-discipline', () => {
  const categories = extractCategoriesArray(read(WF_ENFORCE_REL))
  assert.deepStrictEqual(categories, EXPECTED,
    'D7/D8: wf-enforce.js\'s CATEGORIES must carry the ten reserved names in order, ending in "kit-discipline" — a workflow classifying against a stale list silently refuses every kit-discipline cell as unknown-category: ' + JSON.stringify(categories))
})

test('AC-20260926-02-8: WHEN the taxonomy sentence is read from spec/templates/grounding-contract.md THE SYSTEM SHALL yield the same ten names in the same order as wf-enforce.js\'s CATEGORIES', () => {
  const names = extractPipeList(read(CONTRACT_REL))
  assert.deepStrictEqual(names, EXPECTED,
    'D1/D7: the grounding contract\'s canonical taxonomy sentence must list the same ten names in the same order as wf-enforce.js — a host stamped against this contract would otherwise be told about a taxonomy the workflow does not actually implement: ' + JSON.stringify(names))
})

test('AC-20260926-02-8: WHEN the taxonomy sentence is read from spec/commands/enforce.md THE SYSTEM SHALL yield the same ten names in the same order as wf-enforce.js\'s CATEGORIES', () => {
  const names = extractDotList(read(ENFORCE_MD_REL))
  assert.deepStrictEqual(names, EXPECTED,
    'D7: enforce.md\'s "operational copy" of the taxonomy must list the same ten names in the same order as wf-enforce.js and the grounding contract — a divergence here means the executor\'s own working list disagrees with the source of truth it claims to mirror: ' + JSON.stringify(names))
})

test('AC-20260926-02-8: WHEN validateCells is called with a kit-discipline cell against the CATEGORIES extracted from wf-enforce.js THE SYSTEM SHALL return it accepted with an empty skipped list', () => {
  const src = read(WF_ENFORCE_REL)
  const categories = extractCategoriesArray(src)
  const { validateCells } = evalFns(src, ['validateCells'])
  const logged = []
  const result = validateCells(
    [{ id: 'typescript:kit-discipline', stack: 'typescript', category: 'kit-discipline', ruleRefs: ['.claude/rules/design.md'] }],
    categories,
    (msg) => logged.push(msg),
  )
  assert.deepStrictEqual(result.skipped, [],
    'D7: a kit-discipline cell must not be skipped once the category is reserved — a non-empty skipped list means /spec:enforce\'s classify phase would silently drop every kit-discipline cell as unknown-category: ' + JSON.stringify(result))
  assert.strictEqual(result.accepted.length, 1,
    'the one kit-discipline cell passed in must come back accepted, not dropped or duplicated: ' + JSON.stringify(result))
  assert.strictEqual(result.accepted[0].category, 'kit-discipline',
    'the accepted cell must be the same kit-discipline cell, not a different or mutated one: ' + JSON.stringify(result.accepted))
})
