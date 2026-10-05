'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { tmpdir, runNode, SPEC } = require('../helpers')
const { startStub, HELLO_OK, TOKEN } = require('../walkthrough/fixture')
const { parseSeedJourneys, beatHash } = require('../../spec/scripts/lib/surfaces')

// specs/20261005/06-the-design-stage-sends-pictures.md — AC-20261005-06-1 through AC-20261005-06-13
// (D2-D9): pictures.js derives the wanted list from the seed, runs the project's own command,
// checks the folder, writes round.json and sends it only through walkthrough.js.

const SCRIPT = 'scripts/pictures.js'
const PERSONA_ORDER = 'Ana (shopper) orders a thing and checks on it.'
const PERSONA_TRACK = 'Ana (shopper) follows her order.'
const SEED = '# Seed — Acme\n\n## Product\n\nA shop.\n\n## Journeys\n\n' +
  '### order\n' + PERSONA_ORDER + '\n' +
  '1. "I open the landing page" -> landing\n' +
  '2. "I see an empty form" -> form@empty\n' +
  '3. "I see my details filled in" -> form@filled\n\n' +
  '### track\n' + PERSONA_TRACK + '\n' +
  '1. "I see my details again" -> form@filled\n' +
  '2. "I see the status" -> status\n'
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const FILES_390_1280 = ['landing', 'form--empty', 'form--filled', 'status']
  .flatMap((s) => [390, 1280].map((w) => s + '--' + w + '.png'))

// make-pictures.js: logs its cwd and both variables to command.log, writes one PNG per wanted
// entry, then applies the variant (skip, zero, gif, extra file names).
function pictureScript(v = {}) {
  return [
    "'use strict'",
    "const fs = require('fs'), path = require('path')",
    'const v = ' + JSON.stringify(v),
    'const dir = process.env.SPEC_PICTURES_DIR, wantedFile = process.env.SPEC_PICTURES_WANTED',
    "fs.appendFileSync('command.log', JSON.stringify({ cwd: process.cwd(), dir, wanted: wantedFile }) + '\\n')",
    "const wanted = JSON.parse(fs.readFileSync(wantedFile, 'utf8'))",
    "const png = () => Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), Buffer.from('filler-filler-filler')])",
    'for (const p of wanted.pictures) {',
    '  if ((v.skip || []).includes(p.file)) continue',
    "  if ((v.zero || []).includes(p.file)) { fs.writeFileSync(path.join(dir, p.file), ''); continue }",
    "  if ((v.gif || []).includes(p.file)) { fs.writeFileSync(path.join(dir, p.file), Buffer.from('GIF89a-filler-filler-filler')); continue }",
    '  fs.writeFileSync(path.join(dir, p.file), png())',
    '}',
    'for (const e of (v.extra || [])) fs.writeFileSync(path.join(dir, e), png())',
    '',
  ].join('\n')
}

// A tmp project: seed, config, make-pictures.js. opts: seed (text, false = none), pictures
// (config block, false = none), walkthrough (block), script (variant).
function makeProject(opts = {}) {
  const root = tmpdir('pictures-project')
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  const cfg = { generatedBy: 'test' }
  if (opts.pictures !== false) cfg.pictures = opts.pictures || { command: 'node make-pictures.js', dir: 'design/pictures' }
  if (opts.walkthrough) cfg.walkthrough = opts.walkthrough
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify(cfg, null, 2) + '\n')
  if (opts.seed !== false) {
    fs.mkdirSync(path.join(root, 'design/mocks'), { recursive: true })
    fs.writeFileSync(path.join(root, 'design/mocks/seed.md'), opts.seed || SEED)
  }
  fs.writeFileSync(path.join(root, 'make-pictures.js'), pictureScript(opts.script))
  return root
}

function run(root, args) {
  return runNode(SCRIPT, ['--root', root, ...args], { cwd: root, env: { ...process.env, WALKTHROUGH_TOKEN: TOKEN } })
}

