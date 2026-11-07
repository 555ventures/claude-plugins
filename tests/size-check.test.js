'use strict'
// The size gate: caps, pins that only go down, and tests that never read prose.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { tmpdir, gitRepo } = require('./helpers')

const CHECK = path.join(__dirname, 'size-check.js')
const write = (d, rel, text) => { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), text) }
const size = (d, pinned = {}, prose = {}) => write(d, 'tests/size.json', JSON.stringify({ caps: { 'spec/scripts/*.js': 3 }, totals: { 'spec/scripts/': 100 }, pinned, prose }))
const run = (d) => { try { return { status: 0, out: execFileSync('node', [CHECK, d], { encoding: 'utf8', stdio: 'pipe' }) } } catch (e) { return { status: e.status, out: e.stderr } } }

test('a file over its cap is red until pinned; a pin only goes down and is deleted under cap', () => {
  const d = tmpdir('size'); const g = gitRepo(d)
  write(d, 'spec/scripts/a.js', 'x\n'.repeat(5))
  size(d)
  assert.match(run(d).out, /spec\/scripts\/a\.js 5 > cap 3/)
  size(d, { 'spec/scripts/a.js': 5 })
  assert.strictEqual(run(d).status, 0)
  g('add', '-A'); g('commit', '-qm', 'pin')
  size(d, { 'spec/scripts/a.js': 6 })
  assert.match(run(d).out, /raised 5 → 6/)
  write(d, 'spec/scripts/a.js', 'x\n'.repeat(4)); size(d, { 'spec/scripts/a.js': 5 })
  assert.match(run(d).out, /lower the pin to 4/)
  write(d, 'spec/scripts/a.js', 'x\n')
  assert.match(run(d).out, /within cap 3 — delete its pinned pin/)
})

test('a test that reads command, agent, doctrine or design prose is red beyond its pin', () => {
  const d = tmpdir('size')
  size(d)
  write(d, 'tests/a.test.js', "read('spec/comm" + "ands/run.md')\n")
  assert.match(run(d).out, /tests\/a\.test\.js 1 > cap 0 prose references/)
  write(d, 'tests/a.test.js', "run('scripts/run.js')\n")
  assert.strictEqual(run(d).status, 0)
})
