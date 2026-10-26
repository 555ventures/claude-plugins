'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { spawn } = require('node:child_process')
const { tmpdir, gitRepo, ROOT } = require('../helpers')
const { FIXTURE_DIR, patchConfig, writeStates, statusOf, worktreePath, bare, mark } = require('./fixture')

// specs/20261026/01-one-runner-for-host-commands.md: AC-20261026-01-7 — the prototype driver's
// printed ROUND boot line is executed (sh -c, in the prototype worktree) for a workspace-shaped
// host reached through a symlinked path, and the app answers on the allocated port.

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => resolve(body))
    }).on('error', reject)
  })
}

async function waitFor(url, ms) {
  const end = Date.now() + ms
  for (;;) {
    try { return await get(url) } catch (e) {
      if (Date.now() > end) throw e
      await new Promise((r) => setTimeout(r, 50))
    }
  }
}

test('AC-20261026-01-7: the printed ROUND boot line for a workspace host (cd apps/web && exec node server.mjs), reached through a symlink, serves the resolved prototype.url when run with sh -c in the worktree', async () => {
  const real = fs.realpathSync(tmpdir('ws-host'))
  fs.cpSync(FIXTURE_DIR, real, { recursive: true })
  fs.cpSync(path.join(ROOT, 'tests/fixtures/workspace-host'), real, { recursive: true })
  gitRepo(real)
  const link = path.join(fs.realpathSync(tmpdir('ws-link')), 'host-link')
  fs.symlinkSync(real, link)
  patchConfig(link, (cfg) => { cfg.runtime.bootCommand = 'cd apps/web && exec node server.mjs' })
  writeStates(link)
  const opened = mark(link, 'opened')
  assert.strictEqual(opened.status, 0, 'test setup requires --mark opened to succeed through the symlinked root: ' + opened.stderr)
  const r = bare(link)
  assert.strictEqual(r.status, 0, 'the ROUND step must print through a symlinked root: ' + r.stderr)
  const line = r.stdout.split('\n').find((l) => /^Session: in .*start the dev server/.test(l))
  assert.ok(line, 'the ROUND step must print a dev-server Session: line: ' + r.stdout)
  const boot = line.slice(line.indexOf('(tracked): ') + '(tracked): '.length)
  const { appPort } = statusOf(link)
  assert.ok(Number.isInteger(appPort), 'the driver must have allocated an app port for the {port} prototype.url: ' + JSON.stringify(statusOf(link)))
  const env = { ...process.env }
  delete env.PORT
  const child = spawn('sh', ['-c', boot], { cwd: worktreePath(link), env, stdio: 'ignore' })
  try {
    const body = await waitFor('http://127.0.0.1:' + appPort, 8000)
    assert.strictEqual(body, 'workspace-host ok',
      'the printed boot line must give PORT to the server at the end of a compound line, or the app binds elsewhere and the pin round probes nothing: ' + boot)
  } finally {
    child.kill()
  }
})
