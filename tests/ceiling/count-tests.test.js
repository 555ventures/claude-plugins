'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, tmpdir, runNode } = require('../helpers')

// specs/20260911/02-tests-have-a-ceiling.md D2/D3′/D9′ (the ceiling, its file and its
// hook are retired): pins spec/scripts/count-tests.js by execution (AC-1, AC-2,
// AC-4) and the live-repo self-application pin (AC-11). There is no red arm and no ceiling file
// left to pin — their absence IS the property under test.
//
// specs/20260911/04-every-criterion-declares-its-test.md D10: AC-20260911-04-12 pins the widened
// regex-context set (operators + - * % < > ~ ^, keywords typeof/case/await/throw/else/in/of) and
// the span invariant (a call's end never lands at src.length unless that index is the source's
// own last significant character). AC-20260911-04-17 (reuses AC-20260911-02-11 below, unchanged)
// and AC-20260911-04-18 (the widening moves this repo's own live count by exactly zero) round it
// out.

const SCRIPT = 'scripts/count-tests.js'

// lib/scan-test-calls.js is a plain requireable library (never a workflow sandbox script), the same
// idiom tests/ac-matrix/ac-matrix.test.js already uses for lib/spec-sections.js's parseAcBullets.
const testScanPath = path.join(ROOT, 'spec/scripts/lib/scan-test-calls.js')

// AC-20260911-02-1's own worked example: five line-start test()/it() calls across three files,
// plus one `"test("` string, one `// test(` comment, one describe(, and one t.test( — none of
// the latter four counted.
function seedFiveCaseHost(dir) {
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/a.test.js'),
    "'use strict'\nconst { test } = require('node:test')\n" +
    "test('a1', () => {})\n" +
    "test('a2', () => {})\n")
  fs.writeFileSync(path.join(dir, 'tests/b.test.js'),
    "'use strict'\nconst { test, describe } = require('node:test')\n" +
    "describe('group', () => {})\n" +
    "test('b1', () => {})\n" +
    "test('b2', () => {})\n" +
    "// test('not a real call')\n" +
    "const s = \"test(\"\n" +
    "t.test('not counted either', () => {})\n")
  fs.writeFileSync(path.join(dir, 'tests/c.test.js'),
    "'use strict'\nconst { it } = require('node:test')\n" +
    "it('c1', () => {})\n")
}

test('AC-20260911-02-1: WHEN count-tests.js --root <fixture> --json runs over a fixture host whose test files hold five line-start test()/it() calls plus one "test(" string, one // test( comment, one describe( and one t.test( THE SYSTEM SHALL print {"count":5} and exit 0', () => {
  const dir = tmpdir('count-ac1')
  seedFiveCaseHost(dir)
  const r = runNode(SCRIPT, ['--root', dir, '--json'])
  assert.strictEqual(r.status, 0,
    'a five-case host must exit 0 — this script has no red arm to trip: ' + r.stdout + ' / ' + r.stderr)
  let out
  assert.doesNotThrow(() => { out = JSON.parse(r.stdout) },
    '--json must print parseable JSON on stdout: ' + r.stdout)
  assert.deepStrictEqual(out, { count: 5 },
    'D2: the scanner must count exactly the five line-start test()/it() calls and skip the ' +
    '"test(" string, the // test( comment, describe(, and t.test( entirely — a different count ' +
    'means one of those four non-cases leaked into the total or a real call was missed: ' +
    JSON.stringify(out))
})

