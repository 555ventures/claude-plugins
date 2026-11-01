'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC, tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20261101/01-the-host-names-its-own-test-cases.md: AC-20261101-01-1..-10, -15, -16 pin the
// host-declared testCaseScanner dispatch (lib/scan-test-calls.js scanCases) by execution.

const PY_SRC = [
  'import pytest', '', 'def test_beta():', '    assert True', '# AC-20260911-55-1',
  'def test_alpha():', '    assert True', '', 'class TestThing:', '    def test_gamma(self):',
  '        pass', '',
].join('\n')

const LISTING = [
  'tests/test_x.py :: test_alpha',
  'tests/test_x.py :: test_beta',
  '{"file":"tests/test_x.py","title":"test_gamma","start":9,"end":11}',
  '',
].join('\n')

const SCANNER_JS = "process.stdout.write(require('fs').readFileSync('listing.txt', 'utf8'))\n"

function makeHost(prefix, { listing = LISTING, scanner = 'node scanner.js', extra = {} } = {}) {
  const dir = tmpdir(prefix)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  const cfg = { gateCommand: 'true', ...extra }
  if (scanner !== null) cfg.testCaseScanner = scanner
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify(cfg))
  fs.writeFileSync(path.join(dir, 'tests/a.test.js'),
    "'use strict'\nconst { test } = require('node:test')\ntest('js case', () => {})\n")
  fs.writeFileSync(path.join(dir, 'tests/test_x.py'), PY_SRC)
  fs.writeFileSync(path.join(dir, 'scanner.js'), SCANNER_JS)
  fs.writeFileSync(path.join(dir, 'listing.txt'), listing)
  return dir
}

function count(dir) { return runNode('scripts/count-tests.js', ['--root', dir, '--json']) }

test('AC-20261101-01-1: count-tests --json over a host whose testCaseScanner prints three cases counts four, three host cases plus the walker case in the unnamed JavaScript file', () => {
  const dir = makeHost('hs-ac1')
  const r = count(dir)
  assert.strictEqual(r.status, 0, 'a declared scanner must not fail the count: ' + r.stderr)
  assert.strictEqual(r.stdout.trim(), '{"count":4}',
    'a host that declares testCaseScanner reads as zero python cases and the host can never pin an existing test: ' + r.stdout)
})

function specWith(ac) {
  return '# T\n\n## Acceptance Criteria\n\n' + ac + '\n'
}

test('AC-20261101-01-2: ac-matrix --lint --resolve-root resolves a reuses pointer into a host-scanned file with zero unresolved-disposition findings, and refuses it once the key is removed', () => {
  const dir = makeHost('hs-ac2')
  const specRel = 'specs/20261101/90-t.md'
  fs.mkdirSync(path.join(dir, 'specs/20261101'), { recursive: true })
  fs.writeFileSync(path.join(dir, specRel), specWith(
    '- **AC-20261101-90-1**: WHEN x runs THE SYSTEM SHALL CONTINUE TO y → reuses tests/test_x.py :: test_gamma'))
  const args = ['--spec', path.join(dir, specRel), '--lint', '--resolve-root', dir, '--json']
  const r = runNode('scripts/ac-matrix.js', args)
  assert.strictEqual(r.status, 0, 'a pointer the host scanner names must lint clean — the lock refuses every pytest pin otherwise: ' + r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual((out.findings || []).filter(f => f.class === 'unresolved-disposition'), [],
    'no unresolved-disposition finding may remain for a host-listed case: ' + r.stdout)
  assert.strictEqual(out.observed.lint.unresolvedDisposition, 0,
    'observed.lint.unresolvedDisposition must be 0: ' + JSON.stringify(out.observed.lint))

  const bare = makeHost('hs-ac2-bare', { scanner: null })
  fs.mkdirSync(path.join(bare, 'specs/20261101'), { recursive: true })
  fs.writeFileSync(path.join(bare, specRel), fs.readFileSync(path.join(dir, specRel)))
  const rb = runNode('scripts/ac-matrix.js',
    ['--spec', path.join(bare, specRel), '--lint', '--resolve-root', bare, '--json'])
  const outB = JSON.parse(rb.stdout)
  const f = (outB.findings || []).filter(x => x.class === 'unresolved-disposition')
  assert.strictEqual(f.length, 1, 'with the key removed the pointer must stay refused (undeclared hosts unchanged): ' + rb.stdout)
  assert.match(f[0].detail, /resolved to 0 matches/, 'the refusal must name the zero-match resolution: ' + f[0].detail)
})

test('AC-20261101-01-3: a blank listing line is skipped, a line without a separator is counted malformed, and a title containing the separator splits at the first one', () => {
  const dir = makeHost('hs-ac3', { listing: LISTING + '\ngarbage without separator\n' })
  const r = runNode('scripts/count-tests.js', ['--root', dir, '--scanner-check', '--json'])
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.malformed, 1, 'the separator-less line must count as malformed, not a case: ' + r.stdout)
  assert.strictEqual(out.cases, 3, 'the blank line must be skipped and never counted as a case: ' + r.stdout)

  const dir2 = makeHost('hs-ac3-split', { listing: 'tests/test_x.py :: a :: b\n' })
  const lib = require(path.join(SPEC, 'scripts/lib/scan-test-calls.js'))
  const recs = lib.scanCases(dir2, { testCaseScanner: 'node scanner.js' }, 'tests/test_x.py', PY_SRC)
  assert.deepStrictEqual(recs.map(c => c.title), ['a :: b'],
    'the line splits at the FIRST " :: " — a later split truncates every title that contains the separator: ' + JSON.stringify(recs))
})

