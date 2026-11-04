'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, ROOT, SPEC } = require('../helpers')

// specs/20260911/03-tests-expire-at-close.md D1, AC-20260911-03-1/-2: deriveInvariants(root,
// config) derives the transitive closure of scripts a host's own gate/hook/entrypoint commands
// reach — a hand list once silently dropped red-check.js, ac-matrix.js and the build driver, so
// the set must be derived from the real command strings, never a checked-in file.
// specs/20261103/05-tests-that-earn-their-keep.md D5, AC-20261103-05-7: launchers under bin/ widen the roots.

function loadDeriveInvariants() {
  const modPath = path.join(SPEC, 'scripts/lib/invariants.js')
  delete require.cache[modPath]
  return require(modPath).deriveInvariants
}

test('AC-20260911-03-1: WHEN deriveInvariants runs over a fixture host whose gateCommand runs scripts/a.js, a.js requires ./lib/b, gate.sh mentions d.js only inside a # comment, and scripts/c.js is referenced by nothing THE SYSTEM returns scripts limited to scripts/a.js, scripts/gate.sh and scripts/lib/b.js, excluding both scripts/c.js and scripts/d.js', () => {
  const deriveInvariants = loadDeriveInvariants()
  const root = tmpdir('invariants-ac1')
  fs.mkdirSync(path.join(root, 'scripts/lib'), { recursive: true })
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  const config = { gateCommand: 'bash scripts/gate.sh' }
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify(config))
  fs.writeFileSync(path.join(root, 'scripts/gate.sh'),
    '#!/usr/bin/env bash\n# mentions d.js only in a comment, never a real edge\nnode scripts/a.js\n')
  fs.writeFileSync(path.join(root, 'scripts/a.js'), "require('./lib/b')\n")
  fs.writeFileSync(path.join(root, 'scripts/lib/b.js'), 'module.exports = {}\n')
  fs.writeFileSync(path.join(root, 'scripts/c.js'), 'module.exports = {} // referenced by nothing\n')
  fs.writeFileSync(path.join(root, 'scripts/d.js'), 'module.exports = {} // only ever mentioned in a comment\n')

  const result = deriveInvariants(root, config)

  assert.deepStrictEqual(result.scripts.slice().sort(), ['scripts/a.js', 'scripts/gate.sh', 'scripts/lib/b.js'],
    'D1: the transitive closure must be exactly the gate root, the require it opens, and lib/b.js — no ' +
    'hand list, no missed require(), and nothing else: got ' + JSON.stringify(result.scripts))
  assert.ok(!result.scripts.includes('scripts/c.js'),
    'D1: a script reachable from nothing in the closure must never be reported as an invariant — including it ' +
    'would make every truly-dead script immortally exempt from expiry: ' + JSON.stringify(result.scripts))
  assert.ok(!result.scripts.includes('scripts/d.js'),
    'D1: a comment-only mention of a basename must never open an edge — counting it would let a stray comment ' +
    'keep an unreachable test alive forever: ' + JSON.stringify(result.scripts))
})

test('AC-20260911-03-2 (D9): WHEN expire-tests.js --root . --invariants runs over this repository THE SYSTEM lists spec/scripts/review-legs.js, spec/scripts/red-check.js, spec/scripts/ac-matrix.js and spec/scripts/spec-build-driver.js, and never lists spec/evals/host.sh', () => {
  const r = runNode('scripts/expire-tests.js', ['--root', '.', '--invariants', '--json'], { cwd: ROOT, encoding: 'utf8' })
  assert.strictEqual(r.status, 0,
    'the live-repo invariants derivation must succeed at HEAD, or the close-time expiry pass this repo ' +
    'depends on can never resolve what the pipeline itself runs: ' + r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  for (const must of ['spec/scripts/review-legs.js', 'spec/scripts/red-check.js',
    'spec/scripts/ac-matrix.js', 'spec/scripts/spec-build-driver.js']) {
    assert.ok(out.scripts.includes(must),
      'D9: the derived invariants set must include ' + must + ' — a hand list already dropped exactly this ' +
      'class of pipeline-run script once, the incident this decision exists to prevent recurring: ' +
      JSON.stringify(out.scripts))
  }
  assert.ok(!out.scripts.includes('spec/evals/host.sh'),
    'D9: evals/host.sh is reached by no gate command, hook command, launcher, or pipeline entrypoint and must not ' +
    'appear — its presence would mean the derivation has drifted back toward a hand list: ' +
    JSON.stringify(out.scripts))
})

test('AC-20261103-05-7: WHEN tools/bin/launch names scripts/cli.js, nothing else does, and deep/a/bin/other names scripts/dead.js THE SYSTEM lists cli.js under scripts and tools/bin/launch under launchers, and omits dead.js', () => {
  const root = tmpdir('invariants-launcher')
  const put = (rel, body) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    fs.writeFileSync(path.join(root, rel), body)
  }
  put('.claude/spec.config.json', JSON.stringify({ gateCommand: 'node scripts/gate.js' }))
  put('scripts/gate.js', 'process.exit(0)\n')
  put('scripts/cli.js', 'process.exit(0)\n')
  put('scripts/dead.js', 'process.exit(0)\n')
  put('tools/bin/launch', '#!/usr/bin/env bash\nnode scripts/cli.js "$@"\n')
  put('deep/a/bin/other', '#!/usr/bin/env bash\nnode scripts/dead.js\n')
  put('specs/20260101/01-done.md', '---\nstatus: done\ntier: standard\ndiff_base: 0000000000000000000000000000000000000000\n---\n# Done\n\n' +
    '## Acceptance Criteria\n\n- **AC-20260101-01-1**: THE SYSTEM launches.\n')
  put('tests/launch.test.js', "'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "const { spawnSync } = require('node:child_process')\n\ntest('AC-20260101-01-1: the launcher exits 0', () => {\n" +
    "  assert.strictEqual(spawnSync('bash', ['tools/bin/launch']).status, 0, 'exits 0')\n})\n")

  const r = runNode('scripts/expire-tests.js', ['--root', root, '--invariants', '--json'])
  assert.strictEqual(r.status, 0, 'the invariants derivation must succeed: ' + r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.ok(out.scripts.includes('scripts/cli.js'),
    'a script reached only through a launcher is a pipeline script; omitting it lets expiry delete its exec tests: ' + r.stdout)
  assert.deepStrictEqual(out.launchers, ['tools/bin/launch'],
    'only bin/ files at depth <= 2 are launchers — a deeper bin must not open roots: ' + r.stdout)
  assert.ok(!out.scripts.includes('scripts/dead.js'),
    'a script named only by a too-deep bin file is unreachable and must not be immortal: ' + r.stdout)
})
