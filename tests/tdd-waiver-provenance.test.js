'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// JJ-20260816-02 (2026-08-16, tdd-waiver provenance): wf-build's `tdd: false` arg is an
// all-or-nothing escape hatch with no scope, no provenance, and no evidence record.
// Incident (prax spec 20260815/07 build 2026-08-15, surfaced at that spec's review
// 2026-08-16): tdd-red-check returned 4 `not-collected` mismatches on files the run's own
// probe agent had reported correctly RED (the JJ-20260815-07 load-attribution class: two red
// by TS2305 on a not-yet-written export, two by TS2307 on a File-Plan-CREATE module). The
// orchestrator hand-verified red state from verbatim typecheck diagnostics and advanced with
// `tdd: false` — the ONLY lever the args contract offers. Spec 20260815/06 reduces how often
// the lever is reached for but does not touch the lever itself. Three gaps, one pin each:
//   (i)   SCOPE — `tdd: false` discards the red-check for every remaining batch of the run,
//         not just the files actually adjudicated, though `resolutions: {batchId: token}`
//         already establishes the per-unit waiver shape the arg could reuse.
//   (ii)  PROVENANCE — a run that disarmed the red-first evidence floor is byte-
//         indistinguishable in its returned artifact from one that enforced it, so
//         /spec:review cannot know the TDD guarantee was waived on the diff it reviews.
//   (iii) EVIDENCE — nothing requires the hand-verification that justified the waiver to be
//         recorded where the next reader finds it (in the incident it survived only because
//         the build author chose to write a deviations sidecar entry).
//
// These pins are RED at HEAD — an open intake item, sanctioned in .claude/suite-baseline.json.
// They pin the invariant, not a design: any fix that scopes the waiver to the adjudicated
// unit, echoes it in the returned artifact, and prices it at an evidence record goes green.
// The fix's build retags them with its AC-IDs and tightens them to the landed shape.
//
// What this pin deliberately does NOT do: assert a field name, args-schema shape, or ledger
// surface for the waiver — that is the fix spec's Decisions table to write; a carrier that
// over-specifies the design would fight the spec that closes it.

const src = read('spec/workflows/src/wf-build.body.js')

test('JJ-20260816-02: the TDD red-check waiver is scoped to the adjudicated unit, never the whole run', () => {
  assert.match(src, /waiv/i,
    'the only lever the args contract offers is the run-global `tdd: boolean` — waiving the ' +
    'red-first floor for the handful of files a human actually adjudicated silently discards ' +
    'the red-check for every remaining batch of the run; no waiver vocabulary exists in the ' +
    'workflow source at all, so a narrower scope cannot even be expressed')
})

test('JJ-20260816-02: a run that waived the red-first evidence floor says so in its returned artifact', () => {
  assert.match(src,
    /return \{\s*stage: loopResult\.pass \? 'complete' : 'gate-exhausted',[^}]*(tdd|waiv)/i,
    'the terminal return object carries no trace of the tdd lever — a run that disarmed the ' +
    'red-first evidence floor is byte-indistinguishable in its returned artifact from one ' +
    'that enforced it, so /spec:review signs a CLEAN over a diff whose TDD guarantee was ' +
    'silently waived and no ledger row records the waiver')
})

test('JJ-20260816-02: waiving the red-first floor costs an evidence record, not a boolean', () => {
  assert.match(src, /waiv[\s\S]{0,400}?evidence|evidence[\s\S]{0,400}?waiv/i,
    'nothing requires the hand-verification that justified the waiver (the verbatim gate ' +
    'diagnostics the orchestrator read) to be recorded where the next reader finds it — in ' +
    'the incident it survived only because the build author volunteered a deviations entry; ' +
    'a waiver of the evidence floor should cost a record, not a boolean')
})
