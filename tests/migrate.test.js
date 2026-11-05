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
  assert.strictEqual(q.version, 2); assert.strictEqual(q.seq, 9)
  assert.deepStrictEqual(q.items.map((i) => [i.id, i.kind, i.payload]), [['q1', 'brief', 'docs/roadmap/33-x.md'], ['q2', 'spec', 'specs/20260101/01-a.md'], ['q3', 'prompt', 'do it'], ['q4', 'prompt', 'plain'], ['q5', 'prompt', 'ms']])
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
  assert.strictEqual(q.version, 2); assert.strictEqual(q.items.length, nq)
  assert.ok(q.items.every((i) => i.id && i.payload && i.kind))
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

test('AC-20261105-04-10 an already-migrated host gets queue-fields from the newest backup: planned line by line, applied, idempotent', () => {
  const { d } = migrated()
  const c = path.join(d, '.git')
  const bdir = path.join(c, 'spec-v7-backup')
  fs.rmSync(bdir, { recursive: true, force: true }) // the apply's own backup holds the full v1 queue; use a synthetic one
  const old = path.join(bdir, '2026-01-01T00-00-00.000Z')
  fs.mkdirSync(old, { recursive: true })
  fs.writeFileSync(path.join(old, 'spec-queue.json'), JSON.stringify({ version: 1, seq: 9, items: [
    { id: 'q1', kind: 'brief', brief: '33', after: { brief: '3' } }, { id: 'q3', kind: 'prompt', payload: 'do it', lane: 'fix', after: { spec: 'specs/20260101/01-a.md' } }, { id: 'q4', kind: 'prompt', lane: 'plan', payload: 'plain' }, { id: 'q99', kind: 'prompt', lane: 'plan' }] }))
  const q = readQ(d)
  const before = JSON.stringify(q)
  const p = mig(d)
  const op = p.ops.find((o) => o.op === 'queue-fields')
  assert.ok(op && op.note === '3 fills', JSON.stringify(op))
  assert.deepStrictEqual(p.fills.map((f) => f.text), ['q1 after brief 03', 'q3 after specs/20260101/01-a.md', 'q4 type plan'])
  assert.strictEqual(JSON.stringify(readQ(d)), before, 'plan writes nothing')
  const text = runNode('scripts/migrate.js', ['--root', d]).stdout
  assert.ok(text.includes('q4 type plan') && text.includes('q1 after brief 03'), text)
  mig(d, '--apply')
  const items = Object.fromEntries(readQ(d).items.map((i) => [i.id, i]))
  assert.deepStrictEqual(items.q1.after, { brief: '03' })
  assert.deepStrictEqual([items.q3.type, items.q3.after], ['fix', { spec: 'specs/20260101/01-a.md' }])
  assert.strictEqual(items.q4.type, 'plan')
  assert.ok(!mig(d).ops.some((o) => o.op === 'queue-fields'), 'a second run plans no queue-fields')
})

test('AC-20261105-04-10 no backup, or a backup with no lane/after, plans no queue-fields', () => {
  const { d } = migrated()
  const bdir = path.join(d, '.git/spec-v7-backup')
  fs.rmSync(bdir, { recursive: true, force: true })
  assert.ok(!mig(d).ops.some((o) => o.op === 'queue-fields'))
  const b = path.join(bdir, '2026-01-01T00-00-00.000Z'); fs.mkdirSync(b, { recursive: true })
  fs.writeFileSync(path.join(b, 'spec-queue.json'), JSON.stringify({ version: 1, seq: 1, items: [{ id: 'q3', kind: 'prompt', payload: 'x' }] }))
  assert.ok(!mig(d).ops.some((o) => o.op === 'queue-fields'))
})
