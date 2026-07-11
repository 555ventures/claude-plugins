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

// v3 schema convenience: a surface's copy strings in document order
const copyOf = (s) => s.entries.filter(e => e.kind === 'copy').map(e => e.value)

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
  assert.strictEqual(manifest.schemaVersion, 3)
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

test('fidelity: user-visible copy extracted in document order, attrs and entities included', () => {
  const { res, manifest } = extract(BASE(
    '<x-dc id="form"><style>.x { color: red; }</style>' +
    '<label>Email address</label><input placeholder="you@example.com">' +
    '<button aria-label="Send the invite">Send&nbsp;invite</button><button>Cancel</button></x-dc>'))
  assert.strictEqual(res.status, 0, res.stderr)
  assert.deepStrictEqual(copyOf(manifest.surfaces[0]),
    ['Email address', 'you@example.com', 'Send the invite', 'Send invite', 'Cancel'])
  // attr provenance is recorded (diagnostics), style text never leaks into copy
  const attrs = manifest.surfaces[0].entries.filter(e => e.attr).map(e => e.attr)
  assert.deepStrictEqual(attrs, ['placeholder', 'aria-label'])
})

test('fidelity: layout primitives from inline styles and style blocks, region-tagged, deduped', () => {
  const { res, manifest } = extract(BASE(
    '<x-dc id="row"><style>.row { grid-template-columns: 1fr auto; }</style>' +
    '<div style="grid-template-columns: 1fr auto; color: #fff"><div style="flex-direction: column">x</div></div></x-dc>'))
  assert.strictEqual(res.status, 0, res.stderr)
  assert.deepStrictEqual(manifest.surfaces[0].layout, [
    { region: 'root', property: 'grid-template-columns', value: '1fr auto' },
    { region: 'root', property: 'flex-direction', value: 'column' },
  ])
})

// ---- v2 region + string-class mechanics (schemaVersion 3) --------------------------------------

test('regions: data-screen-label elements and comment-labeled siblings, nested via parent', () => {
  const { res, manifest, out } = extract(BASE(
    '<x-dc id="app"><div>' +
    '<div data-screen-label="Sidebar"><!-- workspace switcher --><div><b>Acme</b></div><span>New chat</span></div>' +
    '<!-- ============ MAIN THREAD ============ --><div><p>Hello there</p></div>' +
    '</div></x-dc>'))
  assert.strictEqual(res.status, 0, res.stderr)
  const s = manifest.surfaces[0]
  const byId = Object.fromEntries(s.regions.map(r => [r.id, r]))
  assert.ok(byId.root && byId.sidebar && byId['main-thread'] && byId['workspace-switcher'],
    'expected root/sidebar/main-thread/workspace-switcher, got ' + s.regions.map(r => r.id))
  assert.strictEqual(byId.sidebar.source, 'screen-label')
  assert.strictEqual(byId['main-thread'].source, 'comment')
  assert.strictEqual(byId['workspace-switcher'].parent, 'sidebar', 'comment region nests under the enclosing label region')
  assert.strictEqual(byId.sidebar.parent, 'root')
  // strings land in their SMALLEST enclosing region
  const at = (v) => s.entries.find(e => e.value === v).region
  assert.strictEqual(at('Acme'), 'workspace-switcher')
  assert.strictEqual(at('New chat'), 'sidebar')
  assert.strictEqual(at('Hello there'), 'main-thread')
  // per-region slices exist and carry only their subtree
  for (const rid of ['sidebar', 'main-thread', 'workspace-switcher']) {
    assert.ok(byId[rid].sliceFile, rid + ' should have a slice file')
    assert.ok(fs.existsSync(path.join(out, byId[rid].sliceFile)))
  }
  const sidebarSlice = fs.readFileSync(path.join(out, byId.sidebar.sliceFile), 'utf8')
  assert.ok(sidebarSlice.includes('New chat') && !sidebarSlice.includes('Hello there'))
})

test('regions: an all-decoration comment is not a label; deep comment regions get no slice file', () => {
  const { res, manifest } = extract(BASE(
    '<x-dc id="app"><!-- ==================== --><div>' +
    '<div data-screen-label="A"><div><!-- lvl2 --><div><!-- lvl3 --><div>deep</div></div></div></div>' +
    '</div></x-dc>'))
  assert.strictEqual(res.status, 0, res.stderr)
  const s = manifest.surfaces[0]
  const ids = s.regions.map(r => r.id)
  assert.ok(!ids.includes('region'), 'decoration-only comment must not create a region: ' + ids)
  const lvl3 = s.regions.find(r => r.id === 'lvl3')
  assert.ok(lvl3, 'deep comment still anchors a region')
  assert.strictEqual(lvl3.sliceFile, undefined, 'depth>2 comment regions are anchors, not files')
  const a = s.regions.find(r => r.id === 'a')
  assert.ok(a.sliceFile, 'screen-label regions always get a slice')
})

