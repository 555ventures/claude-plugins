'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tmpdir, runNode, SPEC } = require('../helpers')

// specs/20260824/01-render-gate.md (2026-08-24, D1/D8-D13, Contracts): render-gate.js is the
// driver — preconditions, the built-in mock server (D8), the per-cell capture loop over mock x
// state x theme x viewport (D10/D11), readiness/boot lifecycle (D13), and the exit-code alphabet
// (D12). Per the spec's own "Watch during execution" note, every capture-invoking test here runs
// the REAL spec/scripts/render-gate.js entry via runNode against a synthetic host in a tmpdir —
// never a stand-in that reimplements gate logic (synthetic-repro-presented-as-real is a live
// incident class in this repo) — with a small fixture "capture" script standing in for the
// host's real browser automation, exactly as D1 says a host capture command may. AC-20260824-01-7
// … AC-20260824-01-12.

const SCRIPT = 'scripts/render-gate.js'
const RENDER_INVENTORY = path.join(SPEC, 'scripts/render-inventory.browser.js')

// The fixture "capture" command (D1): logs its own argv (one JSON line per invocation, via
// FAKE_CAPTURE_LOG), optionally fetches --url and its origin's /tokens.css to prove the D8
// built-in server (recording both statuses into the written inventory), optionally forces a
// non-zero exit (FAKE_CAPTURE_EXIT) to pin AC-11, and otherwise writes a minimal valid inventory
// document to --out and exits 0.
const FAKE_CAPTURE_SRC = `#!/usr/bin/env node
'use strict'
const fs = require('fs')
const http = require('http')
const args = process.argv.slice(2)
const flag = (n) => { const i = args.indexOf('--' + n); return i > -1 ? args[i + 1] : undefined }
if (process.env.FAKE_CAPTURE_LOG) fs.appendFileSync(process.env.FAKE_CAPTURE_LOG, JSON.stringify(args) + '\\n')
if (process.env.FAKE_CAPTURE_EXIT) process.exit(parseInt(process.env.FAKE_CAPTURE_EXIT, 10))
const url = flag('url')
const out = flag('out')
function fetchStatus(u, cb) {
  let done = false
  try {
    const req = http.get(u, (res) => { res.resume(); if (!done) { done = true; cb(res.statusCode) } })
    req.setTimeout(800, () => { if (!done) { done = true; req.destroy(); cb(0) } })
    req.on('error', () => { if (!done) { done = true; cb(0) } })
  } catch { if (!done) { done = true; cb(0) } }
}
let pending = 2
const fetched = {}
function finish() {
  fs.writeFileSync(out, JSON.stringify({
    schemaVersion: 1, theme: flag('theme') || null, state: flag('state') === '-' ? null : flag('state'),
    root: 'body', entries: [], _fetch: fetched,
  }))
}
fetchStatus(url, (s) => { fetched.url = s; if (--pending === 0) finish() })
let tokensUrl
try { tokensUrl = new URL(url).origin + '/tokens.css' } catch { tokensUrl = null }
if (tokensUrl) fetchStatus(tokensUrl, (s) => { fetched.tokens = s; if (--pending === 0) finish() })
else { fetched.tokens = 0; if (--pending === 0) finish() }
`

function writeFakeCapture(root) {
  const p = path.join(root, 'fake-capture.js')
  fs.writeFileSync(p, FAKE_CAPTURE_SRC)
  return p
}

