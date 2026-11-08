'use strict'
// Pins spec/scripts/run.js by execution on a tmp host: the twelve steps, one landing path (lib/land.js), the three
// questions, the rules that decide instead of asking (each a 📌 line), and a fix as the same machine with no spec file.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { tmpdir, gitRepo, runNode, runBash, SPEC } = require('./helpers')
const st = require(path.join(SPEC, 'scripts/lib/state.js'))
const pending = require(path.join(SPEC, 'scripts/lib/pending.js'))
const Q = require(path.join(SPEC, 'scripts/lib/queue.js'))
const stub = require(path.join(SPEC, 'scripts/lib/stub.js'))

const REL = 'specs/20261104/01-thing.md'
const SPEC_DOC = `---
date: 2026-11-04
status: hardened
area: core
depends_on: []
brief: n/a
architecture: false
---

# Thing

## Intent
- You asked: make a thing
- I will build:
  - feature.txt holding the thing
- I will not touch:
  - a.txt
- Users will notice: a thing appears
- Architecture or behaviour change: no

## Decisions

| ID | Decision | Why |
|----|----------|-----|
| D1 | plain text, no JSON \\| no YAML | ADR-0001 |

## File Plan

| Path | Action | Summary |
|------|--------|---------|
| feature.txt | CREATE | the thing |

## Acceptance Criteria

- **AC-20261104-01-1**: WHEN the build is done THE SYSTEM SHALL have feature.txt.

## Assumptions

- A1: the thing is small — if false: ask: shrink it | split it
- A2: one file is enough — if false: split it in two
`
// testCommand: red while a RED file exists; every real run appends its cwd to $RUN_COUNTER.
const CHECK = `const fs = require('fs')
if (process.env.RUN_COUNTER) fs.appendFileSync(process.env.RUN_COUNTER, process.cwd() + '\\n')
if (fs.existsSync('RED')) { console.error('FAIL: RED flag present'); process.exit(1) }
const main = fs.existsSync('MOVER') && fs.readFileSync('MOVER', 'utf8') // every gate run moves that checkout's trunk
if (main) { fs.appendFileSync(main + '/moves.txt', 'x'); require('child_process').execSync('git add -A && git commit -qm move', { cwd: main }) }
console.log('ok')
`
const put = (dir, f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t) }

function fixture({ status = 'hardened', cfg = {}, files = {} } = {}) {
  const dir = tmpdir('run')
  put(dir, '.gitignore', '.claude/worktrees/\nspecs/**/*.run/\n')
  put(dir, 'check.js', CHECK)
  put(dir, '.claude/spec.config.json', JSON.stringify({ testCommand: 'node check.js', ...cfg }))
  put(dir, REL, SPEC_DOC.replace('status: hardened', 'status: ' + status))
  for (const [f, t] of Object.entries(files)) put(dir, f, t)
  const g = gitRepo(dir)
  const counter = path.join(tmpdir('counter'), 'runs.log')
  const runIn = (root, ...a) => runNode('scripts/run.js', [REL, '--root', root, ...a], { env: { RUN_COUNTER: counter } })
  return {
    dir, g, counter, runIn, run: (...a) => runIn(dir, ...a),
    wt: path.join(dir, '.claude/worktrees/spec-01-thing'),
    gates: () => (fs.existsSync(counter) ? fs.readFileSync(counter, 'utf8').trim().split('\n') : []),
    state: (root = dir) => st.readRun(path.join(root, REL)),
    status: (root = dir) => st.readSpec(path.join(root, REL)).frontmatter.status,
    findings: (findings, f = path.join(tmpdir('findings'), 'f.json')) => { fs.writeFileSync(f, JSON.stringify({ findings, verdict: findings.some((x) => x.severity === 'blocking') ? 'fix' : 'clean' })); return f },
  }
}

let bumps = 0
const bump = (dir) => fs.writeFileSync(path.join(dir, 'bump.txt'), `round ${++bumps} ${process.hrtime.bigint()}\n`)
const ok = (r) => { assert.strictEqual(r.status, 0, r.stderr + r.stdout); return r.stdout }
const BLOCKING = [{ severity: 'blocking', file: 'feature.txt', line: 1, summary: 'wrong thing', evidence: 'cat' }]
const build = (h, root = h.dir) => { ok(h.runIn(root)); put(root === h.dir ? h.wt : root, 'feature.txt', 'thing\n'); return ok(h.runIn(root, '--mark', 'built')) }
const open = (h) => Q.open(Q.read(h.dir))
const newestGateTree = (h, dir = path.join(h.dir, '.git/spec-run-cache')) => {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))).sort((a, b) => a.ts.localeCompare(b.ts)).pop().tree
}

test('a merge reports the derivation\'s next pick, not the queue file\'s head: a spec this one unblocks is named', () => {
  const OTHER = 'specs/20261104/02-other.md'
  const doc = SPEC_DOC.replace('# Thing', '# Other').replace('depends_on: []', `depends_on: [${REL}]`).replace(/AC-20261104-01-1/g, 'AC-20261104-02-1')
  const h = fixture({ files: { [OTHER]: doc } }); build(h)
  const done = ok(h.run('--mark', 'reviewed', '--file', h.findings([])))
  assert.ok(done.endsWith(`\nNext: /spec:run @${OTHER}\n`) || done.includes(`Next: /spec:run @${OTHER}`), done)
  assert.ok(!done.includes('all done'), done)
  // A top pick that quotes a real error is printed as it is: the merge ends DONE, never crashes after it landed.
  const q = fixture(); build(q)
  Q.add(q.dir, { type: 'fix', payload: 'status prints null for a spec-less fix' })
  const landed = ok(q.run('--mark', 'reviewed', '--file', q.findings([])))
  assert.match(landed, /\nNext: \/spec:fix status prints null for a spec-less fix\n$/, landed)
})

test('AC-20261105-14-10 AC-20261105-07-13 the whole loop lands through one path: no port for a spec without prototype:, the worktree gate passes the tree trunk gets, the report lists the notice', () => {
  const h = fixture(); const out = ok(h.run())
  assert.match(out, /^▶ BUILD\n/)
  assert.ok(out.includes('- You asked: make a thing') && out.includes('## Decisions\n- D1: plain text, no JSON | no YAML — ADR-0001'), out)
  assert.ok(out.includes(`The brief is saved at ${path.join(h.dir, 'specs/20261104/01-thing.run/brief-build-1.md')}`))
  assert.ok(out.includes('01-thing.run/evidence.md; the driver appends it to the build commit') && out.includes('01-thing.run/as-built.md'), out)
  assert.strictEqual(h.status(), 'hardened', "the main checkout's copy is never touched")
  assert.strictEqual(h.status(h.wt), 'done', 'the worktree copy says done from the start')
  put(h.wt, 'feature.txt', 'thing\n')
  assert.match(ok(h.run('--mark', 'built')), /BUILD → REVIEW;.*\ngate: green/)
  assert.strictEqual(h.state().appPort, undefined, 'a spec without prototype: allocates no port')
  const done = ok(h.run('--mark', 'reviewed', '--file', h.findings([])))
  assert.match(done, /REVIEW → DONE[\s\S]*✅ 20261104\/01 built, reviewed and merged/)
  assert.ok(done.includes('📌 Users will notice: a thing appears'), done)
  assert.strictEqual(h.g('show', 'main:feature.txt'), 'thing\n')
  assert.strictEqual(h.g('log', '-1', '--format=%B', 'main~1^2').trim(), 'build(20261104/01): Thing\n\nReviews:\n- opus/high: 0 findings, 0 blocking', 'no evidence.md: the subject and the review record alone')
  assert.strictEqual(h.status(), 'done')
  assert.strictEqual(h.g('status', '--porcelain'), '')
  assert.ok(!fs.existsSync(h.wt) && h.state() === null && h.g('branch', '--list', 'spec/01-thing') === '')
  assert.deepStrictEqual(h.gates(), [h.wt], 'one gate run, in the worktree; the landing gate is a cache hit')
  assert.strictEqual(h.run().status, 2, 'a done spec is refused')
})

for (const mergeStrategy of ['ff-only', 'merge-commit', 'squash']) {
  test(`AC-20261107-02-2 AC-20261107-01-6 under ${mergeStrategy} trunk moved: the worktree is rebased and gated, trunk gets exactly that tree, no gate on main, then one stub commit`, () => {
    const h = fixture({ cfg: { mergeStrategy } }); build(h)
    put(h.dir, 'other.txt', 'trunk moved\n'); h.g('add', '-A'); h.g('commit', '-qm', 'trunk moves')
    ok(h.run('--mark', 'reviewed', '--file', h.findings([])))
    assert.strictEqual(h.g('show', 'main:other.txt'), 'trunk moved\n')
    assert.strictEqual(h.g('show', 'main:feature.txt'), 'thing\n')
    const landed = h.g('rev-parse', 'main~1').trim()
    assert.strictEqual(h.g('rev-parse', `${landed}^{tree}`).trim(), newestGateTree(h), 'the landed tree is the tree the last gate passed')
    assert.ok(!h.gates().includes(fs.realpathSync(h.dir)), 'no gate ran on the main checkout: ' + h.gates().join(', '))
    assert.strictEqual(h.gates().length, 2, 'the build gate, then the rebased tree in the worktree')
    assert.strictEqual(h.g('log', '-1', '--format=%s %P', 'main').trim(), `chore(spec): stub 20261104/01 ${landed}`, 'one stub commit on the landed sha')
    assert.deepStrictEqual(h.g('show', '--name-only', '--format=', 'main').trim().split('\n'), [REL], 'it touches only the finished spec')
    assert.strictEqual(st.readSpec(path.join(h.dir, REL)).frontmatter.text, landed)
    assert.strictEqual(h.g('show', `${landed}:${REL}`), SPEC_DOC.replace('status: hardened', 'status: done'), 'the landed sha holds the full text')
    assert.strictEqual(h.g('status', '--porcelain'), '')
  })
}

