'use strict'
// Shared helpers for the plugin's deterministic-layer tests.
//
// Workflow scripts (spec/workflows/*.js) run in the harness sandbox as an async function body
// (top-level `return` is legal there), so they cannot be require()d. extractFn() brace-matches a
// named top-level `function name(...) {...}` out of the source and evaluates it standalone, which
// is exactly the unit under test for the guard functions (normalizeArgs, validateGroups, isBatch).
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync, spawnSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const SPEC = path.join(ROOT, 'spec')

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function extractFn(src, name) {
  const sig = 'function ' + name + '('
  const at = src.indexOf(sig)
  if (at === -1) throw new Error('function ' + name + ' not found')
  // Preserve a leading `async ` keyword — dropping it silently turned every
  // await-bearing extraction into a SyntaxError under evalFns (spec 20260813/09 D7).
  const asyncPrefix = 'async '
  const start = at >= asyncPrefix.length && src.slice(at - asyncPrefix.length, at) === asyncPrefix
    ? at - asyncPrefix.length
    : at
  const open = src.indexOf('{', at)
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1)
  }
  throw new Error('unbalanced braces extracting ' + name)
}

// Evaluate one or more extracted functions and return the last one by name.
function evalFns(src, names) {
  const body = names.map(n => extractFn(src, n)).join('\n')
  // eslint-disable-next-line no-new-func
  return new Function(body + '\nreturn { ' + names.join(', ') + ' }')()
}

// Assert a workflow script is syntactically valid as an async sandbox body.
function checkWorkflowSyntax(rel) {
  const src = read(rel)
  // The sandbox strips the meta export before evaluation; mirror that.
  const body = src.replace(/^export const meta = \{[\s\S]*?\n\}\n/, '')
  // eslint-disable-next-line no-new-func
  new Function('args', 'agent', 'parallel', 'pipeline', 'phase', 'log', 'budget', 'workflow',
    '"use strict"; return (async () => {' + body + '\n})()')
}

// Every temp directory this test process (and every child it spawns) creates lands under one
// per-process root that is removed exactly once when the process ends — normal exit, thrown
// error, or an interrupt signal. Without this, each tmpdir() call left a ~700-inode tree behind
// on /tmp; eight full-suite runs leaked enough fixture trees to fill a 7.8G tmpfs, exhaust the
// inode table, and stall unrelated tools with ENOSPC. TMPDIR is set here so scripts under test
// that call os.tmpdir() themselves (review-legs.js, release-legs.js, render-capture.js) land
// under the same root and are swept with it. Tests that already rmSync their own dirs keep
// working: removing a subtree twice is a no-op.
const RUN_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-tests-' + process.pid + '-'))
process.env.TMPDIR = RUN_ROOT

let swept = false

function removeRunRoot() {
  if (swept) return
  swept = true
  try { fs.rmSync(RUN_ROOT, { recursive: true, force: true, maxRetries: 3 }) } catch { /* best-effort: never fail a run on cleanup */ }
}

process.once('exit', removeRunRoot)
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.once(sig, () => {
    removeRunRoot()
    // Re-deliver the signal with default disposition so the exit status stays signal-shaped
    // (the test runner and the shell see a real interrupt, not a clean exit).
    process.kill(process.pid, sig)
  })
}

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(RUN_ROOT, prefix + '-'))
}

function runNode(script, argv, opts = {}) {
  return spawnSync(process.execPath, [path.join(SPEC, script), ...argv],
    { encoding: 'utf8', ...opts })
}

function runBash(script, argv, opts = {}) {
  return spawnSync('bash', [path.join(SPEC, script), ...argv],
    { encoding: 'utf8', ...opts })
}

// Minimal git repo factory for merge-back / gate tests.
function gitRepo(dir, opts = {}) {
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' })
  execFileSync('git', ['init', '-q', '-b', 'main', dir], { encoding: 'utf8' })
  g('config', 'user.email', 'test@test')
  g('config', 'user.name', 'test')
  if (!opts.empty) {
    fs.writeFileSync(path.join(dir, '.gitignore'), '.claude/worktrees/\n')
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n')
    g('add', '-A')
    g('commit', '-q', '-m', 'init')
  }
  return g
}

module.exports = { ROOT, SPEC, read, extractFn, evalFns, checkWorkflowSyntax, tmpdir, runNode, runBash, gitRepo }
