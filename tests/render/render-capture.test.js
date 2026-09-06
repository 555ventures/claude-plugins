'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { spawnSync, spawn } = require('node:child_process')
const { tmpdir, runNode, SPEC } = require('../helpers')

// specs/20260905/06-plugin-owned-capture-at-approval.md D1/D2/D10 (Contracts): the plugin's
// own DevTools-driven capture script — AC-20260905-06-1 (single-cell contract flags),
// AC-20260905-06-2 (--batch, one Chrome launch for many cells), AC-20260905-06-3 (--which /
// CHROME_BIN resolution). AC-1/AC-2 are [env: CHROME_BIN] — they launch a real Chrome; per the
// spec's Rationale "Fragile spots for build", this file's total launches are held to two
// (~7s) so the 45s per-file budget guard (specs/20260903/07) never trips here.

const SCRIPT = 'scripts/render-capture.js'
const RENDER_INVENTORY = path.join(SPEC, 'scripts/render-inventory.browser.js')

// D2's own resolver mirrored here (never imported — the script under test does not exist yet):
// CHROME_BIN when set is the only candidate (no fallback scan); else the macOS app paths, then
// four PATH names.
function resolveBrowserForTest() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN
  const macPaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ]
  for (const p of macPaths) if (fs.existsSync(p)) return p
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const r = spawnSync('which', [name], { encoding: 'utf8' })
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim()
  }
  return null
}

function serveStatic(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath
      try { urlPath = decodeURIComponent((req.url || '/').split('?')[0]) } catch { urlPath = '/' }
      fs.readFile(path.join(root, urlPath), (err, data) => {
        if (err) { res.writeHead(404); res.end(); return }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(data)
      })
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

// .claude/rules/spec-pipeline.md § Gotchas (specs/20260825/03-genesis-currency-executed.md):
// helpers.js's runNode is spawnSync, which blocks this process's event loop for the whole
// child lifetime — AC-1/AC-2 also run an in-process http server (serveStatic below) that the
// spawned render-capture.js's own Chrome must reach mid-run, so spawnSync would starve that
// server of every connection. This is the same async-spawn runner shape as
// tests/design-atlas.test.js's withServe/withHandler — same real script, same real argv, only
// the harness-level wait-for-exit mechanism differs from runNode.
function runNodeAsync(scriptRel, argv, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(SPEC, scriptRel), ...argv], { ...opts })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    child.on('error', reject)
    child.on('close', (code) => resolve({ status: code, stdout, stderr }))
  })
}

// tests/render/render-gate.test.js's own LAUNCH_LOG pattern (AC-20260905-06-5's fake browser):
// a CHROME_BIN wrapper that logs its own argv (the D10 launch flags, including
// --user-data-dir=) to LAUNCH_LOG, then `exec`s the real resolved Chrome IN PLACE (same pid) so
// render-capture.js's own process tracking/kill logic still targets the actual browser, never an
// intermediary. Direct launch-count proof, replacing an elapsed-time proxy.
const CHROME_LAUNCH_WRAPPER_SRC = `#!/usr/bin/env bash
set -u
if [ -n "\${LAUNCH_LOG:-}" ]; then
  printf '%s\\n' "$*" >> "$LAUNCH_LOG"
fi
exec "$REAL_CHROME_BIN" "$@"
`
function writeChromeLaunchWrapper(root) {
  const p = path.join(root, 'chrome-launch-wrapper.sh')
  fs.writeFileSync(p, CHROME_LAUNCH_WRAPPER_SRC)
  fs.chmodSync(p, 0o755)
  return p
}

function writeMock(root) {
  fs.writeFileSync(path.join(root, 'screen.html'),
    '<!DOCTYPE html><html><body>' +
    '<div data-screen-label="Screen"><div style="width:900px">wide content</div></div>' +
    '</body></html>')
}

