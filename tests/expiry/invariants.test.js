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

test('AC-20260911-03-2 (D9): WHEN expire-tests.js --root . --invariants runs over this repository THE SYSTEM lists spec/scripts/review-legs.js, spec/scripts/red-check.js, spec/scripts/ac-matrix.js and spec/scripts/spec-build-driver.js, and never lists spec/scripts/memory-sweep.js', () => {
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
  assert.ok(!out.scripts.includes('spec/scripts/memory-sweep.js'),
    'D9: memory-sweep.js is reached by no gate command, hook command, or pipeline entrypoint and must not ' +
    'appear — its presence would mean the derivation has drifted back toward a hand list: ' +
    JSON.stringify(out.scripts))
})
