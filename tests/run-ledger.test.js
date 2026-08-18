'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { SPEC, tmpdir, gitRepo } = require('./helpers')

const read = (p) => fs.readFileSync(path.join(SPEC, p), 'utf8')

// The run ledger is ONE repo-wide file (.claude/spec-runs.jsonl), never per-spec files in
// specs/ — pinned after the clutter objection that shaped the design. v7.0.0 slimmed this
// file to the behavioral core: row-shape derivation is pinned by execution in
// tests/review/verdict.test.js, not by regexing command prose.

const LEDGER = '.claude/spec-runs.jsonl'

test('build, review, escape, and release all append to the single repo-wide ledger', () => {
  for (const f of ['commands/build.md', 'commands/review.md', 'commands/escape.md', 'commands/release.md']) {
    assert.match(read(f), new RegExp(LEDGER.replace(/[./]/g, '\\$&')),
      `${f} must reference ${LEDGER} — a stage that stops writing ledger rows silently drops ` +
      'out of the durable cost/verdict history')
  }
})

test('no per-spec ledger files: nothing instructs writing runs files under specs/', () => {
  for (const f of fs.readdirSync(path.join(SPEC, 'commands'))) {
    if (!f.endsWith('.md')) continue
    assert.doesNotMatch(read(path.join('commands', f)), /specs\/[^\s`]*\.runs\./,
      `commands/${f} must not create per-spec run files`)
  }
})

test('review never hand-writes the verdict word — verdict.js is the sole derivation', () => {
  const review = read('commands/review.md')
  assert.match(review, /derived by `verdict\.js`, never asserted in prose/,
    'review.md must state that the verdict word is script-derived — the 2026-08-05 incident ' +
    'was a CLEAN printed with nothing executed')
  assert.match(review, /Never hand-write the word/,
    'the ledger row must be the verbatim verdict.js --ledger line, never hand-assembled')
})

test('init sets the union merge driver for the ledger', () => {
  assert.match(read('commands/init.md'), /\.claude\/spec-runs\.jsonl merge=union/)
})

test('union driver resolves concurrent worktree appends under squash merge', () => {
  const root = fs.realpathSync(tmpdir('ledger'))
  gitRepo(root)
  const git = (...a) => spawnSync('git', a, { cwd: root, encoding: 'utf8' })
  const ledger = path.join(root, '.claude/spec-runs.jsonl')
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.gitattributes'), '.claude/spec-runs.jsonl merge=union\n')
  fs.writeFileSync(ledger, '{"spec":"base"}\n')
  git('add', '-A'); git('commit', '-qm', 'base')
  const main = git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim()
  git('checkout', '-qb', 'specB')
  fs.appendFileSync(ledger, '{"spec":"b"}\n')
  git('commit', '-qam', 'b')
  git('checkout', '-q', main)
  fs.appendFileSync(ledger, '{"spec":"c"}\n')
  git('commit', '-qam', 'c')
  const merge = git('merge', '--squash', 'specB')
  assert.strictEqual(merge.status, 0, merge.stderr)
  const lines = fs.readFileSync(ledger, 'utf8').trim().split('\n')
  assert.deepStrictEqual(lines.sort(), ['{"spec":"b"}', '{"spec":"base"}', '{"spec":"c"}'])
})