test('string classes: mustache-only text is a binding, mixed text a template, sc-for content sample data', () => {
  const { res, manifest } = extract(BASE(
    '<x-dc id="s"><span>{{ b.name }}</span><span>Invited {{ c.date }}</span>' +
    '<sc-for list="{{ chats }}" as="c" hint-placeholder-count="2"><span>Weekly Investor Update</span><i>{{ c.badge }}</i></sc-for>' +
    '<button>Send invite</button></x-dc>'))
  assert.strictEqual(res.status, 0, res.stderr)
  const s = manifest.surfaces[0]
  const kinds = (k) => s.entries.filter(e => e.kind === k)
  assert.deepStrictEqual(kinds('binding').map(e => e.value), ['b.name', 'c.badge'])
  assert.deepStrictEqual(kinds('template').map(e => e.segments), [['Invited', '']])
  assert.deepStrictEqual(kinds('sample').map(e => e.value), ['Weekly Investor Update'])
  assert.deepStrictEqual(kinds('copy').map(e => e.value), ['Send invite'],
    'mustaches and sc-for sample rows must NOT pollute the verbatim copy contract')
})

test('data-props: read from the <x-dc> root or from a sibling data-dc-script element', () => {
  const onRoot = extract(BASE(
    `<x-dc id="s" data-props="{&quot;open&quot;:{&quot;tsType&quot;:&quot;boolean&quot;}}"><p>hi</p></x-dc>`))
  assert.strictEqual(onRoot.res.status, 0, onRoot.res.stderr)
  assert.deepStrictEqual(onRoot.manifest.surfaces[0].props, { open: { tsType: 'boolean' } })

  const onScript = extract(BASE(
    '<x-dc id="s"><p>hi</p></x-dc>' +
    `<script type="text/x-dc" data-dc-script data-props="{&quot;panelOpen&quot;:{&quot;default&quot;:true}}"></script>`))
  assert.strictEqual(onScript.res.status, 0, onScript.res.stderr)
  assert.deepStrictEqual(onScript.manifest.surfaces[0].props, { panelOpen: { default: true } },
    'canvas exports park data-props on a sibling script AFTER </x-dc> — it must still reach the surface')
})

test('literal harvest: inline colors and fonts counted by frequency (the palette tokenMap must cover)', () => {
  const { res, manifest } = extract(BASE(
    '<x-dc id="s"><div style="background:#FAFAF8;color:#1A1A18"><span style="color:#1A1A18;font-family:\'Inter\',sans-serif">x</span></div>' +
    '<style>.a { border: 1px solid #1A1A18; }</style></x-dc>'))
  assert.strictEqual(res.status, 0, res.stderr)
  const colors = Object.fromEntries(manifest.surfaces[0].literals.colors.map(c => [c.value, c.count]))
  assert.strictEqual(colors['#1A1A18'], 3)
  assert.strictEqual(colors['#FAFAF8'], 1)
  assert.deepStrictEqual(manifest.surfaces[0].literals.fonts.map(f => f.value), ["'Inter',sans-serif"])
})

test('variant proposals: heavy copy overlap flags the smaller surface as a variant of the larger', () => {
  const words = Array.from({ length: 12 }, (_, i) => 'Copy line number ' + i)
  const light = words.map(w => '<p>' + w + '</p>').join('') + '<p>Extra light-only row</p>'
  const dark = words.map(w => '<p>' + w + '</p>').join('')
  const { res, manifest } = extract(BASE(
    '<x-dc id="light">' + light + '</x-dc><x-dc id="dark">' + dark + '</x-dc><x-dc id="other"><p>Unrelated</p></x-dc>'))
  assert.strictEqual(res.status, 0, res.stderr)
  assert.deepStrictEqual(manifest.variantProposals, [{ surface: 'dark', of: 'light', overlap: 1 }])
})

// ---- bundle mode --------------------------------------------------------------------------------

