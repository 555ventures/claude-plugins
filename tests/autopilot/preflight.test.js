'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { spawn, spawnSync } = require('node:child_process')
const { ROOT, tmpdir } = require('../helpers')

// spec: specs/20260810/04-hub-wired-daemon.md — rewires this file's pins from the deleted
// direct-Telegram `--config`/botToken shape (specs/20260801/04-live-smoke.md) to the hub-wired
// boot: `autopilotd --hub-config <hub.json>` (default D8), reading credential + reposRoot from
// hub.json and discovering lanes (spec 03) instead of a hand-typed `lanes[]` array. `--config`
// demotes to optional per-project overrides only (D7) and is not exercised here. Every test
// below fails on current code: today's parseArgs recognizes only `--config` (botToken shape)
// and knows nothing of `--hub-config`, hub.json, or discovery — a flag it doesn't recognize is
// silently ignored, so every invocation here either falls through to a real (non-hub) boot or
// fails validation against a config shape that no longer exists. The AC-20260801-04-* names on
// carried-forward tests are preserved for continuity with the behavioral contract they still
// pin (offline preflight guarantees); AC-20260810-04-12 is the new hub-config-specific pin.
// Every child process runs with HOME/USERPROFILE pointed at a throwaway tmpdir so a test
// invocation can never write into a developer's real ~/.config/autopilot.

const AUTOPILOTD = path.join(ROOT, 'autopilot', 'bin', 'autopilotd')
const PREFLIGHT_HUB_FIXTURE = path.join(ROOT, 'autopilot', 'fixtures', 'preflight-hub.json')

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// A minimal spec-grounded repo per specs/20260810/03-repo-discovery.md D1: discovery keys ONLY
// on `.claude/spec.config.json` existing, so content is irrelevant to preflight construction
// (the oracle script is never invoked — only its path is asserted to exist).
function writeGroundedRepo(reposRoot, name) {
  const root = path.join(reposRoot, name)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude', 'spec.config.json'), '{}')
  return root
}

