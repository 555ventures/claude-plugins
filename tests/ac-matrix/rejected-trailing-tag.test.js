'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260823/03-silent-drop-hardening.md D1/D2/D9/D11 (escapes rv_640c582f4902,
// rv_6825fa48c98d): lib/spec-sections.js's trailing-tag grammar requires a BARE trailing tag —
// a backticked one is refused as a self-tagging illustration — and the refusal is LOUD exactly
// where it changes a verdict. parseAcBullets exposes `trailingRejected` (AC-7) and
// `trailingRejectedCause` (`'backticked-at-end' | 'not-at-end' | null`, D11); ac-matrix.js
// replaces the generic finding with `rejected-trailing-tag`, naming the AC-ID, the refused tag
// text, and the cause-forked remedy (never telling a not-at-end host to "remove the backticks",
// since a bare tag placed before the arrow still would not parse) — but ONLY when the refusal is
// causally relevant (AC-4 pins the otherwise-clean case that stays silent). D11 also widens the
// tolerant trailing run to tolerate exactly one trailing `→ <tail>` File-Plan reference suffix.
// ac-matrix.js derives its `ac-matrix` and `skip-reconcile` manifest leg exits from the finding
// OBJECT emitted at each loop's own site (AC-13), never from class-set membership shared across
// loops — `rejected-trailing-tag` is emitted from both the coverage loop and the skip loop, so a
// shared class set would redden both legs from a single emission. Executed against synthetic
// host trees.

const { parseAcBullets, rejectedTrailingTagDetail } = require('../../spec/scripts/lib/spec-sections')

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

test('AC-20260823-03-7: parseAcBullets returns trailingRejected as the backtick-tolerant trailing tag run\'s text (with the named tag itself parsing null) when the bare-only trailingRun refuses it, and null when there is no trailing tag run at all or the bare-only run accepts it', () => {
  const backticked = parseAcBullets('- **AC-20260823-50-1**: WHEN x THE SYSTEM SHALL y `[oracle: gate]`\n')
  assert.strictEqual(backticked.length, 1, `fixture must parse to exactly one AC bullet — got ${backticked.length}`)
  assert.strictEqual(backticked[0].trailingRejected, '`[oracle: gate]`',
    `a bullet ending in a backticked trailing tag must expose the refused run's exact text via trailingRejected — without it, ac-matrix.js/red-check.js cannot detect the refusal was causally relevant and would have to re-derive the trailing grammar themselves (D2), the exact second authority this field exists to prevent — got ${JSON.stringify(backticked[0])}`)
  assert.strictEqual(backticked[0].oracle, null,
    `the bare-only ban itself is untouched by D2 — a backticked trailing tag must still parse the named tag null, or D2 would silently soften the bare-only rule it is meant to only ANNOTATE — got ${JSON.stringify(backticked[0])}`)

  const bare = parseAcBullets('- **AC-20260823-51-1**: WHEN x THE SYSTEM SHALL y [oracle: gate]\n')
  assert.strictEqual(bare[0].trailingRejected, null,
    `a BARE trailing tag is accepted by trailingRun, so nothing was refused — trailingRejected must be null, or ac-matrix.js would wrongly treat every ordinary bare declaration as a refusal needing a rejected-trailing-tag finding — got ${JSON.stringify(bare[0])}`)

  const none = parseAcBullets('- **AC-20260823-52-1**: WHEN x THE SYSTEM SHALL y\n')
  assert.strictEqual(none[0].trailingRejected, null,
    `a bullet with no trailing tag run at all must parse trailingRejected null, not merely falsy — got ${JSON.stringify(none[0])}`)
})

