'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, SPEC } = require('./helpers')
const { spawnSync } = require('node:child_process')

function gate(prompt, specContent) {
  const dir = tmpdir('gate')
  let promptText = prompt
  if (specContent !== null) {
    const specDir = path.join(dir, 'specs/20260704')
    fs.mkdirSync(specDir, { recursive: true })
    fs.writeFileSync(path.join(specDir, '01-x.md'), specContent)
    promptText = prompt + ' specs/20260704/01-x.md'
  }
  return spawnSync('bash', [path.join(SPEC, 'scripts/spec-state-gate.sh')], {
    encoding: 'utf8',
    input: JSON.stringify({ prompt: promptText }),
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  })
}

const SPEC_MD = (status, body = '') => `---\nstatus: ${status}\n---\n# Spec\n${body}\n`

// AC-20260824-02-5 (specs/20260824/02-design-stage-on-render-gate.md D16, tagged in place):
// the design stage keeps its frozen seat in the state machine (hardened admits, draft blocks)
// while specs/20260824/02 replaces its interior (driver, wf-design, skeletons-check all
// retired) — this pair of assertions is the SHALL-CONTINUE-TO regression pin, green at HEAD by
// design, not a new behavior.
//
// specs/20260901/10-spec-run-command.md D4/AC-20260901-10-2: the loop takes its own name,
// /spec:run, so /spec:build loses the `done` admission it was given for
// brief 18's now-retired post-checkpoint resume (03 D5) — the `done` assertion below is flipped
// in place from AC-20260901-03-1's exit-0 pin back to exit 2, stderr naming /spec:run as the
// resume entry. That flip is this test's reason to be red at build.
//
// AC-20260901-10-3 (D4) carries the admissions this spec does NOT change — /spec:build on
// hardened/implementing, /spec:design on hardened/draft, /spec:review on implementing/draft,
// /spec:plan on draft, and the marker gate — as SHALL CONTINUE TO regression pins, tagged in
// place. The split exists because red-check.js sanctions a file green per AC bullet on a
// literal SHALL CONTINUE TO occurrence, and a single bullet carrying both a new promise and its
// carried clauses would sanction this genuinely-red file green.
test('AC-20260901-10-2 / AC-20260901-10-3 / AC-20260824-02-5 (SHALL CONTINUE TO): state machine: /spec:build admits hardened and implementing but no longer done; /spec:design and /spec:review keep their unchanged admissions; wrong status still blocks', () => {
  assert.strictEqual(gate('/spec:design', SPEC_MD('hardened')).status, 0,
    'AC-20260824-02-5 (SHALL CONTINUE TO)/D16: the design stage keeps its frozen seat in the state machine — a hardened spec must still be admitted to /spec:design even though the stage\'s interior (driver, wf-design, skeletons-check) is being replaced')
  assert.strictEqual(gate('/spec:design', SPEC_MD('draft')).status, 2,
    'AC-20260824-02-5 (SHALL CONTINUE TO)/D16: the design stage keeps its frozen seat in the state machine — a draft spec must still be blocked from /spec:design even though the stage\'s interior (driver, wf-design, skeletons-check) is being replaced')
  assert.strictEqual(gate('/spec:build', SPEC_MD('hardened')).status, 0,
    'AC-20260901-10-3 (SHALL CONTINUE TO)/D4: /spec:build against hardened must continue to be admitted — the build stage direct entry is unchanged by retiring done from its admitted set')
  assert.strictEqual(gate('/spec:build', SPEC_MD('implementing')).status, 0,
    'AC-20260901-10-3 (SHALL CONTINUE TO)/D4: /spec:build against implementing must continue to be admitted — resuming the build stage mid-run is unchanged')
  const doneBuild = gate('/spec:build', SPEC_MD('done'))
  assert.strictEqual(doneBuild.status, 2,
    'AC-20260901-10-2/D4: /spec:build against done must now be refused (exit 2, not brief 18\'s exit 0) — done was only ever admitted as the loop\'s post-checkpoint resume, and the loop now has its own name')
  assert.match(doneBuild.stderr, /\/spec:run/,
    'AC-20260901-10-2/D4: the refusal for /spec:build against done must name /spec:run as the command that resumes a done spec, not leave the user with a dead end')
  assert.strictEqual(gate('/spec:review', SPEC_MD('implementing')).status, 0,
    'AC-20260901-10-3 (SHALL CONTINUE TO)/D4: /spec:review against implementing must continue to be admitted — /spec:review remains a direct entry point to the same review driver')
  assert.strictEqual(gate('/spec:review', SPEC_MD('draft')).status, 2,
    'AC-20260901-10-3 (SHALL CONTINUE TO)/D4: /spec:review against draft must continue to be blocked — the admitted set for /spec:review (implementing|done) is unchanged by this spec')
  assert.strictEqual(gate('/spec:plan', SPEC_MD('draft')).status, 0,
    'AC-20260901-10-3 (SHALL CONTINUE TO)/D4: /spec:plan against draft must continue to be admitted — this spec touches only the /spec:run arm and the /spec:build admitted set')
})

