'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, gitRepo } = require('../helpers')

// specs/20260908/03-test-fixture-dedupe.md D1: the shared review-legs host builder, used by
// every review-legs test file via `config`, `extraFiles`, and `testBody` parameters. Callers
// with a genuinely bespoke need (a base-committed file, a non-{dir,base} return) keep a thin
// local wrapper over this builder instead (A1).

function reviewLegsSpecBody({ title = 'Test Spec', acId = 'AC-20260817-99-1', specDate = '20260824', ordinal = '06' } = {}) {
  return `---
status: implementing
tier: standard
---
# ${title}

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | foo() returns 42 (${acId}) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | edit | scripts |
| tests/foo.test.js | create | tests |

## Acceptance Criteria

- **${acId}**: foo() returns 42.
`
}

// `config` is the raw .claude/spec.config.json object the caller supplies verbatim (D1) —
// callers build it themselves so each test's capabilities/runtime shape stays its own literal,
// never collapsed toward one shared config (spec Rationale). `extraFiles` is written alongside
// the implement commit (never the base commit) — a caller needing a file that predates the diff
// keeps its own host builder (A1).
function makeReviewLegsHost(prefix, { specDate = '20260824', ordinal = '06', acId = 'AC-20260817-99-1', config, testBody, extraFiles = {} } = {}) {
  const dir = tmpdir(prefix)
  const g = gitRepo(dir)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify(config))
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(dir, `specs/${specDate}`), { recursive: true })
  fs.writeFileSync(path.join(dir, `specs/${specDate}/${ordinal}-test.md`), reviewLegsSpecBody({ acId, specDate, ordinal }))
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), testBody)
  for (const [rel, content] of Object.entries(extraFiles)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), content)
  }
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { dir, base }
}

module.exports = { reviewLegsSpecBody, makeReviewLegsHost }
