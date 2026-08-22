'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260821/03-cross-spec-skip-mapping.md D1/D2 (2026-08-21, UpWell defect 1 of 2): the
// owning-spec `[env:]` sanction specs/20260815/03 shipped is reachable only via routes 1
// (AC-ID embedded in the skip line) and 2 (content-matched against the spec-under-review's own
// File Plan files) — a skip OWNED BY AN EARLIER SPEC, reported by a runner that qualifies its
// skip lines with the file's own path (`<relpath>::<name>`, e.g. pytest), maps to neither route
// unless that file happens to be part of THIS spec's File Plan (UpWell: the same four env-gated
// tests were `sanctioned=4` under their OWNING spec, `sanctioned=0` under every other). D1 adds a
// third route, tried ONLY after both existing routes miss on a line containing `::`: resolve the
// prefix against `--root` and — if it stays inside root and the file exists — read its
// full-token AC-ID citations (dedup in file order) into the SAME acById/owning-spec logic. D2:
// monotonic widening only — routes 1/2 stay byte-unchanged, route 3 never fires for an
// already-resolved or bare (no `::`) line. Sibling of owning-spec-env.test.js (same idiom).
// AC-1/4/7 are red-first (route 3 does not exist at HEAD); AC-2/3/5/6 pin CONTINUE-TO edges.

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

// A minimal spec-under-review host: one well-formed, covered, env-less AC unrelated to the case
// under test, so every fixture has valid AC/File Plan sections without interfering with the skip
// case. Matches tests/ac-matrix/owning-spec-env.test.js's baseHost exactly.
function baseHost(dir) {
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), '// covers AC-20260814-01-1\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260814-01-1**: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js'],
    ['| tests/foo.test.js | CREATE | tests | covers AC |']))
  return spec
}

function skipReconcileOf(res) {
  const out = findings(res)
  return { out, row: out.observed.skipReconcile }
}

test('AC-20260821-03-1: a runner-qualified skip line unmapped by routes 1-2, whose resolved file cites an AC declared [env:] in ITS OWNING spec, is sanctioned via the existing owning-spec lookup — red-first, since route 3 does not exist at HEAD', () => {
  const dir = tmpdir('acm-qual-1')
  const spec = baseHost(dir)
  fs.mkdirSync(path.join(dir, 'specs', '20260810'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs', '20260810', '01-owner.md'), specMd(
    ['- **AC-20260810-01-1** `[env: E2B_LIVE_API_KEY]`: WHEN the live gate vars are set THE ' +
      'SYSTEM SHALL enroll against the real sandbox → dataplane/tests/test_x.py'],
    ['| dataplane/tests/test_x.py | CREATE | tests | covers AC |']))
  fs.mkdirSync(path.join(dir, 'dataplane', 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'dataplane', 'tests', 'test_x.py'),
    '"""Skips until AC-20260810-01-1\'s live gate is available."""\ndef test_gated(): pass\n')
  const manifest = writeManifest(dir, [])
  const skips = path.join(dir, 'skips.txt')
  fs.writeFileSync(skips, 'dataplane/tests/test_x.py::test_gated skips when the live key is unset\n')
  const res = run(spec, dir, manifest, ['--skips', skips, '--json'])
  const { out, row } = skipReconcileOf(res)
  assert.deepStrictEqual(row, { skipped: 1, sanctioned: 1 },
    'a runner-qualified skip line whose file (dataplane/tests/test_x.py, not part of THIS spec\'s ' +
    'File Plan) cites AC-20260810-01-1 must resolve through the file qualifier into the SAME ' +
    'owning-spec lookup that a same-spec [env:] hit already uses — the file qualifier is the most ' +
    'precise mapping evidence a runner can hand back, and today it is discarded, reproducing ' +
    'UpWell\'s sanctioned=0-under-every-other-spec bug: got ' + JSON.stringify(row))
  assert.ok(!out.findings.some(f => f.class === 'unmapped-skip' || f.class === 'unsanctioned-skip'),
    'a correctly [env:]-sanctioned skip must raise zero skip findings — a stray unmapped-skip or ' +
    'unsanctioned-skip here means the owning-spec lookup was never reached: ' + JSON.stringify(out.findings))
  assert.match(out.warnings.join('\n'), /declared in .*specs\/20260810\/01/,
    'the sanction warning must name the owning spec that actually declared [env: E2B_LIVE_API_KEY] ' +
    '(specs/20260810/01-owner.md) — an unsourced sanction is indistinguishable from a same-spec one: ' +
    JSON.stringify(out.warnings))
})

