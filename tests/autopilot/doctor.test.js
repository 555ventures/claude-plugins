'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')

// spec: specs/20260810/05-service-bootstrap.md — pins AC-20260810-05-5..7 for the offline
// silence-runbook (autopilot/daemon/doctor.js, D6). runDoctor({fsImpl, execImpl, fetchImpl,
// platform, homedir}) does not exist yet, so every test here fails at require() time until
// autopilot/daemon/doctor.js lands. Tests use the REAL `fs` module as fsImpl against a
// throwaway tmpdir standing in for $HOME — discoverRepos({reposRoot, fsImpl=fs}) and
// loadHubConfig (tests/autopilot/config.test.js) already establish the "write real files,
// don't mock the fs surface" precedent for this repo's daemon/* modules; only execImpl
// (systemd/loginctl, D4) and fetchImpl (the hub /health probe) are faked, since those are the
// two real-world side effects D6 explicitly designs around injecting. platform: 'darwin'
// throughout so the linux-only D3 service checks never engage, keeping each test scoped to the
// offline/network checks AC-5..7 actually describe.

const MODULE_PATH = path.join(__dirname, '..', '..', 'autopilot', 'daemon', 'doctor.js')
const { runDoctor } = require(MODULE_PATH)

function noopExec() { return '' }

function okFetch() {
  return async () => ({
    ok: true,
    status: 200,
    headers: { get: () => new Date().toUTCString() },
    text: async () => '',
  })
}

// Builds a throwaway $HOME with a valid hub.json (pointing at a real, empty reposRoot) and a
// valid ~/.claude/settings.json (autopilot enabled) so a caller can flip exactly ONE check to
// failing and know every other line genuinely passes.
function makeHome({ hubJson, settings } = {}) {
  const home = tmpdir('doctor-home')
  const reposRoot = path.join(home, 'repos')
  fs.mkdirSync(reposRoot, { recursive: true })
  if (hubJson !== false) {
    const cfgDir = path.join(home, '.config', 'autopilot')
    fs.mkdirSync(cfgDir, { recursive: true })
    fs.writeFileSync(path.join(cfgDir, 'hub.json'), JSON.stringify(Object.assign({
      hubUrl: 'https://hub.example.test',
      spokeId: 'sp_1',
      token: 'tok_1',
      machineName: 'test-box',
      projects: [],
      reposRoot,
      contractVersion: 1,
      enrolledAt: new Date().toISOString(),
    }, hubJson || {})))
  }
  const claudeDir = path.join(home, '.claude')
  fs.mkdirSync(claudeDir, { recursive: true })
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify(Object.assign({
    enabledPlugins: { 'autopilot@555-tools': true },
    extraKnownMarketplaces: { '555-tools': { source: { source: 'directory', path: '/anywhere' } } },
  }, settings || {})))
  return { home, reposRoot }
}

function allText(line) {
  return [line && line.name, line && line.detail, line && line.remedy].filter(Boolean).join(' ')
}

test('AC-20260810-05-5: runDoctor on a box with no hub.json fails that line naming "autopilot enroll" as the remedy, still runs every other check, and reports ok:false', async () => {
  const { home } = makeHome({ hubJson: false })
  const result = await runDoctor({
    fsImpl: fs,
    execImpl: noopExec,
    fetchImpl: okFetch(),
    platform: 'darwin',
    homedir: home,
  })
  assert.strictEqual(result.ok, false,
    `doctor must report ok:false when hub.json is missing, or a silently-broken fresh box reads as healthy; got ${JSON.stringify(result)}`)
  const hubLine = result.lines.find((l) => /hub\.json/i.test(allText(l)))
  assert.ok(hubLine, `doctor must include a line reporting on hub.json; got lines=${JSON.stringify(result.lines)}`)
  assert.strictEqual(hubLine.ok, false,
    'the hub.json line must be ok:false when the file is absent, or the missing credential goes unreported')
  assert.match(hubLine.remedy || '', /autopilot enroll/,
    `the hub.json line's remedy must name "autopilot enroll" or a freshly-provisioned box has no next step; got ${JSON.stringify(hubLine)}`)
  assert.ok(result.lines.length >= 3,
    `doctor must keep running every other check after the hub.json failure (D6: "each check runs even when earlier ones fail"), never short-circuit to a single line; got ${result.lines.length} line(s): ${JSON.stringify(result.lines)}`)
})

