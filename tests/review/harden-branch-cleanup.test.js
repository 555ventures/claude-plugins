'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runNode, runBash, gitRepo } = require('../helpers')

// specs/20260928/03-the-build-reads-the-freeze.md D5, AC-20260928-03-6: `finishMerge()` — reached
// only through a REAL merge-back.sh worktree merge (never the "review ran on the originating
// branch, nothing to merge" MERGE-skipped arm, which returns before finishMerge is ever called) —
// must delete `harden/<stem>` once cleanup+verify have run, for a `lane: behaviour` spec whose
// harden branch still exists. The pre-image's finishMerge() has no such check at all, so this is
// red by construction (assumption A4's own fallback: merge-reentry.test.js's driveToMerge is not
// exported, so this file builds its own worktree/merge harness, following that same recipe).

const DRIVER = 'scripts/spec-review-driver.js'

const GREEN_TEST = (acId) => `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('${acId}: foo() returns 42', () => { assert.strictEqual(foo(), 42) })
`

function specBody(diffBase, acId, { brief = null, lane = null } = {}) {
  return `---
status: implementing
tier: standard
build_base: ${diffBase}
${brief !== null ? `brief: ${brief}\n` : ''}${lane !== null ? `lane: ${lane}\n` : ''}---
# Harden Branch Cleanup Test Spec

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | foo() returns 42 (${acId}) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | edit | scripts |
| tests/foo.test.js | create | tests |

## Acceptance Criteria

- **${acId}**: foo() returns 42.
`
}

const CLEAN_RETURN = { verdict: 'CLEAN', survivors: [], killed: [], reviewerCount: 1, scope: 'full', tokens: 10 }

function run(cwd, spec, ...args) {
  return runNode(DRIVER, [spec, ...args], { cwd })
}
const stateOf = (cwd, spec) => run(cwd, spec, '--state').stdout.trim()

function returnFileWith(scratchName, body) {
  const scratch = fs.realpathSync(tmpdir(scratchName))
  const file = path.join(scratch, 'return.json')
  fs.writeFileSync(file, JSON.stringify(body))
  return file
}