// AC-20260901-10-1 (D4): /spec:run is the loop's own state-gate arm — admitted on hardened,
// implementing, and done (the loop's resume and cold-DONE no-op entries), refused elsewhere with
// a remedy naming /spec:plan, and subject to the same marker gate as the other three commands
// (spec Assumption A1).
test('AC-20260901-10-1: state machine: /spec:run admits hardened, implementing, and done; refuses draft naming /spec:run and /spec:plan; and is subject to the marker gate', () => {
  assert.strictEqual(gate('/spec:run', SPEC_MD('hardened')).status, 0,
    'AC-20260901-10-1/D4: /spec:run against hardened must be admitted — the loop starts (or restarts) the design/build/review sequence from here')
  assert.strictEqual(gate('/spec:run', SPEC_MD('implementing')).status, 0,
    'AC-20260901-10-1/D4: /spec:run against implementing must be admitted — the loop resumes the build/review drivers mid-run')
  assert.strictEqual(gate('/spec:run', SPEC_MD('done')).status, 0,
    'AC-20260901-10-1/D4: /spec:run against done must be admitted — the loop\'s cold-DONE no-op entry (spec-status --next) must not be blocked by the state gate')
  const draftRun = gate('/spec:run', SPEC_MD('draft'))
  assert.strictEqual(draftRun.status, 2,
    'AC-20260901-10-1/D4: /spec:run against draft must be refused — a spec that has not been planned cannot be carried through the loop')
  assert.match(draftRun.stderr, /\/spec:run/,
    'AC-20260901-10-1/D4: the draft refusal must name /spec:run as the command being refused')
  assert.match(draftRun.stderr, /\/spec:plan/,
    'AC-20260901-10-1/D4: the draft refusal must name /spec:plan as the remedy, matching /spec:design\'s and /spec:build\'s existing refusal shape')
  const markerRun = gate('/spec:run', `---\nstatus: hardened\nopen_markers: 2\n---\n# Spec\nclean body\n`)
  assert.strictEqual(markerRun.status, 2,
    'AC-20260901-10-1/D4: /spec:run against a hardened spec with open_markers: 2 must be refused — the marker gate applies to /spec:run exactly as it does to the other three commands')
})

test('unresolved bracketed markers block', () => {
  const res = gate('/spec:build', SPEC_MD('hardened', 'x [NEEDS CLARIFICATION: which tz?] y'))
  assert.strictEqual(res.status, 2)
  assert.match(res.stderr, /NEEDS CLARIFICATION/)
})

test('prose MENTIONING the marker phrase does not block', () => {
  const res = gate('/spec:build', SPEC_MD('hardened', 'All NEEDS CLARIFICATION markers were resolved in planning.'))
  assert.strictEqual(res.status, 0, res.stderr)
})

test('narration quoting the BRACKETED form (no colon) does not block', () => {
  const res = gate('/spec:build', SPEC_MD('hardened',
    'All three original [NEEDS CLARIFICATION] markers are resolved below (D6, D7, D8).'))
  assert.strictEqual(res.status, 0, res.stderr)
})

test('open_markers counter is authoritative: 0 passes even when prose quotes the colon form', () => {
  const spec = `---\nstatus: hardened\nopen_markers: 0\n---\n# Spec\nRationale: we resolved [NEEDS CLARIFICATION: which tz?] by picking UTC (D4).\n`
  const res = gate('/spec:build', spec)
  assert.strictEqual(res.status, 0, res.stderr)
})

test('open_markers > 0 blocks regardless of body content', () => {
  const res = gate('/spec:build', `---\nstatus: hardened\nopen_markers: 2\n---\n# Spec\nclean body\n`)
  assert.strictEqual(res.status, 2)
  assert.match(res.stderr, /open_markers: 2/)
})

test('no counter falls back to the prose grep (legacy specs)', () => {
  const res = gate('/spec:build', SPEC_MD('hardened', 'x [NEEDS CLARIFICATION: which tz?] y'))
  assert.strictEqual(res.status, 2)
})

test('non-spec prompts and missing paths pass through', () => {
  assert.strictEqual(gate('hello world', null).status, 0)
  assert.strictEqual(gate('/spec:build specs/20260101/99-none.md', null).status, 0)
})
