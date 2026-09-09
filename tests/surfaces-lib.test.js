'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('./helpers')

// specs/20260908/02-driver-dedupe-onto-lib.md D1/D2 (AC-20260908-02-1, -2, -3): the ```surfaces
// line grammar (a bare label, an `a -> b` edge, a `#` comment) is parsed in exactly one place,
// `spec/scripts/lib/surfaces.js`, which exports `parseSurfaceLines`, `parseSeedJourneys`,
// `parseSurfaces`, and `parseSurfacesPlacement` as folds over it.

const { parseSurfaceLines, parseSeedJourneys, parseSurfaces, parseSurfacesPlacement } =
  require('../spec/scripts/lib/surfaces')

test('AC-20260908-02-1: parseSurfaceLines reads a bare label, an a -> b edge, drops a comment/blank/invalid label, and returns each surviving line as {labels, edge}', () => {
  const got = parseSurfaceLines('home\na -> b\n# c\nbad label!\n')
  assert.deepStrictEqual(got, [
    { labels: ['home'], edge: null },
    { labels: ['a', 'b'], edge: ['a', 'b'] },
  ], 'a bare label must come back with edge: null and its own label array, an a -> b line must come back with both ends in labels AND as edge, and the comment/blank/invalid-label lines must be dropped entirely — got ' + JSON.stringify(got))
})

test('AC-20260908-02-2: parseSeedJourneys reads a ### journey header, its persona line, and its ```surfaces block into {persona, labels, edges}, and returns an empty Map for null text', () => {
  const text = '### onboarding\nNew user\n```surfaces\nhome -> plan\nplan\n```\n'
  const got = parseSeedJourneys(text)
  assert.ok(got instanceof Map, 'parseSeedJourneys must return a Map keyed by journey kebab-name, not a plain object — a caller iterating with .entries()/.get() on a plain object would silently do nothing')
  assert.deepStrictEqual(got.get('onboarding'), { persona: 'New user', labels: ['home', 'plan'], edges: [['home', 'plan']] },
    'the onboarding journey must carry the first non-blank body line as persona, both surfaces-block labels in declaration order, and the edge — got ' + JSON.stringify(got.get('onboarding')))
  assert.strictEqual(parseSeedJourneys(null).size, 0, 'parseSeedJourneys(null) must return an empty Map — genesis-driver.js calls this with seedText()\'s null on a cold root and must never throw')
})

test('AC-20260908-02-3: parseSurfaces keeps the first declaring brief per label (with edges) and parseSurfacesPlacement tracks every declaring brief by file name (with no edges)', () => {
  const dir = tmpdir('surfaces-lib-ac3')
  const roadmapDir = path.join(dir, 'docs/roadmap')
  fs.mkdirSync(roadmapDir, { recursive: true })
  fs.writeFileSync(path.join(roadmapDir, '01.md'), '# 01\n```surfaces\nhome\n```\n')
  fs.writeFileSync(path.join(roadmapDir, '02.md'), '# 02\n```surfaces\nhome -> plan\nplan\n```\n')

  const surfaces = parseSurfaces(roadmapDir)
  const homeNode = surfaces.nodes.get('home')
  assert.ok(homeNode, 'parseSurfaces must record a node for "home", declared by both 01.md and 02.md')
  assert.ok(homeNode.brief.endsWith('01.md'), 'parseSurfaces must keep the FIRST declaring brief (01.md, sorted file order) for a label declared by two briefs, never the last one that overwrites it — got brief: ' + homeNode.brief)
  assert.ok(path.isAbsolute(homeNode.brief), 'parseSurfaces must return an absolute path in node.brief, per the Contract\'s own distinction from parseSurfacesPlacement\'s file names — got ' + homeNode.brief)

  const placement = parseSurfacesPlacement(roadmapDir)
  assert.deepStrictEqual(placement.get('home'), ['01.md', '02.md'],
    'parseSurfacesPlacement must record EVERY declaring brief file name for "home" (both 01.md and 02.md), the opposite fold from parseSurfaces\' first-wins — got ' + JSON.stringify(placement.get('home')))
  assert.deepStrictEqual(placement.get('plan'), ['02.md'],
    'parseSurfacesPlacement must record only 02.md for "plan", the sole brief declaring it — got ' + JSON.stringify(placement.get('plan')))

  const missing = parseSurfaces(path.join(dir, 'no-such-dir'))
  assert.strictEqual(missing.nodes.size, 0, 'parseSurfaces against a missing roadmap dir must return an empty nodes Map, not throw')
  assert.strictEqual(missing.edges.length, 0, 'parseSurfaces against a missing roadmap dir must return an empty edges array, not throw')
  const missingPlacement = parseSurfacesPlacement(path.join(dir, 'no-such-dir'))
  assert.strictEqual(missingPlacement.size, 0, 'parseSurfacesPlacement against a missing roadmap dir must return an empty Map, not throw')
})
