'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { tmpdir, ROOT } = require('../helpers')

// spec: specs/20260810/05-service-bootstrap.md — pins AC-20260810-05-8, -9, -10, -13 for the
// thin-composition bootstrap (autopilot/daemon/bootstrap.js, D7/D8) and its dispatch through
// autopilot/bin/autopilot. runBootstrap({args, deps}) does not exist yet, so every test here
// fails at require() time until autopilot/daemon/bootstrap.js lands.
//
// Test-authoring note (Contracts underspecifies `deps` beyond "injected enroll/discover/
// service/doctor fns"): these tests inject `deps.enroll`/`deps.discover`/`deps.service`/
// `deps.doctor` as fully-controlled fakes (Test Rules mode 4 — zero real SDK/network/systemd
// calls) and let the plugin-enable step run for REAL against `~/.claude/settings.json`, since
// that step is plain local-file I/O with no external side effect to inject away (D8) — tests
// override `process.env.HOME`/`USERPROFILE` around each call (os.homedir() reads the
// environment per call, not once at process start) and restore it in a `finally`, mirroring
// tests/autopilot/enroll.test.js's `env: {HOME: home}` convention for the spawned-CLI cases
// below. The build worker's exact internal shape for the plugin-enable step is free to differ
// as long as `runBootstrap`'s observable order and settings.json's on-disk result match.

const MODULE_PATH = path.join(__dirname, '..', '..', 'autopilot', 'daemon', 'bootstrap.js')
const { runBootstrap } = require(MODULE_PATH)

const AUTOPILOT_BIN = path.join(ROOT, 'autopilot', 'bin', 'autopilot')

function withHome(home, fn) {
  const savedHome = process.env.HOME
  const savedProfile = process.env.USERPROFILE
  process.env.HOME = home
  process.env.USERPROFILE = home
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      process.env.HOME = savedHome
      process.env.USERPROFILE = savedProfile
    })
}

function writeSettings(home, obj) {
  const settingsPath = path.join(home, '.claude', 'settings.json')
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
  fs.writeFileSync(settingsPath, JSON.stringify(obj))
  return settingsPath
}

function readSettings(home) {
  return JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'))
}

test('AC-20260810-05-8: a successful runBootstrap invokes enroll (with reposRoot), then plugin-enable, then service install, then doctor, in that order, and its return value names the claude login as the remaining manual step', async () => {
  const home = tmpdir('bootstrap-home-success')
  await withHome(home, async () => {
    writeSettings(home, { model: 'opus' })
    const reposRoot = tmpdir('bootstrap-repos-success')

    const callOrder = []
    let enrollArgs = null
    let settingsAtService = null
    let settingsAtDoctor = null

    const deps = {
      enroll: async (opts) => {
        callOrder.push('enroll')
        enrollArgs = opts
        return { spokeId: 'sp_1', machineName: opts.machineName, projectCount: 0, configPath: path.join(home, '.config', 'autopilot', 'hub.json') }
      },
      discover: async () => [],
      service: async () => {
        callOrder.push('service')
        settingsAtService = readSettings(home)
        return { ok: true }
      },
      doctor: async () => {
        callOrder.push('doctor')
        settingsAtDoctor = readSettings(home)
        return { ok: true, lines: [] }
      },
    }

    const result = await runBootstrap({
      args: { hubUrl: 'https://hub.example.test', code: 'C1', reposRoot, machineName: 'box-1', force: false },
      deps,
    })

    assert.deepStrictEqual(callOrder, ['enroll', 'service', 'doctor'],
      `runBootstrap must invoke enroll, then service install, then doctor, in that order (D7), or a failed later step leaves earlier work half-applied; got ${JSON.stringify(callOrder)}`)
    assert.strictEqual(enrollArgs.reposRoot, reposRoot,
      `enroll must be invoked with the --repos-root value or a fresh box's repos are silently dropped from enrollment (AC-8); got ${JSON.stringify(enrollArgs)}`)
    assert.ok(settingsAtService && settingsAtService.enabledPlugins && settingsAtService.enabledPlugins['autopilot@555-tools'] === true,
      `the plugin-enable step must complete before service install runs (D7 order) — settings.json must already carry the autopilot enablement when the service dep is invoked; got ${JSON.stringify(settingsAtService)}`)
    assert.ok(settingsAtDoctor && settingsAtDoctor.enabledPlugins && settingsAtDoctor.enabledPlugins['autopilot@555-tools'] === true,
      `plugin-enable must have already run by the time doctor runs, or doctor's own AC-7 check would fail right after a successful bootstrap; got ${JSON.stringify(settingsAtDoctor)}`)
    const rendered = JSON.stringify(result).toLowerCase()
    assert.match(rendered, /claude/,
      `runBootstrap's return value must name the "claude" login as the remaining manual step (D7 Behavior) or an operator does not know provisioning is still incomplete; got ${JSON.stringify(result)}`)
  })
})

