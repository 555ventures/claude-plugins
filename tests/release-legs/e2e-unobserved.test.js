'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')
const {
  writeConfig, writeReleaseManifest, readRows, rowFor, writeExecutable, setupWorkingHost,
} = require('./release-legs.fixtures')

// specs/20260908/05-release-e2e-unobserved-count.md: the e2e leg's green/red today comes only
// from the child's exit code — an observed zero or a declared testCountPattern that never
// matches is recorded but never forces a red row, so a runner that "passes" having run nothing
// silently promotes a release. D3 adds an `executed` key on every e2e row and forces `exit` to 1
// on an unobserved run (child exit 0, isUnobserved(executed)); D5 does the analogous thing for
// the journeys leg on `--walked 0`; D6 leaves substrate alone (audited, see AC-20260908-05-10).
// Split from release-legs.test.js by D8 so neither file exceeds the per-file test budget
// (specs/20260903/07) — see release-legs.fixtures.js for the shared host builders.
// Pins AC-20260908-05-1, -2, -4, -5, -7, -8, -10.

const SCRIPT = 'scripts/release-legs.js'

test('AC-20260908-05-1: stage forces the e2e row red and GATE_RED when a declared testCountPattern observes 0 executed tests on an exit-0 e2eCommand, with no declared skip format', async () => {
  const host = await setupWorkingHost('rl-unobs1')
  try {
    const e2eScript = path.join(host.dir, 'e2e-zero.sh')
    writeExecutable(e2eScript, '#!/usr/bin/env bash\necho "executed 0 tests"\nexit 0\n')
    writeConfig(host.dir, {
      release: { deployCommand: 'true', stagingUrl: host.stagingUrl, e2eCommand: e2eScript },
      capabilities: { forge: 'none', testCountPattern: 'executed (\\d+) tests' },
    })
    const runManifest = path.join(host.dir, 'run-manifest.jsonl')
    const r = runNode(SCRIPT, ['stage', '--root', host.dir, '--manifest', runManifest, '--out-dir', path.join(host.dir, 'out')])
    const rows = readRows(runManifest)
    assert.deepStrictEqual(rowFor(rows, 'e2e'),
      { leg: 'e2e', exit: 1, observed: { passed: { unavailable: 'no-format-declared' }, failed: 0, skipped: { unavailable: 'no-format-declared' }, executed: 0 } },
      'D3: an observed executed:0 on an exit-0 e2eCommand must force the row\'s exit to 1 — the ' +
      'child\'s own 0 exit means the runner claimed success while its declared count format ' +
      'observed zero tests, the unsupported "the suite ran" promise this spec exists to catch: ' +
      JSON.stringify(rowFor(rows, 'e2e')))
    assert.match(r.stdout, /RED_BLOCKING:.*e2e/,
      'the forced-red e2e leg must appear in the RED_BLOCKING summary line — without it a session ' +
      'reading stdout alone would not see the promotion-blocking condition: ' + r.stdout)
    assert.strictEqual(r.status, 1,
      'stage must exit 1 when the e2e leg is forced red: ' + r.stdout + ' / ' + r.stderr)

    const rJourneys = runNode(SCRIPT, ['append', '--manifest', runManifest, '--leg', 'journeys', '--walked', '1', '--failed', '0'])
    assert.strictEqual(rJourneys.status, 0, 'setup: a green journeys append must succeed: ' + rJourneys.stderr)
    const rProduction = runNode(SCRIPT, ['append', '--manifest', runManifest, '--leg', 'production', '--result', 'skipped'])
    assert.strictEqual(rProduction.status, 0, 'setup: a skipped production append must succeed: ' + rProduction.stderr)

    const verdictPath = path.join('scripts', 'verdict.js')
    const rVerdict = runNode(verdictPath, ['--manifest', runManifest, '--profile', 'release'])
    assert.strictEqual(rVerdict.stdout.split('\n')[0], 'GATE_RED',
      'D7: a release manifest carrying the forced-red e2e row, with every other leg green, must ' +
      'derive GATE_RED through verdict.js — e2e is already blocking on the release profile, so ' +
      'the forced row alone must be sufficient: ' + rVerdict.stdout + ' / ' + rVerdict.stderr)
  } finally {
    host.kill()
  }
})

