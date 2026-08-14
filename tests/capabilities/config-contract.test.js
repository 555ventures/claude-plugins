'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, SPEC, read } = require('../helpers')

// specs/20260813/10-host-capabilities.md: audit Class C's silent-failure family (a command
// assumes GitHub/pnpm/Storybook/skip-count shapes and, on a host where the assumption misses,
// goes inert silently). D1 adds one closed `capabilities` block to the host config contract —
// `forge`, `skipReportPattern`, `ciPoll` — written by /spec:init, documented in
// grounding-contract.md's § Required config keys sibling, with an absent block staying legacy
// mode. D8 dogfoods the block into this repo's own .claude/spec.config.json. AC-1/AC-2/AC-3 pin
// the contract text, init's detection recipe, and the real dogfood artifact respectively.

const contractPath = path.join(SPEC, 'templates/grounding-contract.md')

test('AC-20260813-10-1: grounding-contract.md documents the capabilities block with exactly the forge/skipReportPattern/ciPoll keys and the absent-block legacy-mode sentence', () => {
  const contract = fs.readFileSync(contractPath, 'utf8')
  assert.match(contract, /"forge"/,
    'the contract must name the forge key or hosts (and /spec:init) have nothing to write against for D1')
  assert.match(contract, /"skipReportPattern"/,
    'the contract must name the skipReportPattern key — without it review/release have no declared skip-count format to parse (D1/D3)')
  assert.match(contract, /"ciPoll"/,
    'the contract must name the ciPoll key — without it release.md has no declared override for its poll interval/timeout (D1/D7)')
  assert.match(contract, /Absent block\s*=\s*legacy mode/i,
    'the contract must state that an absent capabilities block means legacy mode (today\'s dynamic probing + doctor nudge) — without this sentence a host with no block has no documented fallback')
})

test('AC-20260813-10-2: init.md documents the capabilities detection recipe — forge from remote + gh, skip pattern from runner identity with user confirm, and the probe-silence caveat', () => {
  const init = read('spec/commands/init.md')
  assert.match(init, /capabilities/i,
    'init.md must document writing the capabilities block, or hosts get no forge/skipReportPattern detection at all (D1)')
  assert.match(init, /\bgh\b/,
    'the forge-detection recipe must name gh availability as part of deriving forge (D1: forge="github" iff the origin remote is GitHub AND gh resolves)')
  assert.match(init, /silence.{0,60}never evidence|never evidence.{0,60}silence/is,
    'the literal caveat that probe silence is never evidence must be stated — many runners print skip lines only on nonzero skips, so a quiet probe run would wrongly write skipReportPattern:"none" on a perfectly capable host (D1, refuter-corrected twice)')
})

test('AC-20260813-10-2: init.md never names pnpm-workspace.yaml as the monorepo trigger outside a parenthetical example, anywhere in the file', () => {
  const init = read('spec/commands/init.md')
  const offendingLines = init.split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => /pnpm-workspace\.yaml/.test(line) && !/e\.g\.[^)]*pnpm-workspace\.yaml/i.test(line))
  assert.deepStrictEqual(offendingLines.map(x => x.n), [],
    'pnpm-workspace.yaml must appear only inside an "(e.g. ...)" parenthetical example — naming it as the literal monorepo trigger silently excludes every equivalent workspace manifest (Cargo workspaces, Nx, Turborepo, go.work, mix umbrella apps) from the generalized "more than one test-collecting package" rule (D5). Offending lines: ' +
    JSON.stringify(offendingLines.map(x => x.line.trim())))
})

test('AC-20260813-10-3: this repo\'s own .claude/spec.config.json carries capabilities.forge:"github" and a skipReportPattern matching node:test\'s skip line', () => {
  const configPath = path.join(ROOT, '.claude/spec.config.json')
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  assert.ok(config.capabilities,
    'this repo\'s config must carry a capabilities block (D8 dogfood) — without a real host exercising it, the block ships unverified')
  assert.strictEqual(config.capabilities.forge, 'github',
    'this repo\'s origin remote is GitHub and gh resolves here (refuter-executed against real gh 2.93.0) — capabilities.forge must be declared "github" (D8)')
  assert.strictEqual(typeof config.capabilities.skipReportPattern, 'string',
    'capabilities.skipReportPattern must be a string regex — the ledger/verdict.js format this repo\'s own suite needs to parse "ℹ skipped N" lines')
  let re
  try {
    re = new RegExp(config.capabilities.skipReportPattern)
  } catch (e) {
    assert.fail('capabilities.skipReportPattern must compile as a valid regex: ' + e.message)
  }
  const m = re.exec('ℹ skipped 3')
  assert.ok(m && m[1] === '3',
    'capabilities.skipReportPattern must match node:test\'s unconditional "ℹ skipped 3" sample line and capture the count in group 1 — the literal AC-3 acceptance sample')
})
