'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { tmpdir, gitRepo, runNode } = require('./helpers')

const V7 = '/home/jj/projects/claude-plugins'
const real = fs.existsSync(path.join(V7, '.git'))
const hasTag = () => { try { execFileSync('git', ['-C', V7, 'rev-parse', '-q', '--verify', 'spec-v7-final'], { stdio: 'ignore' }); return true } catch { return false } }
const git = (d, ...a) => execFileSync('git', ['-C', d, ...a], { encoding: 'utf8' })
const mig = (d, ...a) => { const r = runNode('scripts/migrate.js', ['--root', d, '--json', ...a]); assert.strictEqual(r.status, 0, r.stderr); return JSON.parse(r.stdout) }

// Synthetic v7 host: every artifact class in host-footprint.md.
function synthetic() {
  const d = tmpdir('mig')
  const w = (f, c) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), c) }
  w('.claude/spec.config.json', JSON.stringify({ generatedBy: 'spec@7', contractHash: 'x', trunk: 'main', gateCommand: 'g {testFiles}', testCommand: 'true', postGateCommand: '{testCommand}', patternsScript: 'p', layerGroups: {}, release: { deployCommand: 'd' }, policy: { mergeStrategy: 'squash', worktreePerSpec: false, models: { workers: 'haiku', reviewer: 'opus' } } }))
  w('.claude/spec-runs.jsonl', '{}\n'); w('.claude/spec-runs/rp_1.json', '{}'); w('.claude/spec-session.json', '{}'); w('.claude/spec-manifest.json', '{}')
  w('.claude/rules/enforcement.json', '{}'); w('.claude/rules/conventions/a.md', 'a'); w('scripts/spec-patterns.sh', '#!/bin/sh\n')
  w('.claude/skills/run/SKILL.md', 'reads .claude/spec-runs.jsonl'); w('.claude/skills/spec-verify/SKILL.md', 'host own verify'); w('.claude/skills/other/SKILL.md', 'x'); w('.claude/agents/gen.md', '## Worker Contract (spec pipeline)\n'); w('.claude/agents/mine.md', 'mine')
  w('.claude/rules/spec-pipeline.md', '---\npaths:\n  - "specs/**"\n---\n\n# T\n\n## Risk Tiers\n- r1\n\n## Build\nb\n\n## Gotchas (evidence-cited)\n- g1\n')
  w('.gitattributes', '.claude/spec-runs.jsonl merge=union\n'); w('.gitignore', '.claude/worktrees/\n.claude/settings.local.json\n')
  w('.claude/settings.local.json', '{}')
  w('docs/roadmap/33-x.md', '# 33'); w('docs/adr/0001-a.md', '# adr')
  w('specs/20260101/01-a.md', '---\nstatus: done\n---\n'); w('specs/20260101/01-a.deviations.md', 'dev')
  w('specs/20260101/01-a.build/build-state.json', '{}'); w('specs/20260101/01-a.review/review-state.json', '{}')
  w('specs/system.design/notes.md', 'mine') // dotted, but no spec beside it: not a sidecar
  const g = gitRepo(d)
  g('add', '-f', '.claude/settings.local.json'); g('commit', '-q', '-m', 'track token')
  const c = path.join(d, '.git')
  fs.writeFileSync(path.join(c, 'spec-queue.json'), JSON.stringify({ version: 1, seq: 9, items: [
    { id: 'q1', kind: 'brief', brief: '33' }, { id: 'q2', kind: 'spec', spec: 'specs/20260101/01-a.md' },
    { id: 'q3', kind: 'prompt', lane: 'fix', payload: 'do it', added: 't', when: { type: 'ledger', stage: 'review', min: 1 } },
    { id: 'q4', kind: 'prompt', payload: 'plain', added: 1730000000 }, { id: 'q5', kind: 'prompt', payload: 'ms', added: 1730000000000 }] }))
  for (const f of ['spec-fanout.json', 'spec-wave-open']) fs.writeFileSync(path.join(c, f), '{}')
  fs.mkdirSync(path.join(c, 'spec-run-cache')); fs.writeFileSync(path.join(c, 'spec-queue-done.json'), '{"items":[]}')
  g('update-ref', 'refs/spec-review/rv_1/judged', 'HEAD'); g('branch', 'plan/x')
  return { d, g }
}

