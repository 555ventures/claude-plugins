'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { ROOT, tmpdir, runNode } = require('../helpers')
const {
  SCRIPT, JOURNEY, bare, mark, writeWireframe, writeNotesFile, readNotesFile,
  patchStatus, statusJson, advanceToJourneyApproved,
} = require('./mocks-driver-fixtures')
const walkLib = require('../../spec/scripts/lib/mocks-walk')

// specs/20260913/07-the-critic-is-out.md D1-D6/D11/D12: the WALK state, its mark, its reopen
// target and the critic agent's two dispatch sites are deleted outright.
// AC-20260913-07-1, -2, -3, -4, -5, -6, -7, -22, -23.

function walkJsonPath(dir) { return path.join(dir, 'design/mocks/walk.json') }
function readWalkJson(dir) { return JSON.parse(fs.readFileSync(walkJsonPath(dir), 'utf8')) }

test('AC-20260913-07-1: once every declared journey on a host is marked journey-approved, the bare step command derives THEME and prints a step block containing THEME but neither the whole uppercase word WALK nor "design-critic"', () => {
  const dir = tmpdir('ac1-theme-derive')
  advanceToJourneyApproved(dir)
  // Bypass the look-reachability probe (AUTHORING_STATES gates THEME on it) — this test is about
  // the derived state and its printed step block, not about a real Playwright/browser install.
  patchStatus(dir, { look: 'browser' })
  const r = bare(dir)
  assert.strictEqual(r.status, 0,
    'the bare step command must exit 0 once every declared journey is approved: ' + r.stderr)
  assert.match(r.stdout, /THEME/,
    'the printed step block must name the derived state THEME: got ' + JSON.stringify(r.stdout))
  assert.doesNotMatch(r.stdout, /(?<![\w-])WALK(?![\w-])/,
    'the printed step block must contain no whole uppercase word WALK — the state that ' +
    'produced it no longer exists: got ' + JSON.stringify(r.stdout))
  assert.doesNotMatch(r.stdout, /design-critic/,
    'the printed step block must never dispatch or mention the retired design-critic agent: got ' + JSON.stringify(r.stdout))
})

test('AC-20260913-07-2: --mark journey-walked --journey j1 exits 2 and prints the unknown-mark refusal enumerating exactly the eight surviving marks', () => {
  const dir = tmpdir('ac2-mark-retired')
  // A declared, already-approved journey with no open finding is exactly the shape the pre-image
  // still ACCEPTS journey-walked over — isolating the assertion to "this mark no longer exists"
  // rather than any unrelated per-mark precondition.
  advanceToJourneyApproved(dir)
  const r = mark(dir, 'journey-walked', ['--journey', JOURNEY])
  assert.strictEqual(r.status, 2,
    'a retired mark name must be refused, exit 2: got status ' + r.status)
  assert.strictEqual(r.stderr,
    'mocks-driver: unknown mark "journey-walked" — one of: seed-done, shape-picked, canon-written, ' +
    'kit-signed, journey-drawn, journey-approved, theme-picked, approved\n',
    'the refusal must enumerate exactly the eight surviving marks, journey-walked absent: got ' + JSON.stringify(r.stderr))
})

test('AC-20260913-07-3: --reopen walk:j1 exits 2 and prints the narrowed --reopen refusal with no walk: target', () => {
  const dir = tmpdir('ac3-reopen-retired')
  bare(dir) // cold-root creation
  const r = runNode(SCRIPT, ['--root', dir, '--reopen', 'walk:j1'])
  assert.strictEqual(r.status, 2,
    '--reopen walk:<j> must be refused, exit 2: got status ' + r.status)
  assert.strictEqual(r.stderr, 'mocks-driver: --reopen must be journey:<j>, shapes, kit, or theme\n',
    'the refusal must name exactly the four surviving targets, walk:<j> absent: got ' + JSON.stringify(r.stderr))
})

// AC-4 is a SHALL CONTINUE TO pin (sanctioned pin exception, green pre-change): D3's Rationale is
// explicit that the walkLib.unconfirmJourney write on walk.json "stays exactly as it is" — this
// proves that continuity by executing the real reopen over a client-confirmed journey.
test('AC-20260913-07-4 (SHALL CONTINUE TO, green pre-change): --reopen journey:j1 on a host whose walk.json records j1 confirmed by the client still clears that journey\'s own approval, the product approved mark, and writes walk.json with j1\'s client confirmation taken back', () => {
  const dir = tmpdir('ac4-reopen-continue')
  advanceToJourneyApproved(dir)
  let walk = walkLib.readWalk(dir)
  walk = walkLib.confirmJourney(walk, { journey: JOURNEY, sentence: 'walked it end to end', at: new Date().toISOString() })
  walkLib.writeWalk(dir, walk)
  patchStatus(dir, { marks: Object.assign({}, statusJson(dir).marks, { approved: '2026-01-01T00:00:00.000Z' }) })
  const before = readWalkJson(dir)
  assert.strictEqual(before.journeys[JOURNEY].confirmedAt != null, true,
    'test setup requires walk.json to record a real client confirmation before the reopen runs')

  const r = runNode(SCRIPT, ['--root', dir, '--reopen', 'journey:' + JOURNEY])
  assert.strictEqual(r.status, 0, '--reopen journey:<j> must still be accepted: ' + r.stderr)

  const status = statusJson(dir)
  assert.strictEqual(status.journeys[JOURNEY].approved, null,
    "the reopened journey's own approval must still be cleared: got " + JSON.stringify(status.journeys[JOURNEY]))
  assert.strictEqual(status.marks.approved, null,
    'the product approved mark must still be cleared: got ' + JSON.stringify(status.marks))
  const after = readWalkJson(dir)
  assert.strictEqual(after.journeys[JOURNEY].confirmedAt, null,
    "walk.json must still record j1's client confirmation taken back (confirmedAt null): got " + JSON.stringify(after.journeys[JOURNEY]))
})

