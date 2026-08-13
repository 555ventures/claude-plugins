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

// PRAX-20260813-01: the MISCITED self-consistency guard above (6.37.0) has no counterpart on the
// SANCTIONED kill path, and nothing in the workflow mechanically audits killed[] label↔evidence
// consistency after the verifier returns. Incident: prax review wf_5a730ede-0f8 returned
// killedBy:"sanction" while its own structured evidence field read "Not actually sanctioned —
// correcting: the claim stands unrefuted" — only the structured `result` label feeds verdict.js,
// so the self-contradiction was invisible to the derivation and the workflow returned CLEAN on a
// real, unrefuted finding. Two gaps, two tests: the SANCTIONED prompt step needs the same
// self-consistency guard MISCITED already has; and the workflow needs a mechanical post-verify
// audit so a killed[] entry whose own evidence text contradicts its killedBy label cannot ride
// through silently even if a prompt-level guard is someday bypassed or misapplied.

const sanctionedStep = src.slice(src.indexOf('2. SANCTIONED'), src.indexOf('3. If the claim cannot'))

test('SANCTIONED guard: evidence that denies or fails to quote a sanctioning row forbids returning SANCTIONED', () => {
  assert.notStrictEqual(sanctionedStep, '',
    'could not locate the SANCTIONED step in verifyPrompt — the extraction markers ' +
    '"2. SANCTIONED" / "3. If the claim cannot" no longer bound it; update the slice markers')
  assert.match(sanctionedStep, /SANCTIONED is forbidden/,
    'the SANCTIONED step carries no self-consistency guard mirroring MISCITED\'s: a verifier can ' +
    'quote evidence that plainly denies a sanction (or fails to quote an actual sanctioning ' +
    'Decision/design-approval row) and still return result="SANCTIONED" — exactly the prax ' +
    'wf_5a730ede-0f8 incident (killedBy:"sanction", evidence: "Not actually sanctioned — ' +
    'correcting: the claim stands unrefuted"), because nothing in the prompt makes that ' +
    'self-contradiction something the model must resolve before answering')
})

// Scope the audit check to the actual control-flow region (from the panel phase onward) —
// the header comment above verifyPrompt uses the word "audit" loosely ("execution-audited",
// "replaces refute+audit outright") describing the OLD refutation layer this phase replaced,
// which would make a whole-file regex match vacuously without ever seeing a real mechanism.
const executionRegion = src.slice(src.indexOf('// ---- Phase: blind review panel'))

test('the workflow mechanically audits killed[] label-evidence consistency instead of trusting the structured result alone', () => {
  assert.notStrictEqual(executionRegion, '',
    'could not locate the "// ---- Phase: blind review panel" marker that bounds the execution ' +
    'region away from the header comment\'s unrelated use of "audit" — update the slice marker')
  assert.match(executionRegion, /audit|resurrect/i,
    'nothing in wf-review.body.js\'s actual control flow (panel phase onward) checks a killed ' +
    'finding\'s own evidence text against its killedBy label after the verifier returns — only ' +
    'the structured `result` enum feeds verdict.js, so a verifier whose evidence contradicts its ' +
    'own label (prax wf_5a730ede-0f8: killedBy:"sanction" evidence denying the sanction) is ' +
    'killed silently with no mechanical check to resurrect or flag the contradiction before the ' +
    'workflow returns')
})
