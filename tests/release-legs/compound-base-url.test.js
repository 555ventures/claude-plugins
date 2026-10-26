'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { runNode } = require('../helpers')
const { writeConfig, setupWorkingHost } = require('./release-legs.fixtures')

// specs/20261026/01-one-runner-for-host-commands.md: AC-20261026-01-6 — release-legs.js's e2e leg
// hands BASE_URL to every command of a compound e2eCommand (spawn env, not a bare prefix).

const SCRIPT = 'scripts/release-legs.js'

test('AC-20261026-01-6: the release e2e leg gives BASE_URL to every command of a compound e2eCommand, not only the first', async () => {
  const host = await setupWorkingHost('rl-compound')
  try {
    writeConfig(host.dir, {
      release: { deployCommand: 'true', stagingUrl: host.stagingUrl, e2eCommand: 'cd . && echo "BASE_URL=$BASE_URL"' },
      capabilities: { forge: 'none' },
    })
    const outDir = path.join(host.dir, 'out')
    runNode(SCRIPT, ['stage', '--root', host.dir, '--manifest', path.join(host.dir, 'run-manifest.jsonl'), '--out-dir', outDir])
    const e2eOut = fs.readFileSync(path.join(outDir, 'e2e.txt'), 'utf8')
    assert.ok(e2eOut.includes('BASE_URL=' + host.stagingUrl),
      'a `BASE_URL=x cd . && run` prefix gives BASE_URL to cd alone, so the e2e suite runs with no deployment URL and tests the wrong target: ' + e2eOut)
  } finally {
    host.kill()
  }
})