test('synthetic: plan changes nothing; apply converts; second apply is a no-op', () => {
  const { d, g } = synthetic()
  const before = git(d, 'status', '--porcelain') + fs.readFileSync(path.join(d, '.git/spec-queue.json'), 'utf8')
  const p = mig(d)
  assert.strictEqual(p.applied, false)
  assert.ok(p.ops.length > 10)
  assert.strictEqual(git(d, 'status', '--porcelain') + fs.readFileSync(path.join(d, '.git/spec-queue.json'), 'utf8'), before)
  assert.deepStrictEqual(p.lost, ['q3'])
  assert.ok(p.listed.includes('branch plan/x'))
  assert.ok(p.warns.some((x) => /settings\.local\.json/.test(x)))

  assert.ok(p.owned.includes('.claude/agents/mine.md') && p.owned.includes('.claude/skills/spec-verify') && p.owned.includes('.claude/skills/other'))
  const head = g('rev-parse', 'HEAD').trim()
  const applied = mig(d, '--apply')
  assert.match(applied.commit, /^[0-9a-f]{40}$/)
  assert.strictEqual(g('log', '-1', '--format=%s').trim(), 'chore(spec): migrate v7 → v8')
  assert.strictEqual(g('rev-parse', 'HEAD~1').trim(), head)
  assert.strictEqual(g('status', '--porcelain').trim(), '')
  const e = (f) => fs.existsSync(path.join(d, f))
  assert.ok(e('specs/system.design/notes.md'), 'a dotted directory with no spec beside it is left alone')
  assert.ok(g('tag', '-l', 'spec-v7-final').trim())
  const cfg = JSON.parse(fs.readFileSync(path.join(d, '.claude/spec.config.json'), 'utf8'))
  assert.deepStrictEqual(Object.keys(cfg).sort(), ['mergeStrategy', 'release', 'seats', 'testCommand', 'trunk', 'worktreePerSpec'])
  assert.deepStrictEqual(cfg.seats, { builder: { model: 'haiku' }, reviewer: { model: 'opus' } })
  assert.strictEqual(cfg.mergeStrategy, 'squash')
  assert.strictEqual(cfg.worktreePerSpec, false)
  const q = JSON.parse(fs.readFileSync(path.join(d, '.git/spec-queue.json'), 'utf8'))
  assert.strictEqual(q.version, 3); assert.strictEqual(q.seq, 9)
  assert.deepStrictEqual(q.items.map((i) => [i.id, i.kind, i.payload]), [['q1', 'brief', 'docs/roadmap/33-x.md'], ['q2', 'spec', 'specs/20260101/01-a.md'], ['q3', 'prompt', 'do it'], ['q4', 'prompt', 'plain'], ['q5', 'prompt', 'ms']])
  assert.strictEqual(q.items[2].type, 'fix', 'lane became type')
  assert.deepStrictEqual(q.items.slice(3).map((i) => i.added), ['2024-10-27T03:33:20.000Z', '2024-10-27T03:33:20.000Z'])
  for (const f of ['.claude/spec-runs.jsonl', '.claude/spec-runs', '.claude/spec-session.json', '.claude/spec-manifest.json', '.claude/rules/enforcement.json',
    '.claude/skills/run', '.claude/agents/gen.md', '.claude/rules/spec-pipeline.md', 'scripts/spec-patterns.sh',
    'specs/20260101/01-a.deviations.md', 'specs/20260101/01-a.build', 'specs/20260101/01-a.review', '.git/spec-fanout.json', '.git/spec-wave-open', '.git/spec-run-cache', '.git/spec-queue-done.json']) assert.ok(!e(f), f + ' still present')
  assert.ok(e('.claude/rules/conventions/a.md') && !e('docs/archive/v7/rules/conventions'), '.claude/rules/conventions is repo-owned and left alone')
  for (const f of ['spec-runs.jsonl', 'spec-runs/rp_1.json', 'rules/enforcement.json', 'agents/gen.md', 'rules/spec-pipeline.md', 'scripts/spec-patterns.sh', 'deviations/20260101/01-a.deviations.md', 'spec-queue-done.json', 'skills/run/SKILL.md']) assert.ok(e('docs/archive/v7/' + f), f + ' not archived')
  assert.ok(e('.claude/agents/mine.md') && e('.claude/skills/spec-verify/SKILL.md') && e('.claude/skills/other/SKILL.md') && !e('docs/archive/v7/skills/spec-verify')); assert.ok(e('docs/adr/0001-a.md')); assert.ok(e('docs/roadmap/33-x.md')); assert.ok(e('specs/20260101/01-a.md'))
  const gotchas = fs.readFileSync(path.join(d, '.claude/rules/spec-gotchas.md'), 'utf8')
  assert.ok(gotchas.includes('paths:') && gotchas.includes('g1') && gotchas.includes('r1') && !gotchas.includes('## Build'))
  assert.ok(!/merge=union/.test(fs.existsSync(path.join(d, '.gitattributes')) ? fs.readFileSync(path.join(d, '.gitattributes'), 'utf8') : ''))
  assert.ok(fs.readFileSync(path.join(d, '.gitignore'), 'utf8').includes('specs/**/*.run/'))
  assert.strictEqual(git(d, 'for-each-ref', 'refs/spec-review/').trim(), '')

  const snap = git(d, 'status', '--porcelain')
  assert.strictEqual(mig(d, '--apply').ops.length, 0)
  assert.strictEqual(git(d, 'status', '--porcelain'), snap)
  assert.match(runNode('scripts/migrate.js', ['--root', d, '--apply']).stdout, /\/spec:doctor/)
})

test('apply backs up the git-dir files and refs first; copying them back restores the v7 queue byte-identical', () => {
  const { d, g } = synthetic()
  const c = path.join(d, '.git')
  const queue = fs.readFileSync(path.join(c, 'spec-queue.json'))
  const ref = g('rev-parse', 'refs/spec-review/rv_1/judged').trim()
  const applied = mig(d, '--apply')
  const b = applied.backup
  assert.ok(b && b.startsWith(path.join(c, 'spec-v7-backup') + path.sep), 'the backup sits under <git-common-dir>/spec-v7-backup/<timestamp>/')
  assert.match(runNode('scripts/migrate.js', ['--root', synthetic().d, '--apply']).stdout, /git-dir backup: .*spec-v7-backup/, 'the report names the backup path')
  for (const f of ['spec-queue.json', 'spec-queue-done.json', 'spec-fanout.json', 'spec-wave-open', 'spec-run-cache', 'refs.txt']) assert.ok(fs.existsSync(path.join(b, f)), f + ' backed up')
  assert.strictEqual(fs.readFileSync(path.join(b, 'refs.txt'), 'utf8'), `${ref} refs/spec-review/rv_1/judged\n`)
  assert.notDeepStrictEqual(fs.readFileSync(path.join(c, 'spec-queue.json')), queue, 'apply rewrote the queue')
  fs.copyFileSync(path.join(b, 'spec-queue.json'), path.join(c, 'spec-queue.json'))
  for (const line of fs.readFileSync(path.join(b, 'refs.txt'), 'utf8').trim().split('\n')) { const [sha, name] = line.split(' '); g('update-ref', name, sha) }
  assert.deepStrictEqual(fs.readFileSync(path.join(c, 'spec-queue.json')), queue, 'the restored queue is byte-identical')
  assert.strictEqual(g('rev-parse', 'refs/spec-review/rv_1/judged').trim(), ref, 'the review ref is restored')
})

test('apply refuses a dirty tree, naming the files', () => {
  const { d } = synthetic()
  fs.writeFileSync(path.join(d, 'stray.txt'), 'x')
  const r = runNode('scripts/migrate.js', ['--root', d, '--apply'])
  assert.strictEqual(r.status, 2)
  assert.match(r.stderr, /stray\.txt/)
  assert.ok(fs.existsSync(path.join(d, '.claude/spec-runs.jsonl')))
})

test('seats: mapped from policy.models; absent writes none; existing v8 seats kept', () => {
  const { trimConfig } = require('../spec/scripts/migrate')
  assert.strictEqual(trimConfig('/nonexistent', { testCommand: 't', policy: {} }).seats, undefined)
  assert.ok(!('seats' in trimConfig('/nonexistent', { testCommand: 't' })))
  const kept = { builder: { model: 'x' }, reviewer: { model: 'y' } }
  assert.deepStrictEqual(trimConfig('/nonexistent', { testCommand: 't', seats: kept, policy: { models: { workers: 'haiku' } } }).seats, kept)
})

