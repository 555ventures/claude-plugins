'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260823/08-derived-session-queue.md: D2 keeps `--next` the sole
// next-pointer surface (every live consumer captures spec-status --next stdout verbatim) by
// landing the queue as a READ-ONLY overlay inside deriveNext() rather than a post-processing
// sibling script. This file pins that overlay boundary directly against spec/scripts/spec-status.js:
// queue position reordering unblocked entries across briefs (D6/Behavior), prompt items surfacing
// verbatim with no @path (D11), the overlay staying OFF byte-for-byte with no queue file present
// (a "SHALL CONTINUE TO" pin that must already be green on today's pre-queue code and stay green
// after), the overlay being suppressed entirely inside a linked worktree (D9), and the red-
// observation escape entry keeping rank supremacy over every queue position (D10).
//
// specs/20260903/03-pipeline-queue-mechanics.md adds two new readiness inputs to this same
// read-only overlay: an `after` gate on any item (D2/D3 — a not-ready item's entry gains a
// blocker string and sinks into the blocked tier, isItemReady shared with spec-queue.js's own
// write path) and a queued `spec` item whose own position overrides its brief's (D1). The four
// AC-20260823-08-3/-4/-14/-15 tests below are retagged in place as continuation pins (D9/D12);
// nothing in their bodies changes.

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

test('AC-20260903-03-2: a top prompt gated with after:{spec} carries a blocker naming the target and its state, sinks below the unblocked spec, and unblocks once that spec is done', () => {
  const dir = host({
    specs: {
      '20260701/01-a.md': 'date: 2026-07-01\nstatus: implementing',
      '20260701/02-b.md': 'date: 2026-07-01\nstatus: hardened\nbrief: n/a',
    },
    queueItems: [
      { id: 'q1', kind: 'prompt', payload: '/spec:plan @docs/roadmap/26-x.md', after: { spec: 'specs/20260701/01-a.md' }, added: '2026-08-23T10:00:00Z' },
      { id: 'q2', kind: 'spec', spec: 'specs/20260701/02-b.md', added: '2026-08-23T10:01:00Z' },
    ],
  })
  const j1 = JSON.parse(runNode(SCRIPT, ['--root', dir, '--next', '--json']).stdout)
  const gated = j1.next.find((e) => e.action === '/spec:plan @docs/roadmap/26-x.md')
  assert.ok(gated, 'D2/D3: a gated prompt item must still surface as its own --next entry: ' + JSON.stringify(j1.next))
  assert.deepStrictEqual(gated.blockers, ['after specs/20260701/01-a.md (implementing)'],
    "D2: the entry's blockers must name the exact gate target and its current status — a caller reading --json otherwise has no idea why the item is stuck: " + JSON.stringify(gated))
  assert.strictEqual(j1.next[0].path, 'specs/20260701/02-b.md',
    'D3: a not-ready item sinks into the blocked tier — the unblocked spec must be next[0] while the gate holds: ' + JSON.stringify(j1.next))

  fs.writeFileSync(path.join(dir, 'specs/20260701/01-a.md'), '---\nstatus: done\n---\n# a\n')
  const r2 = runNode(SCRIPT, ['--root', dir, '--next'])
  assert.strictEqual(r2.status, 0, r2.stderr)
  const lines2 = r2.stdout.split('\n')
  assert.strictEqual(lines2[1], '/spec:plan @docs/roadmap/26-x.md',
    'D2/D3: once the gate target is done, the prompt must become ready and print as line 2 of --next: ' + r2.stdout)
})

