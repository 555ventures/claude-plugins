'use strict'
const { test } = require('node:test')
const assert = require('node:assert')

// specs/20260823/03-silent-drop-hardening.md D4 (2026-08-23, rv_e83659d49386): both
// spec-review-driver.js and spec-design-driver.js carried an IDENTICAL local `fmVal` whose
// `^key:\s*(.+)$` regex captures everything after `key:` to end of line — an inline `#` comment
// on any frontmatter key rides straight through to the caller. For `tier:` this was merely
// cosmetic (only ever compared to the literal `critical`) and polluted seven live review ledger
// rows with a whole sentence inside `tier`; for `build_base:` the SAME mechanism made the entire
// comment part of a git ref and broke /spec:review's driver outright with `fatal: invalid object
// name` (rv_e83659d49386, specs/20260822/02-init-generation-script.md build-close correction).
// D4 extracts the one shared, correct reader: `spec/scripts/lib/frontmatter.js` exports
// `fmVal(fmRaw, key)`, quote-aware and YAML-correct (a comment requires PRECEDING whitespace, so
// an unspaced `#` inside a value — e.g. a URL fragment — survives). This module does not exist
// yet at HEAD, so every test below fails on MODULE_NOT_FOUND — the correct red for a
// unit-level pin on a function's return contract (AC-7/-8/-9/-10 class, per this repo's Test
// Rules) that targets a file this spec creates from scratch.

const { fmVal } = require('../spec/scripts/lib/frontmatter')

test('AC-20260823-03-8: WHEN fmVal reads an unquoted value with an inline comment THE SYSTEM strips whitespace-preceded "#" to line end ("tier: standard   # note" -> "standard"), and returns "" for a key absent from the frontmatter block entirely', () => {
  assert.strictEqual(fmVal('tier: standard   # note', 'tier'), 'standard',
    `an unquoted value followed by a whitespace-preceded comment must return only the value with the comment stripped — a surviving "#" here is exactly rv_e83659d49386's mechanism (a comment riding into a value a caller trusts verbatim) — got ${JSON.stringify(fmVal('tier: standard   # note', 'tier'))}`)
  assert.strictEqual(fmVal('status: implementing', 'tier'), '',
    `a key absent from the frontmatter block must return "" (the Contract's documented default) — a caller like spec-review-driver.js relies on this to fall back to its own default ("standard") rather than crashing or propagating undefined — got ${JSON.stringify(fmVal('status: implementing', 'tier'))}`)
})

test('AC-20260823-03-9: WHEN fmVal reads a quoted value THE SYSTEM returns the quoted content and ignores any trailer ("tier: \\"critical\\" # note" -> "critical")', () => {
  assert.strictEqual(fmVal('tier: "critical" # note', 'tier'), 'critical',
    `a double-quoted value must return exactly the content up to the matching closing quote, with the trailing comment discarded entirely — the driver-local fmVal this module replaces already mishandled this exact shape (its own quote-detection regex requires the value to END in the quote character, which a trailing comment breaks) — got ${JSON.stringify(fmVal('tier: "critical" # note', 'tier'))}`)
})

test('AC-20260823-03-10: WHEN a value contains "#" with no preceding whitespace THE SYSTEM SHALL CONTINUE TO return it intact ("design_source: https://x/p?f=A#sec" -> "https://x/p?f=A#sec")', () => {
  assert.strictEqual(fmVal('design_source: https://x/p?f=A#sec', 'design_source'), 'https://x/p?f=A#sec',
    `YAML comments require PRECEDING WHITESPACE before "#" — an unspaced "#" inside a value (a URL fragment here) is part of the value, not a comment, and stripping it would corrupt a real design_source URL every time one carries a fragment — got ${JSON.stringify(fmVal('design_source: https://x/p?f=A#sec', 'design_source'))}`)
})
