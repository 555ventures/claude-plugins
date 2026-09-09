'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const vm = require('node:vm')
const { spawn, spawnSync } = require('node:child_process')
const { tmpdir, runNode, SPEC, read } = require('./helpers')

const atlas = (argv, opts) => runNode('scripts/design-atlas.js', argv, opts)

// specs/20260905/01-picks-on-the-atlas-page.md D2: design-atlas.js guards its CLI dispatch
// behind require.main, so a plain top-level require() of the script never runs the CLI and
// returns the module's exports (buildAtlas, page, frameTag, createRequestHandler) untouched.
// The cache bust lets each test that mutates a fixture on disk (design-coverage.json, roadmap
// docs) re-require a fresh module against the new state.
function loadDesignAtlas() {
  const scriptPath = path.join(SPEC, 'scripts/design-atlas.js')
  delete require.cache[scriptPath]
  return require(scriptPath)
}

// In-process mirror of the file's existing withServe() child-process helper, for the new
// createRequestHandler-based tests (A4: never a child process for these).
function withHandler(root, prefix, fn) {
  const mod = loadDesignAtlas()
  assert.ok(mod && typeof mod.createRequestHandler === 'function',
    'design-atlas.js must export createRequestHandler(root,{prefix}), the handler cmdServe mounts on http.createServer')
  const server = http.createServer(mod.createRequestHandler(root, { prefix }))
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      const get = (p) => new Promise((res2, rej2) => {
        http.get({ host: '127.0.0.1', port, path: p }, (r) => {
          let body = ''
          r.on('data', (c) => { body += c })
          r.on('end', () => res2({ status: r.statusCode, headers: r.headers, body }))
        }).on('error', rej2)
      })
      const post = (p, obj) => new Promise((res2, rej2) => {
        const data = typeof obj === 'string' ? obj : JSON.stringify(obj)
        const req = http.request({
          host: '127.0.0.1', port, path: p, method: 'POST',
          headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) },
        }, (r) => {
          let body = ''
          r.on('data', (c) => { body += c })
          r.on('end', () => res2({ status: r.statusCode, headers: r.headers, body }))
        })
        req.on('error', rej2)
        req.end(data)
      })
      Promise.resolve(fn({ get, post, port })).then(
        (v) => server.close(() => resolve(v)),
        (e) => server.close(() => reject(e)),
      )
    })
  })
}

// Balanced-<div> element extraction (extractFn's brace-matching, adapted for markup) — lets the
// buildAtlas rendering tests below isolate exactly the compare-table/stop element they assert on
// instead of matching loose substrings that could accidentally straddle sibling elements.
function sliceElement(html, openMarker) {
  const start = html.indexOf(openMarker)
  if (start === -1) return null
  const tagRe = /<div\b|<\/div>/g
  tagRe.lastIndex = html.indexOf('>', start) + 1
  let depth = 1
  let m
  while ((m = tagRe.exec(html))) {
    if (m[0] === '<div') depth++
    else depth--
    if (depth === 0) return html.slice(start, m.index + m[0].length)
  }
  return null
}

function writePicksJson(dir, stops) {
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/picks.json'), JSON.stringify(stops, null, 2) + '\n')
}

function fixture() {
  const dir = tmpdir('atlas')
  const mk = (rel, content) => {
    const p = path.join(dir, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, content)
  }
  mk('design/mocks/lobby.html',
    '<link rel="stylesheet" href="../tokens.css">\n<style>* { box-sizing: border-box; }</style>\n' +
    '<main data-screen-label="lobby" data-status="approved" style="color:var(--text-body)">Lobby</main>\n')
  mk('design/mocks/thread.html',
    '<link rel="stylesheet" href="../tokens.css">\n<main data-screen-label="thread">Thread</main>\n')
  mk('docs/roadmap/01-chrome.md',
    '# 01\n```surfaces\nsignin\nsignin -> lobby\nlobby -> thread\nlobby -> account\n# a comment\n```\n')
  mk('.claude/design-coverage.json', JSON.stringify({
    sources: { 'design/mocks': { regions: { 'lobby#root': { spec: 'specs/20260716/01-x.md', at: '2026-07-16' } } } },
  }))
  mk('specs/20260716/01-x.md', '---\nstatus: done\n---\n# x\n')
  return dir
}

// specs/20260905/01-picks-on-the-atlas-page.md D1/D2/D3/D4/D5, AC-20260905-01-3..-10/-12:
// design-atlas.js's require.main guard, createRequestHandler, the picks endpoints, the stop
// rendering, and the inline decide script; notes-layer.browser.js's notes-scope handling.

test('AC-20260905-01-3: requiring design-atlas.js with argv [node, x, \'nonsense\'] returns normally with nothing on stderr, exposing buildAtlas, page, frameTag, createRequestHandler as functions', () => {
  const scriptPath = path.join(SPEC, 'scripts/design-atlas.js')
  // scriptPath is handed to the child via env, not concatenated into the code string, so this
  // file's own source never spells require( immediately followed by a quote (tests/consistency/
  // dependency-free.test.js's specifier scanner would otherwise read the concatenation as a
  // static, non-builtin require specifier and flag this tracked file).
  const code = 'const m = require(process.env.DESIGN_ATLAS_PATH);' +
    'process.stdout.write(JSON.stringify(["buildAtlas","page","frameTag","createRequestHandler"].map(function(k){return typeof m[k]})));'
  const res = spawnSync(process.execPath, ['-e', code, 'x', 'nonsense'], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { DESIGN_ATLAS_PATH: scriptPath }),
  })
  assert.strictEqual(res.status, 0,
    'requiring design-atlas.js under a non-CLI argv must return normally (exit 0), never run its CLI dispatch and die — D2\'s require.main guard is missing: ' + res.stdout + res.stderr)
  assert.strictEqual(res.stderr, '',
    'requiring design-atlas.js must print nothing to stderr — any CLI usage message here means the guard did not fire: ' + JSON.stringify(res.stderr))
  assert.deepStrictEqual(JSON.parse(res.stdout || 'null'), ['function', 'function', 'function', 'function'],
    'design-atlas.js must export buildAtlas, page, frameTag, and createRequestHandler as functions: got ' + res.stdout)
})

test('AC-20260905-01-4: createRequestHandler mounted under a prefix serves a mock page with the mock notes-scope tag, exact bytes under ?clean, notes.js, the derived index with the project notes-scope tag, and blocks traversal', async () => {
  const dir = tmpdir('atlas-handler')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  const bodyHtml = '<html><body data-screen-label="a">hi</body></html>'
  fs.writeFileSync(path.join(dir, 'design/mocks/a.html'), bodyHtml)
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"should-never-be-served"}')

  await withHandler(dir, '/p/demo', async ({ get }) => {
    const mockRes = await get('/p/demo/mocks/a.html')
    assert.strictEqual(mockRes.status, 200, 'GET /p/demo/mocks/a.html must serve 200: ' + mockRes.body)
    assert.ok(mockRes.body.endsWith('<meta name="notes-scope" content="mock">\n<script src="/p/demo/__notes/notes.js"></script>\n</body></html>'),
      'a static mock page must end with the mock notes-scope meta tag followed by the base-prefixed notes script tag: got ' + JSON.stringify(mockRes.body))

    const cleanRes = await get('/p/demo/mocks/a.html?clean')
    assert.strictEqual(cleanRes.body, bodyHtml, '?clean must return the exact original file bytes, with no injected tag, even under a prefix')

    const notesJs = await get('/p/demo/__notes/notes.js')
    assert.strictEqual(notesJs.status, 200, 'GET /p/demo/__notes/notes.js must serve 200 under the prefix')
    assert.strictEqual(notesJs.headers['content-type'], 'text/javascript', 'notes.js must be served as text/javascript under the prefix')

    const indexRes = await get('/p/demo/atlas/index.html')
    assert.strictEqual(indexRes.status, 200, 'GET /p/demo/atlas/index.html must derive and serve the atlas index under the prefix')
    assert.match(indexRes.headers['content-type'], /text\/html/, 'the derived index must be served as text/html')
    assert.match(indexRes.body, /<meta name="notes-scope" content="project">\n<script src="\/p\/demo\/__notes\/notes\.js"><\/script>/,
      'the derived atlas index must carry the project notes-scope tag followed by the same prefixed script tag: got tail ' + JSON.stringify(indexRes.body.slice(-300)))

    const traversal = await get('/p/demo/../package.json')
    assert.strictEqual(traversal.status, 404, 'a traversal request must never leak a file above the served root, even under a prefix')
  })
})

test('AC-20260905-01-5: createRequestHandler serves /__picks/list and /__picks/decide against picks.json — 200 on decide and re-decide, 404 unknown id, 400 empty-note change, 400 non-JSON body, 409 once consumed', async () => {
  const dir = tmpdir('atlas-picks-http')
  writePicksJson(dir, [{
    id: 'P001', kind: 'pick', key: 'shape-picked', title: 'pick a shape', question: null,
    candidates: [
      { group: 'a', label: 'x', path: 'shapes/a.html' },
      { group: 'b', label: 'x', path: 'shapes/b.html' },
    ],
    url: null, openedAt: '2026-01-01T00:00:00.000Z', status: 'open', decision: null, previous: [],
  }])

  await withHandler(dir, '', async ({ get, post }) => {
    const listed = await get('/__picks/list')
    assert.strictEqual(listed.status, 200, 'GET /__picks/list must respond 200: ' + listed.body)
    assert.ok(JSON.parse(listed.body).some((s) => s.id === 'P001'), 'GET /__picks/list must include the open stop P001: got ' + listed.body)

    const decided = await post('/__picks/decide', { id: 'P001', verdict: 'pick', pick: 'b', by: 'jj' })
    assert.strictEqual(decided.status, 200, 'a valid decide POST on an open stop must respond 200: ' + decided.status + ' ' + decided.body)
    assert.strictEqual(JSON.parse(decided.body).status, 'decided', 'the returned stop must show status decided')
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'design/mocks/picks.json'), 'utf8'))
    assert.strictEqual(onDisk.find((s) => s.id === 'P001').status, 'decided', 'the decision must be persisted back to picks.json')

    const redecided = await post('/__picks/decide', { id: 'P001', verdict: 'pick', pick: 'a', note: 'why', by: 'jj' })
    assert.strictEqual(redecided.status, 200, 're-deciding a decided stop must also respond 200: ' + redecided.status + ' ' + redecided.body)
    const redecidedBody = JSON.parse(redecided.body)
    assert.strictEqual(redecidedBody.decision.pick, 'a', 'the re-decide must record the new pick')
    assert.strictEqual(redecidedBody.previous.length, 1, 'the re-decide must push the earlier decision onto previous')

    const notFound = await post('/__picks/decide', { id: 'P999', verdict: 'pick', pick: 'a', by: 'jj' })
    assert.strictEqual(notFound.status, 404, 'a decide POST for an unknown id must respond 404: got ' + notFound.status)

    const noNote = await post('/__picks/decide', { id: 'P001', verdict: 'change', by: 'jj' })
    assert.strictEqual(noNote.status, 400, 'an empty-note change must respond 400 naming note: got ' + noNote.status + ' ' + noNote.body)
    assert.match(noNote.body, /note/, 'the 400 body must name "note" as the reason')

    const malformed = await post('/__picks/decide', 'not json')
    assert.strictEqual(malformed.status, 400, 'a non-JSON body must respond 400, never crash the server: got ' + malformed.status)
  })

  const picksLib = require(path.join(SPEC, 'scripts/lib/mocks-picks'))
  const before = JSON.parse(fs.readFileSync(path.join(dir, 'design/mocks/picks.json'), 'utf8'))
  const { stops: consumedStops } = picksLib.consumeStop(before, 'P001')
  fs.writeFileSync(path.join(dir, 'design/mocks/picks.json'), JSON.stringify(consumedStops, null, 2) + '\n')

  await withHandler(dir, '', async ({ post }) => {
    const after409 = await post('/__picks/decide', { id: 'P001', verdict: 'pick', pick: 'a', by: 'jj' })
    assert.strictEqual(after409.status, 409, 'deciding a consumed stop through the endpoint must respond 409: got ' + after409.status)
  })
})

