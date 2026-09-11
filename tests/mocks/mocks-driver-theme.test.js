'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { runNode, tmpdir, SPEC } = require('../helpers')
const {
  SCRIPT,
  ledgerCmd, statusPath,
  writeKitCanon, writeThemeKit,
  decideLook,
} = require('./mocks-driver-fixtures')

// specs/20260907/06-theme-pick-moves-to-sketch.md — the mocks driver's new `theme`
// (state|compose|open|adopt) subcommand family, which lives entirely outside the mocks state
// machine. TDD red: mocks-driver.js has no `theme` routing at all today — `theme state`/`theme
// compose`/`theme open`/`theme adopt` all fall through to the bare-step branch (rest[0] is
// neither `ledger`/`notes`/`stop`/etc, and none of `--reopen`/`--mark`/`--state` match a bare
// positional `theme`), so every assertion below on stdout/exit-code shape is false against the
// pre-image. Per-file 45s budget guard (specs/20260903/07): this family gets its own file.

const KIT_PRIMITIVES = [
  { key: 'sheet', purpose: 'a modal panel for one focused task' },
  { key: 'row', purpose: 'a single list row' },
]

function themeDirectionsRow(dir, kebab, id) {
  const r = ledgerCmd(dir, 'add', [
    '--id', id, '--step', 'SKETCH', '--kind', 'product',
    '--claim', 'theme-directions: ' + kebab, '--tag', 'said-by-user', '--status', 'confirmed',
  ])
  assert.strictEqual(r.status, 0, 'test setup requires the theme-directions ledger row for "' + kebab + '" to be accepted: ' + r.stderr)
  return r
}

// A minimal, compose-valid pair of candidate directions sharing KIT_PRIMITIVES with design/kit/,
// each with a confirmed theme-directions row — the shared setup AC-20260907-06-2's accept leg,
// AC-20260907-06-4 and AC-20260907-06-5/-6 all build on top of.
function writeComposedPair(dir, primitives = KIT_PRIMITIVES) {
  writeKitCanon(dir, primitives)
  writeThemeKit(dir, 'quiet', primitives)
  themeDirectionsRow(dir, 'quiet', 'P90')
  writeThemeKit(dir, 'warm', primitives)
  themeDirectionsRow(dir, 'warm', 'P91')
}

test('AC-20260907-06-1: theme state prints exactly "absent" or "picked" on stdout, refuses (exit 2) naming the wireframe gray register and `theme open` when design/tokens.css is byte-identical to the wire template, and writes nothing — not design/mocks/status.json — in any of the three cases', () => {
  const dir = tmpdir('mocks-driver-theme')

  const absent = runNode(SCRIPT, ['--root', dir, 'theme', 'state'])
  assert.strictEqual(absent.status, 0, 'theme state must exit 0 when design/tokens.css does not exist: ' + absent.stdout + absent.stderr)
  assert.strictEqual(absent.stdout, 'absent\n', 'theme state must print exactly "absent" and nothing else when design/tokens.css does not exist: ' + JSON.stringify(absent.stdout))
  assert.ok(!fs.existsSync(statusPath(dir)), 'theme state must write nothing, not even design/mocks/status.json, on the absent leg: status.json exists at ' + statusPath(dir))

  fs.mkdirSync(path.join(dir, 'design'), { recursive: true })
  fs.copyFileSync(path.join(SPEC, 'templates/mocks/wire-tokens.css'), path.join(dir, 'design/tokens.css'))
  const gray = runNode(SCRIPT, ['--root', dir, 'theme', 'state'])
  assert.strictEqual(gray.status, 2, 'theme state must exit 2 when design/tokens.css is byte-identical to the wire template: ' + gray.stdout + gray.stderr)
  assert.match(gray.stderr, /the wireframe gray register byte-for-byte/, 'the refusal must name that the register is the wireframe gray register byte-for-byte: ' + JSON.stringify(gray.stderr))
  assert.match(gray.stderr, /theme open/, 'the refusal must name the `theme open` remedy: ' + JSON.stringify(gray.stderr))
  assert.ok(!fs.existsSync(statusPath(dir)), 'theme state must write nothing on the gray-register refusal leg either: status.json exists at ' + statusPath(dir))

  const wireText = fs.readFileSync(path.join(SPEC, 'templates/mocks/wire-tokens.css'), 'utf8')
  fs.writeFileSync(path.join(dir, 'design/tokens.css'), wireText + '/* one extra byte */\n')
  const picked = runNode(SCRIPT, ['--root', dir, 'theme', 'state'])
  assert.strictEqual(picked.status, 0, 'theme state must exit 0 once design/tokens.css differs from the wire template by even one byte: ' + picked.stdout + picked.stderr)
  assert.strictEqual(picked.stdout, 'picked\n', 'theme state must print exactly "picked" once the register differs from the wire template: ' + JSON.stringify(picked.stdout))
  assert.ok(!fs.existsSync(statusPath(dir)), 'theme state must write nothing on the picked leg either — design/mocks/status.json must stay absent across all three theme state outcomes: status.json exists at ' + statusPath(dir))
})