test('AC-20260823-03-1: WHEN ac-matrix evaluates an AC with no executed coverage whose bullet ends in a backticked oracle tag THE SYSTEM emits hard finding class rejected-trailing-tag (not uncovered-ac), naming the AC-ID, the refused tag text, and the un-backtick/move-to-slot remedy', () => {
  const dir = tmpdir('rtt1')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), '// unrelated, no AC-ID literal\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260823-30-1**: WHEN x THE SYSTEM SHALL y `[oracle: gate]`'],
    ['| tests/foo.test.js | CREATE | tests | zero AC-ID hits, bullet ends in a backticked oracle tag |']))
  // A green manifest row for the named leg proves the refused tag does not launder into oracle
  // coverage either — guarding against the fail-open class rv_640c582f4902.
  const manifest = writeManifest(dir, [{ leg: 'gate', exit: 0, observed: 'skips=0 todos=0' }])
  const res = run(spec, dir, manifest, ['--json'])
  assert.strictEqual(res.status, 1,
    `an AC with zero executed coverage and a refused trailing oracle tag must still exit 1 — the finding CLASS changes but severity does not, or the verdict softens by construction (stderr: ${res.stderr})`)
  const out = findings(res)
  assert.ok(!out.findings.some(f => f.class === 'uncovered-ac' && f.ac === 'AC-20260823-30-1'),
    `D1: rejected-trailing-tag REPLACES the generic finding — never both for one AC. A surviving uncovered-ac finding here means the refusal's cause is still hidden from the host, the exact silent misreport this spec exists to fix — got ${JSON.stringify(out.findings)}`)
  const f = out.findings.find(x => x.class === 'rejected-trailing-tag' && x.ac === 'AC-20260823-30-1')
  assert.ok(f, `AC-20260823-30-1's zero coverage plus its refused trailing [oracle:] tag must produce a rejected-trailing-tag finding naming it — got ${JSON.stringify(out.findings)}`)
  assert.ok(f.detail.includes('AC-20260823-30-1'),
    `the finding's detail must name the AC-ID itself so a human can find the offending bullet without cross-referencing the ac field — got detail "${f.detail}"`)
  assert.match(f.detail, /\[oracle:\s*gate\]/,
    `the detail must name the refused tag's literal text so a human can see exactly what was refused, not just that something was — got detail "${f.detail}"`)
  assert.match(f.detail, /backtick/i,
    `the detail must explain WHY the tag was refused (it was backticked — the bare-only trailing rule, rv_640c582f4902) — a detail silent on the mechanism reproduces exactly the silent-cause misreport this spec fixes — got detail "${f.detail}"`)
  assert.match(f.detail, /declaration slot/i,
    `the detail must name the remedy of moving the tag into the declaration slot (backticks allowed there) as one of the two readings — got detail "${f.detail}"`)
  assert.strictEqual(out.observed.acMatrix.oracle, 0,
    `the refused tag must never launder into the typed row's oracle-coverage count — it was never a genuine declaration, only a refused one — got ${JSON.stringify(out.observed.acMatrix)}`)
})

test('AC-20260823-03-2: WHEN a skipped test maps to an AC whose owning bullet ends in a backticked env tag THE SYSTEM emits rejected-trailing-tag (not unsanctioned-skip), naming the AC-ID and remedy', () => {
  const dir = tmpdir('rtt2')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/env.test.js'), '// covers AC-20260823-31-1\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260823-31-1**: WHEN x THE SYSTEM SHALL y `[env: FOO]`'],
    ['| tests/env.test.js | CREATE | tests | covers the AC; owning bullet ends in a backticked env tag |']))
  const manifest = writeManifest(dir, [])
  const skips = path.join(dir, 'skips.txt')
  fs.writeFileSync(skips, 'skipped test for AC-20260823-31-1 round trip\n')
  const res = run(spec, dir, manifest, ['--skips', skips, '--json'])
  assert.strictEqual(res.status, 1,
    `a mapped skip whose owning bullet's env declaration was refused must still exit 1 (stderr: ${res.stderr})`)
  const out = findings(res)
  assert.ok(!out.findings.some(f => f.class === 'unsanctioned-skip' && f.ac === 'AC-20260823-31-1'),
    `D1 replacement: the generic unsanctioned-skip must not also fire alongside rejected-trailing-tag for the same AC — got ${JSON.stringify(out.findings)}`)
  const f = out.findings.find(x => x.class === 'rejected-trailing-tag' && x.ac === 'AC-20260823-31-1')
  assert.ok(f, `a skip mapped to AC-20260823-31-1, whose owning bullet's [env:] declaration was refused for being backticked, must produce a rejected-trailing-tag finding naming it — got ${JSON.stringify(out.findings)}`)
  assert.ok(f.detail.includes('AC-20260823-31-1'),
    `the detail must name the AC-ID — got detail "${f.detail}"`)
  assert.match(f.detail, /\[env:\s*FOO\]/,
    `the detail must name the refused tag's literal text — got detail "${f.detail}"`)
  assert.match(f.detail, /backtick/i,
    `the detail must explain the refusal was due to the tag being backticked — got detail "${f.detail}"`)
  assert.match(f.detail, /declaration slot/i,
    `the detail must name the declaration-slot remedy — got detail "${f.detail}"`)
})

