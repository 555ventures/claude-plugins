'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20261102/01-the-host-names-its-runner-grammar.md D2 — red-check substitutes {file} in testCommand.

test('AC-20261102-01-3: red-check runs a {file} testCommand with the path substituted and classifies the file from that exit code', () => {
  const dir = tmpdir('rc-file-ph')
  const g = gitRepo(dir)
  const argvLog = path.join(tmpdir('rc-file-ph-log'), 'argv.txt')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'runner.sh'),
    '#!/usr/bin/env bash\n' +
    `echo "$*" >> ${JSON.stringify(argvLog)}\n` +
    '[ "$#" -eq 3 ] && [ "$1" = "--file" ] && [ "$3" = "--end" ] && exit 0\nexit 3\n')
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'),
    JSON.stringify({ testCommand: 'bash ./runner.sh --file {file} --end' }))
  g('add', '-A'); g('commit', '-q', '-m', 'runner')
  const base = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/x.test.js'), "test('AC-20261102-91-1: placeholder pin', () => {})\n")
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, '# Spec\n\n## Acceptance Criteria\n\n' +
    '- **AC-20261102-91-1**: WHEN x THE SYSTEM SHALL CONTINUE TO y → tests/x.test.js\n\n' +
    '## File Plan\n\n| Path | Action | Layer | Summary |\n|------|--------|-------|---------|\n' +
    '| tests/x.test.js | CREATE | tests | pin |\n')
  const r = runNode('scripts/red-check.js', ['--spec', spec, '--root', dir, '--base', base, '--json'])
  const argv = fs.existsSync(argvLog) ? fs.readFileSync(argvLog, 'utf8') : ''
  assert.match(argv, /^--file tests\/x\.test\.js --end$/m,
    'the runner must see the path where {file} stood, or a host whose runner takes its file mid-command cannot be red-checked: ' + argv)
  assert.strictEqual(r.status, 0,
    'the runner exits 0 on the substituted form, so the sanctioned-green file must match its expectation, not read broken-pin: ' + r.stdout + r.stderr)
})
