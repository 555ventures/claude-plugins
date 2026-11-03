'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, USERS_BULLET } = require('../helpers')

// specs/20261103/01-the-user-reaches-build.md AC-20261103-01-4, -5: decision-lint refuses a lock
// whose spec carries no job-story `## Users` bullet, from specs/20261103/ on.

function host() {
  const dir = tmpdir('dl-users')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({ pipelineRules: 'rules.md' }))
  fs.writeFileSync(path.join(dir, 'rules.md'), '# Rules\n\n## Risk Tiers\n\nauth and billing are critical.\n')
  return dir
}

// users: the full text of a `## Users` section body, or null for no section at all.
function spec(dir, rel, users) {
  const file = path.join(dir, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, '---\ntier: standard\nbreaking: false\n---\n\n# T\n\n## Goal\n\nx\n\n' +
    (users === null ? '' : '## Users\n\n' + users + '\n\n') +
    '## Decisions\n\n| ID | Decision | Why |\n|----|----------|-----|\n| D1 | Add a column. | because |\n\n' +
    '## File Plan\n\n| Path | Action | Layer | Summary |\n|---|---|---|---|\n| src/app.js | MODIFY | scripts | thing |\n\n' +
    '## Acceptance Criteria\n\n- **AC-1**: x\n')
  return file
}

function lint(dir, file, extra = []) {
  const r = runNode('scripts/decision-lint.js', ['--spec', file, '--root', dir, ...extra])
  let j = null
  try { j = JSON.parse(r.stdout) } catch (e) { /* asserted by caller */ }
  return { r, j }
}

const STORY = USERS_BULLET
const TEMPLATE = '- { who }: When { situation }, I want { motivation }, so I can { outcome }.'

test('AC-20261103-01-4: a spec with no ## Users section, or only the template bullet, exits 1 with exactly one missing-users-section finding on id Users, dated and undated alike', () => {
  const dir = host()
  const cases = [
    ['specs/20261103/09-x.md', null],
    ['undated-spec.md', null],
    ['specs/20261103/08-x.md', TEMPLATE],
  ]
  for (const [rel, users] of cases) {
    const { r, j } = lint(dir, spec(dir, rel, users), ['--json'])
    assert.ok(j, rel + ': --json must print parseable JSON: ' + r.stdout + r.stderr)
    assert.strictEqual(r.status, 1, rel + ': a spec with no job story would lock and the user image never reach build: ' + r.stdout)
    assert.strictEqual(j.findings.length, 1, rel + ': exactly one finding expected, not one per bullet: ' + JSON.stringify(j.findings))
    assert.strictEqual(j.findings[0].class, 'missing-users-section', rel + ': the class is the name plan.md quotes to the author: ' + JSON.stringify(j.findings))
    assert.strictEqual(j.findings[0].id, 'Users', rel + ': the finding id must be Users: ' + JSON.stringify(j.findings))
    assert.strictEqual(j.findings[0].severity, 'hard', rel + ': a soft finding would not stop the lock: ' + JSON.stringify(j.findings))
  }
  const text = lint(dir, spec(dir, 'specs/20261103/07-x.md', null))
  assert.match(text.r.stdout, /^ {2}missing-users-section Users:/m, 'the text-mode line is the contract the planner reads: ' + text.r.stdout)
})

test('AC-20261103-01-5: a job-story bullet in ## Users exits 0 with findings=0, and the arm applies from specs/20261103/ on, not before', () => {
  const dir = host()
  const ok = lint(dir, spec(dir, 'specs/20261103/09-x.md', STORY))
  assert.strictEqual(ok.r.status, 0, 'a real job-story bullet must satisfy the lint: ' + ok.r.stdout + ok.r.stderr)
  assert.match(ok.r.stdout, /findings=0/, 'a satisfied spec must report zero findings: ' + ok.r.stdout)

  const words = STORY.split(' ')
  const third = Math.ceil(words.length / 3)
  for (const parts of [2, 3]) {
    const size = parts === 2 ? Math.ceil(words.length / 2) : third
    const lines = []
    for (let i = 0; i < words.length; i += size) lines.push(words.slice(i, i + size).join(' '))
    const wrapped = lint(dir, spec(dir, 'specs/20261103/0' + parts + '-wrapped.md', lines.join('\n  ')), ['--json'])
    assert.ok(wrapped.j, 'wrapped bullet: --json must print JSON: ' + wrapped.r.stdout + wrapped.r.stderr)
    assert.strictEqual(wrapped.r.status, 0, 'a job-story bullet hard-wrapped over ' + lines.length + ' lines is how specs here are written; refusing it makes the lock unpassable: ' + wrapped.r.stdout)
    assert.ok(!wrapped.j.findings.some((f) => f.class === 'missing-users-section'), 'a wrapped bullet must raise no missing-users-section finding: ' + JSON.stringify(wrapped.j.findings))
  }

  const control = lint(dir, spec(dir, 'specs/20261103/06-x.md', null))
  assert.strictEqual(control.r.status, 1, 'the control (same date, no section) must be refused, else the earlier-date exit 0 below proves nothing: ' + control.r.stdout)

  const old = lint(dir, spec(dir, 'specs/20261102/09-x.md', null))
  assert.strictEqual(old.r.status, 0, 'a spec dated before the arm must still lock, or every hardened spec is stranded: ' + old.r.stdout + old.r.stderr)
  assert.match(old.r.stdout, /findings=0/, 'a pre-arm spec must report zero findings: ' + old.r.stdout)
})
