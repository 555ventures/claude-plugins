'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { runNode, tmpdir } = require('../helpers')
const {
  SCRIPT, JOURNEY, LABELS, DENSE,
  bare, mark, writeFile, writeWireframe, writeSkinned,
  decideLook, openLook,
  advanceToSeedDone, advanceToCanonWritten, advanceToSkinned, advanceToReviewed,
} = require('./mocks-driver-fixtures')

// specs/20260905/04-per-project-look-server.md D3/D7: mocks-driver.js's `stop open`/`stop decide`
// now delegate to design-atlas.js's `stop` subcommands (design-hub.js is deleted) — these tests
// drive that delegation with a real `design-atlas.js serve` child on a free port instead of the
// old hub's registry, per fixture (AC-20260905-04-9 carrying forward the still-true
// AC-20260905-02-14/-15 mark/bare-step behavior against a serve child, plus the frontend-design
// skill-check probe).
//
// specs/20260903/07-test-file-budget-guard.md's per-file 45s guard split these tests out of
// tests/mocks/mocks-driver.test.js; shared fixtures live in the sibling mocks-driver-fixtures.js,
// required by both files.
//
// Split from tests/mocks/mocks-driver-look-stops.test.js under specs/20260906/01-ac-drift-doctor-check.md D11 (per-file 45 s budget, specs/20260903/06-test-suite-critical-path.md); test logic unchanged.