test('AC-20260810-05-9: a successful runBootstrap merges settings.json preserving unrelated keys and adds the marketplace entry + enabledPlugins["autopilot@555-tools"]:true (literal input/output check)', async () => {
  const home = tmpdir('bootstrap-home-settings-merge')
  await withHome(home, async () => {
    writeSettings(home, { model: 'opus', enabledPlugins: { 'spec@555-tools': true } })
    const reposRoot = tmpdir('bootstrap-repos-merge')

    const deps = {
      enroll: async (opts) => ({ spokeId: 'sp_1', machineName: opts.machineName, projectCount: 0, configPath: 'x' }),
      discover: async () => [],
      service: async () => ({ ok: true }),
      doctor: async () => ({ ok: true, lines: [] }),
    }

    await runBootstrap({ args: { hubUrl: 'https://hub.example.test', code: 'C1', reposRoot, force: false }, deps })

    const output = readSettings(home)
    assert.strictEqual(output.model, 'opus',
      'an unrelated top-level key (model) must survive the merge byte-identical, or the plugin-enable step clobbers unrelated settings')
    assert.strictEqual(output.enabledPlugins['spec@555-tools'], true,
      'a pre-existing sibling plugin enablement must survive the merge, or enabling autopilot silently disables another plugin')
    assert.strictEqual(output.enabledPlugins['autopilot@555-tools'], true,
      'the merge must add enabledPlugins["autopilot@555-tools"]:true or the Stop hook never wires up (D8)')
    const marketplace = output.extraKnownMarketplaces && output.extraKnownMarketplaces['555-tools']
    assert.ok(marketplace, 'the merge must add an extraKnownMarketplaces["555-tools"] entry or the plugin cannot be resolved')
    assert.strictEqual(marketplace.source && marketplace.source.source, 'directory',
      `the marketplace entry must use source.source "directory" (D8, shape copied from a live settings file); got ${JSON.stringify(marketplace)}`)
    assert.ok(typeof marketplace.source.path === 'string' && marketplace.source.path.length > 0,
      'the marketplace entry must carry a non-empty checkout path')
  })
})

test('AC-20260810-05-9: runBootstrap fails with a remedy and leaves an unparseable settings.json byte-identical, writing nothing, when hub.json does not yet exist', async () => {
  const home = tmpdir('bootstrap-home-settings-bad')
  await withHome(home, async () => {
    const badContent = '{not valid json'
    const settingsPath = path.join(home, '.claude')
    fs.mkdirSync(settingsPath, { recursive: true })
    fs.writeFileSync(path.join(settingsPath, 'settings.json'), badContent)
    const reposRoot = tmpdir('bootstrap-repos-badsettings')

    let doctorCalled = false
    const deps = {
      enroll: async (opts) => ({ spokeId: 'sp_1', machineName: opts.machineName, projectCount: 0, configPath: 'x' }),
      discover: async () => [],
      service: async () => ({ ok: true }),
      doctor: async () => { doctorCalled = true; return { ok: true, lines: [] } },
    }

    let threw = null
    let result = null
    try {
      result = await runBootstrap({ args: { hubUrl: 'https://hub.example.test', code: 'C1', reposRoot, force: false }, deps })
    } catch (err) {
      threw = err
    }

    const message = threw ? threw.message : JSON.stringify(result)
    assert.match(message, /settings\.json/i,
      `an unparseable settings.json must fail naming settings.json as a remedy, not silently succeed or crash unreadably; got ${message}`)
    assert.strictEqual(doctorCalled, false,
      'doctor must never run after the plugin-enable step fails to parse settings.json — a hard failure must stop the sequence (D7)')
    assert.strictEqual(fs.readFileSync(path.join(settingsPath, 'settings.json'), 'utf8'), badContent,
      'an unparseable settings.json must be left byte-identical — the merge must never overwrite a file it could not parse')
  })
})

test('AC-20260810-05-10: runBootstrap stops at the first hard failure — a failing service-install step surfaces that step\'s own message and doctor is never invoked', async () => {
  const home = tmpdir('bootstrap-home-svc-fail')
  await withHome(home, async () => {
    writeSettings(home, {})
    const reposRoot = tmpdir('bootstrap-repos-svcfail')

    let doctorCalled = false
    const deps = {
      enroll: async (opts) => ({ spokeId: 'sp_2', machineName: opts.machineName, projectCount: 0, configPath: 'x' }),
      discover: async () => [],
      service: async () => { throw new Error('systemctl --user daemon-reload failed: unit not found') },
      doctor: async () => { doctorCalled = true; return { ok: true, lines: [] } },
    }

    let threw = null
    let result = null
    try {
      result = await runBootstrap({ args: { hubUrl: 'https://hub.example.test', code: 'C2', reposRoot, force: false }, deps })
    } catch (err) {
      threw = err
    }

    assert.strictEqual(doctorCalled, false,
      'doctor must never run after a service-install failure — the first hard failure must stop the sequence (D7), or a broken install still gets a healthy-looking doctor report')
    const message = threw ? threw.message : JSON.stringify(result)
    assert.match(message, /systemctl --user daemon-reload failed: unit not found/,
      `the failure must surface the service-install step's own message verbatim (D7: "stops with that step's own message"), not a generic error; got ${message}`)
  })
})