test('AC-20260821-03-2: a runner-qualified skip line whose resolved file cites no AC-ID at all SHALL CONTINUE TO report unmapped-skip, both before and after route 3 lands', () => {
  const dir = tmpdir('acm-qual-2')
  const spec = baseHost(dir)
  fs.mkdirSync(path.join(dir, 'dataplane', 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'dataplane', 'tests', 'test_noac.py'),
    '"""No AC citation anywhere in this docstring."""\ndef test_something(): pass\n')
  const manifest = writeManifest(dir, [])
  const skips = path.join(dir, 'skips.txt')
  fs.writeFileSync(skips, 'dataplane/tests/test_noac.py::test_something skips for no good reason\n')
  const res = run(spec, dir, manifest, ['--skips', skips, '--json'])
  const { out, row } = skipReconcileOf(res)
  assert.deepStrictEqual(row, { skipped: 1, sanctioned: 0 },
    'a resolvable, in-root qualified file that cites ZERO AC-IDs must yield an empty mappedIds ' +
    'from route 3 and fail closed to unmapped-skip exactly as before route 3 existed — got ' + JSON.stringify(row))
  assert.ok(out.findings.some(f => f.class === 'unmapped-skip'),
    'the hard finding must still be unmapped-skip — a file with no citations must never be silently ' +
    'sanctioned or misclassified as unsanctioned-skip: ' + JSON.stringify(out.findings))
})

test('AC-20260821-03-3: a qualifier whose path is absent under --root, or resolves outside it, SHALL CONTINUE TO report unmapped-skip and never reads the outside file', () => {
  const outer = tmpdir('acm-qual-3')
  const root = path.join(outer, 'root')
  fs.mkdirSync(root, { recursive: true })
  const spec = baseHost(root)

  // The qualifier resolves OUTSIDE --root, to a real file that (if wrongly read) would sanction:
  // it cites an AC declared [env:] in its own owning spec, one directory up from root.
  fs.mkdirSync(path.join(root, 'specs', '20260301'), { recursive: true })
  fs.writeFileSync(path.join(root, 'specs', '20260301', '07-owner.md'), specMd(
    ['- **AC-20260301-07-1** `[env: SOME_VAR]`: WHEN X THE SYSTEM SHALL Y → tests/owner.test.js'],
    ['| tests/owner.test.js | CREATE | tests | covers AC |']))
  fs.writeFileSync(path.join(outer, 'outside.py'),
    '"""Cites AC-20260301-07-1, but lives outside --root entirely."""\n')

  const manifest = writeManifest(root, [])
  const skips = path.join(root, 'skips.txt')
  fs.writeFileSync(skips, [
    'nope.py::t', // absent under --root: root/nope.py does not exist
    '../outside.py::t', // resolves outside --root: root/../outside.py === outer/outside.py
  ].join('\n') + '\n')
  const res = run(spec, root, manifest, ['--skips', skips, '--json'])
  const { out, row } = skipReconcileOf(res)
  assert.deepStrictEqual(row, { skipped: 2, sanctioned: 0 },
    'neither an absent-under-root qualifier nor one resolving outside --root may ever be sanctioned ' +
    '— if the outside file had been read, its AC-20260301-07-1 citation would resolve through the ' +
    'owning-spec lookup and sanction the skip, which must NEVER happen: got ' + JSON.stringify(row))
  assert.strictEqual(out.findings.filter(f => f.class === 'unmapped-skip').length, 2,
    'both skip lines must report unmapped-skip — a missing path and an out-of-root path are both ' +
    'fail-closed edges of the SAME rule, never a partial/guessed match: ' + JSON.stringify(out.findings))
  assert.ok(!out.warnings.some(w => w.includes('SOME_VAR') || w.includes('20260301')),
    'no warning may reference SOME_VAR or specs/20260301 — either would prove the outside file was ' +
    'actually read and its citation resolved, which the strictly-inside-root check must prevent: ' +
    JSON.stringify(out.warnings))
})