test('AC-20260905-01-6: buildAtlas renders an open pick stop as an in-place compare table in the shapes section and an open approve stop as an approve control in its journey section, with a #stops index of links only', () => {
  const dir = tmpdir('atlas-picks-build')
  fs.mkdirSync(path.join(dir, 'design/shapes'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/shapes/card-first.html'), '<main data-screen-label="session-live">card-first</main>\n')
  fs.writeFileSync(path.join(dir, 'design/shapes/orb-hero.html'), '<main data-screen-label="session-live">orb-hero</main>\n')
  fs.writeFileSync(path.join(dir, 'design/mocks/seed.md'), `# Seed — Test Product

## Product
It is a synthetic product.
Built for tests.
It must do one job.

## Facts
- primary-surface: P1

## References
- none

## Journeys
### j1
Mika (dispatch lead) draws two screens and reaches the busy state.
\`\`\`surfaces
a -> b
\`\`\`

## Dense screen
- a
`)
  fs.writeFileSync(path.join(dir, 'design/mocks/a.html'),
    '<link rel="stylesheet" href="../wire/tokens.css">\n<main data-screen-label="a" data-status="sketch">A</main>\n')
  fs.writeFileSync(path.join(dir, 'design/mocks/b.html'),
    '<link rel="stylesheet" href="../wire/tokens.css">\n<main data-screen-label="b" data-status="sketch">B</main>\n')

  const openedAt = '2026-01-01T00:00:00.000Z'
  writePicksJson(dir, [
    {
      id: 'P001', kind: 'pick', key: 'shape-picked', title: 'pick a shape', question: null,
      candidates: [
        { group: 'card-first', label: 'session-live', path: 'shapes/card-first.html' },
        { group: 'orb-hero', label: 'session-live', path: 'shapes/orb-hero.html' },
      ],
      url: null, openedAt, status: 'open', decision: null, previous: [],
    },
    {
      id: 'P002', kind: 'approve', key: 'journey-approved:j1', title: 'approve journey j1', question: null,
      candidates: [
        { group: null, label: 'a', path: 'mocks/a.html' },
        { group: null, label: 'b', path: 'mocks/b.html' },
      ],
      url: null, openedAt, status: 'open', decision: null, previous: [],
    },
  ])

  const res = atlas(['build'], { cwd: dir })
  assert.strictEqual(res.status, 0, res.stdout + res.stderr)
  const out = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')

  const stopsIdx = out.indexOf('<section id="stops">')
  assert.ok(stopsIdx !== -1, 'buildAtlas must emit a <section id="stops"> summarizing every open/decided stop')
  const firstSectIdx = out.indexOf('class="sect"')
  assert.ok(firstSectIdx === -1 || firstSectIdx > stopsIdx, '<section id="stops"> must be emitted before the first class="sect" section')
  const stopsCloseIdx = out.indexOf('</section>', stopsIdx)
  const stopsBlock = out.slice(stopsIdx, stopsCloseIdx)
  assert.match(stopsBlock, /href="#stop-P001"/, 'the #stops index must link the pick stop')
  assert.match(stopsBlock, /href="#stop-P002"/, 'the #stops index must link the approve stop')
  assert.doesNotMatch(stopsBlock, /<iframe/, 'the #stops index must be links and text only, never a frame')

  const cmpBlock = sliceElement(out, '<div class="cmp" id="stop-P001" data-kind="pick"')
  assert.ok(cmpBlock, 'the shapes section must render stop P001 as a class="cmp" compare table element')
  assert.strictEqual((cmpBlock.match(/class="chead"/g) || []).length, 2,
    'the compare table must render exactly one chead column per group (card-first, orb-hero): got ' + JSON.stringify(cmpBlock))
  assert.match(cmpBlock, /data-group="card-first"/, 'a chead column for group card-first must be present')
  assert.match(cmpBlock, /data-group="orb-hero"/, 'a chead column for group orb-hero must be present')
  assert.strictEqual((cmpBlock.match(/data-decide="pick"/g) || []).length, 2, 'exactly one Pick this button per group must render')
  assert.strictEqual((cmpBlock.match(/class="step"/g) || []).length, 1,
    'the compare table must render exactly one step row for the single shared label session-live')
  assert.match(cmpBlock, /class="step">step 1[^<]*session-live/, 'the single step row must be labeled with session-live')
  const iframes = cmpBlock.match(/<iframe[^>]*>/g) || []
  assert.strictEqual(iframes.length, 2,
    'exactly two frames must render, one per candidate — the plain shape cards of today must not also render under an open stop: got ' + JSON.stringify(iframes))
  assert.ok(iframes.some((f) => /src="[^"]*shapes\/card-first\.html\?clean"/.test(f)), 'one frame src must end shapes/card-first.html?clean')
  assert.ok(iframes.some((f) => /src="[^"]*shapes\/orb-hero\.html\?clean"/.test(f)), 'one frame src must end shapes/orb-hero.html?clean')
  assert.match(cmpBlock, /class="card"[\s\S]*?open ↗[\s\S]*?href="[^"]*shapes\/card-first\.html"/,
    'each frame must sit inside a class="card" element carrying an open ↗ link to the un-?clean path')

  // D4 invariant: every non-empty compare-table card carries its own data-group/data-step, and
  // the lightbox resolves "which group is this card" and "same step, other candidate" by reading
  // those attributes off the card — never by a page-wide chead-position index. Both the markup
  // and the script's own selectors are pinned, because either side alone can satisfy the other.
  assert.match(cmpBlock, /class="card" data-group="card-first" data-step="1"/,
    'every non-empty compare-table card must carry its own data-group and data-step — without them the lightbox cannot resolve which candidate a card is')
  assert.match(cmpBlock, /class="card" data-group="orb-hero" data-step="1"/,
    'every non-empty compare-table card must carry its own data-group and data-step — without them the lightbox cannot resolve which candidate a card is')
  assert.doesNotMatch(cmpBlock, /class="card empty"[^>]*data-(group|step)=/,
    'an empty compare-table cell must carry neither data-group nor data-step — it stands for no candidate at all')
  assert.ok(out.includes('.card[data-step='),
    'the inline script must scope same-step lookups with the .card[data-step=...] selector, not a page-wide index')
  assert.ok(out.includes('curCard.dataset.group'),
    'the lightbox Pick this button must read the group off the shown card\'s own dataset, not off chead position')
  assert.ok(!out.includes("querySelectorAll('.chead')["),
    'the lightbox wiring must never fall back to a positional .chead index — that breaks as soon as columns are reordered or filtered')

  // specs/20260907/09-atlas-index-and-note-navigation.md D2 adds id="j-<title>" to every journey
  // section's <h2> — this probe pins that the section exists and is headed "j1", not the tag's
  // incidental attribute shape, so it tolerates whatever attributes ride along on <h2>.
  const j1Match = out.match(/<h2[^>]*>j1/)
  const j1Idx = j1Match ? j1Match.index : -1
  assert.ok(j1Idx !== -1, 'a section headed "j1" must exist for the seed journey')
  const stopBlock = sliceElement(out, '<div class="stop" id="stop-P002" data-kind="approve"')
  assert.ok(stopBlock, 'the j1 section must render stop P002 as a class="stop" approve control')
  assert.ok(out.indexOf(stopBlock) > j1Idx, 'the approve stop element must sit inside the j1 section, not elsewhere')
  assert.strictEqual((stopBlock.match(/data-decide="approve"/g) || []).length, 1, 'exactly one Approve button must render')
  assert.match(stopBlock, /name="note-P002"/, 'a note-P002 textarea must render for the approve control')
  assert.strictEqual((stopBlock.match(/data-decide="change"/g) || []).length, 1, 'exactly one Change button must render')
  assert.doesNotMatch(stopBlock, /<iframe/, 'the approve stop element itself must render no frame — the section\'s own cards are the screens')
})

test('AC-20260905-01-7: a theme-picked stop renders its own #theme section after shapes, columns per group, steps in candidate order, and an empty cell for a missing label; an unknown key renders right after #stops', () => {
  const dir = tmpdir('atlas-theme-build')
  fs.mkdirSync(path.join(dir, 'design/shapes'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/shapes/one.html'), '<main data-screen-label="one">one</main>\n')
  for (const p of ['themes/ocean/signin.html', 'themes/ocean/home.html', 'themes/ember/signin.html']) {
    fs.mkdirSync(path.join(dir, 'design', path.dirname(p)), { recursive: true })
    fs.writeFileSync(path.join(dir, 'design', p), '<main data-screen-label="x">x</main>\n')
  }
  const openedAt = '2026-01-01T00:00:00.000Z'
  writePicksJson(dir, [
    {
      id: 'P001', kind: 'pick', key: 'theme-picked', title: 'pick a theme', question: null,
      candidates: [
        { group: 'ocean', label: 'signin', path: 'themes/ocean/signin.html' },
        { group: 'ocean', label: 'home', path: 'themes/ocean/home.html' },
        { group: 'ember', label: 'signin', path: 'themes/ember/signin.html' },
      ],
      url: null, openedAt, status: 'open', decision: null, previous: [],
    },
    {
      id: 'P002', kind: 'approve', key: 'x-y', title: 'a stop with an unknown key', question: null,
      candidates: [{ group: null, label: 'a', path: 'shapes/one.html' }],
      url: null, openedAt, status: 'open', decision: null, previous: [],
    },
  ])

  const res = atlas(['build'], { cwd: dir })
  assert.strictEqual(res.status, 0, res.stdout + res.stderr)
  const out = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')

  const shapesIdx = out.indexOf('id="shapes"')
  const themeIdx = out.indexOf('id="theme"')
  assert.ok(shapesIdx !== -1 && themeIdx > shapesIdx, 'a #theme section must be emitted right after the shapes section')

  const themeCmp = sliceElement(out, '<div class="cmp" id="stop-P001" data-kind="pick"')
  assert.ok(themeCmp, 'the theme section must render the theme-picked stop as a compare table')
  assert.strictEqual((themeCmp.match(/class="chead"/g) || []).length, 2, 'exactly two chead columns (ocean, ember) must render')
  assert.match(themeCmp, /data-group="ocean"/)
  assert.match(themeCmp, /data-group="ember"/)
  const steps = themeCmp.match(/class="step">step \d+[^<]*/g) || []
  assert.strictEqual(steps.length, 2, 'exactly two step rows (signin, home) must render: got ' + JSON.stringify(steps))
  assert.match(steps[0], /signin/, 'signin must be the first step row (candidate order)')
  assert.match(steps[1], /home/, 'home must be the second step row')
  assert.strictEqual((themeCmp.match(/<iframe/g) || []).length, 3, 'three frames must render, one per declared candidate')
  assert.match(themeCmp, /class="card empty"/, 'ember\'s missing home label must render an empty cell')

  const stopsIdx2 = out.indexOf('<section id="stops">')
  const stopsBlock2 = out.slice(stopsIdx2, out.indexOf('</section>', stopsIdx2))
  assert.match(stopsBlock2, /href="#stop-P002"/, 'the unknown-key stop must still be listed in the #stops index')
  const afterStops = out.slice(out.indexOf('</section>', stopsIdx2))
  const p002Pos = afterStops.indexOf('id="stop-P002"')
  const firstSectPos = afterStops.indexOf('class="sect"')
  assert.ok(p002Pos !== -1 && (firstSectPos === -1 || p002Pos < firstSectPos),
    'a stop whose key matches no known grammar must render as a standalone block right after #stops, before any class="sect" section')
})

test('AC-20260905-01-7: a decided pick stop renders picked/rejected cheads with badges, a why-line input, and lists under Decided — waiting for the session', () => {
  const dir = tmpdir('atlas-theme-decided')
  for (const p of ['themes/ocean/signin.html', 'themes/ember/signin.html']) {
    fs.mkdirSync(path.join(dir, 'design', path.dirname(p)), { recursive: true })
    fs.writeFileSync(path.join(dir, 'design', p), '<main data-screen-label="x">x</main>\n')
  }
  const openedAt = '2026-01-01T00:00:00.000Z'
  writePicksJson(dir, [{
    id: 'P001', kind: 'pick', key: 'theme-picked', title: 'pick a theme', question: null,
    candidates: [
      { group: 'ocean', label: 'signin', path: 'themes/ocean/signin.html' },
      { group: 'ember', label: 'signin', path: 'themes/ember/signin.html' },
    ],
    url: null, openedAt, status: 'decided',
    decision: { verdict: 'pick', pick: 'ocean', note: null, by: 'jj', at: openedAt },
    previous: [],
  }])

  const res = atlas(['build'], { cwd: dir })
  assert.strictEqual(res.status, 0, res.stdout + res.stderr)
  const out = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')

  const cmp = sliceElement(out, '<div class="cmp" id="stop-P001" data-kind="pick"')
  assert.ok(cmp, 'the decided stop must still render as a compare table element')
  assert.match(cmp, /class="chead picked"[^>]*data-group="ocean"/, 'the picked group\'s chead must carry class "chead picked"')
  assert.match(cmp, /class="chead rejected"[^>]*data-group="ember"/, 'the rejected group\'s chead must carry class "chead rejected"')
  assert.match(cmp, /class="badge picked">picked/, 'the picked chead must carry a picked badge')
  assert.match(cmp, /class="badge rejected">rejected/, 'the rejected chead must carry a rejected badge')
  assert.match(cmp, />Picked</, 'the picked chead\'s button text must read "Picked"')
  assert.match(cmp, />Pick this instead</, 'the rejected chead\'s button text must read "Pick this instead"')
  assert.match(cmp, /name="why-P001"/, 'a why-P001 input must render for a decided pick stop')
  assert.strictEqual((cmp.match(/data-decide="why"/g) || []).length, 1, 'exactly one Save (data-decide="why") button must render')

  const stopsIdx = out.indexOf('<section id="stops">')
  const stopsBlock = out.slice(stopsIdx, out.indexOf('</section>', stopsIdx))
  assert.match(stopsBlock, /Decided — waiting for the session/, 'the #stops index must carry the Decided heading for a decided stop')
  const decidedLine = stopsBlock.slice(stopsBlock.indexOf('Decided — waiting for the session'))
  assert.match(decidedLine, /href="#stop-P001"/)
  assert.match(decidedLine, /ocean/, 'the decided-stop index line must name the picked group (ocean)')
  assert.match(decidedLine, /jj/, 'the decided-stop index line must name the decider (jj)')
})

test('AC-20260905-01-7: a consumed stop, and an absent picks.json, render neither #stops nor any compare table — the plain shape cards render exactly as before', () => {
  const dir = tmpdir('atlas-theme-consumed')
  fs.mkdirSync(path.join(dir, 'design/shapes'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/shapes/card-first.html'), '<main data-screen-label="session-live">card-first</main>\n')

  const openedAt = '2026-01-01T00:00:00.000Z'
  writePicksJson(dir, [{
    id: 'P001', kind: 'pick', key: 'shape-picked', title: 'pick a shape', question: null,
    candidates: [{ group: 'card-first', label: 'session-live', path: 'shapes/card-first.html' }],
    url: null, openedAt, status: 'consumed',
    decision: { verdict: 'pick', pick: 'card-first', note: null, by: 'jj', at: openedAt },
    previous: [],
  }])

  const consumedRes = atlas(['build'], { cwd: dir })
  assert.strictEqual(consumedRes.status, 0, consumedRes.stdout + consumedRes.stderr)
  const consumedOut = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')
  assert.doesNotMatch(consumedOut, /id="stops"/, 'a consumed stop must never emit a #stops section')
  assert.doesNotMatch(consumedOut, /class="cmp"/, 'a consumed stop must never render a compare table')
  assert.match(consumedOut, /card-first/, 'the shapes section must still render the shape\'s own plain card')

  fs.rmSync(path.join(dir, 'design/mocks/picks.json'))
  const absentRes = atlas(['build'], { cwd: dir })
  assert.strictEqual(absentRes.status, 0, absentRes.stdout + absentRes.stderr)
  const absentOut = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')
  assert.doesNotMatch(absentOut, /id="stops"/, 'an absent picks.json must never emit a #stops section')
  assert.doesNotMatch(absentOut, /class="cmp"/, 'an absent picks.json must never render a compare table')
})

test('AC-20260905-01-8: buildAtlas SHALL CONTINUE TO produce byte-identical output across two runs, now including a root whose picks.json holds an open stop', () => {
  const dir = tmpdir('atlas-picks-byte')
  fs.mkdirSync(path.join(dir, 'design/shapes'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/shapes/card-first.html'), '<main data-screen-label="session-live">card-first</main>\n')
  writePicksJson(dir, [{
    id: 'P001', kind: 'pick', key: 'shape-picked', title: 'pick a shape', question: null,
    candidates: [{ group: 'card-first', label: 'session-live', path: 'shapes/card-first.html' }],
    url: null, openedAt: '2026-01-01T00:00:00.000Z', status: 'open', decision: null, previous: [],
  }])
  atlas(['build'], { cwd: dir })
  const a = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')
  atlas(['build'], { cwd: dir })
  const b = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')
  assert.strictEqual(a, b, 'AC-20260902-09-6\'s byte-identical guarantee must extend unchanged to a root carrying picks.json')
})

function hashTree(root) {
  const out = {}
  function walk(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name)
      const st = fs.statSync(p)
      if (st.isDirectory()) walk(p)
      else out[path.relative(root, p)] = fs.readFileSync(p)
    }
  }
  walk(root)
  return out
}

test('AC-20260905-01-8: a POST /__picks/decide leaves every file under design/ unchanged except design/mocks/picks.json', async () => {
  const dir = tmpdir('atlas-picks-untouched')
  fs.mkdirSync(path.join(dir, 'design/shapes'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/shapes/card-first.html'), '<main data-screen-label="session-live">card-first</main>\n')
  fs.writeFileSync(path.join(dir, 'design/shapes/orb-hero.html'), '<main data-screen-label="session-live">orb-hero</main>\n')
  writePicksJson(dir, [{
    id: 'P001', kind: 'pick', key: 'shape-picked', title: 'pick a shape', question: null,
    candidates: [
      { group: 'card-first', label: 'session-live', path: 'shapes/card-first.html' },
      { group: 'orb-hero', label: 'session-live', path: 'shapes/orb-hero.html' },
    ],
    url: null, openedAt: '2026-01-01T00:00:00.000Z', status: 'open', decision: null, previous: [],
  }])
  atlas(['build'], { cwd: dir })

  const designDir = path.join(dir, 'design')
  const before = hashTree(designDir)

  await withHandler(dir, '', async ({ post }) => {
    const r = await post('/__picks/decide', { id: 'P001', verdict: 'pick', pick: 'orb-hero', by: 'jj' })
    assert.strictEqual(r.status, 200, 'the decide POST must succeed: ' + r.status + ' ' + r.body)
  })

  const after = hashTree(designDir)
  const changedFiles = Object.keys({ ...before, ...after }).filter((f) => {
    const b = before[f], a = after[f]
    return !b || !a || !b.equals(a)
  })
  assert.deepStrictEqual(changedFiles, ['mocks/picks.json'],
    'a decide POST must change design/mocks/picks.json only — every other file under design/ (the previously built atlas index included) must stay byte-identical: changed = ' + JSON.stringify(changedFiles))
})

test('AC-20260905-01-9: the served atlas body carries the inline decide script referencing /__picks/decide, the base regex, nl-author, and the required literals; ?clean strips it entirely', async () => {
  const dir = tmpdir('atlas-decide-script')
  fs.mkdirSync(path.join(dir, 'design/shapes'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/shapes/one.html'), '<main data-screen-label="one">one</main>\n')

  await withHandler(dir, '', async ({ get }) => {
    const res = await get('/atlas/index.html')
    assert.strictEqual(res.status, 200, 'the derived atlas must serve 200: ' + res.body)
    for (const literal of [
      '/__picks/decide', '^/p/[^/]+', 'nl-author',
      'open the served atlas to decide', 'already picked up by the session',
      'Pick this instead', 'lb-open',
    ]) {
      assert.ok(res.body.includes(literal), 'the served atlas body must reference "' + literal + '" in its inline decide script')
    }
    for (const verdict of ["verdict:'pick'", "verdict:'approve'", "verdict:'change'"]) {
      assert.ok(res.body.includes(verdict), 'the inline decide script must post ' + verdict + ' on its matching data-decide click')
    }
    assert.ok(res.body.includes('note'), 'a "why" re-post must carry a note field')

    const clean = await get('/atlas/index.html?clean')
    assert.strictEqual(clean.status, 200, 'the ?clean atlas must still serve 200')
    assert.ok(!clean.body.includes('__picks'), '?clean must strip the decide script entirely — no __picks reference may remain')
    assert.ok(!clean.body.includes('lb-open'), '?clean must strip the lightbox-open class hook along with the rest of the script')
  })
})

function makeNotesLayerDom({ metaContent, screenLabel } = {}) {
  const created = []
  function makeEl(tag) {
    const el = {
      tagName: String(tag).toUpperCase(),
      children: [],
      appendChild(c) { this.children.push(c); return c },
      insertAdjacentElement(_pos, c) { return c },
      addEventListener() {},
      setAttribute(k, v) { this[k] = v },
      getAttribute(k) { return this[k] },
      remove() {},
      attachShadow() { const root = makeEl('#shadow-root'); this.shadowRoot = root; return root },
    }
    created.push(el)
    return el
  }
  const head = makeEl('head')
  const body = makeEl('body')
  let metaEl = null
  if (metaContent != null) { metaEl = makeEl('meta'); metaEl.content = metaContent }
  let screenEl = null
  if (screenLabel != null) { screenEl = makeEl('main'); screenEl.setAttribute('data-screen-label', screenLabel) }
  const document = {
    head, body,
    createElement: makeEl,
    querySelector(sel) {
      if (sel === 'meta[name="notes-scope"]') return metaEl
      if (sel === '[data-screen-label]') return screenEl
      return null
    },
    querySelectorAll() { return [] },
  }
  return { document, created }
}

function evalNotesLayer({ pathname, metaContent, screenLabel }) {
  const src = fs.readFileSync(path.join(SPEC, 'scripts/lib/notes-layer.browser.js'), 'utf8')
  const { document, created } = makeNotesLayerDom({ metaContent, screenLabel })
  const fetchCalls = []
  const sandbox = {
    location: { pathname, search: '' },
    document,
    window: { prompt: () => 'jj' },
    localStorage: { getItem: () => 'jj', setItem() {} },
    fetch(url) { fetchCalls.push(url); return Promise.resolve({ json: () => Promise.resolve([]) }) },
    URLSearchParams,
  }
  vm.createContext(sandbox)
  vm.runInContext(src, sandbox)
  return { fetchCalls, created, document }
}

test('AC-20260905-01-10: notes-layer.browser.js under vm shows only the mock strip and its bar for a page declaring notes-scope mock, fetching only its own screen', () => {
  const { fetchCalls, created } = evalNotesLayer({ pathname: '/p/hearwell/mocks/a.html', metaContent: 'mock', screenLabel: 'a' })
  assert.ok(fetchCalls.includes('/p/hearwell/__notes/list?screen=a'),
    'a mock-scope page must fetch its own screen\'s notes under the derived base: got ' + JSON.stringify(fetchCalls))
  assert.ok(!fetchCalls.some((u) => /screen=\*/.test(u)),
    'a mock-scope page must never fetch the project-wide notes list (screen=*): got ' + JSON.stringify(fetchCalls))
  assert.ok(!created.some((el) => el.className === 'nl-proj'), 'a mock-scope page must create no nl-proj element — the project panel belongs on the index only')
  assert.ok(!created.some((el) => el.textContent === '+ Project note'), 'a mock-scope page must create no "+ Project note" button')
  assert.ok(created.some((el) => el.href === '/p/hearwell/__notes/viewer.css'), 'the stylesheet link must be derived under the same /p/hearwell base')
})

test('AC-20260905-01-10: notes-layer.browser.js under vm shows only the project panel and its bar for the atlas index (notes-scope project) even though the index carries a data-screen-label root (A6)', () => {
  const { fetchCalls, created } = evalNotesLayer({ pathname: '/atlas/index.html', metaContent: 'project', screenLabel: 'some-frame-wrapper-label' })
  // specs/20260907/09-atlas-index-and-note-navigation.md D6: refresh() requests screen=** (every
  // note, no scope filter) when its declared scope is project — screen=*'s own meaning is
  // unchanged and separately pinned by AC-20260907-09-8.
  assert.ok(fetchCalls.includes('/__notes/list?screen=**'),
    'D6: a project-scope page must fetch every note (screen=**) under the empty base: got ' + JSON.stringify(fetchCalls))
  assert.ok(!fetchCalls.some((u) => u.includes('screen=') && !u.includes('screen=*') && !u.includes('screen=**')),
    'a project-scope page must never fetch a per-screen notes list, even though a [data-screen-label] root exists: got ' + JSON.stringify(fetchCalls))
  assert.ok(!created.some((el) => el.className === 'nl-strip'),
    'a project-scope page must create no nl-strip element — the declared meta scope must win over A6\'s inference trap')
})

test('AC-20260905-01-10: with no notes-scope meta and a screen root present, notes-layer.browser.js falls back to mock scope', () => {
  const { fetchCalls, created } = evalNotesLayer({ pathname: '/mocks/a.html', metaContent: null, screenLabel: 'a' })
  assert.ok(fetchCalls.includes('/__notes/list?screen=a'),
    'absent meta with a screen root must fall back to mock scope, fetching that screen\'s notes: got ' + JSON.stringify(fetchCalls))
  assert.ok(!created.some((el) => el.className === 'nl-proj'), 'the meta-absent mock fallback must create no nl-proj element')
})

test('AC-20260905-01-10: the injected CSS carries a body.lb-open rule that hides the chrome hosts (the bar lives behind an .nl-host shadow root)', () => {
  const { created, document } = evalNotesLayer({ pathname: '/mocks/a.html', metaContent: 'mock', screenLabel: 'a' })
  const headStyles = document.head.children.filter((el) => el.tagName === 'STYLE' && typeof el.textContent === 'string')
  assert.strictEqual(headStyles.length, 1, 'exactly one <style> may be appended to the served document\'s <head>: got ' + headStyles.length)
  const idx = headStyles[0].textContent.indexOf('body.lb-open')
  assert.ok(idx !== -1, 'the document-level CSS must contain a body.lb-open selector so the chrome can hide while the lightbox is open: got ' + headStyles[0].textContent)
  const ruleEnd = headStyles[0].textContent.indexOf('}', idx)
  const rule = headStyles[0].textContent.slice(idx, ruleEnd === -1 ? headStyles[0].textContent.length : ruleEnd + 1)
  assert.match(rule, /\.nl-host/, 'the body.lb-open rule must hide the .nl-host shadow hosts (the bar is inside one): got ' + rule)
  const bar = created.find((el) => el.className === 'nl-bar')
  assert.ok(bar, 'the bar element must still be created')
  const host = created.find((el) => el.shadowRoot && el.shadowRoot.children.includes(bar))
  assert.ok(host && host.className === 'nl-host', 'the bar must be appended inside an .nl-host element\'s shadow root, never directly to the document')
  assert.ok(host.shadowRoot.children.some((el) => el.tagName === 'LINK' && el.href === '/__notes/viewer.css'),
    'the viewer.css link must live inside the same shadow root as the bar')
  assert.ok(!document.head.children.some((el) => el.tagName === 'LINK'), 'no <link> may be appended to the served document\'s <head>')
})

test('AC-20260905-01-12: spec/doctrine/mocks.md documents Picks under § Mocks: Page Notes (D8: no entrypoints row)', () => {
  const doctrine = read('spec/doctrine/mocks.md')
  const pageNotesIdx = doctrine.indexOf('## Mocks: Page Notes')
  assert.ok(pageNotesIdx !== -1, 'the § Mocks: Page Notes heading must exist to anchor the new Picks paragraph')
  const nextHeadingIdx = doctrine.indexOf('\n## ', pageNotesIdx + 1)
  const section = doctrine.slice(pageNotesIdx, nextHeadingIdx === -1 ? doctrine.length : nextHeadingIdx)
  for (const literal of ['picks.json', 'Pick this', 'one scope per page', 'notes-scope', 'compare table', 'mocks-picks.js']) {
    assert.ok(section.includes(literal),
      'the § Mocks: Page Notes section must document "' + literal + '" in its new Picks paragraph — an author reading this doctrine section has no other reference for the picks flow')
  }
})

test('check: labeled token-consuming mocks pass; label/tokens/color violations fail closed (AC-20260901-04-6)', () => {
  const dir = fixture()
  const ok = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(ok.status, 0, ok.stdout + ok.stderr)
  assert.match(ok.stdout, /CHECK PASS \(2 file/)

  fs.mkdirSync(path.join(dir, 'design/explore/r0-bad'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/explore/r0-bad/tile.html'),
    '<main style="color:#fff">no label, no tokens link</main>\n')
  const bad = atlas(['check', path.join(dir, 'design/explore/r0-bad')])
  assert.strictEqual(bad.status, 1)
  assert.match(bad.stdout, /no data-screen-label/)
  assert.match(bad.stdout, /does not link a tokens\.css/)
  assert.match(bad.stdout, /off-token color literal/)
})

// specs/20260906/05-gray-states-on-every-wireframe.md D1, AC-20260906-05-1: `check --states`
// requires a labeled non-canon mock to declare empty/loading/error via data-state-btn, or opt a
// name out on the root via data-no-state — with a shell canon file exempt entirely. TDD red:
// cmdCheck today filters only `--matrix` out of its path list, so a bare `--states` is read as a
// nonexistent path and every assertion below sees exit 2 ("no such path: --states") instead.
test('AC-20260906-05-1: check --states passes a mock declaring all three data-state-btn states, fails naming missing ones in empty/loading/error order, passes with a matching data-no-state opt-out, fails on an unknown data-no-state name, and exempts a shell canon file', () => {
  const dir = tmpdir('atlas-states')

  const full = path.join(dir, 'design/mocks/full.html')
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full,
    '<link rel="stylesheet" href="../tokens.css">\n' +
    '<main data-screen-label="full">\n' +
    '  <button data-state-btn="empty">empty</button>\n' +
    '  <button data-state-btn="loading">loading</button>\n' +
    '  <button data-state-btn="error">error</button>\n' +
    '  full\n' +
    '</main>\n')
  const passRes = atlas(['check', '--states', full])
  assert.strictEqual(passRes.status, 0,
    'a mock declaring data-state-btn for empty, loading, and error must pass --states with exit 0: ' + passRes.stdout + passRes.stderr)
  assert.match(passRes.stdout, /CHECK PASS \(1 file\(s\)\)/,
    'a passing --states run must print the exact CHECK PASS line, unchanged from a plain check: ' + passRes.stdout)

  const partial = path.join(dir, 'design/mocks/partial.html')
  fs.writeFileSync(partial,
    '<link rel="stylesheet" href="../tokens.css">\n' +
    '<main data-screen-label="partial">\n' +
    '  <button data-state-btn="empty">empty</button>\n' +
    '  partial\n' +
    '</main>\n')
  const missingRes = atlas(['check', '--states', partial])
  assert.strictEqual(missingRes.status, 1,
    'a mock declaring only the "empty" state must fail --states with exit 1: ' + missingRes.stdout + missingRes.stderr)
  const missingLineRe = new RegExp(partial.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    ': missing state\\(s\\) loading, error — every wireframe carries its empty, loading and error states')
  assert.match(missingRes.stdout, missingLineRe,
    'the missing-states violation must name the file and the exact D1 message with the missing names filtered in empty, loading, error order, or an author cannot tell which states to draw: ' + missingRes.stdout)

  const optOut = path.join(dir, 'design/mocks/optout.html')
  fs.writeFileSync(optOut,
    '<link rel="stylesheet" href="../tokens.css">\n' +
    '<main data-screen-label="optout" data-no-state="loading,error">\n' +
    '  <button data-state-btn="empty">empty</button>\n' +
    '  optout\n' +
    '</main>\n')
  const optOutRes = atlas(['check', '--states', optOut])
  assert.strictEqual(optOutRes.status, 0,
    'data-no-state="loading,error" opting out of the two missing states must pass --states — the opt-out is honored, not ignored: ' + optOutRes.stdout + optOutRes.stderr)

  const unknown = path.join(dir, 'design/mocks/unknown.html')
  fs.writeFileSync(unknown,
    '<link rel="stylesheet" href="../tokens.css">\n' +
    '<main data-screen-label="unknown" data-no-state="busy">\n' +
    '  <button data-state-btn="empty">empty</button>\n' +
    '  <button data-state-btn="loading">loading</button>\n' +
    '  <button data-state-btn="error">error</button>\n' +
    '  unknown\n' +
    '</main>\n')
  const unknownRes = atlas(['check', '--states', unknown])
  assert.strictEqual(unknownRes.status, 1,
    'an unknown data-no-state name must fail --states even though every real state is separately declared — a typo\'d opt-out must never silently pass: ' + unknownRes.stdout + unknownRes.stderr)
  assert.match(unknownRes.stdout, /unknown state "busy"/,
    'the unknown-name violation must contain the exact D1 phrase naming the bad value "busy": ' + unknownRes.stdout)

  const canon = path.join(dir, 'design/shell/topbar.html')
  fs.mkdirSync(path.dirname(canon), { recursive: true })
  fs.writeFileSync(canon,
    '<link rel="stylesheet" href="../tokens.css">\n' +
    '<link rel="stylesheet" href="topbar.css">\n' +
    '<style>* { box-sizing: border-box; }</style>\n' +
    '<div data-shell-canon="topbar" class="shell">\n' +
    '  <main data-slot="content"></main>\n' +
    '</div>\n')
  const canonRes = atlas(['check', '--states', canon])
  assert.strictEqual(canonRes.status, 0,
    'a shell canon file must be exempt from --states — it is chrome, never a screen with its own empty/loading/error states: ' + canonRes.stdout + canonRes.stderr)
  assert.match(canonRes.stdout, /CHECK PASS \(1 file\(s\)\)/,
    'the exempt canon file must still print CHECK PASS, not merely a non-1 exit code: ' + canonRes.stdout)
})

// AC-20260906-05-2: a green-pre-change continuity pin (core § Incident Policy's "absence of a
// not-yet-built mechanism" pattern) — cmdCheck's behavior with no --states flag is untouched by
// D1, so this assertion already holds against the pre-image and must keep holding once --states
// exists; it is authored now so a future change to the default path is caught the same run.
test('AC-20260906-05-2: check with no --states flag continues to print byte-identical CHECK PASS output for a happy-path-only mock, unaffected by the new states rule', () => {
  const dir = tmpdir('atlas-states-legacy')
  const happy = path.join(dir, 'design/mocks/happy.html')
  fs.mkdirSync(path.dirname(happy), { recursive: true })
  fs.writeFileSync(happy,
    '<link rel="stylesheet" href="../tokens.css">\n' +
    '<main data-screen-label="happy">happy path only, no state controls</main>\n')

  const first = atlas(['check', happy])
  assert.strictEqual(first.status, 0,
    'check with no --states flag must pass a happy-path-only mock exit 0, exactly as before D1: ' + first.stdout + first.stderr)
  assert.strictEqual(first.stdout, 'CHECK PASS (1 file(s))\n',
    'check with no --states flag must print byte-identical output to today for a happy-path-only mock — any extra line here means the new states rule leaked into the default path: ' + JSON.stringify(first.stdout))

  const second = atlas(['check', happy])
  assert.strictEqual(second.stdout, first.stdout,
    'check with no --states flag must stay reproducible byte-for-byte across runs, exactly as every other check output already is: ' + JSON.stringify(second.stdout))
})

// specs/20260902/09-one-hand-wireframes-one-token-set.md D5, AC-20260902-09-5: page() reads
// spec/templates/mocks/viewer.css and inlines it before its own rules, and every chrome rule
// (badges, bar, cards, gap chips, lightbox, matrix toolbar, gallery cards) is rewritten onto
// var(--v-*) roles — no chrome literal survives in the emitted page's <style>. page() today has
// no viewer.css read at all and every current chrome rule is a literal hex color (#111, #333,
// #8fa8ff, …), so both tests below are red pre-D5.
function assertChromeTokenized(out, label) {
  const styleMatch = out.match(/<style>([\s\S]*?)<\/style>/)
  assert.ok(styleMatch, label + ': the emitted page must carry a <style> block to inspect for chrome literals')
  const style = styleMatch[1]
  assert.match(style, /--v-bg:/,
    label + ": the inlined chrome stylesheet must declare --v-bg — D5 requires viewer.css's " +
    "full --v-* register to be inlined into every chrome page's own <style> block")
  const withoutRoot = style.replace(/:root\s*\{[\s\S]*?\}/, '')
  assert.doesNotMatch(withoutRoot, /#[0-9a-f]{3,8}\b/i,
    label + ' no hex color literal may survive in the chrome CSS outside the inlined ' +
    ':root{…} block — every chrome rule must consume a var(--v-*) role, never a literal color')
}

test("AC-20260902-09-5: build emits a page whose <style> inlines viewer.css's --v-* register with no literal chrome color outside :root{…}", () => {
  const dir = fixture()
  const res = atlas(['build'], { cwd: dir })
  assert.strictEqual(res.status, 0, res.stdout + res.stderr)
  const out = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')
  assertChromeTokenized(out, 'build:')
})

test("AC-20260902-09-5: gallery emits a page whose <style> inlines viewer.css's --v-* register with no literal chrome color outside :root{…}", () => {
  const dir = fixture()
  fs.mkdirSync(path.join(dir, 'design/explore/r0-instrument'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/explore/r0-instrument/tile.html'),
    '<link rel="stylesheet" href="./tokens.css">\n<main data-screen-label="signin">t</main>\n')
  const res = atlas(['gallery', path.join(dir, 'design/explore')])
  assert.strictEqual(res.status, 0, res.stdout + res.stderr)
  const out = fs.readFileSync(path.join(dir, 'design/explore/gallery.html'), 'utf8')
  assertChromeTokenized(out, 'gallery:')
})

test('gallery: one card per candidate subdir, lazy iframes, deterministic output path', () => {
  const dir = fixture()
  for (const c of ['r0-instrument', 'r0-guide']) {
    fs.mkdirSync(path.join(dir, 'design/explore', c), { recursive: true })
    fs.writeFileSync(path.join(dir, 'design/explore', c, 'tile.html'),
      '<link rel="stylesheet" href="./tokens.css">\n<main data-screen-label="signin">t</main>\n')
  }
  const res = atlas(['gallery', path.join(dir, 'design/explore')])
  assert.strictEqual(res.status, 0, res.stdout + res.stderr)
  const out = fs.readFileSync(path.join(dir, 'design/explore/gallery.html'), 'utf8')
  assert.match(out, /r0-guide/)
  assert.match(out, /r0-instrument/)
  assert.match(out, /loading="lazy"/)
})

test('build: statuses derive from mocks × surfaces × ledger × spec stamps — never declared by hand', () => {
  const dir = fixture()
  const res = atlas(['build'], { cwd: dir })
  assert.strictEqual(res.status, 0, res.stdout + res.stderr)
  const out = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')
  // lobby: ledger-claimed by a done spec → built; thread: mock only → sketch;
  // signin/account: declared, no mock → gap cards.
  assert.match(res.stdout, /1 built/)
  assert.match(res.stdout, /2 gap/)
  assert.match(res.stdout, /1 sketch/)
  assert.match(out, /badge built/)
  assert.match(out, /declared, no mock yet/)
  assert.match(out, /"source":"lobby","target":"thread"/, 'journey edges must reach the graph data')
  assert.match(out, /loading="lazy"/)
})

test('build: a mock with no brief AND no claim is an orphan; a non-done claiming spec is bound, not built', () => {
  const dir = fixture()
  fs.writeFileSync(path.join(dir, 'design/mocks/rogue.html'),
    '<link rel="stylesheet" href="../tokens.css">\n<main data-screen-label="rogue">R</main>\n')
  fs.writeFileSync(path.join(dir, 'specs/20260716/01-x.md'), '---\nstatus: implementing\n---\n# x\n')
  const res = atlas(['build'], { cwd: dir })
  assert.strictEqual(res.status, 0, res.stdout + res.stderr)
  const out = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')
  assert.match(out, /badge orphan/)
  assert.match(out, /badge bound/)
  assert.doesNotMatch(out, /badge built/)
})

test('build: a ledger-claimed mock is NOT an orphan even when no brief declares it (standalone-spec mocks)', () => {
  const dir = fixture()
  // solo: undeclared in any surfaces block, but claimed by a spec via the coverage ledger
  fs.writeFileSync(path.join(dir, 'design/mocks/solo.html'),
    '<link rel="stylesheet" href="../tokens.css">\n<main data-screen-label="solo">S</main>\n')
  fs.writeFileSync(path.join(dir, '.claude/design-coverage.json'), JSON.stringify({
    sources: { 'design/mocks': { regions: {
      'lobby#root': { spec: 'specs/20260716/01-x.md', at: '2026-07-16' },
      'solo#root': { spec: 'specs/20260716/01-x.md', at: '2026-07-16' },
    } } },
  }))
  const res = atlas(['build'], { cwd: dir })
  assert.strictEqual(res.status, 0, res.stdout + res.stderr)
  const out = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')
  assert.doesNotMatch(out, /badge orphan/)
  assert.match(out, /id="s-solo"/)
})

const TARGETS = JSON.stringify({
  schemaVersion: 1,
  themes: ['light', 'dark'],
  viewports: [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 834, height: 1112 },
    { name: 'desktop', width: 1280, height: 800 },
  ],
})

test('check: matrix binds at approved (or --matrix); sketches iterate one framing for free', () => {
  const dir = fixture()
  fs.writeFileSync(path.join(dir, 'design/targets.json'), TARGETS)
  // fixture: lobby is approved (owes the matrix), thread is a sketch (exempt); no viewport
  // meta anywhere, and the linked tokens.css does not exist
  const bad = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(bad.status, 1)
  assert.match(bad.stdout, /lobby\.html: no <meta name="viewport">/)
  assert.match(bad.stdout, /lobby\.html: dark theme declared .* tokens\.css is unreadable/)
  assert.doesNotMatch(bad.stdout, /thread\.html: no <meta/, 'sketch mocks are exempt without --matrix')

  // --matrix forces the checks onto drafts too (the post-approval expansion gate)
  const forced = atlas(['check', '--matrix', path.join(dir, 'design/mocks')])
  assert.strictEqual(forced.status, 1)
  assert.match(forced.stdout, /thread\.html: no <meta name="viewport">/)

  // light-only tokens: the approved mock still fails on the missing dark block
  fs.writeFileSync(path.join(dir, 'design/tokens.css'), ':root{--text-body:#111}\n')
  const noDark = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(noDark.status, 1)
  assert.match(noDark.stdout, /no dark theme block/)

  // expanded: responsive single file + themed tokens → pass, sketch untouched
  fs.appendFileSync(path.join(dir, 'design/tokens.css'), ':root[data-theme="dark"]{--text-body:#eee}\n')
  fs.writeFileSync(path.join(dir, 'design/mocks/lobby.html'),
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<link rel="stylesheet" href="../tokens.css">\n' +
    '<style>* { box-sizing: border-box; }</style>\n' +
    '<main data-screen-label="lobby" data-status="approved">x</main>\n')
  const ok = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(ok.status, 0, ok.stdout + ok.stderr)
})

test('build/gallery: matrix toolbar emitted only when targets.json exists', () => {
  const dir = fixture()
  atlas(['build'], { cwd: dir })
  let out = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')
  assert.doesNotMatch(out, /data-vp/, 'no toolbar without targets.json')

  fs.writeFileSync(path.join(dir, 'design/targets.json'), TARGETS)
  atlas(['build'], { cwd: dir })
  out = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')
  assert.match(out, /mobile 390/)
  assert.match(out, /desktop 1280/)
  assert.match(out, /setAttribute\("data-theme",t\)/, 'theme toggle stamps data-theme on frames')
  assert.match(out, /querySelector\("\.vp"\)[^\n]*textContent=w\+"\\u00d7"\+h/,
    'viewport toggle rewrites each card\'s WxH label (JJ 2026-09-05: label stuck at 390×844 after desktop)')

  fs.mkdirSync(path.join(dir, 'design/explore/r0-a'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/explore/r0-a/tile.html'),
    '<link rel="stylesheet" href="./tokens.css">\n<main data-screen-label="signin">t</main>\n')
  atlas(['gallery', path.join(dir, 'design/explore')])
  const gal = fs.readFileSync(path.join(dir, 'design/explore/gallery.html'), 'utf8')
  assert.match(gal, /tablet 834/, 'gallery finds design/targets.json by walking up')
})

test('AC-20260902-09-6: build output is byte-identical across two runs (no timestamps, sorted walks)', () => {
  const dir = fixture()
  atlas(['build'], { cwd: dir })
  const a = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')
  atlas(['build'], { cwd: dir })
  const b = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')
  assert.strictEqual(a, b)
})

// specs/20260824/03-mock-states-hygiene.md D1: `check` gains four hygiene rules bound at
// data-status ratified|approved (or --matrix), each pinned to a measured false-positive
// class. D2 makes `ratified` equivalent to `approved` for every existing check too. These
// checks do not exist on the pre-spec script — every test below is red until cmdCheck grows
// checks (a)-(d) and statusOf's `approved`-only matrix gate widens to include `ratified`.
// mockHtml() builds an otherwise-fully-compliant ratified mock so each test isolates exactly one
// hygiene rule via a single mutation, per the spec's own worked AC examples.

function mockHtml({ style, status = 'ratified', beforeRoot = '',
  stateBtn = '<div data-contract="none"><button data-state-btn="empty">Empty</button></div>' } = {}) {
  return '<link rel="stylesheet" href="../tokens.css">\n' +
    beforeRoot +
    '<style>\n' + style + '\n</style>\n' +
    '<main class="screen" data-screen-label="lobby" data-status="' + status + '">\n' +
    stateBtn + '\nLobby\n</main>\n'
}

function writeMock(dir, html) {
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  const p = path.join(dir, 'design/mocks/lobby.html')
  fs.writeFileSync(p, html)
  return p
}

test('check: a ratified mock with no universal box-sizing: border-box rule fails closed; the reset alone passes (AC-20260824-03-1)', () => {
  const dir = tmpdir('atlas')
  writeMock(dir, mockHtml({ style: '.screen { color: var(--text-body); }' }))
  const bad = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(bad.status, 1,
    'a ratified mock with no universal border-box reset must fail check: bordered elements measure ' +
    '2px larger than the component box — ' + bad.stdout + bad.stderr)
  assert.match(bad.stdout,
    /no universal box-sizing: border-box rule — bordered elements measure 2px larger than the component's border-box/,
    'the exact D1(a) violation string must be printed so the author knows which hygiene rule to add')

  writeMock(dir, mockHtml({ style: '* { box-sizing: border-box; }\n.screen { color: var(--text-body); }' }))
  const good = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(good.status, 0, 'the universal reset alone must clear the border-box check — ' + good.stdout + good.stderr)
  assert.doesNotMatch(good.stdout, /no universal box-sizing: border-box rule/,
    'the border-box violation must not fire once the universal reset is present')

  // A bound mock that externalizes ALL its CSS has no rules for (a)-(c) to read, so (a) is the only
  // signal the author gets that the stylesheet the gate reads is not the one they wrote — exempting
  // style-less files is the fail-open D5 forbids.
  fs.writeFileSync(path.join(dir, 'design/mocks/lobby.html'),
    '<link rel="stylesheet" href="../tokens.css">\n<link rel="stylesheet" href="./ext.css">\n' +
    '<main class="screen" data-screen-label="lobby" data-status="ratified">Lobby</main>\n')
  const externalized = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(externalized.status, 1,
    'a bound mock with no <style> of its own must still owe the border-box reset: it is the only ' +
    'hygiene signal that reaches a mock whose CSS lives outside the file — ' +
    externalized.stdout + externalized.stderr)
  assert.match(externalized.stdout, /no universal box-sizing: border-box rule/,
    'check (a) must bind on every ratified|approved file, never skip one for carrying no <style>')
})

test("check: a ratified mock's font-size rule with no line-height fails; a declared leading passes (AC-20260824-03-2)", () => {
  const dir = tmpdir('atlas')
  writeMock(dir, mockHtml({ style: '* { box-sizing: border-box; }\n.label { font-size: 12px; }' }))
  const bad = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(bad.status, 1,
    'a font-size rule with no line-height must fail check: undeclared leading is up to 13% height ' +
    'error the gate cannot see — ' + bad.stdout + bad.stderr)
  assert.match(bad.stdout,
    /1 CSS block\(s\) declare font-size without line-height \(first: \.label\) — undeclared leading is up to 13% height error the gate cannot see/,
    'the exact D1(b) violation string, including the first-offender selector, must be printed')

  writeMock(dir, mockHtml({ style: '* { box-sizing: border-box; }\n.label { font-size: 12px; line-height: 1.4; }' }))
  const good = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(good.status, 0, 'a declared line-height in the same block must clear the check — ' + good.stdout + good.stderr)
  assert.doesNotMatch(good.stdout, /declare font-size without line-height/,
    'the line-height violation must not fire once the block declares one')
})

test('check: a ratified root class declaring border/border-radius fails as a device frame; a frameless root passes (AC-20260824-03-3)', () => {
  const dir = tmpdir('atlas')
  writeMock(dir, mockHtml({ style: '* { box-sizing: border-box; }\n.screen { border: 1px solid var(--border); border-radius: 36px; }' }))
  const bad = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(bad.status, 1,
    'a bordered root rule must fail check: a device frame shifts every measured box by the frame width — ' +
    bad.stdout + bad.stderr)
  assert.match(bad.stdout,
    /root rule \.screen declares border\/border-radius — a device frame shifts every measured box by the frame width/,
    'the exact D1(c) violation string, naming the matched root class, must be printed')

  writeMock(dir, mockHtml({ style: '* { box-sizing: border-box; }\n.screen { color: var(--text-body); }' }))
  const good = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(good.status, 0, 'a root rule with neither border nor border-radius must clear the check — ' + good.stdout + good.stderr)
  assert.doesNotMatch(good.stdout, /declares border\/border-radius/,
    'the device-frame violation must not fire once the root rule drops border and border-radius')
})

test('check: a data-state-btn inside the ratified root with no data-contract="none" ancestor fails; before-root or contract-none placement passes (AC-20260824-03-4)', () => {
  const dir = tmpdir('atlas')
  const baseStyle = '* { box-sizing: border-box; }\n.screen { color: var(--text-body); }'

  writeMock(dir, mockHtml({ style: baseStyle, stateBtn: '<button data-state-btn="empty">Empty</button>' }))
  const bad = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(bad.status, 1,
    'a state control sitting bare inside the root must fail check: state switchers are tooling, never contract — ' +
    bad.stdout + bad.stderr)
  assert.match(bad.stdout,
    /data-state-btn control inside the \[data-screen-label\] root without a data-contract="none" ancestor — state switchers are tooling, never contract/,
    'the exact D1(d) violation string must be printed')

  writeMock(dir, mockHtml({ style: baseStyle, stateBtn: '', beforeRoot: '<button data-state-btn="empty">Empty</button>\n' }))
  const beforeRootOk = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(beforeRootOk.status, 0,
    'a state control placed before the root opening tag must clear the check — ' + beforeRootOk.stdout + beforeRootOk.stderr)
  assert.doesNotMatch(beforeRootOk.stdout, /data-state-btn control inside/,
    'the state-control violation must not fire for controls that precede the root in the file')

  writeMock(dir, mockHtml({ style: baseStyle }))
  const contractNoneOk = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(contractNoneOk.status, 0,
    'a state control wrapped in a data-contract="none" ancestor must clear the check — ' +
    contractNoneOk.stdout + contractNoneOk.stderr)
  assert.doesNotMatch(contractNoneOk.stdout, /data-state-btn control inside/,
    'the state-control violation must not fire once a data-contract="none" ancestor wraps the control')
})

test('check: ratified now binds the viewport-meta matrix check exactly like approved; sketch stays exempt (AC-20260824-03-5)', () => {
  const dir = tmpdir('atlas')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/targets.json'), TARGETS)
  fs.writeFileSync(path.join(dir, 'design/tokens.css'),
    ':root{--text-body:#111}\n:root[data-theme="dark"]{--text-body:#eee}\n')
  fs.writeFileSync(path.join(dir, 'design/mocks/ratified.html'),
    '<link rel="stylesheet" href="../tokens.css">\n' +
    '<style>* { box-sizing: border-box; }\n.screen { color: var(--text-body); }</style>\n' +
    '<main class="screen" data-screen-label="lobby" data-status="ratified">Lobby</main>\n')
  fs.writeFileSync(path.join(dir, 'design/mocks/sketch.html'),
    '<link rel="stylesheet" href="../tokens.css">\n' +
    '<main data-screen-label="draft" data-status="sketch">Draft</main>\n')

  const res = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(res.status, 1,
    'a ratified mock missing viewport meta must fail the matrix check exactly as an approved mock does — ' +
    res.stdout + res.stderr)
  assert.match(res.stdout, /ratified\.html: no <meta name="viewport">/,
    'D2: ratified is equivalent to approved for the matrix checks, so this must fire without --matrix')
  assert.doesNotMatch(res.stdout, /sketch\.html: no <meta/,
    'sketch mocks stay exempt from the matrix even once ratified counts as approved')
})

test("check: unbalanced braces in a ratified mock's <style> fail closed instead of silently skipping the parse (AC-20260824-03-6)", () => {
  const dir = tmpdir('atlas')
  writeMock(dir, mockHtml({ style: '.a { color: var(--x);' }))
  const bad = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(bad.status, 1,
    'unbalanced braces in the style block must fail closed: D5 requires naming the file, never a silent skip — ' +
    bad.stdout + bad.stderr)
  assert.match(bad.stdout, /unbalanced braces in <style> — fix the stylesheet before ratifying/,
    'the exact D1/D5 violation string must be printed for the file')

  writeMock(dir, mockHtml({ style: '* { box-sizing: border-box; }\n.screen { color: var(--text-body); }' }))
  const good = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(good.status, 0, 'balanced braces must not trip the unbalanced-braces check — ' + good.stdout + good.stderr)
  assert.doesNotMatch(good.stdout, /unbalanced braces in <style>/,
    'the unbalanced-braces violation must not fire when the style block is well-formed')
})

// specs/20260906/06-sketch-high-fidelity-and-critique.md D1, AC-20260906-06-1/-2: `check` flags a
// mock that still links the wireframe register (wire/) once design/tokens.css exists above it —
// violation at ratified only, ⚠️ warn at sketch, `approved` exempt with or without --matrix. TDD
// red: cmdCheck today has no wire-register rule at all, so a ratified mock linking wire/wire.css
// alongside tokens.css passes clean today and a sketch mock prints no warn line for it.
function wireAfterThemeMock(status) {
  return mockHtml({
    status,
    style: '* { box-sizing: border-box; }\n.screen { color: var(--text-body); }',
    beforeRoot: '<link rel="stylesheet" href="../wire/wire.css">\n',
  })
}

// Retagged AC-20260907-06-7 (specs/20260907/06-theme-pick-moves-to-sketch.md D6): the theme is
// now picked in sketch, not in a retired mocks THEME state, so the violation literal loses the
// retired state name — "after THEME" becomes "after the theme pick". The rule's binding, its
// warn/violation stamp split and the no-tokens.css absence invariant (below) are untouched;
// only the literal changes. TDD red: mocks-driver.js's pre-image text still reads "after THEME",
// so this test's asserted literal and its "no `after THEME` anywhere" check are both false today.
test('AC-20260907-06-7 (retag of AC-20260906-06-1): check flags a mock linking wire/wire.css once design/tokens.css exists above it — violation at ratified, ⚠️ warn at sketch, exempt at approved with and without --matrix, a wire-free mock always passes, and the message never says "after THEME"', () => {
  const dir = tmpdir('atlas-wire-after-theme')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/tokens.css'), ':root{--text-body:#111}\n')

  const mockPath = writeMock(dir, wireAfterThemeMock('ratified'))
  const violationMsg = 'links the wireframe register (wire/) after the theme pick — skin it in the picked theme (design/tokens.css)'

  const ratified = atlas(['check', mockPath])
  assert.strictEqual(ratified.status, 1,
    'a ratified mock still linking wire/wire.css once design/tokens.css exists above it must fail check — D1\'s register-after-theme rule is missing: ' + ratified.stdout + ratified.stderr)
  assert.ok(ratified.stdout.includes('  - ' + mockPath + ': ' + violationMsg),
    'the D1 violation line must be printed verbatim, naming the file and the remedy, with the theme-pick wording (not the retired "after THEME"): ' + ratified.stdout)
  assert.doesNotMatch(ratified.stdout, /after THEME/,
    'D6 retires the "after THEME" wording outright — no occurrence may survive anywhere in check\'s output: ' + ratified.stdout)

  writeMock(dir, wireAfterThemeMock('sketch'))
  const sketch = atlas(['check', mockPath])
  assert.strictEqual(sketch.status, 0,
    'the same mock at data-status="sketch" must pass check (exit 0) — D1 warns at sketch, it never fails the gate: ' + sketch.stdout + sketch.stderr)
  assert.ok(sketch.stdout.includes('  ⚠️ ' + mockPath + ': ' + violationMsg),
    'the sketch-stage run must print the same D1 line prefixed "  ⚠️ " as a warning (the shell-family warn/violation split D1 copies, A1), not silence it: ' + sketch.stdout)
  assert.doesNotMatch(sketch.stdout, /after THEME/,
    'the sketch-stage warn line must also carry the theme-pick wording, never the retired "after THEME": ' + sketch.stdout)

  writeMock(dir, wireAfterThemeMock('approved'))
  for (const extra of [[], ['--matrix']]) {
    const approved = atlas(['check', ...extra, mockPath])
    assert.strictEqual(approved.status, 0,
      'data-status="approved" must be exempt from D1 regardless of --matrix — /spec:mocks stamps gray wireframes approved by design: ' + JSON.stringify(extra) + ' ' + approved.stdout + approved.stderr)
    assert.doesNotMatch(approved.stdout, /wireframe register/,
      'an approved mock must print no line containing "wireframe register", warn or violation, with or without --matrix: ' + JSON.stringify(extra) + ' ' + approved.stdout)
  }

  writeMock(dir, mockHtml({ status: 'ratified', style: '* { box-sizing: border-box; }\n.screen { color: var(--text-body); }' }))
  const clean = atlas(['check', mockPath])
  assert.strictEqual(clean.status, 0,
    'a ratified mock linking only ../tokens.css (no wire/ link) must pass check — D1 must never fire on a properly reworked mock: ' + clean.stdout + clean.stderr)
  assert.doesNotMatch(clean.stdout, /wireframe register/,
    'a wire-free ratified mock must print no wireframe-register line at all: ' + clean.stdout)
})

// AC-20260906-06-2, retagged AC-20260907-06-11 (specs/20260907/06-theme-pick-moves-to-sketch.md):
// a "SHALL CONTINUE TO" continuity pin (core § Incident Policy's "absence of a not-yet-built
// mechanism" pattern) — with no design/tokens.css anywhere above the mock, D1 must never bind,
// so this assertion already holds against the pre-image and must keep holding once D1's literal
// changes (D6) and once the theme is picked in sketch instead of mocks THEME; it is authored now
// so a future change that lets D1 leak onto a theme-less root is caught. Assertion unweakened.
test('AC-20260907-06-11 (retag of AC-20260906-06-2): check over a ratified mock linking wire/wire.css in a root with no design/tokens.css SHALL CONTINUE TO exit 0 with output byte-identical to today', () => {
  const dir = tmpdir('atlas-wire-no-theme')
  const mockPath = writeMock(dir, wireAfterThemeMock('ratified'))
  const first = atlas(['check', mockPath])
  assert.strictEqual(first.status, 0,
    'with no design/tokens.css anywhere above the mock, D1 must never bind — a ratified mock linking wire/wire.css must keep passing exactly as it does today: ' + first.stdout + first.stderr)
  assert.strictEqual(first.stdout, 'CHECK PASS (1 file(s))\n',
    'the output must be byte-identical to today\'s plain CHECK PASS line — any extra warn or violation text here means D1 leaked onto a root with no theme picked yet: ' + JSON.stringify(first.stdout))
  const second = atlas(['check', mockPath])
  assert.strictEqual(second.stdout, first.stdout,
    'the output must stay reproducible byte-for-byte across runs, exactly like every other check output')
})

// specs/20260906/06-sketch-high-fidelity-and-critique.md D3, AC-20260906-06-5: `check` flags a
// ratified mock carrying an unresolved scope:"mock" note on its own label (from design/mocks/
// notes.json, the same walk-up as D1 per A2) — violation at ratified, ⚠️ warn at sketch, and a
// pass once every note on the label is resolved or the root has no notes store at all. TDD red:
// cmdCheck reads no notes store today, so an open critic note never surfaces here.
function labeledMock({ label, status = 'ratified' }) {
  return '<link rel="stylesheet" href="../tokens.css">\n' +
    '<style>\n* { box-sizing: border-box; }\n.screen { color: var(--text-body); }\n</style>\n' +
    '<main class="screen" data-screen-label="' + label + '" data-status="' + status + '">\n' +
    '<div data-contract="none"><button data-state-btn="empty">Empty</button></div>\n' + label + '\n</main>\n'
}
function noteOn(id, screen, status) {
  return {
    id, scope: 'mock', screen, state: 'error', text: 'no way back to the invite', by: 'critic',
    at: '2026-01-01T00:00:00.000Z', status, addressed: null, reply: null,
    resolvedBy: status === 'resolved' ? 'critic' : null,
    resolvedAt: status === 'resolved' ? '2026-01-01T00:00:00.000Z' : null,
  }
}

test('AC-20260906-06-5: check flags a ratified mock with an unresolved critic note on its own label (excluding an already-resolved one), warns at sketch, and passes once every note on the label is resolved or notes.json is absent', () => {
  const dir = tmpdir('atlas-unresolved-notes')
  const p = path.join(dir, 'design/mocks/signin.html')
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, labeledMock({ label: 'signin', status: 'ratified' }))
  const notesFile = path.join(dir, 'design/mocks/notes.json')
  fs.writeFileSync(notesFile, JSON.stringify([noteOn('N001', 'signin', 'open'), noteOn('N002', 'signin', 'resolved')], null, 2) + '\n')
  const violationMsg = '1 unresolved note(s) on signin (N001) — address them (notes address) or resolve them on the page before ratifying'

  const ratified = atlas(['check', p])
  assert.strictEqual(ratified.status, 1,
    'a ratified mock with one open critic note on its own label must fail check — D3\'s unresolved-notes rule is missing: ' + ratified.stdout + ratified.stderr)
  assert.ok(ratified.stdout.includes('  - ' + p + ': ' + violationMsg),
    'the D3 violation line must be printed verbatim, naming the file, the count, the label and the offending id — excluding the already-resolved N002: ' + ratified.stdout)

  fs.writeFileSync(p, labeledMock({ label: 'signin', status: 'sketch' }))
  const sketch = atlas(['check', p])
  assert.strictEqual(sketch.status, 0,
    'the same mock at data-status="sketch" must pass check (exit 0) — D3 warns at sketch, it never fails the gate: ' + sketch.stdout + sketch.stderr)
  assert.ok(sketch.stdout.includes('  ⚠️ ' + p + ': ' + violationMsg),
    'the sketch-stage run must print the same D3 line prefixed "  ⚠️ " as a warning: ' + sketch.stdout)

  fs.writeFileSync(p, labeledMock({ label: 'signin', status: 'ratified' }))
  fs.writeFileSync(notesFile, JSON.stringify([noteOn('N001', 'signin', 'resolved'), noteOn('N002', 'signin', 'resolved')], null, 2) + '\n')
  const allResolved = atlas(['check', p])
  assert.strictEqual(allResolved.status, 0,
    'once every note on the label is resolved, check must pass: ' + allResolved.stdout + allResolved.stderr)
  assert.doesNotMatch(allResolved.stdout, /unresolved note/,
    'no unresolved-notes line may print once every note on the label is resolved: ' + allResolved.stdout)

  fs.rmSync(notesFile)
  const noStore = atlas(['check', p])
  assert.strictEqual(noStore.status, 0,
    'a root with no notes.json at all must pass check — "no notes store → no check" per D3: ' + noStore.stdout + noStore.stderr)
  assert.doesNotMatch(noStore.stdout, /unresolved note/,
    'no unresolved-notes line may print when notes.json does not exist: ' + noStore.stdout)
})

// specs/20260901/04-shell-composed-mocks.md D1: design/shell/<name>.html carries the canon
// shape (data-shell-canon root, named data-slots, one empty content slot, non-content slots
// data-contract="none") plus a linked <name>.css; D4 binds a shell family on `check`, tiered
// warn-at-sketch/violation-at-ratified|approved|--matrix, once a design/shell dir resolves by
// walk-up from the mock. AC-6 above (tagged, unchanged) is the absence-invariant control: no
// existing fixture carries a design/shell dir (Assumption A2), so it must stay green throughout.
//
// CANON_APP_HTML/SHELL_APP_CSS are the literal D1 Contracts example. expectedInner()/syncedRegion()
// rebuild D3's splice (content-slot substitution + active-nav aria-current) by exact substring
// surgery on that same literal, so every "synced" fixture below is byte-consistent with the canon
// by construction rather than hand-typed and hoped-correct.

const CANON_APP_HTML = '<!doctype html><html><head><meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  '<link rel="stylesheet" href="../tokens.css">\n' +
  '<link rel="stylesheet" href="app.css">\n' +
  '<style>* { box-sizing: border-box; }</style></head><body>\n' +
  '<div data-shell-canon="app" class="shell">\n' +
  '  <nav data-slot="nav" data-contract="none" aria-label="Main">\n' +
  '    <a data-nav="inbox" href="#">Inbox</a>\n' +
  '    <a data-nav="settings" href="#">Settings</a>\n' +
  '  </nav>\n' +
  '  <header data-slot="header" data-contract="none">…</header>\n' +
  '  <main data-slot="content"></main>\n' +
  '</div></body></html>\n'

const SHELL_APP_CSS = '.shell { display: flex; gap: 1rem; }\n' +
  '.shell nav a { color: var(--text-body); font-size: 14px; line-height: 1.4; }\n'

function writeShellDir(dir, { name = 'app', canon = CANON_APP_HTML, css = SHELL_APP_CSS } = {}) {
  fs.mkdirSync(path.join(dir, 'design/shell'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/shell', name + '.html'), canon)
  fs.writeFileSync(path.join(dir, 'design/shell', name + '.css'), css)
}

// D3's splice: canon inner with the content slot's inner replaced, then aria-current="page"
// appended to the one data-nav anchor matching `active` (stripped everywhere else — there is
// nowhere else here, since the canon never carries one).
function expectedInner({ contentInner = '', active = 'inbox' } = {}) {
  let inner = '\n  <nav data-slot="nav" data-contract="none" aria-label="Main">\n' +
    '    <a data-nav="inbox" href="#">Inbox</a>\n' +
    '    <a data-nav="settings" href="#">Settings</a>\n' +
    '  </nav>\n' +
    '  <header data-slot="header" data-contract="none">…</header>\n' +
    '  <main data-slot="content"></main>\n'
  inner = inner.replace('<main data-slot="content"></main>', '<main data-slot="content">' + contentInner + '</main>')
  if (active === 'inbox') inner = inner.replace('<a data-nav="inbox" href="#">', '<a data-nav="inbox" href="#" aria-current="page">')
  if (active === 'settings') inner = inner.replace('<a data-nav="settings" href="#">', '<a data-nav="settings" href="#" aria-current="page">')
  return inner
}

function syncedRegion(opts) {
  return '<div data-shell-region="app" class="shell">' + expectedInner(opts) + '</div>'
}

// A fully declared, synced (by construction) page mock per D2's Contracts example.
function mockDeclaring({ label = 'inbox', status = 'ratified', active = 'inbox',
  contentInner = '<h1>Inbox</h1>' } = {}) {
  return '<link rel="stylesheet" href="../tokens.css">\n' +
    '<link rel="stylesheet" href="../shell/app.css">\n' +
    '<style>* { box-sizing: border-box; }</style>\n' +
    '<div data-screen-label="' + label + '" data-status="' + status + '" data-shell="app" data-active="' + active + '">' +
    syncedRegion({ contentInner, active }) +
    '</div>\n'
}

test('check: shell — undeclared (AC-20260901-04-1)', () => {
  const dir = tmpdir('atlas-shell')
  writeShellDir(dir)
  const mocks = path.join(dir, 'design/mocks')
  fs.mkdirSync(mocks, { recursive: true })
  const mockPath = path.join(mocks, 'inbox.html')

  fs.writeFileSync(mockPath,
    '<link rel="stylesheet" href="../tokens.css">\n' +
    '<main data-screen-label="inbox" data-status="sketch">no shell declared</main>\n')
  const sketch = atlas(['check', mocks])
  assert.strictEqual(sketch.status, 0,
    'a sketch-tier mock missing data-shell must still pass check (the finding is advisory only until ratified) — ' +
    sketch.stdout + sketch.stderr)
  assert.match(sketch.stdout,
    /  ⚠️ .*: no data-shell on the \[data-screen-label\] root — declare data-shell="<name>" or data-shell="none"/,
    'the undeclared-shell finding must print as a warn line before CHECK PASS at sketch tier, or an author gets no signal before ratifying')
  assert.match(sketch.stdout, /CHECK PASS/, 'a sketch-tier shell finding must never fail the check')

  fs.writeFileSync(mockPath,
    '<link rel="stylesheet" href="../tokens.css">\n' +
    '<main data-screen-label="inbox" data-status="ratified">no shell declared</main>\n')
  const ratified = atlas(['check', mocks])
  assert.strictEqual(ratified.status, 1,
    'the same finding must fail check once the mock is ratified — sketch-tier warns exist to graduate into a real gate, not to stay advisory forever — ' +
    ratified.stdout + ratified.stderr)
  assert.match(ratified.stdout,
    /no data-shell on the \[data-screen-label\] root — declare data-shell="<name>" or data-shell="none"/,
    'the exact D4(a) violation text must be printed under CHECK FAIL')
})

test('check: shell — unknown name (AC-20260901-04-2)', () => {
  const dir = tmpdir('atlas-shell')
  writeShellDir(dir)
  const mocks = path.join(dir, 'design/mocks')
  fs.mkdirSync(mocks, { recursive: true })
  fs.writeFileSync(path.join(mocks, 'admin.html'),
    '<link rel="stylesheet" href="../tokens.css">\n<style>* { box-sizing: border-box; }</style>\n' +
    '<main data-screen-label="admin" data-status="ratified" data-shell="admin">x</main>\n')

  const res = atlas(['check', mocks])
  assert.strictEqual(res.status, 1,
    'a mock declaring a shell with no matching canon file must fail check — an unknown shell name is silently unenforceable otherwise — ' +
    res.stdout + res.stderr)
  assert.match(res.stdout,
    /declares data-shell="admin" but design\/shell\/admin\.html does not exist — author the shell canon or declare data-shell="none"/,
    'the exact D4(b) violation text must name the missing canon file')
})

test('check: shell — drift names the slot (AC-20260901-04-3)', () => {
  const dir = tmpdir('atlas-shell')
  writeShellDir(dir)
  const mocks = path.join(dir, 'design/mocks')
  fs.mkdirSync(mocks, { recursive: true })
  const mockPath = path.join(mocks, 'inbox.html')

  fs.writeFileSync(mockPath, mockDeclaring({}))
  const clean = atlas(['check', mocks])
  assert.strictEqual(clean.status, 0,
    'a mock whose region is byte-identical to the derived expected region must pass with zero shell findings — ' +
    clean.stdout + clean.stderr)
  assert.doesNotMatch(clean.stdout, /shell region differs from canon/,
    'a synced mock must never report drift — false drift would make every ratify a coin flip')

  fs.writeFileSync(mockPath, mockDeclaring({}).replace('Settings</a>', 'Preferences</a>'))
  const navDrift = atlas(['check', mocks])
  assert.strictEqual(navDrift.status, 1,
    'an edited nav label must fail check as drift — a hand-edited sidebar in a ratified mock is exactly what this gate exists to catch — ' +
    navDrift.stdout + navDrift.stderr)
  assert.match(navDrift.stdout, /shell region differs from canon \(nav slot\) — run design-atlas\.js shell sync/,
    'the drift finding must name the nav slot as the first differing slot, and the sync remedy command')

  fs.writeFileSync(mockPath, mockDeclaring({}).replace('…</header>', '…<button>x</button></header>'))
  const headerDrift = atlas(['check', mocks])
  assert.strictEqual(headerDrift.status, 1,
    'markup appended inside the header slot must fail check as drift — ' + headerDrift.stdout + headerDrift.stderr)
  assert.match(headerDrift.stdout, /shell region differs from canon \(header slot\) — run design-atlas\.js shell sync/,
    'the drift finding must name the header slot, not a generic "differs" message, or an author cannot tell which slot to inspect')
})

test('check: shell — own chrome (AC-20260901-04-4)', () => {
  const dir = tmpdir('atlas-shell')
  writeShellDir(dir)
  const mocks = path.join(dir, 'design/mocks')
  fs.mkdirSync(mocks, { recursive: true })
  const mockPath = path.join(mocks, 'inbox.html')

  fs.writeFileSync(mockPath, mockDeclaring({ contentInner: '<nav>own nav</nav>' }))
  const bad = atlas(['check', mocks])
  assert.strictEqual(bad.status, 1,
    'a <nav> authored inside the content slot must fail check — the shell already owns that chrome — ' +
    bad.stdout + bad.stderr)
  assert.match(bad.stdout,
    /own nav\/header markup inside the content slot — the shell owns chrome; in-content sub-navigation uses role="tablist" or a plain container/,
    'the exact D4(d) violation text must be printed')

  fs.writeFileSync(mockPath,
    '<link rel="stylesheet" href="../tokens.css">\n<style>* { box-sizing: border-box; }</style>\n' +
    '<main data-screen-label="inbox" data-status="ratified" data-shell="none"><nav>own nav</nav></main>\n')
  const ok = atlas(['check', mocks])
  assert.strictEqual(ok.status, 0,
    'the identical <nav> markup in a data-shell="none" mock must produce no shell finding at all — the shell family never binds on an opted-out mock — ' +
    ok.stdout + ok.stderr)
})

test('check: shell — css link (AC-20260901-04-5)', () => {
  const dir = tmpdir('atlas-shell')
  writeShellDir(dir)
  const mocks = path.join(dir, 'design/mocks')
  fs.mkdirSync(mocks, { recursive: true })
  const mockPath = path.join(mocks, 'inbox.html')

  fs.writeFileSync(mockPath, mockDeclaring({}).replace('<link rel="stylesheet" href="../shell/app.css">\n', ''))
  const bad = atlas(['check', mocks])
  assert.strictEqual(bad.status, 1,
    'a declaring mock that never links its shell stylesheet must fail check — ' + bad.stdout + bad.stderr)
  assert.match(bad.stdout, /declares data-shell="app" but does not link design\/shell\/app\.css/,
    'the exact D4(e) violation text must name the missing link')

  fs.writeFileSync(mockPath, mockDeclaring({ status: 'sketch' }).replace('<link rel="stylesheet" href="../shell/app.css">\n', ''))
  const sketch = atlas(['check', mocks])
  assert.strictEqual(sketch.status, 0,
    'the missing-css-link finding must be tiered exactly like undeclared/unknown-shell — a warn at sketch, never a failure — ' +
    sketch.stdout + sketch.stderr)
  assert.match(sketch.stdout, /⚠️ .*does not link design\/shell\/app\.css/,
    'the missing-css-link finding must print as a warn line at sketch tier')
})

test('check: shell canon rules (AC-20260901-04-7)', () => {
  const dir = tmpdir('atlas-shell')
  writeShellDir(dir)
  const shellDir = path.join(dir, 'design/shell')
  const canonPath = path.join(shellDir, 'app.html')

  const good = atlas(['check', shellDir])
  assert.strictEqual(good.status, 0,
    'a canon meeting every D1 rule must pass check — ' + good.stdout + good.stderr)
  assert.doesNotMatch(good.stdout, /no data-screen-label/,
    'check must never demand a data-screen-label on a shell canon file — the canon is chrome, not a labeled surface')

  fs.writeFileSync(canonPath, CANON_APP_HTML.replace('data-shell-canon="app"', 'data-shell-canon="shell"'))
  const nameBad = atlas(['check', shellDir])
  assert.strictEqual(nameBad.status, 1,
    'a data-shell-canon value that does not match the file basename must fail check — ' + nameBad.stdout + nameBad.stderr)
  assert.match(nameBad.stdout, /data-shell-canon="shell" does not match the file name app — rename one/,
    'the exact D1 name-mismatch violation text must be printed')

  fs.writeFileSync(canonPath, CANON_APP_HTML.replace('<main data-slot="content"></main>', '<main data-slot="content"><p>x</p></main>'))
  const contentBad = atlas(['check', shellDir])
  assert.strictEqual(contentBad.status, 1,
    'a non-empty content slot in the canon must fail check — the shell carries no feature content — ' + contentBad.stdout + contentBad.stderr)
  assert.match(contentBad.stdout, /content slot must be empty — the shell carries no feature content/,
    'the exact D1 empty-content-slot violation text must be printed')

  fs.writeFileSync(canonPath, CANON_APP_HTML.replace('<nav data-slot="nav" data-contract="none" aria-label="Main">', '<nav data-slot="nav" aria-label="Main">'))
  const slotBad = atlas(['check', shellDir])
  assert.strictEqual(slotBad.status, 1,
    'a non-content slot missing data-contract="none" must fail check — ' + slotBad.stdout + slotBad.stderr)
  assert.match(slotBad.stdout, /slot "nav" must carry data-contract="none" — shell chrome never enters the render gate's comparison/,
    'the exact D1 slot-contract violation text must name the offending slot')
  fs.writeFileSync(canonPath, CANON_APP_HTML)

  fs.writeFileSync(path.join(shellDir, 'app.css'), SHELL_APP_CSS + '.x { color: #333; }\n')
  const cssBad = atlas(['check', shellDir])
  assert.strictEqual(cssBad.status, 1,
    'an off-token color literal in the shell stylesheet must fail check exactly like it would in a mock — ' + cssBad.stdout + cssBad.stderr)
  assert.match(cssBad.stdout, /off-token color literal/,
    'the canon rule set must reuse the existing off-token-color violation text over the css file')
  fs.writeFileSync(path.join(shellDir, 'app.css'), SHELL_APP_CSS)

  fs.writeFileSync(path.join(shellDir, 'app.css'), SHELL_APP_CSS + '.y { font-size: 12px; }\n')
  const hygieneBad = atlas(['check', shellDir])
  assert.strictEqual(hygieneBad.status, 1,
    'a font-size rule with no line-height in the shell stylesheet must fail check over that css file — ' + hygieneBad.stdout + hygieneBad.stderr)
  assert.match(hygieneBad.stdout, /declare font-size without line-height/,
    'the canon rule set must reuse the existing hygiene(b) violation text over the css file')
})

test('check/sync: active nav derived (AC-20260901-04-8)', () => {
  const dir = tmpdir('atlas-shell')
  writeShellDir(dir)
  const mocks = path.join(dir, 'design/mocks')
  fs.mkdirSync(mocks, { recursive: true })
  const mockPath = path.join(mocks, 'inbox.html')

  fs.writeFileSync(mockPath, mockDeclaring({ active: 'settings' }))
  const settingsActive = atlas(['check', mocks])
  assert.strictEqual(settingsActive.status, 0,
    'the expected region for data-active="settings" must mark only the settings nav item, and a mock matching it must pass unchanged — ' +
    settingsActive.stdout + settingsActive.stderr)

  fs.writeFileSync(mockPath, mockDeclaring({}).replace(' data-active="inbox"', ''))
  const defaultLabel = atlas(['check', mocks])
  assert.strictEqual(defaultLabel.status, 0,
    'absent data-active must default the active key to the screen label ("inbox"), which matches the inbox nav item here, so this must still pass unchanged — ' +
    defaultLabel.stdout + defaultLabel.stderr)

  fs.writeFileSync(mockPath, mockDeclaring({}).replace('data-active="inbox"', 'data-active="nowhere"'))
  const noMatch = atlas(['check', mocks])
  assert.strictEqual(noMatch.status, 1,
    'data-active="nowhere" matches no data-nav key, so the expected region carries no aria-current anywhere — this mock still carries one on inbox, so it must now report drift — ' +
    noMatch.stdout + noMatch.stderr)
  assert.match(noMatch.stdout, /shell region differs from canon \(nav slot\)/,
    'the drift must be named to the nav slot, since that is where the stale aria-current sits')
})

// specs/20260902/07-mocks-command-driver.md D12, AC-20260902-07-12 (TDD red): design-atlas.js has
// no `serve` subcommand yet. The AC itself names the runner: async child_process.spawn + http.get,
// never runNode's spawnSync — tests/helpers.js's runNode blocks the parent event loop for the
// child's whole lifetime, so a synchronous spawn here could never receive the server's own
// responses while the child is still alive (spec-pipeline.md Gotchas: "a test that stands up an
// in-process http.createServer stub … hangs to the spawn timeout instead of returning the
// stubbed response" — the live-server mirror of that same class).
// Retagged AC-20260902-10-2 (repair): specs/20260902/10-page-notes-review-loop.md D2 now injects
// the notes-layer script into every served .html unless the request carries `?clean`, which made
// this test's plain `/mocks/a.html` fetch collide with D2 by construction (exact-bytes is no
// longer true for an unclean request). The `?clean` query keeps this pin's original meaning —
// the server serves exact bytes when asked cleanly — per spec-pipeline.md § Gotchas: "a colliding
// test pin is updated in place and retagged with the new AC-ID, never weakened, never left red."
test('AC-20260905-01-11 (carrying forward AC-20260902-07-12 / AC-20260902-10-2): design-atlas.js serve SHALL CONTINUE TO print the port-forward line first, serve design/ statically with no-store (exact bytes via ?clean), block path traversal, and exit on SIGTERM', async () => {
  const dir = tmpdir('atlas-serve')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/a.html'), '<main data-screen-label="a">hello</main>\n')
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"should-never-be-served"}')

  const port = 41230 + (process.pid % 300)
  const child = spawn(process.execPath, [path.join(SPEC, 'scripts/design-atlas.js'), 'serve', '--root', dir, '--port', String(port)])

  try {
    let firstLine = null
    let stdoutBuf = ''
    const firstLinePromise = new Promise((resolve) => {
      child.stdout.on('data', (chunk) => {
        stdoutBuf += chunk.toString('utf8')
        if (firstLine === null && stdoutBuf.includes('\n')) {
          firstLine = stdoutBuf.split('\n')[0]
          resolve()
        }
      })
    })
    let stderrBuf = ''
    child.stderr.on('data', (chunk) => { stderrBuf += chunk.toString('utf8') })

    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('serve did not print its first stdout line within 5s: ' + stderrBuf)), 5000))
    await Promise.race([firstLinePromise, timeout])

    assert.strictEqual(firstLine,
      'serving http://localhost:' + port + '/atlas/index.html — remote: ssh -L ' + port + ':localhost:' + port + ' <host>',
      'the very first stdout line must be the exact D12 port-forward line, with the port substituted and the literal <host> left for the user to fill in: got ' + JSON.stringify(firstLine))

    function get(urlPath) {
      return new Promise((resolve, reject) => {
        http.get({ host: 'localhost', port, path: urlPath }, (res) => {
          let body = ''
          res.on('data', (c) => { body += c })
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
        }).on('error', reject)
      })
    }

    const mockRes = await get('/mocks/a.html?clean')
    assert.strictEqual(mockRes.status, 200, 'GET /mocks/a.html?clean must serve the file with status 200')
    assert.strictEqual(mockRes.headers['cache-control'], 'no-store', 'the server must never cache — every response must carry cache-control: no-store')
    assert.strictEqual(mockRes.body, fs.readFileSync(path.join(dir, 'design/mocks/a.html'), 'utf8'),
      'AC-20260902-10-2: a ?clean request must return the exact bytes of design/mocks/a.html, with no notes-layer injection')

    const traversal = await get('/../package.json')
    assert.strictEqual(traversal.status, 404,
      'a path-traversal request outside design/ must answer 404, never leak a file above the served root (package.json here)')

    const exitPromise = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })))
    child.kill('SIGTERM')
    const exitTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('serve did not exit within 5s of SIGTERM')), 5000))
    await Promise.race([exitPromise, exitTimeout])
  } finally {
    // Harness-level hardening (repair): an assertion failure above must not orphan the serve
    // child — a live child keeps the event loop alive and hangs the whole test process, not just
    // this test. SIGKILL is a safe fallback for a process that already caught SIGTERM once.
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
    }
  }
})

// specs/20260902/10-page-notes-review-loop.md D2/D3, AC-20260902-10-2/-3/-4 (TDD red): serve
// has no notes injection, no /__notes/* endpoints, and lib/notes-layer.browser.js does not
// exist yet — this async-spawn + http helper mirrors AC-20260902-07-12's runner above (Gotcha:
// runNode's spawnSync would block the parent event loop for the child's whole lifetime).
async function withServe(dir, portOffset, fn) {
  const port = 41830 + ((process.pid + portOffset) % 300)
  const child = spawn(process.execPath, [path.join(SPEC, 'scripts/design-atlas.js'), 'serve', '--root', dir, '--port', String(port)])
  try {
    let stdoutBuf = ''
    let stderrBuf = ''
    child.stderr.on('data', (chunk) => { stderrBuf += chunk.toString('utf8') })
    const firstLinePromise = new Promise((resolve) => {
      child.stdout.on('data', (chunk) => {
        stdoutBuf += chunk.toString('utf8')
        if (stdoutBuf.includes('\n')) resolve()
      })
    })
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('serve did not print its first stdout line within 5s: ' + stderrBuf)), 5000))
    await Promise.race([firstLinePromise, timeout])

    function get(urlPath) {
      return new Promise((resolve, reject) => {
        http.get({ host: 'localhost', port, path: urlPath }, (res) => {
          let body = ''
          res.on('data', (c) => { body += c })
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
        }).on('error', reject)
      })
    }
    function post(urlPath, obj) {
      return new Promise((resolve, reject) => {
        const data = JSON.stringify(obj)
        const req = http.request({
          host: 'localhost', port, path: urlPath, method: 'POST',
          headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) },
        }, (res) => {
          let body = ''
          res.on('data', (c) => { body += c })
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
        })
        req.on('error', reject)
        req.end(data)
      })
    }

    await fn({ get, post, port })
  } finally {
    // Harness-level hardening (repair, AC-20260902-07-12 sibling): a failure anywhere above —
    // including the first-line wait itself — must not orphan the serve child, or it keeps the
    // event loop alive and hangs the whole test process, not just this test.
    if (child.exitCode === null && child.signalCode === null) {
      const exitPromise = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })))
      child.kill('SIGTERM')
      const exitTimeout = new Promise((resolve) => setTimeout(resolve, 5000))
      await Promise.race([exitPromise, exitTimeout])
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL')
      }
    }
  }
}

