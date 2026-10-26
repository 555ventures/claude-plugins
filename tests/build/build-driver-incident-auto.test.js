'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { makeHost, makeNoTestsHost, run, stateOf, toCommit } = require('./build-driver.fixtures')

// core § Incident Policy: `--mark incident` counts build-time incidents toward materiality but
// leaves recording to the session's memory. A test watchdog trip is observable by exit code
// (124), so the driver records it itself.
test('auto incident: WHEN the gate run exits 124 (the host test watchdog killed it) THE SYSTEM SHALL record a test-watchdog-trip incident on the build sidecar without any --mark incident, and the gate still reads red', () => {
  const host = makeNoTestsHost()
  fs.writeFileSync(path.join(host.root, 'gate.sh'), '#!/usr/bin/env bash\nexit 124\n')
  host.g('add', '-A'); host.g('commit', '-q', '-m', 'hang gate')
  run(host.root, host.spec)
  run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '3')
  const r = run(host.root, host.spec, '--mark', 'integrated')
  assert.match(r.stderr, /incident recorded automatically \(test-watchdog-trip, exit 124/, r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'REPAIR', 'a watchdog trip is still a red gate: ' + r.stdout)
  const marks = JSON.parse(fs.readFileSync(path.join(host.sidecar, 'build-state.json'), 'utf8'))
  assert.strictEqual(marks.incidents.length, 1)
  assert.strictEqual(marks.incidents[0].class, 'test-watchdog-trip')
  assert.strictEqual(marks.incidents[0].exit, 124)
  assert.match(marks.incidents[0].source, /gate run 1/)
})

// A mid-build decision stop lands as a new Decision row, never a deviation, so the build row
// recorded `deviations:0, incidents:[]` for a build that stopped twice for rulings (host spec
// 20261026/02 D10/D11). COMMIT diffs the Decision IDs against the lock-time snapshot.
test('auto incident: WHEN a Decision row is added to the spec after the lock flip THE SYSTEM SHALL record one decision-added-at-build incident naming the added IDs on the stage:"build" row', () => {
  const host = makeHost()
  toCommit(host)
  const text = fs.readFileSync(host.spec, 'utf8')
  fs.writeFileSync(host.spec, text.replace(/(\| D1 \|[^\n]*\n)/, '$1| D2 | build ruling: a | why |\n| D3 | build ruling: b | why |\n'))
  execFileSync('git', ['-C', host.root, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', host.root, 'commit', '-q', '-m', 'checkpoint'], { encoding: 'utf8' })
  const r = run(host.root, host.spec, '--mark', 'committed')
  assert.strictEqual(r.status, 0, r.stdout + r.stderr)
  const rows = fs.readFileSync(path.join(host.root, '.claude/spec-runs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  const inc = rows[rows.length - 1].incidents
  assert.deepStrictEqual(inc.map((i) => [i.class, i.source]), [['decision-added-at-build', 'D2, D3']], JSON.stringify(inc))
})
