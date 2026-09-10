'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { ROOT } = require('../helpers')

// Standing enforcement for scripts/dup-windows.js over this repository's real tracked tree.
// Owner: specs/20260908/04-duplicate-window-ratchet.md, AC-20260908-04-7. Behavioral coverage
// of every finding kind, --update, and --raise is pinned instead in
// tests/dup-windows/dup-windows.test.js against synthetic tmpdir repos.

const SCRIPT = path.join(ROOT, 'scripts', 'dup-windows.js')
const BASELINE = path.join(ROOT, 'dup-baseline.json')

test('AC-20260908-04-7: the duplicate-window check over this repository exits 0', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', ROOT], { encoding: 'utf8' })
  assert.strictEqual(r.status, 0,
    'the tracked dup-baseline.json must be tight against this repo\'s real duplicate-window counts across spec/scripts, scripts, and tests — a nonzero exit means a file drifted without an --update or a cited --raise landing with it: ' + (r.stderr || r.error))
})

test('AC-20260908-04-7: every raises[] entry in the tracked dup-baseline.json cites a spec file that exists', () => {
  assert.ok(fs.existsSync(BASELINE),
    'dup-baseline.json must be tracked at the repo root, seeded by scripts/dup-windows.js --update as the build\'s last step (D5) — its absence means the baseline was never seeded: ' + BASELINE)
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
  const missing = (baseline.raises || []).filter((r) => !fs.existsSync(path.join(ROOT, r.cite))).map((r) => r.cite)
  assert.deepStrictEqual(missing, [],
    'every raises[].cite must name a spec file that still exists — a dead citation means the baseline records a growth nobody can trace back: ' + JSON.stringify(missing))
})
