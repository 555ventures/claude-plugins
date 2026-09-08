'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// Pins: specs/20260907/01-mixed-pin-guard-and-drift-line.md D1/D3,
// AC-20260907-01-4, AC-20260907-01-5, AC-20260907-01-6, AC-20260907-01-7, AC-20260907-01-11.
// ac-matrix.js's argv loop today rejects any unrecognized flag (usage + exit 2) — `--lint` does
// not exist yet, so every lint-mode assertion below is TDD red against a synthetic spec file in
// tmpdir(), executed via runNode (mirrors tests/ac-matrix/ac-matrix.test.js's idiom).

function specMd(acLines, filePlanRows) {
  return '# Test Spec\n\n## Acceptance Criteria\n\n' + acLines.join('\n') + '\n\n' +
    (filePlanRows
      ? '## File Plan\n\n| Path | Action | Layer | Summary |\n|------|--------|-------|---------|\n' +
        filePlanRows.join('\n') + '\n'
      : '')
}

function specMdNoAcSection() {
  return '# Test Spec\n\nThis spec has no Acceptance Criteria section at all.\n'
}

function writeSpec(prefix, content) {
  const dir = tmpdir(prefix)
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, content)
  return { dir, spec }
}

function runLint(specPath, extraArgs = []) {
  return runNode('scripts/ac-matrix.js', ['--spec', specPath, '--lint', ...extraArgs])
}

function runFull(specPath, root, manifestPath, extraArgs = []) {
  return runNode('scripts/ac-matrix.js',
    ['--spec', specPath, '--root', root, '--manifest', manifestPath, ...extraArgs])
}

function writeManifest(dir, lines = []) {
  const p = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n') + (lines.length ? '\n' : ''))
  return p
}

function parseJson(res) {
  let parsed
  try { parsed = JSON.parse(res.stdout) } catch (e) {
    assert.fail(`--json output did not parse as JSON (status ${res.status}, stderr: ${res.stderr}): ${e.message}`)
  }
  return parsed
}

test('AC-20260907-01-4: --lint on a mixed spec with no ## File Plan section at all exits 1, prints one HARD mixed-pin line naming the AC and the split remedy, creates no manifest file anywhere under the spec\'s directory, and --json prints observed.lint {malformed:0,invalidPreGreen:0,mixed:1}', () => {
  const { dir, spec } = writeSpec('lint4', specMd(
    ['- **AC-20260907-99-1**: WHEN x runs THE SYSTEM SHALL print the new banner; WHEN y runs THE ' +
      'SYSTEM SHALL CONTINUE TO exit 0'],
    null))
  const before = fs.readdirSync(dir)
  const res = runLint(spec)
  assert.strictEqual(res.status, 1,
    `a mixed bullet must be a hard lint finding, exit 1 — today --lint is not even a recognized ` +
    `flag, so this is genuinely red at HEAD (stdout: ${res.stdout} stderr: ${res.stderr})`)
  assert.match(res.stdout, /HARD\s+mixed-pin/,
    `the plain-mode finding must print on a line starting "HARD  mixed-pin" — got ${JSON.stringify(res.stdout)}`)
  assert.match(res.stdout, /AC-20260907-99-1/,
    `the finding line must name the mixed AC-ID — got ${JSON.stringify(res.stdout)}`)
  assert.match(res.stdout, /split the SHALL CONTINUE TO clause into its own AC/,
    `the finding line must carry the split remedy — got ${JSON.stringify(res.stdout)}`)

  const after = fs.readdirSync(dir)
  assert.deepStrictEqual(after, before,
    `--lint takes no --manifest and must never append or create a manifest file anywhere under the ` +
    `spec's own directory — D3: "no --root, no File Plan read, no manifest append" — got new entries ` +
    `${JSON.stringify(after.filter(f => !before.includes(f)))}`)

  const jsonRes = runLint(spec, ['--json'])
  const out = parseJson(jsonRes)
  assert.deepStrictEqual(out.observed.lint, { malformed: 0, invalidPreGreen: 0, mixed: 1 },
    `--json's observed.lint must be exactly {malformed:0,invalidPreGreen:0,mixed:1} for this one ` +
    `mixed, well-formed bullet — got ${JSON.stringify(out.observed && out.observed.lint)}`)
})

