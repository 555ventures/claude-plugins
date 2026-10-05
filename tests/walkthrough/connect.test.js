'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, runBash, freePort } = require('../helpers')
const fx = require('./fixture')

// specs/20261005/01-connect-wires-a-project-to-the-review-service.md — AC-20261005-01-1 through
// AC-20261005-01-15, -17 and -18 (D1–D11, D13): walkthrough-connect.js creates or joins the project,
// stores the token in the git-ignored settings file, proves the link, writes the block; the client
// reads the stored token first. Every run uses a fake `railway` on PATH and a child-process stub.

const { makeGitHost, makeRailway, runConnect, startStub, connectAnswers, SETTINGS_REL, MINTED, PROJECT_UUID } = fx
const CONFIG_REL = '.claude/spec.config.json'
const SSH_PREFIX = 'ssh --project ' + PROJECT_UUID + ' --service walkthrough --environment staging -- node dist/server/src/start/project.js'

const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8')
const readJson = (dir, rel) => JSON.parse(read(dir, rel))
const exists = (dir, rel) => fs.existsSync(path.join(dir, rel))
const settings = (dir) => readJson(dir, SETTINGS_REL)
const approvalRequests = (stub) => stub.log().filter((e) => e.url.split('?')[0].endsWith('/approvals'))
const text = (obj) => JSON.stringify(obj, null, 2) + '\n'
const BAD_TOKEN = { status: 401, body: { error: 'bad-token', detail: null, apiVersion: 1 } }
const OK_APPROVALS = { status: 200, body: { apiVersion: 1, approvals: [] } }

test('AC-20261005-01-1: connect in a host with no block and a new id creates the project, stores the token, proves the link with it and writes the block, printing one line', async (t) => {
  const stub = await startStub(t, connectAnswers())
  const rw = makeRailway()
  const host = makeGitHost('acme-shop')
  const r = await runConnect(host, ['--base-url', stub.url], { railway: rw })
  assert.strictEqual(r.status, 0, 'a first connect must exit 0, or no project can be connected in one command: ' + JSON.stringify(r))
  assert.strictEqual(r.stdout, `connected acme-shop → ${stub.url}/p/acme-shop (new project)\n`, 'stdout must be exactly the one connected line, or the session has nothing reliable to relay: ' + JSON.stringify(r.stdout))
  assert.ok(rw.lines().includes(SSH_PREFIX + ' create acme-shop acme-shop'), 'the project tool must be run through railway ssh with the project id, service and environment, or nothing is created: ' + JSON.stringify(rw.lines()))
  const reqs = approvalRequests(stub)
  assert.ok(reqs.length >= 1, 'the link must be proved by a call that needs the token, or a wrong token passes unnoticed: ' + JSON.stringify(stub.log()))
  assert.strictEqual(reqs[reqs.length - 1].headers.authorization, 'Bearer ' + MINTED, 'the proof must carry the token the project tool printed, or it proves nothing about the stored value')
  assert.strictEqual(read(host, CONFIG_REL), text({ generatedBy: 'test', walkthrough: { baseUrl: stub.url, project: 'acme-shop', tokenEnv: 'WALKTHROUGH_TOKEN' } }), 'the block must be added as the last key with every other key kept, or the host config is damaged')
  assert.strictEqual(read(host, SETTINGS_REL), text({ env: { WALKTHROUGH_TOKEN: MINTED } }), 'the token must be stored as env.WALKTHROUGH_TOKEN, or the next session cannot send screens')
  assert.ok(!exists(host, 'design'), 'connect must create no design/ folder — it is not the wireframe command')
})

