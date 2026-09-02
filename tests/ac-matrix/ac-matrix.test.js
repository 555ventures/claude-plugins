'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, runBash, SPEC } = require('../helpers')

// AC-20260821-01-2 additionally pins lib/spec-sections.js's parseAcBullets directly for exact
// per-tag VALUES — a plain require()able library, unlike a workflow script (mirrors
// tests/red-check/red-check.test.js's existing idiom).
const { parseAcBullets } = require('../../spec/scripts/lib/spec-sections')

// specs/20260814/01-ac-matrix-script.md D7: pins spec/scripts/ac-matrix.js, the sole-derivation
// replacement for review.md Phase 0's AC-line lint, AC<->test coverage matrix, [oracle:]/[env:]
// handling, and skipped-test reconciliation, by executing it against synthetic host trees —
// never against implementation internals. Scoped under tests/ac-matrix/ so other specs' gate
// runs stay pin-free.
//
// Also pins: specs/20260817/07-promise-sweep-leg.md D3 (AC-20260817-07-14: AC_ID_RE,
// AC_ID_RE_GLOBAL, extractSection, and parseAcBullets live in spec/scripts/lib/spec-sections.js,
// which ac-matrix.js imports — this whole suite is the byte-identity pin for that extraction);
// specs/20260820/04-entrypoint-conformance.md D13 (`missing-test-file` skips ONLY an explicit
// `DELETE` File Plan action; a `CREATE` row or a row whose table binds no Action column at all
// keeps the existence requirement); specs/20260820/06-typed-evidence-manifest.md D2/D8
// (AC-20260820-06-10: ac-matrix.js's manifest rows and `--json` `observed` field use the typed
// objects {"uncovered":N,"oracle":N} and {"skipped":N,"sanctioned":N}); specs/20260821/01-red-check.md
// D1/D6 (the `[pre-green: <reason>]` AC tag, closed enum `fallback-rejection |
// absence-invariant | predicate-in-test`, extends the acMatrix row to
// {"uncovered":N,"oracle":N,"preGreen":N}); specs/20260823/03-silent-drop-hardening.md D1/D2
// (bare-trailing-tag AC-5, mid-sentence-quoted-null AC-6, and the rejected-trailing-tag
// reclassification of AC-20260823-03-1 below — see
// specs/20260823/03-silent-drop-hardening.deviations.md).

function specMd(acLines, filePlanRows) {
  return '# Test Spec\n\n## Acceptance Criteria\n\n' + acLines.join('\n') + '\n\n' +
    '## File Plan\n\n| Path | Action | Layer | Summary |\n|------|--------|-------|---------|\n' +
    filePlanRows.join('\n') + '\n'
}

// D13 fixture idiom: unlike specMd() above, this table's header row binds NO Action column at
// all (lib/file-plan.js's walkFilePlanTables sets actionIdx=-1 for the whole table when its
// first non-separator row carries no cell matching /^actions?$/i) — a genuinely absent column,
// not merely an empty cell in a row of an Action-bearing table.
function specMdNoActionColumn(acLines, filePlanRows) {
  return '# Test Spec\n\n## Acceptance Criteria\n\n' + acLines.join('\n') + '\n\n' +
    '## File Plan\n\n| Path | Layer | Summary |\n|------|-------|---------|\n' +
    filePlanRows.join('\n') + '\n'
}

function writeManifest(dir, lines) {
  const p = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n') + (lines.length ? '\n' : ''))
  return p
}

function run(specPath, root, manifestPath, extraArgs = []) {
  return runNode('scripts/ac-matrix.js',
    ['--spec', specPath, '--root', root, '--manifest', manifestPath, ...extraArgs])
}

function findings(res) {
  let parsed
  try { parsed = JSON.parse(res.stdout) } catch (e) {
    assert.fail(`--json output did not parse as JSON (status ${res.status}, stderr: ${res.stderr}): ${e.message}`)
  }
  return parsed
}

test('AC-20260815-03-1: a malformed leading bold token emits a hard malformed-ac finding, exit 1, AND the fail-closed uncovered count includes the malformed bullet (retargets AC-20260814-01-1, which asserted the retired uncovered=0 exemption)', () => {
  const dir = tmpdir('acm1')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), '// covers AC-20260814-01-1\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-2026-1**: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js',
      '- **AC-20260814-01-1**: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js'],
    ['| tests/foo.test.js | CREATE | tests | covers ACs |']))
  const manifest = writeManifest(dir, [])
  const res = run(spec, dir, manifest, ['--json'])
  assert.strictEqual(res.status, 1, `a malformed AC-ID must trip a hard finding and exit 1, not exit 0/2 (stderr: ${res.stderr})`)
  const out = findings(res)
  assert.ok(out.findings.some(f => f.class === 'malformed-ac'),
    'AC-2026-1 fails the full anchored AC-ID match (missing the -NN-N ordinal segments) and must ' +
    'surface as a malformed-ac finding — a malformed id is invisible to every downstream AC-ID grep')
  assert.deepStrictEqual(out.observed.acMatrix, { uncovered: 1, oracle: 0, preGreen: 0 },
    `unparseable = unknown = uncovered (D1): the malformed AC-2026-1 bullet must increment uncovered ` +
    `even though it also trips its own malformed-ac finding — a reviewer who waives that one notation ` +
    `finding must not then be told by the durable manifest row that coverage is complete. ` +
    `AC-20260814-01-1 stays well-formed and covered so it must NOT also add a second uncovered-ac row. ` +
    `specs/20260821/01-red-check.md D6 extends this typed row with preGreen — neither fixture bullet ` +
    `carries a [pre-green:] tag, so preGreen must be 0 ` +
    `— got ${JSON.stringify(out.observed.acMatrix)}`)
})

