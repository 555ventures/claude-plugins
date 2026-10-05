'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC, tmpdir } = require('../helpers')
const fx = require('./fixture')

// specs/20261005/04-connect-protects-the-token-file.md — AC-20261005-04-2 through AC-20261005-04-6
// (D1–D4): walkthrough-connect.js writes the ignore line itself in a plain folder, refuses a token
// file git tracks (leaving .gitignore alone), refuses an unwritable .gitignore, and carries no
// repository-init remedy or probe. Fake `railway` on PATH, child-process stub.

const { makeGitHost, makeRailway, runConnect, startStub, connectAnswers, SETTINGS_REL, MINTED } = fx

const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8')
const exists = (dir, rel) => fs.existsSync(path.join(dir, rel))

// A folder with no .git of its own, holding only the config; runs set the ceiling to its parent.
function makePlain(name) {
  const parent = tmpdir('connect-plain')
  const host = path.join(parent, name)
  fs.mkdirSync(path.join(host, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(host, '.claude/spec.config.json'), JSON.stringify({ generatedBy: 'test' }, null, 2) + '\n')
  return { parent, host }
}

test('AC-20261005-04-2: connect in a folder that is not a git repository writes the ignore line, connects and leaves the folder a plain folder', async (t) => {
  const stub = await startStub(t, connectAnswers(['fresh-app']))
  const rw = makeRailway()
  const { parent, host } = makePlain('fresh-app')
  const r = await runConnect(host, ['--base-url', stub.url], { railway: rw, env: { GIT_CEILING_DIRECTORIES: parent } })
  assert.strictEqual(r.status, 0, 'a brand-new plain folder must connect with exit 0, or connect cannot run first: ' + JSON.stringify(r))
  assert.strictEqual(r.stdout.split('\n')[0], `connected fresh-app → ${stub.url}/p/fresh-app (new project)`, 'the first stdout line must be the connected line: ' + JSON.stringify(r.stdout))
  assert.strictEqual(read(host, '.gitignore'), SETTINGS_REL + '\n', 'the created .gitignore must hold exactly the one ignore line, or the token file is not protected the day the folder becomes a repository')
  assert.ok(read(host, SETTINGS_REL).includes(MINTED), 'the minted token must be stored in the settings file')
  assert.ok(!exists(host, '.git'), 'connect must never run git init — the folder must stay a plain folder')
})

test('AC-20261005-04-3: a token file git already tracks is refused not-ignored with the tracked sentence and the git rm --cached remedy', async () => {
  const rw = makeRailway()
  const host = makeGitHost('acme-shop', { tracked: true })
  const r = await runConnect(host, ['--base-url', 'http://127.0.0.1:1'], { railway: rw })
  assert.strictEqual(r.status, 2, 'a tracked token file must be refused with exit 2: ' + JSON.stringify(r))
  assert.ok(r.stderr.startsWith('walkthrough-connect: not-ignored — .claude/settings.local.json is tracked by git'), 'the refusal must say the file is tracked, or the user is told to edit .gitignore, which cannot help: ' + r.stderr)
  assert.ok(r.stderr.includes('remedy: run git rm --cached .claude/settings.local.json, then run /spec:connect again'), 'the remedy must name the command that untracks the file: ' + r.stderr)
})

test('AC-20261005-04-4: a tracked token file is still refused not-ignored before anything is created and .gitignore and the settings file are left as they were', async () => {
  for (const [label, opts] of [['a tracked file with the default .gitignore', { tracked: true }], ['a tracked file with an empty .gitignore', { tracked: true, gitignore: '' }]]) {
    const rw = makeRailway()
    const host = makeGitHost('acme-shop', opts)
    const ignoreBefore = read(host, '.gitignore')
    const r = await runConnect(host, ['--base-url', 'http://127.0.0.1:1'], { railway: rw })
    assert.strictEqual(r.status, 2, label + ' must exit 2: ' + JSON.stringify(r))
    assert.match(r.stderr, /^walkthrough-connect: not-ignored/, label + ' must carry the not-ignored code: ' + r.stderr)
    assert.ok(r.stderr.includes('git rm --cached'), label + ': the remedy must name git rm --cached: ' + r.stderr)
    assert.strictEqual(rw.creates().length, 0, label + ': no create may run — a token stored where git tracks it leaks the credential')
    assert.strictEqual(read(host, '.gitignore'), ignoreBefore, label + ': .gitignore must be byte-identical, because an ignore line cannot protect a tracked file')
    assert.strictEqual(read(host, SETTINGS_REL), '{}\n', label + ': the tracked settings file must still hold {}, or a token was stored in it')
  }
})

test('AC-20261005-04-5: an ignore line that cannot be written is refused write-failed before anything is created', async () => {
  const rw = makeRailway()
  const { parent, host } = makePlain('fresh-app')
  fs.mkdirSync(path.join(host, '.gitignore'))
  const r = await runConnect(host, ['--base-url', 'http://127.0.0.1:1'], { railway: rw, env: { GIT_CEILING_DIRECTORIES: parent } })
  assert.strictEqual(r.status, 2, 'an unwritable .gitignore must exit 2: ' + JSON.stringify(r))
  assert.match(r.stderr, /^walkthrough-connect: write-failed/, 'the code must be write-failed: ' + r.stderr)
  assert.ok(r.stderr.includes('.gitignore'), 'the sentence must name .gitignore, or the user cannot find what failed: ' + r.stderr)
  assert.strictEqual(rw.creates().length, 0, 'no create may run before the guard passes, or a token is minted that cannot be kept out of a commit: ' + JSON.stringify(rw.lines()))
  assert.ok(!exists(host, SETTINGS_REL), 'no settings file may exist after the refusal')
})

test('AC-20261005-04-6: walkthrough-connect.js contains neither the retired repository-init remedy nor its work-tree probe', () => {
  const file = path.join(SPEC, 'scripts/walkthrough-connect.js')
  assert.ok(fs.existsSync(file), 'walkthrough-connect.js must exist, or this sweep proves nothing')
  const src = fs.readFileSync(file, 'utf8')
  assert.ok(!/run git init/.test(src), 'the script must not carry the repository-init remedy, or a reader is told connect still refuses a plain folder')
  assert.ok(!/is-inside-work-tree/.test(src), 'the script must not carry the work-tree probe, or a second way to ask whether this is a repository survives')
})
