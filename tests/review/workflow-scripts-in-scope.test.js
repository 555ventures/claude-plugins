'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, SPEC, read, tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260825/05-workflow-scripts-in-review-scope.md: this repo's own
// `.claude/spec.config.json` carried a `pipelineOwnedPaths` entry for `spec/workflows/wf-*.js`
// that outlived its generator (`build-workflows.js`, deleted `61e2e5a`) — it hid an
// unplanned edit to a frozen workflow script from `scope-reconcile.js` and pruned the file from
// `collision-closure.js`'s literals leg, all the way through a CLEAN review (the
// enumerated-file test was the only gate that ever saw the stale `wf-panel` mention it left
// behind). D1 deletes the key outright. Per D2, these three tests read the repo's REAL tracked
// config (never a hand-written synthetic one) through the real entrypoints, so a reintroduced
// entry goes red immediately — the exact gap this incident left. RED at authoring time (A4): the key
// is still present on disk.

test('AC-20260825-05-1: pipelineOwnedGlobs(ROOT) against this repo\'s real root returns exactly BASELINE_GLOBS, matching neither wf-research.js nor wf-enforce.js', () => {
  const globMatchPath = path.join(SPEC, 'scripts/lib/glob-match.js')
  const { pipelineOwnedGlobs, globMatch, BASELINE_GLOBS } = require(globMatchPath)
  const globs = pipelineOwnedGlobs(ROOT)
  assert.deepStrictEqual(globs, BASELINE_GLOBS,
    'D1 deletes the pipelineOwnedPaths key from .claude/spec.config.json so the resolver falls ' +
    'back to its documented absent-key steady state, BASELINE_GLOBS alone — an extra glob here ' +
    'means the tracked config still carries the retired entry: ' + JSON.stringify(globs))
  for (const wf of ['spec/workflows/wf-research.js', 'spec/workflows/wf-enforce.js']) {
    assert.ok(!globs.some((g) => globMatch(g, wf)),
      'no returned glob may match ' + wf + ' — a match here means a workflow script is still ' +
      'pipeline-owned and therefore invisible to scope-reconcile.js\'s out-of-plan check and ' +
      'collision-closure.js\'s literals leg, exactly the blind spot this spec closes: ' +
      JSON.stringify(globs))
  }
})

// Shared fixture (D2 Contracts): the repo's real tracked .claude/spec.config.json copied
// byte-for-byte into a throwaway git repo, plus a probe workflow script edited out-of-plan after
// a base commit whose File Plan names only tests/x.test.js — never spec/workflows/wf-probe.js.
function buildFixture(prefix) {
  const dir = tmpdir(prefix)
  const g = gitRepo(dir)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), read('.claude/spec.config.json'))
  fs.mkdirSync(path.join(dir, 'spec/workflows'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'spec/workflows/wf-probe.js'), "'use strict'\n// WF_PROBE_LITERAL_20260825\n")
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/x.test.js'), '// placeholder — the only tests-layer row, never the wf file\n')
  const specRel = 'spec.md'
  fs.writeFileSync(path.join(dir, specRel),
    '# a spec fixture\n\n## File Plan\n\n| Path | Action | Layer | Summary |\n|------|--------|-------|---------|\n' +
    '| tests/x.test.js | CREATE | tests | placeholder |\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()
  fs.appendFileSync(path.join(dir, 'spec/workflows/wf-probe.js'), '// touched\n')
  g('add', '-A'); g('commit', '-q', '-m', 'touch')
  return { dir, base, specRel }
}

test('AC-20260825-05-2: scope-reconcile.js against this repo\'s real config lists an out-of-plan workflow-script edit in outOfPlan, nowhere in excluded, and exits 3', () => {
  const { dir, base, specRel } = buildFixture('wf-in-scope-sr')
  const r = runNode('scripts/scope-reconcile.js',
    ['--root', dir, '--base', base, '--spec', specRel, '--json'])
  assert.strictEqual(r.status, 3,
    'AC-20260825-05-2 requires exit 3 once the out-of-plan workflow-script edit is found — a 0 ' +
    'here means the retired pipelineOwnedPaths exclusion is still active and nothing was found ' +
    'out-of-plan; a 2 means the fixture or argv is broken, not the invariant under test: ' +
    r.stdout + r.stderr)
  let out
  assert.doesNotThrow(() => { out = JSON.parse(r.stdout) }, '--json must emit parseable JSON: ' + r.stdout)
  assert.deepStrictEqual(out.outOfPlan, ['spec/workflows/wf-probe.js'],
    'once the retired pipelineOwnedPaths entry is gone, an out-of-plan edit to a workflow script ' +
    'must land in outOfPlan like any other unplanned file — an empty or different outOfPlan here ' +
    'means the file is still silently swallowed by a pipeline-owned exclusion: ' + JSON.stringify(out))
  assert.deepStrictEqual(out.excluded, [],
    'the workflow script must not appear in excluded — a hit here means the retired ' +
    'pipelineOwnedPaths glob is still resolving and still hiding the edit from review: ' + JSON.stringify(out))
})

test('AC-20260825-05-3: collision-closure.js against this repo\'s real config reports a literal found only inside a workflow script as an unplanned hit under its stem and exits 1', () => {
  const { dir, specRel } = buildFixture('wf-in-scope-cc')
  const r = runNode('scripts/collision-closure.js',
    ['--spec', specRel, '--root', dir, '--literal', 'WF_PROBE_LITERAL_20260825', '--json'],
    { cwd: dir })
  let out
  assert.doesNotThrow(() => { out = JSON.parse(r.stdout) }, '--json must emit parseable JSON: ' + r.stdout + r.stderr)
  const stemEntry = (out && out.literals || []).find((l) => l.stem === 'WF_PROBE_LITERAL_20260825')
  assert.ok(stemEntry,
    'the literals leg must report an entry for the WF_PROBE_LITERAL_20260825 stem at all: ' + JSON.stringify(out))
  assert.deepStrictEqual(stemEntry.hits, ['spec/workflows/wf-probe.js'],
    'once the retired pipelineOwnedPaths entry is gone, the literals leg walk must be able to ' +
    'see inside spec/workflows/wf-probe.js — an empty hits array here means the workflow script ' +
    'is still pruned from the walk before its content is ever read: ' + JSON.stringify(out))
  assert.ok(out.unplanned.includes('spec/workflows/wf-probe.js'),
    'the workflow script must also surface in unplanned, the same as any other out-of-plan ' +
    'literal hit — its absence would mean the hit is visible in the literals leg but silently ' +
    'excluded from the field every consumer actually gates on: ' + JSON.stringify(out))
  assert.strictEqual(r.status, 1,
    'an unplanned literal hit must exit 1 (advisory listing) — a 0 here means the hit was found ' +
    'but not counted, or the exclusion is still active and no hit was found at all: ' + r.stdout + r.stderr)
})
