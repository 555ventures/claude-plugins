'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, runBash, ROOT, SPEC } = require('../helpers')

// specs/20260814/01-ac-matrix-script.md: review.md Phase 0 steps 5-6 (AC-line lint, AC<->test
// coverage matrix, [oracle:]/[env:] handling, skipped-test reconciliation) are today hand-
// executed prose that drifts per session/model. This suite pins the sole-derivation replacement,
// spec/scripts/ac-matrix.js, by executing it against synthetic host trees — never against
// implementation internals, since the script does not exist yet at HEAD. Scoped under
// tests/ac-matrix/ so other specs' gate runs stay pin-free (D7).
//
// RETAG (specs/20260817/07-promise-sweep-leg.md D3, AC-20260817-07-14): AC_ID_RE,
// AC_ID_RE_GLOBAL, extractSection, and parseAcBullets move out of this file into the new
// spec/scripts/lib/spec-sections.js, which ac-matrix.js now imports; every observed string,
// finding class, and exit code below stays byte-identical. This whole suite — unchanged, no
// assertion edited — IS the byte-identity pin for D3: any divergence introduced by the
// extraction surfaces here as a wrong observed grammar, finding class, or exit code.
//
// D13 (2026-08-20, specs/20260820/04-entrypoint-conformance.md): `missing-test-file` asserted
// existence for EVERY tests-layer File Plan row regardless of its Action column — reproduced
// live against this spec's own D7 row (`tests/advisory-append/advisory-append.test.js`,
// planned DELETE): `ac-matrix: uncovered=0 oracle=0 · 1 finding(s)`. A row that plans a
// deletion is satisfied by the file's absence, not violated by it. Fixed fail-closed: the
// check skips ONLY an explicit `DELETE` action; a `CREATE` row or a row whose table binds no
// Action column at all keeps the existence requirement.
//
// specs/20260820/06-typed-evidence-manifest.md D2/D8/AC-20260820-06-10 (2026-08-20, brief 16's
// second move): ac-matrix.js's two manifest rows and its `--json` output's `observed` field both
// retire the packed "uncovered=N oracle=M" / "skipped=N sanctioned=S" strings for the typed
// objects {"uncovered":N,"oracle":N} and {"skipped":N,"sanctioned":N} — D8 pins the `--json`
// field mirrors the manifest objects exactly, byte-unchanged plain-mode stdout summary line
// aside (untouched by this spec). Every `out.observed.acMatrix` / `out.observed.skipReconcile`
// assertion below is retyped in place; none is retagged (D8/AC-20260820-06-10 is a NEW test,
// added at the end of this file, that owns the AC-ID — these existing pins keep their own
// AC-IDs, since their invariant — which finding drives which count — is unchanged by the shape).

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
  assert.deepStrictEqual(out.observed.acMatrix, { uncovered: 1, oracle: 0 },
    `unparseable = unknown = uncovered (D1): the malformed AC-2026-1 bullet must increment uncovered ` +
    `even though it also trips its own malformed-ac finding — a reviewer who waives that one notation ` +
    `finding must not then be told by the durable manifest row that coverage is complete. ` +
    `AC-20260814-01-1 stays well-formed and covered so it must NOT also add a second uncovered-ac row ` +
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
  assert.deepStrictEqual(out.observed.acMatrix, { uncovered: 1, oracle: 0 },
    `observed must be the exact pinned typed object verdict.js reads field-by-field — got ${JSON.stringify(out.observed.acMatrix)}`)
})

test('AC-20260814-01-3a / continues AC-20260815-03-7: an [oracle:] AC whose declared leg is green in the manifest is excluded from uncovered, counted in oracle=, and warned (not a finding)', () => {
  const dir = tmpdir('acm3a')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/oracle.test.js'), '// unrelated\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260814-01-3**: WHEN X THE SYSTEM SHALL Y [oracle: gate] → tests/oracle.test.js'],
    ['| tests/oracle.test.js | CREATE | tests | covers AC |']))
  const manifest = writeManifest(dir, [{ leg: 'gate', exit: 0, observed: 'skips=0 todos=0' }])
  const res = run(spec, dir, manifest, ['--json'])
  const out = findings(res)
  assert.ok(!out.findings.some(f => f.ac === 'AC-20260814-01-3'),
    'AC-20260814-01-3 has zero literal test hits but declares [oracle: gate], and the manifest\'s ' +
    'gate row is green — it must be covered-by-declaration, never an uncovered-ac finding')
  assert.deepStrictEqual(out.observed.acMatrix, { uncovered: 0, oracle: 1 },
    `a green-oracle AC must be counted in the typed object's "oracle" field — got ${JSON.stringify(out.observed.acMatrix)}`)
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
    ['- **AC-20260814-01-3**: WHEN X THE SYSTEM SHALL Y [oracle: gate] → tests/oracle.test.js'],
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
    ['- **AC-20260814-01-4**: WHEN X THE SYSTEM SHALL Y [env: TEST_DB] → tests/env.test.js'],
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
    ['- **AC-20260814-06-1**: WHEN X THE SYSTEM SHALL Y [env: DB_ONE] → tests/six.test.js',
      '- **AC-20260814-06-2**: WHEN X THE SYSTEM SHALL Y [env: DB_TWO] → tests/six.test.js',
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
  assert.deepStrictEqual(out.observed.acMatrix, { uncovered: 1, oracle: 0 },
    'today --has-drift-script structurally skips the well-formed coverage loop entirely (the host ' +
    'driftScript owns coverage there), so the manifest row records uncovered:0 no matter how many ' +
    'unparseable bullets sit in the AC section — the same fail-closed-denominator hole as AC-20260815-03-1, ' +
    'just reached through the other code path (D1: "the malformed term applies in --has-drift-script mode ' +
    `too"). got ${JSON.stringify(out.observed.acMatrix)}`)
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
  assert.deepStrictEqual(out.observed, { acMatrix: { uncovered: 0, oracle: 0 }, skipReconcile: { skipped: 0, sanctioned: 0 } },
    'AC-20260820-06-10 (literal): the --json output\'s observed field must mirror exactly ' +
    '{acMatrix: {uncovered: 0, oracle: 0}, skipReconcile: {skipped: 0, sanctioned: 0}} — a caller reading ' +
    '--json cannot script against this field if it disagrees with the manifest rows the script also writes: ' +
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