test('AC-20260902-10-2: design-atlas.js serve injects the notes layer script before </body> on every served html unless ?clean is present, and GET /__notes/notes.js serves lib/notes-layer.browser.js verbatim as text/javascript', async () => {
  const dir = tmpdir('atlas-notes-inject')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  const bodyHtml = '<!doctype html>\n<html><head></head><body><main data-screen-label="a">hello</main>\n</body></html>\n'
  fs.writeFileSync(path.join(dir, 'design/mocks/a.html'), bodyHtml)

  await withServe(dir, 1, async ({ get, port }) => {
    // Repair (coordinator fix request): the Contracts section pins "server binds `localhost`
    // only" — assert the live listener via `lsof`, since `server.address()` isn't reachable from
    // this test (the server runs in a spawned child process).
    const lsof = spawnSync('lsof', ['-nP', '-iTCP:' + port, '-sTCP:LISTEN'], { encoding: 'utf8' })
    assert.ok(!lsof.error && lsof.stdout.includes('127.0.0.1:' + port),
      'AC-20260902-10-2 repair: design-atlas.js serve must bind 127.0.0.1 only (Contracts: "binds `localhost` only") — ' +
      '`lsof -nP -iTCP:' + port + ' -sTCP:LISTEN` must show a 127.0.0.1:' + port + ' listener: got ' +
      JSON.stringify(lsof.stdout) + (lsof.error ? ' (lsof error: ' + lsof.error.message + ')' : ''))
    assert.ok(!lsof.stdout.includes('*:' + port) && !lsof.stdout.includes('0.0.0.0:' + port),
      'AC-20260902-10-2 repair: design-atlas.js serve must not bind all interfaces — no `*:' + port + '` or `0.0.0.0:' + port +
      '` listener may appear: got ' + JSON.stringify(lsof.stdout))

    const injected = await get('/mocks/a.html')
    assert.strictEqual(injected.status, 200, 'GET /mocks/a.html must still serve 200 once the notes layer is wired in: ' + injected.body)
    assert.match(injected.body, /<script src="\/__notes\/notes\.js"><\/script>\s*<\/body>/,
      'D2: every served text/html response without ?clean must carry the notes layer script tag immediately before </body> — got: ' + JSON.stringify(injected.body))

    const clean = await get('/mocks/a.html?clean')
    assert.strictEqual(clean.body, bodyHtml,
      'D2: a request carrying ?clean must skip injection and return the file\'s exact original bytes, unchanged for screenshot capture — got: ' + JSON.stringify(clean.body))

    const libPath = path.join(SPEC, 'scripts/lib/notes-layer.browser.js')
    assert.ok(fs.existsSync(libPath), 'D3: spec/scripts/lib/notes-layer.browser.js must exist — the /__notes/notes.js endpoint has nothing to serve without it')
    const libBytes = fs.readFileSync(libPath, 'utf8')
    const notesJs = await get('/__notes/notes.js')
    assert.strictEqual(notesJs.status, 200, 'GET /__notes/notes.js must serve the notes layer script: ' + notesJs.body)
    assert.strictEqual(notesJs.headers['content-type'], 'text/javascript',
      'GET /__notes/notes.js must declare content-type text/javascript per the HTTP contract: got ' + notesJs.headers['content-type'])
    assert.strictEqual(notesJs.body, libBytes, 'GET /__notes/notes.js must return lib/notes-layer.browser.js verbatim, byte for byte')
  })
})

