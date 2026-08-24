'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260823/08-derived-session-queue.md (2026-08-23): the queue this spec exists for —
// JJ's intended work order plus free-text items and their done-when predicates — lives in ONE
// file, `spec-queue.json`, resolved via `git -C <root> rev-parse --git-common-dir` so every
// linked worktree of a repo shares it and it never appears in `git status` (D1, executed spike
// A1). All writes to that file are owned by `spec/scripts/spec-queue.js`; doneness for both item
// kinds is evaluated by the single shared derivation `spec/scripts/lib/queue.js` (D5, D6, D14) —
// never a second place that decides whether an item is done. This file pins the write-path CLI
// behavior directly: common-dir placement, predicate evaluation, manual ticks, and the
// reconcile/seed/bump mechanics that make an automatic placement always vetoable, never silent.

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

test('AC-20260823-08-5: a ledger-count predicate completes an item at current-minus-baseline >= min and leaves it undone one row short', () => {
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

test('AC-20260823-08-6: a brief item whose brief is fully done is skipped by next with no done flag ever stored on the item itself', () => {
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

test('AC-20260823-08-7: spec-queue done stamps an ISO ticked timestamp on the referenced item, and subsequent next runs skip it', () => {
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

test('AC-20260823-08-8: a brief on disk but not in the queue auto-places immediately after its Depends-on parent, stamped auto_placed, with one veto notice', () => {
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
  assert.match(r.stdout, /spec-queue bump 15a/,
    'D6: the auto-placement notice must carry the exact veto command naming the newly auto-placed brief, or a silently inserted brief goes unnoticed: ' + r.stdout)

  const q = readQueue(dir)
  const briefs = q.items.filter((i) => i.kind === 'brief').map((i) => i.brief)
  assert.deepStrictEqual(briefs, ['15', '15a', '16'],
    "D6: brief 15a's item must be inserted immediately after brief 15's item — its Depends-on parent — never appended at the end: " + JSON.stringify(briefs))
  const item15a = q.items.find((i) => i.brief === '15a')
  assert.ok(item15a && item15a.auto_placed,
    'D6: the auto-inserted item must carry an auto_placed stamp — without it the placement is unvetoable and looks identical to a deliberate add: ' + JSON.stringify(item15a))
})

test('AC-20260823-08-9: spec-queue next with no queue file seeds every non-done brief in roadmap order, zero auto_placed stamps, one summary line', () => {
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

test('AC-20260823-08-10: spec-queue bump moves an auto_placed item to position 1 and clears the auto_placed stamp', () => {
  const dir = host({
    queue: [
      { id: 'q1', kind: 'brief', brief: '15', added: '2026-08-23T10:00:00Z' },
      { id: 'q2', kind: 'brief', brief: '16', added: '2026-08-23T10:01:00Z' },
      { id: 'q3', kind: 'brief', brief: '08', auto_placed: '2026-08-23T10:02:00Z' },
    ],
  })
  const r = runNode(SCRIPT, ['bump', '08'], { cwd: dir })
  assert.strictEqual(r.status, 0, r.stderr)

  const q = readQueue(dir)
  const briefs = q.items.filter((i) => i.kind === 'brief').map((i) => i.brief)
  assert.deepStrictEqual(briefs, ['08', '15', '16'],
    'bump must move the referenced item to the very front of the queue: ' + JSON.stringify(briefs))
  const item = q.items.find((i) => i.brief === '08')
  assert.ok(!('auto_placed' in item),
    'D6: bump must remove the auto_placed stamp — the veto has now been exercised, so the item must never again print an "auto-queued" notice: ' + JSON.stringify(item))
})
