'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260815/03-ac-matrix-fail-closed.md D2: ac-matrix.js's skipped-test reconciliation
// resolves an AC's [env:] sanction from the spec under review first; on an acById MISS it
// derives the AC's owning spec from the AC-ID grammar (AC-{YYYYMMDD}-{NN[a-z]?}-{k} ->
// specs/{YYYYMMDD}/{NN[a-z]?}-*.md) and reads its declaration there instead. Every edge of
// that derivation fails closed: missing date dir, ambiguous filename match, unreadable owning
// spec, no AC section, no matching bullet, or a bullet without [env:] — each still yields
// today's unsanctioned-skip hard finding, never a guess and never a silent sanction. This
// suite pins those fail-closed edges plus the hit-wins precedence rule (a current-spec
// re-declaration without [env:] overrides a farther owning-spec declaration) by executing
// ac-matrix.js against synthetic host trees. None of this derivation exists at HEAD — every
// case here is red-first.
//
// specs/20260820/06-typed-evidence-manifest.md D2: ac-matrix.js's `--json`
// observed.skipReconcile field is the typed object {"skipped":N,"sanctioned":S}.

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

// A minimal spec-under-review host: one well-formed, covered AC unrelated to the case under
// test, so the run has valid AC/File Plan sections without affecting skip reconciliation.
function baseHost(dir) {
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), '// covers AC-20260814-01-1\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260814-01-1**: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js'],
    ['| tests/foo.test.js | CREATE | tests | covers AC |']))
  return spec
}

test('AC-20260815-03-3: a skip mapped to an AC-ID whose owning spec date directory is absent fails closed as unsanctioned-skip naming the owning-spec lookup', () => {
  const dir = tmpdir('acm-owner-missing-dir')
  const spec = baseHost(dir)
  const manifest = writeManifest(dir, [])
  const skips = path.join(dir, 'skips.txt')
  fs.writeFileSync(skips, 'skipped test for AC-20260101-99-1 with no specs/20260101 directory on disk\n')
  const res = run(spec, dir, manifest, ['--skips', skips, '--json'])
  const out = findings(res)
  const f = out.findings.find(x => x.class === 'unsanctioned-skip' && x.ac === 'AC-20260101-99-1')
  assert.ok(f,
    'AC-20260101-99-1 has no bullet in the spec under review, so resolution must derive its owning ' +
    'spec (specs/20260101/) from the AC-ID; that directory does not exist on disk, so the skip must ' +
    'fail closed as unsanctioned-skip rather than crash, hang, or silently sanction — got findings ' +
    JSON.stringify(out.findings))
  assert.match(f.detail, /owning spec/i,
    'the fail-closed detail must name the owning-spec lookup as the reason (a missing date directory), ' +
    'not the generic "no [env:] declaration on its AC line" message the same-spec-hit branch uses — ' +
    'otherwise a reviewer cannot tell a missing owning file from an AC that simply never declared a ' +
    `gate; got detail "${f.detail}"`)
})

test('AC-20260815-03-4: a skip mapped to an AC-ID whose owner filename pattern matches two files fails closed as unsanctioned-skip naming the ambiguity', () => {
  const dir = tmpdir('acm-owner-ambiguous')
  const spec = baseHost(dir)
  fs.mkdirSync(path.join(dir, 'specs', '20260201'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs', '20260201', '99-first.md'), specMd(
    ['- **AC-20260201-99-1** `[env: SOME_VAR]`: WHEN X THE SYSTEM SHALL Y → tests/owner.test.js'],
    ['| tests/owner.test.js | CREATE | tests | covers AC |']))
  fs.writeFileSync(path.join(dir, 'specs', '20260201', '99-second.md'), specMd(
    ['- **AC-20260201-99-1** `[env: SOME_VAR]`: WHEN X THE SYSTEM SHALL Y → tests/owner.test.js'],
    ['| tests/owner.test.js | CREATE | tests | covers AC |']))
  const manifest = writeManifest(dir, [])
  const skips = path.join(dir, 'skips.txt')
  fs.writeFileSync(skips, 'skipped test for AC-20260201-99-1 round trip\n')
  const res = run(spec, dir, manifest, ['--skips', skips, '--json'])
  const out = findings(res)
  const f = out.findings.find(x => x.class === 'unsanctioned-skip' && x.ac === 'AC-20260201-99-1')
  assert.ok(f,
    'two files (99-first.md, 99-second.md) both match the owner pattern ^99-.*\\.md$ under ' +
    'specs/20260201/ — the exact-match contract (D5: never fuzzy, never multi-match tolerant) ' +
    'requires this to fail closed as unsanctioned-skip rather than guess which file owns the AC')
  assert.match(f.detail, /ambigu|99-first\.md|99-second\.md|two.*match/i,
    'the fail-closed detail must name the ambiguity (naming the pattern or the two matching owner ' +
    'files) so a human can resolve it, not the generic no-[env:] message the same-spec-hit branch ' +
    `uses (which would never mention any filename); got "${f.detail}"`)
})

