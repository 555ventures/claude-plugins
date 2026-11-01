'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20261025/02-readers-keep-only-the-surviving-escape-fields.md D5: commit-coverage keeps
// commit mode only; the window (--since) and fleet (--repos-root) shares are retired.
// specs/20261031/01-the-escape-row-follows-the-diagnosed-file.md D1, D2, D7: --primary, pick, ubiquitous.

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


test('AC-20261025-02-14 / AC-20261031-01-7: --commit HEAD --json still reports mode commit, the landed review run and ts, and the offer boolean', () => {
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

function plan(rows) {
  return '---\ndate: 2026-08-01\n---\n\n# spec\n\n## File Plan\n\n| Path | Action | Layer | Summary |\n|---|---|---|---|\n' +
    rows.map(p => '| ' + p + ' | MODIFY | src | . |').join('\n') + '\n'
}

// a lists src/x.js + CHANGELOG.md (reviewed 2020), b lists CHANGELOG.md (reviewed 2021); HEAD touches `touch`.
function twoSpecRepo(opts) {
  const o = Object.assign({ aRows: ['src/x.js', 'CHANGELOG.md'], bRows: ['CHANGELOG.md'], touch: ['src/x.js', 'CHANGELOG.md'] }, opts)
  const dir = tmpdir('commit-coverage-pick')
  const git = gitRepo(dir)
  fs.mkdirSync(path.join(dir, 'specs'), { recursive: true })
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/a.md'), plan(o.aRows))
  fs.writeFileSync(path.join(dir, 'specs/b.md'), plan(o.bRows))
  fs.writeFileSync(path.join(dir, '.claude/spec-runs.jsonl'),
    JSON.stringify({ ts: '2020-01-01T00:00:00Z', stage: 'review', spec: 'specs/a.md', verdict: 'CLEAN', runId: 'wf_cc1' }) + '\n' +
    JSON.stringify({ ts: '2021-01-01T00:00:00Z', stage: 'review', spec: 'specs/b.md', verdict: 'CLEAN', runId: 'wf_cc2' }) + '\n')
  for (const f of o.touch) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true })
    fs.writeFileSync(path.join(dir, f), 'x\n')
  }
  git('add', '-A')
  git('commit', '-q', '-m', 'fix(x): repair the thing')
  return dir
}

const run = (dir, extra) => runNode(SCRIPT, ['--commit', 'HEAD', '--root', dir, ...extra])

test('AC-20261031-01-1: --primary names a landed file and pick attributes the row through that file, not the later review', () => {
  const r = run(twoSpecRepo(), ['--primary', 'src/x.js', '--json'])
  assert.strictEqual(r.status, 0, 'a named primary must not break the offer oracle: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out.pick, { file: 'src/x.js', spec: 'specs/a.md', reviewRunId: 'wf_cc1', reviewTs: '2020-01-01T00:00:00Z', reason: 'primary' },
    'without the primary pick the escape row lands on the newest spec and exits 3 on the duplicate: ' + r.stdout)
  assert.deepStrictEqual(out.ubiquitous, [], 'a primary choice excludes nothing: ' + r.stdout)
})

test('AC-20261031-01-2: a primary that is not landed falls back to the latest-review rule, and --primary with no value exits 2 naming --primary <path>', () => {
  const dir = twoSpecRepo()
  const r = run(dir, ['--primary', 'src/none.js', '--json'])
  assert.strictEqual(r.status, 0, 'an unlanded primary must fall back, not fail: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.ok(out.pick, 'fallback must still produce a pick: ' + r.stdout)
  assert.strictEqual(out.pick.reason, 'latest-review', 'unlanded primary must use the D2 rule: ' + r.stdout)
  assert.strictEqual(out.pick.file, 'src/x.js', 'the fallback pick must skip the ubiquitous file: ' + r.stdout)
  const bad = runNode(SCRIPT, ['--commit', 'HEAD', '--root', dir, '--primary'])
  assert.strictEqual(bad.status, 2, 'a valueless --primary is a usage error; a silent pass hides the missing path: ' + bad.stderr)
  assert.match(bad.stderr, /--primary <path>/, 'the error must name the remedy flag shape')
})

test('AC-20261031-01-3: with no primary the file every other winning spec also landed is ubiquitous and the pick is the earlier spec', () => {
  const r = run(twoSpecRepo(), ['--json'])
  assert.strictEqual(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out.ubiquitous, ['CHANGELOG.md'], 'the shared file must be excluded or every fix picks the newest spec: ' + r.stdout)
  assert.deepStrictEqual(out.pick, { file: 'src/x.js', spec: 'specs/a.md', reviewRunId: 'wf_cc1', reviewTs: '2020-01-01T00:00:00Z', reason: 'latest-review' },
    'the pick must come from the non-ubiquitous file, not specs/b.md: ' + r.stdout)
})

test('AC-20261031-01-4: an empty landed set gives null pick and no ubiquitous files, and when every file is ubiquitous nothing is excluded and the later review wins', () => {
  const none = JSON.parse(run(twoSpecRepo({ touch: ['unlisted.txt'] }), ['--json']).stdout)
  assert.strictEqual(none.pick, null, 'no landed file means no pick; a fabricated one attributes the row to a wrong spec: ' + JSON.stringify(none))
  assert.deepStrictEqual(none.ubiquitous, [], 'empty landed has nothing to exclude')
  const all = twoSpecRepo({ aRows: ['p.js', 'q.js'], bRows: ['p.js', 'q.js'], touch: ['p.js', 'q.js'] })
  const out = JSON.parse(run(all, ['--json']).stdout)
  assert.deepStrictEqual(out.ubiquitous, [], 'when exclusion would empty the pool nothing is excluded: ' + JSON.stringify(out))
  assert.ok(out.pick, 'the pool fallback must still pick: ' + JSON.stringify(out))
  assert.strictEqual(out.pick.spec, 'specs/b.md', 'the later review must win when everything is ubiquitous: ' + JSON.stringify(out))
})

test('AC-20261031-01-8: the human render prints one pick line, and pick: none when nothing landed', () => {
  const r = run(twoSpecRepo(), [])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /pick: src\/x\.js ← specs\/a\.md \(latest-review\)/, 'the human render must show the pick the commit step reads: ' + r.stdout)
  const n = run(twoSpecRepo({ touch: ['unlisted.txt'] }), [])
  assert.match(n.stdout, /pick: none/, 'an empty landed set must say pick: none: ' + n.stdout)
})