test('AC-20260814-01-2: a well-formed AC-ID with zero hits and no [oracle:] tag emits a hard uncovered-ac finding with observed uncovered=1 oracle=0', () => {
  const dir = tmpdir('acm2')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/bar.test.js'), '// no matrix id present here\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260814-01-2**: WHEN X THE SYSTEM SHALL Y → tests/bar.test.js'],
    ['| tests/bar.test.js | CREATE | tests | covers AC |']))
  const manifest = writeManifest(dir, [])
  const res = run(spec, dir, manifest, ['--json'])
  assert.strictEqual(res.status, 1, `an AC-ID with zero grep hits across its own File Plan test rows must be a hard finding (stderr: ${res.stderr})`)
  const out = findings(res)
  assert.ok(out.findings.some(f => f.class === 'uncovered-ac' && f.ac === 'AC-20260814-01-2'),
    'AC-20260814-01-2 never appears as a literal inside tests/bar.test.js and carries no [oracle:] ' +
    'tag, so it must surface as a named uncovered-ac finding — otherwise an untested AC rides to CLEAN')
  assert.deepStrictEqual(out.observed.acMatrix, { uncovered: 1, oracle: 0, preGreen: 0 },
    `observed must be the exact pinned typed object verdict.js reads field-by-field — specs/20260821/01-red-check.md ` +
    `D6 extends this row with preGreen, 0 here since the fixture bullet carries no [pre-green:] tag — got ${JSON.stringify(out.observed.acMatrix)}`)
})

test('AC-20260814-01-3a / continues AC-20260815-03-7: an [oracle:] AC whose declared leg is green in the manifest is excluded from uncovered, counted in oracle=, and warned (not a finding)', () => {
  const dir = tmpdir('acm3a')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/oracle.test.js'), '// unrelated\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260814-01-3** `[oracle: gate]`: WHEN X THE SYSTEM SHALL Y → tests/oracle.test.js'],
    ['| tests/oracle.test.js | CREATE | tests | covers AC |']))
  const manifest = writeManifest(dir, [{ leg: 'gate', exit: 0, observed: 'skips=0 todos=0' }])
  const res = run(spec, dir, manifest, ['--json'])
  const out = findings(res)
  assert.ok(!out.findings.some(f => f.ac === 'AC-20260814-01-3'),
    'AC-20260814-01-3 has zero literal test hits but declares [oracle: gate], and the manifest\'s ' +
    'gate row is green — it must be covered-by-declaration, never an uncovered-ac finding')
  assert.deepStrictEqual(out.observed.acMatrix, { uncovered: 0, oracle: 1, preGreen: 0 },
    `a green-oracle AC must be counted in the typed object's "oracle" field — specs/20260821/01-red-check.md ` +
    `D6 extends this row with preGreen, 0 here since the fixture bullet carries no [pre-green:] tag — got ${JSON.stringify(out.observed.acMatrix)}`)
  assert.ok(out.warnings.some(w => /oracle/i.test(w) && /gate/i.test(w)),
    'coverage-by-declaration must still surface as a named warning line ("AC-x: oracle = `gate` leg") — never silent green')
  assert.strictEqual(res.status, 0,
    `AC-20260815-03-7: a spec whose only AC is well-formed and covered (by declaration) must CONTINUE ` +
    `TO exit 0 — got ${res.status} (stderr: ${res.stderr})`)
})

test('AC-20260814-01-3b: an [oracle:] AC whose declared leg is red or absent from the manifest is a hard oracle-red-or-absent finding, identical standing to uncovered', () => {
  const dir = tmpdir('acm3b')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/oracle.test.js'), '// unrelated\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260814-01-3** `[oracle: gate]`: WHEN X THE SYSTEM SHALL Y → tests/oracle.test.js'],
    ['| tests/oracle.test.js | CREATE | tests | covers AC |']))
  // No manifest row for `gate` at all — the declared oracle leg never ran.
  const manifest = writeManifest(dir, [])
  const res = run(spec, dir, manifest, ['--json'])
  assert.strictEqual(res.status, 1, `an absent declared oracle leg must be a hard finding, not silent coverage (stderr: ${res.stderr})`)
  const out = findings(res)
  assert.ok(out.findings.some(f => f.class === 'oracle-red-or-absent' && f.ac === 'AC-20260814-01-3'),
    'gate never appears in the manifest at invocation time (never ran) — this must read as a hard ' +
    'oracle-red-or-absent finding, standing identical to an uncovered AC, never covered-by-declaration')
})

test('AC-20260814-01-4a / continues AC-20260815-03-8: a skipped test whose AC line carries [env: TEST_DB] is sanctioned, observed skipped=1 sanctioned=1, and warns naming TEST_DB', () => {
  const dir = tmpdir('acm4a')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/env.test.js'), '// covers AC-20260814-01-4\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260814-01-4** `[env: TEST_DB]`: WHEN X THE SYSTEM SHALL Y → tests/env.test.js'],
    ['| tests/env.test.js | CREATE | tests | covers AC |']))
  const manifest = writeManifest(dir, [])
  const skips = path.join(dir, 'skips.txt')
  fs.writeFileSync(skips, 'skipped test for AC-20260814-01-4 database round-trip\n')
  const res = run(spec, dir, manifest, ['--skips', skips, '--json'])
  const out = findings(res)
  assert.deepStrictEqual(out.observed.skipReconcile, { skipped: 1, sanctioned: 1 },
    `a skip mapped to an [env:]-declared AC must be sanctioned — got ${JSON.stringify(out.observed.skipReconcile)}`)
  assert.ok(out.warnings.some(w => /TEST_DB/.test(w)),
    'the sanctioned skip must warn naming the un-run environment (TEST_DB) — never silent green')
  assert.ok(!out.findings.some(f => f.class === 'unsanctioned-skip'),
    'an [env:]-declared skip must not also be reported as an unsanctioned-skip hard finding')
})

