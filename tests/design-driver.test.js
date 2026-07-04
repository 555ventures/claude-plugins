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
  assert.strictEqual(stateOf(root, spec), 'SKELETONS_INVALID')

  fs.writeFileSync(path.join(sidecar, 'skeletons.json'), VALID_SKELETONS)
  assert.strictEqual(stateOf(root, spec), 'AUTHOR')
  assert.match(run(root, spec).stdout, /wf-design\.js/)

  run(root, spec, '--mark', 'author-green', '--run-id', 'wf_abc123')
  // no screenshot command configured → straight to the human loop
  assert.strictEqual(stateOf(root, spec), 'ITERATE')

  run(root, spec, '--mark', 'round-green')
  run(root, spec, '--mark', 'round-green')
  assert.match(run(root, spec).stdout, /round 3/)

  run(root, spec, '--mark', 'approved')
  assert.strictEqual(stateOf(root, spec), 'RECONCILE')

  // reconcile sets designed: and deletes the sidecar
  fs.writeFileSync(spec, fs.readFileSync(spec, 'utf8').replace('---\n# X', 'designed: 2026-07-04\n---\n# X'))
  fs.rmSync(sidecar, { recursive: true })
  assert.strictEqual(stateOf(root, spec), 'DONE')
})

test('mockup path requires extract before skeletons; screenshot config inserts VISUAL', () => {
  const { root, spec, sidecar } = fixture({
    designSource: 'https://claude.ai/design/p/abc?file=X.dc.html', screenshot: 'bun shots' })
  assert.strictEqual(stateOf(root, spec), 'FETCH_EXTRACT')

  fs.mkdirSync(sidecar, { recursive: true })
  fs.writeFileSync(path.join(sidecar, 'extract.json'), '{"source":{"sha256":"x"}}')
  assert.strictEqual(stateOf(root, spec), 'SKELETONS')

  fs.writeFileSync(path.join(sidecar, 'skeletons.json'), VALID_SKELETONS)
  run(root, spec, '--mark', 'author-green')
  assert.strictEqual(stateOf(root, spec), 'VISUAL')
  run(root, spec, '--mark', 'visual-done')
  assert.strictEqual(stateOf(root, spec), 'ITERATE')
})

test('preconditions: wrong status blocks; missing design block dies; designed is DONE', () => {
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
