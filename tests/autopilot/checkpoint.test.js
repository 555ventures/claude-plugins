'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')

// spec: specs/20260801/03-lane-engine.md — pins AC-20260801-03-9 and AC-20260801-03-11 for
// the checkpoint process-surface module (autopilot/daemon/checkpoint.js). AC-9 exercises
// startSurfaces() against real child processes (fake dev-server + tunnel commands, per the
// repo Test Rules' "fake commands (echo/sleep)" note) — no mocked child_process, genuine
// process-group spawn/kill. AC-11 exercises screenshotIfConfigured(), a checkpoint.js export
// not shown in the spec's Contracts block; its shape is derived from Behavior D12 ("optional
// screenshotCommand... attach a capture via adapter.sendPhoto... unset or failing -> URL-only,
// never blocks") since checkpoint.js is the module that owns command-spawning concerns — see
// specs/20260801/03-lane-engine.deviations.md for the one-line note. The module does not
// exist yet, so every test here fails at require() time until checkpoint.js lands.
const CHECKPOINT_PATH = path.join(__dirname, '..', '..', 'autopilot', 'daemon', 'checkpoint.js')
const { startSurfaces, screenshotIfConfigured } = require(CHECKPOINT_PATH)

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

test('AC-20260801-03-9: startSurfaces resolves tunnelUrl from the first https:// URL on the tunnel command\'s stdout, and stopAll() leaves no live child processes', async () => {
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

test('AC-20260801-03-11: screenshotIfConfigured substitutes {url}/{out} into screenshotCommand and calls adapter.sendPhoto with the produced file on success; a non-zero exit posts no photo and never throws', async () => {
  const dir = tmpdir('checkpoint-ac11')
  const capScript = path.join(dir, 'cap.js')
  fs.writeFileSync(capScript, [
    "const fs = require('fs')",
    'const url = process.argv[2]',
    'const out = process.argv[3]',
    "fs.writeFileSync(out, 'SCREENSHOT-OF:' + url)",
  ].join('\n'))
  const screenshotCommand = `node ${JSON.stringify(capScript)} {url} {out}`
  const calls = []
  const adapter = { sendPhoto: async (project, photo) => { calls.push({ project, photo }) } }
  await screenshotIfConfigured({
    screenshotCommand, url: 'https://t.example', project: 'prax', adapter, cwd: dir, log: () => {},
  })
  assert.strictEqual(calls.length, 1,
    'a successful screenshot command must call adapter.sendPhoto exactly once (D12) or checkpoints never get a visual preview')
  assert.strictEqual(calls[0].project, 'prax',
    'sendPhoto must target the checkpoint\'s own project or the photo lands in the wrong Telegram topic')
  assert.ok(calls[0].photo && calls[0].photo.buffer,
    'sendPhoto must receive a buffer for the produced screenshot (telegram adapter D2 sendPhoto contract) or the photo has no content to upload')
  const content = calls[0].photo.buffer.toString('utf8')
  assert.match(content, /https:\/\/t\.example/,
    'the {url} placeholder must be substituted with the real checkpoint URL (D12) or the capture command screenshots the literal placeholder text instead of the live page')

  const calls2 = []
  const adapter2 = { sendPhoto: async () => { calls2.push(1) } }
  await screenshotIfConfigured({
    screenshotCommand: 'node -e "process.exit(1)"', url: 'https://t.example', project: 'prax', adapter: adapter2, cwd: dir, log: () => {},
  })
  assert.strictEqual(calls2.length, 0,
    'a non-zero screenshotCommand exit must not call sendPhoto (D12: unset or failing -> URL-only message, never blocks)')
})
