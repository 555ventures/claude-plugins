'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { runNode } = require('../helpers')
const {
  setupHost, patchConfig, writeStates, writeStatus, writePins, statusOf,
  worktreePath, statusPath, bare, mark, BRIEF_REL, BRANCH, DRIVER,
} = require('./fixture')

// specs/20260928/01-the-prototype-command-and-the-pin-overlay.md D1-D4, AC-20260928-01-1,
// AC-20260928-01-3, AC-20260928-01-4, AC-20260928-01-5, AC-20260928-01-6 — spec/scripts/
// prototype-driver.js does not exist yet, so every case below is genuinely RED against the
// pre-image (ENOENT on the script path).

function git(dir, ...args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' })
}

function branchExists(dir, name) {
  return git(dir, 'branch', '--list', name).trim() !== ''
}

// Drives a fresh host to ROUND via a real, successful `--mark opened` — the setup every AC-5/
// AC-6 case needs. Returns the host dir and the parsed status.json.
function advanceToRound(dir) {
  writeStates(dir)
  const r = mark(dir, 'opened')
  assert.strictEqual(r.status, 0,
    'test setup requires --mark opened to succeed on a valid states.json and a wired overlay ' +
    'import — without this the AC-5/AC-6 cases below cannot reach ROUND at all: ' + r.stderr)
  return statusOf(dir)
}

test('AC-20260928-01-1: the driver exits 2 naming prototype and spec:doctor when the host config carries no prototype block', () => {
  const dir = setupHost()
  patchConfig(dir, (cfg) => { delete cfg.prototype })
  const r = bare(dir)
  assert.strictEqual(r.status, 2,
    'a host with no declared prototype block must refuse rather than crash or silently no-op: ' + JSON.stringify(r))
  assert.match(r.stderr, /prototype/,
    'the refusal must name the missing "prototype" config block so the remedy is discoverable: ' + r.stderr)
  assert.match(r.stderr, /spec:doctor/,
    'the refusal must point at /spec:doctor (D1\'s check) as the remedy: ' + r.stderr)
})

// `check --json` on a fresh fixture host after `edit(cfg)`; returns { r, findings }.
function checkJson(edit) {
  const dir = setupHost()
  if (edit) patchConfig(dir, edit)
  const r = bare(dir, ['check', '--json'])
  let findings = null
  try { findings = JSON.parse(r.stdout).findings } catch (e) { /* asserted by the caller's message */ }
  return { dir, r, findings }
}