test('a trunk that moves during every landing gate is refused after the third round: nothing merges, main is clean', () => {
  const h = fixture(); ok(h.run()); put(h.wt, 'feature.txt', 'thing\n'); put(h.wt, 'MOVER', h.dir); ok(h.run('--mark', 'built'))
  const r = h.run('--mark', 'reviewed', '--file', h.findings([]))
  assert.strictEqual(r.status, 2, r.stdout)
  assert.match(r.stderr, /trunk moved three times while landing — re-run/)
  assert.ok(!h.g('ls-tree', '--name-only', 'main').split('\n').includes('feature.txt') && h.g('status', '--porcelain') === '')
})

test('AC-20261107-02-1 a conflict at MERGE stays in the worktree: the rebase step prints, main is clean, the re-run gates and reviews again', () => {
  const h = fixture(); build(h)
  put(h.dir, 'feature.txt', 'trunk thing\n'); h.g('add', '-A'); h.g('commit', '-qm', 'trunk takes feature.txt')
  assert.strictEqual(h.g('status', '--porcelain'), '')
  const cp = ok(h.run('--mark', 'reviewed', '--file', h.findings([])))
  assert.match(cp, /REVIEW → MERGE;[\s\S]*A rebase onto trunk [0-9a-f]{40} is in progress in .*conflicting in feature\.txt/, cp)
  assert.strictEqual(h.g('status', '--porcelain'), '', 'the main checkout is never left mid-merge')
  assert.ok(!fs.existsSync(path.join(h.dir, '.git/MERGE_HEAD')))
  assert.match(ok(h.run()), /^▶ MERGE[\s\S]*conflicting in feature\.txt/, 'markers left: the step stays')
  put(h.wt, 'feature.txt', 'trunk thing\nthing\n')
  const again = ok(h.run())
  assert.match(again, /^▶ REVIEW/, 'the resolution is gated and reviewed again')
  assert.strictEqual(h.state().review, null)
  ok(h.run('--mark', 'reviewed', '--file', h.findings([])))
  assert.strictEqual(h.g('show', 'main:feature.txt'), 'trunk thing\nthing\n')
  assert.strictEqual(h.g('status', '--porcelain'), '')
})

test('AC-20261107-02-3 AC-20261105-08-4 AC-20261105-06-7 a gate red past the repair cap and a review blocking past the fix cap stop with one fix item and a 📌 line, asking nothing; an unchanged tree is no round', () => {
  const h = fixture(); ok(h.run()); put(h.wt, 'feature.txt', 'thing\n'); put(h.wt, 'RED', '')
  assert.match(ok(h.run('--mark', 'built')), /BUILD → REPAIR;.*\ngate: red — .*FAIL: RED flag present/)
  const same = h.run('--mark', 'repaired')
  assert.ok(same.status === 2 && same.stderr.includes('nothing changed since the last gate — re-run the gate (mark regate) or dispatch a builder') && h.state().attempts.repair === 0, same.stderr)
  bump(h.wt); ok(h.run('--mark', 'repaired'))
  bump(h.wt); const stop = ok(h.run('--mark', 'repaired'))
  assert.match(stop, /REPAIR → STOPPED;[\s\S]*⏸️ 20261104\/01 stopped — still red after 2 repairs/)
  assert.ok(!/AskUserQuestion|escalate/.test(stop), stop)
  assert.match(stop, /📌 stopped: still red after 2 repairs — queued \/spec:fix specs\/20261104\/01-thing\.md — FAIL: RED flag present/)
  assert.deepStrictEqual(open(h).map((i) => [i.type, i.spec]), [['fix', REL]])
  assert.strictEqual(h.state(), null, 'a stopped solo run clears its sidecar')

  const r = fixture(); build(r)
  assert.match(ok(r.run('--mark', 'reviewed', '--file', r.findings([...BLOCKING, { severity: 'needs-decision', summary: 'a new screen' }]))), /REVIEW → FIX;/, 'blocking wins')
  assert.ok(r.state().review.findings.some((f) => f.severity === 'needs-decision'), 'the needs-decision finding rides along')
  const brief = ok(r.run())
  assert.ok(brief.includes('The reviewer found blocking issues. Fix each one:\n- feature.txt:1 wrong thing (evidence: cat)'), brief)
  const fixedSame = r.run('--mark', 'fixed')
  assert.ok(fixedSame.status === 2 && fixedSame.stderr.includes('nothing changed since the last gate — dispatch a builder') && r.state().attempts.fix === 0, fixedSame.stderr)
  bump(r.wt); ok(r.run('--mark', 'fixed'))
  const stop2 = ok(r.run('--mark', 'reviewed', '--file', r.findings(BLOCKING)))
  assert.match(stop2, /REVIEW → STOPPED;[\s\S]*📌 stopped: still blocking after 1 fix round — queued \/spec:fix specs\/20261104\/01-thing\.md — wrong thing/)
  assert.deepStrictEqual(open(r).map((i) => i.payload), ['wrong thing'])
})

