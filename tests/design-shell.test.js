'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('./helpers')

const atlas = (argv, opts) => runNode('scripts/design-atlas.js', argv, opts)

// specs/20260901/04-shell-composed-mocks.md. D5 gives `design-atlas.js shell sync`
// (rewrite every declaring mock's region from canon, skip built mocks unless named, refuse a
// slot-less mock without stopping the run) and D6 gives `shell adopt` (plan table, then --apply
// migrates pre-shell mocks into the canon). TDD red: design-atlas.js
// has no `shell` subcommand at all today — `cmd === 'shell'` falls through to the usage die(),
// so every test below is red until CREATE spec/scripts/lib/shell-region.js and the `shell
// sync`/`shell adopt` subcommands land. AC-20260901-04-16 is the one exception
// ([pre-green: absence-invariant]): `build` already never reads design/shell/, so it must pass
// unchanged before and after this spec lands.
//
// CANON_APP_HTML/SHELL_APP_CSS are the literal D1 Contracts example; expectedInner()/
// syncedRegion() rebuild D3's splice by exact substring surgery on that same literal, so every
// "synced" fixture here is byte-consistent with the canon by construction.

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

function mockDeclaring({ label = 'inbox', status = 'ratified', active = 'inbox',
  contentInner = '<h1>Inbox</h1>' } = {}) {
  return '<link rel="stylesheet" href="../tokens.css">\n' +
    '<link rel="stylesheet" href="../shell/app.css">\n' +
    '<style>* { box-sizing: border-box; }</style>\n' +
    '<div data-screen-label="' + label + '" data-status="' + status + '" data-shell="app" data-active="' + active + '">' +
    syncedRegion({ contentInner, active }) +
    '</div>\n'
}

test('sync: rewrites the region, keeps content, idempotent (AC-20260901-04-9)', () => {
  const dir = tmpdir('shell')
  writeShellDir(dir)
  const mocks = path.join(dir, 'design/mocks')
  fs.mkdirSync(mocks, { recursive: true })

  const drifted = mockDeclaring({ label: 'drifted', contentInner: '<h1>Drifted</h1>' })
    .replace('Settings</a>', 'Preferences</a>')
    .replace('<link rel="stylesheet" href="../shell/app.css">\n', '')
  fs.writeFileSync(path.join(mocks, 'drifted.html'), drifted)

  fs.writeFileSync(path.join(mocks, 'insync.html'),
    mockDeclaring({ label: 'insync', contentInner: '<h1>In sync</h1>' }))

  fs.writeFileSync(path.join(mocks, 'none.html'),
    '<link rel="stylesheet" href="../tokens.css">\n<style>* { box-sizing: border-box; }</style>\n' +
    '<main data-screen-label="opaque" data-status="ratified" data-shell="none">own chrome ok here</main>\n')

  fs.writeFileSync(path.join(mocks, 'undeclared.html'),
    '<link rel="stylesheet" href="../tokens.css">\n<style>* { box-sizing: border-box; }</style>\n' +
    '<main data-screen-label="plain" data-status="sketch">no shell yet</main>\n')

  const res = atlas(['shell', 'sync', '--root', dir])
  assert.strictEqual(res.status, 0, 'a sync run over a mixed mocks dir must exit 0 — ' + res.stdout + res.stderr)
  assert.match(res.stdout, /synced .*drifted\.html/, 'the drifted declaring mock must be reported as synced')
  assert.match(res.stdout, /unchanged .*insync\.html/, 'the already-synced declaring mock must be reported unchanged, never rewritten')
  assert.match(res.stdout, /skipped \(no shell\) .*none\.html/, 'a data-shell="none" mock must be skipped as having no shell, never touched')
  assert.match(res.stdout, /skipped \(undeclared\) .*undeclared\.html/, 'a mock with no data-shell must be skipped as undeclared, never guessed at')

  const rewritten = fs.readFileSync(path.join(mocks, 'drifted.html'), 'utf8')
  assert.match(rewritten, /<h1>Drifted<\/h1>/,
    'sync must preserve the mock\'s own content-slot inner byte-for-byte — rewriting chrome must never touch authored content')
  assert.match(rewritten, /<link rel="stylesheet" href="\.\.\/shell\/app\.css">/,
    'sync must insert the missing shell stylesheet link when absent')
  assert.doesNotMatch(rewritten, /Preferences/,
    'the stale nav label must be gone once the region is rewritten from canon')

  const second = atlas(['shell', 'sync', '--root', dir])
  assert.strictEqual(second.status, 0, second.stdout + second.stderr)
  assert.match(second.stdout, /unchanged .*drifted\.html/,
    'a second sync run over the now-clean mock must report unchanged, proving sync is idempotent')
  assert.match(second.stdout, /unchanged .*insync\.html/,
    'the already-in-sync mock must still report unchanged on the second run')
})

