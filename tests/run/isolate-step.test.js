'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const { read, SPEC, ROOT } = require('../helpers')
const path = require('node:path')

// specs/20260912/03-run-isolates-and-owns-the-stages.md D1-D6: /spec:run gains a Step 0 —
// Isolate that opens the spec's own worktree by executing git/commands/enter-worktree.md's
// Steps 1-3 in-session, and enter-worktree.md gains an already-inside short-circuit plus a
// rewritten opening paragraph naming itself the manual repair surface. AC-20260912-03-1..5.

const RUN_MD = path.join(SPEC, 'commands/run.md')
const ENTER_WORKTREE_MD = path.join(ROOT, 'git/commands/enter-worktree.md')

// ---------------------------------------------------------------------------
// AC-20260912-03-1
// ---------------------------------------------------------------------------

test('AC-20260912-03-1: run.md carries a "## Step 0" heading before "## Routing" whose section states --in-place, the porcelain worktree-list check, the <spec>.build/ sidecar, and a never-fall-back-in-place rule', () => {
  assert.ok(fs.existsSync(RUN_MD), 'setup: spec/commands/run.md must exist for this pin to check anything')
  const doc = read('spec/commands/run.md')
  const step0At = doc.indexOf('## Step 0')
  assert.ok(step0At !== -1,
    'run.md must carry a "## Step 0" heading — Step 0 is where isolation happens, and its absence ' +
    'means the loop still requires a manual /git:enter-worktree wrap before every invocation')
  const routingAt = doc.indexOf('## Routing')
  assert.ok(routingAt !== -1, 'setup: run.md must still carry a "## Routing" heading')
  assert.ok(step0At < routingAt,
    'Step 0 must be positioned ABOVE Routing — isolation must happen before the loop derives ' +
    'which stage to run, or design/build state lands on the wrong tree')
  const end = doc.indexOf('## ', step0At + 3)
  const section = doc.slice(step0At, end === -1 ? doc.length : end)

  assert.ok(section.includes('--in-place'),
    'Step 0 must document --in-place as the opt-out — its absence leaves isolation with no ' +
    'documented escape hatch')
  assert.ok(section.includes('git worktree list --porcelain'),
    'Step 0 must state the porcelain worktree-list check that both distinguishes skip from ' +
    'create and detects an in-flight build with no registered worktree')
  assert.ok(section.includes('<spec>.build/'),
    'Step 0 must name the <spec>.build/ sidecar as the artifact an in-flight build keeps that a ' +
    'fresh worktree would not carry')
  assert.match(section, /never .{0,30}in place/i,
    'Step 0 must state the hard-stop rule in the negative: a worktree that cannot be created must ' +
    'never fall back to running in place')
})

test('AC-20260912-03-1: run.md no longer instructs running /git:enter-worktree <spec> first as a manual pre-step', () => {
  assert.ok(fs.existsSync(RUN_MD), 'setup: spec/commands/run.md must exist for this pin to check anything')
  const doc = read('spec/commands/run.md')
  assert.doesNotMatch(doc, /run\s*`?\/git:enter-worktree <spec>`?\s*first/,
    'run.md must drop the "run /git:enter-worktree <spec> first" sentence — Step 0 now opens the ' +
    'worktree itself, so instructing a manual pre-step is stale prose that contradicts the new default')
})

// ---------------------------------------------------------------------------
// AC-20260912-03-3
// ---------------------------------------------------------------------------

