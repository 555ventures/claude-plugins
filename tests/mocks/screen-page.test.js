'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, SPEC, tmpdir, runNode, withHandler } = require('../helpers')

// specs/20260913/06-every-mock-has-a-page-you-can-mark.md D1/D2/D3/D4/D6 — AC-20260913-06-1, -2,
// -3, -5, -6, -9. GET /screen/<label>.html does not exist yet (no route, no buildScreenPage
// export), so every request test below 404s or throws on the pre-image; the lightbox/open-↗
// deletion and the ADR file are likewise absent — every assertion is red until the batch lands.

const atlas = (argv, opts) => runNode('scripts/design-atlas.js', argv, opts)

function mk(dir, rel, content) {
  const p = path.join(dir, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}

// a: declared by journey j1. o: a drawn mock declared by no journey and no roadmap brief.
// one: a design/shapes/*.html candidate (never a mock).
function screenFixture() {
  const dir = tmpdir('screen-page')
  mk(dir, 'design/mocks/seed.md',
    '# Seed — Fixture\n\n## Journeys\n### j1\nA short flow.\n```surfaces\na\n```\n')
  mk(dir, 'design/mocks/a.html', '<main data-screen-label="a">A</main>\n')
  mk(dir, 'design/mocks/o.html', '<main data-screen-label="o">O</main>\n')
  mk(dir, 'design/shapes/one.html', '<main data-screen-label="one">One</main>\n')
  return dir
}

// Isolates the first <section ... data-rv="board" ...> tag's own opening tag (attributes only,
// never the board's body) so a data-focus assertion can never accidentally match something
// inside a note row or the composer instead.
function firstBoardOpenTag(html) {
  const m = /<section\b[^>]*\bdata-rv="board"[^>]*>/.exec(html)
  return m ? m[0] : null
}

function firstIframeSrc(html) {
  const m = /<iframe\b[^>]*\bsrc="([^"]*)"/.exec(html)
  return m ? m[1] : null
}

// AC-20260913-06-1
test('AC-20260913-06-1: GET /screen/<label>.html answers 200 for a journey-owned mock, an undeclared mock and a shape, each with one focused board, one composer, no journey rail and no approve control, and the frame source resolved by D1\'s mock-then-shape rule', async () => {
  const dir = screenFixture()
  await withHandler(dir, async ({ get }) => {
    const cases = [
      { label: 'a', src: '/mocks/a.html?clean&notes=1' },
      { label: 'o', src: '/mocks/o.html?clean&notes=1' },
      { label: 'one', src: '/shapes/one.html?clean&notes=1' },
    ]
    for (const c of cases) {
      const res = await get('/screen/' + c.label + '.html')
      assert.strictEqual(res.status, 200, 'GET /screen/' + c.label + '.html must answer 200: ' + res.status + ' ' + res.body)

      const boardCount = (res.body.match(/\bdata-rv="board"/g) || []).length
      assert.strictEqual(boardCount, 1, 'the screen page for ' + c.label + ' must carry exactly one [data-rv="board"]: got ' + boardCount)
      const boardTag = firstBoardOpenTag(res.body)
      assert.ok(boardTag, 'the board section must be findable for ' + c.label)
      assert.match(boardTag, /\bdata-focus\b/, 'the screen page\'s one board must carry data-focus (D2: focused true, total 1) for ' + c.label)

      const composerCount = (res.body.match(/\bdata-rv="composer"/g) || []).length
      assert.strictEqual(composerCount, 1, 'the screen page for ' + c.label + ' must carry exactly one [data-rv="composer"]: got ' + composerCount)

      assert.doesNotMatch(res.body, /data-rv="journey"/,
        'D2: the screen page has no journey rail — no [data-rv="journey"] element may render for ' + c.label)
      assert.doesNotMatch(res.body, /data-rv="approve"/,
        'D2: the screen page has no approve control — no [data-rv="approve"] element may render for ' + c.label)

      assert.strictEqual(firstIframeSrc(res.body), c.src,
        'the screen page\'s first iframe must frame the resolved file at ' + c.src + ' for ' + c.label + ': got ' + firstIframeSrc(res.body))
    }
  })
})

