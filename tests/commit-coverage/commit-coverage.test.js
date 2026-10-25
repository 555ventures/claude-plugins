'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20261025/02-readers-keep-only-the-surviving-escape-fields.md D5: commit-coverage keeps
// commit mode only; the window (--since) and fleet (--repos-root) shares are retired.

const SCRIPT = 'scripts/commit-coverage.js'

function fixtureRepo() {
  const dir = tmpdir('commit-coverage')
  const git = gitRepo(dir)
  fs.mkdirSync(path.join(dir, 'specs'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/a.md'),
    '---\ndate: 2026-08-01\n---\n\n# spec\n\n## File Plan\n\n| Path | Action | Layer | Summary |\n|---|---|---|---|\n| src/x.js | MODIFY | src | . |\n')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec-runs.jsonl'),
    JSON.stringify({ ts: '2020-01-01T00:00:00Z', stage: 'review', spec: 'specs/a.md', verdict: 'CLEAN', runId: 'wf_cc1' }) + '\n')
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src/x.js'), 'module.exports = 1\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'fix(x): repair the thing')
  return dir
}


test('AC-20261025-02-14: --commit HEAD --json still reports mode commit, the landed review run and ts, and the offer boolean', () => {
  const dir = fixtureRepo()
  const r = runNode(SCRIPT, ['--commit', 'HEAD', '--root', dir, '--json'])
  assert.strictEqual(r.status, 0, 'commit mode is the one derivation /git:commit uses as its offer oracle — a non-zero exit breaks every fix commit: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.mode, 'commit', 'the mode field identifies the surviving derivation: ' + r.stdout)
  assert.strictEqual(out.landed.length, 1, 'the File-Plan-listed file touched after a review row must land: ' + r.stdout)
  assert.strictEqual(out.landed[0].specs[0].reviewRunId, 'wf_cc1', 'the landed entry must carry the review run id: ' + r.stdout)
  assert.strictEqual(out.landed[0].specs[0].reviewTs, '2020-01-01T00:00:00Z', 'the landed entry must carry the review ts: ' + r.stdout)
  assert.strictEqual(typeof out.offer, 'boolean', 'offer must stay a boolean for the commit command to branch on: ' + r.stdout)
})
