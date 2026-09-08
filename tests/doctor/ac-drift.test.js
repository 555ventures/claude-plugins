'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { read, tmpdir, runNode, runBash } = require('../helpers')

// Pins: specs/20260906/01-ac-drift-doctor-check.md D1-D6/D8/D9,
// AC-20260906-01-1 .. AC-20260906-01-9. spec/scripts/ac-drift.js does not exist yet — every
// test below is a TDD red pin against a synthetic host tree in tmpdir(), executed via runNode.
// The former AC-20260906-01-3 test below is retagged AC-20260907-01-10 by
// specs/20260907/01-mixed-pin-guard-and-drift-line.md D1 (title + assert messages only, the
// assertions themselves unchanged) — its own bullet is a SHALL CONTINUE TO pin, so the
// sanctioned-pin behavior it proves continues unmodified.

function writeSpec(root, relPath, status, acLines) {
  const abs = path.join(root, relPath)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, '---\nstatus: ' + status + '\n---\n# Spec\n\n## Acceptance Criteria\n\n' +
    acLines.join('\n') + '\n')
  return abs
}

function writeFile(root, relPath, content) {
  const abs = path.join(root, relPath)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
  return abs
}

function run(root, extraArgs = []) {
  return runNode('scripts/ac-drift.js', ['--root', root, ...extraArgs])
}

function parseJson(res) {
  let parsed
  try { parsed = JSON.parse(res.stdout) } catch (e) {
    assert.fail(`--json output did not parse as JSON (status ${res.status}, stderr: ${res.stderr}): ${e.message}`)
  }
  return parsed
}

test('AC-20260906-01-1: a done spec dated on-or-after the v7 floor whose only AC no test-classified file cites exits 1 and prints the exact per-row stderr finding line', () => {
  const dir = tmpdir('ac-drift-1')
  writeSpec(dir, 'specs/20260901/01-x.md', 'done',
    ['- **AC-20260901-01-1**: WHEN a THE SYSTEM SHALL b'])
  writeFile(dir, 'tests/x.test.js', '// nothing cites the AC here\n')
  const res = run(dir)
  assert.strictEqual(res.status, 1,
    `a done, post-floor spec with an uncovered, unsanctioned AC must exit 1 — the exact backlog class this ` +
    `check exists to surface, never a silent 0 (stdout: ${res.stdout} stderr: ${res.stderr})`)
  assert.ok(res.stderr.includes(
    'ac-drift: specs/20260901/01-x.md AC-20260901-01-1 — no test cites it; remedy: tag the covering test with the id, or mark the bullet [retired: <spec path or docs/adr path that retired it>]'),
    `D1's per-row finding line is pinned byte-for-byte so a host reading raw stderr output gets an ` +
    `actionable remedy with no script-source lookup — got stderr: ${JSON.stringify(res.stderr)}`)
})

test('AC-20260906-01-2: coverage is full-token (a prefix citation never counts) and fixture-directory citations never count, while a genuine same-file citation clears the finding', () => {
  const covered = tmpdir('ac-drift-2a')
  writeSpec(covered, 'specs/20260901/01-x.md', 'done',
    ['- **AC-20260901-01-1**: WHEN a THE SYSTEM SHALL b'])
  writeFile(covered, 'tests/x.test.js', "test('AC-20260901-01-1: ...', () => {})\n")
  const coveredRes = run(covered)
  assert.strictEqual(coveredRes.status, 0,
    `a test-classified file citing the AC-ID as a full token must clear the finding and exit 0 ` +
    `(stderr: ${coveredRes.stderr})`)
  assert.strictEqual(coveredRes.stdout.trim(), 'ac-drift: clean — 1 specs, 1 criteria',
    `the clean sentinel must be exactly "ac-drift: clean — 1 specs, 1 criteria" — got ${JSON.stringify(coveredRes.stdout)}`)

  const prefix = tmpdir('ac-drift-2b')
  writeSpec(prefix, 'specs/20260901/01-x.md', 'done',
    ['- **AC-20260901-01-1**: WHEN a THE SYSTEM SHALL b'])
  writeFile(prefix, 'tests/x.test.js', "test('AC-20260901-01-12 only', () => {})\n")
  const prefixRes = run(prefix)
  assert.strictEqual(prefixRes.status, 1,
    `a test file citing only AC-20260901-01-12 must NOT credit AC-20260901-01-1 — acIdOccurs is full-token, ` +
    `a bare substring match would silently launder coverage for a same-prefix sibling AC (stderr: ${prefixRes.stderr})`)
  assert.ok(prefixRes.stderr.includes('AC-20260901-01-1 —'),
    `AC-20260901-01-1 must still be reported uncovered despite the AC-20260901-01-12 citation — got stderr: ${JSON.stringify(prefixRes.stderr)}`)

  const fixture = tmpdir('ac-drift-2c')
  writeSpec(fixture, 'specs/20260901/01-x.md', 'done',
    ['- **AC-20260901-01-1**: WHEN a THE SYSTEM SHALL b'])
  writeFile(fixture, 'tests/fixtures/spec.md', 'AC-20260901-01-1 mentioned only inside a fixture\n')
  const fixtureRes = run(fixture)
  assert.strictEqual(fixtureRes.status, 1,
    `D4: a citation living only inside a "fixtures" directory must never count as coverage — a fixture is ` +
    `input data for some OTHER test, not a citation of its own (stderr: ${fixtureRes.stderr})`)
  assert.ok(fixtureRes.stderr.includes('AC-20260901-01-1 —'),
    `the fixture-only citation must still leave AC-20260901-01-1 reported uncovered — got stderr: ${JSON.stringify(fixtureRes.stderr)}`)
})