test('AC-20260902-10-3: POST /__notes/add writes design/mocks/notes.json and returns 201, GET /__notes/list?screen filters by screen, POST /__notes/resolve marks resolved, empty text 400s, and an unknown /__notes/* path 404s', async () => {
  const dir = tmpdir('atlas-notes-add')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/a.html'), '<main data-screen-label="a">hello</main>\n')

  await withServe(dir, 2, async ({ get, post }) => {
    const added = await post('/__notes/add', { scope: 'mock', screen: 'a', state: 'busy', text: 'x', by: 'JJ' })
    assert.strictEqual(added.status, 201, 'POST /__notes/add with a valid mock-scope body must respond 201: ' + added.status + ' ' + added.body)
    const addedNote = JSON.parse(added.body)
    assert.strictEqual(addedNote.id, 'N001', 'the first added note must be assigned id "N001" — D1\'s monotonic N001-style scheme: got ' + JSON.stringify(addedNote))

    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'design/mocks/notes.json'), 'utf8'))
    assert.strictEqual(onDisk.length, 1, 'POST /__notes/add must persist the note to design/mocks/notes.json: got ' + JSON.stringify(onDisk))
    assert.strictEqual(onDisk[0].id, 'N001', 'the persisted note must carry the same id returned to the caller: got ' + JSON.stringify(onDisk))

    const listed = await get('/__notes/list?screen=a')
    assert.strictEqual(listed.status, 200, 'GET /__notes/list?screen=a must respond 200: ' + listed.body)
    const listedNotes = JSON.parse(listed.body)
    assert.strictEqual(listedNotes.length, 1, 'GET /__notes/list?screen=a must return the note whose screen === "a": got ' + JSON.stringify(listedNotes))
    assert.strictEqual(listedNotes[0].id, 'N001', 'the listed note must be N001: got ' + JSON.stringify(listedNotes))

    const resolved = await post('/__notes/resolve', { id: 'N001', by: 'JJ' })
    assert.strictEqual(resolved.status, 200, 'POST /__notes/resolve for an existing id must respond 200: ' + resolved.status + ' ' + resolved.body)
    const resolvedNote = JSON.parse(resolved.body)
    assert.strictEqual(resolvedNote.status, 'resolved', 'POST /__notes/resolve must set status to "resolved": got ' + JSON.stringify(resolvedNote))
    assert.strictEqual(resolvedNote.resolvedBy, 'JJ', 'POST /__notes/resolve must record resolvedBy from the request body: got ' + JSON.stringify(resolvedNote))

    const bad = await post('/__notes/add', { scope: 'mock', screen: 'a', state: 'busy', text: '', by: 'JJ' })
    assert.strictEqual(bad.status, 400, 'POST /__notes/add with an empty text must respond 400, never silently accept a blank note: got ' + bad.status)

    const notFound = await get('/__notes/nope')
    assert.strictEqual(notFound.status, 404, 'an unknown /__notes/* path must respond 404: got ' + notFound.status)
  })
})

