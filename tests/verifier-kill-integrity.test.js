'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// CROSS-20260804-01: the wf-review verifier's MISCITED step can kill a real finding on thin
// grounds — a wrong line number alone (when the claim's substance IS in the file elsewhere), a
// CWD that landed in a stale .claude/worktrees checkout instead of the review target, or a
// structured result whose own quoted evidence actually confirms the claim rather than refuting
// it. Each is a false-kill mechanism the 2026-07 ledger measurement (verifyPrompt's own header
// comment) was built to keep out. Fix contract: MISCITED gets three explicit guards naming each
// failure mode, so the model cannot rule MISCITED from a narrow read.

const src = read('spec/workflows/src/wf-review.body.js')

test('MISCITED guard: a wrong line number alone never proves miscitation without a whole-file search', () => {
  assert.match(src, /A wrong line number alone is never a miscitation/,
    'without this guard the verifier can rule MISCITED the moment the cited line is off by one, ' +
    'even when the claimed content exists elsewhere in the same file — a real finding gets killed ' +
    'on a citation typo instead of being checked against the whole file')
})

test('MISCITED guard: nonexistence claims require proving the working tree is the actual review target', () => {
  assert.match(src, /stale/,
    'an agent whose CWD landed in a stale .claude/worktrees checkout can honestly report a path ' +
    "does not exist there and rule MISCITED, when the real review target's file is untouched — " +
    'the guard must require a sanity-check (e.g. git log -1) proving the tree under inspection is the target')
  assert.match(src, /worktree/,
    'the nonexistence guard must name worktrees specifically as the mechanism that produces a ' +
    'false MISCITED, not just gesture at "the wrong directory"')
})

test('MISCITED guard: quoted evidence that confirms the claim forbids ruling MISCITED', () => {
  assert.match(src, /if the evidence you quote confirms the claim's substance, MISCITED is forbidden/,
    'without this self-consistency guard a verifier can quote evidence that plainly supports the ' +
    'finding and still return MISCITED, because nothing in the prompt makes that a contradiction ' +
    'it must resolve before answering')
})
