'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

// specs/20260904/01-commit-time-escape-coverage.md — shared fixtures for commit-mode.test.js,
// window-mode.test.js, and fleet-mode.test.js (review finding s2: the three files carried
// byte-identical copies of writeSpec/appendLedger/commitAt). commitAt returns the new commit's
// sha (commit-mode.test.js's superset behavior); window-mode.test.js and fleet-mode.test.js's
// call sites all discard the return value, so this is not a behavior change for them.

function writeSpec(dir, relPath, filePlanPaths) {
  const abs = path.join(dir, relPath)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  const rows = filePlanPaths.map(p => `| ${p} | MODIFY | src | . |`).join('\n')
  fs.writeFileSync(abs, '---\ndate: 2026-08-01\n---\n\n# spec\n\n## File Plan\n\n' +
    '| Path | Action | Layer | Summary |\n|---|---|---|---|\n' + rows + '\n')
}

function appendLedger(dir, rows) {
  const claudeDir = path.join(dir, '.claude')
  fs.mkdirSync(claudeDir, { recursive: true })
  fs.appendFileSync(path.join(claudeDir, 'spec-runs.jsonl'),
    rows.map(r => JSON.stringify(r)).join('\n') + '\n')
}

function commitAt(dir, relPath, content, isoDate, subject) {
  const abs = path.join(dir, relPath)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
  execFileSync('git', ['-C', dir, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', subject], {
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate },
  })
  return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

module.exports = { writeSpec, appendLedger, commitAt }