test('gate: a full gateCommand beats a thin testCommand and is not prefixed with typecheckCommand; the report names the gate', () => {
  const { trimConfig } = require('../spec/scripts/migrate')
  const GATE = 'pnpm typegen && pnpm typecheck && pnpm lint && pnpm test'
  const v7 = { testCommand: 'pnpm exec vitest run', gateCommand: GATE, typecheckCommand: 'scripts/typecheck-file.sh', trunk: 'main' }
  assert.strictEqual(trimConfig('/nonexistent', v7).testCommand, GATE)
  assert.strictEqual(trimConfig('/nonexistent', { testCommand: 'npm test', gateCommand: 'g {testFiles}', typecheckCommand: 'tsc' }).testCommand, 'tsc && npm test', 'a templated gateCommand still falls back to testCommand with typecheck prepended')
  const d = tmpdir('mig-gate')
  fs.mkdirSync(path.join(d, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(d, '.claude/spec.config.json'), JSON.stringify(v7))
  gitRepo(d)
  const r = runNode('scripts/migrate.js', ['--root', d])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.ok(r.stdout.includes('testCommand: ' + GATE), 'the plan prints the gate it chose:\n' + r.stdout)
  assert.ok(r.stdout.includes('dropped config keys: ') && r.stdout.includes('typecheckCommand'), r.stdout)
  const a = runNode('scripts/migrate.js', ['--root', d, '--apply'])
  assert.ok(a.stdout.includes('testCommand: ' + GATE), 'apply prints it too:\n' + a.stdout)
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(d, '.claude/spec.config.json'), 'utf8')).testCommand, GATE)
})

test('real v7 host copy: plan, apply, idempotent', { skip: !real || !hasTag(), timeout: 120000 }, () => {
  const d = tmpdir('v7copy')
  fs.cpSync(V7, d, { recursive: true, mode: fs.constants.COPYFILE_FICLONE, filter: (s) => !/\/(node_modules|\.claude\/worktrees)(\/|$)/.test(s) })
  // Once the source repo itself is migrated, rebuild its v7 state from durable records only: the
  // spec-v7-final tag's tree, plus a v7 git dir rebuilt from the done-queue the migration commit
  // archived byte-for-byte. The live v7 queue was rewritten in place, so it is rebuilt from those
  // same real v7 items; the v7 git-dir leftovers and review refs are synthesized as in synthetic().
  let v7done = null
  if (!fs.existsSync(path.join(d, '.claude/spec-runs.jsonl'))) {
    const archived = 'docs/archive/v7/spec-queue-done.json'
    const at = git(d, 'log', '--format=%H', '--diff-filter=A', 'HEAD', '--', archived).trim().split('\n').pop()
    assert.match(at, /^[0-9a-f]{40}$/, 'the migration commit that archived the v7 done-queue is in history')
    v7done = git(d, 'show', `${at}:${archived}`)
    git(d, 'checkout', '-q', '-f', 'spec-v7-final'); git(d, 'clean', '-fdq', '-e', 'node_modules')
    const c = path.join(d, '.git')
    for (const f of ['spec-queue.json', 'spec-queue-done.json', 'spec-run-cache', 'spec-fanout.json', 'spec-wave-open']) fs.rmSync(path.join(c, f), { recursive: true, force: true })
    const done = JSON.parse(v7done)
    assert.strictEqual(done.version, 1); assert.ok(done.items.length > 0)
    const live = done.items.map(({ archived: _a, ticked: _t, ...it }) => it)
    const seq = Math.max(...live.map((i) => Number(String(i.id).replace(/^q/, '')) || 0))
    fs.writeFileSync(path.join(c, 'spec-queue.json'), JSON.stringify({ version: 1, seq, items: live }, null, 2) + '\n')
    fs.writeFileSync(path.join(c, 'spec-queue-done.json'), v7done)
    for (const f of ['spec-fanout.json', 'spec-wave-open']) fs.writeFileSync(path.join(c, f), '{}')
    fs.mkdirSync(path.join(c, 'spec-run-cache')); fs.writeFileSync(path.join(c, 'spec-run-cache/x.json'), '{}')
    for (const r of git(d, 'for-each-ref', '--format=%(refname)', 'refs/spec-review/').split('\n').filter(Boolean)) git(d, 'update-ref', '-d', r)
    git(d, 'update-ref', 'refs/spec-review/rv_v7/judged', 'HEAD')
  }
  const adrs = fs.readdirSync(path.join(d, 'docs/adr')).length
  const p = mig(d)
  assert.ok(p.ops.length > 20)
  const nq = JSON.parse(fs.readFileSync(path.join(d, '.git/spec-queue.json'), 'utf8')).items.length
  mig(d, '--apply')
  const q = JSON.parse(fs.readFileSync(path.join(d, '.git/spec-queue.json'), 'utf8'))
  assert.strictEqual(q.version, 3); assert.strictEqual(q.items.length, nq)
  assert.ok(q.items.every((i) => i.id && typeof i.payload === 'string' && i.kind))
  assert.ok(fs.existsSync(path.join(d, 'docs/archive/v7/spec-runs.jsonl')))
  assert.ok(fs.existsSync(path.join(d, '.claude/rules/spec-gotchas.md')))
  assert.ok(!fs.existsSync(path.join(d, '.claude/spec-runs.jsonl')))
  assert.strictEqual(fs.readdirSync(path.join(d, 'docs/adr')).length, adrs)
  if (v7done !== null) {
    assert.strictEqual(fs.readFileSync(path.join(d, 'docs/archive/v7/spec-queue-done.json'), 'utf8'), v7done, 'the v7 done-queue is archived byte-identical')
    for (const f of ['spec-queue-done.json', 'spec-run-cache', 'spec-fanout.json', 'spec-wave-open']) assert.ok(!fs.existsSync(path.join(d, '.git', f)), f + ' still in the git dir')
    assert.strictEqual(git(d, 'for-each-ref', 'refs/spec-review/').trim(), '')
  }
  assert.strictEqual(mig(d, '--apply').ops.length, 0)
})

