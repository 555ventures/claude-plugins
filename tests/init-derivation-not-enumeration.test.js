'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// PRAX-20260813-06: /spec:init writes volatile enumerable repo facts as prose snapshots — a
// generated run skill saying routes are "currently `/` and `/api/health`" while the repo
// actually has 37, a conventions file naming the wrong token home — and no checker can exist
// for arbitrary generated sentences (the corpus is per-host free text, not a fixed doctrine
// file this repo ships). The accepted fix shape is an authoring RULE, true-by-construction: any
// generated file's prose about a volatile enumerable fact must name the DERIVATION (the command
// or location that yields the fact — e.g. "ls apps/web/src/routes/ is the surface list") rather
// than inlining the enumeration itself, so the sentence can never go stale independent of the
// derivation it points at. init.md carries no such rule today (confirmed: init.md has zero
// occurrences of "derivation" anywhere in the file).

const init = read('spec/commands/init.md')

test('PRAX-20260813-06: init.md carries an authoring rule that generated prose names the derivation instead of inlining volatile enumerations', () => {
  assert.match(init, /name the derivation|names? the (command|location) that yields|never inline the enumeration/i,
    'init.md has no authoring rule requiring generated files to name the DERIVATION of a ' +
    'volatile enumerable fact (the command or location that yields it) instead of inlining the ' +
    'enumeration as prose — the incident class: a generated run skill said routes are ' +
    '"currently `/` and `/api/health`" while 37 existed, and a conventions file named the wrong ' +
    'token home; no checker can exist for arbitrary generated sentences, so the only fix that ' +
    'holds is a true-by-construction authoring rule at generation time')
})
