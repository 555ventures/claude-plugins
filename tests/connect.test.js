'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { tmpdir, gitRepo, runNode } = require('./helpers')

const STUB = path.join(__dirname, 'fixtures', 'stub-service.js')
const MINTED = 'wt_3f9a1c0de4b7a2c5'
const HELLO = { status: 200, body: { apiVersion: 1, revision: 2, sunset: null } }
const APPROVALS = { status: 200, body: { apiVersion: 1, approvals: [] } }

async function startStub(t, answers) {
  const dir = tmpdir('stub')
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify(answers))
  fs.writeFileSync(path.join(dir, 'log.jsonl'), '')
  const child = spawn(process.execPath, [STUB, '0', path.join(dir, 'a.json'), path.join(dir, 'log.jsonl')], { stdio: ['ignore', 'pipe', 'inherit'] })
  t.after(() => child.kill('SIGKILL'))
  const port = await new Promise((resolve) => child.stdout.on('data', (d) => { const m = /PORT (\d+)/.exec(d); if (m) resolve(Number(m[1])) }))
  return { url: 'http://127.0.0.1:' + port, log: () => fs.readFileSync(path.join(dir, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) }
}

// A fake `npx walkthrough-cli` that logs its argv and answers whoami/new/token.
function fakeNpx(service) {
  const dir = tmpdir('npx')
  const calls = path.join(dir, 'calls.log')
  fs.writeFileSync(path.join(dir, 'npx'), `#!${process.execPath}
const fs = require('fs')
const argv = process.argv.slice(4)
fs.appendFileSync(${JSON.stringify(calls)}, argv[0] + '\\n')
if (argv[0] === 'whoami') console.log(JSON.stringify({ service: ${JSON.stringify(service)} }))
else if (argv[0] === 'new') console.log(JSON.stringify({ id: 'x' }))
else if (argv[0] === 'token') console.log(JSON.stringify({ id: 1, token: ${JSON.stringify(MINTED)} }))
`, { mode: 0o755 })
  return { dir, verbs: () => (fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').split('\n').filter(Boolean) : []) }
}

function host(name) {
  const dir = path.join(tmpdir('connect'), name)
  gitRepo(dir, { empty: true })
  return dir
}

// Every fixture lives under the OS temp dir, so the helper passes the flag that allows a temp root;
// connectBare is the same run without it.
const connectBare = (root, args, npx) => runNode('scripts/connect.js', [...args, '--root', root], {
  env: { GIT_CONFIG_GLOBAL: '/dev/null', XDG_CONFIG_HOME: tmpdir('xdg'), PATH: (npx ? npx.dir + path.delimiter : '') + process.env.PATH, WALKTHROUGH_TOKEN: undefined },
})
const connect = (root, args, npx) => connectBare(root, ['--allow-temp-root', ...args], npx)

test('a root under the OS temp dir is refused with exit 2 before anything is called or written; the flag allows it', async (t) => {
  const root = host('scratch')
  const npx = fakeNpx('unused')
  const r = connectBare(root, DEAD_URL, npx)
  assert.strictEqual(r.status, 2, r.stderr)
  assert.match(r.stderr, /temp/)
  assert.match(r.stderr, /--allow-temp-root/)
  assert.deepStrictEqual(npx.verbs(), [], 'no walkthrough-cli call reaches the service')
  assert.ok(!fs.existsSync(path.join(root, '.claude')), 'nothing is written')
  // a symlink into the temp dir is the same place
  const link = path.join(tmpdir('link'), 'via-link')
  fs.symlinkSync(root, link)
  const viaLink = connectBare(link, DEAD_URL, npx)
  assert.strictEqual(viaLink.status, 2, viaLink.stderr)
  assert.deepStrictEqual(npx.verbs(), [])
  const stub = await startStub(t, { 'GET /v1': [HELLO], 'GET /v1/projects/scratch/approvals': [APPROVALS] })
  const ok = connectBare(root, ['--allow-temp-root', '--base-url', stub.url], npx)
  assert.strictEqual(ok.status, 0, ok.stderr)
})
const DEAD_URL = ['--base-url', 'http://127.0.0.1:9']

test('connect creates the project, stores the token ignored, writes the block, proves the link', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [HELLO], 'GET /v1/projects/acme-shop/approvals': [APPROVALS] })
  const root = host('acme-shop')
  const npx = fakeNpx(stub.url)
  const r = connect(root, [], npx)
  assert.strictEqual(r.status, 0, r.stderr)
  assert.strictEqual(r.stdout, `connected acme-shop → ${stub.url}/p/acme-shop (new project)\nnext: /spec:mocks\n`)
  assert.deepStrictEqual(npx.verbs(), ['whoami', 'new', 'token'])
  const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.local.json'), 'utf8'))
  assert.strictEqual(settings.env.WALKTHROUGH_TOKEN, MINTED)
  assert.ok(fs.readFileSync(path.join(root, '.gitignore'), 'utf8').includes('.claude/settings.local.json'))
  const cfg = JSON.parse(fs.readFileSync(path.join(root, '.claude/spec.config.json'), 'utf8'))
  assert.deepStrictEqual(cfg.walkthrough, { baseUrl: stub.url, project: 'acme-shop', tokenEnv: 'WALKTHROUGH_TOKEN' })
  assert.ok(!r.stdout.includes(MINTED) && !r.stderr.includes(MINTED))
  const auth = stub.log().filter((l) => l.url.includes('approvals')).map((l) => l.headers.authorization)
  assert.deepStrictEqual(auth, ['Bearer ' + MINTED])
})

