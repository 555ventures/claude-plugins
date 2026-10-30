'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { makeNoTestsHost, run, stateOf } = require('./build-driver.fixtures')

// specs/20261029/03-orchestrator-only-files-stay-out-of-worker-waves.md D1-D8: the host config's
// optional `orchestratorOnly` globs keep matching File Plan rows out of every worker dispatch
// (WAVE and REPAIR steps); AC-20261029-03-1 .. AC-20261029-03-6.

const NO_TESTS_FM = '---\nstatus: hardened\ntier: standard\n---\n# Orchestrator-only spec\n\n'
const DECISIONS = '## Decisions\n\n| ID | Decision | One-line rationale |\n|----|----------|--------------------|\n| D1 | rows route (AC-20260901-01-12) | why |\n\n'

// A makeNoTestsHost() rewritten with the given layer groups, config extras and File Plan rows
// (`[path, action, layer]`). No tests-layer rows, so the first step is the first wave.
function host({ layerGroups, orchestratorOnly, rows, extraCfg = {} }) {
  const h = makeNoTestsHost()
  const cfgPath = path.join(h.root, '.claude/spec.config.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  cfg.layerGroups = layerGroups
  cfg.agentMap = { api: 'api-routers', persistence: 'persist-worker', scripts: 'gate-scripts', default: 'general-purpose' }
  if (orchestratorOnly !== undefined) cfg.orchestratorOnly = orchestratorOnly
  Object.assign(cfg, extraCfg)
  fs.writeFileSync(cfgPath, JSON.stringify(cfg))
  const table = rows.map(([p, a, l]) => `| ${p} | ${a} | ${l} |`).join('\n')
  fs.writeFileSync(h.spec, NO_TESTS_FM + DECISIONS +
    '## File Plan\n\n| File | Action | Layer |\n|---|---|---|\n' + table +
    '\n\n## Acceptance Criteria\n\n- **AC-20260901-01-12**: rows route.\n')
  h.g('add', '-A'); h.g('commit', '-q', '-m', 'orch-only host')
  return h
}
const put = (h, rel) => { fs.mkdirSync(path.dirname(path.join(h.root, rel)), { recursive: true }); fs.writeFileSync(path.join(h.root, rel), 'x\n') }

test('AC-20261029-03-1: WHEN orchestratorOnly globs match a wave row THE SYSTEM lists that path only in the orchestrator block after the layer block, never in the worker file list', () => {
  const h = host({
    layerGroups: [['api']], orchestratorOnly: ['main.py', 'alembic/versions/**'],
    rows: [['main.py', 'MODIFY', 'api'], ['src/api/deps.js', 'MODIFY', 'api'], ['alembic/versions/0012_add.py', 'CREATE', 'api']],
  })
  const r = run(h.root, h.spec)
  assert.strictEqual(r.status, 0, r.stderr)
  assert.strictEqual(stateOf(h.root, h.spec), 'WAVE:api', 'setup precondition: the api wave is the first step: ' + r.stdout)
  const out = r.stdout
  const layerAt = out.indexOf('layer: api')
  const orchAt = out.indexOf('orchestrator — never in a worker\'s file list;')
  assert.ok(layerAt > -1 && orchAt > layerAt,
    'without an orchestrator block after the layer block the orchestrator is never told to apply the file itself: ' + out)
  const workerBlock = out.slice(layerAt, orchAt)
  assert.ok(workerBlock.includes('{"path":"src/api/deps.js","action":"MODIFY"}'), 'the worker-owned row must stay in the layer block: ' + out)
  assert.ok(!workerBlock.includes('main.py') && !workerBlock.includes('alembic/versions'),
    'an orchestrator-only path in the layer block is handed to a worker, repeating the incident: ' + workerBlock)
  const orchBlock = out.slice(orchAt)
  assert.ok(orchBlock.includes('{"path":"main.py","action":"MODIFY"}'), 'main.py must be printed for the orchestrator: ' + out)
  assert.ok(orchBlock.includes('{"path":"alembic/versions/0012_add.py","action":"CREATE"}'), 'the glob-matched migration must be printed for the orchestrator: ' + out)
})

test('AC-20261029-03-2: WHEN a wave holds only orchestrator-only rows THE SYSTEM prints the no-worker header with no layer block and accepts wave-done with --workers 0', () => {
  const h = host({
    layerGroups: [['api'], ['persistence']], orchestratorOnly: ['src/mappers.js'],
    rows: [['src/api/deps.js', 'MODIFY', 'api'], ['src/mappers.js', 'MODIFY', 'persistence']],
  })
  put(h, 'src/api/deps.js'); put(h, 'src/mappers.js')
  run(h.root, h.spec)
  const rApi = run(h.root, h.spec, '--mark', 'wave-done', '--wave', 'api', '--workers', '1')
  assert.strictEqual(rApi.status, 0, 'setup precondition: the api wave marks done: ' + rApi.stderr)
  assert.strictEqual(stateOf(h.root, h.spec), 'WAVE:persistence', 'setup precondition: persistence is next: ' + rApi.stdout)
  const r = run(h.root, h.spec)
  assert.match(r.stdout, /## Step: wave persistence — orchestrator rows only, spawn no worker/,
    'a wave with nothing to dispatch must not ask for a worker spawn: ' + r.stdout)
  assert.doesNotMatch(r.stdout, /^\s*layer:/m, 'an orchestrator-only wave must print no layer block: ' + r.stdout)
  const m = run(h.root, h.spec, '--mark', 'wave-done', '--wave', 'persistence', '--workers', '0')
  assert.strictEqual(m.status, 0, 'wave-done with --workers 0 must be accepted once the file exists: ' + m.stderr)
})

test('AC-20261029-03-3: WHEN an orchestrator-only row is missing on disk THE SYSTEM still refuses wave-done naming it', () => {
  const h = host({ layerGroups: [['api']], orchestratorOnly: ['main.py'], rows: [['main.py', 'CREATE', 'api']] })
  run(h.root, h.spec)
  const r = run(h.root, h.spec, '--mark', 'wave-done', '--wave', 'api', '--workers', '1')
  assert.strictEqual(r.status, 2, 'orchestrator-only rows must still be verified, or a skipped file lands silently: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /wave-done refused — main\.py does not verify for wave api/,
    'the refusal must name the missing orchestrator-only file: ' + r.stderr)
})

test('AC-20261029-03-4: WHEN the build reaches REPAIR THE SYSTEM routes only worker-owned paths per layer and names orchestrator-only paths on one orchestrator-owned line', () => {
  const h = host({
    layerGroups: [['api']], orchestratorOnly: ['main.py'],
    rows: [['main.py', 'MODIFY', 'api'], ['src/api/deps.js', 'MODIFY', 'api']],
  })
  fs.writeFileSync(path.join(h.root, 'FAIL_FLAG'), '')
  put(h, 'main.py'); put(h, 'src/api/deps.js')
  h.g('add', '-A'); h.g('commit', '-q', '-m', 'fail flag')
  run(h.root, h.spec)
  run(h.root, h.spec, '--mark', 'wave-done', '--wave', 'api', '--workers', '1')
  run(h.root, h.spec, '--mark', 'integrated')
  const r = run(h.root, h.spec)
  assert.strictEqual(stateOf(h.root, h.spec), 'REPAIR', 'setup precondition: a red gate lands REPAIR: ' + r.stdout + r.stderr)
  assert.ok(r.stdout.includes('\n  api: src/api/deps.js\norchestrator-owned — fix these yourself, never route them to a worker: main.py\n'),
    'REPAIR must list only worker-owned paths then the orchestrator-owned line, or a red gate routes main.py back to a worker: ' + r.stdout)
})

test('AC-20261029-03-5: WHEN orchestratorOnly is absent THE SYSTEM keeps every row in one layer block and prints no orchestrator line', () => {
  const h = host({ layerGroups: [['scripts']], rows: [['src/foo.js', 'MODIFY', 'scripts'], ['src/bar.js', 'CREATE', 'scripts']] })
  const r = run(h.root, h.spec)
  assert.strictEqual(r.status, 0, r.stderr)
  assert.strictEqual(stateOf(h.root, h.spec), 'WAVE:scripts', 'setup precondition: the scripts wave is the first step: ' + r.stdout)
  assert.strictEqual((r.stdout.match(/^\s*layer: /gm) || []).length, 1, 'exactly one layer block: ' + r.stdout)
  assert.ok(r.stdout.includes('{"path":"src/foo.js","action":"MODIFY"}') && r.stdout.includes('{"path":"src/bar.js","action":"CREATE"}'),
    'both rows must stay in the layer block: ' + r.stdout)
  assert.doesNotMatch(r.stdout, /^ {2}orchestrator/m, 'an undeclared key must print no orchestrator block: ' + r.stdout)
})

test('AC-20261029-03-6: WHEN orchestratorOnly is not an array of strings THE SYSTEM exits 2 with the named stderr and leaves status hardened', () => {
  const h = host({ layerGroups: [['scripts']], orchestratorOnly: 'main.py', rows: [['src/foo.js', 'MODIFY', 'scripts']] })
  const r = run(h.root, h.spec)
  assert.strictEqual(r.status, 2, 'a malformed key must refuse, not fall open and hand files to workers: ' + r.stdout + r.stderr)
  assert.strictEqual(r.stderr.trim(),
    'spec-build-driver: orchestratorOnly in .claude/spec.config.json must be an array of path globs (got "main.py") — fix it, or remove the key to route every row by layer',
    'the refusal text must be exactly the locked D8 message: ' + r.stderr)
  assert.match(fs.readFileSync(h.spec, 'utf8'), /^status: hardened$/m, 'a refused invocation must leave the spec status untouched')
})