test('sync: built mocks skipped unless named (AC-20260901-04-10)', () => {
  const dir = tmpdir('shell')
  writeShellDir(dir)
  const mocks = path.join(dir, 'design/mocks')
  fs.mkdirSync(mocks, { recursive: true })
  const drifted = mockDeclaring({ label: 'built', contentInner: '<h1>Built</h1>' }).replace('Settings</a>', 'Preferences</a>')
  fs.writeFileSync(path.join(mocks, 'built.html'), drifted)

  fs.mkdirSync(path.join(dir, 'specs/20260716'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260716/01-x.md'), '---\nstatus: done\n---\n# x\n')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/design-coverage.json'), JSON.stringify({
    sources: { 'design/mocks': { regions: { 'built#root': { spec: 'specs/20260716/01-x.md', at: '2026-07-16' } } } },
  }))

  const res = atlas(['shell', 'sync', '--root', dir])
  assert.strictEqual(res.status, 0, res.stdout + res.stderr)
  assert.match(res.stdout, /skipped \(built\) .*built\.html/,
    'a mock claimed in the coverage ledger by a spec at status: done must be skipped on the default walk — mock authority inverts at built')
  const untouchedBytes = fs.readFileSync(path.join(mocks, 'built.html'), 'utf8')
  assert.strictEqual(untouchedBytes, drifted,
    'a built mock left drifted by the default walk must be byte-unchanged — only an explicit touch may re-sync it')

  const explicit = atlas(['shell', 'sync', '--root', dir, path.join(mocks, 'built.html')])
  assert.strictEqual(explicit.status, 0, explicit.stdout + explicit.stderr)
  assert.match(explicit.stdout, /synced .*built\.html/,
    'naming a built mock\'s path explicitly must still sync it — the explicit path IS the design touch that re-earns the sync')
})

test('sync: refuses a slot-less mock, syncs the rest (AC-20260901-04-11)', () => {
  const dir = tmpdir('shell')
  writeShellDir(dir)
  const mocks = path.join(dir, 'design/mocks')
  fs.mkdirSync(mocks, { recursive: true })

  fs.writeFileSync(path.join(mocks, 'slotless.html'),
    '<link rel="stylesheet" href="../tokens.css">\n<link rel="stylesheet" href="../shell/app.css">\n' +
    '<style>* { box-sizing: border-box; }</style>\n' +
    '<div data-screen-label="slotless" data-status="ratified" data-shell="app" data-active="inbox">\n' +
    '  <p>no shell region wrapper at all</p>\n</div>\n')

  const drifted = mockDeclaring({ label: 'other', contentInner: '<h1>Other</h1>' }).replace('Settings</a>', 'Preferences</a>')
  fs.writeFileSync(path.join(mocks, 'other.html'), drifted)

  const res = atlas(['shell', 'sync', '--root', dir])
  assert.strictEqual(res.status, 1,
    'a run that hits a slot-less declaring mock must exit 1 to surface the refusal, never swallow it — ' + res.stdout + res.stderr)
  assert.match(res.stdout, /cannot sync .*slotless\.html: no data-slot="content" inside the root — run design-atlas\.js shell adopt/,
    'the refusal must name the offending file and point at shell adopt as the remedy')
  assert.match(res.stdout, /synced .*other\.html/,
    'a refusal on one mock must never stop the run from still syncing every other mock in the same pass')
})

