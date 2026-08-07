'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, tmpdir, runNode } = require('../helpers')

// specs/20260807/04-claims-registry.md: the claims registry ends the prose-patch-before-
// mechanism pattern (5 patches/3 days on the dashboard seam) by making every blocking claim
// in spec/commands|doctrine|agents carry an inline `enforcedBy:`/`unenforced:` pointer,
// checked by this script's dual ratchet (orphan claims + exact-match line-count baseline).
// These tests pin AC-20260807-04-1 through -6 and -8 against claims-lint.js, which does not
// exist yet — every case here is expected red until the script lands.

const SCRIPT = 'scripts/claims-lint.js'
const BASELINE_REL = path.join('spec', 'doctrine', 'claims-baseline.json')

// Build a synthetic corpus root: writes each given file under `dir`, plus the baseline JSON
// claims-lint.js reads from `spec/doctrine/claims-baseline.json`.
function host(files, baseline) {
  const dir = tmpdir('claims-lint')
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, content)
  }
  fs.mkdirSync(path.join(dir, 'spec', 'doctrine'), { recursive: true })
  fs.writeFileSync(path.join(dir, BASELINE_REL), JSON.stringify(baseline))
  return dir
}

test('AC-20260807-04-1: --check fails and --json reports a stale-pointer finding for an enforcedBy path that does not exist', () => {
  const dir = host({
    'spec/commands/foo.md': '# Foo\n\nX is a **hard** requirement.\n<!-- enforcedBy: spec/scripts/no-such-file.js -->\n',
  }, { files: { 'spec/commands/foo.md': { lines: 4, orphans: 0 } }, totalLines: 4 })

  const check = runNode(SCRIPT, ['--root', dir, '--check'])
  assert.strictEqual(check.status, 1,
    'a marker pointing at a repo path that does not exist must fail --check, not ship a dead pointer: ' + check.stderr)

  const jsonRun = runNode(SCRIPT, ['--root', dir, '--json'])
  const out = JSON.parse(jsonRun.stdout)
  const finding = out.findings.find(f => f.kind === 'stale-pointer')
  assert.ok(finding, 'no stale-pointer finding emitted — an unresolvable enforcedBy path is otherwise invisible to review')
  assert.strictEqual(finding.file, 'spec/commands/foo.md', 'stale-pointer finding must name the file carrying the dead marker')
  assert.strictEqual(finding.line, 4, 'stale-pointer finding must name the line so the marker can be fixed without a manual search')
  assert.match(finding.detail, /no-such-file\.js/, 'stale-pointer finding must name the missing path, not just flag the line')
})

test('AC-20260807-04-2: --check fails and --json reports an orphan-claim finding for a new unmarked hard-bar line above the baselined count', () => {
  const dir = host({
    'spec/commands/bar.md': '# Bar\n\nX is a **hard** finding.\n',
  }, { files: { 'spec/commands/bar.md': { lines: 3, orphans: 0 } }, totalLines: 3 })

  const check = runNode(SCRIPT, ['--root', dir, '--check'])
  assert.strictEqual(check.status, 1,
    'a new bar-matching claim with no marker, above the file\'s baselined orphan count, must fail --check: ' + check.stderr)

  const jsonRun = runNode(SCRIPT, ['--root', dir, '--json'])
  const out = JSON.parse(jsonRun.stdout)
  const finding = out.findings.find(f => f.kind === 'orphan-claim')
  assert.ok(finding, 'no orphan-claim finding emitted — an unmarked blocking claim would ship unaudited')
  assert.strictEqual(finding.file, 'spec/commands/bar.md', 'orphan-claim finding must name the offending file')
  assert.strictEqual(finding.line, 3, 'orphan-claim finding must cite the exact line so review does not have to re-scan the file')
})

test('AC-20260807-04-3: --check rejects an unenforced reason under 20 characters and accepts one at or above the bar', () => {
  const shortDir = host({
    'spec/commands/baz.md': '# Baz\n\nX is a **hard** finding.\n<!-- unenforced: too vague -->\n',
  }, { files: { 'spec/commands/baz.md': { lines: 4, orphans: 0 } }, totalLines: 4 })
  const shortCheck = runNode(SCRIPT, ['--root', shortDir, '--check'])
  assert.strictEqual(shortCheck.status, 1,
    'a sub-20-character unenforced reason must fail --check — it is a sanction in name only: ' + shortCheck.stderr)
  const shortJson = JSON.parse(runNode(SCRIPT, ['--root', shortDir, '--json']).stdout)
  assert.ok(shortJson.findings.some(f => f.kind === 'sanction-reason'),
    'no sanction-reason finding for a 9-character unenforced reason ("too vague")')

  const longDir = host({
    'spec/commands/baz.md': '# Baz\n\nX is a **hard** finding.\n<!-- unenforced: model-judgment step, no deterministic carrier exists -->\n',
  }, { files: { 'spec/commands/baz.md': { lines: 4, orphans: 0 } }, totalLines: 4 })
  const longCheck = runNode(SCRIPT, ['--root', longDir, '--check'])
  assert.strictEqual(longCheck.status, 0,
    'an unenforced reason at or above 20 characters is a legitimate sanction and must pass --check: ' + longCheck.stderr)
})