test('AC-20260907-01-10 (was AC-20260906-01-3, retagged by specs/20260907/01-mixed-pin-guard-and-drift-line.md D1): SHALL CONTINUE TO (plain and hard-wrapped), bare [oracle:], bare [pre-green:], and a cited [retired:] each sanction an otherwise-uncovered AC — no finding, but each still counts toward criteria', () => {
  const dir = tmpdir('ac-drift-3')
  writeSpec(dir, 'specs/20260901/01-x.md', 'done', [
    '- **AC-20260901-01-1**: WHEN a THE SYSTEM SHALL CONTINUE TO b',
    '- **AC-20260901-01-2**: WHEN a THE SYSTEM SHALL',
    '  CONTINUE TO b',
    '- **AC-20260901-01-3** [oracle: gate]: WHEN a THE SYSTEM SHALL b',
    '- **AC-20260901-01-4** [pre-green: absence-invariant]: WHEN a THE SYSTEM SHALL b',
    '- **AC-20260901-01-5** [retired: specs/20260830/01-removal.md D2]: WHEN a THE SYSTEM SHALL b',
  ])
  const res = run(dir)
  assert.strictEqual(res.status, 0,
    `AC-20260907-01-10: every AC here carries a sanction (plain SHALL CONTINUE TO, hard-wrapped SHALL ` +
    `CONTINUE TO, bare [oracle:], bare [pre-green:], cited [retired:]) — none must raise a finding, so ` +
    `the run must exit 0 (stdout: ${res.stdout} stderr: ${res.stderr})`)
  assert.strictEqual(res.stderr, '',
    `AC-20260907-01-10: a fully-sanctioned spec must print zero finding lines on stderr — got ${JSON.stringify(res.stderr)}`)
  assert.strictEqual(res.stdout.trim(), 'ac-drift: clean — 1 specs, 5 criteria',
    `AC-20260907-01-10: all 5 sanctioned bullets must still be counted in "criteria" — a sanction excuses ` +
    `the FINDING, never the count, or the doctor's own backlog denominator silently shrinks — got ${JSON.stringify(res.stdout)}`)
})

