'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260823/07-deviations-sidecar-backstop.md (2026-08-23, brief 13): the deviations
// sidecar (<spec minus .md>.deviations.md) was pure convention — build sessions appended
// departure entries by hand, review folded and deleted the file by hand, and nothing caught a
// skipped fold or an entry written in a shape the ledger's `^- ` count could never see. This
// spec gives the convention deterministic teeth inside spec-review-driver.js: an observation
// persisted into the review sidecar on every state derivation while the file exists, every
// entry enumerated into the printed CLOSE step, and two `--mark closed` refusals (the sidecar
// still on disk; the sidecar gone but the last observation recorded a malformed line). These
// tests drive the real binary end-to-end against synthetic git hosts, reusing
// review-driver.test.js's own makeHost()/toReviewer() idiom to reach CLOSE — none of this
// mechanism exists yet, so every test here must fail red until the driver genuinely observes,
// persists, enumerates, and refuses. AC-20260823-07-1, -2, -3, -4, -5, -7 below (AC-6 is a
// SHALL-CONTINUE-TO pin tagged onto the existing closed-success test in
// tests/review/review-driver.test.js instead, per this spec's own File Plan).

const DRIVER = 'scripts/spec-review-driver.js'

const GREEN_TEST = `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('AC-PLACEHOLDER-1: foo() returns 42', () => { assert.strictEqual(foo(), 42) })
`

