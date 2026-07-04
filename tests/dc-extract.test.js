'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('./helpers')

const SCRIPT = 'scripts/dc-extract.js'

function extract(html) {
  const dir = tmpdir('dcx')
  const src = path.join(dir, 'in.dc.html')
  const out = path.join(dir, 'out')
  fs.writeFileSync(src, html)
  const res = runNode(SCRIPT, [src, out])
  let manifest = null
  const mPath = path.join(out, 'extract.json')
  if (fs.existsSync(mPath)) manifest = JSON.parse(fs.readFileSync(mPath, 'utf8'))
  return { res, manifest, out }
}

const BASE = (body, css = '--color-bg: #fff; --space-1: 4px;') =>
  `<html><head><style>:root { ${css} }</style></head><body>${body}</body></html>`

test('happy path: tokens, accents, surfaces', () => {
  const { res, manifest } = extract(
    `<html><head><style>
      :root { --color-bg: #fff; --space-1: 4px; }
      [data-accent="warm"] { --color-bg: #fee; }
    </style></head><body>
      <x-dc id="card"><div>hi</div></x-dc>
      <x-dc id="list"><ul></ul></x-dc>
    </body></html>`)
  assert.strictEqual(res.status, 0, res.stderr)
  assert.strictEqual(manifest.tokens.length, 2)
  assert.deepStrictEqual(Object.keys(manifest.accents), ['warm'])
  assert.deepStrictEqual(manifest.surfaces.map(s => s.id), ['card', 'list'])
})

test('fails loud: no :root, no surfaces, over cap', () => {
  assert.notStrictEqual(extract('<html><body><x-dc id="a"></x-dc></body></html>').res.status, 0)
  assert.notStrictEqual(extract(BASE('')).res.status, 0)
  assert.notStrictEqual(extract(BASE('<x-dc id="a">' + 'x'.repeat(300 * 1024) + '</x-dc>')).res.status, 0)
})

test('stray close tag fails loud (fail-loud contract, both directions)', () => {
  const { res } = extract(BASE('</x-dc><x-dc id="a">ok</x-dc>'))
  assert.notStrictEqual(res.status, 0, 'an extra </x-dc> is unbalanced markup and must die, not parse')
  assert.match(res.stderr, /unbalanced/)
})

test('last declaration without trailing semicolon is still extracted', () => {
  const { res, manifest } = extract(BASE('<x-dc id="a">x</x-dc>', '--color-bg: #fff; --space-1: 4px'))
  assert.strictEqual(res.status, 0, res.stderr)
  assert.deepStrictEqual(manifest.tokens.map(t => t.role), ['--color-bg', '--space-1'])
})

test('repeated [data-accent] blocks for one accent merge instead of last-wins', () => {
  const { res, manifest } = extract(
    `<html><head><style>
      :root { --a: 1px; }
      [data-accent="x"] { --a: 2px; }
      [data-accent="x"] { --b: 3px; }
    </style></head><body><x-dc id="s">x</x-dc></body></html>`)
  assert.strictEqual(res.status, 0, res.stderr)
  const roles = manifest.accents.x.map(t => t.role).sort()
  assert.deepStrictEqual(roles, ['--a', '--b'])
})

test('collision suffixing cannot clobber a real surface named id-1', () => {
  const { res, manifest, out } = extract(BASE(
    '<x-dc id="id">a</x-dc><x-dc id="id">b</x-dc><x-dc id="id-1">c</x-dc>'))
  assert.strictEqual(res.status, 0, res.stderr)
  const files = manifest.surfaces.map(s => s.sliceFile)
  assert.strictEqual(new Set(files).size, files.length, 'slice filenames must be unique: ' + files)
  for (const f of files) assert.ok(fs.existsSync(path.join(out, f)))
  // every slice's content survived (no clobber)
  const contents = files.map(f => fs.readFileSync(path.join(out, f), 'utf8')).join('|')
  for (const c of ['>a<', '>b<', '>c<']) assert.ok(contents.includes(c), 'lost slice content ' + c)
})

test(':root in prose/comments is not mistaken for the token block', () => {
  const { res, manifest } = extract(
    `<html><head><!-- :root { --fake: 1; } --><style>:root { --real: 2px; }</style></head>` +
    `<body><x-dc id="s">x</x-dc></body></html>`)
  assert.strictEqual(res.status, 0, res.stderr)
  assert.deepStrictEqual(manifest.tokens.map(t => t.role), ['--real'])
})

test('slices are minified: comments and inter-tag whitespace collapse', () => {
  const { res, manifest, out } = extract(BASE(
    '<x-dc id="s">\n  <div>\n    <!-- decorative comment -->\n    <span>hi</span>\n  </div>\n</x-dc>'))
  assert.strictEqual(res.status, 0, res.stderr)
  const slice = fs.readFileSync(path.join(out, manifest.surfaces[0].sliceFile), 'utf8')
  assert.ok(!slice.includes('decorative comment'), 'comments must be stripped from slices')
  assert.ok(!/\n\s{2,}/.test(slice), 'indentation runs must be collapsed in slices')
  assert.ok(slice.includes('<span>hi</span>'), 'content preserved')
})

test('nested surfaces each get their own slice', () => {
  const { res, manifest } = extract(BASE('<x-dc id="outer"><x-dc id="inner">x</x-dc></x-dc>'))
  assert.strictEqual(res.status, 0, res.stderr)
  assert.deepStrictEqual(manifest.surfaces.map(s => s.id).sort(), ['inner', 'outer'])
})