test('AC-20260903-03-3: a queued brief item gated with after:{brief} carries the blocker on its spec entry and unblocks once that brief is fully done', () => {
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
      { id: 'q1', kind: 'brief', brief: '08', after: { brief: '05' }, added: '2026-08-23T10:00:00Z' },
    ],
  })
  const j1 = JSON.parse(runNode(SCRIPT, ['--root', dir, '--next', '--json']).stdout)
  const gated = j1.next.find((e) => e.path === 'specs/20260701/02-b.md')
  assert.ok(gated, "D2: brief 08's own spec entry must still surface in --next even while gated: " + JSON.stringify(j1.next))
  assert.deepStrictEqual(gated.blockers, ['after brief 05 (in-flight)'],
    "D2: a brief gate must give brief 08's spec entry the blocker naming brief 05 and its derived status: " + JSON.stringify(gated))
  assert.strictEqual(j1.next[0].path, 'specs/20260701/01-a.md',
    "D3: while 08 is gated on 05, brief 05's own spec must be the top pick: " + JSON.stringify(j1.next))

  fs.writeFileSync(path.join(dir, 'specs/20260701/01-a.md'), '---\nstatus: done\nbrief: 05\n---\n# a\n')
  const j2 = JSON.parse(runNode(SCRIPT, ['--root', dir, '--next', '--json']).stdout)
  assert.strictEqual(j2.next[0].brief, '08',
    'D2/D3: once every brief-05 spec is done, brief 05 is fully done and 08\'s spec must become next[0] with no more blocker: ' + JSON.stringify(j2.next))
  const stillThere = j2.next.find((e) => e.path === 'specs/20260701/02-b.md')
  assert.deepStrictEqual(stillThere.blockers, [],
    "D2: once the gate's target brief is done, the blocker must be gone entirely, not merely relabeled: " + JSON.stringify(stillThere))
})

// (sanctioned pin exception, green pre-change, per this file's AC-20260823-08-3/-14 precedent):
// D9's own Contracts section describes this key shape as CONTINUE TO — the frozen surface is
// unchanged by this spec, so the pin is green both before and after the `after`/`spec`-item
// mechanisms land.
test('AC-20260903-03-12: --next --json keeps its exact frozen key shapes — top-level ["next"], the prompt entry\'s 7 keys, every other entry\'s 8 keys — with a gated prompt, a spec item, and a brief item all present', () => {
  const dir = host({
    briefs: { '05-a.md': '# 05 — A\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n' },
    specs: {
      '20260701/01-a.md': 'date: 2026-07-01\nstatus: hardened\nbrief: 05',
      '20260701/02-b.md': 'date: 2026-07-01\nstatus: hardened\nbrief: n/a',
    },
    queueItems: [
      { id: 'q1', kind: 'prompt', payload: '/spec:plan @docs/roadmap/26-x.md', after: { brief: '05' }, added: '2026-08-23T10:00:00Z' },
      { id: 'q2', kind: 'spec', spec: 'specs/20260701/02-b.md', added: '2026-08-23T10:01:00Z' },
      { id: 'q3', kind: 'brief', brief: '05', added: '2026-08-23T10:02:00Z' },
    ],
  })
  const j = JSON.parse(runNode(SCRIPT, ['--root', dir, '--next', '--json']).stdout)
  assert.deepStrictEqual(Object.keys(j).sort(), ['next'],
    'D9: --next --json top-level keys must stay exactly ["next"] — a new top-level key is a frozen-surface break: ' + Object.keys(j).join(','))
  const promptEntry = j.next.find((e) => e.queue)
  assert.ok(promptEntry, 'a gated prompt item must still emit its own --json entry: ' + JSON.stringify(j.next))
  assert.deepStrictEqual(Object.keys(promptEntry).sort(),
    ['action', 'blockers', 'brief', 'note', 'path', 'queue', 'status'].sort(),
    "D9: a prompt entry's key set must stay exactly action,path,queue,status,brief,blockers,note — an ungated OR gated prompt entry never grows or drops a key: " + Object.keys(promptEntry).join(','))
  const specEntry = j.next.find((e) => !e.queue)
  assert.ok(specEntry, 'a queued spec item and brief item must both surface as ordinary (non-queue) entries: ' + JSON.stringify(j.next))
  assert.deepStrictEqual(Object.keys(specEntry).sort(),
    ['action', 'blockers', 'brief', 'note', 'parallel', 'parallel_reason', 'path', 'status'].sort(),
    'D9: every non-prompt entry\'s key set must stay exactly action,path,status,brief,blockers,note,parallel,parallel_reason: ' + Object.keys(specEntry).join(','))
})