// ---------------------------------------------------------------------------
// AC-20260905-02-14
// ---------------------------------------------------------------------------
test('AC-20260905-02-14/AC-20260905-04-9: journey-reviewed refuses without a decided stop and accepts with one; approved refuses without a decided stop and accepts with one', () => {
  const dir = tmpdir('mocks-driver')
  advanceToSkinned(dir)
  const opened = mark(dir, 'review-opened', ['--decider', 'Ren'])
  assert.strictEqual(opened.status, 0, 'test setup requires review-opened to be accepted: ' + opened.stderr)
  const noStop = mark(dir, 'journey-reviewed', ['--journey', JOURNEY])
  assert.strictEqual(noStop.status, 2, 'journey-reviewed must refuse without a decided journey-reviewed:<j> stop, even once review is opened and the journey is skinned: ' + noStop.stdout + noStop.stderr)
  assert.match(noStop.stderr + noStop.stdout, /no look stop for journey-reviewed:onboarding/, 'the refusal must name the exact D7 message: ' + noStop.stdout + noStop.stderr)

  decideLook(dir, 'journey-reviewed:' + JOURNEY, 'approve', { by: 'jj' })
  const reviewed = mark(dir, 'journey-reviewed', ['--journey', JOURNEY])
  assert.strictEqual(reviewed.status, 0, 'journey-reviewed must accept once its stop is decided approve: ' + reviewed.stdout + reviewed.stderr)

  const dir2 = tmpdir('mocks-driver')
  advanceToReviewed(dir2)
  writeSkinned(dir2, LABELS, 'approved')
  const noApprovedStop = mark(dir2, 'approved')
  assert.strictEqual(noApprovedStop.status, 2, 'approved must refuse without a decided "approved" stop, even once every other precondition holds: ' + noApprovedStop.stdout + noApprovedStop.stderr)
  assert.match(noApprovedStop.stderr + noApprovedStop.stdout, /no look stop for approved/, 'the refusal must name the exact D7 message: ' + noApprovedStop.stdout + noApprovedStop.stderr)

  decideLook(dir2, 'approved', 'approve', { by: 'jj' })
  const approvedNow = mark(dir2, 'approved')
  assert.strictEqual(approvedNow.status, 0, 'approved must accept once its stop is decided approve: ' + approvedNow.stdout + approvedNow.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260905-02-15
// ---------------------------------------------------------------------------
test('AC-20260905-02-15/AC-20260905-04-9: the bare driver prints the look: progress line and derives Then: from the stop state, for an approve step (journey-approved) and a pick step (shapes)', () => {
  const dir = tmpdir('mocks-driver')
  advanceToCanonWritten(dir)
  for (const label of LABELS) writeWireframe(dir, label)
  assert.strictEqual(mark(dir, 'journey-drawn', ['--journey', JOURNEY]).status, 0, 'test setup requires journey-drawn to be accepted')

  const none = bare(dir)
  assert.strictEqual(none.status, 0, 'a bare run with no stop must still exit 0: ' + none.stdout + none.stderr)
  assert.match(none.stdout, /look: none — `stop open journey:onboarding` next/, 'the bare step must print the exact D8 "look: none" line: ' + none.stdout)
  assert.match(none.stdout, /Then:[\s\S]*stop open journey:onboarding/, 'the Then: line must name stop open journey:onboarding when no stop exists: ' + none.stdout)

  openLook(dir, 'journey-approved:' + JOURNEY, { title: 'approve journey ' + JOURNEY, url: 'http://localhost:0/p/x/atlas/index.html#stop-P001' })
  const waiting = bare(dir)
  assert.strictEqual(waiting.status, 0, 'a bare run with an open stop must still exit 0: ' + waiting.stdout + waiting.stderr)
  assert.match(waiting.stdout, /look: ⏳ waiting — /, 'the bare step must print the D8 "look: ⏳ waiting" line while the stop is open: ' + waiting.stdout)
  assert.match(waiting.stdout, /Then:[\s\S]*end the turn/, 'the Then: line must say to end the turn while waiting: ' + waiting.stdout)

  decideLook(dir, 'journey-approved:' + JOURNEY, 'change', { by: 'jj', note: 'too dense' })
  const changed = bare(dir)
  assert.strictEqual(changed.status, 0, 'a bare run with a decided-change stop must still exit 0: ' + changed.stdout + changed.stderr)
  assert.match(changed.stdout, /look: ✏️ change requested by jj: too dense/, 'the bare step must print the D8 "look: ✏️ change requested" line: ' + changed.stdout)
  assert.match(changed.stdout, /Then:[\s\S]*stop open journey:onboarding/, 'the Then: line must name a fresh stop open after a change: ' + changed.stdout)

  decideLook(dir, 'journey-approved:' + JOURNEY, 'approve', { by: 'jj' })
  const approvedLook = bare(dir)
  assert.strictEqual(approvedLook.status, 0, 'a bare run with a decided-approve stop must still exit 0: ' + approvedLook.stdout + approvedLook.stderr)
  assert.match(approvedLook.stdout, /look: ✅ approved by jj at \d{4}-\d{2}-\d{2}T/, 'the bare step must print the D8 "look: ✅ approved by <by> at <ISO>" line: ' + approvedLook.stdout)
  assert.match(approvedLook.stdout, /Then:[\s\S]*--mark journey-approved --journey onboarding/, 'the Then: line must name the mark command with the value filled in: ' + approvedLook.stdout)

  const dir2 = tmpdir('mocks-driver')
  advanceToSeedDone(dir2)
  writeFile(path.join(dir2, 'design/shapes/card-first.html'), '<main data-screen-label="' + DENSE + '" data-shape="card-first">card-first</main>\n')
  writeFile(path.join(dir2, 'design/shapes/orb-hero.html'), '<main data-screen-label="' + DENSE + '" data-shape="orb-hero">orb-hero</main>\n')
  const shapesNone = bare(dir2)
  assert.strictEqual(shapesNone.status, 0, 'a bare run at SHAPES with no stop must still exit 0: ' + shapesNone.stdout + shapesNone.stderr)
  assert.match(shapesNone.stdout, /Then:[\s\S]*stop open shapes/, 'the Then: line at SHAPES with no stop must name stop open shapes: ' + shapesNone.stdout)
  decideLook(dir2, 'shape-picked', 'pick', { pick: 'card-first', others: ['orb-hero'], by: 'jj' })
  const shapesPicked = bare(dir2)
  assert.strictEqual(shapesPicked.status, 0, 'a bare run at SHAPES with a decided pick must still exit 0: ' + shapesPicked.stdout + shapesPicked.stderr)
  assert.match(shapesPicked.stdout, /Then:[\s\S]*--mark shape-picked --shape card-first/, 'the Then: line must name the mark command with the picked value filled in: ' + shapesPicked.stdout)
})

// ---------------------------------------------------------------------------
// doctrine/mocks.md § Mocks: Authoring Rules — the frontend-design skill line is a probe result
// printed by the driver (behavioral, core § Doctrine Authoring), never a prose rule alone.
// A fake `claude` on PATH stands in for the CLI; the driver exits 0 on every outcome.
// ---------------------------------------------------------------------------
test('skill-check and every authoring step block print the frontend-design skill line from a real probe: installed → load it, not installed → ⚠️ install remedy, no CLI → ⚠️ unverifiable; exit 0 throughout', () => {
  const fakeBin = (rows) => {
    const dir = tmpdir('fake-claude-')
    const bin = path.join(dir, 'claude')
    fs.writeFileSync(bin, '#!/bin/sh\nprintf %s \'' + JSON.stringify(rows) + '\'\n')
    fs.chmodSync(bin, 0o755)
    return dir
  }
  const root = tmpdir('skill-root')
  advanceToSeedDone(root) // SEED done → the next bare step is SHAPES, the first authoring state
  // skill-check spawns only `claude`, so a bare PATH isolates it; the step block run needs the
  // real PATH (the driver shells out), so the fake dir is prepended to it instead.
  const withPath = (dir) => ({ env: { ...process.env, PATH: (dir ? dir + ':' : '') + '/usr/bin:/bin' } })
  const withFullPath = (dir) => ({ env: { ...process.env, PATH: dir + ':' + process.env.PATH } })

  const yes = runNode(SCRIPT, ['skill-check', '--root', root], withPath(fakeBin([{ id: 'frontend-design@claude-plugins-official', enabled: true, scope: 'user' }])))
  assert.strictEqual(yes.status, 0, 'skill-check must exit 0 when installed — got ' + yes.status + ' ' + yes.stderr)
  assert.match(yes.stdout, /^🎨 Load the `frontend-design` skill/, 'installed+enabled must print the load line — got: ' + yes.stdout)

  const no = runNode(SCRIPT, ['skill-check', '--root', root], withPath(fakeBin([{ id: 'other@x', enabled: true }])))
  assert.strictEqual(no.status, 0, 'skill-check must exit 0 when not installed (warn, never stop) — got ' + no.status)
  assert.match(no.stdout, /^⚠️ frontend-design skill not installed — authoring without it; install: \/plugin install frontend-design/, 'not installed must print the one ⚠️ install line — got: ' + no.stdout)

  const off = runNode(SCRIPT, ['skill-check', '--root', root], withPath(fakeBin([{ id: 'frontend-design@claude-plugins-official', enabled: false }])))
  assert.match(off.stdout, /^⚠️ frontend-design skill installed but disabled/, 'disabled must print the enable remedy — got: ' + off.stdout)

  const none = runNode(SCRIPT, ['skill-check', '--root', root], withPath(null))
  assert.strictEqual(none.status, 0, 'skill-check must exit 0 with no claude CLI — got ' + none.status)
  assert.match(none.stdout, /^⚠️ frontend-design skill could not be verified \(no-claude-cli\)/, 'no CLI must print the unverifiable reason — got: ' + none.stdout)

  // The SHAPES step block (first authoring state) carries the same line.
  const step = runNode(SCRIPT, ['--root', root], withFullPath(fakeBin([{ id: 'other@x', enabled: true }])))
  assert.match(step.stdout, /state: SHAPES/, 'seed-done root must print the SHAPES step block — got: ' + step.stdout.slice(0, 200))
  assert.match(step.stdout, /\n⚠️ frontend-design skill not installed/, 'the SHAPES step block must carry the skill line — got: ' + step.stdout)
})
