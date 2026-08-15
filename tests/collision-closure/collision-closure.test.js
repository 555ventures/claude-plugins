'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, tmpdir, runNode, runBash } = require('../helpers')

// specs/20260814/05-collision-closure.md (2026-08-14): the plan-time collateral-damage sweep
// (which tests pin the files a spec is about to change; which doctrine prose quotes wording a
// spec is about to retire) stops being hand-executed prose. This pins
// spec/scripts/collision-closure.js by execution against synthetic hosts in tmpdir() — the
// exec-a-script mode, never the script's internals. Registered as `spec-paths collision-closure`
// (D1). Deliberately advisory (D6): exit 1 lists, never blocks.

function specWithFilePlan(rows) {
  const header = '## File Plan\n\n| Path | Action | Layer | Summary |\n|------|--------|-------|---------|\n'
  const body = rows.map(r => `| ${r.path} | ${r.action} | ${r.layer} | x |`).join('\n')
  return '# a spec fixture\n\n' + header + body + '\n'
}

function nearFile(target) {
  return "'use strict'\n// references " + target + "\nconst assert = require('node:assert')\nassert.deepStrictEqual(1, 1)\n"
}

function farFile(target) {
  const lines = ['// references ' + target]
  for (let i = 0; i < 60; i++) lines.push('// filler')
  lines.push("assert.match('x', /x/)")
  return lines.join('\n') + '\n'
}

test('AC-20260814-05-1: an unplanned test file containing a non-tests File Plan path is a paths-leg hit, exits 1, and counts toward unplanned', () => {
  const dir = tmpdir('cc1')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'spec.md'), specWithFilePlan([
    { path: 'src/a.js', action: 'CREATE', layer: 'scripts' },
  ]))
  fs.writeFileSync(path.join(dir, 'tests', 'pin.test.js'), "require('../src/a.js') // src/a.js\n")
  const r = runNode('scripts/collision-closure.js',
    ['--spec', 'spec.md', '--root', '.', '--tests', 'tests'], { cwd: dir })
  assert.strictEqual(r.status, 1,
    'a paths-leg hit outside the File Plan must exit 1 (advisory listing, D6) — a 0 here would ' +
    'silently hide a collision the planner needs to see: ' + r.stderr)
  assert.match(r.stdout, /src\/a\.js/, 'the hit must be listed under its target path src/a.js: ' + r.stdout)
  assert.match(r.stdout, /tests[\\/]pin\.test\.js/,
    'the hitting file tests/pin.test.js must be named in the listing: ' + r.stdout)
  assert.match(r.stdout, /unplanned=1/, 'unplanned count must be exactly 1 for this single hit: ' + r.stdout)
})

test('AC-20260814-05-2: a hitting file that is itself a File Plan row exits 0 with unplanned=0, still printing the hit under its target', () => {
  const dir = tmpdir('cc2')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'spec.md'), specWithFilePlan([
    { path: 'src/a.js', action: 'CREATE', layer: 'scripts' },
    { path: 'tests/pin.test.js', action: 'CREATE', layer: 'tests' },
  ]))
  fs.writeFileSync(path.join(dir, 'tests', 'pin.test.js'), "require('../src/a.js') // src/a.js\n")
  const r = runNode('scripts/collision-closure.js',
    ['--spec', 'spec.md', '--root', '.', '--tests', 'tests'], { cwd: dir })
  assert.strictEqual(r.status, 0,
    'every hit already being a File Plan row must exit 0 (D6): ' + r.stderr)
  assert.match(r.stdout, /unplanned=0/,
    'unplanned must be 0 once the hitting file is itself planned: ' + r.stdout)
  assert.match(r.stdout, /src\/a\.js/,
    'the hit stays visible under its target even at exit 0 — visibility is never a finding (D6): ' + r.stdout)
})