test('AC-20260815-03-5: a skip mapped to an AC whose (unambiguous, readable) owning spec bullet carries no [env:] fails closed as unsanctioned-skip naming the owning spec it consulted', () => {
  const dir = tmpdir('acm-owner-noenv')
  const spec = baseHost(dir)
  fs.mkdirSync(path.join(dir, 'specs', '20260301'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs', '20260301', '07-owner.md'), specMd(
    ['- **AC-20260301-07-1**: WHEN X THE SYSTEM SHALL Y → tests/owner.test.js'],
    ['| tests/owner.test.js | CREATE | tests | covers AC |']))
  const manifest = writeManifest(dir, [])
  const skips = path.join(dir, 'skips.txt')
  fs.writeFileSync(skips, 'skipped test for AC-20260301-07-1 owner has no env tag\n')
  const res = run(spec, dir, manifest, ['--skips', skips, '--json'])
  const out = findings(res)
  const f = out.findings.find(x => x.class === 'unsanctioned-skip' && x.ac === 'AC-20260301-07-1')
  assert.ok(f,
    'the owning spec specs/20260301/07-owner.md is found unambiguously and its AC-20260301-07-1 ' +
    'bullet is read, but that bullet carries no [env:] tag — the skip must fail closed as ' +
    'unsanctioned-skip exactly like any other undeclared gate')
  assert.deepStrictEqual(out.observed.skipReconcile, { skipped: 1, sanctioned: 0 },
    `an owning-spec bullet with no [env:] must not be counted toward the typed object's "sanctioned" field — got ${JSON.stringify(out.observed.skipReconcile)}`)
  assert.match(f.detail, /07-owner\.md|owning spec/i,
    'the detail must show the lookup actually consulted the owning spec (naming the file or the ' +
    'owning-spec mechanism), distinguishing this fail-closed edge from the plain same-spec-hit ' +
    `unsanctioned message that never reads any other file; got "${f.detail}"`)
})

