'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC } = require('../helpers')

// Measured by the mutation-replay harness: a reviewer was handed a range, saw a real
// eslint error on a line inside that range's diff, ran `git blame`, found a commit whose subject
// did not name the spec under review, declared it "unrelated out-of-scope", and returned CLEAN.
// The blamed commit was at HEAD of the range and carried the injected defect — it is precisely the
// disguised-commit case `replay.md` designs for ("vocabulary is not the leak, provenance is").
//
// The failure is not "trusted blame" — blame was accurate. It is a SCOPE-IDENTITY error: the
// reviewer silently redefined its range from "what the dispatcher named" to "the commits that look
// like this spec's work". The corrective has to be executable, or it degenerates into the same
// judgement call: dismissal by provenance now requires two executed checks, both recorded, and a
// commit inside the range fails the first by construction. Genuinely inherited red passes both
// easily, so the rule cannot manufacture false positives on real inherited failures.
//
// Prose pins, deliberately: this is agent doctrine, so the only thing a test can hold is that the
// binding sentences are still present and still say the load-bearing thing.

const DOCTRINE = fs.readFileSync(path.join(SPEC, 'agents/reviewer.md'), 'utf8')

test('reviewer doctrine defines scope as the dispatched range, not commit provenance', () => {
  assert.match(DOCTRINE, /##\s+Scope identity/i,
    'the doctrine carries a Scope identity section')
  assert.match(DOCTRINE, /<base>\.\.HEAD/,
    'the range is named concretely, so a reviewer knows exactly what it was handed')
  assert.match(DOCTRINE, /whatever\s+its author, subject line, or apparent subject matter/i,
    'commit metadata must be explicitly disqualified as a scope filter — that is the exact ' +
    'reasoning step that produced the 2026-09-01 miss')
  assert.match(DOCTRINE, /it never defines\s+one|never a definition/i,
    'metadata describes a diff, it never defines one')
})

test('dismissal by provenance requires two executed checks, both recorded', () => {
  assert.match(DOCTRINE, /merge-base --is-ancestor <blamed-commit> <base>/,
    'check 1 is executable and named verbatim, not left to judgement')
  assert.match(DOCTRINE, /red at `<base>`/,
    'check 2 requires the failure to pre-exist at the base, not merely be old')
  assert.match(DOCTRINE, /\bboth\b/i,
    'both checks are required — either alone still permits the 2026-09-01 miss')
  assert.match(DOCTRINE, /fails \(1\) by construction/i,
    'a commit inside the range can never be dismissed by blame — the miss, closed directly')
  assert.match(DOCTRINE, /soft.{0,40}finding carrying both command outputs/is,
    'a dismissal is itself a recorded finding, never silence')
})
