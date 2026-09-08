'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// A red run that pins a CPU until the host watchdog kills it would classify as a plain
// "observed: red" — indistinguishable from an honest failing assertion, so the incident class
// could never be counted. Exit 124 is named.
test('red-check: WHEN the testCommand exits 124 for a red-expected file THE SYSTEM SHALL still classify it red (no finding) AND emit a WARN watchdog-trip line naming the file', () => {
  const dir = tmpdir('rc-watchdog')
  const g = gitRepo(dir)
  const base = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({ testCommand: "sh -c 'exit 124' --" }))
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/a.test.js'), '// AC-20260905-07-3\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, '# S\n\n## Acceptance Criteria\n\n- **AC-20260905-07-3**: something.\n\n## File Plan\n\n| Path | Action | Layer | Summary |\n|---|---|---|---|\n| tests/a.test.js | CREATE | tests | t |\n')
  const r = runNode('scripts/red-check.js', ['--spec', spec, '--root', dir, '--base', base])
  assert.strictEqual(r.status, 0, 'a red-expected file observed red is not a finding: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /^WARN\s+watchdog-trip tests\/a\.test\.js \(exit 124\)/m, r.stdout)
  const j = JSON.parse(runNode('scripts/red-check.js', ['--spec', spec, '--root', dir, '--base', base, '--json']).stdout)
  assert.strictEqual(j.files[0].observed, 'red')
  assert.ok(j.warnings.some((w) => w.startsWith('watchdog-trip tests/a.test.js')))
})