test('AC-20261005-01-2: after a success and after a refused proof the minted token occurs in neither output stream and in no host file except the settings file', async (t) => {
  const rw = makeRailway()
  const okStub = await startStub(t, connectAnswers())
  const badStub = await startStub(t, connectAnswers(['acme-shop'], [BAD_TOKEN]))
  for (const [label, stub, want] of [['a successful run', okStub, 0], ['a run whose proof is answered bad-token', badStub, 1]]) {
    const host = makeGitHost('acme-shop')
    const r = await runConnect(host, ['--base-url', stub.url], { railway: rw })
    assert.strictEqual(r.status, want, label + ' must exit ' + want + ': ' + JSON.stringify(r))
    assert.ok(!r.stdout.includes(MINTED) && !r.stderr.includes(MINTED), label + ' must print the token nowhere — a transcript would leak the credential: ' + JSON.stringify(r))
    assert.ok(read(host, SETTINGS_REL).includes(MINTED), label + ': the settings file must hold the token (otherwise the scan below proves nothing)')
    for (const file of fx.allFiles(host)) {
      if (path.relative(host, file) === SETTINGS_REL) continue
      assert.ok(!fs.readFileSync(file).includes(MINTED), label + ': the token leaked into ' + path.relative(host, file) + ' — a file git may track or the client reads')
    }
  }
})

test('AC-20261005-01-3: a second connect in an already connected host exits 0 with the already-connected line, calls Railway zero times and changes no byte of either file', async (t) => {
  const stub = await startStub(t, connectAnswers())
  const rw = makeRailway()
  const host = makeGitHost('acme-shop')
  const first = await runConnect(host, ['--base-url', stub.url], { railway: rw })
  assert.strictEqual(first.status, 0, 'the first connect must succeed before idempotence can be tested: ' + JSON.stringify(first))
  const callsBefore = rw.lines().length
  const cfgBefore = read(host, CONFIG_REL)
  const setBefore = read(host, SETTINGS_REL)
  const second = await runConnect(host, ['--base-url', stub.url], { railway: rw })
  assert.strictEqual(second.status, 0, 'a second run must exit 0: ' + JSON.stringify(second))
  assert.strictEqual(second.stdout, `connected acme-shop → ${stub.url}/p/acme-shop (already connected)\n`, 'the second run must say it changed nothing: ' + JSON.stringify(second.stdout))
  assert.strictEqual(rw.lines().length, callsBefore, 'a connected host must cost zero Railway calls, or every rerun mints another token')
  assert.strictEqual(read(host, CONFIG_REL), cfgBefore, 'the config must be byte-identical after a rerun')
  assert.strictEqual(read(host, SETTINGS_REL), setBefore, 'the settings file must be byte-identical after a rerun')
})

test('AC-20261005-01-4: the project id is derived from the folder name (the main checkout of a linked worktree), the display name is the folder verbatim, and --project/--name override both', async (t) => {
  const ids = ['2024-Cycling-Trip-Book', 'my-app', 'a-b', 'acme-shop', 'shop2']
  const stub = await startStub(t, connectAnswers(ids))
  const cases = [
    ['2024 Cycling Trip Book', [], '2024-Cycling-Trip-Book', '2024 Cycling Trip Book'],
    ['my--app', [], 'my-app', 'my--app'],
    ['a -- b', [], 'a-b', 'a -- b'],
    ['acme-shop', ['--project', 'shop2', '--name', 'Shop Two'], 'shop2', 'Shop Two'],
  ]
  for (const [folder, extra, id, name] of cases) {
    const rw = makeRailway()
    const host = makeGitHost(folder)
    const r = await runConnect(host, ['--base-url', stub.url, ...extra], { railway: rw })
    assert.strictEqual(r.status, 0, 'folder "' + folder + '" must connect: ' + JSON.stringify(r))
    const creates = rw.creates()
    assert.strictEqual(creates.length, 1, 'folder "' + folder + '" must run create once: ' + JSON.stringify(rw.lines()))
    assert.deepStrictEqual(creates[0].slice(creates[0].indexOf('create')), ['create', id, name], 'folder "' + folder + '" must pass the derived id and the display name as two separate arguments, or the service gets a mangled id or name')
  }
  const main = makeGitHost('acme-shop')
  fx.gitIn(main, ['add', '-A'])
  fx.gitIn(main, ['commit', '-q', '-m', 'seed'])
  const wt = path.join(tmpdir('connect-wt'), 'wt-x')
  fx.gitIn(main, ['worktree', 'add', '-q', '-b', 'wt-branch', wt])
  const rw = makeRailway()
  const r = await runConnect(wt, ['--base-url', stub.url], { railway: rw })
  assert.strictEqual(r.status, 0, 'a linked worktree must connect: ' + JSON.stringify(r))
  assert.strictEqual(rw.creates().length, 1, 'the worktree run must create once: ' + JSON.stringify(rw.lines()))
  const c = rw.creates()[0]
  assert.strictEqual(c[c.indexOf('create') + 1], 'acme-shop', 'a linked worktree must derive the id from the main checkout\'s folder, or every worktree connects to its own project')
})

