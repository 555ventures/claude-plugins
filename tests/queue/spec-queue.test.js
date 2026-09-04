'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync, spawn } = require('node:child_process')
const { tmpdir, runNode, gitRepo, SPEC } = require('../helpers')

// specs/20260823/08-derived-session-queue.md: the queue this spec exists for —
// the intended work order plus free-text items and their done-when predicates — lives in ONE
// file, `spec-queue.json`, resolved via `git -C <root> rev-parse --git-common-dir` so every
// linked worktree of a repo shares it and it never appears in `git status` (D1, executed spike
// A1). All writes to that file are owned by `spec/scripts/spec-queue.js`; doneness for both item
// kinds is evaluated by the single shared derivation `spec/scripts/lib/queue.js` (D5, D6, D14) —
// never a second place that decides whether an item is done. This file pins the write-path CLI
// behavior directly: common-dir placement, predicate evaluation, and manual ticks.
//
// specs/20260903/03-pipeline-queue-mechanics.md retools the write path on top of that: a third
// `spec` item kind (D1), an optional `after` gate on any item (D2), append-last reconcile with
// no `auto_placed` stamp and no veto notice (D4), first-occurrence dedupe of duplicate brief/spec
// items on every write (D5), a shrunk five-verb set (`next|list|add|move|done`) where `bump`,
// `defer`, `ok`, `add --after`, and `add --brief` all exit 2 naming their D6 replacement, and
// `move <ref> <n>` counting pending positions exactly as `list` prints them (D7). The
// AC-20260823-08-8/-10 tests below (dependency-parent auto-placement, `bump`) pinned behavior
// this spec deliberately retires — they are rewritten in place to the new placed-last/`move`
// behavior and retagged, never left red; AC-20260823-08-5/-6/-7/-9 are retagged in place as
// continuation pins (D9).

const SCRIPT = 'scripts/spec-queue.js'

// Host factory: a real git repo (spec-queue.js requires one — exit 3 "not a git repository"
// otherwise) optionally carrying roadmap briefs, specs, a ledger, and a pre-seeded queue file
// written directly at <repo>/.git/spec-queue.json — the exact location D1 pins, so fixtures that
// need to control queue contents precisely (baselines, auto_placed stamps) never depend on `add`'s
// own payload-classification behavior.
function host({ briefs = {}, specs = {}, ledgerRows = null, queue = null } = {}) {
  const dir = fs.realpathSync(tmpdir('spec-queue'))
  gitRepo(dir)
  if (Object.keys(briefs).length) {
    fs.mkdirSync(path.join(dir, 'docs/roadmap'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'docs/roadmap/00-overview.md'),
      '# X Roadmap — Overview\n\n## Sequence\n\n| #  | Brief | Phase | Depends on |\n|---|---|---|---|\n')
    for (const [file, header] of Object.entries(briefs)) {
      fs.writeFileSync(path.join(dir, 'docs/roadmap', file), header)
    }
  }
  for (const [file, fm] of Object.entries(specs)) {
    const p = path.join(dir, 'specs', file)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, '---\n' + fm + '\n---\n\n# spec\n')
  }
  if (ledgerRows) {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.claude/spec-runs.jsonl'),
      ledgerRows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  }
  if (queue) {
    fs.writeFileSync(path.join(dir, '.git/spec-queue.json'),
      JSON.stringify({ version: 1, seq: queue.length, items: queue }, null, 2))
  }
  return dir
}

function readQueue(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, '.git/spec-queue.json'), 'utf8'))
}