test('AC-20260814-01-4b: a skipped test mapped to an AC with no [env:] tag is a hard unsanctioned-skip finding, observed skipped=1 sanctioned=0', () => {
  const dir = tmpdir('acm4b')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/noenv.test.js'), '// covers AC-20260814-01-4\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260814-01-4**: WHEN X THE SYSTEM SHALL Y → tests/noenv.test.js'],
    ['| tests/noenv.test.js | CREATE | tests | covers AC |']))
  const manifest = writeManifest(dir, [])
  const skips = path.join(dir, 'skips.txt')
  fs.writeFileSync(skips, 'skipped test for AC-20260814-01-4 no env declared\n')
  const res = run(spec, dir, manifest, ['--skips', skips, '--json'])
  assert.strictEqual(res.status, 1, `a mapped skip with no [env:] declaration must be a hard finding (stderr: ${res.stderr})`)
  const out = findings(res)
  assert.ok(out.findings.some(f => f.class === 'unsanctioned-skip' && f.ac === 'AC-20260814-01-4'),
    'AC-20260814-01-4 carries no [env: VAR] tag on this fixture, so its mapped skip must be an ' +
    'unsanctioned-skip hard finding, identical standing to an uncovered AC — a silently-skipped ' +
    'test caught a real defect once (UpWell)')
  assert.deepStrictEqual(out.observed.skipReconcile, { skipped: 1, sanctioned: 0 },
    `an unsanctioned skip must not be counted toward the typed object's "sanctioned" field — got ${JSON.stringify(out.observed.skipReconcile)}`)
})

test('AC-20260814-01-5: a skipped test name matching no AC-ID and no File Plan test file is a hard unmapped-skip finding naming the test', () => {
  const dir = tmpdir('acm5')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/unrelated.test.js'), '// unrelated content\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260814-01-5**: WHEN X THE SYSTEM SHALL Y → tests/unrelated.test.js'],
    ['| tests/unrelated.test.js | CREATE | tests | covers AC |']))
  const manifest = writeManifest(dir, [])
  const skips = path.join(dir, 'skips.txt')
  const orphanName = 'a totally orphaned skipped test with no AC anywhere'
  fs.writeFileSync(skips, orphanName + '\n')
  const res = run(spec, dir, manifest, ['--skips', skips, '--json'])
  assert.strictEqual(res.status, 1, `an unmapped skip must be a hard finding, never silently dropped (stderr: ${res.stderr})`)
  const out = findings(res)
  const f = out.findings.find(f => f.class === 'unmapped-skip')
  assert.ok(f, 'a skip line matching no embedded AC-ID and no File Plan test file content must surface as unmapped-skip')
  assert.ok(f.detail.includes(orphanName),
    `the unmapped-skip finding must name the actual skipped test so a human can find it — got detail "${f.detail}"`)
})

test('AC-20260814-01-6: the script appends exactly two JSONL manifest rows, and verdict.js derives the pinned testsSkipped object from them unchanged', () => {
  const dir = tmpdir('acm6')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/six.test.js'),
    '// covers AC-20260814-06-1 AC-20260814-06-2 AC-20260814-06-3\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260814-06-1** `[env: DB_ONE]`: WHEN X THE SYSTEM SHALL Y → tests/six.test.js',
      '- **AC-20260814-06-2** `[env: DB_TWO]`: WHEN X THE SYSTEM SHALL Y → tests/six.test.js',
      '- **AC-20260814-06-3**: WHEN X THE SYSTEM SHALL Y → tests/six.test.js'],
    ['| tests/six.test.js | CREATE | tests | covers ACs |']))
  const manifest = writeManifest(dir, [{ leg: 'gate', exit: 0, observed: { skips: 3, todos: 0, testsExecuted: 6 } }])
  const before = fs.readFileSync(manifest, 'utf8').trim().split('\n').filter(Boolean)
  const skips = path.join(dir, 'skips.txt')
  fs.writeFileSync(skips, [
    'skipped test AC-20260814-06-1 round trip',
    'skipped test AC-20260814-06-2 round trip',
    'skipped test AC-20260814-06-3 round trip'
  ].join('\n') + '\n')
  run(spec, dir, manifest, ['--skips', skips])

  const lines = fs.readFileSync(manifest, 'utf8').trim().split('\n').filter(Boolean)
  const appended = lines.slice(before.length).map(l => JSON.parse(l))
  assert.strictEqual(appended.length, 2,
    `ac-matrix.js must append exactly two JSONL rows (ac-matrix, skip-reconcile) to --manifest itself — got ${appended.length}`)
  assert.deepStrictEqual(appended.map(r => r.leg).sort(), ['ac-matrix', 'skip-reconcile'],
    `the two appended rows must be leg "ac-matrix" and leg "skip-reconcile" — got ${JSON.stringify(appended.map(r => r.leg))}`)
  const skipRow = appended.find(r => r.leg === 'skip-reconcile')
  assert.deepStrictEqual(skipRow.observed, { skipped: 3, sanctioned: 2 },
    `skip-reconcile's observed must be the typed object reconciling 3 skips, 2 env-sanctioned — got ${JSON.stringify(skipRow.observed)}`)

  const verdictRes = require('node:child_process').spawnSync(process.execPath,
    [path.join(SPEC, 'scripts/verdict.js'), '--manifest', manifest, '--ledger'], { encoding: 'utf8' })
  const ledgerLine = verdictRes.stdout.trim().split('\n').pop()
  let ledger
  try { ledger = JSON.parse(ledgerLine) } catch (e) {
    assert.fail(`verdict.js --ledger did not print a parseable ledger row fed the script-written manifest: ${e.message} (stderr: ${verdictRes.stderr})`)
  }
  assert.deepStrictEqual(ledger.testsSkipped, { total: 3, sanctioned: 2, unsanctioned: 1 },
    'verdict.js must derive the SAME testsSkipped object from a script-appended manifest as from a ' +
    'hand-written one with identical observed strings — the producer-chain pin for the whole legs->verdict path')
})

test('AC-20260814-01-7: --has-drift-script suppresses uncovered-ac findings while lint and skip reconciliation still run', () => {
  const dir = tmpdir('acm7')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/seven.test.js'), '// no ids present\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-2026-1**: WHEN X THE SYSTEM SHALL Y → tests/seven.test.js',
      '- **AC-20260814-01-7**: WHEN X THE SYSTEM SHALL Y → tests/seven.test.js'],
    ['| tests/seven.test.js | CREATE | tests | covers ACs |']))
  const manifest = writeManifest(dir, [])
  const skips = path.join(dir, 'skips.txt')
  fs.writeFileSync(skips, 'a skip line naming no AC and no test file\n')
  const res = run(spec, dir, manifest, ['--has-drift-script', '--skips', skips, '--json'])
  const out = findings(res)
  assert.ok(!out.findings.some(f => f.class === 'uncovered-ac'),
    'with --has-drift-script the host driftScript owns coverage — AC-20260814-01-7 has zero test ' +
    'hits and must NOT surface as an uncovered-ac finding here (that would double-report coverage)')
  assert.ok(out.findings.some(f => f.class === 'malformed-ac'),
    'lint runs in BOTH drift modes — AC-2026-1 must still be flagged malformed-ac under --has-drift-script')
  assert.ok(out.findings.some(f => f.class === 'unmapped-skip'),
    'skip reconciliation runs in BOTH drift modes — the unmapped skip line must still be flagged under --has-drift-script')
})