test('AC-20260810-05-6: runDoctor warns (never fails) on hub clock skew over 60s and on hub unreachability, keeping ok:true when every other check passes', async () => {
  const skewedDate = new Date(Date.now() + 5 * 60 * 1000).toUTCString() // 5 minutes of skew
  const { home: skewHome } = makeHome()
  const skewFetch = async (url) => {
    assert.match(String(url), /\/health$/,
      `doctor's network check must GET <hubUrl>/health per D6; got ${url}`)
    return {
      ok: true,
      status: 200,
      headers: { get: (h) => (String(h).toLowerCase() === 'date' ? skewedDate : null) },
      text: async () => '',
    }
  }
  const skewResult = await runDoctor({
    fsImpl: fs, execImpl: noopExec, fetchImpl: skewFetch, platform: 'darwin', homedir: skewHome,
  })
  assert.strictEqual(skewResult.ok, true,
    `a >60s clock skew is a warn per D6, never a failure — doctor must still report ok:true when every other check passes; got ${JSON.stringify(skewResult)}`)
  const skewLine = skewResult.lines.find((l) => /skew/i.test(allText(l)))
  assert.ok(skewLine, `doctor must surface a line naming the clock skew; got lines=${JSON.stringify(skewResult.lines)}`)
  assert.strictEqual(skewLine.ok, true,
    'the skew line must be ok:true (a warn, never a failure) per D6, or a box with no NTP yet fails provisioning')

  const { home: unreachHome } = makeHome()
  const unreachableFetch = async () => {
    throw Object.assign(new Error('connect ECONNREFUSED'), { cause: { code: 'ECONNREFUSED' } })
  }
  const unreachableResult = await runDoctor({
    fsImpl: fs, execImpl: noopExec, fetchImpl: unreachableFetch, platform: 'darwin', homedir: unreachHome,
  })
  assert.strictEqual(unreachableResult.ok, true,
    `an unreachable hub must warn, never fail, per D6 (a box provisioned offline must still doctor-pass); got ${JSON.stringify(unreachableResult)}`)
  const reachLine = unreachableResult.lines.find((l) => /reach/i.test(allText(l)))
  assert.ok(reachLine, `doctor must surface a line naming hub reachability; got lines=${JSON.stringify(unreachableResult.lines)}`)
  assert.strictEqual(reachLine.ok, true,
    'the reachability line must be ok:true (a warn) when the hub is unreachable, or an offline box fails provisioning')
})

test('AC-20260810-05-7: runDoctor fails the plugin-enabled line naming the bootstrap plugin-enable step as remedy when settings.json lacks the autopilot enablement, while other checks still run', async () => {
  const { home } = makeHome({ settings: { enabledPlugins: {}, extraKnownMarketplaces: {} } })
  const result = await runDoctor({
    fsImpl: fs, execImpl: noopExec, fetchImpl: okFetch(), platform: 'darwin', homedir: home,
  })
  assert.strictEqual(result.ok, false,
    `doctor must report ok:false when the autopilot plugin is not enabled, or a box that still halts every session on the 🔑 line reads as healthy; got ${JSON.stringify(result)}`)
  const pluginLine = result.lines.find((l) => /plugin|enabledPlugins|autopilot@555-tools/i.test(allText(l)))
  assert.ok(pluginLine, `doctor must include a line about plugin enablement; got lines=${JSON.stringify(result.lines)}`)
  assert.strictEqual(pluginLine.ok, false,
    'the plugin-enabled line must be ok:false when the settings.json entry is absent')
  assert.match(pluginLine.remedy || '', /bootstrap/i,
    `the plugin-enabled line's remedy must name the bootstrap plugin-enable step or an operator has no fix path; got ${JSON.stringify(pluginLine)}`)
  assert.ok(result.lines.length >= 3,
    `doctor must keep running every other check after the plugin-enabled failure, never short-circuit; got ${result.lines.length} line(s): ${JSON.stringify(result.lines)}`)
})