test('bundle mode: dir of plain HTML screens + prompt.md notes; zero tokens is legal', () => {
  const dir = tmpdir('bundle')
  fs.writeFileSync(path.join(dir, 'settings-members.html'),
    '<html><body><h1>Members</h1><button>Send invite</button></body></html>')
  fs.writeFileSync(path.join(dir, 'billing.html'), '<div>Billing</div>')
  fs.writeFileSync(path.join(dir, 'settings-members.prompt.md'), '# notes')
  fs.writeFileSync(path.join(dir, 'README.md'), '# readme')
  const out = path.join(dir, 'out')
  const res = runNode(SCRIPT, ['--bundle', dir, out])
  assert.strictEqual(res.status, 0, res.stderr)
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'extract.json'), 'utf8'))
  assert.deepStrictEqual(manifest.tokens, [])
  assert.deepStrictEqual(manifest.surfaces.map(s => s.id).sort(), ['billing', 'settings-members'])
  const members = manifest.surfaces.find(s => s.id === 'settings-members')
  assert.deepStrictEqual(copyOf(members), ['Members', 'Send invite'])
  // <body> subtree only — the <html> wrapper is not part of the surface
  const slice = fs.readFileSync(path.join(out, members.sliceFile), 'utf8')
  assert.ok(!slice.includes('<html>'), 'slice must be the body subtree')
  // notes: prompt.md matched to its surface by stem; README unmatched
  const byPath = Object.fromEntries(manifest.notes.map(n => [path.basename(n.path), n.surfaceId]))
  assert.strictEqual(byPath['settings-members.prompt.md'], 'settings-members')
  assert.strictEqual(byPath['README.md'], null)
})

test('bundle mode: a file with <x-dc> blocks slices per block; :root tokens merge across files', () => {
  const dir = tmpdir('bundle2')
  fs.writeFileSync(path.join(dir, 'a.html'),
    '<html><head><style>:root { --space-1: 4px; }</style></head><body>' +
    '<x-dc id="card">c</x-dc><x-dc id="list">l</x-dc></body></html>')
  fs.writeFileSync(path.join(dir, 'b.html'),
    '<html><head><style>:root { --space-1: 8px; --color-bg: #fff; }</style></head><body><p>b</p></body></html>')
  const out = path.join(dir, 'out')
  const res = runNode(SCRIPT, ['--bundle', dir, out])
  assert.strictEqual(res.status, 0, res.stderr)
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'extract.json'), 'utf8'))
  assert.deepStrictEqual(manifest.surfaces.map(s => s.id).sort(), ['b', 'card', 'list'])
  const space = manifest.tokens.find(t => t.role === '--space-1')
  assert.strictEqual(space.value, '8px', 'later file wins per role')
  assert.ok(manifest.tokens.find(t => t.role === '--color-bg'))
})

test('bundle mode: single local HTML file works; unbalanced <x-dc> in a bundle file still dies', () => {
  const dir = tmpdir('bundle3')
  const one = path.join(dir, 'screen.html')
  fs.writeFileSync(one, '<body><h2>Solo</h2></body>')
  const res = runNode(SCRIPT, ['--bundle', one, path.join(dir, 'out')])
  assert.strictEqual(res.status, 0, res.stderr)
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'out/extract.json'), 'utf8'))
  assert.deepStrictEqual(manifest.surfaces.map(s => s.id), ['screen'])

  fs.writeFileSync(path.join(dir, 'bad.html'), '<body><x-dc id="a">never closed</body>')
  const res2 = runNode(SCRIPT, ['--bundle', path.join(dir, 'bad.html'), path.join(dir, 'out2')])
  assert.notStrictEqual(res2.status, 0)
  assert.match(res2.stderr, /unbalanced/)
})

// The next three tests pin bundle behaviors discovered against REAL handoff bundles (a dir of
// Claude Design `*.dc.html` exports with bare <x-dc>, and a hand-authored handoff with a tokens/
// css subdirectory and all classes defined in <head>).

test('bundle mode: id-less <x-dc> is named after its file stem (.dc stripped), source file recorded', () => {
  const dir = tmpdir('bundle4')
  fs.writeFileSync(path.join(dir, 'My Screen.dc.html'),
    '<html><body><x-dc><helmet><style>b{color:#000}</style></helmet><h1>One</h1></x-dc>' +
    '<x-dc><p>Two</p></x-dc></body></html>')
  const out = path.join(dir, 'out')
  const res = runNode(SCRIPT, ['--bundle', dir, out])
  assert.strictEqual(res.status, 0, res.stderr)
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'extract.json'), 'utf8'))
  // _auto_N would strip the only human-meaningful identity a one-surface-per-file export has
  assert.deepStrictEqual(manifest.surfaces.map(s => s.id), ['My_Screen', 'My_Screen-1'])
  assert.deepStrictEqual(manifest.surfaces.map(s => s.file),
    ['My Screen.dc.html', 'My Screen.dc.html'])
})

