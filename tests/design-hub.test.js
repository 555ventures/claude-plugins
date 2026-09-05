'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const http = require('node:http')
const { execFileSync, spawn } = require('node:child_process')
const { tmpdir, runNode, read } = require('./helpers')

// specs/20260905/02-design-review-hub-and-look-stops.md D1-D5: spec/scripts/design-hub.js does
// not exist yet — every test below is red until the hub CLI + server land.
// AC-20260905-02-1, -2, -3, -4, -5, -6, -7, -8, -19.

const SCRIPT = 'scripts/design-hub.js'

function hub(argv, opts = {}) { return runNode(SCRIPT, argv, opts) }

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close((err) => (err ? reject(err) : resolve(port)))
    })
    srv.on('error', reject)
  })
}

function killHub(home) {
  try {
    const pid = parseInt(fs.readFileSync(path.join(home, 'hub.pid'), 'utf8').trim(), 10)
    if (pid) process.kill(pid)
  } catch (e) { if (e.code !== 'ENOENT' && e.code !== 'ESRCH') throw e }
}

function getRes(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        let json = null
        try { json = JSON.parse(body) } catch { /* not json */ }
        resolve({ status: res.statusCode, headers: res.headers, body, json })
      })
    }).on('error', reject)
  })
}

function postJson(url, obj) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(obj)
    const u = new URL(url)
    const req = http.request(u, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function waitFor(fn, timeoutMs) {
  const start = Date.now()
  let lastErr
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fn()
      if (r) return r
    } catch (e) { lastErr = e }
    await new Promise((r) => setTimeout(r, 50))
  }
  throw lastErr || new Error('timed out waiting')
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

