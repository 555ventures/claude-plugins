'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { runNode, tmpdir } = require('../helpers')
const {
  SCRIPT,
  bare, mark, decideLook,
  advanceToCanonWritten, advanceToJourneyApproved, advanceToThemePicked,
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

// ---------------------------------------------------------------------------
// AC-20260906-02-6
// ---------------------------------------------------------------------------
test('AC-20260906-02-6: the bare driver in SIGNOFF prints the exact step heading, the approval literal, a look: line naming stop open signoff, and a Then: line naming --mark approved, with none of the retired SKIN/REVIEW literals anywhere in stdout; in APPROVED it prints the exact done line naming the theme and decider', () => {
  const dir = tmpdir('mocks-driver')
  advanceToThemePicked(dir)
  const step = bare(dir)
  assert.strictEqual(step.status, 0, 'a bare invocation in SIGNOFF must exit 0: ' + step.stdout + step.stderr)
  assert.match(step.stdout, /## Step: sign off — the product I understand/, 'the SIGNOFF block must open with the exact D6 heading: ' + step.stdout)
  assert.match(step.stdout, /Approval means "this is the product I understand" — the written brief, not these screens, holds scope\./, 'the SIGNOFF block must carry the exact D6 approval literal: ' + step.stdout)
  assert.match(step.stdout, /look:[\s\S]*stop open signoff/, 'the SIGNOFF block must carry a look: line naming `stop open signoff`: ' + step.stdout)
  assert.match(step.stdout, /Then:[\s\S]*--mark approved/, 'the SIGNOFF block must carry a Then: line naming `--mark approved`: ' + step.stdout)
  for (const retired of ['review-opened', '--decider', 'journey-reviewed', 'SKIN', 'REVIEW']) {
    assert.ok(!step.stdout.includes(retired), 'the SIGNOFF block must never print the retired literal "' + retired + '": ' + step.stdout)
  }

  decideLook(dir, 'approved', 'approve', { by: 'Ren' })
  const accepted = mark(dir, 'approved')
  assert.strictEqual(accepted.status, 0, 'test setup requires the approved mark to be accepted for the terminal-step assertion below: ' + accepted.stdout + accepted.stderr)
  const terminal = bare(dir)
  assert.strictEqual(terminal.status, 0, 'a bare re-run at APPROVED must exit 0: ' + terminal.stdout + terminal.stderr)
  assert.match(terminal.stdout, /done — every journey approved, theme "quiet" picked, signed off by Ren/, 'the terminal APPROVED step must print the exact D6 done line: ' + terminal.stdout)
})

// ---------------------------------------------------------------------------
// AC-20260906-02-8
// ---------------------------------------------------------------------------
test('AC-20260906-02-8: WIREFRAMES and THEME step blocks continue to print the frontend-design skill line; the SIGNOFF block prints no frontend-design line, and its own look mechanism (`stop open signoff`) exits 3 when nothing answers the served port', async () => {
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

  const themeRoot = tmpdir('skill-theme')
  advanceToJourneyApproved(themeRoot)
  const themeStep = runNode(SCRIPT, ['--root', themeRoot], withFullPath(installed))
  assert.match(themeStep.stdout, /state: THEME/, 'a journey-approved root with theme:null must print the THEME step block — got: ' + themeStep.stdout.slice(0, 200))
  assert.match(themeStep.stdout, /🎨 Load the `frontend-design` skill/, 'D8: the THEME step block must CONTINUE TO print the skill line: ' + themeStep.stdout)

  const signoffRoot = tmpdir('skill-signoff')
  advanceToThemePicked(signoffRoot)
  const signoffStep = runNode(SCRIPT, ['--root', signoffRoot], withFullPath(installed))
  assert.match(signoffStep.stdout, /## Step: sign off/, 'a theme-picked root must print the SIGNOFF step block — got: ' + signoffStep.stdout.slice(0, 200))
  assert.doesNotMatch(signoffStep.stdout, /frontend-design/, 'D8: the SIGNOFF block must print no line containing "frontend-design" — SIGNOFF is not an authoring state: ' + signoffStep.stdout)

  const busyPort = await freePort()
  const unreachable = runNode(SCRIPT, ['--root', signoffRoot, 'stop', 'open', 'signoff', '--port', String(busyPort)])
  assert.strictEqual(unreachable.status, 3, 'AC-8: SIGNOFF\'s own look mechanism (`stop open signoff`) must exit 3 when nothing answers the served port: ' + unreachable.stdout + unreachable.stderr)
  assert.match(unreachable.stderr, /serve --root/, 'the exit-3 remedy must name `serve --root`: ' + JSON.stringify(unreachable.stderr))
})

test('AC-20260906-02-8: the SIGNOFF block runs the look probe itself, not just stop open signoff — a bare driver run in SIGNOFF with a failing npx on PATH exits 2 naming the install remedy', () => {
  const dir = tmpdir('mocks-driver')
  advanceToThemePicked(dir) // now at SIGNOFF
  const failingPath = stubNpx(dir, { exitCode: 1 })

  const r = runNode(SCRIPT, ['--root', dir], { env: { ...process.env, PATH: failingPath } })
  assert.strictEqual(r.status, 2,
    'D8: SIGNOFF "runs the look probe" (not merely the stop-open path) — a bare run must refuse exit 2 when the probe\'s npx is unreachable, the same way SHAPES/WIREFRAMES do: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, /npx playwright install chromium/,
    'D8: the SIGNOFF probe refusal must name the exact install remedy, same as the SHAPES/WIREFRAMES probe: ' + r.stdout + r.stderr)
})
