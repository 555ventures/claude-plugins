'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { runNode, tmpdir } = require('../helpers')
const {
  SCRIPT,
  bare, mark, decideLook,
  advanceToCanonWritten, advanceToJourneyApproved, advanceToJourneyWalked, confirmEveryJourney,
  freePort, stubNpx,
} = require('./mocks-driver-fixtures')

// specs/20260906/05-gray-states-on-every-wireframe.md D7 (per-file 45 s budget guard,
// specs/20260903/07-test-file-budget-guard.md): split from
// tests/mocks/mocks-driver-look-stops-2.test.js — the AC-20260906-02-6/-8 SIGNOFF-block tests
// below move here verbatim, test logic and AC tags unchanged.
//
// specs/20260906/02-mocks-ends-at-wireframes.md: SKIN and REVIEW retire — the journey-reviewed
// arm is deleted (journey-reviewed is not among the driver's live marks); AC-20260906-02-6 and
// AC-20260906-02-8 pin the new SIGNOFF block below.
//
// specs/20260907/07-mocks-retires-theme.md build (red-check mixed-pin, HARD): AC-20260907-07-8
// and its split-out CONTINUE-TO sibling AC-20260907-07-14 each pin one half of the SIGNOFF
// block's post-THEME behaviour — the theme-less state print with no skill line, and the
// untouched look-probe-failure refusal, respectively.