test('adopt: plan table, writes nothing (AC-20260901-04-12)', () => {
  const dir = tmpdir('shell')
  writeShellDir(dir)
  const mocks = path.join(dir, 'design/mocks')
  fs.mkdirSync(mocks, { recursive: true })

  const chromeful = '<link rel="stylesheet" href="../tokens.css">\n<style>* { box-sizing: border-box; }</style>\n' +
    '<main data-screen-label="lobby" data-status="ratified">\n' +
    '  <nav>own nav</nav><header>own header</header><section>content here</section>\n' +
    '</main>\n'
  fs.writeFileSync(path.join(mocks, 'lobby.html'), chromeful)

  const bare = '<link rel="stylesheet" href="../tokens.css">\n<style>* { box-sizing: border-box; }</style>\n' +
    '<main data-screen-label="signin" data-status="ratified">plain content, no chrome</main>\n'
  fs.writeFileSync(path.join(mocks, 'signin.html'), bare)

  const res = atlas(['shell', 'adopt', '--root', dir])
  assert.strictEqual(res.status, 0,
    'a plan-only adopt run must exit 0 — it prints a table, it never fails — ' + res.stdout + res.stderr)
  assert.match(res.stdout, /SHELL ADOPT \(plan\)/,
    'the plan header must announce this is a dry run, or a session could mistake it for the applied output')
  assert.match(res.stdout, /lobby\.html.*chrome: nav, header.*proposal: app.*active: lobby.*drift: yes/,
    'the chrome-bearing mock must get one row naming its detected chrome, the sole canon as the proposal, its screen label as the active guess, and drift: yes')
  assert.match(res.stdout, /signin\.html.*chrome: none.*proposal: undeclared — decide/,
    'the zero-chrome mock must get a row proposing "undeclared — decide" rather than guessing a shell for it')

  assert.strictEqual(fs.readFileSync(path.join(mocks, 'lobby.html'), 'utf8'), chromeful,
    'without --apply, the chrome-bearing mock must be left byte-identical — the plan table must never write')
  assert.strictEqual(fs.readFileSync(path.join(mocks, 'signin.html'), 'utf8'), bare,
    'without --apply, the zero-chrome mock must be left byte-identical too')
})

