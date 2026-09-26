'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260926/03-gates-per-workspace.md D1: the new workspace-scan.js script walks a tree,
// skipping vendored/build directories, and prints one {root, stack, manifest} entry per
// directory holding a package manifest, sorted by root. AC-20260926-03-1..4.

function writeTree(dir, files) {
  for (const rel of files) {
    const p = path.join(dir, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, '')
  }
}

test('AC-20260926-03-1: WHEN workspace-scan.js --root <tmp> --json runs over a root TypeScript workspace and a nested api/pyproject.toml python workspace THE SYSTEM SHALL exit 0 and print exactly the two-entry array sorted by root', () => {
  const dir = tmpdir('ws1')
  writeTree(dir, ['package.json', 'tsconfig.json', 'api/pyproject.toml'])
  const r = runNode('scripts/workspace-scan.js', ['--root', dir, '--json'])
  assert.strictEqual(r.status, 0,
    'a readable root with valid manifests must exit 0 — a non-zero exit means the scan itself failed: ' + r.stderr)
  assert.strictEqual(r.stdout.trim(),
    '[{"root":".","stack":"typescript","manifest":"package.json"},{"root":"api","stack":"python","manifest":"pyproject.toml"}]',
    'D1: the root workspace with tsconfig.json beside package.json must classify as typescript, ' +
    'the nested api/ workspace as python via pyproject.toml, and the array must be sorted by root ' +
    '(root "." before "api"): ' + JSON.stringify({ stdout: r.stdout, stderr: r.stderr }))
})

test('AC-20260926-03-2: WHEN the same tree also holds node_modules/left-pad/package.json, web/dist/package.json and .claude/worktrees/x/package.json THE SYSTEM SHALL list none of those directories as workspaces, matching AC-1\'s output exactly', () => {
  const dir = tmpdir('ws2')
  writeTree(dir, [
    'package.json', 'tsconfig.json', 'api/pyproject.toml',
    'node_modules/left-pad/package.json',
    'web/dist/package.json',
    '.claude/worktrees/x/package.json',
  ])
  const r = runNode('scripts/workspace-scan.js', ['--root', dir, '--json'])
  assert.strictEqual(r.status, 0,
    'a readable root must still exit 0 with vendored/worktree junk present: ' + r.stderr)
  assert.strictEqual(r.stdout.trim(),
    '[{"root":".","stack":"typescript","manifest":"package.json"},{"root":"api","stack":"python","manifest":"pyproject.toml"}]',
    'D1: node_modules, a nested dist directory, and .claude must never be walked into as workspace ' +
    'candidates — a scan that lists any of them would wire a checker at a path the host never owns: ' +
    JSON.stringify({ stdout: r.stdout, stderr: r.stderr }))
})

test('AC-20260926-03-3: WHEN a root package.json has no sibling tsconfig.json and svc/go.mod is present THE SYSTEM SHALL classify the root as javascript and svc as go; AND WHEN a tree holds no manifest at all THE SYSTEM SHALL exit 0 and print []', () => {
  const dir = tmpdir('ws3')
  writeTree(dir, ['package.json', 'svc/go.mod'])
  const r = runNode('scripts/workspace-scan.js', ['--root', dir, '--json'])
  assert.strictEqual(r.status, 0,
    'a readable root with valid manifests must exit 0: ' + r.stderr)
  assert.strictEqual(r.stdout.trim(),
    '[{"root":".","stack":"javascript","manifest":"package.json"},{"root":"svc","stack":"go","manifest":"go.mod"}]',
    'D1: a root package.json with no sibling tsconfig.json must classify as javascript (not ' +
    'typescript), and svc/go.mod must classify as go: ' + JSON.stringify({ stdout: r.stdout, stderr: r.stderr }))

  const empty = tmpdir('ws3-empty')
  const r2 = runNode('scripts/workspace-scan.js', ['--root', empty, '--json'])
  assert.strictEqual(r2.status, 0,
    'a readable root with zero manifests is still a valid, successful scan — an empty result is not an error: ' + r2.stderr)
  assert.strictEqual(r2.stdout.trim(), '[]',
    'D1: a tree with no package manifest anywhere must print the empty array, not an error or a ' +
    'placeholder entry: ' + JSON.stringify({ stdout: r2.stdout, stderr: r2.stderr }))
})

test('AC-20260926-03-4: WHEN the script runs with no --root, or with --root naming a path that does not exist THE SYSTEM SHALL exit 2 with a usage line on stderr naming --root <dir> and [--json]', () => {
  const rNoArgs = runNode('scripts/workspace-scan.js', [])
  assert.strictEqual(rNoArgs.status, 2,
    'omitting --root entirely must exit 2 (usage), never scan an implicit cwd or crash uncontrolled: ' +
    JSON.stringify({ status: rNoArgs.status, stdout: rNoArgs.stdout, stderr: rNoArgs.stderr }))
  assert.match(rNoArgs.stderr, /--root <dir>/,
    'the usage line on stderr must name the --root <dir> flag, or a caller invoking the script wrong ' +
    'has no way to discover the correct form: ' + rNoArgs.stderr)
  assert.match(rNoArgs.stderr, /\[--json\]/,
    'the usage line on stderr must name the optional [--json] flag: ' + rNoArgs.stderr)

  const missing = path.join(tmpdir('ws4'), 'does-not-exist')
  const rMissing = runNode('scripts/workspace-scan.js', ['--root', missing, '--json'])
  assert.strictEqual(rMissing.status, 2,
    '--root naming a path that does not exist must exit 2 (usage/unreadable root), never crash with ' +
    'an uncaught ENOENT or silently print an empty scan: ' +
    JSON.stringify({ status: rMissing.status, stdout: rMissing.stdout, stderr: rMissing.stderr }))
  assert.match(rMissing.stderr, /--root <dir>/,
    'the unreadable-root refusal must print the same usage line naming --root <dir>: ' + rMissing.stderr)
  assert.match(rMissing.stderr, /\[--json\]/,
    'the unreadable-root refusal must print the same usage line naming [--json]: ' + rMissing.stderr)
})
