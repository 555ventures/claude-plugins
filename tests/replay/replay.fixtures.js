'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, gitRepo } = require('../helpers')

// specs/20260908/03-test-fixture-dedupe.md D4: the --setup --overlay host skeleton shared by
// AC-20260831-01-1..5 in tests/replay/replay.test.js — a git repo with a parent commit and a
// close commit built from explicit {path: content|null} maps, plus a not-yet-created scratch
// worktree dir path. Each caller keeps its own runNode call and assertions; only this setup moves.

// Build a commit whose content is exactly the given {path: content|null} map (null deletes a
// path that must already exist). Copied from replay.test.js's own commitFiles — this module
// cannot require a *.test.js file for it.
function commitFiles(root, files, msg) {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel)
    if (content === null) {
      fs.unlinkSync(full)
    } else {
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, content)
    }
  }
  execFileSync('git', ['-C', root, 'add', '-A'])
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', msg])
  return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

// `root` may already be a git repo (a caller that needs to inspect it pre-setup, e.g. to capture
// `git status --porcelain` before calling in) — only init one when `root` isn't one yet, since
// gitRepo() re-seeding an already-seeded, unchanged working tree fails on "nothing to commit".
function setupOverlayHost(root, { parentFiles, closeFiles }) {
  if (!fs.existsSync(path.join(root, '.git'))) gitRepo(root)
  const parent = commitFiles(root, parentFiles, 'parent commit')
  const close = commitFiles(root, closeFiles, 'close commit')
  const dir = path.join(fs.realpathSync(tmpdir('replay-overlay-wt')), 'wt')
  return { parent, close, dir }
}

module.exports = { setupOverlayHost }
