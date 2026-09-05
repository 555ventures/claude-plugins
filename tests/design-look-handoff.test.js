'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// Owner: spec/commands/design.md § Step 5 — Your look (+ shared § Design Atlas, look-stop rule).
// Pins the human hand-off block (🎨 command, 🆕 names, fixed reply line) that every look stop
// prints before ending the turn — never before an AskUserQuestion, which hides it.

function step5() {
  const doc = read('spec/commands/design.md')
  const start = doc.indexOf('## Step 5')
  const end = doc.indexOf('## Step 6')
  assert.ok(start > -1 && end > start,
    'design.md must keep a "## Step 5" section followed by "## Step 6" — without the human-look step the loop never stops for the catalog look')
  return doc.slice(start, end)
}

test('design.md Step 5 prints the hand-off block (🎨 catalog command, 🆕 component names, a fixed reply line) and ends the turn — never an AskUserQuestion', () => {
  const s = step5()
  const mentions = [...s.matchAll(/AskUserQuestion/g)].map(m => s.slice(Math.max(0, m.index - 7), m.index))
  assert.ok(mentions.length >= 1 && mentions.every(prefix => /never `$/.test(prefix)),
    'Step 5 must not call AskUserQuestion — the terminal hides every line printed before a question dialog (claude-code #67475) and Ctrl-O dismisses it (#65392), so a hand-off before a question is never seen')
  assert.match(s, /end the turn/,
    'Step 5 must end the turn after the block — the reply is the decision')
  for (const anchor of ['🎨', '🆕', '✅ approve', '✏️ change']) {
    assert.ok(s.includes(anchor),
      `Step 5 must print the ${anchor} line — without it the user has to ask which components to check and how to start the catalog at every design stop`)
  }
  assert.ok(!s.includes('🔗') && !s.includes('👀'),
    'Step 5 carries only the command and the story paths — deep links and gloss were cut on 2026-09-03 by user ruling (simplicity is the product bar)')
})

test('design.md Step 5 prints a copyable, navigable block: fenced command, one sidebar path per bound story, ℹ️ story-less changes, and the ↻ restart line', () => {
  const s = step5()
  assert.match(s, /```\n\s*<design\.command>\n\s*```/,
    'the catalog command must sit in a fenced code block — a bare indented line renders jammed against the 🆕 lines and cannot be copied (2026-09-03 field report)')
  assert.match(s, /🆕 <sidebar path of story/,
    'the 🆕 lines must be sidebar paths, one per bound story — a host that files every story under one title with localized story names cannot find a component name in the sidebar')
  assert.match(s, /<title> \/ <story name>/,
    'the sidebar path must be defined as title + story name so the derivation is mechanical')
  assert.match(s, /never per component/,
    'Step 5 must forbid per-component lines — the export name is not what the sidebar shows')
  assert.ok(s.includes('ℹ️'),
    'a component changed without a new story needs its own ℹ️ line pointing at the story that shows the change')
  assert.match(s, /↻ Storybook already running\? restart it so the sidebar re-indexes\./,
    'the ↻ restart line is fixed — a Storybook started before the run never shows the new stories')
})

test('design.md Step 5 derives every hand-off value from disk: the catalog command and the ledger story ids', () => {
  const s = step5()
  assert.match(s, /design\.command/,
    'the 🎨 line must name design.command — the user runs the catalog, the session never launches it')
  assert.match(s, /story ids/,
    'the 🆕 paths must be resolved from the coverage-ledger claim\'s story ids — otherwise the list is reconstructed from memory and drifts')
  assert.match(s, /never ask the user which components to check/,
    'Step 5 must forbid asking the user which components to check — that question is exactly the friction the hand-off block exists to remove')
})

// specs/20260905/02-design-review-hub-and-look-stops.md D9, AC-20260905-02-16/-17: every mock
// look stop (the mocks driver's five looks, /spec:sketch ratification, /spec:atlas) now opens a
// stop on the design review hub and prints exactly the verified link plus the fixed reply line —
// never a server command or a list of 🆕 names — then ends the turn; the shared doctrine splits
// the look-stop rule into "catalog stops" (Storybook, unchanged) and "mock stops" (the hub link).
// The Step 5 catalog assertions above are untouched — this replaces the old unified-rule pin.

test('AC-20260905-02-16: mocks.md carries the Look rule fenced hand-off block and chat-decide, sketch.md opens a hub stop and reads stop list, atlas.md prints the hub link — and none of the retired literals remain', () => {
  const mocks = read('spec/commands/mocks.md')
  assert.match(mocks, /## Look rule/, 'D9 renames "## SSH / look rule" to "## Look rule" — its absence means the section was never renamed')
  assert.ok(mocks.includes('stop open'), 'mocks.md must route every look through `stop open` — its absence means the driver hand-off still describes the retired server-command flow')
  assert.match(mocks, /🎨 ready for review — <url>\s*\n\s*Reply\s+✅ approve\s+— or —\s+✏️ change <what looks wrong>/,
    'the fenced block\'s two content lines must be exactly the D6 hand-off pattern — a caller pasting it must see the link and the fixed reply line, nothing else: ' + mocks)
  assert.ok(mocks.includes('end the turn'), 'mocks.md must instruct the session to end the turn after the block, per D9\'s hand-off contract')
  assert.ok(mocks.includes('stop decide') && mocks.includes('--by chat'), 'a chat reply must be recorded with `stop decide … --by chat`, never interpreted directly by the session')
  for (const retired of ['design-atlas)" serve', '🆕']) {
    assert.ok(!mocks.includes(retired), 'D9 retires the literal "' + retired + '" from mocks.md — its presence means the old server-command/name-list hand-off is still documented')
  }

  const sketch = read('spec/commands/sketch.md')
  assert.ok(sketch.includes('design-hub'), 'sketch.md\'s ratification step must name design-hub — its absence means the step still routes through a retired mechanism')
  assert.ok(sketch.includes('stop open'), 'sketch.md must open a hub stop for its ratification look, the same mechanism every other mock stop uses')
  assert.ok(sketch.includes('--key sketch:'), 'sketch.md\'s stop must be keyed "sketch:<brief>" — its absence means the stop-key convention D9 sets was never written down')
  assert.match(sketch, /🎨 ready for review — <url>\s*\n\s*Reply\s+✅ approve\s+— or —\s+✏️ change <what looks wrong>/,
    'sketch.md must print the same D6 fenced hand-off block as every other mock stop: ' + sketch)
  assert.ok(sketch.includes('end the turn'), 'sketch.md must end the turn after the block')
  assert.ok(sketch.includes('stop list'), 'sketch.md must read `stop list` on the next invocation to learn the ratification decision')
  assert.ok(!sketch.includes('open design/atlas/index.html'), 'D9: sketch.md must no longer tell the user to open the atlas file themselves — the hub serves it now')

  const atlas = read('spec/commands/atlas.md')
  assert.ok(atlas.includes('design-hub'), 'atlas.md step 3 must name design-hub — its absence means the step still tells the user to open a local file')
  assert.ok(atlas.includes('register'), 'atlas.md step 3 must register the project with the hub')
  assert.ok(atlas.includes('ensure'), 'atlas.md step 3 must ensure the hub is up before printing its link')
  assert.ok(atlas.includes('/atlas/index.html'), 'atlas.md step 3 must print the hub-served atlas path')
  assert.ok(!atlas.includes('design-atlas)" serve'), 'D9: atlas.md must drop the retired serve-command literal — the hub is the one long-lived server now')
  assert.ok(!atlas.includes('opens the file themselves'), 'D9: atlas.md must drop the retired "user opens the file themselves" instruction — the hub serves the atlas over one bookmarkable link')
})

test('AC-20260905-02-17: design.md § Design Atlas splits the look-stop rule into catalog stops and mock stops, and mocks.md gains ## Mocks: Review Hub plus a reworded Look and Serve', () => {
  const design = read('spec/doctrine/design.md')
  assert.ok(design.includes('catalog stops'), 'D9 splits the look-stop rule into "catalog stops" and "mock stops" — the catalog-stops clause must be named')
  assert.ok(design.includes('sidebar'), 'the catalog-stops clause must keep today\'s Storybook block, including the sidebar-path rule')
  assert.ok(design.includes('restart it so the sidebar re-indexes'), 'the catalog-stops clause must keep the fixed ↻ restart line verbatim')
  assert.ok(design.includes('mock stops'), 'D9 names "mock stops" as the second shape of the look-stop rule')
  assert.ok(design.includes('🎨 ready for review — <url>'), 'the mock-stops clause must show the D6 hand-off line')
  assert.ok(design.includes('end the turn'), 'the mock-stops clause must say the stop ends the turn')

  const mocks = read('spec/doctrine/mocks.md')
  assert.match(mocks, /## Mocks: Review Hub/, 'D9 adds a "## Mocks: Review Hub" heading — its absence means the hub mechanism (registry, ensure, /p/<name>/, the inbox) has no doctrine home')
  const hubSection = mocks.slice(mocks.indexOf('## Mocks: Review Hub'))
  for (const literal of ['registry.json', 'ensure', '/p/<name>/', '127.0.0.1', 'base', 'stop open']) {
    assert.ok(hubSection.includes(literal), '## Mocks: Review Hub must mention "' + literal + '" — its absence leaves a mechanism of the hub undocumented: ' + hubSection)
  }
  assert.ok(mocks.includes('hub link'), '§ Mocks: Look and Serve must say the user\'s path is the "hub link" — the serve command stays the session\'s own tool')
  assert.ok(mocks.includes('never printed to the user'), '§ Mocks: Look and Serve must state the serve command is never printed to the user')
})
