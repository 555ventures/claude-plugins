'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { runNode, tmpdir, withHandler } = require('../helpers')
const {
  writeTargets, openLook, advanceToThemePicked,
} = require('./mocks-driver-fixtures')

// specs/20260910/04-theme-before-the-client-walk.md (ADR-0013) — the serve-time half of the
// theme pick: D1's `?theme=` link swap over the static mock route, D5's `/client/theme.html`
// compare page plus the client-mounted picks-decide route, D7's themed player frame, and D8/D11's
// `check` warn suppression once `marks.themePicked` is set. TDD red: design-atlas.js today never
// reads `?theme=` at all (the static route serves every mock byte-identical regardless of the
// param), `lib/walk-page.js` exports no `buildThemePage`, `/client/__picks/decide` 404s under the
// `/client` mount (only the non-client `/__picks/decide` exists), `GET /client/walk/<j>.html`
// never threads `status.theme` into `buildWalkPage`, and `themeAndNotesViolations` has no
// marks.themePicked read at all.

function writeMinimalMock(dir, label) {
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks', label + '.html'),
    '<link rel="stylesheet" href="../wire/tokens.css">\n' +
    '<link rel="stylesheet" href="../wire/wire.css">\n' +
    '<main data-screen-label="' + label + '" data-status="sketch">' + label + '</main>\n')
}
function writeThemeTokens(dir, kebab) {
  fs.mkdirSync(path.join(dir, 'design/theme', kebab), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/theme', kebab, 'tokens.css'), ':root{--bg:#fff}\n')
}

// AC-20260910-04-1
test('AC-20260910-04-1: GET /mocks/<label>.html?theme=<kebab> rewrites the served wire/tokens.css link to theme/<kebab>/tokens.css (path-relative), leaves wire/wire.css and the file on disk untouched, ignores an unknown or path-traversal kebab byte-for-byte against the un-themed ?clean body, and composes with ?clean&walk&state=', async () => {
  const dir = tmpdir('theme-serve')
  writeMinimalMock(dir, 'signin')
  writeThemeTokens(dir, 'warm-paper')

  await withHandler(dir, async ({ get }) => {
    const clean = await get('/mocks/signin.html?clean')
    assert.strictEqual(clean.status, 200, 'the un-themed ?clean request must serve 200: ' + clean.status)

    const themed = await get('/mocks/signin.html?clean&theme=warm-paper')
    assert.strictEqual(themed.status, 200, 'GET ?theme=warm-paper over an existing direction must serve 200: ' + themed.status)
    assert.match(themed.body, /href="\.\.\/theme\/warm-paper\/tokens\.css"/,
      'the served body must carry the swapped path-relative href: ' + themed.body)
    assert.ok(!themed.body.includes('../wire/tokens.css'),
      'the served body must carry no ../wire/tokens.css href once swapped: ' + themed.body)
    assert.match(themed.body, /href="\.\.\/wire\/wire\.css"/, '../wire/wire.css must stay unchanged: ' + themed.body)

    const onDisk = fs.readFileSync(path.join(dir, 'design/mocks/signin.html'), 'utf8')
    assert.ok(onDisk.includes('../wire/tokens.css'),
      'the swap must be served-only — the file on disk must be untouched: ' + onDisk)

    const unknown = await get('/mocks/signin.html?clean&theme=nope')
    assert.strictEqual(unknown.body, clean.body,
      'an unknown direction kebab (no design/theme/nope/tokens.css) must leave the body byte-identical to the un-themed ?clean body — the param is advisory tooling, like ?state: ' +
      JSON.stringify({ unknown: unknown.body, clean: clean.body }))

    const traversal = await get('/mocks/signin.html?clean&theme=..%2Fx')
    assert.strictEqual(traversal.body, clean.body,
      'a path-traversal kebab must be ignored the same way (kebab must be [a-z0-9-]+), leaving the body byte-identical to ?clean: ' +
      JSON.stringify({ traversal: traversal.body, clean: clean.body }))

    const composed = await get('/mocks/signin.html?clean&walk&theme=warm-paper&state=error')
    assert.strictEqual(composed.status, 200, '?theme composed with ?clean&walk&state= must still serve 200: ' + composed.status)
    assert.match(composed.body, /href="\.\.\/theme\/warm-paper\/tokens\.css"/,
      'the theme swap must survive composition with ?walk and ?state=: ' + composed.body)
    assert.match(composed.body, /__walk\/walk\.js/, 'the ?walk script must still be injected when composed with ?theme: ' + composed.body)
    assert.match(composed.body, /data-state-btn="error"\]/,
      'the ?state=error click script must still be injected when composed with ?theme (naming the error state-btn selector): ' + composed.body)
  })
})

// AC-20260910-04-5
test('AC-20260910-04-5: GET /client/theme.html renders the open theme-picked stop as a compare table (one frame per direction × dense screen, one [data-th="pick"][data-group] per column); POST /client/__picks/decide decides it with `by` forced to "client"; the same POST against a non-theme-picked stop refuses 400; with no theme-picked stop the page renders no pick button', async () => {
  const dir = tmpdir('theme-serve')
  writeTargets(dir)
  const candidates = [
    { group: 'warm-paper', label: 'session-live', path: 'mocks/session-live.html?theme=warm-paper' },
    { group: 'warm-paper', label: 'roster', path: 'mocks/roster.html?theme=warm-paper' },
    { group: 'ink', label: 'session-live', path: 'mocks/session-live.html?theme=ink' },
    { group: 'ink', label: 'roster', path: 'mocks/roster.html?theme=ink' },
  ]
  const stop = openLook(dir, 'theme-picked', { kind: 'pick', candidates, title: 'pick the theme' })
  const otherStop = openLook(dir, 'journey-approved:onboarding', {
    kind: 'approve', candidates: [{ group: null, label: 'onboarding', path: 'mocks/a.html' }],
  })

  await withHandler(dir, async ({ get, post }) => {
    const page = await get('/client/theme.html')
    assert.strictEqual(page.status, 200, 'GET /client/theme.html over an open theme-picked stop must serve 200: ' + page.status)
    for (const src of [
      'mocks/session-live.html?clean&theme=warm-paper', 'mocks/roster.html?clean&theme=warm-paper',
      'mocks/session-live.html?clean&theme=ink', 'mocks/roster.html?clean&theme=ink',
    ]) {
      assert.ok(page.body.includes(src), 'the compare table must frame "' + src + '": ' + page.body)
    }
    const pickGroups = [...page.body.matchAll(/data-th="pick"[^>]*data-group="([^"]+)"/g)].map((m) => m[1])
    assert.deepStrictEqual(pickGroups.slice().sort(), ['ink', 'warm-paper'],
      'the page must carry exactly one [data-th="pick"][data-group] button per column: ' + JSON.stringify(pickGroups))

    const decided = await post('/client/__picks/decide', { id: stop.id, verdict: 'pick', pick: 'ink', by: 'me' })
    assert.strictEqual(decided.status, 200, 'the client picks-decide route must accept a decision on the theme-picked stop: ' + decided.status + ' ' + decided.body)
    const decidedBody = JSON.parse(decided.body)
    assert.strictEqual(decidedBody.decision.by, 'client',
      'D5: `by` must be forced to "client" on the client route regardless of what the POST body sent ("me"): ' + JSON.stringify(decidedBody))
    assert.strictEqual(decidedBody.decision.pick, 'ink', 'the decided pick must be "ink": ' + JSON.stringify(decidedBody))

    const refused = await post('/client/__picks/decide', { id: otherStop.id, verdict: 'approve', by: 'me' })
    assert.strictEqual(refused.status, 400,
      'D5: the client picks-decide route must refuse (400) a stop whose key is not theme-picked: ' + refused.status + ' ' + refused.body)
  })

  const emptyDir = tmpdir('theme-serve')
  writeTargets(emptyDir)
  await withHandler(emptyDir, async ({ get }) => {
    const page = await get('/client/theme.html')
    assert.strictEqual(page.status, 200, 'GET /client/theme.html with no theme-picked stop at all must still serve 200: ' + page.status)
    assert.ok(!page.body.includes('data-th="pick"'),
      'with no theme-picked stop the page must render no [data-th="pick"] button at all: ' + page.body)
  })
})

// AC-20260910-04-7
test('AC-20260910-04-7: GET /client/walk/<j>.html renders data-theme="<k>" on the player root once status.theme is set; GET /review/<j>.html and GET /atlas/index.html carry no theme= regardless', async () => {
  const dir = tmpdir('theme-serve')
  advanceToThemePicked(dir) // default kebab 'a', default journey 'onboarding' (mocks-driver-fixtures JOURNEY)

  await withHandler(dir, async ({ get }) => {
    const walkPage = await get('/client/walk/onboarding.html')
    assert.strictEqual(walkPage.status, 200, 'GET /client/walk/onboarding.html over a themed host must serve 200: ' + walkPage.status + ' ' + walkPage.body)
    assert.match(walkPage.body, /data-theme="a"/,
      'D7: the served walk page must render data-theme="a" on the player root once status.theme is "a": ' + walkPage.body)

    const review = await get('/review/onboarding.html')
    assert.strictEqual(review.status, 200, 'GET /review/onboarding.html must still serve 200: ' + review.status)
    assert.ok(!review.body.includes('theme='), 'D7: the session review page must carry no theme= anywhere: ' + review.body)

    const atlas = await get('/atlas/index.html')
    assert.strictEqual(atlas.status, 200, 'GET /atlas/index.html must still serve 200: ' + atlas.status)
    assert.ok(!atlas.body.includes('theme='), 'D7: the atlas index must carry no theme= anywhere: ' + atlas.body)
  })
})

function writeWireMock(dir, label, status) {
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks', label + '.html'),
    '<link rel="stylesheet" href="../tokens.css">\n' +
    '<link rel="stylesheet" href="../wire/wire.css">\n' +
    '<style>* { box-sizing: border-box; }</style>\n' +
    '<main class="screen" data-screen-label="' + label + '" data-status="' + status + '">' + label + '</main>\n')
}
function writeStatusMarks(dir, marks) {
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/status.json'), JSON.stringify({ marks }, null, 2) + '\n')
}

