'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260913/01-the-replay-tree-is-the-reviewed-tree.md D2-D6: replay.js's --select stops
// reconstructing the pair of commits a review judged from git history (D3's exit-4 refusal when
// neither ref is usable, D4's ref-sourced commit=), --backfill-pins is the one place the history
// walk survives (D4), --setup verifies its own reassembly against the target's own AC coverage
// (D5) instead of printing a success line over a tree missing the review's work, and --setup's
// overlay-descendant guard narrows to refuse only an equal/ancestor sha (D6). AC-20260913-01-4,
// -5, -6, -7, -9 below. AC-20260913-01-1/-2/-3/-8/-10/-11 live in
// tests/review/review-driver-close-row.test.js and tests/replay/replay.test.js.

const SCRIPT = 'scripts/replay.js'

function refSha(root, ref) {
  try {
    return execFileSync('git', ['-C', root, 'rev-parse', '--verify', ref],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}
function writeRef(root, ref, sha) {
  execFileSync('git', ['-C', root, 'update-ref', ref, sha])
}
function commitFile(root, relFile, content, msg) {
  const full = path.join(root, relFile)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
  execFileSync('git', ['-C', root, 'add', '-A'])
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', msg])
  return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}
function writeLedger(root, rows) {
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec-runs.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
}
test('AC-20260913-01-4: WHEN --select picks a row whose run has a close ref THE SYSTEM prints that ref\'s sha as commit=, including when it is not a descendant of parent (a rebasing merge-back orphaning the judged commit)', () => {
  const root = fs.realpathSync(tmpdir('replay-select-orphan'))
  gitRepo(root)
  const ancestor = commitFile(root, 'lib/root.js', 'x\n', 'root')

  // The judged line: a commit descending from `ancestor`, carrying the reviewed spec content —
  // this is what the review actually judged (the row's `judged` ref / diff.head).
  execFileSync('git', ['-C', root, 'checkout', '-q', '-b', 'judged-line'])
  const judged = commitFile(root, 'specs/a.md',
    `---\ndiff_base: ${ancestor}\n---\n# a\n`, 'judged tree')

  // The close line: a SEPARATE commit branching directly off `ancestor` (never descending from
  // `judged`) — modeling a rebasing merge-back that rewrote the main line the close commit landed
  // on, orphaning the judged commit entirely. `close` is real and reachable, just not on `judged`'s
  // line of descent.
  execFileSync('git', ['-C', root, 'checkout', '-q', 'main'])
  execFileSync('git', ['-C', root, 'checkout', '-q', '-b', 'close-line'])
  const close = commitFile(root, 'specs/a.md',
    `---\ndiff_base: ${ancestor}\nstatus: done\n---\n# a\n`, 'close tree')

  const ancestorOfClose = spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', judged, close]).status
  assert.notStrictEqual(ancestorOfClose, 0,
    'fixture sanity: judged must NOT be an ancestor of close, or this test never exercises the orphaned case')

  writeRef(root, 'refs/spec-review/rv_orphan000001/judged', judged)
  writeRef(root, 'refs/spec-review/rv_orphan000001/close', close)
  writeLedger(root, [
    { ts: '2026-08-10T00:00:00Z', stage: 'review', spec: 'specs/a.md', runId: 'rv_orphan000001', verdict: 'CLEAN', tier: 'standard' },
  ])

  const r = runNode(SCRIPT, ['--select'], { cwd: root })
  assert.strictEqual(r.status, 0, 'D4: a row whose run has both refs must still select successfully even ' +
    'when they share no line of descent: ' + r.stderr)
  assert.match(r.stdout, new RegExp('commit=' + close + '(\\s|$)'),
    'D4: commit= must be the run\'s own close ref sha even though it is not a descendant of parent — ' +
    'refusing to print it (or falling back to something derivable by descent) would leave a rebase-orphaned ' +
    'review permanently unselectable: ' + r.stdout)
  assert.match(r.stdout, new RegExp('parent=' + judged + '(\\s|$)'),
    'D4: parent= must stay the run\'s own judged ref sha, unaffected by commit\'s lack of descent from it: ' + r.stdout)
  assert.match(r.stdout, new RegExp('diffBase=' + ancestor + '(\\s|$)'),
    'the diffBase validated against parent must still resolve normally — D4 only relaxes how commit is ' +
    'sourced, never the base-candidate validation against parent: ' + r.stdout)
})

test('AC-20260913-01-5: WHEN the selected row\'s run has no close ref, or has neither a judged ref nor a resolvable diff.head, THE SYSTEM exits 4, prints nothing on stdout, and names the row\'s runId, the spec path and --backfill-pins on stderr', () => {
  // Scenario 1 (the AC's own worked example): a judged ref exists, but no close ref at all.
  const rootA = fs.realpathSync(tmpdir('replay-select-no-close-ref'))
  gitRepo(rootA)
  const ancestorA = commitFile(rootA, 'lib/root.js', 'x\n', 'root')
  const judgedA = commitFile(rootA, 'specs/a.md', `---\ndiff_base: ${ancestorA}\n---\n# a\n`, 'judged tree')
  writeRef(rootA, 'refs/spec-review/rv_abc123def456/judged', judgedA)
  writeLedger(rootA, [
    { ts: '2026-08-10T00:00:00Z', stage: 'review', spec: 'specs/a.md', runId: 'rv_abc123def456', verdict: 'CLEAN', tier: 'standard' },
  ])
  const rA = runNode(SCRIPT, ['--select'], { cwd: rootA })
  assert.strictEqual(rA.status, 4,
    'D3: a row with a judged ref but no close ref must be refused outright, never partially selected: ' + rA.stdout)
  assert.strictEqual(rA.stdout.trim(), '', 'D3: nothing must print on stdout when the row is refused: ' + JSON.stringify(rA.stdout))
  assert.match(rA.stderr, /rv_abc123def456/, 'D3: the refusal must name the row\'s own runId: ' + rA.stderr)
  assert.match(rA.stderr, /specs\/a\.md/, 'D3: the refusal must name the spec path: ' + rA.stderr)
  assert.match(rA.stderr, /--backfill-pins/, 'D3: the refusal must name the --backfill-pins remedy: ' + rA.stderr)

  // Scenario 2: a close ref exists, but neither a judged ref NOR a resolvable diff.head — D3's
  // second, independent trigger (the two conditions are an OR, not an AND).
  const rootB = fs.realpathSync(tmpdir('replay-select-no-parent-identity'))
  gitRepo(rootB)
  const ancestorB = commitFile(rootB, 'lib/root.js', 'x\n', 'root')
  const closeB = commitFile(rootB, 'specs/b.md', `---\ndiff_base: ${ancestorB}\nstatus: done\n---\n# b\n`, 'close tree')
  writeRef(rootB, 'refs/spec-review/rv_fedcba987654/close', closeB)
  writeLedger(rootB, [
    // No diff.head field at all, and no judged ref written above — neither half of D3's parent
    // identity is usable.
    { ts: '2026-08-10T00:00:00Z', stage: 'review', spec: 'specs/b.md', runId: 'rv_fedcba987654', verdict: 'CLEAN', tier: 'standard' },
  ])
  const rB = runNode(SCRIPT, ['--select'], { cwd: rootB })
  assert.strictEqual(rB.status, 4,
    'D3: a row with a close ref but no judged ref and no resolvable diff.head must also be refused — a ' +
    'close ref alone names no parent identity to hand --setup: ' + rB.stdout)
  assert.strictEqual(rB.stdout.trim(), '', 'D3: nothing must print on stdout for this row either: ' + JSON.stringify(rB.stdout))
  assert.match(rB.stderr, /rv_fedcba987654/, 'D3: the refusal must name this row\'s own runId too: ' + rB.stderr)
  assert.match(rB.stderr, /--backfill-pins/, 'D3: the refusal must name the --backfill-pins remedy: ' + rB.stderr)
})

test('AC-20260913-01-6: --backfill-pins prints one line per CLEAN review row naming what it derived, creates only missing refs, leaves every existing ref at its current sha, and exits 0 even when some rows are underivable', () => {
  const root = fs.realpathSync(tmpdir('replay-backfill'))
  gitRepo(root)

  // Row 1: already carries both refs, pointed at two arbitrary real commits — backfill must
  // leave them byte-identical (never re-derive or overwrite an existing ref).
  const preexistingA = commitFile(root, 'lib/pre-a.js', 'a\n', 'preexisting a')
  const preexistingB = commitFile(root, 'lib/pre-b.js', 'b\n', 'preexisting b')
  writeRef(root, 'refs/spec-review/rv_have00000001/judged', preexistingA)
  writeRef(root, 'refs/spec-review/rv_have00000001/close', preexistingB)

  // Row 2: fully derivable — diff.head resolves to a real commit (the pre-review tree), and
  // walking HEAD's descendants from there finds the OLDEST commit whose copy of the spec matches
  // `^status: done$` (a later, further descendant also flips status but must NOT be picked).
  const head2 = commitFile(root, 'specs/two.md', `---\nstatus: implementing\n---\n# two\n`, 'two: pre-review')
  const doneOldest2 = commitFile(root, 'specs/two.md', `---\nstatus: done\n---\n# two\n`, 'two: close (oldest done)')
  commitFile(root, 'lib/two-later.js', 'later\n', 'two: unrelated later commit (still status: done)')

  // Row 3: underivable — diff.head names a well-formed but nonexistent sha.
  const fakeSha = 'f'.repeat(40)

  writeLedger(root, [
    { ts: '2026-08-10T00:00:00Z', stage: 'review', spec: 'specs/one.md', runId: 'rv_have00000001', verdict: 'CLEAN' },
    { ts: '2026-08-11T00:00:00Z', stage: 'review', spec: 'specs/two.md', runId: 'rv_derive0000002', verdict: 'CLEAN', diff: { head: head2 } },
    { ts: '2026-08-12T00:00:00Z', stage: 'review', spec: 'specs/three.md', runId: 'rv_dead000000003', verdict: 'CLEAN', diff: { head: fakeSha } },
  ])

  const r = runNode(SCRIPT, ['--backfill-pins'], { cwd: root })
  assert.strictEqual(r.status, 0,
    'D4: --backfill-pins must exit 0 even though the third row is underivable — a run-once reconstruction ' +
    'refuses nothing, it just reports what it could not derive: ' + r.stdout + r.stderr)

  const lines = r.stdout.trim().split('\n').filter(Boolean)
  assert.strictEqual(lines.length, 3, 'D4: exactly one printed line per CLEAN review row: ' + JSON.stringify(lines))
  assert.match(lines[0], /rv_have00000001/, 'D4: the first printed line must name row 1\'s runId: ' + lines[0])
  assert.match(lines[0], /skipped: ref exists/,
    'D4: a row that already carries both refs must be reported as skipped, never re-derived: ' + lines[0])
  assert.match(lines[1], new RegExp('judged=' + head2), 'D4: row 2\'s judged= must be the resolvable diff.head verbatim: ' + lines[1])
  assert.match(lines[1], new RegExp('close=' + doneOldest2 + '(\\s|$)'),
    'D4: row 2\'s close= must be the OLDEST commit reachable from HEAD that is a strict descendant of judged ' +
    'and whose copy of the spec matches status: done — not the later commit that also carries status: done: ' + lines[1])
  assert.match(lines[2], /rv_dead000000003/, 'D4: the third printed line must name row 3\'s runId: ' + lines[2])
  assert.match(lines[2], /judged=unresolvable/, 'D4: row 3\'s diff.head does not resolve, so judged must print unresolvable: ' + lines[2])
  assert.match(lines[2], /close=underivable/, 'D4: with no resolvable judged sha to walk from, close must print underivable: ' + lines[2])

  assert.strictEqual(refSha(root, 'refs/spec-review/rv_have00000001/judged'), preexistingA,
    'D4: an existing judged ref must be left at its exact current sha, never overwritten')
  assert.strictEqual(refSha(root, 'refs/spec-review/rv_have00000001/close'), preexistingB,
    'D4: an existing close ref must be left at its exact current sha, never overwritten')
  assert.strictEqual(refSha(root, 'refs/spec-review/rv_derive0000002/judged'), head2,
    'D4: row 2\'s missing judged ref must actually be CREATED, not merely reported')
  assert.strictEqual(refSha(root, 'refs/spec-review/rv_derive0000002/close'), doneOldest2,
    'D4: row 2\'s missing close ref must actually be CREATED, not merely reported')
  assert.strictEqual(refSha(root, 'refs/spec-review/rv_dead000000003/judged'), null,
    'D4: an underivable row must create no ref at all')
  assert.strictEqual(refSha(root, 'refs/spec-review/rv_dead000000003/close'), null,
    'D4: an underivable row must create no ref at all')
})

test('AC-20260913-01-7: WHEN --setup was given --spec and the scratch tree it stood up does not satisfy the target spec\'s own ac-matrix.js coverage, THE SYSTEM exits 5, prints no setup dir= line on stdout, and names the spec, the commit, the first ac-matrix finding line and the worktree-remove remedy on stderr', () => {
  const root = fs.realpathSync(tmpdir('replay-setup-verify-fail'))
  gitRepo(root)
  const relSpec = 'specs/20260913/97-uncovered.md'
  // Deliberately uncoverable: an Acceptance Criteria bullet with NO File Plan tests row at all
  // (and so zero test-file hits) — the exact tree-reassembly failure signature the Goal names:
  // a scratch tree standing at a commit one short of the spec's own work.
  fs.mkdirSync(path.join(root, path.dirname(relSpec)), { recursive: true })
  fs.writeFileSync(path.join(root, relSpec),
    '---\nstatus: implementing\n---\n# uncovered\n\n## Acceptance Criteria\n\n- **AC-20260913-97-1**: never covered by any test.\n')
  execFileSync('git', ['-C', root, 'add', '-A'])
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'add uncoverable spec'])
  const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

  const dir = path.join(fs.realpathSync(tmpdir('replay-setup-verify-outside')), 'wt')
  const r = runNode(SCRIPT, ['--setup', '--commit', sha, '--spec', relSpec, '--dir', dir], { cwd: root })
  assert.strictEqual(r.status, 5,
    'D5: a scratch tree that fails the target spec\'s own ac-matrix coverage check must exit 5, not print a ' +
    'success line over a tree missing the spec\'s work: ' + r.stdout + r.stderr)
  assert.strictEqual(r.stdout.trim(), '',
    'D5: no setup dir= line may print on stdout on exit 5, on ANY outcome but exit 0: ' + JSON.stringify(r.stdout))
  assert.match(r.stderr, new RegExp(relSpec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'D5: the diagnosis must name the spec path: ' + r.stderr)
  assert.match(r.stderr, new RegExp(sha), 'D5: the diagnosis must name the commit: ' + r.stderr)
  assert.match(r.stderr, /uncovered-ac|AC-20260913-97-1/,
    'D5: the diagnosis must include the first ac-matrix finding line: ' + r.stderr)
  assert.match(r.stderr, /worktree remove --force/,
    'D5: the diagnosis must name the `git -C <root> worktree remove --force <dir>` remedy so the scratch ' +
    'tree left behind is actually cleanable: ' + r.stderr)
  assert.ok(fs.existsSync(dir),
    'D5: the scratch worktree stood up before verification ran and must still be on disk for the printed ' +
    'remedy to act on — the diagnosis names a real path, not a stale one')
})

test('AC-20260913-01-9: WHEN --setup is given an --overlay that is neither equal to --commit nor an ancestor of it THE SYSTEM proceeds even though it is not a descendant of --commit either (two commits on sibling branches off one shared base)', () => {
  const root = fs.realpathSync(tmpdir('replay-overlay-sibling'))
  gitRepo(root) // seeds the initial commit on `main`

  execFileSync('git', ['-C', root, 'checkout', '-q', '-b', 'branch-a'])
  const commitA = commitFile(root, 'lib/a.js', 'a\n', 'branch-a: add lib/a.js')
  execFileSync('git', ['-C', root, 'checkout', '-q', 'main'])
  execFileSync('git', ['-C', root, 'checkout', '-q', '-b', 'branch-b'])
  const commitB = commitFile(root, 'lib/b.js', 'b\n', 'branch-b: add lib/b.js')

  const isAncestorEitherWay =
    spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', commitA, commitB]).status === 0 ||
    spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', commitB, commitA]).status === 0
  assert.strictEqual(isAncestorEitherWay, false,
    'fixture sanity: commitA and commitB must share no ancestor relation in either direction, or this test ' +
    'never exercises D6\'s newly-accepted "unrelated by descent" population')

  const expectedDiff = execFileSync('git', ['-C', root, 'diff', '--name-status', '--no-renames', commitA, commitB],
    { encoding: 'utf8' }).trim().split('\n').filter(Boolean)

  const dir = path.join(fs.realpathSync(tmpdir('replay-overlay-sibling-wt')), 'wt')
  const r = runNode(SCRIPT, ['--setup', '--commit', commitA, '--overlay', commitB, '--dir', dir], { cwd: root })
  assert.strictEqual(r.status, 0,
    'D6: an --overlay that is neither equal to --commit nor an ancestor of it must be ACCEPTED even though ' +
    'it is not a descendant of --commit either — the pair no longer needs to share a line of descent: ' +
    r.stdout + r.stderr)
  assert.match(r.stdout, new RegExp(' overlaid=' + expectedDiff.length + '(\\s|$)'),
    'D6: every non-meta row in the --commit..--overlay diff must be materialized, matching the diff computed ' +
    'independently here: ' + r.stdout)

  assert.strictEqual(fs.readFileSync(path.join(dir, 'lib/b.js'), 'utf8'), 'b\n',
    'D6: the overlay materialization must land branch-b\'s own file into the scratch tree')
  assert.ok(!fs.existsSync(path.join(dir, 'lib/a.js')),
    'D6: the overlay materialization must remove branch-a\'s file, since it is absent from the overlay side')
  const head = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  assert.notStrictEqual(head, commitA, 'D6: a non-empty overlay must land as a new commit, not leave HEAD at --commit')
})