// The send cases need an async child: the stub service is a separate process the sender talks to.
function runAsync(root, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(SPEC, SCRIPT), '--root', root, ...args],
      { cwd: root, env: { ...process.env, WALKTHROUGH_TOKEN: TOKEN }, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    const killer = setTimeout(() => child.kill('SIGKILL'), 60000)
    child.once('close', (status, signal) => { clearTimeout(killer); resolve({ status, signal, stdout, stderr }) })
  })
}

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'))
const logPath = (root) => path.join(root, 'command.log')
const logEntries = (root) => fs.readFileSync(logPath(root), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))

function wantedEntries(widths) {
  const pairs = [['landing', null], ['form', 'empty'], ['form', 'filled'], ['status', null]]
  const out = []
  for (const [screen, state] of pairs) {
    for (const width of widths) {
      out.push({ screen, state, width, file: screen + (state ? '--' + state : '') + '--' + width + '.png' })
    }
  }
  return out
}

function roundScreens(widths) {
  return wantedEntries(widths).map((e) => (e.state
    ? { name: e.screen, state: e.state, width: e.width, file: e.file }
    : { name: e.screen, width: e.width, file: e.file }))
}

function refusalLine(r, code) {
  return r.stderr.split('\n').find((l) => l.startsWith('pictures: ' + code + ' — '))
}

test('AC-20261005-06-1: a --no-send run on the two-story project writes the wanted list, runs the command once with cwd and both variables, writes round.json and prints the one took line', () => {
  const root = makeProject()
  const r = run(root, ['--no-send'])
  assert.strictEqual(r.status, 0, 'a clean run must exit 0, so the project can send pictures: ' + r.stderr)
  const dir = path.join(root, 'design/pictures')
  assert.deepStrictEqual(readJson(path.join(dir, 'wanted.json')),
    { schemaVersion: 1, pictures: wantedEntries([390, 1280]) },
    'wanted.json must list every screen-and-state pair at each width in story order, or the project command cannot know what to make')
  const entries = logEntries(root)
  assert.strictEqual(entries.length, 1, 'the project command must run exactly once, not once per picture')
  assert.strictEqual(fs.realpathSync(entries[0].cwd), fs.realpathSync(root), 'the command must run with cwd at the project root, or relative paths in it break')
  assert.strictEqual(fs.realpathSync(entries[0].dir), fs.realpathSync(dir), 'SPEC_PICTURES_DIR must be the picture folder')
  assert.ok(path.isAbsolute(entries[0].dir), 'SPEC_PICTURES_DIR must be absolute: ' + entries[0].dir)
  assert.strictEqual(fs.realpathSync(entries[0].wanted), fs.realpathSync(path.join(dir, 'wanted.json')), 'SPEC_PICTURES_WANTED must be the wanted list path')
  assert.ok(path.isAbsolute(entries[0].wanted), 'SPEC_PICTURES_WANTED must be absolute: ' + entries[0].wanted)
  assert.deepStrictEqual(readJson(path.join(dir, 'round.json')), {
    kind: 'screenshots',
    journeys: [
      { id: 'order', title: 'Order', persona: PERSONA_ORDER, steps: [
        { beat: 'I open the landing page', screen: 'landing' },
        { beat: 'I see an empty form', screen: 'form', state: 'empty' },
        { beat: 'I see my details filled in', screen: 'form', state: 'filled' }] },
      { id: 'track', title: 'Track', persona: PERSONA_TRACK, steps: [
        { beat: 'I see my details again', screen: 'form', state: 'filled' },
        { beat: 'I see the status', screen: 'status' }] },
    ],
    screens: roundScreens([390, 1280]),
  }, 'round.json must carry the seed journeys and the screens in wanted order, or the sender reads a different round')
  assert.strictEqual(r.stdout, 'took 8 pictures — 4 screens at 390 and 1280 wide — design/pictures/round.json\n',
    'stdout must be the one took line under --no-send, or callers cannot parse the result')
})