test('AC-20260815-03-9: --has-drift-script still counts a malformed AC bullet toward uncovered — the fail-closed denominator applies in drift mode too', () => {
  const dir = tmpdir('acm9')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/nine.test.js'), '// covers AC-20260814-01-9\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-2026-1**: WHEN X THE SYSTEM SHALL Y → tests/nine.test.js',
      '- **AC-20260814-01-9**: WHEN X THE SYSTEM SHALL Y → tests/nine.test.js'],
    ['| tests/nine.test.js | CREATE | tests | covers ACs |']))
  const manifest = writeManifest(dir, [])
  const res = run(spec, dir, manifest, ['--has-drift-script', '--json'])
  const out = findings(res)
  assert.ok(out.findings.some(f => f.class === 'malformed-ac'),
    'lint runs in BOTH drift modes — AC-2026-1 must still be flagged malformed-ac under --has-drift-script')
  assert.deepStrictEqual(out.observed.acMatrix, { uncovered: 1, oracle: 0, preGreen: 0 },
    'today --has-drift-script structurally skips the well-formed coverage loop entirely (the host ' +
    'driftScript owns coverage there), so the manifest row records uncovered:0 no matter how many ' +
    'unparseable bullets sit in the AC section — the same fail-closed-denominator hole as AC-20260815-03-1, ' +
    'just reached through the other code path (D1: "the malformed term applies in --has-drift-script mode ' +
    'too"). specs/20260821/01-red-check.md D6 extends this row with preGreen, 0 here since neither fixture ' +
    `bullet carries a [pre-green:] tag. got ${JSON.stringify(out.observed.acMatrix)}`)
})

test('AC-20260814-01-8a: invocation with no --spec exits 2 with a stderr line naming the remedy command', () => {
  const dir = tmpdir('acm8a')
  const manifest = writeManifest(dir, [])
  const res = runNode('scripts/ac-matrix.js', ['--root', dir, '--manifest', manifest])
  assert.strictEqual(res.status, 2, `missing --spec must be a usage error (exit 2), got ${res.status}`)
  assert.match(res.stderr, /ac-matrix\.js/, 'the usage error must name the remedy command (ac-matrix.js invocation) so the failure is actionable')
})

test('AC-20260814-01-8b: a spec with no ## Acceptance Criteria section exits 2 with a stderr line naming the remedy', () => {
  const dir = tmpdir('acm8b')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, '# Test Spec\n\nNo AC section at all.\n')
  const manifest = writeManifest(dir, [])
  const res = run(spec, dir, manifest)
  assert.strictEqual(res.status, 2, `a spec with no ## Acceptance Criteria section must be a usage-tier error (exit 2), got ${res.status}`)
  assert.notStrictEqual(res.stderr.trim(), '', 'the exit-2 path must print a stderr line naming the remedy, never a silent exit')
})

test('AC-20260814-01-8c: spec-paths ac-matrix prints the script\'s existing absolute path', () => {
  const res = runBash('bin/spec-paths', ['ac-matrix'])
  assert.strictEqual(res.status, 0, `spec-paths must register the ac-matrix key so callers can resolve the script (stderr: ${res.stderr})`)
  const printed = res.stdout.trim().split('\n').pop()
  assert.strictEqual(printed, path.join(SPEC, 'scripts/ac-matrix.js'),
    `spec-paths ac-matrix must print the absolute path to spec/scripts/ac-matrix.js — got "${printed}"`)
  assert.ok(fs.existsSync(printed), 'the printed path must actually exist — an unregistered/missing script fails every command that resolves it via spec-paths')
})