test('AC-20260911-02-2: WHEN count-tests.js runs over a fixture host holding any number of test cases THE SYSTEM SHALL exit 0 for both a one-case host and a 500-case host, and SHALL exit 2 only for a usage error or an unreadable --root', () => {
  const dirOne = tmpdir('count-ac2-one')
  fs.mkdirSync(path.join(dirOne, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dirOne, 'tests/one.test.js'),
    "'use strict'\nconst { test } = require('node:test')\ntest('a', () => {})\n")
  const rOne = runNode(SCRIPT, ['--root', dirOne, '--json'])
  assert.strictEqual(rOne.status, 0,
    'a one-case host must exit 0: ' + rOne.stdout + ' / ' + rOne.stderr)
  assert.deepStrictEqual(JSON.parse(rOne.stdout), { count: 1 },
    'a one-case host must report count:1: ' + rOne.stdout)

  const dirMany = tmpdir('count-ac2-many')
  fs.mkdirSync(path.join(dirMany, 'tests'), { recursive: true })
  const lines = []
  for (let i = 0; i < 500; i++) lines.push(`test('case-${i}', () => {})`)
  fs.writeFileSync(path.join(dirMany, 'tests/many.test.js'),
    "'use strict'\nconst { test } = require('node:test')\n" + lines.join('\n') + '\n')
  const rMany = runNode(SCRIPT, ['--root', dirMany, '--json'])
  assert.strictEqual(rMany.status, 0,
    'D3′: a 500-case host must ALSO exit 0 — a huge count is a number to report, never a reason ' +
    'to fail: ' + rMany.stdout + ' / ' + rMany.stderr)
  assert.deepStrictEqual(JSON.parse(rMany.stdout), { count: 500 },
    'a 500-case host must report count:500: ' + rMany.stdout)

  const rMissingRoot = runNode(SCRIPT, ['--root', '/nonexistent/path/for/count-tests'])
  assert.strictEqual(rMissingRoot.status, 2,
    'an unreadable --root must exit 2 — the only non-zero exit this script has: ' +
    rMissingRoot.stdout + ' / ' + rMissingRoot.stderr)
  assert.match(rMissingRoot.stderr, /--root/,
    'the exit-2 message must name --root as the offending flag so the remedy (pass an existing ' +
    'directory) is discoverable: ' + rMissingRoot.stderr)

  const rUsage = runNode(SCRIPT, [])
  assert.strictEqual(rUsage.status, 2,
    'omitting --root entirely is a usage error and must also exit 2: ' + rUsage.stdout + ' / ' + rUsage.stderr)
})

test('AC-20260911-02-4: WHEN a test file contains a regex literal holding a quote and a paren (e.g. assert.match(x, /atlas\\)" stop open/)) followed by another test( call THE SYSTEM SHALL count both calls and scanCalls SHALL return each call\'s end at its own closing paren (the second call\'s title is read correctly)', () => {
  const dir = tmpdir('count-ac4')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  const src = "'use strict'\n" +
    "const { test } = require('node:test')\n" +
    "const assert = require('node:assert')\n" +
    "test('one', () => { assert.match('x', /atlas\\)\" stop open/) })\n" +
    "test('two', () => { assert.ok(true) })\n"
  fs.writeFileSync(path.join(dir, 'tests/regex.test.js'), src)

  const r = runNode(SCRIPT, ['--root', dir, '--json'])
  assert.strictEqual(r.status, 0, 'a two-case host must exit 0: ' + r.stdout + ' / ' + r.stderr)
  let out
  assert.doesNotThrow(() => { out = JSON.parse(r.stdout) }, '--json must print parseable JSON: ' + r.stdout)
  assert.strictEqual(out.count, 2,
    'a regex literal holding an escaped paren and a quote must not corrupt the scan\'s paren-depth ' +
    'tracking — both calls must still be counted: ' + JSON.stringify(out))

  assert.ok(fs.existsSync(testScanPath),
    'lib/scan-test-calls.js does not exist at ' + testScanPath + ' — D2\'s scanner has not been created')
  delete require.cache[testScanPath]
  const { scanCalls } = require(testScanPath)
  const calls = scanCalls(src)
  assert.strictEqual(calls.length, 2,
    'scanCalls must find exactly two calls in this source, never merging or splitting them across ' +
    'the regex literal\'s escaped paren: ' + JSON.stringify(calls))
  assert.strictEqual(calls[0].title, 'one',
    'the first call\'s title must read "one": ' + JSON.stringify(calls))
  assert.strictEqual(calls[1].title, 'two',
    'AC-4 (literal): the second call\'s title must be read correctly as "two" — a paren-depth ' +
    'corruption from misreading the regex literal\'s escaped `\\)` as a real closing paren would ' +
    'terminate the first call early or swallow the second call\'s own arguments: ' + JSON.stringify(calls))
  assert.ok(calls[1].end > calls[1].start && calls[1].end <= src.length,
    'the second call\'s end must land at its own closing paren, inside the source bounds: ' +
    JSON.stringify(calls[1]))
  assert.ok(src.slice(calls[1].start, calls[1].end).includes('two'),
    'the second call\'s own span must include its own title literal "two": ' + JSON.stringify(calls[1]))
})