test('AC-20260907-06-2: theme compose --direction <k> accepts a candidate re-rendering every design/kit/ primitive with a confirmed theme-directions row, printing the exact primitive count, and refuses (exit 2) naming the omitted primitive, the wire/ link, or the missing ledger row', () => {
  const acceptDir = tmpdir('mocks-driver-theme')
  writeKitCanon(acceptDir, KIT_PRIMITIVES)
  writeThemeKit(acceptDir, 'quiet', KIT_PRIMITIVES)
  themeDirectionsRow(acceptDir, 'quiet', 'P90')
  const accept = runNode(SCRIPT, ['--root', acceptDir, 'theme', 'compose', '--direction', 'quiet'])
  assert.strictEqual(accept.status, 0, 'theme compose must accept a candidate re-rendering every kit primitive with a confirmed direction row: ' + accept.stdout + accept.stderr)
  assert.strictEqual(accept.stdout, '✅ direction "quiet" composes — 2 primitive(s) re-rendered\n', 'theme compose must print the exact accept line naming the direction and primitive count: ' + JSON.stringify(accept.stdout))

  const omitDir = tmpdir('mocks-driver-theme')
  writeKitCanon(omitDir, KIT_PRIMITIVES)
  writeThemeKit(omitDir, 'quiet', [KIT_PRIMITIVES[0]]) // "row" omitted
  themeDirectionsRow(omitDir, 'quiet', 'P90')
  const omit = runNode(SCRIPT, ['--root', omitDir, 'theme', 'compose', '--direction', 'quiet'])
  assert.strictEqual(omit.status, 2, 'theme compose must refuse a candidate omitting a kit primitive: ' + omit.stdout + omit.stderr)
  assert.match(omit.stderr, /omits primitive\(s\) row/, 'the refusal must name the omitted primitive key "row": ' + JSON.stringify(omit.stderr))

  const wireDir = tmpdir('mocks-driver-theme')
  writeKitCanon(wireDir, KIT_PRIMITIVES)
  writeThemeKit(wireDir, 'quiet', KIT_PRIMITIVES)
  themeDirectionsRow(wireDir, 'quiet', 'P90')
  const wireKitPath = path.join(wireDir, 'design/theme/quiet/kit.html')
  fs.writeFileSync(wireKitPath,
    fs.readFileSync(wireKitPath, 'utf8').replace(
      '<link rel="stylesheet" href="./tokens.css">',
      '<link rel="stylesheet" href="./tokens.css">\n<link rel="stylesheet" href="../../wire/tokens.css">'))
  const wire = runNode(SCRIPT, ['--root', wireDir, 'theme', 'compose', '--direction', 'quiet'])
  assert.strictEqual(wire.status, 2, 'theme compose must refuse a candidate that still links the wireframe register: ' + wire.stdout + wire.stderr)
  assert.match(wire.stderr, /links the wireframe register \(wire\/\)/, 'the refusal must name the wire/ link: ' + JSON.stringify(wire.stderr))

  const noLedgerDir = tmpdir('mocks-driver-theme')
  writeKitCanon(noLedgerDir, KIT_PRIMITIVES)
  writeThemeKit(noLedgerDir, 'quiet', KIT_PRIMITIVES)
  // no theme-directions ledger row recorded
  const noLedger = runNode(SCRIPT, ['--root', noLedgerDir, 'theme', 'compose', '--direction', 'quiet'])
  assert.strictEqual(noLedger.status, 2, 'theme compose must refuse a fully valid candidate with no confirmed theme-directions ledger row: ' + noLedger.stdout + noLedger.stderr)
  assert.match(noLedger.stderr, /record the direction interview pick first/, 'the refusal must name the missing direction-interview ledger row: ' + JSON.stringify(noLedger.stderr))
})

