'use strict'
const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { SPEC } = require('../helpers')

// specs/20260917/01-the-client-confirms-the-story.md D2, AC-20260917-01-1, AC-20260917-01-2,
// AC-20260917-01-3, AC-20260917-01-12: lib/surfaces.js's first unit test — the seed's beat
// grammar's one parser (beats/malformed/labels/edges on parseSeedJourneys), its export surface,
// and beatHash's canonical sha256-over-beats hash.

const libPath = path.join(SPEC, 'scripts/lib/surfaces.js')

test('AC-20260917-01-1: parseSeedJourneys returns the exact Contracts value for the pinned seed block, and one fewer edge when two consecutive beats share a screen', () => {
  const surfaces = require(libPath)
  const text = '### first-visit\n' +
    "Ann (a new patient's daughter) is invited by email, signs in, and lands on her mother's care plan.\n" +
    '1. "I open the app" -> home\n' +
    '2. "I tap Sign in" -> login@empty\n' +
    '3. "I see Mum\'s care plan" -> care-plan\n'
  const journeys = surfaces.parseSeedJourneys(text)
  const j = journeys.get('first-visit')
  assert.ok(j, 'parseSeedJourneys must return a journey for the ### first-visit block, or every later mark has nothing to read: ' + JSON.stringify([...journeys.keys()]))
  assert.deepStrictEqual(j.beats, [
    { n: 1, beat: 'I open the app', screen: 'home', state: null },
    { n: 2, beat: 'I tap Sign in', screen: 'login', state: 'empty' },
    { n: 3, beat: "I see Mum's care plan", screen: 'care-plan', state: null },
  ], 'beats must be returned in order with state: null where @state is absent, exactly as the Contracts block pins: ' + JSON.stringify(j.beats))
  assert.deepStrictEqual(j.malformed, [], 'a well-formed block must report no malformed lines: ' + JSON.stringify(j.malformed))
  assert.deepStrictEqual(j.labels, ['home', 'login', 'care-plan'], 'labels must be the screen targets deduplicated in beat order — genesis reads this field directly: ' + JSON.stringify(j.labels))
  assert.deepStrictEqual(j.edges, [['home', 'login'], ['login', 'care-plan']], 'edges must be every consecutive beat pair whose screens differ: ' + JSON.stringify(j.edges))

  const sharedText = '### first-visit\nAnn opens the app.\n' +
    '1. "I open the app" -> home\n' +
    '2. "I tap Sign in" -> login@empty\n' +
    '3. "I see the login form" -> login\n'
  const shared = surfaces.parseSeedJourneys(sharedText).get('first-visit')
  assert.deepStrictEqual(shared.edges, [['home', 'login']],
    'two consecutive beats sharing a screen must produce one edge fewer than the beat count — a same-screen pair is never a navigation: ' + JSON.stringify(shared.edges))
})

test('AC-20260917-01-2: a non-beat body line is listed in malformed while the surrounding beats still parse, a numbering gap reports the exact "numbering: expected N, got M" string, and two journeys sharing the identical beat sentence both parse clean', () => {
  const surfaces = require(libPath)
  const text = '### messy\nAnn opens the app.\n' +
    '1. I open the app -> home\n' +
    '2. "I tap Sign in" -> login@empty\n' +
    '```surfaces\n' +
    '```\n' +
    '3. "I see the plan" -> care-plan\n'
  const j = surfaces.parseSeedJourneys(text).get('messy')
  assert.ok(j, 'the messy journey must still be returned even with malformed lines present in its body: ' + JSON.stringify(j))
  assert.ok(j.malformed.some((m) => m.includes('I open the app -> home')),
    'an unquoted beat line (`1. I open the app -> home`) must be listed in malformed, or a session cannot tell why its beats never landed: ' + JSON.stringify(j.malformed))
  assert.ok(j.malformed.some((m) => m.includes('```surfaces')),
    'a retired ```surfaces fence line must be listed in malformed, or a seed carrying the old grammar parses silently into zero beats with no diagnostic: ' + JSON.stringify(j.malformed))
  assert.deepStrictEqual(j.beats.map((b) => b.beat), ['I tap Sign in', 'I see the plan'],
    'the lines that DID match the beat grammar must still be returned despite the malformed lines around them: ' + JSON.stringify(j.beats))

  const gapText = '### gappy\nAnn opens the app.\n1. "I open the app" -> home\n3. "I see the plan" -> care-plan\n'
  const gapped = surfaces.parseSeedJourneys(gapText).get('gappy')
  assert.ok(gapped.malformed.includes('numbering: expected 2, got 3'),
    'a numbering gap must be reported as the exact "numbering: expected N, got M" string — a looser message breaks a caller that greps this exact shape: ' + JSON.stringify(gapped.malformed))

  const dupText = '### journey-a\nAnn opens the app.\n1. "I open the app" -> home\n' +
    '### journey-b\nBen opens the app.\n1. "I open the app" -> home\n'
  const dup = surfaces.parseSeedJourneys(dupText)
  assert.deepStrictEqual(dup.get('journey-a').malformed, [], 'the identical beat sentence in two journeys must never itself be malformed (journey-a) — a shared sentence is the user\'s explicit veto, never a refusal: ' + JSON.stringify(dup.get('journey-a').malformed))
  assert.deepStrictEqual(dup.get('journey-b').malformed, [], 'the identical beat sentence in two journeys must never itself be malformed (journey-b): ' + JSON.stringify(dup.get('journey-b').malformed))
})

test('AC-20260917-01-3: lib/surfaces.js exports parseSurfaceLines, parseSeedJourneys, parseSurfacesPlacement and beatHash, and no longer exports parseSurfaces', () => {
  const surfaces = require(libPath)
  for (const name of ['parseSurfaceLines', 'parseSeedJourneys', 'parseSurfacesPlacement', 'beatHash']) {
    assert.strictEqual(typeof surfaces[name], 'function',
      `lib/surfaces.js must export ${name} as a function — its absence breaks every caller that destructures it off this module: ` + typeof surfaces[name])
  }
  assert.strictEqual(surfaces.parseSurfaces, undefined,
    'parseSurfaces (the retired atlas\'s first-brief-wins fold, no caller since the atlas retired) must no longer be exported: ' + typeof surfaces.parseSurfaces)
})

test('AC-20260917-01-12: beatHash hashes the canonical "beat -> screen[@state]" lines to the pinned first-12-hex sha256, and a different state on the same beats changes the hash', () => {
  const surfaces = require(libPath)
  const beats = [
    { beat: 'I open the app', screen: 'home', state: null },
    { beat: 'I tap Sign in', screen: 'login', state: 'empty' },
  ]
  assert.strictEqual(surfaces.beatHash(beats), '7c0be20327a0',
    'beatHash must return the exact pinned hash for the Contracts two-beat example, executed and verified in the spec\'s own A1 — every mark and the client page must compute the same hash from the same beats: ' + surfaces.beatHash(beats))
  const beatsNoState = [
    { beat: 'I open the app', screen: 'home', state: null },
    { beat: 'I tap Sign in', screen: 'login', state: null },
  ]
  assert.notStrictEqual(surfaces.beatHash(beatsNoState), surfaces.beatHash(beats),
    'changing only the second beat\'s state must change the hash, or a state edit after client confirmation could silently leave a stale confirmation valid: ' + surfaces.beatHash(beatsNoState))
})