test('AC-20261007-01-1: the bare run admits a block with no export or gate key, and check flags only {stem}, e2eRun and picture shapes — never a tracked storageState', () => {
  const dir = setupHost()
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.claude/spec.config.json'), 'utf8'))
  assert.ok(!('export' in cfg.prototype) && !('gate' in cfg.prototype),
    'test setup requires the fixture host to carry no prototype.export and no prototype.gate key')
  const bareRun = bare(dir)
  assert.strictEqual(bareRun.status, 0,
    'a block with no export key must admit — a startup refusal on a key no step reads blocks every prototype: ' + JSON.stringify(bareRun))
  assert.match(bareRun.stdout, /state:\s*OPEN/, 'the admitted bare run must print state OPEN: ' + bareRun.stdout)
  assert.ok(!/prototype\.export/.test(bareRun.stderr),
    'no stderr line may name prototype.export — the key is retired and a remedy naming it sends the host to declare a dead key: ' + bareRun.stderr)

  const clean = checkJson()
  assert.strictEqual(clean.r.status, 0, 'check on the fixture host must exit 0 — nothing it declares is a finding: ' + JSON.stringify(clean.r))
  assert.deepStrictEqual(clean.findings, [], 'check --json must print { "findings": [] } on a clean host: ' + clean.r.stdout)

  const noStem = checkJson((c) => { c.prototype.e2eFile = 'e2e/proto-28.spec.ts' })
  assert.strictEqual(noStem.r.status, 1, 'an e2eFile without {stem} would make every prototype write to one shared file — check must exit 1: ' + JSON.stringify(noStem.r))
  assert.ok(Array.isArray(noStem.findings) && noStem.findings.length === 1 && noStem.findings[0].key === 'prototype.e2eFile',
    'check must report exactly one finding keyed prototype.e2eFile: ' + noStem.r.stdout)
  assert.ok(noStem.findings[0].message.includes('{stem}'),
    'the finding must name the missing {stem} placeholder so the remedy is discoverable: ' + noStem.findings[0].message)

  const noRun = checkJson((c) => { delete c.prototype.e2eRun })
  assert.strictEqual(noRun.r.status, 1, 'an undeclared e2eRun is a finding — the tests-derived mark cannot run the tests without it: ' + JSON.stringify(noRun.r))
  assert.ok((noRun.findings || []).some((f) => f.key === 'prototype.e2eRun'), 'check must name prototype.e2eRun: ' + noRun.r.stdout)

  const badPicture = checkJson((c) => { c.prototype.picture = 'node x.js {out}' })
  assert.strictEqual(badPicture.r.status, 1, 'a picture command with no {url} cannot make a picture of the page — check must exit 1: ' + JSON.stringify(badPicture.r))
  const pf = (badPicture.findings || []).find((f) => f.key === 'prototype.picture')
  assert.ok(pf && pf.message.includes('{url}'), 'check must name prototype.picture and the missing {url}: ' + badPicture.r.stdout)

  const signedIn = checkJson((c) => { c.prototype.storageState = 'e2e/.auth/user.json' })
  fs.mkdirSync(path.join(signedIn.dir, 'e2e/.auth'), { recursive: true })
  fs.writeFileSync(path.join(signedIn.dir, 'e2e/.auth/user.json'), '{"cookies":[],"origins":[]}\n')
  execFileSync('git', ['-C', signedIn.dir, 'add', '-f', '--', 'e2e/.auth/user.json'], { encoding: 'utf8' })
  execFileSync('git', ['-C', signedIn.dir, 'commit', '-q', '-m', 'track a sign-in'], { encoding: 'utf8' })
  const tracked = bare(signedIn.dir, ['check', '--json'])
  assert.strictEqual(tracked.status, 0,
    'storageState is no longer a plugin key — a tracked file under it must not fail the check: ' + JSON.stringify(tracked))
  assert.deepStrictEqual(JSON.parse(tracked.stdout).findings, [], 'no storageState finding may remain: ' + tracked.stdout)
})

