'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { tmpdir, gitRepo, runNode } = require('./helpers')

const setup = (cfg) => {
  const d = tmpdir('doctor')
  gitRepo(d)
  fs.mkdirSync(path.join(d, '.claude'), { recursive: true })
  if (cfg) fs.writeFileSync(path.join(d, '.claude/spec.config.json'), JSON.stringify(cfg))
  return d
}

test('clean host exits 0', () => {
  const d = setup({ testCommand: 'true' })
  runNode('scripts/init.js', ['--root', d])
  const r = runNode('scripts/doctor.js', ['--root', d, '--json'])
  assert.strictEqual(r.status, 0, r.stdout)
  assert.deepStrictEqual(JSON.parse(r.stdout).findings, [])
})

test('findings: missing gitignore, 127, stale sidecar, worktree, pending question', () => {
  const d = setup({ testCommand: 'nonexistent-cmd-xyz' })
  fs.mkdirSync(path.join(d, 'specs/20260101/01-a.run'), { recursive: true })
  fs.mkdirSync(path.join(d, '.claude/worktrees/spec-x'), { recursive: true })
  fs.writeFileSync(path.join(d, '.claude/pending-question.json'), '{}')
  const r = runNode('scripts/doctor.js', ['--root', d, '--json'])
  assert.strictEqual(r.status, 1)
  const f = JSON.parse(r.stdout).findings.join('\n')
  for (const w of ['127', 'missing specs/**/*.run/', 'stale sidecar', 'leftover worktree', 'pending question']) assert.ok(f.includes(w), w)
})

test('missing or unparsable config is a finding', () => {
  assert.strictEqual(runNode('scripts/doctor.js', ['--root', setup(null)]).status, 1)
  const d = setup(null)
  fs.writeFileSync(path.join(d, '.claude/spec.config.json'), '{nope')
  assert.strictEqual(runNode('scripts/doctor.js', ['--root', d]).status, 1)
})

test('probe timeout is a finding, not healthy; probe is announced', () => {
  const d = setup({ testCommand: 'sleep 5' })
  runNode('scripts/init.js', ['--root', d])
  const r = runNode('scripts/doctor.js', ['--root', d, '--json'], { env: { SPEC_DOCTOR_PROBE_MS: '300' } })
  assert.strictEqual(r.status, 1)
  assert.ok(JSON.parse(r.stdout).findings.some((x) => /timed out/.test(x)))
  assert.match(r.stderr, /running testCommand: sleep 5/)
  assert.match(r.stderr, /finished in/)
})

test('tracked settings.local.json and uncommitted migration are findings', () => {
  const d = setup({ testCommand: 'true' })
  runNode('scripts/init.js', ['--root', d])
  fs.writeFileSync(path.join(d, '.claude/settings.local.json'), '{}')
  fs.mkdirSync(path.join(d, 'docs/archive/v7'), { recursive: true })
  fs.writeFileSync(path.join(d, 'docs/archive/v7/a.md'), 'a')
  execFileSync('git', ['-C', d, 'add', '-f', '.claude/settings.local.json'])
  const f = JSON.parse(runNode('scripts/doctor.js', ['--root', d, '--json']).stdout).findings.join('\n')
  assert.match(f, /token file is tracked — run: git rm --cached/)
  assert.match(f, /uncommitted migration/)
})

test('a run in flight is not stale: live sidecars and dirty or marked worktrees are reported as in flight; stale ones carry a remedy', () => {
  const d = setup({ testCommand: 'true' })
  fs.mkdirSync(path.join(d, 'specs/20260101/01-live.run'), { recursive: true })
  fs.writeFileSync(path.join(d, 'specs/20260101/01-live.run/state.json'), JSON.stringify({ step: 'BUILD' }))
  fs.mkdirSync(path.join(d, 'specs/20260101/02-old.run'), { recursive: true })
  fs.writeFileSync(path.join(d, 'specs/20260101/02-old.run/state.json'), JSON.stringify({ step: 'DONE', ended: true }))
  const { execFileSync } = require('child_process')
  execFileSync('git', ['-C', d, 'worktree', 'add', '-q', '-b', 'spec/03-busy', '.claude/worktrees/spec-03-busy'])
  fs.writeFileSync(path.join(d, '.claude/worktrees/spec-03-busy/wip.txt'), 'x')
  execFileSync('git', ['-C', d, 'worktree', 'add', '-q', '-b', 'spec/04-idle', '.claude/worktrees/spec-04-idle'])
  const f = JSON.parse(runNode('scripts/doctor.js', ['--root', d, '--json']).stdout).findings
  assert.ok(f.some((x) => /in flight: specs\/20260101\/01-live\.md at BUILD — \/spec:run/.test(x)), f.join('\n'))
  assert.ok(f.some((x) => /stale sidecar: specs\/20260101\/02-old\.run — rm -r/.test(x)))
  assert.ok(f.some((x) => /in flight: \.claude\/worktrees\/spec-03-busy/.test(x)), 'uncommitted work is never a leftover')
  assert.ok(f.some((x) => /leftover worktree: \.claude\/worktrees\/spec-04-idle — git worktree remove/.test(x)))
})

test('gitignore is judged by git: a broader pattern that covers the sidecars is not missing', () => {
  const d = setup({ testCommand: 'true' })
  fs.writeFileSync(path.join(d, '.gitignore'), '*.run/\n.claude/\n')
  const f = JSON.parse(runNode('scripts/doctor.js', ['--root', d, '--json']).stdout).findings
  assert.ok(!f.some((x) => /gitignore: missing/.test(x)), f.join('\n'))
})
