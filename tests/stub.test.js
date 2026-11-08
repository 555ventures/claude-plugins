'use strict'
// Pins spec/scripts/lib/stub.js (spec 20261107/01, ADR-0046): a done or superseded spec on disk is its frontmatter plus
// `text:` and `acs:`, its title and its goal; the sweep commits only finished, tracked, unedited specs; history holds the text;
// and every reader of state reads a stub as it read the full text.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { tmpdir, gitRepo, runNode, SPEC, ROOT } = require('./helpers')
const stub = require(path.join(SPEC, 'scripts/lib/stub.js'))
const st = require(path.join(SPEC, 'scripts/lib/state.js'))
const S = require(path.join(SPEC, 'scripts/lib/spec.js'))
const W = require(path.join(SPEC, 'scripts/lib/work.js'))

const FULL = `---
date: 2026-11-05
status: done
area: core
depends_on: [specs/20261104/01-a.md]
brief: 03
prototype: inv
---

# The thing

## Intent
- You asked: a thing

## Goal

The thing exists, and it is small.
Second line.

## Decisions

| ID | Decision | Why |
|----|----------|-----|
| D1 | plain text [retired: 20261106/01] | simple |

## File Plan

| Path | Action | Summary |
|------|--------|---------|
| x.js | CREATE | x |

## Acceptance Criteria

- **AC-20261105-14-1**: WHEN x THE SYSTEM SHALL y.
- **AC-20261105-14-3**: WHEN a THE SYSTEM SHALL b (pin p2).
- **AC-20261105-14-4**: WHEN c THE SYSTEM SHALL d (pin p3) and
  e (pin p4). [retired: 20261106/02]

## Assumptions

- A1: it is small — if false: ask: shrink it | split it
`
const STUB = (sha) => `---
date: 2026-11-05
status: done
area: core
depends_on: [specs/20261104/01-a.md]
brief: 03
prototype: inv
text: ${sha}
acs: [AC-20261105-14-1, AC-20261105-14-3 (pin p2), AC-20261105-14-4 (pin p3) (pin p4)]
---

# The thing

## Goal

The thing exists, and it is small.
Second line.
`

const put = (d, rel, text) => { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), text) }
const read = (d, rel) => fs.readFileSync(path.join(d, rel), 'utf8')
const doc = (status, extra = '') => FULL.replace('status: done', `status: ${status}`).replace('# The thing', `# The thing${extra}`)

test('AC-20261107-01-1 stubOf keeps the frontmatter verbatim, sets text: and acs: with the pin cites, keeps title and goal and nothing else; stubbing a stub only moves text:', () => {
  assert.strictEqual(stub.stubOf(FULL, 'abc1234'), STUB('abc1234'))
  assert.strictEqual(stub.stubOf(stub.stubOf(FULL, 'abc1234'), 'def5678'), stub.stubOf(FULL, 'def5678'))
  const fm = S.parse(STUB('abc1234')).frontmatter
  assert.deepStrictEqual(fm.acs, ['AC-20261105-14-1', 'AC-20261105-14-3 (pin p2)', 'AC-20261105-14-4 (pin p3) (pin p4)'])
  assert.ok(stub.isStub(fm) && !stub.isStub(S.parse(FULL).frontmatter) && !stub.isStub({ text: 'not a sha' }) && !stub.isStub({ text: 'abc12' }))
  const had = FULL.replace('prototype: inv\n', 'text: 1111111\nacs: [AC-old-1]\nprototype: inv\n')
  assert.strictEqual(stub.stubOf(had, 'abc1234'), STUB('abc1234').replace('prototype: inv\ntext: abc1234\nacs: [AC-20261105-14-1, AC-20261105-14-3 (pin p2), AC-20261105-14-4 (pin p3) (pin p4)]\n',
    'text: abc1234\nacs: [AC-20261105-14-1, AC-20261105-14-3 (pin p2), AC-20261105-14-4 (pin p3) (pin p4)]\nprototype: inv\n'), 'present keys are replaced in place')
  const bare = '---\nstatus: superseded\n---\n# Old\n\n## Decisions\n\nnone\n'
  assert.strictEqual(stub.stubOf(bare, 'abc1234'), '---\nstatus: superseded\ntext: abc1234\nacs: []\n---\n\n# Old\n')
  assert.strictEqual(stub.stubOf(stub.stubOf(bare, 'abc1234'), 'def5678'), stub.stubOf(bare, 'def5678'))
})

// A repo holding a done, a superseded, a hardened, an edited done and an untracked done spec.
function sweepHost() {
  const d = tmpdir('stub')
  put(d, '.gitignore', '.claude/worktrees/\nspecs/**/*.run/\n')
  const specs = { done: 'specs/20261101/01-done.md', sup: 'specs/20261101/02-sup.md', hard: 'specs/20261101/03-hard.md', edited: 'specs/20261101/04-edited.md' }
  put(d, specs.done, doc('done')); put(d, specs.sup, doc('superseded')); put(d, specs.hard, doc('hardened')); put(d, specs.edited, doc('done'))
  put(d, 'specs/20261101/01-done.run/note.md', doc('done'))
  const g = gitRepo(d)
  put(d, specs.edited, doc('done', ', edited')); put(d, 'specs/20261101/05-new.md', doc('done'))
  return { d, g, specs }
}

