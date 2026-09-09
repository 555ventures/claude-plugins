'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { runNode, tmpdir, SPEC } = require('../helpers')
const {
  SCRIPT, JOURNEY, LABELS, DENSE,
  mark, ledgerCmd, statusPath, statusJson,
  writeKitCanon, writeThemeKit,
  decideLook, freePort, startServe, stopServe,
  advanceToJourneyApproved, advanceToDirectionComposed, advanceToShapePicked,
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

test('AC-20260907-06-4: theme open validates every design/theme/*/ directory on disk, opens a "pick" stop keyed theme-picked with one <kebab>/kit candidate per valid direction at the atlas-index url (no --page override), and refuses (exit 2) naming the composed-direction floor with fewer than two', async () => {
  const dir = tmpdir('mocks-driver-theme')
  writeComposedPair(dir)
  const port = await freePort()
  let serveChild = null
  try {
    serveChild = await startServe(dir, port)
    const r = runNode(SCRIPT, ['--root', dir, 'theme', 'open', '--port', String(port)])
    assert.strictEqual(r.status, 0, 'theme open must exit 0 once two candidate directions compose cleanly: ' + r.stdout + r.stderr)
    const lines = r.stdout.split('\n').filter((l) => l.trim() !== '')
    assert.strictEqual(lines.length, 2, 'theme open must print exactly two stdout lines — the link and the fixed reply line: ' + JSON.stringify(r.stdout))
    assert.match(lines[0], /^🎨 ready for review — http:\/\/localhost:\d+\/atlas\/index\.html#stop-P\d+$/,
      'theme open must keep the atlas-index url (no --page override) — the link must not point at a per-direction or per-kebab page: ' + JSON.stringify(lines[0]))
    assert.strictEqual(lines[1], 'Reply  ✅ pick <name>  — or —  ✏️ change <what looks wrong>', 'a pick-kind stop must print the pick-shaped reply line: ' + JSON.stringify(lines[1]))

    const stops = JSON.parse(fs.readFileSync(path.join(dir, 'design/mocks/picks.json'), 'utf8'))
    const openStops = stops.filter((s) => s.status === 'open')
    assert.strictEqual(openStops.length, 1, 'theme open must write exactly one open stop: ' + JSON.stringify(stops))
    const themeStop = openStops[0]
    assert.strictEqual(themeStop.kind, 'pick', 'the theme-picked stop must be a "pick" stop: ' + JSON.stringify(themeStop))
    assert.strictEqual(themeStop.key, 'theme-picked', 'the stop\'s key must be "theme-picked" so design-atlas.js\'s existing stopHome(\'theme-picked\') keeps resolving it: ' + JSON.stringify(themeStop))
    const sorted = themeStop.candidates.slice().sort((a, b) => a.group.localeCompare(b.group))
    assert.deepStrictEqual(sorted,
      [{ group: 'quiet', label: 'kit', path: 'theme/quiet/kit.html' }, { group: 'warm', label: 'kit', path: 'theme/warm/kit.html' }],
      'theme open must write one candidate per composed direction, grouped by kebab, labeled "kit", pointing at theme/<kebab>/kit.html: ' + JSON.stringify(themeStop.candidates))
    assert.match(themeStop.url, /atlas\/index\.html#stop-/, 'the stop\'s recorded url must resolve against the atlas index, not a per-page override: ' + JSON.stringify(themeStop.url))
  } finally {
    if (serveChild) await stopServe(serveChild)
  }

  const soloDir = tmpdir('mocks-driver-theme')
  writeKitCanon(soloDir, KIT_PRIMITIVES)
  writeThemeKit(soloDir, 'quiet', KIT_PRIMITIVES)
  themeDirectionsRow(soloDir, 'quiet', 'P90')
  const solo = runNode(SCRIPT, ['--root', soloDir, 'theme', 'open'])
  assert.strictEqual(solo.status, 2, 'theme open must refuse with fewer than 2 composed directions: ' + solo.stdout + solo.stderr)
  assert.match(solo.stderr, /only 1 direction\(s\) composed — at least 2 are required/, 'the refusal must name the composed-direction floor: ' + JSON.stringify(solo.stderr))
})

test('AC-20260907-06-5: theme adopt on a decided theme-picked pick writes design/tokens.css byte-identical to the picked direction\'s tokens.css, appends the theme: <k> ledger row naming every other composed direction rejected, consumes the stop, leaves status.marks/status.theme untouched, and refuses (exit 2) with no theme-picked stop, writing no design/tokens.css', () => {
  const dir = tmpdir('mocks-driver-theme')
  writeComposedPair(dir)
  // Populate status.json with a real, non-null mark first (via the full seed->shape-picked
  // chain) so "leaves status.marks/status.theme exactly as found" is a meaningful assertion,
  // not a vacuous null-to-null comparison. writeComposedPair above only ever touches
  // design/kit and design/theme, never design/mocks/status.json, so this ordering is safe.
  advanceToShapePicked(dir)
  const before = statusJson(dir)

  decideLook(dir, 'theme-picked', 'pick', {
    pick: 'quiet', others: ['warm'], by: 'jj',
    candidates: [{ group: 'quiet', label: 'kit', path: 'theme/quiet/kit.html' }, { group: 'warm', label: 'kit', path: 'theme/warm/kit.html' }],
  })
  const adopt = runNode(SCRIPT, ['--root', dir, 'theme', 'adopt'])
  assert.strictEqual(adopt.status, 0, 'theme adopt must accept a decided theme-picked pick stop: ' + adopt.stdout + adopt.stderr)
  assert.strictEqual(adopt.stdout, '✅ theme "quiet" adopted — design/tokens.css written · fidelity reference: design/theme/quiet/kit.html\n',
    'theme adopt must print the exact accept line naming the picked direction and its kit.html fidelity reference: ' + JSON.stringify(adopt.stdout))

  const written = fs.readFileSync(path.join(dir, 'design/tokens.css'), 'utf8')
  const source = fs.readFileSync(path.join(dir, 'design/theme/quiet/tokens.css'), 'utf8')
  assert.strictEqual(written, source, 'theme adopt must write design/tokens.css byte-identical to the picked direction\'s own tokens.css: ' + JSON.stringify({ written, source }))

  const ledgerText = fs.readFileSync(path.join(dir, 'design/mocks/ledger.md'), 'utf8')
  assert.match(ledgerText, /\|\s*P\d+\s*\|\s*SKETCH\s*\|\s*product\s*\|\s*theme: quiet\s*\|\s*said-by-user\s*\|\s*confirmed \d{4}-\d{2}-\d{2}\s*\|\s*warm\s*\|/,
    'theme adopt must append a "theme: quiet" row at step SKETCH, said-by-user/confirmed today, whose rejected cell names the other composed direction "warm": ' + ledgerText)

  const stops = JSON.parse(fs.readFileSync(path.join(dir, 'design/mocks/picks.json'), 'utf8'))
  const themeStop = stops.find((s) => s.key === 'theme-picked')
  assert.strictEqual(themeStop.status, 'consumed', 'theme adopt must mark the theme-picked stop consumed: ' + JSON.stringify(themeStop))

  const after = statusJson(dir)
  assert.deepStrictEqual(after.marks, before.marks, 'theme adopt must leave every key of status.marks exactly as it found them — the theme pick is not a mocks-state mark: ' + JSON.stringify({ before: before.marks, after: after.marks }))
  assert.strictEqual(after.theme, before.theme, 'theme adopt must leave status.theme exactly as it found it — design/tokens.css on disk is the sole "a theme is picked" signal: ' + JSON.stringify({ before: before.theme, after: after.theme }))

  const noStopDir = tmpdir('mocks-driver-theme')
  writeComposedPair(noStopDir)
  const noStop = runNode(SCRIPT, ['--root', noStopDir, 'theme', 'adopt'])
  assert.strictEqual(noStop.status, 2, 'theme adopt must refuse with no theme-picked stop at all: ' + noStop.stdout + noStop.stderr)
  assert.match(noStop.stderr, /theme open/, 'the refusal must name `theme open` as the remedy: ' + JSON.stringify(noStop.stderr))
  assert.ok(!fs.existsSync(path.join(noStopDir, 'design/tokens.css')), 'theme adopt must not create design/tokens.css when it refuses for lack of a decided stop: ' + JSON.stringify(fs.readdirSync(path.join(noStopDir, 'design')).catch ? '' : fs.existsSync(path.join(noStopDir, 'design'))))
})

test('AC-20260907-06-6: theme adopt --direction <x> disagreeing with a decided theme-picked page pick refuses (exit 2) naming the page pick, and writes no design/tokens.css', () => {
  const dir = tmpdir('mocks-driver-theme')
  writeComposedPair(dir)
  decideLook(dir, 'theme-picked', 'pick', {
    pick: 'quiet', others: ['warm'], by: 'jj',
    candidates: [{ group: 'quiet', label: 'kit', path: 'theme/quiet/kit.html' }, { group: 'warm', label: 'kit', path: 'theme/warm/kit.html' }],
  })
  const r = runNode(SCRIPT, ['--root', dir, 'theme', 'adopt', '--direction', 'warm'])
  assert.strictEqual(r.status, 2, '--direction warm must refuse against a page pick of "quiet": ' + r.stdout + r.stderr)
  assert.match(r.stderr, /disagrees with the page pick "quiet"/, 'the refusal must name the page\'s actual pick "quiet": ' + JSON.stringify(r.stderr))
  assert.ok(!fs.existsSync(path.join(dir, 'design/tokens.css')), 'a disagreeing --direction must never write design/tokens.css: ' + JSON.stringify(fs.existsSync(path.join(dir, 'design/tokens.css'))))
})

// AC-20260907-06-10: this spec adds a second theme producer (the `theme` subcommand family) and
// retires none of the mocks state machine's own THEME step — `--mark direction-composed`,
// `--mark theme-picked` and `--reopen theme` (all still routed through the pre-existing
// `--mark`/`--reopen` flag parsing, never through the new bare `theme <sub>` positional) must
// keep being accepted exactly as tests/mocks/mocks-driver-2.test.js and mocks-driver-3.test.js
// already pin, and a journey-approved root with status.theme null must keep deriving THEME. This
// is a CONTINUE-TO pin: it is green against today's pre-image (the new `theme` family does not
// exist yet, so it cannot have broken anything) and must stay green once it lands.
test('AC-20260907-06-10: THE SYSTEM SHALL CONTINUE TO accept --mark direction-composed/--mark theme-picked/--reopen theme unaffected by the new theme subcommand family, and SHALL CONTINUE TO derive THEME from a journey-approved root whose status.theme is null', () => {
  const dir = tmpdir('mocks-driver-theme')
  advanceToJourneyApproved(dir)
  const beforeState = runNode(SCRIPT, ['--root', dir, '--state'])
  assert.strictEqual(beforeState.stdout.trim(), 'THEME', 'a journey-approved root with status.theme null must still derive THEME: ' + beforeState.stdout + beforeState.stderr)
  assert.strictEqual(statusJson(dir).theme, null, 'the fixture root must genuinely have status.theme null before the marks below: ' + JSON.stringify(statusJson(dir)))

  advanceToDirectionComposed(dir, 'quiet', [DENSE, LABELS[0]], 'P15')
  advanceToDirectionComposed(dir, 'warm', [DENSE, LABELS[1]], 'P16')
  const themeRow = ledgerCmd(dir, 'add', ['--id', 'P17', '--step', 'THEME', '--kind', 'product', '--claim', 'theme: quiet', '--tag', 'said-by-user', '--status', 'confirmed', '--rejected', 'warm'])
  assert.strictEqual(themeRow.status, 0, 'test setup requires the theme-pick ledger row to be accepted: ' + themeRow.stderr)
  decideLook(dir, 'theme-picked', 'pick', { pick: 'quiet', others: ['warm'], by: 'jj' })
  const themePicked = mark(dir, 'theme-picked', ['--direction', 'quiet'])
  assert.strictEqual(themePicked.status, 0, '--mark theme-picked must still be accepted once 2+ directions are composed and the theme row rejects every other one: ' + themePicked.stderr)

  const reopened = runNode(SCRIPT, ['--root', dir, '--reopen', 'theme'])
  assert.strictEqual(reopened.status, 0, '--reopen theme must still be accepted: ' + reopened.stdout + reopened.stderr)
  const derived = runNode(SCRIPT, ['--root', dir, '--state'])
  assert.strictEqual(derived.stdout.trim(), 'THEME', 'after --reopen theme the next derivation must still land on THEME: ' + derived.stdout + derived.stderr)
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

// Review finding (specs/20260907/06-theme-pick-moves-to-sketch.md build, soft): deriving the
// "rejected" cell (and its completeness check) from EVERY directory under design/theme/ on
// disk records a stale or half-authored sibling that never actually composed as a rejected
// composed direction — spec/scripts/mocks-driver.js's cmdThemeAdopt filters siblings down to
// those that pass composeViolations instead. Deriving from every directory on disk reddens
// this test's `assert.ok(!/\bghost\b/.test(rejectedCell), ...)` assertion below — "ghost" (a
// bare directory with no tokens.css, kit.html, or ledger row — composeViolations refuses it at
// its first leg) would be named in the rejected cell alongside the genuinely composed "warm" —
// that is the assertion this regression pin exists to catch.
test('review finding (specs/20260907/06-theme-pick-moves-to-sketch.md build): theme adopt\'s rejected cell names only composed sibling directions, never a stale or half-authored one that never passed compose', () => {
  const dir = tmpdir('mocks-driver-theme')
  writeKitCanon(dir, KIT_PRIMITIVES)
  writeThemeKit(dir, 'quiet', KIT_PRIMITIVES)
  themeDirectionsRow(dir, 'quiet', 'P90')
  writeThemeKit(dir, 'warm', KIT_PRIMITIVES)
  themeDirectionsRow(dir, 'warm', 'P91')
  // "ghost" is a bare, half-authored sibling directory — no tokens.css, no kit.html, no ledger
  // row — so composeViolations('ghost') refuses at its very first leg. It sits on disk exactly
  // like a real composed direction would to themeDirsOnDisk()'s plain readdir.
  fs.mkdirSync(path.join(dir, 'design/theme/ghost'), { recursive: true })

  decideLook(dir, 'theme-picked', 'pick', {
    pick: 'quiet', others: ['warm'], by: 'jj',
    candidates: [{ group: 'quiet', label: 'kit', path: 'theme/quiet/kit.html' }, { group: 'warm', label: 'kit', path: 'theme/warm/kit.html' }],
  })
  const adopt = runNode(SCRIPT, ['--root', dir, 'theme', 'adopt'])
  assert.strictEqual(adopt.status, 0, 'theme adopt must accept with one genuinely composed sibling and one uncomposed/half-authored one on disk: ' + adopt.stdout + adopt.stderr)

  const ledgerText = fs.readFileSync(path.join(dir, 'design/mocks/ledger.md'), 'utf8')
  const rowMatch = ledgerText.match(/\|\s*P\d+\s*\|\s*SKETCH\s*\|\s*product\s*\|\s*theme: quiet\s*\|\s*said-by-user\s*\|\s*confirmed \d{4}-\d{2}-\d{2}\s*\|\s*([^|]*)\|/)
  assert.ok(rowMatch, 'theme adopt must append a "theme: quiet" ledger row: ' + ledgerText)
  const rejectedCell = rowMatch[1].trim()
  assert.match(rejectedCell, /\bwarm\b/,
    'the rejected cell must name "warm" — a genuinely composed sibling direction: ' + JSON.stringify(rejectedCell))
  assert.ok(!/\bghost\b/.test(rejectedCell),
    'the rejected cell must NOT name "ghost" — a bare, half-authored directory that never passed compose is not a rejected composed direction: ' + JSON.stringify(rejectedCell))
})

// D10 (specs/20260907/06-theme-pick-moves-to-sketch.md, review ruling): a confirmed
// "theme: <kebab>" ledger row whose rejected cell does not name every composed direction no
// longer dead-ends theme adopt in a bare die() with no documented remedy — cmdThemeAdopt marks
// the stale row overridden <today> via the existing setStatus and appends a fresh, complete
// row right after it. The token copy, the stop consumption and the completeness check itself
// stay exactly as they are; only the incomplete-row branch's own behavior changes. Helpers
// below read every "theme: <kebab>" row in the ledger by regex, capturing id/status/rejected,
// since parseLedger is internal to mocks-driver.js and not exported for tests to call.
// `kebab` scopes the match to one direction (AC-20260907-06-12's same-kebab pins), exactly as
// before; omitting it (AC-20260907-06-13's cross-direction pins) matches every "theme: <k>"
// claim regardless of direction, capturing the kebab itself as an extra `kebab` field — the
// existing id/status/date/rejected fields and their call sites are unchanged either way.
function themeClaimRows(ledgerText, kebab) {
  const kebabGroup = kebab === undefined ? '([a-zA-Z0-9-]+)' : '(' + kebab + ')'
  const re = new RegExp('\\|\\s*(P\\d+)\\s*\\|\\s*SKETCH\\s*\\|\\s*product\\s*\\|\\s*theme: ' + kebabGroup +
    '\\s*\\|\\s*said-by-user\\s*\\|\\s*(confirmed|overridden) (\\d{4}-\\d{2}-\\d{2})\\s*\\|\\s*([^|]*)\\|', 'g')
  return [...ledgerText.matchAll(re)].map((m) => ({ id: m[1], kebab: m[2], status: m[3], date: m[4], rejected: m[5].trim() }))
}
function readLedgerText(dir) { return fs.readFileSync(path.join(dir, 'design/mocks/ledger.md'), 'utf8') }

test('AC-20260907-06-12: D10: theme adopt supersedes a stale "theme: <k>" row (marking it overridden and appending a fresh complete one) instead of dead-ending, once a further direction composes after the first pick', () => {
  const dir = tmpdir('mocks-driver-theme')
  writeKitCanon(dir, KIT_PRIMITIVES)
  writeThemeKit(dir, 'a', KIT_PRIMITIVES)
  themeDirectionsRow(dir, 'a', 'P90')
  writeThemeKit(dir, 'b', KIT_PRIMITIVES)
  themeDirectionsRow(dir, 'b', 'P91')

  decideLook(dir, 'theme-picked', 'pick', {
    pick: 'a', others: ['b'], by: 'jj',
    candidates: [{ group: 'a', label: 'kit', path: 'theme/a/kit.html' }, { group: 'b', label: 'kit', path: 'theme/b/kit.html' }],
  })
  const firstAdopt = runNode(SCRIPT, ['--root', dir, 'theme', 'adopt'])
  assert.strictEqual(firstAdopt.status, 0, 'the first adopt of "a" with only "b" composed must accept: ' + firstAdopt.stdout + firstAdopt.stderr)
  const beforeRows = themeClaimRows(readLedgerText(dir), 'a')
  assert.strictEqual(beforeRows.length, 1, 'exactly one "theme: a" row must exist after the first adopt: ' + JSON.stringify(beforeRows))
  assert.strictEqual(beforeRows[0].status, 'confirmed', 'the first "theme: a" row must be confirmed: ' + JSON.stringify(beforeRows[0]))
  assert.strictEqual(beforeRows[0].rejected, 'b', 'the first "theme: a" row must reject exactly "b", the only other composed direction at the time: ' + JSON.stringify(beforeRows[0]))
  const staleId = beforeRows[0].id

  writeThemeKit(dir, 'c', KIT_PRIMITIVES)
  themeDirectionsRow(dir, 'c', 'P92')
  decideLook(dir, 'theme-picked', 'pick', {
    pick: 'a', others: ['b', 'c'], by: 'jj',
    candidates: [{ group: 'a', label: 'kit', path: 'theme/a/kit.html' }, { group: 'b', label: 'kit', path: 'theme/b/kit.html' }, { group: 'c', label: 'kit', path: 'theme/c/kit.html' }],
  })
  const secondAdopt = runNode(SCRIPT, ['--root', dir, 'theme', 'adopt'])
  // This is the assertion a bare die() on an incomplete rejected cell would trip: re-picking
  // "a" once "c" has composed leaves the stale row's rejected cell ("b") short of "c", which
  // die()-based code refuses (exit 2, "missing: c") with no documented repair.
  assert.strictEqual(secondAdopt.status, 0,
    're-picking "a" once a third direction has composed must accept, not dead-end on the stale rejected cell: ' + secondAdopt.stdout + secondAdopt.stderr)
  const today = new Date().toISOString().slice(0, 10)

  const afterRows = themeClaimRows(readLedgerText(dir), 'a')
  assert.strictEqual(afterRows.length, 2, 'exactly two "theme: a" rows must exist after the supersede — the superseded stale row plus the fresh complete one: ' + JSON.stringify(afterRows))
  const stale = afterRows.find((r) => r.id === staleId)
  assert.ok(stale, 'the original row\'s id must still be present in the ledger, now overridden rather than deleted: ' + JSON.stringify(afterRows))
  assert.strictEqual(stale.status, 'overridden', 'the stale row must now read overridden: ' + JSON.stringify(stale))
  assert.strictEqual(stale.date, today, 'the stale row must read overridden as of TODAY\'s date, matching the driver\'s own todayIso(): ' + JSON.stringify(stale))
  const fresh = afterRows.find((r) => r.id !== staleId)
  assert.ok(fresh, 'a fresh "theme: a" row with a new id must be appended: ' + JSON.stringify(afterRows))
  assert.strictEqual(fresh.status, 'confirmed', 'the fresh row must be confirmed: ' + JSON.stringify(fresh))
  const freshRejectedTokens = fresh.rejected.split(/[,\s]+/).filter(Boolean)
  assert.ok(freshRejectedTokens.includes('b') && freshRejectedTokens.includes('c'),
    'the fresh row\'s rejected cell must name both "b" and "c", every other composed direction at the time of the supersede: ' + JSON.stringify(fresh))
})

test('AC-20260907-06-12: D10: two supersedes in a row on the same kebab leave the ledger with exactly one CONFIRMED "theme: <k>" row — findAssumption\'s first-match lookup must never resolve to a stale overridden row', () => {
  const dir = tmpdir('mocks-driver-theme')
  writeKitCanon(dir, KIT_PRIMITIVES)
  writeThemeKit(dir, 'a', KIT_PRIMITIVES)
  themeDirectionsRow(dir, 'a', 'P90')
  writeThemeKit(dir, 'b', KIT_PRIMITIVES)
  themeDirectionsRow(dir, 'b', 'P91')
  decideLook(dir, 'theme-picked', 'pick', {
    pick: 'a', others: ['b'], by: 'jj',
    candidates: [{ group: 'a', label: 'kit', path: 'theme/a/kit.html' }, { group: 'b', label: 'kit', path: 'theme/b/kit.html' }],
  })
  const adopt1 = runNode(SCRIPT, ['--root', dir, 'theme', 'adopt'])
  assert.strictEqual(adopt1.status, 0, 'the first adopt of "a" must accept: ' + adopt1.stdout + adopt1.stderr)

  writeThemeKit(dir, 'c', KIT_PRIMITIVES)
  themeDirectionsRow(dir, 'c', 'P92')
  decideLook(dir, 'theme-picked', 'pick', {
    pick: 'a', others: ['b', 'c'], by: 'jj',
    candidates: [{ group: 'a', label: 'kit', path: 'theme/a/kit.html' }, { group: 'b', label: 'kit', path: 'theme/b/kit.html' }, { group: 'c', label: 'kit', path: 'theme/c/kit.html' }],
  })
  const adopt2 = runNode(SCRIPT, ['--root', dir, 'theme', 'adopt'])
  // Under a bare die() this second re-pick never reaches a second ledger row at all — the
  // stale row's rejected cell ("b") is short of "c" and the call exits 2. This assertion is
  // what a regression back to die()-on-incomplete would trip.
  assert.strictEqual(adopt2.status, 0, 'the first supersede (re-picking "a" once "c" composed) must accept: ' + adopt2.stdout + adopt2.stderr)

  writeThemeKit(dir, 'd', KIT_PRIMITIVES)
  themeDirectionsRow(dir, 'd', 'P93')
  decideLook(dir, 'theme-picked', 'pick', {
    pick: 'a', others: ['b', 'c', 'd'], by: 'jj',
    candidates: [{ group: 'a', label: 'kit', path: 'theme/a/kit.html' }, { group: 'b', label: 'kit', path: 'theme/b/kit.html' }, { group: 'c', label: 'kit', path: 'theme/c/kit.html' }, { group: 'd', label: 'kit', path: 'theme/d/kit.html' }],
  })
  const adopt3 = runNode(SCRIPT, ['--root', dir, 'theme', 'adopt'])
  assert.strictEqual(adopt3.status, 0, 'the second supersede (re-picking "a" once "d" composed) must accept: ' + adopt3.stdout + adopt3.stderr)
  const today = new Date().toISOString().slice(0, 10)

  const rows = themeClaimRows(readLedgerText(dir), 'a')
  assert.strictEqual(rows.length, 3, 'two supersedes must leave exactly three "theme: a" rows on disk — nothing is ever deleted: ' + JSON.stringify(rows))
  const ids = rows.map((r) => r.id)
  assert.strictEqual(new Set(ids).size, ids.length,
    'every "theme: a" row must carry a DISTINCT id — an id-generator reuse across the two supersedes would silently merge two rows under the same id, which no count/status assertion alone would catch: ' + JSON.stringify(rows))
  const confirmedRows = rows.filter((r) => r.status === 'confirmed')
  const overriddenRows = rows.filter((r) => r.status === 'overridden')
  assert.strictEqual(confirmedRows.length, 1,
    'the ledger must never hold more than one CONFIRMED "theme: a" row — a stale row a later adopt could still match via findAssumption\'s first-match lookup means a re-pick can resolve to dead data: ' + JSON.stringify(rows))
  assert.strictEqual(overriddenRows.length, 2, 'both earlier rows must be overridden, never deleted: ' + JSON.stringify(rows))
  assert.ok(!overriddenRows.some((r) => r.id === confirmedRows[0].id),
    'the sole confirmed row\'s id must not collide with either overridden row\'s id: ' + JSON.stringify(rows))
  for (const r of overriddenRows) {
    assert.strictEqual(r.date, today, 'every overridden row must read overridden as of TODAY\'s date, matching the driver\'s own todayIso(): ' + JSON.stringify(r))
  }
  const freshRejectedTokens = confirmedRows[0].rejected.split(/[,\s]+/).filter(Boolean)
  assert.deepStrictEqual(freshRejectedTokens.sort(), ['b', 'c', 'd'],
    'the sole confirmed row must reject every other composed direction as of the LAST supersede: ' + JSON.stringify(confirmedRows[0]))
})

test('AC-20260907-06-12: D10: theme adopt does not supersede when the existing row\'s rejected cell already names every composed direction — the row is left untouched and no new row is appended', () => {
  const dir = tmpdir('mocks-driver-theme')
  writeKitCanon(dir, KIT_PRIMITIVES)
  writeThemeKit(dir, 'a', KIT_PRIMITIVES)
  themeDirectionsRow(dir, 'a', 'P90')
  writeThemeKit(dir, 'b', KIT_PRIMITIVES)
  themeDirectionsRow(dir, 'b', 'P91')
  decideLook(dir, 'theme-picked', 'pick', {
    pick: 'a', others: ['b'], by: 'jj',
    candidates: [{ group: 'a', label: 'kit', path: 'theme/a/kit.html' }, { group: 'b', label: 'kit', path: 'theme/b/kit.html' }],
  })
  const firstAdopt = runNode(SCRIPT, ['--root', dir, 'theme', 'adopt'])
  assert.strictEqual(firstAdopt.status, 0, 'the first adopt of "a" must accept: ' + firstAdopt.stdout + firstAdopt.stderr)
  const beforeRows = themeClaimRows(readLedgerText(dir), 'a')
  assert.strictEqual(beforeRows.length, 1, 'exactly one "theme: a" row must exist after the first adopt: ' + JSON.stringify(beforeRows))
  const originalId = beforeRows[0].id

  // No further direction composes — "b" is still the only other composed direction, so the
  // existing row's rejected cell ("b") is already complete. Re-picking "a" again (a fresh
  // theme-picked stop, per D5) must be a true no-op on the ledger.
  decideLook(dir, 'theme-picked', 'pick', {
    pick: 'a', others: ['b'], by: 'jj',
    candidates: [{ group: 'a', label: 'kit', path: 'theme/a/kit.html' }, { group: 'b', label: 'kit', path: 'theme/b/kit.html' }],
  })
  const secondAdopt = runNode(SCRIPT, ['--root', dir, 'theme', 'adopt'])
  assert.strictEqual(secondAdopt.status, 0, 're-picking "a" with an already-complete rejected cell must accept: ' + secondAdopt.stdout + secondAdopt.stderr)

  const afterRows = themeClaimRows(readLedgerText(dir), 'a')
  assert.strictEqual(afterRows.length, 1,
    'no new "theme: a" row may be appended when the existing row is already complete — an unconditional supersede would leave two rows here: ' + JSON.stringify(afterRows))
  assert.strictEqual(afterRows[0].id, originalId, 'the single row must still carry its original id — it was never rewritten: ' + JSON.stringify(afterRows[0]))
  assert.strictEqual(afterRows[0].status, 'confirmed', 'the single row must still read confirmed, never overridden, when nothing needed superseding: ' + JSON.stringify(afterRows[0]))
})

// D12 (specs/20260907/06-theme-pick-moves-to-sketch.md, review ruling): D10's supersede only
// covered a stale row for the SAME direction, so adopting "a" then "b" left two confirmed
// "theme:" rows both claiming to be the user's pick — a later genesis run's confirmedProductRows()
// filters generically on confirmed said-by-user product rows, so two contradictory "theme:"
// claims become binding grounding with nothing to catch it (ledger check's gate only blocks
// invented/inferred rows). cmdThemeAdopt now marks every OTHER confirmed "theme: <other>" row
// overridden <today> in the same write that adopts <k>, so exactly one confirmed "theme:" row
// exists across ALL directions at any time — D5's "design/tokens.css on disk is the sole pick
// signal" is unchanged, this is about the provenance rows only.
test('AC-20260907-06-13: D12: theme adopt marks every confirmed "theme: <other>" row overridden when a DIFFERENT direction is adopted, leaving exactly one confirmed theme: row across all directions', () => {
  const dir = tmpdir('mocks-driver-theme')
  writeKitCanon(dir, KIT_PRIMITIVES)
  writeThemeKit(dir, 'a', KIT_PRIMITIVES)
  themeDirectionsRow(dir, 'a', 'P90')
  writeThemeKit(dir, 'b', KIT_PRIMITIVES)
  themeDirectionsRow(dir, 'b', 'P91')

  decideLook(dir, 'theme-picked', 'pick', {
    pick: 'a', others: ['b'], by: 'jj',
    candidates: [{ group: 'a', label: 'kit', path: 'theme/a/kit.html' }, { group: 'b', label: 'kit', path: 'theme/b/kit.html' }],
  })
  const adoptA = runNode(SCRIPT, ['--root', dir, 'theme', 'adopt'])
  assert.strictEqual(adoptA.status, 0, 'adopting "a" first must accept: ' + adoptA.stdout + adoptA.stderr)

  decideLook(dir, 'theme-picked', 'pick', {
    pick: 'b', others: ['a'], by: 'jj',
    candidates: [{ group: 'a', label: 'kit', path: 'theme/a/kit.html' }, { group: 'b', label: 'kit', path: 'theme/b/kit.html' }],
  })
  const adoptB = runNode(SCRIPT, ['--root', dir, 'theme', 'adopt'])
  assert.strictEqual(adoptB.status, 0, 'adopting a DIFFERENT direction "b" after "a" was already adopted must accept: ' + adoptB.stdout + adoptB.stderr)
  const today = new Date().toISOString().slice(0, 10)

  const allRows = themeClaimRows(readLedgerText(dir))
  const confirmedRows = allRows.filter((r) => r.status === 'confirmed')
  // This is the assertion a same-kebab-only supersede (D10 alone, no D12) would trip: under
  // that behavior "theme: a" is never touched by an adopt of a DIFFERENT direction, so this
  // count would be 2 (both "a" and "b" confirmed), not 1.
  assert.strictEqual(confirmedRows.length, 1,
    'exactly one confirmed "theme:" row must exist across ALL directions once "b" is adopted after "a" — a same-kebab-only supersede would leave "theme: a" confirmed too: ' + JSON.stringify(allRows))
  assert.strictEqual(confirmedRows[0].kebab, 'b', 'the sole confirmed row must name "b", the most recently adopted direction: ' + JSON.stringify(confirmedRows[0]))
  const aRow = allRows.find((r) => r.kebab === 'a')
  assert.ok(aRow, 'the original "theme: a" row must still be present in the ledger, now overridden rather than deleted: ' + JSON.stringify(allRows))
  assert.strictEqual(aRow.status, 'overridden', 'the "theme: a" row must be marked overridden once a different direction is adopted: ' + JSON.stringify(aRow))
  assert.strictEqual(aRow.date, today, 'the "theme: a" row must be overridden as of TODAY\'s date, matching the driver\'s own todayIso(): ' + JSON.stringify(aRow))
})

test('AC-20260907-06-13: D12: adopting three directions in turn leaves exactly one confirmed theme: row (naming the last pick) and one overridden row per superseded pick, all with distinct ids', () => {
  const dir = tmpdir('mocks-driver-theme')
  writeKitCanon(dir, KIT_PRIMITIVES)
  writeThemeKit(dir, 'a', KIT_PRIMITIVES)
  themeDirectionsRow(dir, 'a', 'P90')
  writeThemeKit(dir, 'b', KIT_PRIMITIVES)
  themeDirectionsRow(dir, 'b', 'P91')
  writeThemeKit(dir, 'c', KIT_PRIMITIVES)
  themeDirectionsRow(dir, 'c', 'P92')
  const allCandidates = [
    { group: 'a', label: 'kit', path: 'theme/a/kit.html' },
    { group: 'b', label: 'kit', path: 'theme/b/kit.html' },
    { group: 'c', label: 'kit', path: 'theme/c/kit.html' },
  ]

  decideLook(dir, 'theme-picked', 'pick', { pick: 'a', others: ['b', 'c'], by: 'jj', candidates: allCandidates })
  const adoptA = runNode(SCRIPT, ['--root', dir, 'theme', 'adopt'])
  assert.strictEqual(adoptA.status, 0, 'adopting "a" first must accept: ' + adoptA.stdout + adoptA.stderr)

  decideLook(dir, 'theme-picked', 'pick', { pick: 'b', others: ['a', 'c'], by: 'jj', candidates: allCandidates })
  const adoptB = runNode(SCRIPT, ['--root', dir, 'theme', 'adopt'])
  assert.strictEqual(adoptB.status, 0, 'adopting "b" second must accept: ' + adoptB.stdout + adoptB.stderr)

  decideLook(dir, 'theme-picked', 'pick', { pick: 'c', others: ['a', 'b'], by: 'jj', candidates: allCandidates })
  const adoptC = runNode(SCRIPT, ['--root', dir, 'theme', 'adopt'])
  assert.strictEqual(adoptC.status, 0, 'adopting "c" third must accept: ' + adoptC.stdout + adoptC.stderr)
  const today = new Date().toISOString().slice(0, 10)

  const allRows = themeClaimRows(readLedgerText(dir))
  assert.strictEqual(allRows.length, 3, 'three adopts in turn must leave exactly three "theme:" rows on disk — nothing is ever deleted: ' + JSON.stringify(allRows))
  const ids = allRows.map((r) => r.id)
  assert.strictEqual(new Set(ids).size, ids.length,
    'every "theme:" row across all three adopts must carry a distinct id: ' + JSON.stringify(allRows))
  const confirmedRows = allRows.filter((r) => r.status === 'confirmed')
  const overriddenRows = allRows.filter((r) => r.status === 'overridden')
  assert.strictEqual(confirmedRows.length, 1,
    'exactly one confirmed "theme:" row must exist across all three directions after adopting "a", "b", then "c" in turn: ' + JSON.stringify(allRows))
  assert.strictEqual(confirmedRows[0].kebab, 'c', 'the sole confirmed row must name "c", the last direction adopted: ' + JSON.stringify(confirmedRows[0]))
  assert.strictEqual(overriddenRows.length, 2,
    'both "a" and "b" must be overridden, one row per superseded pick: ' + JSON.stringify(allRows))
  assert.deepStrictEqual(overriddenRows.map((r) => r.kebab).sort(), ['a', 'b'],
    'the two overridden rows must name exactly "a" and "b", the two superseded picks: ' + JSON.stringify(overriddenRows))
  for (const r of overriddenRows) {
    assert.strictEqual(r.date, today, 'every overridden row must read overridden as of TODAY\'s date: ' + JSON.stringify(r))
  }
})

// Review finding (specs/20260907/06-theme-pick-moves-to-sketch.md build): `appendAssumption`
// performs no duplicate-claim check, so `ledger add` — a sanctioned, documented driver
// subcommand — can leave TWO confirmed "theme: <kebab>" rows for the SAME direction, reachable
// with no parse error and no gate catching it (ledger check blocks only invented/inferred). A
// first-match `find()` in cmdThemeAdopt's same-kebab lookup would supersede only one of the two
// and leave the other confirmed, undetected. The lookup now `filter()`s every confirmed
// same-kebab row, so re-adopting the same direction collapses all of them — the guaranteed
// end-state invariant is exactly one confirmed "theme: " row overall, naming the adopted
// kebab, with every other row of that shape (same-kebab duplicates and other directions alike)
// overridden. This is the same AC-20260907-06-13 invariant exercised from a duplicate-row
// starting state, so it carries that AC-ID rather than a new one.
test('AC-20260907-06-13: D12: theme adopt collapses TWO pre-existing confirmed "theme: <k>" rows for the SAME direction into one, overriding both, when re-adopting that direction', () => {
  const dir = tmpdir('mocks-driver-theme')
  writeKitCanon(dir, KIT_PRIMITIVES)
  writeThemeKit(dir, 'a', KIT_PRIMITIVES)
  themeDirectionsRow(dir, 'a', 'P90')

  decideLook(dir, 'theme-picked', 'pick', {
    pick: 'a', others: [], by: 'jj',
    candidates: [{ group: 'a', label: 'kit', path: 'theme/a/kit.html' }],
  })
  const firstAdopt = runNode(SCRIPT, ['--root', dir, 'theme', 'adopt'])
  assert.strictEqual(firstAdopt.status, 0, 'adopting "a" first must accept: ' + firstAdopt.stdout + firstAdopt.stderr)
  const beforeRows = themeClaimRows(readLedgerText(dir))
  assert.strictEqual(beforeRows.length, 1, 'exactly one "theme:" row must exist after the first adopt: ' + JSON.stringify(beforeRows))
  const firstRowId = beforeRows[0].id

  // Seed the duplicate-confirmed-row state via the sanctioned path — `ledger add` — exactly as
  // the finding names it, never by hand-editing ledger.md.
  const dupe = ledgerCmd(dir, 'add', [
    '--id', 'P95', '--step', 'SKETCH', '--kind', 'product',
    '--claim', 'theme: a', '--tag', 'said-by-user', '--status', 'confirmed 2026-01-01',
  ])
  assert.strictEqual(dupe.status, 0, 'test setup requires `ledger add` to accept a second confirmed "theme: a" row (the sanctioned, documented path this duplicate state is reachable through): ' + dupe.stderr)
  const dupedRows = themeClaimRows(readLedgerText(dir))
  assert.strictEqual(dupedRows.length, 2, 'test setup requires exactly two confirmed "theme: a" rows to exist before the re-adopt: ' + JSON.stringify(dupedRows))
  const secondRowId = dupedRows.find((r) => r.id !== firstRowId).id

  decideLook(dir, 'theme-picked', 'pick', {
    pick: 'a', others: [], by: 'jj',
    candidates: [{ group: 'a', label: 'kit', path: 'theme/a/kit.html' }],
  })
  const secondAdopt = runNode(SCRIPT, ['--root', dir, 'theme', 'adopt'])
  assert.strictEqual(secondAdopt.status, 0, 're-adopting "a" with two pre-existing confirmed same-kebab rows must accept: ' + secondAdopt.stdout + secondAdopt.stderr)
  const today = new Date().toISOString().slice(0, 10)

  const allRows = themeClaimRows(readLedgerText(dir))
  const confirmedRows = allRows.filter((r) => r.status === 'confirmed')
  const overriddenRows = allRows.filter((r) => r.status === 'overridden')
  // This is the assertion a first-match find() would trip: under that lookup, only one of the
  // two pre-existing "theme: a" rows is superseded — the other stays confirmed, so this count
  // would be 2, not 1.
  assert.strictEqual(confirmedRows.length, 1,
    'exactly one confirmed "theme:" row must remain once "a" is re-adopted with two pre-existing same-kebab confirmed rows — a first-match find() would leave one of them confirmed: ' + JSON.stringify(allRows))
  assert.strictEqual(confirmedRows[0].kebab, 'a', 'the sole confirmed row must name "a": ' + JSON.stringify(confirmedRows[0]))
  assert.strictEqual(overriddenRows.length, 2, 'both pre-existing "theme: a" rows must now be overridden: ' + JSON.stringify(allRows))
  assert.deepStrictEqual(overriddenRows.map((r) => r.id).sort(), [firstRowId, secondRowId].sort(),
    'the two overridden rows must be exactly the two pre-existing rows (the original adopt\'s row and the ledger-add duplicate), by id: ' + JSON.stringify(overriddenRows))
  for (const r of overriddenRows) {
    assert.strictEqual(r.date, today, 'both overridden rows must read overridden as of TODAY\'s date: ' + JSON.stringify(r))
  }
  const ids = allRows.map((r) => r.id)
  assert.strictEqual(new Set(ids).size, ids.length, 'every "theme:" row must carry a distinct id, including the fresh confirmed row: ' + JSON.stringify(allRows))
})