test('AC-20261101-01-4: a scanner exiting non-zero falls every file to the walker and writes exactly one failure line to stderr', () => {
  const dir = makeHost('hs-ac4', { scanner: 'exit 3' })
  const r = count(dir)
  assert.strictEqual(r.stdout.trim(), '{"count":1}',
    'a failed scanner must degrade to the walker — anything else changes the count of a broken host silently: ' + r.stdout)
  assert.strictEqual(r.stderr, 'testCaseScanner failed (exit 3): exit 3\n',
    'the failure must be loud exactly once per process, never silent and never repeated: ' + JSON.stringify(r.stderr))
})

test('AC-20261101-01-5: count-tests --titles --file prints the host titles with a quiet stderr, and names which reader saw zero cases otherwise', () => {
  const dir = makeHost('hs-ac5')
  const r = runNode('scripts/count-tests.js', ['--root', dir, '--titles', '--file', 'tests/test_x.py'])
  assert.strictEqual(r.stdout,
    'tests/test_x.py :: test_alpha\ntests/test_x.py :: test_beta\ntests/test_x.py :: test_gamma\n',
    'the author reads the pointer to pin off this listing — a missing title means the case cannot be pinned: ' + r.stdout)
  assert.strictEqual(r.stderr, '', 'a file with cases must write nothing to stderr: ' + r.stderr)

  const bare = makeHost('hs-ac5-bare', { scanner: null })
  const rb = runNode('scripts/count-tests.js', ['--root', bare, '--titles', '--file', 'tests/test_x.py'])
  assert.strictEqual(rb.status, 0, 'zero cases is still exit 0: ' + rb.stderr)
  assert.strictEqual(rb.stdout, '', 'the walker reads nothing from a python file: ' + rb.stdout)
  assert.strictEqual(rb.stderr, 'count-tests: 0 cases in tests/test_x.py (read by the built-in JavaScript walker)\n',
    'an empty listing is otherwise indistinguishable from no scanner for the file: ' + JSON.stringify(rb.stderr))

  const rn = runNode('scripts/count-tests.js', ['--root', dir, '--titles', '--file', 'tests/nothing.py'])
  assert.match(rn.stderr, /count-tests: 0 cases in tests\/nothing\.py \(read by testCaseScanner: node scanner\.js\)\n$/,
    'a declared-scanner miss must name the scanner, so the author fixes the listing not the file: ' + JSON.stringify(rn.stderr))
})

test('AC-20261101-01-6: count-tests --scanner-check reports the listing, and exits 3 naming the first failing field', () => {
  const dir = makeHost('hs-ac6')
  const r = runNode('scripts/count-tests.js', ['--root', dir, '--scanner-check', '--json'])
  assert.strictEqual(r.status, 0, 'a healthy scanner must exit 0: ' + r.stderr)
  assert.strictEqual(r.stdout.trim(),
    '{"declared":true,"command":"node scanner.js","exit":0,"cases":3,"files":1,"malformed":0}',
    'doctor prints this one line as proof the scanner still lists cases: ' + r.stdout)

  const bare = makeHost('hs-ac6-bare', { scanner: null })
  const rb = runNode('scripts/count-tests.js', ['--root', bare, '--scanner-check', '--json'])
  assert.strictEqual(rb.status, 0, 'an undeclared key is not a failure: ' + rb.stderr)
  assert.strictEqual(rb.stdout.trim(), '{"declared":false}', 'undeclared hosts report declared:false: ' + rb.stdout)

  const bad = makeHost('hs-ac6-exit', { scanner: 'exit 3' })
  const rx = runNode('scripts/count-tests.js', ['--root', bad, '--scanner-check', '--json'])
  assert.strictEqual(rx.status, 3, 'a non-zero scanner exit must fail the check with 3: ' + rx.stdout + rx.stderr)
  assert.strictEqual(JSON.parse(rx.stdout).exit, 3, 'the scanner exit must be reported: ' + rx.stdout)
  assert.match(rx.stderr, /^count-tests: testCaseScanner exit — 3\n$/, 'one stderr line names the failing field: ' + JSON.stringify(rx.stderr))

  const blank = makeHost('hs-ac6-blank', { listing: '\n\n' })
  const rz = runNode('scripts/count-tests.js', ['--root', blank, '--scanner-check', '--json'])
  assert.strictEqual(rz.status, 3, 'a scanner listing nothing is grounding drift and must fail the check: ' + rz.stdout + rz.stderr)
  assert.match(rz.stderr, /^count-tests: testCaseScanner cases — 0\n$/, 'one stderr line names the cases field: ' + JSON.stringify(rz.stderr))
})