test('AC-20260823-03-4: WHEN an AC\'s bullet ends in a backticked tag but the AC is otherwise clean (covered by a literal test hit) THE SYSTEM SHALL CONTINUE TO report no finding for that AC — the rv_640c582f4902 illustration case stays silent when the refusal is not causally relevant to any finding', () => {
  const dir = tmpdir('rtt4')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), '// covers AC-20260823-32-1\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260823-32-1**: WHEN x THE SYSTEM SHALL y, e.g. `[oracle: gate]`'],
    ['| tests/foo.test.js | CREATE | tests | covers the AC by a literal hit — the trailing backticked tag is mere illustration |']))
  const manifest = writeManifest(dir, [])
  const res = run(spec, dir, manifest, ['--json'])
  assert.strictEqual(res.status, 0,
    `a covered AC whose trailing tag is refused must exit 0 — a nonzero exit here means an unconditional check fired on a bullet the bare-only ban was built to ignore, hard-failing exactly the illustration case D1 protects (stderr: ${res.stderr})`)
  const out = findings(res)
  assert.ok(!out.findings.some(f => f.ac === 'AC-20260823-32-1'),
    `neither the generic finding nor rejected-trailing-tag may fire for AC-20260823-32-1 — it is covered by a literal hit, so the refusal never changes any verdict and must stay silent (D1: loud-when-it-bites, never unconditional) — got ${JSON.stringify(out.findings)}`)
})

function manifestRows(manifestPath) {
  return fs.readFileSync(manifestPath, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
}

test('AC-20260823-03-13a: WHEN ac-matrix emits rejected-trailing-tag from the COVERAGE loop only (an uncovered AC with a refused trailing [oracle:] tag, ZERO skip lines) THE SYSTEM writes the skip-reconcile manifest leg row with exit:0 while the ac-matrix leg row carries exit:1 — leg exits partition by EMISSION SITE, not by finding class (D9), and --json\'s findings array/field shape stay unchanged', () => {
  const dir = tmpdir('rtt13a')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), '// unrelated, no AC-ID literal\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260823-40-1**: WHEN x THE SYSTEM SHALL y `[oracle: gate]`'],
    ['| tests/foo.test.js | CREATE | tests | zero AC-ID hits, bullet ends in a backticked oracle tag; no skip lines at all |']))
  const manifest = writeManifest(dir, [])
  // No --skips flag at all: skipLines stays empty, so the skip-reconcile loop never runs and
  // never observes anything of its own — a green leg is the only honest report of that.
  const res = run(spec, dir, manifest, ['--json'])
  assert.strictEqual(res.status, 1,
    `the coverage-loop rejected-trailing-tag finding is still a hard finding overall — the script's own exit code must stay 1 (stderr: ${res.stderr})`)
  const rows = manifestRows(manifest)
  const acmRow = rows.find(r => r.leg === 'ac-matrix')
  const skipRow = rows.find(r => r.leg === 'skip-reconcile')
  assert.ok(acmRow, `the manifest must carry an ac-matrix leg row — got ${JSON.stringify(rows)}`)
  assert.ok(skipRow, `the manifest must carry a skip-reconcile leg row — got ${JSON.stringify(rows)}`)
  assert.strictEqual(acmRow.exit, 1,
    `the coverage loop genuinely emitted rejected-trailing-tag for AC-20260823-40-1, so its OWN leg must redden — got ${JSON.stringify(acmRow)}`)
  assert.strictEqual(skipRow.exit, 0,
    `D9: leg exits partition by EMISSION SITE, not by finding class — a coverage-loop-only emission must never redden skip-reconcile, whose loop never ran and observed nothing (zero skip lines). A red skip-reconcile row here is exactly the silent misreport into the evidence manifest this whole spec exists to eliminate — got ${JSON.stringify(skipRow)}`)

  const out = findings(res)
  const f = out.findings.find(x => x.class === 'rejected-trailing-tag' && x.ac === 'AC-20260823-40-1')
  assert.ok(f, `the --json findings array must still carry the rejected-trailing-tag finding itself — D9 only changes leg-exit derivation, never the findings array — got ${JSON.stringify(out.findings)}`)
  assert.deepStrictEqual(Object.keys(f).sort(), ['ac', 'class', 'detail', 'severity'],
    `D9's own text: "the --json findings array and every finding's own shape stay byte-identical — origin is internal bookkeeping, never an emitted field" — an extra key here (e.g. "leg" or "origin") means D9's internal bookkeeping leaked into the public --json contract — got ${JSON.stringify(Object.keys(f))}`)
})

