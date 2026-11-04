'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { runNode } = require('../helpers')
const { writeConfig, readRows, rowFor, writeExecutable, setupWorkingHost } = require('./release-legs.fixtures')

// specs/20261103/13-a-change-is-sized-by-its-files.md D13: release-legs.js stage runs the host's
// slowTestCommand as a `slow` leg after wave 2, output to slow-output.txt. Pins AC-20261103-13-7.

const SCRIPT = 'scripts/release-legs.js'

async function stageWith(prefix, slowBody) {
  const host = await setupWorkingHost(prefix)
  const config = {
    release: { deployCommand: 'true', stagingUrl: host.stagingUrl, e2eCommand: 'true' },
    capabilities: { forge: 'none', testCountPattern: 'ℹ tests (\\d+)' },
  }
  if (slowBody !== null) {
    const slow = path.join(host.dir, 'slow.sh')
    writeExecutable(slow, '#!/usr/bin/env bash\n' + slowBody)
    config.slowTestCommand = slow
  }
  writeConfig(host.dir, config)
  const manifest = path.join(host.dir, 'run-manifest.jsonl')
  const outDir = path.join(host.dir, 'out')
  const r = runNode(SCRIPT, ['stage', '--root', host.dir, '--manifest', manifest, '--out-dir', outDir])
  return { host, r, rows: readRows(manifest), outDir }
}

test('AC-20261103-13-7: stage appends a red slow row after the e2e row, writes slow-output.txt, and names slow on RED_BLOCKING when slowTestCommand exits 1', async () => {
  const { host, r, rows, outDir } = await stageWith('rl-slow-red', 'echo "slow boom"\nexit 1\n')
  try {
    const slow = rowFor(rows, 'slow')
    assert.ok(slow, 'stage never appended a slow row — a release would promote with its slow tier unrun: ' + JSON.stringify(rows))
    assert.strictEqual(slow.exit, 1, 'the slow row must carry the command\'s exit 1: ' + JSON.stringify(slow))
    assert.ok(rows.findIndex(x => x.leg === 'slow') > rows.findIndex(x => x.leg === 'e2e'),
      'the slow row must follow the e2e row (wave 2 ordering): ' + JSON.stringify(rows.map(x => x.leg)))
    assert.ok(fs.existsSync(path.join(outDir, 'slow-output.txt')),
      'slow-output.txt must land under --out-dir — without it a red slow leg leaves no output to read')
    assert.match(r.stdout, /RED_BLOCKING:.*slow/, 'a red slow leg must be named on RED_BLOCKING: ' + r.stdout)
    assert.strictEqual(r.status, 1, 'stage must exit 1 on a red slow leg: ' + r.stdout + r.stderr)
  } finally { host.kill() }
})

test('AC-20261103-13-7: stage records a green slow row with testsExecuted 3 read through the host testCountPattern', async () => {
  const { host, rows } = await stageWith('rl-slow-green', 'echo "ℹ tests 3"\nexit 0\n')
  try {
    const slow = rowFor(rows, 'slow')
    assert.ok(slow, 'stage never appended a slow row for a declared slowTestCommand: ' + JSON.stringify(rows))
    assert.strictEqual(slow.exit, 0, 'a passing slow command must record exit 0: ' + JSON.stringify(slow))
    assert.strictEqual(slow.observed.testsExecuted, 3,
      'testsExecuted must be read from the output via testCountPattern — an unobserved count would let a vacuous slow run pass: ' + JSON.stringify(slow))
  } finally { host.kill() }
})

test('AC-20261103-13-7: stage appends no slow row and writes no slow-output.txt when no slowTestCommand is declared', async () => {
  const { host, rows, outDir } = await stageWith('rl-slow-none', null)
  try {
    assert.ok(rows.some(x => x.leg === 'e2e'), 'setup: the e2e leg must have run: ' + JSON.stringify(rows))
    assert.strictEqual(rowFor(rows, 'slow'), undefined, 'a host without slowTestCommand must get no slow row: ' + JSON.stringify(rows))
    assert.ok(!fs.existsSync(path.join(outDir, 'slow-output.txt')), 'no slow-output.txt without a slow tier')
  } finally { host.kill() }
})