// AC-20260913-06-2
test('AC-20260913-06-2: GET /screen/a.html renders a row for the project note, the mock note on a and the region note on a, and no row for the mock note on b', async () => {
  const dir = screenFixture()
  const notes = [
    { id: 'N1', kind: 'note', scope: 'project', screen: null, state: null, status: 'open', text: 'whole project', by: 'jj', at: '2026-01-01T00:00:00.000Z', addressed: null, reply: null, resolvedBy: null, resolvedAt: null },
    { id: 'N2', kind: 'note', scope: 'mock', screen: 'a', state: null, status: 'open', text: 'plain note on a', by: 'jj', at: '2026-01-01T00:00:00.000Z', addressed: null, reply: null, resolvedBy: null, resolvedAt: null },
    { id: 'N3', kind: 'note', scope: 'mock', screen: 'a', state: 'happy', status: 'open', text: 'region note on a', by: 'jj', at: '2026-01-01T00:00:00.000Z', addressed: null, reply: null, resolvedBy: null, resolvedAt: null, region: { x: 1, y: 1, w: 2, h: 2 } },
    { id: 'N4', kind: 'note', scope: 'mock', screen: 'b', state: null, status: 'open', text: 'note on b', by: 'jj', at: '2026-01-01T00:00:00.000Z', addressed: null, reply: null, resolvedBy: null, resolvedAt: null },
  ]
  mk(dir, 'design/mocks/notes.json', JSON.stringify(notes, null, 2) + '\n')

  await withHandler(dir, async ({ get }) => {
    const res = await get('/screen/a.html')
    assert.strictEqual(res.status, 200, 'GET /screen/a.html must answer 200: ' + res.status + ' ' + res.body)
    const rowCount = (res.body.match(/data-rv="row"/g) || []).length
    assert.strictEqual(rowCount, 3, 'the screen page for a must render exactly 3 rows (project + mock-on-a + region-on-a): got ' + rowCount)
    for (const id of ['N1', 'N2', 'N3']) {
      assert.match(res.body, new RegExp('data-id="' + id + '"'),
        'the row for note ' + id + ' must render on the screen page for a')
    }
    assert.doesNotMatch(res.body, /data-id="N4"/,
      'the mock note on b must not render as a row on the screen page for a')
  })
})

// AC-20260913-06-3
test('AC-20260913-06-3: GET /screen/nope.html answers 404 text/plain "unknown screen nope" when no mock or shape is labelled nope', async () => {
  const dir = screenFixture()
  await withHandler(dir, async ({ get }) => {
    const res = await get('/screen/nope.html')
    assert.strictEqual(res.status, 404, 'an unknown screen label must answer 404: got ' + res.status + ' ' + res.body)
    assert.match(res.headers['content-type'] || '', /text\/plain/,
      'the 404 body must be served as text/plain: got content-type ' + res.headers['content-type'])
    assert.strictEqual(res.body, 'unknown screen nope',
      'the 404 body must be exactly "unknown screen nope": got ' + JSON.stringify(res.body))
  })
})

// AC-20260913-06-5
test('AC-20260913-06-5: building the atlas over an open shape-picked stop wraps its compare cells in shotlinks to /screen/<label>.html and still renders a Pick this button per column', () => {
  const dir = tmpdir('screen-page-pick')
  mk(dir, 'design/shapes/one.html', '<main data-screen-label="one">One</main>\n')
  mk(dir, 'design/shapes/two.html', '<main data-screen-label="two">Two</main>\n')
  mk(dir, 'design/mocks/picks.json', JSON.stringify([
    {
      id: 'P001', kind: 'pick', key: 'shape-picked', title: 'pick a shape', question: null,
      candidates: [
        { group: 'one', label: 'one', path: 'shapes/one.html' },
        { group: 'two', label: 'two', path: 'shapes/two.html' },
      ],
      url: null, openedAt: '2026-01-01T00:00:00.000Z', status: 'open', decision: null, previous: [],
    },
  ], null, 2) + '\n')

  const res = atlas(['build'], { cwd: dir })
  assert.strictEqual(res.status, 0, res.stdout + res.stderr)
  const out = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')

  assert.match(out, /<a class="shotlink" href="\/screen\/one\.html"/,
    'D3: the shape-picked compare table\'s "one" candidate cell must be wrapped in a shotlink to /screen/one.html')
  assert.match(out, /<a class="shotlink" href="\/screen\/two\.html"/,
    'D3: the shape-picked compare table\'s "two" candidate cell must be wrapped in a shotlink to /screen/two.html')

  const pickButtons = (out.match(/data-decide="pick"/g) || []).length
  assert.strictEqual(pickButtons, 2,
    'AC-5: each of the two candidate columns must still render its own data-decide="pick" button: got ' + pickButtons)
})