test('AC-20260907-01-5: --lint on a spec whose bullets are one promise, one pin, and one two-clause pin exits 0 and prints exactly "ac-matrix: lint malformed=0 invalidPreGreen=0 mixed=0 · 0 finding(s)" as its last stdout line', () => {
  const { spec } = writeSpec('lint5', specMd(
    ['- **AC-20260907-99-1**: WHEN x THE SYSTEM SHALL y',
      '- **AC-20260907-99-2**: WHEN x THE SYSTEM SHALL CONTINUE TO y',
      '- **AC-20260907-99-3**: WHEN x THE SYSTEM SHALL CONTINUE TO y and SHALL CONTINUE TO z'],
    null))
  const res = runLint(spec)
  assert.strictEqual(res.status, 0,
    `a promise, a pin, and a two-clause pin are all unambiguous shapes — none is mixed, so this must ` +
    `exit 0 (stdout: ${res.stdout} stderr: ${res.stderr})`)
  const lines = res.stdout.split('\n').filter(Boolean)
  assert.strictEqual(lines[lines.length - 1],
    'ac-matrix: lint malformed=0 invalidPreGreen=0 mixed=0 · 0 finding(s)',
    `the lint summary must be the exact last stdout line D3 pins — got ${JSON.stringify(lines[lines.length - 1])}`)
})

test('AC-20260907-01-6: --lint combined with --root, --manifest, --skips, or --has-drift-script is usage error exit 2 naming --lint as spec-only, and --lint on a spec with no ## Acceptance Criteria section is exit 2 naming the missing section', () => {
  const { dir, spec } = writeSpec('lint6', specMd(['- **AC-20260907-99-1**: WHEN x THE SYSTEM SHALL y'], null))
  const combos = [
    ['--root', dir],
    ['--manifest', path.join(dir, 'm.jsonl')],
    ['--skips', path.join(dir, 's.txt')],
    ['--has-drift-script'],
  ]
  for (const extra of combos) {
    const res = runLint(spec, extra)
    assert.strictEqual(res.status, 2,
      `--lint combined with ${JSON.stringify(extra)} must be a usage error, exit 2 — D3: "combining ` +
      `--lint with --root, --manifest, --skips or --has-drift-script is usage" (stdout: ${res.stdout} stderr: ${res.stderr})`)
    assert.match(res.stderr, /--lint/,
      `the usage refusal must name --lint — got ${JSON.stringify(res.stderr)}`)
    assert.match(res.stderr, /spec-only/i,
      `the usage refusal must say --lint is spec-only, so a reader knows which flags to drop — got ${JSON.stringify(res.stderr)}`)
  }

  const { spec: noAcSpec } = writeSpec('lint6-noac', specMdNoAcSection())
  const noAcRes = runLint(noAcSpec)
  assert.strictEqual(noAcRes.status, 2,
    `--lint on a spec with no ## Acceptance Criteria section must be a usage-tier error, exit 2 — got ${noAcRes.status}, stderr: ${noAcRes.stderr}`)
  assert.match(noAcRes.stderr, /Acceptance Criteria/,
    `the refusal must name the missing section — got ${JSON.stringify(noAcRes.stderr)}`)
})