function stopFixture({ id, key, title, openedAt, status = 'open', decision = null, kind = 'approve', candidates }) {
  return {
    id, kind, key, title, question: null,
    candidates: candidates || [{ group: null, label: 'a', path: 'mocks/a.html' }],
    url: null, openedAt, status, decision, previous: [],
  }
}
function writeStops(root, stops) {
  fs.mkdirSync(path.join(root, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(root, 'design/mocks/picks.json'), JSON.stringify(stops, null, 2) + '\n')
}

// ---------------------------------------------------------------------------
// AC-20260905-02-1
// ---------------------------------------------------------------------------
test('AC-20260905-02-1: register writes registry.json with schemaVersion/port/base/projects, is idempotent for the same realpath, and refuses a basename collision unless --name disambiguates', () => {
  const home = tmpdir('design-hub-home')
  const projRoot = tmpdir('design-hub-project')
  const env = { ...process.env, SPEC_DESIGN_HUB_HOME: home }

  const r1 = hub(['register', '--root', projRoot], { env })
  assert.strictEqual(r1.status, 0, 'register on a fresh, empty state dir must exit 0: ' + r1.stdout + r1.stderr)
  const realRoot = fs.realpathSync(projRoot)
  const name = path.basename(realRoot)
  assert.strictEqual(r1.stdout.trim(), 'registered ' + name + ' → ' + realRoot,
    'register must print "registered <basename(R)> → <realpath(R)>" verbatim, the line a caller splices into further tooling: ' + JSON.stringify(r1.stdout))

  const registry = JSON.parse(fs.readFileSync(path.join(home, 'registry.json'), 'utf8'))
  assert.strictEqual(registry.schemaVersion, 1, 'registry.json must be created with schemaVersion 1: ' + JSON.stringify(registry))
  assert.strictEqual(registry.port, 4600, 'registry.json must default port to 4600 when no override is given: ' + JSON.stringify(registry))
  assert.strictEqual(registry.base, 'http://localhost:4600', 'registry.json must default base to http://localhost:4600: ' + JSON.stringify(registry))
  assert.strictEqual(registry.projects.length, 1, 'a fresh registry must hold exactly one project after one register call: ' + JSON.stringify(registry))
  assert.strictEqual(registry.projects[0].name, name, 'the registered project\'s name must be basename(R) when --name is omitted: ' + JSON.stringify(registry.projects[0]))
  assert.strictEqual(registry.projects[0].root, realRoot, 'the registered project\'s root must be fs.realpathSync(R), never the raw (possibly symlinked) path given: ' + JSON.stringify(registry.projects[0]))
  assert.ok(registry.projects[0].registeredAt, 'the registered project must record a registeredAt timestamp: ' + JSON.stringify(registry.projects[0]))

  const r2 = hub(['register', '--root', projRoot], { env })
  assert.strictEqual(r2.status, 0, 'registering the identical realpath a second time must still exit 0: ' + r2.stdout + r2.stderr)
  assert.match(r2.stdout, /^already registered /, 'a repeat register of the same realpath must print "already registered …", never re-print "registered …" as though it were new: ' + JSON.stringify(r2.stdout))
  const registryAfter = JSON.parse(fs.readFileSync(path.join(home, 'registry.json'), 'utf8'))
  assert.strictEqual(registryAfter.projects.length, 1, 'a repeat register of the same realpath must remain a no-op — a second project row would mean the hub double-counts one project in the inbox: ' + JSON.stringify(registryAfter.projects))

  const parentA = tmpdir('design-hub-parentA')
  const parentB = tmpdir('design-hub-parentB')
  const rootA = path.join(parentA, 'shared-name')
  const rootB = path.join(parentB, 'shared-name')
  fs.mkdirSync(rootA)
  fs.mkdirSync(rootB)
  const home2 = tmpdir('design-hub-home')
  const env2 = { ...process.env, SPEC_DESIGN_HUB_HOME: home2 }
  const first = hub(['register', '--root', rootA], { env: env2 })
  assert.strictEqual(first.status, 0, 'registering the first "shared-name" root must succeed: ' + first.stdout + first.stderr)
  const collision = hub(['register', '--root', rootB], { env: env2 })
  assert.strictEqual(collision.status, 2, 'registering a second, DIFFERENT root under the same basename must be refused (exit 2) rather than silently overwriting the first project\'s row: ' + collision.stdout + collision.stderr)
  const collisionOut = collision.stdout + collision.stderr
  assert.match(collisionOut, new RegExp(escapeRe(fs.realpathSync(rootA))), 'the collision refusal must name the already-registered root: ' + collisionOut)
  assert.match(collisionOut, new RegExp(escapeRe(fs.realpathSync(rootB))), 'the collision refusal must name the new, colliding root: ' + collisionOut)
  assert.match(collisionOut, /--name/, 'the collision refusal must name --name as the remedy: ' + collisionOut)

  const disambiguated = hub(['register', '--root', rootB, '--name', 'other'], { env: env2 })
  assert.strictEqual(disambiguated.status, 0, 'a disambiguated register with --name other must succeed: ' + disambiguated.stdout + disambiguated.stderr)
  const registry2 = JSON.parse(fs.readFileSync(path.join(home2, 'registry.json'), 'utf8'))
  assert.strictEqual(registry2.projects.length, 2, 'a disambiguated --name register must add a SECOND project row, not replace the first: ' + JSON.stringify(registry2.projects))
  assert.ok(registry2.projects.some((p) => p.name === 'other' && p.root === fs.realpathSync(rootB)), 'the second project must be registered under name "other" pointing at rootB: ' + JSON.stringify(registry2.projects))
})

// ---------------------------------------------------------------------------
// AC-20260905-02-2
// ---------------------------------------------------------------------------
test('AC-20260905-02-2: ensure spawns a detached hub that outlives the ensure process and answers health, and a second ensure recognises it without spawning again', async () => {
  const home = tmpdir('design-hub-home')
  const port = await freePort()
  const env = { ...process.env, SPEC_DESIGN_HUB_HOME: home, SPEC_DESIGN_HUB_PORT: String(port) }
  try {
    const r1 = hub(['ensure'], { env })
    assert.strictEqual(r1.status, 0, 'ensure must exit 0 when no hub is up and the port is free: ' + r1.stdout + r1.stderr)
    const lines = r1.stdout.split('\n').filter((l) => l.trim() !== '')
    assert.strictEqual(lines.length, 1, 'ensure must print EXACTLY one stdout line, the base URL — a caller splices this straight into a link, so any extra line corrupts it: ' + JSON.stringify(r1.stdout))
    assert.strictEqual(lines[0], 'http://localhost:' + port, 'the one printed line must be the base URL for the resolved port: ' + JSON.stringify(lines))

    const pid = parseInt(fs.readFileSync(path.join(home, 'hub.pid'), 'utf8').trim(), 10)
    assert.ok(Number.isInteger(pid) && pid > 0, 'ensure must record the spawned hub\'s pid in hub.pid: ' + pid)

    const health = await waitFor(() => getRes('http://127.0.0.1:' + port + '/__hub/health').then((r) => (r.status === 200 ? r : null)), 4000)
    assert.strictEqual(health.status, 200, 'the spawned hub must answer /__hub/health 200 AFTER the ensure process that spawned it has already exited (spike A1: a detached child outlives its parent): ' + JSON.stringify(health))
    assert.strictEqual(health.json && health.json.hub, true, 'the health response must carry hub:true: ' + JSON.stringify(health.json))

    const spawnLinesBefore = fs.readFileSync(path.join(home, 'hub.log'), 'utf8').split('\n').filter((l) => l.includes('hub serving')).length

    const r2 = hub(['ensure'], { env })
    assert.strictEqual(r2.status, 0, 'a second ensure against an already-up hub must exit 0: ' + r2.stdout + r2.stderr)
    assert.strictEqual(r2.stdout.trim(), 'http://localhost:' + port, 'a second ensure must print the same one-line base, recognising the running hub rather than guessing: ' + JSON.stringify(r2.stdout))
    const spawnLinesAfter = fs.readFileSync(path.join(home, 'hub.log'), 'utf8').split('\n').filter((l) => l.includes('hub serving')).length
    assert.strictEqual(spawnLinesAfter, spawnLinesBefore, 'a second ensure recognising a healthy hub must not spawn a second one — hub.log must gain no second "hub serving" line: before=' + spawnLinesBefore + ' after=' + spawnLinesAfter)
  } finally {
    killHub(home)
  }
})

// ---------------------------------------------------------------------------
// AC-20260905-02-3
// ---------------------------------------------------------------------------
test('AC-20260905-02-3: a foreign occupant on the port makes ensure refuse naming the port and SPEC_DESIGN_HUB_PORT, and a configured base is honored by a real hub', async () => {
  const home1 = tmpdir('design-hub-home')
  const port1 = await freePort()
  const env1 = { ...process.env, SPEC_DESIGN_HUB_HOME: home1, SPEC_DESIGN_HUB_PORT: String(port1) }
  // A real OS process (not an in-process server) — ensure's child talks to it over spawnSync,
  // which blocks the parent's own event loop, so an in-process stand-in could never answer.
  const occupant = spawn(process.execPath, ['-e',
    `require('http').createServer((req,res)=>{res.writeHead(200,{'content-type':'text/plain'});res.end('ok')}).listen(${port1},'127.0.0.1')`],
    { stdio: 'ignore' })
  try {
    await waitFor(() => getRes('http://127.0.0.1:' + port1 + '/').then((r) => (r.status === 200 ? r : null)), 3000)
    const r = hub(['ensure'], { env: env1 })
    assert.strictEqual(r.status, 2, 'ensure must exit 2 when the port answers but not with hub:true (a foreign occupant): ' + r.stdout + r.stderr)
    assert.match(r.stderr + r.stdout, new RegExp(String(port1)), 'the refusal must name the held port: ' + r.stdout + r.stderr)
    assert.match(r.stderr + r.stdout, /SPEC_DESIGN_HUB_PORT/, 'the refusal must name SPEC_DESIGN_HUB_PORT as the way to pick a different port: ' + r.stdout + r.stderr)
  } finally {
    occupant.kill()
  }

  const home2 = tmpdir('design-hub-home')
  const port2 = await freePort()
  const env2 = { ...process.env, SPEC_DESIGN_HUB_HOME: home2, SPEC_DESIGN_HUB_PORT: String(port2) }
  try {
    const cfg = hub(['config', '--base', 'https://mac.example.ts.net/'], { env: env2 })
    assert.strictEqual(cfg.status, 0, 'config --base must accept a well-formed absolute URL: ' + cfg.stdout + cfg.stderr)
    const ensured = hub(['ensure'], { env: env2 })
    assert.strictEqual(ensured.status, 0, 'ensure over a real hub must exit 0: ' + ensured.stdout + ensured.stderr)
    assert.strictEqual(ensured.stdout.trim(), 'https://mac.example.ts.net',
      'once config --base stores an origin, ensure must print that base (trailing slash stripped) instead of deriving one from the port: ' + JSON.stringify(ensured.stdout))
    const cfgRead = hub(['config'], { env: env2 })
    assert.strictEqual(cfgRead.status, 0, 'a bare config must exit 0: ' + cfgRead.stdout + cfgRead.stderr)
    assert.match(cfgRead.stdout, /base https:\/\/mac\.example\.ts\.net/, 'config with no flag must print a line containing "base https://mac.example.ts.net": ' + JSON.stringify(cfgRead.stdout))
  } finally {
    killHub(home2)
  }
})

// ---------------------------------------------------------------------------
// AC-20260905-02-4
// ---------------------------------------------------------------------------
test('AC-20260905-02-4: the inbox lists every registered project\'s open stops newest first across projects, decided stops in a later section, an unreachable project badged, health reports the project count, and the page auto-refreshes', async () => {
  const home = tmpdir('design-hub-home')
  const rootA = tmpdir('design-hub-a')
  const rootB = tmpdir('design-hub-b')
  const rootC = tmpdir('design-hub-c')
  const port = await freePort()
  const env = { ...process.env, SPEC_DESIGN_HUB_HOME: home, SPEC_DESIGN_HUB_PORT: String(port) }

  writeStops(rootA, [stopFixture({ id: 'P001', key: 'k-a', title: 'a stop', openedAt: '2026-09-05T10:00:00.000Z' })])
  writeStops(rootB, [
    stopFixture({ id: 'P001', key: 'k-b1', title: 'b open stop', openedAt: '2026-09-05T10:05:00.000Z' }),
    stopFixture({
      id: 'P002', key: 'k-b2', title: 'b decided stop', openedAt: '2026-09-05T09:00:00.000Z', status: 'decided',
      decision: { verdict: 'approve', pick: null, note: null, by: 'jj', at: '2026-09-05T09:30:00.000Z' },
    }),
  ])

  assert.strictEqual(hub(['register', '--root', rootA], { env }).status, 0, 'test setup requires registering project a to succeed')
  assert.strictEqual(hub(['register', '--root', rootB], { env }).status, 0, 'test setup requires registering project b to succeed')
  assert.strictEqual(hub(['register', '--root', rootC], { env }).status, 0, 'test setup requires registering project c to succeed')
  const nameA = path.basename(fs.realpathSync(rootA))
  const nameB = path.basename(fs.realpathSync(rootB))
  const nameC = path.basename(rootC)
  fs.rmSync(rootC, { recursive: true, force: true })

  try {
    const e = hub(['ensure'], { env })
    assert.strictEqual(e.status, 0, 'test setup requires ensure to bring up the hub: ' + e.stdout + e.stderr)
    const base = e.stdout.trim()

    const health = await getRes(base + '/__hub/health')
    assert.strictEqual(health.status, 200, '/__hub/health must answer 200: ' + JSON.stringify(health))
    assert.strictEqual(health.json.projects, 3, 'health must report 3 registered projects (a, b, and the now-vanished c): ' + JSON.stringify(health.json))

    const inbox = await getRes(base + '/')
    assert.strictEqual(inbox.status, 200, 'GET / must answer 200: ' + JSON.stringify(inbox))
    const html = inbox.body
    const linkA = '/p/' + nameA + '/atlas/index.html#stop-P001'
    const linkB = '/p/' + nameB + '/atlas/index.html#stop-P001'
    assert.ok(html.includes(linkA) && html.includes(linkB), 'the inbox must link both projects\' open stops: ' + html)
    assert.ok(html.indexOf(linkB) < html.indexOf(linkA), 'project b\'s stop (opened 10:05) must list ABOVE project a\'s stop (opened 10:00) — open stops sort openedAt descending across projects: ' + html)
    const decidedIdx = html.indexOf('P002')
    assert.ok(decidedIdx > -1, 'the decided stop P002 must appear on the inbox: ' + html)
    assert.ok(decidedIdx > Math.max(html.indexOf(linkA), html.indexOf(linkB)), 'the decided section must render AFTER the open section, even though P002 was opened earliest of all three: ' + html)
    assert.ok(html.includes(nameC), 'the inbox must list project c by name even though its root vanished: ' + html)
    assert.ok(html.includes('unreachable'), 'a project whose root vanished must be badged "unreachable": ' + html)
    assert.match(html, /<meta http-equiv="refresh" content="30">/, 'the inbox must carry a 30-second auto-refresh meta tag: ' + html)
  } finally {
    killHub(home)
  }
})

// ---------------------------------------------------------------------------
// AC-20260905-02-5
// ---------------------------------------------------------------------------
test('AC-20260905-02-5: the hub serves a project\'s atlas with the stop anchor and notes script, exact mock bytes on ?clean, decide rewrites only that project\'s picks.json, and unknown/vanished projects 404 naming them', async () => {
  const home = tmpdir('design-hub-home')
  const rootA = tmpdir('design-hub-a')
  const rootC = tmpdir('design-hub-c')
  const port = await freePort()
  const env = { ...process.env, SPEC_DESIGN_HUB_HOME: home, SPEC_DESIGN_HUB_PORT: String(port) }

  writeStops(rootA, [stopFixture({ id: 'P001', key: 'k-a', title: 'a stop', openedAt: '2026-09-05T10:00:00.000Z' })])
  fs.writeFileSync(path.join(rootA, 'design/mocks/x.html'), '<main>hello x</main>\n')

  assert.strictEqual(hub(['register', '--root', rootA], { env }).status, 0, 'test setup requires registering project a')
  assert.strictEqual(hub(['register', '--root', rootC], { env }).status, 0, 'test setup requires registering project c')
  const nameA = path.basename(fs.realpathSync(rootA))
  const nameC = path.basename(rootC)
  const realRootC = fs.realpathSync(rootC)
  fs.rmSync(rootC, { recursive: true, force: true })

  try {
    const e = hub(['ensure'], { env })
    assert.strictEqual(e.status, 0, 'test setup requires ensure to bring up the hub: ' + e.stdout + e.stderr)
    const base = e.stdout.trim()

    const atlas = await getRes(base + '/p/' + nameA + '/atlas/index.html')
    assert.strictEqual(atlas.status, 200, 'GET /p/<name>/atlas/index.html must answer 200: ' + JSON.stringify(atlas.status))
    assert.ok(atlas.body.includes('id="stop-P001"'), 'the served atlas must carry the block for the open stop: ' + atlas.body.slice(0, 400))
    assert.ok(atlas.body.includes('<script src="/p/' + nameA + '/__notes/notes.js">'), 'the served atlas must carry the prefix-aware notes script tag: ' + atlas.body.slice(0, 400))

    const mockRes = await getRes(base + '/p/' + nameA + '/mocks/x.html?clean')
    assert.strictEqual(mockRes.status, 200, 'GET /p/<name>/mocks/x.html?clean must answer 200: ' + JSON.stringify(mockRes.status))
    assert.strictEqual(mockRes.body, fs.readFileSync(path.join(rootA, 'design/mocks/x.html'), 'utf8'),
      '?clean must answer the exact file bytes, with no injected notes layer: ' + JSON.stringify(mockRes.body))

    const decide = await postJson(base + '/p/' + nameA + '/__picks/decide', { id: 'P001', verdict: 'approve', by: 'jj' })
    assert.strictEqual(decide.status, 200, 'POST /p/<name>/__picks/decide must answer 200 on a valid decision: ' + JSON.stringify(decide))
    const picksAfter = JSON.parse(fs.readFileSync(path.join(rootA, 'design/mocks/picks.json'), 'utf8'))
    assert.strictEqual(picksAfter.find((s) => s.id === 'P001').status, 'decided',
      'the decide route must rewrite ONLY project a\'s own design/mocks/picks.json — a status still "open" means the route never actually wrote the decision')

    const unknown = await getRes(base + '/p/nope/atlas/index.html')
    assert.strictEqual(unknown.status, 404, 'an unregistered project name must 404: ' + JSON.stringify(unknown.status))
    assert.match(unknown.body, /nope/, 'the 404 for an unknown project must name it: ' + unknown.body)

    const vanished = await getRes(base + '/p/' + nameC + '/atlas/index.html')
    assert.strictEqual(vanished.status, 404, 'a project whose root vanished must 404, never crash the hub or serve a stale build: ' + JSON.stringify(vanished.status))
    assert.match(vanished.body, new RegExp(escapeRe(realRootC)), 'the 404 for a vanished root must name the root path: ' + vanished.body)
  } finally {
    killHub(home)
  }
})

// ---------------------------------------------------------------------------
// AC-20260905-02-6
// ---------------------------------------------------------------------------
test('AC-20260905-02-6: the hub binds 127.0.0.1 only, never a wildcard interface, and every response carries cache-control: no-store', async () => {
  const home = tmpdir('design-hub-home')
  const rootA = tmpdir('design-hub-a')
  const port = await freePort()
  const env = { ...process.env, SPEC_DESIGN_HUB_HOME: home, SPEC_DESIGN_HUB_PORT: String(port) }
  assert.strictEqual(hub(['register', '--root', rootA], { env }).status, 0, 'test setup requires registering project a')
  const nameA = path.basename(fs.realpathSync(rootA))
  try {
    const e = hub(['ensure'], { env })
    assert.strictEqual(e.status, 0, 'test setup requires ensure to bring up the hub: ' + e.stdout + e.stderr)
    const base = e.stdout.trim()

    let lsof
    try {
      lsof = execFileSync('lsof', ['-nP', '-iTCP:' + port, '-sTCP:LISTEN'], { encoding: 'utf8' })
    } catch (err) {
      lsof = String((err && err.stdout) || '')
    }
    assert.match(lsof, new RegExp('127\\.0\\.0\\.1:' + port + '\\b'), 'the hub must bind 127.0.0.1:' + port + ': ' + lsof)
    assert.ok(!new RegExp('\\*:' + port + '\\b').test(lsof) && !new RegExp('0\\.0\\.0\\.0:' + port + '\\b').test(lsof),
      'the hub must never bind a wildcard interface — a writable /__picks/decide endpoint on an open interface repeats the spec 10 review incident: ' + lsof)

    for (const url of [base + '/', base + '/__hub/health', base + '/p/' + nameA + '/atlas/index.html']) {
      const r = await getRes(url)
      assert.strictEqual(r.headers['cache-control'], 'no-store', url + ' must carry cache-control: no-store, or a stale hub page could mislead a reviewer: ' + JSON.stringify(r.headers))
    }
  } finally {
    killHub(home)
  }
})

// ---------------------------------------------------------------------------
// AC-20260905-02-7
// ---------------------------------------------------------------------------
test('AC-20260905-02-7: stop open registers the root, writes the stop, prints its verified URL, and requires a group on every pick candidate', async () => {
  const home = tmpdir('design-hub-home')
  const rootA = tmpdir('design-hub-a')
  const port = await freePort()
  const env = { ...process.env, SPEC_DESIGN_HUB_HOME: home, SPEC_DESIGN_HUB_PORT: String(port) }
  try {
    const r = hub(['stop', 'open', '--root', rootA, '--kind', 'approve', '--key', 'journey-approved:j',
      '--title', 'approve journey j', '--candidates', 'a=mocks/a.html,b=mocks/b.html'], { env })
    assert.strictEqual(r.status, 0, 'stop open must exit 0 on a well-formed approve request against a free port: ' + r.stdout + r.stderr)
    const lines = r.stdout.split('\n').filter((l) => l.trim() !== '')
    assert.strictEqual(lines.length, 1, 'stop open must print exactly one stdout line: ' + JSON.stringify(r.stdout))
    const name = path.basename(fs.realpathSync(rootA))
    assert.strictEqual(lines[0], 'http://localhost:' + port + '/p/' + name + '/atlas/index.html#stop-P001',
      'the one printed line must be the hub-served atlas URL naming the new stop\'s anchor: ' + JSON.stringify(lines))

    const stops = JSON.parse(fs.readFileSync(path.join(rootA, 'design/mocks/picks.json'), 'utf8'))
    assert.strictEqual(stops.length, 1, 'stop open must write exactly one stop: ' + JSON.stringify(stops))
    assert.strictEqual(stops[0].status, 'open', 'the written stop must be open: ' + JSON.stringify(stops[0]))
    assert.strictEqual(stops[0].url, lines[0], 'the stop\'s recorded url must equal the printed line, or a caller reading it back gets a different URL than the one it already showed the user: ' + JSON.stringify(stops[0]))
    assert.deepStrictEqual(stops[0].candidates,
      [{ group: null, label: 'a', path: 'mocks/a.html' }, { group: null, label: 'b', path: 'mocks/b.html' }],
      'an approve stop\'s candidates must carry null groups, parsed from the plain "label=path" form: ' + JSON.stringify(stops[0].candidates))

    const registry = JSON.parse(fs.readFileSync(path.join(home, 'registry.json'), 'utf8'))
    assert.strictEqual(registry.projects.length, 1, 'stop open must register the root as a side effect, or the printed link 404s on an unregistered project: ' + JSON.stringify(registry.projects))

    const atlasRes = await getRes('http://127.0.0.1:' + port + '/p/' + name + '/atlas/index.html')
    assert.strictEqual(atlasRes.status, 200, 'the printed URL\'s host must actually answer 200 once stop open has returned: ' + JSON.stringify(atlasRes.status))
    assert.ok(atlasRes.body.includes('id="stop-P001"'), 'the served atlas must carry the new stop\'s block: ' + atlasRes.body.slice(0, 400))

    const pickOk = hub(['stop', 'open', '--root', rootA, '--kind', 'pick', '--key', 'theme-picked',
      '--title', 'pick the theme', '--candidates', 'ocean/signin=theme/ocean/signin.html,ember/signin=theme/ember/signin.html'], { env })
    assert.strictEqual(pickOk.status, 0, 'a pick stop with every candidate carrying a "group/label=path" form must be accepted: ' + pickOk.stdout + pickOk.stderr)
    const stops2 = JSON.parse(fs.readFileSync(path.join(rootA, 'design/mocks/picks.json'), 'utf8'))
    const themeStop = stops2.find((s) => s.key === 'theme-picked')
    assert.deepStrictEqual(themeStop.candidates.map((c) => c.group), ['ocean', 'ember'], 'a pick stop\'s candidates must carry the parsed group before the "/": ' + JSON.stringify(themeStop.candidates))

    const missingGroup = hub(['stop', 'open', '--root', rootA, '--kind', 'pick', '--key', 'shape-picked',
      '--title', 'pick a shape', '--candidates', 'a=mocks/a.html'], { env })
    assert.strictEqual(missingGroup.status, 2, 'a pick stop with a candidate carrying no group must be refused (exit 2): ' + missingGroup.stdout + missingGroup.stderr)
    assert.match(missingGroup.stderr + missingGroup.stdout, /group/, 'the refusal must name "group" as the missing piece: ' + missingGroup.stdout + missingGroup.stderr)

    const before = JSON.parse(fs.readFileSync(path.join(rootA, 'design/mocks/picks.json'), 'utf8')).length
    const noCandidates = hub(['stop', 'open', '--root', rootA, '--kind', 'approve', '--key', 'k2', '--title', 't'], { env })
    assert.strictEqual(noCandidates.status, 2, 'a missing --candidates flag must be refused: ' + noCandidates.stdout + noCandidates.stderr)
    assert.match(noCandidates.stderr + noCandidates.stdout, /candidates/, 'the refusal must name "candidates": ' + noCandidates.stdout + noCandidates.stderr)
    const after = JSON.parse(fs.readFileSync(path.join(rootA, 'design/mocks/picks.json'), 'utf8')).length
    assert.strictEqual(after, before, 'a refused stop open must write nothing to picks.json: before=' + before + ' after=' + after)
  } finally {
    killHub(home)
  }
})

// ---------------------------------------------------------------------------
// AC-20260905-02-8
// ---------------------------------------------------------------------------
test('AC-20260905-02-8: stop decide records a decision, a re-decide keeps the prior one under previous, an already-consumed stop is refused, and stop list renders one line per stop', () => {
  const home = tmpdir('design-hub-home')
  const rootA = tmpdir('design-hub-a')
  const env = { ...process.env, SPEC_DESIGN_HUB_HOME: home }
  writeStops(rootA, [stopFixture({ id: 'P001', key: 'journey-approved:j', title: 'approve journey j', openedAt: '2026-09-05T10:00:00.000Z' })])
  assert.strictEqual(hub(['register', '--root', rootA], { env }).status, 0, 'test setup requires registering project a')

  const decided = hub(['stop', 'decide', '--root', rootA, '--id', 'P001', '--verdict', 'change', '--note', 'too dense', '--by', 'chat'], { env })
  assert.strictEqual(decided.status, 0, 'a valid decide on an open stop must exit 0: ' + decided.stdout + decided.stderr)
  assert.strictEqual(decided.stdout.trim(), 'decided P001 change', 'stop decide must print "decided <id> <verdict>": ' + JSON.stringify(decided.stdout))
  let stop = JSON.parse(fs.readFileSync(path.join(rootA, 'design/mocks/picks.json'), 'utf8'))[0]
  assert.strictEqual(stop.status, 'decided', 'the stop must move to decided: ' + JSON.stringify(stop))
  assert.strictEqual(stop.decision.note, 'too dense', 'the decision must record the note verbatim: ' + JSON.stringify(stop.decision))
  assert.strictEqual(stop.decision.by, 'chat', 'the decision must record "by" verbatim: ' + JSON.stringify(stop.decision))

  const redecided = hub(['stop', 'decide', '--root', rootA, '--id', 'P001', '--verdict', 'approve', '--by', 'chat'], { env })
  assert.strictEqual(redecided.status, 0, 're-deciding an already-decided stop must be accepted (re-pick until consumed): ' + redecided.stdout + redecided.stderr)
  assert.strictEqual(redecided.stdout.trim(), 'decided P001 approve', 'stop decide must print "decided <id> <verdict>" on a re-decide too: ' + JSON.stringify(redecided.stdout))
  stop = JSON.parse(fs.readFileSync(path.join(rootA, 'design/mocks/picks.json'), 'utf8'))[0]
  assert.strictEqual(stop.decision.verdict, 'approve', 'the live decision must now be approve: ' + JSON.stringify(stop.decision))
  assert.strictEqual(stop.previous.length, 1, 're-deciding must push the earlier decision onto previous rather than discard it: ' + JSON.stringify(stop.previous))
  assert.strictEqual(stop.previous[0].verdict, 'change', 'the previous entry must be the earlier "change" decision: ' + JSON.stringify(stop.previous))

  const list = hub(['stop', 'list', '--root', rootA], { env })
  assert.strictEqual(list.status, 0, 'stop list must exit 0: ' + list.stdout + list.stderr)
  assert.strictEqual(list.stdout.trim(), 'P001 decided approve journey-approved:j — approve journey j',
    'stop list must print exactly "<id> <status> <kind> <key> — <title>" for the live stop: ' + JSON.stringify(list.stdout))

  const consumedStops = JSON.parse(fs.readFileSync(path.join(rootA, 'design/mocks/picks.json'), 'utf8'))
  consumedStops[0].status = 'consumed'
  fs.writeFileSync(path.join(rootA, 'design/mocks/picks.json'), JSON.stringify(consumedStops, null, 2) + '\n')
  const afterConsumed = hub(['stop', 'decide', '--root', rootA, '--id', 'P001', '--verdict', 'approve', '--by', 'chat'], { env })
  assert.strictEqual(afterConsumed.status, 2, 'deciding an already-consumed stop must be refused (exit 2): ' + afterConsumed.stdout + afterConsumed.stderr)
  assert.match(afterConsumed.stderr + afterConsumed.stdout, /already consumed/, 'the refusal must name "already consumed": ' + afterConsumed.stdout + afterConsumed.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260905-02-19 (entrypoints leg — the spec-paths key leg lives in tests/spec-paths.test.js)
// ---------------------------------------------------------------------------
test('AC-20260905-02-19: spec/entrypoints.json carries a row for spec/scripts/design-hub.js naming mocks-driver.js, sketch.md, atlas.md, and doctrine/mocks.md as entry points', () => {
  const manifest = JSON.parse(read('spec/entrypoints.json'))
  const row = manifest['spec/scripts/design-hub.js']
  assert.ok(row, 'spec/entrypoints.json must carry a "spec/scripts/design-hub.js" key — its absence means the D10 new-surface checklist is incomplete and the live-repo entrypoints sweep has nothing to check the new script against: ' + JSON.stringify(Object.keys(manifest)))
  const entryPoints = (row && row.entryPoints) || []
  for (const ep of ['spec/scripts/mocks-driver.js', 'spec/commands/sketch.md', 'spec/commands/atlas.md', 'spec/doctrine/mocks.md']) {
    assert.ok(entryPoints.includes(ep), 'design-hub.js\'s entryPoints must list "' + ep + '" — every caller that spawns or resolves design-hub.js must be named, or the reachability sweep cannot prove the script is actually reached: ' + JSON.stringify(entryPoints))
  }
})
