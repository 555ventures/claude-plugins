'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// workspace-scan.js emits one {root, stack, manifest} row per (directory, stack) pair: a
// directory carrying manifests of several stacks is a workspace of each, so /spec:enforce builds
// cells for every stack instead of only the first one in the table (the polyglot-root defect,
// audit 2026-11-01). Manifests of one stack collapse to its first listed manifest.
// Owner: specs/20260926/03-gates-per-workspace.md D1, amended by the q10 repair queued in
// specs/20261101/02-the-host-declares-its-file-shapes.md D7.

const SCRIPT = 'scripts/workspace-scan.js'

function tree(files) {
  const dir = tmpdir('workspace-scan')
  for (const rel of files) {
    const p = path.join(dir, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, '')
  }
  return dir
}

function scan(dir) {
  const r = runNode(SCRIPT, ['--root', dir, '--json'])
  assert.strictEqual(r.status, 0,
    'a readable root must scan with exit 0, or /spec:enforce Phase 1 has no workspace list: ' + r.stderr)
  return JSON.parse(r.stdout)
}

test('a polyglot directory yields one row per stack, in table order, sorted by root', () => {
  const dir = tree([
    'package.json', 'pyproject.toml', 'requirements.txt',
    'api/go.mod', 'api/Cargo.toml',
    'web/package.json', 'web/tsconfig.json',
  ])
  assert.deepStrictEqual(scan(dir), [
    { root: '.', stack: 'javascript', manifest: 'package.json' },
    { root: '.', stack: 'python', manifest: 'pyproject.toml' },
    { root: 'api', stack: 'go', manifest: 'go.mod' },
    { root: 'api', stack: 'rust', manifest: 'Cargo.toml' },
    { root: 'web', stack: 'typescript', manifest: 'package.json' },
  ], 'every stack of a polyglot directory needs its own row, or /spec:enforce builds no cells for the languages after the first')
})

test('a single-manifest directory still yields exactly one row', () => {
  const dir = tree(['svc/setup.py', 'lib/pom.xml', 'lib/build.gradle'])
  assert.deepStrictEqual(scan(dir), [
    { root: 'lib', stack: 'jvm', manifest: 'build.gradle' },
    { root: 'svc', stack: 'python', manifest: 'setup.py' },
  ], 'a single-stack directory must still yield one row, or existing enforce manifests gain duplicate cells')
})