test('bundle mode: tokens/accents merge from .css files, subdirectories included, hashed into source', () => {
  const dir = tmpdir('bundle5')
  fs.mkdirSync(path.join(dir, 'tokens'))
  fs.writeFileSync(path.join(dir, 'screen.html'),
    '<html><head><style>:root { --space-1: 4px; }</style></head><body><p>hi</p></body></html>')
  fs.writeFileSync(path.join(dir, 'tokens/colors.css'),
    ':root { --color-bg: #fff; }\n:root { --color-fg: #111; }\n[data-accent="warm"] { --color-bg: #fee; }')
  // sorts after tokens/colors.css AND after screen.html → wins both roles it redefines
  fs.writeFileSync(path.join(dir, 'zz-overrides.css'), ':root { --color-bg: #fafaf8; --space-1: 8px; }')
  const out = path.join(dir, 'out')
  const res = runNode(SCRIPT, ['--bundle', dir, out])
  assert.strictEqual(res.status, 0, res.stderr)
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'extract.json'), 'utf8'))
  const roles = Object.fromEntries(manifest.tokens.map(t => [t.role, t.value]))
  assert.strictEqual(roles['--color-bg'], '#fafaf8', 'later css file wins per role')
  assert.strictEqual(roles['--color-fg'], '#111', 'every :root block in a css file is merged, not just the first')
  assert.strictEqual(roles['--space-1'], '8px', 'css sorted after the html wins over its :root')
  assert.deepStrictEqual(manifest.accents.warm.map(d => d.role), ['--color-bg'])
  assert.ok(manifest.source.files.includes('tokens/colors.css'), 'css files are part of the hashed source')
  // css files feed tokens only — never surfaces
  assert.deepStrictEqual(manifest.surfaces.map(s => s.id), ['screen'])
})

test('bundle mode: whole-file surface prepends head <style> — class layout reaches slice and fidelity', () => {
  const dir = tmpdir('bundle6')
  fs.writeFileSync(path.join(dir, 'members.html'),
    '<html><head><style>.form-grid{display:grid;grid-template-columns:1fr auto}' +
    '.nav{display:flex;flex-direction:column}</style></head>' +
    '<body><div class="form-grid"><input placeholder="Email address"><button>Send invite</button></div></body></html>')
  const out = path.join(dir, 'out')
  const res = runNode(SCRIPT, ['--bundle', dir, out])
  assert.strictEqual(res.status, 0, res.stderr)
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'extract.json'), 'utf8'))
  const s = manifest.surfaces[0]
  // a body-only slice would strand `class="form-grid"` with no definition and hide this layout
  assert.deepStrictEqual(s.layout, [
    { region: 'root', property: 'grid-template-columns', value: '1fr auto' },
    { region: 'root', property: 'flex-direction', value: 'column' },
  ])
  assert.deepStrictEqual(copyOf(s), ['Email address', 'Send invite'], 'style text must not leak into copy')
  const slice = fs.readFileSync(path.join(out, s.sliceFile), 'utf8')
  assert.ok(slice.includes('.form-grid{display:grid'), 'head style block travels with the slice')
  assert.ok(slice.includes('class="form-grid"'))
  assert.ok(!slice.includes('<html>'), 'slice is still the body subtree + styles, not the whole document')
})

test('bundle mode: editing a note file changes source.sha256 — notes are binding copy specs', () => {
  const dir = tmpdir('bundle7')
  fs.writeFileSync(path.join(dir, 'screen.html'), '<body><p>hi</p></body>')
  fs.writeFileSync(path.join(dir, 'screen.prompt.md'), 'copy: Send invite')
  const shaOf = (out) => {
    const res = runNode(SCRIPT, ['--bundle', dir, path.join(dir, out)])
    assert.strictEqual(res.status, 0, res.stderr)
    return JSON.parse(fs.readFileSync(path.join(dir, out, 'extract.json'), 'utf8')).source.sha256
  }
  const before = shaOf('out1')
  fs.writeFileSync(path.join(dir, 'screen.prompt.md'), 'copy: Send invitation')
  assert.notStrictEqual(shaOf('out2'), before, 'a note edit must cache-bust the extract')
})