test('AC-20260820-04-7: a DELETE-action tests-layer File Plan row naming a missing file raises no missing-test-file finding, while an otherwise-identical CREATE row or a row whose table binds no Action column still does', () => {
  // Arm 1 (the red arm — D13's fix is not yet written): DELETE + missing file must NOT raise.
  const dirDelete = tmpdir('acm-d13-delete')
  fs.mkdirSync(path.join(dirDelete, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dirDelete, 'tests/covered.test.js'), '// covers AC-20260820-04-7\n')
  const specDelete = path.join(dirDelete, 'spec.md')
  fs.writeFileSync(specDelete, specMd(
    ['- **AC-20260820-04-7**: WHEN X THE SYSTEM SHALL Y → tests/covered.test.js'],
    ['| tests/covered.test.js | CREATE | tests | dummy row so the AC bullet is covered, isolating this arm to the missing-test-file class |',
      '| tests/gone-delete.test.js | DELETE | tests | D13: File Plan plans this test file\'s deletion; it is correctly already absent |']))
  const manifestDelete = writeManifest(dirDelete, [])
  const resDelete = run(specDelete, dirDelete, manifestDelete, ['--json'])
  const outDelete = findings(resDelete)
  assert.ok(!outDelete.findings.some(f => f.class === 'missing-test-file'),
    'D13: a tests-layer row whose Action is DELETE is satisfied by the named file\'s absence, not violated by it — ' +
    'it must never raise missing-test-file, or every spec that plans a test deletion (this spec\'s own D7 row, ' +
    'tests/advisory-append/advisory-append.test.js) fails ac-matrix by construction on a correctly-classified row')

  // Arm 2: an otherwise-identical CREATE row naming a missing file must still raise — proves
  // the fix is scoped to DELETE, not a blanket disable of the check.
  const dirCreate = tmpdir('acm-d13-create')
  fs.mkdirSync(path.join(dirCreate, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dirCreate, 'tests/covered.test.js'), '// covers AC-20260820-04-7\n')
  const specCreate = path.join(dirCreate, 'spec.md')
  fs.writeFileSync(specCreate, specMd(
    ['- **AC-20260820-04-7**: WHEN X THE SYSTEM SHALL Y → tests/covered.test.js'],
    ['| tests/covered.test.js | CREATE | tests | dummy row so the AC bullet is covered, isolating this arm to the missing-test-file class |',
      '| tests/gone-create.test.js | CREATE | tests | D13: an otherwise-identical CREATE row naming a missing file must still be enforced |']))
  const manifestCreate = writeManifest(dirCreate, [])
  const resCreate = run(specCreate, dirCreate, manifestCreate, ['--json'])
  const outCreate = findings(resCreate)
  assert.ok(outCreate.findings.some(f => f.class === 'missing-test-file' && f.detail.includes('tests/gone-create.test.js')),
    'D13 fail-closed: the skip must fire ONLY on an explicit DELETE action — a CREATE row naming a missing file must ' +
    'still raise missing-test-file naming it, proving the DELETE fix did not blanket-disable the check for every action')

  // Arm 3: a row in a table with NO Action column bound at all must still raise — proves the
  // check fails closed on an absent Action column, not just a present-but-empty one.
  const dirNoAction = tmpdir('acm-d13-noaction')
  fs.mkdirSync(path.join(dirNoAction, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dirNoAction, 'tests/covered.test.js'), '// covers AC-20260820-04-7\n')
  const specNoAction = path.join(dirNoAction, 'spec.md')
  fs.writeFileSync(specNoAction, specMdNoActionColumn(
    ['- **AC-20260820-04-7**: WHEN X THE SYSTEM SHALL Y → tests/covered.test.js'],
    ['| tests/covered.test.js | tests | dummy row so the AC bullet is covered, isolating this arm to the missing-test-file class |',
      '| tests/gone-noaction.test.js | tests | D13: this table binds no Action column at all — action must resolve to null, not DELETE |']))
  const manifestNoAction = writeManifest(dirNoAction, [])
  const resNoAction = run(specNoAction, dirNoAction, manifestNoAction, ['--json'])
  const outNoAction = findings(resNoAction)
  assert.ok(outNoAction.findings.some(f => f.class === 'missing-test-file' && f.detail.includes('tests/gone-noaction.test.js')),
    'D13 fail-closed: a File Plan table whose header row binds no Action column at all must NOT be treated as an ' +
    'implicit DELETE — a null/absent Action keeps the existence requirement, so this row must still raise ' +
    'missing-test-file naming it')
})

test('AC-20260820-06-10: on an all-green fixture, ac-matrix.js appends {"uncovered":N,"oracle":N} and {"skipped":N,"sanctioned":N} typed manifest rows, and --json\'s observed field mirrors the identical objects verbatim', () => {
  const dir = tmpdir('acm-d06-10')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), '// covers AC-20260820-06-10\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260820-06-10**: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js'],
    ['| tests/foo.test.js | CREATE | tests | covers AC |']))
  const manifest = writeManifest(dir, [])
  const before = fs.readFileSync(manifest, 'utf8').trim().split('\n').filter(Boolean)
  const res = run(spec, dir, manifest, ['--json'])
  const out = findings(res)
  assert.deepStrictEqual(out.observed, { acMatrix: { uncovered: 0, oracle: 0, preGreen: 0 }, skipReconcile: { skipped: 0, sanctioned: 0 } },
    'AC-20260820-06-10 (literal): the --json output\'s observed field must mirror exactly ' +
    '{acMatrix: {uncovered: 0, oracle: 0, preGreen: 0}, skipReconcile: {skipped: 0, sanctioned: 0}} — a caller reading ' +
    '--json cannot script against this field if it disagrees with the manifest rows the script also writes ' +
    '(specs/20260821/01-red-check.md D6 extends acMatrix with preGreen, 0 here since the fixture bullet ' +
    'carries no [pre-green:] tag): ' +
    JSON.stringify(out.observed))
  const lines = fs.readFileSync(manifest, 'utf8').trim().split('\n').filter(Boolean)
  const appended = lines.slice(before.length).map(l => JSON.parse(l))
  const acmRow = appended.find(r => r.leg === 'ac-matrix')
  const skipRow = appended.find(r => r.leg === 'skip-reconcile')
  assert.deepStrictEqual(acmRow.observed, out.observed.acMatrix,
    `the appended ac-matrix manifest row's observed must be byte-identical to --json's mirrored acMatrix ` +
    `object — a divergence here means the manifest and --json report two different coverage stories from ` +
    `the same run: manifest=${JSON.stringify(acmRow.observed)} json=${JSON.stringify(out.observed.acMatrix)}`)
  assert.deepStrictEqual(skipRow.observed, out.observed.skipReconcile,
    `the appended skip-reconcile manifest row's observed must be byte-identical to --json's mirrored ` +
    `skipReconcile object: manifest=${JSON.stringify(skipRow.observed)} json=${JSON.stringify(out.observed.skipReconcile)}`)
})

test('AC-20260821-01-2: an AC bullet carrying [pre-green: because-i-said-so] — outside PRE_GREEN_REASONS — is a hard invalid-pre-green finding, exit 1, and the tag does not count toward preGreen', () => {
  const dir = tmpdir('acm-rc2')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  // Covered by a literal hit so this fixture isolates to the invalid-tag class alone — an
  // out-of-enum reason must not also masquerade as an uncovered-ac or oracle finding.
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), '// covers AC-20260821-85-1\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260821-85-1** `[pre-green: because-i-said-so]`: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js'],
    ['| tests/foo.test.js | CREATE | tests | covers AC, isolates this fixture to the invalid-pre-green class |']))
  const manifest = writeManifest(dir, [])
  const res = run(spec, dir, manifest, ['--json'])
  assert.strictEqual(res.status, 1,
    `an out-of-enum [pre-green:] reason must be a hard finding, exit 1 — a silent exit 0 would let a ` +
    `worker invent an arbitrary reason string and have it accepted (stderr: ${res.stderr})`)
  const out = findings(res)
  assert.ok(out.findings.some(f => f.class === 'invalid-pre-green' && f.ac === 'AC-20260821-85-1'),
    `"because-i-said-so" is not in PRE_GREEN_REASONS, so the finding must be classed invalid-pre-green ` +
    `and name AC-20260821-85-1 — got ${JSON.stringify(out.findings)}`)
  assert.deepStrictEqual(out.observed.acMatrix, { uncovered: 0, oracle: 0, preGreen: 0 },
    `the tag stays red-expected (fail closed, D2 of specs/20260821/01-red-check.md) — an invalid reason ` +
    `must NOT increment preGreen, and the AC's real literal hit must still keep uncovered/oracle at 0 so ` +
    `the invalid-tag class is the only signal in this fixture — got ${JSON.stringify(out.observed.acMatrix)}`)
})

