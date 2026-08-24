'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260823/08-derived-session-queue.md (2026-08-23): D2 keeps `--next` the sole
// next-pointer surface (every live consumer captures spec-status --next stdout verbatim) by
// landing the queue as a READ-ONLY overlay inside deriveNext() rather than a post-processing
// sibling script. This file pins that overlay boundary directly against spec/scripts/spec-status.js:
// queue position reordering unblocked entries across briefs (D6/Behavior), prompt items surfacing
// verbatim with no @path (D11), the overlay staying OFF byte-for-byte with no queue file present
// (a "SHALL CONTINUE TO" pin that must already be green on today's pre-queue code and stay green
// after), the overlay being suppressed entirely inside a linked worktree (D9), and the red-
// observation escape entry keeping rank supremacy over every queue position (D10).

const SCRIPT = 'scripts/spec-status.js'

function overviewHeader() {
  return '# X Roadmap — Overview\n\n## Sequence\n\n| #  | Brief | Phase | Depends on |\n|---|---|---|---|\n'
}

function host({ briefs = {}, specs = {}, ledgerRows = null, queueItems = null } = {}) {
  const dir = fs.realpathSync(tmpdir('queue-overlay'))
  gitRepo(dir)
  if (Object.keys(briefs).length) {
    fs.mkdirSync(path.join(dir, 'docs/roadmap'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'docs/roadmap/00-overview.md'), overviewHeader())
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
  if (queueItems) {
    fs.writeFileSync(path.join(dir, '.git/spec-queue.json'),
      JSON.stringify({ version: 1, seq: queueItems.length, items: queueItems }))
  }
  return dir
}

test('AC-20260823-08-2: a queue ordering brief 08 ahead of brief 05 makes 08\'s unblocked spec entry win both --next renders', () => {
  const dir = host({
    briefs: {
      '05-a.md': '# 05 — A\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n',
      '08-b.md': '# 08 — B\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n',
    },
    specs: {
      '20260701/01-a.md': 'date: 2026-07-01\nstatus: hardened\nbrief: 05',
      '20260701/02-b.md': 'date: 2026-07-01\nstatus: hardened\nbrief: 08',
    },
    queueItems: [
      { id: 'q1', kind: 'brief', brief: '08', added: '2026-08-23T10:00:00Z' },
      { id: 'q2', kind: 'brief', brief: '05', added: '2026-08-23T10:01:00Z' },
    ],
  })
  const r = runNode(SCRIPT, ['--root', dir, '--next'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /02-b\.md/,
    'the queue orders brief 08 ahead of brief 05 — its spec entry must be the printed top pick, overriding the closest-to-done tiebreak that would otherwise favor 05 by briefOrd: ' + r.stdout)

  const j = JSON.parse(runNode(SCRIPT, ['--root', dir, '--next', '--json']).stdout)
  assert.strictEqual(j.next[0].brief, '08',
    'the queue-aware --json top entry must be brief 08, per Behavior: "queue position deliberately OVERRIDES cross-brief closest-to-done": ' + JSON.stringify(j.next))
})

test('AC-20260823-08-3: with no queue file present, --next output on a non-git host stays byte-identical to today\'s pre-queue derivation', () => {
  // Deliberately NOT a git repo at all — the overlay resolution (D1: git rev-parse
  // --git-common-dir) must fail soft with zero stderr noise, matching A5's assumption that
  // existing spec-status tests already exercise non-git tmpdir hosts.
  const dir = tmpdir('queue-overlay-nogit')
  fs.mkdirSync(path.join(dir, 'specs/20260701'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260701/01-draft.md'), '---\nstatus: draft\n---\n# a\n')
  fs.writeFileSync(path.join(dir, 'specs/20260701/02-ready.md'), '---\nstatus: hardened\n---\n# b\n')
  const r = runNode(SCRIPT, ['--root', dir, '--next'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.strictEqual(r.stdout.trim(), '🎯 Next\n/spec:build @specs/20260701/02-ready.md',
    'D2/Behavior "Overlay OFF": no queue file (and no git repo at all) must leave --next byte-identical to the pre-queue derivation — this pin must already be green on today\'s code and stay green after the overlay lands')
  assert.strictEqual(r.stderr, '',
    'a host with no git repository at all must never print overlay-resolution noise to stderr')
})

test('AC-20260823-08-4: a top prompt queue item prints its payload verbatim as line 2 of --next with no @path suffix, and as the frozen {action,path:null,queue:true} shape in --json', () => {
  const dir = host({
    queueItems: [
      { id: 'q1', kind: 'prompt', payload: 'ship the landing page', added: '2026-08-23T10:00:00Z' },
    ],
  })
  const r = runNode(SCRIPT, ['--root', dir, '--next'])
  assert.strictEqual(r.status, 0, r.stderr)
  const lines = r.stdout.split('\n')
  assert.strictEqual(lines[1], 'ship the landing page',
    'D11: a prompt item\'s payload must print verbatim as line 2 of --next — no @-prefix, no path suffix, ever: ' + r.stdout)

  const j = JSON.parse(runNode(SCRIPT, ['--root', dir, '--next', '--json']).stdout)
  assert.deepStrictEqual(j.next[0], {
    action: 'ship the landing page', path: null, queue: true, status: 'queued', brief: null, blockers: [], note: 'queue item q1',
  }, 'D11: the --json shape for a prompt entry is a frozen, append-only addition — it must match Contracts verbatim: ' + JSON.stringify(j.next[0]))
})

// (sanctioned pin exception, green pre-change): the differentiating mechanism this AC pins — the
// overlay itself — does not exist on pre-change spec-status.js, so "the overlay is suppressed in
// a worktree" and "there is no overlay at all yet" are the same observable output; this pin is
// necessarily green both before and after D9 lands, matching this file's AC-20260823-08-3 sibling
// and the repo's established convention for continuation invariants (spec-status.test.js's
// AC-20260805-01-7/AC-20260805-03-7 precedent).
test('AC-20260823-08-14: spec-status --root pointed at a linked worktree ignores a shared queue overlay entirely', () => {
  const root = fs.realpathSync(tmpdir('queue-wt-overlay'))
  gitRepo(root)
  fs.mkdirSync(path.join(root, 'docs/roadmap'), { recursive: true })
  fs.writeFileSync(path.join(root, 'docs/roadmap/00-overview.md'), overviewHeader())
  fs.writeFileSync(path.join(root, 'docs/roadmap/05-a.md'), '# 05 — A\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n')
  fs.writeFileSync(path.join(root, 'docs/roadmap/08-b.md'), '# 08 — B\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n')
  fs.mkdirSync(path.join(root, 'specs/20260701'), { recursive: true })
  fs.writeFileSync(path.join(root, 'specs/20260701/01-a.md'), '---\nstatus: hardened\nbrief: 05\n---\n# a\n')
  fs.writeFileSync(path.join(root, 'specs/20260701/02-b.md'), '---\nstatus: hardened\nbrief: 08\n---\n# b\n')

  const wt = path.join(root, '.claude/worktrees/w1')
  execFileSync('git', ['-C', root, 'worktree', 'add', '-q', '-b', 'w1-branch', wt, 'HEAD'])
  // The fixtures above were never committed to HEAD, so replicate them into the worktree
  // directly — spec-status.js derives from files on disk, not from git history.
  for (const rel of ['docs/roadmap/00-overview.md', 'docs/roadmap/05-a.md', 'docs/roadmap/08-b.md',
    'specs/20260701/01-a.md', 'specs/20260701/02-b.md']) {
    fs.mkdirSync(path.dirname(path.join(wt, rel)), { recursive: true })
    fs.copyFileSync(path.join(root, rel), path.join(wt, rel))
  }

  const before = runNode(SCRIPT, ['--root', wt, '--next'])
  assert.strictEqual(before.status, 0, before.stderr)

  fs.writeFileSync(path.join(root, '.git/spec-queue.json'), JSON.stringify({
    version: 1, seq: 2,
    items: [
      { id: 'q1', kind: 'brief', brief: '08', added: '2026-08-23T10:00:00Z' },
      { id: 'q2', kind: 'brief', brief: '05', added: '2026-08-23T10:01:00Z' },
    ],
  }))
  const after = runNode(SCRIPT, ['--root', wt, '--next'])
  assert.strictEqual(after.status, 0, after.stderr)
  assert.strictEqual(after.stdout, before.stdout,
    'D9: a linked worktree must ignore the shared queue overlay entirely — --next must stay byte-identical whether or not the common git dir carries a queue file ordering a different brief first (the misleading-global-pointer hazard the brief names by name): ' + after.stdout)
})

// (sanctioned pin exception, green pre-change): the AC's own wording is "SHALL CONTINUE TO" —
// D10's rationale states escape supremacy is "the one exception, inherited unchanged" from
// specs/20260805/03 D5, so this pin is green both before and after the overlay lands, same as
// this file's AC-20260823-08-3 sibling.
test('AC-20260823-08-15: a red-observation escape entry keeps rank supremacy above every queue position', () => {
  const dir = fs.realpathSync(tmpdir('queue-escape'))
  gitRepo(dir)
  fs.mkdirSync(path.join(dir, 'docs/roadmap'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'docs/roadmap/00-overview.md'), overviewHeader())
  fs.writeFileSync(path.join(dir, 'docs/roadmap/08-b.md'), '# 08 — B\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n')
  const specPath = 'specs/20260701/01-x.md'
  fs.mkdirSync(path.join(dir, 'specs/20260701'), { recursive: true })
  fs.writeFileSync(path.join(dir, specPath), '---\nstatus: done\n---\n# x\n')

  const ledgerRows = [
    { ts: '2026-08-20', stage: 'observe', spec: specPath, branch: 'main', ci: 'red', sha: 'deadbee', url: 'https://github.com/x/y/actions/runs/9', runAt: '2026-08-20T09:00:00Z' },
  ]
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec-runs.jsonl'), ledgerRows.map((r) => JSON.stringify(r)).join('\n') + '\n')

  fs.writeFileSync(path.join(dir, '.git/spec-queue.json'), JSON.stringify({
    version: 1, seq: 1, items: [{ id: 'q1', kind: 'brief', brief: '08', added: '2026-08-23T10:00:00Z' }],
  }))

  const j = JSON.parse(runNode(SCRIPT, ['--root', dir, '--next', '--json']).stdout)
  assert.strictEqual(j.next[0].action, '/spec:escape',
    'D10: a red observation must outrank every queue position — the queue orders work, it never silences an alarm: ' + JSON.stringify(j.next))
  assert.strictEqual(j.next[0].path, specPath,
    'the escape entry at rank 0 must point at the red spec itself, not a queue-derived pick: ' + JSON.stringify(j.next[0]))
})