function specBody({ diffBase, acId }) {
  return `---
status: implementing
tier: standard
diff_base: ${diffBase}
---
# Driver Test Spec

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

function makeHost({ deviations = null, specName = '01-dev-test', acId = 'AC-20260823-97-1' } = {}) {
  const root = fs.realpathSync(tmpdir('devbak-' + specName))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const diffBase = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(root, 'specs/20260823'), { recursive: true })
  const spec = path.join(root, `specs/20260823/${specName}.md`)
  fs.writeFileSync(spec, specBody({ diffBase, acId }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST.replace('AC-PLACEHOLDER-1', acId))
  const deviationsPath = spec.replace(/\.md$/, '.deviations.md')
  if (deviations !== null) fs.writeFileSync(deviationsPath, deviations)
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { root, spec, sidecar: spec.replace(/\.md$/, '.review'), deviationsPath }
}

function run(root, spec, ...args) {
  return runNode(DRIVER, [spec, ...args], { cwd: root })
}
const stateOf = (root, spec) => run(root, spec, '--state').stdout.trim()

function toReviewer(host) {
  const r = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'setup precondition: a fresh green-legs fixture must reach REVIEWER before this AC can be exercised: ' + r.stdout + r.stderr)
  return r
}

function returnFileWith(scratchName, body) {
  const scratch = fs.realpathSync(tmpdir(scratchName))
  const file = path.join(scratch, 'return.json')
  fs.writeFileSync(file, JSON.stringify(body))
  return file
}
const CLEAN_RETURN = { verdict: 'CLEAN', survivors: [], killed: [], reviewerCount: 1, scope: 'full', tokens: 10 }

// Walks a fixture through the green-legs / CLEAN-reviewer / zero-disposition path to CLOSE —
// the same harness idiom review-driver.test.js's own driveToClose()/toReviewer() use, reused
// here rather than reinvented, per this spec's own grounding note.
function walkToClose(host) {
  toReviewer(host)
  const returnFile = returnFileWith('devbak-clean-return', CLEAN_RETURN)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
  const r = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'setup precondition: a clean review must reach CLOSE before any deviations-backstop closed-mark AC can be exercised: ' + r.stdout + r.stderr)
  return r
}

test('AC-20260823-07-1: WHEN --mark closed is passed while the deviations sidecar still exists on disk THE SYSTEM exits 2, names the sidecar path and the fold-then-delete-then-commit remedy, and leaves the driver state at CLOSE so a re-run with no mark reprints the CLOSE step', () => {
  const fixture = '- an entry the session never folded\n'
  const host = makeHost({ deviations: fixture, specName: '01-dev-forgot-fold', acId: 'AC-20260823-97-1' })
  walkToClose(host)

  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 2,
    'a --mark closed while the deviations sidecar still exists on disk must be refused — accepting it would let a skipped fold silently ride the close: ' + r.stdout + r.stderr)
  const out = r.stdout + r.stderr
  assert.ok(out.includes(host.deviationsPath),
    'the refusal must name the sidecar\'s own path so the session knows exactly which file to fold: ' + out)
  assert.match(out, /fold[- ]then[- ]delete[- ]then[- ]commit/i,
    'the refusal must name the fold-then-delete-then-commit remedy (the Contracts\' own literal phrase for refusal 1), not a generic dirty-tree-style message: ' + out)
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'a refused closed mark must leave the driver state at CLOSE, unchanged — advancing here would accept an unfolded sidecar as if the fold had happened: ' + r.stdout + r.stderr)

  const r2 = run(host.root, host.spec)
  assert.strictEqual(r2.status, 0,
    'a bare re-invocation after the refusal must exit 0 (a step printed), never carry the refusal forward as a persistent error: ' + r2.stdout + r2.stderr)
  assert.match(r2.stdout, /Step: close/,
    'the re-run must reprint the CLOSE step\'s own instructions — the refused mark must not have advanced or corrupted state: ' + r2.stdout)
})

test('AC-20260823-07-2: WHEN the driver derives state while a deviations sidecar exists on disk THE SYSTEM persists a deviations observation with entries counted from bullet lines and one malformed row per invalid line, overwriting any prior observation', () => {
  const fixture = '# Deviations — 07-deviations-sidecar-backstop\n' +
    '- bullet one\n' +
    '  continuation of bullet one\n' +
    '- bullet two\n' +
    'Recorded during build.\n'
  const host = makeHost({ deviations: fixture, specName: '02-dev-observe', acId: 'AC-20260823-97-2' })
  const r = run(host.root, host.spec)
  assert.strictEqual(r.status, 0,
    'a green-legs run with a mostly-valid sidecar present must still print a step, never refuse just for the sidecar existing: ' + r.stdout + r.stderr)
  const stateFile = path.join(host.sidecar, 'review-state.json')
  assert.ok(fs.existsSync(stateFile),
    'the driver\'s first invocation must create the review-sidecar state file: ' + r.stdout + r.stderr)
  const marks1 = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  assert.deepStrictEqual(marks1.deviations, { entries: 2, malformed: [{ line: 5, text: 'Recorded during build.' }] },
    'the persisted "deviations" observation must record entries=2 (the two "- " bullets) and exactly one malformed row naming line 5\'s flush-left text — a wrong count here means a build-time departure written outside the ledger-visible bullet shape goes unnoticed: ' + JSON.stringify(marks1.deviations))

  fs.writeFileSync(host.deviationsPath, '- only one clean bullet\n')
  const r2 = run(host.root, host.spec)
  assert.strictEqual(r2.status, 0, 'a second derivation over a changed sidecar must also succeed: ' + r2.stdout + r2.stderr)
  const marks2 = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  assert.deepStrictEqual(marks2.deviations, { entries: 1, malformed: [] },
    'a changed sidecar must OVERWRITE the previously persisted observation rather than merge with it — a stale malformed row surviving here would block --mark closed forever on content that no longer exists: ' + JSON.stringify(marks2.deviations))
})

test('AC-20260823-07-2 (grammar): WHEN a malformed line appears inside an open entry THE SYSTEM leaves the entry open — an indented line following it is a continuation, never a second malformed row', () => {
  const fixture = '- bullet one\n' +
    'Flush-left malformed line.\n' +
    '  continuation after malformed\n'
  const host = makeHost({ deviations: fixture, specName: '02b-dev-grammar', acId: 'AC-20260823-97-8' })
  run(host.root, host.spec)
  const stateFile = path.join(host.sidecar, 'review-state.json')
  const marks = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  assert.deepStrictEqual(marks.deviations, { entries: 1, malformed: [{ line: 2, text: 'Flush-left malformed line.' }] },
    'a malformed line must NOT close the open entry — only a blank line or a header closes it, per the Contracts\' entry-grammar block — the indented line-3 continuation belongs to entry 1, and a resurrection of malformed-closes-entry would misparse it as a second malformed row, inflating the evidence list with a line the Contract says is a valid continuation: ' + JSON.stringify(marks.deviations))
})

test('AC-20260823-07-3: WHEN --mark closed is passed after the sidecar was deleted but the last persisted observation records a malformed line THE SYSTEM exits 2, prints the recorded line as "<line>: <text>", and names the restore remedy including "git checkout" and the sidecar path', () => {
  const fixture = '# Deviations — malformed\n' +
    '- a real bullet\n' +
    'Recorded during build.\n'
  const host = makeHost({ deviations: fixture, specName: '03-dev-malformed', acId: 'AC-20260823-97-3' })
  walkToClose(host)
  fs.rmSync(host.deviationsPath, { force: true })

  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 2,
    'a --mark closed after the sidecar was deleted must still be refused when the last persisted observation recorded a malformed line — deleting the file must never erase the evidence of a count-invisible entry: ' + r.stdout + r.stderr)
  const out = r.stdout + r.stderr
  assert.match(out, /3: Recorded during build\./,
    'the refusal must print the recorded malformed line as "<line>: <text>" so the session can restore and repair it: ' + out)
  assert.match(out, /git checkout/,
    'the restore remedy must include the literal fragment "git checkout" per the Contracts\' own literal note: ' + out)
  assert.ok(out.includes(host.deviationsPath),
    'the restore remedy must name the sidecar\'s own path so the checkout command is directly usable: ' + out)
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'a refused closed mark must leave state at CLOSE, unchanged: ' + r.stdout + r.stderr)
})

test('AC-20260823-07-3 (cap): WHEN the last persisted observation records more than 10 malformed lines THE SYSTEM prints only the first 10, then "… and N more"', () => {
  const lines = []
  for (let i = 1; i <= 12; i++) lines.push('malformed line ' + i)
  const fixture = lines.join('\n') + '\n'
  const host = makeHost({ deviations: fixture, specName: '04-dev-malformed-cap', acId: 'AC-20260823-97-4' })
  walkToClose(host)
  fs.rmSync(host.deviationsPath, { force: true })

  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 2,
    'a sidecar recording more than 10 malformed lines must still refuse --mark closed after deletion: ' + r.stdout + r.stderr)
  const out = r.stdout + r.stderr
  for (let i = 1; i <= 10; i++) {
    assert.match(out, new RegExp('^' + i + ': malformed line ' + i + '$', 'm'),
      `malformed line ${i} is within the first-10 cap and must be printed individually — omitting it hides evidence the session needs in order to restore and repair: ` + out)
  }
  for (let i = 11; i <= 12; i++) {
    assert.ok(!out.includes(i + ': malformed line ' + i),
      `malformed line ${i} is beyond the first-10 cap and must NOT be printed individually — printing it anyway means the cap was never applied: ` + out)
  }
  assert.match(out, /…\s*and\s*2\s*more/,
    'lines beyond the first 10 must be summarized as "… and 2 more" per the Contracts\' own cap note — a missing summary silently drops evidence of the remaining malformed lines: ' + out)
})

test('AC-20260823-07-4: WHEN the driver prints the CLOSE step and the persisted observation has entries >= 1 THE SYSTEM enumerates each entry\'s first line, numbered and bounded to 120 characters, after the fold instruction', () => {
  const longBullet = '- ' + 'x'.repeat(198) // exactly 200 chars total, per the AC's own worked example
  assert.strictEqual(longBullet.length, 200, 'fixture sanity: the bullet line must be exactly 200 chars long, matching the AC\'s own worked example')
  const fixture = '# Deviations — enum\n' + longBullet + '\n  a continuation line\n'
  const host = makeHost({ deviations: fixture, specName: '05-dev-enum', acId: 'AC-20260823-97-5' })
  const r = walkToClose(host)

  const truncated = longBullet.slice(0, 120)
  assert.ok(r.stdout.includes(truncated),
    'the CLOSE step must enumerate the entry\'s first line bounded to 120 characters — a missing entry here means a fold decision could be made without the departure\'s content ever reaching the instruction channel: ' + r.stdout)
  assert.ok(!r.stdout.includes(longBullet),
    'the enumerated line must be truncated to 120 characters, never the full 200-char original — printing the untruncated line breaks the documented bound: ' + r.stdout)
  const foldIdx = r.stdout.indexOf('Fold the deviations sidecar')
  assert.ok(foldIdx !== -1, 'setup precondition: the CLOSE step must still print its step-2 fold instruction: ' + r.stdout)
  const enumIdx = r.stdout.indexOf(truncated)
  assert.ok(enumIdx > foldIdx,
    'the enumeration must appear AFTER step 2\'s fold instruction, per the spec\'s Behavior section ("the CLOSE step prints the fold instruction with every entry enumerated") — the folding session needs the instruction first, then the full content: ' + r.stdout)
  assert.match(r.stdout, /\n\s*1\.\s/,
    'the enumerated entry must be numbered starting at 1: ' + r.stdout)
})

test('AC-20260823-07-5: WHEN a sidecar contains only blank lines, header lines, bullets, and continuations inside open entries THE SYSTEM records malformed: [], and once the session folds, deletes, and commits the deletion, --mark closed exits 0', () => {
  const fixture = '# Deviations — clean\n' +
    '- bullet one\n' +
    '  continuation of bullet one\n' +
    '\n' +
    '- bullet two\n'
  const host = makeHost({ deviations: fixture, specName: '06-dev-clean', acId: 'AC-20260823-97-6' })
  const r0 = run(host.root, host.spec)
  assert.strictEqual(r0.status, 0, 'setup: a green-legs run over the well-formed sidecar must succeed: ' + r0.stdout + r0.stderr)
  const stateFile = path.join(host.sidecar, 'review-state.json')
  const marks = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  assert.deepStrictEqual(marks.deviations, { entries: 2, malformed: [] },
    'a sidecar built only from blank/header/bullet/continuation lines must record malformed: [] — flagging any of these lines here would refuse a legitimately well-formed fold record: ' + JSON.stringify(marks.deviations))

  walkToClose(host)
  fs.rmSync(host.deviationsPath, { force: true })
  execFileSync('git', ['-C', host.root, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', host.root, 'commit', '-q', '-m', 'fold deviations'], { encoding: 'utf8' })

  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0,
    'a fold-delete-commit of a well-formed sidecar must let --mark closed succeed — the backstop must never block the correctly-executed flow it exists to enforce: ' + r.stdout + r.stderr)
})

test('AC-20260823-07-7: WHEN a committed deviations sidecar is unlinked from disk but its deletion is not committed THE SYSTEM continues to refuse --mark closed as a dirty-tree refusal naming the sidecar path among the unexpected paths', () => {
  const fixture = '- a bullet, never malformed\n'
  const host = makeHost({ deviations: fixture, specName: '07-dev-uncommitted-delete', acId: 'AC-20260823-97-7' })
  walkToClose(host)
  fs.rmSync(host.deviationsPath, { force: true }) // unlinked from disk; the deletion itself is never committed

  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 2,
    'a committed sidecar removed from disk without a commit for the deletion must still refuse --mark closed via the existing dirty-tree check — an unadjudicated uncommitted deletion must never ride a close silently: ' + r.stdout + r.stderr)
  const relDeviations = path.relative(host.root, host.deviationsPath)
  assert.ok((r.stdout + r.stderr).includes(relDeviations),
    'the dirty-tree refusal must name the sidecar\'s relative path among the unexpected paths, exactly like any other unexpected dirty path — the fold-completeness backstop must never carve deviations paths out of the pre-existing dirty-tree guard: ' + r.stdout + r.stderr)
})
