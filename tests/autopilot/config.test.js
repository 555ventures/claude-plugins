'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')

// spec: specs/20260801/03-lane-engine.md — pins AC-20260801-03-8 for the daemon's per-host
// config loader (autopilot/daemon/config.js, D3). loadConfig({configPath}) is the pure
// validation surface: it reads+validates the JSON and throws a descriptive Error naming the
// problem field/projects and the config path (D3's fail-loud-with-remedy contract); the exit
// 2 + stderr rendering the AC's literal wording describes is bin/autopilotd's job (a separate
// file, not under test here — see tests/autopilot/lane.test.js AC-10 for the process-exit
// boundary). The module does not exist yet, so every test here fails at require() time until
// autopilot/daemon/config.js lands.
const CONFIG_PATH = path.join(__dirname, '..', '..', 'autopilot', 'daemon', 'config.js')
const { loadConfig } = require(CONFIG_PATH)

function validConfig(overrides = {}) {
  return Object.assign({
    botToken: 'TEST:TOKEN',
    supergroupId: -1001234567890,
    allowedUserIds: [111],
    specPluginRoot: '/abs/path/spec',
    pluginPaths: ['/abs/path/spec'],
    lanes: [
      { project: 'prax', root: '/abs/prax', topicId: 7 },
    ],
  }, overrides)
}

function writeConfig(dir, cfg) {
  const configPath = path.join(dir, 'config.json')
  fs.writeFileSync(configPath, JSON.stringify(cfg))
  return configPath
}

test('AC-20260801-03-8: loadConfig throws naming the missing field and the config path when botToken is absent', () => {
  const dir = tmpdir('config-ac8-missing')
  const cfg = validConfig()
  delete cfg.botToken
  const configPath = writeConfig(dir, cfg)
  assert.throws(
    () => loadConfig({ configPath }),
    (err) => {
      assert.match(err.message, /config missing "botToken"/,
        'the error must name the exact missing field or an operator cannot find the misconfiguration')
      assert.ok(err.message.includes(configPath),
        'the error must name the config path (the remedy target) or the operator does not know which file to edit')
      assert.match(err.message, /^autopilotd: config missing "botToken"/,
        'AC-20260801-03-8: the error must carry the literal "autopilotd: " prefix before "config missing" or the daemon\'s own error-naming convention silently drops, leaving an operator unable to tell which process emitted the failure')
      return true
    },
    'loadConfig must fail loud on a missing required field (AC-8) or a misconfigured daemon starts silently broken',
  )
})

test('AC-20260801-03-8: loadConfig throws naming both offending projects when two lanes share a topicId', () => {
  const dir = tmpdir('config-ac8-topic')
  const cfg = validConfig({
    lanes: [
      { project: 'prax', root: '/abs/prax', topicId: 7 },
      { project: 'atlas', root: '/abs/atlas', topicId: 7 },
    ],
  })
  const configPath = writeConfig(dir, cfg)
  assert.throws(
    () => loadConfig({ configPath }),
    (err) => {
      assert.match(err.message, /prax/,
        'the error must name the first project sharing the topicId or the operator cannot locate the conflict')
      assert.match(err.message, /atlas/,
        'the error must name the second project sharing the topicId or the operator cannot locate the conflict')
      return true
    },
    'a duplicate topicId must be rejected (one-ask-per-topic is load-bearing per D3\'s rationale) or two lanes silently share one Telegram topic',
  )
})

test('AC-20260801-03-8: loadConfig throws naming both offending projects when two lanes share a root', () => {
  const dir = tmpdir('config-ac8-root')
  const cfg = validConfig({
    lanes: [
      { project: 'prax', root: '/abs/shared-repo', topicId: 7 },
      { project: 'atlas', root: '/abs/shared-repo', topicId: 8 },
    ],
  })
  const configPath = writeConfig(dir, cfg)
  assert.throws(
    () => loadConfig({ configPath }),
    (err) => {
      assert.match(err.message, /prax/,
        'the error must name the first project sharing the root or the operator cannot locate the conflict')
      assert.match(err.message, /atlas/,
        'the error must name the second project sharing the root or the operator cannot locate the conflict')
      return true
    },
    'a duplicate root must be rejected (one-lane-per-repo is load-bearing per D1/D3) or two lanes race writes against the same repo',
  )
})

test('AC-20260801-03-8: loadConfig returns a valid config object unchanged when every field is present and no lane conflicts exist', () => {
  const dir = tmpdir('config-ac8-valid')
  const cfg = validConfig()
  const configPath = writeConfig(dir, cfg)
  const loaded = loadConfig({ configPath })
  assert.strictEqual(loaded.botToken, cfg.botToken,
    'a fully valid config must load successfully or every correctly-configured host fails to boot')
  assert.strictEqual(loaded.lanes.length, 1,
    'a fully valid config\'s lanes must round-trip intact or lane wiring silently drops projects')
})