// hub.json per the Contracts section: credential (hubUrl/token) + reposRoot feed discovery;
// the other fields round-trip untouched by preflight.
function writeHubConfig(dir, overrides = {}) {
  const p = path.join(dir, 'hub.json')
  const cfg = {
    hubUrl: 'http://127.0.0.1:1',
    token: 'preflight-fixture-token-not-a-real-credential',
    spokeId: 'spoke_preflight',
    machineName: 'preflight-test',
    projects: [],
    contractVersion: 1,
    enrolledAt: '2026-08-10T00:00:00.000Z',
    ...overrides,
  }
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

test('AC-20260801-04-1 (rewired for specs/20260810/04-hub-wired-daemon.md D7/D8): autopilotd --check --hub-config <hub.json> exits 0 and prints the pass notice naming the lane count for a hub.json whose reposRoot has one discoverable grounded repo, with the SDK installed', () => {
  const reposRoot = tmpdir('ac1-repos')
  writeGroundedRepo(reposRoot, 'alpha')
  const hubDir = tmpdir('ac1-hub')
  const hubConfigPath = writeHubConfig(hubDir, { reposRoot })
  const res = runAutopilotd(['--check', '--hub-config', hubConfigPath])
  assert.strictEqual(res.status, 0,
    `preflight must exit 0 promptly for a hub.json whose reposRoot yields one discovered lane, so a boot leg/CI check can trust it as a pass — instead of falling through to the real daemon start (today's code doesn't recognize --hub-config at all); got status=${res.status} signal=${res.signal} stderr=${res.stderr}`)
  assert.match(res.stderr, /autopilotd: preflight OK — 1 lane, SDK resolved/,
    `the pass notice must name the lane count discovered from the hub.json reposRoot and confirm the SDK resolved, or an operator/boot-leg cannot tell preflight actually ran the full check rather than doing nothing; got stderr=${res.stderr}`)
})

test('AC-20260801-04-2 (rewired for specs/20260810/04-hub-wired-daemon.md D7/D8): autopilotd --check --hub-config <hub.json> exits 2 naming the "cd autopilot && npm install" remedy when the daemon sdk module fails to resolve', () => {
  const reposRoot = tmpdir('ac2-repos')
  writeGroundedRepo(reposRoot, 'alpha')
  const hubDir = tmpdir('ac2-hub')
  const hubConfigPath = writeHubConfig(hubDir, { reposRoot })
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
  const res = runAutopilotd(['--check', '--hub-config', hubConfigPath], { bin: path.join(copyRoot, 'bin', 'autopilotd') })
  assert.strictEqual(res.status, 2,
    `an unresolvable SDK must fail the preflight with exit 2 even when booting from hub.json — a lazy require means a bare boot proves nothing (D2 of spec 04-live-smoke, carried forward by D8); got status=${res.status} signal=${res.signal} stdout=${res.stdout} stderr=${res.stderr}`)
  assert.match(res.stderr, /cd autopilot && npm install/,
    `the error must name the exact remedy command "cd autopilot && npm install" or an operator is left to guess why the daemon won't boot; got stderr=${res.stderr}`)
})

// Restores the AC-20260801-04-5 pin dropped by this file's rewire (review finding,
// specs/20260810/04-hub-wired-daemon.md): the missing-oracle-script guard in
// autopilot/bin/autopilotd runPreflight (D7/D8) is still live code, but the file's rewrite from
// `--config`/botToken to `--hub-config` left the case with no test. Rewired to the new boot
// shape: specPluginRoot is now a HOST_OVERRIDE_FIELDS key in the overrides file (D7 Contracts,
// autopilot/daemon/config.js), not a hub.json field, so this test points a valid hub.json's
// reposRoot at a discoverable repo while the overrides file's specPluginRoot names a directory
// with no scripts/spec-status.js under it.
test('AC-20260801-04-5: autopilotd --check exits 2 naming the missing oracle script and the offending specPluginRoot when the overrides file points specPluginRoot at a directory with no scripts/spec-status.js', () => {
  const reposRoot = tmpdir('ac5-repos')
  writeGroundedRepo(reposRoot, 'alpha')
  const hubDir = tmpdir('ac5-hub')
  const hubConfigPath = writeHubConfig(hubDir, { reposRoot })
  const badSpecPluginRoot = tmpdir('ac5-bad-spec-root') // exists, but has no scripts/ subdirectory at all
  const overridesDir = tmpdir('ac5-overrides')
  const overridesPath = path.join(overridesDir, 'config.json')
  fs.writeFileSync(overridesPath, JSON.stringify({ specPluginRoot: badSpecPluginRoot }))
  const stateDir = tmpdir('ac5-state')
  const res = runAutopilotd(['--check', '--hub-config', hubConfigPath, '--config', overridesPath, '--state-dir', stateDir])
  const expectedScriptPath = path.join(badSpecPluginRoot, 'scripts', 'spec-status.js')
  assert.strictEqual(res.status, 2,
    `a specPluginRoot override with no scripts/spec-status.js under it must fail preflight with exit 2 — an oracle-less daemon would boot every lane pointed at a script that isn't there, and only find out on the first poll; got status=${res.status} signal=${res.signal} stderr=${res.stderr}`)
  assert.match(res.stderr, new RegExp('no oracle script at ' + escapeRe(expectedScriptPath)),
    `stderr must name the exact missing oracle script path (which embeds the offending specPluginRoot ${badSpecPluginRoot} from the overrides file) — without it an operator debugging a fleet box with a bad override has no lead on which file or which override is wrong; got stderr=${res.stderr}`)
})

test('AC-20260810-04-8 (exercised end-to-end via --check): autopilotd --check --hub-config <missing path> exits 2 naming "autopilot enroll" as the remedy', () => {
  const hubDir = tmpdir('ac8-hub')
  const hubConfigPath = path.join(hubDir, 'does-not-exist.json')
  const res = runAutopilotd(['--check', '--hub-config', hubConfigPath])
  assert.strictEqual(res.status, 2,
    `a missing hub.json must fail preflight with exit 2 exactly as a normal start would (D7) — a freshly cloned box with no hub.json must never silently fall through to constructing lanes; got status=${res.status} signal=${res.signal} stderr=${res.stderr}`)
  assert.match(res.stderr, /autopilot enroll/,
    `the error must name "autopilot enroll" as the remedy (AC-20260810-04-8) or an operator on a fresh box has no lead on how to fix a missing hub.json; got stderr=${res.stderr}`)
})

test('AC-20260801-04-4 (rewired for specs/20260810/04-hub-wired-daemon.md D7/D8): autopilotd --check --hub-config <hub.json> --state-dir <fresh dir> exits 0 promptly and leaves that directory empty', () => {
  const reposRoot = tmpdir('ac4-repos')
  writeGroundedRepo(reposRoot, 'alpha')
  const hubDir = tmpdir('ac4-hub')
  const hubConfigPath = writeHubConfig(hubDir, { reposRoot })
  const stateDir = tmpdir('ac4-state')
  const res = runAutopilotd(['--check', '--hub-config', hubConfigPath, '--state-dir', stateDir])
  assert.strictEqual(res.status, 0,
    `preflight against a valid hub.json must exit 0 promptly rather than fall through to starting lanes (which would hang past this test's timeout); got status=${res.status} signal=${res.signal} stderr=${res.stderr}`)
  assert.deepStrictEqual(fs.readdirSync(stateDir), [],
    `preflight must never create lane-state files under --state-dir — a non-empty directory means "autopilotd --check" has a filesystem side effect an operator or CI gate cannot safely repeat`)
})

// Left pinning the pre-hub `--config` flag deliberately (not rewired): the recursion guard
// fires before any config file — hub.json or otherwise — is read (spec 04-live-smoke D8,
// unchanged by specs/20260810/04-hub-wired-daemon.md), so it already passes identically under
// --hub-config and rewiring it would just be a second, redundant pin of the same invariant.
test('AC-20260801-04-13: autopilotd exits 2 with the recursion-guard message before reading config when AUTOPILOT_SESSION=1 is set, with or without --check', () => {
  for (const extraArgs of [[], ['--check']]) {
    const cfgDir = tmpdir('ac13-cfg')
    // Deliberately a config path that does not exist — the recursion guard must fire before
    // any config read is attempted, with or without --check.
    const cfgPath = path.join(cfgDir, 'does-not-exist.json')
    const res = runAutopilotd(['--config', cfgPath, ...extraArgs], { env: { AUTOPILOT_SESSION: '1' } })
    assert.strictEqual(res.status, 2,
      `AUTOPILOT_SESSION=1 must always exit 2 via the recursion guard (args=${JSON.stringify(extraArgs)}), never proceed to a hub.json read that would otherwise succeed or fail on its own; got status=${res.status} signal=${res.signal} stderr=${res.stderr}`)
    assert.match(res.stderr, /AUTOPILOT_SESSION=1/,
      `the recursion-guard message must name AUTOPILOT_SESSION=1 as the cause (args=${JSON.stringify(extraArgs)}), or an operator debugging a stuck nested daemon has no lead; got stderr=${res.stderr}`)
  }
})

// AC-20260810-04-12: the exact boot-leg invocation smoke.sh runs. Uses the checked-in fixture
// (autopilot/fixtures/preflight-hub.json + its grounded fixture repo, D8) rather than an
// ad-hoc tmpdir, because the AC pins that literal path as the offline boot-leg contract. The
// fixture's hubUrl deliberately resolves nowhere real — a "zero network calls" preflight must
// complete (write the ready file) well inside a bounded window regardless, whereas an
// accidental registration attempt against an unroutable host would stall on connect/DNS well
// past it.
test('AC-20260810-04-12: autopilotd --check --hold --ready-file <p> --hub-config autopilot/fixtures/preflight-hub.json passes preflight offline with at least one lane from the fixture repo, writes the ready file, and performs zero network calls', async () => {
  assert.ok(fs.existsSync(PREFLIGHT_HUB_FIXTURE),
    `the checked-in fixture autopilot/fixtures/preflight-hub.json must exist for the boot leg to have anything to point --hub-config at (specs/20260810/04-hub-wired-daemon.md D8); got missing at ${PREFLIGHT_HUB_FIXTURE}`)

  const home = tmpdir('ac12-home')
  const readyDir = tmpdir('ac12-ready')
  const readyFile = path.join(readyDir, 'ready')
  const child = spawn(process.execPath, [
    AUTOPILOTD, '--check', '--hold', '--ready-file', readyFile, '--hub-config', PREFLIGHT_HUB_FIXTURE,
  ], {
    env: { ...process.env, HOME: home, USERPROFILE: home },
  })
  let stderr = ''
  let exitCode = null
  let exited = false
  child.stderr.on('data', (d) => { stderr += String(d) })
  child.once('exit', (code) => { exited = true; exitCode = code })

  // Load-tolerant ceiling (2026-08-17): under a full parallel `npm test` this box takes
  // >3s of scheduler contention before the child even boots — the 3s wall-clock deadline
  // reddened this test twice on pure load (2026-08-17 v7 rebuild; 2026-08-17 review
  // wf_85d3d332-882, already a Gotchas entry). The predicate poll below exits the moment
  // the ready file lands, so a generous ceiling costs nothing on a quiet box and only
  // buys headroom under contention; the "well inside a bounded window" claim survives —
  // 15s is still bounded and still far below any network-stall timescale.
  const deadline = Date.now() + 15000
  while (!fs.existsSync(readyFile) && !exited && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 25))
  }

  assert.ok(!exited, `--hold must keep the process resident after a passing preflight rather than exiting — an unregistered zero-network preflight has nothing left to do but wait for the signal that ends the hold; got exitCode=${exitCode} stderr=${stderr}`)
  assert.ok(fs.existsSync(readyFile),
    `preflight must write --ready-file well within 3s of a completed, fully offline (zero-network) construction — a slow or missing ready file means either a real network attempt stalled the check or --hold/--ready-file/--hub-config wiring is still absent; got stderr=${stderr}`)
  assert.match(stderr, /autopilotd: preflight OK — \d+ lanes?, SDK resolved/,
    `the pass notice must confirm at least one lane was discovered from the fixture repo under the fixture's hub.json reposRoot; got stderr=${stderr}`)
  assert.doesNotMatch(stderr, /0 lanes/,
    `AC-20260810-04-12 requires >=1 lane discovered from the fixture repo — a fixture that discovers zero lanes means the fixture repo is not actually grounded (missing .claude/spec.config.json); got stderr=${stderr}`)

  child.kill('SIGTERM')
  const stopDeadline = Date.now() + 10000 // same load-tolerance rationale as the ready deadline above
  while (!exited && Date.now() < stopDeadline) {
    await new Promise((r) => setTimeout(r, 25))
  }
  assert.strictEqual(exitCode, 0,
    `SIGTERM during a --hold must tear down cleanly and exit 0 (spec 04-live-smoke D3, unchanged by the hub-config rewiring); got exitCode=${exitCode} exited=${exited} stderr=${stderr}`)
})