test('AC-20261005-01-5: a folder name that yields no valid id is refused no-id with exit 2 before any Railway call and nothing is written', async () => {
  for (const folder of ['日本語', 'a'.repeat(81)]) {
    const rw = makeRailway()
    const host = makeGitHost(folder)
    const r = await runConnect(host, ['--base-url', 'http://127.0.0.1:1'], { railway: rw })
    assert.strictEqual(r.status, 2, 'folder "' + folder + '" must be refused with exit 2: ' + JSON.stringify(r))
    assert.match(r.stderr, /^walkthrough-connect: no-id/, 'the refusal must carry the no-id code: ' + r.stderr)
    assert.ok(r.stderr.includes('--project'), 'the remedy must name --project, or the user cannot recover: ' + r.stderr)
    assert.deepStrictEqual(rw.lines(), [], 'no Railway call may precede the id refusal — a truncated or guessed id would connect two folders to one project')
    assert.ok(!exists(host, SETTINGS_REL), 'a refused run must write no settings file')
    assert.ok(!('walkthrough' in readJson(host, CONFIG_REL)), 'a refused run must write no block')
  }
})

test('AC-20261005-01-6: when create reports project-exists the script mints a token for the existing project and connects, saying it joined', async (t) => {
  const stub = await startStub(t, connectAnswers())
  const rw = makeRailway({ create: { code: 1, stderr: 'project-exists\n' }, token: { stdout: 'token: wt_joined9\n' } })
  const host = makeGitHost('acme-shop')
  const r = await runConnect(host, ['--base-url', stub.url], { railway: rw })
  assert.strictEqual(r.status, 0, 'a taken id must be joined, not refused: ' + JSON.stringify(r))
  assert.strictEqual(r.stdout, `connected acme-shop → ${stub.url}/p/acme-shop (joined existing project)\n`, 'the line must say the project was joined: ' + JSON.stringify(r.stdout))
  const lines = rw.lines()
  const at = lines.findIndex((l) => l.endsWith('project.js create acme-shop acme-shop'))
  assert.ok(at >= 0 && lines.slice(at + 1).some((l) => l.endsWith('project.js token acme-shop')), 'create must be followed by token for the same id: ' + JSON.stringify(lines))
  assert.strictEqual(settings(host).env.WALKTHROUGH_TOKEN, 'wt_joined9', 'the stored token must be the one the token command printed')
})

