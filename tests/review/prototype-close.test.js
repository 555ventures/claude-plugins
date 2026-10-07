'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runNode, runBash, gitRepo } = require('../helpers')

// specs/20261007/03-plan-cites-the-build-replays-and-status-derives-the-delete.md D6,
// AC-20261007-03-7: the review driver's merge closes a prototype when the merged spec is the last
// spec citing its stem, through the prototype driver's own close mark.

const DRIVER = 'scripts/spec-review-driver.js'
const STEM = '28-functional-prototype'
const PROTO_BRANCH = 'proto/' + STEM
const AC = 'AC-20261007-99-1'

const GREEN_TEST = `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('${AC}: foo() returns 42', () => { assert.strictEqual(foo(), 42) })
`

function specBody(diffBase, { prototype }) {
  return `---
status: implementing
tier: standard
build_base: ${diffBase}
${prototype ? `prototype: ${STEM}\n` : ''}---
# Prototype Close Test Spec

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | foo() returns 42 (${AC}) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | edit | scripts |
| tests/foo.test.js | create | tests |

## Acceptance Criteria

- **${AC}**: foo() returns 42.
`
}

const CLEAN_RETURN = { verdict: 'CLEAN', survivors: [], killed: [], reviewerCount: 1, scope: 'full', tokens: 10 }

const run = (cwd, spec, ...args) => runNode(DRIVER, [spec, ...args], { cwd })
const stateOf = (cwd, spec) => run(cwd, spec, '--state').stdout.trim()
const branchList = (root, pattern) =>
  execFileSync('git', ['-C', root, 'branch', '--list', pattern], { encoding: 'utf8' }).trim()