test('AC-20261107-02-4 a clean review with advisories queues exactly one fix item bound to the spec listing them', () => {
  const h = fixture(); build(h)
  const adv = [{ severity: 'advisory', file: 'feature.txt', summary: 'name it better' }, { severity: 'advisory', summary: 'add a newline' }]
  const done = ok(h.run('--mark', 'reviewed', '--file', h.findings(adv)))
  assert.match(done, /📌 queued the review's advisories as one fix: \/spec:fix specs\/20261104\/01-thing\.md — advisories of 01-thing: name it better; add a newline/)
  assert.deepStrictEqual(open(h).map((i) => ({ type: i.type, spec: i.spec, payload: i.payload })), [{ type: 'fix', spec: REL, payload: 'advisories of 01-thing: name it better; add a newline' }])
})

test('AC-20261107-02-5 AC-20261105-09-1 AC-20261105-09-8 AC-20261105-09-9 AC-20261105-11-5 AC-20261105-15-8 /spec:fix in place writes no spec file and commits fix(<slug>): <symptom> after a green gate and a review', () => {
  const h = fixture({ status: 'done' })
  const symptom = 'the thing is upside down'
  const fx = (...a) => runNode('scripts/run.js', ['--fix', symptom, '--in-place', '--root', h.dir, ...a])
  const lane = runNode('scripts/run.js', ['--fix', symptom, '--root', h.dir])
  assert.ok(lane.status === 2 && lane.stderr.includes('--in-place') && lane.stderr.includes('fanout lane'), 'a fix runs in place or as a lane: ' + lane.stderr)
  put(h.dir, 'notes.txt', 'mine\n')
  const b = ok(fx())
  assert.match(b, /^▶ BUILD/)
  assert.ok(b.includes('- Fix: the thing is upside down') && b.includes('Reproduce it') && b.includes('- FIX-1: WHEN the symptom is reproduced'), b)
  assert.ok(!b.includes('## File Plan') && !b.includes('needsPlan'), b)
  const slug = st.slugOf(symptom)
  assert.ok(fs.existsSync(st.fixRunPath(h.dir, slug)), 'the state lives in the checkout\'s specs/fix/')
  put(h.dir, 'a.txt', 'fixed\n')
  put(path.dirname(st.fixRunPath(h.dir, slug)), 'evidence.md', 'Root cause: it was flipped\nRegression test: check.js :: ok\n')
  assert.match(ok(fx('--mark', 'built')), /BUILD → REVIEW/)
  const rv = ok(fx())
  assert.ok(rv.includes('A fix: check that the test evidence.md names fails for the stated cause') && rv.includes('Evidence the builder recorded (not in the diff): ') && rv.includes('Files changed outside the File Plan: n/a (a fix has no File Plan)'), rv)
  const done = ok(fx('--mark', 'reviewed', '--file', h.findings([])))
  assert.match(done, /✅ fixed — the thing is upside down/)
  assert.match(done, /left uncommitted: notes\.txt/)
  assert.strictEqual(h.g('log', '-1', '--format=%s').trim(), `fix(${slug}): ${symptom}`)
  assert.match(h.g('log', '-1', '--format=%b'), /Root cause: it was flipped/)
  assert.deepStrictEqual(h.g('show', '--name-only', '--format=', 'HEAD').trim().split('\n'), ['a.txt'], 'no spec file, nothing it did not touch')
  assert.strictEqual(h.g('status', '--porcelain').trim(), '?? notes.txt')
  assert.ok(!fs.existsSync(st.fixRunPath(h.dir, slug)))
})

test('AC-20261107-01-5 /spec:fix on a stub in place briefs the Decisions and Assumptions of its text: sha, takes unmet --decision D1, edits no spec and commits fix(<id>): <symptom>; /spec:run refuses it as done', () => {
  const h = fixture({ status: 'done' }); const full = h.g('rev-parse', 'HEAD').trim()
  assert.strictEqual(stub.sweep(h.dir).paths[0], REL)
  assert.ok(!fs.readFileSync(path.join(h.dir, REL), 'utf8').includes('## Decisions'), 'the spec on disk is a stub')
  const symptom = 'the thing is sideways'
  const fx = (...a) => runNode('scripts/run.js', [REL, '--fix', symptom, '--in-place', '--root', h.dir, ...a])
  const contract = (out) => out.includes('## Decisions\n- D1: plain text, no JSON | no YAML — ADR-0001') && out.includes('- A1: the thing is small — if false: ask: shrink it | split it')
  assert.ok(contract(ok(fx())), 'the builder brief carries the text at ' + full)
  assert.match(ok(fx('--mark', 'unmet', '--decision', 'D1', '--why', 'Plain text cannot hold it.')), /BUILD → ESCALATE;/)
  assert.match(ok(fx('--mark', 'escalate', 'retry')), /ESCALATE → BUILD;/)
  put(h.dir, 'a.txt', 'fixed\n')
  assert.match(ok(fx('--mark', 'built')), /BUILD → REVIEW;/)
  assert.ok(contract(ok(fx())), 'the reviewer brief too')
  const done = ok(fx('--mark', 'reviewed', '--file', h.findings([])))
  assert.ok(/✅ fixed — the thing is sideways/.test(done) && !done.includes('reverted spec text'), done)
  assert.strictEqual(h.g('log', '-1', '--format=%s').trim(), `fix(20261104/01): ${symptom}`)
  assert.deepStrictEqual(h.g('show', '--name-only', '--format=', 'HEAD').trim().split('\n'), ['a.txt'], 'no spec file in the fix')
  const r = h.run()
  assert.ok(r.status === 2 && r.stderr.includes('is already done — nothing to run'), r.stderr)
})

test('a fix whose cause needs a plan stops with a plan item; a fix offers no unmet, a spec run no needs-plan', () => {
  const h = fixture({ status: 'done' })
  const fx = (...a) => runNode('scripts/run.js', ['--fix', 'it breaks', '--in-place', '--root', h.dir, ...a])
  ok(fx())
  assert.strictEqual(fx('--mark', 'needs-plan').status, 2, 'needs --why')
  assert.strictEqual(fx('--mark', 'unmet', '--decision', 'D1', '--why', 'x').status, 2)
  const stop = ok(fx('--mark', 'needs-plan', '--why', 'the field reads undefined until the data model changes'))
  assert.match(stop, /BUILD → STOPPED;[\s\S]*📌 stopped: needs a plan — queued \/spec:plan it breaks — the field reads undefined until the data model changes/)
  assert.ok(stop.endsWith('\nNext: /spec:plan it breaks — the field reads undefined until the data model changes\n'), 'Next is this run\'s own queued line, as written, not the queue head: ' + stop)
  assert.deepStrictEqual(open(h).map((i) => i.type), ['plan'])
  const s = fixture(); ok(s.run())
  assert.strictEqual(s.run('--mark', 'needs-plan', '--why', 'x').status, 2)
})

test('AC-20261107-02-7 a dismissed question parks with a decide item whose payload is the question; no option label is recorded', () => {
  const h = fixture(); ok(h.run())
  const q = ok(h.run('--mark', 'unmet', '--decision', 'D1', '--why', 'Plain text cannot carry the nested list the AC needs.'))
  assert.match(q, /BUILD → ESCALATE;/)
  const body = ok(h.run())
  assert.ok(body.includes('recommended option first: Plain text cannot carry the nested list the AC needs.\n- amend'), 'the agent\'s own words, no id prefix: ' + body)
  assert.match(body, /--mark escalate <amend\|retry\|park>/)
  const stop = ok(h.run('--mark', 'dismissed'))
  assert.match(stop, /ESCALATE → STOPPED;[\s\S]*📌 stopped: the question was dismissed — queued 📌 decide: Plain text cannot carry the nested list the AC needs\./)
  assert.deepStrictEqual(open(h).map((i) => ({ type: i.type, payload: i.payload })), [{ type: 'decide', payload: 'Plain text cannot carry the nested list the AC needs.' }])
  assert.strictEqual(h.status(), 'hardened')
})

test('AC-20261105-06-6 the three questions only: a needs-decision finding asks in its own words, fix undoes it uncounted, keep goes to the commit body, never the spec', () => {
  const h = fixture(); build(h)
  const nd = [{ severity: 'needs-decision', file: 'feature.txt', summary: 'The thing is now shown on the home screen.' }]
  assert.match(ok(h.run('--mark', 'reviewed', '--file', h.findings(nd))), /REVIEW → ESCALATE;/)
  assert.ok(ok(h.run()).includes('recommended option first: The thing is now shown on the home screen.\n- keep'))
  assert.match(ok(h.run('--mark', 'escalate', 'fix')), /ESCALATE → FIX;/)
  assert.ok(ok(h.run()).includes('the user said to undo them. For each: undo this choice; follow the spec.\n- feature.txt The thing is now shown on the home screen.'))
  bump(h.wt); ok(h.run('--mark', 'fixed'))
  assert.strictEqual(h.state().attempts.fix, 0, 'undoing a choice is not counted against the cap')
  assert.match(ok(h.run('--mark', 'reviewed', '--file', h.findings(nd))), /REVIEW → ESCALATE;/)
  put(path.join(h.dir, 'specs/20261104/01-thing.run'), 'as-built.md', '- used a flat file\n')
  put(path.join(h.dir, 'specs/20261104/01-thing.run'), 'evidence.md', 'migrations: 18\n')
  const done = ok(h.run('--mark', 'escalate', 'keep'))
  assert.match(done, /ESCALATE → DONE/)
  const body = h.g('log', '-1', '--format=%B', 'main~1^2')
  assert.ok(body.includes('Rulings:\n- kept: The thing is now shown on the home screen.') && body.includes('As built:\n- used a flat file') && body.includes('migrations: 18'), body)
  const spec = h.g('show', 'main:' + REL)
  assert.ok(!spec.includes('## As built') && !spec.includes('kept:'), 'the driver never writes the spec')
})

test('AC-20261105-06-4 an assumption question offers the planner\'s options; unknown ids and written fallbacks are refused; the ruling reaches the next brief', () => {
  const h = fixture(); ok(h.run())
  assert.match(h.run('--mark', 'unmet', '--assumption', 'A9').stderr, /--assumption A9 is not an Assumption of .* — known: A1, A2/)
  assert.match(h.run('--mark', 'unmet', '--assumption', 'A2').stderr, /A2 has a written fallback: split it in two — apply it/)
  ok(h.run('--mark', 'unmet', '--assumption', 'A1', '--why', 'The thing needs three screens.'))
  const q = ok(h.run())
  assert.ok(q.includes('recommended option first: The thing needs three screens.\n- shrink it') && /escalate <shrink it\|split it\|amend>/.test(q), q)
  const next = ok(h.run('--mark', 'escalate', 'split it'))
  assert.match(next, /ESCALATE → BUILD/)
  assert.ok(ok(h.run()).includes('## Rulings (the user\'s answers during this run; they bind like Decisions)\n- A1: split it'))
  assert.strictEqual(h.state().opus, true)
})

test('rules decide instead of asking: spec edits are reverted and gated again, a secret is kept out of the commit', () => {
  const h = fixture({ files: { 'specs/20261104/02-other.md': '---\nstatus: draft\n---\n# Other\n' } })
  ok(h.run())
  put(h.wt, 'feature.txt', 'thing\n'); put(h.wt, '.env', 'KEY=1\n')
  put(h.wt, 'specs/20261104/02-other.md', '---\nstatus: draft\n---\n# Other, edited\n')
  put(h.wt, REL, fs.readFileSync(path.join(h.wt, REL), 'utf8').replace('SHALL have feature.txt.', 'SHALL have any file.').replace('| the thing |', '| a build-picked thing |'))
  assert.match(ok(h.run('--mark', 'built')), /BUILD → REVIEW;/)
  const own = fs.readFileSync(path.join(h.wt, REL), 'utf8')
  assert.ok(!own.includes('any file') && !own.includes('build-picked') && fs.readFileSync(path.join(h.wt, 'specs/20261104/02-other.md'), 'utf8').includes('# Other\n'), own)
  assert.strictEqual(h.status(h.wt), 'done', 'the own spec keeps its status line')
  const done = ok(h.run('--mark', 'reviewed', '--file', h.findings([])))
  assert.ok(done.includes('📌 reverted spec text the build edited (specs/20261104/02-other.md, specs/20261104/01-thing.md) and gated again'), done)
  assert.ok(done.includes('📌 kept out of the commit, it looks like a secret: .env (path:.env)'), done)
  assert.ok(!/AskUserQuestion/.test(done))
  assert.ok(!h.g('ls-tree', '-r', '--name-only', 'main').split('\n').includes('.env'))
})

test('D9 AC-20261107-01-6 off trunk only --in-place builds, there, and lands nothing on trunk; it stubs nothing', () => {
  const h = fixture(); h.g('checkout', '-qb', 'feature')
  const r = h.run()
  assert.strictEqual(r.status, 2)
  assert.match(r.stderr, /on feature, not trunk main — check out main, or pass --in-place to build on feature/)
  assert.ok(!fs.existsSync(h.wt))
  const b = ok(h.run('--in-place'))
  assert.match(b, /📌 Auto-picked in place — --in-place/)
  assert.strictEqual(h.status(), 'implementing')
  put(h.dir, 'feature.txt', 'thing\n'); put(h.dir, 'stray.js', '//\n')
  ok(h.run('--in-place', '--mark', 'built'))
  const done = ok(h.run('--in-place', '--mark', 'reviewed', '--file', h.findings([])))
  assert.match(done, /✅ 20261104\/01 built and reviewed on feature/)
  assert.match(h.g('log', '-1', '--format=%s', 'feature'), /^build\(20261104\/01\): Thing/)
  assert.strictEqual(h.g('rev-parse', 'main').trim(), h.g('rev-parse', 'feature~1').trim(), 'trunk is untouched')
  assert.strictEqual(h.g('status', '--porcelain').trim(), '?? stray.js', 'in place a spec commits its File Plan and the spec only')
  assert.ok(!h.g('log', '--all', '--format=%s').includes('stub') && !('text' in st.readSpec(path.join(h.dir, REL)).frontmatter), 'no stub commit')
})

test('AC-20261105-08-5 regate re-runs an unchanged tree once at REPAIR, counting no repair; reviewed refuses malformed findings', () => {
  const h = fixture(); ok(h.run()); put(h.wt, 'feature.txt', 'thing\n'); put(h.wt, 'RED', '')
  assert.strictEqual(h.run('--mark', 'regate').status, 2, 'regate only at REPAIR')
  ok(h.run('--mark', 'built'))
  assert.match(ok(h.run()), /--mark regate \(once per tree\)/)
  assert.match(ok(h.run('--mark', 'regate')), /REPAIR → REPAIR;/)
  assert.strictEqual(h.state().attempts.repair, 0)
  assert.strictEqual(h.run('--mark', 'regate').status, 2, 'once per tree')
  fs.rmSync(path.join(h.wt, 'RED')); ok(h.run('--mark', 'repaired'))
  const bad = path.join(tmpdir('f'), 'f.json')
  for (const doc of [{ x: 1 }, { findings: [{ severity: 'nit' }] }, { findings: [], verdict: 'fix' }]) {
    fs.writeFileSync(bad, JSON.stringify(doc))
    assert.strictEqual(h.run('--mark', 'reviewed', '--file', bad).status, 2, JSON.stringify(doc))
  }
})

test('AC-20261105-02-14 AC-20261105-06-11 a lane ends DONE in its worktree, committed; a lane question is a pending file of one of three kinds, and its answer resumes', () => {
  const h = fixture()
  const lane = path.join(h.dir, '.claude/worktrees/lane')
  h.g('worktree', 'add', '-q', '-b', 'spec/01-thing', lane)
  pending.markLane(lane, 'fanout')
  ok(h.runIn(lane))
  assert.match(h.runIn(lane, '--mark', 'unmet', '--decision', 'D9', '--why', 'x').stderr, /--decision D9 is not a row of .*Decisions table — known: D1/)
  const q = ok(h.runIn(lane, '--mark', 'unmet', '--decision', 'D1', '--why', 'Needs JSON.'))
  assert.match(q, /PENDING_QUESTION — /)
  const doc = pending.readPending(lane)
  assert.deepStrictEqual([doc.kind, doc.question, doc.options.map((o) => o.label)], ['unmet', 'Needs JSON.', ['amend', 'retry', 'park']])
  pending.answerPending(lane, 'retry')
  assert.match(ok(h.runIn(lane)), /^▶ BUILD/, 'the answer applies itself')
  assert.deepStrictEqual([pending.readPending(lane), h.state(lane).opus, h.state(lane).attempts], [null, true, { repair: 0, fix: 0 }], 'retry: back on Opus with fresh attempts')
  ok(h.runIn(lane, '--mark', 'unmet', '--assumption', 'A1', '--why', 'Three screens.'))
  assert.deepStrictEqual([pending.readPending(lane).kind, pending.readPending(lane).options.map((o) => o.label)], ['assumption', ['shrink it', 'split it', 'amend']])
  pending.answerPending(lane, 'split it'); assert.match(ok(h.runIn(lane)), /^▶ BUILD/)
  put(lane, 'feature.txt', 'thing\n')
  ok(h.runIn(lane, '--mark', 'built'))
  const done = ok(h.runIn(lane, '--mark', 'reviewed', '--file', h.findings([])))
  assert.match(done, /REVIEW → DONE;[\s\S]*committed on spec\/01-thing; fanout lands it/)
  assert.strictEqual(h.state(lane).step, 'DONE', 'the lane keeps its state for fanout')
  assert.match(h.g('-C', lane, 'log', '-1', '--format=%s'), /^build\(20261104\/01\)/)
  assert.strictEqual(h.g('rev-parse', 'main').trim(), h.g('rev-parse', 'spec/01-thing~1').trim(), 'nothing landed: fanout lands it')
  assert.match(ok(h.runIn(lane)), /^▶ DONE/, 'a re-run is a no-op')
})

test('AC-20261107-02-6 AC-20261105-02-5 a lane that needs another spec stops after it, committed, and goes on by itself once trunk has it done', () => {
  const h = fixture({ files: { 'specs/20261104/02-dep.md': '---\nstatus: hardened\n---\n# Dep\n' } })
  const lane = path.join(h.dir, '.claude/worktrees/lane')
  h.g('worktree', 'add', '-q', '-b', 'spec/01-thing', lane)
  pending.markLane(lane, 'fanout')
  ok(h.runIn(lane)); put(lane, 'half.txt', 'half\n')
  assert.strictEqual(h.runIn(lane, '--mark', 'after', '--on', 'specs/nope.md').status, 2)
  const stop = ok(h.runIn(lane, '--mark', 'after', '--on', 'specs/20261104/02-dep.md'))
  assert.match(stop, /BUILD → STOPPED;[\s\S]*📌 waits for specs\/20261104\/02-dep\.md/)
  assert.deepStrictEqual([h.state(lane).why, h.state(lane).on], ['after', 'specs/20261104/02-dep.md'])
  assert.match(h.g('-C', lane, 'log', '-1', '--format=%s'), /^wip\(spec\): 01-thing waits on/)
  assert.match(ok(h.runIn(lane)), /^▶ STOPPED/, 'not done yet: it keeps waiting')
  st.writeStatus(path.join(h.dir, 'specs/20261104/02-dep.md'), 'done'); h.g('commit', '-qam', 'dep done')
  assert.match(ok(h.runIn(lane)), /^▶ BUILD/, 'rebased onto trunk, back at its step')
  assert.strictEqual(h.state(lane).base, h.g('rev-parse', 'main').trim())
  put(lane, 'feature.txt', 'thing\n'); ok(h.runIn(lane, '--mark', 'built'))
  ok(h.runIn(lane, '--mark', 'reviewed', '--file', h.findings([])))
  assert.match(h.g('log', '--format=%s', 'main..spec/01-thing'), /^build\(20261104\/01\): Thing\n$/, 'the wait commit is folded into the one build commit')
})

test('AC-20261105-15-1 AC-20261105-15-2 OPEN admits only hardened or implementing; a failed setupCommand leaves no worktree or branch and the re-run sets up again', () => {
  for (const [status, files, named] of [['superseded', {}, 'superseded'], ['bogus', {}, 'bogus'], ['hardened', { [REL]: SPEC_DOC.replace('status: hardened\n', '') }, '<missing>']]) {
    const h = fixture({ status, files }); const r = h.run()
    assert.ok(r.status === 2 && r.stderr.includes(named) && r.stderr.includes('hardened or implementing'), r.stderr)
    assert.ok(!fs.existsSync(h.wt) && h.g('branch', '--list', 'spec/01-thing') === '', named)
  }
  assert.match(ok(fixture({ status: 'implementing' }).run()), /^▶ BUILD\n/)
  const flag = path.join(tmpdir('setup'), 'ok')
  const h = fixture({ cfg: { setupCommand: `echo ran >> ${flag}.log; test -f ${flag}` } }); const r = h.run()
  assert.ok(r.status === 1 && /setupCommand failed/.test(r.stderr) && !fs.existsSync(h.wt) && h.g('branch', '--list', 'spec/01-thing') === '', r.stderr)
  fs.writeFileSync(flag, ''); assert.match(ok(h.run()), /^▶ BUILD\n/)
  assert.strictEqual(fs.readFileSync(flag + '.log', 'utf8'), 'ran\nran\n', 'setup ran again on the re-run')
})

test('AC-20261105-15-3 a green gate on a build that changed nothing, a spec-less fix too, or with a File Plan row not true on disk is red', () => {
  const h = fixture(); ok(h.run())
  assert.match(ok(h.run('--mark', 'built')), /BUILD → REPAIR;.*\ngate: red — build: nothing changed since [0-9a-f]{40}\n/)
  const f = fixture({ status: 'done' }); const fx = (...a) => runNode('scripts/run.js', ['--fix', 'it breaks', '--in-place', '--root', f.dir, ...a])
  ok(fx()); assert.match(ok(fx('--mark', 'built')), /BUILD → REPAIR;.*\ngate: red — build: nothing changed/)
  const rows = ['| feature.txt | CREATE | the thing |', '| a.txt | MODIFY | edit |', '| old.txt | DELETE | gone |', '| src/**/*.js | CREATE | sources |', '| tmp/*.log | DELETE | logs |']
  const p = fixture({ files: { [REL]: SPEC_DOC.replace(rows[0], rows.join('\n')), 'a.txt': 'a\n', 'old.txt': 'o\n', 'tmp/x.log': 'l\n' } })
  ok(p.run()); bump(p.wt); ok(p.run('--mark', 'built'))
  assert.deepStrictEqual(p.state().gate.output_tail.split('\n'), ['CREATE feature.txt', 'DELETE old.txt', 'CREATE src/**/*.js', 'DELETE tmp/*.log'].map((r) => `file plan: ${r} is not true on disk`))
  put(p.wt, 'feature.txt', 'thing\n'); put(p.wt, 'src/deep/x.js', 'x\n'); fs.rmSync(path.join(p.wt, 'old.txt')); fs.rmSync(path.join(p.wt, 'tmp/x.log'))
  assert.match(ok(p.run('--mark', 'repaired')), /REPAIR → REVIEW;/, 'every row true: CREATE, MODIFY, DELETE and both globs')
})

test('AC-20261105-15-6 a planned untracked file is intent-to-add while the gate runs and lands; a hidden one warns once; a failed add -N runs no gate; a fix adds no entry', () => {
  const ls = path.join(tmpdir('ls'), 'ls.log')
  const h = fixture({ cfg: { testCommand: `node check.js && git ls-files > ${ls}` } }); ok(h.run())
  put(h.wt, 'feature.txt', 'thing\n'); put(h.wt, 'stray.txt', 'stray\n'); ok(h.run('--mark', 'built'))
  const seen = fs.readFileSync(ls, 'utf8').split('\n')
  assert.ok(seen.includes('feature.txt') && !seen.includes('stray.txt'), seen.join(' '))
  assert.deepStrictEqual(h.g('-C', h.wt, 'status', '--porcelain').split('\n').filter((l) => /feature|stray/.test(l)), [' A feature.txt', '?? stray.txt'])
  ok(h.run('--mark', 'reviewed', '--file', h.findings([])))
  assert.strictEqual(h.g('show', 'main:feature.txt'), 'thing\n', 'no dirty refusal at the merge; the planned file is in the commit')
  const hid = fixture({ files: { '.gitignore': '.claude/worktrees/\nspecs/**/*.run/\nfeature.txt\n' } }); ok(hid.run()); put(hid.wt, 'feature.txt', 'thing\n'); bump(hid.wt)
  const r = hid.run('--mark', 'built')
  assert.ok(r.status === 0 && r.stderr.split('\n').filter((l) => l.startsWith('⚠️') && l.includes('feature.txt')).length === 1 && hid.state().step === 'REVIEW', r.stderr)
  const lk = fixture(); ok(lk.run()); put(lk.wt, 'feature.txt', 'thing\n')
  fs.writeFileSync(path.join(lk.g('-C', lk.wt, 'rev-parse', '--absolute-git-dir').trim(), 'index.lock'), '')
  const f = lk.run('--mark', 'built'); assert.ok(f.status === 2 && /git add -N failed/.test(f.stderr) && !lk.gates().length, f.stderr)
  const x = fixture({ status: 'done' }); const fx = (...a) => runNode('scripts/run.js', ['--fix', 'it breaks', '--in-place', '--root', x.dir, ...a])
  ok(fx()); put(x.dir, 'feature.txt', 'thing\n'); ok(fx('--mark', 'built'))
  assert.deepStrictEqual(x.g('status', '--porcelain').split('\n').filter((l) => l.includes('feature.txt')), ['?? feature.txt'])
})

test('AC-20261105-06-10 with a ## Canonical Delta, docs/canonical files are not outside the File Plan in the reviewer brief; without it they are', () => {
  for (const [files, listed] of [[{ [REL]: SPEC_DOC + '\n## Canonical Delta\n\nThe admin screen gains a Delete button.\n' }, 'none'], [{}, 'docs/canonical/admin.md']]) {
    const h = fixture({ files }); ok(h.run()); put(h.wt, 'feature.txt', 'thing\n'); put(h.wt, 'docs/canonical/admin.md', 'x\n'); ok(h.run('--mark', 'built'))
    assert.ok(ok(h.run()).includes(`Files changed outside the File Plan: ${listed}\n`), listed)
  }
})

// A suite red naming tests/slow.test.js, a file no build touches, for its first `fails` runs; the count lives outside the worktree.
function flaky(fails) {
  const n = JSON.stringify(path.join(tmpdir('flaky'), 'n'))
  const check = `const fs = require('fs'); const n = fs.existsSync(${n}) ? Number(fs.readFileSync(${n}, 'utf8')) : 0; fs.writeFileSync(${n}, String(n + 1))
if (n < ${fails}) { console.error('FAIL tests/slow.test.js > jsdom timeout'); process.exit(1) }\n`
  return Object.assign(fixture({ files: { 'check.js': check, 'tests/slow.test.js': '// slow\n' } }), { suite: () => Number(fs.readFileSync(JSON.parse(n), 'utf8')) })
}

test('AC-20261105-08-1 AC-20261105-08-16 a red gate naming only files outside the diff is re-run once: green goes to REVIEW with no repair, and the gate line and report say so', () => {
  const h = flaky(1); ok(h.run()); put(h.wt, 'feature.txt', 'thing\n')
  assert.match(ok(h.run('--mark', 'built')), /BUILD → REVIEW;.*\ngate: green \(ran \d+ms\) · rerun\n/)
  assert.deepStrictEqual([h.suite(), h.state().attempts.repair, h.state().gate.reruns], [2, 0, 1])
  assert.match(ok(h.run('--mark', 'reviewed', '--file', h.findings([]))), /- load: 1 gate rerun\(s\), 0s waiting for a slot\n/)
})

test('AC-20261105-08-2 AC-20261105-08-6 AC-20261105-08-3 a rerun red again is a REPAIR whose brief carries the flake rule; a tree is re-run once; a red in the diff or naming no file is not re-run', () => {
  const h = flaky(99); ok(h.run()); put(h.wt, 'feature.txt', 'thing\n')
  assert.match(ok(h.run('--mark', 'built')), /BUILD → REPAIR;.*\ngate: red — .* · rerun\n/)
  assert.deepStrictEqual([h.suite(), h.state().attempts.repair, h.state().gate.failing], [2, 0, ['tests/slow.test.js']])
  const brief = ok(h.run()); const at = brief.indexOf('FAIL tests/slow.test.js')
  assert.ok(at >= 0 && at < brief.indexOf('A failing test the diff does not touch, a timeout, or a flake under load is not yours to fix'), brief)
  ok(h.run('--mark', 'regate')); assert.strictEqual(h.suite(), 3, 'the gate step never re-runs a tree twice')
  bump(h.wt); ok(h.run('--mark', 'repaired')); assert.strictEqual(h.suite(), 5, 'a changed tree gets its own rerun')
  const d = flaky(99); ok(d.run()); put(d.wt, 'tests/slow.test.js', '// edited\n'); ok(d.run('--mark', 'built'))
  assert.deepStrictEqual([d.state().step, d.suite(), d.state().gate.reruns], ['REPAIR', 1, 0], 'the failing file is in the diff')
  const b = fixture(); ok(b.run()); put(b.wt, 'RED', '')
  assert.match(ok(b.run('--mark', 'built')), /\ngate: red — FAIL: RED flag present\n$/); assert.strictEqual(b.gates().length, 1)
})

test('AC-20261105-08-16 a gate that waited for a slot says so on the gate line and in the report; a quiet run prints neither', () => {
  const q = fixture(); ok(q.run()); put(q.wt, 'feature.txt', 'thing\n')
  assert.ok(!/rerun|waited/.test(ok(q.run('--mark', 'built'))) && !/load:/.test(ok(q.run('--mark', 'reviewed', '--file', q.findings([])))))
  const h = fixture({ cfg: { gateConcurrency: 1 } }); ok(h.run()); put(h.wt, 'feature.txt', 'thing\n')
  const sleeper = spawn('sleep', ['30']); const holder = path.join(h.dir, '.git/spec-gate.lock', String(sleeper.pid))
  put(path.dirname(holder), String(sleeper.pid), `${sleeper.pid} now ${h.dir}\n`)
  spawn('sh', ['-c', `sleep 1; rm -f ${holder}`], { detached: true, stdio: 'ignore' }).unref()
  try {
    assert.match(ok(h.run('--mark', 'built')), /\ngate: green \(ran \d+ms\) · waited [1-9]\d*s for a gate slot\n/)
    assert.match(ok(h.run('--mark', 'reviewed', '--file', h.findings([]))), /- load: 0 gate rerun\(s\), [1-9]\d*s waiting for a slot\n/)
  } finally { sleeper.kill() }
})

// ---- a prototype spec: GATE runs the pin tests against the app, LOOK stops for the user ------------

const APP = 'require(\'http\').createServer((q, s) => s.end(\'app\')).listen(process.env.PORT, \'127.0.0.1\')\n'
const E2E = `const fs = require('fs')
fetch(process.env.APP_URL).then(() => { console.log('e2e ' + process.argv[2]); if (fs.existsSync('PINRED')) { console.error('FAIL pin p1'); process.exit(1) } },
  (e) => { console.error('no app: ' + e.message); process.exit(1) })
`
const PINS = [{ id: 'p1', kind: 'behaviour', sentence: 'On /x: Delete asks first', status: 'active' }, { id: 'p2', kind: 'look', sentence: 'On /x: Bigger title', status: 'active' }, { id: 'p3', kind: 'behaviour', sentence: 'On /x: Gone', status: 'dropped' }]
const protoFixture = (proto = {}) => fixture({
  cfg: { prototype: { url: 'http://127.0.0.1:{port}', bootCommand: 'node app.js', e2eFile: 'e2e/{stem}.spec.js', e2eCommand: 'node e2e.js {file}', ...proto } },
  files: { [REL]: SPEC_DOC.replace('depends_on: []', 'depends_on: []\nprototype: inv'), 'app.js': APP, 'e2e.js': E2E, 'design/prototypes/inv/contract.json': JSON.stringify({ pins: PINS }) },
})

test('AC-20261105-14-9 a prototype spec: GATE runs the pin tests against the booted app (red is a repair), then REVIEW, LOOK and the user\'s words', () => {
  assert.match(protoFixture({ bootCommand: '' }).run().stderr, /prototype\.bootCommand/)
  const bare = protoFixture({ e2eFile: '' }); const r = bare.run()
  assert.ok(r.status === 2 && r.stderr.includes('prototype.e2eFile') && r.stderr.includes('prototype.e2eCommand') && !fs.existsSync(bare.wt), r.stderr)
  const h = protoFixture()
  const pins = '## Pins\n- p1 (behaviour): On /x: Delete asks first\n- p2 (look): On /x: Bigger title\n\n'
  const b = ok(h.run())
  assert.ok(b.includes(pins) && b.includes('e2e/inv.spec.js') && b.includes('`pin pN: <sentence>`') && b.includes('role and visible text') && b.includes('APP_URL'), b)
  put(h.wt, 'feature.txt', 'thing\n'); put(h.wt, 'PINRED', '')
  assert.match(ok(h.run('--mark', 'built')), /BUILD → REPAIR;.*\ngate: red — FAIL pin p1/)
  assert.ok(ok(h.run()).includes('The pin tests are red'))
  fs.rmSync(path.join(h.wt, 'PINRED')); ok(h.run('--mark', 'repaired'))
  assert.strictEqual(h.state().step, 'REVIEW')
  const rv = ok(h.run())
  assert.ok(rv.includes(pins) && /open its test in e2e\/inv\.spec\.js: .*pin pN:.*is blocking/.test(rv), rv)
  const look = ok(h.run('--mark', 'reviewed', '--file', h.findings([])))
  assert.match(look, /REVIEW → LOOK;/)
  const body = ok(h.run())
  assert.ok(body.includes(`cd ${h.wt} && export PORT=${h.state().appPort} && node app.js`) && body.includes(`👀 look — ${h.state().appUrl}`) && body.includes('- p2: On /x: Bigger title'), body)
  assert.match(ok(h.run('--mark', 'look-failed', '--why', 'the title is small')), /LOOK → FIX;/)
  assert.ok(ok(h.run()).includes('The user looked at the running app and said: the title is small.'))
  bump(h.wt); ok(h.run('--mark', 'fixed')); ok(h.run('--mark', 'reviewed', '--file', h.findings([])))
  assert.match(ok(h.run('--mark', 'looked')), /LOOK → DONE;[\s\S]*look accepted after 2 round\(s\)/)
})

// ---- spec 20261107/03: the start-up refusals, the marker, builder-written files and the commit hook come back -----

test('AC-20261107-03-5 OPEN refuses a detached HEAD, a dirty tracked tree, a fanout lane in flight and a branch with commits not on trunk, writing no state; a merged branch is re-pointed', () => {
  const h = fixture({ files: { 'a.txt': 'a\n' } })
  const refused = (re) => { const r = h.run(); assert.ok(r.status === 2 && re.test(r.stderr) && h.state() === null, r.stderr) }
  h.g('checkout', '-q', '--detach')
  refused(/detached HEAD — check out a branch, then re-run/)
  h.g('checkout', '-q', 'main')
  fs.writeFileSync(path.join(h.dir, 'a.txt'), 'wip\n')
  refused(/uncommitted tracked changes — commit or stash them, then re-run/)
  h.g('checkout', '--', 'a.txt')
  h.g('worktree', 'add', '-q', '-b', 'spec/01-thing', h.wt)
  pending.markLane(h.wt, 'fanout')
  refused(/spec-01-thing is a fanout lane in flight — let \/spec:fanout finish it/)
  pending.unmarkLane(h.wt); h.g('worktree', 'remove', '--force', h.wt)
  h.g('checkout', '-q', 'spec/01-thing'); fs.writeFileSync(path.join(h.dir, 'a.txt'), 'stale\n'); h.g('commit', '-q', '-am', 'abandoned'); h.g('checkout', '-q', 'main')
  refused(/branch spec\/01-thing exists with commits not on main — merge, rename or delete it, then re-run/)
  assert.ok(!fs.existsSync(h.wt), 'no worktree was made')
  h.g('branch', '-f', 'spec/01-thing', 'main') // now trunk holds it: safe to re-point
  assert.match(ok(h.run()), /^▶ BUILD/)
  assert.strictEqual(h.g('rev-parse', 'spec/01-thing').trim(), h.g('rev-parse', 'main').trim())
})

test('AC-20261107-03-5 run sidecars git does not ignore are refused with the ignore line as the remedy and no state', () => {
  const h = fixture({ files: { '.gitignore': '.claude/worktrees/\n' } })
  const r = h.run()
  assert.ok(r.status === 2 && r.stderr.includes('add the lines `specs/**/*.run/` and `.claude/worktrees/` to .gitignore'), r.stderr)
  assert.ok(h.state() === null && !fs.existsSync(h.wt))
  // A spec-less fix's run dir sits in the checkout too: unignored, its sidecars would ride in the reviewed diff and the commit.
  const fx = runNode('scripts/run.js', ['--fix', 'it breaks', '--in-place', '--root', h.dir])
  assert.ok(fx.status === 2 && fx.stderr.includes('add the lines `specs/**/*.run/` and `.claude/worktrees/` to .gitignore'), 'a spec-less fix is refused the same way: ' + fx.status + fx.stderr + fx.stdout)
  assert.ok(!fs.existsSync(st.fixRunDir(h.dir, st.slugOf('it breaks'))), 'and writes no run state')
})

test('AC-20261107-03-6 a lane run started from the main checkout finds its spec under --root, not the shell directory', () => {
  const h = fixture()
  h.g('worktree', 'add', '-q', '-b', 'spec/01-thing', h.wt)
  pending.markLane(h.wt, 'fanout')
  const r = runNode('scripts/run.js', [REL, '--root', h.wt], { cwd: h.dir })
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /^▶ BUILD/)
  assert.ok(h.state(h.wt).lane === true && h.state() === null, 'the state is the lane\'s, none in the main checkout')
})