test('AC-20260823-08-1: spec-queue add writes spec-queue.json inside the git common directory, readable and git-status-clean from a linked worktree', () => {
  const root = fs.realpathSync(tmpdir('queue-common'))
  gitRepo(root)
  const wt = path.join(root, '.claude/worktrees/w1')
  execFileSync('git', ['-C', root, 'worktree', 'add', '-q', '-b', 'w1-branch', wt, 'HEAD'])

  const r = runNode(SCRIPT, ['add', '15'], { cwd: root })
  assert.strictEqual(r.status, 0, 'spec-queue add must succeed in an ordinary main checkout: ' + r.stdout + r.stderr)

  const queuePath = path.join(root, '.git/spec-queue.json')
  assert.ok(fs.existsSync(queuePath),
    'D1: the queue file must be written at <repo>/.git/spec-queue.json (the git common directory), never inside the checkout — an in-checkout file diverges per worktree and pollutes git status: ' + r.stdout)

  const commonFromWt = execFileSync('git', ['-C', wt, 'rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim()
  const resolvedCommon = path.isAbsolute(commonFromWt) ? commonFromWt : path.resolve(wt, commonFromWt)
  assert.strictEqual(resolvedCommon, path.join(root, '.git'),
    "the worktree's own --git-common-dir must resolve to the main checkout's .git — this is the exact mechanism (A1) that lets both trees share one queue file")

  const rList = runNode(SCRIPT, ['list'], { cwd: wt })
  assert.match(rList.stdout, /15/,
    'an item added from the main checkout must be visible when spec-queue runs from the linked worktree — proof both trees read the same file, not a per-worktree copy: ' + rList.stdout + rList.stderr)

  const statusRoot = execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' })
  assert.strictEqual(statusRoot.trim(), '',
    'the queue file living inside .git/ must never surface in the main checkout\'s git status --porcelain: ' + statusRoot)
  const statusWt = execFileSync('git', ['-C', wt, 'status', '--porcelain'], { encoding: 'utf8' })
  assert.strictEqual(statusWt.trim(), '',
    'the queue file must stay invisible to git status --porcelain from the linked worktree too: ' + statusWt)
})

test('AC-20260903-03-1: spec-queue add <spec path> --top queues a `spec` item at position 0, and spec-status --next picks that spec over the previously-top brief', () => {
  const dir = host({
    briefs: { '05-x.md': '# 05 — X\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n' },
    specs: {
      '20260701/01-brief.md': 'date: 2026-07-01\nstatus: hardened\nbrief: 05',
      '20260701/02-fix.md': 'date: 2026-07-01\nstatus: hardened\nbrief: n/a',
    },
    queue: [{ id: 'q1', kind: 'brief', brief: '05', added: '2026-08-23T10:00:00Z' }],
  })
  const before = runNode('scripts/spec-status.js', ['--root', dir, '--next'])
  assert.strictEqual(before.status, 0, before.stderr)
  assert.match(before.stdout, /01-brief\.md/,
    "before the add, brief 05's spec must be the top pick — proof that the fix spec's later win is caused by the add, not a fixture artifact: " + before.stdout)

  const rAdd = runNode(SCRIPT, ['add', 'specs/20260701/02-fix.md', '--top'], { cwd: dir })
  assert.strictEqual(rAdd.status, 0, 'D1: spec-queue add of an existing hardened spec path with --top must succeed: ' + rAdd.stdout + rAdd.stderr)

  const q = readQueue(dir)
  assert.strictEqual(q.items[0].kind, 'spec',
    'D1: --top of a spec path must write a {kind:"spec"} item at index 0, or "this fix goes first" never actually happens: ' + JSON.stringify(q.items))
  assert.strictEqual(q.items[0].spec, 'specs/20260701/02-fix.md',
    'D1: the written spec item must carry the exact repo-relative path given on the command line: ' + JSON.stringify(q.items[0]))

  const after = runNode('scripts/spec-status.js', ['--root', dir, '--next'])
  assert.strictEqual(after.status, 0, after.stderr)
  assert.strictEqual(after.stdout.trim(), '🎯 Next\n/spec:run @specs/20260701/02-fix.md',
    'D1: once queued at --top, the fix spec must be the printed --next top pick, overriding brief 05\'s own queued position: ' + after.stdout)

  const j = JSON.parse(runNode('scripts/spec-status.js', ['--root', dir, '--next', '--json']).stdout)
  assert.strictEqual(j.next[0].path, 'specs/20260701/02-fix.md',
    'D1: --next --json next[0].path must be the queued fix spec, not brief 05\'s spec: ' + JSON.stringify(j.next))
})

test('AC-20260903-03-5: a queue file holding a brief item and a spec item twice each collapses to the first occurrence on any write subcommand, stripping any auto_placed key, and `list` already renders the dedupe read-only', () => {
  const dir = host({
    specs: { '20260903/hotfix.md': 'date: 2026-09-03\nstatus: draft' },
    queue: [
      { id: 'q1', kind: 'brief', brief: '21', added: '2026-08-23T10:00:00Z' },
      { id: 'q2', kind: 'brief', brief: '08', added: '2026-08-23T10:01:00Z' },
      { id: 'q3', kind: 'brief', brief: '21', auto_placed: '2026-08-23T10:02:00Z' },
      { id: 'q4', kind: 'spec', spec: 'specs/20260903/hotfix.md', added: '2026-08-23T10:03:00Z' },
      { id: 'q5', kind: 'spec', spec: 'specs/20260903/hotfix.md', added: '2026-08-23T10:04:00Z' },
    ],
  })
  const rList = runNode(SCRIPT, ['list'], { cwd: dir })
  assert.strictEqual(rList.status, 0, rList.stderr)
  const brief21Lines = rList.stdout.split('\n').filter((l) => /\bbrief 21\b/.test(l))
  assert.strictEqual(brief21Lines.length, 1,
    'D5: `list` virtually reconciles too — brief 21 must render exactly once even before any write subcommand has ever run the persisted dedupe: ' + rList.stdout)

  const rDone = runNode(SCRIPT, ['done', '08'], { cwd: dir })
  assert.strictEqual(rDone.status, 0, rDone.stderr)

  const q = readQueue(dir)
  assert.strictEqual(q.items.length, 3,
    'D5: a write subcommand must collapse both duplicate pairs to their first occurrence, leaving exactly 3 items (21, 08, the spec): ' + JSON.stringify(q.items))
  assert.deepStrictEqual(q.items.filter((i) => i.kind === 'brief').map((i) => i.brief), ['21', '08'],
    'D5: the brief-21 duplicate must collapse to its first occurrence, in original order: ' + JSON.stringify(q.items))
  assert.strictEqual(q.items.filter((i) => i.kind === 'spec').length, 1,
    'D5: the duplicate spec item must collapse to its first occurrence: ' + JSON.stringify(q.items))
  assert.ok(q.items.every((i) => !('auto_placed' in i)),
    'D5: no item may retain an auto_placed key after any write subcommand strips it: ' + JSON.stringify(q.items))
})

test('AC-20260903-03-6: spec-queue add refuses a brief already queued, naming its pending position and the move remedy, and writes nothing', () => {
  const dir = host({
    queue: [
      { id: 'q1', kind: 'prompt', payload: 'ship the landing page', added: '2026-08-23T10:00:00Z' },
      { id: 'q2', kind: 'brief', brief: '21', added: '2026-08-23T10:01:00Z' },
    ],
  })
  const before = fs.readFileSync(path.join(dir, '.git/spec-queue.json'), 'utf8')
  const r = runNode(SCRIPT, ['add', '21'], { cwd: dir })
  assert.strictEqual(r.status, 2, 'D5: adding an already-queued brief must exit 2, never silently queue a second copy: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /already queued at position 2/,
    'D5: the refusal must name the exact pending position the brief already occupies: ' + r.stderr)
  assert.match(r.stderr, /spec-queue move 21/,
    'D5: the refusal must name the move remedy so the caller can reorder instead of re-adding: ' + r.stderr)
  const after = fs.readFileSync(path.join(dir, '.git/spec-queue.json'), 'utf8')
  assert.strictEqual(after, before,
    'D5: a refused add must leave the queue file byte-identical — no partial write on a usage refusal: ' + after)
})

test('AC-20260903-03-9: the retired bump/defer/ok verbs and the retired add flags all exit 2 naming their D6 replacement, writing nothing', () => {
  const dir = host({ queue: [{ id: 'q1', kind: 'brief', brief: '05', added: '2026-08-23T10:00:00Z' }] })
  const before = fs.readFileSync(path.join(dir, '.git/spec-queue.json'), 'utf8')

  const cases = [
    { argv: ['bump', '05'], mustMatch: /spec-queue move 05 1/ },
    { argv: ['defer', '05'], mustMatch: /spec-queue move 05/ },
    { argv: ['ok'], mustMatch: /no accept step/ },
    { argv: ['add', 'x', '--after', 'q1'], mustMatch: /--at <n>/ },
    { argv: ['add', '--brief', '05'], mustMatch: /pass the brief number as the payload/ },
  ]
  for (const { argv, mustMatch } of cases) {
    const r = runNode(SCRIPT, argv, { cwd: dir })
    assert.strictEqual(r.status, 2,
      `D6: \`spec-queue ${argv.join(' ')}\` must exit 2 — a removed verb or flag that still acts silently reintroduces vocabulary the fleet grep found no reader of: ` + r.stdout + r.stderr)
    assert.match(r.stderr, mustMatch,
      `D6: \`spec-queue ${argv.join(' ')}\`'s refusal must name its replacement (${mustMatch}), or the caller has no path forward: ` + r.stderr)
  }
  const after = fs.readFileSync(path.join(dir, '.git/spec-queue.json'), 'utf8')
  assert.strictEqual(after, before,
    'D6: none of the five removed-verb/flag invocations may write the queue file: ' + after)
})

test('AC-20260903-03-11: spec-queue add --after-spec/--after-brief refuses a missing target at add time, and a gate whose target later disappears reports (missing) rather than releasing the item', () => {
  const dirA = host({})
  const rSpec = runNode(SCRIPT, ['add', 'x', '--after-spec', 'specs/nope.md'], { cwd: dirA })
  assert.strictEqual(rSpec.status, 2, 'D2: add --after-spec of a nonexistent spec must exit 2, never silently write an ungated or wrongly-gated item: ' + rSpec.stdout + rSpec.stderr)
  assert.match(rSpec.stderr, /specs\/nope\.md/, 'the refusal must name the missing target: ' + rSpec.stderr)
  assert.ok(!fs.existsSync(path.join(dirA, '.git/spec-queue.json')),
    'a refused add must write nothing at all — the queue file must not even be created')

  const dirB = host({})
  const rBrief = runNode(SCRIPT, ['add', 'x', '--after-brief', '99'], { cwd: dirB })
  assert.strictEqual(rBrief.status, 2, 'D2: add --after-brief of a nonexistent brief must exit 2: ' + rBrief.stdout + rBrief.stderr)
  assert.match(rBrief.stderr, /99/, 'the refusal must name the missing brief: ' + rBrief.stderr)

  const dirC = host({ specs: { '20260701/01-a.md': 'date: 2026-07-01\nstatus: hardened' } })
  const rAdd = runNode(SCRIPT, ['add', 'ship it', '--after-spec', 'specs/20260701/01-a.md'], { cwd: dirC })
  assert.strictEqual(rAdd.status, 0, rAdd.stderr)
  fs.unlinkSync(path.join(dirC, 'specs/20260701/01-a.md'))
  const j = JSON.parse(runNode('scripts/spec-status.js', ['--root', dirC, '--next', '--json']).stdout)
  const gated = j.next.find((e) => e.action === 'ship it')
  assert.ok(gated, 'the gated prompt must still surface as its own --next entry once its target spec vanishes: ' + JSON.stringify(j.next))
  assert.deepStrictEqual(gated.blockers, ['after specs/20260701/01-a.md (missing)'],
    'D2: a deleted gate target must keep the item not-ready with a (missing) state, never silently release it: ' + JSON.stringify(gated))
})

test('AC-20260903-03-8: spec-queue list renders exactly the numbered pending format with an after-gate marker and a done-count footer, or the empty-pending line', () => {
  function listHost(withPending) {
    return host({
      briefs: {
        '24-status-and-queue-diet.md': '# 24 — Status and queue diet\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n',
        '20-a.md': '# 20 — A\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n',
        '21-b.md': '# 21 — B\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n',
      },
      specs: {
        '20260701/01-x.md': 'date: 2026-07-01\nstatus: done\nbrief: 20',
        '20260701/02-x.md': 'date: 2026-07-01\nstatus: done\nbrief: 21',
        '20260903/04-reports-write-the-queue.md': 'date: 2026-09-03\nstatus: hardened',
        '20260903/06-hotfix.md': 'date: 2026-09-03\nstatus: draft',
      },
      queue: [
        ...(withPending ? [
          { id: 'q1', kind: 'brief', brief: '24', added: '2026-09-03T10:00:00Z' },
          { id: 'q2', kind: 'prompt', payload: '/spec:plan @docs/roadmap/26-x.md', after: { spec: 'specs/20260903/04-reports-write-the-queue.md' }, added: '2026-09-03T10:01:00Z' },
          { id: 'q3', kind: 'spec', spec: 'specs/20260903/06-hotfix.md', added: '2026-09-03T10:02:00Z' },
        ] : []),
        { id: 'q4', kind: 'brief', brief: '20', added: '2026-09-03T10:03:00Z' },
        { id: 'q5', kind: 'brief', brief: '21', added: '2026-09-03T10:04:00Z' },
      ],
    })
  }

  const dirPending = listHost(true)
  const rPending = runNode(SCRIPT, ['list'], { cwd: dirPending })
  assert.strictEqual(rPending.status, 0, rPending.stderr)
  assert.strictEqual(rPending.stdout.trim(),
    '1  brief 24 (status-and-queue-diet)\n' +
    '2  /spec:plan @docs/roadmap/26-x.md  ⏳ after specs/20260903/04-reports-write-the-queue.md (hardened)\n' +
    '3  spec specs/20260903/06-hotfix.md\n' +
    '— 2 done · move: spec-queue move <ref> <n>',
    'D8: `list` must render exactly this literal — numbered pending items only, the gated prompt carrying its ⏳ blocker marker, and a footer naming the done count and the move remedy: ' + rPending.stdout)

  const dirEmpty = listHost(false)
  const rEmpty = runNode(SCRIPT, ['list'], { cwd: dirEmpty })
  assert.strictEqual(rEmpty.status, 0, rEmpty.stderr)
  assert.strictEqual(rEmpty.stdout.trim(), '✨ nothing pending · 2 done',
    'D8: with nothing pending, `list` must print exactly this one line, never an empty pending section with just a footer: ' + rEmpty.stdout)
})

test('AC-20260823-08-5 / AC-20260903-03-10: a ledger-count predicate completes an item at current-minus-baseline >= min and leaves it undone one row short', () => {
  const buildRows = (n) => Array.from({ length: n }, (_, i) => ({ ts: '2026-08-2' + ((i % 9) + 1), stage: 'build', spec: 'specs/x/y.md' }))
  const queue = [
    { id: 'q1', kind: 'prompt', payload: 'do host work',
      when: { type: 'ledger-count', stage: 'build', min: 2, baseline: 3 }, added: '2026-08-23T10:00:00Z' },
    { id: 'q2', kind: 'prompt', payload: 'ship the landing page', added: '2026-08-23T10:05:00Z' },
  ]

  const doneDir = host({ ledgerRows: buildRows(5), queue })
  const rDone = runNode(SCRIPT, ['next'], { cwd: doneDir })
  assert.strictEqual(rDone.status, 0, rDone.stderr)
  assert.match(rDone.stdout, /ship the landing page/,
    'D5: 5 − 3 = 2 ≥ min 2 — the ledger-count item must be treated done and skipped, surfacing q2 as the top undone item: ' + rDone.stdout)
  assert.doesNotMatch(rDone.stdout, /do host work/,
    'a completed ledger-count item must never itself print as the top pick again: ' + rDone.stdout)

  const notDoneDir = host({ ledgerRows: buildRows(4), queue })
  const rNotDone = runNode(SCRIPT, ['next'], { cwd: notDoneDir })
  assert.strictEqual(rNotDone.status, 0, rNotDone.stderr)
  assert.match(rNotDone.stdout, /do host work/,
    'D5: 4 − 3 = 1 < min 2 — one row short of the threshold, the item must remain undone and stay the top pick: ' + rNotDone.stdout)
})

test('AC-20260823-08-6 / AC-20260903-03-10: a brief item whose brief is fully done is skipped by next with no done flag ever stored on the item itself', () => {
  const dir = host({
    briefs: { '05-x.md': '# 05 — X\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n' },
    specs: { '20260701/01-x.md': 'date: 2026-07-01\nstatus: done\nbrief: 05' },
    queue: [
      { id: 'q1', kind: 'brief', brief: '05', added: '2026-08-23T10:00:00Z' },
      { id: 'q2', kind: 'prompt', payload: 'ship the landing page', added: '2026-08-23T10:05:00Z' },
    ],
  })
  const before = readQueue(dir)
  const r = runNode(SCRIPT, ['next'], { cwd: dir })
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /ship the landing page/,
    'brief 05 is all-done — next must skip its item and print the one below it: ' + r.stdout)
  const after = readQueue(dir)
  const beforeItem = before.items.find((i) => i.id === 'q1')
  const afterItem = after.items.find((i) => i.id === 'q1')
  assert.deepStrictEqual(afterItem, beforeItem,
    "D4: a brief item's doneness is derived live from spec-status, never stored as a flag on the item itself — the on-disk q1 item must come back byte-identical after next: " + JSON.stringify({ before: beforeItem, after: afterItem }))
})

test('AC-20260823-08-7 / AC-20260903-03-10: spec-queue done stamps an ISO ticked timestamp on the referenced item, and subsequent next runs skip it', () => {
  const dir = host({
    queue: [
      { id: 'q1', kind: 'prompt', payload: 'ship the landing page', added: '2026-08-23T10:00:00Z' },
      { id: 'q2', kind: 'prompt', payload: 'work the host-repo spec backlog', added: '2026-08-23T10:05:00Z' },
    ],
  })
  const rDone = runNode(SCRIPT, ['done', 'q1'], { cwd: dir })
  assert.strictEqual(rDone.status, 0, rDone.stderr)
  const item = readQueue(dir).items.find((i) => i.id === 'q1')
  assert.ok(item && item.ticked, 'D14: spec-queue done must stamp a `ticked` field on the item in the queue file itself — a tick is a decision and the file stores decisions: ' + JSON.stringify(item))
  assert.match(item.ticked, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    'the ticked stamp must be a real ISO-8601 timestamp, not a boolean or placeholder string: ' + JSON.stringify(item))

  const rNext = runNode(SCRIPT, ['next'], { cwd: dir })
  assert.strictEqual(rNext.status, 0, rNext.stderr)
  assert.match(rNext.stdout, /work the host-repo spec backlog/,
    'a manually ticked item with no `when` predicate must be skipped, surfacing the item below it: ' + rNext.stdout)
  assert.doesNotMatch(rNext.stdout, /ship the landing page/,
    'a ticked item must never print again as the top undone pick: ' + rNext.stdout)
})

// Rewritten in place (never left red) — specs/20260903/03-pipeline-queue-mechanics.md D4
// retires the dependency-aware auto-placement and its veto notice this test pinned; the
// replacement rule is append-last, silent, unstamped.
test('AC-20260903-03-4 (was AC-20260823-08-8): an on-disk brief missing from the queue is appended LAST on `spec-queue next`, never inserted after its Depends-on parent, with no auto_placed stamp or notice', () => {
  const dir = host({
    briefs: {
      '15-a.md': '# 15 — A\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n',
      '15a-b.md': '# 15a — B\n\nPhase: P0 · Depends on: 15 · Primary workspaces: api\n',
      '16-c.md': '# 16 — C\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n',
    },
    queue: [
      { id: 'q1', kind: 'brief', brief: '15', added: '2026-08-23T10:00:00Z' },
      { id: 'q2', kind: 'brief', brief: '16', added: '2026-08-23T10:01:00Z' },
    ],
  })
  const r = runNode(SCRIPT, ['next'], { cwd: dir })
  assert.strictEqual(r.status, 0, r.stderr)
  assert.doesNotMatch(r.stdout, /auto-queued/,
    'D4: placement is silent now — a printed line naming an auto-queued brief means the retired veto/accept notice mechanism is still firing: ' + r.stdout)

  const q = readQueue(dir)
  const briefs = q.items.filter((i) => i.kind === 'brief').map((i) => i.brief)
  assert.deepStrictEqual(briefs, ['15', '16', '15a'],
    "D4: 15a must land LAST, in roadmap order, never inserted after its Depends-on parent 15 (the retired dependency-aware placement) — got: " + JSON.stringify(briefs))
  const item15a = q.items.find((i) => i.brief === '15a')
  assert.ok(item15a && !('auto_placed' in item15a),
    'D4: no item may ever carry an auto_placed key — a silently-inserted brief must be indistinguishable from a deliberately queued one: ' + JSON.stringify(item15a))

  const jStatus = JSON.parse(runNode('scripts/spec-status.js', ['--root', dir, '--json']).stdout)
  assert.ok(!jStatus.anomalies.some((a) => a.kind === 'queue-auto-placed'),
    'D4: the queue-auto-placed anomaly kind must be deleted from spec-status.js — a surviving entry means the retired mechanism still fires: ' + JSON.stringify(jStatus.anomalies))
})

test('AC-20260823-08-9 / AC-20260903-03-10: spec-queue next with no queue file seeds every non-done brief in roadmap order, zero auto_placed stamps, one summary line', () => {
  const dir = host({
    briefs: {
      '05-a.md': '# 05 — A\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n',
      '08-b.md': '# 08 — B\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n',
      '15-c.md': '# 15 — C\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n',
    },
  })
  assert.ok(!fs.existsSync(path.join(dir, '.git/spec-queue.json')),
    'test fixture bug: no queue file must exist before this test invokes next')

  const r = runNode(SCRIPT, ['next'], { cwd: dir })
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /seeded queue with 3 briefs \(roadmap order\)/,
    'D7: seeding an absent queue file must print exactly this one summary line, or a first-run adoption looks like silence: ' + r.stdout)
  const summaryLines = r.stdout.split('\n').filter((l) => /^seeded queue/.test(l))
  assert.strictEqual(summaryLines.length, 1,
    'D7: the seeding summary must print exactly once, never once per seeded brief — three briefs seeded would otherwise print three lines: ' + r.stdout)

  const q = readQueue(dir)
  const briefs = q.items.filter((i) => i.kind === 'brief').map((i) => i.brief)
  assert.deepStrictEqual(briefs, ['05', '08', '15'],
    'D7: seeding must order the briefs exactly as roadmap order: ' + JSON.stringify(briefs))
  assert.ok(q.items.every((i) => !i.auto_placed),
    'D7: seeding must stamp zero items auto_placed — the queue is opt-in adoption, not an automatic placement that needs a veto: ' + JSON.stringify(q.items))
})

