'use strict'
// Pins the shell shortcuts: setup/shellrc.sh names only scripts that exist, and
// setup/install-shell.sh leaves exactly one block in ~/.zshrc that sources it.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { tmpdir } = require('./helpers')

const ROOT = path.join(__dirname, '..')
const SHELLRC = path.join(ROOT, 'setup', 'shellrc.sh')
const INSTALL = path.join(ROOT, 'setup', 'install-shell.sh')

test('every repo path shellrc.sh names exists', () => {
  const src = fs.readFileSync(SHELLRC, 'utf8')
  const paths = [...src.matchAll(/\$CLAUDE_PLUGINS_DIR\/([^\s"']+)/g)].map((m) => m[1])
  assert.ok(paths.length > 0, 'shellrc.sh names at least one script')
  for (const p of paths) assert.ok(fs.existsSync(path.join(ROOT, p)), `${p} is named in shellrc.sh but does not exist`)
})

test('spec-status from shellrc.sh runs the status script', () => {
  const r = spawnSync('bash', ['-c', `source "${SHELLRC}" && spec-status --bogus`], {
    encoding: 'utf8', env: { ...process.env, CLAUDE_PLUGINS_DIR: ROOT },
  })
  assert.strictEqual(r.status, 2, 'status.js rejects an unknown flag with exit 2')
  assert.match(r.stderr, /usage: status\.js/, 'the shortcut reached status.js, not a missing module')
})

test('install-shell.sh replaces an old copied block with one source line, idempotently', () => {
  const home = tmpdir('shell')
  const rc = path.join(home, '.zshrc')
  fs.writeFileSync(rc, [
    'export FOO=1',
    '# >>> claude-plugins shell setup >>>',
    'spec-status() { node "$HOME/Projects/claude-plugins/spec/scripts/spec-status.js" "${@:---pretty}"; }',
    '# <<< claude-plugins shell setup <<<',
    'alias keep=1', '',
  ].join('\n'))
  const run = () => spawnSync('bash', [INSTALL], { encoding: 'utf8', env: { ...process.env, HOME: home, ZDOTDIR: '' } })
  assert.strictEqual(run().status, 0)
  assert.strictEqual(run().status, 0)
  const out = fs.readFileSync(rc, 'utf8')
  assert.match(out, /export FOO=1/)
  assert.match(out, /alias keep=1/)
  assert.doesNotMatch(out, /spec-status\.js/, 'the stale copied function is gone')
  assert.strictEqual(out.split('# >>> claude-plugins shell setup >>>').length - 1, 1, 'exactly one block')
  assert.match(out, /source "\$HOME\/Projects\/claude-plugins\/setup\/shellrc\.sh"/)
})
