'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20261102/01-the-host-names-its-runner-grammar.md: AC-20261102-01-8, AC-20261102-01-9,
// AC-20261102-01-10 and AC-20261102-01-19 pin the review driver's base derivation when the spec
// pins neither diff_base nor build_base and the host config declares (or omits) `trunk`.

const DRIVER = 'scripts/spec-review-driver.js'
const AUTO_PICK = '📌 Auto-picked trunk main — no config.trunk declared; /spec:init writes it (veto anytime)'

// mainAhead: the build's own commit lands on main after `develop` is cut from the pre-image,
// so main...HEAD is empty while develop...HEAD is the real range. pin: a diff_base frontmatter line.
function makeHost({ trunk, mainAhead = false, pin = false } = {}) {
  const root = fs.realpathSync(tmpdir('rvtrunk'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  const cfg = {
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'test host — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }
  if (trunk !== undefined) cfg.trunk = trunk
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify(cfg))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'pre-image')
  const preImage = g('rev-parse', 'HEAD').trim()
  if (mainAhead) g('branch', 'develop')
  else g('checkout', '-q', '-b', 'spec/99-trunk-test')

  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.mkdirSync(path.join(root, 'specs/20260901'), { recursive: true })
  const spec = path.join(root, 'specs/20260901/99-trunk-test.md')
  fs.writeFileSync(spec, [
    '---',
    'status: implementing',
    'tier: standard',
    ...(pin ? ['diff_base: ' + preImage] : []),
    '---',
    '# Trunk Fixture',
    '',
    '## Decisions',
    '',
    '| ID | Decision | One-line rationale |',
    '|----|----------|--------------------|',
    '| D1 | foo() returns 42 (AC-20260901-99-1) | why |',
    '',
    '## File Plan',
    '',
    '| File | Action | Layer |',
    '|---|---|---|',
    '| src/foo.js | edit | scripts |',
    '| tests/foo.test.js | create | tests |',
    '',
    '## Acceptance Criteria',
    '',
    '- **AC-20260901-99-1**: foo() returns 42.',
  ].join('\n'))
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), [
    "'use strict'",
    "const { test } = require('node:test')",
    "const assert = require('node:assert')",
    "const foo = require('../src/foo.js')",
    "test('AC-20260901-99-1: foo() returns 42', () => { assert.strictEqual(foo(), 42) })",
    '',
  ].join('\n'))
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  if (mainAhead) {
    g('branch', 'spec/99-trunk-test')
    g('checkout', '-q', 'spec/99-trunk-test')
  }
  const manifests = () => {
    const dir = spec.replace(/\.md$/, '.review')
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^manifest-\d+\.jsonl$/.test(f)) : []
  }
  return { root, spec, preImage, manifests }
}

test('AC-20261102-01-8: a declared trunk naming an existing branch is the review base when the spec pins none, so a main that carries the build\'s own commits no longer empties the range', () => {
  const h = makeHost({ trunk: 'develop', mainAhead: true })
  const r = runNode(DRIVER, [h.spec], { cwd: h.root, timeout: 120000 })
  assert.doesNotMatch(r.stdout + r.stderr, /range is empty/,
    'with trunk develop the base is merge-base HEAD develop, a real range; an empty-range refusal means the driver still probes main: ' + r.stdout + r.stderr)
  assert.notStrictEqual(r.status, 2, 'a resolvable declared trunk must not die at startup: ' + r.stderr)
  assert.ok(h.manifests().includes('manifest-1.jsonl'),
    'the first manifest row is written only once the base resolved to a non-empty range: ' + r.stdout + r.stderr)
})

test('AC-20261102-01-9: a declared trunk naming no branch dies before any manifest row with config.trunk "nosuch" does not resolve to a branch', () => {
  const h = makeHost({ trunk: 'nosuch' })
  const r = runNode(DRIVER, [h.spec], { cwd: h.root, timeout: 120000 })
  assert.notStrictEqual(r.status, 0, 'a dead trunk must stop the review, not fall back to a guessed main: ' + r.stdout + r.stderr)
  assert.ok(r.stderr.includes('config.trunk "nosuch" does not resolve to a branch'),
    'the refusal must name the key and value so the host can fix .claude/spec.config.json: ' + r.stderr)
  assert.deepStrictEqual(h.manifests(), [],
    'the die must precede every leg, or a review runs against a base nobody declared: ' + h.manifests().join(','))
})

test('AC-20261102-01-10: with no trunk declared and no pin the base is still merge-base HEAD main and the first manifest row is written', () => {
  const h = makeHost({})
  const r = runNode(DRIVER, [h.spec], { cwd: h.root, timeout: 120000 })
  assert.notStrictEqual(r.status, 2, 'a host declaring nothing must keep the main probe, not die: ' + r.stderr)
  assert.doesNotMatch(r.stderr, /does not resolve to a branch/,
    'an undeclared trunk must never raise the declared-trunk refusal: ' + r.stderr)
  assert.ok(h.manifests().includes('manifest-1.jsonl'),
    'the main-derived base must still reach the first manifest row: ' + r.stdout + r.stderr)
})

test('AC-20261102-01-19: the derived-default line prints on stderr exactly once when no trunk is declared and no pin exists, and never when the spec pins diff_base', () => {
  const none = makeHost({})
  const r = runNode(DRIVER, [none.spec, '--state'], { cwd: none.root })
  const hits = r.stderr.split(AUTO_PICK).length - 1
  assert.strictEqual(hits, 1,
    'core § Question Style makes a derived decision visible exactly once per invocation: ' + r.stderr)
  const pinned = makeHost({ pin: true })
  const p = runNode(DRIVER, [pinned.spec, '--state'], { cwd: pinned.root })
  assert.ok(!p.stderr.includes('Auto-picked trunk'),
    'a pinned diff_base derived nothing, so announcing a trunk pick would be a lie: ' + p.stderr)
})