// (sanctioned pin exception, green pre-change): D1's own rationale states this is "today's
// after-every-queued-position sort" — the existing Infinity-queuePos fallback for an unqueued
// briefless spec already produces this ordering; this pin is green both before and after D1
// lands, per this file's AC-20260823-08-3 precedent.
test('AC-20260903-03-13: an unqueued brief:n/a hardened spec is placed virtually LAST behind a queued brief\'s spec', () => {
  const dir = host({
    briefs: { '08-b.md': '# 08 — B\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n' },
    specs: {
      '20260701/01-a.md': 'date: 2026-07-01\nstatus: hardened\nbrief: n/a',
      '20260701/02-b.md': 'date: 2026-07-01\nstatus: hardened\nbrief: 08',
    },
    queueItems: [
      { id: 'q1', kind: 'brief', brief: '08', added: '2026-08-23T10:00:00Z' },
    ],
  })
  const j = JSON.parse(runNode(SCRIPT, ['--root', dir, '--next', '--json']).stdout)
  assert.deepStrictEqual(j.next.map((e) => e.brief).slice(0, 2), ['08', null],
    "D1: brief 08 (queued) must be next[0], and the unqueued briefless spec's entry (brief: null) must sort right after it, never ahead of it: " + JSON.stringify(j.next.map((e) => ({ brief: e.brief, path: e.path }))))
})