test('AC-20260911-02-4 (A3 arrow shape): WHEN a test file holds an arrow function whose body is a regex literal containing a backtick (e.g. prefix => /never `$/.test(prefix)) followed by another test( call THE SYSTEM SHALL count both calls', () => {
  const dir = tmpdir('count-ac4-arrow')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  const src = "'use strict'\n" +
    "const { test } = require('node:test')\n" +
    "const assert = require('node:assert')\n" +
    "test('one', () => {\n" +
    "  const mentions = ['x']\n" +
    "  assert.ok(mentions.every(prefix => /never `$/.test(prefix)))\n" +
    "})\n" +
    "test('two', () => { assert.ok(true) })\n" +
    "test('three', () => { assert.ok(true) })\n"
  fs.writeFileSync(path.join(dir, 'tests/arrow-regex.test.js'), src)

  const r = runNode(SCRIPT, ['--root', dir, '--json'])
  assert.strictEqual(r.status, 0, 'a three-case host must exit 0: ' + r.stdout + ' / ' + r.stderr)
  let out
  assert.doesNotThrow(() => { out = JSON.parse(r.stdout) }, '--json must print parseable JSON: ' + r.stdout)
  assert.strictEqual(out.count, 3,
    'an arrow-function body opening a regex literal (the `=>` token before the `/`) must not be ' +
    'misread as division — a misread here treats the backtick inside the regex as opening a ' +
    'template literal that never resynchronizes, swallowing every later test( call: ' + JSON.stringify(out))

  delete require.cache[testScanPath]
  const { scanCalls } = require(testScanPath)
  const calls = scanCalls(src)
  assert.strictEqual(calls.length, 3,
    'scanCalls must find exactly three calls, never swallowing the second and third into the ' +
    'first\'s span: ' + JSON.stringify(calls))
  assert.ok(calls[0].end <= calls[1].start,
    'the first call\'s end must land at or before the second call\'s start, never past it — a scan ' +
    'that misread the arrow-regex swallows every later call into the first\'s span, which would ' +
    'push its end to src.length: ' + JSON.stringify(calls))
})

test('AC-20260911-02-4 (A3 paren-keyword shape): WHEN a test file holds a control-flow `)` immediately followed by a regex literal containing a quote (e.g. if (a) /re"(/.test(x)) followed by another test( call THE SYSTEM SHALL count both calls, and a plain division after a grouping/call paren SHALL still be read as division', () => {
  const dir = tmpdir('count-ac4-paren-keyword')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  const src = "'use strict'\n" +
    "const { test } = require('node:test')\n" +
    "const assert = require('node:assert')\n" +
    "test('one', () => {\n" +
    "  const a = true\n" +
    "  if (a) /re\"(/.test('x')\n" +
    "  const half = (2 + 2) / 2\n" +
    "  assert.ok(half === 2)\n" +
    "})\n" +
    "test('two', () => { assert.ok(true) })\n"
  fs.writeFileSync(path.join(dir, 'tests/paren-keyword-regex.test.js'), src)

  const r = runNode(SCRIPT, ['--root', dir, '--json'])
  assert.strictEqual(r.status, 0, 'a two-case host must exit 0: ' + r.stdout + ' / ' + r.stderr)
  let out
  assert.doesNotThrow(() => { out = JSON.parse(r.stdout) }, '--json must print parseable JSON: ' + r.stdout)
  assert.strictEqual(out.count, 2,
    'a `)` closing an `if (...)` condition must open a regex context so the quote inside the regex ' +
    'never opens a string span that swallows the following test( call, while a `)` closing a ' +
    'grouping or call expression must still read the next `/` as division: ' + JSON.stringify(out))

  delete require.cache[testScanPath]
  const { scanCalls } = require(testScanPath)
  const calls = scanCalls(src)
  assert.strictEqual(calls.length, 2,
    'scanCalls must find exactly two calls, never merging the second into the first via a ' +
    'misread `)`-preceded regex: ' + JSON.stringify(calls))
  assert.ok(calls[0].end <= calls[1].start,
    'the first call\'s end must land at or before the second call\'s start, never past it — a ' +
    'misread `)`-preceded regex swallows the second call into the first\'s span, which would push ' +
    'its end to src.length: ' + JSON.stringify(calls))
})

