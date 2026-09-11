'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260911/04-every-criterion-declares-its-test.md D6/D7/D8: pins red-check.js's per-test
// verification for `rewrites`/`reuses` dispositions (AC-6, AC-7, AC-8, AC-9). AC-20260911-04-15
// (a `reuses` disposition against tests/red-check/red-check.test.js's own AC-20260821-01-13, the
// --json Contracts-shape pin) needs no new test here — that existing case is untouched and stays
// exactly as it is.

function specMd(acLines, filePlanRows) {
  return '# Test Spec\n\n## Acceptance Criteria\n\n' + acLines.join('\n') + '\n\n' +
    '## File Plan\n\n| Path | Action | Layer | Summary |\n|------|--------|-------|---------|\n' +
    filePlanRows.join('\n') + '\n'
}

function writeConfig(dir, config) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify(config))
}

function newHost(prefix, config) {
  const dir = tmpdir(prefix)
  const g = gitRepo(dir)
  const base = g('rev-parse', 'HEAD').trim()
  if (config) writeConfig(dir, config)
  return { dir, base }
}

function run(specPath, root, base, extraArgs = []) {
  return runNode('scripts/red-check.js', ['--spec', specPath, '--root', root, '--base', base, ...extraArgs])
}

function readJson(res) {
  let parsed
  try { parsed = JSON.parse(res.stdout) } catch (e) {
    assert.fail(`--json output did not parse as JSON (status ${res.status}, stderr: ${res.stderr}): ${e.message}`)
  }
  return parsed
}

const FILTER_CONFIG = { testCommand: 'node --test', testNameFilter: '--test-name-pattern={name}' }

test('AC-20260911-04-6: WHEN a rewrites disposition\'s own named case already passes against the pre-image THE SYSTEM emits gutted-rewrite naming the AC and the prefix, and a failing sibling case in the same file does not satisfy the rewrite', () => {
  const { dir, base } = newHost('rcd6', FILTER_CONFIG)
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/a.test.js'),
    "'use strict'\n// AC-20260911-97-1\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "test('AC-99-1: the rewritten case', () => { assert.ok(true) })\n" +
    "test('an unrelated sibling case', () => { assert.strictEqual(1, 2) })\n")
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260911-97-1**: WHEN x runs THE SYSTEM SHALL y → rewrites tests/a.test.js :: AC-99-1: the rewritten case'],
    ['| tests/a.test.js | CREATE | tests | the rewritten case already passes — a gutted rewrite; a sibling case fails |']))
  const res = run(spec, dir, base, ['--json'])
  assert.strictEqual(res.status, 1,
    'D7: a rewrites disposition whose own named case already passes against the pre-image must be refused as a gutted rewrite — this per-test check does not exist yet at HEAD, so this is genuinely red (stderr: ' + res.stderr + ')')
  const out = readJson(res)
  const f = out.findings.find(x => x.class === 'gutted-rewrite')
  assert.ok(f, 'a gutted-rewrite finding must be emitted: ' + JSON.stringify(out.findings))
  assert.ok((f.detail || '').includes('AC-20260911-97-1'),
    'the finding must name the AC that declared the rewrite: ' + JSON.stringify(f))
  assert.ok((f.detail || '').includes('AC-99-1: the rewritten case'),
    'the finding must name the rewritten case\'s own prefix — never satisfied by the sibling case\'s redness: ' + JSON.stringify(f))

  const d = (out.dispositions || []).find(x => x.ac === 'AC-20260911-97-1')
  assert.ok(d, 'the dispositions[] array must carry an entry for this AC: ' + JSON.stringify(out.dispositions))
  assert.strictEqual(d.kind, 'rewrites', 'the disposition entry must record kind "rewrites": ' + JSON.stringify(d))
  assert.strictEqual(d.expected, 'red', 'D7: a rewrites disposition requires red: ' + JSON.stringify(d))
  assert.strictEqual(d.observed, 'green', 'the rewritten case genuinely passes, so observed must be green: ' + JSON.stringify(d))
})