// ---------------------------------------------------------------------------
// AC-20260905-06-1 [env: CHROME_BIN]
// ---------------------------------------------------------------------------
test('AC-20260905-06-1 [env: CHROME_BIN]: render-capture.js writes a parseable inventory with page.clientWidth 390 and page.scrollWidth >= 900 and exits 0 for a served mock with a 900px child at width 390', async () => {
  const root = fs.realpathSync(tmpdir('rcap1'))
  writeMock(root)
  const server = await serveStatic(root)
  const port = server.address().port
  const outPath = path.join(root, 'out.json')
  const chrome = resolveBrowserForTest()

  const r = await runNodeAsync(SCRIPT, [
    '--url', 'http://127.0.0.1:' + port + '/screen.html',
    '--width', '390', '--height', '844', '--theme', 'light', '--state', '-',
    '--script', RENDER_INVENTORY, '--out', outPath,
  ], { env: chrome ? { ...process.env, CHROME_BIN: chrome } : process.env })
  server.close()

  assert.strictEqual(r.status, 0,
    'a single-cell capture against a real served mock must exit 0 — a non-zero exit means the ' +
    'contract flags, the launch argv, or the DevTools handshake are broken: ' + r.stderr)
  let doc
  assert.doesNotThrow(() => { doc = JSON.parse(fs.readFileSync(outPath, 'utf8')) },
    '--out must be written as parseable JSON, or no downstream reader (render-gate.js) can trust it: ' + r.stderr)
  assert.strictEqual(doc.page && doc.page.clientWidth, 390,
    'page.clientWidth must equal the requested --width 390 — a mismatch means the device metrics override never took effect: ' + JSON.stringify(doc.page))
  assert.ok(doc.page && doc.page.scrollWidth >= 900,
    'page.scrollWidth must be >= 900 (the mock\'s own 900px-wide child) — a smaller value means the captured page never actually rendered the mock content: ' + JSON.stringify(doc.page))
})

// ---------------------------------------------------------------------------
// AC-20260905-06-2 [env: CHROME_BIN]
// ---------------------------------------------------------------------------
test('AC-20260905-06-2 [env: CHROME_BIN]: render-capture.js --batch over two cells of the same mock at widths 390 and 1440 writes both --out files with the matching page.clientWidth, launching the browser once', async () => {
  const root = fs.realpathSync(tmpdir('rcap2'))
  writeMock(root)
  const server = await serveStatic(root)
  const port = server.address().port
  const url = 'http://127.0.0.1:' + port + '/screen.html'
  const out390 = path.join(root, 'cell-390.json')
  const out1440 = path.join(root, 'cell-1440.json')
  const cellsPath = path.join(root, 'cells.json')
  fs.writeFileSync(cellsPath, JSON.stringify([
    { url, width: 390, height: 844, theme: 'light', state: '-', script: RENDER_INVENTORY, out: out390 },
    { url, width: 1440, height: 900, theme: 'light', state: '-', script: RENDER_INVENTORY, out: out1440 },
  ]))
  const chrome = resolveBrowserForTest()
  const wrapper = writeChromeLaunchWrapper(root)
  const launchLog = path.join(root, 'launch.log')

  const r = await runNodeAsync(SCRIPT, ['--batch', cellsPath],
    { env: { ...process.env, CHROME_BIN: wrapper, REAL_CHROME_BIN: chrome || '', LAUNCH_LOG: launchLog } })
  server.close()

  assert.strictEqual(r.status, 0,
    'a --batch run over two cells of an already-served mock must exit 0: ' + r.stderr)
  const doc390 = JSON.parse(fs.readFileSync(out390, 'utf8'))
  const doc1440 = JSON.parse(fs.readFileSync(out1440, 'utf8'))
  assert.strictEqual(doc390.page && doc390.page.clientWidth, 390,
    'the 390-width cell\'s own --out must report page.clientWidth 390: ' + JSON.stringify(doc390.page))
  assert.strictEqual(doc1440.page && doc1440.page.clientWidth, 1440,
    'the 1440-width cell\'s own --out must report page.clientWidth 1440 — a wrong value means the per-cell device-metrics override leaked from the prior cell: ' + JSON.stringify(doc1440.page))

  const launches = fs.existsSync(launchLog)
    ? fs.readFileSync(launchLog, 'utf8').trim().split('\n').filter(Boolean)
    : []
  assert.strictEqual(launches.length, 1,
    'D1: two cells of the same mock must share ONE Chrome launch (one --batch call, one process) — ' +
    'a second launch line here means each cell spawned its own browser instead of reusing one page ' +
    'session, defeating the whole reason --batch exists: got ' + launches.length + ' launch(es): ' + JSON.stringify(launches))
  assert.match(launches[0] || '', /--user-data-dir=/,
    'D10: the single logged launch must carry its own --user-data-dir= flag (the fresh tmp profile dir the Contracts section names) — its absence means the wrapper caught something other than the real launch argv: ' + JSON.stringify(launches[0]))
})

