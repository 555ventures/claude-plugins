'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('../helpers')

// spec: specs/20260801/04-live-smoke.md — pins AC-20260801-04-10 (root README.md autopilot
// operator section, D9) and AC-20260801-04-11 (spec-pipeline.md § Test Rules sanctions the
// opt-in live suite). Neither doc edit exists yet: `grep -i autopilot README.md` finds
// nothing today, and .claude/rules/spec-pipeline.md § Test Rules still literally asserts
// "there is no env-gated suite" — both assertions below fail on current code.

// Returns the text of the "## ...<heading>..." section (case-insensitive heading match) up
// to (not including) the next "## " heading, or null if no matching heading exists.
function section(text, headingPattern) {
  const lines = text.split('\n')
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    if (headingPattern.test(lines[i])) { start = i; break }
  }
  if (start === -1) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) { end = i; break }
  }
  return lines.slice(start, end).join('\n')
}

test('AC-20260801-04-10: README.md documents an autopilot operator section naming install, throwaway-repo grounding, config location, start command, and stop signal in that order', () => {
  const text = read('README.md')
  const autopilot = section(text, /^##\s.*autopilot/i)
  assert.ok(autopilot,
    'README.md must contain a "## ...autopilot..." section — an operator has no in-repo doc for starting the daemon (D9) without one')

  const installIdx = autopilot.search(/npm install/i)
  const groundingIdx = autopilot.search(/\/spec:init/)
  const configIdx = autopilot.search(/config\.json/i)
  const startIdx = autopilot.search(/autopilotd\b/)
  const stopIdx = autopilot.search(/SIGTERM/)

  for (const [name, idx] of [
    ['dependency install (npm install)', installIdx],
    ['throwaway-repo grounding (/spec:init)', groundingIdx],
    ['config file location (config.json)', configIdx],
    ['start command (autopilotd)', startIdx],
    ['stop signal (SIGTERM)', stopIdx],
  ]) {
    assert.notStrictEqual(idx, -1, `the autopilot section must name the ${name} step, or an operator following the README hits an undocumented gap`)
  }

  assert.ok(installIdx < groundingIdx && groundingIdx < configIdx && configIdx < startIdx && startIdx < stopIdx,
    `the five steps must appear in install -> grounding -> config-location -> start -> stop order, matching the sequence an operator actually follows (AC-10); got indices install=${installIdx} grounding=${groundingIdx} config=${configIdx} start=${startIdx} stop=${stopIdx}`)
})

test('AC-20260801-04-11: .claude/rules/spec-pipeline.md § Test Rules declares the opt-in AUTOPILOT_LIVE suite and drops the "no env-gated suite" claim', () => {
  const text = read('.claude/rules/spec-pipeline.md')
  const testRules = section(text, /^##\s+Test Rules\s*$/)
  assert.ok(testRules, '.claude/rules/spec-pipeline.md must contain a "## Test Rules" heading — AC-11 has nothing to check without it')

  assert.doesNotMatch(testRules, /there is no env-gated suite/i,
    'the stale "there is no env-gated suite" claim must be removed now that tests/autopilot/live.test.js exists and is sanctioned by D6 — otherwise the doctrine directly contradicts the repo\'s own test suite')
  assert.match(testRules, /AUTOPILOT_LIVE/,
    '§ Test Rules must name the AUTOPILOT_LIVE opt-in switch that gates tests/autopilot/live.test.js, or the suite\'s activation condition is undocumented doctrine')
})