test('AC-20261107-03-6 the checkout is marked only while a builder or reviewer is out; a stale run marker makes no lane', () => {
  const h = fixture()
  const hook = (command) => runBash('scripts/block-worker-git.sh', [], { input: JSON.stringify({ cwd: h.dir, tool_input: { command } }) }).status
  const run = (...a) => ok(h.run('--in-place', ...a))
  fs.writeFileSync(path.join(h.dir, '.git', 'spec-lane-open'), 'run') // left by a crashed earlier run
  run()
  assert.strictEqual(h.state().lane, false, 'a run marker left behind does not make the checkout a lane')
  assert.ok(pending.isLane(h.dir), 'BUILD: the builder is out, the checkout is marked')
  assert.strictEqual(hook('git commit -m x'), 2, 'agents cannot commit while the builder is out')
  put(h.dir, 'feature.txt', 'thing\n'); put(h.dir, 'RED', '')
  assert.match(run('--mark', 'built'), /BUILD → REPAIR;/)
  assert.ok(pending.isLane(h.dir), 'REPAIR dispatches a builder: marked')
  assert.match(run('--mark', 'unmet', '--decision', 'D1', '--why', 'Plain text cannot hold it.'), /REPAIR → ESCALATE;/)
  assert.ok(!pending.isLane(h.dir), 'no agent is out at ESCALATE: the marker is off')
  assert.strictEqual(hook('git commit -m x'), 0, "the user's own commits are not blocked between dispatches")
  assert.match(run('--mark', 'escalate', 'retry'), /ESCALATE → REPAIR;/)
  assert.ok(pending.isLane(h.dir), 'retry dispatches a builder again: marked')
  fs.rmSync(path.join(h.dir, 'RED'))
  assert.match(run('--mark', 'repaired'), /REPAIR → REVIEW;/)
  assert.ok(pending.isLane(h.dir), 'REVIEW dispatches a reviewer: marked')
  assert.match(run('--mark', 'reviewed', '--file', h.findings(BLOCKING)), /REVIEW → FIX;/)
  assert.ok(pending.isLane(h.dir), 'FIX dispatches a builder: marked')
  assert.strictEqual(hook('git commit -m x'), 2, 'agents cannot commit while the fixer is out')
  bump(h.dir)
  assert.match(run('--mark', 'fixed'), /FIX → REVIEW;/)
  assert.match(run('--mark', 'reviewed', '--file', h.findings([])), /REVIEW → DONE/)
  assert.ok(!pending.isLane(h.dir), 'DONE leaves no marker')
})

