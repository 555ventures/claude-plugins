'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, ROOT } = require('../helpers')

// spec: specs/20260810/04-hub-wired-daemon.md — pins AC-20260810-04-8, -9, -12 for the
// daemon's rewritten config loader (autopilot/daemon/config.js, D7). Direct-Telegram config
// (botToken/supergroupId/allowedUserIds/topicId, AC-20260801-03-8) is deleted per D1 — this
// file now exercises only loadHubConfig({hubConfigPath, overridesPath}), which boots from
// hub.json + spec-03 discovery instead of a hand-written config.json. loadHubConfig does not
// exist yet, so every test here fails at require() time until autopilot/daemon/config.js is
// rewritten.
const CONFIG_PATH = path.join(__dirname, '..', '..', 'autopilot', 'daemon', 'config.js')
const { loadHubConfig } = require(CONFIG_PATH)

function groundRepo(reposRoot, name) {
  const root = path.join(reposRoot, name)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude', 'spec.config.json'), '{}')
  return root
}

function writeHubJson(dir, overrides = {}) {
  const hubConfigPath = path.join(dir, 'hub.json')
  const cfg = Object.assign({
    hubUrl: 'https://hub.example.test',
    spokeId: 'spoke_1',
    token: 'tok_1',
    machineName: 'test-box',
    projects: [],
    reposRoot: path.join(dir, 'repos'),
    contractVersion: 1,
    enrolledAt: new Date().toISOString(),
  }, overrides)
  fs.writeFileSync(hubConfigPath, JSON.stringify(cfg))
  return { hubConfigPath, cfg }
}

function writeOverrides(dir, obj) {
  const overridesPath = path.join(dir, 'config.json')
  fs.writeFileSync(overridesPath, JSON.stringify(obj))
  return overridesPath
}

test('AC-20260810-04-8: loadHubConfig throws naming autopilot enroll as the remedy when hub.json is absent', () => {
  const dir = tmpdir('config-ac8-missing-hub')
  const missingPath = path.join(dir, 'hub.json')
  assert.throws(
    () => loadHubConfig({ hubConfigPath: missingPath, overridesPath: path.join(dir, 'config.json') }),
    (err) => {
      assert.match(err.message, /autopilot enroll/,
        'a box with no hub.json must be told to run "autopilot enroll" or an operator has no remedy for a silent boot failure')
      return true
    },
    'loadHubConfig must fail loud when hub.json is missing (AC-8) or a freshly-cloned box boots with no lanes and no explanation',
  )
})

test('AC-20260810-04-8: loadHubConfig returns discovered lanes with pollSeconds 300 and checkout-derived specPluginRoot/pluginPaths when no overrides file exists', () => {
  const dir = tmpdir('config-ac8-valid')
  fs.mkdirSync(path.join(dir, 'repos'))
  const reposRoot = path.join(dir, 'repos')
  const aliceRoot = groundRepo(reposRoot, 'alice')
  const { hubConfigPath } = writeHubJson(dir, { reposRoot })
  const missingOverridesPath = path.join(dir, 'config.json') // deliberately never written

  const cfg = loadHubConfig({ hubConfigPath, overridesPath: missingOverridesPath })

  assert.strictEqual(cfg.lanes.length, 1,
    'the one grounded repo under reposRoot must produce exactly one lane or discovery silently dropped/duplicated a project')
  const lane = cfg.lanes[0]
  assert.strictEqual(lane.project, 'alice',
    'the lane\'s project name must be the discovered directory basename or lane wiring desynced from discovery')
  assert.strictEqual(lane.root, aliceRoot,
    'the lane\'s root must be the discovered repo path or the lane points at the wrong checkout')
  assert.strictEqual(lane.pollSeconds, 300,
    'a lane with no override must fall back to the documented 300s default or an un-overridden project silently polls at the wrong cadence')
  assert.strictEqual(cfg.specPluginRoot, path.join(ROOT, 'spec'),
    'specPluginRoot must derive to <checkout>/spec (D7) or the oracle script path resolves to the wrong tree')
  assert.deepStrictEqual(cfg.pluginPaths, [path.join(ROOT, 'spec'), path.join(ROOT, 'git')],
    'pluginPaths must derive to [<checkout>/spec, <checkout>/git] (D7) or a lane\'s session boots with the wrong plugin set')
})

test('AC-20260810-04-9: loadHubConfig applies an overrides entry to only the named lane', () => {
  const dir = tmpdir('config-ac9-scoped')
  const reposRoot = path.join(dir, 'repos')
  fs.mkdirSync(reposRoot)
  groundRepo(reposRoot, 'prax')
  groundRepo(reposRoot, 'atlas')
  const { hubConfigPath } = writeHubJson(dir, { reposRoot })
  const overridesPath = writeOverrides(dir, {
    prax: { pollSeconds: 60, devServerCommand: 'npm run dev' },
  })

  const cfg = loadHubConfig({ hubConfigPath, overridesPath })

  const prax = cfg.lanes.find((l) => l.project === 'prax')
  const atlas = cfg.lanes.find((l) => l.project === 'atlas')
  assert.strictEqual(prax.pollSeconds, 60,
    'an overridden project must take the overrides file\'s pollSeconds or per-project tuning is silently ignored')
  assert.strictEqual(prax.devServerCommand, 'npm run dev',
    'an overridden project must take the overrides file\'s devServerCommand or the lane cannot boot its dev server')
  assert.strictEqual(atlas.pollSeconds, 300,
    'an un-overridden lane must keep the 300s default or one project\'s override leaked onto a sibling lane')
  assert.strictEqual(atlas.devServerCommand, undefined,
    'an un-overridden lane must carry no devServerCommand or one project\'s override leaked onto a sibling lane')
})

