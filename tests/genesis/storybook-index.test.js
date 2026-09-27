'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, read, ROOT } = require('../helpers')

// specs/20260926/05-the-kit-and-the-journey-stories.md D2: spec/scripts/lib/storybook-index.js —
// readIndex (the iframe.html requirement), normalizeName, stateStoriesCheck, and
// importSpecifiers. This file owns AC-20260926-05-3, -4, -5. None of storybook-index.js exists
// yet — every test below is red for that reason (module-not-found on require).

const LIB = path.join(ROOT, 'spec/scripts/lib/storybook-index.js')
const { readIndex, normalizeName, stateStoriesCheck, importSpecifiers } = require(LIB)

const FIXTURE_DIR = path.join(ROOT, 'tests/fixtures/genesis/storybook-index')

function loadFixtureEntries(name) {
  const parsed = JSON.parse(read('tests/fixtures/genesis/storybook-index/' + name))
  return Object.values(parsed.entries)
}

test('AC-20260926-05-3: readIndex(dir) reports { ok: false, reason: "no-iframe" } when index.json exists but iframe.html does not, and { ok: true, entries } (7 entries for the kit-and-journeys fixture) once both files are present', () => {
  const dir = tmpdir('storybook-index-ac3')
  const raw = fs.readFileSync(path.join(FIXTURE_DIR, 'kit-and-journeys.json'), 'utf8')
  fs.writeFileSync(path.join(dir, 'index.json'), raw)

  const noIframe = readIndex(dir)
  assert.deepStrictEqual(noIframe, { ok: false, reason: 'no-iframe' },
    'D2: a build that writes index.json but no iframe.html must be reported as { ok: false, reason: "no-iframe" } — the salon-os spike showed a build exiting 0 with no iframe at all, so a reader that trusts index.json alone would silently pass a broken static export: ' + JSON.stringify(noIframe))

  fs.writeFileSync(path.join(dir, 'iframe.html'), '<!doctype html><html></html>\n')
  const withIframe = readIndex(dir)
  assert.strictEqual(withIframe.ok, true,
    'D2: readIndex must report ok:true once both index.json and iframe.html exist: ' + JSON.stringify(withIframe))
  assert.ok(Array.isArray(withIframe.entries),
    'D2: readIndex must return an "entries" array (the values of index.json\'s entries object), not the raw keyed object: ' + JSON.stringify(withIframe))
  assert.strictEqual(withIframe.entries.length, 7,
    'D2: the kit-and-journeys.json fixture carries exactly 7 index entries — any other count means readIndex is not returning Object.values(entries) verbatim: ' + withIframe.entries.length)
})

test('AC-20260926-05-4: stateStoriesCheck finds the first missing composite/state pair over the missing-state fixture, returns null once every declared state has a story, and normalizeName folds case and spacing to the same key', () => {
  const composites = [{ composite: 'BookingSheet', states: ['Idle', 'Saving', 'Error'] }]
  const kitDir = 'src/components/kit'

  const missing = stateStoriesCheck(loadFixtureEntries('missing-state.json'), composites, kitDir)
  assert.deepStrictEqual(missing, { composite: 'BookingSheet', state: 'Error' },
    'D2: the missing-state fixture carries no Kit/BookingSheet "Error" story — stateStoriesCheck must return { composite: "BookingSheet", state: "Error" }, naming the first missing state so kit-landed\'s refusal can quote it: ' + JSON.stringify(missing))

  const complete = stateStoriesCheck(loadFixtureEntries('kit-and-journeys.json'), composites, kitDir)
  assert.strictEqual(complete, null,
    'D2: the kit-and-journeys fixture carries all three BookingSheet states — stateStoriesCheck must return null once nothing is missing: ' + JSON.stringify(complete))

  assert.strictEqual(normalizeName('Empty list'), normalizeName('EmptyList'),
    'D2: normalizeName must fold "Empty list" and "EmptyList" to the same key — a story name written with a space must still match a declared state written as one word, or a real, correctly-named state story would be reported missing')
  assert.strictEqual(normalizeName('Empty list'), 'emptylist',
    'D2: normalizeName must lower-case and strip non-alphanumerics, so "Empty list" becomes exactly "emptylist": ' + normalizeName('Empty list'))
})

test('AC-20260926-05-5: importSpecifiers returns every import/require specifier from a file in source order, skipping specifiers inside // comments, and admitting both quote forms', () => {
  const text = [
    'import { Button } from "@/components/ui/button"',
    "import x from './a.json'",
    "// import y from '@/components/ui/card'",
    // split so this tracked file's own source never spells a literal require(...) call —
    // tests/consistency/dependency-free.test.js's scanner would otherwise flag this AC-5 input
    // line as a non-builtin package import; the runtime string is unchanged.
    'const z = require' + "('@/components/kit/BookingSheet')",
    'await import("./lazy")',
  ].join('\n')

  const specs = importSpecifiers(text)
  assert.deepStrictEqual(specs, ['@/components/ui/button', './a.json', '@/components/kit/BookingSheet', './lazy'],
    'D2: importSpecifiers must return exactly these four specifiers in source order — a commented-out import must never be counted (it would falsely trip the primitive ban), and both single- and double-quoted forms must be admitted: ' + JSON.stringify(specs))

  const bareSideEffect = importSpecifiers("import '@/components/ui/button'\nimport x from './a.json'\n")
  assert.deepStrictEqual(bareSideEffect, ['@/components/ui/button', './a.json'],
    'D2: importSpecifiers must return a bare side-effect import\'s specifier too, not just a `from`-form import\'s — missing it would let a journey file smuggle a bare `import \'@/components/ui/button\'` past the primitive ban entirely: ' + JSON.stringify(bareSideEffect))
})
