#!/usr/bin/env node
// Codegen for the spec plugin's six Workflow scripts (spec/workflows/wf-*.js).
//
// WHY this exists: the Workflow sandbox has no require() — a Workflow script is a self-contained
// body, not a module. Shared machinery (normalizeArgs; validateGroups/isBatch/typeOfArg;
// resolveType/doctrineBlock/dispatch) therefore cannot be imported, only inlined — and before this
// script existed it was hand-copied across files and kept in sync by byte-identity tests alone.
// This script makes the inlining a build step instead of a manual discipline: each shared block
// lives ONCE, in fragments/*.js.frag, and gets spliced into a per-workflow body
// (src/wf-<name>.body.js) at its `// @fragment:<name>` marker line(s).
//
// The committed spec/workflows/wf-*.js files REMAIN the runtime artifacts — the plugin invokes
// them by scriptPath, unchanged. Generation happens at development time: edit a fragment or a
// body file, run `npm run build:workflows` (this script), commit the regenerated wf-*.js.
//
// Splicing rule: a marker line's OWN indentation/whitespace is discarded — the marker must sit at
// column 0 (every current marker does; all shared blocks are top-level statements) — and is
// replaced by the fragment's raw text, verbatim except for `__WF_NAME__` substitution (the
// workflow's name, e.g. "wf-build", taken from the body file's own filename). A fragment may be
// spliced at more than one marker in the same body file.
//
// --check: regenerate every wf-*.js in memory, diff against the committed file, and exit 1 with a
// per-file summary if any differ — instead of writing. Used in CI / pre-commit to catch a fragment
// or body edit that was never regenerated.
'use strict'
const fs = require('fs')
const path = require('path')

const WORKFLOWS_DIR = path.join(__dirname, '..', 'workflows')
const SRC_DIR = path.join(WORKFLOWS_DIR, 'src')
const FRAGMENTS_DIR = path.join(WORKFLOWS_DIR, 'fragments')

const MARKER_RE = /^\/\/ @fragment:([a-z0-9-]+)$/

function die(msg) {
  process.stderr.write('build-workflows: ' + msg + '\n')
  process.exit(1)
}

function listBodyFiles() {
  return fs.readdirSync(SRC_DIR)
    .filter(f => f.endsWith('.body.js'))
    .sort()
}

function loadFragments() {
  const files = fs.readdirSync(FRAGMENTS_DIR).filter(f => f.endsWith('.js.frag'))
  const fragments = {}
  for (const f of files) {
    const name = f.slice(0, -'.js.frag'.length)
    fragments[name] = fs.readFileSync(path.join(FRAGMENTS_DIR, f), 'utf8').replace(/\n+$/, '')
  }
  return fragments
}

// bodyFile: 'wf-build.body.js' -> outName: 'wf-build.js', wfName: 'wf-build'
function outNameFor(bodyFile) {
  const base = bodyFile.slice(0, -'.body.js'.length)
  return { outName: base + '.js', wfName: base }
}

function splice(bodyText, fragments, wfName, bodyFile) {
  const lines = bodyText.split('\n')
  const out = []
  for (const line of lines) {
    const m = MARKER_RE.exec(line)
    if (!m) { out.push(line); continue }
    const fragName = m[1]
    const frag = fragments[fragName]
    if (frag === undefined) {
      die(`${bodyFile}: unknown fragment '${fragName}' (no fragments/${fragName}.js.frag)`)
    }
    out.push(frag.split('\n').map(l => l.split('__WF_NAME__').join(wfName)).join('\n'))
  }
  return out.join('\n')
}

function generateAll() {
  const fragments = loadFragments()
  const bodyFiles = listBodyFiles()
  if (!bodyFiles.length) die('no *.body.js files found in ' + SRC_DIR)
  const results = []
  for (const bodyFile of bodyFiles) {
    const { outName, wfName } = outNameFor(bodyFile)
    const bodyText = fs.readFileSync(path.join(SRC_DIR, bodyFile), 'utf8')
    const generated = splice(bodyText, fragments, wfName, bodyFile)
    results.push({ bodyFile, outName, generated })
  }
  return results
}

function diffSummary(a, b) {
  const al = a.split('\n')
  const bl = b.split('\n')
  const max = Math.max(al.length, bl.length)
  let first = -1
  let changed = 0
  for (let i = 0; i < max; i++) {
    if (al[i] !== bl[i]) {
      changed++
      if (first === -1) first = i + 1
    }
  }
  return { changed, first, committedLines: al.length, generatedLines: bl.length }
}

function main() {
  const check = process.argv.includes('--check')
  const results = generateAll()

  if (!check) {
    for (const { outName, generated } of results) {
      fs.writeFileSync(path.join(WORKFLOWS_DIR, outName), generated)
      process.stdout.write('wrote ' + path.join('spec/workflows', outName) + '\n')
    }
    return
  }

  let anyDiff = false
  for (const { outName, generated } of results) {
    const outPath = path.join(WORKFLOWS_DIR, outName)
    if (!fs.existsSync(outPath)) {
      anyDiff = true
      process.stdout.write(`DIFF ${outName}: missing — never generated\n`)
      continue
    }
    const committed = fs.readFileSync(outPath, 'utf8')
    if (committed === generated) continue
    anyDiff = true
    const { changed, first, committedLines, generatedLines } = diffSummary(committed, generated)
    process.stdout.write(
      `DIFF ${outName}: ${changed} line(s) differ (first at line ${first}); ` +
      `committed has ${committedLines} lines, generated has ${generatedLines} lines\n`)
  }
  if (anyDiff) {
    process.stdout.write('build-workflows --check: FAILED — regenerate with `npm run build:workflows`\n')
    process.exit(1)
  }
  process.stdout.write('build-workflows --check: OK — all six wf-*.js match their generated source\n')
}

main()