// specs/20260821/01-red-check.md (AC-20260821-01-2): extractTag (lib/spec-sections.js)
// recognizes a bracket tag in exactly two positions — the declaration slot (right after the
// bold AC token's closing `**`, before the requirement-opening `:`) and true trailing content
// (the bullet's last non-whitespace) — so a tag mentioned mid-sentence in the requirement prose,
// such as this file's own worked example of the invalid-tag case, parses preGreen: null and is
// inert.
test('AC-20260821-01-2: an AC bullet whose PROSE mentions [pre-green: reason] mid-sentence — matching how specs/20260821/01-red-check.md writes its own AC-2 — is not a declared tag, parses preGreen: null, and exits 0 with no invalid-pre-green finding', () => {
  const dir = tmpdir('acm-rc2-prose')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), '// covers AC-20260821-90-1\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260821-90-1**: WHEN a spec\'s AC bullet carries `[pre-green: because-i-said-so]` (outside PRE_GREEN_REASONS) THE SYSTEM SHALL emit hard finding invalid-pre-green → tests/foo.test.js'],
    ['| tests/foo.test.js | CREATE | tests | covers AC, isolates this fixture to extractTag anchoring |']))
  const manifest = writeManifest(dir, [])
  const res = run(spec, dir, manifest, ['--json'])
  assert.strictEqual(res.status, 0,
    `a bracket tag quoted mid-sentence in the requirement PROSE — neither the declaration slot (right after ` +
    `the bold AC token's closing **, before the requirement-opening :) nor true trailing content — must NOT ` +
    `be recognized as a declared [pre-green:] tag, or a spec's own worked example of the invalid-tag case ` +
    `self-tags and fires a fabricated finding (stderr: ${res.stderr})`)
  const out = findings(res)
  assert.ok(!out.findings.some(f => f.class === 'invalid-pre-green'),
    'a mid-sentence prose mention of [pre-green: ...] must never fire invalid-pre-green — extractTag only ' +
    'recognizes the declaration slot and true trailing content, never an arbitrary mid-bullet position')
  assert.deepStrictEqual(out.observed.acMatrix, { uncovered: 0, oracle: 0, preGreen: 0 },
    `the prose mention must not count toward preGreen (parses null) — the AC is covered by its own literal ` +
    `hit so uncovered/oracle stay 0 too — got ${JSON.stringify(out.observed.acMatrix)}`)
})

// specs/20260821/01-red-check.md: extractTag (lib/spec-sections.js) extracts every sibling tag
// sharing one slot — spec/templates/spec.md lines 90-103 sanction stacking
// [env:]+[oracle:]+[pre-green:] together — not just the tag immediately adjacent to the anchor
// (`**...**:` for the declaration slot, the raw text's end for trailing). A parser that drops a
// sibling [env:] un-sanctions a legitimately env-gated skip into a fabricated unsanctioned-skip
// hard finding. These four tests pin every sibling tag in a run, in both positions and mixed,
// confirming the mid-prose anchoring above still holds as the run grows.
test('AC-20260821-01-2: a run of three sibling tags in the declaration slot — [env:] [oracle:] [pre-green:], each backticked, before the requirement-opening colon — parses every one of them, not just the tag adjacent to the colon', () => {
  const section = '- **AC-20260821-86-1** `[env: FOO]` `[oracle: gate]` `[pre-green: absence-invariant]`: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js\n'
  const bullets = parseAcBullets(section)
  assert.strictEqual(bullets.length, 1, `fixture must parse to exactly one AC bullet — got ${bullets.length}`)
  const b = bullets[0]
  assert.strictEqual(b.env, 'FOO',
    `spec/templates/spec.md lines 90-103 sanction stacking sibling tags in the declaration slot — [env:] sits ` +
    `farthest from the requirement colon in this fixture, so a parser that only recognizes the tag adjacent to ` +
    `the colon drops it to null and un-sanctions whatever skip declares it — got ${JSON.stringify(b)}`)
  assert.strictEqual(b.oracle, 'gate',
    `the middle tag of the run must also be extracted, not just the first or last — got ${JSON.stringify(b)}`)
  assert.strictEqual(b.preGreen, 'absence-invariant',
    `[pre-green:] sits closest to the colon (the position the pre-fix single-tag regex already matched) — it ` +
    `must keep parsing correctly once its siblings are added to the run, not regress when the run grows — got ${JSON.stringify(b)}`)
})

test('AC-20260821-01-2: a run of two sibling tags at the TRAILING position — both after the requirement prose, in raw-text order — parses both of them, not just the one adjacent to the raw text\'s end', () => {
  const section = '- **AC-20260821-87-1**: WHEN X THE SYSTEM SHALL Y [env: X] [oracle: Y]\n'
  const bullets = parseAcBullets(section)
  assert.strictEqual(bullets.length, 1, `fixture must parse to exactly one AC bullet — got ${bullets.length}`)
  const b = bullets[0]
  assert.strictEqual(b.env, 'X',
    `[env: X] sits FIRST in the trailing run, not adjacent to the raw text's end — a parser anchored only to ` +
    `"last non-whitespace content" drops it to null even though specs/20260821/01-red-check.md's own AC-1 ` +
    `example mandates trailing tags as legal syntax — got ${JSON.stringify(b)}`)
  assert.strictEqual(b.oracle, 'Y',
    `[oracle: Y] sits last (the position the pre-fix single-tag regex already matched) and must keep parsing ` +
    `correctly once a sibling tag is stacked before it — got ${JSON.stringify(b)}`)
})

