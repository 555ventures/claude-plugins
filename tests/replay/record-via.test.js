'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260903/01-owed-query-and-row-handoff.md D8/D9: `replay.js --record` gains
// `--via driver|manual` (exactly "driver" stamps via:"driver"; absent or anything else stamps
// "manual"), and `--stats` gains one `by-via driver=N manual=N unknown=N` line after `catch-rate`
// and before `per-class:`. Pins AC-20260903-01-10, AC-20260903-01-11. Neither `via` on the
// --record row nor the `by-via` stats line exists on the pre-image tree — every assertion below
// fails today (TDD red phase), not on a stub that merely exits non-zero.

const SCRIPT = 'scripts/replay.js'

// Reuses the full-argument-set shape tests/replay/replay.test.js's own AC-20260819-02-6 /
// AC-20260903-01-15 test drives, minus the fixed --outcome/--legs/--tokens it doesn't vary here.
function recordArgs(root, extra = []) {
  const patchFile = path.join(root, 'mutation.patch')
  fs.writeFileSync(patchFile, '--- a/lib/x.js\n+++ b/lib/x.js\n@@ -1 +1 @@\n-a\n+B\n')
  const workflowFile = path.join(root, 'workflow.json')
  fs.writeFileSync(workflowFile, JSON.stringify({ verdict: 'CLEAN', survivors: [], killed: 0 }))
  return ['--record',
    '--spec', 'specs/20260903/01-owed-query-and-row-handoff.md',
    '--review-run-id', 'rv_aaaaaaaaaaaa',
    '--class', 'silent-fallback',
    '--legs', 'green',
    '--outcome', 'caught',
    '--patch', patchFile,
    '--workflow', workflowFile,
    '--tokens', '100',
    ...extra,
  ]
}

// AC-20260903-01-10
test('AC-20260903-01-10: --record --via driver appends via:"driver" on the row and artifact and prints "via=driver"; an absent --via or an out-of-enum --via value stamps via:"manual" and prints "via=manual"', () => {
  const rootDriver = fs.realpathSync(tmpdir('record-via-driver'))
  const rDriver = runNode(SCRIPT, recordArgs(rootDriver, ['--via', 'driver']), { cwd: rootDriver })
  assert.strictEqual(rDriver.status, 0, 'D8: a --record invocation carrying --via driver must still succeed: ' + rDriver.stderr)
  assert.match(rDriver.stdout, /^recorded runId=rp_[0-9a-f]{12} via=driver$/m,
    'D8: the stdout confirmation must read "recorded runId=<rp_…> via=driver" exactly — the review driver copies this literal shape into its own step output: ' + rDriver.stdout)
  const rowDriver = JSON.parse(fs.readFileSync(path.join(rootDriver, '.claude/spec-runs.jsonl'), 'utf8').trim())
  assert.strictEqual(rowDriver.via, 'driver',
    'D8: --via driver must stamp exactly "driver" on the appended ledger row, never left absent or coerced: ' + JSON.stringify(rowDriver))
  const artifactDriver = JSON.parse(fs.readFileSync(path.join(rootDriver, '.claude/spec-runs', rowDriver.runId + '.json'), 'utf8'))
  assert.strictEqual(artifactDriver.via, 'driver',
    'D8: the retained evidence artifact must carry the same via field as the ledger row — a diverging artifact would let /spec:escape-style provenance work read a stale value: ' + JSON.stringify(artifactDriver))

  const rootAbsent = fs.realpathSync(tmpdir('record-via-absent'))
  const rAbsent = runNode(SCRIPT, recordArgs(rootAbsent), { cwd: rootAbsent })
  assert.strictEqual(rAbsent.status, 0, 'D8: a --record invocation with no --via flag at all must still succeed: ' + rAbsent.stderr)
  assert.match(rAbsent.stdout, /^recorded runId=rp_[0-9a-f]{12} via=manual$/m,
    'D8: an absent --via must print "via=manual" — mirroring build/review\'s existing default-to-manual rule so every pre-change --record caller keeps working unchanged: ' + rAbsent.stdout)
  const rowAbsent = JSON.parse(fs.readFileSync(path.join(rootAbsent, '.claude/spec-runs.jsonl'), 'utf8').trim())
  assert.strictEqual(rowAbsent.via, 'manual',
    'D8: an absent --via must stamp "manual" on the row, never leave the field undefined or null: ' + JSON.stringify(rowAbsent))

  const rootBogus = fs.realpathSync(tmpdir('record-via-bogus'))
  const rBogus = runNode(SCRIPT, recordArgs(rootBogus, ['--via', 'cron']), { cwd: rootBogus })
  assert.strictEqual(rBogus.status, 0, 'D8: an out-of-enum --via value must still succeed (never a usage refusal) — it is honestly downgraded to manual, not rejected: ' + rBogus.stderr)
  assert.match(rBogus.stdout, /^recorded runId=rp_[0-9a-f]{12} via=manual$/m,
    'D8: --via cron (anything but exactly "driver") must print "via=manual": ' + rBogus.stdout)
  const rowBogus = JSON.parse(fs.readFileSync(path.join(rootBogus, '.claude/spec-runs.jsonl'), 'utf8').trim())
  assert.strictEqual(rowBogus.via, 'manual',
    'D8: --via cron must stamp "manual" on the row — only the exact literal "driver" may stamp "driver": ' + JSON.stringify(rowBogus))
})