test('AC-20261107-01-2 sweep stubs only the tracked, unedited done and superseded specs in one commit, with the pre-sweep HEAD as text:; a second sweep commits nothing', () => {
  const { d, g, specs } = sweepHost()
  const head = g('rev-parse', 'HEAD').trim()
  const before = Object.fromEntries(['specs/20261101/03-hard.md', specs.edited, 'specs/20261101/05-new.md', 'specs/20261101/01-done.run/note.md'].map((f) => [f, read(d, f)]))
  const r = stub.sweep(d)
  assert.deepStrictEqual(r.paths, [specs.done, specs.sup])
  assert.strictEqual(g('log', '-1', '--format=%s').trim(), 'chore(spec): stub 2 specs')
  assert.strictEqual(g('rev-parse', 'HEAD^').trim(), head)
  assert.strictEqual(r.sha, g('rev-parse', 'HEAD').trim())
  assert.deepStrictEqual(g('show', '--name-only', '--format=', 'HEAD').trim().split('\n'), [specs.done, specs.sup])
  assert.strictEqual(read(d, specs.done), stub.stubOf(doc('done'), head))
  assert.strictEqual(read(d, specs.sup), stub.stubOf(doc('superseded'), head))
  for (const [f, t] of Object.entries(before)) assert.strictEqual(read(d, f), t, f + ' is byte-identical')
  assert.deepStrictEqual(g('status', '--porcelain').trimEnd().split('\n'), [` M ${specs.edited}`, '?? specs/20261101/05-new.md'])
  const again = stub.sweep(d)
  assert.deepStrictEqual([again.paths, again.sha], [[], null])
  assert.strictEqual(g('rev-parse', 'HEAD').trim(), r.sha, 'nothing to stub commits nothing')
  g('commit', '-qam', 'edit lands')
  assert.ok(stub.sweep(d).sha && g('log', '-1', '--format=%s').trim() === 'chore(spec): stub 20261101/04', 'one spec is named by its id')
})

test('AC-20261107-01-2 a failed stub commit puts the specs back as they were and does not throw', () => {
  const { d, g, specs } = sweepHost()
  const head = g('rev-parse', 'HEAD').trim()
  put(d, '.git/index.lock', '')
  const r = stub.sweep(d)
  assert.strictEqual(r.sha, null)
  assert.strictEqual(read(d, specs.done), doc('done'))
  assert.strictEqual(read(d, specs.sup), doc('superseded'))
  fs.rmSync(path.join(d, '.git/index.lock'))
  assert.strictEqual(g('rev-parse', 'HEAD').trim(), head)
  assert.deepStrictEqual(g('status', '--porcelain').trimEnd().split('\n'), [` M ${specs.edited}`, '?? specs/20261101/05-new.md'])
})

test('AC-20261107-01-3 fullText and readFull read the text at text: from the main checkout and a linked worktree; a sha the clone lacks is refused, exit 2', () => {
  const { d, g, specs } = sweepHost()
  const head = g('rev-parse', 'HEAD').trim()
  stub.sweep(d)
  assert.strictEqual(stub.fullText(d, specs.done, head), doc('done'))
  assert.deepStrictEqual(stub.readFull(d, specs.done), S.parse(doc('done')))
  assert.deepStrictEqual(stub.readFull(d, specs.hard), S.parse(doc('hardened')), 'a full spec reads as itself')
  const wt = path.join(d, '.claude/worktrees/lane'); g('worktree', 'add', '-q', '-b', 'lane', wt)
  assert.deepStrictEqual(stub.readFull(wt, specs.sup), S.parse(doc('superseded')))
  assert.deepStrictEqual(stub.readFull(wt, path.join(wt, specs.sup)), S.parse(doc('superseded')), 'an absolute path too')
  put(d, specs.done, stub.stubOf(doc('done').replace('prototype: inv\n', ''), 'deadbeef'))
  assert.throws(() => stub.readFull(d, specs.done), (e) => e.exit === 2 && e.message === `${specs.done} names text deadbeef, not in this clone — git fetch --unshallow, then re-run`)
  put(d, '.claude/spec.config.json', JSON.stringify({ testCommand: 'true' })); g('add', '-A'); g('commit', '-qm', 'gone')
  const r = runNode('scripts/run.js', [specs.done, '--fix', 'it breaks', '--in-place', '--root', d])
  assert.ok(r.status === 2 && r.stderr.includes('names text deadbeef, not in this clone — git fetch --unshallow'), r.stderr + r.stdout)
})

