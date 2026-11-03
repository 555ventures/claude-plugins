'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20261103/07-the-file-decides-not-the-tier.md D1/D2: AC-20261103-07-1 .. AC-20261103-07-5.

const SCRIPT = 'scripts/out-of-plan-triage.js'

const RULES = [
  '# Rules', '', '## Risk Tiers', '',
  '- **Hook surfaces**: `hooks/hooks.json`,',
  '  `scripts/gate.sh` — a broken hook blocks every session.',
  '- **`bin/`** — launchers.', '',
  'Standard-tier-shaped direct work: edits to `scripts/patterns.sh`.', '',
  '## Other', '', 'nothing', '',
].join('\n')

function spec(tier, rows) {
  return `---\nstatus: hardened\ntier: ${tier}\n---\n# S\n\n## Decisions\n\n| ID | Decision | One-line rationale |\n|----|----------|--------------------|\n` +
    '| D1 | one | why |\n| D2 | two | why |\n\n## File Plan\n\n| Path | Action | Layer | Summary |\n|------|--------|-------|---------|\n' +
    rows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} | x |`).join('\n') + '\n'
}

function host(opts = {}) {
  const root = fs.realpathSync(tmpdir('triage'))
  fs.mkdirSync(path.join(root, '.claude/rules'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  const cfg = { pipelineRules: '.claude/rules/spec-pipeline.md', ...(opts.cfg || {}) }
  if (opts.noPipelineRules) delete cfg.pipelineRules
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify(cfg))
  fs.writeFileSync(path.join(root, '.claude/rules/spec-pipeline.md'), opts.rules === undefined ? RULES : opts.rules)
  fs.writeFileSync(path.join(root, 'spec.md'), spec(opts.tier || 'critical',
    opts.rows || [['hooks/hooks.json', 'MODIFY', 'other'], ['src/a.js', 'MODIFY', 'scripts']]))
  fs.writeFileSync(path.join(root, 'tests/pins.test.js'), "const x = 'hooks/hooks.json'\n")
  fs.writeFileSync(path.join(root, 'tests/other.test.js'), 'const y = 1\n')
  return root
}

const triage = (root, file, ...extra) =>
  runNode(SCRIPT, ['--spec', 'spec.md', '--file', file, '--root', root, ...extra], { cwd: root })

test('AC-20261103-07-1: WHEN a test outside the File Plan names a planned path on a critical spec THE SYSTEM auto-picks add to scope and prints the pick, both rows and a matching --json object', () => {
  const root = host()
  const r = triage(root, 'tests/pins.test.js', '--gate-line', 'pins the hook list')
  assert.strictEqual(r.status, 0, 'a non-surface file must exit 0 whatever the spec tier: ' + r.stdout + r.stderr)
  const lines = r.stdout.split('\n')
  const want = [
    '📌 Auto-picked add to scope — tests/pins.test.js (veto anytime)',
    'triage: auto — tests/pins.test.js is not a § Risk Tiers surface; its source names File Plan row hooks/hooks.json — an in-place update of a pin on planned work',
    'File Plan row:',
    '| tests/pins.test.js | MODIFY | tests | gate line — updated in place, never weakened [auto: out-of-plan-triage] |',
    'Decisions row:',
  ]
  assert.deepStrictEqual(lines.slice(0, 5), want,
    'the first five lines must be the pick, strength, and row headers in order, or the session pastes the wrong rows: ' + r.stdout)
  assert.ok(String(lines[5]).startsWith('| D3 | Scope widened at build: `tests/pins.test.js` enters the File Plan (gate line: pins the hook list); the pin is updated in place, never weakened. [auto: out-of-plan-triage — its source names File Plan row hooks/hooks.json'),
    'the Decisions row must take the next D-id and carry the gate clause and reason: ' + lines[5])
  assert.ok(String(lines[5]).includes('[no-ac: the gate line is the oracle]'),
    'the row must carry the no-ac sanction or promise-sweep orphans it: ' + lines[5])
  const j = triage(root, 'tests/pins.test.js', '--gate-line', 'pins the hook list', '--json')
  assert.strictEqual(j.status, 0, j.stderr)
  assert.strictEqual(j.stdout.trim(),
    '{"verdict":"auto","file":"tests/pins.test.js","tier":"critical","surface":null,"namesPlanned":["hooks/hooks.json"],"layer":"tests","nextDecision":"D3","reason":"its source names File Plan row hooks/hooks.json — an in-place update of a pin on planned work"}',
    '--json must print exactly the one object, or a machine consumer cannot parse the verdict: ' + j.stdout)
})

test('AC-20261103-07-2: WHEN the file is a § Risk Tiers bullet span or an orchestratorOnly glob THE SYSTEM exits 1 and asks, whatever the tier, and a span outside the bullets stays auto', () => {
  const root = host({ tier: 'standard' })
  const a = triage(root, 'scripts/gate.sh')
  assert.strictEqual(a.status, 1, 'a bullet span must ask even on a standard spec: ' + a.stdout + a.stderr)
  assert.ok(a.stdout.includes('triage: ask — scripts/gate.sh is a § Risk Tiers surface (`scripts/gate.sh`) — ask: add to scope / file separately / pause'),
    'the ask line must name the matching span: ' + a.stdout)
  const b = triage(root, 'bin/tool')
  assert.strictEqual(b.status, 1, 'a prefix span must ask: ' + b.stdout + b.stderr)
  assert.ok(b.stdout.includes('(`bin/`)'), 'the prefix span must be named: ' + b.stdout)
  const c = triage(root, 'scripts/patterns.sh', '--json')
  assert.strictEqual(c.status, 0, 'a span named only in the non-bullet paragraph must not ask: ' + c.stdout + c.stderr)
  assert.strictEqual(JSON.parse(c.stdout).verdict, 'auto', 'the non-bullet paragraph is not a surface: ' + c.stdout)
  const root2 = host({ tier: 'standard', cfg: { orchestratorOnly: ['ops/**'] } })
  const d = triage(root2, 'ops/deploy.sh')
  assert.strictEqual(d.status, 1, 'an orchestratorOnly path must ask: ' + d.stdout + d.stderr)
  assert.ok(d.stdout.includes('triage: ask — ops/deploy.sh matches orchestratorOnly `ops/**` — ask: add to scope / file separately / pause'),
    'the ask line must name the glob: ' + d.stdout)
  const dj = triage(root2, 'ops/deploy.sh', '--json')
  const o = JSON.parse(dj.stdout)
  assert.strictEqual(o.verdict, 'ask', 'json verdict must be ask: ' + dj.stdout)
  assert.strictEqual(o.surface, 'orchestratorOnly ops/**', 'surface must name the glob: ' + dj.stdout)
  assert.strictEqual(o.layer, null, 'layer is null unless auto: ' + dj.stdout)
  assert.strictEqual(o.nextDecision, null, 'nextDecision is null unless auto: ' + dj.stdout)
})

test('AC-20261103-07-3: WHEN a test names no File Plan path, or the file is absent from disk, THE SYSTEM still auto-picks with an empty namesPlanned', () => {
  const root = host()
  const r = triage(root, 'tests/other.test.js')
  assert.strictEqual(r.status, 0, 'a test naming no planned path is still auto: ' + r.stdout + r.stderr)
  assert.ok(r.stdout.includes('triage: auto — tests/other.test.js is not a § Risk Tiers surface; its source names no File Plan path'),
    'the strength must say the source names no planned path: ' + r.stdout)
  assert.deepStrictEqual(JSON.parse(triage(root, 'tests/other.test.js', '--json').stdout).namesPlanned, [],
    'namesPlanned must be empty when the source names nothing')
  const m = triage(root, 'tests/missing.test.js', '--json')
  assert.strictEqual(m.status, 0, 'a file absent from disk must not crash the triage: ' + m.stdout + m.stderr)
  assert.deepStrictEqual(JSON.parse(m.stdout).namesPlanned, [], 'an absent file names nothing: ' + m.stdout)
})

test('AC-20261103-07-4: WHEN the file is not test-classified THE SYSTEM takes the Layer of the row sharing its leading directory, else other', () => {
  const root = host()
  const b = triage(root, 'src/lib/b.js')
  assert.strictEqual(b.status, 0, 'a non-surface source file is auto: ' + b.stdout + b.stderr)
  assert.ok(b.stdout.includes('triage: auto — src/lib/b.js is not a § Risk Tiers surface; not a test file'),
    'the strength must be "not a test file": ' + b.stdout)
  assert.strictEqual(JSON.parse(triage(root, 'src/lib/b.js', '--json').stdout).layer, 'scripts',
    'src/a.js shares the leading directory src, so the row layer must be reused')
  assert.strictEqual(JSON.parse(triage(root, 'docs/x.md', '--json').stdout).layer, 'other',
    'no planned path shares a leading directory with docs/x.md, so the layer must be other')
})

test('AC-20261103-07-5: WHEN the file is a File Plan path or glob THE SYSTEM reports in-plan, and a missing flag, section, config key or spec exits 2 naming the remedy', () => {
  const root = host({ rows: [['hooks/hooks.json', 'MODIFY', 'other'], ['src/a.js', 'MODIFY', 'scripts'], ['src/gen/*.js', 'MODIFY', 'scripts']] })
  const a = triage(root, 'src/a.js', '--json')
  assert.strictEqual(a.status, 0, 'in-plan exits 0: ' + a.stdout + a.stderr)
  assert.strictEqual(JSON.parse(a.stdout).verdict, 'in-plan', 'a concrete row is in-plan: ' + a.stdout)
  assert.ok(triage(root, 'src/a.js').stdout.includes('triage: in-plan — src/a.js is already a File Plan row; dispatch its owning worker'),
    'the in-plan line must tell the session to dispatch the owning worker')
  assert.strictEqual(JSON.parse(triage(root, 'src/gen/z.js', '--json').stdout).verdict, 'in-plan',
    'a glob File Plan row must cover src/gen/z.js, or a planned directory is re-asked')
  const noFile = runNode(SCRIPT, ['--spec', 'spec.md', '--root', root], { cwd: root })
  assert.strictEqual(noFile.status, 2, 'a missing --file is a usage error: ' + noFile.stdout + noFile.stderr)
  assert.match(noFile.stderr, /usage: out-of-plan-triage\.js/, 'stderr must print the usage line: ' + noFile.stderr)
  const s = triage(host({ rules: '# Rules\n\n## Planning\n\nx\n' }), 'x.js')
  assert.strictEqual(s.status, 2, 'no Risk Tiers section must exit 2: ' + s.stdout + s.stderr)
  assert.match(s.stderr, /\/spec:doctor/, 'stderr must name /spec:doctor: ' + s.stderr)
  const k = triage(host({ noPipelineRules: true }), 'x.js')
  assert.strictEqual(k.status, 2, 'no pipelineRules key must exit 2: ' + k.stdout + k.stderr)
  assert.match(k.stderr, /\/spec:doctor/, 'stderr must name /spec:doctor: ' + k.stderr)
  const gone = runNode(SCRIPT, ['--spec', 'nope.md', '--file', 'x.js', '--root', root], { cwd: root })
  assert.strictEqual(gone.status, 2, 'a missing spec must exit 2: ' + gone.stdout + gone.stderr)
})
