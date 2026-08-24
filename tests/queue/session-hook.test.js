'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runBash, gitRepo } = require('../helpers')

// specs/20260823/08-derived-session-queue.md (2026-08-23) D8/D9: the SessionStart hook
// (spec/scripts/session-queue.sh) is a thin bash guard — silent exit 0 unless a queue file
// exists, then delegating to `spec-queue.js hello` — so a repo that never opted into the queue
// pays zero node-startup cost. This file pins the three observable behaviors directly: silence
// with no queue file or outside git (AC-11, JJ's ratified noise budget), the paste-line + veto-
// notice output in a main checkout with an auto_placed item pending (AC-12), and the finish-
// this-tree suppression inside a linked worktree — the global pointer misleads mid-spec, so the
// worktree case must never leak the global queue's top pick (AC-13, D9).

const SCRIPT = 'scripts/session-queue.sh'
const overviewHeader = '# X Roadmap — Overview\n\n## Sequence\n\n| #  | Brief | Phase | Depends on |\n|---|---|---|---|\n'

test('AC-20260823-08-11: session-queue.sh prints nothing and exits 0 with no queue file present, and outside any git repository', () => {
  const repoNoQueue = fs.realpathSync(tmpdir('hook-noqueue'))
  gitRepo(repoNoQueue)
  const rRepo = runBash(SCRIPT, [], { cwd: repoNoQueue })
  assert.strictEqual(rRepo.status, 0,
    'D8: a git repo with no queue file must exit 0, never error out at session start: ' + rRepo.stderr)
  assert.strictEqual(rRepo.stdout, '',
    'D8: a git repo with no queue file must print nothing at all — the hook stays silent until a repo opts into the queue: ' + JSON.stringify(rRepo.stdout))

  const outsideGit = tmpdir('hook-outsidegit')
  const rOutside = runBash(SCRIPT, [], { cwd: outsideGit })
  assert.strictEqual(rOutside.status, 0,
    'outside any git repository the hook must still exit 0 — a nonzero exit here would surface as a session-start error in every non-git project: ' + rOutside.stderr)
  assert.strictEqual(rOutside.stdout, '',
    'outside any git repository the hook must print nothing: ' + JSON.stringify(rOutside.stdout))
})

test('AC-20260823-08-12: session-queue.sh in a main checkout prints the top item\'s paste line plus one veto notice for a pending auto_placed item', () => {
  const dir = fs.realpathSync(tmpdir('hook-main'))
  gitRepo(dir)
  fs.mkdirSync(path.join(dir, 'docs/roadmap'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'docs/roadmap/00-overview.md'), overviewHeader)
  fs.writeFileSync(path.join(dir, 'docs/roadmap/15-a.md'), '# 15 — A\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n')
  fs.writeFileSync(path.join(dir, 'docs/roadmap/16-b.md'), '# 16 — B\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n')
  fs.mkdirSync(path.join(dir, 'specs/20260701'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260701/01-fifteen.md'), '---\nstatus: hardened\nbrief: 15\n---\n# fifteen\n')
  fs.writeFileSync(path.join(dir, '.git/spec-queue.json'), JSON.stringify({
    version: 1, seq: 2,
    items: [
      { id: 'q1', kind: 'brief', brief: '15', added: '2026-08-23T10:00:00Z' },
      { id: 'q2', kind: 'brief', brief: '16', auto_placed: '2026-08-23T10:01:00Z' },
    ],
  }))

  const r = runBash(SCRIPT, [], { cwd: dir })
  assert.strictEqual(r.status, 0, r.stderr)
  const lines = r.stdout.split('\n').filter((l) => l.trim() !== '')
  assert.match(lines[0], /\/spec:build @specs\/20260701\/01-fifteen\.md$/,
    'D8: the first line must be brief 15\'s own --next paste line, ending in the exact @path — a session opening must be able to copy this straight into the prompt: ' + r.stdout)
  assert.match(lines[1], /veto: spec-queue bump/,
    'D6/D8: the second line must carry the veto notice for the pending auto_placed item — a silently-inserted brief must never go unnoticed: ' + r.stdout)
})

test('AC-20260823-08-13: session-queue.sh inside a linked worktree prints the finish-this-tree line, never the global queue top', () => {
  const root = fs.realpathSync(tmpdir('hook-wt'))
  gitRepo(root)
  fs.mkdirSync(path.join(root, 'docs/roadmap'), { recursive: true })
  fs.writeFileSync(path.join(root, 'docs/roadmap/00-overview.md'), overviewHeader)
  fs.writeFileSync(path.join(root, 'docs/roadmap/08-b.md'), '# 08 — B\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n')

  const wt = path.join(root, '.claude/worktrees/w1')
  execFileSync('git', ['-C', root, 'worktree', 'add', '-q', '-b', 'w1-branch', wt, 'HEAD'])
  fs.mkdirSync(path.join(wt, 'specs/20260701'), { recursive: true })
  fs.writeFileSync(path.join(wt, 'specs/20260701/01-tree.md'), '---\nstatus: implementing\n---\n# tree spec\n')

  // The global queue's top pick names an unrelated brief (08) — D9's hazard: this must never
  // leak into a worktree session mid-spec.
  fs.writeFileSync(path.join(root, '.git/spec-queue.json'), JSON.stringify({
    version: 1, seq: 1, items: [{ id: 'q1', kind: 'brief', brief: '08', added: '2026-08-23T10:00:00Z' }],
  }))

  const r = runBash(SCRIPT, [], { cwd: wt })
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /finish this tree's spec first/,
    "D9: inside a linked worktree the hook must print the finish-this-tree-first line, derived from the tree's own --next, not the delegated hello mode: " + r.stdout)
  assert.match(r.stdout, /specs\/20260701\/01-tree\.md/,
    "the tree's own implementing spec must be named — the worktree's own --next top line: " + r.stdout)
  assert.doesNotMatch(r.stdout, /\b08\b/,
    'D9: the global queue top (brief 08, an unrelated brief) must never leak into a worktree session\'s hello output — this suppression is the entire point of D9: ' + r.stdout)
})