// Same recipe as tests/review/merge-reentry.test.js's driveToMerge (not exported from that file,
// per this spec's own A4 fallback): a real main root + a real linked worktree (via merge-back.sh
// create) + a real spec branch, driven LEGS -> REVIEWER -> DISPOSITIONS -> CLOSE with a clean
// return, committed, and marked `closed` — landing at real state MERGE with a real
// <spec>.review/review-state.json sidecar. `opts.brief`/`opts.lane` stamp the new frontmatter this
// spec adds; when `opts.brief` is set, `docs/roadmap/<brief>-functional-prototype.md` is written so
// `<stem>` derives the same way spec 02's freeze derives it.
function driveToMerge(label, acId, opts = {}) {
  const root = fs.realpathSync(tmpdir('hbc'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  if (opts.brief !== undefined && opts.brief !== null) {
    fs.mkdirSync(path.join(root, 'docs/roadmap'), { recursive: true })
    fs.writeFileSync(path.join(root, `docs/roadmap/${opts.brief}-functional-prototype.md`),
      'Phase: 1\nDepends on: none\n\n# Functional Prototype\n')
  }
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const baseSha = g('rev-parse', 'HEAD').trim()

  const specStem = `99-${label}`
  const branch = 'spec/' + specStem
  const created = runBash('scripts/merge-back.sh', ['create', '--source', branch, '--root', root])
  assert.strictEqual(created.status, 0, 'setup: worktree creation must succeed: ' + created.stderr)
  const wt = created.stdout.trim().split('\n').pop()

  fs.mkdirSync(path.join(wt, 'specs/20260928'), { recursive: true })
  const specRel = `specs/20260928/${specStem}.md`
  const spec = path.join(wt, specRel)
  fs.writeFileSync(spec, specBody(baseSha, acId, opts))
  fs.writeFileSync(path.join(wt, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.mkdirSync(path.join(wt, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(wt, 'tests/foo.test.js'), GREEN_TEST(acId))
  const gw = (...a) => execFileSync('git', ['-C', wt, ...a], { encoding: 'utf8' })
  gw('add', '-A'); gw('commit', '-q', '-m', 'implement')

  const setupRun = run(wt, spec)
  assert.strictEqual(stateOf(wt, spec), 'REVIEWER',
    `setup precondition (${label}): a fresh green-legs fixture must reach REVIEWER: ` + setupRun.stdout + setupRun.stderr)
  const returnFile = returnFileWith('hbc-clean-' + label, CLEAN_RETURN)
  run(wt, spec, '--mark', 'reviewer-returned', '--file', returnFile)
  const dispR = run(wt, spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(wt, spec), 'CLOSE',
    `setup precondition (${label}): a clean disposition must reach CLOSE: ` + dispR.stdout + dispR.stderr)

  gw('add', specRel, 'tests/foo.test.js')
  gw('commit', '-q', '-m', 'close')
  const closeR = run(wt, spec, '--mark', 'closed')
  assert.strictEqual(closeR.status, 0,
    `setup precondition (${label}): closed must succeed once the tree is clean apart from the sidecar and the ledger: ` + closeR.stdout + closeR.stderr)
  assert.strictEqual(stateOf(wt, spec), 'MERGE', `setup precondition (${label}): a closed spec must land state MERGE`)

  return { root, wt, spec, branch, g }
}

test('AC-20260928-03-6: WHEN the review driver\'s merge concludes for a lane: behaviour spec whose harden/<stem> branch still exists THE SYSTEM deletes that branch and prints that it did', () => {
  const brief = 28
  const stem = `${brief}-functional-prototype`
  const { root, wt, spec } = driveToMerge('lane', 'AC-20260928-99-6', { brief, lane: 'behaviour' })
  execFileSync('git', ['-C', root, 'branch', 'harden/' + stem], { encoding: 'utf8' })
  const before = execFileSync('git', ['-C', root, 'branch', '--list', 'harden/' + stem], { encoding: 'utf8' }).trim()
  assert.notStrictEqual(before, '',
    'setup precondition: harden/' + stem + ' must exist before the merge concludes, or this test never exercises D5\'s deletion at all')

  const merged = run(root, spec, '--mark', 'merge-strategy', 'ff-only')
  assert.strictEqual(merged.status, 0, 'a clean merge-strategy mark must still succeed once D5 lands: ' + merged.stdout + merged.stderr)
  assert.match(merged.stdout, /DONE/, 'a concluded merge must still reach DONE: ' + merged.stdout)

  const after = execFileSync('git', ['-C', root, 'branch', '--list', 'harden/' + stem], { encoding: 'utf8' }).trim()
  assert.strictEqual(after, '',
    'D5 requires harden/<stem> to be deleted once the merge concludes for a lane: behaviour spec — the pre-image\'s finishMerge() never deletes any branch, so this is red until it does: ' +
    JSON.stringify({ before, after }))
  assert.match(merged.stdout, new RegExp('harden/' + stem + ' deleted'),
    'the driver must print that it deleted the branch, so the session (and this evidence) can confirm it happened, not just infer it from a missing branch: ' + merged.stdout)
  assert.ok(!fs.existsSync(wt), 'a concluded merge must still remove the worktree exactly as it does today: ' + wt)
})

test('AC-20260928-03-6: WHEN the spec has no lane: THE SYSTEM leaves an unrelated harden/x branch in place', () => {
  const { root, wt, spec } = driveToMerge('nolane', 'AC-20260928-99-7', {})
  execFileSync('git', ['-C', root, 'branch', 'harden/unrelated'], { encoding: 'utf8' })

  const merged = run(root, spec, '--mark', 'merge-strategy', 'ff-only')
  assert.strictEqual(merged.status, 0, 'an ordinary (non-behaviour-lane) merge must still succeed: ' + merged.stdout + merged.stderr)
  assert.match(merged.stdout, /DONE/, 'a concluded merge must still reach DONE: ' + merged.stdout)

  const after = execFileSync('git', ['-C', root, 'branch', '--list', 'harden/unrelated'], { encoding: 'utf8' }).trim()
  assert.notStrictEqual(after, '',
    'a spec carrying no lane: must never trigger the harden-branch deletion — an unrelated harden/x branch must survive the merge untouched')
  assert.ok(!fs.existsSync(wt), 'a concluded merge must still remove the worktree: ' + wt)
})
