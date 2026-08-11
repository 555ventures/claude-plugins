'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('../helpers')

// 2026-08-10 stale-reference sweep (spec 20260810/09-stale-reference-sweep): twelve doctrine
// passages reference mechanisms that were retired, scripts that behave differently, or
// headings that don't exist — each one misdirects a fresh session that takes the text at
// face value. This file pins the corrections (D1, D2, D3, D5, D8, D11 — the non-checker
// half of the sweep; D9's citations-check.js is pinned in citations-check.test.js).

function section(src, startHeading, endHeading) {
  const start = src.indexOf(startHeading)
  if (start === -1) throw new Error('heading not found: ' + startHeading)
  const from = start + startHeading.length
  const end = endHeading ? src.indexOf(endHeading, from) : src.length
  if (endHeading && end === -1) throw new Error('end heading not found: ' + endHeading)
  return src.slice(from, end === -1 ? src.length : end)
}

// ---------------------------------------------------------------------------
// AC-20260810-09-7 — D1: workspace knob + T3 checkpoint grounding removed; branch-rule
// attribution moved off /spec:build
// ---------------------------------------------------------------------------

test('AC-20260810-09-7: init.md no longer generates the "workspace" build config knob', () => {
  const init = read('spec/commands/init.md')
  assert.doesNotMatch(init, /"build":\s*\{\s*"workspace":\s*"ask"\s*\}/,
    'init.md must stop generating "build": {"workspace": "ask"} — the knob is read by ' +
    'nothing (D1), so a fresh host is still being configured with a dead mechanism')
  assert.doesNotMatch(init, /\/spec:build's worktree workspace/,
    'the companion prose describing "/spec:build\'s worktree workspace" prompt must be ' +
    'deleted alongside the knob it describes — leftover prose with no generated field ' +
    'behind it is its own stale reference')
})

test('AC-20260810-09-7: init.md\'s grounding checklist no longer mentions "T3 checkpoint surfaces"', () => {
  const init = read('spec/commands/init.md')
  assert.doesNotMatch(init, /T3 checkpoint/,
    'init.md must drop "T3 checkpoint surfaces" from its grounding checklist — mandatory ' +
    'checkpoints were retired in v5 (shared.md § Model Placement, scaffold ledger RETIRED ' +
    'row), so every new host was being told to document a mechanism nothing consumes')
})

test('AC-20260810-09-7: enter-worktree.md attributes the branch rule to itself/merge-back create, never to a rule "/spec:build uses"', () => {
  const ew = read('git/commands/enter-worktree.md')
  assert.doesNotMatch(ew, /the same branch rule `\/spec:build` uses/,
    'enter-worktree.md must stop attributing the branch rule to "/spec:build" — build.md has ' +
    'no branch rule at all (it disowns all worktree mechanics per D1), so this sends a ' +
    'reader looking for a rule in a file that does not define one')
})

// ---------------------------------------------------------------------------
// AC-20260810-09-8 — D3: "refutation filter" renamed to execution-grounded verification
// ---------------------------------------------------------------------------

test('AC-20260810-09-8: review.md, doctor.md, and escape.md contain zero occurrences of "refutation filter"', () => {
  const review = read('spec/commands/review.md')
  const doctor = read('spec/commands/doctor.md')
  const escape = read('spec/commands/escape.md')
  assert.doesNotMatch(review, /refutation filter/i,
    'review.md must rename every "refutation filter" mention to the live mechanism name ' +
    '(execution-grounded verification, D3) — argument-based refutation was retired and the ' +
    'stale name misdescribes the ledger\'s strongest re-tuning signal')
  assert.doesNotMatch(doctor, /refutation filter/i,
    'doctor.md check 12\'s killedMatch gloss must rename "refutation filter" per D3')
  assert.doesNotMatch(escape, /refutation filter/i,
    'escape.md must rename "refutation filter" per D3')
})

test('AC-20260810-09-8: review.md, doctor.md, and escape.md each describe execution-grounded verification alongside killedMatch', () => {
  const review = read('spec/commands/review.md')
  const doctor = read('spec/commands/doctor.md')
  const escape = read('spec/commands/escape.md')
  assert.match(review, /execution-grounded/i,
    'review.md must describe the live mechanism as "execution-grounded" (D3\'s replacement ' +
    'name), not merely delete the old name and leave the mechanism unnamed')
  assert.match(doctor, /execution-grounded/i,
    'doctor.md must describe the live mechanism as "execution-grounded" alongside its ' +
    '`killedMatch` gloss')
  assert.match(escape, /execution-grounded/i,
    'escape.md must describe the live mechanism as "execution-grounded"')
  assert.match(doctor, /killedMatch/,
    'doctor.md must keep the `killedMatch` field name — it is wire-compatible and stays per ' +
    'D3, only the prose gloss around it is renamed')
})

// ---------------------------------------------------------------------------
// AC-20260810-09-9 — D4: grounding-contract.md gains design.copyCatalogs; init.md runtime
// example gains stopSignal
// ---------------------------------------------------------------------------