test('AC-20260823-03-13b: WHEN ac-matrix emits rejected-trailing-tag from the SKIP loop only (a mapped skip whose owning bullet has a refused trailing [env:] tag, on a spec whose every AC is covered) THE SYSTEM writes the ac-matrix manifest leg row with exit:0 while the skip-reconcile leg row carries exit:1', () => {
  const dir = tmpdir('rtt13b')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/env.test.js'), '// covers AC-20260823-41-1\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260823-41-1**: WHEN x THE SYSTEM SHALL y `[env: FOO]`'],
    ['| tests/env.test.js | CREATE | tests | covered by a literal hit — every AC in this spec is covered; owning bullet ends in a backticked env tag |']))
  const manifest = writeManifest(dir, [])
  const skips = path.join(dir, 'skips.txt')
  fs.writeFileSync(skips, 'skipped test for AC-20260823-41-1 round trip\n')
  const res = run(spec, dir, manifest, ['--skips', skips])
  assert.strictEqual(res.status, 1,
    `the skip-loop rejected-trailing-tag finding is still a hard finding overall — the script's own exit code must stay 1 (stderr: ${res.stderr})`)
  const rows = manifestRows(manifest)
  const acmRow = rows.find(r => r.leg === 'ac-matrix')
  const skipRow = rows.find(r => r.leg === 'skip-reconcile')
  assert.ok(acmRow, `the manifest must carry an ac-matrix leg row — got ${JSON.stringify(rows)}`)
  assert.ok(skipRow, `the manifest must carry a skip-reconcile leg row — got ${JSON.stringify(rows)}`)
  assert.strictEqual(skipRow.exit, 1,
    `the skip loop genuinely emitted rejected-trailing-tag for the mapped skip on AC-20260823-41-1, so its OWN leg must redden — got ${JSON.stringify(skipRow)}`)
  assert.strictEqual(acmRow.exit, 0,
    `D9: leg exits partition by EMISSION SITE — a skip-loop-only emission must never redden ac-matrix. AC-20260823-41-1 is covered by a literal hit, so the coverage loop skipped it entirely and observed no finding for it at all — a red ac-matrix row here misreports a coverage failure that never happened — got ${JSON.stringify(acmRow)}`)
})

test('AC-20260823-03-14: WHEN parseAcBullets parses a bullet whose tag run sits immediately before the bullet\'s final → reference THE SYSTEM returns trailingRejected as that run\'s text with trailingRejectedCause === \'not-at-end\' and preGreen === null, while a backticked run at the true end returns trailingRejectedCause === \'backticked-at-end\', and a bare-at-end or tagless bullet returns both fields null', () => {
  const notAtEnd = parseAcBullets(
    '- **AC-20260823-60-1**: WHEN x THE SYSTEM SHALL y `[pre-green: predicate-in-test]` → tests/a.test.js\n')
  assert.strictEqual(notAtEnd.length, 1, `fixture must parse to exactly one AC bullet — got ${notAtEnd.length}`)
  assert.strictEqual(notAtEnd[0].trailingRejected, '`[pre-green: predicate-in-test]`',
    `D11: a genuine declaration written just before the bullet's final → reference (the shape specs/20260823/01 AC-20260823-01-18/-20 actually shipped, discovered via review row rv_6825fa48c98d) must still expose the refused run's exact text via trailingRejected, or the widened said-vs-parsed comparison silently misses the very drop it exists to close — got ${JSON.stringify(notAtEnd[0])}`)
  assert.strictEqual(notAtEnd[0].trailingRejectedCause, 'not-at-end',
    `a tag sitting before the final → reference — never a recognized declaration position — must be tagged 'not-at-end', not 'backticked-at-end': the two causes drive different remedy text, and a mislabeled cause here would tell the host "remove the backticks" when that alone would not make this tag parse — got ${JSON.stringify(notAtEnd[0])}`)
  assert.strictEqual(notAtEnd[0].preGreen, null,
    `what PARSES is untouched by D11 — a refused not-at-end tag must still parse the named field null, or the widening would silently soften the position rule it only annotates — got ${JSON.stringify(notAtEnd[0])}`)

  const atEnd = parseAcBullets('- **AC-20260823-61-1**: WHEN x THE SYSTEM SHALL y `[oracle: gate]`\n')
  assert.strictEqual(atEnd[0].trailingRejectedCause, 'backticked-at-end',
    `a backticked run that IS the bullet's true end (no → reference following it) must be tagged 'backticked-at-end', so its remedy correctly offers "remove the backticks" as one of the two readings — got ${JSON.stringify(atEnd[0])}`)

  const bareAtEnd = parseAcBullets('- **AC-20260823-62-1**: WHEN x THE SYSTEM SHALL y [oracle: gate]\n')
  assert.strictEqual(bareAtEnd[0].trailingRejected, null,
    `a bare tag at the true end was accepted, not refused — trailingRejected must stay null — got ${JSON.stringify(bareAtEnd[0])}`)
  assert.strictEqual(bareAtEnd[0].trailingRejectedCause, null,
    `the Contracts invariant is trailingRejectedCause null IFF trailingRejected is null — a non-null cause on an accepted bullet would tell a consumer something was refused when nothing was — got ${JSON.stringify(bareAtEnd[0])}`)

  const none = parseAcBullets('- **AC-20260823-63-1**: WHEN x THE SYSTEM SHALL y\n')
  assert.strictEqual(none[0].trailingRejected, null,
    `a bullet with no trailing tag run at all must parse trailingRejected null — got ${JSON.stringify(none[0])}`)
  assert.strictEqual(none[0].trailingRejectedCause, null,
    `and trailingRejectedCause null alongside it, for the same reason — got ${JSON.stringify(none[0])}`)
})

