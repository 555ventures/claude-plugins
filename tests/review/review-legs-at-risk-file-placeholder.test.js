'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')
const { reviewLegsSpecBody } = require('./review-legs.fixtures')

// specs/20261102/01-the-host-names-its-runner-grammar.md D2 — the at-risk leg substitutes {file} in testCommand.

const AT_RISK = "'use strict'\nconst foo = require('../src/foo.js')\nmodule.exports = typeof foo\n"
const GREEN = "'use strict'\nconst { test } = require('node:test')\nconst foo = require('../src/foo.js')\n" +
  "test('AC-20260820-99-1: foo() returns 42', () => { require('node:assert').strictEqual(foo(), 42) })\n"

test('AC-20261102-01-4: the at-risk leg substitutes both at-risk files at the {file} placeholder and writes that exact line as the at-risk.txt $ header', () => {
  const dir = tmpdir('rl-ph')
  const g = gitRepo(dir)
  const argvLog = path.join(tmpdir('rl-ph-log'), 'argv.txt')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'bin/runner.sh'), '#!/usr/bin/env bash\n' +
    `[ "$#" -gt 0 ] && echo "$*" >> ${JSON.stringify(argvLog)}\n` +
    '[ "$#" -eq 4 ] && [ "$1" = "--file" ] && [ "$4" = "--end" ] && exit 0\n[ "$#" -eq 0 ] && exit 0\nexit 3\n')
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: 'bash ./bin/runner.sh --file {file} --end',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'ℹ skipped (\\d+)' },
  }))
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 41\n')
  fs.writeFileSync(path.join(dir, 'tests/atrisk-a.test.js'), AT_RISK)
  fs.writeFileSync(path.join(dir, 'tests/atrisk-b.test.js'), AT_RISK)
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(dir, 'specs/20260820'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260820/99-test.md'),
    reviewLegsSpecBody({ title: 'At-risk placeholder fixture', acId: 'AC-20260820-99-1' }))
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), GREEN)
  g('add', '-A'); g('commit', '-q', '-m', 'implement')

  const manifest = path.join(tmpdir('rl-ph-out'), 'manifest.jsonl')
  const outDir = tmpdir('rl-ph-outdir')
  const r = runNode('scripts/review-legs.js', ['--root', dir, '--spec', 'specs/20260820/99-test.md',
    '--base', base, '--manifest', manifest, '--out-dir', outDir])
  const argv = fs.existsSync(argvLog) ? fs.readFileSync(argvLog, 'utf8').split('\n').filter(Boolean) : []
  assert.deepStrictEqual([...argv].sort().map(l => l.replace(/ tests\/atrisk-[ab]\.test\.js/g, ' F')),
    ['--file F F --end'],
    'the runner must receive both at-risk paths between --file and --end, or a placeholder host never runs its at-risk tests: ' +
    JSON.stringify(argv) + ' ' + r.stdout + r.stderr)
  const txt = fs.existsSync(path.join(outDir, 'at-risk.txt')) ? fs.readFileSync(path.join(outDir, 'at-risk.txt'), 'utf8') : ''
  assert.match(txt, /^\$ bash \.\/bin\/runner\.sh --file tests\/atrisk-[ab]\.test\.js tests\/atrisk-[ab]\.test\.js --end$/m,
    'at-risk.txt must record the substituted command as its $ header, or the reviewer cannot tell what ran: ' + txt)
})