// AC-20260903-01-11
test('AC-20260903-01-11: --stats prints "by-via driver=1 manual=2 unknown=1" after the catch-rate line and before per-class:, and the existing total/five-bucket/catch-rate lines print unchanged', () => {
  const root = fs.realpathSync(tmpdir('record-via-stats'))
  const rows = [
    { ts: '2026-08-10T00:00:00Z', stage: 'replay', spec: 'specs/x.md', runId: 'rp_000000000001', reviewRunId: 'rv_000000000001', class: 'silent-fallback', files: ['lib/a.js'], legs: 'green', outcome: 'caught', tokens: 100, via: 'driver' },
    { ts: '2026-08-11T00:00:00Z', stage: 'replay', spec: 'specs/x.md', runId: 'rp_000000000002', reviewRunId: 'rv_000000000002', class: 'silent-fallback', files: ['lib/b.js'], legs: 'green', outcome: 'missed', tokens: 100, via: 'manual' },
    { ts: '2026-08-12T00:00:00Z', stage: 'replay', spec: 'specs/x.md', runId: 'rp_000000000003', reviewRunId: 'rv_000000000003', class: 'boundary-shift', files: ['lib/c.js'], legs: 'red:gate', outcome: 'leg-caught', tokens: 0, via: 'manual' },
    { ts: '2026-08-13T00:00:00Z', stage: 'replay', spec: 'specs/x.md', runId: 'rp_000000000004', reviewRunId: 'rv_000000000004', class: 'boundary-shift', files: ['lib/d.js'], legs: 'red:reconcile', outcome: 'unresolved', tokens: 0 },
  ]
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec-runs.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n')

  const r = runNode(SCRIPT, ['--stats'], { cwd: root })
  assert.strictEqual(r.status, 0, 'D9: --stats over a ledger holding replay rows (with and without via) must still succeed: ' + r.stderr)
  assert.match(r.stdout, /^total 4$/m, 'D9: the existing total line must still print, unchanged by the by-via addition: ' + r.stdout)
  assert.match(r.stdout, /^caught 1$/m, 'D9: the existing caught bucket line must still print unchanged: ' + r.stdout)
  assert.match(r.stdout, /^missed 1$/m, 'D9: the existing missed bucket line must still print unchanged: ' + r.stdout)
  assert.match(r.stdout, /^leg-caught 1$/m, 'D9: the existing leg-caught bucket line must still print unchanged: ' + r.stdout)
  assert.match(r.stdout, /^unresolved 1$/m, 'D9: the existing unresolved bucket line must still print unchanged: ' + r.stdout)
  assert.match(r.stdout, /^setup-failed 0$/m, 'D9: the existing setup-failed bucket line must still print unchanged: ' + r.stdout)
  assert.match(r.stdout, /^catch-rate 1\/2$/m,
    'D9: the existing catch-rate line (caught\/(caught+missed)) must still print unchanged: ' + r.stdout)
  assert.match(r.stdout, /^catch-rate 1\/2\nby-via driver=1 manual=2 unknown=1\nper-class:$/m,
    'D9: the by-via line must print immediately after catch-rate and immediately before per-class: — driver=1 (row 1), manual=2 (rows 2-3), unknown=1 (row 4, no via field at all): ' + r.stdout)
})