test('AC-20260810-05-10: runBootstrap re-run with hub.json present and no --force invokes no enroll (the D7 pre-check, never EnrollError string-matching) and reports "= already enrolled"', async () => {
  const home = tmpdir('bootstrap-home-reenroll')
  await withHome(home, async () => {
    const cfgDir = path.join(home, '.config', 'autopilot')
    fs.mkdirSync(cfgDir, { recursive: true })
    fs.writeFileSync(path.join(cfgDir, 'hub.json'), JSON.stringify({
      hubUrl: 'https://hub.example.test', spokeId: 'sp_existing', token: 'tok', machineName: 'box-1',
      projects: [], reposRoot: tmpdir('bootstrap-repos-reenroll'), contractVersion: 1, enrolledAt: new Date().toISOString(),
    }))
    writeSettings(home, {})

    let enrollCalled = false
    const deps = {
      enroll: async () => { enrollCalled = true; return { spokeId: 'should-not-happen' } },
      discover: async () => [],
      service: async () => ({ ok: true }),
      doctor: async () => ({ ok: true, lines: [] }),
    }

    const result = await runBootstrap({
      args: { hubUrl: 'https://hub.example.test', code: 'C-unused', force: false },
      deps,
    })

    assert.strictEqual(enrollCalled, false,
      'a re-run with hub.json present and no --force must invoke no enroll — the pre-check (D7) must catch this before any network-bearing step, or a re-run burns a fresh one-time code and mints a duplicate spoke identity')
    const rendered = JSON.stringify(result).toLowerCase()
    assert.match(rendered, /already enrolled/,
      `runBootstrap must report "= already enrolled" on this pre-check path (D7) or an operator cannot tell why enroll was skipped; got ${JSON.stringify(result)}`)
    assert.match(rendered, /sp_existing/,
      `the already-enrolled report must name the existing spokeId or an operator cannot confirm which identity is live; got ${JSON.stringify(result)}`)
  })
})

function runCli(args, home) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [AUTOPILOT_BIN, ...args], {
      env: { ...process.env, HOME: home, USERPROFILE: home },
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGTERM'), 5000)
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    child.on('close', (code) => { clearTimeout(timer); resolve({ status: code, stdout, stderr }) })
  })
}

test('AC-20260810-05-13: autopilot service/doctor/bootstrap invoked with a bad flag or missing value exit 2 printing subcommand-specific usage, and autopilot enroll\'s exit alphabet stays 0/1/2', async () => {
  const home1 = tmpdir('bootstrap-cli-home-service')
  const badService = await runCli(['service', 'frobnicate'], home1)
  assert.strictEqual(badService.status, 2,
    `an unrecognized "autopilot service" verb must exit 2; got status=${badService.status} stderr=${badService.stderr}`)
  assert.match(badService.stderr, /usage: autopilot service/,
    `stderr must print service-specific usage, not the generic enroll usage line, or an operator sees the wrong flags; got ${badService.stderr}`)

  const home2 = tmpdir('bootstrap-cli-home-doctor')
  const badDoctor = await runCli(['doctor', '--nope'], home2)
  assert.strictEqual(badDoctor.status, 2,
    `"autopilot doctor" with an unrecognized flag must exit 2; got status=${badDoctor.status} stderr=${badDoctor.stderr}`)
  assert.match(badDoctor.stderr, /usage: autopilot doctor/,
    `stderr must print doctor-specific usage; got ${badDoctor.stderr}`)

  const home3 = tmpdir('bootstrap-cli-home-bootstrap')
  const badBootstrap = await runCli(['bootstrap', '--code', 'C'], home3) // missing required --hub
  assert.strictEqual(badBootstrap.status, 2,
    `"autopilot bootstrap" missing --hub must exit 2; got status=${badBootstrap.status} stderr=${badBootstrap.stderr}`)
  assert.match(badBootstrap.stderr, /usage: autopilot bootstrap/,
    `stderr must print bootstrap-specific usage naming --hub/--code, or an operator cannot tell what's missing; got ${badBootstrap.stderr}`)

  const home4 = tmpdir('bootstrap-cli-home-enroll')
  const missingHubEnroll = await runCli(['enroll', '--code', 'C'], home4)
  assert.strictEqual(missingHubEnroll.status, 2,
    `autopilot enroll's exit alphabet must stay 0/1/2 (AC-13: "SHALL CONTINUE to be") — a missing --hub must still exit 2 after this spec lands; got status=${missingHubEnroll.status} stderr=${missingHubEnroll.stderr}`)
})
