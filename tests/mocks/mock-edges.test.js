'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, SPEC } = require('../helpers')
const {
  JOURNEY, mark, statusJson, writeWireframe, advanceToCanonWritten, advanceToJourneyApproved,
} = require('./mocks-driver-fixtures')

// specs/20260910/02-click-to-advance-and-real-records.md D1/D2/D6: TDD red — spec/scripts/lib/
// mock-seed-checks.js does not exist yet and mocks-driver.js's journey-drawn does not run its
// edgeGaps check yet, so every AC below (except AC-6/-7, which pin the fixtures repair itself)
// is red until the scripts wave lands. AC-20260910-02-1, -2, -6, -7.

function edgeGapsLib() {
  const libPath = path.join(SPEC, 'scripts/lib/mock-seed-checks.js')
  assert.ok(fs.existsSync(libPath),
    'AC-1 requires spec/scripts/lib/mock-seed-checks.js to exist, exporting edgeGaps(journey, readHtml) — not found at ' + libPath)
  delete require.cache[libPath]
  return require(libPath)
}

// ---------------------------------------------------------------------------
// AC-20260910-02-1
// ---------------------------------------------------------------------------
test('AC-20260910-02-1: edgeGaps({labels,edges}, readHtml) returns a missing entry for an edge whose "from" mock carries no matching data-to and an unknown entry for a data-to naming an undeclared label, returns {missing:[],unknown:[]} once every edge is covered, and never counts a data-to sitting outside the [data-screen-label] root', () => {
  const { edgeGaps } = edgeGapsLib()
  const journey = { labels: ['a', 'b', 'c'], edges: [['a', 'b'], ['b', 'c']] }

  const gapped = edgeGaps(journey, (label) => ({
    a: '<main data-screen-label="a"><button data-to="b">Go</button><a data-to="zzz">Nowhere</a></main>',
    b: '<main data-screen-label="b">no control here</main>',
    c: '<main data-screen-label="c">terminal</main>',
  }[label]))
  assert.deepStrictEqual(gapped, { missing: [{ from: 'b', to: 'c' }], unknown: [{ from: 'a', to: 'zzz' }] },
    'AC-1: b.html carries no data-to="c" (a missing entry for edge b->c) and a.html\'s data-to="zzz" names an undeclared label (an unknown entry) — a.html\'s own data-to="b" must NOT also appear as missing since it correctly covers a->b: got ' + JSON.stringify(gapped))

  const covered = edgeGaps(journey, (label) => ({
    a: '<main data-screen-label="a"><button data-to="b">Go</button></main>',
    b: '<main data-screen-label="b"><button data-to="c">Go</button></main>',
    c: '<main data-screen-label="c">terminal</main>',
  }[label]))
  assert.deepStrictEqual(covered, { missing: [], unknown: [] },
    'AC-1: once every seed edge has a matching data-to control and no data-to names an undeclared label, edgeGaps must return {missing:[],unknown:[]}: got ' + JSON.stringify(covered))

  const outsideRoot = edgeGaps(journey, (label) => ({
    a: '<main data-screen-label="a">no control here</main><button data-to="b">Go</button>',
    b: '<main data-screen-label="b"><button data-to="c">Go</button></main>',
    c: '<main data-screen-label="c">terminal</main>',
  }[label]))
  assert.deepStrictEqual(outsideRoot, { missing: [{ from: 'a', to: 'b' }], unknown: [] },
    'AC-1: a data-to sitting AFTER the [data-screen-label] root closes must count as absent, not as covering the edge — a control outside the labeled screen is not part of that screen: got ' + JSON.stringify(outsideRoot))
})

