'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260817/07-promise-sweep-leg.md D1/D2 (2026-08-17): the v7 replay eval measured the
// single reviewer's one systematic miss class — a spec Decisions row that promises behavior
// nothing implements, invisible because no test fails to point at it (all five measured misses
// were Decisions-table rows). This suite pins the deterministic replacement, spec/scripts/
// promise-sweep.js, by executing it against synthetic specs in tmpdir() — the script does not
// exist yet at HEAD, so every test here is a TDD red pin. It reads ONLY the spec text (no
// --root, no File Plan, no test-file reads — that half of the chain stays ac-matrix's).

function specMd({ decisionsRows, acLines }) {
  return '# Test Spec\n\n## Decisions\n\n' +
    '| ID | Decision | One-line rationale |\n|----|----------|--------------------|\n' +
    decisionsRows.join('\n') + '\n\n## Acceptance Criteria\n\n' + (acLines || []).join('\n') + '\n'
}

function writeManifest(dir, lines) {
  const p = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n') + (lines.length ? '\n' : ''))
  return p
}

function lastManifestRow(manifestPath) {
  const lines = fs.readFileSync(manifestPath, 'utf8').trim().split('\n').filter(Boolean)
  return JSON.parse(lines[lines.length - 1])
}

function run(specPath, manifestPath, extraArgs = []) {
  const args = ['--spec', specPath]
  if (manifestPath) args.push('--manifest', manifestPath)
  args.push(...extraArgs)
  return runNode('scripts/promise-sweep.js', args)
}

function parseJson(res) {
  let parsed
  try { parsed = JSON.parse(res.stdout) } catch (e) {
    assert.fail(`--json output did not parse as JSON (status ${res.status}, stderr: ${res.stderr}): ${e.message}`)
  }
  return parsed
}

test('AC-20260817-07-1: a Decisions row citing an AC-ID declared in this spec\'s own Acceptance Criteria section is carried, deriving exit 0 and manifest observed rows=1 carried=1 sanctioned=0 orphans=0', () => {
  const dir = tmpdir('ps1')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd({
    decisionsRows: ['| D1 | does X (AC-20260899-99-1) | why |'],
    acLines: ['- **AC-20260899-99-1**: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js'],
  }))
  const manifest = writeManifest(dir, [])
  const res = run(spec, manifest)
  assert.strictEqual(res.status, 0,
    `a Decisions row citing its own spec's declared AC-ID must carry cleanly and exit 0, never the ` +
    `findings-exit 1 (stderr: ${res.stderr})`)
  const row = lastManifestRow(manifest)
  assert.strictEqual(row.leg, 'promise-sweep', `the appended manifest row's leg must be "promise-sweep" — got "${row.leg}"`)
  assert.strictEqual(row.exit, 0, `the appended row's exit must mirror the script's own exit code — got ${row.exit}`)
  assert.strictEqual(row.observed, 'rows=1 carried=1 sanctioned=0 orphans=0',
    `the pinned observed grammar for one carried row must read exactly "rows=1 carried=1 sanctioned=0 ` +
    `orphans=0" (D1) — a caller parsing this field byte-for-byte would misreport the spec's promise coverage ` +
    `otherwise — got "${row.observed}"`)
})

test('AC-20260817-07-2: a non-struck Decisions row with no AC-ID token and no [no-ac:] tag is an orphan, exiting 1 with a hard orphan-decision finding naming its own D-ID', () => {
  const dir = tmpdir('ps2')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd({
    decisionsRows: ['| D1 | does X | why |'],
    acLines: ['- **AC-20260899-99-1**: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js'],
  }))
  const manifest = writeManifest(dir, [])
  const res = run(spec, manifest, ['--json'])
  assert.strictEqual(res.status, 1,
    `a Decisions row with no AC-ID and no [no-ac:] sanction must exit 1 (findings emitted), the exact ` +
    `miss class this leg exists to close — never 0 or 2 (stderr: ${res.stderr})`)
  const out = parseJson(res)
  const f = out.findings.find(x => x.class === 'orphan-decision')
  assert.ok(f,
    'an uncarried, unsanctioned row must surface as an orphan-decision finding, or a spec Decision that ' +
    'promises behavior nothing implements ships silently — the v7 replay eval\'s one measured miss class')
  assert.strictEqual(f.severity, 'hard', `an orphan-decision finding must be severity "hard" — got "${f.severity}"`)
  assert.ok(f.detail.includes('D1'),
    `the finding detail must name the offending row's D-ID (D1) so the disposition flow can locate it — got "${f.detail}"`)
})

