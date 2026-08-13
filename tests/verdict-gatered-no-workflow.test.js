'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, read } = require('./helpers')

// JJ-20260808-01, found during the 2026-08-08 review of specs/20260807/05-explore-taste-channels.md.
// review.md Phase 0 step 8 documents the pre-panel hard-stop invocation as: "The stopped attempt
// still runs `node "$(spec-paths verdict)" --manifest {manifestPath} --ledger --spec {spec path}
// --tier {tier} --diff-loc {diffLoc} --iteration <n>` (no `--workflow` — none exists yet; the
// derivation reaches `GATE_RED` from the manifest alone before it would need one)". But
// verdict.js's usage guard (`profile !== 'release' && !workflowPath`) treats `--workflow` as
// mandatory under the default review profile, so this exact documented invocation exits 2 with a
// usage error instead of GATE_RED — the 05 review session had to hand-craft a stub workflow file
// to work around it. This test pins the doctrine's contract by execution so the gap is visible in
// npm test, not just in a future review session's improvisation.

const SCRIPT = 'scripts/verdict.js'

function writeManifest(dir, rows) {
  const p = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(p, rows.map(r => JSON.stringify(r)).join('\n') + '\n')
  return p
}

const SIX_ROWS_GATE_RED = [
  { leg: 'gate', exit: 1, observed: 'boot-crash' },
  { leg: 'smoke', exit: 4, observed: 'inert' },
  { leg: 'reconcile', exit: 0, observed: 'outOfPlan=0' },
  { leg: 'ac-matrix', exit: 0, observed: 'uncovered=0' },
  { leg: 'skip-reconcile', exit: 0, observed: 'skipped=0' },
  { leg: 'ci', exit: 0, observed: 'unavailable' },
]

test('JJ-20260808-01: review.md Phase 0 step 8\'s documented pre-panel hard-stop invocation (--manifest --ledger, no --workflow) derives GATE_RED and exits 1 from a red gate leg alone', () => {
  const dir = tmpdir('verdict-gatered-no-workflow')
  const manifest = writeManifest(dir, SIX_ROWS_GATE_RED)
  const r = runNode(SCRIPT, ['--manifest', manifest, '--ledger', '--spec', 'x.md',
    '--tier', 'T2', '--diff-loc', '1', '--iteration', '1'])
  assert.strictEqual(r.stdout.split('\n')[0], 'GATE_RED',
    'review.md Phase 0 step 8 documents this exact invocation shape (manifest + --ledger flags, ' +
    'deliberately omitting --workflow because "none exists yet; the derivation reaches GATE_RED ' +
    'from the manifest alone before it would need one") — a red gate row must derive GATE_RED on ' +
    'stdout line 1 without --workflow, or the orchestrator has no way to follow the documented ' +
    'contract and must fabricate a stub workflow file instead (as happened in the 2026-08-08 ' +
    'spec-05 review session): ' + JSON.stringify(r.stdout) + ' / ' + r.stderr)
  assert.strictEqual(r.status, 1,
    'a GATE_RED hard-stop must exit 1 so the caller can mechanically detect the stop and append the ' +
    'row without proceeding to Phase 1 — this invocation currently exits 2 (usage error) because ' +
    'verdict.js\'s guard treats --workflow as mandatory outside --profile release, making review.md\'s ' +
    'documented no-workflow contract unimplementable as written: ' + JSON.stringify(r.stdout) + ' / ' + r.stderr)
})

// JJ-20260808-01 extension (prax is the third corroborating occurrence): the test above pins
// that a GATE_RED review row structurally carries no `runId` — review.md's own documented Phase
// 0 step 8 hard-stop invocation omits --workflow, and no wf-review run ever happened to mint
// one. doctor.md check 12's required-field exemption list accounts for observe/fastPath-build/
// escape/release rows — every one a distinct ROW CLASS with its own field set — but never
// accounts for a pre-panel GATE_RED review row, which is an ordinary review row that simply
// never reached the point of having a runId. prax: 5 of 6 GATE_RED rows carried runId:null and
// all 5 tripped check 12 on a host doing exactly what review.md documents. The correct contract
// is narrower than a blanket row-class exemption: runId is OPTIONAL on GATE_RED review rows
// specifically (an in-workflow iteration that goes red legitimately still carries one), never
// exempt outright.
const doctor = read('spec/commands/doctor.md')
const check12 = doctor.slice(doctor.indexOf('12. **Run ledger hygiene'), doctor.indexOf('13. **Scaffold audit'))

test('JJ-20260808-01 (prax): doctor.md check 12 admits a GATE_RED review row with null/absent runId as OPTIONAL, never as a blanket row-class exemption', () => {
  assert.notStrictEqual(check12, '',
    'could not locate check 12\'s text block via the "12. **Run ledger hygiene" / ' +
    '"13. **Scaffold audit" markers — update the slice bounds if the checks were renumbered')
  assert.match(check12, /GATE_RED/,
    'doctor.md check 12\'s required-field exemption list names observe rows, fast-path build ' +
    'rows, escape rows, and release rows as sanctioned row classes with their own field sets, ' +
    'but never mentions GATE_RED review rows — prax: a pre-panel GATE_RED hard-stop structurally ' +
    'has no runId (review.md\'s own documented invocation omits --workflow, so no wf-review run ' +
    'ever existed to mint one), and 5 of 6 such rows tripped check 12 on a host following ' +
    'review.md exactly as written, because runId is required for every review row with no carve-out')
})