// specs/20260824/04-render-rules.md (2026-08-24, D5): a fixture capture that writes a CANNED
// entries array (read from FAKE_CAPTURE_ENTRIES, JSON-encoded) into every inventory it produces,
// standing in for a host capture whose real page happens to render a specific measured box/color
// — the render-rules.js pass under test (AC-20260824-04-9/10) needs entries to check, which the
// original FAKE_CAPTURE_SRC (always `entries: []`) never supplies.
const FAKE_CAPTURE_ENTRIES_SRC = `#!/usr/bin/env node
'use strict'
const fs = require('fs')
const args = process.argv.slice(2)
const flag = (n) => { const i = args.indexOf('--' + n); return i > -1 ? args[i + 1] : undefined }
if (process.env.FAKE_CAPTURE_LOG) fs.appendFileSync(process.env.FAKE_CAPTURE_LOG, JSON.stringify(args) + '\\n')
const out = flag('out')
const entries = process.env.FAKE_CAPTURE_ENTRIES ? JSON.parse(process.env.FAKE_CAPTURE_ENTRIES) : []
fs.writeFileSync(out, JSON.stringify({
  schemaVersion: 1, theme: flag('theme') || null, state: flag('state') === '-' ? null : flag('state'),
  root: 'body', entries,
}))
`

function writeFakeCaptureWithEntries(root) {
  const p = path.join(root, 'fake-capture-entries.js')
  fs.writeFileSync(p, FAKE_CAPTURE_ENTRIES_SRC)
  return p
}

// One synthetic host: a config declaring design.render, a design/targets.json matrix, one mock
// under design/mocks/screen.html with the given data-state-btn values, a coverage-ledger claim
// binding the given subset of those states to story ids, and a spec whose design_source points
// at the mock. Returns the spec's absolute path.
function writeHost(root, { themes, viewports, states, boundStates, captureCmd, url, ready, boot, readyTimeout, rulesManifest }) {
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'design/mocks'), { recursive: true })
  fs.mkdirSync(path.join(root, 'specs/20260824'), { recursive: true })

  const render = { capture: captureCmd, url }
  if (ready) render.ready = ready
  if (boot) render.boot = boot
  if (readyTimeout) render.readyTimeout = readyTimeout
  const designCfg = { render }
  if (rulesManifest) designCfg.rulesManifest = rulesManifest
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({ design: designCfg }))

  fs.writeFileSync(path.join(root, 'design/targets.json'), JSON.stringify({ themes, viewports }))
  fs.writeFileSync(path.join(root, 'design/tokens.css'), ':root{}\n')

  const stateBtns = states.map((s) => `<button data-state-btn="${s}">${s}</button>`).join('\n')
  fs.writeFileSync(path.join(root, 'design/mocks/screen.html'),
    `<html><body><div data-screen-label="Screen">${stateBtns}<p>Hello</p></div></body></html>`)

  const stories = {}
  for (const s of boundStates) stories[s] = 'story-' + s
  fs.writeFileSync(path.join(root, '.claude/design-coverage.json'), JSON.stringify({
    sources: { 'design/mocks/screen.html': { regions: { Screen: {
      spec: 'specs/20260824/99-test.md', at: '2026-08-24', stories } } } },
  }))

  const specPath = path.join(root, 'specs/20260824/99-test.md')
  fs.writeFileSync(specPath, '---\nstatus: hardened\ndesign: true\ndesign_source: design/mocks/screen.html\n---\n# Test\n')
  return specPath
}

function gate(specPath, root, outDir, extraArgs = [], opts = {}) {
  fs.mkdirSync(outDir, { recursive: true })
  return runNode(SCRIPT, ['--spec', specPath, '--root', root, '--out', outDir, ...extraArgs],
    { cwd: root, timeout: 30000, ...opts })
}

// specs/20260824/04-render-rules.md (2026-08-24, D5): the new `--mocks <mock>…` mode — no
// --spec, no ledger, no component side. Each mock is passed as its own repeated --mocks flag
// (this repo's Worker Rules: "hand-rolled --flag value arg parsing only", so a variable-arity
// flag is one repeated `--flag value` pair per mock, never a bare multi-token tail).
function gateMocks(mockPaths, root, outDir, extraArgs = [], opts = {}) {
  fs.mkdirSync(outDir, { recursive: true })
  const mockArgs = []
  for (const m of mockPaths) mockArgs.push('--mocks', m)
  return runNode(SCRIPT, [...mockArgs, '--root', root, '--out', outDir, ...extraArgs],
    { cwd: root, timeout: 30000, ...opts })
}

