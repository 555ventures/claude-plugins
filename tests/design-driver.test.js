'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, SPEC, gitRepo } = require('./helpers')
const { spawnSync } = require('node:child_process')

const DRIVER = path.join(SPEC, 'scripts/spec-design-driver.js')

function fixture({ status = 'hardened', designSource = '', designed = '', screenshot = '' } = {}) {
  const root = fs.realpathSync(tmpdir('drv'))
  gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'true',
    design: { tool: 'storybook', command: 'bun storybook', storyFormat: 'CSF3',
      doctrine: 'docs/design/doctrine.md', ...(screenshot ? { screenshot } : {}) },
  }))
  const specDir = path.join(root, 'specs/20260704')
  fs.mkdirSync(specDir, { recursive: true })
  const spec = path.join(specDir, '01-x.md')
  fs.writeFileSync(spec, `---\nstatus: ${status}\ndesign: true\n` +
    (designSource ? `design_source: ${designSource}\n` : '') +
    (designed ? `designed: ${designed}\n` : '') + `---\n# X\n`)
  return { root, spec, sidecar: spec.replace(/\.md$/, '.design') }
}

function run(root, spec, ...args) {
  return spawnSync(process.execPath, [DRIVER, spec, ...args], { encoding: 'utf8', cwd: root })
}
const stateOf = (root, spec) => run(root, spec, '--state').stdout.trim()

const VALID_SKELETONS = JSON.stringify({
  skeletons: [{ id: 's1', decision: 'author', componentPath: 'src/S1.tsx',
    tree: [{ el: 'div', style: { fill: 'surface-raised' } }], states: ['default'], tokens: ['surface-raised'] }],
})

test('full state walk: no-mockup path', () => {
  const { root, spec, sidecar } = fixture()
  assert.strictEqual(stateOf(root, spec), 'SKELETONS')

  fs.mkdirSync(sidecar, { recursive: true })
  fs.writeFileSync(path.join(sidecar, 'skeletons.json'), '{"skeletons":[{"decision":"maybe"}]}')
  // AC-20260810-01-7: SKELETONS_INVALID derivation is unchanged by this spec
  assert.strictEqual(stateOf(root, spec), 'SKELETONS_INVALID')

  fs.writeFileSync(path.join(sidecar, 'skeletons.json'), VALID_SKELETONS)
  assert.strictEqual(stateOf(root, spec), 'AUTHOR')
  assert.match(run(root, spec).stdout, /wf-design\.js/)

  run(root, spec, '--mark', 'author-green', '--run-id', 'wf_abc123')
  // AC-20260810-01-4: no design_source and no design.screenshot, but the fixture always
  // configures design.command — that alone is a render path, so FIDELITY_REVIEW (which
  // replaces VISUAL) must fire rather than falling straight through to the human loop.
  assert.strictEqual(stateOf(root, spec), 'FIDELITY_REVIEW',
    'a host with design.command configured has a render path — FIDELITY_REVIEW must fire even with no design.screenshot and no design_source')
  run(root, spec, '--mark', 'fidelity-reviewed')
  assert.strictEqual(stateOf(root, spec), 'ITERATE')
  // the handoff block must demand WHERE to look (🔗 navigation per touched story), not just what —
  // a mega-catalog host with six bare component names sends the reviewer hunting
  assert.match(run(root, spec).stdout, /🔗 <one navigation line per story\/entry touched/)

  run(root, spec, '--mark', 'round-green')
  run(root, spec, '--mark', 'round-green')
  assert.match(run(root, spec).stdout, /round 3/)

  run(root, spec, '--mark', 'approved')
  assert.strictEqual(stateOf(root, spec), 'RECONCILE') // AC-20260810-01-7: unchanged by this spec

  // reconcile sets designed: and deletes the sidecar
  fs.writeFileSync(spec, fs.readFileSync(spec, 'utf8').replace('---\n# X', 'designed: 2026-07-04\n---\n# X'))
  fs.rmSync(sidecar, { recursive: true })
  assert.strictEqual(stateOf(root, spec), 'DONE')
})

