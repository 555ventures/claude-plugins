'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { makeNoTestsHost, run, stateOf } = require('./build-driver.fixtures')

// core § Incident Policy, 2026-09-08: `--mark incident` (7.101.0) made build-time incidents count
// toward materiality but left recording to the session's memory. A test watchdog trip is
// observable by exit code (124), so the driver now records it itself.
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
