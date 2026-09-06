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

test('AC-20260905-04-6: mocks.md, sketch.md, and atlas.md each carry the tracked-background-task serve sentence, their own D4/D5 literals, and none of the retired hub literals', () => {
  const mocks = read('spec/commands/mocks.md')
  const sketch = read('spec/commands/sketch.md')
  const atlas = read('spec/commands/atlas.md')

  for (const [name, doc] of [['mocks.md', mocks], ['sketch.md', sketch], ['atlas.md', atlas]]) {
    assert.ok(doc.includes('tracked background task'),
      name + ' must call the session-started serve command a "tracked background task" — its absence means the D4 lifetime rule was never written into this command')
    assert.match(doc, /spec-paths design-atlas\)" serve/,
      name + ' must show the exact `spec-paths design-atlas)" serve` invocation — its absence means this command never tells the session which server to start')
    for (const retired of ['design-hub', 'register', 'ensure', '/p/<name>/', 'hub']) {
      assert.ok(!doc.toLowerCase().includes(retired.toLowerCase()),
        'D5 retires "' + retired + '" from ' + name + ' — its presence means the deleted machine-wide hub is still documented here')
    }
  }

  assert.match(mocks, /## Look rule/, 'mocks.md must keep the "## Look rule" section — its absence means the look-stop rule has no home')
  assert.match(mocks, /🎨 ready for review — <url>\s*\n\s*Reply\s+✅ approve\s+— or —\s+✏️ change <what looks wrong>/,
    'mocks.md § Look rule must show the fenced two-line D2 hand-off block — the link and the fixed reply line, nothing else: ' + mocks)
  assert.ok(mocks.includes('end the turn'), 'mocks.md must instruct the session to end the turn after the hand-off block')
  assert.ok(mocks.includes('stop decide') && mocks.includes('--by chat'), 'a chat reply must be recorded with `stop decide … --by chat`, never interpreted directly by the session')
  assert.ok(mocks.includes('served atlas page'), 'mocks.md § Look rule must call the user\'s path the "served atlas page" — its absence means the D5 wording for the look-stop rule was never applied')

  assert.match(sketch, /design-atlas\)" stop open/, 'sketch.md step 5 must open its ratification stop through `design-atlas)" stop open` — its absence means the step still routes through a retired mechanism')
  assert.ok(sketch.includes('--key sketch:'), 'sketch.md\'s stop must be keyed "sketch:<brief>" — its absence means the stop-key convention was never written down')
  assert.ok(sketch.includes('stop list'), 'sketch.md must read `stop list` on the next invocation to learn the ratification decision')
  assert.match(sketch, /🎨 ready for review — <url>\s*\n\s*Reply\s+✅ approve\s+— or —\s+✏️ change <what looks wrong>/,
    'sketch.md must print the same fenced hand-off block as every other mock stop: ' + sketch)

  assert.ok(atlas.includes('🎨 http://localhost:<port>/atlas/index.html'), 'atlas.md step 3 must print the exact D5 served-atlas line, the URL from serve\'s own first stdout line')
  assert.ok(!atlas.includes('open design/atlas/index.html'), 'atlas.md step 3 must never tell the user to open the atlas file themselves — the session\'s own serve command serves it now')
})

test('AC-20260905-04-7: design.md § Design Atlas keeps catalog stops and names mock stops off the look server, and mocks.md drops ## Mocks: Review Hub for a reworded look-and-serve section', () => {
  const design = read('spec/doctrine/design.md')
  assert.ok(design.includes('catalog stops'), 'design.md § Design Atlas must name "catalog stops" as the first shape of the look-stop rule')
  assert.ok(design.includes('sidebar'), 'the catalog-stops clause must keep today\'s Storybook block, including the sidebar-path rule')
  assert.ok(design.includes('restart it so the sidebar re-indexes'), 'the catalog-stops clause must keep the fixed ↻ restart line verbatim')
  assert.ok(design.includes('mock stops'), 'design.md § Design Atlas must name "mock stops" as the second shape of the look-stop rule')
  assert.ok(design.includes('🎨 ready for review — <url>'), 'the mock-stops clause must show the D2 hand-off line')
  assert.ok(design.includes('end the turn'), 'the mock-stops clause must say the stop ends the turn')
  assert.ok(design.includes('served atlas page'), 'the mock-stops clause must call the user\'s path the "served atlas page"')
  assert.ok(!design.toLowerCase().includes('hub'), 'design.md § Design Atlas must mention no "hub" — the deleted machine-wide hub has no doctrine home left here: ' + design)

  const mocks = read('spec/doctrine/mocks.md')
  assert.ok(!mocks.includes('## Mocks: Review Hub'), 'mocks.md must drop the "## Mocks: Review Hub" heading — its presence means the deleted hub mechanism is still documented')
  assert.ok(!mocks.toLowerCase().includes('hub'), 'mocks.md must mention no "hub" anywhere — the deleted machine-wide hub has no doctrine home left: ' + mocks)
  assert.match(mocks, /## Mocks: Look and Serve/, 'mocks.md must keep the "## Mocks: Look and Serve" heading')
  const lookAndServe = mocks.slice(mocks.indexOf('## Mocks: Look and Serve'))
  for (const literal of ['look link', 'tracked background task', 'never printed to the user', 'already serving']) {
    assert.ok(lookAndServe.includes(literal), '§ Mocks: Look and Serve must mention "' + literal + '" — its absence leaves the D4 lifetime rule incompletely documented: ' + lookAndServe)
  }
})

// AC-20260905-04-1: repo-wide sweep — the retired hub surface (its env var and its name) must
// appear nowhere in commands, doctrine, canonical docs, or pipeline rules, except a documented
// absence-pin assertion string inside tests/ (this file's own pins above, and spec-paths.test.js's
// refusal pin) or the one plugin.json changelog entry that narrates the hub's own introduction,
// which is a changelog and is never rewritten.
test('AC-20260905-04-1: grep -rn "SPEC_DESIGN_HUB|design-hub" over spec/, tests/, docs/canonical/, and .claude/rules/ matches nothing outside a tests/ absence pin or the historical changelog line', () => {
  let out = ''
  try {
    out = execFileSync('grep', ['-rn', 'SPEC_DESIGN_HUB\\|design-hub', 'spec/', 'tests/', 'docs/canonical/', '.claude/rules/'],
      { cwd: ROOT, encoding: 'utf8' })
  } catch (e) {
    if (e.status === 1) out = '' // grep exit 1 == no matches anywhere
    else throw e
  }
  const offenders = out.split('\n').filter(Boolean).filter((line) => {
    if (line.startsWith('tests/')) return false // absence-pin assertion strings inside tests/ are sanctioned
    if (line.startsWith('spec/.claude-plugin/plugin.json:') && line.includes('7.83.0')) return false // history, never rewritten
    return true
  })
  assert.deepStrictEqual(offenders, [],
    'D1: no command, doctrine, canonical, script, or rules file may mention the retired hub surface outside a tests/ absence pin or the 7.83.0 changelog line — the deleted machine-wide hub must leave no live reference behind: ' + JSON.stringify(offenders, null, 2))
})