test('AC-20261107-03-7 a FIX that changes only evidence.md is a round on a cached gate; evidence written before built makes no round', () => {
  const h = fixture(); build(h)
  ok(h.run('--mark', 'reviewed', '--file', h.findings(BLOCKING)))
  const runDir = path.join(h.dir, 'specs/20261104/01-thing.run')
  put(runDir, 'evidence.md', 'migrations: 18\n')
  const gates = h.gates().length
  const out = ok(h.run('--mark', 'fixed'))
  assert.match(out, /FIX → REVIEW;/)
  assert.ok(out.includes('(cached)'), out)
  assert.strictEqual(h.state().attempts.fix, 1)
  assert.strictEqual(h.gates().length, gates, 'the gate was a cache hit: the suite did not run again')
  assert.ok(ok(h.run()).includes(`Evidence the builder recorded (not in the diff): ${path.join(runDir, 'evidence.md')}`))

  const e = fixture(); ok(e.run())
  put(e.wt, 'feature.txt', 'thing\n'); put(path.join(e.dir, 'specs/20261104/01-thing.run'), 'evidence.md', 'migrations: 18\n')
  ok(e.run('--mark', 'built'))
  ok(e.run('--mark', 'reviewed', '--file', e.findings(BLOCKING)))
  const r = e.run('--mark', 'fixed')
  assert.ok(r.status === 2 && r.stderr.includes('nothing changed since the last gate'), r.stderr)
  assert.strictEqual(e.state().attempts.fix, 0)
})

