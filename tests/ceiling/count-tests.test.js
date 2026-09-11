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
// own last significant character). AC-20260911-04-17 pins that the four named division controls
// stay division after that widening, and AC-20260911-04-18 pins that the widening moves this
// repo's own live count by exactly zero.

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

test('AC-20260911-02-4 (A3 operator/keyword shapes): WHEN a test file opens a regex literal holding a quote after an operator (+ - < ) or a keyword (typeof case await throw else) followed by another test( call THE SYSTEM SHALL count both calls with the first call\'s end inside its own span, AND a division after `]`, a postfix `++`, a grouping paren or a call paren SHALL still be read as division', () => {
  const dir = tmpdir('count-ac4-operators')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  const head = "'use strict'\n" +
    "const { test } = require('node:test')\n" +
    "const assert = require('node:assert')\n"
  const tail = "test('two', () => { assert.ok(true) })\n"

  // Each body opens a regex literal containing a `"` in a context the scanner once read as
  // DIVISION. A misread leaves the quote opening a string span that never closes, so the
  // following test( call is swallowed and the first call's end lands at src.length — the
  // file-corrupting shape for spec 03's span-driven deletions.
  const regexShapes = {
    'string concat': "test('one', () => { const s = 'a' + /x\"y/.source; assert.ok(s) })\n",
    'typeof': "test('one', () => { assert.ok(typeof /x\"y/ === 'object') })\n",
    'case': "test('one', () => { switch (1) { case /x\"y/.source.length: break; default: break } assert.ok(1) })\n",
    'await': "test('one', async () => { const r = await /x\"y/.test('x'); assert.ok(r !== undefined) })\n",
    'throw': "test('one', () => { try { throw /x\"y/ } catch (e) { assert.ok(e) } })\n",
    'less-than': "test('one', () => { assert.ok(1 < /x\"y/.source.length) })\n",
    'minus': "test('one', () => { assert.ok(3 - /x\"y/.source.length !== 99) })\n",
    'else': "test('one', () => { if (false) { assert.ok(1) } else /x\"y/.test('x'); assert.ok(1) })\n",
  }
  // Division controls: the context set must NOT have been blanket-widened. Each of these `/`
  // characters divides, and each body asserts the arithmetic itself so the fixture would fail
  // under `node --test` if the expression were ever a regex.
  const divisionControls = {
    'index': "test('one', () => { const arr = [4]; assert.strictEqual(arr[0] / 2, 2) })\n",
    'postfix increment': "test('one', () => { let x = 3; assert.strictEqual(x++ / 2, 1.5) })\n",
    'grouping paren': "test('one', () => { const a = 1, b = 3; assert.strictEqual((a + b) / 2, 2) })\n",
    'call paren': "test('one', () => { const foo = (v) => v * 2; assert.strictEqual(foo(2) / 2, 2) })\n",
  }

  delete require.cache[testScanPath]
  const { scanCalls } = require(testScanPath)

  for (const [label, body] of Object.entries({ ...regexShapes, ...divisionControls })) {
    const src = head + body + tail
    const calls = scanCalls(src)
    assert.strictEqual(calls.length, 2,
      'the "' + label + '" shape must scan as exactly two calls — a misread `/` here opens a span ' +
      'that swallows every later line-start test( call: ' + JSON.stringify(calls))
    assert.ok(calls[0].end < src.length,
      'the "' + label + '" shape\'s first call must end inside the source, never at src.length — an ' +
      'end at EOF is the span spec 20260911/03 would DELETE, corrupting the whole file: ' +
      JSON.stringify(calls[0]))
    assert.ok(calls[0].end <= calls[1].start,
      'the "' + label + '" shape\'s first call must end at or before the second call\'s start: ' +
      JSON.stringify(calls))
    assert.strictEqual(calls[1].title, 'two',
      'the "' + label + '" shape\'s second call title must read "two": ' + JSON.stringify(calls))
  }

  // The same twelve shapes seen end-to-end through the CLI: one file per shape, two cases each.
  let i = 0
  for (const body of Object.values({ ...regexShapes, ...divisionControls })) {
    fs.writeFileSync(path.join(dir, 'tests/shape-' + (i++) + '.test.js'), head + body + tail)
  }
  const r = runNode(SCRIPT, ['--root', dir, '--json'])
  assert.strictEqual(r.status, 0, 'the twelve-file host must exit 0: ' + r.stdout + ' / ' + r.stderr)
  let out
  assert.doesNotThrow(() => { out = JSON.parse(r.stdout) }, '--json must print parseable JSON: ' + r.stdout)
  assert.strictEqual(out.count, 24,
    'twelve files of two cases each must total 24 — a single misread `/` collapses a file to 1: ' +
    JSON.stringify(out))
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

// D10's own named division controls — each places the division expression as an `if(...)`
// condition so a scanner that over-widened the regex-context set (rather than excluding `++`/
// `--` and leaving bare identifiers/brackets/calls/groupings alone) would misread the `/` as
// opening a regex and swallow the second test( call whole.
const DIVISION_CONTROL_FRAGMENTS = {
  'array-index': 'if (arr[0]/2) { x() }',
  'post-increment': 'if (x++/2) { x() }',
  'grouping': 'if ((a+b)/2) { x() }',
  'call': 'if (foo(a)/2) { x() }',
}

test('AC-20260911-04-17: WHEN scanCalls reads a two-call source whose first call\'s if(...) condition divides by an array index, a post-increment, a grouping, or a call result (arr[0]/2, x++/2, (a+b)/2, foo(a)/2) THE SYSTEM SHALL CONTINUE TO read each `/` as division, returning 2 calls with the first call\'s end strictly less than the second\'s start and neither equal to src.length', () => {
  delete require.cache[testScanPath]
  const { scanCalls } = require(testScanPath)
  for (const [name, frag] of Object.entries(DIVISION_CONTROL_FRAGMENTS)) {
    const src = "'use strict'\nconst { test } = require('node:test')\n" +
      "const arr = [4]\nconst a = 1\nconst b = 1\nfunction foo(n) { return n }\n" +
      "test('one', () => {\n  let x = 4\n  " + frag + "\n})\n" +
      "test('two', () => {})\n"
    const calls = scanCalls(src)
    assert.strictEqual(calls.length, 2,
      `AC-20260911-04-17 (${name} shape): scanCalls must find BOTH calls — misreading "${frag}"'s "/" as opening a regex swallows the second test( call entirely into the first's span: ${JSON.stringify(calls)}`)
    assert.ok(calls[0].end < calls[1].start,
      `AC-20260911-04-17 (${name} shape): the first call's end must land strictly before the second call's start — a regex misread of the "/" pushes it past that boundary: got ${JSON.stringify(calls)}`)
    assert.notStrictEqual(calls[0].end, src.length,
      `AC-20260911-04-17 (${name} shape): the first call's end must never reach src.length when a second call follows it: ${JSON.stringify(calls[0])}`)
  }
})

// The two lines D10 added to lib/scan-test-calls.js's isRegexContext, verbatim from the real
// file at HEAD — stripping them out (rather than patching them IN on top of an already-widened
// copy, which proves nothing because the union was already true via these same two lines) is
// what makes the resulting image genuinely PRE-D10.
// D10's widening as it lives at HEAD after the merge: the operator characters inside
// REGEX_OPENING_PUNCT and the seven expression keywords inside REGEX_OPENING_KEYWORD_RE. The
// pre-D10 image is HEAD with each narrowed back to its pre-widening spelling.
const D10_PUNCT_AFTER = "const REGEX_OPENING_PUNCT = '(,=:[!&|?{};+-*%<>~^'"
const D10_PUNCT_BEFORE = "const REGEX_OPENING_PUNCT = '(,=:[!&|?{};'"
const D10_KEYWORD_AFTER =
  'const REGEX_OPENING_KEYWORD_RE = /(^|[^A-Za-z0-9_$])(return|typeof|case|await|throw|else|in|of)$/'
const D10_KEYWORD_BEFORE =
  'const REGEX_OPENING_KEYWORD_RE = /(^|[^A-Za-z0-9_$])(return)$/'

// Builds a requireable copy of lib/scan-test-calls.js at `srcText` (rewritten to the given
// `outPath`), with its relative sibling requires re-pointed at the real host-config/glob-match
// libs so only the regex-context logic under test differs from HEAD.
function writeScanLibVariant(outPath, srcText) {
  const libDir = path.dirname(testScanPath)
  const patched = srcText
    .replace("require('./host-config')", `require(${JSON.stringify(path.join(libDir, 'host-config.js'))})`)
    .replace("require('./glob-match')", `require(${JSON.stringify(path.join(libDir, 'glob-match.js'))})`)
  fs.writeFileSync(outPath, patched)
  delete require.cache[outPath]
  return require(outPath)
}

test('AC-20260911-04-18: WHEN D10\'s regex-context widening (operators + - * % < > ~ ^, keywords typeof/case/await/throw/else/in/of) is applied to THIS repository\'s own live test-file corpus THE SYSTEM SHALL report the identical total case count — no live file exercises the widened shapes, so a corrected regex-context set moves this repo\'s own count by exactly zero', () => {
  const libSrc = fs.readFileSync(testScanPath, 'utf8')
  assert.ok(libSrc.includes(D10_PUNCT_AFTER) && libSrc.includes(D10_KEYWORD_AFTER),
    'setup precondition: lib/scan-test-calls.js at HEAD must still carry D10\'s widened operator ' +
    'set and keyword set verbatim, or this reconstruction is stale and proves nothing: ' + testScanPath)

  // The PRE-D10 image: HEAD's real source with the widened operator and keyword sets NARROWED
  // back — never a copy that adds the widening on top of an already-widened file (that comparison
  // is vacuous: HEAD already carries the widened sets, so "patching them in" changes nothing and
  // the "before"/"after" counts trivially match by construction, proving nothing about D10).
  const preSrc = libSrc.replace(D10_PUNCT_AFTER, D10_PUNCT_BEFORE).replace(D10_KEYWORD_AFTER, D10_KEYWORD_BEFORE)
  assert.notStrictEqual(preSrc, libSrc,
    'setup precondition: narrowing D10\'s two sets must actually change the source, or the pre-D10 ' +
    'reconstruction is identical to HEAD and this comparison proves nothing')

  const preDir = tmpdir('count-ac18-pre')
  const pre = writeScanLibVariant(path.join(preDir, 'scan-test-calls.js'), preSrc)
  const headDir = tmpdir('count-ac18-head')
  const head = writeScanLibVariant(path.join(headDir, 'scan-test-calls.js'), libSrc)
  const { readConfig } = require(path.join(ROOT, 'spec/scripts/lib/host-config.js'))
  const config = readConfig(ROOT)

  // Discriminating proof first: the two images must genuinely differ on a control corpus that
  // DOES exercise a widened shape — otherwise a scanner that (by some other bug) behaves
  // identically to HEAD regardless of the removed lines would pass the live-corpus comparison
  // below for the wrong reason.
  const controlSrc = "'use strict'\nconst { test } = require('node:test')\n" +
    "test('one', () => {\n  typeof /a'b/\n})\n" +
    "test('two', () => {})\n"
  const preControlCount = pre.scanCalls(controlSrc).length
  const headControlCount = head.scanCalls(controlSrc).length
  assert.notStrictEqual(preControlCount, headControlCount,
    'setup precondition: the pre-D10 and HEAD images must disagree on a control source that ' +
    'exercises a widened shape (typeof immediately before a regex literal) — got pre=' +
    preControlCount + ' head=' + headControlCount + ', which means the two images are not ' +
    'actually different and this test can pass vacuously')
  assert.strictEqual(headControlCount, 2,
    'HEAD must read the control source\'s typeof-guarded regex correctly (2 calls) — got ' + headControlCount)
  assert.strictEqual(preControlCount, 1,
    'the pre-D10 image must collapse the control source to 1 call (the second test( call ' +
    'swallowed by the misread regex) — got ' + preControlCount + ', meaning it is not genuinely pre-D10')

  const beforeCount = pre.countCases(ROOT, config).count
  const afterCount = head.countCases(ROOT, config).count
  assert.strictEqual(afterCount, beforeCount,
    'D18: counting this repo\'s own live corpus with the pre-D10 image and with the real HEAD ' +
    'image must yield the identical total — a moved count means the widening was NOT the ' +
    'no-op D10\'s rationale claims: pre=' + beforeCount + ' head=' + afterCount)
})
