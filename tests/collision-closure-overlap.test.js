'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('./helpers')

// specs/20261103/13-a-change-is-sized-by-its-files.md D3: collision-closure.js's always-on overlap
// leg joins the draft's non-tests File Plan paths against plan rows locked in the last 7 days.
// Pins AC-20261103-13-10.

const SCRIPT = 'scripts/collision-closure.js'
const DAY = 86400000

function plan(paths, extraFm) {
  return '---\nstatus: hardened\n' + (extraFm || '') + '---\n\n## File Plan\n\n| Path | Action | Layer | Summary |\n|---|---|---|---|\n' +
    paths.map(p => `| \`${p}\` | MODIFY | scripts | x |\n`).join('') + '| `tests/t.test.js` | MODIFY | tests | x |\n'
}

function fixture({ dependsOn, withRows = true } = {}) {
  const dir = tmpdir('cc-overlap')
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text) }
  const S = 'specs/20261103/02-sib-s.md', T = 'specs/20261103/03-sib-t.md'
  put('tests/t.test.js', "require('../a/one')\n")
  put(S, plan(['a/one.js', 'a/two.js', 'a/three.js', 'a/s-only.js']))
  put(T, plan(['a/one.js', 'a/two.js', 'a/three.js', 'a/four.js']))
  put('specs/20261103/01-draft.md', plan(['a/one.js', 'a/two.js', 'a/three.js', 'a/four.js'], dependsOn ? `depends_on: [${dependsOn}]\n` : ''))
  const now = Date.now()
  if (withRows) {
    const rows = [
      { ts: new Date(now - 2 * DAY).toISOString(), stage: 'plan', spec: S, runId: 'p1' },
      { ts: new Date(now - 9 * DAY).toISOString(), stage: 'plan', spec: T, runId: 'p2' },
    ]
    put('.claude/spec-runs.jsonl', rows.map(r => JSON.stringify(r)).join('\n') + '\n')
  }
  return { dir, S, T, draft: path.join(dir, 'specs/20261103/01-draft.md') }
}

test('AC-20261103-13-10: an undeclared sibling sharing 3 paths inside the 7-day window prints under overlap leg, exits 1, and --json carries it; a 9-day-old sibling is omitted', () => {
  const f = fixture()
  const r = runNode(SCRIPT, ['--root', f.dir, '--spec', f.draft])
  assert.match(r.stdout, /overlap leg:/, 'the overlap leg must print — without it two plans racing the same files lock unseen: ' + r.stdout)
  assert.ok(r.stdout.includes(f.S + ': 3 shared — ') && r.stdout.includes('a/one.js') && r.stdout.includes('a/two.js') && r.stdout.includes('a/three.js'),
    'the in-window sibling must be named with its 3 shared paths: ' + r.stdout)
  assert.ok(!r.stdout.includes(f.T), 'a plan row 9 days old is outside the window and must not be listed: ' + r.stdout)
  assert.strictEqual(r.status, 1, 'an undeclared overlap hit is advisory-red (exit 1): ' + r.stdout + r.stderr)
  const j = JSON.parse(runNode(SCRIPT, ['--root', f.dir, '--spec', f.draft, '--json']).stdout)
  assert.deepStrictEqual(j.overlap, [{ spec: f.S, shared: ['a/one.js', 'a/three.js', 'a/two.js'], declared: false }],
    'the --json overlap array must carry the sibling with sorted shared paths and declared:false: ' + JSON.stringify(j.overlap))
})

test('AC-20261103-13-10: a sibling named in depends_on prints as declared and exits 0', () => {
  const f = fixture({ dependsOn: 'specs/20261103/02-sib-s.md' })
  const r = runNode(SCRIPT, ['--root', f.dir, '--spec', f.draft])
  assert.ok(r.stdout.includes(f.S + ': 3 shared — ') && r.stdout.includes('(declared in depends_on)'),
    'a declared sibling must print with the declared suffix: ' + r.stdout)
  assert.strictEqual(r.status, 0, 'a declared overlap is not a hit that blocks: ' + r.stdout + r.stderr)
})

test('AC-20261103-13-10: no plan row in the window prints (none) under the overlap leg', () => {
  const f = fixture({ withRows: false })
  const r = runNode(SCRIPT, ['--root', f.dir, '--spec', f.draft])
  assert.match(r.stdout, /overlap leg:\n {2}\(none\)/, 'an empty window must print "  (none)" under the leg header: ' + r.stdout)
})