// Same recipe as the review-driver merge harnesses: a real main root, a real linked spec worktree
// (merge-back.sh create), driven LEGS -> REVIEWER -> DISPOSITIONS -> CLOSE -> closed, landing at
// real state MERGE. On top of it the main root carries an opened-and-contracted prototype: a
// status.json with marks.testsDerived, a real `proto/<stem>` worktree, and a `prototype` config
// block whose dbDestroy drops a marker file OUTSIDE the tree (the fixture's stand-in for a
// database drop). `otherCiter` adds a second spec citing the stem at the given status.
function driveToMerge(label, { prototype, otherCiter = null }) {
  const root = fs.realpathSync(tmpdir('pc'))
  const marker = path.join(fs.realpathSync(tmpdir('pc-db')), 'db-dropped')
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
    prototype: {
      url: 'http://127.0.0.1:{port}',
      overlay: 'src/proto-overlay.js',
      e2eFile: 'e2e/proto-{stem}.spec.ts',
      e2eList: 'true {file}',
      e2eRun: 'true {file}',
      picture: 'true {url} {out} {width} {height}',
      dbCreate: 'true',
      dbDestroy: `touch "${marker}"`,
    },
  }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  const stamp = new Date().toISOString()
  fs.mkdirSync(path.join(root, 'design/prototypes', STEM), { recursive: true })
  fs.writeFileSync(path.join(root, 'design/prototypes', STEM, 'status.json'), JSON.stringify({
    schemaVersion: 1, brief: '28', stem: STEM, branch: PROTO_BRANCH,
    worktree: '.claude/worktrees/proto-' + STEM, base: 'main', pinsPort: 4711,
    marks: { opened: stamp, approved: stamp, contracted: stamp, testsDerived: stamp },
    rounds: [], lastUpdated: stamp,
  }, null, 2) + '\n')
  if (otherCiter) {
    fs.mkdirSync(path.join(root, 'specs/20261007'), { recursive: true })
    fs.writeFileSync(path.join(root, 'specs/20261007/98-other-citer.md'),
      `---\nstatus: ${otherCiter}\ntier: standard\nprototype: ${STEM}\n---\n# Other citer\n`)
  }
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const baseSha = g('rev-parse', 'HEAD').trim()

  const protoWt = runBash('scripts/merge-back.sh', ['create', '--source', PROTO_BRANCH, '--root', root])
  assert.strictEqual(protoWt.status, 0, 'setup: the prototype worktree must be creatable: ' + protoWt.stderr)

  const specStem = `99-${label}`
  const created = runBash('scripts/merge-back.sh', ['create', '--source', 'spec/' + specStem, '--root', root])
  assert.strictEqual(created.status, 0, 'setup: spec worktree creation must succeed: ' + created.stderr)
  const wt = created.stdout.trim().split('\n').pop()

  fs.mkdirSync(path.join(wt, 'specs/20261007'), { recursive: true })
  const specRel = `specs/20261007/${specStem}.md`
  const spec = path.join(wt, specRel)
  fs.writeFileSync(spec, specBody(baseSha, { prototype }))
  fs.writeFileSync(path.join(wt, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.mkdirSync(path.join(wt, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(wt, 'tests/foo.test.js'), GREEN_TEST)
  // A real prototype spec reaches review with a passed-and-looked replay on its build row; without
  // it the contract leg is correctly red and the clean disposition is refused before CLOSE.
  if (prototype) {
    fs.mkdirSync(path.join(wt, '.claude'), { recursive: true })
    fs.appendFileSync(path.join(wt, '.claude/spec-runs.jsonl'), JSON.stringify({
      stage: 'build', spec: specRel, replay: { tests: 2, passed: true, looked: true },
    }) + '\n')
  }
  const gw = (...a) => execFileSync('git', ['-C', wt, ...a], { encoding: 'utf8' })
  gw('add', '-A'); gw('commit', '-q', '-m', 'implement')

  const setupRun = run(wt, spec)
  assert.strictEqual(stateOf(wt, spec), 'REVIEWER',
    `setup (${label}): a green fixture must reach REVIEWER: ` + setupRun.stdout + setupRun.stderr)
  const scratch = fs.realpathSync(tmpdir('pc-ret-' + label))
  const returnFile = path.join(scratch, 'return.json')
  fs.writeFileSync(returnFile, JSON.stringify(CLEAN_RETURN))
  run(wt, spec, '--mark', 'reviewer-returned', '--file', returnFile)
  const dispR = run(wt, spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(wt, spec), 'CLOSE',
    `setup (${label}): a clean disposition must reach CLOSE: ` + dispR.stdout + dispR.stderr)
  gw('add', specRel, 'tests/foo.test.js'); gw('commit', '-q', '-m', 'close')
  const closeR = run(wt, spec, '--mark', 'closed')
  assert.strictEqual(closeR.status, 0, `setup (${label}): closed must succeed: ` + closeR.stdout + closeR.stderr)
  assert.strictEqual(stateOf(wt, spec), 'MERGE', `setup (${label}): a closed spec must land state MERGE`)
  return { root, spec, marker, protoWtPath: path.join(root, '.claude/worktrees/proto-' + STEM) }
}

const statusMarks = (root) =>
  JSON.parse(fs.readFileSync(path.join(root, 'design/prototypes', STEM, 'status.json'), 'utf8')).marks

test('AC-20261007-03-7: WHEN the merged spec is the only spec citing the stem THE SYSTEM closes the prototype through its driver and prints that it did', () => {
  const h = driveToMerge('only', { prototype: true })
  assert.notStrictEqual(branchList(h.root, 'proto/*'), '', 'setup: proto/<stem> must exist before the merge, or nothing proves the close deleted it')
  const merged = run(h.root, h.spec, '--mark', 'merge-strategy', 'ff-only')
  assert.strictEqual(merged.status, 0, 'the merge itself must still succeed: ' + merged.stdout + merged.stderr)
  assert.match(merged.stdout, /DONE/, 'a concluded merge must still reach DONE: ' + merged.stdout)
  assert.match(merged.stdout, new RegExp('prototype ' + STEM + ' closed'),
    'the session must be told the prototype was closed, or a spent worktree and database linger unnoticed: ' + merged.stdout)
  assert.ok(fs.existsSync(h.marker), 'the host database drop must have run through the driver close mark: ' + merged.stdout)
  assert.strictEqual(branchList(h.root, 'proto/*'), '', 'the proto/<stem> branch must be gone after the last citer merges: ' + merged.stdout)
  assert.ok(!fs.existsSync(h.protoWtPath), 'the prototype worktree must be removed after the last citer merges: ' + merged.stdout)
  assert.ok(statusMarks(h.root).closed, 'status.json must carry marks.closed so status stops offering the close paste: ' + JSON.stringify(statusMarks(h.root)))
})

test('AC-20261007-03-7: WHEN another spec citing the stem is only hardened THE SYSTEM deletes nothing and prints that the prototype stays open', () => {
  const h = driveToMerge('second', { prototype: true, otherCiter: 'hardened' })
  const merged = run(h.root, h.spec, '--mark', 'merge-strategy', 'ff-only')
  assert.strictEqual(merged.status, 0, 'the merge itself must still succeed: ' + merged.stdout + merged.stderr)
  assert.match(merged.stdout, new RegExp('prototype ' + STEM + ' stays open — 1 citing spec\\(s\\) not done'),
    'the session must be told why the prototype was kept, naming how many citers remain: ' + merged.stdout)
  assert.ok(!fs.existsSync(h.marker), 'the database must not be dropped while another spec still cites the stem: ' + merged.stdout)
  assert.notStrictEqual(branchList(h.root, 'proto/*'), '', 'the proto branch must survive while another citer is not done, or its replay source is lost')
  assert.ok(fs.existsSync(h.protoWtPath), 'the prototype worktree must survive while another citer is not done')
  assert.ok(!statusMarks(h.root).closed, 'status.json must not be marked closed while a citer is not done')
})

test('AC-20261007-03-7: WHEN the prototype worktree is dirty THE SYSTEM still concludes the merge, warns that the prototype is still open and names the close command, leaving the branch', () => {
  const h = driveToMerge('dirty', { prototype: true })
  fs.writeFileSync(path.join(h.protoWtPath, 'stray.txt'), 'uncommitted work\n')
  const merged = run(h.root, h.spec, '--mark', 'merge-strategy', 'ff-only')
  assert.strictEqual(merged.status, 0, 'a refused prototype close must not fail an already-landed merge: ' + merged.stdout + merged.stderr)
  assert.match(merged.stdout, /DONE/, 'the merge must still conclude: ' + merged.stdout)
  assert.match(merged.stdout, new RegExp('⚠️ prototype ' + STEM + ' still open:'),
    'a refused close must be a loud warning, never silence: ' + merged.stdout)
  assert.match(merged.stdout, /--mark closed/,
    'the warning must name the close command so the user can finish by hand: ' + merged.stdout)
  assert.notStrictEqual(branchList(h.root, 'proto/*'), '', 'the branch must be left in place when the close is refused')
})

// Negative direction of AC-7: green on the pre-image by construction (nothing there touches a
// non-prototype merge), kept because it pins the scope of the new close.
test('AC-20261007-03-7: WHEN the merged spec has no prototype: THE SYSTEM leaves an unrelated harden/x branch and an unrelated open prototype in place and prints neither line', () => {
  const h = driveToMerge('plain', { prototype: false })
  execFileSync('git', ['-C', h.root, 'branch', 'harden/x'], { encoding: 'utf8' })
  const merged = run(h.root, h.spec, '--mark', 'merge-strategy', 'ff-only')
  assert.strictEqual(merged.status, 0, 'an ordinary merge must still succeed: ' + merged.stdout + merged.stderr)
  assert.match(merged.stdout, /DONE/, 'a concluded merge must still reach DONE: ' + merged.stdout)
  assert.notStrictEqual(branchList(h.root, 'harden/x'), '', 'an unrelated harden/x branch must survive the merge untouched')
  assert.notStrictEqual(branchList(h.root, 'proto/*'), '', 'an unrelated open prototype must survive a merge that cites no stem')
  assert.ok(!fs.existsSync(h.marker), 'a merge that cites no stem must never run a database drop')
  assert.doesNotMatch(merged.stdout, /prototype \S+ (closed|stays open)|still open:/,
    'a merge that cites no stem must print no prototype close line: ' + merged.stdout)
})