test('AC-20260907-06-3: theme compose --direction <k> on a root with no design/kit/ anywhere above it refuses (exit 2) naming only that design/kit/ does not exist and the /spec:mocks to KIT remedy', () => {
  const dir = tmpdir('mocks-driver-theme')
  const r = runNode(SCRIPT, ['--root', dir, 'theme', 'compose', '--direction', 'quiet'])
  assert.strictEqual(r.status, 2, 'theme compose must refuse when no design/kit/ resolves above the root: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /design\/kit\/ does not exist/, 'the refusal must name that design/kit/ does not exist: ' + JSON.stringify(r.stderr))
  assert.match(r.stderr, /\/spec:mocks to KIT/, 'the refusal must name the /spec:mocks to KIT remedy: ' + JSON.stringify(r.stderr))
  for (const other of ['tokens.css does not exist', 'kit.html does not exist', 'is not a kit canon page', 'omits primitive', 'record the direction interview pick first']) {
    assert.ok(!r.stderr.includes(other) && !r.stdout.includes(other),
      'with no design/kit/ at all, no OTHER D2 violation may be named — found "' + other + '" in: ' + r.stdout + r.stderr)
  }
})

// Retagged (specs/20260910/04-theme-before-the-client-walk.md D4, ADR-0013): the mocks THEME
// state is live and `theme open` — the atlas-kit pick — is retired in favor of `theme shortlist`
// (the client-facing pick over the seed's own dense screens). TDD red: this spec's own worktree
// still accepts `theme open` and runs its full body (proven live by every other test in this
// file), so this refusal assertion fails against it.
test('AC-20260910-04-4: theme open is retired — it exits 2 naming `theme shortlist` as the remedy, on both a composing pair and a single direction', () => {
  const dir = tmpdir('mocks-driver-theme')
  writeComposedPair(dir)
  const r = runNode(SCRIPT, ['--root', dir, 'theme', 'open'])
  assert.strictEqual(r.status, 2, 'theme open is retired — it must exit 2 even over two composing directions: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /theme shortlist/, 'the retirement refusal must name `theme shortlist` as the remedy: ' + JSON.stringify(r.stderr))

  const soloDir = tmpdir('mocks-driver-theme')
  writeKitCanon(soloDir, KIT_PRIMITIVES)
  writeThemeKit(soloDir, 'quiet', KIT_PRIMITIVES)
  themeDirectionsRow(soloDir, 'quiet', 'P90')
  const solo = runNode(SCRIPT, ['--root', soloDir, 'theme', 'open'])
  assert.strictEqual(solo.status, 2, 'theme open must also exit 2 with a single composed direction — it is retired outright, not merely refusing the old composed-direction floor: ' + solo.stdout + solo.stderr)
  assert.match(solo.stderr, /theme shortlist/, 'the retirement refusal must name `theme shortlist` here too: ' + JSON.stringify(solo.stderr))
})

// Retagged (specs/20260910/04-theme-before-the-client-walk.md D6, ADR-0013): `theme adopt` is
// retired outright — its byte-copy/ledger-append/supersede mechanics (AC-06-5, AC-06-6, AC-06-12
// and AC-06-13, all collapsed into this one refusal pin) live on verbatim as `--mark
// theme-picked`'s handler instead (specs/20260910/04's own tests/mocks/mocks-driver-theme-2
// .test.js AC-20260910-04-6/-9 pin it there, mark-shaped, including the D6/D10/D12 supersede/
// rejected-cell mechanics). TDD red: this spec's own worktree still accepts `theme adopt` and
// runs its full body (proven live by every earlier test in this file), so this refusal assertion
// fails against it.
test('AC-20260910-04-6: theme adopt is retired — it exits 2 naming `--mark theme-picked` as the remedy, over a decided pick, a disagreeing --direction, and with no stop at all', () => {
  const dir = tmpdir('mocks-driver-theme')
  writeComposedPair(dir)
  decideLook(dir, 'theme-picked', 'pick', {
    pick: 'quiet', others: ['warm'], by: 'jj',
    candidates: [{ group: 'quiet', label: 'kit', path: 'theme/quiet/kit.html' }, { group: 'warm', label: 'kit', path: 'theme/warm/kit.html' }],
  })
  const decided = runNode(SCRIPT, ['--root', dir, 'theme', 'adopt'])
  assert.strictEqual(decided.status, 2, 'theme adopt is retired — it must exit 2 even over a decided pick stop: ' + decided.stdout + decided.stderr)
  assert.match(decided.stderr, /--mark theme-picked/, 'the retirement refusal must name `--mark theme-picked` as the remedy: ' + JSON.stringify(decided.stderr))
  assert.ok(!fs.existsSync(path.join(dir, 'design/tokens.css')), 'theme adopt must never write design/tokens.css — it is retired outright, not merely refusing on some other leg: ' + fs.existsSync(path.join(dir, 'design/tokens.css')))

  const directed = runNode(SCRIPT, ['--root', dir, 'theme', 'adopt', '--direction', 'quiet'])
  assert.strictEqual(directed.status, 2, 'theme adopt --direction must also exit 2: ' + directed.stdout + directed.stderr)
  assert.match(directed.stderr, /--mark theme-picked/, 'the retirement refusal must name `--mark theme-picked` here too: ' + JSON.stringify(directed.stderr))

  const noStopDir = tmpdir('mocks-driver-theme')
  writeComposedPair(noStopDir)
  const noStop = runNode(SCRIPT, ['--root', noStopDir, 'theme', 'adopt'])
  assert.strictEqual(noStop.status, 2, 'theme adopt must exit 2 with no stop at all too: ' + noStop.stdout + noStop.stderr)
  assert.match(noStop.stderr, /--mark theme-picked/, 'the retirement refusal must name `--mark theme-picked` with no stop present either: ' + JSON.stringify(noStop.stderr))
})

// Review finding (specs/20260907/06-theme-pick-moves-to-sketch.md build, medium, three rounds): a
// bare /\bwire\// scan across the WHOLE page source matches a "wire/" occurrence sitting only in
// prose (an HTML comment, an attribute value), never an actual stylesheet link, and wrongly dies
// with the "links the wireframe register" message. A link-anchored regex fixes that round one,
// but one matching only a DOUBLE-quoted href still misses a single-quoted href, an unquoted
// href, and a CSS @import of the wire register (round two). Round three: `\b` treats `-`, `.`
// and `_` as word boundaries, so a `\bwire\/` check over-matches a real path segment merely
// NAMED like the wire register — "my-wire/", "v.wire/" — as if it linked the wire register
// itself, and carries no gate on the <link>'s own `rel`, so a non-stylesheet link (an icon
// pointing into a genuine wire/ path) is wrongly treated the same as a stylesheet link.
//
// Retagged AC-20260908-07-11 (specs/20260908/07-one-wire-register-predicate.md D5): the three
// symbols that fixed all this — WIRE_SEGMENT_RE, attrValue, linksWireRegister — moved out of
// mocks-driver.js entirely into the shared authority spec/scripts/lib/wire-register.js
// (stylesheetTargets/linksWireRegister). `composeViolations` now calls the shared
// `linksWireRegister(html)`, requiring "wire" to sit as a real path segment (preceded by "/" or
// the start of the value, never a `\b`-boundary substring), gating the <link> arm on the tag's
// own `rel` containing "stylesheet" before it ever looks at `href` (the @import arm needs no
// such gate — an @import is always a stylesheet import). This is a no-op for this call site
// (D5's own rationale): every assertion below is unchanged and must stay green throughout the
// move. Each REFUSING sub-case below reddens under a double-quote-only predicate (round two) by
// returning status 0 (a wrongly accepted compose) instead of 2 — each one's own
// `assert.strictEqual(r.status, 2, ...)` is the assertion that regression would trip; the prose
// leg is unchanged. Each COMPOSING sub-case reddens under the PREVIOUS `\b`-boundary, no-rel-gate
// predicate
// (`/<link\b[^>]*\bhref\s*=\s*(?:"[^"]*\bwire\/[^"]*"|'[^']*\bwire\/[^']*'|[^\s"'>]*\bwire\/[^\s"'>]*)/i`)
// by returning status 2 (a wrongly refused compose) instead of 0 — verified directly against
// that exact regex: it flags "../my-wire/x.css", "../v.wire/x.css" and the icon-rel case as
// wire links (`true`), while a control set of unrelated-but-similar segment names
// ("hardwire/", "firewire/", "wired/", "wireframe/", "rewire/", "my_wire/") is `false` under
// both the previous and the current predicate — those controls confirm the segment anchor,
// they do not themselves trip a regression.
function composeAgainstMutatedKit(mutate) {
  const dir = tmpdir('mocks-driver-theme')
  writeKitCanon(dir, KIT_PRIMITIVES)
  writeThemeKit(dir, 'quiet', KIT_PRIMITIVES)
  themeDirectionsRow(dir, 'quiet', 'P90')
  const kitPath = path.join(dir, 'design/theme/quiet/kit.html')
  fs.writeFileSync(kitPath, mutate(fs.readFileSync(kitPath, 'utf8')))
  return runNode(SCRIPT, ['--root', dir, 'theme', 'compose', '--direction', 'quiet'])
}

test('AC-20260908-07-11 (retag of the review-finding table, specs/20260907/06-theme-pick-moves-to-sketch.md build): theme compose composes cleanly when the only "wire/" text in a candidate page is prose or a genuinely unrelated path segment or a non-stylesheet link into wire/, and refuses byte-identically for every href-quoting form, tag shape, and CSS @import form that genuinely links the wire register as a stylesheet', () => {
  const prose = composeAgainstMutatedKit((html) => '<!-- re-rendered from the gray wire/ register -->\n' + html)
  assert.strictEqual(prose.status, 0,
    'a candidate whose only "wire/" occurrence is an HTML comment (prose, not a stylesheet link) must compose cleanly, not be refused as linking the wireframe register: ' + prose.stdout + prose.stderr)
  assert.strictEqual(prose.stdout, '✅ direction "quiet" composes — 2 primitive(s) re-rendered\n',
    'the prose-only "wire/" candidate must print the exact accept line, proving the false refusal never fired: ' + JSON.stringify(prose.stdout))

  const tokensLink = '<link rel="stylesheet" href="./tokens.css">'
  const wireForms = [
    ['a double-quoted href', (html) => html.replace(tokensLink, tokensLink + '\n<link rel="stylesheet" href="../../wire/tokens.css">')],
    ['a single-quoted href', (html) => html.replace(tokensLink, tokensLink + "\n<link rel='stylesheet' href='../../wire/tokens.css'>")],
    ['an unquoted href', (html) => html.replace(tokensLink, tokensLink + '\n<link rel=stylesheet href=../../wire/tokens.css>')],
    ['a quoted CSS @import', (html) => html.replace(tokensLink, tokensLink + '\n<style>@import "../../wire/tokens.css";</style>')],
    ['a url(...) CSS @import with an unquoted target', (html) => html.replace(tokensLink, tokensLink + '\n<style>@import url(../../wire/tokens.css);</style>')],
    ['a url("...") CSS @import with a quoted target', (html) => html.replace(tokensLink, tokensLink + '\n<style>@import url("../../wire/tokens.css");</style>')],
    ['an uppercase <LINK REL="STYLESHEET" HREF=...> tag', (html) => html.replace(tokensLink, tokensLink + '\n<LINK REL="STYLESHEET" HREF="../../wire/tokens.css">')],
    ['a <link> with href declared before rel', (html) => html.replace(tokensLink, tokensLink + '\n<link href="../../wire/tokens.css" rel="stylesheet">')],
    ['a root-relative /wire/ href', (html) => html.replace(tokensLink, tokensLink + '\n<link rel="stylesheet" href="/wire/tokens.css">')],
    ['a bare wire/ href with no leading path segment', (html) => html.replace(tokensLink, tokensLink + '\n<link rel="stylesheet" href="wire/tokens.css">')],
    ['a <link> tag split across multiple lines', (html) => html.replace(tokensLink, tokensLink + '\n<link\n  rel="stylesheet"\n  href="../../wire/tokens.css">')],
  ]
  for (const [label, mutate] of wireForms) {
    const r = composeAgainstMutatedKit(mutate)
    assert.strictEqual(r.status, 2,
      'a candidate that genuinely links the wire register via ' + label + ' must refuse: ' + r.stdout + r.stderr)
    assert.match(r.stderr, /links the wireframe register \(wire\/\)/,
      'a candidate genuinely linking the wire register via ' + label + ' must refuse with the byte-identical existing message: ' + JSON.stringify(r.stderr))
  }

  const composingForms = [
    ['a stylesheet link into a "my-wire/" directory (not the wire register)', '<link rel="stylesheet" href="../my-wire/x.css">'],
    ['a stylesheet link into a "v.wire/" directory (a dot before "wire", not the wire register)', '<link rel="stylesheet" href="../v.wire/x.css">'],
    ['a non-stylesheet (icon) link into a genuine wire/ path', '<link rel="icon" href="../../wire/favicon.png">'],
    ['a stylesheet link into "hardwire/" (an unrelated segment sharing a "wire" suffix)', '<link rel="stylesheet" href="../hardwire/x.css">'],
    ['a stylesheet link into "firewire/" (an unrelated segment sharing a "wire" suffix)', '<link rel="stylesheet" href="../firewire/x.css">'],
    ['a stylesheet link into "wired/" (no "wire/" segment at all)', '<link rel="stylesheet" href="../wired/x.css">'],
    ['a stylesheet link into "wireframe/" (no "wire/" segment at all)', '<link rel="stylesheet" href="../wireframe/x.css">'],
    ['a stylesheet link into "rewire/" (an unrelated segment sharing a "wire" suffix)', '<link rel="stylesheet" href="../rewire/x.css">'],
    ['a stylesheet link into "my_wire/" (an underscore, not a path separator, before "wire")', '<link rel="stylesheet" href="../my_wire/x.css">'],
  ]
  for (const [label, linkTag] of composingForms) {
    const r = composeAgainstMutatedKit((html) => html.replace(tokensLink, tokensLink + '\n' + linkTag))
    assert.strictEqual(r.status, 0,
      'a candidate with ' + label + ' must compose cleanly, not be refused as linking the wireframe register: ' + r.stdout + r.stderr)
    assert.strictEqual(r.stdout, '✅ direction "quiet" composes — 2 primitive(s) re-rendered\n',
      'a candidate with ' + label + ' must print the exact accept line: ' + JSON.stringify(r.stdout))
  }
})