test('AC-20260908-05-2: stage forces the e2e row red when the declared testCountPattern never matches the runner\'s refusal output', async () => {
  const host = await setupWorkingHost('rl-unobs2')
  try {
    const e2eScript = path.join(host.dir, 'e2e-refuse.sh')
    writeExecutable(e2eScript, '#!/usr/bin/env bash\necho "runner refused: no tests found"\nexit 0\n')
    writeConfig(host.dir, {
      release: { deployCommand: 'true', stagingUrl: host.stagingUrl, e2eCommand: e2eScript },
      capabilities: { forge: 'none', testCountPattern: 'executed (\\d+) tests' },
    })
    const runManifest = path.join(host.dir, 'run-manifest.jsonl')
    const r = runNode(SCRIPT, ['stage', '--root', host.dir, '--manifest', runManifest, '--out-dir', path.join(host.dir, 'out')])
    const rows = readRows(runManifest)
    assert.deepStrictEqual(rowFor(rows, 'e2e'),
      { leg: 'e2e', exit: 1, observed: { passed: { unavailable: 'pattern-no-match' }, failed: 0, skipped: { unavailable: 'no-format-declared' }, executed: { unavailable: 'pattern-no-match' } } },
      'a declared testCountPattern that never matches the exit-0 runner\'s output is the second ' +
      'unsupported promise isUnobserved catches — the row must force exit 1 and carry the typed ' +
      'pattern-no-match unavailability on both passed and executed: ' + JSON.stringify(rowFor(rows, 'e2e')))
    assert.strictEqual(r.status, 1, 'stage must exit 1 on the forced-red e2e leg: ' + r.stdout + ' / ' + r.stderr)
  } finally {
    host.kill()
  }
})

test('AC-20260908-05-4: the e2e row carries executed:{"unavailable":"no-format-declared"} on every run, never omitted, when no testCountPattern is declared', async () => {
  const host = await setupWorkingHost('rl-unobs4')
  try {
    const runManifest = path.join(host.dir, 'run-manifest.jsonl')
    const r = runNode(SCRIPT, ['stage', '--root', host.dir, '--manifest', runManifest, '--out-dir', path.join(host.dir, 'out')])
    const rows = readRows(runManifest)
    const e2eRow = rowFor(rows, 'e2e')
    assert.ok(e2eRow, 'the e2e leg must still have run and appended a row: ' + JSON.stringify(rows))
    assert.ok(Object.prototype.hasOwnProperty.call(e2eRow.observed, 'executed'),
      'D3: the executed key must be present on every e2e row, never omitted, even when no ' +
      'testCountPattern is declared: ' + JSON.stringify(e2eRow.observed))
    assert.deepStrictEqual(e2eRow.observed.executed, { unavailable: 'no-format-declared' },
      'with no declared testCountPattern, executed must be the typed no-format-declared ' +
      'unavailability, matching passed\'s own reason on this same undeclared-format host: ' +
      JSON.stringify(e2eRow.observed))
    assert.strictEqual(r.status, 0,
      'D4: no-format-declared never forces — a host that declared no count format made no ' +
      'promise this run could contradict, so stage must still exit 0: ' + r.stdout + ' / ' + r.stderr)
  } finally {
    host.kill()
  }
})