// spec: specs/20260817/06-overrides-legacy-keys.md D1/D2 — the pre-0.9.0 direct-Telegram
// config (botToken/supergroupId/allowedUserIds/lanes) and the `_comment` annotation
// convention (config.example.json ships one) must not be mistaken for lane-override
// project names by loadHubConfig's overrides key walk. Observed live 2026-08-17: this
// machine's own ~/.config/autopilot/config.json crashed boot with `unknown project
// "botToken"` and the wrong remedy.
test('AC-20260817-06-1: loadHubConfig skips the four retired direct-Telegram host keys (never treating them as project names), still applies a valid per-project override entry beside them, and prints exactly one stderr warning naming every retired key found', (t) => {
  const dir = tmpdir('config-ac1-legacy')
  const reposRoot = path.join(dir, 'repos')
  fs.mkdirSync(reposRoot)
  groundRepo(reposRoot, 'prax')
  const { hubConfigPath } = writeHubJson(dir, { reposRoot })
  const overridesPath = writeOverrides(dir, {
    botToken: 'legacy-token',
    supergroupId: -100123456,
    allowedUserIds: [111, 222],
    lanes: [{ project: 'old-shape' }],
    prax: { pollSeconds: 60 },
  })

  const errSpy = t.mock.method(console, 'error', () => {})
  const cfg = loadHubConfig({ hubConfigPath, overridesPath })

  const prax = cfg.lanes.find((l) => l.project === 'prax')
  assert.ok(prax,
    `a legacy-shaped overrides file must still boot with the discovered lane set, or a valid project silently disappears when legacy keys are present; got lanes=${JSON.stringify(cfg.lanes)}`)
  assert.strictEqual(prax.pollSeconds, 60,
    'the valid per-project override entry sitting beside the legacy keys must still apply its pollSeconds, or a legacy-shaped config silently loses real per-project tuning')

  assert.strictEqual(errSpy.mock.calls.length, 1,
    `loadHubConfig must print exactly one stderr warning for the whole legacy-key set per invocation (D1), never one per key or silence; got ${errSpy.mock.calls.length} console.error call(s)`)
  const warning = errSpy.mock.calls[0].arguments.join(' ')
  for (const key of ['botToken', 'supergroupId', 'allowedUserIds', 'lanes']) {
    assert.match(warning, new RegExp(key),
      `the single warning must name every retired key found in the file (missing: ${key}) or an operator migrating a legacy config can't tell which keys to delete; got: ${warning}`)
  }
})

// spec: specs/20260817/06-overrides-legacy-keys.md D2 — `_`-prefixed keys (the
// config.example.json `_comment` annotation convention) must be silently invisible to
// loadHubConfig: no warning (that's D1's channel, reserved for the four legacy keys) and
// no effect on the returned config.
test('AC-20260817-06-2: loadHubConfig ignores a `_comment` top-level key silently — no stderr warning, no error, and a return identical to the same config without the key', (t) => {
  const dir = tmpdir('config-ac2-underscore')
  const reposRoot = path.join(dir, 'repos')
  fs.mkdirSync(reposRoot)
  groundRepo(reposRoot, 'prax')
  const { hubConfigPath } = writeHubJson(dir, { reposRoot })

  const withCommentPath = writeOverrides(dir, {
    _comment: 'this file is optional; per-project keys override the defaults below',
    prax: { pollSeconds: 60 },
  })
  const errSpy = t.mock.method(console, 'error', () => {})
  const cfgWithComment = loadHubConfig({ hubConfigPath, overridesPath: withCommentPath })
  assert.strictEqual(errSpy.mock.calls.length, 0,
    `a \`_comment\` key must never trigger the legacy-key stderr warning (D2 is silent, not a variant of D1's warning) or the example config itself would crash-warn on every boot; got ${errSpy.mock.calls.length} console.error call(s)`)

  // Same fixture, only the overrides file differs — building the baseline from a second
  // tmpdir made the compared lane roots structurally different absolute paths, so the
  // equality below could never pass for ANY implementation (build-time fixture repair,
  // 2026-08-17: orchestrator ruling on the worker's blocked return).
  const withoutCommentPath = path.join(dir, 'overrides-baseline.json')
  fs.writeFileSync(withoutCommentPath, JSON.stringify({ prax: { pollSeconds: 60 } }))
  const cfgWithoutComment = loadHubConfig({ hubConfigPath, overridesPath: withoutCommentPath })

  assert.strictEqual(
    JSON.stringify(cfgWithComment.lanes),
    JSON.stringify(cfgWithoutComment.lanes),
    `the \`_comment\` key must have zero effect on the returned lanes — a config that only differs by an annotation key must resolve identically; got with=${JSON.stringify(cfgWithComment.lanes)} without=${JSON.stringify(cfgWithoutComment.lanes)}`)
})