test('AC-20261101-01-7: scanCases returns host records with spans cuttable and spanless ones not, and builtin records for files the listing never names', () => {
  const dir = makeHost('hs-ac7')
  const lib = require(path.join(SPEC, 'scripts/lib/scan-test-calls.js'))
  assert.strictEqual(typeof lib.scanCases, 'function',
    'scanCases is the one dispatch every consumer reads through — without it the host key has no reader')
  const cfg = { testCaseScanner: 'node scanner.js' }
  const recs = lib.scanCases(dir, cfg, 'tests/test_x.py', PY_SRC)
  assert.strictEqual(recs.length, 3, 'all three listed cases must come back: ' + JSON.stringify(recs))
  assert.ok(recs.every(c => c.source === 'host'), 'every record of a host-named file is host-sourced: ' + JSON.stringify(recs))
  const gamma = recs.find(c => c.title === 'test_gamma')
  const alpha = recs.find(c => c.title === 'test_alpha')
  assert.strictEqual(gamma.cuttable, true, 'a spanned case is cuttable: ' + JSON.stringify(gamma))
  const lines = PY_SRC.split('\n')
  assert.strictEqual(gamma.commentAbove, lines.slice(8, 11).join('\n') + '\n',
    'commentAbove must be exactly lines 9-11 including the final newline — expiry cuts this slice: ' + JSON.stringify(gamma.commentAbove))
  assert.strictEqual(alpha.cuttable, false, 'a spanless case must never be cut: ' + JSON.stringify(alpha))
  assert.strictEqual(alpha.start, 0, 'spanless start is 0: ' + JSON.stringify(alpha))
  assert.strictEqual(alpha.end, 0, 'spanless end is 0: ' + JSON.stringify(alpha))
  const js = lib.scanCases(dir, cfg, 'tests/a.test.js', fs.readFileSync(path.join(dir, 'tests/a.test.js'), 'utf8'))
  assert.strictEqual(js.length, 1, 'the unnamed JavaScript file keeps its walker case: ' + JSON.stringify(js))
  assert.strictEqual(js[0].source, 'builtin', 'walker records are builtin-sourced: ' + JSON.stringify(js))
  assert.strictEqual(js[0].cuttable, true, 'walker records stay cuttable: ' + JSON.stringify(js))
})

test('AC-20261101-01-8: red-check records a disposition for a reuses pointer into a host-scanned file instead of falling back unresolved', () => {
  const dir = makeHost('hs-ac8', { extra: { testCommand: 'node -e "process.exit(0)" --', testNameFilter: '--name={name}' } })
  const g = gitRepo(dir)
  const base = g('rev-parse', 'HEAD').trim()
  const specPath = path.join(dir, 'spec.md')
  fs.writeFileSync(specPath, '# T\n\n## Acceptance Criteria\n\n' +
    '- **AC-20261101-91-1**: WHEN x runs THE SYSTEM SHALL CONTINUE TO y → reuses tests/test_x.py :: test_gamma\n\n' +
    '## File Plan\n\n| Path | Action | Layer | Summary |\n|------|--------|-------|---------|\n' +
    '| tests/test_x.py | CREATE | tests | the reused case |\n')
  const r = runNode('scripts/red-check.js', ['--spec', specPath, '--root', dir, '--base', base, '--json'])
  const out = JSON.parse(r.stdout)
  const d = (out.dispositions || []).find(x => x.ac === 'AC-20261101-91-1')
  assert.ok(d, 'a disposition entry must exist for the AC: ' + r.stdout)
  assert.strictEqual(d.prefix, 'test_gamma', 'the prefix is the host title: ' + JSON.stringify(d))
  assert.strictEqual(d.fallback, 'unselected',
    'the stub run never names the title, so the leg must reach selection proof — "unresolved" means red-check cannot see host cases: ' + JSON.stringify(d))
})

