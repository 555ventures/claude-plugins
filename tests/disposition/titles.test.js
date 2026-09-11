'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260911/04-every-criterion-declares-its-test.md D5: pins count-tests.js's new
// `--titles [--file <rel>] [--json]` mode (AC-20260911-04-5) — the one place a spec author finds
// a `→ reuses`/`→ rewrites` reference string.

const SCRIPT = 'scripts/count-tests.js'

test('AC-20260911-04-5: count-tests.js --titles --file <rel> prints "<file> :: <prefix>" per case, the prefix grown past a shared run to the first distinguishing word, and --json carries {file,prefix,title} per case', () => {
  const dir = tmpdir('titles-ac5')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/a.test.js'),
    "'use strict'\nconst { test } = require('node:test')\n" +
    "test('alpha one', () => {})\n" +
    "test('alpha two', () => {})\n")

  const res = runNode(SCRIPT, ['--root', dir, '--titles', '--file', 'tests/a.test.js'])
  assert.strictEqual(res.status, 0,
    'D5: --titles must exit 0 on a readable host — this flag does not exist yet at HEAD, so this is genuinely red (stdout: ' + res.stdout + ' stderr: ' + res.stderr + ')')
  const lines = res.stdout.split('\n').filter(Boolean)
  assert.deepStrictEqual(lines, ['tests/a.test.js :: alpha one', 'tests/a.test.js :: alpha two'],
    'D5\'s own worked example: two titles sharing the "alpha " run must each grow their prefix to the first distinguishing WORD — here the whole title, since the two only diverge in their last word — got ' + JSON.stringify(lines))

  const jsonRes = runNode(SCRIPT, ['--root', dir, '--titles', '--file', 'tests/a.test.js', '--json'])
  assert.strictEqual(jsonRes.status, 0, 'D5: --titles --json must also exit 0: ' + jsonRes.stdout + ' / ' + jsonRes.stderr)
  let out
  assert.doesNotThrow(() => { out = JSON.parse(jsonRes.stdout) }, '--json must print parseable JSON: ' + jsonRes.stdout)
  assert.deepStrictEqual(out.titles[0], { file: 'tests/a.test.js', prefix: 'alpha one', title: 'alpha one' },
    'D5: --json\'s first titles[] entry must carry file/prefix/title exactly — got ' + JSON.stringify(out.titles && out.titles[0]))
  assert.deepStrictEqual(out.titles[1], { file: 'tests/a.test.js', prefix: 'alpha two', title: 'alpha two' },
    'D5: --json\'s second titles[] entry must carry file/prefix/title exactly — got ' + JSON.stringify(out.titles && out.titles[1]))
})

test('AC-20260911-04-5: count-tests.js --titles exits 2 only on a usage error or an unreadable --root, and exits 0 with an empty titles array over a host with zero test cases', () => {
  const rUsage = runNode(SCRIPT, ['--titles'])
  assert.strictEqual(rUsage.status, 2,
    'D5: --titles with no --root at all is a usage error, exit 2: ' + rUsage.stdout + ' / ' + rUsage.stderr)

  const rBadRoot = runNode(SCRIPT, ['--root', '/nonexistent/path/for/count-tests-titles', '--titles'])
  assert.strictEqual(rBadRoot.status, 2,
    'D5: --titles over an unreadable --root is exit 2, the same as every other mode: ' + rBadRoot.stdout + ' / ' + rBadRoot.stderr)

  const dir = tmpdir('titles-empty')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  const r = runNode(SCRIPT, ['--root', dir, '--titles', '--json'])
  assert.strictEqual(r.status, 0,
    'D5: exit 0 is unconditional once usage and root are valid, even over a host with zero test cases: ' + r.stdout + ' / ' + r.stderr)
  let out
  assert.doesNotThrow(() => { out = JSON.parse(r.stdout) }, '--json must print parseable JSON: ' + r.stdout)
  assert.deepStrictEqual(out, { titles: [] },
    'D5: a zero-case host must report an empty titles array, never an error or omitted key: ' + r.stdout)
})