test('AC-20260817-07-3: a [no-ac: reason] row with no AC-ID counts sanctioned, and the same tag with an empty reason ([no-ac: ]) counts as an orphan instead', () => {
  const dir = tmpdir('ps3')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd({
    decisionsRows: ['| D1 | doctrine only | [no-ac: doctrine-only ruling] |'],
    acLines: ['- **AC-20260899-99-1**: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js'],
  }))
  const manifest1 = writeManifest(dir, [])
  const res1 = run(spec, manifest1)
  assert.strictEqual(res1.status, 0,
    `a row carrying a non-empty [no-ac: reason] tag and no AC-ID must be sanctioned and exit 0, never ` +
    `treated as an orphan (stderr: ${res1.stderr})`)
  const row1 = lastManifestRow(manifest1)
  assert.strictEqual(row1.observed, 'rows=1 carried=0 sanctioned=1 orphans=0',
    `a sanctioned row must be counted in sanctioned=, not carried= or orphans= — got "${row1.observed}"`)

  const spec2 = path.join(dir, 'spec2.md')
  fs.writeFileSync(spec2, specMd({
    decisionsRows: ['| D1 | doctrine only | [no-ac: ] |'],
    acLines: ['- **AC-20260899-99-1**: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js'],
  }))
  const manifest2 = writeManifest(dir, [])
  const res2 = run(spec2, manifest2)
  assert.strictEqual(res2.status, 1,
    `an empty-reason [no-ac: ] tag must NOT count as a sanction (D2: "empty reason ≠ sanction") — the row ` +
    `is an orphan and must exit 1, never 0 (stderr: ${res2.stderr})`)
  const row2 = lastManifestRow(manifest2)
  assert.strictEqual(row2.observed, 'rows=1 carried=0 sanctioned=0 orphans=1',
    `an empty [no-ac: ] tag must count the row as an orphan, not sanctioned — a blank rubber-stamp reason ` +
    `must not silently waive the check — got "${row2.observed}"`)
})

test('AC-20260817-07-4: a row citing AC-20260899-99-11 is not a carrier for a spec declaring only AC-20260899-99-1 — the anchored match forbids a prefix-phantom hit', () => {
  const dir = tmpdir('ps4')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd({
    decisionsRows: ['| D1 | does X (AC-20260899-99-11) | why |'],
    acLines: ['- **AC-20260899-99-1**: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js'],
  }))
  const manifest = writeManifest(dir, [])
  const res = run(spec, manifest, ['--json'])
  assert.strictEqual(res.status, 1,
    `AC-20260899-99-1 is a substring of the cited AC-20260899-99-11 but not an anchored full-token ` +
    `occurrence — the row must still report orphan and exit 1, never silently carried by a prefix match ` +
    `(stderr: ${res.stderr})`)
  const out = parseJson(res)
  const f = out.findings.find(x => x.class === 'orphan-decision')
  assert.ok(f && f.detail.includes('AC-20260899-99-11'),
    `the finding detail must list the unmatched citation AC-20260899-99-11 (D2: "unmatched citations") so a ` +
    `same-spec typo is visible to the author instead of silently passing — got "${f && f.detail}"`)
})

test('AC-20260817-07-5: a row citing only a foreign AC-ID absent from this spec\'s own Acceptance Criteria is an orphan naming that citation, and adding a declared own-spec AC-ID to the same row makes it carried with no finding', () => {
  const dir = tmpdir('ps5')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd({
    decisionsRows: ['| D1 | provenance only (AC-20250101-01-1) | why |'],
    acLines: ['- **AC-20260899-99-1**: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js'],
  }))
  const manifest = writeManifest(dir, [])
  const res = run(spec, manifest, ['--json'])
  assert.strictEqual(res.status, 1,
    `a row citing only a foreign spec's AC-ID (absent from this spec's own AC section) is not a carrier ` +
    `and must exit 1, never treated as covered by a citation this spec never declares (stderr: ${res.stderr})`)
  const out = parseJson(res)
  const f = out.findings.find(x => x.class === 'orphan-decision')
  assert.ok(f && f.detail.includes('AC-20250101-01-1'),
    `the orphan-decision detail must list the foreign citation AC-20250101-01-1 so an author can tell a ` +
    `provenance-only reference from a genuine same-spec typo (D2) — got "${f && f.detail}"`)

  const spec2 = path.join(dir, 'spec2.md')
  fs.writeFileSync(spec2, specMd({
    decisionsRows: ['| D1 | provenance + own (AC-20250101-01-1, AC-20260899-99-1) | why |'],
    acLines: ['- **AC-20260899-99-1**: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js'],
  }))
  const manifest2 = writeManifest(dir, [])
  const res2 = run(spec2, manifest2, ['--json'])
  assert.strictEqual(res2.status, 0,
    `the same row also citing a declared own-spec AC-ID must be carried and exit 0 — a foreign citation ` +
    `sitting alongside a valid one must never block an otherwise-valid carrier (stderr: ${res2.stderr})`)
  const out2 = parseJson(res2)
  assert.ok(!out2.findings.some(x => x.class === 'orphan-decision'),
    'once carried by the declared own-spec AC-ID, the row must raise no orphan-decision finding even ' +
    'though it also cites a foreign AC-ID — carried wins over an uncarried foreign citation (D2: "Carried wins")')
})