test('AC-20260815-03-6: a current-spec re-declaration without [env:] wins over a farther owning-spec declaration WITH [env:] — the skip stays unsanctioned and the owning-spec fallback never fires for that AC', () => {
  const dir = tmpdir('acm-hit-wins')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), '// covers AC-20260814-01-1\n')

  // The owning spec for AC-20260401-05-1 DOES declare [env:] — if consulted, it would sanction.
  fs.mkdirSync(path.join(dir, 'specs', '20260401'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs', '20260401', '05-owner.md'), specMd(
    ['- **AC-20260401-05-1** `[env: OWNER_VAR]`: WHEN X THE SYSTEM SHALL Y → tests/owner.test.js'],
    ['| tests/owner.test.js | CREATE | tests | covers AC |']))

  // A second AC has NO bullet anywhere in the spec under review — only its owning spec declares
  // it — proving the fallback mechanism itself is live in this same run.
  fs.mkdirSync(path.join(dir, 'specs', '20260501'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs', '20260501', '09-other.md'), specMd(
    ['- **AC-20260501-09-1** `[env: OTHER_VAR]`: WHEN X THE SYSTEM SHALL Y → tests/other.test.js'],
    ['| tests/other.test.js | CREATE | tests | covers AC |']))

  // The spec under review RE-DECLARES AC-20260401-05-1 without [env:] — a dropped gate.
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260814-01-1**: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js',
      '- **AC-20260401-05-1**: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js'],
    ['| tests/foo.test.js | CREATE | tests | covers ACs |']))

  const manifest = writeManifest(dir, [])
  const skips = path.join(dir, 'skips.txt')
  fs.writeFileSync(skips, [
    'skipped test for AC-20260401-05-1 re-declared locally without env',
    'skipped test for AC-20260501-09-1 declared only in its owning spec',
  ].join('\n') + '\n')
  const res = run(spec, dir, manifest, ['--skips', skips, '--json'])
  const out = findings(res)

  assert.ok(out.findings.some(f => f.class === 'unsanctioned-skip' && f.ac === 'AC-20260401-05-1'),
    'AC-20260401-05-1 is re-declared in the spec under review WITHOUT [env:] — that acById HIT must ' +
    'be final and terminate resolution, even though a farther owning spec (specs/20260401/05-owner.md) ' +
    'declares [env: OWNER_VAR]; trusting the re-declaration is the conservative read (an earlier draft ' +
    'that fell through to the owning spec on a no-env hit was refuter-caught and rejected)')
  assert.ok(!out.findings.some(f => f.ac === 'AC-20260501-09-1'),
    'AC-20260501-09-1 has NO bullet at all in the spec under review (an acById MISS) — its owning ' +
    'spec declares [env: OTHER_VAR], so the fallback must sanction it, proving the owning-spec ' +
    'mechanism is actually exercised in this run and this is not merely a permanently-absent feature')
  assert.deepStrictEqual(out.observed.skipReconcile, { skipped: 2, sanctioned: 1 },
    'exactly one of the two skips must be sanctioned (the acById-miss one, via its owning spec) and ' +
    'the other must stay unsanctioned (the acById-hit one, whose local no-env bullet wins) — got ' +
    JSON.stringify(out.observed.skipReconcile))
})

// specs/20260815/03-ac-matrix-fail-closed.md: resolveOwningBullet's cache in
// spec/scripts/ac-matrix.js keys owningSpecCache by date+ordinal (the owning FILE), so the
// cache entry must resolve per-AC ({ path, bullet }), never one shared reading of the file's
// contents. Every fixture above gives each AC-ID its own distinct owning spec, so a per-file
// cache collision is invisible there. When two skipped tests resolve to two different ACs
// living in the SAME owning spec, whichever resolves first must never poison the cache for the
// second: a shared cache would sanction both when the first is gated (masking the ungated
// second) or unsanction both when the first is ungated (falsely claiming the owning spec has no
// [env:] declaration on the gated second). The two cases below build one owning spec with both
// an [env:]-bearing and an env-less AC and run the same two skips in both orders —
// order-independence is what a correct per-AC cache must give.

function twoAcOwnerHost(dir) {
  const spec = baseHost(dir)
  fs.mkdirSync(path.join(dir, 'specs', '20260601'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs', '20260601', '04-shared-owner.md'), specMd(
    ['- **AC-20260601-04-1** `[env: SOME_VAR]`: WHEN X THE SYSTEM SHALL Y → tests/gated.test.js',
      '- **AC-20260601-04-2**: WHEN X THE SYSTEM SHALL Z → tests/ungated.test.js'],
    ['| tests/gated.test.js | CREATE | tests | covers gated AC |',
      '| tests/ungated.test.js | CREATE | tests | covers ungated AC |']))
  return spec
}

