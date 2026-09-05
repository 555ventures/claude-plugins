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

  // D4: the lightbox override resolves "which group is this card" and "same step, other
  // candidate" purely from data-group/data-step on the card — a reviewer caught this reverting
  // to a page-wide chead-position guess, so pin both the markup and the script's own selectors.
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

  const j1Idx = out.indexOf('<h2>j1')
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
  assert.ok(fetchCalls.includes('/__notes/list?screen=*'),
    'a project-scope page must fetch the project-wide notes list under the empty base: got ' + JSON.stringify(fetchCalls))
  assert.ok(!fetchCalls.some((u) => u.includes('screen=') && !u.includes('screen=*')),
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

  assert.match(out, /<h2>j1/, 'a section headed by the journey key "j1" must be emitted for the seed journey')
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
