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
  // 2026-08-14 (JJ-20260814-01, user ruling): the hole is CLEAN with an UNDISPOSITIONED
  // survivor. The old wording said "survived is non-zero", which verdict.js contradicts on
  // every waive-closed review — retargeted to the accurate statement, same hole.
  assert.match(review, /never write `CLEAN` while any survivor is undispositioned/,
    'the CLEAN-with-undispositioned-survivors schema hole must stay closed')
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

test('release rows: /spec:release appends one prose-free row and never promotes autonomously', () => {
  const rel = read('commands/release.md')
  assert.match(rel, new RegExp(LEDGER.replace(/[./]/g, '\\$&')), 'release appends to the one ledger')
  assert.match(rel, /exactly\s+ONE line/)
  assert.match(rel, /never prose/i)
  for (const field of ['"stage":"release"', '"briefs"', '"staging"', '"e2e"', '"journeys"',
    '"substrate"', '"production"']) {
    assert.ok(rel.includes(field), `release schema has ${field}`)
  }
  assert.match(rel, /never push/i)
  assert.match(rel, /never autonomous/i, 'production promotion stays behind per-run confirmation')
  assert.match(rel, /Never promote over a red staging/i)
})

test('escape rows carry the prevention delta — the loop-closing field', () => {
  const esc = read('commands/escape.md')
  assert.ok(esc.includes('"preventedBy"'), 'escape schema has preventedBy')
  assert.match(esc, /doctrine\|enforcer\|review-check\|runtime-leg\|none/)
  assert.match(esc, /`none` is a real answer, never a\s+default/i)
})

test('AC-20260813-02-7: review rows carry the executed-leg fields: smoke verdict and skip count — the "testsSkipped" key survives the D2 scalar-to-object shape change', () => {
  const review = read('commands/review.md')
  assert.ok(review.includes('"smoke"'), 'review schema has smoke')
  assert.ok(review.includes('"testsSkipped"'), 'review schema has testsSkipped')
  assert.match(review, /a skip is not a pass/i)
  assert.match(review, /boot smoke leg green/i, 'CLEAN requires the smoke leg')
})

test('doctor aggregates escapes: contradicted CLEANs and killedMatch flags', () => {
  const doctor = read('commands/doctor.md')
  assert.match(doctor, /build \| review \| escape/, 'ledger stage enum includes escape')
  assert.match(doctor, /killedMatch/)
  assert.match(doctor, /contradicted CLEAN/i)
  // zero escapes is only evidence when escapes are being recorded at all
  assert.match(doctor, /zero escape rows exist/i)
})

test('AC-20260805-03-D1: doctor check 12 pins the full five-value ledger stage enum, not a substring that stays green if observe is silently dropped', () => {
  // specs/20260805/03-done-unobserved-observation.md D1 (2026-08-06 review): D1 extended
  // doctor.md's ledger stage enum to add `observe` (build | review | escape | observe | release).
  // The prior pin here (`/build \| review \| escape/`) is a substring match that would stay
  // green even if `observe` were silently dropped from the enum — it does not prove `observe`
  // is present. This test pins the complete five-value enum verbatim.
  const doctor = read('commands/doctor.md')
  assert.match(doctor, /build \| review \| escape \| observe \| release/,
    'doctor.md must document the full five-value ledger stage enum including `observe` — a ' +
    'substring match on `build | review | escape` alone would not catch `observe` being dropped')
})

test('no per-spec ledger files: nothing instructs writing runs files under specs/', () => {
  for (const f of fs.readdirSync(path.join(SPEC, 'commands'))) {
    if (!f.endsWith('.md')) continue
    assert.doesNotMatch(read(path.join('commands', f)), /specs\/[^\s`]*\.runs\./,
      `commands/${f} must not create per-spec run files`)
  }
})

test('AC-20260805-02-8: review ledger rows carry the D5 derived-verdict enum and a legs array, retiring the SURVIVORS mapping', () => {
  // specs/20260805/02-review-evidence-manifest.md D5: the ledger verdict enum becomes the
  // derived set CLEAN|FINDINGS|HARD_FINDINGS|REVIEWER_FAILED|UNVERIFIED|GATE_RED, and the row
  // gains a "legs" array mirroring the evidence manifest — both sourced from verdict.js
  // --ledger, never asserted independently. The undocumented SURVIVORS mapping is retired.
  const review = read('commands/review.md')
  assert.doesNotMatch(review, /"verdict":"<CLEAN\|SURVIVORS\|REVIEWER_FAILED>"/,
    'the old CLEAN|SURVIVORS|REVIEWER_FAILED enum documentation must be gone — SURVIVORS was an ' +
    'undocumented mapping this spec retires (D5)')
  // specs/20260813/10-host-capabilities.md D4 widened the enum with CLEAN-with-qualifier (the
  // review profile can now derive the release profile's qualified word). The pin follows the
  // documented enum verbatim, exactly as its own consequence message demands.
  assert.match(review, /CLEAN\|CLEAN-with-qualifier\|FINDINGS\|HARD_FINDINGS\|REVIEWER_FAILED\|UNVERIFIED\|GATE_RED/,
    'the review ledger schema must document the new derived-verdict enum verbatim — a consumer ' +
    'matching against the old enum would silently drop every new-word row')
  assert.ok(review.includes('"legs":['),
    'the review ledger row schema must document a "legs" array field (mirroring the evidence ' +
    'manifest\'s leg+exit pairs) — without it the ledger can\'t show which legs backed the verdict')
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
