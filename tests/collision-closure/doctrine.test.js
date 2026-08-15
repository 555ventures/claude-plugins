'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('../helpers')

// specs/20260814/05-collision-closure.md (2026-08-14): D7/D8 replace two hand-executed prose
// sweeps with pointers to spec/scripts/collision-closure.js — plan.md Phase 4 step 2's fifth
// obligation shape (the stem-level-grep sentence) and spec-pipeline.md § Gotchas' colliding-pin
// bullet. Both loci are pinned here by regex over read() content (doctrine mode) so a rewrite
// that keeps the old hand-grep wording, or drops a required citation, reddens instead of
// drifting silently — the same class of failure this spec exists to close (specs/20260813/07
// D8, specs/20260813/09 D4, specs/20260814/01's spec-paths key-set collision).

const plan = read('spec/commands/plan.md')
const gotchas = read('.claude/rules/spec-pipeline.md')

test('AC-20260814-05-10: plan.md Phase 4 step 2 names spec-paths collision-closure --literal as the fifth obligation shape\'s carrier, carries the enforcedBy marker, and drops the hand-executed stem-level-grep instruction', () => {
  assert.match(plan, /spec-paths collision-closure/,
    'plan.md must name `spec-paths collision-closure` as the fifth obligation shape\'s carrier ' +
    '(D7) — without it the retiring-doctrine-prose sweep is still hand-executed prose')
  assert.match(plan, /--literal/,
    'the invocation line must pass --literal per retired stem (D7, D2) — the fifth shape needs ' +
    'the literals leg, not the paths leg alone')
  assert.match(plan, /enforcedBy:\s*spec\/scripts\/collision-closure\.js/,
    'the fifth obligation shape must carry the `enforcedBy: spec/scripts/collision-closure.js` ' +
    'marker (D7) — the shape ac-matrix.js established for review.md steps 5-6')
  assert.doesNotMatch(plan, /stem-level grep/,
    'the literal words "stem-level grep" must be gone from plan.md — D7 replaces the ' +
    'hand-executed grep instruction with the script invocation, it does not add a pointer next ' +
    'to the prose that already failed three times')
})

test('AC-20260814-05-11: spec-pipeline.md § Gotchas states the colliding-pin bullet as two named mechanisms, drops the hand-executed grep instruction, and cites all three recurrences by spec path', () => {
  const bulletStart = gotchas.indexOf('A locked Decision that retires or narrows a literal glyph')
  assert.notStrictEqual(bulletStart, -1,
    'the colliding-pin Gotcha bullet must still exist under its recognizable opening — D8 ' +
    'rewrites the bullet in place, it does not delete it')
  const nextBulletMarker = '`ac-matrix.js` parses AC bullets'
  const nextIdx = bulletStart === -1 ? -1 : gotchas.indexOf(nextBulletMarker, bulletStart)
  const bullet = bulletStart === -1
    ? ''
    : gotchas.slice(bulletStart, nextIdx === -1 ? gotchas.length : nextIdx)

  assert.match(bullet, /collision-closure/,
    'the rewritten bullet must name collision-closure — the lock-time mechanism that now catches ' +
    'the naming-collision variant of this class (D8)')
  assert.match(bullet, /whole-suite check|build Phase 4/i,
    'the rewritten bullet must also name spec 03 D10\'s blocking whole-suite check at build ' +
    'Phase 4 — the only mechanism that catches the behavioral variant (D8)')
  assert.doesNotMatch(bullet, /At plan time, grep/,
    'the hand-executed "At plan time, grep `tests/` ... case-insensitively" recipe must be gone ' +
    'from the bullet — it collapses to a pointer plus its evidence, not prose left standing next ' +
    'to the prose that failed (D8)')
  assert.match(bullet, /specs\/20260813\/07/,
    'the bullet must continue to cite the first recurrence, specs/20260813/07, verbatim (D8)')
  assert.match(bullet, /specs\/20260813\/09/,
    'the bullet must continue to cite the second recurrence, specs/20260813/09, verbatim (D8)')
  assert.match(bullet, /specs\/20260814\/01/,
    'the bullet must gain a third citation, specs/20260814/01 (the spec-paths key-set collision) ' +
    '— at HEAD it cites only the first two, and D8 requires all three (D8)')
})
