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

