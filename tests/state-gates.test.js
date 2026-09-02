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
// specs/20260901/03-unified-build-loop.md D5/AC-20260901-03-1 (2026-09-01, brief 18): the loop
// (D1) resumes a done spec after a checkpoint /clear by re-pasting /spec:build <spec>, so the
// gate must admit /spec:build on status: done — the `done` assertion below is flipped in place
// from its prior exit-2 expectation (A2's pre-D5 pin) to exit 0. That flip is AC-20260901-03-1's
// sole promise, and it is the reason this file is red-expected at build.
//
// AC-20260901-03-10 (D12, split out of AC-20260901-03-1 at build time) carries the admissions
// this spec does NOT change — /spec:build on hardened/implementing, /spec:design on
// hardened/draft, /spec:review on implementing/draft, /spec:plan on draft — as SHALL CONTINUE TO
// regression pins. The split exists because red-check.js sanctions a file green per AC bullet on
// a literal SHALL CONTINUE TO occurrence, and a single bullet carrying both a new promise and its
// carried clauses would sanction this genuinely-red file green.
test('AC-20260901-03-1 / AC-20260901-03-10 / AC-20260824-02-5 (SHALL CONTINUE TO): state machine: /spec:build admits hardened, implementing, and done; /spec:design and /spec:review keep their unchanged admissions; wrong status still blocks', () => {
  assert.strictEqual(gate('/spec:design', SPEC_MD('hardened')).status, 0,
    'AC-20260824-02-5 (SHALL CONTINUE TO)/D16: the design stage keeps its frozen seat in the state machine — a hardened spec must still be admitted to /spec:design even though the stage\'s interior (driver, wf-design, skeletons-check) is being replaced')
  assert.strictEqual(gate('/spec:design', SPEC_MD('draft')).status, 2,
    'AC-20260824-02-5 (SHALL CONTINUE TO)/D16: the design stage keeps its frozen seat in the state machine — a draft spec must still be blocked from /spec:design even though the stage\'s interior (driver, wf-design, skeletons-check) is being replaced')
  assert.strictEqual(gate('/spec:build', SPEC_MD('hardened')).status, 0,
    'AC-20260901-03-10 (SHALL CONTINUE TO)/D5: /spec:build against hardened must continue to be admitted — the loop\'s first stage is unchanged by widening the admitted set to include done')
  assert.strictEqual(gate('/spec:build', SPEC_MD('implementing')).status, 0,
    'AC-20260901-03-10 (SHALL CONTINUE TO)/D5: /spec:build against implementing must continue to be admitted — the loop resumes the build/review drivers mid-run on this status')
  assert.strictEqual(gate('/spec:build', SPEC_MD('done')).status, 0,
    'AC-20260901-03-1/D5: /spec:build against done must now be admitted (exit 0, not the prior exit 2) — this is the loop\'s post-checkpoint resume entry: a /clear followed by re-pasting /spec:build <spec> must not be blocked by the state gate')
  assert.strictEqual(gate('/spec:review', SPEC_MD('implementing')).status, 0,
    'AC-20260901-03-10 (SHALL CONTINUE TO)/D5: /spec:review against implementing must continue to be admitted — /spec:review remains a direct entry point to the same review driver')
  assert.strictEqual(gate('/spec:review', SPEC_MD('draft')).status, 2,
    'AC-20260901-03-10 (SHALL CONTINUE TO)/D5: /spec:review against draft must continue to be blocked — the admitted set for /spec:review (implementing|done) is unchanged by this spec')
  assert.strictEqual(gate('/spec:plan', SPEC_MD('draft')).status, 0,
    'AC-20260901-03-10 (SHALL CONTINUE TO)/D5: /spec:plan against draft must continue to be admitted — this spec touches only the /spec:build and /spec:review admitted sets')
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