// One synthetic --mocks host: design.render + design/targets.json + one mock under
// design/mocks/screen.html with the given data-state-btn values — deliberately no
// .claude/design-coverage.json ledger and no specs/ tree, since --mocks mode needs neither
// (AC-20260824-04-10: "read no ledger"). Returns the mock's absolute path.
function writeMocksHost(root, { themes, viewports, states, captureCmd, rulesManifest }) {
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'design/mocks'), { recursive: true })
  const render = { capture: captureCmd, url: 'http://localhost:6006/iframe.html?id={story}&theme={theme}' }
  const designCfg = { render }
  if (rulesManifest) designCfg.rulesManifest = rulesManifest
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({ design: designCfg }))
  fs.writeFileSync(path.join(root, 'design/targets.json'), JSON.stringify({ themes, viewports }))
  fs.writeFileSync(path.join(root, 'design/tokens.css'), ':root{}\n')
  const stateBtns = states.map((s) => `<button data-state-btn="${s}">${s}</button>`).join('\n')
  const mockPath = path.join(root, 'design/mocks/screen.html')
  fs.writeFileSync(mockPath, `<html><body><div data-screen-label="Screen">${stateBtns}<p>Hello</p></div></body></html>`)
  return mockPath
}

function readLog(logPath) {
  if (!fs.existsSync(logPath)) return []
  return fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
}
function flagVal(argv, name) {
  const i = argv.indexOf('--' + name)
  return i > -1 ? argv[i + 1] : undefined
}

// AC-20260824-02-2 (specs/20260824/02-design-stage-on-render-gate.md D8): the render gate's
// own exit-2 remedy for a missing design.render block must name /spec:design — the command's
// STOP (D3 preflight) and the script's STOP are meant to be one message, so a session that hits
// this exit from either direction reads the same next step. Added to the r1 arm of the existing
// AC-20260824-01-7 pin rather than a new test, since it is the same stderr the config-shape
// assertions below already check.
test('AC-20260824-01-7 / AC-20260824-02-2: a root whose config has no design.render exits 2 naming .claude/spec.config.json design.render.capture and design.render.url and /spec:design; a root with design.render but no design/targets.json exits 2 naming design/targets.json and design-targets.json', () => {
  const root = fs.realpathSync(tmpdir('rg7a'))
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'specs/20260824'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({ design: {} }))
  const specPath = path.join(root, 'specs/20260824/99-test.md')
  fs.writeFileSync(specPath, '---\nstatus: hardened\ndesign: true\ndesign_source: design/mocks/screen.html\n---\n# Test\n')

  const r1 = gate(specPath, root, path.join(root, 'out'))
  assert.strictEqual(r1.status, 2, 'D9/D12: a config with no design.render block must be a precondition failure, exit 2: ' + r1.stderr)
  assert.match(r1.stderr, /\.claude\/spec\.config\.json/, 'the remedy must name the config file: ' + r1.stderr)
  assert.match(r1.stderr, /design\.render\.capture/, 'the remedy must name the missing capture key: ' + r1.stderr)
  assert.match(r1.stderr, /design\.render\.url/, 'the remedy must name the missing url key: ' + r1.stderr)
  assert.match(r1.stderr, /\/spec:design/,
    'D8/AC-20260824-02-2: the remedy must name /spec:design — the command\'s own preflight STOP ' +
    '(D3) and this script\'s STOP are meant to be one message, so a session that reaches this ' +
    'exit from either direction reads the same next step: ' + r1.stderr)

  const root2 = fs.realpathSync(tmpdir('rg7b'))
  fs.mkdirSync(path.join(root2, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root2, 'specs/20260824'), { recursive: true })
  fs.writeFileSync(path.join(root2, '.claude/spec.config.json'), JSON.stringify({
    design: { render: { capture: 'node fake.js', url: 'http://x/{story}' } },
  }))
  const specPath2 = path.join(root2, 'specs/20260824/99-test.md')
  fs.writeFileSync(specPath2, '---\nstatus: hardened\ndesign: true\ndesign_source: design/mocks/screen.html\n---\n# Test\n')

  const r2 = gate(specPath2, root2, path.join(root2, 'out'))
  assert.strictEqual(r2.status, 2, 'D9/D12: design.render present but design/targets.json absent must exit 2: ' + r2.stderr)
  assert.match(r2.stderr, /design\/targets\.json/, 'the remedy must name the missing matrix file: ' + r2.stderr)
  assert.match(r2.stderr, /design-targets\.json/, 'the remedy must name the template to copy it from: ' + r2.stderr)
})

