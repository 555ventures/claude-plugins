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
  const missing = (baseline.raises || [])
    .filter((r) => r.cite !== 'direct' && !fs.existsSync(path.join(ROOT, r.cite)))
    .map((r) => r.cite)
  assert.deepStrictEqual(missing, [],
    'every raises[].cite must name a spec file that still exists — a dead citation means the baseline records a growth nobody can trace back: ' + JSON.stringify(missing))
})

// D15's `direct` rows are the one growth git alone attributes, so this is the standing check that
// the door stayed narrow. It is a per-ROW bound, deliberately weaker than the mechanism: the
// budget is a property of a whole reconcile run, and the raise log carries no run identity to
// group its rows by, so the run-level bound is pinned on fixtures in the synthetic sibling suite.
// A row past 4096 is nonetheless proof the mechanism was bypassed by hand.
test('AC-20260908-01-10: every `direct` raise in the tracked baseline is inside the largest D15 budget', () => {
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
  const oversize = (baseline.raises || [])
    .filter((r) => r.cite === 'direct' && (r.to - r.from) > 4096)
    .map((r) => r.path + ' +' + (r.to - r.from))
  assert.deepStrictEqual(oversize, [],
    'a `direct` row past 4096 bytes cannot have come from the script, which refuses it — it means the baseline was hand-edited, and the growth has neither a spec nor a bound behind it: ' + JSON.stringify(oversize))
})