test('a connected project with a working token calls walkthrough-cli zero times', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [HELLO], 'GET /v1/projects/acme-shop/approvals': [APPROVALS] })
  const root = host('acme-shop')
  fs.mkdirSync(path.join(root, '.claude'))
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({ walkthrough: { baseUrl: stub.url, project: 'acme-shop', tokenEnv: 'WALKTHROUGH_TOKEN' } }))
  fs.writeFileSync(path.join(root, '.claude/settings.local.json'), JSON.stringify({ env: { WALKTHROUGH_TOKEN: MINTED } }))
  const npx = fakeNpx('unused')
  const r = connect(root, [], npx)
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /\(already connected\)/)
  assert.deepStrictEqual(npx.verbs(), [])
})

test('--project and --base-url are used, and a refused token is exit 1 with a remedy', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [HELLO], 'GET /v1/projects/p1/approvals': [{ status: 401, body: { error: 'bad-token', detail: 'no', apiVersion: 1 } }] })
  const root = host('whatever')
  const npx = fakeNpx('unused')
  const r = connect(root, ['--project', 'p1', '--base-url', stub.url], npx)
  assert.strictEqual(r.status, 1)
  assert.match(r.stderr, /bad-token.*remedy/)
  assert.deepStrictEqual(npx.verbs(), ['new', 'token'], 'with --base-url whoami is not needed')
  assert.ok(!fs.existsSync(path.join(root, '.claude/spec.config.json')), 'no block is written when the proof fails')
})

test('a bad flag is a usage refusal', () => {
  const r = connect(host('x'), ['--bogus', '1'])
  assert.strictEqual(r.status, 2)
})

// ---- spec 20261105/17: the refusals ------------------------------------------------------------------------

const put = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text) }
const gitIn = (root, ...a) => require('node:child_process').execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' })
const DEAD = ['--base-url', 'http://127.0.0.1:9']
const settingsFile = (root) => path.join(root, '.claude/settings.local.json')

test('AC-20261105-17-12 a tracked token file, listed or not, is refused with git rm --cached; nothing is called, stored or created', () => {
  for (const listed of [false, true]) {
    const root = host('acme-shop')
    put(root, '.claude/settings.local.json', JSON.stringify({ other: 1 }))
    if (listed) put(root, '.gitignore', '.claude/settings.local.json\n')
    gitIn(root, 'add', '-f', '-A'); gitIn(root, 'commit', '-q', '-m', 'tracked')
    const npx = fakeNpx('unused')
    const r = connect(root, DEAD, npx)
    assert.strictEqual(r.status, 2, r.stderr)
    assert.match(r.stderr, /not-ignored/)
    assert.match(r.stderr, /git rm --cached/)
    assert.deepStrictEqual(npx.verbs(), [])
    assert.strictEqual(fs.readFileSync(settingsFile(root), 'utf8'), JSON.stringify({ other: 1 }), 'no token stored')
    assert.ok(!fs.existsSync(path.join(root, '.claude/spec.config.json')))
  }
})

