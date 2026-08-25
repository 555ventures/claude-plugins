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

test('check: labeled token-consuming mocks pass; label/tokens/color violations fail closed', () => {
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
