'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runNode, runBash, gitRepo } = require('../helpers')

// specs/20261101/11-a-direction-flip-leaves-a-row.md D4: the review driver derives the files the
// spec branch deleted that a done spec created, and finishMerge appends one escape row per owner
// after the merge lands. Fixture shape follows tests/review/merge-reentry.test.js: a real main
// root, a real linked worktree and a real review sidecar reaching MERGE.

const DRIVER = 'scripts/spec-review-driver.js'
const SIBLING = 'specs/20260820/98-sibling.md'

const SIBLING_TEXT = `---
status: done
tier: standard
---
# Sibling

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| src/old.js | CREATE | scripts | the shipped file |
`

const GREEN_TEST = (acId) => `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('${acId}: foo() returns 42', () => { assert.strictEqual(foo(), 42) })
`

function specBody(diffBase, acId, deletes) {
  return `---
status: implementing
tier: standard
build_base: ${diffBase}
---
# Merge Supersession Test Spec

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | foo() returns 42 (${acId}) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | edit | scripts |
${deletes ? '| src/old.js | edit | scripts |\n' : ''}| tests/foo.test.js | create | tests |

## Acceptance Criteria

- **${acId}**: foo() returns 42.
`
}

const CLEAN_RETURN = { verdict: 'CLEAN', survivors: [], killed: [], reviewerCount: 1, scope: 'full', tokens: 10 }

const run = (cwd, spec, ...args) => runNode(DRIVER, [spec, ...args], { cwd })
const stateOf = (cwd, spec) => run(cwd, spec, '--state').stdout.trim()

function driveToMerge(label, acId, { deletes }) {
  const root = fs.realpathSync(tmpdir('merge-supersession'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'specs/20260820'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  fs.writeFileSync(path.join(root, 'src/old.js'), 'module.exports = 1\n')
  fs.writeFileSync(path.join(root, SIBLING), SIBLING_TEXT)
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const baseSha = g('rev-parse', 'HEAD').trim()

  const specStem = `99-${label}`
  const branch = 'spec/' + specStem
  const created = runBash('scripts/merge-back.sh', ['create', '--source', branch, '--root', root])
  assert.strictEqual(created.status, 0, 'setup: worktree creation must succeed: ' + created.stderr)
  const wt = created.stdout.trim().split('\n').pop()

  fs.mkdirSync(path.join(wt, 'specs/20260823'), { recursive: true })
  const specRel = `specs/20260823/${specStem}.md`
  const spec = path.join(wt, specRel)
  fs.writeFileSync(spec, specBody(baseSha, acId, deletes))
  fs.writeFileSync(path.join(wt, 'src/foo.js'), 'module.exports = () => 42\n')
  if (deletes) fs.rmSync(path.join(wt, 'src/old.js'))
  fs.mkdirSync(path.join(wt, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(wt, 'tests/foo.test.js'), GREEN_TEST(acId))
  const gw = (...a) => execFileSync('git', ['-C', wt, ...a], { encoding: 'utf8' })
  gw('add', '-A'); gw('commit', '-q', '-m', 'implement')

  const setupRun = run(wt, spec)
  assert.strictEqual(stateOf(wt, spec), 'REVIEWER',
    `setup precondition (${label}): a green-legs fixture must reach REVIEWER: ` + setupRun.stdout + setupRun.stderr)
  const scratch = fs.realpathSync(tmpdir('msr-clean-' + label))
  const returnFile = path.join(scratch, 'return.json')
  fs.writeFileSync(returnFile, JSON.stringify(CLEAN_RETURN))
  run(wt, spec, '--mark', 'reviewer-returned', '--file', returnFile)
  const dispR = run(wt, spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(wt, spec), 'CLOSE',
    `setup precondition (${label}): a clean disposition must reach CLOSE: ` + dispR.stdout + dispR.stderr)
  gw('add', specRel, 'tests/foo.test.js')
  gw('commit', '-q', '-m', 'close')
  const closeR = run(wt, spec, '--mark', 'closed')
  assert.strictEqual(closeR.status, 0, `setup precondition (${label}): closed must succeed: ` + closeR.stdout + closeR.stderr)
  assert.strictEqual(stateOf(wt, spec), 'MERGE', `setup precondition (${label}): a closed spec must land state MERGE`)
  return { root, wt, spec, specRel, g }
}

function escapeRows(root) {
  const f = path.join(root, '.claude/spec-runs.jsonl')
  if (!fs.existsSync(f)) return []
  return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(r => r.stage === 'escape')
}

test('AC-20261101-11-9: a squash merge-strategy mark over a branch that deleted a done spec\'s created file ends at DONE with one shipped-file-deleted escape row carrying the landed HEAD sha and the reviewed spec as supersededBy', () => {
  const { root, spec, specRel, g } = driveToMerge('ac9', 'AC-20261101-99-9', { deletes: true })
  const merged = run(root, spec, '--mark', 'merge-strategy', 'squash')
  assert.strictEqual(merged.status, 0, 'the merge must land and conclude: ' + merged.stdout + merged.stderr)
  assert.match(merged.stdout, /DONE/, 'the mark must end at DONE: ' + merged.stdout)
  assert.ok(merged.stdout.includes(`supersession spec=${SIBLING} class=shipped-file-deleted files=1`),
    'the driver must print one supersession line per appended row or the owner never learns the deletion was recorded: ' + merged.stdout)
  const rows = escapeRows(root)
  assert.strictEqual(rows.length, 1, 'exactly one escape row for the one owning spec: ' + JSON.stringify(rows))
  const row = rows[0]
  assert.strictEqual(row.spec, SIBLING, 'the row names the creator, not the merging spec')
  assert.deepStrictEqual(row.files, ['src/old.js'], 'the row names the deleted file')
  assert.strictEqual(row.class, 'shipped-file-deleted', 'the class is what fleet-reader counts')
  assert.strictEqual(row.via, 'review', 'via is review for the merge-back writer')
  assert.strictEqual(row.reviewRunId, null, 'reviewRunId stays null for a direction change')
  assert.strictEqual(row.supersededBy, specRel, 'supersededBy is the reviewed spec\'s repo-relative path')
  assert.strictEqual(row.sha, g('log', '-1', '--format=%H', '--', 'src/old.js').trim(),
    'sha must be the landed merge commit that deleted the file — a null, pre-merge or later sha cannot locate the deletion in history')
  assert.strictEqual(g('status', '--porcelain', '--', '.claude/spec-runs.jsonl').trim(), '',
    'the row must land inside the ledger commit — an uncommitted row on the target is lost to any reader of history')
})

test('AC-20261101-11-10: the same merge over a branch that deletes nothing a done spec created ends at DONE with no escape row and no supersession line', () => {
  const { root, spec } = driveToMerge('ac10', 'AC-20261101-99-10', { deletes: false })
  const merged = run(root, spec, '--mark', 'merge-strategy', 'squash')
  assert.strictEqual(merged.status, 0, 'the merge must land and conclude: ' + merged.stdout + merged.stderr)
  assert.match(merged.stdout, /DONE/, 'the mark must end at DONE: ' + merged.stdout)
  assert.ok(!/^supersession /m.test(merged.stdout + merged.stderr),
    'a merge that discards nothing must print nothing about supersession — noise on every merge trains owners to ignore the line: ' + merged.stdout)
  assert.deepStrictEqual(escapeRows(root), [],
    'no escape row may be written when no shipped file was deleted — a row would count a non-event as a direction flip')
})