// ---- spec 20261105/04 D9: type and after ----------------------------------------------------------
const qfile = (d) => path.join(d, '.git/spec-queue.json')
const readQ = (d) => JSON.parse(fs.readFileSync(qfile(d), 'utf8'))

test('AC-20261105-04-10 convertQueue carries lane as type and after normalised; a foreign lane is dropped', () => {
  const { convertQueue } = require(path.join(__dirname, '../spec/scripts/migrate.js'))
  const root = tmpdir('conv')
  const { queue } = convertQueue(root, { seq: 4, items: [
    { id: 'q1', kind: 'prompt', payload: 'a', lane: 'plan', after: { brief: '3' }, added: 1 },
    { id: 'q2', kind: 'prompt', payload: 'b', lane: 'weird', after: { spec: 'specs/x.md' }, added: 1 },
    { id: 'q3', kind: 'prompt', payload: 'c', added: 1 },
    { id: 'q4', kind: 'spec', spec: 'specs/y.md', lane: 'plan', added: 1 }] })
  assert.deepStrictEqual(queue.items.map((i) => [i.type, i.after]), [['plan', { brief: '03' }], [undefined, { spec: 'specs/x.md' }], [undefined, undefined], [undefined, undefined]])
})

function migrated() {
  const { d, g } = synthetic()
  mig(d, '--apply')
  return { d, g }
}

// The file a v8 build before version 3 left: the migrated queue, stamped version 2.
function asV2(d) { const q = readQ(d); q.version = 2; fs.writeFileSync(qfile(d), JSON.stringify(q, null, 2) + '\n') }

test('AC-20261105-04-10 an already-migrated host gets queue-fields from the newest backup: planned line by line, applied, idempotent', () => {
  const { d } = migrated()
  const c = path.join(d, '.git')
  const bdir = path.join(c, 'spec-v7-backup')
  fs.rmSync(bdir, { recursive: true, force: true }) // the apply's own backup holds the full v1 queue; use a synthetic one
  const old = path.join(bdir, '2026-01-01T00-00-00.000Z')
  fs.mkdirSync(old, { recursive: true })
  fs.writeFileSync(path.join(old, 'spec-queue.json'), JSON.stringify({ version: 1, seq: 9, items: [
    { id: 'q1', kind: 'brief', brief: '33', after: { brief: '3' } }, { id: 'q3', kind: 'prompt', payload: 'do it', lane: 'fix', after: { spec: 'specs/20260101/01-a.md' } }, { id: 'q4', kind: 'prompt', lane: 'plan', payload: 'plain' }, { id: 'q99', kind: 'prompt', lane: 'plan' }] }))
  asV2(d)
  const before = JSON.stringify(readQ(d))
  const p = mig(d)
  const op = p.ops.find((o) => o.op === 'queue-fields')
  assert.ok(op && op.note === '3 fills', JSON.stringify(op))
  assert.deepStrictEqual(p.ops.filter((o) => o.op === 'queue-fields' || o.op === 'queue').map((o) => o.op), ['queue-fields', 'queue'], 'the fills run first, on the raw file, then the conversion')
  assert.ok(!p.ops.some((o) => o.op === 'tag'), 'a v2 conversion does not plan the v7 tag')
  assert.deepStrictEqual(p.fills.map((f) => f.text), ['q1 after brief 03', 'q3 after specs/20260101/01-a.md', 'q4 type plan'])
  assert.strictEqual(JSON.stringify(readQ(d)), before, 'plan writes nothing')
  const text = runNode('scripts/migrate.js', ['--root', d]).stdout
  assert.ok(text.includes('q4 type plan') && text.includes('q1 after brief 03'), text)
  mig(d, '--apply')
  const items = Object.fromEntries(readQ(d).items.map((i) => [i.id, i]))
  assert.deepStrictEqual(items.q1.after, { brief: '03' })
  assert.deepStrictEqual([items.q3.type, items.q3.after], ['fix', { spec: 'specs/20260101/01-a.md' }])
  assert.strictEqual(items.q4.type, 'plan')
  assert.strictEqual(readQ(d).version, 3, 'queue-fields then queue: the file ends at 3')
  assert.ok(!mig(d).ops.some((o) => o.op === 'queue-fields' || o.op === 'queue'), 'a second run plans neither')
})

test('AC-20261105-04-10 no backup, or a backup with no lane/after, plans no queue-fields', () => {
  const { d } = migrated()
  asV2(d)
  const bdir = path.join(d, '.git/spec-v7-backup')
  fs.rmSync(bdir, { recursive: true, force: true })
  assert.ok(!mig(d).ops.some((o) => o.op === 'queue-fields'))
  const b = path.join(bdir, '2026-01-01T00-00-00.000Z'); fs.mkdirSync(b, { recursive: true })
  fs.writeFileSync(path.join(b, 'spec-queue.json'), JSON.stringify({ version: 1, seq: 1, items: [{ id: 'q3', kind: 'prompt', payload: 'x' }] }))
  assert.ok(!mig(d).ops.some((o) => o.op === 'queue-fields'))
})

test('a live v8 fan-out is never a v7 leftover: plan keeps spec-fanout.json and the run cache, --apply refuses while lanes are out', () => {
  const { d } = migrated()
  const common = path.join(d, '.git')
  fs.writeFileSync(path.join(common, 'spec-fanout.json'), JSON.stringify({ step: 'WAIT', batch: [{ id: '1', stem: 'a', status: 'dispatched' }], waited: [], answered: [] }))
  fs.mkdirSync(path.join(common, 'spec-run-cache'), { recursive: true }); fs.writeFileSync(path.join(common, 'spec-run-cache/x.json'), '{}')
  const p = mig(d)
  assert.ok(!p.ops.some((o) => o.op === 'delete' && /spec-fanout\.json|spec-run-cache/.test(o.path)), JSON.stringify(p.ops))
  assert.strictEqual(p.liveFanout, true)
  const r = runNode('scripts/migrate.js', ['--root', d, '--apply'])
  assert.strictEqual(r.status, 2)
  assert.match(r.stderr, /fan-out is in flight/)
  assert.ok(fs.existsSync(path.join(common, 'spec-fanout.json')))
  assert.ok(fs.existsSync(path.join(common, 'spec-run-cache/x.json')))
  // idle v8 record (every lane merged): still never deleted, and --apply is allowed
  fs.writeFileSync(path.join(common, 'spec-fanout.json'), JSON.stringify({ step: 'REPORT', batch: [{ id: '1', stem: 'a', status: 'merged' }] }))
  const p2 = mig(d)
  assert.strictEqual(p2.liveFanout, false)
  assert.ok(!p2.ops.some((o) => o.op === 'delete' && /spec-fanout\.json/.test(o.path)))
})