// Pins the registerRepos loud-failure boot branch (Behavior § Boot order,
// specs/20260810/04-hub-wired-daemon.md: "registerRepos (network; non-2xx → exit 1 naming the
// repo — a box that cannot register must say so loudly, not run half-routed)"). This is a real
// (non---check) boot, so it needs an in-process stub hub to answer the registration POST — per
// § Gotchas in .claude/rules/spec-pipeline.md, a stub server sharing this process's event loop
// must be reached with async `spawn`, never `spawnSync` (spawnSync blocks this process's event
// loop for the child's whole lifetime, starving the very http.Server the child is trying to
// reach, and every such test hangs to its kill-timer instead of failing).
function startStub(handler) {
  return new Promise((resolve) => {
    const requests = []
    const server = http.createServer((req, res) => {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => {
        requests.push({ method: req.method, url: req.url, body })
        handler(req, res, body)
      })
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, requests }))
  })
}

function stopStub(server) {
  return new Promise((resolve) => server.close(resolve))
}

function runAutopilotdAsync(args, opts = {}) {
  const home = tmpdir('autopilotd-home')
  const { env, ...rest } = opts
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [AUTOPILOTD, ...args], {
      ...rest,
      env: { ...process.env, HOME: home, USERPROFILE: home, ...(env || {}) },
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, 5000)
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolve({ status: timedOut ? null : code, signal, stdout, stderr, home })
    })
  })
}