test('AC-20260821-03-4: a runner-qualified skip line whose resolved file cites only a spec-under-review AC with no [env:] reports unsanctioned-skip naming that AC — red-first, since route 3 does not exist at HEAD', () => {
  const dir = tmpdir('acm-qual-4')
  const spec = baseHost(dir) // AC-20260814-01-1 declared here, WITHOUT [env:]
  fs.mkdirSync(path.join(dir, 'dataplane', 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'dataplane', 'tests', 'test_y.py'),
    '"""Cites AC-20260814-01-1, a same-spec AC with no [env:] declared."""\ndef test_local(): pass\n')
  const manifest = writeManifest(dir, [])
  const skips = path.join(dir, 'skips.txt')
  fs.writeFileSync(skips, 'dataplane/tests/test_y.py::test_local skips locally\n')
  const res = run(spec, dir, manifest, ['--skips', skips, '--json'])
  const { out, row } = skipReconcileOf(res)
  assert.deepStrictEqual(row, { skipped: 1, sanctioned: 0 },
    'route 3 feeding the SAME-spec acById branch on an env-less bullet must never sanction — got ' + JSON.stringify(row))
  const f = out.findings.find(x => x.class === 'unsanctioned-skip' && x.ac === 'AC-20260814-01-1')
  assert.ok(f,
    'the resolved file\'s only citation, AC-20260814-01-1, has no [env:] on its bullet in the spec ' +
    'under review — route 3 must feed this AC into the SAME acById branch routes 1/2 already use, ' +
    'producing a hard unsanctioned-skip naming it, not the generic unmapped-skip a pre-route-3 build ' +
    'would report: got ' + JSON.stringify(out.findings))
})

test('AC-20260821-03-5: a skip line with no "::" at all SHALL CONTINUE TO map only via the existing content-match route — a bare foreign name stays unmapped-skip and a bare own-file name keeps today\'s disposition, byte-identical', () => {
  const dir = tmpdir('acm-qual-5')
  const spec = path.join(dir, 'spec.md')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  // Own-file content: a route-2-matchable marker phrase (no AC-ID token of its own) plus a real
  // AC-ID citation the route-2 hit will resolve to.
  fs.writeFileSync(path.join(dir, 'tests', 'foo.test.js'),
    '// marker-widget-behavior\n// covers AC-20260814-01-1\n')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260814-01-1**: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js'],
    ['| tests/foo.test.js | CREATE | tests | covers AC |']))
  const manifest = writeManifest(dir, [])
  const skips = path.join(dir, 'skips.txt')
  fs.writeFileSync(skips, [
    'this line matches nothing mappable at all', // bare foreign name: no "::", no content match
    'marker-widget-behavior', // bare own-file name: a literal substring of tests/foo.test.js
  ].join('\n') + '\n')
  const res = run(spec, dir, manifest, ['--skips', skips, '--json'])
  const { out, row } = skipReconcileOf(res)
  assert.deepStrictEqual(row, { skipped: 2, sanctioned: 0 },
    'a bare-name line never enters route 3 regardless of what it says (D2) — the foreign line must ' +
    'stay unmapped-skip and the own-file line must resolve via route 2 into today\'s unsanctioned-skip ' +
    '(AC-20260814-01-1 carries no [env:]): got ' + JSON.stringify(row))
  assert.ok(out.findings.some(f => f.class === 'unmapped-skip'),
    'the foreign bare-name line must report unmapped-skip: ' + JSON.stringify(out.findings))
  assert.ok(out.findings.some(f => f.class === 'unsanctioned-skip' && f.ac === 'AC-20260814-01-1'),
    'the own-file bare-name line must resolve via route 2 (content-match) to AC-20260814-01-1 and ' +
    'report unsanctioned-skip — this is today\'s disposition and must stay byte-identical: ' + JSON.stringify(out.findings))
})

