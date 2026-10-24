'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawnSync } = require('child_process')
const { ROOT, runNode } = require('../helpers')
// Owner: specs/20261024/04-scripts-drop-their-inline-changelog.md (script comments cite no spec, AC or decision id; prose-size tests retired).

const COMMENT_LINE = /^\s*(\/\/|#)(?!!)/
const SPEC_PATH = /specs\/\d{8}\/\d{2}[a-z]?-[\w-]+\.md/
const AC_ID = /\bAC-\d{8}-\d{2}[a-z]?-\d+\b/
const DECISION_ID = /\b[DRA]\d{1,2}\b(?![\w-])/
const OWNER_LINE = /^\s*(\/\/|#)\s*Owner:/

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.isFile()) out.push(p)
  }
  return out
}

function scriptFiles() {
  const scripts = walk(path.join(ROOT, 'spec', 'scripts'), []).filter((f) => /\.(js|sh)$/.test(f))
  const bins = fs.readdirSync(path.join(ROOT, 'spec', 'bin')).map((f) => path.join(ROOT, 'spec', 'bin', f))
  return scripts.concat(bins)
}

function scan(tokenRes) {
  const hits = []
  const owners = []
  for (const f of scriptFiles()) {
    let ownerCount = 0
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (!COMMENT_LINE.test(line)) return
      if (OWNER_LINE.test(line)) { ownerCount++; return }
      if (tokenRes.some((re) => re.test(line))) hits.push(path.relative(ROOT, f) + ':' + (i + 1) + ': ' + line.trim())
    })
    if (ownerCount > 1) owners.push(path.relative(ROOT, f) + ' (' + ownerCount + ')')
  }
  return { hits, owners }
}

test('AC-20261024-04-1: no whole-line comment under spec/scripts or spec/bin carries a spec-path or AC-ID token outside its single Owner line', () => {
  assert.ok(scriptFiles().length > 30, 'the scan found too few script files, so a zero-hit result would prove nothing about the tree')
  const { hits } = scan([SPEC_PATH, AC_ID])
  assert.deepStrictEqual(hits.slice(0, 15), [],
    hits.length + ' script comment lines still cite a spec path or AC-ID, so the code keeps carrying its own changelog; first offenders shown')
})

test('AC-20261024-04-2: no whole-line comment carries a D/R/A decision-id token outside Owner lines, and no file has more than one Owner line', () => {
  const { hits, owners } = scan([DECISION_ID])
  assert.deepStrictEqual(hits.slice(0, 15), [],
    hits.length + ' script comment lines still cite a decision id, so the code keeps carrying its own changelog; first offenders shown')
  assert.deepStrictEqual(owners, [],
    'files with more than one Owner line leave the cold reader with competing pointers to design history: ' + owners.join(', '))
})

test('AC-20261024-04-3: comment-narration --code-identical certifies the sweep commit against its parent, so the sweep changed comments only', () => {
  // The certificate is a property of the one sweep commit, never of whatever the working tree
  // holds today: judged against merge-base(HEAD, main) it would go red on every later change to
  // a script, which is the ordinary work of every spec. The commit is checked out detached in a
  // scratch worktree and judged against its own parent.
  const SWEEP = 'f48d1027d886394a4652380d76960f0c192df3ba'
  const probe = spawnSync('git', ['cat-file', '-e', SWEEP + '^{commit}'], { cwd: ROOT, encoding: 'utf8' })
  assert.strictEqual(probe.status, 0, 'the sweep commit is not in this clone, so the comment-only certificate has no reference commit: ' + probe.stderr)
  const wt = path.join(os.tmpdir(), 'sweep-cert-' + process.pid)
  spawnSync('git', ['worktree', 'prune'], { cwd: ROOT, encoding: 'utf8' })
  const add = spawnSync('git', ['worktree', 'add', '-q', '--detach', wt, SWEEP], { cwd: ROOT, encoding: 'utf8' })
  assert.strictEqual(add.status, 0, 'git worktree add for the sweep commit failed: ' + add.stderr)
  try {
    const r = runNode('scripts/comment-narration.js', ['--root', wt, '--code-identical', SWEEP + '^', '--json'])
    assert.ok(r.status === 0 || r.status === 1, 'comment-narration --code-identical failed to run, so the comment-only certificate is unavailable: ' + r.stderr)
    // The certificate also scans tests/ and scripts/, where the sweep's spec deletes and rewrites
    // test files; only the swept trees (spec/scripts, spec/bin) must be code-identical.
    const swept = JSON.parse(r.stdout).differ.filter((d) => /^spec\/(scripts|bin)\//.test(d.file))
    assert.deepStrictEqual(swept, [],
      'a swept script differs from its parent once comments are removed, so the sweep touched code, not just comments')
  } finally {
    spawnSync('git', ['worktree', 'remove', '--force', wt], { cwd: ROOT, encoding: 'utf8' })
  }
})

test('AC-20261024-04-4: no test cites the five orphaned AC-IDs and the three prose-size test files are gone', () => {
  // Built by concatenation so this file never spells the literals it forbids elsewhere.
  const ids = [['20261008', '01', '3'], ['20261008', '01', '4'], ['20260908', '06', '1'], ['20260908', '06', '2'], ['20260823', '06', '4']]
    .map(([d, n, k]) => 'AC-' + d + '-' + n + '-' + k)
  const self = path.join(__dirname, 'no-citation-comments.test.js')
  const offenders = []
  for (const f of walk(path.join(ROOT, 'tests'), []).filter((p) => p.endsWith('.js') && p !== self)) {
    const src = fs.readFileSync(f, 'utf8')
    for (const id of ids) if (new RegExp(id + '(?!\\d)').test(src)) offenders.push(path.relative(ROOT, f) + ' cites ' + id)
  }
  assert.deepStrictEqual(offenders, [],
    'tests still cite criteria whose pinned prose-size tests retired, so the retirement is incomplete: ' + offenders.join('; '))
  for (const rel of ['tests/consistency/doctrine-budget.test.js', 'tests/consistency/doctrine-headings.test.js', 'tests/prose-debt/doctrine-pins.test.js']) {
    assert.ok(!fs.existsSync(path.join(ROOT, rel)), rel + ' still exists, so doctrine line budgets and heading lists are still pinned as prose')
  }
})

test('AC-20261024-04-6: ac-drift (which scans every done spec) exits 0 once every orphaned criterion carries a retired tag naming this spec', () => {
  const r = runNode('scripts/ac-drift.js', ['--root', ROOT])
  assert.strictEqual(r.status, 0, 'a done spec has an uncovered criterion with no retired tag, so coverage silently shrank: ' + r.stdout + r.stderr)
})
