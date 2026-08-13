'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { SPEC, tmpdir, runNode } = require('./helpers')

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

const SCRIPT = path.join(SPEC, 'scripts', 'claims-lint.js')

test('PRAX-20260813-04a: claims-lint.js --json invoked from a foreign CWD (doctor\'s exact call pattern) still resolves the shipped baseline', () => {
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
})

test('PRAX-20260813-04b: claims-lint.js --check invoked from a foreign CWD also resolves the shipped baseline rather than failing/no-op', () => {
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
})
