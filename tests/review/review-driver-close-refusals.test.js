'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runBash, gitRepo } = require('../helpers')
const { GREEN_TEST, specBody, makeHost, run, stateOf, toReviewer, returnFileWith, CLEAN_RETURN } = require('./review-driver.fixtures')

// Shard B of the review-driver family (review-driver-close-refusals.test.js, split from
// review-driver.test.js by specs/20260903/06-test-suite-critical-path.md D1/D3). Owns the
// close-refusal ACs: specs/20260903/02-whole-suite-review-leg.md AC-20260903-02-10;
// specs/20260824/06-review-range-identity.md AC-20260824-06-12; specs/20260820/07-review-driver.md
// AC-20260820-07-7/-16; specs/20260830/02 AC-20260830-02-1/-4. Shared helpers live in
// review-driver.fixtures.js (D2).

// AC-20260903-02-10 (D4): the close-time re-run's OWN refusal, independent of the close-time
// gate re-run — gateCommand is genuinely green ("true"), only testCommand is red.
test('AC-20260903-02-10: WHEN --mark closed is invoked with every earlier refusal passing, gateCommand "true", and testCommand "bash always-red.sh" THE SYSTEM SHALL refuse (exit 2), leave marks.closed unset (--state stays CLOSE), and print a message containing "suite red at close", the literal "bash always-red.sh", and "--mark closed"', () => {
  const root = fs.realpathSync(tmpdir('rvdrv-suite-close-red'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  // Lives at repo root so the literal testCommand "bash always-red.sh" (bash resolves an
  // explicit script argument relative to cwd = repoRoot, not PATH) finds it directly.
  fs.writeFileSync(path.join(root, 'always-red.sh'), '#!/usr/bin/env bash\nexit 1\n')
  fs.chmodSync(path.join(root, 'always-red.sh'), 0o755)
  // D1: the suite leg runs the host's bare testCommand on EVERY legs iteration — a host whose
  // testCommand is "bash always-red.sh" from the start would hard-stop at STOPPED and never
  // reach CLOSE. Start green ("node --test", the fixture's real tests dir) so LEGS/REVIEWER/
  // dispositions all pass, then rewrite testCommand to the red script immediately before
  // --mark closed, isolating this AC's own claim (the close-time re-run's OWN refusal) from the
  // review-time suite leg's.
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'true',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const diffBase = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(root, 'specs/20260903'), { recursive: true })
  const spec = path.join(root, 'specs/20260903/98-drv-suite-close.md')
  fs.writeFileSync(spec, specBody({ diffBase, acId: 'AC-20260903-97-1' }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST.replace('AC-20260820-99-1', 'AC-20260903-97-1'))
  g('add', '-A'); g('commit', '-q', '-m', 'implement')

  const legsR = run(root, spec)
  assert.strictEqual(stateOf(root, spec), 'REVIEWER',
    'setup: the fixture must reach REVIEWER on a genuinely green gate ("true") and a genuinely green suite ' +
    'leg ("node --test" over the fixture\'s own green test): ' + legsR.stdout + legsR.stderr)
  const returnFile = returnFileWith('rvdrv-suite-close-return', CLEAN_RETURN)
  run(root, spec, '--mark', 'reviewer-returned', '--file', returnFile)
  run(root, spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(root, spec), 'CLOSE', 'setup: a clean pass must reach CLOSE')

  execFileSync('git', ['-C', root, 'add', 'specs/20260903/98-drv-suite-close.md'])
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'close'])

  // Now that CLOSE is reached, swap testCommand to the red script — this AC pins the CLOSE-time
  // re-run's OWN refusal (D4), independent of whether the review-time suite leg was ever red.
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'true',
    testCommand: 'bash always-red.sh',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }))
  execFileSync('git', ['-C', root, 'add', '.claude/spec.config.json'])
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'redden testCommand for the close-time re-run'])

  const closeR = run(root, spec, '--mark', 'closed')
  assert.strictEqual(closeR.status, 2,
    'AC-20260903-02-10: a red testCommand at close must refuse --mark closed (exit 2), never silently accept it: ' + closeR.stdout + closeR.stderr)
  assert.strictEqual(stateOf(root, spec), 'CLOSE',
    'AC-20260903-02-10: a refused close-time suite re-run must leave marks.closed unset — --state must stay CLOSE, never advance to MERGE')
  const msg = closeR.stdout + closeR.stderr
  assert.match(msg, /suite red at close/,
    'AC-20260903-02-10 (literal): the refusal must contain "suite red at close": ' + msg)
  assert.match(msg, /bash always-red\.sh/,
    'AC-20260903-02-10 (literal): the refusal must name the exact testCommand "bash always-red.sh": ' + msg)
  assert.match(msg, /--mark closed/,
    'AC-20260903-02-10 (literal): the refusal must name the "--mark closed" re-run remedy: ' + msg)
})