test('AC-20260913-07-5: --reopen journey:<j> and --reopen shapes print their invalidated lists with no mention of walk anywhere', () => {
  const dir = tmpdir('ac5-reopen-lines')
  advanceToJourneyApproved(dir)
  const rJourney = runNode(SCRIPT, ['--root', dir, '--reopen', 'journey:' + JOURNEY])
  assert.strictEqual(rJourney.status, 0, '--reopen journey:<j> must be accepted: ' + rJourney.stderr)
  assert.strictEqual(rJourney.stdout, '↩ reopened journey:' + JOURNEY + ' — invalidated: approved, approved(all)\n',
    'the printed invalidated line must be exactly "approved, approved(all)", with no walk clause: got ' + JSON.stringify(rJourney.stdout))
  assert.doesNotMatch(rJourney.stdout, /walk/i,
    'the journey: reopen line must mention walk nowhere at all: got ' + JSON.stringify(rJourney.stdout))

  const dir2 = tmpdir('ac5-reopen-shapes')
  advanceToJourneyApproved(dir2)
  const rShapes = runNode(SCRIPT, ['--root', dir2, '--reopen', 'shapes'])
  assert.strictEqual(rShapes.status, 0, '--reopen shapes must be accepted: ' + rShapes.stderr)
  assert.strictEqual(rShapes.stdout, '↩ reopened shapes — invalidated: shape, canon, kit, journeys(all), approved(all)\n',
    'the printed invalidated line must be exactly "shape, canon, kit, journeys(all), approved(all)", with no walk(all) clause: got ' + JSON.stringify(rShapes.stdout))
  assert.doesNotMatch(rShapes.stdout, /walk/i,
    'the shapes reopen line must mention walk nowhere at all: got ' + JSON.stringify(rShapes.stdout))
})

test('AC-20260913-07-6: the repo carries no spec/agents/design-critic.md, spec/commands/mocks.md carries no "Walk (WALK state)" heading, and spec/commands/sketch.md\'s Critique step sits before its Exit step naming check --states and render-gate but naming neither design-critic nor --kind walk', () => {
  const criticAgentPath = path.join(ROOT, 'spec/agents/design-critic.md')
  assert.strictEqual(fs.existsSync(criticAgentPath), false,
    'spec/agents/design-critic.md must not exist — the critic agent is deleted: it still exists pre-change')

  const mocksMd = fs.readFileSync(path.join(ROOT, 'spec/commands/mocks.md'), 'utf8')
  assert.doesNotMatch(mocksMd, /^##.*Walk \(WALK state\)/m,
    'spec/commands/mocks.md must carry no heading whose text contains "Walk (WALK state)": got a match')

  const sketchMd = fs.readFileSync(path.join(ROOT, 'spec/commands/sketch.md'), 'utf8')
  const critiqueIx = sketchMd.search(/^\d+\.\s*\*\*Critique/m)
  const exitIx = sketchMd.search(/^\d+\.\s*\*\*Exit/m)
  assert.ok(critiqueIx !== -1, 'spec/commands/sketch.md must carry a step whose heading contains "Critique": found none')
  assert.ok(exitIx !== -1, 'spec/commands/sketch.md must carry a step whose heading contains "Exit": found none')
  assert.ok(critiqueIx < exitIx,
    'the Critique step must be positioned before the Exit step: got critique@' + critiqueIx + ' exit@' + exitIx)
  const critiqueStep = sketchMd.slice(critiqueIx, exitIx)
  assert.match(critiqueStep, /check --states/, 'the Critique step must still name `check --states`: got\n' + critiqueStep)
  assert.match(critiqueStep, /render-gate/, 'the Critique step must still name `render-gate`: got\n' + critiqueStep)
  assert.doesNotMatch(critiqueStep, /design-critic/,
    'the Critique step must no longer name design-critic: got\n' + critiqueStep)
  assert.doesNotMatch(critiqueStep, /--kind walk/,
    'the Critique step must no longer name --kind walk: got\n' + critiqueStep)
})