test('AC-20261005-06-2: widths [768] yields four wanted entries in story order and a took line naming 768', () => {
  const root = makeProject({ pictures: { command: 'node make-pictures.js', dir: 'design/pictures', widths: [768] } })
  const r = run(root, ['--no-send'])
  assert.strictEqual(r.status, 0, 'a one-width run must exit 0: ' + r.stderr)
  const wanted = readJson(path.join(root, 'design/pictures/wanted.json'))
  assert.deepStrictEqual(wanted.pictures.map((p) => p.file),
    ['landing--768.png', 'form--empty--768.png', 'form--filled--768.png', 'status--768.png'],
    'the declared widths must replace the default, or a project cannot pick its own sizes')
  assert.strictEqual(r.stdout, 'took 4 pictures — 4 screens at 768 wide — design/pictures/round.json\n',
    'the took line must name the declared width, or the user misreads what was made')
})

test('AC-20261005-06-3: a missing picture and a zero-byte picture exit 2 as missing-picture naming 2 of 8 and both files, with no round.json', () => {
  const root = makeProject({ script: { skip: ['form--empty--1280.png'], zero: ['status--390.png'] } })
  const r = run(root, ['--no-send'])
  assert.strictEqual(r.status, 2, 'an incomplete folder must be refused with exit 2, or a round goes out with holes: ' + r.stderr)
  const line = refusalLine(r, 'missing-picture')
  assert.ok(line, 'stderr must carry a pictures: missing-picture line: ' + r.stderr)
  assert.match(line, /2 of 8/, 'the refusal must count 2 of 8, or the user cannot size the gap: ' + line)
  assert.match(line, /form--empty--1280\.png/, 'the refusal must name the absent file: ' + line)
  assert.match(line, /status--390\.png/, 'the refusal must name the empty file: ' + line)
  assert.ok(!fs.existsSync(path.join(root, 'design/pictures/round.json')), 'no round.json may be written after a refusal, or a send could pick it up')
})

test('AC-20261005-06-4: a picture beginning GIF89a exits 2 as bad-picture naming 1 of 8 and the file, with no round.json', () => {
  const root = makeProject({ script: { gif: ['landing--390.png'] } })
  const r = run(root, ['--no-send'])
  assert.strictEqual(r.status, 2, 'a non-PNG picture must be refused with exit 2: ' + r.stderr)
  const line = refusalLine(r, 'bad-picture')
  assert.ok(line, 'stderr must carry a pictures: bad-picture line: ' + r.stderr)
  assert.match(line, /1 of 8/, 'the refusal must count 1 of 8: ' + line)
  assert.match(line, /landing--390\.png/, 'the refusal must name the offending file: ' + line)
  assert.ok(!fs.existsSync(path.join(root, 'design/pictures/round.json')), 'no round.json may be written after a refusal')
})

test('AC-20261005-06-5: a stray oops--390.png alongside all eight pictures exits 2 as extra-picture naming it, with no round.json', () => {
  const root = makeProject({ script: { extra: ['oops--390.png'] } })
  const r = run(root, ['--no-send'])
  assert.strictEqual(r.status, 2, 'a stray picture must be refused with exit 2, or a misnamed picture goes unnoticed: ' + r.stderr)
  const line = refusalLine(r, 'extra-picture')
  assert.ok(line, 'stderr must carry a pictures: extra-picture line: ' + r.stderr)
  assert.match(line, /oops--390\.png/, 'the refusal must name the stray file: ' + line)
  assert.ok(!fs.existsSync(path.join(root, 'design/pictures/round.json')), 'no round.json may be written after a refusal')
})

test('AC-20261005-06-6: a command exiting 3 after printing boom exits 2 with boom relayed then command-failed naming 3 and pictures.command, with no round.json', () => {
  const root = makeProject({ pictures: { command: 'echo boom >&2; exit 3', dir: 'design/pictures' } })
  const r = run(root, ['--no-send'])
  assert.strictEqual(r.status, 2, 'a failing command must be refused with exit 2: ' + r.stderr)
  const lines = r.stderr.split('\n')
  const boom = lines.indexOf('boom')
  const failed = lines.findIndex((l) => l.startsWith('pictures: command-failed — '))
  assert.ok(boom !== -1, 'the command output must be relayed on stderr, or the user cannot see why it failed: ' + r.stderr)
  assert.ok(failed > boom, 'the command-failed line must follow the relayed output: ' + r.stderr)
  assert.match(lines[failed], /3/, 'the refusal must name the exit code: ' + lines[failed])
  assert.match(lines[failed], /pictures\.command/, 'the remedy must name pictures.command: ' + lines[failed])
  assert.ok(!fs.existsSync(path.join(root, 'design/pictures/round.json')), 'no round.json may be written after a failed command')
})

