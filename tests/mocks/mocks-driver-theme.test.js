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
