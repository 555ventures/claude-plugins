'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { ROOT, SPEC, tmpdir, runNode } = require('./helpers')

// PRAX-20260813-04: claims-lint.js (spec/scripts/claims-lint.js:33/58) resolves its baseline via
// the relative path 'spec/doctrine/claims-baseline.json' joined against `--root`, which defaults
// to `process.cwd()` when `--root` is not passed. doctor.md check 18's only call pattern is
// `node "$(spec-paths claims-lint)" --json` — no `--root` flag — so when doctor runs the script
// from any host repo's CWD (the normal case: doctor runs IN the host, not inside this plugin's
// own checkout), the script looks for `<host-cwd>/spec/doctrine/claims-baseline.json`, which
// does not exist, and the check that is supposed to lint the plugin's own shipped doctrine
// corpus fails to run at all — silently green from doctor's perspective (the finding is folded
// into "checks reported", never surfaced as its own broken-check line). The shipped baseline
// lives at spec/doctrine/claims-baseline.json inside THIS repo (the plugin's own checkout);
// confirmed by direct execution: from a scratch CWD, `--json` exits 2 with "no baseline at
// spec/doctrine/claims-baseline.json" instead of printing the lint report.
//
// specs/20260813/03-gate-script-mechanics.md AC-20260813-03-1/-2 extend these two pins with a
// findings/exit-code PARITY assertion against an explicit `--root <repo>` run: D1's upward-walk
// + PLUGIN_HOME resolution must recover the exact same shipped-corpus scan a `--root <repo>`
// invocation gets, never a degraded or over-reporting one (the refuter-demonstrated failure mode
// is a naive PLUGIN_HOME-only anchoring flooding every host with false stale-pointer findings —
// worse than the current silent no-op).

const SCRIPT = path.join(SPEC, 'scripts', 'claims-lint.js')

test('AC-20260813-03-1 / PRAX-20260813-04a: claims-lint.js --json invoked from a foreign CWD (doctor\'s exact call pattern) resolves the shipped baseline with findings identical to an explicit --root <repo> run', () => {
  const dir = tmpdir('claims-lint-foreign-cwd')
  const r = runNode(path.relative(SPEC, SCRIPT), ['--json'], { cwd: dir })
  assert.doesNotMatch(r.stderr, /no baseline/,
    'doctor.md check 18 invokes exactly `node "$(spec-paths claims-lint)" --json` with no ' +
    '--root flag, so the script\'s CWD is whatever the doctor session is running in (a host ' +
    'repo), not this plugin\'s own checkout — --root defaults to process.cwd(), so the script ' +
    'looks for <host-cwd>/spec/doctrine/claims-baseline.json, finds nothing, and the check that ' +
    'is meant to lint the plugin\'s own doctrine corpus never runs: ' + JSON.stringify(r.stderr))
  let parsed
  assert.doesNotThrow(() => { parsed = JSON.parse(r.stdout) },
    'claims-lint --json from a foreign CWD must print the lint JSON report on stdout — instead ' +
    'it printed: ' + JSON.stringify(r.stdout) + ' / stderr: ' + JSON.stringify(r.stderr))
  assert.ok(parsed && typeof parsed.totalLines === 'number' && parsed.totalLines > 0,
    'the parsed report has no totalLines — the shipped corpus (spec/commands, spec/doctrine, ' +
    'spec/agents) was never actually scanned: ' + JSON.stringify(parsed))

  const rootRun = runNode(path.relative(SPEC, SCRIPT), ['--root', ROOT, '--json'])
  assert.strictEqual(rootRun.status, 0,
    'the explicit --root <repo> run is the parity baseline for AC-20260813-03-1 and must itself ' +
    'succeed cleanly against the live corpus, or it cannot be compared against: ' + rootRun.stderr)
  const rootParsed = JSON.parse(rootRun.stdout)
  assert.deepStrictEqual(parsed.findings, rootParsed.findings,
    'AC-20260813-03-1: a no-root run from a foreign CWD must report the SAME findings list as ' +
    'an explicit --root <repo> run against the identical shipped corpus — any divergence (e.g. ' +
    'spurious stale-pointer findings from a PLUGIN_HOME-only resolvePath anchoring that cannot ' +
    'see this repo\'s enforcedBy: pointer conventions) is the refuter-demonstrated false-flood ' +
    'regression: ' + JSON.stringify(parsed.findings) + ' vs --root run\'s ' + JSON.stringify(rootParsed.findings))
})

