'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('./helpers')

const atlas = (argv, opts) => runNode('scripts/design-atlas.js', argv, opts)

function fixture() {
  const dir = tmpdir('atlas')
  const mk = (rel, content) => {
    const p = path.join(dir, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, content)
  }
  mk('design/mocks/lobby.html',
    '<link rel="stylesheet" href="../tokens.css">\n<style>* { box-sizing: border-box; }</style>\n' +
    '<main data-screen-label="lobby" data-status="approved" style="color:var(--text-body)">Lobby</main>\n')
  mk('design/mocks/thread.html',
    '<link rel="stylesheet" href="../tokens.css">\n<main data-screen-label="thread">Thread</main>\n')
  mk('docs/roadmap/01-chrome.md',
    '# 01\n```surfaces\nsignin\nsignin -> lobby\nlobby -> thread\nlobby -> account\n# a comment\n```\n')
  mk('.claude/design-coverage.json', JSON.stringify({
    sources: { 'design/mocks': { regions: { 'lobby#root': { spec: 'specs/20260716/01-x.md', at: '2026-07-16' } } } },
  }))
  mk('specs/20260716/01-x.md', '---\nstatus: done\n---\n# x\n')
  return dir
}

test('check: labeled token-consuming mocks pass; label/tokens/color violations fail closed (AC-20260901-04-6)', () => {
  const dir = fixture()
  const ok = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(ok.status, 0, ok.stdout + ok.stderr)
  assert.match(ok.stdout, /CHECK PASS \(2 file/)

  fs.mkdirSync(path.join(dir, 'design/explore/r0-bad'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/explore/r0-bad/tile.html'),
    '<main style="color:#fff">no label, no tokens link</main>\n')
  const bad = atlas(['check', path.join(dir, 'design/explore/r0-bad')])
  assert.strictEqual(bad.status, 1)
  assert.match(bad.stdout, /no data-screen-label/)
  assert.match(bad.stdout, /does not link a tokens\.css/)
  assert.match(bad.stdout, /off-token color literal/)
})

test('gallery: one card per candidate subdir, lazy iframes, deterministic output path', () => {
  const dir = fixture()
  for (const c of ['r0-instrument', 'r0-guide']) {
    fs.mkdirSync(path.join(dir, 'design/explore', c), { recursive: true })
    fs.writeFileSync(path.join(dir, 'design/explore', c, 'tile.html'),
      '<link rel="stylesheet" href="./tokens.css">\n<main data-screen-label="signin">t</main>\n')
  }
  const res = atlas(['gallery', path.join(dir, 'design/explore')])
  assert.strictEqual(res.status, 0, res.stdout + res.stderr)
  const out = fs.readFileSync(path.join(dir, 'design/explore/gallery.html'), 'utf8')
  assert.match(out, /r0-guide/)
  assert.match(out, /r0-instrument/)
  assert.match(out, /loading="lazy"/)
})

test('build: statuses derive from mocks × surfaces × ledger × spec stamps — never declared by hand', () => {
  const dir = fixture()
  const res = atlas(['build'], { cwd: dir })
  assert.strictEqual(res.status, 0, res.stdout + res.stderr)
  const out = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')
  // lobby: ledger-claimed by a done spec → built; thread: mock only → sketch;
  // signin/account: declared, no mock → gap cards.
  assert.match(res.stdout, /1 built/)
  assert.match(res.stdout, /2 gap/)
  assert.match(res.stdout, /1 sketch/)
  assert.match(out, /badge built/)
  assert.match(out, /declared, no mock yet/)
  assert.match(out, /"source":"lobby","target":"thread"/, 'journey edges must reach the graph data')
  assert.match(out, /loading="lazy"/)
})

test('build: a mock with no brief AND no claim is an orphan; a non-done claiming spec is bound, not built', () => {
  const dir = fixture()
  fs.writeFileSync(path.join(dir, 'design/mocks/rogue.html'),
    '<link rel="stylesheet" href="../tokens.css">\n<main data-screen-label="rogue">R</main>\n')
  fs.writeFileSync(path.join(dir, 'specs/20260716/01-x.md'), '---\nstatus: implementing\n---\n# x\n')
  const res = atlas(['build'], { cwd: dir })
  assert.strictEqual(res.status, 0, res.stdout + res.stderr)
  const out = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')
  assert.match(out, /badge orphan/)
  assert.match(out, /badge bound/)
  assert.doesNotMatch(out, /badge built/)
})

test('build: a ledger-claimed mock is NOT an orphan even when no brief declares it (standalone-spec mocks)', () => {
  const dir = fixture()
  // solo: undeclared in any surfaces block, but claimed by a spec via the coverage ledger
  fs.writeFileSync(path.join(dir, 'design/mocks/solo.html'),
    '<link rel="stylesheet" href="../tokens.css">\n<main data-screen-label="solo">S</main>\n')
  fs.writeFileSync(path.join(dir, '.claude/design-coverage.json'), JSON.stringify({
    sources: { 'design/mocks': { regions: {
      'lobby#root': { spec: 'specs/20260716/01-x.md', at: '2026-07-16' },
      'solo#root': { spec: 'specs/20260716/01-x.md', at: '2026-07-16' },
    } } },
  }))
  const res = atlas(['build'], { cwd: dir })
  assert.strictEqual(res.status, 0, res.stdout + res.stderr)
  const out = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')
  assert.doesNotMatch(out, /badge orphan/)
  assert.match(out, /id="s-solo"/)
})

const TARGETS = JSON.stringify({
  schemaVersion: 1,
  themes: ['light', 'dark'],
  viewports: [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 834, height: 1112 },
    { name: 'desktop', width: 1280, height: 800 },
  ],
})

test('check: matrix binds at approved (or --matrix); sketches iterate one framing for free', () => {
  const dir = fixture()
  fs.writeFileSync(path.join(dir, 'design/targets.json'), TARGETS)
  // fixture: lobby is approved (owes the matrix), thread is a sketch (exempt); no viewport
  // meta anywhere, and the linked tokens.css does not exist
  const bad = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(bad.status, 1)
  assert.match(bad.stdout, /lobby\.html: no <meta name="viewport">/)
  assert.match(bad.stdout, /lobby\.html: dark theme declared .* tokens\.css is unreadable/)
  assert.doesNotMatch(bad.stdout, /thread\.html: no <meta/, 'sketch mocks are exempt without --matrix')

  // --matrix forces the checks onto drafts too (the post-approval expansion gate)
  const forced = atlas(['check', '--matrix', path.join(dir, 'design/mocks')])
  assert.strictEqual(forced.status, 1)
  assert.match(forced.stdout, /thread\.html: no <meta name="viewport">/)

  // light-only tokens: the approved mock still fails on the missing dark block
  fs.writeFileSync(path.join(dir, 'design/tokens.css'), ':root{--text-body:#111}\n')
  const noDark = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(noDark.status, 1)
  assert.match(noDark.stdout, /no dark theme block/)

  // expanded: responsive single file + themed tokens → pass, sketch untouched
  fs.appendFileSync(path.join(dir, 'design/tokens.css'), ':root[data-theme="dark"]{--text-body:#eee}\n')
  fs.writeFileSync(path.join(dir, 'design/mocks/lobby.html'),
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<link rel="stylesheet" href="../tokens.css">\n' +
    '<style>* { box-sizing: border-box; }</style>\n' +
    '<main data-screen-label="lobby" data-status="approved">x</main>\n')
  const ok = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(ok.status, 0, ok.stdout + ok.stderr)
})

test('build/gallery: matrix toolbar emitted only when targets.json exists', () => {
  const dir = fixture()
  atlas(['build'], { cwd: dir })
  let out = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')
  assert.doesNotMatch(out, /data-vp/, 'no toolbar without targets.json')

  fs.writeFileSync(path.join(dir, 'design/targets.json'), TARGETS)
  atlas(['build'], { cwd: dir })
  out = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')
  assert.match(out, /mobile 390/)
  assert.match(out, /desktop 1280/)
  assert.match(out, /setAttribute\("data-theme",t\)/, 'theme toggle stamps data-theme on frames')

  fs.mkdirSync(path.join(dir, 'design/explore/r0-a'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/explore/r0-a/tile.html'),
    '<link rel="stylesheet" href="./tokens.css">\n<main data-screen-label="signin">t</main>\n')
  atlas(['gallery', path.join(dir, 'design/explore')])
  const gal = fs.readFileSync(path.join(dir, 'design/explore/gallery.html'), 'utf8')
  assert.match(gal, /tablet 834/, 'gallery finds design/targets.json by walking up')
})

test('build: generated output is byte-stable across runs (no timestamps, sorted walks)', () => {
  const dir = fixture()
  atlas(['build'], { cwd: dir })
  const a = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')
  atlas(['build'], { cwd: dir })
  const b = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')
  assert.strictEqual(a, b)
})

// specs/20260824/03-mock-states-hygiene.md — 2026-08-24. D1 gives `check` four hygiene rules
// bound at data-status ratified|approved (or --matrix), each pinned to a measured false-positive
// class (prax border-box/frame, prax+salon-os undeclared leading, salon-os proto-strip
// scaffolding). D2 makes `ratified` equivalent to `approved` for every existing check too. These
// checks do not exist on the pre-spec script — every test below is red until cmdCheck grows
// checks (a)-(d) and statusOf's `approved`-only matrix gate widens to include `ratified`.
// mockHtml() builds an otherwise-fully-compliant ratified mock so each test isolates exactly one
// hygiene rule via a single mutation, per the spec's own worked AC examples.

function mockHtml({ style, status = 'ratified', beforeRoot = '',
  stateBtn = '<div data-contract="none"><button data-state-btn="empty">Empty</button></div>' } = {}) {
  return '<link rel="stylesheet" href="../tokens.css">\n' +
    beforeRoot +
    '<style>\n' + style + '\n</style>\n' +
    '<main class="screen" data-screen-label="lobby" data-status="' + status + '">\n' +
    stateBtn + '\nLobby\n</main>\n'
}

function writeMock(dir, html) {
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  const p = path.join(dir, 'design/mocks/lobby.html')
  fs.writeFileSync(p, html)
  return p
}

test('check: a ratified mock with no universal box-sizing: border-box rule fails closed; the reset alone passes (AC-20260824-03-1)', () => {
  const dir = tmpdir('atlas')
  writeMock(dir, mockHtml({ style: '.screen { color: var(--text-body); }' }))
  const bad = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(bad.status, 1,
    'a ratified mock with no universal border-box reset must fail check: bordered elements measure ' +
    '2px larger than the component box — ' + bad.stdout + bad.stderr)
  assert.match(bad.stdout,
    /no universal box-sizing: border-box rule — bordered elements measure 2px larger than the component's border-box/,
    'the exact D1(a) violation string must be printed so the author knows which hygiene rule to add')

  writeMock(dir, mockHtml({ style: '* { box-sizing: border-box; }\n.screen { color: var(--text-body); }' }))
  const good = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(good.status, 0, 'the universal reset alone must clear the border-box check — ' + good.stdout + good.stderr)
  assert.doesNotMatch(good.stdout, /no universal box-sizing: border-box rule/,
    'the border-box violation must not fire once the universal reset is present')

  // A bound mock that externalizes ALL its CSS has no rules for (a)-(c) to read, so (a) is the only
  // signal the author gets that the stylesheet the gate reads is not the one they wrote. Exempting
  // style-less files is the fail-open D5 forbids one case over (build 2026-08-24, deviation caught
  // at Phase 4 and reverted before review).
  fs.writeFileSync(path.join(dir, 'design/mocks/lobby.html'),
    '<link rel="stylesheet" href="../tokens.css">\n<link rel="stylesheet" href="./ext.css">\n' +
    '<main class="screen" data-screen-label="lobby" data-status="ratified">Lobby</main>\n')
  const externalized = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(externalized.status, 1,
    'a bound mock with no <style> of its own must still owe the border-box reset: it is the only ' +
    'hygiene signal that reaches a mock whose CSS lives outside the file — ' +
    externalized.stdout + externalized.stderr)
  assert.match(externalized.stdout, /no universal box-sizing: border-box rule/,
    'check (a) must bind on every ratified|approved file, never skip one for carrying no <style>')
})

test("check: a ratified mock's font-size rule with no line-height fails; a declared leading passes (AC-20260824-03-2)", () => {
  const dir = tmpdir('atlas')
  writeMock(dir, mockHtml({ style: '* { box-sizing: border-box; }\n.label { font-size: 12px; }' }))
  const bad = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(bad.status, 1,
    'a font-size rule with no line-height must fail check: undeclared leading is up to 13% height ' +
    'error the gate cannot see — ' + bad.stdout + bad.stderr)
  assert.match(bad.stdout,
    /1 CSS block\(s\) declare font-size without line-height \(first: \.label\) — undeclared leading is up to 13% height error the gate cannot see/,
    'the exact D1(b) violation string, including the first-offender selector, must be printed')

  writeMock(dir, mockHtml({ style: '* { box-sizing: border-box; }\n.label { font-size: 12px; line-height: 1.4; }' }))
  const good = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(good.status, 0, 'a declared line-height in the same block must clear the check — ' + good.stdout + good.stderr)
  assert.doesNotMatch(good.stdout, /declare font-size without line-height/,
    'the line-height violation must not fire once the block declares one')
})

test('check: a ratified root class declaring border/border-radius fails as a device frame; a frameless root passes (AC-20260824-03-3)', () => {
  const dir = tmpdir('atlas')
  writeMock(dir, mockHtml({ style: '* { box-sizing: border-box; }\n.screen { border: 1px solid var(--border); border-radius: 36px; }' }))
  const bad = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(bad.status, 1,
    'a bordered root rule must fail check: a device frame shifts every measured box by the frame width — ' +
    bad.stdout + bad.stderr)
  assert.match(bad.stdout,
    /root rule \.screen declares border\/border-radius — a device frame shifts every measured box by the frame width/,
    'the exact D1(c) violation string, naming the matched root class, must be printed')

  writeMock(dir, mockHtml({ style: '* { box-sizing: border-box; }\n.screen { color: var(--text-body); }' }))
  const good = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(good.status, 0, 'a root rule with neither border nor border-radius must clear the check — ' + good.stdout + good.stderr)
  assert.doesNotMatch(good.stdout, /declares border\/border-radius/,
    'the device-frame violation must not fire once the root rule drops border and border-radius')
})

test('check: a data-state-btn inside the ratified root with no data-contract="none" ancestor fails; before-root or contract-none placement passes (AC-20260824-03-4)', () => {
  const dir = tmpdir('atlas')
  const baseStyle = '* { box-sizing: border-box; }\n.screen { color: var(--text-body); }'

  writeMock(dir, mockHtml({ style: baseStyle, stateBtn: '<button data-state-btn="empty">Empty</button>' }))
  const bad = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(bad.status, 1,
    'a state control sitting bare inside the root must fail check: state switchers are tooling, never contract — ' +
    bad.stdout + bad.stderr)
  assert.match(bad.stdout,
    /data-state-btn control inside the \[data-screen-label\] root without a data-contract="none" ancestor — state switchers are tooling, never contract/,
    'the exact D1(d) violation string must be printed')

  writeMock(dir, mockHtml({ style: baseStyle, stateBtn: '', beforeRoot: '<button data-state-btn="empty">Empty</button>\n' }))
  const beforeRootOk = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(beforeRootOk.status, 0,
    'a state control placed before the root opening tag must clear the check — ' + beforeRootOk.stdout + beforeRootOk.stderr)
  assert.doesNotMatch(beforeRootOk.stdout, /data-state-btn control inside/,
    'the state-control violation must not fire for controls that precede the root in the file')

  writeMock(dir, mockHtml({ style: baseStyle }))
  const contractNoneOk = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(contractNoneOk.status, 0,
    'a state control wrapped in a data-contract="none" ancestor must clear the check — ' +
    contractNoneOk.stdout + contractNoneOk.stderr)
  assert.doesNotMatch(contractNoneOk.stdout, /data-state-btn control inside/,
    'the state-control violation must not fire once a data-contract="none" ancestor wraps the control')
})

test('check: ratified now binds the viewport-meta matrix check exactly like approved; sketch stays exempt (AC-20260824-03-5)', () => {
  const dir = tmpdir('atlas')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/targets.json'), TARGETS)
  fs.writeFileSync(path.join(dir, 'design/tokens.css'),
    ':root{--text-body:#111}\n:root[data-theme="dark"]{--text-body:#eee}\n')
  fs.writeFileSync(path.join(dir, 'design/mocks/ratified.html'),
    '<link rel="stylesheet" href="../tokens.css">\n' +
    '<style>* { box-sizing: border-box; }\n.screen { color: var(--text-body); }</style>\n' +
    '<main class="screen" data-screen-label="lobby" data-status="ratified">Lobby</main>\n')
  fs.writeFileSync(path.join(dir, 'design/mocks/sketch.html'),
    '<link rel="stylesheet" href="../tokens.css">\n' +
    '<main data-screen-label="draft" data-status="sketch">Draft</main>\n')

  const res = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(res.status, 1,
    'a ratified mock missing viewport meta must fail the matrix check exactly as an approved mock does — ' +
    res.stdout + res.stderr)
  assert.match(res.stdout, /ratified\.html: no <meta name="viewport">/,
    'D2: ratified is equivalent to approved for the matrix checks, so this must fire without --matrix')
  assert.doesNotMatch(res.stdout, /sketch\.html: no <meta/,
    'sketch mocks stay exempt from the matrix even once ratified counts as approved')
})

test("check: unbalanced braces in a ratified mock's <style> fail closed instead of silently skipping the parse (AC-20260824-03-6)", () => {
  const dir = tmpdir('atlas')
  writeMock(dir, mockHtml({ style: '.a { color: var(--x);' }))
  const bad = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(bad.status, 1,
    'unbalanced braces in the style block must fail closed: D5 requires naming the file, never a silent skip — ' +
    bad.stdout + bad.stderr)
  assert.match(bad.stdout, /unbalanced braces in <style> — fix the stylesheet before ratifying/,
    'the exact D1/D5 violation string must be printed for the file')

  writeMock(dir, mockHtml({ style: '* { box-sizing: border-box; }\n.screen { color: var(--text-body); }' }))
  const good = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(good.status, 0, 'balanced braces must not trip the unbalanced-braces check — ' + good.stdout + good.stderr)
  assert.doesNotMatch(good.stdout, /unbalanced braces in <style>/,
    'the unbalanced-braces violation must not fire when the style block is well-formed')
})

// specs/20260901/04-shell-composed-mocks.md — 2026-09-01. D1 gives design/shell/<name>.html the
// canon shape (data-shell-canon root, named data-slots, one empty content slot, non-content
// slots data-contract="none") plus a linked <name>.css; D4 binds a shell family on `check`,
// tiered warn-at-sketch/violation-at-ratified|approved|--matrix, once a design/shell dir resolves
// by walk-up from the mock. TDD red (grep-confirmed 2026-09-01): design-atlas.js has zero shell
// vocabulary today — every fixture below produces no shell finding on the pre-image script, so
// AC-1..AC-5, AC-7, AC-8 are red until CREATE spec/scripts/lib/shell-region.js and the shell
// family land in cmdCheck. AC-6 above (tagged, unchanged) is the absence-invariant control: no
// existing fixture carries a design/shell dir (Assumption A2), so it must stay green throughout.
//
// CANON_APP_HTML/SHELL_APP_CSS are the literal D1 Contracts example. expectedInner()/syncedRegion()
// rebuild D3's splice (content-slot substitution + active-nav aria-current) by exact substring
// surgery on that same literal, so every "synced" fixture below is byte-consistent with the canon
// by construction rather than hand-typed and hoped-correct.

const CANON_APP_HTML = '<!doctype html><html><head><meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  '<link rel="stylesheet" href="../tokens.css">\n' +
  '<link rel="stylesheet" href="app.css">\n' +
  '<style>* { box-sizing: border-box; }</style></head><body>\n' +
  '<div data-shell-canon="app" class="shell">\n' +
  '  <nav data-slot="nav" data-contract="none" aria-label="Main">\n' +
  '    <a data-nav="inbox" href="#">Inbox</a>\n' +
  '    <a data-nav="settings" href="#">Settings</a>\n' +
  '  </nav>\n' +
  '  <header data-slot="header" data-contract="none">…</header>\n' +
  '  <main data-slot="content"></main>\n' +
  '</div></body></html>\n'

const SHELL_APP_CSS = '.shell { display: flex; gap: 1rem; }\n' +
  '.shell nav a { color: var(--text-body); font-size: 14px; line-height: 1.4; }\n'

function writeShellDir(dir, { name = 'app', canon = CANON_APP_HTML, css = SHELL_APP_CSS } = {}) {
  fs.mkdirSync(path.join(dir, 'design/shell'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/shell', name + '.html'), canon)
  fs.writeFileSync(path.join(dir, 'design/shell', name + '.css'), css)
}

// D3's splice: canon inner with the content slot's inner replaced, then aria-current="page"
// appended to the one data-nav anchor matching `active` (stripped everywhere else — there is
// nowhere else here, since the canon never carries one).
function expectedInner({ contentInner = '', active = 'inbox' } = {}) {
  let inner = '\n  <nav data-slot="nav" data-contract="none" aria-label="Main">\n' +
    '    <a data-nav="inbox" href="#">Inbox</a>\n' +
    '    <a data-nav="settings" href="#">Settings</a>\n' +
    '  </nav>\n' +
    '  <header data-slot="header" data-contract="none">…</header>\n' +
    '  <main data-slot="content"></main>\n'
  inner = inner.replace('<main data-slot="content"></main>', '<main data-slot="content">' + contentInner + '</main>')
  if (active === 'inbox') inner = inner.replace('<a data-nav="inbox" href="#">', '<a data-nav="inbox" href="#" aria-current="page">')
  if (active === 'settings') inner = inner.replace('<a data-nav="settings" href="#">', '<a data-nav="settings" href="#" aria-current="page">')
  return inner
}

function syncedRegion(opts) {
  return '<div data-shell-region="app" class="shell">' + expectedInner(opts) + '</div>'
}

// A fully declared, synced (by construction) page mock per D2's Contracts example.
function mockDeclaring({ label = 'inbox', status = 'ratified', active = 'inbox',
  contentInner = '<h1>Inbox</h1>' } = {}) {
  return '<link rel="stylesheet" href="../tokens.css">\n' +
    '<link rel="stylesheet" href="../shell/app.css">\n' +
    '<style>* { box-sizing: border-box; }</style>\n' +
    '<div data-screen-label="' + label + '" data-status="' + status + '" data-shell="app" data-active="' + active + '">' +
    syncedRegion({ contentInner, active }) +
    '</div>\n'
}

test('check: shell — undeclared (AC-20260901-04-1)', () => {
  const dir = tmpdir('atlas-shell')
  writeShellDir(dir)
  const mocks = path.join(dir, 'design/mocks')
  fs.mkdirSync(mocks, { recursive: true })
  const mockPath = path.join(mocks, 'inbox.html')

  fs.writeFileSync(mockPath,
    '<link rel="stylesheet" href="../tokens.css">\n' +
    '<main data-screen-label="inbox" data-status="sketch">no shell declared</main>\n')
  const sketch = atlas(['check', mocks])
  assert.strictEqual(sketch.status, 0,
    'a sketch-tier mock missing data-shell must still pass check (the finding is advisory only until ratified) — ' +
    sketch.stdout + sketch.stderr)
  assert.match(sketch.stdout,
    /  ⚠️ .*: no data-shell on the \[data-screen-label\] root — declare data-shell="<name>" or data-shell="none"/,
    'the undeclared-shell finding must print as a warn line before CHECK PASS at sketch tier, or an author gets no signal before ratifying')
  assert.match(sketch.stdout, /CHECK PASS/, 'a sketch-tier shell finding must never fail the check')

  fs.writeFileSync(mockPath,
    '<link rel="stylesheet" href="../tokens.css">\n' +
    '<main data-screen-label="inbox" data-status="ratified">no shell declared</main>\n')
  const ratified = atlas(['check', mocks])
  assert.strictEqual(ratified.status, 1,
    'the same finding must fail check once the mock is ratified — sketch-tier warns exist to graduate into a real gate, not to stay advisory forever — ' +
    ratified.stdout + ratified.stderr)
  assert.match(ratified.stdout,
    /no data-shell on the \[data-screen-label\] root — declare data-shell="<name>" or data-shell="none"/,
    'the exact D4(a) violation text must be printed under CHECK FAIL')
})

test('check: shell — unknown name (AC-20260901-04-2)', () => {
  const dir = tmpdir('atlas-shell')
  writeShellDir(dir)
  const mocks = path.join(dir, 'design/mocks')
  fs.mkdirSync(mocks, { recursive: true })
  fs.writeFileSync(path.join(mocks, 'admin.html'),
    '<link rel="stylesheet" href="../tokens.css">\n<style>* { box-sizing: border-box; }</style>\n' +
    '<main data-screen-label="admin" data-status="ratified" data-shell="admin">x</main>\n')

  const res = atlas(['check', mocks])
  assert.strictEqual(res.status, 1,
    'a mock declaring a shell with no matching canon file must fail check — an unknown shell name is silently unenforceable otherwise — ' +
    res.stdout + res.stderr)
  assert.match(res.stdout,
    /declares data-shell="admin" but design\/shell\/admin\.html does not exist — author the shell canon or declare data-shell="none"/,
    'the exact D4(b) violation text must name the missing canon file')
})

test('check: shell — drift names the slot (AC-20260901-04-3)', () => {
  const dir = tmpdir('atlas-shell')
  writeShellDir(dir)
  const mocks = path.join(dir, 'design/mocks')
  fs.mkdirSync(mocks, { recursive: true })
  const mockPath = path.join(mocks, 'inbox.html')

  fs.writeFileSync(mockPath, mockDeclaring({}))
  const clean = atlas(['check', mocks])
  assert.strictEqual(clean.status, 0,
    'a mock whose region is byte-identical to the derived expected region must pass with zero shell findings — ' +
    clean.stdout + clean.stderr)
  assert.doesNotMatch(clean.stdout, /shell region differs from canon/,
    'a synced mock must never report drift — false drift would make every ratify a coin flip')

  fs.writeFileSync(mockPath, mockDeclaring({}).replace('Settings</a>', 'Preferences</a>'))
  const navDrift = atlas(['check', mocks])
  assert.strictEqual(navDrift.status, 1,
    'an edited nav label must fail check as drift — a hand-edited sidebar in a ratified mock is exactly what this gate exists to catch — ' +
    navDrift.stdout + navDrift.stderr)
  assert.match(navDrift.stdout, /shell region differs from canon \(nav slot\) — run design-atlas\.js shell sync/,
    'the drift finding must name the nav slot as the first differing slot, and the sync remedy command')

  fs.writeFileSync(mockPath, mockDeclaring({}).replace('…</header>', '…<button>x</button></header>'))
  const headerDrift = atlas(['check', mocks])
  assert.strictEqual(headerDrift.status, 1,
    'markup appended inside the header slot must fail check as drift — ' + headerDrift.stdout + headerDrift.stderr)
  assert.match(headerDrift.stdout, /shell region differs from canon \(header slot\) — run design-atlas\.js shell sync/,
    'the drift finding must name the header slot, not a generic "differs" message, or an author cannot tell which slot to inspect')
})

test('check: shell — own chrome (AC-20260901-04-4)', () => {
  const dir = tmpdir('atlas-shell')
  writeShellDir(dir)
  const mocks = path.join(dir, 'design/mocks')
  fs.mkdirSync(mocks, { recursive: true })
  const mockPath = path.join(mocks, 'inbox.html')

  fs.writeFileSync(mockPath, mockDeclaring({ contentInner: '<nav>own nav</nav>' }))
  const bad = atlas(['check', mocks])
  assert.strictEqual(bad.status, 1,
    'a <nav> authored inside the content slot must fail check — the shell already owns that chrome — ' +
    bad.stdout + bad.stderr)
  assert.match(bad.stdout,
    /own nav\/header markup inside the content slot — the shell owns chrome; in-content sub-navigation uses role="tablist" or a plain container/,
    'the exact D4(d) violation text must be printed')

  fs.writeFileSync(mockPath,
    '<link rel="stylesheet" href="../tokens.css">\n<style>* { box-sizing: border-box; }</style>\n' +
    '<main data-screen-label="inbox" data-status="ratified" data-shell="none"><nav>own nav</nav></main>\n')
  const ok = atlas(['check', mocks])
  assert.strictEqual(ok.status, 0,
    'the identical <nav> markup in a data-shell="none" mock must produce no shell finding at all — the shell family never binds on an opted-out mock — ' +
    ok.stdout + ok.stderr)
})

test('check: shell — css link (AC-20260901-04-5)', () => {
  const dir = tmpdir('atlas-shell')
  writeShellDir(dir)
  const mocks = path.join(dir, 'design/mocks')
  fs.mkdirSync(mocks, { recursive: true })
  const mockPath = path.join(mocks, 'inbox.html')

  fs.writeFileSync(mockPath, mockDeclaring({}).replace('<link rel="stylesheet" href="../shell/app.css">\n', ''))
  const bad = atlas(['check', mocks])
  assert.strictEqual(bad.status, 1,
    'a declaring mock that never links its shell stylesheet must fail check — ' + bad.stdout + bad.stderr)
  assert.match(bad.stdout, /declares data-shell="app" but does not link design\/shell\/app\.css/,
    'the exact D4(e) violation text must name the missing link')

  fs.writeFileSync(mockPath, mockDeclaring({ status: 'sketch' }).replace('<link rel="stylesheet" href="../shell/app.css">\n', ''))
  const sketch = atlas(['check', mocks])
  assert.strictEqual(sketch.status, 0,
    'the missing-css-link finding must be tiered exactly like undeclared/unknown-shell — a warn at sketch, never a failure — ' +
    sketch.stdout + sketch.stderr)
  assert.match(sketch.stdout, /⚠️ .*does not link design\/shell\/app\.css/,
    'the missing-css-link finding must print as a warn line at sketch tier')
})

test('check: shell canon rules (AC-20260901-04-7)', () => {
  const dir = tmpdir('atlas-shell')
  writeShellDir(dir)
  const shellDir = path.join(dir, 'design/shell')
  const canonPath = path.join(shellDir, 'app.html')

  const good = atlas(['check', shellDir])
  assert.strictEqual(good.status, 0,
    'a canon meeting every D1 rule must pass check — ' + good.stdout + good.stderr)
  assert.doesNotMatch(good.stdout, /no data-screen-label/,
    'check must never demand a data-screen-label on a shell canon file — the canon is chrome, not a labeled surface')

  fs.writeFileSync(canonPath, CANON_APP_HTML.replace('data-shell-canon="app"', 'data-shell-canon="shell"'))
  const nameBad = atlas(['check', shellDir])
  assert.strictEqual(nameBad.status, 1,
    'a data-shell-canon value that does not match the file basename must fail check — ' + nameBad.stdout + nameBad.stderr)
  assert.match(nameBad.stdout, /data-shell-canon="shell" does not match the file name app — rename one/,
    'the exact D1 name-mismatch violation text must be printed')

  fs.writeFileSync(canonPath, CANON_APP_HTML.replace('<main data-slot="content"></main>', '<main data-slot="content"><p>x</p></main>'))
  const contentBad = atlas(['check', shellDir])
  assert.strictEqual(contentBad.status, 1,
    'a non-empty content slot in the canon must fail check — the shell carries no feature content — ' + contentBad.stdout + contentBad.stderr)
  assert.match(contentBad.stdout, /content slot must be empty — the shell carries no feature content/,
    'the exact D1 empty-content-slot violation text must be printed')

  fs.writeFileSync(canonPath, CANON_APP_HTML.replace('<nav data-slot="nav" data-contract="none" aria-label="Main">', '<nav data-slot="nav" aria-label="Main">'))
  const slotBad = atlas(['check', shellDir])
  assert.strictEqual(slotBad.status, 1,
    'a non-content slot missing data-contract="none" must fail check — ' + slotBad.stdout + slotBad.stderr)
  assert.match(slotBad.stdout, /slot "nav" must carry data-contract="none" — shell chrome never enters the render gate's comparison/,
    'the exact D1 slot-contract violation text must name the offending slot')
  fs.writeFileSync(canonPath, CANON_APP_HTML)

  fs.writeFileSync(path.join(shellDir, 'app.css'), SHELL_APP_CSS + '.x { color: #333; }\n')
  const cssBad = atlas(['check', shellDir])
  assert.strictEqual(cssBad.status, 1,
    'an off-token color literal in the shell stylesheet must fail check exactly like it would in a mock — ' + cssBad.stdout + cssBad.stderr)
  assert.match(cssBad.stdout, /off-token color literal/,
    'the canon rule set must reuse the existing off-token-color violation text over the css file')
  fs.writeFileSync(path.join(shellDir, 'app.css'), SHELL_APP_CSS)

  fs.writeFileSync(path.join(shellDir, 'app.css'), SHELL_APP_CSS + '.y { font-size: 12px; }\n')
  const hygieneBad = atlas(['check', shellDir])
  assert.strictEqual(hygieneBad.status, 1,
    'a font-size rule with no line-height in the shell stylesheet must fail check over that css file — ' + hygieneBad.stdout + hygieneBad.stderr)
  assert.match(hygieneBad.stdout, /declare font-size without line-height/,
    'the canon rule set must reuse the existing hygiene(b) violation text over the css file')
})

test('check/sync: active nav derived (AC-20260901-04-8)', () => {
  const dir = tmpdir('atlas-shell')
  writeShellDir(dir)
  const mocks = path.join(dir, 'design/mocks')
  fs.mkdirSync(mocks, { recursive: true })
  const mockPath = path.join(mocks, 'inbox.html')

  fs.writeFileSync(mockPath, mockDeclaring({ active: 'settings' }))
  const settingsActive = atlas(['check', mocks])
  assert.strictEqual(settingsActive.status, 0,
    'the expected region for data-active="settings" must mark only the settings nav item, and a mock matching it must pass unchanged — ' +
    settingsActive.stdout + settingsActive.stderr)

  fs.writeFileSync(mockPath, mockDeclaring({}).replace(' data-active="inbox"', ''))
  const defaultLabel = atlas(['check', mocks])
  assert.strictEqual(defaultLabel.status, 0,
    'absent data-active must default the active key to the screen label ("inbox"), which matches the inbox nav item here, so this must still pass unchanged — ' +
    defaultLabel.stdout + defaultLabel.stderr)

  fs.writeFileSync(mockPath, mockDeclaring({}).replace('data-active="inbox"', 'data-active="nowhere"'))
  const noMatch = atlas(['check', mocks])
  assert.strictEqual(noMatch.status, 1,
    'data-active="nowhere" matches no data-nav key, so the expected region carries no aria-current anywhere — this mock still carries one on inbox, so it must now report drift — ' +
    noMatch.stdout + noMatch.stderr)
  assert.match(noMatch.stdout, /shell region differs from canon \(nav slot\)/,
    'the drift must be named to the nav slot, since that is where the stale aria-current sits')
})