test('AC-20261005-06-7: a missing pictures block is no-command and an unsafe dir or out-of-range width is bad-config, each before the command runs', () => {
  const none = makeProject({ pictures: false })
  const r0 = run(none, ['--no-send'])
  assert.strictEqual(r0.status, 2, 'an absent block must be refused with exit 2: ' + r0.stderr)
  const l0 = refusalLine(r0, 'no-command')
  assert.ok(l0, 'stderr must carry pictures: no-command: ' + r0.stderr)
  assert.match(l0, /pictures/, 'the remedy must name the pictures block: ' + l0)
  assert.match(l0, /spec-paths contract/, 'the remedy must name spec-paths contract: ' + l0)
  assert.ok(!fs.existsSync(logPath(none)), 'the command must not run after no-command')

  for (const dir of ['../out', '/tmp/out', '.']) {
    const root = makeProject({ pictures: { command: 'node make-pictures.js', dir } })
    const r = run(root, ['--no-send'])
    assert.strictEqual(r.status, 2, 'dir ' + dir + ' must be refused with exit 2: ' + r.stderr)
    const l = refusalLine(r, 'bad-config')
    assert.ok(l, 'dir ' + dir + ' must give pictures: bad-config: ' + r.stderr)
    assert.match(l, /pictures\.dir/, 'dir ' + dir + ': the refusal must name pictures.dir: ' + l)
    assert.ok(!fs.existsSync(logPath(root)), 'dir ' + dir + ': the command must not run after bad-config')
  }

  const wide = makeProject({ pictures: { command: 'node make-pictures.js', dir: 'design/pictures', widths: [100] } })
  const rw = run(wide, ['--no-send'])
  assert.strictEqual(rw.status, 2, 'widths [100] must be refused with exit 2: ' + rw.stderr)
  const lw = refusalLine(rw, 'bad-config')
  assert.ok(lw, 'widths [100] must give pictures: bad-config: ' + rw.stderr)
  assert.match(lw, /pictures\.widths/, 'the refusal must name pictures.widths: ' + lw)
  assert.match(lw, /240/, 'the refusal must state the lower bound 240: ' + lw)
  assert.match(lw, /3840/, 'the refusal must state the upper bound 3840: ' + lw)
  assert.ok(!fs.existsSync(logPath(wide)), 'the command must not run after bad-config on widths')
})

test('AC-20261005-06-8: an absent seed is no-stories naming design/mocks/seed.md and /spec:mocks, before the command runs', () => {
  const root = makeProject({ seed: false })
  const r = run(root, ['--no-send'])
  assert.strictEqual(r.status, 2, 'a project with no seed must be refused with exit 2: ' + r.stderr)
  const l = refusalLine(r, 'no-stories')
  assert.ok(l, 'stderr must carry pictures: no-stories: ' + r.stderr)
  assert.match(l, /design\/mocks\/seed\.md/, 'the refusal must name the seed file: ' + l)
  assert.match(l, /\/spec:mocks/, 'the remedy must name /spec:mocks: ' + l)
  assert.ok(!fs.existsSync(logPath(root)), 'the command must not run when there are no stories')
})

test('AC-20261005-06-9: a project with no walkthrough block run without --no-send is not-connected naming /spec:connect and --no-send, before the command runs', () => {
  const root = makeProject()
  const r = run(root, [])
  assert.strictEqual(r.status, 2, 'an unconnected project must be refused with exit 2: ' + r.stderr)
  const l = refusalLine(r, 'not-connected')
  assert.ok(l, 'stderr must carry pictures: not-connected: ' + r.stderr)
  assert.match(l, /\/spec:connect/, 'the remedy must name /spec:connect: ' + l)
  assert.match(l, /--no-send/, 'the remedy must name --no-send: ' + l)
  assert.ok(!fs.existsSync(logPath(root)), 'the slow command must not run before the connection check')
})