test('AC-20260911-04-7: WHEN a reuses disposition\'s own named case FAILS against the pre-image THE SYSTEM emits broken-reuse naming the AC and the prefix, and WHEN it passes THE SYSTEM emits no finding for that AC', () => {
  const { dir: dirFail, base: baseFail } = newHost('rcd7-fail', FILTER_CONFIG)
  fs.mkdirSync(path.join(dirFail, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dirFail, 'tests/a.test.js'),
    "'use strict'\n// AC-20260911-98-1\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "test('AC-99-2: the reused case', () => { assert.strictEqual(1, 2) })\n")
  const specFail = path.join(dirFail, 'spec.md')
  fs.writeFileSync(specFail, specMd(
    ['- **AC-20260911-98-1**: WHEN x runs THE SYSTEM SHALL CONTINUE TO y → reuses tests/a.test.js :: AC-99-2: the reused case'],
    ['| tests/a.test.js | CREATE | tests | the reused case genuinely fails against the pre-image |']))
  const resFail = run(specFail, dirFail, baseFail, ['--json'])
  assert.strictEqual(resFail.status, 1,
    'D7: a reuses disposition whose own named case fails against the pre-image must be refused as a broken reuse — this check does not exist yet at HEAD, so this is genuinely red (stderr: ' + resFail.stderr + ')')
  const outFail = readJson(resFail)
  const f = outFail.findings.find(x => x.class === 'broken-reuse')
  assert.ok(f, 'a broken-reuse finding must be emitted: ' + JSON.stringify(outFail.findings))
  assert.ok((f.detail || '').includes('AC-20260911-98-1'), 'the finding must name the AC: ' + JSON.stringify(f))
  assert.ok((f.detail || '').includes('AC-99-2: the reused case'), 'the finding must name the reused case\'s prefix: ' + JSON.stringify(f))

  const { dir: dirPass, base: basePass } = newHost('rcd7-pass', FILTER_CONFIG)
  fs.mkdirSync(path.join(dirPass, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dirPass, 'tests/a.test.js'),
    "'use strict'\n// AC-20260911-98-2\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "test('AC-99-2: the reused case', () => { assert.ok(true) })\n")
  const specPass = path.join(dirPass, 'spec.md')
  fs.writeFileSync(specPass, specMd(
    ['- **AC-20260911-98-2**: WHEN x runs THE SYSTEM SHALL CONTINUE TO y → reuses tests/a.test.js :: AC-99-2: the reused case'],
    ['| tests/a.test.js | CREATE | tests | the reused case genuinely passes against the pre-image |']))
  const resPass = run(specPass, dirPass, basePass, ['--json'])
  assert.strictEqual(resPass.status, 0,
    'a genuinely-passing reuse must match its sanctioned-green expectation at the whole-file level too, so this must exit 0 (stderr: ' + resPass.stderr + ')')
  const outPass = readJson(resPass)
  assert.deepStrictEqual(outPass.findings, [],
    'a genuinely-passing reused case must emit no finding of any class: ' + JSON.stringify(outPass.findings))
})

test('AC-20260911-04-8: WHEN red-check.js runs against a host config with NO testNameFilter key over a spec carrying rewrites and reuses dispositions THE SYSTEM emits exactly one warning naming testNameFilter, reports dispositions: [], and spawns no per-test run at all', () => {
  const argvLog = path.join(tmpdir('rcd8-log'), 'argv.txt')
  const { dir, base } = newHost('rcd8', null)
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'bin/recorder.js'),
    'const fs = require("fs")\n' +
    `fs.appendFileSync(${JSON.stringify(argvLog)}, process.argv.slice(2).join(" ") + "\\n")\n` +
    'process.exit(0)\n')
  // Deliberately NO testNameFilter key — D8's degrade path.
  writeConfig(dir, { testCommand: `node ${JSON.stringify(path.join(dir, 'bin/recorder.js'))}` })
  fs.writeFileSync(path.join(dir, 'tests/a.test.js'),
    "'use strict'\n// AC-20260911-99-1 AC-20260911-99-2\nconst { test } = require('node:test')\n" +
    "test('AC-99-1: the rewritten case', () => {})\n" +
    "test('AC-99-2: the reused case', () => {})\n")
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260911-99-1**: WHEN x runs THE SYSTEM SHALL CONTINUE TO y → rewrites tests/a.test.js :: AC-99-1: the rewritten case',
      '- **AC-20260911-99-2**: WHEN x runs THE SYSTEM SHALL CONTINUE TO z → reuses tests/a.test.js :: AC-99-2: the reused case'],
    ['| tests/a.test.js | CREATE | tests | one rewrites disposition, one reuses disposition, no testNameFilter declared |']))
  const res = run(spec, dir, base, ['--json'])
  const out = readJson(res)
  assert.deepStrictEqual(out.dispositions, [],
    'D8: with no testNameFilter declared, no per-test verification may run for any AC — dispositions must report empty: ' + JSON.stringify(out.dispositions))
  const filterWarnings = out.warnings.filter(w => w.includes('testNameFilter'))
  assert.strictEqual(filterWarnings.length, 1,
    'exactly one warning must name the missing testNameFilter key — got ' + JSON.stringify(out.warnings))
  assert.ok(fs.existsSync(argvLog),
    'the recorder must still be invoked for the file\'s whole-file classification — its absence means the file was never run at all')
  const invocations = fs.readFileSync(argvLog, 'utf8').trim().split('\n').filter(Boolean)
  assert.strictEqual(invocations.length, 1,
    'D8: exactly one invocation per tests-layer file, never one extra per rewrites/reuses AC on top of it — got ' + JSON.stringify(invocations))
  assert.ok(!invocations[0].includes('--test-name-pattern'),
    'D8: with no testNameFilter declared, no invocation may carry a name-filter fragment at all — got ' + JSON.stringify(invocations))
})