// ---------------------------------------------------------------------------
// AC-20260910-02-2
// ---------------------------------------------------------------------------
test('AC-20260910-02-2: `--mark journey-drawn --journey onboarding` refuses naming the missing-control remedy when signin.html carries no data-to="invite", refuses naming the undeclared-screen fault when it carries data-to="nowhere", and accepts once it carries data-to="invite" — a refusal never records journeys.onboarding.drawn', () => {
  const dir = tmpdir('mock-edges')
  advanceToCanonWritten(dir)
  // Every OTHER screen's edge is covered so the refusal below can only be about signin->invite.
  writeWireframe(dir, 'signin') // deliberately no data-to
  writeWireframe(dir, 'invite', { to: 'consent' })
  writeWireframe(dir, 'consent', { to: 'session-live' })
  writeWireframe(dir, 'session-live') // terminal screen, no outgoing edge

  const missing = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(missing.status, 2,
    'AC-2: journey-drawn must refuse (exit 2) when the seed edge signin -> invite has no matching data-to control: ' + missing.stdout + missing.stderr)
  assert.match(missing.stderr + missing.stdout, /signin\.html: no control carries data-to="invite"/,
    'AC-2: the refusal must carry the exact D2 message naming signin.html and the missing data-to="invite": ' + missing.stdout + missing.stderr)
  assert.match(missing.stderr + missing.stdout, /re-mark journey-drawn --journey onboarding/,
    'AC-2: the refusal must carry the exact re-mark remedy command: ' + missing.stdout + missing.stderr)
  const afterMissing = statusJson(dir).journeys
  assert.strictEqual(afterMissing === undefined || afterMissing[JOURNEY] === undefined || afterMissing[JOURNEY].drawn == null, true,
    'AC-2: a refusal on a missing edge control must never record journeys.onboarding.drawn: ' + JSON.stringify(afterMissing))

  writeWireframe(dir, 'signin', { to: 'nowhere' })
  const unknown = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(unknown.status, 2,
    'AC-2: journey-drawn must refuse (exit 2) when signin.html carries data-to="nowhere", a label no journey declares: ' + unknown.stdout + unknown.stderr)
  assert.match(unknown.stderr + unknown.stdout, /data-to="nowhere" names a screen no journey declares/,
    'AC-2: the refusal must carry the exact D2 unknown-label message: ' + unknown.stdout + unknown.stderr)
  const afterUnknown = statusJson(dir).journeys
  assert.strictEqual(afterUnknown === undefined || afterUnknown[JOURNEY] === undefined || afterUnknown[JOURNEY].drawn == null, true,
    'AC-2: a refusal on an unknown data-to label must never record journeys.onboarding.drawn: ' + JSON.stringify(afterUnknown))

  writeWireframe(dir, 'signin', { to: 'invite' })
  const accepted = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(accepted.status, 0,
    'AC-2: journey-drawn must accept once signin.html carries data-to="invite" and every other edge is covered: ' + accepted.stdout + accepted.stderr)
  assert.strictEqual(statusJson(dir).journeys[JOURNEY].drawn !== null, true,
    'AC-2: an accepted journey-drawn must record journeys.onboarding.drawn')
})

// ---------------------------------------------------------------------------
// AC-20260910-02-6
// ---------------------------------------------------------------------------
test('AC-20260910-02-6: writeWireframe(dir, "signin", {to:"invite"}) writes a mock whose [data-screen-label="signin"] root carries data-to="invite"', () => {
  const dir = tmpdir('mock-edges')
  writeWireframe(dir, 'signin', { to: 'invite' })
  const html = fs.readFileSync(path.join(dir, 'design/mocks/signin.html'), 'utf8')
  assert.match(html, /data-to="invite"/,
    'AC-6: writeWireframe(dir, "signin", {to:"invite"}) must write a mock whose root carries data-to="invite" — every advanceTo* helper\'s edge repair depends on this: got ' + html)
})

// ---------------------------------------------------------------------------
// AC-20260910-02-7
// ---------------------------------------------------------------------------
test('AC-20260910-02-7: the fixtures\' advanceToJourneyApproved CONTINUES TO accept journey-drawn and journey-approved over the default fixture journey now that every screen carries its D6 data-to control', () => {
  const dir = tmpdir('mock-edges')
  const approved = advanceToJourneyApproved(dir)
  assert.strictEqual(approved.status, 0,
    'AC-7: advanceToJourneyApproved must CONTINUE TO accept journey-approved over the default fixture journey: ' + approved.stdout + approved.stderr)
  const journeyRecord = statusJson(dir).journeys[JOURNEY]
  assert.ok(journeyRecord && journeyRecord.drawn,
    'AC-7: journey-drawn must CONTINUE TO be recorded over the default fixture journey: ' + JSON.stringify(journeyRecord))
  assert.ok(journeyRecord && journeyRecord.approved,
    'AC-7: journey-approved must CONTINUE TO be recorded over the default fixture journey: ' + JSON.stringify(journeyRecord))
})