test('AC-20261005-01-7: with no --base-url the address is asked of Railway in the staging environment by default and in the named one otherwise', async () => {
  const closed = await freePort()
  for (const envArgs of [[], ['--environment', 'production']]) {
    const env = envArgs[1] || 'staging'
    const rw = makeRailway({ domain: '127.0.0.1:' + closed })
    const host = makeGitHost('acme-shop')
    const r = await runConnect(host, envArgs, { railway: rw })
    const ssh = rw.lines().filter((l) => l.startsWith('ssh '))
    assert.ok(rw.lines().includes('ssh --project ' + PROJECT_UUID + ' --service walkthrough --environment ' + env + ' -- printenv RAILWAY_PUBLIC_DOMAIN'), env + ': the address must be read with printenv RAILWAY_PUBLIC_DOMAIN in that environment: ' + JSON.stringify(rw.lines()))
    assert.ok(ssh.length > 0 && ssh.every((l) => l.includes('--environment ' + env + ' ')), env + ': every ssh call must carry --environment ' + env + ', or one step reaches the wrong deployment: ' + JSON.stringify(ssh))
    assert.strictEqual(r.status, 3, env + ': an address that does not answer must exit 3: ' + JSON.stringify(r))
    assert.ok(r.stderr.includes('https://127.0.0.1:' + closed), env + ': the refusal must name the address it tried: ' + r.stderr)
  }
})

test('AC-20261005-01-8: a proof that does not answer keeps the token, leaves the block unwritten, and the next run finishes without a second create', async (t) => {
  const stub = await startStub(t, connectAnswers())
  const rw = makeRailway()
  const host = makeGitHost('acme-shop')
  const closed = await freePort()
  const first = await runConnect(host, ['--base-url', 'http://127.0.0.1:' + closed], { railway: rw })
  assert.strictEqual(first.status, 3, 'an unanswered proof must exit 3: ' + JSON.stringify(first))
  assert.strictEqual(settings(host).env.WALKTHROUGH_TOKEN, MINTED, 'the issued token must stay stored, or the next run mints another')
  assert.ok(!('walkthrough' in readJson(host, CONFIG_REL)), 'the block must not be written before the proof passes')
  const second = await runConnect(host, ['--base-url', stub.url], { railway: rw })
  assert.strictEqual(second.status, 0, 'the next run must finish the connection: ' + JSON.stringify(second))
  assert.strictEqual(second.stdout, `connected acme-shop → ${stub.url}/p/acme-shop\n`, 'a block written from an already stored token carries no note: ' + JSON.stringify(second.stdout))
  assert.strictEqual(rw.creates().length, 1, 'the whole story must hold exactly one create, or a retry orphans a token: ' + JSON.stringify(rw.lines()))
})

test('AC-20261005-01-9: when the settings file is not ignored by git (empty .gitignore, or committed) connect refuses not-ignored before creating anything', async () => {
  for (const [label, opts] of [['an empty .gitignore', { gitignore: '' }], ['a committed settings file', { tracked: true }]]) {
    const rw = makeRailway()
    const host = makeGitHost('acme-shop', opts)
    const r = await runConnect(host, ['--base-url', 'http://127.0.0.1:1'], { railway: rw })
    assert.strictEqual(r.status, 2, label + ' must exit 2: ' + JSON.stringify(r))
    assert.match(r.stderr, /^walkthrough-connect: not-ignored/, label + ' must carry the not-ignored code: ' + r.stderr)
    assert.ok(r.stderr.includes('.gitignore'), label + ': the remedy must name .gitignore: ' + r.stderr)
    assert.strictEqual(rw.creates().length, 0, label + ': no create may run — a token stored where git can track it leaks the credential')
    assert.ok(!('walkthrough' in readJson(host, CONFIG_REL)), label + ': no block may be written')
  }
})

test('AC-20261005-01-10: a block that points elsewhere than --project or --base-url names is refused connected-elsewhere and left byte-identical', async (t) => {
  const stub = await startStub(t, connectAnswers())
  const rw = makeRailway()
  const host = makeGitHost('acme-shop', { block: { baseUrl: stub.url, project: 'acme-shop', tokenEnv: 'WALKTHROUGH_TOKEN' } })
  const before = read(host, CONFIG_REL)
  for (const args of [['--project', 'other'], ['--base-url', 'http://127.0.0.1:1']]) {
    const r = await runConnect(host, args, { railway: rw })
    assert.strictEqual(r.status, 2, args.join(' ') + ' must exit 2: ' + JSON.stringify(r))
    assert.match(r.stderr, /^walkthrough-connect: connected-elsewhere/, args.join(' ') + ' must carry the connected-elsewhere code: ' + r.stderr)
    assert.ok(r.stderr.includes('delete the walkthrough block'), 'the remedy must give the path back: ' + r.stderr)
    assert.deepStrictEqual(rw.lines(), [], args.join(' ') + ': Railway must not be called when the target is refused')
    assert.strictEqual(read(host, CONFIG_REL), before, args.join(' ') + ': the block must be left as it is, or rounds git holds are orphaned')
  }
})