test('AC-20260908-05-5: the e2e row\'s executed count is the LAST regex match, never a decoy line quoting the summary phrase that precedes the real one', async () => {
  const host = await setupWorkingHost('rl-unobs5')
  try {
    const e2eScript = path.join(host.dir, 'e2e-decoy.sh')
    writeExecutable(e2eScript,
      '#!/usr/bin/env bash\n' +
      'echo \'✔ pins "executed 0 tests"\'\n' +
      'echo "executed 5 tests"\n' +
      'exit 0\n')
    writeConfig(host.dir, {
      release: { deployCommand: 'true', stagingUrl: host.stagingUrl, e2eCommand: e2eScript },
      capabilities: { forge: 'none', testCountPattern: 'executed (\\d+) tests' },
    })
    const runManifest = path.join(host.dir, 'run-manifest.jsonl')
    const r = runNode(SCRIPT, ['stage', '--root', host.dir, '--manifest', runManifest, '--out-dir', path.join(host.dir, 'out')])
    const rows = readRows(runManifest)
    const e2eRow = rowFor(rows, 'e2e')
    assert.strictEqual(e2eRow.exit, 0,
      'D2: the last-match read (5) is a real nonzero observation — it must never force the row ' +
      'red: ' + JSON.stringify(e2eRow))
    assert.strictEqual(e2eRow.observed.executed, 5,
      'D2 (A1\'s measured drift): a test-name line quoting "executed 0 tests" precedes the real ' +
      'summary line "executed 5 tests" — computeTestsExecuted must read the LAST match (5), never ' +
      'the first (0), or a decoy quote would falsely force this run red: ' + JSON.stringify(e2eRow.observed))
    assert.strictEqual(r.status, 0, 'a correctly-read nonzero executed count must leave stage green: ' + r.stdout + ' / ' + r.stderr)
  } finally {
    host.kill()
  }
})

test('AC-20260908-05-7: a red e2e child exit is recorded as-is, with executed still observed from its output, never overwritten to the forced value', async () => {
  const host = await setupWorkingHost('rl-unobs7')
  try {
    const e2eScript = path.join(host.dir, 'e2e-red.sh')
    writeExecutable(e2eScript, '#!/usr/bin/env bash\necho "executed 4 tests"\nexit 3\n')
    writeConfig(host.dir, {
      release: { deployCommand: 'true', stagingUrl: host.stagingUrl, e2eCommand: e2eScript },
      capabilities: { forge: 'none', testCountPattern: 'executed (\\d+) tests' },
    })
    const runManifest = path.join(host.dir, 'run-manifest.jsonl')
    const r = runNode(SCRIPT, ['stage', '--root', host.dir, '--manifest', runManifest, '--out-dir', path.join(host.dir, 'out')])
    const rows = readRows(runManifest)
    assert.deepStrictEqual(rowFor(rows, 'e2e'),
      { leg: 'e2e', exit: 3, observed: { passed: { unavailable: 'no-format-declared' }, failed: { unavailable: 'no-format-declared' }, skipped: { unavailable: 'no-format-declared' }, executed: 4 } },
      'D3: a nonzero child exit is recorded as-is (3, never forced to 1) and executed is still ' +
      'observed from the retained output (4) even though the run is already red on its own exit ' +
      'code: ' + JSON.stringify(rowFor(rows, 'e2e')))
    assert.strictEqual(r.status, 1, 'a red e2e child exit must make stage exit 1: ' + r.stdout + ' / ' + r.stderr)
  } finally {
    host.kill()
  }
})