test('AC-20260912-03-3: run.md\'s Step 0 states the past-hardened-with-no-registered-worktree skip in one bullet naming both conditions, both artifacts, and /clear as a case that reaches it', () => {
  assert.ok(fs.existsSync(RUN_MD), 'setup: spec/commands/run.md must exist for this pin to check anything')
  const doc = read('spec/commands/run.md')
  const step0At = doc.indexOf('## Step 0')
  assert.ok(step0At !== -1, 'setup: run.md must carry a "## Step 0" heading for this pin to bound its section')
  const end = doc.indexOf('## ', step0At + 3)
  const section = doc.slice(step0At, end === -1 ? doc.length : end)

  // Bound the single bullet: from the phrase naming the skip condition to the next top-level
  // bullet (or section end), so a stray later mention of `/clear` elsewhere in Step 0 cannot
  // satisfy this pin by accident.
  const skipAt = section.search(/past `?hardened`?/)
  assert.ok(skipAt !== -1,
    'Step 0 must state the skip condition naming a spec past `hardened` — without it a session ' +
    'resuming an in-flight build cannot tell why isolation was skipped')
  const nextBulletAt = section.indexOf('\n- ', skipAt + 1)
  const bullet = section.slice(skipAt, nextBulletAt === -1 ? section.length : nextBulletAt)

  assert.ok(bullet.includes('{worktree}') || /absent/i.test(bullet),
    'the skip bullet must name the second condition — no registered {worktree} — or a spec past ' +
    'hardened with an already-open worktree would wrongly skip re-entry too: ' + bullet)
  assert.ok(bullet.includes('<spec>.build/'),
    'the skip bullet must name the <spec>.build/ sidecar as the artifact a fresh worktree would ' +
    'not carry: ' + bullet)
  assert.match(bullet, /uncommitted/,
    'the skip bullet must name the workers\' uncommitted output as the second artifact a fresh ' +
    'worktree would not carry: ' + bullet)
  assert.match(bullet, /\/clear/,
    'the skip bullet must name /clear as a case that reaches this skip — a resume after /clear is ' +
    'the common path that must not silently restart the build against an empty tree: ' + bullet)
})

// ---------------------------------------------------------------------------
// AC-20260912-03-4
// ---------------------------------------------------------------------------

test('AC-20260912-03-4: enter-worktree.md Step 2 opens with an already-inside short-circuit bullet, ahead of the existing porcelain re-enter bullet', () => {
  assert.ok(fs.existsSync(ENTER_WORKTREE_MD), 'setup: git/commands/enter-worktree.md must exist for this pin to check anything')
  const doc = fs.readFileSync(ENTER_WORKTREE_MD, 'utf8')
  const step2At = doc.search(/^2\.\s*\*\*/m)
  assert.ok(step2At !== -1, 'setup: enter-worktree.md must still carry a numbered Step 2')
  const step3At = doc.search(/^3\.\s*\*\*/m)
  assert.ok(step3At !== -1 && step3At > step2At, 'setup: enter-worktree.md must still carry a numbered Step 3 after Step 2')
  const step2 = doc.slice(step2At, step3At)

  assert.ok(step2.includes('git rev-parse --show-toplevel'),
    'Step 2 must open with a short-circuit checking git rev-parse --show-toplevel — without it a ' +
    'session already inside the worktree re-derives paths and re-runs setup needlessly')
  assert.match(step2, /re-entered/,
    'the short-circuit must report the outcome as "re-entered" — the same word the existing ' +
    'porcelain re-enter path already reports, so both paths read identically to the session')
  assert.match(step2, /no .{0,20}EnterWorktree/i,
    'the short-circuit must state that no EnterWorktree call is made — calling it on the tree the ' +
    'session is already in is a no-op at best and a verification failure at worst')

  const shortCircuitAt = step2.search(/git rev-parse --show-toplevel/)
  const porcelainAt = step2.search(/git worktree list --porcelain/)
  assert.ok(porcelainAt !== -1,
    'setup: Step 2 must still carry the existing porcelain-based re-enter bullet for this pin to order against')
  assert.ok(shortCircuitAt < porcelainAt,
    'the already-inside short-circuit must be positioned BEFORE the existing porcelain re-enter ' +
    'bullet — it is the common /clear-resume case and must be checked first')
})

// ---------------------------------------------------------------------------
// AC-20260912-03-5
// ---------------------------------------------------------------------------

test('AC-20260912-03-5: enter-worktree.md drops the "pipeline runs in place" claim and states itself as the manual repair surface within its first 20 lines', () => {
  assert.ok(fs.existsSync(ENTER_WORKTREE_MD), 'setup: git/commands/enter-worktree.md must exist for this pin to check anything')
  const doc = fs.readFileSync(ENTER_WORKTREE_MD, 'utf8')
  assert.ok(!doc.includes('the pipeline runs **in place** on the current branch'),
    'enter-worktree.md must no longer claim the pipeline runs in place when this command is never ' +
    'run — /spec:run\'s Step 0 now opens the worktree itself, so the claim is false')
  const first20 = doc.split('\n').slice(0, 20).join('\n')
  assert.match(first20, /repair|manual/i,
    'enter-worktree.md must state within its first 20 lines that it is now the manual repair ' +
    'surface — without this, a reader still finds the old "required pre-step" framing first')
})