function expiryHost(prefix, listing) {
  const dir = makeHost(prefix, { listing })
  fs.mkdirSync(path.join(dir, 'specs/20260911'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260911/55-closing.md'),
    '---\nstatus: done\ntier: standard\ndiff_base: 0000000000000000000000000000000000000000\n---\n# C\n\n' +
    '## Acceptance Criteria\n\n- **AC-20260911-55-1**: THE SYSTEM does a thing.\n')
  return dir
}

function expire(dir) {
  return runNode('scripts/expire-tests.js',
    ['--root', dir, '--spec', 'specs/20260911/55-closing.md', '--apply', '--json'])
}

test('AC-20261101-01-9: expiry never cuts a host case that has no span, lists it unscannable with the span reason, and leaves the file byte-identical', () => {
  // The case title carries the AC-ID so expiry's citedAcIds (title + commentAbove) tags it.
  const dir = expiryHost('hs-ac9', 'tests/test_x.py :: AC-20260911-55-1 test_alpha\n')
  const before = fs.readFileSync(path.join(dir, 'tests/test_x.py'), 'utf8')
  const r = expire(dir)
  assert.strictEqual(r.status, 0, 'a refused span must not fail the sweep: ' + r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(fs.readFileSync(path.join(dir, 'tests/test_x.py'), 'utf8'), before,
    'cutting a case with no known span would corrupt the host file: byte change detected')
  assert.deepStrictEqual(out.unscannable, [{
    file: 'tests/test_x.py', title: 'AC-20260911-55-1 test_alpha',
    reason: 'its span is not known — the host scanner printed no start/end',
  }], 'the refusal must be reported with the span reason first: ' + JSON.stringify(out.unscannable))
  assert.deepStrictEqual(out.retired, [], 'nothing may be retired without a span: ' + JSON.stringify(out.retired))
  assert.deepStrictEqual(out.emptied, [], 'a host-named file is never deleted: ' + JSON.stringify(out.emptied))
})

test('AC-20261101-01-10: expiry cuts exactly the host-declared lines, and never deletes a host-named file even when every case in it is retired', () => {
  const dir = expiryHost('hs-ac10', '{"file":"tests/test_x.py","title":"test_alpha","start":5,"end":7}\n')
  const r = expire(dir)
  assert.strictEqual(r.status, 0, 'a spanned case is cut cleanly: ' + r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  const lines = PY_SRC.split('\n')
  const expected = lines.slice(0, 4).concat(lines.slice(7)).join('\n')
  const after = fs.readFileSync(path.join(dir, 'tests/test_x.py'), 'utf8')
  assert.strictEqual(after, expected,
    'exactly lines 5-7 must go — the tag line, def and body — and no neighbour byte: ' + after)
  assert.deepStrictEqual(out.retired.map(x => x.title), ['test_alpha'], 'the cut case is reported retired: ' + JSON.stringify(out.retired))

  const dir2 = expiryHost('hs-ac10-all', '{"file":"tests/test_x.py","title":"test_only","start":1,"end":3}\n')
  fs.writeFileSync(path.join(dir2, 'tests/test_x.py'), '# AC-20260911-55-1\ndef test_only():\n    assert True\n')
  const r2 = expire(dir2)
  const out2 = JSON.parse(r2.stdout)
  assert.deepStrictEqual(out2.retired.map(x => x.title), ['test_only'], 'the only case is retired: ' + r2.stdout + r2.stderr)
  assert.ok(fs.existsSync(path.join(dir2, 'tests/test_x.py')),
    'deleting a whole host file is the one irreversible step and stays the walker\'s alone: file was removed')
  assert.deepStrictEqual(out2.emptied, [], 'emptied lists builtin-sourced files only: ' + JSON.stringify(out2.emptied))
})

test('AC-20261101-01-15: a testCaseScanner command in the host config roots the invariants universe at the script it names', () => {
  const dir = tmpdir('hs-ac15')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'scanner.js'), "'use strict'\n")
  const cfg = { testCaseScanner: 'node scanner.js' }
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify(cfg))
  const { deriveInvariants } = require(path.join(SPEC, 'scripts/lib/invariants.js'))
  const res = deriveInvariants(dir, cfg)
  assert.ok(res.roots.includes('scanner.js'),
    'configCommandStrings must carry testCaseScanner or expiry treats the scanner script\'s guarding tests as expirable: ' + JSON.stringify(res.roots))
})

test('AC-20261101-01-16: the library exports no language-specific scanner and an undeclared host counts a python file as zero cases', () => {
  const lib = require(path.join(SPEC, 'scripts/lib/scan-test-calls.js'))
  assert.strictEqual(lib.scanPythonCases, undefined,
    'the plugin is language-neutral — an exported python scanner makes it own a parser for one stack')
  assert.strictEqual(typeof lib.scanCases, 'function',
    'scanCases is the one dispatch every consumer reads through — without it the host key has no reader')
  const dir = makeHost('hs-ac16', { scanner: null })
  const out = count(dir).stdout.trim()
  assert.strictEqual(out, '{"count":1}',
    'an undeclared host must read python as zero cases, byte-for-byte as before: ' + out)
})
