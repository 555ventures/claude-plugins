'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, sweepRetiredLiteral } = require('../helpers')

// specs/20261002/01-the-wireframe-command-runs-over-the-service.md AC-20261002-01-16 (D12): no
// file names the retired reviewer package or its library outside the waive list, and the deleted
// library, template directory and fixture are gone.

// Dated records, the changelog and the run ledger name the package as history; this file spells
// the literals under test. docs/canonical/ is deliberately not waived.
const WAIVED_PREFIXES = ['specs/', 'docs/roadmap/', 'docs/adr/', 'docs/audit/', 'docs/spikes/', 'docs/handoff/', '.claude/spec-runs/', '.claude/agent-memory/']
const WAIVED_PATHS = ['spec/.claude-plugin/plugin.json', '.claude/spec-runs.jsonl', 'tests/consistency/reviewer-retired.test.js']

test('AC-20261002-01-16: no file outside the waive list contains the retired package name or the retired library name', () => {
  for (const [literal, what] of [['mock-review', 'the retired reviewer package'], ['mock-cli', 'the retired library that called it']]) {
    const offenders = sweepRetiredLiteral(literal, { waivedPaths: WAIVED_PATHS, waivedPrefixes: WAIVED_PREFIXES })
    assert.deepStrictEqual(offenders, [],
      'these files still name ' + what + ' ("' + literal + '") — a live mention sends the next session to a command or file that does not exist: ' + JSON.stringify(offenders))
  }
})

test('AC-20261002-01-16: the retired library, the mock-app template directory and the mock-app test fixture no longer exist', () => {
  for (const rel of ['spec/scripts/lib/mock-cli.js', 'spec/templates/mock', 'tests/mocks/mock-app-fixtures.js']) {
    assert.ok(!fs.existsSync(path.join(ROOT, rel)), rel + ' must be deleted — a surviving copy keeps the retired flow reachable by a stale caller')
  }
})
