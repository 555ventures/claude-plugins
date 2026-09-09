'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { ROOT } = require('../helpers')

// Standing enforcement for scripts/size-ratchet.js over this repository's real tracked tree.
// Owner: specs/20260908/01-size-ratchet.md, AC-20260908-01-9. Behavioral coverage of every
// finding kind, --update, and --raise is pinned instead in
// tests/size-ratchet/size-ratchet.test.js against synthetic tmpdir repos.

const SCRIPT = path.join(ROOT, 'scripts', 'size-ratchet.js')
const BASELINE = path.join(ROOT, 'size-baseline.json')

test('AC-20260908-01-9: the size ratchet check over this repository exits 0', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', ROOT], { encoding: 'utf8' })
  assert.strictEqual(r.status, 0,
    'the tracked size-baseline.json must be tight against this repo\'s real files and trees — a nonzero exit means a file or tree grew without a --update or a cited --raise landing with it: ' + (r.stderr || r.error))
})

test('AC-20260908-01-9: every raises[] entry in the tracked size-baseline.json cites a spec file that exists', () => {
  assert.ok(fs.existsSync(BASELINE),
    'size-baseline.json must be tracked at the repo root, seeded by scripts/size-ratchet.js --update as the build\'s last step (D8) — its absence means the baseline was never seeded: ' + BASELINE)
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
  const missing = (baseline.raises || []).filter((r) => !fs.existsSync(path.join(ROOT, r.cite))).map((r) => r.cite)
  assert.deepStrictEqual(missing, [],
    'every raises[].cite must name a spec file that still exists — a dead citation means the baseline records a growth nobody can trace back: ' + JSON.stringify(missing))
})