test('AC-20260810-01-4: mockup path requires extract before skeletons; screenshot config inserts FIDELITY_REVIEW (VISUAL retired)', () => {
  const { root, spec, sidecar } = fixture({
    designSource: 'https://claude.ai/design/p/abc?file=X.dc.html', screenshot: 'bun shots' })
  assert.strictEqual(stateOf(root, spec), 'FETCH_EXTRACT')

  fs.mkdirSync(sidecar, { recursive: true })
  fs.writeFileSync(path.join(sidecar, 'extract.json'), '{"source":{"sha256":"x"}}')
  assert.strictEqual(stateOf(root, spec), 'SKELETONS')

  fs.writeFileSync(path.join(sidecar, 'skeletons.json'), VALID_SKELETONS)
  run(root, spec, '--mark', 'author-green')
  assert.strictEqual(stateOf(root, spec), 'FIDELITY_REVIEW',
    'a mock-bound spec with design.screenshot configured must derive FIDELITY_REVIEW — the retired VISUAL state must never reappear')
  run(root, spec, '--mark', 'fidelity-reviewed')
  assert.strictEqual(stateOf(root, spec), 'ITERATE')
})

test('AC-20260810-01-4: marks alphabet rejects visual-done and vision-reviewed as new marks', () => {
  const { root, spec, sidecar } = fixture()
  fs.mkdirSync(sidecar, { recursive: true })
  fs.writeFileSync(path.join(sidecar, 'skeletons.json'), VALID_SKELETONS)
  run(root, spec, '--mark', 'author-green')
  const r1 = run(root, spec, '--mark', 'visual-done')
  assert.strictEqual(r1.status, 2,
    'visual-done must be retired from the marks alphabet by D6 — accepting it as a new mark silently reintroduces the state FIDELITY_REVIEW replaced')
  const r2 = run(root, spec, '--mark', 'vision-reviewed')
  assert.strictEqual(r2.status, 2,
    'vision-reviewed must be retired along with the advisory vision-review block D6 replaces')
})

test('AC-20260810-01-5: a legacy sidecar with an existing visual-done mark satisfies FIDELITY_REVIEW on resume', () => {
  const { root, spec, sidecar } = fixture({ screenshot: 'bun shots' })
  fs.mkdirSync(sidecar, { recursive: true })
  fs.writeFileSync(path.join(sidecar, 'skeletons.json'), VALID_SKELETONS)
  fs.writeFileSync(path.join(sidecar, 'design-state.json'), JSON.stringify({ 'author-green': true }))
  // sanity leg: with no legacy mark at all, FIDELITY_REVIEW (not the retired VISUAL) must be pending
  assert.strictEqual(stateOf(root, spec), 'FIDELITY_REVIEW')

  fs.writeFileSync(path.join(sidecar, 'design-state.json'),
    JSON.stringify({ 'author-green': true, 'visual-done': true }))
  assert.strictEqual(stateOf(root, spec), 'ITERATE',
    'a pre-existing legacy visual-done mark must satisfy the new FIDELITY_REVIEW state for resume compat — re-deriving FIDELITY_REVIEW here would strand a mid-flight sidecar demanding a mark that no longer exists in the workflow the user was following')
})

test('AC-20260810-01-6: the AUTHOR step\'s printed wf-design invocation includes componentManifestPath in the args template', () => {
  const { root, spec, sidecar } = fixture()
  fs.mkdirSync(sidecar, { recursive: true })
  fs.writeFileSync(path.join(sidecar, 'skeletons.json'), VALID_SKELETONS)
  assert.strictEqual(stateOf(root, spec), 'AUTHOR')
  const out = run(root, spec).stdout
  assert.match(out, /componentManifestPath/,
    'the AUTHOR step\'s printed args template must name componentManifestPath so the session copies it into the Workflow call — omitting it silently drops registry grounding (D5) from every wf-design invocation')
})