test('AC-20260911-02-11: WHEN count-tests.js --root . runs over this repository at HEAD THE SYSTEM SHALL exit 0 reporting a positive integer count, and spec/test-ceiling.json SHALL NOT exist, and no .claude/test-ceiling.json SHALL exist', () => {
  const r = runNode(SCRIPT, ['--root', '.', '--json'], { cwd: ROOT })
  assert.strictEqual(r.status, 0,
    'D9′: the instrument must be executed against the real tree — a nonzero exit here means the ' +
    'live host itself is unreadable or the script mis-derived usage: ' + r.stdout + ' / ' + r.stderr)
  let out
  assert.doesNotThrow(() => { out = JSON.parse(r.stdout) },
    'the --json output must parse: ' + r.stdout)
  assert.ok(Number.isInteger(out.count) && out.count > 0,
    'the live repo\'s own test-case count must be a positive integer — this repo\'s real test suite ' +
    'is non-empty: ' + JSON.stringify(out))
  assert.ok(!fs.existsSync(path.join(ROOT, 'spec/test-ceiling.json')),
    'D1′: no host can ever bind a plugin-dir path — spec/test-ceiling.json must not exist: ' +
    fs.existsSync(path.join(ROOT, 'spec/test-ceiling.json')))
  assert.ok(!fs.existsSync(path.join(ROOT, '.claude/test-ceiling.json')),
    'D1′: no .claude/test-ceiling.json is ever created — there is no ceiling for a host to declare: ' +
    fs.existsSync(path.join(ROOT, '.claude/test-ceiling.json')))
})

// D10's eight forcing shapes: each embeds a two-character regex literal (`/a'b/` or `/a(b/`)
// immediately after an operator/keyword D10 adds to the regex-context set. Confirmed executed
// against the untouched pre-image (node v26.8.2): every one of the eight collapses `scanCalls` to
// ONE call whose `end` lands at `src.length` — the second `test(` call is swallowed whole, because
// the `/` is misread as division, the literal's `'`/`(` is then read as a real quote/paren, and
// the resulting unterminated span consumes the rest of the file.
const D10_FRAGMENTS = {
  typeof: "typeof /a'b/",
  'string-concat': '"^" + /a\'b/.source',
  case: "case /a'b/.test(y):",
  await: "await /a'b/.exec(y)",
  throw: "throw /a'b/",
  'less-than': "x < /a'b/.source.length",
  minus: '1 - /a(b/.source.length',
  else: "else /a'b/.test(y)",
}