// AC-20260913-06-6
test('AC-20260913-06-6: the built atlas and gallery, plus stop-block.js and notes-layer.browser.js, carry no lightbox or open-↗ remnant', () => {
  const dir = tmpdir('screen-page-lb')
  mk(dir, 'design/mocks/a.html', '<main data-screen-label="a">A</main>\n')
  const built = atlas(['build'], { cwd: dir })
  assert.strictEqual(built.status, 0, built.stdout + built.stderr)
  const atlasOut = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')

  fs.mkdirSync(path.join(dir, 'design/explore/r0-a'), { recursive: true })
  mk(dir, 'design/explore/r0-a/tile.html', '<main data-screen-label="a">A</main>\n')
  const galleryRes = atlas(['gallery', path.join(dir, 'design/explore')])
  assert.strictEqual(galleryRes.status, 0, galleryRes.stdout + galleryRes.stderr)
  const galleryOut = fs.readFileSync(path.join(dir, 'design/explore/gallery.html'), 'utf8')

  const banned = ['__lbOpen', '__lbShow', 'id="lb"', '__full', 'open ↗']
  for (const needle of banned) {
    assert.ok(!atlasOut.includes(needle), 'D4: the built atlas must not emit ' + JSON.stringify(needle) + ' — the lightbox and open ↗ links are deleted')
    assert.ok(!galleryOut.includes(needle), 'D4: the built gallery must not emit ' + JSON.stringify(needle) + ' — the lightbox and open ↗ links are deleted')
  }

  const stopBlockSrc = fs.readFileSync(path.join(SPEC, 'scripts/lib/stop-block.js'), 'utf8')
  assert.ok(!stopBlockSrc.includes('__lbOpen'),
    'D4: lib/stop-block.js\'s PICKS_SCRIPT must not reference __lbOpen — the wrapper block is deleted')

  const notesLayerSrc = fs.readFileSync(path.join(SPEC, 'scripts/lib/notes-layer.browser.js'), 'utf8')
  assert.ok(!notesLayerSrc.includes('__lbOpen'),
    'D4/D5: notes-layer.browser.js must not reference __lbOpen — mockAnchor no longer gates on it')
  assert.ok(!notesLayerSrc.includes('lb-open'),
    'D4: notes-layer.browser.js\'s host style must not carry the body.lb-open clause — the lightbox is gone')
})

// AC-20260913-06-9
const ADR = path.join(ROOT, 'docs/adr/0026-every-mock-has-a-page-you-can-mark.md')

test('AC-20260913-06-9: docs/adr/0026-every-mock-has-a-page-you-can-mark.md is accepted, carries a Dissents section, and names both amended specs under Applies to', () => {
  assert.ok(fs.existsSync(ADR),
    'D6: docs/adr/0026-every-mock-has-a-page-you-can-mark.md must exist as the amendment ADR')
  const adr = fs.existsSync(ADR) ? fs.readFileSync(ADR, 'utf8') : ''
  assert.match(adr, /Status:\s*accepted/, 'the ADR must be stamped Status: accepted')
  assert.match(adr, /^##\s*Dissents/m, 'the ADR must carry a ## Dissents section')
  const appliesMatch = /^##\s*Applies to/m.exec(adr)
  assert.ok(appliesMatch, 'the ADR must carry an ## Applies to section')
  const appliesSection = appliesMatch ? adr.slice(appliesMatch.index) : ''
  assert.match(appliesSection, /specs\/20260912\/05-the-atlas-answers-to-a-design\.md/,
    'the ## Applies to section must name specs/20260912/05-the-atlas-answers-to-a-design.md')
  assert.match(appliesSection, /specs\/20260905\/01-picks-on-the-atlas-page\.md/,
    'the ## Applies to section must name specs/20260905/01-picks-on-the-atlas-page.md')
})
