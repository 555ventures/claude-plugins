'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260817/07-promise-sweep-leg.md D1/D2: the v7 replay eval measured the
// single reviewer's one systematic miss class — a spec Decisions row that promises behavior
// nothing implements, invisible because no test fails to point at it (all five measured misses
// were Decisions-table rows). This suite pins the deterministic replacement, spec/scripts/
// promise-sweep.js, by executing it against synthetic specs in tmpdir() — the script does not
// exist yet at HEAD, so every test here is a TDD red pin. It reads ONLY the spec text (no
// --root, no File Plan, no test-file reads — that half of the chain stays ac-matrix's).
//
// specs/20260820/03-review-observation-truth.md D5 (AC-20260820-03-7 .. -03-9 — 52 noise
// findings that trained bulk-waiving, which shipped escape rv_8b7c4e2e9ec0 inside a
// 17/17-waive review): the sweep applied retroactively to specs locked
// before the carrier convention existed. It now gains an applicability cutoff — spec date = the
// first `specs/<YYYYMMDD>/` path segment, compared against built-in `APPLIES_FROM = '20260817'`
// (the date specs/20260817/07 shipped the convention). A pre-cutoff spec exits 0 with zero
// findings and (with --manifest) appends a distinct `not-applicable` row instead of sweeping —
// even a spec whose Decisions carry a genuinely uncarried row. A path with no dated segment
// applies the sweep in full (fail-closed, unchanged behavior) — AC-20260817-07-2's tmpdir-based
// fixture below already pins that default and is retagged accordingly.
//
// specs/20260820/06-typed-evidence-manifest.md D1/D9 (brief 16's second move): every
// manifest row's `observed` field becomes a typed JSON object — promise-sweep's counted row
// becomes exactly {"rows":N,"carried":C,"sanctioned":S,"orphans":O} and the pre-cutoff row
// becomes {"notApplicable":{"spec":"YYYYMMDD","appliesFrom":"YYYYMMDD"}}; the packed
// "rows=N carried=C sanctioned=S orphans=O" and "not-applicable spec=X appliesFrom=Y" strings
// are retired from the MANIFEST only. D8/AC-20260820-06-9: the plain-mode STDOUT counters line
// ("promise-sweep: rows=N carried=C sanctioned=S orphans=O · K finding(s)") stays byte-unchanged
// — plan.md's lock step copies it verbatim into the plan ledger row, and this spec never touches
// that contract. No existing test in this file asserted that stdout line's literal shape before
// this pass (every prior pin read `row.observed`, the manifest field, never console output), so
// AC-20260820-06-9 is a SHALL-CONTINUE-TO pin added fresh to AC-20260817-07-8's plan-lock branch
// below — it is true against both the pre- and post-migration script, since D9 never touches
// stdout. AC-20260820-03-9's manifest-row pin (the pre-cutoff not-applicable row) is retyped in
// place and retagged AC-20260820-06-8 per D9; AC-20260820-03-7's stdout assertion for the SAME
// pre-cutoff branch is untouched (same "human stdout stays byte-unchanged" reasoning as AC-9).

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
  assert.deepStrictEqual(row.observed, { rows: 1, carried: 1, sanctioned: 0, orphans: 0 },
    `specs/20260820/06-typed-evidence-manifest.md D1/D9: the pinned observed grammar for one carried row ` +
    `must be exactly the typed object {"rows":1,"carried":1,"sanctioned":0,"orphans":0} — never the packed ` +
    `"rows=1 carried=1 sanctioned=0 orphans=0" string, which a downstream reader can no longer misparse or ` +
    `silently drop a key from — got ${JSON.stringify(row.observed)}`)
})