// Rewritten in place (never left red) — specs/20260903/03-pipeline-queue-mechanics.md D6
// retires `bump`; `move <ref> <n>` is the whole reorder API (D7), counting pending positions
// exactly as `list` numbers them (done items keep their relative slots, undone-but-not-ready
// items still count as pending).
function moveHost() {
  return host({
    queue: [
      { id: 'q1', kind: 'prompt', payload: 'task A', added: '2026-08-23T10:00:00Z' },
      { id: 'q2', kind: 'prompt', payload: 'task DONE', ticked: '2026-08-23T09:00:00Z', added: '2026-08-23T10:01:00Z' },
      { id: 'q3', kind: 'prompt', payload: 'task B', added: '2026-08-23T10:02:00Z' },
      { id: 'q4', kind: 'prompt', payload: 'task C', added: '2026-08-23T10:03:00Z' },
    ],
  })
}

test('AC-20260903-03-7: spec-queue move <ref> <n> counts pending positions as `list` prints them, done items keep their relative slot, and out-of-range n\'s are handled per D7', () => {
  // move C 1 — C jumps to the very front of the PENDING order; the done item between A and B
  // must stay between them (relative slots preserved), never get pushed around by the move.
  const dirFront = moveHost()
  const rFront = runNode(SCRIPT, ['move', 'task C', '1'], { cwd: dirFront })
  assert.strictEqual(rFront.status, 0, 'D7: `move <ref> 1` must succeed for a pending item: ' + rFront.stdout + rFront.stderr)
  const listFront = runNode(SCRIPT, ['list'], { cwd: dirFront })
  assert.strictEqual(listFront.stdout.split('\n').filter((l) => l.trim()).slice(0, 3).join('\n'),
    '1  task C\n2  task A\n3  task B',
    "D7: after `move C 1`, `list` must number pending items exactly [C, A, B] — the done item sinks out of the pending numbering entirely: " + listFront.stdout)

  // move C 9 (beyond the pending count) appends last.
  const dirLast = moveHost()
  const rLast = runNode(SCRIPT, ['move', 'task C', '9'], { cwd: dirLast })
  assert.strictEqual(rLast.status, 0, 'D7: `move <ref> <n>` with n beyond the pending count must succeed by appending last, never refuse: ' + rLast.stdout + rLast.stderr)
  const listLast = runNode(SCRIPT, ['list'], { cwd: dirLast })
  assert.strictEqual(listLast.stdout.split('\n').filter((l) => l.trim()).slice(0, 3).join('\n'),
    '1  task A\n2  task B\n3  task C',
    'D7: `move C 9` (n >= pending count) must place C LAST among pending items, never error and never leave it where it was: ' + listLast.stdout)

  // move C 0 is out of range (< 1) — exit 2, write nothing.
  const dirZero = moveHost()
  const beforeZero = fs.readFileSync(path.join(dirZero, '.git/spec-queue.json'), 'utf8')
  const rZero = runNode(SCRIPT, ['move', 'task C', '0'], { cwd: dirZero })
  assert.strictEqual(rZero.status, 2, 'D7: `move <ref> 0` is out of range (n < 1) and must exit 2, never silently no-op success: ' + rZero.stdout + rZero.stderr)
  assert.strictEqual(fs.readFileSync(path.join(dirZero, '.git/spec-queue.json'), 'utf8'), beforeZero,
    'D7: a refused move (n < 1) must leave the queue file byte-identical')

  // move <the done item> 1 — resolving a <ref> that matches only a done item exits 2 "already done".
  const dirDone = moveHost()
  const rDone = runNode(SCRIPT, ['move', 'task DONE', '1'], { cwd: dirDone })
  assert.strictEqual(rDone.status, 2, 'D7: moving a <ref> that resolves only to an already-done item must exit 2, never move a done item into the pending order: ' + rDone.stdout + rDone.stderr)
  assert.match(rDone.stderr, /already done/,
    'D7: the refusal must say "already done" so the caller understands why the ref was rejected: ' + rDone.stderr)
})