test('AC-20260824-01-8: a synthetic root with 2 themes x 3 viewports and one mock declaring two bound states invokes the capture exactly 24 times, every call carrying the full flag set with --script resolving to the real render-inventory.browser.js, mock --url matching the built-in server, component --url equal to the substituted pattern, and no PNG/screenshot flag', () => {
  const root = fs.realpathSync(tmpdir('rg8'))
  const capture = writeFakeCapture(root)
  const log = path.join(root, 'capture.log')
  const specPath = writeHost(root, {
    themes: ['light', 'dark'],
    viewports: [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }],
    states: ['a', 'b'],
    boundStates: ['a', 'b'],
    captureCmd: 'node ' + capture,
    url: 'http://localhost:6006/iframe.html?id={story}&theme={theme}&w={width}&h={height}&s={state}',
  })

  const r = gate(specPath, root, path.join(root, 'out'), [], { env: { ...process.env, FAKE_CAPTURE_LOG: log } })
  const calls = readLog(log)
  assert.strictEqual(calls.length, 24,
    'D8/D10/D11: 2 sides x 2 states x 2 themes x 3 viewports must invoke the capture exactly 24 times — a wrong count means the cross-product (or the state/side loop) is broken: got ' +
    calls.length + '. gate exit ' + r.status + ' stderr: ' + r.stderr)

  const mockUrls = new Set()
  const compUrls = new Set()
  for (const argv of calls) {
    for (const f of ['url', 'width', 'height', 'theme', 'state', 'script', 'out']) {
      assert.ok(argv.includes('--' + f), 'D1: every capture invocation must carry --' + f + ': ' + JSON.stringify(argv))
    }
    assert.strictEqual(flagVal(argv, 'script'), RENDER_INVENTORY,
      'D1: --script must resolve to the plugin\'s real render-inventory.browser.js, never a copy or stand-in: ' + JSON.stringify(argv))
    assert.ok(!argv.some((a) => /png|screenshot/i.test(a)),
      'D7: the capture contract must never carry a PNG/screenshot flag — pixels are excluded, not advisory: ' + JSON.stringify(argv))
    const url = flagVal(argv, 'url')
    if (/^http:\/\/127\.0\.0\.1:\d+\/mocks\/screen\.html$/.test(url)) mockUrls.add(url)
    else compUrls.add(url)
  }
  assert.strictEqual(mockUrls.size, 1,
    'D8: the built-in mock server starts once per run, so every mock-side capture must hit the same http://127.0.0.1:<port>/mocks/screen.html: ' + [...mockUrls])

  const expectedComp = new Set()
  for (const theme of ['light', 'dark']) {
    for (const state of ['a', 'b']) {
      for (const [w, h] of [[390, 844], [768, 1024], [1280, 800]]) {
        expectedComp.add(`http://localhost:6006/iframe.html?id=story-${state}&theme=${theme}&w=${w}&h=${h}&s=${state}`)
      }
    }
  }
  assert.strictEqual(compUrls.size, 12, 'D10: 2 themes x 2 states x 3 viewports must produce 12 distinct component URLs: ' + [...compUrls])
  for (const u of compUrls) {
    assert.ok(expectedComp.has(u),
      'D10: every component --url must be design.render.url with {story}/{theme}/{width}/{height}/{state} substituted from the cell and the ledger\'s story binding — unexpected URL: ' + u)
  }
})