test('AC-20261005-01-11: a connected host whose stored token is refused bad-token gets a new token (joining the existing project) and the stored value is replaced', async (t) => {
  const stub = await startStub(t, connectAnswers(['acme-shop'], [BAD_TOKEN, OK_APPROVALS]))
  const rw = makeRailway({ create: { code: 1, stderr: 'project-exists\n' }, token: { stdout: 'token: wt_new\n' } })
  const host = makeGitHost('acme-shop', { block: { baseUrl: stub.url, project: 'acme-shop', tokenEnv: 'WALKTHROUGH_TOKEN' } })
  fs.writeFileSync(path.join(host, SETTINGS_REL), text({ env: { WALKTHROUGH_TOKEN: 'wt_old' } }))
  const r = await runConnect(host, ['--base-url', stub.url], { railway: rw })
  assert.strictEqual(r.status, 0, 'a refused stored token must be replaced, not end the run: ' + JSON.stringify(r))
  assert.ok(r.stdout.trimEnd().endsWith('(joined existing project)'), 'the line must say the project was joined: ' + JSON.stringify(r.stdout))
  const stored = read(host, SETTINGS_REL)
  assert.ok(stored.includes('wt_new') && !stored.includes('wt_old'), 'the stored value must be replaced: ' + stored)
  const reqs = approvalRequests(stub)
  assert.strictEqual(reqs[0].headers.authorization, 'Bearer wt_old', 'the stored token must be tried first')
  assert.strictEqual(reqs[1].headers.authorization, 'Bearer wt_new', 'the proof after the new token must carry it, or the replacement was never verified')
})

test('AC-20261005-01-12: a Railway failure is refused railway-failed with Railway\'s own last line (never the SSH-key line) and a missing binary no-railway, writing nothing either way', async () => {
  const rw = makeRailway({ sshFail: { code: 1, stderr: 'ServiceInstance not found\n' } })
  const host = makeGitHost('acme-shop')
  const r = await runConnect(host, ['--base-url', 'http://127.0.0.1:1'], { railway: rw })
  assert.strictEqual(r.status, 1, 'a failing railway call must exit 1: ' + JSON.stringify(r))
  assert.match(r.stderr, /^walkthrough-connect: railway-failed/, 'the code must be railway-failed: ' + r.stderr)
  assert.ok(r.stderr.includes('ServiceInstance not found'), 'the sentence must carry Railway\'s own last line: ' + r.stderr)
  assert.ok(r.stderr.includes('--environment'), 'the remedy must name --environment: ' + r.stderr)
  assert.ok(!r.stderr.includes('Using SSH key'), 'the SSH-key notice is noise and must never be the quoted line: ' + r.stderr)
  const bare = makeGitHost('acme-shop')
  const n = await runConnect(bare, ['--base-url', 'http://127.0.0.1:1'], { path: fx.pathWithoutRailway() })
  assert.strictEqual(n.status, 2, 'no railway binary must exit 2: ' + JSON.stringify(n))
  assert.match(n.stderr, /^walkthrough-connect: no-railway/, 'the code must be no-railway: ' + n.stderr)
  for (const d of [host, bare]) {
    assert.ok(!('walkthrough' in readJson(d, CONFIG_REL)), 'a refused run must write no block')
    assert.ok(!exists(d, SETTINGS_REL), 'a refused run must write no settings file')
  }
})

