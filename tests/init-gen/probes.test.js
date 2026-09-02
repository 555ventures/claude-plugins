'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260822/02-init-generation-script.md D1/D7/D8: `init-gen.js probe --root <dir>
// [--test-command "<cmd>"] [--sample <n>]` reports read-only findings and always exits 0 —
// adverse findings are data, never a probe failure. These tests pin AC-8/9/10 against PATH-shim
// fixtures (no real `claude` CLI or test runner dependency, per the File Plan's own note) and
// all FAIL on current code: init-gen.js does not exist yet (TDD red). AC-8 pins the
// testCommand no-match probe (D8) — the exact vacuous-pass class the at-risk escape
// was built on. AC-9/AC-10 pin the frontend-design detection probe (D7/A1), including the typed
// `no-claude-cli` unavailability arm.

function newHost(prefix) {
  const dir = tmpdir(prefix)
  gitRepo(dir)
  return dir
}

// Excludes every PATH entry that already carries a file named "claude" — this session's own
// PATH may include the real Claude Code CLI, and AC-9 must observe true absence, not merely
// that our shim wasn't found first.
function pathWithoutClaude() {
  const dirs = (process.env.PATH || '').split(path.delimiter)
  return dirs.filter((d) => {
    try {
      return d && !fs.existsSync(path.join(d, 'claude'))
    } catch {
      return true
    }
  }).join(path.delimiter)
}

function shim(dir, name, body) {
  const bin = path.join(dir, 'shim-bin')
  fs.mkdirSync(bin, { recursive: true })
  const file = path.join(bin, name)
  fs.writeFileSync(file, '#!/usr/bin/env bash\n' + body + '\n')
  fs.chmodSync(file, 0o755)
  return bin
}

test('AC-20260822-02-8: probe reports failsLoudOnNoMatch false for a --test-command runner that exits 0 against a nonexistent path, and true with the observed exit code when it exits nonzero', () => {
  const dir = newHost('init-gen-probe')
  const bin = path.join(dir, 'shim-bin')
  fs.mkdirSync(bin, { recursive: true })
  fs.writeFileSync(path.join(bin, 'pass-runner'), '#!/usr/bin/env bash\nexit 0\n')
  fs.chmodSync(path.join(bin, 'pass-runner'), 0o755)
  fs.writeFileSync(path.join(bin, 'fail-runner'), '#!/usr/bin/env bash\nexit 1\n')
  fs.chmodSync(path.join(bin, 'fail-runner'), 0o755)
  const env = { ...process.env, PATH: bin + path.delimiter + process.env.PATH }

  const rPass = runNode('scripts/init-gen.js', ['probe', '--root', dir, '--test-command', 'pass-runner'], { env })
  assert.strictEqual(rPass.status, 0, 'probe must exit 0 even when the runner vacuously passes — adverse findings are data, not failures: ' + rPass.stderr)
  const outPass = JSON.parse(rPass.stdout)
  assert.strictEqual(outPass.testCommand.failsLoudOnNoMatch, false,
    'D8: a runner that exits 0 against an appended nonexistent path is the vacuous-pass class the 2026-08-20 at-risk escape was built on — reporting true here hides exactly that risk from the interview: ' + rPass.stdout)

  const rFail = runNode('scripts/init-gen.js', ['probe', '--root', dir, '--test-command', 'fail-runner'], { env })
  assert.strictEqual(rFail.status, 0, 'probe must exit 0 on a fails-loud finding too: ' + rFail.stderr)
  const outFail = JSON.parse(rFail.stdout)
  assert.strictEqual(outFail.testCommand.failsLoudOnNoMatch, true,
    'D8: a runner that exits nonzero against a nonexistent path fails loud and must be reported true, or a sound runner is misreported as vacuous: ' + rFail.stdout)
  assert.strictEqual(outFail.testCommand.exit, 1,
    'D8: the observed exit code must be surfaced verbatim so the interview shows the user what actually happened: ' + rFail.stdout)
})

test('AC-20260822-02-9: probe reports frontendDesign unavailable no-claude-cli when no claude executable is on PATH, and still exits 0', () => {
  const dir = newHost('init-gen-probe-noclaude')
  const env = { ...process.env, PATH: pathWithoutClaude() }

  const r = runNode('scripts/init-gen.js', ['probe', '--root', dir], { env })
  assert.strictEqual(r.status, 0, 'D7: a probe with no claude CLI on PATH must still exit 0 — probe never blocks on an absent optional tool: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out.frontendDesign, { unavailable: 'no-claude-cli' },
    'D7: claude CLI absent from PATH must report a typed unavailability, never a probe failure — a missing arm here would make the interview silently skip the frontend-design install-offer question entirely: ' + r.stdout)
})

test('AC-20260822-02-10: a PATH-shim claude reporting an enabled frontend-design row is reported installed:true, enabled:true, with its scope', () => {
  const dir = newHost('init-gen-probe-enabled')
  const bin = shim(dir, 'claude',
    'if [ "$1" = "plugin" ] && [ "$2" = "list" ]; then\n' +
    "  echo '[{\"id\":\"frontend-design@claude-plugins-official\",\"scope\":\"user\",\"enabled\":true}]'\n" +
    'fi'
  )
  const env = { ...process.env, PATH: bin + path.delimiter + pathWithoutClaude() }

  const r = runNode('scripts/init-gen.js', ['probe', '--root', dir], { env })
  assert.strictEqual(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out.frontendDesign, { installed: true, enabled: true, scope: 'user' },
    'A1: the executed `claude plugin list --json` shape (id/scope/enabled) must map to {installed,enabled,scope} — a wrong mapping means the interview offers to install a plugin that is already active: ' + r.stdout)
})

test('AC-20260822-02-10: a PATH-shim claude reporting a disabled frontend-design row is reported installed:true, enabled:false', () => {
  const dir = newHost('init-gen-probe-disabled')
  const bin = shim(dir, 'claude',
    'if [ "$1" = "plugin" ] && [ "$2" = "list" ]; then\n' +
    "  echo '[{\"id\":\"frontend-design@claude-plugins-official\",\"scope\":\"user\",\"enabled\":false}]'\n" +
    'fi'
  )
  const env = { ...process.env, PATH: bin + path.delimiter + pathWithoutClaude() }

  const r = runNode('scripts/init-gen.js', ['probe', '--root', dir], { env })
  assert.strictEqual(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.frontendDesign.installed, true,
    'an installed-but-disabled plugin must still report installed:true, or the interview would wrongly offer a fresh install: ' + r.stdout)
  assert.strictEqual(out.frontendDesign.enabled, false,
    'a disabled row must report enabled:false, or the interview would wrongly skip the enable-offer for an installed-but-inactive plugin: ' + r.stdout)
})