test('AC-20261107-03-7 a pre-commit hook that rejects the build commit sends the run to REPAIR with its output, and the repaired build lands', () => {
  const h = fixture()
  put(h.dir, '.git/hooks/pre-commit', '#!/bin/sh\ngit diff --cached | grep -q TODO && { echo "[lint] no TODO" >&2; exit 1; }; exit 0\n')
  fs.chmodSync(path.join(h.dir, '.git/hooks/pre-commit'), 0o755)
  ok(h.run()); put(h.wt, 'feature.txt', 'TODO thing\n')
  ok(h.run('--mark', 'built'))
  assert.match(ok(h.run('--mark', 'reviewed', '--file', h.findings([]))), /→ REPAIR;/, 'the hook refusal is a red gate')
  assert.match(ok(h.run()), /The commit hook rejected the build[\s\S]*\[lint\] no TODO/, 'the builder sees the hook output')
  put(h.wt, 'feature.txt', 'thing\n')
  ok(h.run('--mark', 'repaired'))
  assert.match(ok(h.run('--mark', 'reviewed', '--file', h.findings([]))), /REVIEW → DONE/)
  assert.strictEqual(h.g('show', 'main:feature.txt'), 'thing\n')
})

// ---- the criteria check at GATE (ADR-0048) ---------------------------------------------------------------

const OLD_SPEC = '---\nstatus: done\n---\n# Old\n\n## Acceptance Criteria\n\n- **AC-20261101-01-1**: WHEN x THE SYSTEM SHALL y.\n'

test('AC-20261107-04-5 a green build that deleted a criterion\'s last citing test goes to REPAIR naming the ID, restore and unmet, then to REVIEW once a test cites it again', () => {
  const h = fixture({ files: { 'specs/20261101/01-old.md': OLD_SPEC, 'tests/old.test.js': '// AC-20261101-01-1\n', 'tests/thing.test.js': '// AC-20261104-01-1\n' } })
  ok(h.run()); put(h.wt, 'feature.txt', 'thing\n'); fs.rmSync(path.join(h.wt, 'tests/old.test.js'))
  assert.match(ok(h.run('--mark', 'built')), /BUILD → REPAIR;.*\ngate: red — criteria: AC-20261101-01-1 /)
  const tail = h.state().gate.output_tail
  assert.ok(tail.includes('AC-20261101-01-1') && tail.includes('tests/old.test.js') && tail.includes('restore') && tail.includes('unmet'), tail)
  assert.ok(ok(h.run()).includes(tail), 'the repair brief prints the tail')
  put(h.wt, REL, fs.readFileSync(path.join(h.wt, REL), 'utf8').replace('## Assumptions', '## Retired criteria\n\n- AC-20261101-01-1 — retired by D1: x\n\n## Assumptions'))
  assert.match(ok(h.run('--mark', 'repaired')), /REPAIR → REPAIR;/, 'a retirement the build wrote is not the locked one')
  put(h.wt, REL, fs.readFileSync(path.join(h.dir, REL), 'utf8').replace('status: hardened', 'status: done'))
  put(h.wt, 'tests/moved.test.js', '// AC-20261101-01-1, moved\n')
  assert.match(ok(h.run('--mark', 'repaired')), /REPAIR → REVIEW;/)
})