test('AC-20260813-03-2 / PRAX-20260813-04b: claims-lint.js --check invoked from a foreign CWD resolves the shipped baseline and exits identically to an explicit --root <repo> run', () => {
  const dir = tmpdir('claims-lint-foreign-cwd')
  const r = runNode(path.relative(SPEC, SCRIPT), ['--check'], { cwd: dir })
  assert.doesNotMatch(r.stderr, /no baseline/,
    '--check from a foreign CWD (the same no-root invocation shape doctor uses) must resolve ' +
    'the shipped baseline instead of erroring "no baseline at spec/doctrine/claims-baseline.json" ' +
    'and exiting 2 before ever linting a single file: ' + JSON.stringify(r.stderr))
  assert.notStrictEqual(r.status, 2,
    '--check from a foreign CWD must not exit 2 (usage/precondition failure) — exit 2 here ' +
    'means the corpus/baseline could not be read at all, i.e. the check silently never ran: ' +
    JSON.stringify(r.stdout) + ' / ' + JSON.stringify(r.stderr))
  assert.ok(r.status === 0 || r.status === 1,
    'AC-20260813-03-2: a no-root --check run must land in the {0,1} pass/fail alphabet, never a ' +
    'usage/precondition exit — got ' + r.status + ': ' + JSON.stringify(r.stdout) + ' / ' + JSON.stringify(r.stderr))

  const rootRun = runNode(path.relative(SPEC, SCRIPT), ['--root', ROOT, '--check'])
  assert.strictEqual(r.status, rootRun.status,
    'AC-20260813-03-2: --check from a foreign CWD must exit with the SAME code as an explicit ' +
    '--root <repo> run against the identical shipped corpus — got ' + r.status +
    ' from the no-root run vs ' + rootRun.status + ' from --root ' + ROOT + ': ' +
    JSON.stringify(rootRun.stdout) + ' / ' + JSON.stringify(rootRun.stderr))
})

// D1 mode 3 — PLUGIN_HOME mode. Every test above runs the REAL claims-lint.js at
// spec/scripts/claims-lint.js, whose upward walk (mode 2) always succeeds in this checkout — an
// ancestor of spec/scripts/ genuinely contains spec/doctrine/claims-baseline.json (this repo IS
// the dev/marketplace layout), so mode 3 (the installed-plugin layout, where the walk finds
// nothing and PLUGIN_HOME = path.resolve(__dirname, '..') takes over) is never actually
// exercised by them. This test builds a synthetic <tmp>/plug/scripts/claims-lint.js — a copy of
// the real script placed under a tmpdir far from any spec/doctrine/claims-baseline.json within
// 3 upward levels — so the walk fails and PLUGIN_HOME mode runs for real.
const SCRIPT_SRC = fs.readFileSync(SCRIPT, 'utf8')

function pluginHomeFixture() {
  // tmpdir() mints a fresh directory under the OS temp root on every call — no ancestor of
  // <tmp>/plug/scripts up to 3 levels (<tmp>/plug/scripts, <tmp>/plug, <tmp>, the OS temp root)
  // ships a spec/doctrine/claims-baseline.json, so findUpwardRoot() is guaranteed to fail and
  // fall through to PLUGIN_HOME mode.
  const tmp = tmpdir('claims-lint-plugin-home')
  const plug = path.join(tmp, 'plug')
  fs.mkdirSync(path.join(plug, 'scripts'), { recursive: true })
  fs.mkdirSync(path.join(plug, 'commands'), { recursive: true })
  fs.mkdirSync(path.join(plug, 'doctrine'), { recursive: true })
  fs.writeFileSync(path.join(plug, 'scripts', 'claims-lint.js'), SCRIPT_SRC)
  // A dummy shipped file the enforcedBy: marker below can resolve against (PLUGIN_HOME mode
  // resolves a target with a leading 'spec/' stripped, directly under PLUGIN_HOME).
  fs.writeFileSync(path.join(plug, 'scripts', 'foo-enforcer.js'), '// dummy enforcer\n')

  // Two **hard** claims: one enforcedBy: a shipped file (must resolve 'found'), one
  // enforcedBy: an unshipped tree (no 'tests/' dir under PLUGIN_HOME — must resolve 'skipped',
  // landing in skippedPointers, NEVER a stale-pointer finding).
  const fooMd =
    '# Foo\n\nX is a **hard** requirement.\n<!-- enforcedBy: scripts/foo-enforcer.js -->\n' +
    'Y is a **hard** requirement too.\n<!-- enforcedBy: tests/foo.test.js -->\n'
  fs.writeFileSync(path.join(plug, 'commands', 'foo.md'), fooMd)
  const lines = fooMd.endsWith('\n') ? fooMd.split('\n').length - 1 : fooMd.split('\n').length

  const baseline = { files: { 'spec/commands/foo.md': { lines, orphans: 0 } }, totalLines: lines }
  fs.writeFileSync(path.join(plug, 'doctrine', 'claims-baseline.json'), JSON.stringify(baseline))

  return { plug, script: path.join(plug, 'scripts', 'claims-lint.js') }
}

