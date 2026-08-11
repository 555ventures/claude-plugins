'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { ROOT, tmpdir } = require('../helpers')

// spec: specs/20260810/05-service-bootstrap.md — pins AC-20260810-05-1..4 for the systemd
// --user service lifecycle library (autopilot/daemon/service.js, D1-D4, D9). That file does not
// exist yet (CREATE row in the File Plan), so the top-level require below throws at module load
// and every test in this file fails on current code — the same established red-phase pattern as
// tests/autopilot/config.test.js and tests/autopilot/enroll.test.js use for CREATE rows.
//
// D4 pins the test discipline directly: "no real systemd in tests (CI and JJ's Mac are darwin);
// generation is pinned byte-exactly, orchestration is pinned via recorded calls." renderUnit is
// therefore pinned byte-for-byte (AC-1) and installService/serviceStatus are exercised purely
// via the injected `execImpl` (execFileSync-shaped: `execImpl(cmd, argsArray)` per D4) and a real
// `fs` module pointed at a throwaway HOME (the unit path `~/.config/systemd/user/autopilot.service`
// is D2-pinned but not otherwise parameterized in the Contracts signature, so HOME is overridden
// for this whole test file rather than injected).

process.env.HOME = tmpdir('service-home')
process.env.USERPROFILE = process.env.HOME

const SERVICE_PATH = path.join(ROOT, 'autopilot', 'daemon', 'service.js')
const { renderUnit, installService, serviceStatus } = require(SERVICE_PATH)

const UNIT_PATH = path.join(os.homedir(), '.config', 'systemd', 'user', 'autopilot.service')

test('AC-20260810-05-1: renderUnit returns the Contracts unit content byte-exactly, with StartLimitIntervalSec=0 under [Unit] not [Service]', () => {
  const out = renderUnit({
    nodePath: '/usr/bin/node',
    daemonPath: '/opt/cp/autopilot/bin/autopilotd',
    pathEnv: '/usr/bin:/bin',
  })
  const expected =
    '[Unit]\n' +
    'Description=autopilot spoke daemon\n' +
    'StartLimitIntervalSec=0\n' +
    '\n' +
    '[Service]\n' +
    'ExecStart=/usr/bin/node /opt/cp/autopilot/bin/autopilotd\n' +
    'Restart=always\n' +
    'RestartSec=30\n' +
    'Environment=PATH=/usr/bin:/bin\n' +
    '\n' +
    '[Install]\n' +
    'WantedBy=default.target\n'
  assert.strictEqual(out, expected,
    `renderUnit must return the spec's Contracts block byte-exactly with substituted values — a mismatch here (e.g. StartLimitIntervalSec landing under [Service] instead of [Unit], the systemd-230 placement bug D2 exists to prevent) means a crash-looping daemon silently flips to permanently "failed" on the fleet; got:\n${out}`)
})

test('AC-20260810-05-2: installService on linux writes the unit to ~/.config/systemd/user/autopilot.service then calls systemctl --user daemon-reload, systemctl --user enable --now autopilot, loginctl enable-linger <user> in that order', () => {
  const calls = []
  const execImpl = (cmd, args) => {
    calls.push([cmd, ...(args || [])])
    return ''
  }
  installService({ execImpl, fsImpl: fs, platform: 'linux', env: { PATH: '/usr/bin:/bin' } })

  assert.ok(fs.existsSync(UNIT_PATH),
    `installService must write the unit file to ${UNIT_PATH} (D2/D3) — its absence means daemon-reload/enable --now would be enabling a unit that was never written`)
  const written = fs.readFileSync(UNIT_PATH, 'utf8')
  assert.match(written, /^\[Unit\]/,
    `the installed unit file must start with the [Unit] section — a malformed write here is invisible until the next reboot silently fails to restart the daemon; got:\n${written}`)
  assert.match(written, /StartLimitIntervalSec=0/,
    `the installed unit file must carry StartLimitIntervalSec=0 (D2) or a crash-looping daemon flips to permanently "failed" after systemd's default 5-in-10s start limit; got:\n${written}`)

  assert.deepStrictEqual(calls, [
    ['systemctl', '--user', 'daemon-reload'],
    ['systemctl', '--user', 'enable', '--now', 'autopilot'],
    ['loginctl', 'enable-linger', os.userInfo().username],
  ], `installService must invoke exactly these three commands in this order (D3) — daemon-reload before enable --now so systemd sees the freshly written unit, and enable-linger last so a box that fails earlier never gets linger without an installed/enabled unit; got calls=${JSON.stringify(calls)}`)
})

