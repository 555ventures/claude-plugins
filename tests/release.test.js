'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { tmpdir, gitRepo, runNode } = require('./helpers')

const setup = (release) => {
  const d = tmpdir('release')
  gitRepo(d)
  fs.mkdirSync(path.join(d, '.claude'))
  fs.writeFileSync(path.join(d, '.claude/spec.config.json'), JSON.stringify({ release }))
  return d
}

test('missing config exits 2 naming the keys', () => {
  const r = runNode('scripts/release.js', ['--root', setup({ deployCommand: 'true' })])
  assert.strictEqual(r.status, 2)
  assert.match(r.stderr, /stagingUrl/)
  assert.match(r.stderr, /e2eCommand/)
})

test('deploy then e2e with STAGING_URL, then promote only on --promote', () => {
  const d = setup({ deployCommand: 'echo d >> log', stagingUrl: 'http://stage', e2eCommand: 'echo $STAGING_URL >> log', promoteCommand: 'echo promoted >> log' })
  const r = runNode('scripts/release.js', ['--root', d, 'v1'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.strictEqual(fs.readFileSync(path.join(d, 'log'), 'utf8'), 'd\nhttp://stage\n')
  assert.match(r.stdout, /promote\?/)
  const p = runNode('scripts/release.js', ['--root', d, '--promote'])
  assert.strictEqual(p.status, 0)
  assert.strictEqual(fs.readFileSync(path.join(d, 'log'), 'utf8'), 'd\nhttp://stage\npromoted\n')
})

test('failing e2e stops before promote', () => {
  const d = setup({ deployCommand: 'true', stagingUrl: 'u', e2eCommand: 'exit 3', promoteCommand: 'touch promoted' })
  const r = runNode('scripts/release.js', ['--root', d])
  assert.strictEqual(r.status, 1)
  assert.ok(!fs.existsSync(path.join(d, 'promoted')))
})