test('AC-20260823-08-3 / AC-20260901-10-4 / AC-20260903-03-10: with no queue file present, --next output on a non-git host stays byte-identical to today\'s pre-queue derivation, as /spec:run', () => {
  // Deliberately NOT a git repo at all — the overlay resolution (D1: git rev-parse
  // --git-common-dir) must fail soft with zero stderr noise, matching A5's assumption that
  // existing spec-status tests already exercise non-git tmpdir hosts.
  const dir = tmpdir('queue-overlay-nogit')
  fs.mkdirSync(path.join(dir, 'specs/20260701'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260701/01-draft.md'), '---\nstatus: draft\n---\n# a\n')
  fs.writeFileSync(path.join(dir, 'specs/20260701/02-ready.md'), '---\nstatus: hardened\n---\n# b\n')
  const r = runNode(SCRIPT, ['--root', dir, '--next'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.strictEqual(r.stdout.trim(), '🎯 Next\n/spec:run @specs/20260701/02-ready.md',
    'AC-20260901-10-4/D5: D2/Behavior "Overlay OFF": no queue file (and no git repo at all) must leave --next byte-identical to the pre-queue derivation, updated in place from /spec:build to /spec:run per D5\'s action-string change — this pin must be green after the overlay lands the same as it was green before D5')
  assert.strictEqual(r.stderr, '',
    'a host with no git repository at all must never print overlay-resolution noise to stderr')
})

test('AC-20260823-08-4 / AC-20260903-03-10: a top prompt queue item prints its payload verbatim as line 2 of --next with no @path suffix, and as the frozen {action,path:null,queue:true} shape in --json', () => {
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
test('AC-20260823-08-14 / AC-20260903-03-10: spec-status --root pointed at a linked worktree ignores a shared queue overlay entirely', () => {
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
// Regression, found by the user on the first real `spec-queue next` run against this repo's
// own ~75 KB dashboard JSON. The 64 KiB `process.exit` stdout truncation (async pipe write) is
// explained in spec/scripts/lib/driver-io.js. The spec's fix
// (specs/20260823/08-derived-session-queue.md repair) replaced every console.log()-
// then-process.exit() JSON emission site with a synchronous fs.writeSync loop. This pins that
// fix behaviorally, at a fixture size independently proven (via a synchronous file-redirect
// run of the SAME invocation) to exceed the 64 KiB pipe buffer, so the test can never silently
// stop exercising the defect — a fixture that shrinks below that threshold would make it
// vacuous, which is exactly the failure mode this guards against.
function bigQueueHost() {
  const dir = fs.realpathSync(tmpdir('queue-overlay-pipe'))
  gitRepo(dir)
  fs.mkdirSync(path.join(dir, 'docs/roadmap'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'docs/roadmap/00-overview.md'), overviewHeader())
  const N = 320
  for (let i = 1; i <= N; i++) {
    const id = String(i).padStart(2, '0')
    fs.writeFileSync(path.join(dir, `docs/roadmap/${id}-brief.md`),
      `# ${id} — Brief number ${id} with a reasonably long descriptive name for bulk padding\n\nPhase: P0 · Depends on: — · Primary workspaces: api\n`)
    const specDir = path.join(dir, 'specs/20260701')
    fs.mkdirSync(specDir, { recursive: true })
    const rows = Array.from({ length: 6 }, (_, k) =>
      `| spec/scripts/some-file-${id}-${k}.js | MODIFY | one-line summary describing what changed in this file for bulk padding purposes |`).join('\n')
    fs.writeFileSync(path.join(specDir, `${id}-spec.md`),
      `---\ndate: 2026-07-01\nstatus: hardened\nbrief: ${id}\n---\n\n# spec ${id}\n\n## File Plan\n\n| Files | Action | Notes |\n|---|---|---|\n${rows}\n`)
  }
  return dir
}

// Runs `spec-status.js --root <dir> <jsonArgs>` two ways over the same synthetic host: once
// with stdout redirected to a file (a synchronous write — the ground-truth full payload, per
// the diagnosis: "a file redirect gets the full 74965 bytes — file writes are synchronous"),
// and once through a real spawned pipe (the async-drain hazard every programmatic caller hits).
// Returns both so the caller can assert the pipe run lost nothing.
function runJsonOverPipeAndFile(dir, jsonArgs) {
  const outFile = path.join(dir, '_redirect.json')
  const fd = fs.openSync(outFile, 'w')
  const fileRun = runNode(SCRIPT, ['--root', dir, ...jsonArgs], { stdio: ['ignore', fd, 'ignore'] })
  fs.closeSync(fd)
  assert.strictEqual(fileRun.status, 0,
    'the ground-truth file-redirect run must itself succeed, or this test cannot establish the full emitted payload size to compare the piped run against')
  const fullBytes = fs.readFileSync(outFile)
  const pipeRun = runNode(SCRIPT, ['--root', dir, ...jsonArgs], { encoding: null })
  return { fullBytes, pipeRun }
}

test('spec-status.js --json survives a real pipe intact at a fixture size proven to exceed the 64 KiB pipe buffer, never silently truncating stdout while still exiting 0', () => {
  const dir = bigQueueHost()
  const { fullBytes, pipeRun } = runJsonOverPipeAndFile(dir, ['--json'])
  assert.ok(fullBytes.length > 65536,
    'this fixture must emit a JSON payload larger than the 64 KiB pipe buffer or this test cannot exercise the truncation defect at all — a shrunk fixture would make this pin vacuous: got ' + fullBytes.length + ' bytes')
  assert.strictEqual(pipeRun.status, 0, (pipeRun.stderr || Buffer.alloc(0)).toString())
  assert.strictEqual(pipeRun.stdout.length, fullBytes.length,
    'piped stdout must carry every byte the synchronous file-redirect run emitted for the identical invocation — a short read here IS the pipe-buffer truncation this test pins (found 2026-08-23, spec-status.js console.log()-then-process.exit()): got ' + pipeRun.stdout.length + ' of ' + fullBytes.length + ' bytes')
  const parsed = JSON.parse(pipeRun.stdout.toString('utf8'))
  assert.deepStrictEqual(Object.keys(parsed).sort(), ['anomalies', 'briefs', 'specs', 'superseded'],
    'the parsed dashboard JSON received over the pipe must carry all four documented top-level keys — a truncated payload would either fail JSON.parse above or land here missing keys: ' + Object.keys(parsed).join(','))
})

test('spec-status.js --next --json survives a real pipe intact at a fixture size proven to exceed the 64 KiB pipe buffer, never silently truncating stdout while still exiting 0', () => {
  const dir = bigQueueHost()
  const { fullBytes, pipeRun } = runJsonOverPipeAndFile(dir, ['--next', '--json'])
  assert.ok(fullBytes.length > 65536,
    'this fixture must emit a --next --json payload larger than the 64 KiB pipe buffer or this test cannot exercise the truncation defect at all — a shrunk fixture would make this pin vacuous: got ' + fullBytes.length + ' bytes')
  assert.strictEqual(pipeRun.status, 0, (pipeRun.stderr || Buffer.alloc(0)).toString())
  assert.strictEqual(pipeRun.stdout.length, fullBytes.length,
    'piped stdout must carry every byte the synchronous file-redirect run emitted for the identical --next --json invocation — a short read here IS the pipe-buffer truncation this test pins, and is exactly what would break spec-queue.js\'s JSON.parse of this same command\'s output (found 2026-08-23): got ' + pipeRun.stdout.length + ' of ' + fullBytes.length + ' bytes')
  const parsed = JSON.parse(pipeRun.stdout.toString('utf8'))
  assert.ok(Array.isArray(parsed.next),
    'the parsed --next JSON received over the pipe must carry its documented top-level "next" array — a truncated payload would either fail JSON.parse above or land here without it: ' + JSON.stringify(parsed))
})

test('AC-20260823-08-15 / AC-20260903-03-10: a red-observation escape entry keeps rank supremacy above every queue position', () => {
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