test('AC-20260817-07-2 / AC-20260820-03-8 (CONTINUES TO enumerate and finding fully — this tmpdir spec path carries no specs/<YYYYMMDD>/ segment, pinning D5\'s fail-closed default for undated paths): a non-struck Decisions row with no AC-ID token and no [no-ac:] tag is an orphan, exiting 1 with a hard orphan-decision finding naming its own D-ID', () => {
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
  assert.deepStrictEqual(row1.observed, { rows: 1, carried: 0, sanctioned: 1, orphans: 0 },
    `a sanctioned row must be counted in the typed object's "sanctioned" field, not "carried" or "orphans" ` +
    `— got ${JSON.stringify(row1.observed)}`)

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
  assert.deepStrictEqual(row2.observed, { rows: 1, carried: 0, sanctioned: 0, orphans: 1 },
    `an empty [no-ac: ] tag must count the row as an orphan, not sanctioned — a blank rubber-stamp reason ` +
    `must not silently waive the check — got ${JSON.stringify(row2.observed)}`)
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
  assert.deepStrictEqual(row.observed, { rows: 1, carried: 1, sanctioned: 0, orphans: 0 },
    `a struck row must be excluded from the "rows" count entirely — counting it as an uncarried orphan would ` +
    `falsely flag a superseded row nobody can fix, and counting it toward rows at all inflates the ` +
    `denominator — got ${JSON.stringify(row.observed)}`)
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
  assert.ok(appended[0].observed && typeof appended[0].observed === 'object',
    `specs/20260820/06-typed-evidence-manifest.md D1: the appended row's observed must be a non-null typed ` +
    `object, never a packed string — got ${JSON.stringify(appended[0].observed)}`)
  assert.deepStrictEqual(Object.keys(appended[0].observed).sort(), ['carried', 'orphans', 'rows', 'sanctioned'],
    `D9: the appended row's observed must match the pinned typed grammar {"rows":N,"carried":C,` +
    `"sanctioned":S,"orphans":O} — got ${JSON.stringify(appended[0].observed)}`)
  for (const k of ['rows', 'carried', 'sanctioned', 'orphans']) {
    assert.strictEqual(typeof appended[0].observed[k], 'number',
      `D9: observed.${k} must be a number, never a string digit or missing — got ${JSON.stringify(appended[0].observed)}`)
  }

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
  assert.match(resNoManifest.stdout, /^promise-sweep: rows=\d+ carried=\d+ sanctioned=\d+ orphans=\d+ · \d+ finding\(s\)$/m,
    `AC-20260820-06-9: plan-lock mode's plain stdout SHALL CONTINUE TO include, on its own line, the ` +
    `byte-unchanged "promise-sweep: rows=N carried=C sanctioned=S orphans=O · K finding(s)" counters format ` +
    `— D9 retypes only the MANIFEST row's observed field above; plan.md's lock step copies this printed line ` +
    `verbatim into the plan ledger row, and this spec never touches that contract, so the counters line's ` +
    `format must be unchanged before and after D9's migration (stdout may also carry HARD/SOFT finding lines ` +
    `ahead of it, which this assertion does not constrain) — got ${JSON.stringify(resNoManifest.stdout)}`)
})

test('AC-20260820-03-7: a spec whose path\'s dated segment predates the cutoff (specs/20260701/...) exits 0 with zero findings even though its lone Decisions row is uncarried, stdout naming "not-applicable spec=20260701 appliesFrom=20260817"', () => {
  const dir = tmpdir('ps-cutoff')
  const specDir = path.join(dir, 'specs', '20260701')
  fs.mkdirSync(specDir, { recursive: true })
  const spec = path.join(specDir, '01-old.md')
  fs.writeFileSync(spec, specMd({
    decisionsRows: ['| D1 | does X | why |'], // uncarried: no AC-ID, no [no-ac:] — would orphan if genuinely swept
    acLines: ['- **AC-20260899-99-1**: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js'],
  }))
  const manifest = writeManifest(dir, [])
  const res = run(spec, manifest)
  assert.strictEqual(res.status, 0,
    `D5: a spec dated before APPLIES_FROM (20260817) must exit 0 with zero findings regardless of an ` +
    `uncarried Decisions row — retroactive application to pre-convention specs is the exact defect that ` +
    `trained bulk-waiving and shipped escape rv_8b7c4e2e9ec0 (stderr: ${res.stderr})`)
  assert.match(res.stdout, /not-applicable spec=20260701 appliesFrom=20260817/,
    `D5: stdout must contain the literal "not-applicable spec=20260701 appliesFrom=20260817" so a caller ` +
    `reading console output (not just the manifest) can tell a genuinely-swept clean spec from one the ` +
    `cutoff exempted — got "${res.stdout}"`)
})

test('AC-20260820-06-8 (retag of AC-20260820-03-9): --manifest for a pre-cutoff spec appends exactly one promise-sweep row {"exit":0,"observed":{"notApplicable":{"spec":"20260701","appliesFrom":"20260817"}}}', () => {
  const dir = tmpdir('ps-cutoff-manifest')
  const specDir = path.join(dir, 'specs', '20260701')
  fs.mkdirSync(specDir, { recursive: true })
  const spec = path.join(specDir, '01-old.md')
  fs.writeFileSync(spec, specMd({
    decisionsRows: ['| D1 | does X | why |'],
    acLines: ['- **AC-20260899-99-1**: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js'],
  }))
  const manifest = writeManifest(dir, [])
  run(spec, manifest)
  const row = lastManifestRow(manifest)
  assert.deepStrictEqual(row, {
    leg: 'promise-sweep', exit: 0, observed: { notApplicable: { spec: '20260701', appliesFrom: '20260817' } },
  }, `D9: the appended manifest row for a pre-cutoff spec must be exactly this typed shape, never the retired ` +
    `packed "not-applicable spec=20260701 appliesFrom=20260817" string — a caller consuming the manifest ` +
    `cannot distinguish "genuinely swept, zero orphans" from "skipped by the cutoff entirely" without this ` +
    `distinct observed object, and D1's object-or-invalid rule makes the old string shape UNVERIFIED, not a ` +
    `readable not-applicable row: got ${JSON.stringify(row)}`)
})