test('AC-20260810-05-3: installService and serviceStatus on platform "darwin" refuse without touching execImpl, naming tmux and the launchd deferral, with an exit code of 2', () => {
  const calls = []
  const execImpl = (cmd, args) => {
    calls.push([cmd, ...(args || [])])
    return ''
  }

  assert.throws(() => {
    installService({ execImpl, fsImpl: fs, platform: 'darwin', env: { PATH: '/usr/bin' } })
  }, (err) => {
    assert.match(err.message, /tmux/,
      `a darwin "service install" must name tmux as the interim remedy (D1) or a JJ-on-Mac operator has no lead on how to keep the daemon alive without systemd; got message=${err.message}`)
    assert.match(err.message, /launchd/,
      `a darwin "service install" must name the launchd deferral (D1, brief 03) or an operator can't tell this is a recorded deferral rather than a bug; got message=${err.message}`)
    assert.strictEqual(err.exitCode, 2,
      `D1 pins darwin's refusal to exit code 2 for every service verb; got exitCode=${err.exitCode}`)
    return true
  }, 'installService must refuse on darwin rather than attempting a systemd sequence that will never work on that platform')

  assert.strictEqual(calls.length, 0,
    `a darwin refusal must happen before any execImpl call — an install that shells out to systemctl on darwin first (then fails) would spew confusing "command not found" noise instead of the D1 remedy; got calls=${JSON.stringify(calls)}`)

  assert.throws(() => {
    serviceStatus({ execImpl, fsImpl: fs, platform: 'darwin' })
  }, (err) => {
    assert.match(err.message, /tmux/,
      `serviceStatus on darwin must also name tmux — "any service verb" per AC-3 includes status, not just install; got message=${err.message}`)
    assert.match(err.message, /launchd/,
      `serviceStatus on darwin must also name the launchd deferral; got message=${err.message}`)
    assert.strictEqual(err.exitCode, 2,
      `serviceStatus's darwin refusal must also carry exit code 2 per D1; got exitCode=${err.exitCode}`)
    return true
  }, 'serviceStatus must refuse on darwin exactly like installService, not silently report a fabricated systemd status')
})

test('AC-20260810-05-4: serviceStatus reports linger=no and a missing baked node path as separate ok:false lines with their remedies, still reports every other line, and returns ok:false overall', () => {
  const nodePath = '/opt/moved-away/bin/node'
  const daemonPath = path.join(ROOT, 'autopilot', 'bin', 'autopilotd')
  fs.mkdirSync(path.dirname(UNIT_PATH), { recursive: true })
  fs.writeFileSync(UNIT_PATH, renderUnit({ nodePath, daemonPath, pathEnv: '/usr/bin' }))
  // nodePath is deliberately never created on disk — this simulates a moved/upgraded node
  // (nvm/brew) after install, the exact scenario D3's "status detects a moved node" describes.

  const execImpl = (cmd, args) => {
    const joined = [cmd, ...(args || [])].join(' ')
    if (/linger/i.test(joined)) return 'no\n'
    if (/is-active/i.test(joined)) return 'active\n'
    return ''
  }

  const result = serviceStatus({ execImpl, fsImpl: fs, platform: 'linux' })

  assert.strictEqual(result.ok, false,
    `serviceStatus must report ok:false overall when linger is disabled and the baked node path is missing — a healthy-looking status here would mask a box that silently stops restarting after its next crash; got result=${JSON.stringify(result)}`)

  const lingerLine = result.lines.find((l) => /linger/i.test(l.name) || /linger/i.test(l.detail || ''))
  assert.ok(lingerLine, `no reported line mentions linger at all — an operator with a disabled-linger box (the #1 headless footgun per D3) gets no lead whatsoever; got lines=${JSON.stringify(result.lines)}`)
  assert.strictEqual(lingerLine.ok, false,
    `the linger line must report ok:false when loginctl reports Linger=no; got line=${JSON.stringify(lingerLine)}`)
  assert.match(lingerLine.remedy || '', /loginctl enable-linger/,
    `the linger line's remedy must name "loginctl enable-linger" verbatim (D3) or an operator has to go rediscover the exact command; got remedy=${lingerLine.remedy}`)

  const nodeLine = result.lines.find((l) => (l.detail || '').includes(nodePath) || /node/i.test(l.name))
  assert.ok(nodeLine, `no reported line mentions the missing baked node path ${nodePath} — a moved-node box (nvm/brew upgrade, D3) would silently keep restarting a dead ExecStart with no diagnostic; got lines=${JSON.stringify(result.lines)}`)
  assert.strictEqual(nodeLine.ok, false,
    `the node-path line must report ok:false when the baked ExecStart path no longer exists on disk; got line=${JSON.stringify(nodeLine)}`)
  assert.match(nodeLine.remedy || '', /re-run autopilot service install/,
    `the node-path line's remedy must name "re-run autopilot service install" verbatim (D3) or an operator has no fix path once node has moved; got remedy=${nodeLine.remedy}`)

  assert.ok(result.lines.length >= 4,
    `D3 lists four status checks (is-active, linger, baked-node-path, unit-file presence) that must ALL still be reported even when two of them fail — "status/doctor degrade gracefully... one run shows the full picture" (Behavior); got only ${result.lines.length} lines: ${JSON.stringify(result.lines)}`)
})
