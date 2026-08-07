'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')

// spec: specs/20260801/03-lane-engine.md — pins AC-20260801-03-9 for the checkpoint
// process-surface module (autopilot/daemon/checkpoint.js). AC-9 exercises startSurfaces()
// against real child processes (fake dev-server + tunnel commands, per the repo Test Rules'
// "fake commands (echo/sleep)" note) — no mocked child_process, genuine process-group
// spawn/kill. The module does not exist yet, so every test here fails at require() time until
// checkpoint.js lands.
//
// spec: specs/20260807/02-autopilot-dead-surface.md — dead-surface deletion (D1). AC-3 tags
// the existing AC-9 test as a SHALL-CONTINUE-TO pin: startSurfaces is explicitly out of scope
// for the deletion and must keep working byte-identically. AC-4 pins the post-deletion export
// shape (fails now: screenshotIfConfigured is still exported). The former AC-20260801-03-11
// test (screenshotIfConfigured) is deleted here per D1 — the function it pinned no longer
// exists.
const CHECKPOINT_PATH = path.join(__dirname, '..', '..', 'autopilot', 'daemon', 'checkpoint.js')
const CHECKPOINT_MOD = require(CHECKPOINT_PATH)
const { startSurfaces } = CHECKPOINT_MOD

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

test('AC-20260801-03-9 / AC-20260807-02-3: startSurfaces SHALL CONTINUE TO resolve tunnelUrl from the first https:// URL on the tunnel command\'s stdout, and stopAll() leaves no live child processes', async () => {
  const dir = tmpdir('checkpoint-ac9')
  const pidFile = path.join(dir, 'dev.pid')
  const { tunnelUrl, stopAll } = await startSurfaces({
    devServerCommand: `echo $$ > ${pidFile} && sleep 30`,
    tunnelCommand: 'node -e "console.log(\'tunnel up: https://abc.trycloudflare.com ready\'); setInterval(function(){}, 1000)"',
    cwd: dir,
    log: () => {},
  })
  assert.strictEqual(tunnelUrl, 'https://abc.trycloudflare.com',
    'tunnelUrl must be exactly the first https:// URL captured from the tunnel command\'s output (AC-9) or the checkpoint message links to nothing usable')
  // give the dev-server command a moment to actually write its own pid before we tear down
  for (let i = 0; i < 20 && !fs.existsSync(pidFile); i++) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.ok(fs.existsSync(pidFile), 'test fixture bug: the dev-server command never wrote its pid file')
  const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10)
  assert.ok(isAlive(pid), 'test fixture bug: the dev-server process must be alive before stopAll() can be exercised')
  await stopAll()
  await new Promise((resolve) => setTimeout(resolve, 300))
  assert.strictEqual(isAlive(pid), false,
    'stopAll() must leave no live child processes (poll kill(pid,0), AC-9) or a stopped lane leaks dev-server/tunnel processes on every restart')
})

test('AC-20260807-02-4: requiring autopilot/daemon/checkpoint.js exports exactly [\'startSurfaces\'] — the deleted screenshot chain must leave no export behind', () => {
  assert.deepStrictEqual(Object.keys(CHECKPOINT_MOD), ['startSurfaces'],
    'AC-20260807-02-4: checkpoint.js must export exactly startSurfaces — a surviving screenshotIfConfigured key means D1\'s deleted screenshot chain is still reachable by callers')
})