// A host whose done spec 01-a (brief 03, prototype inv) is what 02-b depends on and what brief 03 holds.
function readerHost() {
  const d = tmpdir('stub-readers')
  put(d, '.gitignore', '.claude/worktrees/\nspecs/**/*.run/\n')
  put(d, '.claude/spec.config.json', JSON.stringify({ testCommand: 'true', lanes: 2 }))
  put(d, 'docs/roadmap/03-alpha.md', '# 03 — alpha\n\nPhase: P1 · Depends on: — · Primary workspaces: app\n\n## Result\n\nx\n')
  put(d, 'docs/roadmap/04-beta.md', '# 04 — beta\n\nPhase: P1 · Depends on: 03 · Primary workspaces: app\n\n## Result\n\nx\n')
  put(d, 'specs/20261104/01-a.md', FULL.replace('depends_on: [specs/20261104/01-a.md]', 'depends_on: []'))
  put(d, 'specs/20261104/02-b.md', FULL.replace('status: done', 'status: hardened').replace('brief: 03', 'brief: 04').replace('prototype: inv\n', '')
    .replace('# The thing', '# B'))
  const g = gitRepo(d)
  return { d, g }
}
function readings(d) {
  const json = (r) => { assert.ok(r.stdout, r.stderr); return JSON.parse(r.stdout) }
  const doctor = json(runNode('scripts/doctor.js', ['--root', d, '--json']))
  const fan = runNode('scripts/fanout.js', ['--root', d])
  return {
    specs: W.readSpecs(d).map(({ filePlan, filePaths, ...s }) => s),
    briefs: W.readBriefs(d).map((b) => ({ num: b.num, status: b.status, specs: b.specs.map((s) => s.path), depends_on: b.depends_on })),
    gates: [W.gateWhy(d, { spec: 'specs/20261104/01-a.md' }), W.gateWhy(d, { brief: '03' })],
    citing: st.specsCiting(d, 'inv'),
    status: json(runNode('scripts/status.js', ['--json', '--root', d])),
    doctor: { ok: doctor.ok, findings: doctor.findings, info: doctor.info.filter((l) => !l.startsWith('box:')) },
    fanout: [fan.status, fan.stdout],
    queue: runNode('scripts/queue.js', ['list', '--root', d]).stdout,
  }
}

test('AC-20261107-01-4 every reader of state reads a stubbed done spec as its full text: specs, briefs, gates, citing, status --json (filePlan []), doctor, fanout eligibility, the queue', () => {
  const { d, g } = readerHost()
  const before = readings(d)
  assert.ok(before.fanout[1].includes('lane 1: specs/20261104/02-b.md'), 'the dependency is done: ' + before.fanout[1])
  assert.strictEqual(before.briefs.find((b) => b.num === '03').status, 'done')
  assert.deepStrictEqual(stub.sweep(d).paths, ['specs/20261104/01-a.md'])
  assert.ok(stub.isStub(st.readSpec(path.join(d, 'specs/20261104/01-a.md')).frontmatter))
  const after = readings(d)
  const a = after.status.specs.find((s) => s.path === 'specs/20261104/01-a.md')
  assert.deepStrictEqual(a.filePlan, [], 'a stub lists no File Plan')
  a.filePlan = before.status.specs.find((s) => s.path === 'specs/20261104/01-a.md').filePlan
  assert.deepStrictEqual(after, before)
  assert.strictEqual(after.briefs.find((b) => b.num === '03').status, 'done', 'a brief whose members are all stubs is done')
  st.writeStatus(path.join(d, 'specs/20261104/01-a.md'), 'superseded')
  assert.strictEqual(read(d, 'specs/20261104/01-a.md'), g('show', 'HEAD:specs/20261104/01-a.md').replace('status: done', 'status: superseded'), 'writeStatus changes only the status line')
})

test('AC-20261107-01-8 a dry sweep of this repo lists only finished specs not yet stubs and writes nothing; swept fixture specs leave no [retired: tag under specs/', () => {
  const status = (r) => require('child_process').execFileSync('git', ['-C', ROOT, ...r], { encoding: 'utf8' })
  const was = [status(['rev-parse', 'HEAD']), status(['status', '--porcelain'])]
  const dry = stub.sweep(ROOT, { dry: true })
  for (const p of dry.paths) {
    const fm = st.readSpec(path.join(ROOT, p)).frontmatter
    assert.ok(['done', 'superseded'].includes(fm.status) && !stub.isStub(fm), p)
  }
  assert.ok(Number.isInteger(dry.retired) && dry.sha === null)
  assert.deepStrictEqual([status(['rev-parse', 'HEAD']), status(['status', '--porcelain'])], was, 'a dry sweep writes nothing')
  const { d } = sweepHost()
  assert.deepStrictEqual(stub.sweep(d, { dry: true }), { paths: ['specs/20261101/01-done.md', 'specs/20261101/02-sup.md'], retired: 4, sha: null })
  const f = tmpdir('stub-retired')
  put(f, 'specs/20261101/01-done.md', doc('done')); put(f, 'specs/20261102/01-sup.md', doc('superseded')); gitRepo(f)
  stub.sweep(f)
  const tagged = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? tagged(path.join(dir, e.name))
    : read(dir, e.name).includes('[retired:') ? [e.name] : []))
  assert.deepStrictEqual(tagged(path.join(f, 'specs')), [], 'grep -rl "[retired:" specs/ finds nothing')
})