test('adopt: --apply wraps content into the region (AC-20260901-04-13)', () => {
  const dir = tmpdir('shell')
  writeShellDir(dir)
  const mocks = path.join(dir, 'design/mocks')
  fs.mkdirSync(mocks, { recursive: true })

  const chromeful = '<link rel="stylesheet" href="../tokens.css">\n<style>* { box-sizing: border-box; }</style>\n' +
    '<main data-screen-label="lobby" data-status="ratified">\n' +
    '  <nav>own nav</nav><header>own header</header><section>content here</section>\n' +
    '</main>\n'
  fs.writeFileSync(path.join(mocks, 'lobby.html'), chromeful)
  const bare = '<link rel="stylesheet" href="../tokens.css">\n<style>* { box-sizing: border-box; }</style>\n' +
    '<main data-screen-label="signin" data-status="ratified">plain content, no chrome</main>\n'
  fs.writeFileSync(path.join(mocks, 'signin.html'), bare)

  const res = atlas(['shell', 'adopt', '--root', dir, '--apply'])
  assert.strictEqual(res.status, 0,
    'an --apply run with exactly one canon must succeed without needing --shell — ' + res.stdout + res.stderr)
  assert.match(res.stdout, /SHELL ADOPT \(applied\)/,
    'the applied header must distinguish a written run from the plan-only one')

  const rewritten = fs.readFileSync(path.join(mocks, 'lobby.html'), 'utf8')
  assert.match(rewritten, /data-shell="app"/,
    'the chrome-bearing mock\'s root must be stamped data-shell="app" once adopted')
  assert.match(rewritten, /<section>content here<\/section>/,
    'the original content, minus its own chrome, must land inside the content slot byte-for-byte')
  assert.doesNotMatch(rewritten, /<nav>own nav<\/nav>/,
    'the mock\'s own nav chrome must be stripped — the shell owns chrome after adoption')
  assert.match(rewritten, /<link rel="stylesheet" href="\.\.\/shell\/app\.css">/,
    'the shell stylesheet link must be inserted for a newly adopted mock')

  const checkAfter = atlas(['check', path.join(mocks, 'lobby.html')])
  assert.strictEqual(checkAfter.status, 0,
    'once adopted, the mock must report zero shell findings under check — ' + checkAfter.stdout + checkAfter.stderr)

  assert.strictEqual(fs.readFileSync(path.join(mocks, 'signin.html'), 'utf8'), bare,
    'a zero-chrome mock must never be touched by --apply — it stays undeclared with its warn line')

  const twoCanons = tmpdir('shell')
  writeShellDir(twoCanons)
  writeShellDir(twoCanons, {
    name: 'admin',
    canon: CANON_APP_HTML.replace(/data-shell-canon="app"/, 'data-shell-canon="admin"').replace('app.css', 'admin.css'),
    css: SHELL_APP_CSS,
  })
  fs.mkdirSync(path.join(twoCanons, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(twoCanons, 'design/mocks/lobby.html'), chromeful)
  const ambiguous = atlas(['shell', 'adopt', '--root', twoCanons, '--apply'])
  assert.strictEqual(ambiguous.status, 2,
    'with two canon files and no --shell, --apply must refuse rather than guess which shell to adopt into — ' +
    ambiguous.stdout + ambiguous.stderr)
  assert.match(ambiguous.stdout + ambiguous.stderr, /\bapp\b/,
    'the refusal must name both canon names, including "app"')
  assert.match(ambiguous.stdout + ambiguous.stderr, /\badmin\b/,
    'the refusal must name both canon names, including "admin"')
})

test('build: the shell canon is never a surface (AC-20260901-04-16) [pre-green: absence-invariant]', () => {
  const dir = tmpdir('shell')
  writeShellDir(dir)
  const mocks = path.join(dir, 'design/mocks')
  fs.mkdirSync(mocks, { recursive: true })
  fs.writeFileSync(path.join(mocks, 'lobby.html'),
    '<link rel="stylesheet" href="../tokens.css">\n<style>* { box-sizing: border-box; }</style>\n' +
    '<main data-screen-label="lobby" data-status="approved">Lobby</main>\n')
  fs.writeFileSync(path.join(mocks, 'thread.html'),
    '<link rel="stylesheet" href="../tokens.css">\n<main data-screen-label="thread">Thread</main>\n')

  fs.mkdirSync(path.join(dir, 'docs/roadmap'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'docs/roadmap/01-chrome.md'),
    '# 01\n```surfaces\nsignin\nsignin -> lobby\nlobby -> thread\nlobby -> account\nthread -> settings\n```\n')

  fs.mkdirSync(path.join(dir, 'specs/20260716'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260716/01-x.md'), '---\nstatus: done\n---\n# x\n')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/design-coverage.json'), JSON.stringify({
    sources: { 'design/mocks': { regions: { 'lobby#root': { spec: 'specs/20260716/01-x.md', at: '2026-07-16' } } } },
  }))

  const res = atlas(['build'], { cwd: dir })
  assert.strictEqual(res.status, 0, res.stdout + res.stderr)
  assert.match(res.stdout, /atlas: 5 surface\(s\)/,
    'a design/shell/app.html present on disk must never be counted among the roadmap × mock surfaces — the count (5: signin, lobby, thread, account, settings) must stay exactly what the roadmap and mocks alone declare')

  const out = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')
  assert.doesNotMatch(out, /id="s-app"/,
    'the atlas page must never render a surface card or gap chip for the shell canon\'s own name')
  assert.doesNotMatch(out, /shell canon|data-shell-canon/i,
    'the atlas page must carry no card or section referencing the shell canon at all — it is chrome, not a surface')
})