test('AC-20260810-04-9 / AC-20260817-06-3 (CONTINUE TO): loadHubConfig throws naming the offending key and the repos root when an overrides entry names no discovered project, no host-override field, no `_`-prefix, and no legacy direct-Telegram field', () => {
  const dir = tmpdir('config-ac9-typo')
  const reposRoot = path.join(dir, 'repos')
  fs.mkdirSync(reposRoot)
  groundRepo(reposRoot, 'prax')
  const { hubConfigPath } = writeHubJson(dir, { reposRoot })
  const overridesPath = writeOverrides(dir, {
    praxx: { pollSeconds: 60 }, // typo — not a discovered project
  })

  assert.throws(
    () => loadHubConfig({ hubConfigPath, overridesPath }),
    (err) => {
      assert.match(err.message, /praxx/,
        'the error must name the offending overrides key or an operator cannot find their typo')
      assert.ok(err.message.includes(reposRoot),
        'the error must name the repos root that was scanned or an operator cannot tell where discovery looked')
      return true
    },
    'an overrides key naming no discovered project must throw (typo guard, AC-9) or a misspelled project name silently configures nothing',
  )
})

// Review finding, specs/20260810/04-hub-wired-daemon.md D7 (Contracts: host-level overrides
// {specPluginRoot, pluginPaths, reposRoot}): a host-level reposRoot override must steer WHICH
// directory discovery actually scans, not just relabel the return value after discovery already
// ran against hub.json's persisted reposRoot — the bug this pins is exactly that ordering
// mistake (overrides read after discovery instead of before it).
test('D7 (host-level reposRoot override): loadHubConfig discovers lanes from the overrides file\'s reposRoot, not hub.json\'s persisted reposRoot, and reports cfg.reposRoot as the overridden value', () => {
  const dir = tmpdir('config-reposroot-override')
  const rootA = path.join(dir, 'rootA')
  const rootB = path.join(dir, 'rootB')
  fs.mkdirSync(rootA)
  fs.mkdirSync(rootB)
  groundRepo(rootA, 'projA')
  groundRepo(rootB, 'projB')
  const { hubConfigPath } = writeHubJson(dir, { reposRoot: rootA })
  const overridesPath = writeOverrides(dir, { reposRoot: rootB })

  const cfg = loadHubConfig({ hubConfigPath, overridesPath })

  assert.strictEqual(cfg.reposRoot, rootB,
    `cfg.reposRoot must report the overridden reposRoot (rootB), not hub.json's persisted reposRoot (rootA), or a caller reading cfg.reposRoot back is told the wrong directory was scanned; got ${cfg.reposRoot}`)
  assert.strictEqual(cfg.lanes.length, 1,
    `discovery must have run against rootB (one grounded repo, projB), not rootA — a length other than 1 means the override reposRoot was ignored or both roots got merged; got ${cfg.lanes.length} lanes: ${JSON.stringify(cfg.lanes.map((l) => l.project))}`)
  assert.strictEqual(cfg.lanes[0].project, 'projB',
    `the discovered lane must be projB (from rootB, the override) — seeing projA here means discovery scanned hub.json's reposRoot instead of the overrides file's; got ${JSON.stringify(cfg.lanes.map((l) => l.project))}`)
  assert.ok(!cfg.lanes.some((l) => l.project === 'projA'),
    `projA (rootA, hub.json's un-overridden reposRoot) must NOT appear as a lane once a host-level reposRoot override is present, or an operator moving a fleet box's repo layout ends up polling stale/wrong directories alongside the new ones; got ${JSON.stringify(cfg.lanes.map((l) => l.project))}`)
})

test('AC-20260810-04-12: loadHubConfig performs zero network calls (injected-transport leg of the offline preflight guarantee)', () => {
  const dir = tmpdir('config-ac12-offline')
  const reposRoot = path.join(dir, 'repos')
  fs.mkdirSync(reposRoot)
  groundRepo(reposRoot, 'alice')
  const { hubConfigPath } = writeHubJson(dir, { reposRoot })
  const overridesPath = path.join(dir, 'config.json') // never written

  const originalFetch = global.fetch
  global.fetch = () => {
    throw new Error('network call attempted during config load — --check\'s offline guarantee is broken')
  }
  try {
    const cfg = loadHubConfig({ hubConfigPath, overridesPath })
    assert.strictEqual(cfg.lanes.length, 1,
      'loadHubConfig must still return the discovered lane while global.fetch is a throwing stub, or it is not actually offline (AC-12)')
  } finally {
    global.fetch = originalFetch
  }
})