test('AC-20261107-04-5 where no test cites a criterion an uncited criterion of the spec reaches REVIEW and the report carries one 📌 line naming it', () => {
  const h = fixture(); build(h)
  assert.strictEqual(h.state().step, 'REVIEW')
  ok(h.run('--mark', 'reviewed', '--file', h.findings(BLOCKING)))
  bump(h.wt); assert.match(ok(h.run('--mark', 'fixed')), /FIX → REVIEW;/, 'a second gate')
  const done = ok(h.run('--mark', 'reviewed', '--file', h.findings([])))
  const lines = done.split('\n').filter((l) => l.startsWith('📌 criteria:'))
  assert.strictEqual(lines.length, 1, done)
  assert.ok(lines[0].includes('AC-20261104-01-1'), lines[0])
})

test('AC-20261107-04-6 the builder and reviewer briefs carry the spec\'s Retired criteria lines', () => {
  const line = '- AC-20261104-01-1 — checked at review: prose; no test reads prose.'
  const h = fixture({ files: { [REL]: SPEC_DOC.replace('## Assumptions', `## Retired criteria\n\n${line}\n\n## Assumptions`) } })
  assert.ok(build(h) && h.state().step === 'REVIEW')
  const builder = fs.readFileSync(path.join(h.dir, 'specs/20261104/01-thing.run/brief-build-1.md'), 'utf8')
  assert.ok(builder.includes(`## Retired criteria\n${line}\n`), builder)
  assert.ok(ok(h.run()).includes(`## Retired criteria\n${line}\n`), 'the reviewer brief')
  const plain = fixture(); ok(plain.run())
  assert.ok(!ok(plain.run()).includes('## Retired criteria'), 'no section, no heading')
})

test('AC-20261107-04-9 this repo cites every criterion of spec 20261107/04 but the one it retires to review', () => {
  const C = require(path.join(SPEC, 'scripts/lib/criteria.js'))
  const root = path.join(SPEC, '..'); const file = path.join(root, 'specs/20261107/04-the-gate-keeps-every-cited-criterion.md')
  const doc = st.readSpec(file) // once a stub, it lists no criteria and this holds trivially
  const now = C.cited(root, null, st.readConfig(root)); const listed = C.retired(doc)
  assert.deepStrictEqual(doc.acs.map((a) => a.id).filter((id) => !now.has(id) && !listed.has(id)), [])
  if (doc.acs.length) assert.deepStrictEqual([...listed.keys()], ['AC-20261107-04-10'])
})

// ---- spec 20261107/05: a finished brief closes itself --------------------------------------------
const BRIEF03 = 'docs/roadmap/03-rounds.md'
const AUTO03 = '📌 auto-closed brief 03 (rounds) — its last spec merged and docs/roadmap/03-rounds.md lists no open step (veto anytime)'
const WARN03 = '⚠️ brief 03 (rounds) has every spec done; 1 step(s) outside specs still open in docs/roadmap/03-rounds.md — tick them there, then /spec:queue done 03'
function briefFixture({ steps = '', banner = '', stored = true, sibling = false } = {}) {
  const files = { [REL]: SPEC_DOC.replace('brief: n/a', 'brief: 03'), [BRIEF03]: `# 03 — Rounds\n${banner}\nPhase: P1 · Depends on: —\n\n## Result\n\nx\n${steps}` }
  if (sibling) files['specs/20261104/02-later.md'] = SPEC_DOC.replace('brief: n/a', 'brief: 03').replace('# Thing', '# Later')
  const h = fixture({ files })
  if (stored) Q.write(h.dir, { version: 3, seq: 1, items: [{ id: 'q1', kind: 'brief', payload: '03', added: '2026-11-07' }] })
  return h
}
const briefItem = (h) => Q.read(h.dir).items.find((i) => i.kind === 'brief')
const listed = (h) => runNode('scripts/queue.js', ['list', '--root', h.dir]).stdout

test('AC-20261107-05-2 a solo run merging the last spec of a brief with no open step ticks its item and prints the 📌 auto-closed line; unstored or superseded alike', () => {
  const h = briefFixture(); build(h)
  const done = ok(h.run('--mark', 'reviewed', '--file', h.findings([])))
  assert.ok(done.includes(AUTO03 + '\n'), done)
  assert.ok(briefItem(h).done, 'q1 is ticked')
  const u = briefFixture({ stored: false })
  assert.ok(listed(u).includes('brief 03 (rounds)'), 'an in-flight brief is in the fill before the merge')
  build(u)
  assert.ok(ok(u.run('--mark', 'reviewed', '--file', u.findings([]))).includes(AUTO03))
  assert.strictEqual(Q.read(u.dir).items.length, 0, 'nothing is stored or ticked')
  assert.ok(!listed(u).includes('brief 03'), 'the brief leaves the list')
  const s = briefFixture({ banner: '\n> **Superseded by 04**\n' }); build(s)
  assert.ok(ok(s.run('--mark', 'reviewed', '--file', s.findings([]))).includes(AUTO03))
  assert.ok(briefItem(s).done, 'a stored brief left superseded is ticked')
})

test('AC-20261107-05-3 an open step keeps the brief queued and warns how many; a merge leaving a sibling spec open ticks no brief', () => {
  const h = briefFixture({ steps: '\n## Steps outside specs\n\n- [x] buy the domain\n- [ ] cut over DNS\n' }); build(h)
  const done = ok(h.run('--mark', 'reviewed', '--file', h.findings([])))
  assert.ok(!done.includes('auto-closed'), done)
  assert.ok(done.includes(WARN03 + '\n'), done)
  assert.ok(!briefItem(h).done, 'q1 stays open')
  const o = briefFixture({ sibling: true }); build(o)
  const mid = ok(o.run('--mark', 'reviewed', '--file', o.findings([])))
  assert.ok(!mid.includes('auto-closed') && !mid.includes('has every spec done'), mid)
  assert.ok(!briefItem(o).done, 'another spec of brief 03 is open: no brief item ticks')
})

test('AC-20261107-05-4 an in-place run finishing the last spec of a stored brief ticks no brief item and prints no auto-closed line', () => {
  const h = briefFixture()
  ok(h.run('--in-place')); put(h.dir, 'feature.txt', 'thing\n')
  ok(h.run('--in-place', '--mark', 'built'))
  const done = ok(h.run('--in-place', '--mark', 'reviewed', '--file', h.findings([])))
  assert.match(done, /REVIEW → DONE/)
  const work = require(path.join(SPEC, 'scripts/lib/work.js'))
  const b = work.readBriefs(h.dir).find((x) => x.num === '03')
  assert.deepStrictEqual([b.status, b.open], ['done', []], 'the brief is finished with no open step: a worktree land would tick it here')
  assert.ok(!done.includes('auto-closed'), done)
  assert.ok(!briefItem(h).done, 'no brief item is ticked in place')
})