test('an already-migrated host is idempotent: shared v7/v8 names and names already archived plan nothing, the outcome is truthful', () => {
  const { d, g } = migrated()
  const c = path.join(d, '.git')
  // live v8 state under names v7 shared, and v7 names the migration already archived, back in place
  fs.writeFileSync(path.join(c, 'spec-fanout.json'), 'null')
  fs.mkdirSync(path.join(c, 'spec-run-cache')); fs.writeFileSync(path.join(c, 'spec-run-cache/x.json'), '{}')
  fs.writeFileSync(path.join(d, '.claude/spec-session.json'), '{}'); fs.writeFileSync(path.join(c, 'spec-queue-done.json'), '{"items":[]}')
  assert.ok(fs.existsSync(path.join(d, 'docs/archive/v7/spec-session.json')) && fs.existsSync(path.join(d, 'docs/archive/v7/spec-queue-done.json')))
  const head = g('rev-parse', 'HEAD').trim()
  assert.deepStrictEqual(mig(d).ops, [])
  const r = runNode('scripts/migrate.js', ['--root', d, '--apply'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /✅ nothing to migrate/)
  assert.ok(fs.existsSync(path.join(c, 'spec-fanout.json')) && fs.existsSync(path.join(c, 'spec-run-cache/x.json')), 'live v8 state kept')
  assert.ok(fs.existsSync(path.join(d, '.claude/spec-session.json')) && fs.existsSync(path.join(c, 'spec-queue-done.json')))
  assert.strictEqual(g('rev-parse', 'HEAD').trim(), head)
})

test('a v7 host whose session file is already archived still migrates fully, the plan leaving that one name alone', () => {
  const { d } = synthetic()
  fs.mkdirSync(path.join(d, 'docs/archive/v7'), { recursive: true }); fs.writeFileSync(path.join(d, 'docs/archive/v7/spec-session.json'), 'old')
  const p = mig(d)
  assert.ok(!p.ops.some((o) => /spec-session/.test(o.path)), JSON.stringify(p.ops))
  assert.ok(p.ops.some((o) => o.op === 'delete' && /spec-fanout\.json/.test(o.path)) && p.ops.some((o) => o.op === 'delete' && /spec-run-cache/.test(o.path)))
  execFileSync('git', ['-C', d, 'add', '-A']); execFileSync('git', ['-C', d, 'commit', '-q', '-m', 'seed archive'])
  const r = runNode('scripts/migrate.js', ['--root', d, '--apply'])
  assert.match(r.stdout, new RegExp(`✅ migrated — ${p.ops.length} steps applied`))
  assert.ok(!fs.existsSync(path.join(d, '.git/spec-fanout.json')) && !fs.existsSync(path.join(d, '.git/spec-run-cache')))
})

// A host whose git dir holds only the names v7 and v8 share, beside the given config.
function sharedNamesHost(config, fanout) {
  const d = tmpdir('mig')
  fs.mkdirSync(path.join(d, '.claude'))
  fs.writeFileSync(path.join(d, '.claude/spec.config.json'), JSON.stringify(config))
  const g = gitRepo(d)
  fs.writeFileSync(path.join(d, '.git/spec-fanout.json'), fanout)
  fs.mkdirSync(path.join(d, '.git/spec-run-cache')); fs.writeFileSync(path.join(d, '.git/spec-run-cache/x.json'), '{}')
  return { d, g }
}

for (const key of ['generatedBy', 'contractHash', 'policy', 'gateCommand']) {
  test(`a config carrying the v7-only key ${key} is v7 evidence: the shared names go, the tag is made, a second run plans nothing`, () => {
    const { d, g } = sharedNamesHost({ testCommand: 'true', [key]: key === 'policy' ? { mergeStrategy: 'squash' } : 'x' }, '{"lanes":[],"wave":1}')
    const c = path.join(d, '.git')
    const p = mig(d)
    assert.strictEqual(p.ops[0].op, 'tag', JSON.stringify(p.ops))
    for (const n of ['spec-fanout.json', 'spec-run-cache']) assert.ok(p.ops.some((o) => o.op === 'delete' && o.path === path.join(c, n)), n + ' planned: ' + JSON.stringify(p.ops))
    mig(d, '--apply')
    assert.ok(g('tag', '-l', 'spec-v7-final').trim())
    assert.ok(!fs.existsSync(path.join(c, 'spec-fanout.json')) && !fs.existsSync(path.join(c, 'spec-run-cache')))
    assert.ok(!(key in JSON.parse(fs.readFileSync(path.join(d, '.claude/spec.config.json'), 'utf8'))))
    // v8 state under the shared names, after the migration: a second run leaves it alone
    fs.writeFileSync(path.join(c, 'spec-fanout.json'), 'null'); fs.mkdirSync(path.join(c, 'spec-run-cache'))
    assert.deepStrictEqual(mig(d).ops, [])
  })
}

test('a plain v8 config trim is no v7 evidence: no tag, and the live v8 state under the shared names is kept', () => {
  const { d, g } = sharedNamesHost({ testCommand: 'true', staleKey: 1 }, 'null')
  const c = path.join(d, '.git')
  const p = mig(d)
  assert.ok(p.ops.some((o) => o.op === 'config'), JSON.stringify(p.ops))
  assert.ok(!p.ops.some((o) => o.op === 'tag' || o.op === 'delete'), JSON.stringify(p.ops))
  mig(d, '--apply')
  assert.strictEqual(g('tag', '-l', 'spec-v7-final').trim(), '')
  assert.ok(fs.existsSync(path.join(c, 'spec-fanout.json')) && fs.existsSync(path.join(c, 'spec-run-cache/x.json')))
})

test('a failed migration commit is not reported as a completed migration', () => {
  const { d } = synthetic()
  fs.writeFileSync(path.join(d, '.git/hooks/pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 })
  const r = runNode('scripts/migrate.js', ['--root', d, '--apply'])
  assert.doesNotMatch(r.stdout, /✅ migrated/)
  assert.match(r.stdout, /migration commit failed/)
})

// ---- spec 20261105/12: the queue converts to version 3 ----------------------------------------

const convert = (items, extra = {}) => {
  const { convertQueue } = require(path.join(__dirname, '../spec/scripts/migrate.js'))
  const root = tmpdir('conv'); gitRepo(root)
  fs.mkdirSync(path.join(root, 'docs/roadmap'), { recursive: true }); fs.writeFileSync(path.join(root, 'docs/roadmap/33-x.md'), '# 33\n')
  return convertQueue(root, { seq: items.length, ...extra, items }).queue
}
const ISO = '2026-11-01T00:00:00.000Z'

test('AC-20261105-12-2 convertQueue: every stored shape of the five real files becomes one version 3 shape', () => {
  const q = convert([
    { id: 'q1', kind: 'spec', payload: 'specs/20260101/01-a.md', added: ISO }, // a version 1 spec item that already carries payload
    { id: 'q2', kind: 'spec', spec: 'specs/20260101/02-b.md', added: ISO },
    { id: 'q3', kind: 'brief', brief: '33' },
    { id: 'q4', kind: 'prompt', lane: 'fix', payload: 'digest sends twice', added: ISO },
    { id: 'q5', kind: 'prompt', payload: '/spec:plan x', ticked: true, added: ISO },
    { id: 'q6', kind: 'prompt', payload: '/spec:fix specs/x.md — gate red', added: ISO },
    { id: 'q7', kind: 'prompt', type: 'fix', payload: 'Admin polish after 10', after: { spec: 'specs/20261104/03-done.md' }, added: ISO },
    { id: 'q8', kind: 'prompt', type: 'plan', payload: '/spec:plan y', done: '2026-11-02T00:00:00.000Z', added: ISO },
    { id: 'q9', kind: 'prompt', payload: 'a plain note', added: 1730000000 },
    { id: 'q10', kind: 'prompt', lane: 'prototype', payload: '/spec:fix z', added: ISO },
    { id: 'q11', kind: 'prompt', payload: 'follow-up: specs/a.md changed x — plan it', added: ISO },
    { id: 'q12', kind: 'prompt', payload: '/spec:fix specs/x.md', added: ISO },
  ], { version: 1 })
  assert.strictEqual(q.version, 3); assert.strictEqual(q.seq, 12)
  const it = Object.fromEntries(q.items.map((i) => [i.id, i]))
  assert.deepStrictEqual([it.q1.kind, it.q1.payload, it.q1.spec], ['spec', 'specs/20260101/01-a.md', undefined])
  assert.deepStrictEqual([it.q2.kind, it.q2.payload], ['spec', 'specs/20260101/02-b.md'])
  assert.deepStrictEqual([it.q3.kind, it.q3.payload, 'added' in it.q3 && it.q3.added !== undefined], ['brief', 'docs/roadmap/33-x.md', false], 'a brief with no added keeps none')
  assert.deepStrictEqual([it.q4.type, it.q4.payload, it.q4.spec], ['fix', 'digest sends twice', undefined])
  assert.deepStrictEqual([it.q5.type, it.q5.payload, !!it.q5.done], ['plan', 'x', true])
  assert.deepStrictEqual([it.q6.type, it.q6.spec, it.q6.payload], ['fix', 'specs/x.md', 'gate red'])
  assert.deepStrictEqual([it.q7.type, it.q7.spec, it.q7.payload, it.q7.after], ['fix', undefined, 'Admin polish after 10', { spec: 'specs/20261104/03-done.md' }])
  assert.deepStrictEqual([it.q8.type, it.q8.payload, it.q8.done], ['plan', '/spec:plan y', '2026-11-02T00:00:00.000Z'].map((v, i) => (i === 1 ? 'y' : v)), 'an ISO done is kept as is; the matching prefix is stripped')
  assert.deepStrictEqual([it.q9.type, it.q9.added], [undefined, '2024-10-27T03:33:20.000Z'], 'an epoch added becomes ISO; a note has no type')
  assert.deepStrictEqual([it.q10.type, it.q10.payload], ['prototype', '/spec:fix z'], 'a prefix that disagrees with the lane stays as text')
  assert.deepStrictEqual([it.q11.type, it.q11.spec], [undefined, undefined], 'a note is never bound')
  assert.deepStrictEqual([it.q12.type, it.q12.spec, it.q12.payload], ['fix', 'specs/x.md', ''])
  assert.ok(q.items.every((i) => !('lane' in i) && !('ticked' in i) && !('brief' in i)), 'no v7 field survives')
})

test('AC-20261105-12-2 an epoch-number added and a v7 brief item with `brief` and no payload convert', () => {
  const q = convert([{ id: 'q1', kind: 'brief', brief: '33', added: Date.now() - 7200e3 }, { id: 'q2', kind: 'brief', brief: '99' }])
  assert.strictEqual(q.items[0].payload, 'docs/roadmap/33-x.md')
  assert.match(q.items[0].added, /^\d{4}-\d\d-\d\dT/)
  assert.strictEqual(q.items[1].payload, '99', 'a brief with no file keeps its number')
})

function queueHost(version, items, files = {}) {
  const d = tmpdir('qhost')
  for (const [f, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t) }
  fs.writeFileSync(path.join(d, '.gitignore'), '.claude/worktrees/\nspecs/**/*.run/\n')
  const g = gitRepo(d)
  fs.writeFileSync(qfile(d), JSON.stringify({ version, seq: items.length, items }, null, 2) + '\n')
  return { d, g }
}

test('AC-20261105-12-2 --apply converts a version 1 file; a second --apply is "nothing to migrate"; the queue then reads strictly', () => {
  const { d } = queueHost(1, [
    { id: 'q1', kind: 'spec', payload: 'specs/20261104/01-a.md', added: ISO },
    { id: 'q2', kind: 'spec', spec: 'specs/20261104/02-b.md', added: ISO },
    { id: 'q3', kind: 'brief', brief: '33' },
    { id: 'q4', kind: 'prompt', lane: 'fix', payload: 'digest sends twice', added: ISO },
    { id: 'q5', kind: 'prompt', payload: '/spec:plan x', ticked: true, added: ISO },
    { id: 'q6', kind: 'prompt', payload: '/spec:fix specs/x.md — gate red', added: ISO },
  ], { 'docs/roadmap/33-x.md': '# 33\n', 'a.txt': 'a\n' })
  const p = mig(d)
  assert.ok(p.ops.some((o) => o.op === 'queue' && o.note === '6 items -> v3'), JSON.stringify(p.ops))
  assert.strictEqual(readQ(d).version, 1, 'the plan writes nothing')
  mig(d, '--apply')
  const q = readQ(d)
  assert.strictEqual(q.version, 3)
  assert.deepStrictEqual(q.items.map((i) => [i.kind, i.type, i.spec, i.payload]), [
    ['spec', undefined, undefined, 'specs/20261104/01-a.md'], ['spec', undefined, undefined, 'specs/20261104/02-b.md'],
    ['brief', undefined, undefined, 'docs/roadmap/33-x.md'], ['prompt', 'fix', undefined, 'digest sends twice'],
    ['prompt', 'plan', undefined, 'x'], ['prompt', 'fix', 'specs/x.md', 'gate red']])
  assert.ok(q.items[4].done)
  const again = runNode('scripts/migrate.js', ['--root', d, '--apply'])
  assert.match(again.stdout, /✅ nothing to migrate/)
  assert.strictEqual(runNode('scripts/queue.js', ['list', '--root', d]).status, 0, 'the strict reader accepts the result')
})

test('AC-20261105-12-1 shop-bltr q52: a version 2 fix with a bare payload is a fix to status, to queue next and to fanout once migrated', () => {
  const A = 'specs/20261104'
  const { d } = queueHost(2, [{ id: 'q52', kind: 'prompt', type: 'fix', payload: 'Admin polish after 10', after: { spec: `${A}/03-done.md` }, added: ISO }],
    { [`${A}/03-done.md`]: '---\nstatus: done\n---\n# Done\n', '.claude/spec.config.json': JSON.stringify({ testCommand: 'true', lanes: 2 }) })
  const r0 = runNode('scripts/queue.js', ['next', '--root', d])
  assert.strictEqual(r0.status, 2, 'unmigrated: queue next refuses')
  assert.ok(r0.stderr.includes('queue file is version 2 — run /spec:migrate'), r0.stderr)
  const fan0 = runNode('scripts/fanout.js', ['--root', d, '--json'])
  assert.strictEqual(fan0.status, 2); assert.ok(fan0.stderr.includes('queue file is version 2 — run /spec:migrate'), fan0.stderr)
  const plan = mig(d)
  assert.ok(plan.ops.some((o) => o.op === 'queue' && o.note === '1 items -> v3'))
  mig(d, '--apply')
  assert.strictEqual(runNode('scripts/queue.js', ['next', '--root', d]).stdout.trim(), '/spec:fix Admin polish after 10')
  const planned = runNode('scripts/fanout.js', ['--root', d, '--mark', 'planned'])
  assert.strictEqual(planned.status, 0, planned.stderr)
  const batch = require(path.join(__dirname, '../spec/scripts/lib/state.js')).readFanout(d).batch
  assert.strictEqual(batch.length, 1)
  assert.match(batch[0].stem, /^fix-admin-polish-after-10-[0-9a-f]{6}$/)
  assert.strictEqual(batch[0].item, 'q52')
})

test('AC-20261105-12-9 every stored shape, migrated, is one shape to status and to fanout', () => {
  const A = 'specs/20261104'
  const Qm = require(path.join(__dirname, '../spec/scripts/lib/queue.js'))
  const stt = require(path.join(__dirname, '../spec/scripts/lib/state.js'))
  const spec = (status) => `---\nstatus: ${status}\n---\n# S\n\n## File Plan\n\n| Path | Action | Summary |\n|---|---|---|\n| x.js | CREATE | x |\n`
  const files = { [`${A}/01-a.md`]: spec('done'), 'a.txt': 'a\n', '.claude/spec.config.json': JSON.stringify({ testCommand: 'true', lanes: 4 }) }
  const shapes = [
    { v: [1], it: { id: 'q1', kind: 'prompt', lane: 'fix', payload: 'v1 lane fix' } },
    { v: [2], it: { id: 'q2', kind: 'prompt', type: 'fix', payload: 'v2 bare fix' } },
    { v: [1, 2], it: { id: 'q3', kind: 'prompt', payload: `/spec:fix ${A}/01-a.md — a prefixed bound fix, no type` } },
    { v: [2], it: { id: 'q4', kind: 'prompt', type: 'fix', payload: `/spec:fix some prefixed spec-less fix` } },
    { v: [1, 2], it: { id: 'q5', kind: 'prompt', payload: '/spec:plan a typed plan' } },
  ]
  for (const version of [1, 2]) {
    const { d } = queueHost(version, shapes.filter((x) => x.v.includes(version)).map((x) => ({ added: ISO, ...x.it })), files)
    mig(d, '--apply')
    const screen = runNode('scripts/status.js', ['--root', d, '--all']).stdout
    const plan = JSON.parse(runNode('scripts/fanout.js', ['--root', d, '--json']).stdout).body
    const open = Qm.open(Qm.read(d))
    assert.ok(open.length >= 3)
    for (const it of open) {
      const paste = Qm.paste(d, it)
      assert.ok(screen.includes(paste), `status names ${paste}:\n${screen}`)
      if (it.type === 'fix') {
        const lane = it.spec ? `${it.spec} — fix: ${it.payload}`.replace(/^[^ ]+ — /, '') : `fix-${stt.slugOf(it.payload)}`
        assert.ok(plan.includes(lane), `fanout makes ${paste} a lane (${lane}):\n${plan}`)
      } else assert.ok(plan.includes(paste), `fanout accounts for ${paste}:\n${plan}`)
    }
  }
})

// ---- spec 20261105/14: v7 prototype records and the prototype config block --------------------------------

const FIX = path.join(__dirname, 'fixtures/prototype-v7')
function protoHostV7() {
  const d = tmpdir('mig')
  fs.cpSync(path.join(FIX, 'design'), path.join(d, 'design'), { recursive: true })
  fs.mkdirSync(path.join(d, '.claude'))
  fs.copyFileSync(path.join(FIX, 'config.json'), path.join(d, '.claude/spec.config.json'))
  const g = gitRepo(d)
  return { d, g }
}
const rj = (d, rel) => JSON.parse(fs.readFileSync(path.join(d, rel), 'utf8'))

test('AC-20261105-14-12 one prototype op per v7 record; apply rewrites status, pins, contract and the config block; a second apply plans nothing', () => {
  const { d, g } = protoHostV7()
  const p = mig(d)
  const protos = p.ops.filter((o) => o.op === 'prototype').map((o) => o.note)
  assert.deepStrictEqual(protos, ['01-first-light: v7 → v8', '03-admin-rounds: v7 → v8', 'mid-round: v7 → v8'])
  assert.ok(p.ops.some((o) => o.op === 'config'))
  for (const left of ['states.json', 'captures', 'tests', 'e2e.log']) assert.ok(p.owned.includes(`design/prototypes/03-admin-rounds/${left}`), left)
  assert.ok(p.warns.includes('prototype.e2eCommand reads PROTO_URL — the run sets APP_URL'), p.warns.join('|'))
  const before = g('status', '--porcelain')
  assert.strictEqual(before, '', 'planning changes nothing')
  const text = runNode('scripts/migrate.js', ['--root', d])
  assert.match(text.stdout, /prototype 03-admin-rounds: v7 → v8/)

  mig(d, '--apply')
  const P = 'design/prototypes/03-admin-rounds'
  assert.deepStrictEqual(rj(d, P + '/status.json'), {
    stem: '03-admin-rounds', brief: 'docs/roadmap/03-admin-rounds.md', idea: null, branch: 'proto/03-admin-rounds', worktree: '.claude/worktrees/proto-03-admin-rounds',
    appPort: 42439, url: 'http://127.0.0.1:42439', rounds: 2,
    marks: { opened: '2026-10-23T06:53:14.660Z', approved: '2026-10-24T06:13:13.176Z', contracted: '2026-10-24T06:16:09.391Z', closed: '2026-10-27T08:31:49.670Z' },
    handled: ['p1', 'p2', 'p3'],
  })
  const pins = rj(d, P + '/pins.json')
  assert.ok(Array.isArray(pins))
  assert.deepStrictEqual(pins[0], { id: 'p1', kind: 'behaviour', route: '/admin/rounds', note: 'One tab per product line with open counts; the default tab is the first line with anything in flight', round: 1, status: 'active', at: '2026-10-24T06:14:23.000Z' })
  assert.strictEqual(pins[1].given, 'empty')
  assert.strictEqual(pins[1].route, '/admin/rounds')
  assert.doesNotMatch(JSON.stringify(pins), /screen|anchor|"who"/)
  const c = rj(d, P + '/contract.json')
  assert.deepStrictEqual(Object.keys(c), ['stem', 'rounds', 'pins'])
  assert.strictEqual(c.rounds, 2)
  assert.deepStrictEqual(c.pins[1], { id: 'p2', kind: 'behaviour', route: '/admin/rounds', given: 'empty', note: 'With no rounds the page says there are none yet and offers to create one', sentence: 'On /admin/rounds, given empty: With no rounds the page says there are none yet and offers to create one', round: 2, status: 'active' })
  assert.strictEqual(c.pins[0].sentence, 'On /admin/rounds: One tab per product line with open counts; the default tab is the first line with anything in flight')
  const mid = rj(d, 'design/prototypes/mid-round/status.json')
  assert.deepStrictEqual(mid.marks, { opened: '2026-11-02T06:50:16.586Z' })
  assert.strictEqual(mid.idea, 'invoice list page')
  assert.strictEqual(mid.brief, null)
  assert.strictEqual(mid.rounds, 1)
  assert.deepStrictEqual(rj(d, 'design/prototypes/01-first-light/status.json').marks, { opened: '2026-10-07T06:50:16.586Z', closed: '2026-10-07T07:22:54.633Z' })
  assert.ok(!fs.existsSync(path.join(d, 'design/prototypes/01-first-light/pins.json')), 'no pins file is invented')
  for (const left of ['states.json', 'e2e.log', 'captures/admin_rounds--default.png', 'tests/proto-03-admin-rounds.spec.ts']) {
    assert.strictEqual(fs.readFileSync(path.join(d, P, left)).toString(), fs.readFileSync(path.join(FIX, 'design/prototypes/03-admin-rounds', left)).toString(), left + ' untouched')
  }
  const cfg = rj(d, '.claude/spec.config.json')
  const old = rj(FIX, 'config.json').prototype
  assert.strictEqual(cfg.prototype.e2eCommand, old.e2eRun)
  assert.strictEqual(cfg.prototype.bootCommand, 'pnpm --filter web dev --port $PORT')
  assert.deepStrictEqual(['url', 'picture', 'e2eFile'].map((k) => cfg.prototype[k]), [old.url, old.picture, old.e2eFile])
  for (const k of ['overlay', 'e2eList', 'e2eRun', 'dbCreate', 'dbDestroy']) assert.ok(!(k in cfg.prototype), k)
  assert.strictEqual(g('status', '--porcelain'), '', 'the migration commit holds it all')

  const again = runNode('scripts/migrate.js', ['--root', d, '--apply'])
  assert.strictEqual(again.status, 0)
  assert.match(again.stdout, /✅ nothing to migrate/)
  const proto = (stem) => runNode('scripts/prototype.js', [stem, '--state', '--root', d])
  assert.strictEqual(proto('03-admin-rounds').stdout.trim(), 'CLOSED')
  assert.strictEqual(proto('01-first-light').stdout.trim(), 'CLOSED')
  assert.strictEqual(proto('mid-round').stdout.trim(), 'ROUND')
})

test('AC-20261105-14-12 a v8 host with a v7 record only plans the prototype op; the v7 tag is not made for it', () => {
  const { d } = protoHostV7()
  fs.writeFileSync(path.join(d, '.claude/spec.config.json'), JSON.stringify({ testCommand: 'true', prototype: { url: 'http://localhost:{port}', bootCommand: 'npm run dev' } }))
  execFileSync('git', ['-C', d, 'commit', '-qam', 'v8 config'])
  const p = mig(d)
  assert.ok(p.ops.some((o) => o.op === 'prototype'))
  assert.ok(!p.ops.some((o) => o.op === 'tag' || o.op === 'config'))
})