test('AC-20260817-07-6: a struck Decisions row is excluded entirely — a spec with one struck row and one carried row reports rows=1 carried=1 orphans=0 and exits 0', () => {
  const dir = tmpdir('ps6')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd({
    decisionsRows: [
      '| ~~D2~~ | retired | — |',
      '| D1 | does X (AC-20260899-99-1) | why |',
    ],
    acLines: ['- **AC-20260899-99-1**: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js'],
  }))
  const manifest = writeManifest(dir, [])
  const res = run(spec, manifest)
  assert.strictEqual(res.status, 0,
    `a struck row must never itself trip a finding (D2: "Struck rows ... excluded ... never findings") — ` +
    `the spec must exit 0 (stderr: ${res.stderr})`)
  const row = lastManifestRow(manifest)
  assert.strictEqual(row.observed, 'rows=1 carried=1 sanctioned=0 orphans=0',
    `a struck row must be excluded from rows= entirely — counting it as an uncarried orphan would falsely ` +
    `flag a superseded row nobody can fix, and counting it toward rows at all inflates the denominator — ` +
    `got "${row.observed}"`)
})

test('AC-20260817-07-7: a spec with no ## Decisions section exits 2 with a stderr line naming the missing section and the spec path', () => {
  const dir = tmpdir('ps7')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, '# Test Spec\n\n## Acceptance Criteria\n\n' +
    '- **AC-20260899-99-1**: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js\n')
  const manifest = writeManifest(dir, [])
  const res = run(spec, manifest)
  assert.strictEqual(res.status, 2,
    `a spec with no ## Decisions section must be a usage-tier error (exit 2), never silently treated as ` +
    `zero Decisions rows (stderr: ${res.stderr})`)
  assert.match(res.stderr, /no ## Decisions section/,
    `the stderr must contain the literal remedy phrase "no ## Decisions section" (D1) so the failure is ` +
    `actionable without reading the script source — got "${res.stderr}"`)
  assert.ok(res.stderr.includes(spec),
    `the stderr must name the spec path so a caller running this against many specs can tell which one ` +
    `failed — got "${res.stderr}"`)
})

test('AC-20260817-07-8: --manifest <path> appends exactly one promise-sweep JSONL row per invocation, and omitting --manifest writes no file at all (plan-lock mode)', () => {
  const dir = tmpdir('ps8')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd({
    decisionsRows: ['| D1 | does X | why |'],
    acLines: ['- **AC-20260899-99-1**: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js'],
  }))
  const manifest = writeManifest(dir, [{ leg: 'gate', exit: 0, observed: 'skips=0 todos=0' }])
  const before = fs.readFileSync(manifest, 'utf8').trim().split('\n').filter(Boolean)
  run(spec, manifest)
  const after = fs.readFileSync(manifest, 'utf8').trim().split('\n').filter(Boolean)
  const appended = after.slice(before.length).map(l => JSON.parse(l))
  assert.strictEqual(appended.length, 1,
    `--manifest must append exactly one JSONL row per invocation, never zero or more than one — got ${appended.length}`)
  assert.strictEqual(appended[0].leg, 'promise-sweep', `the appended row's leg must be "promise-sweep" — got "${appended[0].leg}"`)
  assert.ok(appended[0].exit === 0 || appended[0].exit === 1,
    `the appended row's exit must mirror the script's own exit code, 0 or 1 — got ${appended[0].exit}`)
  assert.match(appended[0].observed, /^rows=\d+ carried=\d+ sanctioned=\d+ orphans=\d+$/,
    `the appended row's observed must match the pinned grammar "rows=N carried=C sanctioned=S orphans=O" — got "${appended[0].observed}"`)

  const beforeFiles = fs.readdirSync(dir).sort()
  const specNoManifest = path.join(dir, 'spec-nomanifest.md')
  fs.writeFileSync(specNoManifest, specMd({
    decisionsRows: ['| D1 | does X | why |'],
    acLines: ['- **AC-20260899-99-1**: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js'],
  }))
  const resNoManifest = run(specNoManifest, null)
  const afterFiles = fs.readdirSync(dir).sort()
  assert.deepStrictEqual(afterFiles, [...beforeFiles, 'spec-nomanifest.md'].sort(),
    `plan-lock mode (--manifest omitted) must write NO file at all — the directory must gain only the spec ` +
    `file this test itself wrote, never a manifest or any stray side file (stderr: ${resNoManifest.stderr})`)
})