test('AC-20260902-10-4: lib/notes-layer.browser.js reads data-screen-label/data-state-btn, keys localStorage on nl-author, respects ?clean, uses only var(--v-*) chrome tokens with no raw hex literal, and GET /__notes/viewer.css serves the template bytes', async () => {
  const libPath = path.join(SPEC, 'scripts/lib/notes-layer.browser.js')
  assert.ok(fs.existsSync(libPath), 'D3: spec/scripts/lib/notes-layer.browser.js must exist — the served notes layer has no source file yet')
  const src = fs.readFileSync(libPath, 'utf8')
  for (const literal of ['data-screen-label', 'data-state-btn', 'nl-author', 'clean', 'var(--v-']) {
    assert.ok(src.includes(literal),
      'D3: notes-layer.browser.js must reference "' + literal + '" — its absence means the layer cannot find the active state, keep the author identity across the browser, honor the capture-clean query, or read every visual off the shared chrome tokens: ' + libPath)
  }
  assert.ok(!/#[0-9a-f]{3,8}/.test(src),
    'D3: notes-layer.browser.js must carry no raw hex color literal — every visual is required to read off var(--v-*) chrome tokens instead: ' + libPath)

  const dir = tmpdir('atlas-notes-css')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/a.html'), '<main data-screen-label="a">hello</main>\n')
  const templateBytes = fs.readFileSync(path.join(SPEC, 'templates/mocks/viewer.css'), 'utf8')

  await withServe(dir, 3, async ({ get }) => {
    const res = await get('/__notes/viewer.css')
    assert.strictEqual(res.status, 200, 'GET /__notes/viewer.css must respond 200: ' + res.status)
    assert.strictEqual(res.body, templateBytes, 'GET /__notes/viewer.css must return spec/templates/mocks/viewer.css verbatim, byte for byte')
  })
})

// specs/20260902/07-mocks-command-driver.md D15, AC-20260902-07-14 (TDD red): parseSurfaces
// (used by cmdBuild) does not yet read design/mocks/seed.md's per-journey ```surfaces blocks, does
// not render one frame per data-state-btn state, does not emit a shapes section for
// design/shapes/*.html, and the html walk does not yet skip design/mocks/references/.
test('AC-20260902-07-14: build reads seed.md journeys (owner seed:<journey>, persona line), renders one frame per data-state-btn state, a shapes section, and skips references/', () => {
  const dir = tmpdir('atlas-seed')
  fs.mkdirSync(path.join(dir, 'design/mocks/references'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'design/shapes'), { recursive: true })

  fs.writeFileSync(path.join(dir, 'design/mocks/seed.md'), `# Seed — Test Product

## Product
It is a synthetic product.
Built for tests.
It must do one job.

## Facts
- primary-surface: P1

## References
- none

## Journeys
### j1
Mika (dispatch lead) draws two screens and reaches the busy state.
\`\`\`surfaces
a -> b
\`\`\`

## Dense screen
- a
`)

  fs.writeFileSync(path.join(dir, 'design/mocks/a.html'),
    '<link rel="stylesheet" href="../wire/tokens.css">\n' +
    '<main data-screen-label="a" data-status="sketch">\n' +
    '<div data-contract="none"><button data-state-btn="busy">Busy</button><button data-state-btn="empty">Empty</button></div>\n' +
    'A</main>\n')
  fs.writeFileSync(path.join(dir, 'design/mocks/b.html'),
    '<link rel="stylesheet" href="../wire/tokens.css">\n<main data-screen-label="b" data-status="sketch">B</main>\n')
  fs.writeFileSync(path.join(dir, 'design/mocks/references/inspiration.html'),
    '<main data-screen-label="should-never-appear">ref</main>\n')
  fs.writeFileSync(path.join(dir, 'design/shapes/calm.html'),
    '<main data-screen-label="a" data-shape="calm">calm shape</main>\n')

  const res = atlas(['build'], { cwd: dir })
  assert.strictEqual(res.status, 0, res.stdout + res.stderr)
  const out = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')

  // specs/20260907/09-atlas-index-and-note-navigation.md D2 adds id="j-<title>" to every journey
  // section's <h2> — tolerate whatever attributes ride along on the tag, pinning only that the
  // section exists and is headed by the journey key.
  assert.match(out, /<h2[^>]*>j1/, 'a section headed by the journey key "j1" must be emitted for the seed journey')
  assert.match(out, /Mika \(dispatch lead\) draws two screens/, 'the journey\'s persona line from seed.md must appear in the rendered section')

  const frameCount = (out.match(/data-screen-label="a"/g) || []).length
  assert.ok(frameCount >= 2,
    'two frames must be rendered for label "a" (one per data-state-btn state: busy, empty) — got ' + frameCount + ' occurrences of data-screen-label="a"')
  assert.match(out, /data-state="busy"/, 'a frame rendered for the "busy" state must carry data-state="busy"')
  assert.match(out, /data-state="empty"/, 'a frame rendered for the "empty" state must carry data-state="empty"')

  assert.match(out, /shapes/i, 'a "shapes" section must be emitted for design/shapes/*.html files')
  assert.match(out, /calm/, 'the shapes section must be keyed by the shape file (calm.html)')

  assert.ok(!/should-never-appear/.test(out),
    'design/mocks/references/ must be skipped by the html walk entirely — a file under it must never surface as a rendered label')
})

// The atlas is a derived view, so serve regenerates it on every GET of the index instead of
// serving a file only `build` ever wrote (a shapes-only tree at the SHAPES look stop has no
// such file, and the banner promised the page anyway); a busy port reuses the running atlas
// (prints the same URL line with "already serving", exit 0) instead of an EADDRINUSE trace.
test('AC-20260905-01-11: serve SHALL CONTINUE TO derive the atlas index on request (shapes-only tree, no design/atlas file) and a second serve on the same port prints "already serving" + exits 0', async () => {
  const dir = tmpdir('atlas-serve-derived')
  fs.mkdirSync(path.join(dir, 'design/shapes'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/shapes/work-queue.html'), '<main data-screen-label="work-queue">wq</main>')
  fs.writeFileSync(path.join(dir, 'design/shapes/stacked-cards.html'), '<main data-screen-label="stacked-cards">sc</main>')
  const port = 43000 + Math.floor(Math.random() * 2000)
  const child = spawn(process.execPath, [path.join(SPEC, 'scripts/design-atlas.js'), 'serve', '--root', dir, '--port', String(port)])
  try {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('serve did not print its first line')), 5000)
      child.stdout.once('data', () => { clearTimeout(t); resolve() })
    })
    const get = (p) => new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port, path: p }, (res) => {
        let body = ''
        res.on('data', (c) => { body += c })
        res.on('end', () => resolve({ status: res.statusCode, body }))
      }).on('error', reject)
    })
    assert.ok(!fs.existsSync(path.join(dir, 'design/atlas/index.html')), 'precondition: no atlas file exists before the first request')
    for (const p of ['/atlas/index.html', '/', '/atlas/']) {
      const r = await get(p)
      assert.strictEqual(r.status, 200, 'GET ' + p + ' must answer 200 by deriving the atlas, never 404')
      assert.match(r.body, /work-queue/, 'GET ' + p + ' must carry the shapes section')
      assert.match(r.body, /candidate/, 'GET ' + p + ' must mark each shape as a candidate')
      assert.match(r.body, /\/__notes\/notes\.js/, 'the derived atlas must carry the notes layer like every served html')
    }
    assert.ok(fs.existsSync(path.join(dir, 'design/atlas/index.html')), 'the derived atlas is also written to disk so file:// readers see the same page')

    const second = spawnSync(process.execPath, [path.join(SPEC, 'scripts/design-atlas.js'), 'serve', '--root', dir, '--port', String(port)], { encoding: 'utf8', timeout: 5000 })
    assert.strictEqual(second.status, 0, 'a second serve on a busy atlas port must exit 0, not crash: ' + second.stderr)
    assert.strictEqual(second.stdout.split('\n')[0],
      'already serving http://localhost:' + port + '/atlas/index.html — remote: ssh -L ' + port + ':localhost:' + port + ' <host>',
      'the first line must be the same URL line, verb "already serving"')
  } finally {
    child.kill('SIGTERM')
    await new Promise((resolve) => child.on('exit', resolve))
  }
})

// specs/20260905/04-per-project-look-server.md D2: design-atlas.js has no `stop` subcommand yet
// — `stop open|decide|list` all fall through to the generic usage die() (exit 2), so every
// assertion below is red until the three subcommands move here from the deleted hub script (D1).
// AC-20260905-04-2, AC-20260905-04-3, AC-20260905-04-4.

function freePort() {
  return new Promise((resolve, reject) => {
    const net = require('node:net')
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close((err) => (err ? reject(err) : resolve(port)))
    })
    srv.on('error', reject)
  })
}

// Starts a `design-atlas.js serve --root <dir> --port <port>` child, waits for its first stdout
// line (readiness), runs `fn`, and always tears the child down — a hung/failed assertion in `fn`
// must never leave a listening server behind (AC-20260905-04-2/-3/-4's shared hygiene rule).
async function withServeAt(dir, port, fn) {
  const child = spawn(process.execPath, [path.join(SPEC, 'scripts/design-atlas.js'), 'serve', '--root', dir, '--port', String(port)])
  try {
    let stderrBuf = ''
    child.stderr.on('data', (chunk) => { stderrBuf += chunk.toString('utf8') })
    let stdoutBuf = ''
    const firstLinePromise = new Promise((resolve) => {
      child.stdout.on('data', (chunk) => {
        stdoutBuf += chunk.toString('utf8')
        if (stdoutBuf.includes('\n')) resolve()
      })
    })
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('serve --port ' + port + ' did not print its first stdout line within 5s: ' + stderrBuf)), 5000))
    await Promise.race([firstLinePromise, timeout])
    return await fn()
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exitPromise = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })))
      child.kill('SIGTERM')
      const exitTimeout = new Promise((resolve) => setTimeout(resolve, 5000))
      await Promise.race([exitPromise, exitTimeout])
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }
  }
}

function getPath(port, p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => resolve({ status: res.statusCode, body }))
    }).on('error', reject)
  })
}

function readPicksOf(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'design/mocks/picks.json'), 'utf8'))
}

test('AC-20260905-04-2: design-atlas.js stop open writes the stop through lib/mocks-picks.js, prints exactly one stdout line — the verified probe URL — and refuses a malformed candidate set naming the missing field', async () => {
  const dir = tmpdir('atlas-stop-open')
  const port = await freePort()
  await withServeAt(dir, port, async () => {
    const approve = runNode('scripts/design-atlas.js', ['stop', 'open', '--root', dir, '--kind', 'approve', '--key', 'journey-approved:j',
      '--title', 'approve journey j', '--candidates', 'a=mocks/a.html,b=mocks/b.html', '--port', String(port)])
    assert.strictEqual(approve.status, 0, 'stop open with a healthy serve child up must exit 0: ' + approve.stdout + approve.stderr)
    assert.strictEqual(approve.stdout, 'http://localhost:' + port + '/atlas/index.html#stop-P001\n',
      'stop open must print exactly one stdout line — the D2 contract URL, no `/p/<name>/` mount: got ' + JSON.stringify(approve.stdout))
    const stops = readPicksOf(dir)
    const stop = stops.find((s) => s.id === 'P001')
    assert.ok(stop && stop.status === 'open', 'the written stop must be P001, still open: ' + JSON.stringify(stops))
    assert.strictEqual(stop.url, approve.stdout.trim(), 'the persisted stop.url must equal the printed line exactly')
    assert.deepStrictEqual(stop.candidates,
      [{ group: null, label: 'a', path: 'mocks/a.html' }, { group: null, label: 'b', path: 'mocks/b.html' }],
      'an approve stop\'s candidates must carry a null group on every entry: ' + JSON.stringify(stop.candidates))
    const probed = await getPath(port, '/atlas/index.html')
    assert.strictEqual(probed.status, 200, 'the served atlas must answer 200 after stop open has written the stop')
    assert.ok(probed.body.includes('id="stop-P001"'), 'stop open\'s own probe target must render the new stop\'s block: got tail ' + JSON.stringify(probed.body.slice(-400)))

    const pick = runNode('scripts/design-atlas.js', ['stop', 'open', '--root', dir, '--kind', 'pick', '--key', 'theme-picked',
      '--title', 'pick the theme', '--candidates', 'ocean/signin=theme/ocean/signin.html,ember/signin=theme/ember/signin.html', '--port', String(port)])
    assert.strictEqual(pick.status, 0, 'a pick stop with a group on every candidate must exit 0: ' + pick.stdout + pick.stderr)
    const pickStop = readPicksOf(dir).find((s) => s.key === 'theme-picked')
    assert.deepStrictEqual([...new Set((pickStop.candidates || []).map((c) => c.group))].sort(), ['ember', 'ocean'],
      'a pick stop\'s candidates must carry the declared groups: ' + JSON.stringify(pickStop && pickStop.candidates))

    const before = readPicksOf(dir)
    const missingGroup = runNode('scripts/design-atlas.js', ['stop', 'open', '--root', dir, '--kind', 'pick', '--key', 'theme-picked',
      '--title', 'pick the theme', '--candidates', 'a=mocks/a.html', '--port', String(port)])
    assert.strictEqual(missingGroup.status, 2, 'a pick stop with a group-less candidate must refuse: ' + missingGroup.stdout + missingGroup.stderr)
    assert.match(missingGroup.stderr + missingGroup.stdout, /group/, 'the refusal must name "group" as the missing field: ' + missingGroup.stdout + missingGroup.stderr)

    const noCandidates = runNode('scripts/design-atlas.js', ['stop', 'open', '--root', dir, '--kind', 'approve', '--key', 'journey-approved:j',
      '--title', 'approve journey j', '--port', String(port)])
    assert.strictEqual(noCandidates.status, 2, 'stop open with no --candidates must refuse: ' + noCandidates.stdout + noCandidates.stderr)
    assert.match(noCandidates.stderr + noCandidates.stdout, /candidates/, 'the refusal must name "candidates": ' + noCandidates.stdout + noCandidates.stderr)
    assert.deepStrictEqual(readPicksOf(dir), before, 'a refused stop open must write nothing: ' + JSON.stringify(readPicksOf(dir)))
  })
})

test('AC-20260905-04-3: design-atlas.js stop open writes the stop even when nothing answers the probe, exits 3 naming the serve remedy as a tracked background task, and a re-run once serve is up supersedes the unprobed stop', async () => {
  const dir = tmpdir('atlas-stop-probe')
  const port = await freePort()

  const unreachable = runNode('scripts/design-atlas.js', ['stop', 'open', '--root', dir, '--kind', 'approve', '--key', 'journey-approved:j',
    '--title', 'approve journey j', '--candidates', 'a=mocks/a.html', '--port', String(port)])
  assert.strictEqual(unreachable.status, 3, 'stop open with nothing listening on --port must exit 3: ' + unreachable.stdout + unreachable.stderr)
  assert.strictEqual(unreachable.stdout, '', 'a failed probe must print nothing on stdout: got ' + JSON.stringify(unreachable.stdout))
  assert.match(unreachable.stderr, /serve --root/, 'the exit-3 remedy must name `serve --root`: ' + JSON.stringify(unreachable.stderr))
  assert.match(unreachable.stderr, /tracked background task/, 'the exit-3 remedy must call the serve command a "tracked background task": ' + JSON.stringify(unreachable.stderr))
  const afterFailedProbe = readPicksOf(dir).find((s) => s.id === 'P001')
  assert.ok(afterFailedProbe && afterFailedProbe.url, 'the stop must still be written with its url even though the probe failed: ' + JSON.stringify(readPicksOf(dir)))

  await withServeAt(dir, port, async () => {
    const retried = runNode('scripts/design-atlas.js', ['stop', 'open', '--root', dir, '--kind', 'approve', '--key', 'journey-approved:j',
      '--title', 'approve journey j', '--candidates', 'a=mocks/a.html', '--port', String(port)])
    assert.strictEqual(retried.status, 0, 're-running stop open once serve is up must exit 0: ' + retried.stdout + retried.stderr)
    assert.strictEqual(retried.stdout, 'http://localhost:' + port + '/atlas/index.html#stop-P002\n',
      'the re-run must open a fresh stop P002 (same key supersedes P001): got ' + JSON.stringify(retried.stdout))
    const stops = readPicksOf(dir)
    assert.strictEqual(stops.find((s) => s.id === 'P001').status, 'superseded', 'the unprobed P001 must be superseded by the successful re-run: ' + JSON.stringify(stops))
    assert.strictEqual(stops.find((s) => s.id === 'P002').status, 'open', 'the fresh P002 must be open: ' + JSON.stringify(stops))
  })
})

test('AC-20260905-04-4: design-atlas.js stop decide records/re-decides/refuses-once-consumed and stop list renders non-superseded stops; a cold root gets only picks.json from stop open, never status.json/ledger.md/seed.md', async () => {
  const dir = tmpdir('atlas-stop-decide')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/picks.json'), JSON.stringify([{
    id: 'P001', kind: 'approve', key: 'journey-approved:j', title: 'approve journey j', question: null,
    candidates: [{ group: null, label: 'a', path: 'mocks/a.html' }],
    url: null, openedAt: '2026-01-01T00:00:00.000Z', status: 'open', decision: null, previous: [],
  }], null, 2) + '\n')

  const changed = runNode('scripts/design-atlas.js', ['stop', 'decide', '--root', dir, '--id', 'P001', '--verdict', 'change', '--note', 'too dense', '--by', 'chat'])
  assert.strictEqual(changed.status, 0, 'deciding an open stop must exit 0: ' + changed.stdout + changed.stderr)
  assert.strictEqual(changed.stdout, 'decided P001 change\n', 'stop decide must print exactly "decided P001 change": got ' + JSON.stringify(changed.stdout))
  let stop = readPicksOf(dir).find((s) => s.id === 'P001')
  assert.strictEqual(stop.status, 'decided', 'a decided stop must move to status "decided": ' + JSON.stringify(stop))
  assert.strictEqual(stop.decision.note, 'too dense', 'the decision must record the note verbatim: ' + JSON.stringify(stop))
  assert.strictEqual(stop.decision.by, 'chat', 'the decision must record by:"chat": ' + JSON.stringify(stop))

  const reDecided = runNode('scripts/design-atlas.js', ['stop', 'decide', '--root', dir, '--id', 'P001', '--verdict', 'approve', '--by', 'chat'])
  assert.strictEqual(reDecided.status, 0, 're-deciding a decided stop must exit 0 (spec 01 D1): ' + reDecided.stdout + reDecided.stderr)
  assert.strictEqual(reDecided.stdout, 'decided P001 approve\n', 'the re-decide must print exactly "decided P001 approve": got ' + JSON.stringify(reDecided.stdout))

  const listed = runNode('scripts/design-atlas.js', ['stop', 'list', '--root', dir])
  assert.strictEqual(listed.status, 0, 'stop list must exit 0: ' + listed.stdout + listed.stderr)
  assert.strictEqual(listed.stdout, 'P001 decided approve journey-approved:j — approve journey j\n',
    'stop list must print one line per non-superseded stop in the D2 format: got ' + JSON.stringify(listed.stdout))

  const picksLib = require(path.join(SPEC, 'scripts/lib/mocks-picks'))
  const { stops: consumedStops } = picksLib.consumeStop(readPicksOf(dir), 'P001')
  fs.writeFileSync(path.join(dir, 'design/mocks/picks.json'), JSON.stringify(consumedStops, null, 2) + '\n')
  const afterConsumed = runNode('scripts/design-atlas.js', ['stop', 'decide', '--root', dir, '--id', 'P001', '--verdict', 'approve', '--by', 'chat'])
  assert.strictEqual(afterConsumed.status, 2, 'deciding a consumed stop must refuse: ' + afterConsumed.stdout + afterConsumed.stderr)
  assert.match(afterConsumed.stderr + afterConsumed.stdout, /already consumed/, 'the refusal must say "already consumed": ' + afterConsumed.stdout + afterConsumed.stderr)

  const coldRoot = tmpdir('atlas-stop-cold')
  const port = await freePort()
  await withServeAt(coldRoot, port, async () => {
    const opened = runNode('scripts/design-atlas.js', ['stop', 'open', '--root', coldRoot, '--kind', 'approve', '--key', 'approved',
      '--title', 'sign off', '--candidates', 'a=mocks/a.html', '--port', String(port)])
    assert.strictEqual(opened.status, 0, 'stop open on a cold root with a serve child up must exit 0: ' + opened.stdout + opened.stderr)
    assert.ok(fs.existsSync(path.join(coldRoot, 'design/mocks/picks.json')), 'stop open must create design/mocks/picks.json on a cold root')
    for (const never of ['status.json', 'ledger.md', 'seed.md']) {
      assert.ok(!fs.existsSync(path.join(coldRoot, 'design/mocks', never)),
        'stop open on a cold root must never create design/mocks/' + never + ' — that would grow a mocks state machine /spec:sketch must not carry')
    }
  })
})

test('atlas card previews clamp to one fixed height (7.89.0): page() ships the .shot max-height clamp, the clip fade, and a __fit that toggles .clip when the scaled mock overflows the cap', () => {
  const { page } = require('../spec/scripts/design-atlas.js')
  const html = page('t', '<div class="grid"></div>')
  assert.match(html, /\.shot\{position:relative;max-height:var\(--v-shot-max,260px\)\}/,
    'card previews must carry a fixed max-height so a tall mock never makes a tall card — got no .shot clamp')
  assert.match(html, /\.shot\.clip::after\{[^}]*linear-gradient/,
    'the clipped remainder must fade out (a .shot.clip::after gradient) — got none')
  // page() takes the body from its caller (UI_SCRIPT is appended by buildAtlas), so the __fit
  // clause is pinned on the script source itself.
  const src = fs.readFileSync(path.join(__dirname, '..', 'spec', 'scripts', 'design-atlas.js'), 'utf8')
  assert.match(src, /s\.classList\.toggle\("clip",full>cap\)/,
    '__fit must mark a card .clip only when the scaled height exceeds the cap — got no toggle')
})

// ---------------------------------------------------------------------------
// specs/20260906/03-questions-on-the-wireframe.md — TDD red: D3's /__notes/list ledger join,
// /__notes/answer, the /__notes/resolve question refusal, and /__notes/add's reason/kind handling
// do not exist yet on design-atlas.js; D5's question-row rendering, its three controls, and the
// composer's reason chips + scope toggle do not exist yet on lib/notes-layer.browser.js.
// ---------------------------------------------------------------------------

function writeQuestionLedger(dir, rows) {
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  const rowLines = rows.map((r) => `| ${r.id} | ${r.step} | ${r.kind} | ${r.claim} | ${r.tag} | ${r.status} | ${r.rejected || '-'} | - | - |`).join('\n')
  fs.writeFileSync(path.join(dir, 'design/mocks/ledger.md'), `# Provenance ledger — { project }

## Assumptions

| id | step | kind | claim | tag | status | rejected | dependents | note |
| - | - | - | - | - | - | - | - | - |
${rowLines}

## Misunderstandings

| id | what | step | cost | note |
| - | - | - | - | - |
`)
}

function writeQuestionNotes(dir, notes) {
  fs.writeFileSync(path.join(dir, 'design/mocks/notes.json'), JSON.stringify(notes, null, 2) + '\n')
}

// s3 repair (review of specs/20260906/03-questions-on-the-wireframe.md build): AC-20260906-03-4
// promises the rewrite touches ONLY the named row — a regex match against the other row's text
// proves that row's cells are still present somewhere in the file, not that every other BYTE
// (including line order, whitespace, and every other row) is untouched. Compare line-by-line
// against a captured before-snapshot instead: every line except the named row's must be
// byte-identical, and the named row's line must match the expected rewritten shape.
function assertLedgerOnlyRowChanged(before, after, id, expectedRowRegex, message) {
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')
  assert.strictEqual(afterLines.length, beforeLines.length,
    message + ' — the rewrite must not add or remove any line: before had ' + beforeLines.length + ', after has ' + afterLines.length)
  const rowMarker = '| ' + id + ' |'
  let sawRow = false
  for (let i = 0; i < beforeLines.length; i++) {
    if (beforeLines[i].startsWith(rowMarker)) {
      sawRow = true
      assert.match(afterLines[i], expectedRowRegex,
        message + ' — line ' + (i + 1) + ' (the ' + id + ' row) must match the expected rewritten row: got ' + JSON.stringify(afterLines[i]))
    } else {
      assert.strictEqual(afterLines[i], beforeLines[i],
        message + ' — line ' + (i + 1) + ' (not the ' + id + ' row) must be byte-for-byte unchanged: before ' + JSON.stringify(beforeLines[i]) + ' after ' + JSON.stringify(afterLines[i]))
    }
  }
  assert.ok(sawRow, 'test setup requires the ' + id + ' row to exist in the before-snapshot, or this comparison proves nothing')
}

function baseQuestion(id, screen, ledgerId) {
  return {
    id, scope: 'mock', screen, state: null, kind: 'question', ledgerId,
    text: 'claim', by: 'session', at: new Date().toISOString(), status: 'open',
    addressed: null, reply: null, resolvedBy: null, resolvedAt: null, answer: null,
  }
}