test('AC-20260911-04-9: WHEN a reuses reference resolves to zero titles THE SYSTEM falls back to the file\'s whole-file colour with a WARN naming cause "unresolved", and WHEN it resolves but the filtered run\'s own output never names the title THE SYSTEM falls back with cause "unselected" — neither case emits a finding for that AC', () => {
  const { dir: dirUnres, base: baseUnres } = newHost('rcd9-unres', FILTER_CONFIG)
  fs.mkdirSync(path.join(dirUnres, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dirUnres, 'tests/a.test.js'),
    "'use strict'\n// AC-20260911-99-3\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "test('AC-99-1: an existing case', () => { assert.ok(true) })\n")
  const specUnres = path.join(dirUnres, 'spec.md')
  fs.writeFileSync(specUnres, specMd(
    ['- **AC-20260911-99-3**: WHEN x runs THE SYSTEM SHALL CONTINUE TO y → reuses tests/a.test.js :: no such title'],
    ['| tests/a.test.js | CREATE | tests | the reuses reference resolves to zero cases |']))
  const resUnres = run(specUnres, dirUnres, baseUnres, ['--json'])
  assert.strictEqual(resUnres.status, 0,
    'D8: an unresolved reference must fall back to the file\'s whole-file colour and never itself be a finding (stderr: ' + resUnres.stderr + ')')
  const outUnres = readJson(resUnres)
  assert.ok(!outUnres.findings.some(f => (f.detail || '').includes('AC-20260911-99-3')),
    'an unresolved reuses reference must emit no finding naming its own AC: ' + JSON.stringify(outUnres.findings))
  assert.ok(outUnres.warnings.some(w => w.includes('tests/a.test.js') && w.includes('no such title') && w.includes('unresolved')),
    'the fallback WARN must name the file, the prefix, and the cause "unresolved": ' + JSON.stringify(outUnres.warnings))

  const stubScript = path.join(tmpdir('rcd9-unsel-stub'), 'stub.js')
  fs.writeFileSync(stubScript, 'process.stdout.write("ok 1 - generic pass\\n")\nprocess.exit(0)\n')
  const stubConfig = { testCommand: `node ${JSON.stringify(stubScript)}`, testNameFilter: '--test-name-pattern={name}' }
  const { dir: dirUnsel, base: baseUnsel } = newHost('rcd9-unsel', stubConfig)
  fs.mkdirSync(path.join(dirUnsel, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dirUnsel, 'tests/a.test.js'),
    "'use strict'\n// AC-20260911-99-4\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "test('AC-99-4: the only case', () => { assert.ok(true) })\n")
  const specUnsel = path.join(dirUnsel, 'spec.md')
  fs.writeFileSync(specUnsel, specMd(
    ['- **AC-20260911-99-4**: WHEN x runs THE SYSTEM SHALL CONTINUE TO y → reuses tests/a.test.js :: AC-99-4: the only case'],
    ['| tests/a.test.js | CREATE | tests | the reference resolves, but the stub runner never prints the title in its output |']))
  const resUnsel = run(specUnsel, dirUnsel, baseUnsel, ['--json'])
  assert.strictEqual(resUnsel.status, 0,
    'D8: an unselected reference (resolved, but absent from the filtered run\'s own output) must also fall back, never itself a finding (stderr: ' + resUnsel.stderr + ')')
  const outUnsel = readJson(resUnsel)
  assert.ok(!outUnsel.findings.some(f => (f.detail || '').includes('AC-20260911-99-4')),
    'an unselected reuses reference must emit no finding naming its own AC: ' + JSON.stringify(outUnsel.findings))
  assert.ok(outUnsel.warnings.some(w => w.includes('tests/a.test.js') && w.includes('AC-99-4: the only case') && w.includes('unselected')),
    'the fallback WARN must name the file, the prefix, and the cause "unselected": ' + JSON.stringify(outUnsel.warnings))
})

// AC-20260911-04-9/AC-20260911-04-7: runFilteredLeg's substituted filter/path fragments used to
// be JSON.stringify (double-quoted) into the `bash -c` command string, so bash still expanded a
// backtick (command substitution) and a `$` (variable expansion) inside a test's own title before
// the pattern ever reached `node --test-name-pattern`. A title carrying a backtick-quoted
// `touch <marker>` therefore ran the touch for real instead of matching it as literal text, and
// the run's own output no longer named the title verbatim (D8's selection proof failed), so the
// reference degraded to "unselected" and fell back to whole-file colour. Single-quoting the
// substituted fragments (shellQuoteSingle) fixes both: the marker is never created, and the
// title still selects and resolves as a genuine reuses match.
test('AC-20260911-04-9 / AC-20260911-04-7: WHEN a reuses reference\'s own title carries a backtick-quoted shell command, a $-prefixed name, a single quote and a double quote THE SYSTEM selects and resolves that exact case with no fallback and executes no shell expansion of the title', () => {
  const { dir, base } = newHost('rcd9-quoting', FILTER_CONFIG)
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  const markerPath = path.join(dir, 'marker-red-check-quoting.txt')
  const rawTitle = 'AC-99-9: guards `touch ' + markerPath + '` and $HOME and \'single\' and "double" quoting'
  fs.writeFileSync(path.join(dir, 'tests/a.test.js'),
    "'use strict'\n// AC-20260911-99-9\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    `test(${JSON.stringify(rawTitle)}, () => { assert.ok(true) })\n`)
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20260911-99-9**: WHEN x runs THE SYSTEM SHALL CONTINUE TO y → reuses tests/a.test.js :: ' + rawTitle],
    ['| tests/a.test.js | CREATE | tests | the reused case\'s own title carries backtick/$/quote shell metacharacters |']))
  const res = run(spec, dir, base, ['--json'])
  assert.strictEqual(res.status, 0,
    'a genuinely-passing reuses case must exit 0 regardless of what shell metacharacters its title carries (stderr: ' + res.stderr + ')')
  const out = readJson(res)

  assert.ok(!fs.existsSync(markerPath),
    'the title\'s backtick-quoted `touch <marker>` must never execute as a real shell command ' +
    'substitution — its existence means the substituted title fragment was still shell-expanded')

  const d = (out.dispositions || []).find(x => x.ac === 'AC-20260911-99-9')
  assert.ok(d, 'the dispositions[] array must carry an entry for this AC — its absence means the ' +
    'per-test run for it never happened at all: ' + JSON.stringify(out.dispositions))
  assert.strictEqual(d.fallback, undefined,
    'the reference must resolve and select cleanly with no fallback — a shell-expanded pattern ' +
    'that no longer matches the title\'s own output degrades this to "unselected": ' + JSON.stringify(d))
  assert.strictEqual(d.observed, 'green',
    'the reused case genuinely passes, so observed must be green once selection succeeds: ' + JSON.stringify(d))
  assert.ok(!out.warnings.some(w => w.includes('AC-20260911-99-9') && w.includes('unselected')),
    'no "unselected" warning may be emitted for this AC once the title survives shell substitution intact: ' + JSON.stringify(out.warnings))
  assert.deepStrictEqual(out.findings, [],
    'a genuinely-passing, correctly-selected reused case must emit no finding of any class: ' + JSON.stringify(out.findings))
})
