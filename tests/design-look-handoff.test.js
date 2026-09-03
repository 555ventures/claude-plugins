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

test('every human look stop prints the block and ends the turn: sketch ratification, mocks approvals, and the core rule they cite', () => {
  const shared = read('spec/doctrine/design.md')
  assert.match(shared, /Look stops are never questions/, 'shared § Design Atlas must carry the look-stop rule the commands cite')
  assert.match(shared, /fenced code block/, 'the shared rule must require the fenced command — every look stop inherits the formatting')
  assert.match(shared, /sidebar\s+path/, 'the shared rule must define catalog 🆕 lines as sidebar paths, never component names')
  assert.match(shared, /restart it so the sidebar re-indexes/, 'the shared rule must carry the fixed ↻ restart line')
  const sketch = read('spec/commands/sketch.md')
  assert.ok(sketch.includes('✅ approve') && sketch.includes('end the turn'), 'sketch.md step 6 must print the block and end the turn instead of asking')
  const mocks = read('spec/commands/mocks.md')
  assert.ok(mocks.includes('✅ approve') && mocks.includes('ends the turn'), 'mocks.md look rule must print the block and end the turn for every approval mark')
})