test('AC-20260821-01-2: one tag in the declaration slot and a sibling tag trailing — mixed positions on the same bullet — both parse correctly together', () => {
  const section = '- **AC-20260821-88-1** `[oracle: gate]`: WHEN X THE SYSTEM SHALL Y [env: TEST_DB]\n'
  const bullets = parseAcBullets(section)
  assert.strictEqual(bullets.length, 1, `fixture must parse to exactly one AC bullet — got ${bullets.length}`)
  const b = bullets[0]
  assert.strictEqual(b.oracle, 'gate',
    `the declaration-slot tag must still parse when a DIFFERENT tag also appears trailing on the same bullet ` +
    `— got ${JSON.stringify(b)}`)
  assert.strictEqual(b.env, 'TEST_DB',
    `the trailing tag must still parse when a DIFFERENT tag also occupies the declaration slot on the same ` +
    `bullet — a fix scoped to only same-position runs would leave this cross-position combination broken — got ${JSON.stringify(b)}`)
})

test('AC-20260823-03-6 (retags this mid-sentence-quoted-null pin, previously plain AC-20260821-01-2, per specs/20260823/03-silent-drop-hardening.md — assertion unchanged): a RUN of two sibling tags quoted together mid-sentence — neither in the declaration slot nor trailing — still parses both null (the anchoring fix must not regress when the run grows from one tag to a pair)', () => {
  const section = "- **AC-20260821-89-1**: WHEN a spec's requirement text illustrates the sibling tags `[env: FOO]` `[oracle: gate]` together as a worked example THE SYSTEM SHALL do nothing special → tests/foo.test.js\n"
  const bullets = parseAcBullets(section)
  assert.strictEqual(bullets.length, 1, `fixture must parse to exactly one AC bullet — got ${bullets.length}`)
  const b = bullets[0]
  assert.strictEqual(b.env, null,
    `this pair of tags sits mid-sentence, adjacent to EACH OTHER but not to the declaration slot or the raw ` +
    `text's end — extending extractTag to recognize a run of siblings must not loosen the anchoring to accept ` +
    `a run anywhere in the bullet, or a spec's own worked example of the multi-tag syntax (like this one) ` +
    `self-tags — got ${JSON.stringify(b)}`)
  assert.strictEqual(b.oracle, null,
    `same guard, the other tag of the mid-sentence pair — got ${JSON.stringify(b)}`)
})

// specs/20260821/01-red-check.md (escape class unanchored-marker-match): extractTag's trailing
// position requires a BARE (un-backticked) tag; the declaration slot still accepts either. A
// bullet ending in a backticked tag illustration (documentation-by-example) must parse that tag
// null — accepting a backtick-wrapped trailing tag identically to the declaration slot's grammar
// self-tags on a worked example and makes ac-matrix.js treat a zero-hit AC as
// covered-by-declaration whenever the named leg happens to be green in the manifest — laundered,
// fail-open coverage. The two tests below pin both positions.
test('AC-20260821-01-2: a bullet ending in a BACKTICKED trailing tag illustration — e.g. `... name the gate, e.g. `[oracle: gate]`` — parses that tag null', () => {
  const section = '- **AC-20260822-71-1**: WHEN a skip is reported THE SYSTEM SHALL name the gate, e.g. `[oracle: gate]`\n'
  const bullets = parseAcBullets(section)
  assert.strictEqual(bullets.length, 1, `fixture must parse to exactly one AC bullet — got ${bullets.length}`)
  assert.strictEqual(bullets[0].oracle, null,
    `a backticked tag illustration ending the bullet is a worked example, not a declaration — a parser that ` +
    `accepts a backtick-wrapped item in the trailing position identically to the declaration slot self-tags ` +
    `on this exact shape — got ${JSON.stringify(bullets[0])}`)
})

// COLLISION (specs/20260823/03-silent-drop-hardening.md D1, per this repo's own
// collision-resolution convention — never weakened): this fixture is "rv_640c582f4902's own
// case" the spec's Goal cites — AC-20260822-71-1 has zero literal test hits and its only
// would-be oracle declaration is refused for being backticked, so it is exactly D1's rule 1
// (`uncovered-ac` with a refused trailing `[oracle:]`), not AC-4's "otherwise clean" carve-out
// (AC-4 requires the AC be COVERED — this one is genuinely uncovered). Driven through
// ac-matrix.js the finding must be `rejected-trailing-tag`, not `uncovered-ac` — retagged
// AC-20260823-03-1 (also pinned by its own dedicated fixture in
// tests/ac-matrix/rejected-trailing-tag.test.js; kept here too as the real-corpus-derived shape
// that surfaced the collision). See specs/20260823/03-silent-drop-hardening.deviations.md.
test('AC-20260823-03-1 (retargets AC-20260821-01-2\'s zero-hit backticked-trailing-oracle fixture): driven through ac-matrix.js, the zero-hit AC with a refused trailing [oracle:] tag is a hard rejected-trailing-tag finding — never uncovered-ac, and never laundered green by the gate leg\'s manifest status', () => {
  const dir = tmpdir('acm-rc2-trailing-backtick')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/illustrate.test.js'), '// unrelated, no AC-ID literal\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260822-71-1**: WHEN a skip is reported THE SYSTEM SHALL name the gate, e.g. `[oracle: gate]`'],
    ['| tests/illustrate.test.js | CREATE | tests | zero AC-ID hits, bullet ends in a backticked oracle illustration |']))
  const manifest = writeManifest(dir, [{ leg: 'gate', exit: 0, observed: 'skips=0 todos=0' }])
  const res = run(spec, dir, manifest, ['--json'])
  const out = findings(res)
  assert.strictEqual(res.status, 1,
    `AC-20260822-71-1 has zero literal test hits and no genuine [oracle:] declaration — it must exit 1, ` +
    `not silently laundered green by the gate leg's manifest status (stderr: ${res.stderr})`)
  assert.ok(!out.findings.some(f => f.class === 'uncovered-ac' && f.ac === 'AC-20260822-71-1'),
    `specs/20260823/03-silent-drop-hardening.md D1: rejected-trailing-tag REPLACES uncovered-ac for ` +
    `this AC — a surviving uncovered-ac finding here means the refusal's cause (a backticked trailing ` +
    `tag) is still hidden from the host, the exact silent misreport that spec fixes — got ${JSON.stringify(out.findings)}`)
  assert.ok(out.findings.some(f => f.class === 'rejected-trailing-tag' && f.ac === 'AC-20260822-71-1'),
    `the illustration must surface as rejected-trailing-tag naming AC-20260822-71-1 — got ${JSON.stringify(out.findings)}`)
  assert.strictEqual(out.observed.acMatrix.oracle, 0,
    `the typed row's oracle field must NOT count this AC — a backticked illustration counting toward oracle ` +
    `coverage is exactly the fail-open this pin closes — got ${JSON.stringify(out.observed.acMatrix)}`)
})