test('preconditions: wrong status blocks; missing design block dies; designed is DONE', () => {
  // AC-20260810-01-7: status !== hardened → BLOCKED is unchanged by this spec
  const draft = fixture({ status: 'draft' })
  const res = run(draft.root, draft.spec)
  assert.strictEqual(res.status, 2)
  assert.match(res.stdout + res.stderr, /BLOCKED|hardened/)

  const done = fixture({ designed: '2026-07-01' })
  assert.strictEqual(stateOf(done.root, done.spec), 'DONE')

  const noDesign = fixture()
  fs.writeFileSync(path.join(noDesign.root, '.claude/spec.config.json'), JSON.stringify({ gateCommand: 'true' }))
  const r2 = run(noDesign.root, noDesign.spec)
  assert.strictEqual(r2.status, 2)
  assert.match(r2.stderr, /no design block/)
})

test('marks are recorded in the sidecar state file and bad marks die', () => {
  const { root, spec, sidecar } = fixture()
  fs.mkdirSync(sidecar, { recursive: true })
  fs.writeFileSync(path.join(sidecar, 'skeletons.json'), VALID_SKELETONS)
  run(root, spec, '--mark', 'author-green', '--run-id', 'wf_x1')
  const state = JSON.parse(fs.readFileSync(path.join(sidecar, 'design-state.json'), 'utf8'))
  assert.strictEqual(state['author-green'], true)
  assert.strictEqual(state.runId, 'wf_x1')
  assert.strictEqual(run(root, spec, '--mark', 'nonsense').status, 2)
})

test('comma-list design_source dies with the single-path teaching message', () => {
  const { root, spec } = fixture({ designSource: 'design/mocks/a.html, design/mocks/b.html' })
  const dead = run(root, spec)
  assert.strictEqual(dead.status, 2)
  assert.match(dead.stderr, /SINGLE path/)
  assert.match(dead.stderr, /regionRef/)
})

test('local design_source: bundle extract step, no DesignSync; missing local path dies', () => {
  const { root, spec } = fixture({ designSource: './handoff' })
  // path missing → fail loud before any step
  const dead = run(root, spec)
  assert.strictEqual(dead.status, 2)
  assert.match(dead.stderr, /does not exist/)

  fs.mkdirSync(path.join(root, 'handoff'))
  fs.writeFileSync(path.join(root, 'handoff/screen.html'), '<body><h1>Hi</h1></body>')
  assert.strictEqual(stateOf(root, spec), 'FETCH_EXTRACT')
  const out = run(root, spec).stdout
  assert.match(out, /--bundle/)
  assert.doesNotMatch(out, /DesignSync/)
})

test('fidelity gate: author-green/round-green are refused while the code diverges from the mock', () => {
  const { root, spec, sidecar } = fixture({ designSource: './handoff' })
  fs.mkdirSync(path.join(root, 'handoff'))
  fs.writeFileSync(path.join(root, 'handoff/screen.html'), '<body><button>Send invite</button></body>')
  fs.mkdirSync(sidecar, { recursive: true })
  const { spawnSync } = require('node:child_process')
  const dcx = spawnSync(process.execPath, [path.join(SPEC, 'scripts/dc-extract.js'),
    '--bundle', path.join(root, 'handoff'), sidecar], { encoding: 'utf8' })
  assert.strictEqual(dcx.status, 0, dcx.stderr)

  fs.writeFileSync(path.join(sidecar, 'skeletons.json'), JSON.stringify({
    skeletons: [{ id: 'screen', decision: 'author', componentPath: 'src/Screen.tsx',
      sliceRef: 'slice-screen.html', states: ['default'], tokens: ['surface'] }],
  }))
  assert.strictEqual(stateOf(root, spec), 'AUTHOR')

  // divergent code ("Send" ≠ "Send invite") → the mark is refused and NOT recorded
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'src/Screen.tsx'), '<button>Send</button>')
  const refused = run(root, spec, '--mark', 'author-green')
  assert.strictEqual(refused.status, 2)
  assert.match(refused.stderr, /fidelity gate FAILED/)
  assert.match(refused.stderr, /Send invite/)
  assert.strictEqual(stateOf(root, spec), 'AUTHOR', 'mark must not be recorded on a red gate')

  // faithful code → the mark lands
  fs.writeFileSync(path.join(root, 'src/Screen.tsx'), '<button>Send invite</button>')
  run(root, spec, '--mark', 'author-green')
  // AC-20260810-01-4: design.command is always configured in this fixture, so FIDELITY_REVIEW
  // (not ITERATE) is the state immediately after author-green — must be marked before ITERATE
  assert.strictEqual(stateOf(root, spec), 'FIDELITY_REVIEW')
  run(root, spec, '--mark', 'fidelity-reviewed')
  assert.strictEqual(stateOf(root, spec), 'ITERATE')

  // a round that regresses the copy cannot go round-green
  fs.writeFileSync(path.join(root, 'src/Screen.tsx'), '<button>Send</button>')
  const rr = run(root, spec, '--mark', 'round-green')
  assert.strictEqual(rr.status, 2)
  assert.match(rr.stderr, /fidelity gate FAILED/)
})

