#!/usr/bin/env node
'use strict'
// workspace-scan.js --root <dir> [--json] [--depth N] — walk a tree and print one
// {root, stack, manifest} entry per (directory, stack) pair holding a package manifest, sorted
// by root and then by the table's listing order (root "." for the tree's own root,
// forward-slash repo-relative paths below it).
// Owner: specs/20260926/03-gates-per-workspace.md.
//
// /spec:enforce's Phase 1 runs this first, so a
// monorepo gets one enforcer set per workspace instead of one per repo. Directory-name skip
// list and manifest→stack table are this script's own. A directory carrying manifests of several
// stacks yields one row per stack (a polyglot root with package.json + pyproject.toml is both a
// javascript and a python workspace), ordered package.json, the python trio, then
// go/rust/dart/ruby/php/csproj/elixir/jvm; manifests of ONE stack collapse to its first listed
// manifest (pyproject.toml over setup.py over requirements.txt) — deterministic, never
// "whichever fs.readdir returns first".
//
// Known over-approximation: a package.json that only carries tooling (husky, prettier) beside
// another stack's manifest still counts as a javascript workspace — this script never reads
// manifest contents, and a spare cell costs /spec:enforce one "no mechanizable clauses" skip,
// where a dropped stack would cost a whole unenforced language.
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

// The manifest→stack table: one entry per stack, in listing order. Every entry that matches a
// directory contributes one row; within an entry the first manifest present names the row (a
// pyproject.toml beside a requirements.txt is still one python workspace).
const STACKS = [
  { stack: (has) => (has('tsconfig.json') ? 'typescript' : 'javascript'), manifests: ['package.json'] },
  { stack: 'python', manifests: ['pyproject.toml', 'setup.py', 'requirements.txt'] },
  { stack: 'go', manifests: ['go.mod'] },
  { stack: 'rust', manifests: ['Cargo.toml'] },
  { stack: 'dart', manifests: ['pubspec.yaml'] },
  { stack: 'ruby', manifests: ['Gemfile'] },
  { stack: 'php', manifests: ['composer.json'] },
  { stack: 'dotnet', manifests: [(entries) => entries.filter((f) => f.endsWith('.csproj')).sort()[0]] },
  { stack: 'elixir', manifests: ['mix.exs'] },
  { stack: 'jvm', manifests: ['build.gradle', 'build.gradle.kts', 'pom.xml'] },
]

function detectManifests(dir) {
  let entries
  try { entries = fs.readdirSync(dir) } catch { entries = [] }
  const has = (name) => fs.existsSync(path.join(dir, name))
  const rows = []
  for (const entry of STACKS) {
    let manifest = null
    for (const m of entry.manifests) {
      manifest = typeof m === 'function' ? m(entries) : (has(m) ? m : null)
      if (manifest) break
    }
    if (!manifest) continue
    rows.push({ stack: typeof entry.stack === 'function' ? entry.stack(has) : entry.stack, manifest })
  }
  return rows
}

function walk(root, maxDepth) {
  const results = []
  function visit(absDir, relDir, depth) {
    const root = relDir === '' ? '.' : relDir.split(path.sep).join('/')
    for (const row of detectManifests(absDir)) results.push({ root, ...row })
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
  // Stable sort: rows of one directory keep the table's listing order.
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