test('AC-20260814-05-3: --literal matches case-insensitively in both directions and lists the hit under the stem', () => {
  const dir = tmpdir('cc3')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'spec', 'doctrine'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'spec.md'), specWithFilePlan([
    { path: 'src/a.js', action: 'CREATE', layer: 'scripts' },
  ]))
  fs.writeFileSync(path.join(dir, 'spec', 'doctrine', 'x.md'), 'the widget rule\n')
  const r = runNode('scripts/collision-closure.js',
    ['--spec', 'spec.md', '--root', '.', '--tests', 'tests', '--literal', 'Widget'], { cwd: dir })
  assert.strictEqual(r.status, 1, 'an out-of-plan literal hit must exit 1: ' + r.stderr)
  assert.match(r.stdout, /Widget/, 'the stem Widget as passed must head the listing: ' + r.stdout)
  assert.match(r.stdout, /spec[\\/]doctrine[\\/]x\.md/,
    'the lowercase "widget" occurrence must be found despite the case difference from the ' +
    'passed stem "Widget": ' + r.stdout)
})

test('AC-20260814-05-4: literals-leg exclusions drop the spec corpus, the run ledger, and pipelineOwnedPaths hits, and the script imports its glob matcher rather than re-deriving one', () => {
  const dir = tmpdir('cc4')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'specs', '20260814'), { recursive: true })
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'spec', 'workflows'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude', 'spec.config.json'),
    JSON.stringify({ pipelineOwnedPaths: ['spec/workflows/wf-*.js'] }))
  fs.writeFileSync(path.join(dir, 'specs', '20260814', '05-x.md'), 'the ratchet rule\n')
  fs.writeFileSync(path.join(dir, '.claude', 'spec-runs.jsonl'), '{"note":"ratchet"}\n')
  fs.writeFileSync(path.join(dir, 'spec', 'workflows', 'wf-x.js'), '// ratchet\n')
  fs.writeFileSync(path.join(dir, 'spec.md'), specWithFilePlan([
    { path: 'src/a.js', action: 'CREATE', layer: 'scripts' },
  ]))
  const r = runNode('scripts/collision-closure.js',
    ['--spec', 'spec.md', '--root', '.', '--tests', 'tests', '--literal', 'ratchet'], { cwd: dir })
  assert.strictEqual(r.status, 0,
    'every "ratchet" occurrence lives inside an excluded surface (spec corpus, run ledger, a ' +
    'pipelineOwnedPaths glob) — a nonzero exit here means an exclusion was skipped: ' +
    (r.stdout + r.stderr))
  assert.doesNotMatch(r.stdout, /05-x\.md|spec-runs\.jsonl|wf-x\.js/,
    'none of the three excluded files may appear in the listing (D5): ' + r.stdout)

  const scriptPath = path.join(ROOT, 'spec', 'scripts', 'collision-closure.js')
  const exists = fs.existsSync(scriptPath)
  assert.ok(exists,
    'spec/scripts/collision-closure.js must exist to own the paths/literals sweep (D1)')
  const src = exists ? fs.readFileSync(scriptPath, 'utf8') : ''
  assert.match(src, /require\(.*glob-match/,
    'the script must import globMatch/pipelineOwnedGlobs from lib/glob-match.js rather than ' +
    'reimplementing glob-to-regex translation (D5): ' + src)
  assert.doesNotMatch(src, /\[\^\/\]\*/,
    'the script source must contain no hand-rolled glob-to-regex translation of its own ' +
    '(D5, source-shape pin) — this fragment is glob-match.js\'s own translator, and its presence ' +
    'here means it was copied rather than imported: ' + src)
})

test('AC-20260814-05-5: a reference outside the derived test roots is not a paths-leg hit', () => {
  const dir = tmpdir('cc5')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'docs', 'a.md'), 'see src/a.js\n')
  fs.writeFileSync(path.join(dir, 'spec.md'), specWithFilePlan([
    { path: 'src/a.js', action: 'CREATE', layer: 'scripts' },
  ]))
  const r = runNode('scripts/collision-closure.js',
    ['--spec', 'spec.md', '--root', '.', '--tests', 'tests'], { cwd: dir })
  assert.strictEqual(r.status, 0,
    'a doc outside the test roots naming the path is a stale-reference concern owned elsewhere ' +
    '(A2), not a collision — a nonzero exit here means the scope leaked past --tests: ' + r.stderr)
  assert.match(r.stdout, /unplanned=0/,
    'no hits should be counted when the only reference sits outside the derived test roots: ' + r.stdout)
})

