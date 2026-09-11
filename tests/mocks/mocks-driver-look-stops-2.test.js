'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { runNode, tmpdir } = require('../helpers')
const {
  SCRIPT, JOURNEY, LABELS, DENSE,
  bare, mark, writeFile, writeWireframe,
  decideLook, openLook,
  advanceToSeedDone, advanceToShapePicked, advanceToCanonWritten, advanceToJourneyApproved, confirmEveryJourney,
  freePort,
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
//
// Split again under specs/20260906/05-gray-states-on-every-wireframe.md D7 (per-file 45 s budget,
// specs/20260903/07-test-file-budget-guard.md): the AC-20260906-02-6/-8 SIGNOFF-block tests below
// moved verbatim to mocks-driver-look-stops-4.test.js; test logic unchanged.

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