test('AC-20260913-07-7: notes add --kind walk on a host whose screen declares the named state exits 2, prints the retired-kind refusal, and appends no note to notes.json', () => {
  const dir = tmpdir('ac7-notes-add-retired')
  bare(dir) // cold-root creation
  writeWireframe(dir, 'a', { states: ['empty', 'loading', 'error'] })
  writeNotesFile(dir, [])
  const before = readNotesFile(dir)
  const r = runNode(SCRIPT, ['--root', dir, 'notes', 'add', '--scope', 'mock', '--screen', 'a',
    '--state', 'error', '--kind', 'walk', '--reason', 'dead-end-state', '--by', 'walk-critic', '--text', 'x'])
  assert.strictEqual(r.status, 2, 'notes add --kind walk must be refused, exit 2: got status ' + r.status)
  assert.strictEqual(r.stderr, 'mocks-driver: notes add: --kind and --ledger-id are retired — a note is what a person typed\n',
    'the refusal must print the exact retired-kind message: got ' + JSON.stringify(r.stderr))
  assert.deepStrictEqual(readNotesFile(dir), before,
    'no note may be appended to design/mocks/notes.json on a refused notes add: got ' + JSON.stringify(readNotesFile(dir)))
})

function extractSection(src, heading) {
  const re = new RegExp('## ' + heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\n+([\\s\\S]*?)(?:\\n## |$)')
  const m = re.exec(src)
  return m ? m[1] : null
}

test('AC-20260913-07-23: docs/adr/0023-the-critic-is-out.md exists, parses with Status: accepted, a non-empty ## Dissents section, and an ## Applies to section naming all seven amended documents', () => {
  const p = path.join(ROOT, 'docs/adr/0023-the-critic-is-out.md')
  assert.strictEqual(fs.existsSync(p), true,
    'docs/adr/0023-the-critic-is-out.md must exist — this spec\'s D11 creates it: it does not exist pre-change')
  const src = fs.readFileSync(p, 'utf8')
  assert.match(src, /Status:\s*accepted/, 'the ADR must declare Status: accepted: got\n' + src)
  const dissents = extractSection(src, 'Dissents')
  assert.ok(dissents && dissents.trim().length > 0,
    'the ADR must carry a non-empty ## Dissents section: got ' + JSON.stringify(dissents))
  const applies = extractSection(src, 'Applies to')
  assert.ok(applies, 'the ADR must carry an ## Applies to section: got none')
  const docs = [
    'specs/20260907/08-walk-critic.md',
    'specs/20260906/06-sketch-high-fidelity-and-critique.md',
    'docs/adr/0010-kit-walk-and-client-review.md',
    'specs/20260906/03-questions-on-the-wireframe.md',
    'specs/20260906/04-journey-review-page.md',
    'specs/20260912/06-the-review-page-answers-to-a-design.md',
    'docs/adr/0019-a-whole-product-note-blocks-the-sign-off.md',
  ]
  for (const doc of docs) {
    assert.match(applies, new RegExp(doc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      'the ## Applies to section must name ' + doc + ': got\n' + applies)
  }
})

test('AC-20260913-07-22: every git-tracked file under spec/, tests/, scripts/ and design/, except this sweep\'s own file, carries zero occurrences of any retired critic/question literal, each matched with a boundary that treats "-" as part of the word', () => {
  const listing = execFileSync('git', ['ls-files', '-z', 'spec', 'tests', 'scripts', 'design'], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  })
  const tracked = listing.split('\x00').filter(Boolean)
  assert.ok(tracked.length > 0,
    'git ls-files returned zero tracked files under spec/tests/scripts/design — this pin scanned nothing')
  const selfPath = path.relative(ROOT, __filename).split(path.sep).join('/')

  const literals = [
    'journey-walked', 'WALK_REASONS', 'openWalkFindingsFor', 'allJourneysWalked', 'walkedCount',
    'printWalkStep', 'design-critic', 'walk-critic', 'walk(all)', 'answerQuestion', 'joinQuestions',
    'renderQuestionRow', 'questionRow', 'questionLines', 'journeyQuestionCounts', 'refuseUnaskable',
    'LEDGER_ID_RE', '__notes/answer', 'isOpenQuestion', 'claimOf', 'renderMark', 'data-guesses',
    'rv-progress', 'rv-track', 'rv-fill', 'rv-correct', 'rv-chips', 'rv-chipbtn', 'rv-chip-on',
    'nl-chips', 'nl-chip', 'nl-chip-on', 'wk-mark', 'wk-claim', 'wk-left', 'WALK',
  ]
  const literalRes = literals.map((lit) => ({
    lit, re: new RegExp('(?<![\\w-])' + lit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])'),
  }))

  const offenders = []
  for (const rel of tracked) {
    if (rel === selfPath) continue
    let buf
    try { buf = fs.readFileSync(path.join(ROOT, rel), 'utf8') } catch { continue }
    for (const { lit, re } of literalRes) {
      if (re.test(buf)) offenders.push(rel + ': ' + lit)
    }
  }

  assert.deepStrictEqual(offenders, [],
    'the following tracked file(s) still carry a retired critic/question literal — every ' +
    'producer and its dispatch sites must be fully deleted, not merely disconnected: ' + JSON.stringify(offenders, null, 2))
})
