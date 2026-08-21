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

// specs/20260815/02-at-risk-pins.md D4/D1 (AC-20260815-02-9, self-application, CONTINUE TO):
// `at-risk` joins REVIEW_LEGS as a required-but-non-blocking leg (found by Phase 4's pre-image
// check as an in-flight File Plan row) — the row is added to both six-leg manifests below so
// the tests CONTINUE TO derive the same verdict words/exit codes they already assert.
//
// specs/20260817/07-promise-sweep-leg.md D4 (AC-20260817-07-13, CONTINUE TO): 'promise-sweep'
// joins REVIEW_LEGS the same way — required-but-non-blocking in both scopes — and A2's executed
// redden spike named this file as one of the three suites the extension reds. The row is added
// to both fixture manifests below so these two pins CONTINUE TO derive GATE_RED / exit 2
// unweakened; this file carries no new tests, only the retargeted fixtures.
//
// specs/20260820/06-typed-evidence-manifest.md D1/D2 (2026-08-20, brief 16's second move): every
// manifest row's `observed` field becomes a typed JSON object — the two fixtures below are
// retyped in place; this file's own assertions (GATE_RED presence, no-workflow-green-manifest
// usage error) key on `exit` alone and never inspect `observed`, so no assertion text changes.
const SIX_ROWS_GATE_RED = [
  { leg: 'gate', exit: 1, observed: { unavailable: 'gate-unresolvable', detail: 'boot-crash' } },
  { leg: 'smoke', exit: 4, observed: { result: 'inert' } },
  { leg: 'reconcile', exit: 0, observed: { outOfPlan: 0 } },
  { leg: 'ac-matrix', exit: 0, observed: { uncovered: 0, oracle: 0 } },
  { leg: 'skip-reconcile', exit: 0, observed: { skipped: 0, sanctioned: 0 } },
  { leg: 'ci', exit: 0, observed: { unavailable: 'no-adapter' } },
  { leg: 'at-risk', exit: 0, observed: { files: 0, testsExecuted: 0 } },
  { leg: 'promise-sweep', exit: 0, observed: { rows: 1, carried: 1, sanctioned: 0, orphans: 0 } },
]

test('JJ-20260808-01 / AC-20260813-03-7 (CONTINUE TO AC-20260815-02-9 / AC-20260817-07-13): review.md Phase 0 step 8\'s documented pre-panel hard-stop invocation (--manifest --ledger, no --workflow) derives GATE_RED and exits 1 from a red gate leg alone', () => {
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
// AC-20260813-03-8: a manifest that is green and complete stays undecidable without a panel —
// the D3 guard's protective asymmetry (Contracts: the green-manifest path exits 2 naming
// --workflow as the remedy: "verdict.js: all legs green — the panel must run; pass --workflow
// <path to the wf-review return>"). This must never derive CLEAN by manifest evidence alone.
const SIX_ROWS_GREEN = [
  { leg: 'gate', exit: 0, observed: { skips: 0, todos: 0, testsExecuted: 0 } },
  { leg: 'smoke', exit: 4, observed: { result: 'inert' } },
  { leg: 'reconcile', exit: 0, observed: { outOfPlan: 0 } },
  { leg: 'ac-matrix', exit: 0, observed: { uncovered: 0, oracle: 0 } },
  { leg: 'skip-reconcile', exit: 0, observed: { skipped: 0, sanctioned: 0 } },
  { leg: 'ci', exit: 0, observed: { unavailable: 'no-adapter' } },
  { leg: 'at-risk', exit: 0, observed: { files: 0, testsExecuted: 0 } },
  { leg: 'promise-sweep', exit: 0, observed: { rows: 1, carried: 1, sanctioned: 0, orphans: 0 } },
]

test('AC-20260813-03-8 (CONTINUE TO AC-20260815-02-9 / AC-20260817-07-13): verdict.js --manifest with no --workflow on a green, complete manifest exits 2 with a usage error naming --workflow as the remedy, never a derived CLEAN', () => {
  const dir = tmpdir('verdict-gatered-no-workflow')
  const manifest = writeManifest(dir, SIX_ROWS_GREEN)
  const r = runNode(SCRIPT, ['--manifest', manifest])
  assert.strictEqual(r.status, 2,
    'a panel-less CLEAN must stay structurally unreachable (Contracts: "a green run without a panel ' +
    'remains exit 2 — this asymmetry is the whole design") — six green legs with no --workflow must exit ' +
    '2 as a usage error, never 0/CLEAN by manifest evidence alone: ' + JSON.stringify(r.stdout) + ' / ' + r.stderr)
  assert.match(r.stderr, /all legs green/i,
    'the usage error must name the specific reason (all legs are green so a panel is now required), not ' +
    'the generic flag-syntax usage() banner that already prints on every malformed invocation today — a ' +
    'caller reading a generic banner cannot distinguish "you typed the flags wrong" from "the panel must ' +
    'run": ' + JSON.stringify(r.stderr))
  assert.match(r.stderr, /--workflow/,
    'the usage error must name --workflow as the remedy so the orchestrator knows exactly which flag to ' +
    'supply: ' + JSON.stringify(r.stderr))
})
