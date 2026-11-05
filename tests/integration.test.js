'use strict'
// End-to-end smoke: the command prose's flow on a fresh host. init → plan new → fill the template
// → lock → queue add → status names it next → run --in-place through DONE on a green testCommand.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { tmpdir, gitRepo, runNode, SPEC } = require('./helpers')
const st = require(path.join(SPEC, 'scripts/lib/state.js'))

const ok = (r) => { assert.strictEqual(r.status, 0, r.stderr + r.stdout); return r.stdout }

test('init → plan → lock → queue → status → run --in-place → DONE', () => {
  const dir = tmpdir('e2e')
  const g = gitRepo(dir)
  const node = (script, ...a) => runNode('scripts/' + script, [...a, '--root', dir])

  // init: nothing to detect, so it asks; the answer comes back through --set.
  assert.match(ok(node('init.js')), /questions: .*testCommand/)
  ok(node('init.js', '--set', 'testCommand=true'))
  assert.strictEqual(st.readConfig(dir).testCommand, 'true')
  g('add', '-A'); g('commit', '-q', '-m', 'chore: spec init') // init's files must be committed before a run

  // plan: new writes the template; the session fills it in.
  const rel = ok(node('plan.js', 'new', 'thing')).trim()
  const file = path.join(dir, rel)
  const fill = [
    ['<Title>', 'Thing'], ["<one sentence in the user's words>", 'make a thing'],
    ['<3–6 bullets>', 'feature.txt holding the thing'], ['<bullets>', 'a.txt'],
    ['no | yes — <what>, needs your yes', 'no'],
    ['| <path> | CREATE \\| MODIFY \\| DELETE | <what changes> |', '| feature.txt | CREATE | the thing |'],
    ['WHEN <situation> THE SYSTEM SHALL <observable result>.', 'WHEN built THE SYSTEM SHALL have feature.txt.'],
  ]
  let text = fs.readFileSync(file, 'utf8')
  for (const [a, b] of fill) { assert.ok(text.includes(a), `template holds ${a}`); text = text.replace(a, b) }
  text = text.replace(/<[^<>\n]+>/g, 'x') // Goal, Decisions and Assumptions: lock refuses leftover placeholders
  fs.writeFileSync(file, text)
  const spec = st.readSpec(file)
  assert.deepStrictEqual(spec.intent, { asked: 'make a thing', build: ['feature.txt holding the thing'], notTouch: ['a.txt'], architecture: false, signoff: null })
  assert.deepStrictEqual(spec.filePlan, [{ path: 'feature.txt', action: 'CREATE', summary: 'the thing' }])
  assert.strictEqual(spec.acs.length, 1)
  assert.match(spec.acs[0].id, /^AC-\d{8}-01-1$/)

  assert.match(ok(node('plan.js', 'lock', rel)), /^✅ spec hardened & locked/)
  assert.match(g('log', '-1', '--format=%s'), /^chore\(spec\): lock \d{8}\/01\n$/, 'lock commits the spec so lanes branch with it')
  ok(node('queue.js', 'add', rel))
  assert.strictEqual(JSON.parse(ok(node('status.js', '--json'))).next, `/spec:run ${rel}`)

  // run in place: BUILD → (GATE) → REVIEW → (COMMIT, MERGE) → DONE.
  const run = (...a) => runNode('scripts/run.js', [rel, '--in-place', '--root', dir, ...a])
  assert.match(ok(run()), /^▶ BUILD\n[\s\S]*📌 Auto-picked in place — --in-place/)
  fs.writeFileSync(path.join(dir, 'feature.txt'), 'thing\n')
  fs.writeFileSync(path.join(dir, 'stray.js'), '// outside the plan\n')
  assert.match(ok(run('--mark', 'built')), /BUILD → REVIEW/)
  const review = JSON.parse(ok(run('--json')))
  const findings = /--file (\S+)/.exec(review.mark)[1]
  assert.ok(review.body.includes(`Write the findings JSON to: ${findings}`), 'the reviewer is told the path the mark reads')
  const outside = /^Files changed outside the File Plan: (.*)$/m.exec(review.body)[1].split(', ')
  assert.ok(outside.includes('stray.js') && !outside.includes('feature.txt') && !outside.includes(rel), 'the reviewer sees unplanned files, not planned ones or the spec')
  fs.writeFileSync(findings, JSON.stringify({ findings: [], verdict: 'clean' }))
  const done = ok(run('--mark', 'reviewed', '--file', findings))
  assert.match(done, /REVIEW → DONE[\s\S]*▶ DONE[\s\S]*✅ \S+ built and reviewed/, 'the final mark prints the report')
  assert.strictEqual(st.readSpec(file).frontmatter.status, 'done')
  assert.strictEqual(st.readRun(file), null, 'the sidecar is cleared')
  assert.ok(!fs.existsSync(path.join(dir, '.claude', 'pending-question.json')))
  assert.strictEqual(g('status', '--porcelain').trim(), '', 'everything landed in the build commit')
  assert.match(g('log', '-1', '--format=%s'), /^build\(\d{8}\/01\): Thing/)
  assert.strictEqual(JSON.parse(ok(node('queue.js', 'list', '--json'))).items.length, 0, 'DONE ticks the queue item')
})