test('AC-20260814-05-6: testRoots derive from tests-layer File Plan rows, --tests overrides them entirely, and a missing/absent root exits 2 naming both remedies', () => {
  // (a) derive from deduped first path segments of tests-layer rows
  const dirA = tmpdir('cc6a')
  fs.mkdirSync(path.join(dirA, 'tests', 'ac-matrix'), { recursive: true })
  fs.writeFileSync(path.join(dirA, 'spec.md'), specWithFilePlan([
    { path: 'src/a.js', action: 'CREATE', layer: 'scripts' },
    { path: 'tests/ac-matrix/x.test.js', action: 'CREATE', layer: 'tests' },
    { path: 'tests/foo.test.js', action: 'CREATE', layer: 'tests' },
  ]))
  const ra = runNode('scripts/collision-closure.js', ['--spec', 'spec.md', '--root', '.', '--json'], { cwd: dirA })
  assert.strictEqual(ra.status, 0, ra.stderr + ra.stdout)
  let jsonA
  assert.doesNotThrow(() => { jsonA = JSON.parse(ra.stdout) }, '--json must emit parseable JSON: ' + ra.stdout)
  assert.deepStrictEqual(jsonA.testRoots, ['tests'],
    'testRoots must derive as the deduped first path segment of every tests-layer row (D3) — ' +
    'two rows both under tests/... must collapse to one root, not two: ' +
    JSON.stringify(jsonA && jsonA.testRoots))

  // (b) --tests overrides the derivation entirely
  const dirB = tmpdir('cc6b')
  fs.mkdirSync(path.join(dirB, 'tests'), { recursive: true })
  fs.mkdirSync(path.join(dirB, 'custom'), { recursive: true })
  fs.writeFileSync(path.join(dirB, 'spec.md'), specWithFilePlan([
    { path: 'src/a.js', action: 'CREATE', layer: 'scripts' },
    { path: 'tests/foo.test.js', action: 'CREATE', layer: 'tests' },
  ]))
  const rb = runNode('scripts/collision-closure.js',
    ['--spec', 'spec.md', '--root', '.', '--tests', 'custom', '--json'], { cwd: dirB })
  assert.strictEqual(rb.status, 0, rb.stderr + rb.stdout)
  let jsonB
  assert.doesNotThrow(() => { jsonB = JSON.parse(rb.stdout) }, '--json must emit parseable JSON: ' + rb.stdout)
  assert.deepStrictEqual(jsonB.testRoots, ['custom'],
    '--tests must override the tests-layer derivation entirely, even though the spec also has a ' +
    'tests-layer row: ' + JSON.stringify(jsonB && jsonB.testRoots))

  // (c) no tests-layer rows and no --tests -> exit 2 naming both remedies
  const dirC = tmpdir('cc6c')
  fs.writeFileSync(path.join(dirC, 'spec.md'), specWithFilePlan([
    { path: 'src/a.js', action: 'CREATE', layer: 'scripts' },
  ]))
  const rc = runNode('scripts/collision-closure.js', ['--spec', 'spec.md', '--root', '.'], { cwd: dirC })
  assert.strictEqual(rc.status, 2,
    'with no tests-layer File Plan rows and no --tests, the script cannot derive a test root and ' +
    'must exit 2 rather than silently reporting an empty closure (D3): ' + rc.stdout + rc.stderr)
  assert.match(rc.stderr, /--tests/, 'the exit-2 message must name the --tests remedy: ' + rc.stderr)

  // (d) a resolved test root missing on disk -> exit 2 naming the root and --tests
  const dirD = tmpdir('cc6d')
  fs.writeFileSync(path.join(dirD, 'spec.md'), specWithFilePlan([
    { path: 'src/a.js', action: 'CREATE', layer: 'scripts' },
  ]))
  const rd = runNode('scripts/collision-closure.js',
    ['--spec', 'spec.md', '--root', '.', '--tests', 'nope'], { cwd: dirD })
  assert.strictEqual(rd.status, 2,
    'a --tests root that does not exist on disk must exit 2 — never an uncaught ENOENT and never ' +
    'a silently empty closure (D3): ' + rd.stdout + rd.stderr)
  assert.match(rd.stderr, /nope/, 'the exit-2 message must name the missing root "nope": ' + rd.stderr)
  assert.match(rd.stderr, /--tests/, 'the exit-2 message must also name the --tests remedy: ' + rd.stderr)
})