test('AC-20260821-03-6: a qualified line that itself embeds an AC-ID SHALL CONTINUE TO map via the embedded route without reading the file — disposition follows the embedded ID even when the file cites a different, sanctionable AC', () => {
  const dir = tmpdir('acm-qual-6')
  const spec = baseHost(dir) // AC-20260814-01-1, no [env:] — the embedded ID below
  fs.mkdirSync(path.join(dir, 'specs', '20260810'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs', '20260810', '01-owner.md'), specMd(
    ['- **AC-20260810-01-1** `[env: SOME_VAR]`: WHEN X THE SYSTEM SHALL Y → tests/owner.test.js'],
    ['| tests/owner.test.js | CREATE | tests | covers AC |']))
  // x.py exists and cites a DIFFERENT, sanctionable AC — if it were read instead of the embedded
  // ID, the skip would come out sanctioned. It must not.
  fs.writeFileSync(path.join(dir, 'x.py'), '# cites AC-20260810-01-1 for real\n')
  const manifest = writeManifest(dir, [])
  const skips = path.join(dir, 'skips.txt')
  fs.writeFileSync(skips, 'x.py::test_a cites AC-20260814-01-1\n')
  const res = run(spec, dir, manifest, ['--skips', skips, '--json'])
  const { out, row } = skipReconcileOf(res)
  assert.deepStrictEqual(row, { skipped: 1, sanctioned: 0 },
    'the line embeds AC-20260814-01-1 (route 1) — the embedded route has absolute precedence and ' +
    'must win even though x.py, if read, cites AC-20260810-01-1 which WOULD sanction: got ' + JSON.stringify(row))
  assert.ok(out.findings.some(f => f.class === 'unsanctioned-skip' && f.ac === 'AC-20260814-01-1'),
    'the disposition must follow the embedded AC-20260814-01-1 (env-less, so unsanctioned-skip) — ' +
    'any finding or sanction naming AC-20260810-01-1 instead would prove x.py was read despite ' +
    'route 1 already having mapped the line: ' + JSON.stringify(out.findings))
  assert.ok(!out.warnings.some(w => w.includes('SOME_VAR') || w.includes('AC-20260810-01-1')),
    'no warning may reference SOME_VAR or AC-20260810-01-1 — either would prove x.py\'s own citation ' +
    'was consulted instead of the embedded ID: ' + JSON.stringify(out.warnings))
})

test('AC-20260821-03-7: a qualified line\'s resolved file citing several ACs takes the FIRST citation in file order as primary, with repeats deduped — red-first, since route 3 does not exist at HEAD', () => {
  const dir = tmpdir('acm-qual-7')
  const spec = baseHost(dir)
  fs.mkdirSync(path.join(dir, 'specs', '20260810'), { recursive: true })
  // Both ACs share one owning file; only the FIRST-cited one (…-14) carries [env:].
  fs.writeFileSync(path.join(dir, 'specs', '20260810', '01-owner.md'), specMd(
    ['- **AC-20260810-01-14** `[env: SOME_VAR]`: WHEN X THE SYSTEM SHALL Y → tests/owner.test.js',
      '- **AC-20260810-01-1**: WHEN X THE SYSTEM SHALL Z → tests/owner.test.js'],
    ['| tests/owner.test.js | CREATE | tests | covers ACs |']))
  fs.mkdirSync(path.join(dir, 'dataplane', 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'dataplane', 'tests', 'test_multi.py'),
    '"""cites AC-20260810-01-14 and AC-20260810-01-1 again AC-20260810-01-14."""\n')
  const manifest = writeManifest(dir, [])
  const skips = path.join(dir, 'skips.txt')
  fs.writeFileSync(skips, 'dataplane/tests/test_multi.py::test_multi cites several ACs\n')
  const res = run(spec, dir, manifest, ['--skips', skips, '--json'])
  const { out, row } = skipReconcileOf(res)
  assert.deepStrictEqual(row, { skipped: 1, sanctioned: 1 },
    'the file cites AC-20260810-01-14 first (with [env:]) — taking it as primary must sanction the ' +
    'skip; taking the second-cited AC-20260810-01-1 (no [env:]) instead would leave it unsanctioned: ' +
    'got ' + JSON.stringify(row))
  assert.strictEqual(out.warnings.length, 1,
    'exactly one sanction warning must be emitted — a duplicate occurrence of AC-20260810-01-14 in ' +
    'file order must be deduped, not treated as a second citation: ' + JSON.stringify(out.warnings))
  assert.strictEqual(out.warnings[0],
    'AC-20260810-01-14: skipped test sanctioned by [env: SOME_VAR] (declared in specs/20260810/01-owner.md)',
    'the sanction must name AC-20260810-01-14 (the FIRST citation in file order) as primary, not ' +
    'AC-20260810-01-1 (cited second) — got ' + JSON.stringify(out.warnings))
  assert.deepStrictEqual(out.findings, [],
    'a sanctioned primary must raise zero skip findings: ' + JSON.stringify(out.findings))
})