test('AC-20261005-02-1: connect in a host with no config file and a new id connects, creates a config holding only the block, and a second run is already-connected with the config byte-identical', async (t) => {
  const stub = await startStub(t, connectAnswers())
  const rw = makeRailway()
  const host = makeGitHost('acme-shop', { config: false })
  const r = await runConnect(host, ['--base-url', stub.url], { railway: rw })
  assert.strictEqual(r.status, 0, 'a host with no config must connect with exit 0, or connect cannot run first: ' + JSON.stringify(r))
  assert.strictEqual(r.stdout.split('\n')[0], `connected acme-shop → ${stub.url}/p/acme-shop (new project)`, 'the first stdout line must be the connected line, or the session has nothing reliable to relay: ' + JSON.stringify(r.stdout))
  assert.strictEqual(read(host, CONFIG_REL), text({ walkthrough: { baseUrl: stub.url, project: 'acme-shop', tokenEnv: 'WALKTHROUGH_TOKEN' } }), 'the created config must hold exactly the block and nothing else, or a later generate meets keys nobody wrote')
  assert.strictEqual(settings(host).env.WALKTHROUGH_TOKEN, MINTED, 'the minted token must be stored in the settings file, or the next session cannot send screens')
  assert.deepStrictEqual(rw.creates().map((a) => a.slice(a.indexOf('create'))), [['create', 'acme-shop', 'acme-shop']], 'exactly one create for the id must run, or a retry orphans a token: ' + JSON.stringify(rw.lines()))
  const cfgBefore = read(host, CONFIG_REL)
  const second = await runConnect(host, ['--base-url', stub.url], { railway: rw })
  assert.strictEqual(second.status, 0, 'a second run must exit 0: ' + JSON.stringify(second))
  assert.strictEqual(second.stdout.split('\n')[0], `connected acme-shop → ${stub.url}/p/acme-shop (already connected)`, 'the second run must say it changed nothing: ' + JSON.stringify(second.stdout))
  assert.strictEqual(read(host, CONFIG_REL), cfgBefore, 'the config must be byte-identical after a rerun')
})

test('AC-20261005-01-14: storing the token keeps what the settings file holds, creates a missing file owner-only, and never overwrites a file it cannot parse', async (t) => {
  const stub = await startStub(t, connectAnswers())
  const rw = makeRailway()
  const prior = { permissions: { allow: ['Bash(ls:*)'] }, env: { FOO: '1' } }
  const keep = makeGitHost('acme-shop')
  fs.writeFileSync(path.join(keep, SETTINGS_REL), text(prior))
  const a = await runConnect(keep, ['--base-url', stub.url], { railway: rw })
  assert.strictEqual(a.status, 0, 'an existing settings object must be merged into: ' + JSON.stringify(a))
  assert.deepStrictEqual(settings(keep), { permissions: prior.permissions, env: { FOO: '1', WALKTHROUGH_TOKEN: MINTED } }, 'the other keys must be kept and only env.WALKTHROUGH_TOKEN added, or the user\'s permissions are lost')
  const fresh = makeGitHost('acme-shop')
  const b = await runConnect(fresh, ['--base-url', stub.url], { railway: rw })
  assert.strictEqual(b.status, 0, 'a missing settings file must be created: ' + JSON.stringify(b))
  assert.strictEqual(fs.statSync(path.join(fresh, SETTINGS_REL)).mode & 0o777, 0o600, 'a created settings file must be readable by its owner only, or the token is world-readable')
  const broken = makeGitHost('acme-shop')
  fs.writeFileSync(path.join(broken, SETTINGS_REL), 'not json')
  const before = rw.creates().length
  const c = await runConnect(broken, ['--base-url', stub.url], { railway: rw })
  assert.strictEqual(c.status, 2, 'an unparseable settings file must exit 2: ' + JSON.stringify(c))
  assert.match(c.stderr, /^walkthrough-connect: bad-settings/, 'the code must be bad-settings: ' + c.stderr)
  assert.strictEqual(read(broken, SETTINGS_REL), 'not json', 'the unparseable file must be left untouched, or the user\'s hand edits are destroyed')
  assert.strictEqual(rw.creates().length, before, 'no create may run when the settings file cannot be written')
})