function assertSharedOwnerOutcome(out, orderLabel) {
  assert.deepStrictEqual(out.observed.skipReconcile, { skipped: 2, sanctioned: 1 },
    `two ACs sharing one owning spec (specs/20260601/04-shared-owner.md), one [env:]-gated and ` +
    `one not, must sanction exactly the gated one regardless of skip order (${orderLabel}) — a ` +
    `per-file cache that stores only the first-resolved AC's bullet instead of a per-AC-ID ` +
    `resolution answers for BOTH ACs with whichever one hit first; got ${JSON.stringify(out.observed.skipReconcile)}`)
  assert.ok(!out.findings.some(f => f.ac === 'AC-20260601-04-1'),
    `AC-20260601-04-1 carries [env: SOME_VAR] in its owning spec and must never produce a finding ` +
    `(${orderLabel}) — a cache-poisoned lookup that answered with the OTHER AC's env-less bullet ` +
    `would wrongly hard-fail it; findings: ${JSON.stringify(out.findings)}`)
  const ungatedFinding = out.findings.find(f => f.class === 'unsanctioned-skip' && f.ac === 'AC-20260601-04-2')
  assert.ok(ungatedFinding,
    `AC-20260601-04-2 has no [env:] anywhere and must stay a hard unsanctioned-skip (${orderLabel}) — ` +
    `a cache-poisoned lookup that answered with the OTHER AC's [env: SOME_VAR] bullet would wrongly ` +
    `silently sanction it instead; findings: ${JSON.stringify(out.findings)}`)
  assert.doesNotMatch(ungatedFinding.detail, /SOME_VAR/,
    `AC-20260601-04-2's unsanctioned-skip detail must not mention SOME_VAR (${orderLabel}) — that ` +
    `would prove the finding was built from AC-20260601-04-1's cached bullet instead of its own; ` +
    `got "${ungatedFinding.detail}"`)
  const gatedWarning = out.warnings.find(w => w.startsWith('AC-20260601-04-1:'))
  assert.ok(gatedWarning,
    `AC-20260601-04-1's sanction must be reported by name in warnings (${orderLabel}), never folded ` +
    `into a generic sanctioned count with no per-AC evidence; warnings: ${JSON.stringify(out.warnings)}`)
  assert.match(gatedWarning, /\(declared in specs\/20260601\/04-shared-owner\.md\)/,
    `D3's literal warning form must name the owning spec that actually declared [env: SOME_VAR] ` +
    `(${orderLabel}), so a reviewer can audit which file authorized the sanction rather than trust ` +
    `an unsourced claim; got "${gatedWarning}"`)
}

test('AC-20260815-03-2/AC-20260815-03-5: two skips resolving to different ACs in the SAME owning spec sanction only the [env:]-gated one when the gated skip is listed FIRST, proving the owning-spec cache resolves per AC-ID and not per owning file', () => {
  const dir = tmpdir('acm-owner-shared-gated-first')
  const spec = twoAcOwnerHost(dir)
  const manifest = writeManifest(dir, [])
  const skips = path.join(dir, 'skips.txt')
  fs.writeFileSync(skips, [
    'skipped test for AC-20260601-04-1 gated AC resolved first',
    'skipped test for AC-20260601-04-2 ungated AC resolved second',
  ].join('\n') + '\n')
  const res = run(spec, dir, manifest, ['--skips', skips, '--json'])
  const out = findings(res)
  assertSharedOwnerOutcome(out, 'gated skip listed first')
})

test('AC-20260815-03-2/AC-20260815-03-5: two skips resolving to different ACs in the SAME owning spec sanction only the [env:]-gated one when the ungated skip is listed FIRST, proving the owning-spec cache resolves per AC-ID and not per owning file', () => {
  const dir = tmpdir('acm-owner-shared-ungated-first')
  const spec = twoAcOwnerHost(dir)
  const manifest = writeManifest(dir, [])
  const skips = path.join(dir, 'skips.txt')
  fs.writeFileSync(skips, [
    'skipped test for AC-20260601-04-2 ungated AC resolved first',
    'skipped test for AC-20260601-04-1 gated AC resolved second',
  ].join('\n') + '\n')
  const res = run(spec, dir, manifest, ['--skips', skips, '--json'])
  const out = findings(res)
  assertSharedOwnerOutcome(out, 'ungated skip listed first')
})