test('AC-20261005-06-10: 151 distinct screens at the two default widths is too-many naming 302 and 300, before the command runs', () => {
  const name = (i) => 's' + String(i).padStart(3, '0')
  let seed = '# Seed — Big\n\n## Journeys\n\n'
  let n = 0
  for (const [id, count] of [['one', 51], ['two', 50], ['three', 50]]) {
    seed += '### ' + id + '\nA persona.\n'
    for (let k = 1; k <= count; k++) seed += k + '. "I see screen ' + n + '" -> ' + name(n++) + '\n'
    seed += '\n'
  }
  assert.strictEqual(parseSeedJourneys(seed).size, 3, 'fixture: the seed must hold three journeys')
  const root = makeProject({ seed, walkthrough: { baseUrl: 'http://127.0.0.1:1', project: 'acme-shop', tokenEnv: 'WALKTHROUGH_TOKEN' } })
  const r = run(root, [])
  assert.strictEqual(r.status, 2, 'an over-limit round must be refused with exit 2: ' + r.stderr)
  const l = refusalLine(r, 'too-many')
  assert.ok(l, 'stderr must carry pictures: too-many: ' + r.stderr)
  assert.match(l, /302/, 'the refusal must name the 302 pictures wanted: ' + l)
  assert.match(l, /300/, 'the refusal must name the 300 limit: ' + l)
  assert.ok(!fs.existsSync(logPath(root)), 'the slow command must not run when the round cannot be sent')
})

test('AC-20261005-06-11: a run removes top-level pngs and replaces round.json, leaves notes.txt and keep/a.png byte-identical, and creates an absent folder', () => {
  const root = makeProject()
  const dir = path.join(root, 'design/pictures')
  fs.mkdirSync(path.join(dir, 'keep'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'old--390.png'), 'stale')
  fs.writeFileSync(path.join(dir, 'round.json'), '{"stale":true}\n')
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'my notes\n')
  fs.writeFileSync(path.join(dir, 'keep/a.png'), Buffer.concat([PNG_SIG, Buffer.from('keep-me')]))
  const keepBefore = fs.readFileSync(path.join(dir, 'keep/a.png'))
  const r = run(root, ['--no-send'])
  assert.strictEqual(r.status, 0, 'the run over a used folder must exit 0: ' + r.stderr)
  assert.ok(!fs.existsSync(path.join(dir, 'old--390.png')), 'a stale picture must be removed, or it passes the check as an extra and blocks the round')
  assert.strictEqual(readJson(path.join(dir, 'round.json')).kind, 'screenshots', 'the stale round.json must be replaced, or an old round is sent')
  assert.strictEqual(fs.readFileSync(path.join(dir, 'notes.txt'), 'utf8'), 'my notes\n', 'a non-png file must survive, or a mistyped dir costs the project its files')
  assert.ok(fs.readFileSync(path.join(dir, 'keep/a.png')).equals(keepBefore), 'a file inside a subfolder must survive byte-identical, or cleaning is not top-level only')

  const fresh = makeProject()
  assert.ok(!fs.existsSync(path.join(fresh, 'design/pictures')), 'fixture: the folder must start absent')
  const r2 = run(fresh, ['--no-send'])
  assert.strictEqual(r2.status, 0, 'an absent folder must be created, not refused: ' + r2.stderr)
  assert.ok(fs.statSync(path.join(fresh, 'design/pictures')).isDirectory(), 'the picture folder must exist after the run')
})

const WT = (url) => ({ baseUrl: url, project: 'acme-shop', tokenEnv: 'WALKTHROUGH_TOKEN' })
const BASE = '/v1/projects/acme-shop/rounds/1'
const KEYS = FILES_390_1280.map((f) => f.replace(/\.png$/, ''))
const pushed = { status: 201, body: { apiVersion: 1, round: 1, kind: 'screenshots', status: 'uploading', journeys: [] } }
const stored = (key, remaining) => ({ status: 200, body: { apiVersion: 1, round: 1, image: key, bytes: 27, remaining, status: remaining ? 'uploading' : 'open' } })