// AC-20260910-04-8
test('AC-20260910-04-8: design-atlas.js check prints no ⚠️ line and exits 0 for a data-status="sketch" mock still linking wire/ once design/tokens.css exists, when status.json carries marks.themePicked', () => {
  const dir = tmpdir('theme-serve')
  fs.mkdirSync(path.join(dir, 'design'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/tokens.css'), ':root{--bg:#fff}\n')
  writeWireMock(dir, 'signin', 'sketch')
  writeStatusMarks(dir, { themePicked: '2026-01-01T00:00:00Z' })

  const r = runNode('scripts/design-atlas.js', ['check', path.join(dir, 'design/mocks/signin.html')])
  assert.strictEqual(r.status, 0, 'check must exit 0 once marks.themePicked is set: ' + r.stdout + r.stderr)
  assert.ok(!r.stdout.includes('⚠️'),
    'D8: check must print no ⚠️ line at all — in particular none for "links the wireframe register" — once marks.themePicked is set (the wireframes are themed by the ?theme= swap, never by relinking): ' +
    JSON.stringify(r.stdout))
})

// AC-20260910-04-11
test('AC-20260910-04-11 (SHALL CONTINUE TO): design-atlas.js check continues to print the wire-link ⚠️ line for a data-status="sketch" mock linking wire/ once design/tokens.css exists, when status.json carries no marks.themePicked', () => {
  const dir = tmpdir('theme-serve')
  fs.mkdirSync(path.join(dir, 'design'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/tokens.css'), ':root{--bg:#fff}\n')
  writeWireMock(dir, 'signin', 'sketch')

  const r = runNode('scripts/design-atlas.js', ['check', path.join(dir, 'design/mocks/signin.html')])
  assert.strictEqual(r.status, 0, 'a ⚠️ warn (not a violation) must still exit 0 at the sketch stamp: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /⚠️ .*links the wireframe register \(wire\/\) after the theme pick/,
    'AC-20260910-04-11: with no marks.themePicked, the existing wire-link warn must keep firing exactly as it does today: ' + JSON.stringify(r.stdout))
})
