'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { execFileSync } = require('node:child_process')
const { read, ROOT } = require('./helpers')

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

// specs/20260905/04-per-project-look-server.md D4/D5, AC-20260905-04-6/-7: the machine-wide hub
// (specs/20260905/02) is retired — every mock look stop is served by that project's own
// `design-atlas.js serve`, started by the session as a tracked background task; `mocks.md` § Look
// rule, `sketch.md` step 5, and `atlas.md` step 3 all carry the session's own-tool serve sentence,
// and `design.md` § Design Atlas / `mocks.md` name the look link and lifetime instead of any hub
// mechanism. The Step 5 catalog assertions above are untouched — this replaces the old
// AC-20260905-02-16/-17 hub-link pins.