test('AC-20261005-06-12: a connected run posts one screenshots round with eight screens and the seed beat hashes, then eight PUTs, ends open, and prints the took, sent and notes-come-back lines', async (t) => {
  const answers = { 'GET /v1': [HELLO_OK], 'POST /v1/projects/acme-shop/rounds': [pushed] }
  KEYS.forEach((k, i) => { answers['PUT ' + BASE + '/images/' + k] = [stored(k, KEYS.length - 1 - i)] })
  const stub = await startStub(t, answers)
  const root = makeProject({ walkthrough: WT(stub.url) })
  const r = await runAsync(root, [])
  assert.strictEqual(r.status, 0, 'a connected run must exit 0: ' + r.stderr)

  const log = stub.log()
  const posts = log.filter((l) => l.method === 'POST')
  assert.strictEqual(posts.length, 1, 'exactly one round must be posted')
  assert.strictEqual(posts[0].url, '/v1/projects/acme-shop/rounds', 'the round must go to the project rounds route')
  const body = posts[0].json
  assert.strictEqual(body.kind, 'screenshots', 'the round kind must be screenshots')
  assert.strictEqual(body.round, 1, 'the first send must be round 1')
  assert.strictEqual(body.screens.length, 8, 'eight screens must be announced')
  assert.strictEqual(body.journeys.length, 2, 'both seed journeys must be sent')
  const seed = parseSeedJourneys(SEED)
  assert.deepStrictEqual(body.journeys.map((j) => j.beats), ['order', 'track'].map((id) => beatHash(seed.get(id).beats)),
    'journey fingerprints must equal the wireframe round fingerprints, or earlier client confirmations stop matching')
  assert.strictEqual(log.filter((l) => l.method === 'PUT').length, 8, 'one PUT per picture must follow')
  assert.strictEqual(readJson(path.join(root, 'design/rounds/1/round.json')).status, 'open', 'the local round must end open')

  const out = r.stdout.split('\n').filter(Boolean)
  assert.strictEqual(out.length, 3, 'stdout must be exactly three lines: ' + r.stdout)
  assert.match(out[0], /^took 8 pictures — /, 'the first line must be the took line: ' + out[0])
  assert.strictEqual(out[1], 'sent round 1 — open at ' + stub.url + '/p/acme-shop', 'the second line must say where the round is open')
  assert.ok(out[2].startsWith('notes come back with: node '), 'the third line must start with the notes command: ' + out[2])
  assert.ok(out[2].endsWith('mocks-driver.js --root ' + root + ' round pull'), 'the third line must end with the round pull command for this root: ' + out[2])
})

test('AC-20261005-06-13: a 500 on the third PUT exits 2 relaying the sender line first, then send-failed with --resume 1 and the round file, leaving all eight pictures', async (t) => {
  const answers = { 'GET /v1': [HELLO_OK], 'POST /v1/projects/acme-shop/rounds': [pushed] }
  KEYS.forEach((k, i) => {
    answers['PUT ' + BASE + '/images/' + k] = [i === 2 ? { status: 500, body: { error: 'internal', detail: 'boom', apiVersion: 1 } } : stored(k, KEYS.length - 1 - i)]
  })
  const stub = await startStub(t, answers)
  const root = makeProject({ walkthrough: WT(stub.url) })
  const r = await runAsync(root, [])
  assert.strictEqual(r.status, 2, 'a failed send must exit 2: ' + r.stderr)
  const lines = r.stderr.split('\n').filter(Boolean)
  const at = lines.findIndex((l) => l.startsWith('pictures: send-failed — '))
  assert.ok(at > 0, 'the sender line must come first, then the pictures: send-failed line: ' + r.stderr)
  assert.match(lines[at], /--resume 1/, 'the remedy must name --resume 1, or the user re-sends from scratch: ' + lines[at])
  assert.match(lines[at], /design\/pictures\/round\.json/, 'the remedy must name the kept round file: ' + lines[at])
  const dir = path.join(root, 'design/pictures')
  for (const f of FILES_390_1280) assert.ok(fs.existsSync(path.join(dir, f)), f + ' must stay in place after a failed send, or the resume has nothing to upload')
})
