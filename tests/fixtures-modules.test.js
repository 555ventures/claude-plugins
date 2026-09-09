'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const { ROOT, tmpdir, gitRepo } = require('./helpers')

// specs/20260908/03-test-fixture-dedupe.md D1-D5: pins the four fixtures modules' own
// Contracts (review-legs, tournament's new params, ac-matrix, replay) plus D5's "registers zero
// tests" invariant. One test per AC-20260908-03-2..-7; each fails if its module stops meeting
// the Contracts block, and AC-7 fails on any drift in the default brief template.

test('AC-20260908-03-2: makeReviewLegsHost writes extraFiles only into the HEAD commit, leaving the base commit without them, alongside the shared src/foo.js and spec skeleton', () => {
  let mod
  try {
    mod = require('./review/review-legs.fixtures.js')
  } catch (e) {
    assert.fail('tests/review/review-legs.fixtures.js must exist and export makeReviewLegsHost (D1): ' + e.message)
  }
  const { makeReviewLegsHost } = mod
  const config = {
    gateCommand: 'node --test tests',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none' },
  }
  const testBody = "'use strict'\nconst { test } = require('node:test')\ntest('placeholder', () => {})\n"
  const { dir, base } = makeReviewLegsHost('fixtures-ac2', {
    specDate: '20260908', ordinal: '03', acId: 'AC-20260908-03-2',
    config, testBody, extraFiles: { 'bin/x.js': 'module.exports = () => "x"\n' },
  })

  const baseNames = execFileSync('git', ['-C', dir, 'show', '--name-only', '--format=', base], { encoding: 'utf8' })
    .split('\n').filter(Boolean)
  assert.ok(!baseNames.includes('bin/x.js'),
    'AC-2: the base commit must lack bin/x.js — extraFiles is written only before the implement commit (D1): ' +
    JSON.stringify(baseNames))

  assert.ok(fs.existsSync(path.join(dir, 'bin/x.js')),
    'AC-2: HEAD must carry bin/x.js after makeReviewLegsHost writes extraFiles: ' + dir)

  const foo = fs.readFileSync(path.join(dir, 'src/foo.js'), 'utf8')
  assert.match(foo, /42/,
    'AC-2: src/foo.js must return 42 at HEAD, the shared review-legs skeleton every caller relies on: ' + foo)

  const specDir = path.join(dir, 'specs/20260908')
  const specFiles = fs.existsSync(specDir) ? fs.readdirSync(specDir) : []
  assert.ok(specFiles.some((f) => f.startsWith('03-') && f.endsWith('.md')),
    'AC-2: the host must carry the spec under specs/20260908/03-*.md: ' + JSON.stringify(specFiles))
})

// D9: AC-20260908-03-3 was split — the new-promise half (extraSections lands before ## Picks)
// stays AC-...-3; the `SHALL CONTINUE TO` regression half (the no-arg template is unchanged) is
// AC-...-7. One test per AC, so red-check can classify each half's expected pre-image colour
// instead of refusing the file with `mixed-pin`.
test('AC-20260908-03-3: writeBrief writes extraSections before ## Picks', () => {
  const { writeBrief } = require('./genesis/tournament.fixtures.js')

  const dirWith = tmpdir('fixtures-ac3-with')
  writeBrief(dirWith, { extraSections: '## Journeys\n\n- x' })
  const withText = fs.readFileSync(path.join(dirWith, '.claude/genesis/brief.md'), 'utf8')
  const journeysAt = withText.indexOf('## Journeys')
  const picksAt = withText.indexOf('## Picks')
  assert.ok(journeysAt !== -1 && picksAt !== -1 && journeysAt < picksAt,
    'AC-3: an extraSections string must be written into the brief BEFORE ## Picks (D2): ' + withText)
})

test('AC-20260908-03-7: writeBrief called without extraSections keeps writing today\'s template with no ## Journeys section', () => {
  const { writeBrief } = require('./genesis/tournament.fixtures.js')

  const dirWithout = tmpdir('fixtures-ac3-without')
  writeBrief(dirWithout, {})
  const withoutText = fs.readFileSync(path.join(dirWithout, '.claude/genesis/brief.md'), 'utf8')

  const EXPECTED_DEFAULT_BRIEF = `# Discovery brief — test project

## What I think you're building
A synthetic project for tournament.test.js.

## Coverage
- payer: covered — synthetic test value
- tenancy: covered — synthetic test value
- data-sensitivity: covered — synthetic test value
- residency: covered — synthetic test value
- ai-use: covered — synthetic test value
- unattended: covered — synthetic test value
- integrations: covered — synthetic test value
- scale-outage: covered — synthetic test value
- vendor-budget: covered — synthetic test value
- offline-mobile: covered — synthetic test value

## Non-goals
none

## Open Dimensions
- hosting: open

## Research Angles
none — synthetic host, no research needed.

## Picks

`

  assert.strictEqual(withoutText, EXPECTED_DEFAULT_BRIEF,
    'AC-7: omitting extraSections must CONTINUE to write today\'s exact template byte-for-byte (no ## Journeys, ' +
    '## Picks intact), or every tournament test built on this brief silently drifts: ' + withoutText)
})