test('AC-20260906-01-4: an uncited [retired:] (empty or free text) is itself a finding, and a backticked trailing [retired:] parses as no tag at all — a plain uncovered-ac finding, never retired-uncited', () => {
  const uncited = tmpdir('ac-drift-4a')
  writeSpec(uncited, 'specs/20260901/01-x.md', 'done', [
    '- **AC-20260901-01-1**: WHEN a THE SYSTEM SHALL b [retired: ]',
    '- **AC-20260901-01-2**: WHEN a THE SYSTEM SHALL b [retired: superseded by the hub rewrite]',
  ])
  const uncitedHumanRes = run(uncited)
  assert.strictEqual(uncitedHumanRes.status, 1,
    `an uncited [retired:] tag (empty, or free text with no specs/…md or docs/adr/ path) is NOT a sanction ` +
    `— it must exit 1, the exact coverage-laundering route [oracle:] was hardened against (stderr: ${uncitedHumanRes.stderr})`)
  assert.ok(uncitedHumanRes.stderr.includes(
    'ac-drift: specs/20260901/01-x.md AC-20260901-01-1 — [retired:] must cite the specs/ or docs/adr/ path that retired it'),
    `the retired-uncited stderr line must be pinned byte-for-byte in the human render — got ${JSON.stringify(uncitedHumanRes.stderr)}`)

  const uncitedRes = run(uncited, ['--json'])
  assert.strictEqual(uncitedRes.status, 1,
    `--json must derive the same exit code as the human render for an uncited [retired:] tag (stderr: ${uncitedRes.stderr})`)
  const out = parseJson(uncitedRes)
  for (const ac of ['AC-20260901-01-1', 'AC-20260901-01-2']) {
    const f = out.findings.find((x) => x.ac === ac)
    assert.ok(f && f.class === 'retired-uncited',
      `${ac}'s uncited [retired:] tag must produce class "retired-uncited" in --json output — got ${JSON.stringify(f)}`)
  }

  const backticked = tmpdir('ac-drift-4b')
  writeSpec(backticked, 'specs/20260901/01-x.md', 'done', [
    '- **AC-20260901-01-1**: WHEN a THE SYSTEM SHALL b `[retired: specs/a/b.md]`',
  ])
  const backtickedRes = run(backticked, ['--json'])
  assert.strictEqual(backtickedRes.status, 1,
    `a backticked trailing [retired:] is a worked-example quote, not a declaration — it must not sanction ` +
    `the bullet at all (stderr: ${backtickedRes.stderr})`)
  const backtickedOut = parseJson(backtickedRes)
  const f = backtickedOut.findings.find((x) => x.ac === 'AC-20260901-01-1')
  assert.ok(f && f.class === 'uncovered-ac',
    `a backticked trailing [retired:] must parse as no tag at all — the finding class must be the plain ` +
    `"uncovered-ac", never "retired-uncited" (that would credit a quote as a real citation) — got ${JSON.stringify(f)}`)
})

test('AC-20260906-01-5: a done pre-floor spec is skipped with a summary line, and a non-done spec is ignored entirely — neither reports its uncovered AC', () => {
  const dir = tmpdir('ac-drift-5')
  writeSpec(dir, 'specs/20260901/01-x.md', 'done',
    ['- **AC-20260901-01-1**: WHEN a THE SYSTEM SHALL b'])
  writeSpec(dir, 'specs/20260810/01-old.md', 'done',
    ['- **AC-20260810-01-1**: WHEN a THE SYSTEM SHALL b'])
  writeSpec(dir, 'specs/20260902/01-open.md', 'hardened',
    ['- **AC-20260902-01-1**: WHEN a THE SYSTEM SHALL b'])
  const res = run(dir)
  assert.strictEqual(res.status, 1,
    `the post-floor done spec's own uncovered AC must still exit 1 (stdout: ${res.stdout} stderr: ${res.stderr})`)
  assert.ok(!res.stderr.includes('AC-20260810-01-1') && !res.stderr.includes('AC-20260902-01-1'),
    `D2/D5: neither the pre-floor done spec nor the non-done "hardened" spec may ever surface a finding — ` +
    `got stderr: ${JSON.stringify(res.stderr)}`)
  assert.ok(res.stdout.includes('ac-drift: skipped 1 pre-v7 specs (dated before 20260817)'),
    `D5: the pre-floor done spec must be counted in exactly one "skipped" summary line — got stdout: ${JSON.stringify(res.stdout)}`)
  assert.ok(res.stdout.includes('ac-drift: 1 finding(s) across 1 done spec(s) — 1 specs, 1 criteria scanned'),
    `"scanned" must count only the one post-floor done spec — the pre-floor spec is skipped and the ` +
    `non-done spec was never a "done" spec to begin with — got stdout: ${JSON.stringify(res.stdout)}`)
})

