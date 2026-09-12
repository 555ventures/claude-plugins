'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runNode, runBash, gitRepo } = require('../helpers')

// Direct fix (2026-09-11, specs/20260911/04 close): `--mark conflicts-resolved` was issued from
// the main root against the main root's own copy of a spec whose merge had just landed. That copy
// is `status: done` and has no <spec>.review/ sidecar beside it (the review ran in the linked
// worktree, and the sidecar lives beside the spec file the review actually ran against). The
// driver's terminal cold path — "no sidecar and status done -> print DONE" — fired BEFORE the
// mark was dispatched, so the session saw a green DONE while handleConflictsResolved(), and
// therefore finishMerge(), never ran: no evidence promotion into the main root, no worktree
// cleanup. The build and review ledger rows (bd_0974405f169d, rv_7743c7c0ed68) stayed inside the
// worktree and were recovered by hand only because the worktree happened to still be there.
//
// A mark is an imperative, not a query. The fixture below is the minimum that reproduces the
// swallow: a done spec with no sidecar at the main root, and a linked worktree whose copy of the
// same spec path DOES carry a sidecar.

const DRIVER = 'scripts/spec-review-driver.js'
const SPEC_REL = 'specs/20260823/99-mark-needs-sidecar.md'

const SPEC_BODY = `---
status: done
tier: standard
---
# Mark Needs Sidecar Test Spec

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | a mark refuses without review state | why |

## Acceptance Criteria

- **AC-20260823-99-1**: a mark refuses without review state.
`

// A main root holding the merged (done, sidecar-free) spec, plus — when `withWorktreeSidecar` —
// a real linked worktree whose copy of the same spec path carries the review sidecar the mark
// actually belongs to.
function fixture(label, { withWorktreeSidecar }) {
  const root = fs.realpathSync(tmpdir('mark-needs-sidecar'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'fixture repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }))
  fs.mkdirSync(path.join(root, path.dirname(SPEC_REL)), { recursive: true })
  fs.writeFileSync(path.join(root, SPEC_REL), SPEC_BODY)
  g('add', '-A'); g('commit', '-q', '-m', 'merged close')

  let wt = null
  if (withWorktreeSidecar) {
    const branch = 'spec/99-' + label
    const created = runBash('scripts/merge-back.sh', ['create', '--source', branch, '--root', root])
    assert.strictEqual(created.status, 0, 'setup: worktree creation must succeed: ' + created.stderr)
    wt = created.stdout.trim().split('\n').pop()
    fs.mkdirSync(path.join(wt, SPEC_REL.replace(/\.md$/, '.review')), { recursive: true })
    fs.writeFileSync(path.join(wt, SPEC_REL.replace(/\.md$/, '.review'), 'review-state.json'),
      JSON.stringify({ closed: true, mergeConflicted: true }, null, 2) + '\n')
  }
  return { root, wt }
}

const runAtRoot = (root, ...args) => runNode(DRIVER, [SPEC_REL, ...args], { cwd: root })

test('a --mark issued against a done, sidecar-free spec copy is refused and names the linked worktree copy that owns the review state', () => {
  const { root, wt } = fixture('names-wt', { withWorktreeSidecar: true })
  assert.ok(!fs.existsSync(path.join(root, SPEC_REL.replace(/\.md$/, '.review'))),
    'setup precondition: the main root copy must have NO sidecar, or this fixture never reaches the cold path that swallowed the mark')

  const r = runAtRoot(root, '--mark', 'conflicts-resolved')
  assert.strictEqual(r.status, 2,
    'accepting this mark with exit 0 is the recorded defect: the session reads DONE, believes the merge concluded, and never learns that evidence promotion and worktree cleanup were both skipped: ' + r.stdout + r.stderr)
  assert.doesNotMatch(r.stdout, /^DONE$/m,
    'printing DONE in answer to a mark reports a concluded review that never ran its concluding work — the exact false-green that lost two ledger rows: ' + r.stdout)
  assert.match(r.stderr, /no sidecar/,
    'the refusal must say what is missing (the review state), or the session has no way to tell a wrong-copy mark from a genuinely finished review: ' + r.stderr)
  assert.ok(r.stderr.includes(path.join(wt, SPEC_REL)),
    'the refusal must name the worktree copy of the spec that DOES carry the sidecar — without the literal re-run path the session repeats the same wrong-copy invocation: ' + r.stderr)
  assert.match(r.stderr, /--mark conflicts-resolved/,
    'the named re-run must carry the caller\'s own mark, so the remedy is a copy-paste rather than a reconstruction: ' + r.stderr)
})

test('a --mark with no review state anywhere is refused as having nothing to apply, not answered with DONE', () => {
  const { root } = fixture('no-wt', { withWorktreeSidecar: false })

  const r = runAtRoot(root, '--mark', 'conflicts-resolved')
  assert.strictEqual(r.status, 2,
    'a mark that cannot be applied must fail loudly — exiting 0 here lets any mis-aimed mark in the pipeline read as a concluded review: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /nothing left for this mark to apply/,
    'with no sidecar anywhere the refusal must say the review is already concluded, or the session hunts for a worktree that does not exist: ' + r.stderr)
})

test('SHALL CONTINUE TO: a bare (markless) invocation against a done, sidecar-free spec still prints DONE', () => {
  const { root } = fixture('bare', { withWorktreeSidecar: true })

  const r = runAtRoot(root)
  assert.strictEqual(r.status, 0,
    'the terminal cold path is the loop\'s own no-op resume — refusing it would break every /spec:run re-invocation against a finished spec: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /DONE/,
    'a markless re-run of a concluded review must still report DONE: ' + r.stdout)
})

test('SHALL CONTINUE TO: --state against a done, sidecar-free spec answers DONE even when a mark is also passed, because --state is a query', () => {
  const { root } = fixture('state', { withWorktreeSidecar: true })

  const r = runAtRoot(root, '--state', '--mark', 'conflicts-resolved')
  assert.strictEqual(r.status, 0,
    'a state query must never be turned into a refusal by an accompanying mark — callers use --state to decide what to do next: ' + r.stdout + r.stderr)
  assert.strictEqual(r.stdout.trim(), 'DONE',
    '--state must answer with the bare state token: ' + r.stdout)
})