test('AC-20260824-01-9: a mock-side capture fetching --url and <origin>/tokens.css over HTTP records both statuses as 200, proving the built-in server resolves the mock\'s ../tokens.css sibling', () => {
  const root = fs.realpathSync(tmpdir('rg9'))
  const capture = writeFakeCapture(root)
  const log = path.join(root, 'capture.log')
  const specPath = writeHost(root, {
    themes: ['light'],
    viewports: [{ width: 390, height: 844 }],
    states: ['a'],
    boundStates: ['a'],
    captureCmd: 'node ' + capture,
    url: 'http://localhost:6006/iframe.html?id={story}&theme={theme}',
  })

  const r = gate(specPath, root, path.join(root, 'out'), [], { env: { ...process.env, FAKE_CAPTURE_LOG: log } })
  const calls = readLog(log)
  const mockCall = calls.find((argv) => /^http:\/\/127\.0\.0\.1:\d+\/mocks\/screen\.html$/.test(flagVal(argv, 'url')))
  assert.ok(mockCall, 'expected one mock-side capture invocation to inspect: ' + JSON.stringify(calls) + ' gate stderr: ' + r.stderr)

  const written = JSON.parse(fs.readFileSync(flagVal(mockCall, 'out'), 'utf8'))
  assert.strictEqual(written._fetch && written._fetch.url, 200,
    'D8: the mock-side capture\'s own --url fetch must resolve 200 through the built-in server: ' + JSON.stringify(written._fetch))
  assert.strictEqual(written._fetch && written._fetch.tokens, 200,
    'D8: <origin>/tokens.css must also resolve 200 — the exact "../tokens.css resolves" contract the built-in server exists for (the spikes ran python3 -m http.server by hand before this): ' + JSON.stringify(written._fetch))
})

test('AC-20260824-01-10: a mock declaring state "empty" with no story binding for it prints unbound-state "Screen" "empty", invokes the capture zero times for that surface, prints __RENDER_GATE_FAIL__, and exits 1', () => {
  const root = fs.realpathSync(tmpdir('rg10'))
  const capture = writeFakeCapture(root)
  const log = path.join(root, 'capture.log')
  const specPath = writeHost(root, {
    themes: ['light'],
    viewports: [{ width: 390, height: 844 }],
    states: ['populated', 'empty'],
    boundStates: ['populated'],
    captureCmd: 'node ' + capture,
    url: 'http://localhost:6006/iframe.html?id={story}&theme={theme}',
  })

  const r = gate(specPath, root, path.join(root, 'out'), [], { env: { ...process.env, FAKE_CAPTURE_LOG: log } })
  assert.match(r.stdout + r.stderr, /unbound-state "Screen" "empty"/,
    'D10: a declared state with no story id in the ledger claim must print the exact unbound-state finding naming the label and the state: ' + r.stdout + r.stderr)
  assert.ok(!fs.existsSync(log) || readLog(log).length === 0,
    'D10: "no capture for that surface" — a surface with any unbound state must be skipped entirely (zero invocations for the WHOLE surface, including its bound "populated" state), or a half-captured surface reports partial evidence as complete: ' +
    JSON.stringify(readLog(log)))
  assert.match(r.stdout, /__RENDER_GATE_FAIL__/, 'a finding-bearing run must print the FAIL sentinel: ' + r.stdout)
  assert.ok(!/__RENDER_GATE_PASS__/.test(r.stdout), 'the FAIL and PASS sentinels must never both print: ' + r.stdout)
  assert.strictEqual(r.status, 1, 'D12: a findings-only run (not a precondition failure) must exit 1: ' + r.stderr)
})