// ---------------------------------------------------------------------------
// AC-20260906-03-3
// ---------------------------------------------------------------------------
test('AC-20260906-03-3: GET /__notes/list joins claim/rejected/tag/status from the ledger row onto a question note (ledgerMissing:true when the row is absent); POST /__notes/add stores a valid reason, 400s an unknown reason, and 400s a body carrying kind', async () => {
  const dir = tmpdir('atlas-notes-questions')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/signin.html'), '<main data-screen-label="signin">signin</main>\n')
  writeQuestionLedger(dir, [{ id: 'W7', step: 'WIREFRAMES', kind: 'product', claim: 'single-use link', tag: 'inferred', status: 'open', rejected: 'durable link' }])
  writeQuestionNotes(dir, [baseQuestion('N001', 'signin', 'W7'), baseQuestion('N002', 'signin', 'W99')])

  await withHandler(dir, '', async ({ get, post }) => {
    const listed = await get('/__notes/list?screen=signin')
    assert.strictEqual(listed.status, 200, 'GET /__notes/list?screen=signin must respond 200: ' + listed.body)
    const notes = JSON.parse(listed.body)
    const w7 = notes.find((n) => n.id === 'N001')
    assert.ok(w7, 'the response must still carry the question note N001: got ' + JSON.stringify(notes))
    assert.deepStrictEqual(
      { claim: w7.claim, rejected: w7.rejected, tag: w7.tag, status: w7.status },
      { claim: 'single-use link', rejected: 'durable link', tag: 'inferred', status: 'open' },
      'D3: GET /__notes/list must join claim/rejected/tag/status from ledger row W7 onto the question note it belongs to: got ' + JSON.stringify(w7))

    const ghost = notes.find((n) => n.id === 'N002')
    assert.ok(ghost, 'the response must still carry N002 (pinned to a ledger row that does not exist): got ' + JSON.stringify(notes))
    assert.strictEqual(ghost.ledgerMissing, true, 'D3: a question pinned to a missing ledger row (W99) must carry ledgerMissing:true: got ' + JSON.stringify(ghost))

    const withReason = await post('/__notes/add', { scope: 'project', screen: null, state: null, text: 'no screen for cancelling a session', by: 'JJ', reason: 'missing-screen' })
    assert.strictEqual(withReason.status, 201, 'D3: POST /__notes/add carrying a valid reason must respond 201: ' + withReason.status + ' ' + withReason.body)
    const storedNote = JSON.parse(withReason.body)
    assert.strictEqual(storedNote.reason, 'missing-screen', 'D3: the stored note must carry the reason verbatim: got ' + JSON.stringify(storedNote))

    const badReason = await post('/__notes/add', { scope: 'project', screen: null, state: null, text: 'x', by: 'JJ', reason: 'typo' })
    assert.strictEqual(badReason.status, 400, 'D3: POST /__notes/add with an unknown reason "typo" must respond 400, never silently accept it: got ' + badReason.status)

    const withKind = await post('/__notes/add', { scope: 'mock', screen: 'signin', state: null, text: 'x', by: 'JJ', kind: 'question' })
    assert.strictEqual(withKind.status, 400, 'D3: POST /__notes/add carrying "kind" in the body must respond 400 — questions are session-authored, never client-authored: got ' + withKind.status)
    assert.match(withKind.body, /session-authored/, 'the kind-rejection body must carry the exact D3 phrase "session-authored": got ' + withKind.body)
  })
})

// ---------------------------------------------------------------------------
// AC-20260906-03-4
// ---------------------------------------------------------------------------
test('AC-20260906-03-4: POST /__notes/answer rewrites exactly the named ledger row to confirmed/overridden <today> (every other row byte-unchanged) and resolves the note with the verdict/text; a missing text on "no" 400s, an unknown id 404s, a second answer 409s; POST /__notes/resolve on a question 400s naming the answer endpoint', async () => {
  const dir = tmpdir('atlas-notes-answer')
  writeQuestionLedger(dir, [
    { id: 'W7', step: 'WIREFRAMES', kind: 'product', claim: 'single-use link', tag: 'inferred', status: 'open' },
    { id: 'W8', step: 'WIREFRAMES', kind: 'product', claim: 'dark send button', tag: 'invented', status: 'open' },
  ])
  writeQuestionNotes(dir, [baseQuestion('N012', 'signin', 'W7'), baseQuestion('N013', 'signin', 'W8')])

  await withHandler(dir, '', async ({ post }) => {
    const today = new Date().toISOString().slice(0, 10)

    const ledgerBeforeYes = fs.readFileSync(path.join(dir, 'design/mocks/ledger.md'), 'utf8')
    const yes = await post('/__notes/answer', { id: 'N012', verdict: 'yes', by: 'Ren' })
    assert.strictEqual(yes.status, 200, 'a "yes" answer for an existing open question must respond 200: ' + yes.status + ' ' + yes.body)
    const ledgerAfterYes = fs.readFileSync(path.join(dir, 'design/mocks/ledger.md'), 'utf8')
    assertLedgerOnlyRowChanged(ledgerBeforeYes, ledgerAfterYes, 'W7',
      new RegExp('^\\| W7 \\| WIREFRAMES \\| product \\| single-use link \\| inferred \\| confirmed ' + today + ' \\|'),
      'D4/A2 (s3): a "yes" answer must rewrite exactly the W7 line to "confirmed <today>" and leave every other line of ledger.md — including the W8 row — byte-for-byte unchanged')
    const yesNote = JSON.parse(yes.body)
    assert.strictEqual(yesNote.answer && yesNote.answer.verdict, 'yes', 'the response note must carry answer.verdict "yes": got ' + JSON.stringify(yesNote))
    assert.strictEqual(yesNote.status, 'resolved', 'the response note must carry status "resolved": got ' + JSON.stringify(yesNote))

    const noMissingText = await post('/__notes/answer', { id: 'N013', verdict: 'no', by: 'Ren' })
    assert.strictEqual(noMissingText.status, 400, 'a "no" answer with no text must respond 400, never silently accept an empty correction: got ' + noMissingText.status)

    const ledgerBeforeNo = fs.readFileSync(path.join(dir, 'design/mocks/ledger.md'), 'utf8')
    const no = await post('/__notes/answer', { id: 'N013', verdict: 'no', text: 'Owner sets modality', by: 'Ren' })
    assert.strictEqual(no.status, 200, 'a "no" answer carrying text must respond 200: ' + no.status + ' ' + no.body)
    const ledgerAfterNo = fs.readFileSync(path.join(dir, 'design/mocks/ledger.md'), 'utf8')
    assertLedgerOnlyRowChanged(ledgerBeforeNo, ledgerAfterNo, 'W8',
      new RegExp('^\\| W8 \\| WIREFRAMES \\| product \\| dark send button \\| invented \\| overridden ' + today + ' \\|'),
      'D4/A2 (s3): a "no" answer must rewrite exactly the W8 line to "overridden <today>" and leave every other line of ledger.md — including the already-confirmed W7 row — byte-for-byte unchanged')
    const noNote = JSON.parse(no.body)
    assert.strictEqual(noNote.answer && noNote.answer.text, 'Owner sets modality', 'the response note must carry answer.text verbatim: got ' + JSON.stringify(noNote))

    const unknown = await post('/__notes/answer', { id: 'N999', verdict: 'yes', by: 'Ren' })
    assert.strictEqual(unknown.status, 404, 'answering an unknown id must respond 404: got ' + unknown.status)

    const again = await post('/__notes/answer', { id: 'N012', verdict: 'yes', by: 'Ren' })
    assert.strictEqual(again.status, 409, 'answering an already-answered question a second time must respond 409, never silently re-write the row: got ' + again.status)

    const resolveAttempt = await post('/__notes/resolve', { id: 'N013', by: 'Ren' })
    assert.strictEqual(resolveAttempt.status, 400, 'POST /__notes/resolve on a question must respond 400 — it is never the resolve path for a question: got ' + resolveAttempt.status)
    assert.match(resolveAttempt.body, /answer it/, 'the resolve-on-question refusal must carry the exact D3 phrase "answer it": got ' + resolveAttempt.body)
  })
})

// ---------------------------------------------------------------------------
// s0 pin (review of specs/20260906/03-questions-on-the-wireframe.md build, AC-20260906-03-4):
// the session's own follow-up (`notes address --id <qid> --change … --ledger M15`, per the spec's
// own Behavior section) flips addressNote's status to "addressed" without touching the note's
// prior `answer` — "already answered" must key on note.answer !== null, never on
// note.status !== "resolved", or the addressed question reads back as unanswered and a second
// answer silently overwrites it.
// ---------------------------------------------------------------------------
test('AC-20260906-03-4 (s0 pin): after a "no" answer is addressed via the real `notes address` (moving status to "addressed" while the answer stays set), a second POST /__notes/answer on the same question still 409s', async () => {
  const dir = tmpdir('atlas-notes-answer-addressed')
  writeQuestionLedger(dir, [{ id: 'W7', step: 'WIREFRAMES', kind: 'product', claim: 'single-use link', tag: 'inferred', status: 'open' }])
  writeQuestionNotes(dir, [baseQuestion('N012', 'signin', 'W7')])

  await withHandler(dir, '', async ({ post }) => {
    const no = await post('/__notes/answer', { id: 'N012', verdict: 'no', text: 'Owner sets modality', by: 'Ren' })
    assert.strictEqual(no.status, 200, 'test setup requires the initial "no" answer to be accepted: ' + no.status + ' ' + no.body)

    const addressed = runNode('scripts/mocks-driver.js', ['--root', dir, 'notes', 'address', '--id', 'N012', '--change', 'redrawn with expiry', '--ledger', 'M15'])
    assert.strictEqual(addressed.status, 0, 'test setup requires the real `notes address` to accept the already-answered question: ' + addressed.stdout + addressed.stderr)
    const afterAddress = JSON.parse(fs.readFileSync(path.join(dir, 'design/mocks/notes.json'), 'utf8')).find((n) => n.id === 'N012')
    assert.strictEqual(afterAddress.status, 'addressed', 'test setup requires `notes address` to have moved status to "addressed" — otherwise this fixture does not reproduce the s0 scenario: got ' + JSON.stringify(afterAddress))
    assert.ok(afterAddress.answer && afterAddress.answer.verdict === 'no',
      'test setup requires `notes address` to leave the prior answer verdict in place: got ' + JSON.stringify(afterAddress))

    const again = await post('/__notes/answer', { id: 'N012', verdict: 'yes', by: 'Ren' })
    assert.strictEqual(again.status, 409,
      's0: a second answer on a question already answered "no" must still respond 409 after `notes address` moved its status to "addressed" — "already answered" must key on note.answer !== null, never on note.status !== "resolved", or an addressed question is silently re-answered and its recorded correction lost: got ' + again.status + ' ' + again.body)
  })
})

// ---------------------------------------------------------------------------
// AC-20260906-03-6
// ---------------------------------------------------------------------------
test('AC-20260906-03-6: notes-layer.browser.js renders a distinct question row (claim, "I assumed", "I rejected:") with three controls whose labels are exactly "Yes, that\'s right"/"No, it\'s…"/"Later"; clicking "Yes, that\'s right" posts {id, verdict:"yes", by}; the composer gains four reason chips and a scope toggle whose "Whole project" state posts scope:"project"; an answered question renders "You confirmed" with no controls; the document-level style CONTINUES TO be the single body.lb-open .nl-host{display:none} rule', async () => {
  const src = fs.readFileSync(path.join(SPEC, 'scripts/lib/notes-layer.browser.js'), 'utf8')
  const textOf = (el) => [el.textContent, el.innerHTML].filter((v) => typeof v === 'string').join(' ')

  async function evalWithNotes(notes) {
    const { document, created } = makeNotesLayerDom({ metaContent: 'mock', screenLabel: 'a' })
    const posts = []
    const sandbox = {
      location: { pathname: '/mocks/a.html', search: '' },
      document,
      window: { prompt: () => 'jj' },
      localStorage: { getItem: () => 'jj', setItem() {} },
      fetch(url, opts) {
        if (opts && opts.method === 'POST') {
          posts.push({ url, body: opts.body ? JSON.parse(opts.body) : null })
          return Promise.resolve({ json: () => Promise.resolve({}) })
        }
        return Promise.resolve({ json: () => Promise.resolve(notes) })
      },
      URLSearchParams,
    }
    vm.createContext(sandbox)
    vm.runInContext(src, sandbox)
    for (let i = 0; i < 6; i++) await Promise.resolve()
    return { document, created, posts }
  }

  const question = {
    id: 'N010', scope: 'mock', screen: 'a', state: 'default', kind: 'question', ledgerId: 'W7',
    text: 'single-use link', claim: 'single-use link', rejected: 'durable link', tag: 'inferred', status: 'open',
    by: 'session', at: new Date().toISOString(), addressed: null, reply: null, resolvedBy: null, resolvedAt: null, answer: null,
  }
  const { document, created, posts } = await evalWithNotes([question])

  const allText = created.map(textOf).join(' | ')
  assert.ok(allText.includes('I assumed'), 'D5: a question row must render the literal "I assumed": got ' + allText)
  assert.ok(allText.includes('single-use link'), 'D5: a question row must render its claim text: got ' + allText)
  assert.ok(allText.includes('I rejected:') && allText.includes('durable link'),
    'D5: a question row carrying a rejected value must render "I rejected: <rejected>": got ' + allText)

  const buttons = created.filter((el) => el.tagName === 'BUTTON')
  const yesBtn = buttons.find((el) => el.textContent === "Yes, that's right")
  const noBtn = buttons.find((el) => el.textContent === "No, it's…")
  const laterBtn = buttons.find((el) => el.textContent === 'Later')
  assert.ok(yesBtn && noBtn && laterBtn,
    'D5: a question row must render exactly three controls labeled "Yes, that\'s right", "No, it\'s…", and "Later": got buttons ' + JSON.stringify(buttons.map((el) => el.textContent)))

  yesBtn.onclick()
  const answerPost = posts.find((p) => /\/__notes\/answer$/.test(p.url))
  assert.ok(answerPost, 'D5: clicking "Yes, that\'s right" must POST to /__notes/answer: got ' + JSON.stringify(posts))
  assert.deepStrictEqual(
    { id: answerPost.body && answerPost.body.id, verdict: answerPost.body && answerPost.body.verdict, by: answerPost.body && answerPost.body.by },
    { id: 'N010', verdict: 'yes', by: 'jj' },
    'D5: the answer POST body must carry {id, verdict:"yes", by}: got ' + JSON.stringify(answerPost && answerPost.body))

  const addBtn = created.find((el) => el.tagName === 'BUTTON' && el.textContent === '+ Note on this state')
  assert.ok(addBtn, 'test setup requires the mock-scope composer trigger button to exist')
  addBtn.onclick()
  for (const label of ['Missing screen', 'Wrong direction', 'Wrong words', 'Other']) {
    assert.ok(created.some((el) => el.textContent === label),
      'D5: the composer must render a reason chip labeled "' + label + '": got ' + JSON.stringify(created.map((el) => el.textContent)))
  }
  const wholeProjectToggle = created.find((el) => el.textContent === 'Whole project')
  assert.ok(wholeProjectToggle, 'D5: the mock-page composer must render a scope toggle option labeled "Whole project": got ' + JSON.stringify(created.map((el) => el.textContent)))
  if (wholeProjectToggle.onclick) wholeProjectToggle.onclick()
  const textarea = created.filter((el) => el.tagName === 'TEXTAREA').pop()
  const saveBtn = created.filter((el) => el.tagName === 'BUTTON' && el.textContent === 'Save').pop()
  assert.ok(textarea && saveBtn, 'test setup requires the composer\'s textarea and Save button to exist once opened')
  textarea.value = 'there is no screen for cancelling a session'
  saveBtn.onclick()
  const addPost = posts.find((p) => /\/__notes\/add$/.test(p.url) && p.body && p.body.text === 'there is no screen for cancelling a session')
  assert.ok(addPost, 'D5: after toggling "Whole project" and saving, a POST /__notes/add must be issued: got ' + JSON.stringify(posts))
  assert.strictEqual(addPost.body.scope, 'project', 'D5: toggling "Whole project" then saving must post scope:"project": got ' + JSON.stringify(addPost.body))

  const answeredQuestion = Object.assign({}, question, { status: 'resolved', answer: { verdict: 'yes', text: '', by: 'Ren', at: new Date().toISOString() } })
  const { created: created2 } = await evalWithNotes([answeredQuestion])
  const allText2 = created2.map(textOf).join(' | ')
  assert.ok(allText2.includes('You confirmed'), 'D5: an answered "yes" question must render "You confirmed": got ' + allText2)
  assert.ok(!created2.some((el) => el.tagName === 'BUTTON' && ["Yes, that's right", "No, it's…", 'Later'].includes(el.textContent)),
    'D5: an answered question must render no answer controls: got ' + JSON.stringify(created2.filter((el) => el.tagName === 'BUTTON').map((el) => el.textContent)))

  const headStyles = document.head.children.filter((el) => el.tagName === 'STYLE' && typeof el.textContent === 'string')
  assert.strictEqual(headStyles.length, 1, 'exactly one document-level <style> may exist: got ' + headStyles.length)
  assert.strictEqual(headStyles[0].textContent, 'body.lb-open .nl-host{display:none}',
    'the document-level style must CONTINUE TO be the single "body.lb-open .nl-host{display:none}" rule verbatim: got ' + headStyles[0].textContent)
})

// ---------------------------------------------------------------------------
// specs/20260906/04-journey-review-page.md — TDD red: the `/review/<j>.html` route, `?state=`
// mock injection, and `/__review/review.js` do not exist yet on design-atlas.js;
// lib/review-page.js and lib/review.browser.js do not exist yet either.
// ---------------------------------------------------------------------------

function writeReviewSeed(dir, journeyName, labels) {
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/seed.md'), `# Seed — Hearwell

## Product
It is a synthetic product for the review-page tests.
Built for QA engineers.
It must let a user complete a short flow.

## Facts
- primary-surface: P1

## References
- none

## Journeys
### ${journeyName}
Mika moves through a short flow.
\`\`\`surfaces
${labels.join('\n')}
\`\`\`

## Dense screen
- ${labels[labels.length - 1]}
`)
  for (const label of labels) {
    fs.writeFileSync(path.join(dir, 'design/mocks', label + '.html'),
      '<main data-screen-label="' + label + '" data-status="sketch">' + label + '</main>\n')
  }
}

// ---------------------------------------------------------------------------
// AC-20260906-04-2
// ---------------------------------------------------------------------------
test('AC-20260906-04-2: GET /review/onboarding.html derives 200 from the on-disk stores (a note added via /__notes/add appears on the next GET), GET /review/nowhere.html 404s naming the declared journey "onboarding", ?clean strips the rail/composer/review.js, and GET /__review/review.js serves lib/review.browser.js verbatim with cache-control no-store', async () => {
  const dir = tmpdir('atlas-review-route')
  writeReviewSeed(dir, 'onboarding', ['signin'])
  writeQuestionLedger(dir, [])
  writeQuestionNotes(dir, [])
  writePicksJson(dir, [])

  await withHandler(dir, '', async ({ get, post }) => {
    const first = await get('/review/onboarding.html')
    assert.strictEqual(first.status, 200, 'AC-2: GET /review/onboarding.html must derive 200 for a declared journey: ' + first.status + ' ' + first.body.slice(0, 300))
    assert.ok(!first.body.includes('add a cancel screen'), 'test setup requires the not-yet-added note text to be absent from the first response')

    const added = await post('/__notes/add', { scope: 'project', text: 'add a cancel screen', by: 'jj' })
    assert.strictEqual(added.status, 201, 'test setup requires POST /__notes/add to be accepted: ' + added.status + ' ' + added.body)

    const second = await get('/review/onboarding.html')
    assert.strictEqual(second.status, 200, 'AC-2: GET /review/onboarding.html must still 200 after a note is added: ' + second.status)
    assert.ok(second.body.includes('add a cancel screen'), 'AC-2: the page must derive on every request — a note added via /__notes/add must appear on the very next GET, never a cached/stale page: got ' + second.body.slice(0, 600))

    const missing = await get('/review/nowhere.html')
    assert.strictEqual(missing.status, 404, 'AC-2: GET /review/nowhere.html must 404 for an undeclared journey: got ' + missing.status)
    assert.match(missing.body, /onboarding/, 'AC-2: the 404 body must name the declared journeys, including "onboarding": got ' + JSON.stringify(missing.body))

    const clean = await get('/review/onboarding.html?clean')
    assert.strictEqual(clean.status, 200, 'AC-2: ?clean must still 200: got ' + clean.status)
    assert.doesNotMatch(clean.body, /data-rv="rail"/, 'AC-2: ?clean must strip the rail: got ' + clean.body.slice(0, 600))
    assert.doesNotMatch(clean.body, /data-rv="composer"/, 'AC-2: ?clean must strip the composer: got ' + clean.body.slice(0, 600))
    assert.doesNotMatch(clean.body, /__review\/review\.js/, 'AC-2: ?clean must strip the review.js script tag: got ' + clean.body.slice(0, 600))

    const reviewJs = await get('/__review/review.js')
    assert.strictEqual(reviewJs.status, 200, 'AC-2: GET /__review/review.js must serve 200: got ' + reviewJs.status)
    assert.strictEqual(reviewJs.headers['cache-control'], 'no-store', 'AC-2: /__review/review.js must be served with cache-control: no-store: got ' + JSON.stringify(reviewJs.headers))
    const libSrc = fs.readFileSync(path.join(SPEC, 'scripts/lib/review.browser.js'), 'utf8')
    assert.strictEqual(reviewJs.body, libSrc, 'AC-2: /__review/review.js must serve lib/review.browser.js verbatim: bytes differ')

    // review fix round F7: reqPath is already decoded once by createRequestHandler — a malformed
    // %-escape in the journey segment must 404 through the unknown-journey arm, never throw an
    // uncaught URIError (which would exit the whole serve process and drop every open look).
    const malformed = await get('/review/%25.html')
    assert.strictEqual(malformed.status, 404, 'F7: GET /review/%25.html must 404 (never crash the server on a double-decode URIError): got ' + malformed.status)
    assert.match(malformed.body, /onboarding/, 'F7: the 404 body must still name the declared journey "onboarding": got ' + JSON.stringify(malformed.body))

    const stillUp = await get('/mocks/signin.html')
    assert.strictEqual(stillUp.status, 200, 'F7: the handler must still answer GET /mocks/signin.html afterward — a crashed serve process would answer nothing at all: got ' + stillUp.status)
  })
})

// ---------------------------------------------------------------------------
// AC-20260906-04-3 / AC-20260906-04-10
// ---------------------------------------------------------------------------
test('AC-20260906-04-3/AC-20260906-04-10: GET /mocks/signin.html?clean&state=empty injects only the DOMContentLoaded click script for [data-state-btn="empty"] with no notes-layer script, ?state=empty without clean injects that click script before the notes-layer tag, and no state param CONTINUES TO serve the exact bytes served today', async () => {
  const dir = tmpdir('atlas-review-state')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  const bodyHtml = '<main data-screen-label="signin" data-status="sketch"><button data-state-btn="empty">empty</button>signin</main>\n'
  fs.writeFileSync(path.join(dir, 'design/mocks/signin.html'), bodyHtml)
  const clickScript = '<script>document.addEventListener(\'DOMContentLoaded\',function(){var b=document.querySelector(\'[data-state-btn="empty"]\');if(b)b.click()})</script>'
  // review fix round F1: a real <body>…</body> mock — the bodyless fixture above can't tell
  // "click script inserted before </body>" from "appended after the notes tag and </html>".
  const withBodyHtml = '<html><body data-screen-label="withbody" data-status="sketch"><button data-state-btn="empty">empty</button>wb</body></html>'
  fs.writeFileSync(path.join(dir, 'design/mocks/withbody.html'), withBodyHtml)

  await withHandler(dir, '', async ({ get }) => {
    const clean = await get('/mocks/signin.html?clean&state=empty')
    assert.strictEqual(clean.status, 200, 'test setup requires ?clean&state=empty to 200: got ' + clean.status)
    assert.strictEqual(clean.body, bodyHtml + clickScript, 'AC-3: ?clean&state=empty must serve the mock bytes plus exactly one injected click script for [data-state-btn="empty"] and no notes-layer tag: got ' + JSON.stringify(clean.body))

    const withNotes = await get('/mocks/signin.html?state=empty')
    assert.strictEqual(withNotes.status, 200, 'test setup requires ?state=empty (no clean) to 200: got ' + withNotes.status)
    const clickIdx = withNotes.body.indexOf(clickScript)
    const notesIdx = withNotes.body.indexOf('<meta name="notes-scope"')
    assert.ok(clickIdx !== -1, 'AC-3: ?state=empty without clean must still inject the click script: got ' + withNotes.body)
    assert.ok(notesIdx !== -1, 'test setup requires the notes-layer tag to still be injected when clean is absent: got ' + withNotes.body)
    assert.ok(clickIdx < notesIdx, 'AC-3: the state click script must be injected BEFORE the notes-layer meta/script tag: click at ' + clickIdx + ', notes at ' + notesIdx)

    const plain = await get('/mocks/signin.html')
    assert.strictEqual(plain.status, 200, 'test setup requires the plain (no state) request to 200: got ' + plain.status)
    assert.strictEqual(plain.body, bodyHtml + '\n' + '<meta name="notes-scope" content="mock">\n<script src="/__notes/notes.js"></script>\n',
      'AC-3: with no state param the server must CONTINUE TO serve the exact bytes it serves today (mock bytes plus the notes-layer injection, no click script, including the blank line the fallback has always inserted): got ' + JSON.stringify(plain.body))

    // review fix round F1: on a mock with a real </body>, the click script must land BEFORE the
    // notes meta/script tag AND before </body> — not after the notes tag and </html>.
    const withBody = await get('/mocks/withbody.html?state=empty')
    assert.strictEqual(withBody.status, 200, 'test setup requires ?state=empty (no clean) on a real <body> mock to 200: got ' + withBody.status)
    const wbClickIdx = withBody.body.indexOf(clickScript)
    const wbNotesIdx = withBody.body.indexOf('<meta name="notes-scope"')
    const wbBodyEndIdx = withBody.body.indexOf('</body>')
    assert.ok(wbClickIdx !== -1 && wbNotesIdx !== -1 && wbBodyEndIdx !== -1,
      'F1: the click script, the notes tag, and </body> must all be present: got ' + JSON.stringify(withBody.body))
    assert.ok(wbClickIdx < wbNotesIdx && wbNotesIdx < wbBodyEndIdx,
      'F1: order must be mock body -> click script -> notes meta/script -> </body>: click ' + wbClickIdx + ', notes ' + wbNotesIdx + ', </body> ' + wbBodyEndIdx + ' — got ' + JSON.stringify(withBody.body))

    // review fix round F5: a state value carrying a quote (here URL-decoded to x'y) must never be
    // interpolated into the injected script's selector literal — it serves as if absent instead
    // of producing a syntactically broken <script>.
    const badState = await get('/mocks/signin.html?clean&state=x%27y')
    assert.strictEqual(badState.status, 200, 'test setup requires ?clean&state=x%27y to 200: got ' + badState.status)
    assert.strictEqual(badState.body, bodyHtml, 'F5: an invalid state (x\'y) must serve the plain mock bytes with no injected <script>: got ' + JSON.stringify(badState.body))

    const goodStateStillClean = await get('/mocks/signin.html?clean&state=empty')
    assert.strictEqual(goodStateStillClean.body, bodyHtml + clickScript, 'F5: a valid state (empty) must remain byte-identical to the pinned literal: got ' + JSON.stringify(goodStateStillClean.body))
  })
})

