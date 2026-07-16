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
    '<link rel="stylesheet" href="../tokens.css">\n<main data-screen-label="lobby" data-status="approved" style="color:var(--text-body)">Lobby</main>\n')
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
