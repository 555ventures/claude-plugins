'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { ROOT, tmpdir } = require('./helpers')

// Pins specs/20260909/07-hang-bound-and-port-check.md D6, AC-20260909-07-9 — the host
// testCommand's own timeout/force-exit flags (read live off .claude/spec.config.json, never a
// copy of the string) must turn a test that opens a socket and never resolves into a bounded
// red, not a hang.

const HANG_SRC = [
  "const test = require('node:test')",
  "const net = require('net')",
  "test('hangs forever holding an open socket', async () => {",
  "  const srv = net.createServer()",
  "  await new Promise((resolve) => srv.listen(0, resolve))",
  "  return new Promise(() => {})",
  "})",
  ''
].join('\n')

// D6: keep every flag off the live testCommand except the two reporter pairs (stripped — this
// test pins the timeout/force-exit bound, not the reporter wiring) and --test-timeout=45000,
// which is tightened to 1500 so the pin itself never has to wait 45s to observe the mechanism.
function hangBoundArgv() {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/spec.config.json'), 'utf8'))
  const stripped = config.testCommand
    .replace(/--test-reporter(-destination)?=\S+/g, '')
    .replace('--test-timeout=45000', '--test-timeout=1500')
    .split(/\s+/)
    .filter(Boolean)
  assert.strictEqual(stripped[0], 'node',
    'testCommand must still start with the bare "node" binary or this derivation is reading the wrong field: ' + config.testCommand)
  return stripped.slice(1)
}

test('AC-20260909-07-9: a fixture test holding an open net server and never resolving exits 1 within 10s carrying "test timed out after 1500ms", under the host testCommand\'s own (tightened) flags', () => {
  const dir = tmpdir('hang-bound')
  const fixture = path.join(dir, 'hang.test.js')
  fs.writeFileSync(fixture, HANG_SRC)
  const argv = hangBoundArgv().concat([fixture])
  // NODE_TEST_CONTEXT must be scrubbed from the child env — inherited unmodified it makes the
  // nested `node --test` skip running any files at all ("run() is being called recursively"),
  // which would falsely read as a clean, instant exit 0 rather than exercising the real hang.
  const env = Object.assign({}, process.env)
  delete env.NODE_TEST_CONTEXT
  // The outer 10000ms spawnSync timeout is a safety net, never the mechanism under test: if
  // --test-timeout/--test-force-exit are missing or inert, the child would otherwise hang this
  // test file (and the whole suite) forever instead of failing fast.
  const r = spawnSync(process.execPath, argv, { encoding: 'utf8', cwd: ROOT, env, timeout: 10000, killSignal: 'SIGKILL' })
  assert.strictEqual(r.signal, null,
    'the run must end on its own via --test-force-exit within 10s — being killed by this test\'s own outer safety-net timeout means the host testCommand\'s bound did not hold: signal=' + r.signal + ' status=' + r.status + ' stdout=' + r.stdout + ' stderr=' + r.stderr)
  assert.strictEqual(r.status, 1,
    'a test that never resolves while holding an open socket must exit the run 1, not hang the process indefinitely: stdout=' + r.stdout + ' stderr=' + r.stderr)
  assert.match(r.stdout, /test timed out after 1500ms/,
    'node must report the cancellation reason at the tightened 1500ms bound so a real hang is diagnosable from the log, not just silently terminated: ' + r.stdout)
})
