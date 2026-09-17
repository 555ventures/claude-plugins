'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, SPEC } = require('../helpers')

// specs/20260911/02-tests-have-a-ceiling.md D2 (`listTestFiles`) and specs/20260911/03-tests-
// expire-at-close.md D1 (the invariants universe) both walk the tree through lib/walk-files.js: a
// symlink whose target is a regular file classifies under the link's own path, and a symlink to a
// directory is skipped and never descended. Pinned through each consumer's public API rather than
// the walker directly, so re-forking a private copy of the walk fails here.

function load(rel) {
  const modPath = path.join(SPEC, rel)
  delete require.cache[modPath]
  return require(modPath)
}

test('listTestFiles classifies a test file that is itself a symlink to a regular file, and never crashes on a directory symlink beside it', () => {
  const { listTestFiles } = load('scripts/lib/scan-test-calls.js')
  const root = tmpdir('walkfiles-listtests')
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  fs.mkdirSync(path.join(root, 'shared'), { recursive: true })
  fs.mkdirSync(path.join(root, 'vendor/pkg'), { recursive: true })
  fs.writeFileSync(path.join(root, 'tests/real.test.js'), "test('a', () => {})\n")
  fs.writeFileSync(path.join(root, 'shared/linked.test.js'), "test('b', () => {})\n")
  fs.writeFileSync(path.join(root, 'vendor/pkg/index.js'), "'use strict'\n")
  fs.symlinkSync(path.join(root, 'shared/linked.test.js'), path.join(root, 'tests/linked.test.js'), 'file')
  fs.symlinkSync(path.join(root, 'vendor'), path.join(root, 'tests/node_modules'), 'dir')

  const rel = listTestFiles(root, { testGlobs: ['tests/**/*.test.js'] })
    .map((f) => path.relative(root, f).split(path.sep).join('/')).sort()

  assert.deepStrictEqual(rel, ['tests/linked.test.js', 'tests/real.test.js'],
    'a symlinked test file must classify exactly like a regular one — dropping it makes count-tests.js, ' +
    'coverage-scope.js and expire-tests.js blind to every AC pinned in it while red-check.js reports ' +
    'those same ACs as covered: got ' + JSON.stringify(rel))
})

test('deriveInvariants reaches a pipeline script that is itself a symlink to a regular file', () => {
  const { deriveInvariants } = load('scripts/lib/invariants.js')
  const root = tmpdir('walkfiles-invariants')
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true })
  fs.mkdirSync(path.join(root, 'shared'), { recursive: true })
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  const config = { gateCommand: 'node scripts/gate.js' }
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify(config))
  fs.writeFileSync(path.join(root, 'shared/gate-impl.js'), "module.exports = {}\n")
  fs.symlinkSync(path.join(root, 'shared/gate-impl.js'), path.join(root, 'scripts/gate.js'), 'file')

  const result = deriveInvariants(root, config)

  assert.ok(result.scripts.includes('scripts/gate.js'),
    'the host\'s gateCommand names scripts/gate.js, so it is an invariant however it is stored on disk — ' +
    'a walk that cannot see a symlinked script leaves the real gate out of the universe entirely, and ' +
    'expire-tests.js then treats the tests guarding it as expirable: got ' + JSON.stringify(result.scripts))
})
