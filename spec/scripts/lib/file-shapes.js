'use strict'
// lib/file-shapes.js — the one definition of a test file, a code file and a dependency manifest.
// Owner: specs/20261101/02-the-host-declares-its-file-shapes.md (D2, D3); docs/adr/0011.
//
// `fileShapes(config)` merges the host's optional `config.fileShapes` block
// ({testGlobs, codeExtensions, manifests}) key by key over stack-neutral defaults. The three
// predicates (`isTestClassified`, `isCodeFile`, `isManifest`) are the only classifiers every
// consumer reads; `validateFileShapes(block)` is what `init-gen generate` and `shapes-check`
// refuse or report with — null or the first message.
//
// Deliberately NOT: read the config file (callers pass a parsed config), guess a stack from a
// manifest name (workspace-scan.js owns stack naming), or keep an alias for the retired
// top-level `testGlobs` key. A wrongly-typed key falls back to its default in `fileShapes`;
// validateFileShapes is what reports it.
//
// Exit codes: n/a (library, not an entrypoint).

const path = require('path')
const { globMatch } = require('./glob-match')

const DEFAULT_TEST_GLOBS = Object.freeze(['tests/**', 'test/**', '**/tests/**', '**/test/**', '**/__tests__/**',
  '**/*.test.*', '**/*.spec.*', '**/*_test.*', '**/test_*.*', '**/*_spec.*',
  '**/*Test.*', '**/*Tests.*', '**/*.Tests/**'])
const DEFAULT_CODE_EXTENSIONS = Object.freeze(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts', '.sh', '.bash',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.kts', '.scala', '.cs', '.fs', '.swift', '.dart',
  '.php', '.ex', '.exs', '.pl', '.ps1', '.lua', '.zig', '.c', '.cc', '.cpp', '.h'])
const DEFAULT_MANIFESTS = Object.freeze(['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml',
  'yarn.lock', 'bun.lockb', 'bun.lock', 'deno.json', 'pyproject.toml', 'poetry.lock', 'uv.lock',
  'Pipfile', 'Pipfile.lock', 'requirements*.txt', 'setup.py', 'setup.cfg', 'Cargo.toml', 'Cargo.lock',
  'go.mod', 'go.sum', 'Gemfile', 'Gemfile.lock', 'composer.json', 'composer.lock', 'pom.xml',
  'build.gradle', 'build.gradle.kts', 'libs.versions.toml', '*.csproj', '*.fsproj',
  'Directory.Packages.props', 'mix.exs', 'mix.lock', 'pubspec.yaml', 'pubspec.lock',
  'Package.swift', 'Package.resolved'])

const KEYS = ['testGlobs', 'codeExtensions', 'manifests']
const DEFAULTS = { testGlobs: DEFAULT_TEST_GLOBS, codeExtensions: DEFAULT_CODE_EXTENSIONS, manifests: DEFAULT_MANIFESTS }
const { isObj } = require('./util')

function fileShapes(config) {
  const block = config && isObj(config.fileShapes) ? config.fileShapes : {}
  const out = {}
  for (const k of KEYS) out[k] = Array.isArray(block[k]) ? block[k] : DEFAULTS[k]
  return out
}

function isTestClassified(rel, shapes) { return shapes.testGlobs.some((g) => globMatch(g, rel)) }
function isCodeFile(rel, shapes) { return shapes.codeExtensions.includes(path.extname(rel).toLowerCase()) }
function isManifest(basename, shapes) { return shapes.manifests.some((g) => globMatch(g, basename)) }

function validateFileShapes(block) {
  if (!isObj(block)) return 'fileShapes must be an object'
  for (const k of KEYS) {
    if (!(k in block)) continue
    const v = block[k]
    if (!Array.isArray(v) || !v.every((e) => typeof e === 'string' && e !== '')) {
      return `fileShapes.${k} must be an array of non-empty strings`
    }
    if (k === 'codeExtensions' && !v.every((e) => e.startsWith('.'))) {
      return 'fileShapes.codeExtensions entries must start with "."'
    }
  }
  return null
}

module.exports = {
  DEFAULT_TEST_GLOBS, DEFAULT_CODE_EXTENSIONS, DEFAULT_MANIFESTS,
  fileShapes, isTestClassified, isCodeFile, isManifest, validateFileShapes,
}