// ---------------------------------------------------------------------------
// Minimal flat-DOM shim for review.browser.js — per the spec's own "AC-6 harness contract" build
// note (specs/20260906/04-journey-review-page.md Rationale): a flat element list scanned off the
// builder's real markup for data-rv tags, exposing dataset/getAttribute-family/hidden/classList/
// addEventListener/querySelector(All) (single compound selectors, descendant-scoped)/closest —
// never innerHTML parsing, getBoundingClientRect, MutationObserver, or window.prompt at load.
// ---------------------------------------------------------------------------
function parseFlatDom(html) {
  const VOID = new Set(['input', 'br', 'img', 'link', 'meta', 'hr'])

  function parseAttrs(str) {
    const attrs = {}
    const re = /([a-zA-Z_:][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
    let m
    while ((m = re.exec(str))) {
      const name = m[1]
      const val = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : ''
      attrs[name] = val
    }
    return attrs
  }

  function matchesCompound(node, compound) {
    const tagM = compound.match(/^([a-zA-Z][\w-]*)/)
    const tag = tagM && tagM[1]
    if (tag && node.tagName !== tag.toUpperCase()) return false
    const rest = tag ? compound.slice(tag.length) : compound
    const attrRe = /\[([a-zA-Z_:][-\w:.]*)(?:="([^"]*)")?\]/g
    let m
    while ((m = attrRe.exec(rest))) {
      const key = m[1]; const val = m[2]
      if (!node.hasAttribute(key)) return false
      if (val !== undefined && node.getAttribute(key) !== val) return false
    }
    return true
  }

  const allNodes = []
  function descendants(node) {
    const out = []
    for (const c of node.children) { out.push(c); out.push(...descendants(c)) }
    return out
  }
  function queryAll(scopeNode, sel) {
    const parts = sel.trim().split(/\s+/)
    const pool = scopeNode === null ? allNodes : descendants(scopeNode)
    let matched = pool.filter((n) => matchesCompound(n, parts[0]))
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i]
      const next = []
      for (const n of pool) {
        if (!matchesCompound(n, part)) continue
        let anc = n.parentNode
        let ok = false
        while (anc) { if (matched.includes(anc)) { ok = true; break } anc = anc.parentNode }
        if (ok) next.push(n)
      }
      matched = next
    }
    return matched
  }

  function makeNode(tagName, attrs) {
    const node = {
      tagName: tagName.toUpperCase(),
      attrs,
      children: [],
      parentNode: null,
      value: '',
      _handlers: {},
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null },
      setAttribute(k, v) { this.attrs[k] = String(v) },
      removeAttribute(k) { delete this.attrs[k] },
      hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) },
      addEventListener(type, fn) { (this._handlers[type] = this._handlers[type] || []).push(fn) },
      focus() { this._focused = true },
      closest(sel) {
        let n = this
        while (n) { if (matchesCompound(n, sel.trim())) return n; n = n.parentNode }
        return null
      },
      querySelector(sel) { return queryAll(this, sel)[0] || null },
      querySelectorAll(sel) { return queryAll(this, sel) },
    }
    Object.defineProperty(node, 'hidden', {
      get() { return this.hasAttribute('hidden') },
      set(v) { if (v) this.setAttribute('hidden', ''); else this.removeAttribute('hidden') },
    })
    Object.defineProperty(node, 'dataset', {
      get() {
        const out = {}
        for (const k of Object.keys(this.attrs)) {
          if (k.startsWith('data-')) out[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = this.attrs[k]
        }
        return out
      },
    })
    Object.defineProperty(node, 'classList', {
      get() {
        const self = this
        const classes = () => (self.attrs.class || '').split(/\s+/).filter(Boolean)
        return {
          add(c) { const cs = classes(); if (!cs.includes(c)) { cs.push(c); self.attrs.class = cs.join(' ') } },
          remove(c) { self.attrs.class = classes().filter((x) => x !== c).join(' ') },
          toggle(c, force) { const has = classes().includes(c); const want = force === undefined ? !has : force; if (want) this.add(c); else this.remove(c) },
          contains(c) { return classes().includes(c) },
        }
      },
    })
    return node
  }

  const root = makeNode('#root', {})
  const stack = [root]
  const tagRe = /<(\/)?([a-zA-Z][\w-]*)((?:[^<>])*?)(\/)?>/g
  let m
  while ((m = tagRe.exec(html))) {
    const closing = !!m[1]
    const tagName = m[2]
    const attrStr = m[3]
    const selfClose = !!m[4] || VOID.has(tagName.toLowerCase())
    if (closing) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName === tagName.toUpperCase()) { stack.length = i; break }
      }
      continue
    }
    const attrs = parseAttrs(attrStr)
    const node = makeNode(tagName, attrs)
    node.parentNode = stack[stack.length - 1]
    stack[stack.length - 1].children.push(node)
    allNodes.push(node)
    if (!selfClose) stack.push(node)
  }

  const document = {
    querySelector(sel) { return queryAll(null, sel)[0] || null },
    querySelectorAll(sel) { return queryAll(null, sel) },
    addEventListener(type, fn) { (root._handlers[type] = root._handlers[type] || []).push(fn) },
    _handlers: root._handlers,
  }
  return { document, allNodes }
}

// ---------------------------------------------------------------------------
// AC-20260906-04-6
// ---------------------------------------------------------------------------
test('AC-20260906-04-6: review.browser.js under vm over the builder\'s own markup moves the selection/data-focus to the next open item on "j", posts /__notes/answer verdict:"yes" and drops the row from Open on "y", reveals the correction textarea on "n" and posts verdict:"no" on Enter inside it, toggles the strip/pane on "\\", ignores "j" while a textarea has focus, and posts /__notes/add {scope:"project", screen:null, state:null, reason:"wrong-direction", text, by} from Send', async () => {
  const reviewPagePath = path.join(SPEC, 'scripts/lib/review-page.js')
  const reviewBrowserPath = path.join(SPEC, 'scripts/lib/review.browser.js')
  assert.ok(fs.existsSync(reviewPagePath), 'test setup requires lib/review-page.js to exist so this harness can scan its real markup: not found at ' + reviewPagePath)
  delete require.cache[reviewPagePath]
  const { buildReviewPage } = require(reviewPagePath)
  const src = fs.readFileSync(reviewBrowserPath, 'utf8')

  const NOW = '2026-09-06T12:00:00.000Z'
  const html = buildReviewPage({
    root: '/t', journey: 'onboarding', prefix: '',
    seed: { product: 'Hearwell', viewportWidth: 1280, journeys: [{ name: 'onboarding', title: 'Onboarding', screens: [{ label: 'signin', states: [] }, { label: 'home', states: [] }] }] },
    notes: [
      { id: 'N001', scope: 'mock', screen: 'signin', state: null, kind: 'question', ledgerId: 'W1', text: 'c', by: 'session', at: NOW, status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null, answer: null },
      { id: 'N002', scope: 'mock', screen: 'home', state: null, kind: 'question', ledgerId: 'W2', text: 'c', by: 'session', at: NOW, status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null, answer: null },
    ],
    ledger: [{ id: 'W1', step: 'WIREFRAMES', kind: 'product', claim: 'c1', tag: 'inferred', status: 'open', rejected: null, dependents: null, note: null },
      { id: 'W2', step: 'WIREFRAMES', kind: 'product', claim: 'c2', tag: 'inferred', status: 'open', rejected: null, dependents: null, note: null }],
    stops: [],
  })

  const { document } = parseFlatDom(html)
  const posts = []
  const sandbox = {
    location: { pathname: '/review/onboarding.html' },
    document,
    window: { prompt: () => { throw new Error('window.prompt must never be called at load — the reviewer name comes from localStorage') } },
    localStorage: { getItem: () => 'jj', setItem() {} },
    fetch(url, init) {
      if (init && init.method === 'POST') posts.push({ url, init })
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    },
    URLSearchParams,
    console,
  }
  vm.createContext(sandbox)
  vm.runInContext(src, sandbox)

  const keydownHandlers = document._handlers.keydown || []
  assert.ok(keydownHandlers.length > 0, 'test setup requires review.browser.js to register a document-level keydown handler')
  const fireKey = (key, target) => { for (const h of keydownHandlers) h({ key, target: target || { tagName: 'BODY' }, preventDefault() {} }) }

  const homeFrame = document.querySelector('[data-rv="board"][data-label="home"] [data-rv="frame"]')
  const signinFrame = document.querySelector('[data-rv="board"][data-label="signin"] [data-rv="frame"]')
  assert.ok(signinFrame && signinFrame.hasAttribute('data-focus'), 'test setup requires the first open item (N001 on signin) to start focused')
  assert.ok(homeFrame && !homeFrame.hasAttribute('data-focus'), 'test setup requires only one frame to carry data-focus initially')

  fireKey('j')
  assert.ok(homeFrame.hasAttribute('data-focus'), 'AC-6: "j" must move data-focus to the next open item\'s screen (home, holding N002): got no data-focus on home')
  assert.ok(!signinFrame.hasAttribute('data-focus'), 'AC-6: "j" must move the focus off the previously-focused screen (signin): still carries data-focus')

  fireKey('y')
  const answerPost = posts.find((p) => /\/__notes\/answer$/.test(p.url))
  assert.ok(answerPost, 'AC-6: "y" must POST /__notes/answer for the selected row: got ' + JSON.stringify(posts))
  const answerBody = JSON.parse(answerPost.init.body)
  assert.deepStrictEqual({ id: answerBody.id, verdict: answerBody.verdict }, { id: 'N002', verdict: 'yes' },
    'AC-6: the answer POST body must carry {id, verdict:"yes", by} for the selected row (N002): got ' + JSON.stringify(answerBody))
  assert.ok(typeof answerBody.by === 'string' && answerBody.by, 'AC-6: the answer POST body must carry a non-empty "by": got ' + JSON.stringify(answerBody))
  const n002Row = document.querySelector('[data-rv="row"][data-id="N002"]')
  assert.ok(n002Row.hidden, 'AC-6: "y" must remove the answered row from the Open filter (hidden): got hidden=' + n002Row.hidden)
  // review fix round (F2): the artboard badge is the screen's OPEN count and tracks the rail after an answer
  const homeBadge = document.querySelector('[data-rv="board"][data-label="home"] [data-rv="badge"]')
  const homeCount = document.querySelector('[data-rv="count"][data-screen="home"]')
  assert.ok(homeBadge && homeCount, 'test setup requires a badge on the home board and a rail count for home')
  assert.strictEqual(homeBadge.textContent, '0', 'AC-6 / D3: after "y" answers the only open item on home, its caption badge must read the open count 0 — a stale badge contradicts the rail: got ' + homeBadge.textContent)
  assert.ok(homeBadge.hasAttribute('data-zero'), 'AC-6 / D3: a badge at zero open items must carry data-zero so it stops rendering in the open-doubt style')
  assert.strictEqual(homeCount.textContent, '0', 'AC-6: the rail count for home must read 0 after its only open item is answered: got ' + homeCount.textContent)

  const n001Row = document.querySelector('[data-rv="row"][data-id="N001"]')
  fireKey('n')
  const textarea = n001Row.querySelector('textarea')
  assert.ok(textarea, 'AC-6: "n" must reveal the selected row\'s correction textarea: none found on N001\'s row')
  assert.strictEqual(textarea.hidden, false, 'AC-6: "n" must reveal (un-hide) the correction textarea: got hidden=' + textarea.hidden)
  textarea.value = 'owner sets modality'
  fireKey('Enter', textarea)
  const noPost = posts.find((p) => { try { const b = JSON.parse(p.init.body); return b.id === 'N001' && b.verdict === 'no' } catch { return false } })
  assert.ok(noPost, 'AC-6: pressing Enter inside the revealed textarea must POST /__notes/answer {id:"N001", verdict:"no", text}: got ' + JSON.stringify(posts))
  assert.strictEqual(JSON.parse(noPost.init.body).text, 'owner sets modality', 'AC-6: the "no" answer POST must carry the textarea\'s value verbatim as text: got ' + noPost.init.body)

  const strip = document.querySelector('[data-rv="strip"]')
  const stripHiddenBefore = strip.hidden
  fireKey('\\')
  assert.notStrictEqual(strip.hidden, stripHiddenBefore, 'AC-6: "\\" must toggle [data-rv="strip"] visibility: unchanged (' + strip.hidden + ')')

  const postsBeforeIgnoredJ = posts.length
  const homeFrameFocusedBefore = homeFrame.hasAttribute('data-focus')
  const signinFrameFocusedBefore = signinFrame.hasAttribute('data-focus')
  fireKey('j', { tagName: 'TEXTAREA' })
  assert.strictEqual(posts.length, postsBeforeIgnoredJ, 'AC-6: "j" while a textarea has focus must issue nothing — no fetch call: got ' + (posts.length - postsBeforeIgnoredJ) + ' new call(s)')
  assert.strictEqual(homeFrame.hasAttribute('data-focus'), homeFrameFocusedBefore, 'AC-6: "j" while a textarea has focus must not move data-focus (home unchanged)')
  assert.strictEqual(signinFrame.hasAttribute('data-focus'), signinFrameFocusedBefore, 'AC-6: "j" while a textarea has focus must not move data-focus (signin unchanged)')

  const scopeProject = document.querySelector('[data-rv="composer"] [data-rv="scope"][data-value="project"]')
  const chipWrongDirection = document.querySelector('[data-rv="composer"] [data-rv="chip"][data-value="wrong-direction"]')
  const composerTextarea = document.querySelector('[data-rv="composer"] textarea')
  const sendBtn = document.querySelector('[data-rv="composer"] [data-rv="send"]')
  assert.ok(scopeProject && chipWrongDirection && composerTextarea && sendBtn,
    'test setup requires the composer to expose a "Whole project" scope control, a "wrong-direction" reason chip, a textarea, and a Send control')
  const clickOf = (el) => { const hs = el._handlers.click || []; for (const h of hs) h({ preventDefault() {} }) }
  clickOf(scopeProject)
  clickOf(chipWrongDirection)
  composerTextarea.value = 'the flow contradicts the sketch'
  clickOf(sendBtn)
  const addPost = posts.find((p) => /\/__notes\/add$/.test(p.url))
  assert.ok(addPost, 'AC-6: Send must POST /__notes/add: got ' + JSON.stringify(posts.map((p) => p.url)))
  const addBody = JSON.parse(addPost.init.body)
  assert.deepStrictEqual(
    { scope: addBody.scope, screen: addBody.screen, state: addBody.state, reason: addBody.reason, text: addBody.text },
    { scope: 'project', screen: null, state: null, reason: 'wrong-direction', text: 'the flow contradicts the sketch' },
    'AC-6: Send with scope "Whole project" and chip "Wrong direction" must POST /__notes/add {scope:"project", screen:null, state:null, reason:"wrong-direction", text, by}: got ' + JSON.stringify(addBody))
  assert.ok(typeof addBody.by === 'string' && addBody.by, 'AC-6: the add POST body must carry a non-empty "by": got ' + JSON.stringify(addBody))

  // review fix round (F3): the look stop's URL ends in #stop-<id>, whose target lives inside the
  // sticky bar — the fragment jump would scroll the bar out of place, so the script pins the page
  // back to the top at load, and only when such a hash is present.
  function loadWithHash(hash) {
    const scrolls = []
    const { document: doc } = parseFlatDom(html)
    const sb = {
      location: { pathname: '/review/onboarding.html', hash },
      document: doc,
      window: { prompt: () => { throw new Error('no prompt at load') }, addEventListener() {} },
      localStorage: { getItem: () => 'jj', setItem() {} },
      fetch() { return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }) },
      scrollTo(x, y) { scrolls.push([x, y]) },
      URLSearchParams,
      console,
    }
    vm.createContext(sb)
    vm.runInContext(src, sb)
    return scrolls
  }
  assert.deepStrictEqual(loadWithHash('#stop-P001'), [[0, 0]], 'F3: opening the page at #stop-<id> must scroll back to (0,0) once at load — otherwise the sticky bar is pushed down and the first caption and key legend are clipped')
  assert.deepStrictEqual(loadWithHash(''), [], 'F3: with no #stop- hash the script must not scroll at all — an unconditional scrollTo would fight the user\'s own scroll position on a reload')
})

// =============================================================================================
// specs/20260907/04-kit-canon-family.md — the `design/kit/` canon family: D2's kit-canon file
// shape, D3's resolveCanonDir/isKitCanonFile/checkKitCanon/diagnoseKitRegions library additions,
// D5/D6's `check` binding (violation/warn split, informational counts), D13's family-wide
// primitive uniqueness, D14's atlas #kit section, D15's ⓘ-after-CHECK-block ordering.
// AC-20260907-04-2, -3, -4, -5, -6, -7, -8, -16, -17, -18.
// =============================================================================================

// require()s spec/scripts/lib/shell-region.js directly (a pure-function library, never a CLI) —
// the same cache-busting shape loadDesignAtlas() above uses for design-atlas.js itself.
function loadShellRegion() {
  const p = path.join(SPEC, 'scripts/lib/shell-region.js')
  delete require.cache[p]
  return require(p)
}

function kitCanonHtml(primitives) {
  const body = primitives.map((p) =>
    '<section data-kit-primitive="' + p.key + '" data-purpose="' + p.purpose + '">' +
    '<div data-contract="none"><button data-state-btn="empty">Empty</button></div>' +
    '<div data-slot="content"></div>' +
    '</section>').join('\n')
  return '<link rel="stylesheet" href="../wire/tokens.css">\n' +
    '<div data-kit-canon="kit">\n' + body + '\n</div>\n'
}

function writeKitFile(dir, name, primitives) {
  const p = path.join(dir, 'design/kit', name + '.html')
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, kitCanonHtml(primitives))
  return p
}

// A kit-aware page mock: `regions` are the top-level children of the labeled root's own content
// region (D4 — no shell family resolves anywhere in these fixtures, so the content region IS the
// labeled root's own top-level children). The state-button wrapper sits under
// data-contract="none" and so is never itself counted as a region (D4's own exemption).
function writeKitMock(dir, { label = 'screen', status = 'sketch', regions = [] } = {}) {
  const regionsHtml = regions.map((r) => {
    if (r.kit) return '<section data-kit="' + r.kit + '">' + label + '</section>'
    if (r.bespoke) return '<section data-bespoke="' + r.bespoke + '">' + label + '</section>'
    return '<section>' + label + '</section>'
  }).join('\n')
  const html = '<link rel="stylesheet" href="../tokens.css">\n' +
    '<style>\n* { box-sizing: border-box; }\n.screen { color: var(--text-body); }\n</style>\n' +
    '<main class="screen" data-screen-label="' + label + '" data-status="' + status + '">\n' +
    '<div data-contract="none"><button data-state-btn="empty">Empty</button></div>\n' +
    regionsHtml + '\n</main>\n'
  const p = path.join(dir, 'design/mocks', label + '.html')
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, html)
  return p
}

test('AC-20260907-04-3: resolveCanonDir resolves the kit family on a tree holding only design/kit/, and resolveShellDir on the same tree returns null', () => {
  const shellLib = loadShellRegion()
  const dir = tmpdir('atlas-resolve-canon-dir')
  const kitDir = path.join(dir, 'design/kit')
  fs.mkdirSync(kitDir, { recursive: true })
  fs.writeFileSync(path.join(kitDir, 'kit.html'), kitCanonHtml([{ key: 'sheet', purpose: 'a modal panel for one focused task' }]))
  const mockPath = path.join(dir, 'design/mocks/screen.html')
  fs.mkdirSync(path.dirname(mockPath), { recursive: true })
  fs.writeFileSync(mockPath, '<main data-screen-label="screen">screen</main>\n')

  assert.strictEqual(shellLib.resolveCanonDir(mockPath, 'kit'), kitDir,
    'D3: resolveCanonDir(fromPath, "kit") must resolve design/kit/ by the same walk-up resolveShellDir already uses for design/shell/: got ' + shellLib.resolveCanonDir(mockPath, 'kit'))
  assert.strictEqual(shellLib.resolveShellDir(mockPath), null,
    'A2: resolveShellDir must return null on a tree holding only design/kit/ — the kit family genuinely cannot reuse it as-is: got ' + shellLib.resolveShellDir(mockPath))
})

test('AC-20260907-04-8: isKitCanonFile returns true when data-kit-canon precedes any data-screen-label, and false for markup carrying only data-shell-canon', () => {
  const shellLib = loadShellRegion()
  assert.strictEqual(
    shellLib.isKitCanonFile('<div data-kit-canon="kit"><section data-screen-label="x"></section></div>'),
    true, 'D3: a data-kit-canon root preceding any data-screen-label must be recognized as a kit canon file')
  assert.strictEqual(
    shellLib.isKitCanonFile('<div data-shell-canon="app"></div>'),
    false, 'D3: markup carrying only data-shell-canon must not be misclassified as a kit canon file')
})

test('AC-20260907-04-2: check exits 1 naming a duplicate data-kit-primitive key within one kit canon file, and exits 0 once every key in the file is unique', () => {
  const dir = tmpdir('atlas-kit-dup')
  const kitPath = writeKitFile(dir, 'kit',
    [{ key: 'sheet', purpose: 'a modal panel for one focused task' }, { key: 'sheet', purpose: 'another modal panel' }])

  const dup = atlas(['check', kitPath])
  assert.strictEqual(dup.status, 1,
    'D2: a kit canon file declaring the same data-kit-primitive key twice must fail check: ' + dup.stdout + dup.stderr)
  assert.match(dup.stdout, /duplicate data-kit-primitive="sheet"/,
    'the violation must name the exact duplicated key: ' + dup.stdout)

  writeKitFile(dir, 'kit',
    [{ key: 'sheet', purpose: 'a modal panel for one focused task' }, { key: 'card', purpose: 'a bordered content block' }])
  const unique = atlas(['check', kitPath])
  assert.strictEqual(unique.status, 0,
    'once every data-kit-primitive key in the file is unique, check must pass: ' + unique.stdout + unique.stderr)
})

test('AC-20260907-04-16: check exits 1 naming a data-kit-primitive key duplicated across two files of one kit family, naming both files, and exits 0 once the two files declare disjoint keys', () => {
  const dir = tmpdir('atlas-kit-dup-family')
  const aPath = writeKitFile(dir, 'a', [{ key: 'sheet', purpose: 'a modal panel for one focused task' }])
  const bPath = writeKitFile(dir, 'b', [{ key: 'sheet', purpose: 'a different modal panel' }])

  const dup = atlas(['check', path.dirname(aPath)])
  assert.strictEqual(dup.status, 1,
    'D13: a primitive key declared in two different files of one design/kit/ family must fail check — a key is named once per FAMILY, never per file: ' + dup.stdout + dup.stderr)
  assert.match(dup.stdout, /duplicate data-kit-primitive="sheet"/,
    'the violation must name the exact duplicated key: ' + dup.stdout)
  assert.ok(dup.stdout.includes(path.basename(aPath)) && dup.stdout.includes(path.basename(bPath)),
    'D13: the violation must name BOTH files carrying the duplicated key, not just one: ' + dup.stdout)

  const mockPath = writeKitMock(dir, { label: 'screen', status: 'sketch', regions: [{ kit: 'sheet' }] })
  const dupViaMocks = atlas(['check', '--matrix', path.dirname(mockPath)])
  assert.strictEqual(dupViaMocks.status, 1,
    'D13: the family-wide duplicate must fire even when check walks only design/mocks/ — the kit files themselves are never in the walk: ' + dupViaMocks.stdout + dupViaMocks.stderr)
  assert.match(dupViaMocks.stdout, /duplicate data-kit-primitive="sheet"/,
    'checking design/mocks/ must still name the exact duplicated key resolved from the family: ' + dupViaMocks.stdout)
  assert.ok(dupViaMocks.stdout.includes(path.basename(aPath)) && dupViaMocks.stdout.includes(path.basename(bPath)),
    'D13: the violation surfaced from a design/mocks/ walk must still name BOTH kit files carrying the duplicated key: ' + dupViaMocks.stdout)

  writeKitFile(dir, 'b', [{ key: 'card', purpose: 'a bordered content block' }])
  const disjoint = atlas(['check', path.dirname(aPath)])
  assert.strictEqual(disjoint.status, 0,
    'once the two files declare disjoint keys, check must pass: ' + disjoint.stdout + disjoint.stderr)
})

