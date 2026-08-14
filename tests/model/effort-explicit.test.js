'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('../helpers')

// specs/20260813/09-model-placement-mechanics.md D3/D3a (2026-08-14). Effort is currently set
// explicitly at only 3 call sites across the six workflow bodies (wf-build's red-check, wf-design's
// expansion worker, wf-research's currency verifier) — every other `agent()`/`dispatch()` seat,
// including wf-panel's aggregate (judgment) seat, inherits an unstated default. D3 closes this: a
// closed low/medium/high band, every seat explicit. AC-4's scan is a depth-counting paren matcher
// (extractFn's brace-matcher, adapted) rather than a bare regex, because several prompt strings in
// these bodies build via string concatenation with parenthesized ternaries — a non-greedy regex
// over the call text would false-negative on those. AC-5 pins the 5 pre-existing 'low' sites (as
// they exist in the GENERATED wf-*.js — gate-loop.js.frag splices into two workflows, so the
// SOURCE count is 4) byte-identical, per the orchestrator's D3a measurement at build dispatch.

const BODIES = [
  'spec/workflows/src/wf-panel.body.js',
  'spec/workflows/src/wf-review.body.js',
  'spec/workflows/src/wf-build.body.js',
  'spec/workflows/src/wf-design.body.js',
  'spec/workflows/src/wf-research.body.js',
  'spec/workflows/src/wf-enforce.body.js',
]

// Depth-counting call-site scanner, in the style of tests/helpers.js's extractFn (which brace-
// matches a named function) but paren-matching from every `agent(`/`dispatch(` call: returns each
// call's full text up to its OWN balancing close-paren, immune to unrelated parens elsewhere in
// the file (including ones inside prompt-building expressions).
function findCalls(src) {
  const calls = []
  const re = /\b(agent|dispatch)\(/g
  let m
  while ((m = re.exec(src))) {
    const start = m.index
    const open = start + m[0].length - 1
    let depth = 0
    let end = -1
    for (let i = open; i < src.length; i++) {
      if (src[i] === '(') depth++
      else if (src[i] === ')' && --depth === 0) { end = i; break }
    }
    if (end === -1) throw new Error('unbalanced parens scanning a call at offset ' + start + ' in given source')
    calls.push(src.slice(start, end + 1))
  }
  return calls
}

test('AC-20260813-09-4: every agent()/dispatch() call site across the six workflow bodies declares both model: and effort: explicitly, found by a depth-counting paren scanner rather than a bare regex', () => {
  const missing = []
  let totalCalls = 0
  for (const rel of BODIES) {
    const src = read(rel)
    const calls = findCalls(src)
    totalCalls += calls.length
    for (const call of calls) {
      const hasModel = /\bmodel\s*:/.test(call)
      const hasEffort = /\beffort\s*:/.test(call)
      if (!hasModel || !hasEffort) {
        missing.push(`${rel}: ${call.slice(0, 60).replace(/\s+/g, ' ')}...`)
      }
    }
  }
  assert.ok(totalCalls >= 15,
    'the scanner must find at least the 15 known agent()/dispatch() call sites across the six ' +
    'bodies (at HEAD) — a scanner finding fewer is silently skipping real call sites rather than ' +
    'proving compliance, which would make this test pass vacuously')
  assert.deepStrictEqual(missing, [],
    'every agent()/dispatch() call site must declare model: AND effort: explicitly — a seat ' +
    'missing effort silently inherits an unstated value; the failing example this AC names is ' +
    'wf-panel\'s aggregate seat, which has no effort: today. Sites missing one or both: ' +
    missing.join(' | '))
})

test("AC-20260813-09-5: the five pre-existing effort: 'low' call sites (wf-build's gate + red-check, wf-design's expansion-worker + gate, wf-research's currency verifier) continue to carry 'low' byte-identically", () => {
  const expectedCounts = {
    'spec/workflows/wf-build.js': 2,
    'spec/workflows/wf-design.js': 2,
    'spec/workflows/wf-research.js': 1,
  }
  for (const [rel, expected] of Object.entries(expectedCounts)) {
    const src = read(rel)
    const found = (src.match(/effort:\s*'low'/g) || []).length
    assert.strictEqual(found, expected,
      `${rel} must carry exactly ${expected} effort: 'low' site(s), unchanged by the D3 effort ` +
      'sweep — a count drift means a pre-existing mechanical/transcription seat\'s value was ' +
      `touched, which AC-5 forbids as a byte-identical regression pin (found ${found})`)
  }
})
