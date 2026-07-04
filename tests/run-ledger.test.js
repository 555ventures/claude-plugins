'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC } = require('./helpers')

const read = (p) => fs.readFileSync(path.join(SPEC, p), 'utf8')

// The run ledger is ONE repo-wide file (.claude/spec-runs.jsonl), never per-spec
// files in specs/ — pinned after the clutter objection that shaped the design.

const LEDGER = '.claude/spec-runs.jsonl'

test('build.md and review.md both append to the single repo-wide ledger', () => {
  for (const f of ['commands/build.md', 'commands/review.md']) {
    const text = read(f)
    assert.match(text, new RegExp(LEDGER.replace(/[./]/g, '\\$&')), `${f} references ${LEDGER}`)
    assert.match(text, /exactly ONE line/, `${f} enforces one-line appends`)
    assert.match(text, /never (prose|finding text)/i, `${f} bans prose in entries`)
  }
})

test('ledger schemas carry the fields the 3.1.0 design consumes', () => {
  const build = read('commands/build.md')
  for (const field of ['"ts"', '"spec"', '"stage":"build"', '"tokens"', 'phase4Repairs',
    'failureSetShrankEachRound', '"retainer"', 'checkpoints']) {
    assert.ok(build.includes(field), `build schema has ${field}`)
  }
  const review = read('commands/review.md')
  for (const field of ['"ts"', '"stage":"review"', '"verdict"', '"iteration"',
    '"survived"', '"killed"', '"reviewerCount"']) {
    assert.ok(review.includes(field), `review schema has ${field}`)
  }
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
})