test('AC-20260824-01-11: a capture command that exits 7 for any cell makes the gate exit 3, print neither sentinel, and name the invoked command line and exit 7 on stderr', () => {
  const root = fs.realpathSync(tmpdir('rg11'))
  const capture = writeFakeCapture(root)
  const specPath = writeHost(root, {
    themes: ['light'],
    viewports: [{ width: 390, height: 844 }],
    states: ['a'],
    boundStates: ['a'],
    captureCmd: 'node ' + capture,
    url: 'http://localhost:6006/iframe.html?id={story}&theme={theme}',
  })

  const r = gate(specPath, root, path.join(root, 'out'), [], { env: { ...process.env, FAKE_CAPTURE_EXIT: '7' } })
  assert.strictEqual(r.status, 3, 'D12: any non-zero capture exit is a capture failure, distinct from a findings failure — exit 3, not 1: ' + r.stderr)
  assert.ok(!/__RENDER_GATE_PASS__/.test(r.stdout) && !/__RENDER_GATE_FAIL__/.test(r.stdout),
    'D12: "a capture failure must never read as green" — and must not read as an ordinary findings FAIL either, since neither sentinel represents "the gate never actually observed the render": ' + r.stdout)
  assert.match(r.stderr, /exit 7/, 'the capture\'s own exit code must be named on stderr for a discoverable remedy: ' + r.stderr)
  assert.match(r.stderr, /fake-capture\.js/, 'the invoked command line itself must be named on stderr, not just the bare exit code: ' + r.stderr)
})

test('AC-20260824-01-12: WHEN ready fails until boot creates the flag file THE SYSTEM SHALL proceed to capture and the boot process it started SHALL no longer be alive after the gate exits; WHEN ready never passes within a short readyTimeout THE SYSTEM SHALL exit 3 within 10s naming design.render.ready', () => {
  const root = fs.realpathSync(tmpdir('rg12a'))
  const capture = writeFakeCapture(root)
  const log = path.join(root, 'capture.log')
  const flagFile = path.join(root, 'ready.flag')
  const pidFile = path.join(root, 'boot.pid')
  const bootScript = path.join(root, 'boot.sh')
  fs.writeFileSync(bootScript,
    '#!/usr/bin/env bash\n' +
    'echo $$ > ' + JSON.stringify(pidFile) + '\n' +
    'sleep 1\n' +
    'touch ' + JSON.stringify(flagFile) + '\n' +
    'sleep 300\n')
  fs.chmodSync(bootScript, 0o755)

  const specPath = writeHost(root, {
    themes: ['light'],
    viewports: [{ width: 390, height: 844 }],
    states: ['a'],
    boundStates: ['a'],
    captureCmd: 'node ' + capture,
    url: 'http://localhost:6006/iframe.html?id={story}&theme={theme}',
    ready: 'test -f ' + flagFile,
    boot: 'bash ' + bootScript,
    readyTimeout: 30,
  })

  const r = gate(specPath, root, path.join(root, 'out'), [], { env: { ...process.env, FAKE_CAPTURE_LOG: log } })
  assert.ok(readLog(log).length > 0,
    'D13: once ready passes (via boot), the gate must proceed to capture — an empty capture log means it never got past the readiness poll: exit ' +
    r.status + ' stderr: ' + r.stderr + ' stdout: ' + r.stdout)

  assert.ok(fs.existsSync(pidFile), 'the fake boot must have written its own pid before this assertion runs: ' + r.stderr)
  const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10)
  let alive = true
  for (let i = 0; i < 30 && alive; i++) {
    try { process.kill(pid, 0); spawnSync('sleep', ['0.1']) } catch { alive = false }
  }
  assert.strictEqual(alive, false,
    'D13: "a process it did not start is never touched" implies the one it DID start IS touched — after the gate exits, the boot process it spawned must no longer be alive (ESRCH on kill(pid,0)), or a stranded process rides every future run, the smoke.sh pidfile-lock class this mirrors')

  const root2 = fs.realpathSync(tmpdir('rg12b'))
  const capture2 = writeFakeCapture(root2)
  const bootScript2 = path.join(root2, 'boot2.sh')
  fs.writeFileSync(bootScript2, '#!/usr/bin/env bash\nsleep 300\n')
  fs.chmodSync(bootScript2, 0o755)
  const specPath2 = writeHost(root2, {
    themes: ['light'],
    viewports: [{ width: 390, height: 844 }],
    states: ['a'],
    boundStates: ['a'],
    captureCmd: 'node ' + capture2,
    url: 'http://localhost:6006/iframe.html?id={story}&theme={theme}',
    ready: 'test -f ' + path.join(root2, 'never.flag'),
    boot: 'bash ' + bootScript2,
    readyTimeout: 3,
  })
  const start = Date.now()
  const r2 = gate(specPath2, root2, path.join(root2, 'out'), [], { timeout: 15000 })
  const elapsed = Date.now() - start
  assert.ok(elapsed < 10000,
    'D13: readyTimeout 3 must bound the whole readiness poll — the gate took ' + elapsed + 'ms, past the AC\'s own 10s ceiling')
  assert.strictEqual(r2.status, 3, 'D12: a readiness timeout is a capture-family failure, exit 3, never a pass or an ordinary findings fail: ' + r2.stderr)
  assert.match(r2.stderr, /design\.render\.ready/, 'the timeout must name design.render.ready as the stuck config key, or the remedy is undiscoverable: ' + r2.stderr)
})

