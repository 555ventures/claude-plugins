'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { read, tmpdir, runNode, SPEC } = require('../helpers')

// Owner: specs/20260912/08-the-register-is-the-whole-shadcn-set.md
// AC-20260912-08-4, AC-20260912-08-5, AC-20260912-08-6.

const RETIRED_TOKENS_CSS =
  ':root{--bg:#fff;--fg:#111;--muted:#666;--muted-bg:#eee;--border:#ddd;--primary:#222;' +
  '--primary-fg:#fff;--ring:#999;--radius:8px;--font:sans-serif;--shadow:0 1px 2px rgba(0,0,0,.1)}\n'

function refresh(dir) {
  return runNode('scripts/mocks-driver.js', ['--root', dir, '--refresh-register'])
}

test('AC-20260912-08-4: --refresh-register on a host stuck on the retired register overwrites both wire files, rewrites every retired var() reference under design/, and prints the rewritten-file count', () => {
  const dir = tmpdir('refresh-pre-')
  fs.mkdirSync(path.join(dir, 'design/wire'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/wire/tokens.css'), RETIRED_TOKENS_CSS)
  fs.writeFileSync(path.join(dir, 'design/wire/wire.css'), 'body{color:var(--fg);background:var(--bg)}\n')
  fs.writeFileSync(path.join(dir, 'design/mocks/a.html'),
    '<main style="color: var(--fg); background: var(--muted-bg);">hi</main>\n')

  const r = refresh(dir)
  assert.strictEqual(r.status, 0,
    'a host on the retired register must refresh cleanly and exit 0: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /✅ register refreshed — 1 file\(s\) rewritten/,
    'the driver must print the exact rewritten-file-count sentinel (only design/mocks/a.html actually changes): ' + r.stdout)

  const rewrittenMock = fs.readFileSync(path.join(dir, 'design/mocks/a.html'), 'utf8')
  assert.strictEqual(rewrittenMock, '<main style="color: var(--foreground); background: var(--muted);">hi</main>\n',
    'the retired var() references in design/mocks/a.html must be rewritten to their D6 successors, --fg to --foreground and --muted-bg to --muted, in one simultaneous pass: ' + rewrittenMock)

  const newTokens = fs.readFileSync(path.join(dir, 'design/wire/tokens.css'), 'utf8')
  const templateTokens = read('spec/templates/mocks/wire-tokens.css')
  assert.strictEqual(newTokens, templateTokens,
    'design/wire/tokens.css must be overwritten byte-for-byte from the current spec/templates/mocks/wire-tokens.css template: ' + newTokens.slice(0, 200))

  const newWire = fs.readFileSync(path.join(dir, 'design/wire/wire.css'), 'utf8')
  const templateWire = read('spec/templates/mocks/wire.css')
  assert.strictEqual(newWire, templateWire,
    'design/wire/wire.css must be overwritten byte-for-byte from the current spec/templates/mocks/wire.css template: ' + newWire.slice(0, 200))
})

test('AC-20260912-08-5: --refresh-register refuses and writes nothing against a host whose tokens.css declares neither register, and is a no-op that exits 0 against a host already on the current register', () => {
  const dirBad = tmpdir('refresh-neither-')
  fs.mkdirSync(path.join(dirBad, 'design/wire'), { recursive: true })
  fs.writeFileSync(path.join(dirBad, 'design/wire/tokens.css'), ':root{--bg:#fff;--brand:#f00}\n')
  const before = fs.readFileSync(path.join(dirBad, 'design/wire/tokens.css'), 'utf8')

  const r1 = refresh(dirBad)
  assert.strictEqual(r1.status, 1,
    'a tokens.css declaring neither register in full must be refused with exit 1, never silently accepted: ' + r1.stdout + r1.stderr)
  assert.match(r1.stderr, /design\/wire\/tokens\.css declares neither the retired nor the current register/,
    'the refusal must name design/wire/tokens.css and the re-copy remedy: ' + r1.stderr)
  const after = fs.readFileSync(path.join(dirBad, 'design/wire/tokens.css'), 'utf8')
  assert.strictEqual(after, before,
    'a refused refresh must write nothing at all, not even a partial rewrite of tokens.css')

  const dirCurrent = tmpdir('refresh-current-')
  fs.mkdirSync(path.join(dirCurrent, 'design/wire'), { recursive: true })
  const currentTemplate = read('spec/templates/mocks/wire-tokens.css')
  fs.writeFileSync(path.join(dirCurrent, 'design/wire/tokens.css'), currentTemplate)

  const r2 = refresh(dirCurrent)
  assert.strictEqual(r2.status, 0,
    'a host already on the current register must exit 0, never refused: ' + r2.stdout + r2.stderr)
  assert.match(r2.stdout, /✅ register is already the current one — nothing to refresh/,
    'the driver must say the register is already current: ' + r2.stdout)
})

test('AC-20260912-08-6: renameRoles applies the retired-to-current map as one simultaneous substitution, so --muted and --muted-bg trade places in one pass without collapsing onto the same value', () => {
  const wireRolesPath = path.join(SPEC, 'scripts/lib/wire-roles.js')
  assert.ok(fs.existsSync(wireRolesPath),
    'spec/scripts/lib/wire-roles.js must exist — D6 puts the retired-to-current map and renameRoles() in one exported module, never spelled twice')
  delete require.cache[wireRolesPath]
  const { renameRoles } = require(wireRolesPath)
  const input = 'a { color: var(--muted); background: var(--muted-bg); }'
  const output = renameRoles(input)
  assert.strictEqual(output, 'a { color: var(--muted-foreground); background: var(--muted); }',
    '--muted and --muted-bg must trade places in one simultaneous pass — a sequential rename collapses both onto the same value and silently greys out every body of text: got "' + output + '"')
})