test('AC-20260908-03-4: baseHost(tmpdir()) returns a spec file that exists and a manifest run(...) can read, with findings(...) yielding the parsed --json payload whose findings key is an array', () => {
  let mod
  try {
    mod = require('./ac-matrix/ac-matrix.fixtures.js')
  } catch (e) {
    assert.fail('tests/ac-matrix/ac-matrix.fixtures.js must exist and export baseHost/run/findings (D3): ' + e.message)
  }
  const { baseHost, run, findings } = mod
  const dir = tmpdir('fixtures-ac4')
  const { specPath, root, manifestPath } = baseHost(dir)

  assert.ok(fs.existsSync(specPath), 'AC-4: baseHost must return a specPath that exists on disk: ' + specPath)
  assert.ok(typeof root === 'string' && fs.existsSync(root),
    'AC-4: baseHost must return a root directory that exists: ' + root)
  assert.ok(fs.existsSync(manifestPath),
    'AC-4: baseHost must return a manifestPath that is readable (exists on disk) before run(...) is called: ' +
    manifestPath)

  // `findings` parses stdout as JSON, so the run must ask for it — every one of the 13 existing
  // call sites passes `--json` through `extraArgs` for the same reason.
  const res = run(specPath, root, manifestPath, ['--json'])
  const parsed = findings(res)
  // D8: `findings` is lifted byte-identically from its two owning files, where all 13 call sites
  // read `.findings` / `.warnings` / `.observed` off it — so it yields the whole parsed `--json`
  // payload, not a bare array. The spec's original Contracts line said `object[]`; that was a
  // mis-transcription of the helper being lifted, corrected in the spec rather than by rewriting
  // 13 assertions (D6 forbids assertion changes). The array promise lands on `.findings`.
  assert.ok(parsed && typeof parsed === 'object' && !Array.isArray(parsed),
    'AC-4/D8: findings(...) must yield the parsed --json payload object: ' + JSON.stringify(parsed))
  assert.ok(Array.isArray(parsed.findings),
    'AC-4/D8: the parsed payload\'s `findings` key must be an array from a run(...) against ' +
    'baseHost\'s own paths: ' + JSON.stringify(parsed))
})

test('AC-20260908-03-5: setupOverlayHost returns two distinct commit shas whose close sha\'s git show --name-only lists exactly the closeFiles keys', () => {
  let mod
  try {
    mod = require('./replay/replay.fixtures.js')
  } catch (e) {
    assert.fail('tests/replay/replay.fixtures.js must exist and export setupOverlayHost (D4): ' + e.message)
  }
  const { setupOverlayHost } = mod
  const root = fs.realpathSync(tmpdir('fixtures-ac5'))
  gitRepo(root)

  const closeFiles = { 'lib/a.js': 'A\n', 'tests/new.test.js': 'new\n' }
  const { parent, close } = setupOverlayHost(root, {
    parentFiles: { 'lib/a.js': 'a\n' },
    closeFiles,
  })

  assert.notStrictEqual(parent, close,
    'AC-5: setupOverlayHost must return two DISTINCT commit shas for parentFiles and closeFiles: ' +
    JSON.stringify({ parent, close }))

  const nameOnly = execFileSync('git', ['-C', root, 'show', '--name-only', '--format=', close], { encoding: 'utf8' })
  const rows = nameOnly.split('\n').filter(Boolean).sort()
  assert.deepStrictEqual(rows, Object.keys(closeFiles).sort(),
    'AC-5: git show --name-only on the close sha must list EXACTLY the closeFiles keys: ' + nameOnly)
})

// A file loaded via `node --test <file>` that registers zero test()s gets exactly one synthetic
// TAP subtest named after the FILE PATH; a file that calls test() gets a subtest named after that
// test instead (both report "# tests 1", so a count alone can't tell them apart) — the subtest
// name is therefore the deterministic proxy for "registers zero tests".
//
// NODE_TEST_CONTEXT must be stripped from the child env, or node sees this file's own recursive
// `node --test` run and refuses to recurse, emitting no `# Subtest:` line at all for every module.
function fixturesModuleSubtestLine(relPath) {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', relPath],
    { cwd: ROOT, encoding: 'utf8', env })
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('# Subtest:'))
  return { r, line }
}

test('AC-20260908-03-6: none of the four fixtures modules register a test() when node --test loads them directly, and none is named *.test.js so the suite glob never executes them', () => {
  const files = [
    'tests/review/review-legs.fixtures.js',
    'tests/genesis/tournament.fixtures.js',
    'tests/ac-matrix/ac-matrix.fixtures.js',
    'tests/replay/replay.fixtures.js',
  ]
  for (const rel of files) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)),
      'AC-6: a fixtures module must exist on disk before its test-registration can be checked: ' + rel)

    const { r, line } = fixturesModuleSubtestLine(rel)
    assert.strictEqual(line, '# Subtest: ' + rel,
      'AC-6/D5: ' + rel + ' must register zero test()s — node --test names its synthetic wrapper subtest ' +
      'after the file path only when nothing inside it called test(); any other subtest name means this ' +
      'fixtures module registers a real test: ' + JSON.stringify({ stdout: r.stdout, stderr: r.stderr }))

    assert.ok(rel.endsWith('.fixtures.js') && !rel.endsWith('.test.js'),
      'D5: a fixtures module must never be named *.test.js, or the suite glob `tests/**/*.test.js` would ' +
      'execute it directly and double-count whatever it contains: ' + rel)
  }
})