// A /spec:review of specs/20260823/08-derived-session-queue.md, second repair round:
// writeQueue's atomic temp-file+rename fix (see its header comment in spec-queue.js) stays, but
// this test's own evidence claim was overstated and is corrected here. It does NOT discriminate a
// plain-fs.writeFileSync revert: a second review repro reconstructed the real pre-fix writeQueue
// (plus its full lib/ + spec-status.js dependency set) and raced it ~250 times — this test's own
// 12-way x 6-trial config, 200 trials at 12-way, and 25 trials at 48-way, all at realistic ~196KB
// payloads — with ZERO corruptions on macOS/APFS (this repo's own test filesystem). A tearing
// defect at this queue file's realistic size is not reachable on this filesystem, so a revert to
// the unsafe single-write would still pass this test green here. What this test DOES discriminate:
// (1) a regression to a FIXED (non-pid-discriminated) temp filename, where two writers cross-rename
// each other's half-written temp file into place; (2) a temp file placed on a different filesystem
// than QUEUE_PATH (rename across filesystems is never atomic, and would surface as ENOTEMPTY/EXDEV
// failures or a missing/malformed final file under this same concurrent load); (3) lockfile- or
// EEXIST-style concurrency crashes that leave the file missing or malformed; and (4) the pre-fix
// tearing defect itself, on any future CI runner or filesystem where the >196KB threshold IS
// reachable. Read this as a concurrent-invocation safety pin, not a corruption regression pin.
test('AC-20260823-08-review-concurrent-writer-safety: N concurrent spec-queue invocations racing writes against one shared queue file all succeed and never leave it unparseable', async () => {
  const CONCURRENCY = 12
  const TRIALS = 6
  const SCRIPT_PATH = path.join(SPEC, 'scripts/spec-queue.js')

  const items = Array.from({ length: CONCURRENCY }, (_, i) => ({
    id: `q${i + 1}`, kind: 'prompt', payload: `race item ${i + 1}`, added: '2026-08-23T10:00:00Z',
  }))
  const dirPath = fs.realpathSync(tmpdir('spec-queue-race'))
  gitRepo(dirPath)
  fs.writeFileSync(path.join(dirPath, '.git/spec-queue.json'),
    JSON.stringify({ version: 1, seq: items.length, items }, null, 2))

  // Retargeted from `bump` (retired by specs/20260903/03-pipeline-queue-mechanics.md D6) to
  // `done` — still a live write subcommand, still races CONCURRENCY writers against the same
  // shared queue file, preserving this test's own concurrency-safety intent.
  function spawnOne(id) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [SCRIPT_PATH, 'done', id], { cwd: dirPath })
      let stderr = ''
      child.stderr.on('data', (d) => { stderr += d })
      child.on('error', reject)
      child.on('exit', (code) => resolve({ id, code, stderr }))
    })
  }

  for (let t = 0; t < TRIALS; t++) {
    // Launch all CONCURRENCY processes together (spawn, not spawnSync) so their writes genuinely
    // overlap in wall-clock time — a sequential loop of spawnSync calls would never race.
    const results = await Promise.all(items.map((it) => spawnOne(it.id)))

    const failed = results.filter((r) => r.code !== 0)
    assert.strictEqual(failed.length, 0,
      `trial ${t}: every concurrent \`done\` child must exit 0 — a nonzero exit is the most likely symptom of a torn read under real tearing (a child observing a partial file and exiting 2), and a test that only checks the FINAL file's shape would still pass green while children were silently failing: ${JSON.stringify(failed)}`)

    const raw = fs.readFileSync(path.join(dirPath, '.git/spec-queue.json'), 'utf8')
    let parsed
    assert.doesNotThrow(() => { parsed = JSON.parse(raw) },
      `trial ${t}: ${CONCURRENCY} concurrent writers left spec-queue.json unparseable — writeQueue's temp-file+rename must guarantee a reader never observes a partial write: ${raw}`)
    assert.ok(parsed && Array.isArray(parsed.items) && typeof parsed.seq === 'number',
      `trial ${t}: the queue file must still match the {version, seq, items} shape after concurrent writes, or every spec-queue subcommand starts exiting 2: ${raw}`)
    assert.strictEqual(parsed.items.length, CONCURRENCY,
      `trial ${t}: concurrent done-ticks must never drop or duplicate items — only mark them (last-writer-safe, not last-writer-lossy): ${raw}`)
  }
})