// ---------------------------------------------------------------------------
// AC-20260906-02-6
// ---------------------------------------------------------------------------
test('AC-20260907-10-17 (retag of AC-20260906-02-6): the bare driver in CLIENT prints the exact step heading, the approval literal, a look: line naming stop open signoff, and a Then: line naming --mark approved, with none of the retired SKIN/REVIEW/SIGNOFF literals anywhere in stdout', () => {
  const dir = tmpdir('mocks-driver')
  // AC-20260907-08-1/D1 fixture repair: WALK now sits between WIREFRAMES and CLIENT — the
  // bare step block below is vacuous unless the journey is actually walked first, or the
  // driver prints the WALK block instead of CLIENT.
  advanceToJourneyWalked(dir)
  const step = bare(dir)
  assert.strictEqual(step.status, 0, 'a bare invocation in CLIENT must exit 0: ' + step.stdout + step.stderr)
  assert.match(step.stdout, /## Step: client review — the product I understand/, 'the CLIENT block must open with the exact D10 heading: ' + step.stdout)
  assert.match(step.stdout, /Approval means "this is the product I understand" — the written brief, not these screens, holds scope\./, 'the CLIENT block must carry the exact D10 approval literal: ' + step.stdout)
  assert.match(step.stdout, /look:[\s\S]*stop open signoff/, 'the CLIENT block must carry a look: line naming `stop open signoff` — the stop step name is unchanged (D9 rationale): ' + step.stdout)
  assert.match(step.stdout, /Then:[\s\S]*--mark approved/, 'the CLIENT block must carry a Then: line naming `--mark approved`: ' + step.stdout)
  for (const retired of ['review-opened', '--decider', 'journey-reviewed', 'SKIN', 'REVIEW', 'SIGNOFF']) {
    assert.ok(!step.stdout.includes(retired), 'the CLIENT block must never print the retired literal "' + retired + '": ' + step.stdout)
  }
})

// ---------------------------------------------------------------------------
// AC-20260907-07-9
// ---------------------------------------------------------------------------
test('AC-20260907-07-9: in APPROVED the bare driver prints the exact theme-less done line naming only the decider, with no "theme" substring', () => {
  const dir = tmpdir('mocks-driver')
  advanceToJourneyApproved(dir)
  // Repair round (specs/20260907/08-walk-critic.md D1/AC-20260907-08-1): WALK now sits between
  // WIREFRAMES and SIGNOFF, and deriveState checks allJourneysWalked() before it ever checks
  // marks.approved — the terminal-step assertion below is vacuous unless the journey is walked
  // before `--mark approved`, or the bare re-run prints the WALK block instead of APPROVED.
  advanceToJourneyWalked(dir)
  // specs/20260910/03-client-journey-player.md D7 fixture repair: `--mark approved` now
  // refuses while a seed journey is unconfirmed by the client, so this setup records the
  // confirmation to keep the precondition it actually pins isolated.
  confirmEveryJourney(dir)
  decideLook(dir, 'approved', 'approve', { by: 'Ren' })
  const accepted = mark(dir, 'approved')
  assert.strictEqual(accepted.status, 0, 'test setup requires the approved mark to be accepted for the terminal-step assertion below: ' + accepted.stdout + accepted.stderr)
  const terminal = bare(dir)
  assert.strictEqual(terminal.status, 0, 'a bare re-run at APPROVED must exit 0: ' + terminal.stdout + terminal.stderr)
  assert.match(terminal.stdout, /## Step: done — every journey approved, signed off by Ren/,
    'D5: the terminal APPROVED step must print the exact theme-less done line: ' + terminal.stdout)
  assert.ok(!terminal.stdout.includes('theme'), 'D5: the terminal APPROVED step must carry no "theme" substring at all: ' + terminal.stdout)
})

// ---------------------------------------------------------------------------
// AC-20260906-02-8's THEME arm is DELETED (specs/20260907/07 retires the step whole); its
// WIREFRAMES and SIGNOFF arms are kept below, unretagged.
// ---------------------------------------------------------------------------
test('AC-20260907-10-17 (retag of AC-20260906-02-8 / AC-20260907-07-8): the WIREFRAMES step block continues to print the frontend-design skill line; the CLIENT block prints state: CLIENT with no frontend-design line, and its own look mechanism (`stop open signoff`) exits 3 when nothing answers the served port', async () => {
  const fakeBin = (rows) => {
    const dir = tmpdir('fake-claude-')
    const bin = path.join(dir, 'claude')
    fs.writeFileSync(bin, '#!/bin/sh\nprintf %s \'' + JSON.stringify(rows) + '\'\n')
    fs.chmodSync(bin, 0o755)
    return dir
  }
  const withFullPath = (dir) => ({ env: { ...process.env, PATH: dir + ':' + process.env.PATH } })
  const installed = fakeBin([{ id: 'frontend-design@claude-plugins-official', enabled: true, scope: 'user' }])

  const wireframesRoot = tmpdir('skill-wireframes')
  advanceToCanonWritten(wireframesRoot)
  const wireframesStep = runNode(SCRIPT, ['--root', wireframesRoot], withFullPath(installed))
  assert.match(wireframesStep.stdout, /state: WIREFRAMES/, 'a canon-written root must print the WIREFRAMES step block — got: ' + wireframesStep.stdout.slice(0, 200))
  assert.match(wireframesStep.stdout, /🎨 Load the `frontend-design` skill/, 'D8: the WIREFRAMES step block must CONTINUE TO print the skill line: ' + wireframesStep.stdout)

  const clientRoot = tmpdir('skill-client')
  // AC-20260907-08-1/D1 fixture repair: WALK now sits between WIREFRAMES and CLIENT — this
  // root must actually walk its journey, or it derives WALK (also skill-line-free, but a
  // different state string) instead of CLIENT.
  advanceToJourneyWalked(clientRoot)
  const clientStep = runNode(SCRIPT, ['--root', clientRoot], withFullPath(installed))
  assert.match(clientStep.stdout, /state: CLIENT/, 'AC-20260907-10-17: a root reached through advanceToJourneyWalked must print state: CLIENT (the SIGNOFF state is retired) — got: ' + clientStep.stdout.slice(0, 200))
  assert.match(clientStep.stdout, /## Step: client review/, 'a journey-approved root must print the CLIENT step block — got: ' + clientStep.stdout.slice(0, 200))
  assert.doesNotMatch(clientStep.stdout, /frontend-design/, 'D8: the CLIENT block must print no line containing "frontend-design" — CLIENT is not an authoring state: ' + clientStep.stdout)

  const busyPort = await freePort()
  const unreachable = runNode(SCRIPT, ['--root', clientRoot, 'stop', 'open', 'signoff', '--port', String(busyPort)])
  assert.strictEqual(unreachable.status, 3, 'AC-20260907-10-17: CLIENT\'s own look mechanism (`stop open signoff`) must exit 3 when nothing answers the served port: ' + unreachable.stdout + unreachable.stderr)
  assert.match(unreachable.stderr, /serve --root/, 'the exit-3 remedy must name `serve --root`: ' + JSON.stringify(unreachable.stderr))
})

// specs/20260907/07-mocks-retires-theme.md build (red-check mixed-pin, HARD): the test below
// mixed a new promise (the bare driver prints state: SIGNOFF with no skill line) with a SHALL
// CONTINUE TO clause (the look probe failing keeps exiting 2 naming the install remedy) — split
// along the same line the spec's own AC list now draws, AC-20260907-07-8 keeping only the new
// promise (a normal, successful bare run) and AC-20260907-07-14 carrying the split-out continue
// clause (the probe-failure run, plus the vacuousness guard proving the root is genuinely
// SIGNOFF and not the retired THEME step, since dieProbeFailed never prints a state name).
// ---------------------------------------------------------------------------
// AC-20260907-10-17 (retag of AC-20260907-07-8)
// ---------------------------------------------------------------------------
test('AC-20260907-10-17 (retag of AC-20260907-07-8): the bare driver on a root reached through advanceToJourneyWalked prints state: CLIENT and does not print the frontend-design skill line', () => {
  const dir = tmpdir('mocks-driver')
  // AC-20260907-08-1/D1 fixture repair: this root must be walked, not merely journey-approved,
  // to derive CLIENT — WALK now sits between WIREFRAMES and CLIENT.
  advanceToJourneyWalked(dir) // now at CLIENT

  const r = bare(dir)
  assert.strictEqual(r.status, 0, 'a bare invocation on a root reached through advanceToJourneyWalked must exit 0: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /state: CLIENT/,
    'AC-20260907-10-17: a root reached through advanceToJourneyWalked must print state: CLIENT (the SIGNOFF state is retired) — got: ' + r.stdout.slice(0, 200))
  assert.ok(!(r.stdout + r.stderr).includes('🎨 Load the `frontend-design` skill'),
    'AC-20260907-10-17: CLIENT must never print the frontend-design skill line: ' + JSON.stringify({ stdout: r.stdout, stderr: r.stderr }))
})

// ---------------------------------------------------------------------------
// AC-20260907-10-17 (retag of AC-20260907-07-14)
// ---------------------------------------------------------------------------
test('AC-20260907-10-17 (retag of AC-20260907-07-14): the bare driver on a root reached through advanceToJourneyWalked CONTINUES TO exit 2 naming the install remedy when the look probe fails, the same way SHAPES/WIREFRAMES do', () => {
  const dir = tmpdir('mocks-driver')
  // AC-20260907-08-1/D1 fixture repair: this test pins the CLIENT probe-failure refusal
  // specifically — the journey must be walked first, or the root sits at WALK (a state
  // AC-20260907-08-9 pins as running no look probe at all, tested separately below).
  advanceToJourneyWalked(dir)
  const failingPath = stubNpx(dir, { exitCode: 1 })

  const r = runNode(SCRIPT, ['--root', dir], { env: { ...process.env, PATH: failingPath } })
  assert.strictEqual(r.status, 2,
    'D8: CLIENT "runs the look probe" (not merely the stop-open path) — a bare run must refuse exit 2 when the probe\'s npx is unreachable, the same way SHAPES/WIREFRAMES do: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, /npx playwright install chromium/,
    'D8: the CLIENT probe refusal must name the exact install remedy, same as the SHAPES/WIREFRAMES probe: ' + r.stdout + r.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260907-08-9
// ---------------------------------------------------------------------------
test('AC-20260907-08-9: the bare driver in WALK prints no frontend-design skill line and does not run the look probe — a WALK run with a failing npx on PATH exits 0', () => {
  const dir = tmpdir('mocks-driver')
  // Journey approved but not yet walked — the root derives WALK, one step short of SIGNOFF.
  advanceToJourneyApproved(dir)
  const failingPath = stubNpx(dir, { exitCode: 1 })

  const r = runNode(SCRIPT, ['--root', dir], { env: { ...process.env, PATH: failingPath } })
  assert.strictEqual(r.status, 0,
    'D7: WALK draws nothing, opens no look stop, and serves no page, so the look-probe precondition must gain no WALK disjunct — a failing npx on PATH must not block a bare WALK run: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /## Step: walk journey/,
    'D7: a bare run at WALK must print the "## Step: walk journey <j> …" heading: ' + r.stdout)
  assert.ok(!r.stdout.includes('🎨 Load the `frontend-design` skill'),
    'D7: WALK is not an authoring state — it must never print the frontend-design skill line: ' + r.stdout)
})