test('AC-20260911-04-12: WHEN scanCalls reads a two-call source whose first call is followed by a regex literal immediately after one of D10\'s newly-recognized operators/keywords (typeof, string-concat `"^" +`, case, await, throw, `<`, `-`, else) THE SYSTEM SHALL return 2 calls with the first call\'s end strictly less than the second\'s start and neither equal to src.length', () => {
  delete require.cache[testScanPath]
  const { scanCalls } = require(testScanPath)
  for (const [name, frag] of Object.entries(D10_FRAGMENTS)) {
    const src = "'use strict'\nconst { test } = require('node:test')\n" +
      "test('one', () => {\n  " + frag + "\n})\n" +
      "test('two', () => {})\n"
    const calls = scanCalls(src)
    assert.strictEqual(calls.length, 2,
      `D10 (${name} shape): scanCalls must find BOTH calls — a regex literal misread as division after "${frag}" swallows the second test( call entirely into the first's span, which today collapses this to 1 call: ${JSON.stringify(calls)}`)
    assert.ok(calls[0].end < calls[1].start,
      `D10 (${name} shape): the first call's end must land strictly before the second call's start — got ${JSON.stringify(calls)}`)
    assert.notStrictEqual(calls[0].end, src.length,
      `D10 (${name} shape): the first call's end must never reach src.length when a second call follows it — a span reaching end-of-file here is exactly the file-corrupting deletion spec 03 depends on this invariant to prevent: ${JSON.stringify(calls[0])}`)
    assert.notStrictEqual(calls[1].end, src.length,
      `D10 (${name} shape): the second call is genuinely the file's last call, so its own end MAY equal src.length only if that index is the source's last significant character — got end=${calls[1].end} vs src.length=${src.length}: ${JSON.stringify(calls[1])}`)
  }
})

test('AC-20260911-04-18: WHEN D10\'s regex-context widening (operators + - * % < > ~ ^, keywords typeof/case/await/throw/else/in/of) is applied to THIS repository\'s own live test-file corpus THE SYSTEM SHALL report the identical total case count — no live file exercises the widened shapes, so a corrected regex-context set moves this repo\'s own count by exactly zero', () => {
  const before = runNode(SCRIPT, ['--root', '.', '--json'], { cwd: ROOT })
  assert.strictEqual(before.status, 0,
    'the live repo\'s own count must be measurable before comparing it against the widened reconstruction: ' + before.stdout + ' / ' + before.stderr)
  const beforeCount = JSON.parse(before.stdout).count

  // A faithful reconstruction of D10's widening, built from the Decision's own literal token
  // list and patched onto a scratch copy of THIS repo's real lib/scan-test-calls.js, then run
  // over the exact same corpus — the executed proof, not an assertion taken on faith, that the
  // widening moves this repo's total by zero (D10's own rationale: "no live file exercises the
  // widened shapes").
  const libDir = path.dirname(testScanPath)
  const libSrc = fs.readFileSync(testScanPath, 'utf8')
  const widenedSrc = libSrc
    .replace("'(,=:[!&|?{};'.includes(last)", "'(,=:[!&|?{};+-*%<>~^'.includes(last)")
    .replace(
      "return /(^|[^A-Za-z0-9_$])return$/.test(word)",
      "return /(^|[^A-Za-z0-9_$])(return|typeof|case|await|throw|else|in|of)$/.test(word)")
    // Keep the scratch copy's own relative requires resolving to the real sibling libs (host-config,
    // glob-match) — only the regex-context logic above is under test here.
    .replace("require('./host-config')", `require(${JSON.stringify(path.join(libDir, 'host-config.js'))})`)
    .replace("require('./glob-match')", `require(${JSON.stringify(path.join(libDir, 'glob-match.js'))})`)
  assert.notStrictEqual(widenedSrc, libSrc,
    'setup precondition: the textual patch must actually change lib/scan-test-calls.js\'s source, or this comparison proves nothing about D10\'s widening')
  const widenedPath = path.join(tmpdir('count-ac18-widened'), 'scan-test-calls.js')
  fs.writeFileSync(widenedPath, widenedSrc)
  delete require.cache[widenedPath]
  const widened = require(widenedPath)
  const { readConfig } = require(path.join(ROOT, 'spec/scripts/lib/host-config.js'))
  const config = readConfig(ROOT)
  const afterCount = widened.countCases(ROOT, config).count

  assert.strictEqual(afterCount, beforeCount,
    'D18: widening the regex-context set per D10\'s own literal token list must move this repo\'s live count by exactly zero — a moved count means the set was blanket-widened rather than corrected: before=' + beforeCount + ' after=' + afterCount)
})
