'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { ROOT, tmpdir } = require('../helpers')

// spec: specs/20260808/01-autopilot-enroll.md — pins AC-20260808-01-12 (D11). Real live
// enrollment against the deployed production autopilot-hub; activates ONLY when
// AUTOPILOT_ENROLL_LIVE=1 is set IN ADDITION to AUTOPILOT_ENROLL_HUB and
// AUTOPILOT_ENROLL_CODE (a fresh Telegram /enroll code — codes expire in 15 min, so the code
// travels by env var, never a fixture). Absent that opt-in the test skips by declaration,
// the sanctioned state for CI and any unattended run — same gate shape as
// tests/autopilot/live.test.js (specs/20260801/04-live-smoke.md D6). autopilot/bin/autopilot
// and autopilot/contract/constants.ts do not exist yet (File Plan CREATE rows), so a fully
// gated live run fails on current code until the batch lands; the contract require is done
// inside the (possibly-skipped) test body, not at module load, so an unattended/CI run that
// never opts in never crashes on the missing file.

const LIVE = process.env.AUTOPILOT_ENROLL_LIVE === '1'
  && !!process.env.AUTOPILOT_ENROLL_HUB
  && !!process.env.AUTOPILOT_ENROLL_CODE
const SKIP_REASON = 'set AUTOPILOT_ENROLL_LIVE=1 plus AUTOPILOT_ENROLL_HUB and AUTOPILOT_ENROLL_CODE (a fresh Telegram /enroll code) to run the live enroll suite (D11)'

const AUTOPILOT_BIN = path.join(ROOT, 'autopilot', 'bin', 'autopilot')
const CONTRACT_PATH = path.join(ROOT, 'autopilot', 'contract', 'constants.ts')

test('AC-20260808-01-12: a real enroll against the live hub with a run-unique --machine-name exits 0 and writes hub.json with non-empty spokeId/token and this machine\'s contract version; the suite skips by declaration when the gate vars are unset', { skip: !LIVE && SKIP_REASON }, () => {
  const { CONTRACT_VERSION } = require(CONTRACT_PATH)
  const home = tmpdir('autopilot-live-home')
  const machineName = `enroll-live-${Date.now()}`
  const res = spawnSync(process.execPath, [
    AUTOPILOT_BIN, 'enroll',
    '--hub', process.env.AUTOPILOT_ENROLL_HUB,
    '--code', process.env.AUTOPILOT_ENROLL_CODE,
    '--machine-name', machineName,
  ], {
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, HOME: home, USERPROFILE: home },
  })
  assert.strictEqual(res.status, 0,
    `a real enrollment against the live hub with a fresh code must exit 0, or the hub's paste-ready enroll line does not actually work end-to-end on a fresh machine; got status=${res.status} stderr=${res.stderr}`)
  const cfgPath = path.join(home, '.config', 'autopilot', 'hub.json')
  const saved = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  assert.ok(saved.spokeId && saved.spokeId.length > 0,
    'the live enrollment must persist a non-empty spokeId or the hub round-trip did not actually mint an identity')
  assert.ok(saved.token && saved.token.length > 0,
    'the live enrollment must persist a non-empty bearer token or later spoke calls cannot authenticate against the live hub')
  assert.strictEqual(saved.contractVersion, CONTRACT_VERSION,
    `the stored contractVersion must equal this machine's vendored contract copy or a version mismatch between spoke and hub is silently masked; got ${saved.contractVersion} vs local ${CONTRACT_VERSION}`)
})