// specs/20260824/04-render-rules.md (2026-08-24, D5): render-gate.js runs render-rules.js over
// every COMPONENT inventory (never the mock side, in --spec mode) after comparison, when the
// host config declares design.rulesManifest; findings print under the cell as `rule <id> <kind>
// …` and fail the gate exactly like a fidelity finding; a root that declares no rulesManifest at
// all prints the exact skip line instead and never runs rules. The fixture capture writes the
// SAME canned entries array to both the mock and component inventories (FAKE_CAPTURE_ENTRIES),
// so render-compare.js sees an identical pair on both sides — trivially clean — isolating any
// FAIL to the rules pass alone. AC-20260824-04-9.
test('AC-20260824-04-9: a root declaring design.rulesManifest with a target-size{min:44} rule and a canned 20x20 button component inventory prints a target-size rule finding under the cell and fails the gate; a root with no rulesManifest declared prints the skip line and exits 0 on a clean comparison', () => {
  const root = fs.realpathSync(tmpdir('rg9rulesA'))
  const capture = writeFakeCaptureWithEntries(root)
  const rulesPath = path.join(root, '.claude/genesis/design-rules.json')
  fs.mkdirSync(path.dirname(rulesPath), { recursive: true })
  fs.writeFileSync(rulesPath, JSON.stringify({
    schemaVersion: 1,
    rules: [{ id: 'min-target-size', intent: 'targets big enough to tap', targetCategory: 'density',
      severity: 'error', renderCheck: { kind: 'target-size', min: 44 } }],
  }))
  const tinyButton = { i: 0, role: 'button', text: 'Tap', box: { x: 0, y: 0, w: 20, h: 20 }, srOnly: false }
  const specPath = writeHost(root, {
    themes: ['light'], viewports: [{ width: 390, height: 844 }], states: ['a'], boundStates: ['a'],
    captureCmd: 'node ' + capture, url: 'http://localhost:6006/iframe.html?id={story}&theme={theme}',
    rulesManifest: '.claude/genesis/design-rules.json',
  })

  const r = gate(specPath, root, path.join(root, 'out'), [],
    { env: { ...process.env, FAKE_CAPTURE_ENTRIES: JSON.stringify([tinyButton]) } })
  assert.match(r.stdout, /rule min-target-size target-size/,
    'D5: a target-size renderCheck failing over the component inventory must print a rule finding under that cell (prefixed "rule <id> target-size") — a session reading the gate\'s own output must see rule findings the same way it sees fidelity findings: ' + r.stdout + ' stderr: ' + r.stderr)
  assert.match(r.stdout, /__RENDER_GATE_FAIL__/, 'a rule finding must fail the gate exactly like a fidelity finding: ' + r.stdout)
  assert.strictEqual(r.status, 1, 'D5/D12: a rule finding on the component side must fail the gate like any other finding, exit 1: ' + r.stderr)

  const root2 = fs.realpathSync(tmpdir('rg9rulesB'))
  const capture2 = writeFakeCaptureWithEntries(root2)
  const specPath2 = writeHost(root2, {
    themes: ['light'], viewports: [{ width: 390, height: 844 }], states: ['a'], boundStates: ['a'],
    captureCmd: 'node ' + capture2, url: 'http://localhost:6006/iframe.html?id={story}&theme={theme}',
  })
  const r2 = gate(specPath2, root2, path.join(root2, 'out'), [],
    { env: { ...process.env, FAKE_CAPTURE_ENTRIES: JSON.stringify([]) } })
  assert.match(r2.stdout, /rules: no design\.rulesManifest declared — skipped/,
    'D5: a root declaring no design.rulesManifest must print this exact skip line — without it a session cannot tell "rules ran and passed" apart from "rules never ran": ' + r2.stdout + ' stderr: ' + r2.stderr)
  assert.match(r2.stdout, /__RENDER_GATE_PASS__/,
    'with identical (empty) entries on both sides and no rules declared, the comparison must be clean and the gate must pass: ' + r2.stdout + r2.stderr)
  assert.strictEqual(r2.status, 0, 'D12: a clean comparison with no rules manifest declared must exit 0: ' + r2.stderr)
})

