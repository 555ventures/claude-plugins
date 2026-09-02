'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// Owner: spec/commands/design.md § Step 5 — Your look. Pins the human hand-off block (🎨 🔗 🆕 👀)
// that the design stage prints before its approve/change question.

function step5() {
  const doc = read('spec/commands/design.md')
  const start = doc.indexOf('## Step 5')
  const end = doc.indexOf('## Step 6')
  assert.ok(start > -1 && end > start,
    'design.md must keep a "## Step 5" section followed by "## Step 6" — without the human-look step the loop never stops for the catalog look')
  return doc.slice(start, end)
}

test('design.md Step 5 prints the four-anchor hand-off block (🎨 run, 🔗 per-story navigation, 🆕 changed components, 👀 what to look for) before the approve/change question', () => {
  const s = step5()
  const ask = s.indexOf('AskUserQuestion')
  assert.ok(ask > -1, 'Step 5 must end in an AskUserQuestion — otherwise the look is not a blocking stop')
  for (const anchor of ['🎨', '🔗', '🆕', '👀']) {
    const at = s.indexOf(anchor)
    assert.ok(at > -1 && at < ask,
      `Step 5 must print the ${anchor} line before AskUserQuestion — without it the user has to ask which components to check and how to reach them at every design stop`)
  }
})

test('design.md Step 5 derives every hand-off value from disk: the catalog command, the ledger story ids, the render URL template, and the gate report path', () => {
  const s = step5()
  assert.match(s, /design\.command/,
    'the 🎨 line must name design.command — the user runs the catalog, the session never launches it')
  assert.match(s, /story ids/,
    'the 🔗 lines must come from the coverage-ledger claim\'s story ids — otherwise the navigation list is reconstructed from memory and drifts')
  assert.match(s, /design\.render\.url[\s\S]{0,80}\{story\}/,
    'deep links must be derived from design.render.url\'s {story} placeholder — a hand-off without derivable deep links makes the user search the catalog by hand')
  assert.match(s, /gate report/,
    'the hand-off must name the gate report path — the render gate\'s findings are the evidence the look sits on')
  assert.match(s, /never ask the user which components to check/,
    'Step 5 must forbid asking the user which components to check — that question is exactly the friction the hand-off block exists to remove')
})