test('AC-20260907-04-4: check --matrix exits 1 naming a content region carrying neither data-kit nor data-bespoke, once a kit family resolves, and exits 0 once the region carries a valid data-bespoke mark', () => {
  const dir = tmpdir('atlas-kit-unabsorbed')
  writeKitFile(dir, 'kit', [{ key: 'sheet', purpose: 'a modal panel for one focused task' }])
  const mockPath = writeKitMock(dir, { label: 'screen', status: 'sketch', regions: [{ plain: true }] })
  const violationMsg = 'region 1 carries neither data-kit nor data-bespoke — instantiate a kit primitive or mark it data-bespoke="<key>: <what differs>"'

  const bad = atlas(['check', '--matrix', mockPath])
  assert.strictEqual(bad.status, 1,
    'D4: check --matrix must fail once a kit family resolves and a content region carries neither data-kit nor data-bespoke: ' + bad.stdout + bad.stderr)
  assert.ok(bad.stdout.includes('  - ' + mockPath + ': ' + violationMsg),
    'the D4 violation line must be printed verbatim, naming the file and the exact remedy: ' + bad.stdout)

  writeKitMock(dir, { label: 'screen', status: 'sketch', regions: [{ bespoke: 'sheet: two-column body the sheet primitive cannot express' }] })
  const good = atlas(['check', '--matrix', mockPath])
  assert.strictEqual(good.status, 0,
    'once the region carries a valid data-bespoke mark naming an existing primitive and a difference, check --matrix must pass: ' + good.stdout + good.stderr)

  const widgetPath = writeKitMock(dir, { label: 'widget-screen', status: 'sketch', regions: [{ bespoke: 'widget: three columns' }] })
  const unknownBespoke = atlas(['check', '--matrix', widgetPath])
  assert.strictEqual(unknownBespoke.status, 1,
    'D4: a data-bespoke key that names no primitive in the family (only "sheet" is declared) must fail check --matrix: ' + unknownBespoke.stdout + unknownBespoke.stderr)
  assert.match(unknownBespoke.stdout, /declares no primitive "widget"/,
    'the violation must name the unknown bespoke key exactly as it names an unknown data-kit key: ' + unknownBespoke.stdout)

  const emptyKeyPath = writeKitMock(dir, { label: 'emptykey-screen', status: 'sketch', regions: [{ bespoke: ': three columns' }] })
  const emptyKey = atlas(['check', '--matrix', emptyKeyPath])
  assert.strictEqual(emptyKey.status, 1,
    'D4: data-bespoke="' + ': three columns' + '" (empty key) must fail check --matrix: ' + emptyKey.stdout + emptyKey.stderr)
  assert.doesNotMatch(emptyKey.stdout, /names no difference/,
    'an empty bespoke key is a missing/unknown key, not a missing difference — the "names no difference" wording must not fire here: ' + emptyKey.stdout)

  const emptyDiffPath = writeKitMock(dir, { label: 'emptydiff-screen', status: 'sketch', regions: [{ bespoke: 'sheet: ' }] })
  const emptyDiff = atlas(['check', '--matrix', emptyDiffPath])
  assert.strictEqual(emptyDiff.status, 1,
    'D4: data-bespoke="sheet: " (existing key, empty difference) must fail check --matrix: ' + emptyDiff.stdout + emptyDiff.stderr)
  assert.match(emptyDiff.stdout, /data-bespoke="sheet: " names no difference — say what prevents reuse/,
    'an existing key with an empty difference must print the bespoke-unnamed finding verbatim: ' + emptyDiff.stdout)
})

test('AC-20260907-04-5: an unabsorbed content region on a sketch mock warns and passes, and the identical region on an approved mock is a violation, once a kit family resolves', () => {
  const dir = tmpdir('atlas-kit-stamp')
  writeKitFile(dir, 'kit', [{ key: 'sheet', purpose: 'a modal panel for one focused task' }])
  const mockPath = writeKitMock(dir, { label: 'screen', status: 'sketch', regions: [{ plain: true }] })
  const violationMsg = 'region 1 carries neither data-kit nor data-bespoke — instantiate a kit primitive or mark it data-bespoke="<key>: <what differs>"'

  const sketch = atlas(['check', mockPath])
  assert.strictEqual(sketch.status, 0,
    'D5: an unabsorbed content region on a sketch mock must warn, never fail check: ' + sketch.stdout + sketch.stderr)
  assert.ok(sketch.stdout.includes('  ⚠️ ' + mockPath + ': ' + violationMsg),
    'the sketch-stage run must print the same D4 line prefixed "  ⚠️ " as a warning: ' + sketch.stdout)

  writeKitMock(dir, { label: 'screen', status: 'approved', regions: [{ plain: true }] })
  const approved = atlas(['check', mockPath])
  assert.strictEqual(approved.status, 1,
    'D5: the identical unabsorbed region on an approved mock must be a violation, once a kit family resolves: ' + approved.stdout + approved.stderr)
  assert.ok(approved.stdout.includes('  - ' + mockPath + ': ' + violationMsg),
    'the approved-stage run must print the violation, not a warning: ' + approved.stdout)
  assert.doesNotMatch(approved.stdout, /⚠️.*carries neither/,
    'the approved-stage run must print no ⚠️ warn line for this finding: ' + approved.stdout)
})

test('AC-20260907-04-6: check over a mock tree with no design/kit/ anywhere above it prints no ⓘ line and no kit finding, output byte-identical to a plain CHECK PASS', () => {
  const dir = tmpdir('atlas-kit-absent')
  const mockPath = writeKitMock(dir, { label: 'screen', status: 'ratified', regions: [{ plain: true }] })
  const res = atlas(['check', mockPath])
  assert.strictEqual(res.status, 0,
    'D5: with no design/kit/ resolving anywhere above the mock, the kit family rule must never bind, so check must pass: ' + res.stdout + res.stderr)
  assert.strictEqual(res.stdout, 'CHECK PASS (1 file(s))\n',
    'the output must be byte-identical to a plain CHECK PASS line — any ⓘ line or kit finding here means D5 leaked onto a root with no kit family: ' + JSON.stringify(res.stdout))
})

test('AC-20260907-04-7: check prints one ⓘ <label>: <n> kit, <m> bespoke line per labeled mock plus a final ⓘ unabsorbed total, and exits 0', () => {
  const dir = tmpdir('atlas-kit-counts')
  writeKitFile(dir, 'kit', [
    { key: 'sheet', purpose: 'a modal panel for one focused task' },
    { key: 'card', purpose: 'a bordered content block' },
  ])
  writeKitMock(dir, {
    label: 'alpha', status: 'sketch',
    regions: [{ kit: 'sheet' }, { kit: 'card' }, { bespoke: 'sheet: two-column body the sheet primitive cannot express' }],
  })
  writeKitMock(dir, {
    label: 'beta', status: 'sketch',
    regions: [{ kit: 'sheet' }, { kit: 'card' }, { kit: 'sheet' }],
  })

  const res = atlas(['check', path.join(dir, 'design/mocks')])
  assert.strictEqual(res.status, 0,
    'D6: the informational kit/bespoke counts must never change the exit code: ' + res.stdout + res.stderr)
  assert.match(res.stdout, /ⓘ alpha: 2 kit, 1 bespoke/,
    'D6: alpha (2 data-kit regions, 1 data-bespoke region) must print the exact count line: ' + res.stdout)
  assert.match(res.stdout, /ⓘ beta: 3 kit, 0 bespoke/,
    'D6: beta (3 data-kit regions, 0 data-bespoke regions) must print the exact count line: ' + res.stdout)
  assert.match(res.stdout, /ⓘ unabsorbed total: 1 across 1 screen\(s\)/,
    'D6: the final unabsorbed total must sum the bespoke count across every screen and name how many screens carry one: ' + res.stdout)
})

test('AC-20260907-04-18: check --matrix prints the CHECK FAIL block (or the CHECK PASS line) before the first ⓘ line, with a kit family present', () => {
  const dir = tmpdir('atlas-kit-order')
  writeKitFile(dir, 'kit', [{ key: 'sheet', purpose: 'a modal panel for one focused task' }])
  const mockPath = writeKitMock(dir, { label: 'screen', status: 'sketch', regions: [{ plain: true }] })

  const fail = atlas(['check', '--matrix', mockPath])
  assert.strictEqual(fail.status, 1, 'test setup requires the unabsorbed region to fail check --matrix: ' + fail.stdout + fail.stderr)
  const failIdx = fail.stdout.indexOf('CHECK FAIL (')
  const failInfoIdx = fail.stdout.indexOf('ⓘ')
  assert.ok(failIdx !== -1 && failInfoIdx !== -1 && failIdx < failInfoIdx,
    'D15: the CHECK FAIL block and its bullets must print before the first ⓘ line, never after: ' + JSON.stringify(fail.stdout))

  writeKitMock(dir, { label: 'screen', status: 'sketch', regions: [{ kit: 'sheet' }] })
  const pass = atlas(['check', '--matrix', mockPath])
  assert.strictEqual(pass.status, 0, 'test setup requires the fully kit-tagged mock to pass check --matrix: ' + pass.stdout + pass.stderr)
  const passIdx = pass.stdout.indexOf('CHECK PASS (')
  const passInfoIdx = pass.stdout.indexOf('ⓘ')
  assert.ok(passIdx !== -1 && passInfoIdx !== -1 && passIdx < passInfoIdx,
    'D15: the CHECK PASS line must print before the first ⓘ line, never after: ' + JSON.stringify(pass.stdout))
})

test('AC-20260907-04-17: the atlas emits a #kit section framing every candidate of an open kit-signed stop before its approve button, and no such section when no kit-signed stop is live', () => {
  const dir = tmpdir('atlas-kit-section')
  fs.mkdirSync(path.join(dir, 'design/kit'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/kit/kit.html'), kitCanonHtml([{ key: 'sheet', purpose: 'a modal panel for one focused task' }]))
  fs.writeFileSync(path.join(dir, 'design/kit/forms.html'), kitCanonHtml([{ key: 'field', purpose: 'a labeled input row' }]))
  const openedAt = '2026-01-01T00:00:00.000Z'
  writePicksJson(dir, [{
    id: 'P001', kind: 'approve', key: 'kit-signed', title: 'sign off the kit', question: null,
    candidates: [
      { group: null, label: 'kit', path: 'kit/kit.html' },
      { group: null, label: 'forms', path: 'kit/forms.html' },
    ],
    url: null, openedAt, status: 'open', decision: null, previous: [],
  }])

  const res = atlas(['build'], { cwd: dir })
  assert.strictEqual(res.status, 0, res.stdout + res.stderr)
  const out = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')

  const kitIdx = out.indexOf('id="kit"')
  assert.ok(kitIdx !== -1,
    'D14: a #kit section must render for an open kit-signed stop — stopHome("kit-signed") -> {type:"kit"} is missing: ' + out.slice(0, 300))
  const sectionOpen = out.lastIndexOf('<section', kitIdx)
  const sectionClose = out.indexOf('</section>', kitIdx)
  const kitSection = out.slice(sectionOpen, sectionClose)

  const iframes = kitSection.match(/<iframe[^>]*>/g) || []
  assert.ok(iframes.some((f) => /src="[^"]*kit\/kit\.html/.test(f)),
    'one frame in #kit must have a src ending kit/kit.html: ' + JSON.stringify(iframes))
  assert.ok(iframes.some((f) => /src="[^"]*kit\/forms\.html/.test(f)),
    'one frame in #kit must have a src ending kit/forms.html: ' + JSON.stringify(iframes))
  assert.match(kitSection, /class="card"[\s\S]*?open ↗/,
    'D14: each candidate must render inside a .card element carrying an open ↗ link, exactly as renderCompareTable frames a pick candidate: ' + kitSection)

  const approveIdx = kitSection.indexOf('data-decide="approve"')
  assert.ok(approveIdx !== -1, 'the #kit section must include the stop\'s own approve control')
  const firstIframeIdx = kitSection.indexOf('<iframe')
  assert.ok(firstIframeIdx !== -1 && firstIframeIdx < approveIdx,
    'D14: every candidate must frame BEFORE the approve/change block — never the buttons alone: ' + kitSection)

  const dir2 = tmpdir('atlas-kit-section-none')
  const res2 = atlas(['build'], { cwd: dir2 })
  assert.strictEqual(res2.status, 0, res2.stdout + res2.stderr)
  const out2 = fs.readFileSync(path.join(dir2, 'design/atlas/index.html'), 'utf8')
  assert.ok(!out2.includes('id="kit"'),
    'with no kit-signed stop live, the atlas must emit no id="kit" section')
})

// ---------------------------------------------------------------------------
// specs/20260907/09-atlas-index-and-note-navigation.md — TDD red: buildAtlas emits no
// #shell/#toc/#main/#nl-notes wrapper at all today, GET /__notes/list has no screen=** branch,
// and page()'s/viewer.css's stylesheets carry none of the toc/nl-anchor chrome selectors yet.
// ---------------------------------------------------------------------------

test('AC-20260907-09-1: buildAtlas wraps its composed body in #shell/#toc/#main, emits one .tocgroup[data-group] per rendered section holding one .tocrow[data-label][data-st] per surface (mocked and gap alike), and stamps id="j-<section title>" on each section heading', () => {
  const dir = fixture()
  const res = atlas(['build'], { cwd: dir })
  assert.strictEqual(res.status, 0, res.stdout + res.stderr)
  const out = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')

  const shellIdx = out.indexOf('<div id="shell">')
  assert.ok(shellIdx !== -1, 'D1: buildAtlas must wrap the composed body in <div id="shell">: got none in ' + out.slice(0, 200))
  const tocIdx = out.indexOf('<aside id="toc">', shellIdx)
  assert.ok(tocIdx !== -1 && tocIdx > shellIdx, 'D1: #shell must contain an <aside id="toc"> — the persistent screen index')
  const mainIdx = out.indexOf('<div id="main">', shellIdx)
  assert.ok(mainIdx !== -1 && mainIdx > tocIdx, 'D1: #shell must contain a <div id="main"> after #toc, wrapping the page body buildAtlas already composes')

  // The section heading now carries its own id="j-<title>" (D2, pinned separately below) —
  // tolerate whatever attributes ride along on <h2> rather than requiring the bare pre-image tag.
  const titleMatch = out.match(/<section class="sect"><h2[^>]*>([^<]*)<span class="count">/)
  assert.ok(titleMatch, 'test setup: the fixture must render at least one plain journey section to key the toc/heading-id checks against')
  const sectionTitle = titleMatch[1]
  assert.ok(out.includes('<div class="tocgroup" data-group="' + sectionTitle + '">'),
    'D2: one .tocgroup[data-group] must render per rendered section, in the page\'s own render order, matching that section\'s title: got no matching .tocgroup in ' + out.slice(tocIdx, tocIdx + 600))
  assert.ok(out.includes('<h2 id="j-' + sectionTitle + '">') || new RegExp('<h2 id="j-' + sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"').test(out),
    'D2: the section\'s own <h2> must carry id="j-<section title>" so a .tochead can jump to it: got no matching id in ' + out)

  const rowLabels = [...out.matchAll(/<button class="tocrow" data-label="([^"]*)" data-st="([^"]*)">/g)].map((m) => m[1])
  for (const label of ['account', 'lobby', 'signin', 'thread']) {
    assert.ok(rowLabels.includes(label),
      'D2: a .tocrow must render for surface "' + label + '" — mocked and gap surfaces alike: got ' + JSON.stringify(rowLabels))
  }

  // AC-20260907-09-1's own wording ("in the same order the sections are emitted") and D2
  // ("in the page's own render order") are both ordering claims — nothing above compares a
  // SEQUENCE of anything, only presence of one group. The shared fixture() above has exactly one
  // plain journey section, over which order is never meaningful — the exact failure mode this
  // spec has already hit twice (AC-20260907-09-6's first hidden-section pin, and the row-less
  // shapes/theme pin, both needed a second real fixture to become non-vacuous). A dedicated tree
  // with shapes plus two alphabetically-distinct journeys gives order something real to prove:
  // the same shape the reviewer executed against the real served atlas (shapes, then the sorted
  // journey sections).
  const orderDir = tmpdir('atlas-toc-order')
  const mkOrder = (rel, c) => { const p = path.join(orderDir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c) }
  mkOrder('design/shapes/one.html', '<main data-screen-label="one">one</main>\n')
  mkOrder('docs/roadmap/alpha-area.md', '# alpha\n```surfaces\nscreen-a\n```\n')
  mkOrder('docs/roadmap/zeta-area.md', '# zeta\n```surfaces\nscreen-z\n```\n')
  mkOrder('design/mocks/screen-a.html', '<main data-screen-label="screen-a">a</main>\n')
  const orderRes = atlas(['build'], { cwd: orderDir })
  assert.strictEqual(orderRes.status, 0, orderRes.stdout + orderRes.stderr)
  const orderOut = fs.readFileSync(path.join(orderDir, 'design/atlas/index.html'), 'utf8')

  // Every rendered section's own <h2> carries id="j-<title>" (D2) — reading those ids in
  // document order gives the exact sequence buildAtlas emitted the sections in.
  const sectionIds = [...orderOut.matchAll(/<h2[^>]*\sid="j-([^"]+)"/g)].map((m) => m[1])
  const tocGroupIds = [...orderOut.matchAll(/<div class="tocgroup" data-group="([^"]+)">/g)].map((m) => m[1])
  assert.ok(sectionIds.length >= 3,
    'test setup: the order-check fixture must render at least three sections (shapes plus two journeys) — with fewer than two, a sequence comparison proves nothing about order: got ' + JSON.stringify(sectionIds))
  assert.strictEqual(tocGroupIds.length, sectionIds.length,
    'AC-1/D2: exactly one .tocgroup must render per rendered section — a missing or extra .tocgroup means the index lists a different set of sections than the page actually renders: got sections ' +
    JSON.stringify(sectionIds) + ' vs .tocgroup ' + JSON.stringify(tocGroupIds))
  assert.deepStrictEqual(tocGroupIds, sectionIds,
    'AC-1/D2: .tocgroup[data-group] values must appear in the SAME ORDER the page\'s own .sect>h2 headings are emitted — an order drift here means the index no longer matches the page it indexes, even though every section is individually still present: got sections ' +
    JSON.stringify(sectionIds) + ' vs .tocgroup ' + JSON.stringify(tocGroupIds))
})

// AC-5 is a "SHALL CONTINUE TO" continuity pin (core § Incident Policy's "absence of a
// not-yet-built mechanism" — matching the AC-20260906-05-2/AC-20260906-06-2 pattern already used
// in this file): page()'s shared stylesheet gains the toc CSS register everywhere (AC-14), but
// only buildAtlas ever composes the #shell/#toc/.tocrow markup — cmdGallery must keep emitting
// none of it, before and after this spec lands.
test('AC-20260907-09-5: cmdGallery SHALL CONTINUE TO emit no #shell, no #toc, and no .tocrow — the index markup is buildAtlas-only', () => {
  const dir = fixture()
  fs.mkdirSync(path.join(dir, 'design/explore/r0-instrument'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/explore/r0-instrument/tile.html'),
    '<link rel="stylesheet" href="./tokens.css">\n<main data-screen-label="signin">t</main>\n')
  const res = atlas(['gallery', path.join(dir, 'design/explore')])
  assert.strictEqual(res.status, 0, res.stdout + res.stderr)
  const out = fs.readFileSync(path.join(dir, 'design/explore/gallery.html'), 'utf8')
  assert.doesNotMatch(out, /id="shell"/, 'AC-5: cmdGallery must never emit #shell — only buildAtlas composes the index chrome')
  assert.doesNotMatch(out, /id="toc"/, 'AC-5: cmdGallery must never emit #toc')
  assert.doesNotMatch(out, /class="tocrow"/, 'AC-5: cmdGallery must never emit a .tocrow')
})

test('AC-20260907-09-11: buildAtlas emits <div id="nl-notes"></div> as the last element inside #main', () => {
  const dir = fixture()
  const res = atlas(['build'], { cwd: dir })
  assert.strictEqual(res.status, 0, res.stdout + res.stderr)
  const out = fs.readFileSync(path.join(dir, 'design/atlas/index.html'), 'utf8')
  const mainStart = out.indexOf('<div id="main">')
  assert.ok(mainStart !== -1, 'D1: buildAtlas must emit <div id="main"> to anchor this check: got none in ' + out.slice(0, 200))
  const mainHtml = sliceElement(out, '<div id="main">')
  assert.ok(mainHtml, 'D1: the #main div must close with a balanced </div>')
  const withoutOwnClose = mainHtml.slice(0, mainHtml.lastIndexOf('</div>'))
  assert.match(withoutOwnClose.replace(/\s+$/, ''), /<div id="nl-notes"><\/div>$/,
    'D8: <div id="nl-notes"></div> must be the LAST element inside #main, giving the notes layer\'s project panel and a served mock\'s strip link a stable mount/target anchor: got tail ' +
    JSON.stringify(withoutOwnClose.slice(-200)))
})

test('AC-20260907-09-7: GET /__notes/list?screen=** returns every note regardless of scope, ledger-joining a question row exactly as the other branches do', async () => {
  const dir = tmpdir('atlas-notes-screen-all')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/session-live.html'), '<main data-screen-label="session-live">s</main>\n')
  writeQuestionLedger(dir, [{ id: 'W7', step: 'WIREFRAMES', kind: 'product', claim: 'single-use link', tag: 'inferred', status: 'open', rejected: 'durable link' }])
  const n1 = {
    id: 'N1', scope: 'project', screen: null, state: null, kind: 'note', text: 'project-wide', by: 'jj',
    at: new Date().toISOString(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
  }
  const n2 = baseQuestion('N2', 'session-live', 'W7')
  fs.writeFileSync(path.join(dir, 'design/mocks/notes.json'), JSON.stringify([n1, n2], null, 2) + '\n')

  await withHandler(dir, '', async ({ get }) => {
    const all = await get('/__notes/list?screen=**')
    assert.strictEqual(all.status, 200, 'GET /__notes/list?screen=** must respond 200: ' + all.body)
    const allNotes = JSON.parse(all.body)
    assert.deepStrictEqual(allNotes.map((n) => n.id).sort(), ['N1', 'N2'],
      'D6: screen=** must return every note regardless of scope: got ' + JSON.stringify(allNotes.map((n) => n.id)))
    const joined = allNotes.find((n) => n.id === 'N2')
    assert.strictEqual(joined.claim, 'single-use link',
      'D6: a question row returned under screen=** must still be ledger-joined exactly as the * and <label> branches already are: got ' + JSON.stringify(joined))
  })
})

// AC-8 is a "SHALL CONTINUE TO" continuity pin: D6 adds screen=** as a NEW value without
// redefining screen=* or screen=<label> byte-for-byte (specs/20260906/03 D3's scope contract).
test('AC-20260907-09-8: GET /__notes/list?screen=* and ?screen=session-live SHALL CONTINUE TO return exactly [N1] and [N2] respectively once screen=** exists', async () => {
  const dir = tmpdir('atlas-notes-screen-continuity')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/session-live.html'), '<main data-screen-label="session-live">s</main>\n')
  const n1 = {
    id: 'N1', scope: 'project', screen: null, state: null, kind: 'note', text: 'project-wide', by: 'jj',
    at: new Date().toISOString(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
  }
  const n2 = {
    id: 'N2', scope: 'mock', screen: 'session-live', state: 'listening', kind: 'note', text: 'screen note', by: 'jj',
    at: new Date().toISOString(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
  }
  fs.writeFileSync(path.join(dir, 'design/mocks/notes.json'), JSON.stringify([n1, n2], null, 2) + '\n')

  await withHandler(dir, '', async ({ get }) => {
    const proj = await get('/__notes/list?screen=*')
    assert.deepStrictEqual(JSON.parse(proj.body).map((n) => n.id), ['N1'], 'screen=* must keep returning only the project note: got ' + proj.body)
    const mock = await get('/__notes/list?screen=session-live')
    assert.deepStrictEqual(JSON.parse(mock.body).map((n) => n.id), ['N2'], 'screen=<label> must keep returning only that screen\'s note: got ' + mock.body)
  })
})

// A brace-depth CSS-rule extractor mirroring sliceElement's balanced-<div> approach above — finds
// `selector` followed (possibly with whitespace, either chrome convention: page()'s no-space
// `.sel{` or viewer.css's spaced `.sel {`) by its `{…}` body, brace-depth matched so a rule
// containing its own nested braces (none of these do, but @media wrapping might) still resolves.
function cssRuleBody(css, selector) {
  const re = new RegExp(selector.replace(/[.#[\]]/g, '\\$&') + '\\s*\\{')
  const m = re.exec(css)
  if (!m) return null
  let depth = 0
  let i = m.index + m[0].length - 1
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') { depth--; if (depth === 0) break }
  }
  return css.slice(m.index + m[0].length, i)
}

test("AC-20260907-09-14: page()'s emitted stylesheet declares the #shell/#toc/.tocgroup/.tochead/.tocrow/.tocempty/#tocbtn/#tocscrim register and viewer.css declares .nl-anchor/.nl-anchor.plain/.nl-up, with no color literal in any rule this spec adds", () => {
  const mod = loadDesignAtlas()
  const pageHtml = mod.page('t', '')
  const styleMatch = pageHtml.match(/<style>([\s\S]*?)<\/style>/)
  assert.ok(styleMatch, 'page() must still emit a <style> block')
  const style = styleMatch[1]
  const viewer = fs.readFileSync(path.join(SPEC, 'templates/mocks/viewer.css'), 'utf8')
  const colorLiteral = /#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i

  for (const sel of ['#shell', '#toc', '.tocgroup', '.tochead', '.tocrow', '.tocempty', '#tocbtn', '#tocscrim']) {
    const body = cssRuleBody(style, sel)
    assert.ok(body !== null, 'D1/D2/D10: page()\'s stylesheet must declare a "' + sel + '" rule for the persistent index chrome: none found')
    assert.doesNotMatch(body, colorLiteral, 'D10: the "' + sel + '" rule must resolve every color through a var(--v-*) role, never a literal: got ' + JSON.stringify(body))
  }
  for (const sel of ['.nl-anchor', '.nl-anchor.plain', '.nl-up']) {
    const body = cssRuleBody(viewer, sel)
    assert.ok(body !== null, 'D7/D9/D10: viewer.css must declare a "' + sel + '" rule for the note-anchor chrome: none found')
    assert.doesNotMatch(body, colorLiteral, 'D10: the "' + sel + '" rule must resolve every color through a var(--v-*) role, never a literal: got ' + JSON.stringify(body))
  }
})
