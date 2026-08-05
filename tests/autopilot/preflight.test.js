'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { ROOT, tmpdir } = require('../helpers')

// spec: specs/20260801/04-live-smoke.md — pins AC-20260801-04-1..5, -12, -13 for the
// autopilotd offline preflight (autopilot/bin/autopilotd, D2/D3/D5). --check/--hold/
// --ready-file/--state-dir do not exist yet — today's parseArgs recognizes only --config, so
// every flag added here is silently ignored and main() falls straight through to a real
// daemon start (network calls, no exit). AC-3/-12/-13 pin behavior that is ALREADY correct
// today (config-error rendering, default-mode boot, the recursion guard) — they exist here
// as regression locks so the --check implementation cannot fork or break that shared code
// path; every other test fails on current code (see per-test consequence messages).
// Every child process runs with HOME/USERPROFILE pointed at a throwaway tmpdir so a test
// invocation can never write into a developer's real ~/.config/autopilot.

const AUTOPILOTD = path.join(ROOT, 'autopilot', 'bin', 'autopilotd')

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function validConfig(overrides = {}) {
  return {
    botToken: '000000000:preflight-fixture-token-not-a-real-credential',
    supergroupId: -1000000000000,
    allowedUserIds: [1],
    specPluginRoot: path.join(ROOT, 'spec'),
    pluginPaths: [path.join(ROOT, 'spec'), path.join(ROOT, 'git')],
    lanes: [{ project: 'preflight', root: ROOT, topicId: 1 }],
    ...overrides,
  }
}

function writeConfig(dir, cfg) {
  const p = path.join(dir, 'config.json')
  fs.writeFileSync(p, JSON.stringify(cfg))
  return p
}

function runAutopilotd(args, opts = {}) {
  const home = tmpdir('autopilotd-home')
  const { bin = AUTOPILOTD, env, ...rest } = opts
  return spawnSync(process.execPath, [bin, ...args], {
    encoding: 'utf8',
    timeout: 4000,
    ...rest,
    env: { ...process.env, HOME: home, USERPROFILE: home, ...(env || {}) },
  })
}

test('AC-20260801-04-1: autopilotd --check exits 0 and prints the pass notice naming the lane count for a valid config with the SDK installed', () => {
  const dir = tmpdir('ac1-cfg')
  const cfgPath = writeConfig(dir, validConfig())
  const res = runAutopilotd(['--check', '--config', cfgPath])
  assert.strictEqual(res.status, 0,
    `preflight must exit 0 promptly on a valid config so a boot leg/CI check can trust it as a pass — instead of falling through to the real daemon start; got status=${res.status} signal=${res.signal} stderr=${res.stderr}`)
  assert.match(res.stderr, /autopilotd: preflight OK — 1 lane, SDK resolved/,
    `the pass notice must name the lane count and confirm the SDK resolved, or an operator/boot-leg cannot tell preflight actually ran the full check rather than doing nothing; got stderr=${res.stderr}`)
})

test('AC-20260801-04-2: autopilotd --check exits 2 naming the "cd autopilot && npm install" remedy when the daemon sdk module fails to resolve', () => {
  const cfgDir = tmpdir('ac2-cfg')
  const cfgPath = writeConfig(cfgDir, validConfig())
  // Copies bin+daemon into a tree with no node_modules anywhere in its ancestry, so
  // require('../daemon/sdk') resolves to a real sdk.js whose
  // require('@anthropic-ai/claude-agent-sdk') genuinely throws MODULE_NOT_FOUND — the same
  // failure a missing `autopilot/node_modules` produces on a real host.
  const copyRoot = tmpdir('ac2-copy')
  fs.cpSync(path.join(ROOT, 'autopilot', 'bin'), path.join(copyRoot, 'bin'), { recursive: true })
  fs.cpSync(path.join(ROOT, 'autopilot', 'daemon'), path.join(copyRoot, 'daemon'), {
    recursive: true,
    filter: (src) => !src.split(path.sep).includes('node_modules'),
  })
  const res = runAutopilotd(['--check', '--config', cfgPath], { bin: path.join(copyRoot, 'bin', 'autopilotd') })
  assert.strictEqual(res.status, 2,
    `an unresolvable SDK must fail the preflight with exit 2 — a lazy require means a bare boot proves nothing (D2); got status=${res.status} signal=${res.signal} stdout=${res.stdout} stderr=${res.stderr}`)
  assert.match(res.stderr, /cd autopilot && npm install/,
    `the error must name the exact remedy command "cd autopilot && npm install" or an operator is left to guess why the daemon won't boot; got stderr=${res.stderr}`)
})

test('AC-20260801-04-3: autopilotd --check exits 2 with the identical config-missing-field message a normal start produces', () => {
  const dir = tmpdir('ac3-cfg')
  const cfg = validConfig()
  delete cfg.supergroupId
  const cfgPath = writeConfig(dir, cfg)
  const res = runAutopilotd(['--check', '--config', cfgPath])
  assert.strictEqual(res.status, 2,
    `a config missing a required field must fail preflight with exit 2, matching a normal start's own validation failure; got status=${res.status} signal=${res.signal} stderr=${res.stderr}`)
  const expected = new RegExp(`autopilotd: config missing "supergroupId" — edit ${escapeRe(cfgPath)}`)
  assert.match(res.stderr, expected,
    `preflight must reuse loadConfig's own error text verbatim (field name + config path) rather than a second, preflight-only rendering of the same failure; got stderr=${res.stderr}`)
})

