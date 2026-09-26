#!/usr/bin/env node
'use strict'
// workspace-scan.js --root <dir> [--json] [--depth N] — walk a tree and print one
// {root, stack, manifest} entry per directory holding a package manifest, sorted by root
// (root "." for the tree's own root, forward-slash repo-relative paths below it).
//
// specs/20260926/03-gates-per-workspace.md D1: /spec:enforce's Phase 1 runs this first, so a
// monorepo gets one enforcer set per workspace instead of one per repo. Directory-name skip
// list and manifest→stack table are D1's own; when a directory carries several manifests, the
// first match in D1's listing order wins (package.json first, then the python trio, then
// go/rust/dart/ruby/php/csproj/elixir/jvm) — deterministic, never "whichever fs.readdir
// returns first".
//
// What this deliberately does NOT do:
//   - read any config file (.claude/spec.config.json, a manifest's own contents, …) — it only
//     checks which manifest filenames sit beside each other.
//   - pick, verify, or name a tool/checker for any stack — that is /spec:enforce's own
//     discovery, run per workspace against this script's output.
//   - relocate the session CWD or write anything — a pure deriver, read-only.
//
// Exit codes:
//   0  scanned — a readable root was walked; an empty result ([]) is a valid, successful scan.
//   2  usage/unreadable root — missing/bad --root, a malformed flag, or an unreadable/nonexistent
//      root directory; stderr prints the usage line either way.

const fs = require('fs')
const path = require('path')

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'vendor', 'dist', 'build', 'out',
  '.venv', 'venv', 'target', '.next', 'coverage', '.claude',
])

const USAGE = 'usage: workspace-scan.js --root <dir> [--json] [--depth N]'

// Writes go through a writeSync loop, never process.stdout.write + process.exit — a pipe
// (rather than a tty) truncates a large single write at the 64KiB buffer boundary while still
// reporting a clean exit if the process exits before the pipe drains.
function writeOut(fd, str) {
  const buf = Buffer.from(str, 'utf8')
  let off = 0
  while (off < buf.length) {
    off += fs.writeSync(fd, buf, off, buf.length - off)
  }
}

function fail(msg) {
  writeOut(2, 'workspace-scan: ' + msg + '\n' + USAGE + '\n')
  process.exit(2)
}

function parseArgs(argv) {
  const out = { root: null, json: false, depth: 4 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--root') out.root = argv[++i]
    else if (a === '--json') out.json = true
    else if (a === '--depth') out.depth = Number(argv[++i])
    else fail('unknown argument ' + a)
  }
  return out
}

// D1's manifest-precedence list: first match in this exact order wins.
function detectManifest(dir) {
  const has = (name) => fs.existsSync(path.join(dir, name))
  if (has('package.json')) {
    return { stack: has('tsconfig.json') ? 'typescript' : 'javascript', manifest: 'package.json' }
  }
  if (has('pyproject.toml')) return { stack: 'python', manifest: 'pyproject.toml' }
  if (has('setup.py')) return { stack: 'python', manifest: 'setup.py' }
  if (has('requirements.txt')) return { stack: 'python', manifest: 'requirements.txt' }
  if (has('go.mod')) return { stack: 'go', manifest: 'go.mod' }
  if (has('Cargo.toml')) return { stack: 'rust', manifest: 'Cargo.toml' }
  if (has('pubspec.yaml')) return { stack: 'dart', manifest: 'pubspec.yaml' }
  if (has('Gemfile')) return { stack: 'ruby', manifest: 'Gemfile' }
  if (has('composer.json')) return { stack: 'php', manifest: 'composer.json' }
  let entries
  try { entries = fs.readdirSync(dir) } catch { entries = [] }
  const csproj = entries.filter((f) => f.endsWith('.csproj')).sort()[0]
  if (csproj) return { stack: 'dotnet', manifest: csproj }
  if (has('mix.exs')) return { stack: 'elixir', manifest: 'mix.exs' }
  if (has('build.gradle')) return { stack: 'jvm', manifest: 'build.gradle' }
  if (has('build.gradle.kts')) return { stack: 'jvm', manifest: 'build.gradle.kts' }
  if (has('pom.xml')) return { stack: 'jvm', manifest: 'pom.xml' }
  return null
}

function walk(root, maxDepth) {
  const results = []
  function visit(absDir, relDir, depth) {
    const manifest = detectManifest(absDir)
    if (manifest) {
      results.push({ root: relDir === '' ? '.' : relDir.split(path.sep).join('/'), ...manifest })
    }
    if (depth >= maxDepth) return
    let entries
    try { entries = fs.readdirSync(absDir, { withFileTypes: true }) } catch { return }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const ent of entries) {
      if (!ent.isDirectory() || SKIP_DIRS.has(ent.name)) continue
      const nextRel = relDir === '' ? ent.name : relDir + path.sep + ent.name
      visit(path.join(absDir, ent.name), nextRel, depth + 1)
    }
  }
  visit(root, '', 0)
  results.sort((a, b) => (a.root < b.root ? -1 : a.root > b.root ? 1 : 0))
  return results
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.root) fail('--root is required')
  if (!Number.isFinite(args.depth) || args.depth < 0) fail('--depth must be a non-negative integer')

  let stat = null
  try {
    stat = fs.statSync(args.root)
  } catch {
    fail('unreadable or nonexistent root: ' + args.root)
  }
  if (!stat.isDirectory()) fail('--root must be a directory: ' + args.root)

  const results = walk(args.root, args.depth)

  if (args.json) {
    writeOut(1, JSON.stringify(results) + '\n')
  } else if (results.length === 0) {
    writeOut(1, '(no workspaces found)\n')
  } else {
    let out = ''
    for (const r of results) out += r.root + '  ' + r.stack + '  (' + r.manifest + ')\n'
    writeOut(1, out)
  }
  process.exit(0)
}

main()
