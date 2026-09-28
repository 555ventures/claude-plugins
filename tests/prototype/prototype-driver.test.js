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

test('AC-20260928-01-1: the driver exits 2 naming prototype.export when the block declares no export globs', () => {
  const dir = setupHost()
  patchConfig(dir, (cfg) => { cfg.prototype.export = [] })
  const r = bare(dir)
  assert.strictEqual(r.status, 2,
    'a prototype block with an empty export array must refuse — nothing declares the data/API layer to freeze later: ' + JSON.stringify(r))
  assert.match(r.stderr, /prototype\.export/,
    'the refusal must name prototype.export specifically, not just "prototype": ' + r.stderr)
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

test('AC-20260928-01-4: --mark opened refuses naming prototype.overlay when the worktree\'s tracked source does not import the overlay', () => {
  const dir = setupHost()
  fs.writeFileSync(path.join(dir, 'src/main.js'), 'export function main() { return "no overlay import here" }\n')
  execFileSync('git', ['-C', dir, 'add', '-A'], { encoding: 'utf8' })
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'drop overlay import'], { encoding: 'utf8' })
  writeStates(dir)
  const r = mark(dir, 'opened')
  assert.strictEqual(r.status, 2,
    'a worktree whose tracked source never imports the overlay must refuse the opened mark: ' + JSON.stringify(r))
  assert.match(r.stderr, /prototype\.overlay/,
    'the refusal must name prototype.overlay (the config key), not just "overlay" or "import": ' + r.stderr)
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

test('AC-20260928-01-5: the bare ROUND run prints the pin-ready line, one route line per states.json route, the tailscale line, and the approve reply line when prototype.url is reachable', () => {
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
  assert.match(r.stdout, /Reply `approve` to freeze/,
    'the fixed reply line must be printed verbatim so the session knows how to end the round (D4): ' + r.stdout)
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

test('AC-20260928-01-6: --mark approved is accepted after a round and the next bare run reports state APPROVED with the not-available freeze step', () => {
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
  assert.match(next.stdout, /## Step: freeze — not available in this version/,
    'the APPROVED step must print the exact not-available freeze line and no Then: line — spec 02 owns the freeze (D3): ' + next.stdout)
  assert.ok(!/\nThen:/.test(next.stdout),
    'the APPROVED step must carry no "Then:" line in this version: ' + next.stdout)
})
