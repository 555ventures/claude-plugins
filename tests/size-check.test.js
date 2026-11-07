'use strict'
// The size gate: a file over its cap may not grow past its merge-base size; tests never read more prose.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { tmpdir, gitRepo } = require('./helpers')

const CHECK = path.join(__dirname, 'size-check.js')
const write = (d, rel, text) => { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), text) }
const run = (d) => { try { return { status: 0, out: execFileSync('node', [CHECK, d], { encoding: 'utf8', stdio: 'pipe' }) } } catch (e) { return { status: e.status, out: e.stderr } } }
const host = () => {
  const d = tmpdir('size'); const g = gitRepo(d)
  write(d, 'tests/size.json', JSON.stringify({ caps: { 'spec/scripts/*.js': 3, 'tests/*.test.js': 500 }, totals: { 'spec/scripts/': 100 } }))
  return { d, g }
}

test('an over-cap file may hold at its merge-base size, never grow; a new one must be under cap', () => {
  const { d, g } = host()
  write(d, 'spec/scripts/a.js', 'é\n'.repeat(5))
  assert.match(run(d).out, /spec\/scripts\/a\.js 5 > cap 3 — cut it under the cap/)
  g('add', '-A'); g('commit', '-qm', 'over cap at base')
  assert.strictEqual(run(d).status, 0)
  write(d, 'spec/scripts/a.js', 'é\n'.repeat(6))
  assert.match(run(d).out, /a\.js 6 > 5 at the merge-base \(cap 3\)/)
})

test('a test that reads command, agent, doctrine or design prose is red unless its base read as much', () => {
  const { d, g } = host()
  write(d, 'tests/a.test.js', "read('spec/comm" + "ands/run.md')\n")
  assert.match(run(d).out, /tests\/a\.test\.js 1 prose references > cap 0/)
  g('add', '-A'); g('commit', '-qm', 'base reads prose')
  assert.strictEqual(run(d).status, 0)
  write(d, 'tests/a.test.js', "read('spec/comm" + "ands/run.md'); read('spec/doc" + "trine.md')\n")
  assert.match(run(d).out, /2 prose references > 1 at the merge-base/)
})
