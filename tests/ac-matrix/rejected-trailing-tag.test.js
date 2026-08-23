'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260823/03-silent-drop-hardening.md (2026-08-23, the 2026-08-21..23 upwell silent-drop
// incident): escape rv_640c582f4902 hardened lib/spec-sections.js's trailing-tag grammar to
// require a BARE trailing tag (a backticked one is refused as a self-tagging illustration), but
// the refusal itself is silent — a host that genuinely backticks a real trailing declaration
// (upwell saw 17 of them) gets misreported as a plain uncovered-ac/unsanctioned-skip finding with
// no hint that a trailing-tag refusal is the actual cause. D1/D2 make the refusal LOUD exactly
// where it changes a verdict: parseAcBullets exposes `trailingRejected` (D2, AC-7), and
// ac-matrix.js replaces the generic finding with a new `rejected-trailing-tag` hard finding
// naming the AC-ID, the refused tag text, and both readings' remedies — but ONLY when the
// refusal is causally relevant (D1: loud-when-it-bites, never unconditional, AC-4 pins the
// otherwise-clean case that must stay silent). This suite executes ac-matrix.js against synthetic
// host trees; the script does not implement D1/D2 yet, so AC-1/-2/-7 are RED at HEAD — AC-4 pins
// already-true behavior (a covered AC's illustrative trailing tag was always silent) and is GREEN.
//
// D9/AC-20260823-03-13 (2026-08-23, orchestrator-executed repro against the scripts worker's D1/D2
// build): ac-matrix.js derives its two manifest leg exits (`ac-matrix`, `skip-reconcile`) from two
// class sets, and `rejected-trailing-tag` — emitted from BOTH the coverage loop and the skip loop —
// was added to BOTH sets, so an emission from either loop reddens both legs. Repro: a spec with one
// uncovered AC carrying a refused trailing `[oracle:]` and ZERO skip lines wrote
// `{"leg":"skip-reconcile","exit":1,"observed":{"skipped":0,"sanctioned":0}}` — a leg reporting red
// having observed nothing, a silent misreport into the evidence manifest verdict.js reads. The two
// tests below assert on the raw `--manifest` JSONL rows (where the defect lives), each proving one
// direction of the symmetric contamination, plus that `--json`'s findings array and each finding's
// field set stay byte-identical (emission-site origin is internal bookkeeping only).

const { parseAcBullets } = require('../../spec/scripts/lib/spec-sections')

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
  // coverage either — the same fail-open class rv_640c582f4902 originally closed.
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