test('AC-20260810-09-9: grounding-contract.md documents design.copyCatalogs as REQUIRED for i18n hosts', () => {
  const contract = read('spec/templates/grounding-contract.md')
  const idx = contract.search(/copyCatalogs/)
  assert.notStrictEqual(idx, -1,
    'grounding-contract.md has no `copyCatalogs` entry — the design stage depends on this ' +
    'key (init.md generates it, wf-design consumes it) but the audited authority (the ' +
    'contract doctor check 1 checks against) never documented it')
  const nearby = contract.slice(Math.max(0, idx - 300), idx + 300)
  assert.match(nearby, /REQUIRED/,
    'the design.copyCatalogs contract entry must be marked REQUIRED for i18n hosts (D4), or ' +
    'a fresh init run has no obligation to generate it')
  assert.match(nearby, /i18n/i,
    'the design.copyCatalogs contract entry must scope the requirement to i18n hosts (D4)')
})

test('AC-20260810-09-9: init.md\'s runtime config example mentions stopSignal', () => {
  const init = read('spec/commands/init.md')
  assert.match(init, /stopSignal/,
    'init.md\'s runtime example must gain the stopSignal line the contract already defines ' +
    '(D4) — otherwise a session authoring a runtime block from the example alone omits a ' +
    'documented contract key')
})

// ---------------------------------------------------------------------------
// AC-20260810-09-10 — D5: ledger ts templates move from <YYYY-MM-DD> to ISO-8601 in all four
// carriers
// ---------------------------------------------------------------------------

test('AC-20260810-09-10: review.md, release.md, escape.md, and build.md ledger templates contain zero "ts":"<YYYY-MM-DD>" literals', () => {
  const review = read('spec/commands/review.md')
  const release = read('spec/commands/release.md')
  const escape = read('spec/commands/escape.md')
  const build = read('spec/commands/build.md')
  for (const [name, src] of [['review.md', review], ['release.md', release],
    ['escape.md', escape], ['build.md', build]]) {
    assert.doesNotMatch(src, /"ts":"<YYYY-MM-DD>"/,
      `${name}'s ledger template still carries the stale "ts":"<YYYY-MM-DD>" literal — ` +
      'verdict.js writes toISOString() (executed evidence) and the two hand-appended ' +
      'carriers must steer the same shape, or one append-only ledger holds two timestamp ' +
      'formats (D5)')
  }
})

test('AC-20260810-09-10: review.md, release.md, escape.md, and build.md ledger templates each carry a "ts":"<ISO-8601>" placeholder', () => {
  const review = read('spec/commands/review.md')
  const release = read('spec/commands/release.md')
  const escape = read('spec/commands/escape.md')
  const build = read('spec/commands/build.md')
  for (const [name, src] of [['review.md', review], ['release.md', release],
    ['escape.md', escape], ['build.md', build]]) {
    assert.match(src, /"ts":"<ISO-8601>"/,
      `${name}'s ledger template must replace the stale date-only placeholder with ` +
      '"ts":"<ISO-8601>" (D5), matching what verdict.js actually writes')
  }
})

// ---------------------------------------------------------------------------
// AC-20260810-09-11 — D8: genesis.md explore enum gains positions-authored; escape.md
// observe-row fields are top-level, not in note
// ---------------------------------------------------------------------------

test('AC-20260810-09-11: spec/doctrine/genesis.md\'s explore state enum includes positions-authored', () => {
  const genesis = read('spec/doctrine/genesis.md')
  const stateMachine = section(genesis, '## Genesis: State Machine', '##')
  assert.match(stateMachine, /positions-authored/,
    'the explore state enum in § Genesis: State Machine must include the intermediate state ' +
    '`positions-authored` (D8) — both this file and genesis-explore.md already mandate ' +
    'writing it, but the enum a session checks state against omits it')
})

test('AC-20260810-09-11: escape.md describes the observe row\'s branch/sha/url as top-level fields, not nested in note', () => {
  const escape = read('spec/commands/escape.md')
  assert.doesNotMatch(escape, /carrying `branch`\/`sha`\/`url` in its `note`/,
    'escape.md must stop claiming the observe row carries branch/sha/url "in its note" — ' +
    'observe-ci.js writes them as top-level fields; only the --next oracle entry uses note ' +
    '(D8), and the stale claim sends a reader parsing the wrong field')
})

// ---------------------------------------------------------------------------
// AC-20260810-09-12 — doctor.md check 12's observe-row tier/runId exemption survives D3's
// rename untouched
// ---------------------------------------------------------------------------

test('AC-20260810-09-12: doctor.md check 12 continues to exempt observe rows from tier/runId requirements after D3\'s rename lands in the same check', () => {
  const doctor = read('spec/commands/doctor.md')
  const check12 = section(doctor, '12. **Run ledger hygiene**', '13. **Scaffold audit**')
  assert.match(check12, /`observe`\s*rows\s*\(no\s*`tier`\/`runId`/,
    'doctor.md check 12 must continue to exempt `observe` rows (no tier/runId — they carry ' +
    'branch/ci/sha/url/runAt instead) from the required-field expectations — D3\'s ' +
    '"refutation filter" rename touches nearby text in this same check and must not disturb ' +
    'spec 08\'s check-12 exemption wording')
  assert.doesNotMatch(check12, /refutation filter/i,
    'D3\'s rename must actually land inside check 12 (the killedMatch gloss sits in the same ' +
    'section as the observe-row exemption this test guards) — a check 12 that still says ' +
    '"refutation filter" means the rename and the exemption were never verified together')
})