test('the reviewer seat: opus high by default, opus xhigh on an architecture spec, and every round lands in the build commit', () => {
  const B = require(path.join(SPEC, 'scripts/lib/briefs.js'))
  const cfg = st.readConfig(tmpdir())
  assert.deepStrictEqual(B.reviewSeat({ frontmatter: {} }, cfg), { model: 'opus', effort: 'high' })
  assert.deepStrictEqual(B.reviewSeat({ frontmatter: { architecture: true } }, cfg), { model: 'opus', effort: 'xhigh' })
  const h = fixture(); build(h)
  assert.match(ok(h.run()), /reviewer` agent .* model opus, effort high/)
  assert.match(ok(h.run('--mark', 'reviewed', '--file', h.findings(BLOCKING))), /REVIEW → FIX;/)
  bump(h.wt); ok(h.run('--mark', 'fixed'))
  assert.match(ok(h.run('--mark', 'reviewed', '--file', h.findings([]))), /→ DONE/)
  const body = h.g('log', '-1', '--format=%B', 'main~1^2')
  assert.ok(body.includes('Reviews:\n- opus/high: 1 findings, 1 blocking\n- opus/high: 0 findings, 0 blocking'), body)
})

// ---- an unmet Decision routes to amend, and an amended spec resumes its build ----------------------------------

const labelsOf = (body) => (/--mark escalate <([^>]*)>/.exec(body) || [])[1]
const AMENDED = (h) => fs.readFileSync(path.join(h.dir, REL), 'utf8').replace('make a thing', 'make a better thing')
const lockAmended = (h, text = AMENDED(h)) => { put(h.dir, REL, text); h.g('add', REL); h.g('commit', '-qm', 'chore(spec): lock the amended spec') }

test('AC-20261108-03-1 unmet leads with amend, offers retry only while Opus has not run, and an assumption with no options shares the list', () => {
  const noOptions = SPEC_DOC.replace('## Assumptions\n', '## Assumptions\n\n- A3: the shape holds — if false: ask\n')
  const h = fixture({ files: { [REL]: noOptions } }); ok(h.run())
  ok(h.run('--mark', 'unmet', '--decision', 'D1', '--why', 'Plain text cannot hold it.'))
  assert.strictEqual(labelsOf(ok(h.run())), 'amend|retry|park')
  assert.ok(ok(h.run()).includes('- amend — amend D1 with /spec:plan specs/20261104/01-thing.md; the build resumes by itself once the amended spec is locked'))
  assert.match(ok(h.run('--mark', 'escalate', 'retry')), /ESCALATE → BUILD;/)
  assert.strictEqual(h.state().opus, true)
  ok(h.run('--mark', 'unmet', '--decision', 'D1', '--why', 'Still no.'))
  assert.strictEqual(labelsOf(ok(h.run())), 'amend|park', 'a second retry would change nothing but the attempts')
  assert.match(h.run('--mark', 'escalate', 'retry').stderr, /escalate needs one of amend \| park/)
  const a = fixture({ files: { [REL]: noOptions } }); ok(a.run())
  ok(a.run('--mark', 'unmet', '--assumption', 'A3', '--why', 'It does not.'))
  assert.strictEqual(labelsOf(ok(a.run())), 'amend|retry|park', 'the fallback arm shares the list')
  const b = fixture(); ok(b.run())
  ok(b.run('--mark', 'unmet', '--assumption', 'A1', '--why', 'Three screens.'))
  assert.strictEqual(labelsOf(ok(b.run())), 'shrink it|split it|amend', 'an arm with options keeps them, amend last')
})

test('AC-20261108-03-2 an unmet Decision on a fix lane after its Opus round has one answer left: park is applied with a 📌 line and no question', () => {
  const h = fixture({ status: 'done' })
  const lane = path.join(h.dir, '.claude/worktrees/fixlane')
  h.g('worktree', 'add', '-q', '-b', 'fix/thing', lane); pending.markLane(lane, 'fanout')
  const fx = (...a) => runNode('scripts/run.js', [REL, '--fix', 'the thing is sideways', '--root', lane, ...a])
  ok(fx())
  ok(fx('--mark', 'unmet', '--decision', 'D1', '--why', 'Plain text cannot hold it.'))
  assert.deepStrictEqual(pending.readPending(lane).options.map((o) => o.label), ['retry', 'park'], 'before Opus: a real question')
  pending.answerPending(lane, 'retry'); ok(fx())
  assert.strictEqual(fx('--mark', 'unmet', '--decision', 'D1', '--why', 'Still no.').status, 0)
  assert.strictEqual(pending.readPending(lane), null, 'no pending question is written')
  const stop = ok(fx())
  assert.ok(stop.includes('📌 Auto-picked park — the only answer left') && stop.includes('📌 stopped: parked — queued'), stop)
  assert.match(stop, new RegExp(`\\nNext: /spec:fix ${REL.replace(/[./]/g, '\\$&')} — .+\\n$`), 'Next is the fix this run queued')
  assert.strictEqual(fx('--state').stdout.trim(), 'STOPPED')
  assert.deepStrictEqual(open(h).map((i) => i.type), ['fix'])
})

test('AC-20261108-03-3 AC-20261108-03-4 amend commits the worktree as wip, stops the run and writes nothing on trunk; the locked amendment resumes it, rebased, at GATE', () => {
  const h = fixture({ files: { 'tests/thing.test.js': '// AC-20261104-01-1\n' } }); ok(h.run())
  put(h.wt, 'feature.txt', 'thing\n'); put(h.wt, 'half.txt', 'half\n')
  ok(h.run('--mark', 'unmet', '--decision', 'D1', '--why', 'Plain text cannot hold it.'))
  const stop = ok(h.run('--mark', 'escalate', 'amend'))
  assert.ok(stop.includes('⏸️ 20261104/01 stopped — amend') && stop.includes(`/spec:plan ${REL}`), stop)
  assert.strictEqual(h.g('status', '--porcelain'), '', "trunk's checkout is untouched")
  assert.strictEqual(h.status(), 'hardened')
  const s = h.state(); assert.deepStrictEqual([s.step, s.why, s.on, s.ended], ['STOPPED', 'amend', REL, undefined])
  assert.match(h.g('-C', h.wt, 'log', '-1', '--format=%s'), /^wip\(spec\): 01-thing awaits its amended spec/)
  assert.ok(!h.g('-C', h.wt, 'show', '--name-only', '--format=', 'HEAD').split('\n').includes(REL), 'the wip leaves the spec alone')
  const again = ok(h.run()); assert.ok(again.startsWith('▶ STOPPED') && again.includes(`/spec:plan ${REL}`), again)
  assert.deepStrictEqual(h.state(), s, 'a re-run before the lock changes nothing')
  put(h.dir, 'other.txt', 'trunk moved\n'); h.g('add', '-A'); h.g('commit', '-qm', 'unrelated')
  assert.ok(ok(h.run()).startsWith('▶ STOPPED'), 'trunk moved but the spec is hardened with the base\'s own text: still waiting')
  lockAmended(h)
  const next = ok(h.run()); assert.ok(next.startsWith('▶ REVIEW'), next)
  const r = h.state()
  assert.deepStrictEqual([r.base, r.why, r.on, h.status(h.wt)], [h.g('rev-parse', 'main').trim(), undefined, undefined, 'done'])
  assert.ok(r.history.map((x) => x.step).slice(-3).join() === 'STOPPED,GATE,REVIEW' && fs.readFileSync(path.join(h.wt, REL), 'utf8').includes('make a better thing'), JSON.stringify(r.history))
  assert.ok(r.notice === 'a thing appears')
  ok(h.run('--mark', 'reviewed', '--file', h.findings([])))
  const built = h.g('show', `main~1^2:${REL}`)
  assert.ok(built.includes('make a better thing') && built.includes('status: done'), 'the build commit carries the amended text')
  assert.ok(!h.g('log', '--all', '--format=%s').includes('wip(spec)'), 'the wip is folded')
  assert.strictEqual(h.g('show', 'main:half.txt'), 'half\n')
  assert.strictEqual(h.g('status', '--porcelain'), '')
})

test('AC-20261108-03-4 an amended spec that adds a criterion no test cites goes red at GATE naming it', () => {
  const h = fixture({ files: { 'tests/thing.test.js': '// AC-20261104-01-1\n' } }); ok(h.run())
  put(h.wt, 'feature.txt', 'thing\n')
  ok(h.run('--mark', 'unmet', '--decision', 'D1', '--why', 'x')); ok(h.run('--mark', 'escalate', 'amend'))
  lockAmended(h, AMENDED(h).replace('## Assumptions', '- **AC-20261104-01-2**: WHEN it is amended THE SYSTEM SHALL say so.\n\n## Assumptions'))
  const red = ok(h.run())
  assert.ok(red.startsWith('▶ REPAIR') && red.includes('AC-20261104-01-2'), red)
  assert.match(h.state().gate.output_tail, /criteria: AC-20261104-01-2 is a criterion of this spec; no test file cites it/)
})

test('AC-20261108-03-3 a lane that picks amend stops the same way: wip commit, STOPPED amend with no ended, trunk untouched', () => {
  const h = fixture()
  const lane = path.join(h.dir, '.claude/worktrees/lane')
  h.g('worktree', 'add', '-q', '-b', 'spec/01-thing', lane); pending.markLane(lane, 'fanout')
  ok(h.runIn(lane)); put(lane, 'half.txt', 'half\n')
  ok(h.runIn(lane, '--mark', 'unmet', '--decision', 'D1', '--why', 'x'))
  pending.answerPending(lane, 'amend')
  assert.ok(ok(h.runIn(lane)).includes(`/spec:plan ${REL}`))
  const s = h.state(lane); assert.deepStrictEqual([s.step, s.why, s.on, s.ended], ['STOPPED', 'amend', REL, undefined])
  assert.match(h.g('-C', lane, 'log', '-1', '--format=%s'), /^wip\(spec\):/)
  assert.deepStrictEqual([h.g('status', '--porcelain'), h.status()], ['', 'hardened'])
  assert.strictEqual(pending.readPending(lane), null)
})

test('AC-20261108-03-5 an --in-place run that picks amend resumes at GATE on its branch once the branch locks the amended spec', () => {
  const h = fixture(); h.g('checkout', '-qb', 'feature')
  // the branch locked its own text of the spec after the merge-base with trunk: that blob is unlike the base's, yet not an amendment
  lockAmended(h, AMENDED(h).replace('make a better thing', 'make a first thing'))
  const head0 = h.g('rev-parse', 'HEAD').trim()
  ok(h.run('--in-place')); put(h.dir, 'feature.txt', 'thing\n')
  ok(h.run('--in-place', '--mark', 'unmet', '--decision', 'D1', '--why', 'x'))
  ok(h.run('--in-place', '--mark', 'escalate', 'amend'))
  assert.deepStrictEqual([h.status(), h.state().step, h.g('rev-parse', 'HEAD').trim()], ['hardened', 'STOPPED', head0], 'nothing is committed in place; the spec is back to hardened')
  assert.ok(ok(h.run('--in-place')).startsWith('▶ STOPPED'), 'the branch\'s earlier lock is no amendment: the wait compares with HEAD at the stop, not the merge-base')
  lockAmended(h, AMENDED(h).replace('make a first thing', 'make a better thing'))
  assert.ok(ok(h.run('--in-place')).startsWith('▶ REVIEW'))
  const r = h.state()
  assert.deepStrictEqual([r.base, h.status()], [h.g('rev-parse', 'HEAD').trim(), 'implementing'])
  assert.ok(fs.readFileSync(path.join(h.dir, REL), 'utf8').includes('make a better thing') && !(r.decided || []).some((d) => d.includes('reverted spec text')), 'GATE reverts no spec text')
})

test('AC-20261108-03-4 an amend resume whose rebase conflicts takes the amended text into the worktree copy once the conflict is resolved', () => {
  const h = fixture(); ok(h.run())
  put(h.wt, 'feature.txt', 'thing\n')
  ok(h.run('--mark', 'unmet', '--decision', 'D1', '--why', 'x')); ok(h.run('--mark', 'escalate', 'amend'))
  put(h.dir, 'feature.txt', 'trunk thing\n'); h.g('add', '-A'); h.g('commit', '-qm', 'trunk takes feature.txt')
  lockAmended(h)
  const conflict = ok(h.run())
  assert.match(conflict, /A rebase onto trunk [0-9a-f]{40} is in progress in .*conflicting in feature\.txt/, conflict)
  assert.strictEqual(h.g('status', '--porcelain'), '', 'the main checkout is never left mid-merge')
  assert.strictEqual(h.state().step, 'GATE')
  put(h.wt, 'feature.txt', 'trunk thing\nthing\n')
  assert.match(ok(h.run()), /^▶ REVIEW/)
  const r = h.state()
  assert.deepStrictEqual([r.base, r.respec, h.status(h.wt)], [h.g('rev-parse', 'main').trim(), undefined, 'done'])
  assert.ok(fs.readFileSync(path.join(h.wt, REL), 'utf8').includes('make a better thing'), 'the amended text reaches the gated tree')
  ok(h.run('--mark', 'reviewed', '--file', h.findings([])))
  const built = h.g('show', `main~1^2:${REL}`)
  assert.ok(built.includes('make a better thing') && built.includes('status: done'), 'the build commit carries the amended text')
  assert.strictEqual(h.g('status', '--porcelain'), '')
})

test('AC-20261108-03-3 no draft write or "is draft again" line is left anywhere the driver, the commands or the v8 docs say it', () => {
  const r = require('child_process').spawnSync('grep', ['-rn', 'is draft again\\|to draft', 'spec/scripts', 'spec/commands', 'docs/v8'], { cwd: path.join(SPEC, '..'), encoding: 'utf8' })
  assert.strictEqual(r.status, 1, r.stdout)
})
