'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, read, tmpdir, runNode, runBash, gitRepo } = require('../helpers')

// specs/20261025/01-the-commit-writes-the-escape-row.md: /git:commit step 3 writes the escape
// row itself (D1, D2, D9), /spec:escape and its pointers retire (D5), the generated Gotchas
// header names the review close as the only writer (D8). Doctrine prose is pinned by literal.

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

test('AC-20261025-01-4: commit.md step 3 appends one escape row through spec-paths escape-row --append, asks only the class question, and never names the retired command or the six dropped fields', () => {
  const s3 = step3()
  const flat = squash(s3)
  assert.match(flat, /spec-paths escape-row\)?"?\s+--append/, 'step 3 must call escape-row.js --append through spec-paths, or the commit never writes the row')
  assert.match(s3, /one escape row/i, 'step 3 must state it writes one escape row per commit, or two rows can double-count a repair')
  const asks = flat.match(/AskUserQuestion/g) || []
  assert.strictEqual(asks.length, 1, 'step 3 must mention AskUserQuestion exactly once (the class question) — more is the old yes/no offer returning: ' + asks.length)
  const sentence = flat.split(/(?<=[.!?])\s+/).find(x => x.includes('AskUserQuestion')) || ''
  assert.match(sentence, /class/, 'the one AskUserQuestion sentence must name the class, since class is the only question: ' + sentence)
  for (const banned of ['Escape of', '/spec:escape', 'foundBy', 'severity', 'killedMatch', 'softMatch', 'preventedBy', 'unclassedReason']) {
    assert.ok(!s3.includes(banned), 'step 3 must not contain "' + banned + '" — a retired offer or field the writer no longer produces')
  }
})

test('AC-20261025-01-5: commit.md step 3 states the latest-reviewTs selection rule, sha as HEAD, and the fix row only when landed is empty', () => {
  const s3 = step3()
  assert.match(s3, /latest/, 'step 3 must state the selection rule with "latest", or spec/reviewRunId pick is undefined across multi-spec fixes')
  assert.match(s3, /reviewTs/, 'step 3 must name reviewTs as the ordering key, or "latest" has no referent')
  assert.match(s3, /sha[^\n]*HEAD/, 'step 3 must state sha is HEAD, or the row cannot link to the fixing commit')
  const lines = s3.split('\n')
  const fixIdx = lines.map((l, i) => (l.includes('"fix"') ? i : -1)).filter(i => i >= 0)
  assert.ok(fixIdx.length > 0, 'step 3 must still describe the stage:"fix" row')
  const near = fixIdx.some(i => lines.slice(Math.max(0, i - 3), i + 4).some(l => l.includes('landed')))
  assert.ok(near, 'the "fix" row rule must sit within three lines of "landed" — otherwise a commit can earn both rows')
})

test('AC-20261025-01-6: the escape command file is gone, entrypoints lists commit.md for escape-row.js and no escape.md, and spec-paths shared-for escape falls open like an unknown command', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'spec/commands/escape.md')), 'spec/commands/escape.md must be deleted or a second entry point to the same row survives')
  const raw = read('spec/entrypoints.json')
  assert.ok(!raw.includes('spec/commands/escape.md'), 'entrypoints.json must hold zero escape.md entries — each is a dangling pointer')
  const manifest = JSON.parse(raw)
  const entry = manifest['spec/scripts/escape-row.js']
  assert.ok(entry && entry.entryPoints.includes('git/commands/commit.md'), 'escape-row.js must list git/commands/commit.md as its entry point or the entrypoints conformance test reports it orphaned: ' + JSON.stringify(entry))
  const r = runBash('bin/spec-paths', ['shared-for', 'escape'])
  const unknown = runBash('bin/spec-paths', ['shared-for', 'never-defined-key'])
  assert.strictEqual(r.status, 0, 'spec-paths shared-for escape must exit 0 like any retired key — a non-zero exit means a bespoke retired arm was added: ' + r.stderr)
  assert.strictEqual(r.stdout, unknown.stdout, 'shared-for escape must print the exact fail-open whole-doctrine output an unknown key gets — a scoped or different output means the deleted command\'s arm survives as dead config')
})

test('AC-20261025-01-7: the spec plugin description and README never name the retired command, and README describes the escape row', () => {
  const desc = JSON.parse(read('spec/.claude-plugin/plugin.json')).description
  assert.ok(!desc.includes('/spec:escape'), 'plugin.json description must name /spec:fix where it named the retired command, or the lifecycle sentence points nowhere')
  const readme = read('README.md')
  assert.ok(!readme.includes('/spec:escape'), 'README must not mention the retired command')
  assert.match(readme, /escape row/, 'README must describe the automatic escape row, or the record-keeping behaviour is undocumented')
})

test('AC-20261025-01-10: init-gen.js renders a Gotchas header naming the review close as the only writer and never the retired command', () => {
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
  assert.ok(!rules.includes('/spec:escape'), 'the generated rules file must not name the retired command')
})

test('AC-20261025-01-12: core.md keeps the ground-truth sentence and names the commit-time escape row, fix.md names the escape row, and none of them name the retired command', () => {
  const core = read('spec/doctrine/core.md')
  assert.ok(core.includes("The **escape ledger** is the pipeline's one ground-truth signal."), 'core.md must keep the ground-truth sentence verbatim — replay-retired pins it')
  assert.match(squash(core), /commit-time escape row still lands/, 'core.md Pipeline Entry must say the commit-time escape row still lands in the Direct lane')
  assert.ok(!core.includes('/spec:escape'), 'core.md must not name the retired command')
  const fix = read('spec/commands/fix.md')
  assert.match(fix, /escape row/, 'fix.md must say a fix commit can record the escape row, or its "one ledger row" sentences lie')
  assert.ok(!fix.includes('/spec:escape'), 'fix.md must not name the retired command')
  const review = read('spec/doctrine/stages/stage-review.md')
  assert.match(review, /\/spec:fix/, 'stage-review.md must name /spec:fix as the remedy for a done spec with no closeRunId')
  assert.ok(!review.includes('/spec:escape'), 'stage-review.md must not name the retired command')
})