test('AC-20260814-05-7: a basename-only match is never a paths-leg hit', () => {
  const dir = tmpdir('cc7')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests', 'pin.test.js'), '// only a.js here, not the full path\n')
  fs.writeFileSync(path.join(dir, 'spec.md'), specWithFilePlan([
    { path: 'src/deep/a.js', action: 'CREATE', layer: 'scripts' },
  ]))
  const r = runNode('scripts/collision-closure.js',
    ['--spec', 'spec.md', '--root', '.', '--tests', 'tests'], { cwd: dir })
  assert.strictEqual(r.status, 0,
    'a basename-only mention must not count as a hit (D4, measured) — a nonzero exit means ' +
    'basename matching crept back in: ' + r.stderr)
  assert.match(r.stdout, /unplanned=0/,
    'unplanned must stay 0 when the only file mentions the basename a.js, never the full path: ' + r.stdout)
})

test('AC-20260814-05-8: --json emits exactly the seven-key Contracts shape, malformed input exits 2 with a remedy, and spec-paths collision-closure resolves the script', () => {
  const dir = tmpdir('cc8')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'spec.md'), specWithFilePlan([
    { path: 'src/a.js', action: 'CREATE', layer: 'scripts' },
  ]))
  const r = runNode('scripts/collision-closure.js',
    ['--spec', 'spec.md', '--root', '.', '--tests', 'tests', '--json'], { cwd: dir })
  let json
  assert.doesNotThrow(() => { json = JSON.parse(r.stdout) },
    '--json must emit parseable JSON on the happy path: ' + r.stdout + r.stderr)
  assert.deepStrictEqual(Object.keys(json).sort(),
    ['likely', 'literals', 'paths', 'planned', 'spec', 'testRoots', 'unplanned'],
    'the --json shape must carry exactly these seven top-level keys per Contracts — a missing or ' +
    'extra key breaks every consumer that destructures it: ' + JSON.stringify(json && Object.keys(json)))

  const rUnknown = runNode('scripts/collision-closure.js', ['--spec', 'spec.md', '--bogus-flag'], { cwd: dir })
  assert.strictEqual(rUnknown.status, 2,
    'an unknown flag must exit 2, not be silently ignored: ' + rUnknown.stdout + rUnknown.stderr)
  assert.match(rUnknown.stderr, /--bogus-flag|unknown/i,
    'the exit-2 message must name the offending flag: ' + rUnknown.stderr)

  const rMissing = runNode('scripts/collision-closure.js', ['--spec', 'nope.md', '--root', '.'], { cwd: dir })
  assert.strictEqual(rMissing.status, 2,
    'an unreadable --spec path must exit 2, never crash uninformatively: ' + rMissing.stdout + rMissing.stderr)

  fs.writeFileSync(path.join(dir, 'noplan.md'), '# A spec with no File Plan table at all\n')
  const rNoPlan = runNode('scripts/collision-closure.js', ['--spec', 'noplan.md', '--root', '.'], { cwd: dir })
  assert.strictEqual(rNoPlan.status, 2,
    'a spec with no File Plan table must exit 2, never silently proceed with an empty plan: ' +
    rNoPlan.stdout + rNoPlan.stderr)

  const sp = runBash('bin/spec-paths', ['collision-closure'])
  assert.strictEqual(sp.status, 0,
    'spec-paths collision-closure must resolve — a new script with no key entry breaks every ' +
    'command that expects it silently: ' + sp.stderr)
  assert.match(sp.stdout, /collision-closure\.js\s*$/,
    'spec-paths collision-closure must print the script\'s own path (the key-registration ' +
    'carrier, D1): ' + sp.stdout)
})

