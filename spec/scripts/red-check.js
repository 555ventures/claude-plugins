#!/usr/bin/env node
'use strict'
// red-check.js — every test file ADDED since base must fail on base and pass on HEAD (an edited existing
// test is not checked). A test that passes on base too is a vacuous green: it proves nothing about the new
// code. It is information for the reviewer, never a block.
//
// node red-check.js --base <sha> --root <worktree>
//   → stdout JSON {files: [{file, redOnBase, greenOnHead}], vacuousGreen: [file…], error?}
// Runs config.testFileCommand ({file} = the path) in a throwaway detached worktree at base with
// the new test files copied in, then in root. Exit 0 always; a problem is reported as `error`.

const fs = require('fs')
const os = require('os')
const path = require('path')
const { readConfig } = require('./lib/state')
const { run } = require('./lib/host')
const git = require('./lib/git')

const quote = (s) => "'" + s.replace(/'/g, "'\\''") + "'"
// A test file is named by its basename: *.test.*, *.spec.*, *_test.*, *_spec.* or test_*.
const TEST_NAME = /^(?:.+\.(?:test|spec)\..+|.+_(?:test|spec)\..+|test_.+)$/
const isTest = (f) => TEST_NAME.test(path.basename(f)) && !/\.md$/.test(f) && !/\.run\//.test(f)

function check(base, root) {
  const out = { files: [], vacuousGreen: [] }
  const cmd = readConfig(root).testFileCommand
  if (!cmd) return { ...out, error: 'no testFileCommand in .claude/spec.config.json' }
  if (!base) return { ...out, error: 'usage: red-check.js --base <sha> --root <worktree>' }
  const added = (f) => git.raw(['cat-file', '-e', `${base}:${f}`], root).status !== 0 // base lacks it
  const files = git.changedFiles(base, root).filter((f) => isTest(f) && fs.existsSync(path.join(root, f)) && added(f))
  if (!files.length) return out
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'red-check-'))
  const tree = path.join(tmp, 'base')
  try {
    git.sh(['worktree', 'add', '--detach', '-q', tree, base], root)
    // Dependencies installed in root are reused so base fails on the code, not on missing modules.
    if (fs.existsSync(path.join(root, 'node_modules')) && !fs.existsSync(path.join(tree, 'node_modules'))) {
      fs.symlinkSync(path.join(root, 'node_modules'), path.join(tree, 'node_modules'))
    }
    for (const f of files) {
      fs.mkdirSync(path.dirname(path.join(tree, f)), { recursive: true })
      fs.copyFileSync(path.join(root, f), path.join(tree, f))
    }
    for (const file of files) {
      const c = cmd.split('{file}').join(quote(file))
      const redOnBase = run(c, { cwd: tree }).status !== 0
      const greenOnHead = run(c, { cwd: root }).status === 0
      out.files.push({ file, redOnBase, greenOnHead })
      if (!redOnBase && greenOnHead) out.vacuousGreen.push(file)
    }
  } finally {
    git.raw(['worktree', 'remove', '--force', tree], root)
    git.raw(['worktree', 'prune'], root)
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  return out
}

function main(argv) {
  const opt = {}
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[++i]
  let out
  try { out = check(opt.base, path.resolve(opt.root || '.')) } catch (e) { out = { files: [], vacuousGreen: [], error: e.message } }
  process.stdout.write(JSON.stringify(out) + '\n')
  return 0
}

if (require.main === module) process.exitCode = main(process.argv.slice(2))

module.exports = { check }
