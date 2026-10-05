'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20261005/03-one-port-per-launch.md D10 — AC-20261005-03-20.

const CONFIG_REL = '.claude/spec.config.json'

// A host with a clean tests/ dir and the given config (object -> pretty JSON, string -> verbatim,
// null -> no config file). Returns { dir, lineOf } where lineOf finds a key's 1-indexed line.
function host(config) {
  const dir = tmpdir('port-check-config')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/clean.test.js'), "'use strict'\n")
  let text = null
  if (config !== null) {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
    text = typeof config === 'string' ? config : JSON.stringify(config, null, 2) + '\n'
    fs.writeFileSync(path.join(dir, CONFIG_REL), text)
  }
  const lineOf = (needle) => text.split('\n').findIndex((l) => l.includes(needle)) + 1
  return { dir, lineOf }
}

const run = (dir, ...extra) => runNode('scripts/port-check.js', ['--root', dir, ...extra])
const readyHost = (readyCheck) => host({ runtime: { bootCommand: 'npm run dev', readyCheck } })

test('AC-20261005-03-20: a readyCheck naming a fixed loopback port exits 1 with a config-fixed-port runtime.readyCheck line at the key\'s own line', () => {
  const { dir, lineOf } = readyHost('curl -sf http://localhost:3000/api/health')
  const r = run(dir)
  assert.strictEqual(r.status, 1,
    'a fixed readyCheck cannot run beside a second launch and must be a finding, exit 1: ' + JSON.stringify(r))
  assert.ok(r.stdout.split('\n').includes(CONFIG_REL + ':' + lineOf('"readyCheck"') + ': config-fixed-port runtime.readyCheck'),
    'the finding must be the plain "file:line: class text" form with the line holding the key: ' + r.stdout)
})

test('AC-20261005-03-20: a readyCheck whose port is only a ${DEV_PORT:-3000} default is still a config-fixed-port finding, because it does not read PORT', () => {
  const { dir } = readyHost('curl -sf http://localhost:${DEV_PORT:-3000}/api/health')
  const r = run(dir)
  assert.strictEqual(r.status, 1, 'a look-alike variable is not the PORT opt-in and must still be flagged: ' + JSON.stringify(r))
  assert.match(r.stdout, /config-fixed-port runtime\.readyCheck/,
    'the finding must name runtime.readyCheck, or the host keeps a fixed port with no doctor signal: ' + r.stdout)
})

test('AC-20261005-03-20: every loopback spelling in a non-PORT readyCheck is flagged', () => {
  for (const hostPart of ['localhost', '127.0.0.1', '[::1]', '0.0.0.0']) {
    const { dir } = readyHost('curl -sf http://' + hostPart + ':3000/health')
    const r = run(dir)
    assert.match(r.stdout, /config-fixed-port runtime\.readyCheck/,
      'a loopback address (' + hostPart + ') the plugin launches must be flagged when the check does not read PORT: ' + JSON.stringify(r))
  }
})

test('AC-20261005-03-20: a prototype.url on a loopback host with no {port} is a config-fixed-port prototype.url finding at the key\'s line', () => {
  const { dir, lineOf } = host({ prototype: { url: 'http://127.0.0.1:3000', overlay: 'src/o.js' } })
  const r = run(dir)
  assert.strictEqual(r.status, 1, 'a fixed prototype address collides with a second prototype round and must be a finding: ' + JSON.stringify(r))
  assert.ok(r.stdout.split('\n').includes(CONFIG_REL + ':' + lineOf('"url"') + ': config-fixed-port prototype.url'),
    'the finding must name prototype.url at the line holding the "url" key: ' + r.stdout)
})

test('AC-20261005-03-20: --json carries a config-fixed-port entry with file, line, class and text in the existing finding shape', () => {
  const { dir, lineOf } = readyHost('curl -sf http://localhost:3000/api/health')
  const r = run(dir, '--json')
  assert.strictEqual(r.status, 1, '--json keeps the exit rule: any finding exits 1: ' + JSON.stringify(r))
  const found = JSON.parse(r.stdout).findings.find((f) => f.class === 'config-fixed-port')
  assert.deepStrictEqual(found,
    { file: CONFIG_REL, line: lineOf('"readyCheck"'), class: 'config-fixed-port', text: 'runtime.readyCheck' },
    'external --json consumers read exactly this shape, so the new class must not add or rename keys: ' + r.stdout)
})

test('AC-20261005-03-20: config findings come after the tests walk and both keys are reported when both are fixed', () => {
  const dir = tmpdir('port-check-both')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/a.test.js'), 'srv.listen(3000)\n')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, CONFIG_REL), JSON.stringify({
    runtime: { bootCommand: 'npm run dev', readyCheck: 'curl -sf http://localhost:3000/' },
    prototype: { url: 'http://localhost:3000' },
  }, null, 2) + '\n')
  const r = run(dir)
  assert.strictEqual(r.status, 1, 'findings in both layers exit 1: ' + JSON.stringify(r))
  const classes = r.stdout.trim().split('\n').map((l) => l.split(' ')[1])
  assert.deepStrictEqual(classes, ['listen-literal', 'config-fixed-port', 'config-fixed-port'],
    'the tests walk reports first, then the config keys readyCheck and url in file order: ' + r.stdout)
})

test('AC-20261005-03-20: no config-fixed-port finding and exit 0 for a PORT-reading check, a file probe, an inert runtime, a {port} or non-loopback url, a missing config and an unparseable config', () => {
  // The positive control keeps this case discriminating: a fixed address beside the same
  // clean tests/ must be flagged, so a silent port-check cannot satisfy the negatives.
  const control = run(readyHost('curl -sf http://localhost:3000/api/health').dir)
  assert.match(control.stdout, /config-fixed-port runtime\.readyCheck/,
    'control: a fixed readyCheck must be flagged, or the absence checks below prove nothing: ' + JSON.stringify(control))

  const clean = {
    'a PORT-reading readyCheck': readyHost('curl -sf localhost:$PORT/api/health').dir,
    'a file-probe readyCheck': readyHost('test -f .ready').dir,
    'an inert runtime': host({ runtime: { inert: 'cli', readyCheck: 'curl -sf http://localhost:3000/' } }).dir,
    'a {port} prototype.url': host({ prototype: { url: 'http://localhost:{port}' } }).dir,
    'a non-loopback prototype.url': host({ prototype: { url: 'https://dev.example.com' } }).dir,
    'no config file': host(null).dir,
    'an unparseable config': host('{ not json').dir,
  }
  for (const [label, dir] of Object.entries(clean)) {
    const r = run(dir)
    assert.doesNotMatch(r.stdout, /config-fixed-port/,
      'no finding may be reported for ' + label + ' — doctor would nag hosts that already comply: ' + r.stdout)
    assert.strictEqual(r.status, 0,
      'with a clean tests/ and ' + label + ' the exit must be 0: ' + JSON.stringify(r))
  }
})
