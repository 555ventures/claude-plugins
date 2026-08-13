'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
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