// specs/20260824/04-render-rules.md (2026-08-24, D5): the new `render-gate.js --mocks <mock>…`
// mode — no --spec, no ledger read, no component URL, no comparison; it captures the mock(s)
// only and runs render-rules.js over each mock inventory when design.rulesManifest is declared.
// AC-20260824-04-10.
test('AC-20260824-04-10: render-gate.js --mocks <one mock> with 2 themes x 3 viewports and 1 state invokes the capture exactly 6 times, every --url matching the built-in mock server\'s own origin, reads no ledger, and exits 0 with __RENDER_GATE_PASS__ when the rules pass', () => {
  const root = fs.realpathSync(tmpdir('rg10mocks'))
  const capture = writeFakeCapture(root)
  const log = path.join(root, 'capture.log')
  const rulesPath = path.join(root, '.claude/genesis/design-rules.json')
  fs.mkdirSync(path.dirname(rulesPath), { recursive: true })
  fs.writeFileSync(rulesPath, JSON.stringify({
    schemaVersion: 1,
    rules: [{ id: 'no-raw-color', targetCategory: 'color', severity: 'error', renderCheck: { kind: 'palette' } }],
  }))
  const mockPath = writeMocksHost(root, {
    themes: ['light', 'dark'],
    viewports: [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }],
    states: ['default'],
    captureCmd: 'node ' + capture,
    rulesManifest: '.claude/genesis/design-rules.json',
  })
  // AC-10: "read no ledger" — this fixture never writes .claude/design-coverage.json; a run that
  // required it (the way --spec mode's mock/component binding does) would die(2) on the missing
  // claim, so a clean PASS below is itself the proof --mocks mode never consults one.
  assert.ok(!fs.existsSync(path.join(root, '.claude/design-coverage.json')),
    'sanity: this fixture must carry no coverage ledger, or a PASS below would not prove --mocks reads none')

  const r = gateMocks([mockPath], root, path.join(root, 'out'), [], { env: { ...process.env, FAKE_CAPTURE_LOG: log } })
  const calls = readLog(log)
  assert.strictEqual(calls.length, 6,
    'D5: 1 mock x 1 state x 2 themes x 3 viewports must invoke the capture exactly 6 times in --mocks mode: got ' +
    calls.length + '. exit ' + r.status + ' stderr: ' + r.stderr + ' stdout: ' + r.stdout)
  for (const argv of calls) {
    const url = flagVal(argv, 'url')
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/mocks\/screen\.html$/,
      'D5/D8: every --mocks capture must hit the built-in server\'s own mock origin — --mocks mode never substitutes design.render.url, since there is no component side: ' + url)
  }
  assert.match(r.stdout, /__RENDER_GATE_PASS__/,
    'D5: with the rules passing over every mock inventory, --mocks mode must print the PASS sentinel: ' + r.stdout + ' stderr: ' + r.stderr)
  assert.strictEqual(r.status, 0, 'D12: a clean --mocks run must exit 0: ' + r.stderr)
})
