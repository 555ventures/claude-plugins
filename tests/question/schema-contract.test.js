'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('../helpers')

// specs/20260813/08-question-contract.md — the workflow schemas that manufacture fork/menu
// questions (wf-panel, wf-research, wf-build, wf-design) lack the consequence/recommendation
// fields the wired question-style-gate.js hook demands at ask time, so every question those
// schemas feed gets bounced downstream with no data to fix it from. This file pins the
// schema-level contract (AC-20260813-08-1 through -4): D1-D3 producer fields, plus a
// regression pin (D8) that the hook stays wired. Doctrine-consumer sites are pinned separately
// in tests/question/doctrine-alignment.test.js.

const wfPanelSrc = read('spec/workflows/src/wf-panel.body.js')
const wfResearchSrc = read('spec/workflows/src/wf-research.body.js')
const wfBuildSrc = read('spec/workflows/src/wf-build.body.js')
const wfDesignSrc = read('spec/workflows/src/wf-design.body.js')

test('AC-20260813-08-1: wf-panel AGGREGATE_SCHEMA requires consequence on conflicting_positions items', () => {
  const at = wfPanelSrc.indexOf('conflicting_positions:')
  assert.notStrictEqual(at, -1, 'conflicting_positions is not declared in the schema at all — hard forks carry no consequence field for the question-style hook to render')
  const block = wfPanelSrc.slice(at, at + 500)
  assert.match(block, /required:\s*\[\s*'option'\s*,\s*'consequence'\s*,\s*'rationale'\s*\]/,
    'conflicting_positions items do not require `consequence` (spec literal: required: [\'option\', \'consequence\', \'rationale\']) — a fork option can be authored with no plain-English cost line, and the question-style hook then blocks the question downstream with nothing to fix it from')
})

test('AC-20260813-08-1: wf-panel AGGREGATE_SCHEMA requires recommended_first_reason on hard_fork_list items', () => {
  const at = wfPanelSrc.indexOf('hard_fork_list:')
  assert.notStrictEqual(at, -1, 'hard_fork_list is not declared in the schema at all — no fork list for the aggregator to fill')
  const block = wfPanelSrc.slice(at, at + 500)
  const outerRequired = block.match(/required:\s*\[[^\]]*\]/)
  assert.ok(outerRequired, 'hard_fork_list items object declares no `required` array at all')
  assert.match(outerRequired[0], /'recommended_first_reason'/,
    'hard_fork_list items do not require `recommended_first_reason` — recommended_first can be authored with no stated reason, so the question-style hook has nothing to render as the "(Recommended)" gloss')
})

test('AC-20260813-08-1: wf-panel aggregator prompt contains the ten-second cold-test clause', () => {
  assert.match(wfPanelSrc, /never seen this repo/,
    'the aggregator prompt does not instruct the ten-second cold-test standard (literal: "never seen this repo") — fork consequence/reason lines can be authored in insider jargon the hook is meant to catch upstream, at authoring time rather than at ask time')
})

test('AC-20260813-08-2: wf-research OPTION_SET_SCHEMA requires why_recommended on the option set', () => {
  const start = wfResearchSrc.indexOf('const OPTION_SET_SCHEMA')
  const end = wfResearchSrc.indexOf('const RECENCY_VERDICT_SCHEMA')
  assert.notStrictEqual(start, -1, 'OPTION_SET_SCHEMA is not declared — the research option-menu schema is missing entirely')
  const block = wfResearchSrc.slice(start, end === -1 ? undefined : end)
  const topRequired = block.match(/required:\s*\[[^\]]*\]/)
  assert.ok(topRequired, 'OPTION_SET_SCHEMA declares no top-level `required` array')
  assert.match(topRequired[0], /'why_recommended'/,
    'the option-set object does not require `why_recommended` — a research menu can be returned with rank-1 unexplained, so the interview has no reason to render for its (Recommended) label')
})

test('AC-20260813-08-2: wf-research prompt no longer instructs neutral labels with no stated recommendation', () => {
  assert.doesNotMatch(wfResearchSrc, /do NOT lead the user/,
    'the research prompt still orders a fully symmetric menu ("do NOT lead the user") with no explicit recommendation field to carry the ranking — contract-inverted against the question-style hook, which requires a stated reasoned recommendation')
})

test('AC-20260813-08-3: wf-build blocked schema requires {option, consequence} items', () => {
  const at = wfBuildSrc.indexOf('options: {')
  assert.notStrictEqual(at, -1, 'the blocked schema declares no `options` field at all')
  const block = wfBuildSrc.slice(at, at + 300)
  assert.match(block, /required:\s*\[\s*'option'\s*,\s*'consequence'\s*\]/,
    'wf-build\'s blocked.options items are not required objects with {option, consequence} (spec literal: required: [\'option\', \'consequence\']) — a bare-string option list gives the orchestrator no consequence to reconstruct the fork question from')
})

test('AC-20260813-08-3: wf-design blocked schema requires {option, consequence} items', () => {
  const at = wfDesignSrc.indexOf('options: {')
  assert.notStrictEqual(at, -1, 'the blocked schema declares no `options` field at all')
  const block = wfDesignSrc.slice(at, at + 300)
  assert.match(block, /required:\s*\[\s*'option'\s*,\s*'consequence'\s*\]/,
    'wf-design\'s blocked.options items are not required objects with {option, consequence} (spec literal: required: [\'option\', \'consequence\']) — a bare-string option list gives the designer no consequence to reconstruct the fork question from')
})

test('AC-20260813-08-4: hooks.json continues to wire question-style-gate.js on AskUserQuestion (D8 regression pin)', () => {
  const hooks = JSON.parse(read('spec/hooks/hooks.json'))
  const preToolUse = hooks.hooks.PreToolUse || []
  const entry = preToolUse.find(e => e.matcher === 'AskUserQuestion')
  assert.ok(entry, 'no PreToolUse matcher for AskUserQuestion — the whole question contract this spec builds assumes the hook stays wired; an orphaned hook silently drops all consequence/recommendation enforcement at ask time')
  const cmd = (entry.hooks || []).map(h => h.command).join(' ')
  assert.match(cmd, /question-style-gate\.js/,
    'the AskUserQuestion matcher no longer invokes question-style-gate.js — the hook is wired to the wrong (or no) script, so malformed questions stop being blocked at ask time')
})
