'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { SPEC, tmpdir, gitRepo } = require('./helpers')

const read = (p) => fs.readFileSync(path.join(SPEC, p), 'utf8')

// The run ledger is ONE repo-wide file (.claude/spec-runs.jsonl), never per-spec
// files in specs/ — pinned after the clutter objection that shaped the design.

const LEDGER = '.claude/spec-runs.jsonl'

test('build.md and review.md both append to the single repo-wide ledger', () => {
  for (const f of ['commands/build.md', 'commands/review.md']) {
    const text = read(f)
    assert.match(text, new RegExp(LEDGER.replace(/[./]/g, '\\$&')), `${f} references ${LEDGER}`)
    assert.match(text, /exactly ONE line/, `${f} enforces one-line appends`)
    assert.match(text, /never\s+(prose|finding text)/i, `${f} bans prose in entries`)
  }
})

test('ledger schemas carry the fields the v5 design consumes', () => {
  const build = read('commands/build.md')
  for (const field of ['"ts"', '"spec"', '"stage":"build"', '"diff"', '"tokens"',
    'phase4Repairs', 'failureSetShrankEachRound', '"retainer"', '"fastPath"', '"deviations"']) {
    assert.ok(build.includes(field), `build schema has ${field}`)
  }
  assert.ok(!build.includes('"checkpoints"'),
    'build schema must not carry the retired checkpoints field')
  const review = read('commands/review.md')
  for (const field of ['"ts"', '"stage":"review"', '"runId"', '"verdict"', '"scope"', '"iteration"',
    '"survived"', '"killed"', '"waived"', '"rejected"', '"fixDispatched"', '"reviewerCount"',
    '"verify"', '"demonstrated"', '"capSkipped"']) {
    assert.ok(review.includes(field), `review schema has ${field}`)
  }
  assert.match(review, /never write `CLEAN` on a row whose\s*\n?`survived` is non-zero/,
    'the CLEAN-with-survivors schema hole must stay closed')
  // dispositions must be knowable when the row is written
  assert.match(review, /\*\*after\*\* the survivor\s+dispositions/)
})

test('escape rows: /spec:escape records defects that got past review', () => {
  const esc = read('commands/escape.md')
  assert.match(esc, new RegExp(LEDGER.replace(/[./]/g, '\\$&')), 'escape appends to the one ledger')
  assert.match(esc, /exactly ONE line/)
  assert.match(esc, /never prose or finding text/i)
  for (const field of ['"stage":"escape"', '"reviewRunId"', '"foundBy"', 'later-spec',
    '"killedMatch"', '"severity"', '"file"']) {
    assert.ok(esc.includes(field), `escape schema has ${field}`)
  }
  // unknown is null, never a guessed false — killedMatch is the signal that tunes the filter
  assert.match(esc, /never a guessed/i)
  // escapes record, never fix — the command must not become a repair entry point
  assert.match(esc, /fixes nothing|not a fix/i)
  // review rows must carry the runId that escape rows point back at
  assert.match(read('commands/review.md'), /"runId":"<wf_/)
})

test('doctor aggregates escapes: contradicted CLEANs and killedMatch flags', () => {
  const doctor = read('commands/doctor.md')
  assert.match(doctor, /build \| review \| escape/, 'ledger stage enum includes escape')
  assert.match(doctor, /killedMatch/)
  assert.match(doctor, /contradicted CLEAN/i)
  // zero escapes is only evidence when escapes are being recorded at all
  assert.match(doctor, /zero escape rows exist/i)
})

test('no per-spec ledger files: nothing instructs writing runs files under specs/', () => {
  for (const f of fs.readdirSync(path.join(SPEC, 'commands'))) {
    if (!f.endsWith('.md')) continue
    assert.doesNotMatch(read(path.join('commands', f)), /specs\/[^\s`]*\.runs\./,
      `commands/${f} must not create per-spec run files`)
  }
})

test('doctor covers ledger hygiene', () => {
  const doctor = read('commands/doctor.md')
  assert.match(doctor, /spec-runs\.jsonl/)
  assert.match(doctor, /prose leak/)
  assert.match(doctor, /merge=union|reports `union`/)
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