test('AC-20261105-17-12 a token file git still does not ignore after the appended line is refused', () => {
  const root = host('acme-shop')
  put(root, '.claude/.gitignore', '!settings.local.json\n') // a deeper rule wins over the root line
  const npx = fakeNpx('unused')
  const r = connect(root, DEAD, npx)
  assert.strictEqual(r.status, 2, r.stderr)
  assert.match(r.stderr, /not-ignored/)
  assert.deepStrictEqual(npx.verbs(), [])
  assert.ok(!fs.existsSync(settingsFile(root)), 'no token stored')
})

test('AC-20261105-17-12 a stored token that already proves connects with no guard, even on a tracked file', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [HELLO], 'GET /v1/projects/acme-shop/approvals': [APPROVALS] })
  const root = host('acme-shop')
  put(root, '.claude/spec.config.json', JSON.stringify({ walkthrough: { baseUrl: stub.url, project: 'acme-shop', tokenEnv: 'WALKTHROUGH_TOKEN' } }))
  put(root, '.claude/settings.local.json', JSON.stringify({ env: { WALKTHROUGH_TOKEN: MINTED } }))
  gitIn(root, 'add', '-f', '-A'); gitIn(root, 'commit', '-q', '-m', 'tracked')
  const r = connect(root, [], fakeNpx('unused'))
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /\(already connected\)/)
})

test('AC-20261105-17-13 a spec.config.json that is broken or not an object is refused and left byte-identical; absent still connects', async (t) => {
  for (const text of ['{"walkthrough": ', '[1,2]', '"x"']) {
    const root = host('acme-shop')
    put(root, '.claude/spec.config.json', text)
    const npx = fakeNpx('unused')
    const r = connect(root, DEAD, npx)
    assert.strictEqual(r.status, 2, r.stderr)
    assert.match(r.stderr, /bad-config/)
    assert.deepStrictEqual(npx.verbs(), [])
    assert.strictEqual(fs.readFileSync(path.join(root, '.claude/spec.config.json'), 'utf8'), text)
  }
  const stub = await startStub(t, { 'GET /v1': [HELLO], 'GET /v1/projects/acme-shop/approvals': [APPROVALS] })
  const r = connect(host('acme-shop'), ['--base-url', stub.url], fakeNpx('unused'))
  assert.strictEqual(r.status, 0, r.stderr)
})

test('AC-20261105-17-14 a settings.local.json that is broken, an array or has a non-object env is refused untouched; other keys stay beside the token', async (t) => {
  for (const text of ['{"env": ', '[]', '{"env": "x"}', '{"env": []}']) {
    const root = host('acme-shop')
    put(root, '.gitignore', '.claude/settings.local.json\n')
    put(root, '.claude/settings.local.json', text)
    const npx = fakeNpx('unused')
    const r = connect(root, DEAD, npx)
    assert.strictEqual(r.status, 2, r.stderr)
    assert.match(r.stderr, /bad-settings/)
    assert.deepStrictEqual(npx.verbs(), [], 'no project is created before the refusal')
    assert.strictEqual(fs.readFileSync(settingsFile(root), 'utf8'), text)
  }
  const stub = await startStub(t, { 'GET /v1': [HELLO], 'GET /v1/projects/acme-shop/approvals': [APPROVALS] })
  const root = host('acme-shop')
  put(root, '.claude/settings.local.json', JSON.stringify({ permissions: { allow: ['x'] }, env: { KEEP: '1' } }))
  put(root, '.gitignore', '.claude/settings.local.json\n')
  const r = connect(root, ['--base-url', stub.url], fakeNpx(stub.url))
  assert.strictEqual(r.status, 0, r.stderr)
  const kept = JSON.parse(fs.readFileSync(settingsFile(root), 'utf8'))
  assert.deepStrictEqual(kept, { permissions: { allow: ['x'] }, env: { KEEP: '1', WALKTHROUGH_TOKEN: MINTED } })
})