// ---------------------------------------------------------------------------
// AC-20260905-06-3
// ---------------------------------------------------------------------------
test('AC-20260905-06-3: CHROME_BIN=/nonexistent/chrome exits 2 on --which and on a capture, naming CHROME_BIN, Google Chrome, and design.render.capture; CHROME_BIN naming an existing executable prints that path on --which and exits 0', () => {
  const root = fs.realpathSync(tmpdir('rcap3'))
  const badEnv = { ...process.env, CHROME_BIN: '/nonexistent/chrome' }

  const which = runNode(SCRIPT, ['--which'], { env: badEnv })
  assert.strictEqual(which.status, 2,
    '--which with a nonexistent CHROME_BIN must exit 2 — a 0 here would tell a caller a browser was found when none was: ' + which.stdout + which.stderr)
  assert.match(which.stdout + which.stderr, /CHROME_BIN/, 'the exit-2 remedy must name CHROME_BIN: ' + which.stdout + which.stderr)
  assert.match(which.stdout + which.stderr, /Google Chrome/, 'the exit-2 remedy must name Google Chrome as the thing to install: ' + which.stdout + which.stderr)
  assert.match(which.stdout + which.stderr, /design\.render\.capture/, 'the exit-2 remedy must name design.render.capture as the declare-your-own escape hatch: ' + which.stdout + which.stderr)

  const outPath = path.join(root, 'out.json')
  const capture = runNode(SCRIPT, [
    '--url', 'http://127.0.0.1:1/x', '--width', '390', '--height', '844', '--theme', 'light',
    '--state', '-', '--script', RENDER_INVENTORY, '--out', outPath,
  ], { env: badEnv })
  assert.strictEqual(capture.status, 2,
    'any capture (not just --which) must also exit 2 with no browser resolved — a capture that instead times out or crashes differently means the resolution check does not run up front: ' + capture.stdout + capture.stderr)
  assert.match(capture.stdout + capture.stderr, /CHROME_BIN/, 'the capture-path exit-2 remedy must also name CHROME_BIN: ' + capture.stdout + capture.stderr)

  // /bin/echo stands in for "an existing executable" — --which only checks existence/executable
  // bit (D2), it never launches or verifies the target actually speaks DevTools.
  const goodEnv = { ...process.env, CHROME_BIN: '/bin/echo' }
  const which2 = runNode(SCRIPT, ['--which'], { env: goodEnv })
  assert.strictEqual(which2.status, 0,
    '--which with CHROME_BIN naming a real, existing executable must exit 0: ' + which2.stdout + which2.stderr)
  assert.strictEqual(which2.stdout.trim(), '/bin/echo',
    '--which must print exactly the resolved CHROME_BIN path, or a caller cannot tell which browser it is about to launch: got ' + JSON.stringify(which2.stdout))
})