function unresolvableBaseSpecBody(acId) {
  return `---
status: implementing
tier: standard
build_base: no-such-branch-xyz
---
# Driver Test Spec (unresolvable base)

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

// specs/20260824/06-review-range-identity.md D4/AC-12: resolveBaseSha() runs once,
// right after resolveBase(), at driver startup — so an unresolvable base must die before the
// first manifest or leg ever runs, never mid-leg or at the first verdict pass.
test('AC-20260824-06-12: WHEN the spec\'s base ref does not resolve to a commit THE SYSTEM exits 2 before any leg or verdict pass runs, naming diff_base and git rev-parse --verify on stderr, and appends no ledger line and writes no manifest', () => {
  const root = fs.realpathSync(tmpdir('rvdrv-badbase'))
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
  fs.mkdirSync(path.join(root, 'specs/20260820'), { recursive: true })
  const spec = path.join(root, 'specs/20260820/99-drv-badbase.md')
  const acId = 'AC-20260820-99-17'
  fs.writeFileSync(spec, unresolvableBaseSpecBody(acId))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), GREEN_TEST.replace('AC-20260820-99-1', acId))
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  const sidecar = spec.replace(/\.md$/, '.review')

  const ledger = path.join(root, '.claude/spec-runs.jsonl')
  const before = fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8') : null

  const r = run(root, spec)
  assert.strictEqual(r.status, 2,
    'AC-20260824-06-12: an unresolvable base ref must exit 2 before any leg runs — proceeding would diff ' +
    'every leg against a ref that does not exist: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /diff_base/,
    'AC-20260824-06-12: stderr must name diff_base as the remedy (add diff_base: <sha> to the spec ' +
    'frontmatter) — a generic git error here leaves the fix undiscoverable: ' + r.stderr)
  assert.match(r.stderr, /git rev-parse --verify/,
    'AC-20260824-06-12: stderr must name the resolution command git rev-parse --verify so the remedy is ' +
    'directly runnable: ' + r.stderr)

  const after = fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8') : null
  assert.strictEqual(after, before,
    'AC-20260824-06-12: .claude/spec-runs.jsonl must be byte-unchanged — the base must die BEFORE the first ' +
    'manifest or leg, not after a hard-stop row was already appended: ' + JSON.stringify({ before, after }))
  assert.ok(!fs.existsSync(path.join(sidecar, 'manifest-1.jsonl')),
    'AC-20260824-06-12: no manifest-1.jsonl may exist — review-legs.js must never be invoked once the base ' +
    'fails to resolve: ' + sidecar)
})

test('AC-20260820-07-7: WHEN --mark closed is passed while the tree is dirty beyond the sidecar THE SYSTEM exits 2 naming the unexpected paths', () => {
  const host = makeHost()
  toReviewer(host)
  const returnFile = returnFileWith('rvdrv-dirty', CLEAN_RETURN)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
  run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE')

  fs.writeFileSync(path.join(host.root, 'stray-uncommitted.txt'), 'oops\n')
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 2,
    'a dirty tree beyond the sidecar must refuse the closed mark — accepting it would leave an unadjudicated stray path riding the close commit: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /stray-uncommitted\.txt/,
    'the refusal must name the unexpected path so the session can adjudicate it, not just report generic dirtiness: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE', 'a refused closed mark must leave the state at CLOSE')
})

// specs/20260830/02-close-gate-rerun.md D1/D2/D4: CLOSE
// writes the canonical doc and folds Gotchas into the host's rules file AFTER the gate leg
// already ran over the diff, then commits — so the exact files CLOSE itself writes bypass the
// host's deterministic rule enforcement. `--mark closed` now re-runs the host's resolved
// gateCommand (cwd = repoRoot) as its LAST refusal check, after the deviations/gotchas/dirty-tree
// refusals, over the committed close tree. Both fixtures below simulate "the close commit itself
// broke the gate" by editing the tree BETWEEN reaching CLOSE on a genuinely green legs run and
// the session's own close commit — exactly where a real canonical-doc/rules-fold write would
// land — never by starting the whole review on an already-broken gate, which would die before
// REVIEWER (via review-legs.js's own gate leg) and never reach CLOSE at all. Both tests must fail
// red today: handleClosed() has no gate-run refusal yet, so `--mark closed` exits 0 on both.

test('AC-20260830-02-1: WHEN --mark closed is invoked with all earlier refusals passing and the resolved host gateCommand exits non-zero THE SYSTEM refuses the mark (exit 2), leaves marks.closed unset (state stays CLOSE), and prints a message naming "gate red at close", the resolved command, and the re-run remedy', () => {
  const host = makeHost()
  toReviewer(host)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('rvdrv-gate1-clean', CLEAN_RETURN))
  const dispR = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'setup precondition: a clean zero-survivor disposition must reach CLOSE before the close-time gate refusal can be exercised: ' + dispR.stdout + dispR.stderr)

  // Simulate the close commit itself breaking the gate: an always-red
  // script the close-time gate now runs, written and committed alongside the spec's own
  // status:done flip — exactly the class of files CLOSE writes, never a gate broken from the
  // start (which would have died before REVIEWER instead).
  fs.writeFileSync(path.join(host.root, 'always-red.sh'), '#!/usr/bin/env bash\necho ALWAYS_RED_MARKER\nexit 1\n')
  const cfgPath = path.join(host.root, '.claude/spec.config.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  cfg.gateCommand = 'bash always-red.sh'
  fs.writeFileSync(cfgPath, JSON.stringify(cfg))
  const specRel = path.relative(host.root, host.spec)
  execFileSync('git', ['-C', host.root, 'add', specRel, '.claude/spec.config.json', 'always-red.sh'], { encoding: 'utf8' })
  execFileSync('git', ['-C', host.root, 'commit', '-q', '-m', 'close'], { encoding: 'utf8' })

  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 2,
    'a resolved gateCommand exiting non-zero at close must refuse the mark — accepting it would let files CLOSE itself just wrote (here simulating the canonical doc / rules fold) ride the close commit unenforced, exactly the salon-os escape this spec exists to close: ' + r.stdout + r.stderr)
  assert.ok(r.stderr.includes('gate red at close — bash always-red.sh exited 1'),
    'D1/D2: stderr must carry the literal phrase "gate red at close" together with the resolved command and its exit code — the AC\'s own worked example pins this exact substring so a session grepping the refusal always finds the same anchor: ' + r.stderr)
  assert.match(r.stderr, /last 40 lines of gate output/,
    'D2: the refusal must label the tail-of-output block so the session knows what follows is the gate\'s own evidence, not driver prose: ' + r.stderr)
  assert.match(r.stderr, /ALWAYS_RED_MARKER/,
    'D2: the refusal must include the tail of the gate\'s actual output — omitting it leaves the session guessing why the gate failed instead of reading the evidence inline: ' + r.stderr)
  assert.match(r.stderr, /re-run/i,
    'D2: the refusal must name the remedy (fix the flagged files, commit the fix, re-run --mark closed) — an error path without its remedy command is a hard finding under this repo\'s own review rules: ' + r.stderr)
  assert.match(r.stderr, /--mark closed/,
    'D2: the remedy must literally name the re-run command `--mark closed` so the session can retry without re-deriving the mark: ' + r.stderr)

  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'a refused closed mark must leave marks.closed unset and state at CLOSE — advancing here would accept a review whose committed close tree the gate itself rejects: ' + r.stdout + r.stderr)
})

function specBodyNoTestFilePlanRow({ diffBase, acId }) {
  return `---
status: done
tier: standard
diff_base: ${diffBase}
---
# Driver Test Spec (no File Plan test rows)

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | foo() returns 42 (${acId}) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | edit | scripts |

## Acceptance Criteria

- **${acId}**: foo() returns 42.
`
}

test('AC-20260830-02-4: WHEN --mark closed is invoked and gate resolution returns gate:null (gateCommand contains {testDirs}, the spec has no File Plan test rows) THE SYSTEM refuses the mark (exit 2), naming the unresolvable-gate reason and the remedy — never silently skips the check', () => {
  const host = makeHost()
  toReviewer(host)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('rvdrv-gate4-clean', CLEAN_RETURN))
  const dispR = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'setup precondition: a clean zero-survivor disposition must reach CLOSE before the unresolvable-gate refusal can be exercised: ' + dispR.stdout + dispR.stderr)

  // The close commit drops the spec's own File Plan test row while gateCommand still reads
  // 'node --test {testDirs}' (unchanged) — resolution now has nothing to substitute. Per this
  // spec's own Rationale, a real gate:null review leg is already a red row long before close in
  // practice; this is the one reachable synthetic shape of D4's defense-in-depth branch.
  const diffBase = /^diff_base:\s*(\S+)/m.exec(fs.readFileSync(host.spec, 'utf8'))[1]
  fs.writeFileSync(host.spec, specBodyNoTestFilePlanRow({ diffBase, acId: 'AC-20260820-99-1' }))
  const specRel = path.relative(host.root, host.spec)
  execFileSync('git', ['-C', host.root, 'add', specRel], { encoding: 'utf8' })
  execFileSync('git', ['-C', host.root, 'commit', '-q', '-m', 'close (drop File Plan test row)'], { encoding: 'utf8' })

  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 2,
    'an unresolvable {testDirs} gate must refuse the mark exactly like a red gate — silently skipping the check here is the vacuous-green class this spec exists to close: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /no File Plan test rows/,
    'D4: the refusal must name the unresolvable-gate reason "no File Plan test rows" (lib/gate-resolve.js\'s own reason string) so the session knows exactly why {testDirs} could not be substituted: ' + r.stderr)
  assert.match(r.stderr, /--mark closed/,
    'D4: the refusal must still name the re-run remedy (fix the File Plan, then re-run --mark closed) — an error path without its remedy is a hard finding under this repo\'s own review rules: ' + r.stderr)

  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'a refused closed mark must leave marks.closed unset and state at CLOSE — the driver must never silently treat an unresolvable gate as a pass: ' + r.stdout + r.stderr)
})

test('AC-20260820-07-16: the CLOSE step\'s close-commit instruction excludes the sidecar/ledger/retained-evidence paths in a linked worktree but includes them unchanged when running in-place', () => {
  // In-place branch: a plain tmpdir host has no linked worktree, so repoRoot === mainRoot.
  const host = makeHost()
  toReviewer(host)
  const returnFile = returnFileWith('rvdrv-close-inplace', CLEAN_RETURN)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFile)
  const inPlaceR = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE', 'setup: a clean in-place pass must reach CLOSE')
  assert.doesNotMatch(inPlaceR.stdout, /EXCEPT/,
    'an in-place review (repoRoot === mainRoot) must instruct that EVERYTHING rides the close commit — an EXCEPT clause here would wrongly exclude evidence that has nowhere else to be promoted from: ' + inPlaceR.stdout)
  assert.match(inPlaceR.stdout, /Commit everything still uncommitted on the working branch \(never --no-verify\)/,
    'the in-place close-commit line must instruct committing everything uncommitted, unconditionally: ' + inPlaceR.stdout)

  // Linked-worktree branch: the same two-branch fixture AC-20260820-07-12 drives to CLOSE.
  const root = fs.realpathSync(tmpdir('rvdrv-close-wt'))
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
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const baseSha = g('rev-parse', 'HEAD').trim()

  const created = runBash('scripts/merge-back.sh', ['create', '--source', 'spec/99-drv-close-wt', '--root', root])
  assert.strictEqual(created.status, 0, 'setup: worktree creation must succeed: ' + created.stderr)
  const wt = created.stdout.trim().split('\n').pop()

  fs.mkdirSync(path.join(wt, 'specs/20260820'), { recursive: true })
  const spec = path.join(wt, 'specs/20260820/99-drv-close-wt.md')
  fs.writeFileSync(spec, specBody({ diffBase: baseSha, acId: 'AC-20260820-99-6' }).replace('diff_base:', 'build_base:'))
  fs.writeFileSync(path.join(wt, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.mkdirSync(path.join(wt, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(wt, 'tests/foo.test.js'), GREEN_TEST.replace('AC-20260820-99-1', 'AC-20260820-99-6'))
  const gw = (...a) => execFileSync('git', ['-C', wt, ...a], { encoding: 'utf8' })
  gw('add', '-A'); gw('commit', '-q', '-m', 'implement')
  const wtSidecarRel = 'specs/20260820/99-drv-close-wt.review'

  run(wt, spec)
  assert.strictEqual(stateOf(wt, spec), 'REVIEWER', 'setup: the worktree fixture must reach REVIEWER on green legs')
  const wtReturnFile = returnFileWith('rvdrv-close-wt-return', CLEAN_RETURN)
  run(wt, spec, '--mark', 'reviewer-returned', '--file', wtReturnFile)
  const wtR = run(wt, spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(wt, spec), 'CLOSE', 'setup: a clean worktree pass must reach CLOSE')

  assert.match(wtR.stdout, new RegExp('EXCEPT ' + wtSidecarRel.replace(/\//g, '\\/') + '\\/'),
    'a linked-worktree review must name its OWN sidecar path as excluded from the close commit — evidence promotion (only once the merge lands) is what moves it into the main root, not this commit: ' + wtR.stdout)
  assert.match(wtR.stdout, /EXCEPT[^\n]*\.claude\/spec-runs\.jsonl/,
    'the exclusion must name .claude/spec-runs.jsonl — committing the ledger from the worktree now would leave the tree dirty after evidence promotion runs post-merge, per R3\'s "cleanup exits 2 after the merge already landed": ' + wtR.stdout)
  assert.match(wtR.stdout, /EXCEPT[^\n]*\.claude\/spec-runs\//,
    'the exclusion must also name .claude/spec-runs/ (the retained-evidence directory) for the same reason: ' + wtR.stdout)
  assert.doesNotMatch(wtR.stdout, /Commit everything still uncommitted on the working branch \(never --no-verify\) —/,
    'the worktree branch must NOT print the unconditional in-place close-commit line — the two branches must read as genuinely different instructions, not the same text with an aside: ' + wtR.stdout)

  // Clean up: this fixture's worktree is left dangling deliberately (the test never marks
  // closed/merges it) — merge-back.sh has its own idempotent cleanup path and stray worktrees
  // under tmpdir() do not affect other tests, matching this file's existing worktree fixtures.
})