test('AC-20260823-03-15: WHEN rejectedTrailingTagDetail renders a not-at-end refusal THE SYSTEM names the position problem and the move-into-the-declaration-slot remedy and does NOT contain the phrase "remove the backticks"; a backticked-at-end refusal renders D10\'s exact pinned message bytes unchanged', () => {
  const acId = 'AC-20260823-64-1'
  const trailingRejected = '`[pre-green: predicate-in-test]`'
  const underlying = 'tests/x64.test.js is a green expected-red file'

  const notAtEnd = rejectedTrailingTagDetail(acId, trailingRejected, 'not-at-end', underlying)
  assert.ok(!notAtEnd.includes('remove the backticks'),
    `D11: for a not-at-end refusal, removing the backticks alone would NOT make the tag parse — it still sits before the bullet's final → reference, not a recognized declaration position. Offering that remedy is false there and sends the host chasing the wrong fix — got detail "${notAtEnd}"`)
  assert.match(notAtEnd, /final.*→|→.*reference|before.*→|not a recognized declaration position/i,
    `the not-at-end message must name the actual position problem (the tag sits before the bullet's final → reference, not a recognized declaration position) — a message silent on WHY reproduces the same silent-cause misreport this spec fixes — got detail "${notAtEnd}"`)
  assert.match(notAtEnd, /declaration slot/i,
    `the not-at-end message must still name the move-into-the-declaration-slot remedy — got detail "${notAtEnd}"`)

  const expectedBacktickedAtEnd = `${acId}: trailing tag ${trailingRejected} was refused as a declaration — it ends the ` +
    `bullet backticked, and the bare-only trailing rule (rv_640c582f4902) accepts only a BARE ` +
    `trailing tag as a declaration. If this is a genuine declaration: remove the backticks, or ` +
    `move it into the declaration slot (backticks allowed there). If it is meant only as a quote: ` +
    `${underlying} still stands and needs its own fix.`
  const backtickedAtEnd = rejectedTrailingTagDetail(acId, trailingRejected, 'backticked-at-end', underlying)
  assert.strictEqual(backtickedAtEnd, expectedBacktickedAtEnd,
    `D10/D11: the backticked-at-end branch must render D10's exact pinned message bytes unchanged — the new cause parameter forks the message, it must never reword the branch that was already correct, or every existing rejected-trailing-tag consumer's detail assertion (AC-1/-2/-3) silently drifts underneath it — got detail "${backtickedAtEnd}"`)
})

test('AC-20260823-03-16: WHEN a bullet ends with a backticked tag followed by an accepted bare tag THE SYSTEM sets trailingRejected to the tolerant run\'s text while the bare tag SHALL CONTINUE TO parse as a declaration', () => {
  const mixed = parseAcBullets('- **AC-20260823-65-1**: WHEN x THE SYSTEM SHALL y `[oracle: gate]` [env: FOO]\n')
  assert.strictEqual(mixed.length, 1, `fixture must parse to exactly one AC bullet — got ${mixed.length}`)
  assert.strictEqual(mixed[0].trailingRejected, '`[oracle: gate]` [env: FOO]',
    `D11: a backticked tag standing beside an accepted bare tag at the true end is ALSO refused (the widened run differs from the bare-only capture, which accepted only the trailing [env:] item) — D2's null-test missed this exact shape because trailingRun(raw) was non-null (it matched the bare [env:] tail alone), so the old formula silently reported no refusal at all. A silently-dropped backticked sibling here would recreate the upwell incident class this spec exists to close — got ${JSON.stringify(mixed[0])}`)
  assert.strictEqual(mixed[0].env, 'FOO',
    `the accepted bare [env:] tag must keep parsing as a declaration even though its backticked sibling is refused — refusing the sibling must never launder into refusing the tag that legitimately parsed — got ${JSON.stringify(mixed[0])}`)
})