// A realistic canvas-export screen: labeled + comment regions, enough shared copy across two
// screens to fire a variant proposal.
function regionHandoff(root) {
  const rows = Array.from({ length: 10 }, (_, i) => '<p>Shared copy row ' + i + '</p>').join('')
  fs.mkdirSync(path.join(root, 'handoff'), { recursive: true })
  fs.writeFileSync(path.join(root, 'handoff/app.dc.html'),
    '<body><x-dc><div>' +
    '<div data-screen-label="Sidebar"><button>New chat</button>' + rows + '</div>' +
    '<!-- main thread --><div><p>Hello there</p></div>' +
    '</div></x-dc></body>')
  fs.writeFileSync(path.join(root, 'handoff/app-dark.dc.html'),
    '<body><x-dc><div data-screen-label="Sidebar Dark"><button>New chat</button>' + rows + '</div></x-dc></body>')
}

test('SKELETONS prints the bind-feasibility report: regions, variant proposals, i18n warning, ledger claims', () => {
  const { root, spec, sidecar } = fixture({ designSource: './handoff' })
  regionHandoff(root)
  // an i18n stack with NO design.copyCatalogs declared → the report must warn before binding
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { '@inlang/paraglide-js': '^2' } }))
  fs.mkdirSync(sidecar, { recursive: true })
  const dcx = spawnSync(process.execPath, [path.join(SPEC, 'scripts/dc-extract.js'),
    '--bundle', path.join(root, 'handoff'), sidecar], { encoding: 'utf8' })
  assert.strictEqual(dcx.status, 0, dcx.stderr)

  const out = run(root, spec).stdout
  assert.match(out, /Bind feasibility/)
  assert.match(out, /app#sidebar \[screen-label\] \d+ copy/)
  assert.match(out, /app#main-thread \[comment\]/)
  assert.match(out, /variant proposal: app-dark ≈ app/)
  assert.match(out, /i18n stack detected .*copyCatalogs is NOT declared/)
  assert.match(out, /regionRef/, 'the skeleton shape must ask for regionRef, not sliceRef')

  // a claimed region from ANOTHER spec shows up as a claim
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/design-coverage.json'), JSON.stringify({
    sources: { './handoff': { regions: { 'app#sidebar': { spec: 'specs/20260701/02-other.md', at: '2026-07-01' } } } },
  }))
  assert.match(run(root, spec).stdout, /app#sidebar.*CLAIMED by specs\/20260701\/02-other\.md/)
})