test('AC-20261005-01-15: walkthrough.js sends the stored token when the variable is unset, prefers it over an exported one, and check finds nothing', async (t) => {
  const stub = await startStub(t, { 'GET /v1': [fx.HELLO_OK], 'GET /v1/projects/hearwell/approvals': [OK_APPROVALS] })
  const host = fx.makeHost(fx.block(stub.url))
  fx.seedRound(host, 2)
  fs.writeFileSync(path.join(host, SETTINGS_REL), text({ env: { WALKTHROUGH_TOKEN: 'wt_stored' } }))
  const unset = await fx.runWalkthrough(host, ['pull-approvals', '--round', '2'], { env: { WALKTHROUGH_TOKEN: null } })
  assert.strictEqual(unset.status, 0, 'a stored token must be enough with the variable unset, or connect\'s session cannot send: ' + JSON.stringify(unset))
  const exported = await fx.runWalkthrough(host, ['pull-approvals', '--round', '2'], { env: { WALKTHROUGH_TOKEN: 'wt_exported' } })
  assert.strictEqual(exported.status, 0, 'the run with an exported variable must succeed: ' + JSON.stringify(exported))
  const reqs = approvalRequests(stub)
  assert.deepStrictEqual(reqs.map((e) => e.headers.authorization), ['Bearer wt_stored', 'Bearer wt_stored'], 'the stored token must win over an exported one, or a stale export shadows what connect proved')
  const check = await fx.runWalkthrough(host, ['check'], { env: { WALKTHROUGH_TOKEN: null } })
  assert.strictEqual(check.status, 0, 'check must exit 0 when the token is stored: ' + JSON.stringify(check))
  assert.strictEqual(check.stdout + check.stderr, '', 'check must report no finding when the token is stored, or doctor warns about a working project')
})

test('AC-20261005-01-17: a missing token is refused with /spec:connect named as the first remedy', async () => {
  const host = fx.makeHost(fx.block('http://127.0.0.1:1'))
  fx.seedRound(host, 2)
  const r = await fx.runWalkthrough(host, ['pull-approvals', '--round', '2'], { env: { WALKTHROUGH_TOKEN: null } })
  assert.strictEqual(r.status, 2, 'a missing token must stay a config refusal (exit 2): ' + JSON.stringify(r))
  assert.ok(r.stderr.includes('remedy: run /spec:connect, or export WALKTHROUGH_TOKEN='), 'the remedy must name /spec:connect first, or a user hand-wires what one command does: ' + r.stderr)
})

test('AC-20261005-01-18: spec-paths resolves walkthrough-connect to the script, and walkthrough.js still refuses a connect verb', () => {
  const p = runBash('bin/spec-paths', ['walkthrough-connect'])
  assert.strictEqual(p.status, 0, 'spec-paths walkthrough-connect must exit 0, or the command cannot find its script: ' + p.stderr)
  const printed = p.stdout.trim()
  assert.ok(printed.endsWith('scripts/walkthrough-connect.js') && fs.existsSync(printed), 'the key must print the path of an existing walkthrough-connect.js: ' + JSON.stringify(printed))
  const v = runNode('scripts/walkthrough.js', ['connect'])
  assert.strictEqual(v.status, 2, 'walkthrough.js must refuse a connect verb with exit 2, or the client\'s never-edits-the-config rule is false: ' + JSON.stringify(v))
  assert.ok(v.stderr.includes('unknown verb "connect"'), 'the refusal must be the unknown-verb line: ' + v.stderr)
})