test('AC-20260823-03-5 (retags this bare-trailing-tag pin, previously plain AC-20260821-01-2, per specs/20260823/03-silent-drop-hardening.md — assertion unchanged): a bullet ending in a BARE trailing tag — the position specs/20260821/01-red-check.md\'s own AC-20260821-01-1 mandates — still parses it, unaffected by the backtick-only trailing restriction', () => {
  const section = '- **AC-20260822-72-1**: WHEN x THE SYSTEM SHALL y [oracle: gate]\n'
  const bullets = parseAcBullets(section)
  assert.strictEqual(bullets.length, 1, `fixture must parse to exactly one AC bullet — got ${bullets.length}`)
  assert.strictEqual(bullets[0].oracle, 'gate',
    `a BARE (un-backticked) trailing tag is a genuine declaration and must keep parsing after the backtick-only ` +
    `trailing restriction lands — got ${JSON.stringify(bullets[0])}`)
})

test('AC-20260821-01-2: the declaration slot still accepts BOTH a backticked and a bare tag — the trailing-only backtick restriction must not narrow the declaration slot too', () => {
  const backticked = parseAcBullets('- **AC-20260822-73-1** `[oracle: gate]`: WHEN x THE SYSTEM SHALL y\n')
  assert.strictEqual(backticked[0].oracle, 'gate',
    `a BACKTICKED declaration-slot tag must keep parsing — the trailing-only fix must not also restrict the ` +
    `declaration slot to bare tags — got ${JSON.stringify(backticked[0])}`)
  const bare = parseAcBullets('- **AC-20260822-74-1** [env: FOO]: WHEN x THE SYSTEM SHALL y\n')
  assert.strictEqual(bare[0].env, 'FOO',
    `a BARE declaration-slot tag must also keep parsing — got ${JSON.stringify(bare[0])}`)
})

test('AC-20260821-01-10: a spec carrying exactly 2 valid [pre-green:] tags (different enum members) appends the ac-matrix manifest row with preGreen:2, and --json mirrors it', () => {
  const dir = tmpdir('acm-rc10')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'),
    '// covers AC-20260821-84-1 AC-20260821-84-2\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260821-84-1** `[pre-green: absence-invariant]`: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js',
      '- **AC-20260821-84-2** `[pre-green: predicate-in-test]`: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js'],
    ['| tests/foo.test.js | CREATE | tests | covers both ACs |']))
  const manifest = writeManifest(dir, [])
  const before = fs.readFileSync(manifest, 'utf8').trim().split('\n').filter(Boolean)
  const res = run(spec, dir, manifest, ['--json'])
  const out = findings(res)
  assert.deepStrictEqual(out.observed.acMatrix, { uncovered: 0, oracle: 0, preGreen: 2 },
    `two well-formed bullets each carry a DIFFERENT valid [pre-green:] reason and are both covered by a ` +
    `literal hit, so preGreen must count exactly 2 while uncovered/oracle stay 0 — a count that only ` +
    `recognized one reason, or that conflated the tag with coverage, would drift from this exact object: ` +
    `got ${JSON.stringify(out.observed.acMatrix)}`)
  const lines = fs.readFileSync(manifest, 'utf8').trim().split('\n').filter(Boolean)
  const acmRow = lines.slice(before.length).map(l => JSON.parse(l)).find(r => r.leg === 'ac-matrix')
  assert.deepStrictEqual(acmRow.observed, out.observed.acMatrix,
    `the appended ac-matrix manifest row's observed must be byte-identical to --json's mirrored acMatrix ` +
    `object, so every review ledger row that rides this manifest row sees the same preGreen count a ` +
    `caller reading --json sees: manifest=${JSON.stringify(acmRow.observed)} json=${JSON.stringify(out.observed.acMatrix)}`)
})

test('AC-20260821-01-12: an AC carrying [pre-green:] with zero test hits SHALL CONTINUE TO count as uncovered — the tag never launders coverage (carrier assertion, already passing pre-D6)', () => {
  const dir = tmpdir('acm-rc12')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/bar.test.js'), '// no matrix id present here\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260821-83-1**: WHEN X THE SYSTEM SHALL Y [pre-green: fallback-rejection] → tests/bar.test.js'],
    ['| tests/bar.test.js | CREATE | tests | zero literal hits despite the pre-green tag |']))
  const manifest = writeManifest(dir, [])
  const res = run(spec, dir, manifest, ['--json'])
  assert.strictEqual(res.status, 1,
    `a [pre-green:] tag must never sanction a zero-hit AC out of uncovered-ac — this carrier assertion ` +
    `holds against today's tree, since an unrecognized bracket tag is inert to the pre-existing ` +
    `uncovered/oracle logic (stderr: ${res.stderr})`)
  const out = findings(res)
  assert.ok(out.findings.some(f => f.class === 'uncovered-ac' && f.ac === 'AC-20260821-83-1'),
    `AC-20260821-83-1 never appears as a literal inside tests/bar.test.js — the [pre-green:] tag must not ` +
    `suppress the uncovered-ac finding — got ${JSON.stringify(out.findings)}`)
  assert.strictEqual(out.observed.acMatrix.uncovered, 1,
    `the typed row's uncovered field must count this AC regardless of its [pre-green:] tag — only the ` +
    `uncovered field is asserted here (not the full object with preGreen) so this pin stays green both ` +
    `before and after specs/20260821/01-red-check.md D6 lands the preGreen field — got ` +
    `${JSON.stringify(out.observed.acMatrix)}`)
})