test('--mark approved records the bound regions in the repo-level coverage ledger', () => { // AC-20260810-01-7: unchanged by this spec
  const { root, spec, sidecar } = fixture({ designSource: './handoff' })
  regionHandoff(root)
  fs.mkdirSync(sidecar, { recursive: true })
  spawnSync(process.execPath, [path.join(SPEC, 'scripts/dc-extract.js'),
    '--bundle', path.join(root, 'handoff'), sidecar], { encoding: 'utf8' })
  fs.writeFileSync(path.join(sidecar, 'skeletons.json'), JSON.stringify({
    skeletons: [
      { id: 'sidebar', decision: 'author', componentPath: 'src/Sidebar.tsx',
        regionRef: 'app#sidebar', states: ['default'], tokens: ['surface'] },
      { id: 'legacy', decision: 'author', componentPath: 'src/Dark.tsx',
        sliceRef: 'slice-app-dark.html', states: ['default'], tokens: ['surface'] },
    ],
  }))
  // sidebar copy verbatim + legacy dark surface copy → fidelity green for author-green
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  const rows = Array.from({ length: 10 }, (_, i) => '"Shared copy row ' + i + '",').join('')
  fs.writeFileSync(path.join(root, 'src/Sidebar.tsx'), '<button>New chat</button>' + rows)
  fs.writeFileSync(path.join(root, 'src/Dark.tsx'), '<button>New chat</button>' + rows)
  run(root, spec, '--mark', 'author-green')
  run(root, spec, '--mark', 'approved')

  const ledger = JSON.parse(fs.readFileSync(path.join(root, '.claude/design-coverage.json'), 'utf8'))
  const regions = ledger.sources['./handoff'].regions
  assert.ok(regions['app#sidebar'], 'regionRef binding must be recorded')
  assert.ok(regions['app-dark#root'], 'legacy sliceRef binding must be recorded as the root region')
  assert.match(regions['app#sidebar'].spec, /01-x\.md$/)
})

// Fail-open found at the review of specs/20260816/01-gate-baseline-reconcile.md (2026-08-17,
// runId `wf_28d80534-707`), second confirmed instance of that spec's own incident class. The
// mock fidelity gate — whose comment states it is FAIL-CLOSED — branched only on
// `r.status === 1` (refuse the mark) and `r.status > 1` (could not run). `spawnSync` returns
// `status: null` when the child is killed by a signal, fails to spawn, or overflows `maxBuffer`,
// and `null` satisfies NEITHER comparison, so execution fell through and the mark was written.
// Measured before the fix: a genuinely failing fidelity-check emitting >1MB of divergence lines
// overflowed Node's default 1MB buffer and the mark was accepted on 6 of 6 identical runs.
test('the fidelity gate refuses the mark when fidelity-check dies with no exit code, not only when it exits 1', () => {
  const { root, spec, sidecar } = fixture()
  fs.mkdirSync(sidecar, { recursive: true })
  // A large genuinely-divergent surface: every mock string is absent from the implementation, so
  // the checker fails AND emits enough output to overflow a default-sized capture buffer.
  const strings = Array.from({ length: 8000 }, (_, i) =>
    'Missing copy string number ' + i + ' that the implementation does not contain at all')
  fs.writeFileSync(path.join(sidecar, 'slice-s1.html'),
    '<div>' + strings.map(s => '<span>' + s + '</span>').join('') + '</div>')
  fs.writeFileSync(path.join(sidecar, 'extract.json'), JSON.stringify({
    schemaVersion: 2,
    surfaces: [{ id: 's1', sliceFile: 'slice-s1.html', strings, layout: [] }],
  }))
  fs.writeFileSync(path.join(sidecar, 'skeletons.json'), JSON.stringify({
    skeletons: [{ id: 's1', decision: 'author', componentPath: 'src/S1.tsx',
      sliceRef: 'slice-s1.html', states: ['default'], tokens: ['surface'] }],
  }))
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'src/S1.tsx'), '<div>nothing matches</div>')

  const r = run(root, spec, '--mark', 'author-green')
  assert.notStrictEqual(r.status, 0,
    'a fidelity-check that never delivered a verdict must refuse the mark — accepting it means ' +
    'the design round is approved by a gate that did not run, which is the exact fail-open the ' +
    'FAIL-CLOSED comment above this branch promises against')

  const stateFile = path.join(sidecar, 'design-state.json')
  const marks = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {}
  assert.notStrictEqual(marks['author-green'], true,
    'the author-green mark must not be written when the fidelity gate could not reach a verdict — ' +
    'a persisted mark makes the unverified round durable and every later state derives from it')
})