test('AC-20260801-04-4: autopilotd --check --state-dir <fresh dir> exits 0 promptly and leaves that directory empty', () => {
  const cfgDir = tmpdir('ac4-cfg')
  const cfgPath = writeConfig(cfgDir, validConfig())
  const stateDir = tmpdir('ac4-state')
  const res = runAutopilotd(['--check', '--config', cfgPath, '--state-dir', stateDir])
  assert.strictEqual(res.status, 0,
    `preflight against a valid config must exit 0 promptly rather than fall through to starting lanes (which would hang past this test's timeout); got status=${res.status} signal=${res.signal} stderr=${res.stderr}`)
  assert.deepStrictEqual(fs.readdirSync(stateDir), [],
    `preflight must never create lane-state files under --state-dir — a non-empty directory means "autopilotd --check" has a filesystem side effect an operator or CI gate cannot safely repeat`)
})

test('AC-20260801-04-5: autopilotd --check exits 2 naming both the missing oracle script and the offending specPluginRoot', () => {
  const cfgDir = tmpdir('ac5-cfg')
  const badRoot = tmpdir('ac5-empty-plugin-root')
  const cfgPath = writeConfig(cfgDir, validConfig({ specPluginRoot: badRoot }))
  const res = runAutopilotd(['--check', '--config', cfgPath])
  assert.strictEqual(res.status, 2,
    `a specPluginRoot with no scripts/spec-status.js must fail preflight with exit 2 — otherwise this only surfaces later as a lane backoff at runtime; got status=${res.status} signal=${res.signal} stderr=${res.stderr}`)
  assert.match(res.stderr, /scripts[\\/]spec-status\.js/,
    `the error must name the missing oracle script path, or an operator has no idea what preflight actually checked; got stderr=${res.stderr}`)
  assert.match(res.stderr, new RegExp(escapeRe(badRoot)),
    `the error must name the offending specPluginRoot value verbatim so the operator knows which config field to fix; got stderr=${res.stderr}`)
})

// Reviewed 2026-08-05 against specs/20260801/04-live-smoke.md (execution-grounded review
// finding): this test used to wrap the spawn below in a 5x best-effort retry loop, because a
// real (non---check) daemon on a fake Telegram token races its own first oracle cycle's
// narration attempt against api.telegram.org, and used to crash with an unhandled rejection
// on the "Unauthorized" reply before SIGTERM ever landed — a genuine 1-in-4 flake. That crash
// vector is now fixed: autopilot/daemon/lane.js catches every post-oracle error (including
// narrate/Telegram failures), logs, backs off, and continues instead of exiting. Surviving
// until SIGTERM regardless of network outcome (offline, or a real 401 from Telegram) is now
// part of what this test pins, so a single spawn + SIGTERM must deterministically exit 0 —
// a resurfaced retry loop here would hide that guarantee regressing, not absorb a sanctioned
// race.
async function attemptAc12(cfgPath) {
  const home = tmpdir('ac12-home')
  const child = spawn(process.execPath, [AUTOPILOTD, '--config', cfgPath], {
    env: { ...process.env, HOME: home, USERPROFILE: home },
  })
  let stderr = ''
  let exitCode = null
  let exited = false
  child.stderr.on('data', (d) => { stderr += String(d) })
  child.once('exit', (code) => { exited = true; exitCode = code })
  const start = Date.now()
  while (!exited && !/telegram:/.test(stderr) && Date.now() - start < 8000) {
    await new Promise((r) => setTimeout(r, 50))
  }
  if (exited) return { ok: false, stderr, exitCode, sawEvidence: /telegram:/.test(stderr) }
  child.kill('SIGTERM')
  const deadline = Date.now() + 5000
  while (!exited && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50))
  }
  return { ok: exited && exitCode === 0, stderr, exitCode, sawEvidence: true }
}

test('AC-20260801-04-12: autopilotd started without --check continues to load config, construct lanes, start the adapter long-poll, and install SIGTERM/SIGINT handlers exactly as before, surviving a real Telegram round-trip on a bad token until SIGTERM', async () => {
  const cfgDir = tmpdir('ac12-cfg')
  const cfgPath = writeConfig(cfgDir, validConfig())
  const result = await attemptAc12(cfgPath)
  assert.ok(result.sawEvidence,
    `a normal (non---check) start must construct the adapter and begin its getUpdates long-poll, or adding --check support gated that off by default; observed stderr=${result.stderr}`)
  assert.strictEqual(result.exitCode, 0,
    `the installed SIGTERM handler must still stop every lane, stop the adapter, and exit 0 on a single deterministic attempt (no retry) — a bad-token Telegram round-trip racing shutdown must no longer crash the daemon with an unhandled rejection, per the lane.js post-oracle error catch; got ${result.exitCode}, stderr=${result.stderr}`)
})

test('AC-20260801-04-13: autopilotd exits 2 with the recursion-guard message before reading config when AUTOPILOT_SESSION=1 is set, with or without --check', () => {
  for (const extraArgs of [[], ['--check']]) {
    const cfgDir = tmpdir('ac13-cfg')
    // Deliberately a config path that does not exist — the recursion guard must fire before
    // any config read is attempted, with or without --check.
    const cfgPath = path.join(cfgDir, 'does-not-exist.json')
    const res = runAutopilotd(['--config', cfgPath, ...extraArgs], { env: { AUTOPILOT_SESSION: '1' } })
    assert.strictEqual(res.status, 2,
      `AUTOPILOT_SESSION=1 must always exit 2 via the recursion guard (args=${JSON.stringify(extraArgs)}), never proceed to a config read that would otherwise succeed or fail on its own; got status=${res.status} signal=${res.signal} stderr=${res.stderr}`)
    assert.match(res.stderr, /AUTOPILOT_SESSION=1/,
      `the recursion-guard message must name AUTOPILOT_SESSION=1 as the cause (args=${JSON.stringify(extraArgs)}), or an operator debugging a stuck nested daemon has no lead; got stderr=${res.stderr}`)
  }
})