test('AC-20260908-05-8: append --leg journeys --walked 0 --failed 0 forces exit 1, stays a well-formed append (never an exit-2 refusal), and drives GATE_RED through verdict.js', () => {
  const dir = fs.realpathSync(tmpdir('rl-unobs8'))
  const manifest = path.join(dir, 'm.jsonl')
  const r = runNode(SCRIPT, ['append', '--manifest', manifest, '--leg', 'journeys', '--walked', '0', '--failed', '0'])
  assert.strictEqual(r.status, 1,
    'D5: a zero-journey walk contradicts release.md\'s standing requirement that every release ' +
    'walks at least one journey — append must force exit 1, never the well-formed exit-0 path a ' +
    'zero failed count would otherwise take: ' + r.stdout + ' / ' + r.stderr)
  assert.notStrictEqual(r.status, 2,
    '--walked 0 --failed 0 must stay well-formed input (both are valid non-negative integers) — ' +
    'it must never be refused at exit 2 as malformed: ' + r.stdout + ' / ' + r.stderr)
  const rows = readRows(manifest)
  assert.deepStrictEqual(rows, [{ leg: 'journeys', exit: 1, observed: { walked: 0, failed: 0 } }],
    'D5: the append still lands, and the observed row is unchanged in shape — only exit is forced: ' +
    JSON.stringify(rows))

  const releaseManifest = path.join(dir, 'release.jsonl')
  const otherRows = [
    { leg: 'substrate', exit: 0, observed: { checked: 1, failed: 0, inert: 0 } },
    { leg: 'ci', exit: 0, observed: { unavailable: 'no-adapter' } },
    { leg: 'deploy', exit: 0, observed: { result: 'pass' } },
    { leg: 'ready', exit: 0, observed: { result: 'pass' } },
    { leg: 'e2e', exit: 0, observed: { passed: 1, failed: 0, skipped: 0, executed: 1 } },
    { leg: 'production', exit: 0, observed: { result: 'verified' } },
    { leg: 'journeys', exit: 1, observed: { walked: 0, failed: 0 } },
  ]
  fs.writeFileSync(releaseManifest, otherRows.map(row => JSON.stringify(row)).join('\n') + '\n')
  const rVerdict = runNode(path.join('scripts', 'verdict.js'), ['--manifest', releaseManifest, '--profile', 'release'])
  assert.strictEqual(rVerdict.stdout.split('\n')[0], 'GATE_RED',
    'D7: journeys is already blocking on the release profile — a manifest carrying the forced ' +
    'walked:0 row with every other leg green must derive GATE_RED: ' + rVerdict.stdout + ' / ' + rVerdict.stderr)
})

test('AC-20260908-05-10: stage appends a green substrate row for an all-inert manifest and continues to refuse at exit 2 with zero rows for an empty checks array', async () => {
  // (a) an all-inert manifest stays green — inert is a declared host state, never an unobserved
  // one (D6).
  const host = await setupWorkingHost('rl-unobs10a', { checks: [{ claim: 'nothing verifiable from here', kind: 'inert', target: 'declared: nothing to verify from here' }] })
  try {
    const runManifest = path.join(host.dir, 'run-manifest.jsonl')
    runNode(SCRIPT, ['stage', '--root', host.dir, '--manifest', runManifest, '--out-dir', path.join(host.dir, 'out')])
    const rows = readRows(runManifest)
    assert.deepStrictEqual(rowFor(rows, 'substrate'), { leg: 'substrate', exit: 0, observed: { checked: 1, failed: 0, inert: 1 } },
      'D6: an all-inert manifest (one declared-inert row) must stay a green substrate row — ' +
      'reddening declared inertness would break every host whose production checks cannot run ' +
      'from the release machine: ' + JSON.stringify(rowFor(rows, 'substrate')))
  } finally {
    host.kill()
  }

  // (b) {"checks":[]} is refused upstream by manifest-check.sh — no row, exit 2 (D6, A4).
  const dirB = fs.realpathSync(tmpdir('rl-unobs10b'))
  gitRepo(dirB)
  writeConfig(dirB, {
    release: { deployCommand: 'true', stagingUrl: 'http://127.0.0.1:1', e2eCommand: 'true' },
    capabilities: { forge: 'none' },
  })
  writeReleaseManifest(dirB, [])
  const runManifestB = path.join(dirB, 'run-manifest.jsonl')
  const rB = runNode(SCRIPT, ['stage', '--root', dirB, '--manifest', runManifestB, '--out-dir', path.join(dirB, 'out')])
  assert.strictEqual(rB.status, 2,
    'D6: a zero-check manifest is refused upstream by manifest-check.sh before any row can be ' +
    'appended — stage must exit 2, never fabricate or skip a substrate row for a manifest that ' +
    'cannot be checked at all: ' + rB.stdout + ' / ' + rB.stderr)
  assert.deepStrictEqual(readRows(runManifestB), [],
    'D6: the refusal must append zero rows: ' + JSON.stringify(readRows(runManifestB)))
})