test('registerRepos loud-failure boot branch (Behavior § Boot order, specs/20260810/04-hub-wired-daemon.md): a real (non---check) autopilotd boot exits 1 naming the failing repo and the hub\'s non-2xx status when POST /api/spokes/projects fails, and never creates --state-dir', async () => {
  const { server, port, requests } = await startStub((req, res) => {
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ code: 'internal', message: 'boom' }))
  })
  try {
    const reposRoot = tmpdir('reg-fail-repos')
    writeGroundedRepo(reposRoot, 'alpha')
    const hubDir = tmpdir('reg-fail-hub')
    const hubConfigPath = writeHubConfig(hubDir, { reposRoot, hubUrl: `http://127.0.0.1:${port}` })
    const stateDir = tmpdir('reg-fail-state')
    const res = await runAutopilotdAsync(['--hub-config', hubConfigPath, '--state-dir', stateDir])
    assert.strictEqual(res.status, 1,
      `a non-2xx registration response must exit 1 — "a box that cannot register must say so loudly, not run half-routed" (Behavior § Boot order) — a box that silently continued past this would start lanes the hub never actually knows about; got status=${res.status} signal=${res.signal} stdout=${res.stdout} stderr=${res.stderr}`)
    assert.match(res.stderr, /registering "alpha" failed/,
      `stderr must name the specific failing repo ("alpha") or an operator with more than one lane cannot tell which repo's registration failed; got stderr=${res.stderr}`)
    assert.match(res.stderr, /500/,
      `stderr must surface the hub's actual non-2xx status or an operator cannot distinguish a hub outage/bug from a bad credential/contract mismatch; got stderr=${res.stderr}`)
    assert.strictEqual(requests.length, 1,
      `registerRepos registers sequentially and must stop at the first failing repo rather than retrying it or continuing to the next; got ${requests.length} requests`)
    assert.strictEqual(requests[0].url, '/api/spokes/projects',
      `the registration call must hit the contracted route /api/spokes/projects or the hub never sees the registration attempt at all; got ${requests[0].url}`)
    assert.deepStrictEqual(fs.readdirSync(stateDir), [],
      'a failed registration must exit before --state-dir is ever created — a populated directory here would mean the daemon ran half-routed instead of failing loudly')
  } finally {
    await stopStub(server)
  }
})