test('AC-20260814-05-13: a proximal deepStrictEqual tiers a paths-leg hit as likely, a distant assert.match does not, and the honesty line always prints when a paths-leg hit exists', () => {
  const dir = tmpdir('cc13')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'spec.md'), specWithFilePlan([
    { path: 'src/b.js', action: 'CREATE', layer: 'scripts' },
  ]))
  fs.writeFileSync(path.join(dir, 'tests', 'near.test.js'), nearFile('src/b.js'))
  fs.writeFileSync(path.join(dir, 'tests', 'far.test.js'), farFile('src/b.js'))
  const r = runNode('scripts/collision-closure.js',
    ['--spec', 'spec.md', '--root', '.', '--tests', 'tests', '--json'], { cwd: dir })
  assert.strictEqual(r.status, 1, 'two unplanned paths-leg hits must exit 1: ' + r.stderr)
  let json
  assert.doesNotThrow(() => { json = JSON.parse(r.stdout) }, '--json must parse: ' + r.stdout)
  assert.ok(json.unplanned.includes('tests/near.test.js') && json.unplanned.includes('tests/far.test.js'),
    'both hits must land in unplanned regardless of tier: ' + JSON.stringify(json && json.unplanned))
  assert.ok(json.likely.includes('tests/near.test.js'),
    'a deepStrictEqual within ±25 lines of the path reference must tier the hit as likely (D12): ' +
    JSON.stringify(json && json.likely))
  assert.ok(!json.likely.includes('tests/far.test.js'),
    'an assert.match roughly 60 lines from the path reference must NOT tier the hit as likely — ' +
    'the proximity rule is the whole point of D12\'s measurement: ' + JSON.stringify(json && json.likely))

  const rHuman = runNode('scripts/collision-closure.js',
    ['--spec', 'spec.md', '--root', '.', '--tests', 'tests'], { cwd: dir })
  assert.match(rHuman.stdout, /lexical proxy/,
    'the fixed honesty line naming the tier a lexical proxy and the build-time suite check as ' +
    'adjudicator must print whenever a paths-leg hit exists (D12/D13) — omitting it lets the ' +
    'tier read as authoritative: ' + rHuman.stdout)
})

test('AC-20260814-05-14: a literals-leg hit is included in unplanned but is never tiered into likely, regardless of what it asserts', () => {
  const dir = tmpdir('cc14')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'spec.md'), specWithFilePlan([
    { path: 'src/a.js', action: 'CREATE', layer: 'scripts' },
  ]))
  fs.writeFileSync(path.join(dir, 'tests', 'lit.test.js'),
    "// Frobnicate\nconst assert = require('node:assert')\nassert.deepStrictEqual(1, 1)\n")
  const r = runNode('scripts/collision-closure.js',
    ['--spec', 'spec.md', '--root', '.', '--tests', 'tests', '--literal', 'Frobnicate', '--json'], { cwd: dir })
  assert.strictEqual(r.status, 1, 'an out-of-plan literal hit must exit 1: ' + r.stderr)
  let json
  assert.doesNotThrow(() => { json = JSON.parse(r.stdout) }, '--json must parse: ' + r.stdout)
  assert.ok(json.unplanned.includes('tests/lit.test.js'),
    'the literals hit must be in unplanned: ' + JSON.stringify(json && json.unplanned))
  assert.ok(!json.likely.includes('tests/lit.test.js'),
    'a literals-leg hit must never enter likely even with an adjacent deepStrictEqual — that leg ' +
    'has no execution backstop anywhere in the pipeline, so every hit stays mandatory (D12/D14): ' +
    JSON.stringify(json && json.likely))
})
