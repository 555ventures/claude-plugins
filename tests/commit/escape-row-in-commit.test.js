'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, read, tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20261025/01-the-commit-writes-the-escape-row.md: /git:commit step 3 writes the escape
// row itself (D1, D2, D9); the generated Gotchas header names the review close as the only
// writer (D8).

const COMMIT = 'git/commands/commit.md'
const squash = (s) => s.replace(/\s+/g, ' ').trim()

function step3() {
  assert.ok(fs.existsSync(path.join(ROOT, COMMIT)), COMMIT + ' must exist or the commit step cannot write any row')
  const src = read(COMMIT)
  const at = src.indexOf('## Step 3')
  assert.ok(at !== -1, 'commit.md must carry a "## Step 3" section — the escape row has no home without it')
  const next = src.indexOf('\n## ', at + 1)
  return src.slice(at, next === -1 ? undefined : next)
}

test('AC-20261025-01-4: commit.md step 3 appends one escape row through spec-paths escape-row --append, asks only the class question', () => {
  const s3 = step3()
  const flat = squash(s3)
  assert.match(flat, /spec-paths escape-row\)?"?\s+--append/, 'step 3 must call escape-row.js --append through spec-paths, or the commit never writes the row')
  const asks = flat.match(/AskUserQuestion/g) || []
  assert.strictEqual(asks.length, 1, 'step 3 must mention AskUserQuestion exactly once (the class question) — more is the old yes/no offer returning: ' + asks.length)
})

test('AC-20261031-01-6: commit.md step 3 records the stage:"fix" row with the refusal line when escape-row.js exits 3', () => {
  const flat = squash(step3())
  assert.match(flat, /exit 3[^.]*"fix"/i, 'step 3 must say an exit 3 refusal appends the stage:"fix" row, or a refused escape row leaves the commit unrecorded')
  assert.ok(flat.includes('📌 escape row refused — fix row recorded (veto anytime)'), 'step 3 must carry the exact refusal line, or the owner cannot see the fallback happened')
})

test('AC-20261025-01-6: entrypoints lists commit.md as the entry point of escape-row.js', () => {
  const manifest = JSON.parse(read('spec/entrypoints.json'))
  const entry = manifest['spec/scripts/escape-row.js']
  assert.ok(entry && entry.entryPoints.includes('git/commands/commit.md'), 'escape-row.js must list git/commands/commit.md as its entry point or the entrypoints conformance test reports it orphaned: ' + JSON.stringify(entry))
})

test('AC-20261025-01-10: init-gen.js renders a Gotchas header naming the review close as the only writer', () => {
  const dir = tmpdir('escape-row-init-gen')
  gitRepo(dir)
  const profile = {
    config: {
      gateCommand: 'node --test {testDirs}', testCommand: 'node --test', setupCommand: 'npm install',
      patternsScript: 'scripts/spec-patterns.sh', layerGroups: [['doctrine', 'scripts']],
      agentMap: { tests: 'test-owner', scripts: 'data-layer', default: 'data-layer' },
      pipelineRules: '.claude/rules/spec-pipeline.md', runtime: { inert: 'synthetic test host — no bootable process' },
    },
    rules: { paths: ['specs/**', '.claude/**'], sections: {
      'Risk Tiers': 'Risk tiers body.\n', 'Planning': 'Planning body.\n', 'Build': 'Build body.\n',
      'Worker Rules': 'Worker rules body.\n', 'Test Rules': 'Test rules body.\n', 'Review Checks': 'Review checks body.\n',
    } },
    conventionRules: [{ file: 'queries.md', paths: ['src/**/queries.ts'], body: 'Queries convention body.\n' }],
    agents: [
      { name: 'data-layer', kind: 'queries', description: 'Owns the data layer.', model: 'sonnet', persona: 'Persona.\n', expertise: ['src/**/queries.ts'], reference: ['src/schema.sql'], constraints: ['Never raw SQL'] },
      { name: 'test-owner', kind: 'tests', description: 'Owns the test suite.', model: 'sonnet', persona: 'Persona.\n', expertise: ['tests/**'], reference: ['tests/helpers.js'], constraints: ['Never writes implementation code'] },
    ],
    selfVerifyExamples: "`node --test 'tests/x/*.test.js'`",
    skills: {
      specVerify: { description: 'Use to verify.', allowedTools: ['Bash(npm test:*)'], body: 'body.\n' },
      run: { description: 'Use to run.', allowedTools: ['Bash(npm test:*)'], body: 'body.\n' },
    },
    settings: { extraAllow: [], extraDeny: [] },
    patternSweeps: ['sweep "as any" -e \':\\s*any\' -g \'!*.test.ts\''],
    sourceRoot: 'src', manifestExtras: [],
    probeOutcomes: { testCommand: { failsLoud: true }, atRisk: { applicable: true } },
  }
  const profilePath = path.join(dir, 'profile.json')
  fs.writeFileSync(profilePath, JSON.stringify(profile))
  const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', profilePath])
  assert.strictEqual(r.status, 0, 'setup: generate must succeed for the header to be inspected: ' + r.stderr)
  const rules = squash(fs.readFileSync(path.join(dir, '.claude/rules/spec-pipeline.md'), 'utf8'))
  assert.ok(rules.includes("Writers: the review stage's close step only."), 'the Gotchas header must name the review close as the only writer, or hosts keep a writer that no longer exists')
})


// specs/20261101/11-a-direction-flip-leaves-a-row.md D3: Step 3b runs the supersession scan on every commit.
test('AC-20261101-11-11: commit.md carries a Step 3b that runs supersession-rows --commit HEAD when the ledger exists, asks nothing, and never blocks the commit on a non-zero exit', () => {
  const src = read(COMMIT)
  const at = src.indexOf('## Step 3b')
  assert.ok(at !== -1, 'commit.md must carry a "## Step 3b" section — without it no commit records a retired spec')
  const next = src.indexOf('\n## ', at + 1)
  const s3b = src.slice(at, next === -1 ? undefined : next)
  const flat = squash(s3b)
  assert.ok(flat.includes('node "$(spec-paths supersession-rows)" --root . --commit HEAD'),
    'Step 3b must invoke the scan through spec-paths on HEAD, or a flip is never recorded: ' + flat)
  assert.ok(flat.includes('.claude/spec-runs.jsonl'), 'Step 3b must condition on the ledger existing — hosts without one must see nothing')
  assert.ok(!/AskUserQuestion/.test(s3b), 'Step 3b must never ask — a question on every commit blocks the one hook that sees every flip')
  assert.ok(flat.includes('\u26a0\ufe0f'), 'Step 3b must print a warning line on a non-zero exit, or a failed scan is silent')
  assert.ok(src.indexOf('## Step 3\n') < at && at < src.indexOf('## Step 4'), 'Step 3b must sit between Step 3 and Step 4')
})