test('AC-20260906-01-6: --json prints exactly one object with keys floor/scanned/criteria/skippedPreFloor/findings, floor equal to "20260817", and the same exit code as the human render', () => {
  const dir = tmpdir('ac-drift-6')
  writeSpec(dir, 'specs/20260901/01-x.md', 'done', [
    '- **AC-20260901-01-1**: WHEN a THE SYSTEM SHALL b',
    '- **AC-20260901-01-2**: WHEN a THE SYSTEM SHALL b [retired: ]',
  ])
  const res = run(dir, ['--json'])
  assert.strictEqual(res.status, 1,
    `--json must derive the same exit code as the human render (findings present here) — got ${res.status}, stderr: ${res.stderr}`)
  assert.strictEqual(res.stderr, '',
    `--json must print exactly one JSON object on stdout and nothing on stderr — a per-row human line leaking ` +
    `onto stderr under --json would corrupt any host script piping stdout through a JSON parser — got ${JSON.stringify(res.stderr)}`)
  const out = parseJson(res)
  assert.deepStrictEqual(Object.keys(out).sort(), ['criteria', 'findings', 'floor', 'scanned', 'skippedPreFloor'].sort(),
    `D5's --json shape is exactly these five keys — got ${JSON.stringify(Object.keys(out))}`)
  assert.strictEqual(out.floor, '20260817', `"floor" must equal the literal string "20260817" — got ${JSON.stringify(out.floor)}`)
  assert.strictEqual(out.scanned, 1, `"scanned" must count the one done post-floor spec — got ${out.scanned}`)
  assert.strictEqual(out.criteria, 2, `"criteria" must count both bullets — got ${out.criteria}`)
  assert.strictEqual(out.skippedPreFloor, 0, `no pre-floor spec exists in this host — got ${out.skippedPreFloor}`)
  assert.strictEqual(out.findings.length, 2, `both bullets are unsanctioned-or-uncited — got ${JSON.stringify(out.findings)}`)
  const uncovered = out.findings.find((f) => f.ac === 'AC-20260901-01-1')
  assert.ok(uncovered && uncovered.class === 'uncovered-ac' && uncovered.spec === 'specs/20260901/01-x.md' && uncovered.detail === 'no test cites it',
    `the uncovered-ac finding must carry {spec, ac, class, detail} exactly as the human line's own facts — got ${JSON.stringify(uncovered)}`)
  const retired = out.findings.find((f) => f.ac === 'AC-20260901-01-2')
  assert.ok(retired && retired.class === 'retired-uncited',
    `the uncited-retired bullet must produce class "retired-uncited" — got ${JSON.stringify(retired)}`)
})

test('AC-20260906-01-7: a --root with no specs/ directory is inapplicable and exits 0; an unknown flag or a valueless --root is a usage error exiting 2', () => {
  const noSpecs = tmpdir('ac-drift-7a')
  const noSpecsRes = run(noSpecs)
  assert.strictEqual(noSpecsRes.status, 0,
    `an absent specs/ directory is a sentinel, never an error — must exit 0 (stderr: ${noSpecsRes.stderr})`)
  assert.strictEqual(noSpecsRes.stdout.trim(), 'inapplicable — no specs/',
    `the sentinel line must be exactly "inapplicable — no specs/" — got ${JSON.stringify(noSpecsRes.stdout)}`)

  const unknownFlagRes = run(tmpdir('ac-drift-7b'), ['--fleet'])
  assert.strictEqual(unknownFlagRes.status, 2,
    `an unrecognized flag must be a usage error (exit 2), never silently ignored (stderr: ${unknownFlagRes.stderr})`)
  assert.ok(unknownFlagRes.stderr.includes('ac-drift.js --root <dir> [--json]'),
    `the unknown-flag refusal must print the usage line — got ${JSON.stringify(unknownFlagRes.stderr)}`)

  const noRootValueRes = runNode('scripts/ac-drift.js', ['--root'])
  assert.strictEqual(noRootValueRes.status, 2,
    `--root with no following value must be a usage error (exit 2) — got ${noRootValueRes.status}, stderr: ${noRootValueRes.stderr}`)
  assert.ok(noRootValueRes.stderr.includes('ac-drift.js --root <dir> [--json]'),
    `the valueless --root refusal must print the same usage line — got ${JSON.stringify(noRootValueRes.stderr)}`)

  const missingRootRes = run('/nonexistent-dir-xyz')
  assert.strictEqual(missingRootRes.status, 2,
    `a --root naming a path that does not exist at all must be a usage error (exit 2), never laundered into ` +
    `the "inapplicable — no specs/" sentinel — a mistyped root in /spec:doctor would otherwise pass silently ` +
    `as clean instead of failing loudly (stderr: ${missingRootRes.stderr})`)
  assert.ok(missingRootRes.stderr.includes('ac-drift.js --root <dir> [--json]'),
    `the nonexistent-root refusal must print the usage line — got ${JSON.stringify(missingRootRes.stderr)}`)
  assert.ok(missingRootRes.stderr.includes('--root must name an existing directory'),
    `the nonexistent-root refusal must state the specific reason "--root must name an existing directory" — ` +
    `got ${JSON.stringify(missingRootRes.stderr)}`)

  const fileRoot = writeFile(tmpdir('ac-drift-7c'), 'not-a-dir.txt', 'x\n')
  const fileRootRes = run(fileRoot)
  assert.strictEqual(fileRootRes.status, 2,
    `a --root naming an existing regular file (not a directory) must also be a usage error (exit 2) — the ` +
    `same mistyped-root class /spec:doctor must fail loudly on, not silently treat as an empty host ` +
    `(stderr: ${fileRootRes.stderr})`)
  assert.ok(fileRootRes.stderr.includes('ac-drift.js --root <dir> [--json]'),
    `the file-as-root refusal must print the usage line — got ${JSON.stringify(fileRootRes.stderr)}`)
  assert.ok(fileRootRes.stderr.includes('--root must name an existing directory'),
    `the file-as-root refusal must state the specific reason "--root must name an existing directory" — ` +
    `got ${JSON.stringify(fileRootRes.stderr)}`)
})