test('AC-20260813-03-1: claims-lint.js --json invoked with no --root, from a copy placed where the upward walk finds no ancestor spec/doctrine/claims-baseline.json, runs D1 mode 3 (PLUGIN_HOME) and scans the plugin\'s own shipped corpus under canonical spec/<subdir>/<file> report keys', () => {
  const { script } = pluginHomeFixture()
  const r = spawnSync(process.execPath, [script, '--json'], { encoding: 'utf8' })
  assert.strictEqual(r.status, 0,
    'PLUGIN_HOME mode must scan the fixture corpus and report cleanly (baseline matches, one ' +
    'enforcedBy target resolves, the other is skipped-not-stale) — instead it exited ' +
    r.status + ': ' + JSON.stringify(r.stdout) + ' / ' + JSON.stringify(r.stderr))
  let parsed
  assert.doesNotThrow(() => { parsed = JSON.parse(r.stdout) },
    'PLUGIN_HOME mode --json must print one parseable JSON report — instead got stdout ' +
    JSON.stringify(r.stdout) + ' / stderr ' + JSON.stringify(r.stderr))
  assert.ok(parsed.files && Object.prototype.hasOwnProperty.call(parsed.files, 'spec/commands/foo.md'),
    'D1 mode 3 must keep report keys canonical (\'spec/<subdir>/<file>\') even though the fixture ' +
    'corpus physically lives at <PLUGIN_HOME>/commands/foo.md with no spec/ prefix on disk — a ' +
    'consumer keying off spec/commands/foo.md would see nothing: ' + JSON.stringify(Object.keys(parsed.files || {})))

  assert.ok(Array.isArray(parsed.skippedPointers),
    'D1 mode 3 must carry a skippedPointers JSON key once any enforcedBy: target is undecidable ' +
    '(an unshipped tree like tests/… has no directory under PLUGIN_HOME) — instead the key is ' +
    'missing entirely: ' + JSON.stringify(parsed))
  const skipped = parsed.skippedPointers.find(s => s.target === 'tests/foo.test.js')
  assert.ok(skipped,
    'the enforcedBy: tests/foo.test.js marker targets a tree not shipped under PLUGIN_HOME (no ' +
    '<PLUGIN_HOME>/tests directory in an installed-plugin layout) — this is undecidable, not ' +
    'stale, and must land in skippedPointers: ' + JSON.stringify(parsed.skippedPointers))
  const staleForSkipped = (parsed.findings || []).find(f => f.kind === 'stale-pointer' && /foo\.test\.js/.test(f.detail))
  assert.ok(!staleForSkipped,
    'an undecidable PLUGIN_HOME-mode target (tests/foo.test.js, no shipped tree to check against) ' +
    'must NEVER be reported as a stale-pointer finding — undecidable is not the same as stale, ' +
    'and reporting it as stale is exactly the false-flood regression D1 exists to prevent: ' +
    JSON.stringify(parsed.findings))

  const staleForShipped = (parsed.findings || []).find(f => f.kind === 'stale-pointer' && /foo-enforcer\.js/.test(f.detail))
  assert.ok(!staleForShipped,
    'the enforcedBy: scripts/foo-enforcer.js marker targets a file that DOES exist under ' +
    'PLUGIN_HOME (<PLUGIN_HOME>/scripts/foo-enforcer.js) — it must resolve \'found\' and never ' +
    'appear as a stale-pointer finding: ' + JSON.stringify(parsed.findings))
})
