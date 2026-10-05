'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC, tmpdir } = require('../helpers')
const fx = require('./fixture')

// specs/20261005/02-connect-runs-first.md — AC-20261005-02-2 through AC-20261005-02-6 (D1–D5):
// walkthrough-connect.js runs in a folder with no config, creates the config only after the proof,
// refuses a present-but-unusable config as bad-config, names the repository-init step in a folder
// that is not a repository, and prints the next step in an empty ungrounded folder.
// Fake `railway` on PATH, child-process stub.

const { makeGitHost, makeRailway, runConnect, startStub, connectAnswers, SETTINGS_REL, MINTED } = fx
const CONFIG_REL = '.claude/spec.config.json'
const RETIRED_CODE = /no-config(?![\w-])/
const BAD_TOKEN = { status: 401, body: { error: 'bad-token', detail: null, apiVersion: 1 } }

const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8')
const exists = (dir, rel) => fs.existsSync(path.join(dir, rel))

test('AC-20261005-02-2: a run in a host with no config file that ends without a passed proof creates no config file but keeps the stored token', async (t) => {
  const stub = await startStub(t, connectAnswers(['acme-shop'], [BAD_TOKEN]))
  const rw = makeRailway()
  const host = makeGitHost('acme-shop', { config: false })
  const r = await runConnect(host, ['--base-url', stub.url], { railway: rw })
  assert.strictEqual(r.status, 1, 'a proof answered bad-token must exit 1, or a link nobody proved reads as connected: ' + JSON.stringify(r))
  assert.ok(exists(host, SETTINGS_REL) && read(host, SETTINGS_REL).includes(MINTED), 'the minted token must stay stored so the next run resumes without a second create: ' + JSON.stringify(r))
  assert.ok(!exists(host, CONFIG_REL), 'no config file may exist after an unproved run, or a block points at a link nobody proved')
})

test('AC-20261005-02-3: a config file that is not a JSON object is refused bad-config naming repair or delete, never named the bootstrap command, and is left byte-identical', async () => {
  for (const [label, bytes] of [['an array', '[]'], ['text that is not JSON', 'not json']]) {
    const rw = makeRailway()
    const host = makeGitHost('acme-shop', { config: false })
    fs.mkdirSync(path.join(host, '.claude'), { recursive: true })
    fs.writeFileSync(path.join(host, CONFIG_REL), bytes)
    const r = await runConnect(host, ['--base-url', 'http://127.0.0.1:1'], { railway: rw })
    assert.strictEqual(r.status, 2, label + ' must be refused with exit 2: ' + JSON.stringify(r))
    assert.match(r.stderr, /^walkthrough-connect: bad-config/, label + ' must carry the bad-config code: ' + r.stderr)
    assert.ok(r.stderr.includes('repair or delete .claude/spec.config.json'), label + ': the remedy must name repairing or deleting the file, or the user cannot recover: ' + r.stderr)
    assert.ok(!r.stderr.includes('/spec:init'), label + ': the refusal must not send the user to the bootstrap command: ' + r.stderr)
    assert.deepStrictEqual(rw.lines(), [], label + ': no Railway call may precede the config refusal')
    assert.strictEqual(read(host, CONFIG_REL), bytes, label + ': the file must never be overwritten, or the user\'s content is destroyed')
    assert.ok(!exists(host, SETTINGS_REL), label + ': a refused run must write no settings file')
  }
})

test('AC-20261005-02-4: neither walkthrough-connect.js nor connect.md contains the retired no-config refusal code', () => {
  for (const rel of ['scripts/walkthrough-connect.js', 'commands/connect.md']) {
    const file = path.join(SPEC, rel)
    assert.ok(fs.existsSync(file), rel + ' must exist, or this sweep proves nothing')
    assert.ok(!RETIRED_CODE.test(fs.readFileSync(file, 'utf8')), rel + ' must not mention the retired refusal code, or a reader is told an absent config is still refused')
  }
})

test('AC-20261005-02-5: connect in a folder that is not a git repository refuses not-ignored naming the repository-init step first, before any create, leaving the folder empty', async () => {
  const parent = tmpdir('connect-plain')
  const host = path.join(parent, 'fresh-app')
  fs.mkdirSync(host)
  const rw = makeRailway()
  const r = await runConnect(host, ['--base-url', 'http://127.0.0.1:1'], { railway: rw, env: { GIT_CEILING_DIRECTORIES: parent } })
  assert.strictEqual(r.status, 2, 'a folder outside any repository must be refused with exit 2: ' + JSON.stringify(r))
  assert.match(r.stderr, /^walkthrough-connect: not-ignored — this folder is not a git repository/, 'the refusal must say the folder is not a repository, or the old ignore-file-only words hide the first step: ' + r.stderr)
  assert.ok(r.stderr.includes('remedy: run git init, add .claude/settings.local.json to .gitignore, then run /spec:connect again'), 'the remedy must name the repository-init step first: ' + r.stderr)
  assert.strictEqual(rw.creates().length, 0, 'no create may run before the guard, or a token is minted that cannot be kept out of a commit: ' + JSON.stringify(rw.lines()))
  assert.deepStrictEqual(fs.readdirSync(host), [], 'a refused run must leave the folder empty')
})

test('AC-20261005-02-6: connect prints next: /spec:genesis as a second line only in a root with no non-dot entry whose config has no generatedBy, and exactly one line otherwise', async (t) => {
  const stub = await startStub(t, connectAnswers())
  const line = (what) => `connected acme-shop → ${stub.url}/p/acme-shop (${what})\n`
  const rw = makeRailway()
  const empty = makeGitHost('acme-shop', { config: false })
  const a = await runConnect(empty, ['--base-url', stub.url], { railway: rw })
  assert.strictEqual(a.stdout, line('new project') + 'next: /spec:genesis\n', 'an empty ungrounded folder must be told the next step, or the session guesses the mocks command: ' + JSON.stringify(a))
  const b = await runConnect(empty, ['--base-url', stub.url], { railway: rw })
  assert.strictEqual(b.stdout, line('already connected') + 'next: /spec:genesis\n', 'the rerun must still name the next step while the folder is empty and ungrounded: ' + JSON.stringify(b))

  const filled = makeGitHost('acme-shop', { config: false })
  fs.writeFileSync(path.join(filled, 'package.json'), '{}\n')
  const c = await runConnect(filled, ['--base-url', stub.url], { railway: makeRailway() })
  assert.strictEqual(c.stdout, line('new project'), 'a folder with a non-dot file must print exactly one line, or an existing project is sent to genesis: ' + JSON.stringify(c))

  const grounded = makeGitHost('acme-shop')
  const d = await runConnect(grounded, ['--base-url', stub.url], { railway: makeRailway() })
  assert.strictEqual(d.stdout, line('new project'), 'a config carrying generatedBy must print exactly one line, or a grounded project is sent to genesis: ' + JSON.stringify(d))
})