test('AC-20260907-01-7: the full mode (--spec --root --manifest) on a spec with one mixed AC whose cited test file exists prints WARN mixed-pin naming the AC on one stdout line, and --json\'s warnings array carries that string while findings carries no mixed-pin entry', () => {
  const dir = tmpdir('lint7')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/x.test.js'),
    "'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "test('AC-20260907-99-1: vacuously true', () => { assert.ok(true) })\n")
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260907-99-1**: WHEN x runs THE SYSTEM SHALL print the new banner; WHEN y runs THE ' +
      'SYSTEM SHALL CONTINUE TO exit 0 → tests/x.test.js'],
    ['| tests/x.test.js | CREATE | tests | mixed bullet, cited test file exists |']))
  const manifest = writeManifest(dir)
  const res = runFull(spec, dir, manifest)
  assert.match(res.stdout, /WARN\s+.*mixed-pin.*AC-20260907-99-1/,
    `the full mode must print a WARN line naming both "mixed-pin" and the AC-ID on the same line — got ${JSON.stringify(res.stdout)}`)

  const jsonRes = runFull(spec, dir, manifest, ['--json'])
  const out = parseJson(jsonRes)
  assert.ok(out.warnings.some(w => w.includes('mixed-pin') && w.includes('AC-20260907-99-1')),
    `--json's warnings array must carry a string naming both mixed-pin and the AC-ID — got ${JSON.stringify(out.warnings)}`)
  assert.ok(!out.findings.some(f => f.class === 'mixed-pin'),
    `the full mode's findings array must never carry a mixed-pin entry — D3: "never a finding" in full ` +
    `mode, warning only — got ${JSON.stringify(out.findings)}`)
})

test('AC-20260907-01-11 (SHALL CONTINUE TO): the full mode on a promise-only spec whose cited test exists appends exactly the two typed manifest rows (ac-matrix, skip-reconcile) with keys uncovered/oracle/preGreen and skipped/sanctioned, and prints the uncovered=… oracle=… preGreen=… · skipped=… sanctioned=… summary segments byte-unchanged', () => {
  const dir = tmpdir('lint11')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/x.test.js'), '// covers AC-20260907-99-1\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260907-99-1**: WHEN x THE SYSTEM SHALL y → tests/x.test.js'],
    ['| tests/x.test.js | CREATE | tests | promise-only, covered |']))
  const manifest = writeManifest(dir)
  const before = fs.readFileSync(manifest, 'utf8').trim().split('\n').filter(Boolean)
  const res = runFull(spec, dir, manifest)
  assert.strictEqual(res.status, 0,
    `a covered promise-only AC must clear the full mode with exit 0 — this pin must not have moved ` +
    `at all by this spec's build (stdout: ${res.stdout} stderr: ${res.stderr})`)
  const lines = fs.readFileSync(manifest, 'utf8').trim().split('\n').filter(Boolean)
  const appended = lines.slice(before.length).map(l => JSON.parse(l))
  assert.strictEqual(appended.length, 2,
    `exactly two manifest rows must be appended per run — got ${JSON.stringify(appended)}`)
  const acmRow = appended.find(r => r.leg === 'ac-matrix')
  const skipRow = appended.find(r => r.leg === 'skip-reconcile')
  assert.ok(acmRow, `an "ac-matrix" leg row must be appended — got ${JSON.stringify(appended)}`)
  assert.ok(skipRow, `a "skip-reconcile" leg row must be appended — got ${JSON.stringify(appended)}`)
  assert.deepStrictEqual(Object.keys(acmRow.observed).sort(), ['oracle', 'preGreen', 'uncovered'],
    `the ac-matrix row's observed keys must be exactly uncovered/oracle/preGreen — got ${JSON.stringify(Object.keys(acmRow.observed))}`)
  assert.deepStrictEqual(Object.keys(skipRow.observed).sort(), ['sanctioned', 'skipped'],
    `the skip-reconcile row's observed keys must be exactly skipped/sanctioned — got ${JSON.stringify(Object.keys(skipRow.observed))}`)
  assert.match(res.stdout, /uncovered=0 oracle=0 preGreen=0 · skipped=0 sanctioned=0/,
    `the plain-mode summary segments must stay byte-unchanged for this all-clean fixture (D8/D11) — got ${JSON.stringify(res.stdout)}`)
})