test('AC-20260807-04-4: --check fails on a baseline/actual mismatch in either direction and names the update-baseline remedy', () => {
  const grownDir = host({
    'spec/commands/qux.md': '# Qux\n\nplain prose, no claims here.\nan extra line pushes the count above baseline.\n',
  }, { files: { 'spec/commands/qux.md': { lines: 2, orphans: 0 } }, totalLines: 2 })
  const growCheck = runNode(SCRIPT, ['--root', grownDir, '--check'])
  assert.strictEqual(growCheck.status, 1,
    'growth beyond the baselined line count must fail --check — unbudgeted doctrine growth must not ship silently: ' + growCheck.stderr)
  const growOut = growCheck.stdout + growCheck.stderr
  assert.match(growOut, /qux\.md/, 'baseline-mismatch failure must name the offending file')
  assert.match(growOut, /node "\$\(spec-paths claims-lint\)" --update-baseline/,
    'baseline-mismatch failure must name the literal remedy command verbatim, per AC-4')

  const shrunkDir = host({
    'spec/commands/qux.md': '# Qux\n',
  }, { files: { 'spec/commands/qux.md': { lines: 10, orphans: 0 } }, totalLines: 10 })
  const shrinkCheck = runNode(SCRIPT, ['--root', shrunkDir, '--check'])
  assert.strictEqual(shrinkCheck.status, 1,
    'a stale (too-high) baseline must also fail --check — deletions must force a ratchet-down commit, not open silent regrow slack: ' + shrinkCheck.stderr)
  const shrinkOut = shrinkCheck.stdout + shrinkCheck.stderr
  assert.match(shrinkOut, /qux\.md/, 'stale-baseline failure must name the offending file')
  assert.match(shrinkOut, /node "\$\(spec-paths claims-lint\)" --update-baseline/,
    'stale-baseline failure must name the literal remedy command verbatim, per AC-4')
})

test('AC-20260807-04-5: --json emits exactly one parseable object with files/totalLines/baseline/findings and nothing else on stdout', () => {
  const dir = host({
    'spec/commands/plain.md': '# Plain\n\nno claims, no markers.\n',
  }, { files: { 'spec/commands/plain.md': { lines: 3, orphans: 0 } }, totalLines: 3 })
  const r = runNode(SCRIPT, ['--root', dir, '--json'])
  assert.strictEqual(r.status, 0, '--json is a reporting mode and must not fail the process by itself: ' + r.stderr)
  let out
  assert.doesNotThrow(() => { out = JSON.parse(r.stdout) },
    '--json stdout must be exactly one parseable JSON object with no surrounding text — doctor and other consumers parse it directly')
  assert.deepStrictEqual(Object.keys(out).sort(), ['baseline', 'files', 'findings', 'totalLines'],
    '--json output must carry exactly the documented keys, no more and no fewer')
})

test('AC-20260807-04-6: --check counts zero claims inside an indented fence and treats a marker line as never a claim itself', () => {
  const dir = host({
    'spec/commands/fenced.md':
      '# Fenced\n\n1. Example output:\n   ```\n   this is a **hard** finding inside a fence\n   ```\n' +
      '2. Next step.\n<!-- enforcedBy: spec/commands/fenced.md -->\n',
  }, { files: { 'spec/commands/fenced.md': { lines: 8, orphans: 0 } }, totalLines: 8 })
  const check = runNode(SCRIPT, ['--root', dir, '--check'])
  assert.strictEqual(check.status, 0,
    'a **hard** line inside an INDENTED fence (the review.md:291/init.md:182 shape) must not be scanned as a live claim, ' +
    'and the marker line itself must never count as a claim: ' + check.stderr)
})

test('AC-20260807-04-8: --json against the live corpus reports totalLines under 5186 and zero orphans in the converted review.md', () => {
  const r = runNode(SCRIPT, ['--root', ROOT, '--json'])
  assert.strictEqual(r.status, 0, '--json must succeed against the real repo corpus: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.ok(out.totalLines < 5186,
    'corpus totalLines must be strictly below the pre-spec 5186 total (2026-08-07 wc -l), got ' + out.totalLines)
  assert.strictEqual(out.files['spec/commands/review.md'].orphans, 0,
    'review.md is the seed conversion (D6) — every bar-matching claim there must carry a marker, leaving zero orphans')
})