test('AC-20260928-01-3: the bare run on a host with no design/prototypes/<stem>/ prints state OPEN, a Step line, and a states.json template', () => {
  const dir = setupHost()
  const r = bare(dir)
  assert.strictEqual(r.status, 0,
    'the OPEN step is informational, not a refusal — it must exit 0: ' + JSON.stringify(r))
  assert.match(r.stdout, /state:\s*OPEN/, 'the OPEN state line must be printed verbatim: ' + r.stdout)
  assert.match(r.stdout, /## Step:/, 'the driver-stepped render always carries a "## Step:" line: ' + r.stdout)
  assert.match(r.stdout, /states\.json/,
    'the OPEN step must name states.json — it is the artifact the session is being asked to author: ' + r.stdout)
  assert.match(r.stdout, /"routes"/,
    'the OPEN step must print a states.json template block (Contracts) for the session to fill in, not just a bare mention of the filename: ' + r.stdout)
})

test('AC-20260928-01-3: --mark opened creates the branch and worktree, writes the overlay with the baked pins URL, runs dbCreate, and sets marks.opened', () => {
  const dir = setupHost()
  const status = advanceToRound(dir)

  assert.ok(branchExists(dir, BRANCH),
    'a successful --mark opened must create the proto/<stem> branch: ' + git(dir, 'branch', '--list'))
  const wt = worktreePath(dir)
  assert.ok(fs.existsSync(wt), 'a successful --mark opened must create .claude/worktrees/proto-<stem>: ' + wt)

  const overlay = fs.readFileSync(path.join(wt, 'src/proto-overlay.js'), 'utf8')
  assert.ok(typeof status.pinsPort === 'number' && status.pinsPort > 0,
    'status.json must record a numeric pinsPort (D3, probed from 4711 upward) — the overlay cannot be baked without it: ' + JSON.stringify(status))
  assert.match(overlay, new RegExp('http://127\\.0\\.0\\.1:' + status.pinsPort),
    'the copied overlay must have the pins port baked in as http://127.0.0.1:<pinsPort> (D3): ' + overlay)

  assert.ok(fs.existsSync(path.join(wt, 'src/proto-stable-id.js')),
    'the stable-id module must be copied beside the overlay in the same directory (D3/D6): missing at ' + path.join(wt, 'src/proto-stable-id.js'))

  assert.ok(fs.existsSync(path.join(wt, 'db-created')),
    'the fixture\'s prototype.dbCreate script writes db-created into cwd — its absence means dbCreate was never run with cwd = the worktree (D1/D3)')

  assert.ok(status.marks && status.marks.opened,
    'status.json marks.opened must be set to a truthy (ISO timestamp) value after a successful --mark opened: ' + JSON.stringify(status))
})

test('AC-20260928-01-3: --mark opened prints the (OPEN to ROUND) checkpoint line, and a second bare run reports state ROUND', () => {
  const dir = setupHost()
  writeStates(dir)
  const opened = mark(dir, 'opened')
  assert.strictEqual(opened.status, 0, 'test setup requires --mark opened to succeed: ' + opened.stderr)
  assert.match(opened.stdout, /\(OPEN\s*(→|->)\s*ROUND\)/,
    'every accepted mark must end with a checkpoint line naming the state transition (D3): ' + opened.stdout)

  const second = bare(dir)
  assert.strictEqual(second.status, 0, 'the ROUND step is informational, not a refusal: ' + JSON.stringify(second))
  assert.match(second.stdout, /state:\s*ROUND/,
    'once opened, every subsequent bare run must report state ROUND until approved: ' + second.stdout)
})

test('AC-20260928-01-4: --mark opened refuses naming states.json and creates no branch when states.json has zero routes', () => {
  const dir = setupHost()
  writeStates(dir, {})
  const r = mark(dir, 'opened')
  assert.strictEqual(r.status, 2,
    'a states.json with zero routes carries nothing to pin against — the mark must refuse: ' + JSON.stringify(r))
  assert.match(r.stderr, /states\.json/,
    'the refusal must name states.json as the offending artifact: ' + r.stderr)
  assert.ok(!branchExists(dir, BRANCH),
    'a states.json precondition failure must create no branch at all — this check runs before any git op (D3): ' + git(dir, 'branch', '--list'))
})

test('AC-20260928-01-4: a host with no overlay import on main opens, round-done refuses naming prototype.overlay, and wiring the import on the prototype branch clears it and records the wiring file', () => {
  const dir = setupHost()
  fs.writeFileSync(path.join(dir, 'src/main.js'), 'export function main() { return "no overlay import here" }\n')
  execFileSync('git', ['-C', dir, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'drop overlay import'], { encoding: 'utf8' })
  writeStates(dir)

  const opened = mark(dir, 'opened')
  assert.strictEqual(opened.status, 0,
    'the import lives on proto/<stem>, which only exists once opened succeeds — refusing here leaves the branch behind and the rerun is refused as stale: ' + JSON.stringify(opened))
  const round = bare(dir)
  assert.match(round.stdout, /Session: wire the dev-only overlay import/,
    'the ROUND step must ask the session to wire the import while it is missing: ' + round.stdout)

  const refused = mark(dir, 'round-done')
  assert.strictEqual(refused.status, 2, 'round-done must refuse while no file in the worktree imports the overlay: ' + JSON.stringify(refused))
  assert.match(refused.stderr, /prototype\.overlay/,
    'the refusal must name prototype.overlay (the config key): ' + refused.stderr)
  assert.strictEqual(statusOf(dir).rounds.length, 0, 'a refused round-done must record no round')

  const wt = worktreePath(dir)
  fs.writeFileSync(path.join(wt, 'src/main.js'), "if (import.meta.env.DEV) import('./proto-overlay.js')\n" +
    'export function main() { return "no overlay import here" }\n')
  execFileSync('git', ['-C', wt, 'commit', '-q', '-am', 'wire overlay'], { encoding: 'utf8' })

  const accepted = mark(dir, 'round-done')
  assert.strictEqual(accepted.status, 0, 'round-done must pass once the prototype branch imports the overlay: ' + JSON.stringify(accepted))
  assert.strictEqual(statusOf(dir).wiring, 'src/main.js', 'status.json must record the wiring file: ' + JSON.stringify(statusOf(dir)))
  assert.doesNotMatch(bare(dir).stdout, /Session: wire the dev-only overlay import/,
    'once wired, the ROUND step must stop asking for the import')
})

test('AC-20260928-01-4: --mark opened refuses naming the stale branch when proto/<stem> already exists and status.json is absent', () => {
  const dir = setupHost()
  execFileSync('git', ['-C', dir, 'branch', BRANCH], { encoding: 'utf8' })
  assert.ok(!fs.existsSync(statusPath(dir)), 'test setup requires status.json to be absent for this case')
  const r = mark(dir, 'opened')
  assert.strictEqual(r.status, 2,
    'a pre-existing proto/<stem> branch with no status.json must refuse as a stale branch, never silently reuse or overwrite it: ' + JSON.stringify(r))
  assert.match(r.stderr, new RegExp('stale prototype branch ' + BRANCH.replace('/', '\\/')),
    'the refusal must carry the literal phrase "stale prototype branch proto/<stem>" (D3): ' + r.stderr)
})

test('AC-20260928-01-5: the bare ROUND run reports the dev server unreachable, prints both Session lines, and prints no pin-ready line when prototype.url is a closed port', () => {
  const dir = setupHost()
  const status = advanceToRound(dir)
  // A hardcoded high port with nothing ever bound to it in this test process reads as closed to
  // a curl-style probe without the ceremony of a bind-then-close dance (freePort() exists for
  // callers that need a port THIS process will later bind for real — this test never does).
  patchConfig(dir, (cfg) => { cfg.prototype.url = 'http://127.0.0.1:39217' })
  const r = bare(dir)
  assert.strictEqual(r.status, 0, 'an unreachable dev server is reported, not a driver crash: ' + JSON.stringify(r))
  assert.match(r.stdout, /dev server is not answering on http:\/\/127\.0\.0\.1:39217/,
    'the unreachable-URL message must name the exact configured URL (D4): ' + r.stdout)
  assert.match(r.stdout, /Session:.*node scripts\/dev-server\.js/,
    'a Session: line must contain the host\'s runtime.bootCommand verbatim (D4): ' + r.stdout)
  assert.match(r.stdout, new RegExp('Session:.*serve --port ' + status.pinsPort),
    'a Session: line must contain the serve invocation with the recorded pinsPort (D4): ' + r.stdout)
  assert.ok(!r.stdout.includes('🎨'),
    'no pin-ready line may be printed while the dev server is unreachable (D4): ' + r.stdout)
})

test('AC-20260928-01-5: the bare ROUND run prints the pin-ready line, one route line per states.json route, the tailscale line, and the approve-to-write-the-contract reply line when prototype.url is reachable', () => {
  const dir = setupHost()
  advanceToRound(dir)
  const fileUrl = 'file://' + path.join(dir, 'docs/roadmap/28-functional-prototype.md')
  patchConfig(dir, (cfg) => { cfg.prototype.url = fileUrl })
  const r = bare(dir)
  assert.strictEqual(r.status, 0, JSON.stringify(r))
  assert.match(r.stdout, /🎨 ready for pins — file:\/\//,
    'a reachable prototype.url must print the pin-ready line with the URL (D4): ' + r.stdout)
  assert.match(r.stdout, /route: \/home \(default\)/,
    'one "route:" line per states.json route, listing its declared states, must be printed (D4): ' + r.stdout)
  assert.match(r.stdout, /tailscale serve --bg/,
    'the optional Share line must name "tailscale serve --bg" verbatim, printed only, never run (D4): ' + r.stdout)
  assert.match(r.stdout, /Reply `approve` to write the contract; anything else is a change for this session to apply on proto\/28-functional-prototype, then:/,
    'the fixed reply line must be printed verbatim (specs/20261007/01 D7) so the session knows how to end the round and that approve writes the contract: ' + r.stdout)
})

test('AC-20260928-01-6: --mark round-done appends a round entry carrying the pins added since the last round', () => {
  const dir = setupHost()
  advanceToRound(dir)
  writePins(dir, [
    { id: 'p1', round: 1, screen: '/home', state: 'default', anchor: null, note: 'n1', who: 'JJ', kind: 'look', at: new Date().toISOString() },
    { id: 'p2', round: 1, screen: '/home', state: 'default', anchor: null, note: 'n2', who: 'JJ', kind: 'behaviour', at: new Date().toISOString() },
  ])
  const r = mark(dir, 'round-done')
  assert.strictEqual(r.status, 0, 'round-done must be accepted once pins exist for the round: ' + JSON.stringify(r))
  const status = statusOf(dir)
  assert.strictEqual(status.rounds.length, 1, 'exactly one round entry must be appended: ' + JSON.stringify(status.rounds))
  assert.strictEqual(status.rounds[0].n, 1, 'the first round entry must be numbered 1: ' + JSON.stringify(status.rounds[0]))
  assert.deepStrictEqual(status.rounds[0].pins, ['p1', 'p2'],
    'the round entry must list exactly the pin ids added this round, in order (D4): ' + JSON.stringify(status.rounds[0]))
  assert.match(status.rounds[0].startedAt, /^\d{4}-\d{2}-\d{2}T/, 'startedAt must be an ISO timestamp: ' + JSON.stringify(status.rounds[0]))
  assert.match(status.rounds[0].endedAt, /^\d{4}-\d{2}-\d{2}T/, 'endedAt must be an ISO timestamp: ' + JSON.stringify(status.rounds[0]))
  assert.match(r.stdout, /\(ROUND\s*(→|->)\s*ROUND\)/, 'a round-done mark stays in ROUND and must print that transition: ' + r.stdout)
})

test('AC-20260928-01-6: --mark round-done is accepted with zero new pins, recording an empty round', () => {
  const dir = setupHost()
  advanceToRound(dir)
  writePins(dir, [
    { id: 'p1', round: 1, screen: '/home', state: 'default', anchor: null, note: 'n1', who: 'JJ', kind: 'look', at: new Date().toISOString() },
  ])
  const first = mark(dir, 'round-done')
  assert.strictEqual(first.status, 0, first.stderr)
  const second = mark(dir, 'round-done')
  assert.strictEqual(second.status, 0,
    'a round with zero new pins must still be accepted — it is how "nothing more to change" is recorded (D4): ' + JSON.stringify(second))
  const status = statusOf(dir)
  assert.strictEqual(status.rounds.length, 2, 'the empty round must still append a new round entry: ' + JSON.stringify(status.rounds))
  assert.strictEqual(status.rounds[1].n, 2, JSON.stringify(status.rounds[1]))
  assert.deepStrictEqual(status.rounds[1].pins, [], 'the second round entry must carry an empty pins array: ' + JSON.stringify(status.rounds[1]))
})

test('AC-20260928-01-6: --mark approved refuses naming round-done when no round has ever been recorded', () => {
  const dir = setupHost()
  advanceToRound(dir)
  const r = mark(dir, 'approved')
  assert.strictEqual(r.status, 2,
    'approved must refuse when rounds is still empty — approving before any round happened means nothing was ever shown to JJ: ' + JSON.stringify(r))
  assert.match(r.stderr, /round-done/,
    'the refusal must name round-done as the missing precondition: ' + r.stderr)
})

test('AC-20260928-01-6: --mark approved is accepted after a round and the next bare run reports state APPROVED with the write-the-contract step naming --mark contracted', () => {
  const dir = setupHost()
  advanceToRound(dir)
  const rd = mark(dir, 'round-done')
  assert.strictEqual(rd.status, 0, rd.stderr)
  const approved = mark(dir, 'approved')
  assert.strictEqual(approved.status, 0, 'approved must be accepted once at least one round exists: ' + JSON.stringify(approved))
  const status = statusOf(dir)
  assert.ok(status.marks.approved, 'status.json marks.approved must be set: ' + JSON.stringify(status.marks))
  assert.match(approved.stdout, /\(ROUND\s*(→|->)\s*APPROVED\)/, approved.stdout)

  const next = bare(dir)
  assert.strictEqual(next.status, 0, JSON.stringify(next))
  assert.match(next.stdout, /state:\s*APPROVED/, 'once approved, every subsequent bare run must report state APPROVED: ' + next.stdout)
  assert.match(next.stdout, /## Step: write the behaviour contract\n/,
    'the APPROVED step must print the write-the-contract step (specs/20261007/01 D7) — without it the session has no way from approve to the contract: ' + next.stdout)
  assert.match(next.stdout, /Read only: pins\.json, states\.json/,
    'the APPROVED step must name the two files it reads so the session reads nothing else: ' + next.stdout)
  assert.match(next.stdout, /\nThen:\n\s+node \S+ \S+ --mark contracted/,
    'the APPROVED step must name --mark contracted as its Then: line — without it the session cannot tell which mark writes the contract: ' + next.stdout)
})

// Direct fix 2026-10-05: every step keeps the session in the main checkout (`--root .`) while
// ROUND and TESTS have it Edit files inside the prototype worktree — a write the plugin's own
// cross-worktree guard refused. The driver now marks the worktree as a scratch sink; this runs
// the real hook against the real opened worktree, both directions.
test('an opened prototype worktree accepts the main-checkout session\'s edits through the cross-worktree write guard, and still cannot write back out', () => {
  const { spawnSync } = require('node:child_process')
  const HOOK = path.join(require('../helpers').SPEC, 'scripts/block-cross-worktree-writes.sh')
  const hook = (cwd, filePath) => spawnSync('bash', [HOOK], {
    input: JSON.stringify({ cwd, tool_input: { file_path: filePath } }), encoding: 'utf8',
  })
  const dir = setupHost()
  writeStates(dir)
  const opened = mark(dir, 'opened')
  assert.strictEqual(opened.status, 0, 'test setup requires --mark opened to succeed: ' + opened.stdout + opened.stderr)
  const wt = worktreePath(dir)
  const inward = path.join(wt, 'src/main.js')

  const afterOpen = hook(dir, inward)
  assert.strictEqual(afterOpen.status, 0,
    'the ROUND step tells the main-checkout session to edit files in the prototype worktree — the guard must allow that write or the round cannot be done with Edit: ' + afterOpen.stderr)

  const outward = hook(wt, path.join(dir, 'src/main.js'))
  assert.strictEqual(outward.status, 2,
    'the marker makes the prototype worktree a sink only — a write from inside it out to the main checkout must still be blocked: ' + JSON.stringify(outward))

  // A prototype opened before the driver planted the marker heals on its next step print.
  const gitDir = execFileSync('git', ['-C', wt, 'rev-parse', '--git-dir'], { encoding: 'utf8' }).trim()
  fs.rmSync(path.join(gitDir, 'scratch-worktree'))
  assert.strictEqual(hook(dir, inward).status, 2,
    'control: without the marker the guard blocks the same write — otherwise this test proves nothing about the driver')
  const round = bare(dir)
  assert.strictEqual(round.status, 0, 'the bare ROUND run must print its step: ' + round.stdout + round.stderr)
  assert.strictEqual(hook(dir, inward).status, 0,
    'the ROUND step print must re-mark an already-open prototype worktree, or prototypes opened before this fix stay blocked: ' + round.stdout)
})
