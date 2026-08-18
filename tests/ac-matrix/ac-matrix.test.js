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

function specMd(acLines, filePlanRows) {
  return '# Test Spec\n\n## Acceptance Criteria\n\n' + acLines.join('\n') + '\n\n' +
    '## File Plan\n\n| Path | Action | Layer | Summary |\n|------|--------|-------|---------|\n' +
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
  assert.match(out.observed.acMatrix, /^uncovered=1 oracle=0$/,
    `unparseable = unknown = uncovered (D1): the malformed AC-2026-1 bullet must increment uncovered ` +
    `even though it also trips its own malformed-ac finding — a reviewer who waives that one notation ` +
    `finding must not then be told by the durable manifest row that coverage is complete. ` +
    `AC-20260814-01-1 stays well-formed and covered so it must NOT also add a second uncovered-ac row ` +
    `— got "${out.observed.acMatrix}"`)
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
  assert.strictEqual(out.observed.acMatrix, 'uncovered=1 oracle=0',
    `observed must be the exact pinned grammar verdict.js parses byte-for-byte — got "${out.observed.acMatrix}"`)
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
  assert.strictEqual(out.observed.acMatrix, 'uncovered=0 oracle=1',
    `a green-oracle AC must be counted in oracle= — got "${out.observed.acMatrix}"`)
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
  assert.strictEqual(out.observed.skipReconcile, 'skipped=1 sanctioned=1',
    `a skip mapped to an [env:]-declared AC must be sanctioned — got "${out.observed.skipReconcile}"`)
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
  assert.strictEqual(out.observed.skipReconcile, 'skipped=1 sanctioned=0',
    `an unsanctioned skip must not be counted toward sanctioned= — got "${out.observed.skipReconcile}"`)
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
  const manifest = writeManifest(dir, [{ leg: 'gate', exit: 0, observed: 'skips=3 todos=0' }])
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
  assert.strictEqual(skipRow.observed, 'skipped=3 sanctioned=2',
    `skip-reconcile's observed must reconcile 3 skips, 2 env-sanctioned — got "${skipRow.observed}"`)

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
  assert.strictEqual(out.observed.acMatrix, 'uncovered=1 oracle=0',
    'today --has-drift-script structurally skips the well-formed coverage loop entirely (the host ' +
    'driftScript owns coverage there), so the manifest row records uncovered=0 no matter how many ' +
    'unparseable bullets sit in the AC section — the same fail-closed-denominator hole as AC-20260815-03-1, ' +
    'just reached through the other code path (D1: "the malformed term applies in --has-drift-script mode ' +
    `too"). got "${out.observed.acMatrix}"`)
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