test('AC-20260906-01-8: a host-declared testGlobs array replaces the default classification, and lib/host-config.js\'s exported DEFAULT_TEST_GLOBS deep-equals scope-reconcile.js\'s own defaultTestGlobs literal', () => {
  const dir = tmpdir('ac-drift-8')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude', 'spec.config.json'), JSON.stringify({ testGlobs: ['checks/**'] }))
  writeSpec(dir, 'specs/20260901/01-x.md', 'done',
    ['- **AC-20260901-01-1**: WHEN a THE SYSTEM SHALL b'])
  writeFile(dir, 'checks/a.js', "test('AC-20260901-01-1: ...', () => {})\n")
  const res = run(dir)
  assert.strictEqual(res.status, 0,
    `D4: a host-declared testGlobs array must fully REPLACE (not extend) the default classification — a ` +
    `citation living in checks/a.js must count as coverage exactly as tests/**/*.test.js would by default ` +
    `(stderr: ${res.stderr})`)

  const scopeSrc = read('spec/scripts/scope-reconcile.js')
  const m = /const defaultTestGlobs = (\[[^\]]*\])/.exec(scopeSrc)
  assert.ok(m,
    'scope-reconcile.js must still declare its defaultTestGlobs array literal verbatim under that exact name ' +
    'for this pin to extract it from source — the literal moved, was renamed, or its value changed shape')
  // eslint-disable-next-line no-new-func
  const scopeGlobs = new Function('return ' + m[1])()
  const { DEFAULT_TEST_GLOBS } = require('../../spec/scripts/lib/host-config')
  assert.deepStrictEqual(DEFAULT_TEST_GLOBS, scopeGlobs,
    `D4: lib/host-config.js's exported DEFAULT_TEST_GLOBS must deep-equal scope-reconcile.js's own ` +
    `defaultTestGlobs literal verbatim — two copies of this array are the identical-literal shape D4 exists ` +
    `to remove, and this pin is the only thing holding them together until scope-reconcile.js itself imports ` +
    `the export — got ${JSON.stringify(DEFAULT_TEST_GLOBS)} vs scope-reconcile's ${JSON.stringify(scopeGlobs)}`)
})

test('AC-20260906-01-9: spec-paths resolves the ac-drift key to an existing file, doctor.md wires it as check 17, and entrypoints.json carries its row', () => {
  const pathsRes = runBash('bin/spec-paths', ['ac-drift'])
  assert.strictEqual(pathsRes.status, 0,
    `spec-paths must recognize the "ac-drift" key and exit 0 — got ${pathsRes.status}, stderr: ${pathsRes.stderr}`)
  const printed = pathsRes.stdout.trim()
  assert.match(printed, /spec\/scripts\/ac-drift\.js$/,
    `spec-paths ac-drift must print a path ending in spec/scripts/ac-drift.js — got ${JSON.stringify(printed)}`)
  assert.ok(printed && fs.existsSync(printed),
    `the path spec-paths ac-drift prints must name an existing file, or every command that resolves it through ` +
    `spec-paths breaks silently — got ${JSON.stringify(printed)}`)

  const doctorMd = read('spec/commands/doctor.md')
  assert.match(doctorMd, /17\.\s+\*\*[^\n]*\*\*[\s\S]{0,600}spec-paths ac-drift/,
    `spec/commands/doctor.md must carry a check numbered "17." that runs spec-paths ac-drift within its own ` +
    `body — got no match in doctor.md`)

  const entrypoints = JSON.parse(read('spec/entrypoints.json'))
  const row = entrypoints['spec/scripts/ac-drift.js']
  assert.ok(row && Array.isArray(row.entryPoints) && row.entryPoints.includes('spec/commands/doctor.md'),
    `spec/entrypoints.json must carry a "spec/scripts/ac-drift.js" row whose entryPoints includes ` +
    `spec/commands/doctor.md, or the entrypoint-conformance checker cannot see this script is activated — ` +
    `got ${JSON.stringify(row)}`)
})
